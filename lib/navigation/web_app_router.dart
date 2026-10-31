import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/mission_web_location.dart';
import 'package:lendify/services/mission_web_location_stub.dart'
    if (dart.library.html) 'package:lendify/services/mission_web_location_web.dart'
    as platform;

/// Only this small public cursor crosses the browser history boundary. Owned
/// targets and principals stay in this process and cannot be restored after a
/// reload from an untrusted history payload.
@immutable
class WebRouteCursor {
  final int entry;
  final AppLinkTarget? target;
  final String instance;
  const WebRouteCursor(this.entry, {required this.instance, this.target});
  RouteInformation get information => RouteInformation(
        uri: Uri.parse(_publicPath(target) ?? '/'),
        state: <String, Object>{
          'version': 1,
          'instance': instance,
          'entry': entry
        },
      );
}

/// Explicit public read-only allowlist. Never serialize a private link's path,
/// query, token or identifier into the URL or browser history state.
String? _publicPath(AppLinkTarget? target) {
  if (target?.kind == AppLinkKind.missionWebEntry) return '/mission';
  if (target?.kind != AppLinkKind.listing &&
      target?.kind != AppLinkKind.profile) {
    return null;
  }
  final id = target!.id;
  if (id == null ||
      id.isEmpty ||
      id == '.' ||
      id == '..' ||
      id.length > 120 ||
      !RegExp(r'^[A-Za-z0-9_.:-]+$').hasMatch(id)) {
    return null;
  }
  return Uri(pathSegments: [
    '',
    target.kind == AppLinkKind.listing ? 'listing' : 'profile',
    id
  ]).toString();
}

bool _canonicalPublicHref(String? href, AppLinkTarget? target) {
  final path = _publicPath(target);
  return path != null &&
      const ['shareittoo.com', 'www.shareittoo.com', 'staging.shareittoo.com']
          .any((host) => href == 'https://$host$path');
}

class _Request {
  final AppLinkTarget? target;
  final int? entry;
  final bool initial;
  final bool valid;
  final String? instance;
  final bool canonicalPublic;
  const _Request(
      {this.target,
      this.entry,
      this.instance,
      this.canonicalPublic = false,
      this.initial = false,
      this.valid = false});
}

_Request _classify(String? href, Object? state) {
  final mission = classifyMissionWebLocation(browserSerializedHref: href);
  AppLinkTarget? target;
  var valid = false;
  if (mission.isSyntheticRoute) {
    target =
        AppLinkTarget(kind: AppLinkKind.missionWebEntry, uri: Uri.parse(href!));
    valid = true;
  } else if (const [
    'https://shareittoo.com/',
    'https://www.shareittoo.com/',
    'https://staging.shareittoo.com/'
  ].contains(href)) {
    valid = true;
  } else if (href != null) {
    try {
      // The legacy parser has no Mission branch: normalized aliases cannot
      // re-enter the strict browser-serialized Mission classification.
      target = AppLinkParser.parse(Uri.parse(href));
      valid = target != null;
    } catch (_) {}
  }
  if (state == null) return _Request(target: target, valid: valid);
  if (state is! Map ||
      state.length != 3 ||
      state['version'] != 1 ||
      state['instance'] is! String ||
      !RegExp(r'^[0-9a-f]{32}$').hasMatch(state['instance'] as String) ||
      state['entry'] is! int ||
      (state['entry'] as int) < 0 ||
      (state['entry'] as int) > 9007199254740991) {
    return const _Request();
  }
  return _Request(
      target: target,
      entry: state['entry'] as int,
      instance: state['instance'] as String,
      canonicalPublic: _canonicalPublicHref(href, target),
      valid: valid);
}

class _Information extends RouteInformation {
  final _Request request;
  _Information(this.request) : super(uri: Uri(path: '/'));
}

class _Provider extends PlatformRouteInformationProvider {
  _Provider()
      : super(
            initialRouteInformation:
                _Information(const _Request(initial: true)));
  @override
  Future<bool> didPushRouteInformation(RouteInformation information) {
    // Read before Dart URI normalization. Never retain rejected href bytes.
    final request =
        _classify(platform.readBrowserSerializedHref(), information.state);
    return super.didPushRouteInformation(_Information(request));
  }
}

class _Parser extends RouteInformationParser<_Request> {
  @override
  Future<_Request> parseRouteInformation(RouteInformation information) =>
      SynchronousFuture(
          information is _Information ? information.request : const _Request());
  @override
  RouteInformation restoreRouteInformation(_Request configuration) =>
      WebRouteCursor(configuration.entry ?? 0,
              instance: configuration.instance ?? '',
              target: configuration.target)
          .information;
}

class _Entry {
  final PrincipalBoundAppLinkTarget action;
  Route<void>? route;
  _Entry(this.action, this.route);
}

/// The immutable page anchor is intentionally never replaced/removed. Flutter
/// ties imperative pageless routes to the page below them; removing that page
/// would also remove unrelated foreground dialogs or a successor's routes.
class WebAppRouterHost extends StatefulWidget {
  final AppLinkController controller;
  final GlobalKey<NavigatorState> navigatorKey;
  final Widget root;
  final Widget Function(RouterConfig<Object> config) buildApp;
  const WebAppRouterHost(
      {super.key,
      required this.controller,
      required this.navigatorKey,
      required this.root,
      required this.buildApp});
  @override
  State<WebAppRouterHost> createState() => WebAppRouterHostState();
}

class WebAppRouterHostState extends State<WebAppRouterHost> {
  late final _Delegate _delegate;
  late final _Provider _provider;
  late final RouterConfig<Object> _config;
  @override
  void initState() {
    super.initState();
    widget.controller.attachWebRouter();
    _delegate = _Delegate(widget.controller, widget.navigatorKey, widget.root);
    _provider = _Provider();
    _config = RouterConfig<Object>(
        routeInformationProvider: _provider,
        routeInformationParser: _Parser(),
        routerDelegate: _delegate);
  }

  @override
  void didUpdateWidget(WebAppRouterHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    assert(identical(widget.controller, oldWidget.controller));
    assert(identical(widget.navigatorKey, oldWidget.navigatorKey));
  }

  @visibleForTesting
  Future<void> restoreForTesting(String href, Object? state) {
    if (kReleaseMode) return Future<void>.value();
    return _delegate.setNewRoutePath(_classify(href, state));
  }

  @visibleForTesting
  RouteInformation get informationForTesting =>
      _Parser().restoreRouteInformation(_delegate.currentConfiguration);
  @override
  void dispose() {
    widget.controller.detachWebRouter();
    _delegate.dispose();
    _provider.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.buildApp(_config);
}

class WebOwnedRouteBridge extends InheritedWidget {
  final _Delegate _delegate;
  const WebOwnedRouteBridge._(this._delegate, {required super.child});
  static void register(BuildContext context, PrincipalBoundAppLinkTarget action,
          Route<void> route) =>
      context
          .getInheritedWidgetOfExactType<WebOwnedRouteBridge>()
          ?._delegate
          .register(action, route);
  @override
  bool updateShouldNotify(WebOwnedRouteBridge oldWidget) => false;
}

class _Delegate extends RouterDelegate<Object>
    with ChangeNotifier, PopNavigatorRouterDelegateMixin<Object> {
  final AppLinkController controller;
  @override
  final GlobalKey<NavigatorState> navigatorKey;
  final Widget root;
  late final Page<void> _anchor = MaterialPage<void>(
      key: const ValueKey('web-root-anchor'),
      child: WebOwnedRouteBridge._(this, child: root));
  final Map<int, _Entry> _entries = {};
  final Map<Route<dynamic>, int> _owned = {};
  final Set<Route<dynamic>> _replaceOnPush = {};
  late final _Observer _observer = _Observer(this);
  int _next = 1;
  int _current = 0;
  int _generation = 0;
  // Public navigation-instance marker, not a credential or owner identifier.
  // Entries from another document lifetime must never alias a new ordinal.
  final String _instance =
      List.generate(16, (_) => Random.secure().nextInt(256))
          .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
          .join();
  int? _restoring;
  PrincipalBoundAppLinkTarget? _restoringAction;
  bool _disposed = false;
  BuildContext? _routerContext;
  bool _cold = true;
  _Delegate(this.controller, this.navigatorKey, this.root);

  @override
  _Request get currentConfiguration => _Request(
      entry: _current,
      instance: _instance,
      target: _cold
          ? controller.initialWebTarget
          : _entries[_current]?.action.target);

  void register(PrincipalBoundAppLinkTarget action, Route<void> route) {
    if (_disposed || !action.isCurrentIngress) return;
    final restoring = identical(action, _restoringAction) ? _restoring : null;
    final id = restoring ?? _next++;
    if (restoring != null || action.initialIngress) _replaceOnPush.add(route);
    if (restoring != null) {
      _restoring = null;
      _restoringAction = null;
    }
    _entries[id] = _Entry(action, route);
    _owned[route] = id;
  }

  void _report({required bool push}) {
    final context = _routerContext;
    if (_disposed || context == null) return;
    if (push) {
      Router.navigate(context, notifyListeners);
    } else {
      Router.neglect(context, notifyListeners);
    }
  }

  void _pushed(Route<dynamic> route) {
    final id = _owned[route];
    if (id == null) return;
    final push = !_replaceOnPush.remove(route);
    _current = id;
    _cold = false;
    _report(push: push);
  }

  void _removed(Route<dynamic> route) {
    final id = _owned.remove(route);
    if (id == null) return;
    _entries[id]?.route = null;
    // Public listing/profile and synthetic Mission reads alone are replayable.
    // Removed effect-bearing/private links never gain a new retry path.
    if (_publicPath(_entries[id]?.action.target) == null) {
      _entries.remove(id);
    }
    if (_current == id) {
      _current = 0;
      _report(push: false);
    }
  }

  void _removeOwned() {
    for (final route in List<Route<dynamic>>.of(_owned.keys)) {
      if (route.isActive) route.navigator?.removeRoute(route);
    }
  }

  @override
  Future<void> setInitialRoutePath(Object configuration) async {
    // Phase-A controller already owns the one cold capture and owner epoch.
    // Router must not reparse or dispatch its normalized initial URI again.
  }

  @override
  Future<void> setNewRoutePath(Object configuration) async {
    if (_disposed) return;
    final generation = ++_generation;
    _cold = false;
    controller.invalidateWebIngress();
    final request =
        configuration is _Request ? configuration : const _Request();
    _restoring = null;
    _restoringAction = null;
    _removeOwned();
    _current = 0;
    if (!request.valid ||
        request.initial ||
        (request.entry != null && request.instance != _instance)) {
      _report(push: false);
      return;
    }
    if (request.entry == 0 && request.target == null) {
      _report(push: false);
      return;
    }
    final retained = request.entry == null ? null : _entries[request.entry];
    if (request.entry != null &&
        (retained == null ||
            !request.canonicalPublic ||
            retained.action.target.kind != request.target?.kind ||
            retained.action.target.id != request.target?.id ||
            _publicPath(retained.action.target) == null ||
            _publicPath(retained.action.target) !=
                _publicPath(request.target) ||
            (retained.action.target.kind == AppLinkKind.missionWebEntry &&
                retained.action.target.uri != request.target?.uri))) {
      _report(push: false);
      return;
    }
    final target = retained?.action.target ?? request.target;
    if (target == null) {
      _report(push: false);
      return;
    }
    await controller.enqueueWebHistory(
        target: target,
        restoredOwner: retained?.action.owner,
        isCurrent: () => !_disposed && generation == _generation,
        accept: (action) {
          _restoring = request.entry ?? _next++;
          _restoringAction = action;
          controller.publishWebHistory(action);
        });
    if (!_disposed && generation == _generation) _report(push: false);
  }

  @override
  Widget build(BuildContext context) {
    _routerContext = context;
    return Navigator(
        key: navigatorKey,
        observers: [_observer],
        pages: [_anchor],
        onDidRemovePage: (_) {});
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    _entries.clear();
    _owned.clear();
    _replaceOnPush.clear();
    super.dispose();
  }
}

class _Observer extends NavigatorObserver {
  final _Delegate delegate;
  _Observer(this.delegate);
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      delegate._pushed(route);
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      delegate._removed(route);
  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      delegate._removed(route);
}
