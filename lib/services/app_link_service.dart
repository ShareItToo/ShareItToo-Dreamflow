import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'auth_service.dart';
import 'backend_config.dart';
import 'firebase_runtime.dart';
import 'local_principal_scope.dart';

enum AppLinkKind {
  listing,
  profile,
  booking,
  chat,
  emailVerification,
  passwordReset,
  paymentReturn,
  notifications,
  crashDiagnostic,
}

class AppLinkTarget {
  final AppLinkKind kind;
  final String? id;
  final Uri uri;

  const AppLinkTarget({required this.kind, required this.uri, this.id});
}

/// Credential-free ownership boundary for one accepted app-link action.
///
/// Production ownership delegates to [LocalPrincipalActionOwner]. Tests can
/// provide a small fake without persisting or exposing an authenticated
/// session. Only the opaque local principal token and monotonic epoch are
/// retained with a target.
abstract interface class AppLinkPrincipalOwner {
  String get principalToken;
  bool get authenticated;
  int get epoch;
  bool get isCurrentEpoch;
  Future<bool> isCurrent();
}

class LocalAppLinkPrincipalOwner implements AppLinkPrincipalOwner {
  final LocalPrincipalActionOwner _owner;

  const LocalAppLinkPrincipalOwner._(this._owner);

  static Future<AppLinkPrincipalOwner> capture() async =>
      LocalAppLinkPrincipalOwner._(await LocalPrincipalActionOwner.capture());

  @override
  String get principalToken => _owner.principal.token;

  @override
  bool get authenticated => _owner.principal.authenticated;

  @override
  int get epoch => _owner.epoch;

  @override
  bool get isCurrentEpoch => _owner.isCurrentEpoch;

  @override
  Future<bool> isCurrent() => _owner.isCurrent();
}

class PrincipalBoundAppLinkTarget {
  final AppLinkTarget target;
  final AppLinkPrincipalOwner owner;

  const PrincipalBoundAppLinkTarget({
    required this.target,
    required this.owner,
  });
}

class AppLinkPrincipalChanged implements Exception {
  const AppLinkPrincipalChanged();
}

/// Settles an existing backend session before the first app-link owner exists.
///
/// A cold Android notification intent is retained by [FirebaseRuntime] while
/// `main` runs. Refreshing an expired access token after [AppLinkController]
/// has captured its epoch would correctly invalidate that owner and therefore
/// lose the initial route. Before `runApp` there is no UI from which a user can
/// switch accounts, so completing the existing session refresh here preserves
/// strict principal/epoch ownership without ever rebinding Account A to B.
Future<void> settleInitialAppLinkPrincipal({
  bool? backendEnabled,
  Future<AuthSession?> Function()? readSession,
  Future<String?> Function()? resolveAccessToken,
}) async {
  if (!(backendEnabled ?? BackendConfig.enabled)) return;
  final session = await (readSession ?? AuthService.readSession)();
  if (session == null) return;
  await (resolveAccessToken ?? AuthService.accessToken)();
}

/// Executes one app-link read or side effect only for its captured owner.
///
/// The current owner is verified immediately before the operation starts and
/// again before its result can escape to UI or navigation code. A transport
/// result from Account A can therefore never become Account B presentation.
Future<T> runPrincipalBoundAppLinkOperation<T>({
  required AppLinkPrincipalOwner owner,
  required Future<T> Function() operation,
}) async {
  if (!await owner.isCurrent()) throw const AppLinkPrincipalChanged();
  final result = await operation();
  if (!await owner.isCurrent()) throw const AppLinkPrincipalChanged();
  return result;
}

class AppLinkTargetInbox {
  static const duplicateWindow = Duration(seconds: 5);

  final DateTime Function() _now;
  PrincipalBoundAppLinkTarget? _pending;
  Uri? _lastAcceptedUri;
  String? _lastAcceptedPrincipalToken;
  int? _lastAcceptedEpoch;
  DateTime? _lastAcceptedAt;

  AppLinkTargetInbox({DateTime Function()? now}) : _now = now ?? DateTime.now;

  PrincipalBoundAppLinkTarget? takePending() {
    final target = _pending;
    _pending = null;
    return target;
  }

  bool accept(AppLinkTarget target, AppLinkPrincipalOwner owner) {
    final acceptedAt = _now();
    final previousAt = _lastAcceptedAt;
    if (_lastAcceptedUri == target.uri &&
        _lastAcceptedPrincipalToken == owner.principalToken &&
        _lastAcceptedEpoch == owner.epoch &&
        previousAt != null &&
        acceptedAt.difference(previousAt) <= duplicateWindow) {
      return false;
    }

    _pending = PrincipalBoundAppLinkTarget(target: target, owner: owner);
    _lastAcceptedUri = target.uri;
    _lastAcceptedPrincipalToken = owner.principalToken;
    _lastAcceptedEpoch = owner.epoch;
    _lastAcceptedAt = acceptedAt;
    return true;
  }
}

class AppLinkBuilder {
  static Uri listing(String itemId) => _publicTarget('listing', itemId);

  static Uri profile(String userId) => _publicTarget('profile', userId);

  static Uri _publicTarget(String kind, String id) {
    final value = id.trim();
    if (value.isEmpty ||
        value.length > 120 ||
        !RegExp(r'^[A-Za-z0-9_.:-]+$').hasMatch(value)) {
      throw ArgumentError.value(id, 'id', 'Ungültige ShareItToo-ID');
    }
    return BackendConfig.uri('/open/$kind/${Uri.encodeComponent(value)}');
  }
}

class AppLinkParser {
  static const _allowedWebHosts = <String>{
    'shareittoo.com',
    'www.shareittoo.com',
    'staging.shareittoo.com',
  };

  static AppLinkTarget? parse(Uri uri) {
    if (uri.userInfo.isNotEmpty) return null;
    final isCustom = uri.scheme.toLowerCase() == 'shareittoo';
    final isWeb =
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        _allowedWebHosts.contains(uri.host.toLowerCase());
    if (!isCustom && !isWeb) return null;

    final segments = <String>[
      if (isCustom && uri.host.isNotEmpty) uri.host,
      ...uri.pathSegments,
    ].where((segment) => segment.isNotEmpty).toList();
    while (segments.isNotEmpty &&
        const {'api', 'v1', 'open'}.contains(segments.first.toLowerCase())) {
      segments.removeAt(0);
    }
    if (segments.isEmpty) return null;

    String? safeId(int index) {
      if (segments.length <= index) return null;
      final value = segments[index].trim();
      return value.isNotEmpty &&
              value.length <= 120 &&
              RegExp(r'^[A-Za-z0-9_.:-]+$').hasMatch(value)
          ? value
          : null;
    }

    switch (segments.first.toLowerCase()) {
      case 'listing':
        final id = safeId(1);
        return id == null
            ? null
            : AppLinkTarget(kind: AppLinkKind.listing, id: id, uri: uri);
      case 'profile':
        final id = safeId(1);
        return id == null
            ? null
            : AppLinkTarget(kind: AppLinkKind.profile, id: id, uri: uri);
      case 'booking':
        final id = safeId(1);
        return id == null
            ? null
            : AppLinkTarget(kind: AppLinkKind.booking, id: id, uri: uri);
      case 'chat':
        final id = safeId(1);
        return id == null
            ? null
            : AppLinkTarget(kind: AppLinkKind.chat, id: id, uri: uri);
      case 'auth':
        if (segments.length >= 3 &&
            segments[1] == 'email-verification' &&
            segments[2] == 'confirm' &&
            (uri.queryParameters['token'] ?? '').isNotEmpty) {
          return AppLinkTarget(kind: AppLinkKind.emailVerification, uri: uri);
        }
        if (segments.length >= 2 &&
            segments[1] == 'password-reset' &&
            (uri.queryParameters['token'] ?? '').isNotEmpty) {
          return AppLinkTarget(kind: AppLinkKind.passwordReset, uri: uri);
        }
        return null;
      case 'payment':
        final id = segments.length >= 2 && segments[1] == 'return'
            ? safeId(2)
            : safeId(1);
        return id == null
            ? null
            : AppLinkTarget(kind: AppLinkKind.paymentReturn, id: id, uri: uri);
      case 'notifications':
        return segments.length == 1
            ? AppLinkTarget(kind: AppLinkKind.notifications, uri: uri)
            : null;
      case 'qa':
        if (!isCustom ||
            segments.length != 3 ||
            segments[1].toLowerCase() != 'crashlytics') {
          return null;
        }
        final id = safeId(2);
        return id == null
            ? null
            : AppLinkTarget(
                kind: AppLinkKind.crashDiagnostic,
                id: id,
                uri: uri,
              );
      default:
        return null;
    }
  }
}

class AppLinkController extends ChangeNotifier with WidgetsBindingObserver {
  final AppLinkTargetInbox _inbox;
  final Future<Uri?> Function() _takeNativePendingActionLink;
  final Future<AppLinkPrincipalOwner> Function() _capturePrincipalOwner;
  bool _initialized = false;
  bool _disposed = false;
  Future<void> _ingressQueue = Future<void>.value();
  StreamSubscription<Uri>? _firebaseActionSubscription;

  AppLinkController({
    AppLinkTargetInbox? inbox,
    Future<Uri?> Function()? takeNativePendingActionLink,
    Future<AppLinkPrincipalOwner> Function()? capturePrincipalOwner,
  }) : _inbox = inbox ?? AppLinkTargetInbox(),
       _takeNativePendingActionLink =
           takeNativePendingActionLink ??
           FirebaseRuntime.takeAndroidPendingActionLink,
       _capturePrincipalOwner =
           capturePrincipalOwner ?? LocalAppLinkPrincipalOwner.capture;

  PrincipalBoundAppLinkTarget? takePending() => _inbox.takePending();

  void initialize() {
    if (_initialized) return;
    _initialized = true;
    WidgetsBinding.instance.addObserver(this);
    final raw = kIsWeb
        ? Uri.base.toString()
        : WidgetsBinding.instance.platformDispatcher.defaultRouteName;
    _capture(raw);
    final firebasePending = FirebaseRuntime.takePendingActionLink();
    if (firebasePending != null) _capture(firebasePending.toString());
    _firebaseActionSubscription ??= FirebaseRuntime.actionLinks.listen(
      (uri) => _capture(uri.toString()),
    );
  }

  @override
  Future<bool> didPushRouteInformation(
    RouteInformation routeInformation,
  ) async {
    _capture(routeInformation.uri.toString());
    return true;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_refreshNativePendingActionLink());
    }
  }

  Future<void> _refreshNativePendingActionLink() async {
    // Start ownership capture before the first await in this resumed action.
    // A native A link can therefore never adopt a successor B session while
    // the platform bridge is being read.
    final owner = _capturePrincipalOwner();
    final uri = await _takeNativePendingActionLink();
    if (uri != null) {
      _capture(uri.toString(), startedOwner: owner);
      return;
    }
    try {
      await owner;
    } catch (_) {
      // A principal transition while no native target exists is a no-op.
    }
  }

  void _capture(String raw, {Future<AppLinkPrincipalOwner>? startedOwner}) {
    if (_disposed || raw.isEmpty || raw == '/') return;
    final uri = Uri.tryParse(raw);
    final target = uri == null ? null : AppLinkParser.parse(uri);
    if (target == null) return;

    // Calling the async capture now records AuthService.sessionEpoch before
    // its first storage await. Queue only the completion so concurrent native
    // and Firebase ingress cannot reorder targets.
    final owner = startedOwner ?? _capturePrincipalOwner();
    _ingressQueue = _ingressQueue.then((_) async {
      AppLinkPrincipalOwner captured;
      try {
        captured = await owner;
      } catch (_) {
        return;
      }
      if (_disposed ||
          !captured.isCurrentEpoch ||
          !await captured.isCurrent() ||
          _disposed ||
          !captured.isCurrentEpoch) {
        return;
      }
      if (_inbox.accept(target, captured)) notifyListeners();
    });
  }

  @override
  void dispose() {
    _disposed = true;
    _firebaseActionSubscription?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
