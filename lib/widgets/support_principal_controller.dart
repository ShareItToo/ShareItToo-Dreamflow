import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

/// One support interaction belongs to one immutable session. A successor must
/// open a new interaction; an old draft never silently adopts new credentials.
class SupportPrincipalController extends ChangeNotifier {
  SupportPrincipalController({AuthSessionOwner? expectedOwner}) {
    _subscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) invalidate();
    });
    ready = _load(expectedOwner);
  }

  late final Future<void> ready;
  late final StreamSubscription<String> _subscription;
  final Set<VoidCallback> _ownedRoutes = {};
  AuthSessionOwner? _owner;
  bool _invalidated = false;
  bool _disposed = false;
  bool _loading = true;
  bool get invalidated => _invalidated;
  bool get loading => _loading;

  Future<void> _load(AuthSessionOwner? expected) async {
    final epoch = AuthService.sessionEpoch;
    try {
      final session = expected == null ? await AuthService.readSession() : null;
      if (_disposed || _invalidated || epoch != AuthService.sessionEpoch) {
        return;
      }
      final owner = expected ??
          (session == null ? null : AuthService.captureSessionOwner(session));
      if (owner == null || (owner.userId ?? '').trim().isEmpty) return;
      final current = await AuthService.isSessionOwnerDefinitelyCurrent(owner);
      if (_disposed || _invalidated || epoch != AuthService.sessionEpoch) {
        return;
      }
      if (!current) {
        invalidate();
        return;
      }
      _owner = owner;
    } finally {
      _loading = false;
      if (!_disposed) notifyListeners();
    }
  }

  /// Capture synchronously before the action's first await.
  AuthSessionOwner? capture() {
    final owner = _owner;
    return owner != null && isCurrentNow(owner) ? owner : null;
  }

  bool isCurrentNow(AuthSessionOwner owner) =>
      !_disposed &&
      !_invalidated &&
      identical(owner, _owner) &&
      owner.epoch == AuthService.sessionEpoch;

  Future<bool> isCurrent(AuthSessionOwner owner) async {
    if (!isCurrentNow(owner)) return false;
    final current = await AuthService.isSessionOwnerDefinitelyCurrent(owner);
    if (!current && !_disposed) invalidate();
    return current && isCurrentNow(owner);
  }

  void _dismissRoutes({bool defer = false}) {
    final callbacks = _ownedRoutes.toList();
    _ownedRoutes.clear();
    void dismiss() {
      for (final callback in callbacks) {
        callback();
      }
    }

    if (defer ||
        SchedulerBinding.instance.schedulerPhase ==
            SchedulerPhase.persistentCallbacks) {
      WidgetsBinding.instance.addPostFrameCallback((_) => dismiss());
    } else {
      dismiss();
    }
  }

  void invalidate() {
    if (_disposed || _invalidated) return;
    _invalidated = true;
    _owner = null;
    _dismissRoutes();
    if (!_disposed) notifyListeners();
  }

  /// Track route identity, not whichever route is currently on top.
  VoidCallback trackScreenRoute(Route<dynamic> route) {
    void dismiss() {
      final navigator = route.navigator;
      if (navigator != null && route.isActive && !route.isFirst) {
        navigator.removeRoute(route);
      }
    }

    _ownedRoutes.add(dismiss);
    if (_invalidated) _dismissRoutes();
    return () => _ownedRoutes.remove(dismiss);
  }

  Future<T?> pushOwnedRoute<T>({
    required BuildContext context,
    required AuthSessionOwner owner,
    required Route<T> route,
  }) async {
    if (!await isCurrent(owner) || !context.mounted) return null;
    final release = trackScreenRoute(route);
    try {
      final result = await Navigator.of(context).push<T>(route);
      return await isCurrent(owner) ? result : null;
    } finally {
      release();
    }
  }

  Future<void> showOwnedDialog({
    required BuildContext context,
    required AuthSessionOwner owner,
    required Widget Function(BuildContext, VoidCallback) builder,
  }) async {
    if (!await isCurrent(owner) || !context.mounted) return;
    final handle = TrackedDialogRouteHandle<void>();
    void dismiss() => handle.dismiss();
    _ownedRoutes.add(dismiss);
    try {
      await showTrackedDialog<void>(
        context: context,
        handle: handle,
        barrierDismissible: false,
        builder: (context) => builder(context, dismiss),
      );
    } finally {
      _ownedRoutes.remove(dismiss);
    }
  }

  void completeOwnedRoute<T>(
      Route<T>? route, AuthSessionOwner owner, T result) {
    if (!isCurrentNow(owner) || route == null || route.isFirst) return;
    final navigator = route.navigator;
    if (navigator != null && route.isActive) {
      navigator.removeRoute(route, result);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _owner = null;
    _subscription.cancel();
    _dismissRoutes(defer: true);
    super.dispose();
  }

  Future<void> showNotice({
    required BuildContext context,
    required AuthSessionOwner owner,
    required String title,
    String? message,
  }) =>
      showOwnedDialog(
        context: context,
        owner: owner,
        builder: (_, dismiss) => AlertDialog(
          title: Text(title),
          content: message == null ? null : Text(message),
          actions: [TextButton(onPressed: dismiss, child: const Text('OK'))],
        ),
      );
}
