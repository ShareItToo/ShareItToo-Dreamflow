import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

/// One saved-cart interaction, including its exact pages, drafts and notices.
/// Construct from the displayed snapshot's owner BEFORE the first action await.
/// A new account needs a new scope; an old completion never adopts that account.
class SavedCartActionScope {
  SavedCartActionScope(this.owner, {required this.isMounted}) {
    _subscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) invalidate();
    });
  }

  final LocalPrincipalActionOwner owner;
  final bool Function() isMounted;
  late final StreamSubscription<String> _subscription;
  final Set<VoidCallback> _dismissals = {};
  bool _invalidated = false;
  bool _disposed = false;

  bool get isCurrentNow =>
      !_invalidated && !_disposed && isMounted() && owner.isCurrentEpoch;

  Future<bool> isCurrent() async {
    if (!isCurrentNow) return false;
    final current = await owner.isCurrent();
    if (!current) {
      invalidate();
      // A persisted session replacement may arrive without the in-process
      // event (for example another browser tab). Clear the parent snapshot as
      // well; this is a refresh signal, never a session/credential mutation.
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
    }
    return current && isCurrentNow;
  }

  void _dismiss({bool defer = false}) {
    final callbacks = _dismissals.toList();
    _dismissals.clear();
    if (callbacks.isEmpty) return;
    void close() {
      for (final callback in callbacks) {
        callback();
      }
    }

    if (defer ||
        SchedulerBinding.instance.schedulerPhase ==
            SchedulerPhase.persistentCallbacks) {
      WidgetsBinding.instance.addPostFrameCallback((_) => close());
      // Idle disposal must not wait indefinitely for unrelated user activity.
      // Queue one frame so exact-route cleanup also completes on an idle UI.
      WidgetsBinding.instance.ensureVisualUpdate();
    } else {
      close();
    }
  }

  void invalidate() {
    if (_invalidated) return;
    _invalidated = true;
    _dismiss();
  }

  /// Identity-bound removal never closes whichever page happens to be current.
  void closeRoute(Route<dynamic>? route) {
    final navigator = route?.navigator;
    if (route != null &&
        navigator != null &&
        route.isActive &&
        !route.isFirst) {
      navigator.removeRoute(route);
    }
  }

  VoidCallback trackRoute(Route<dynamic> route) {
    void dismiss() => closeRoute(route);
    _dismissals.add(dismiss);
    if (!isCurrentNow) _dismiss();
    return () => _dismissals.remove(dismiss);
  }

  Future<T?> push<T>(BuildContext context, Route<T> route) async {
    if (!await isCurrent() || !context.mounted) return null;
    final release = trackRoute(route);
    try {
      final result = await Navigator.of(context).push<T>(route);
      return await isCurrent() ? result : null;
    } finally {
      release();
    }
  }

  Future<T?> dialog<T>(
    BuildContext context, {
    required IconData icon,
    required String title,
    required Widget Function(ValueChanged<T?> complete) body,
    Color? cardBackgroundColor,
  }) async {
    if (!await isCurrent() || !context.mounted) return null;
    final handle = TrackedDialogRouteHandle<T>();
    void dismiss() => handle.dismiss();
    _dismissals.add(dismiss);
    try {
      final result = await AppPopup.showCustom<T>(
        context,
        icon: icon,
        title: title,
        showCloseIcon: false,
        showLeading: false,
        showAccentLine: false,
        cardBackgroundColor: cardBackgroundColor,
        routeHandle: handle,
        body: body(handle.dismiss),
      );
      return await isCurrent() ? result : null;
    } finally {
      _dismissals.remove(dismiss);
    }
  }

  /// An owned general dialog, including nested menus and image galleries.
  /// Its completion callback removes only this dialog, never a newer B route.
  Future<T?> generalDialog<T>(
    BuildContext context, {
    required RoutePageBuilder Function(ValueChanged<T?> complete) pageBuilder,
    required String barrierLabel,
    required Color barrierColor,
    required Duration transitionDuration,
    RouteTransitionsBuilder? transitionBuilder,
  }) async {
    if (!await isCurrent() || !context.mounted) return null;
    final handle = TrackedDialogRouteHandle<T>();
    void dismiss() => handle.dismiss();
    _dismissals.add(dismiss);
    try {
      final result = await showTrackedGeneralDialog<T>(
        context: context,
        handle: handle,
        pageBuilder: pageBuilder(handle.dismiss),
        barrierDismissible: true,
        barrierLabel: barrierLabel,
        barrierColor: barrierColor,
        transitionDuration: transitionDuration,
        transitionBuilder: transitionBuilder,
      );
      return await isCurrent() ? result : null;
    } finally {
      _dismissals.remove(dismiss);
    }
  }

  Future<void> notice(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? message,
  }) async {
    if (!await isCurrent() || !context.mounted) return;
    final handle = TrackedDialogRouteHandle<void>();
    void dismiss() => handle.dismiss();
    _dismissals.add(dismiss);
    try {
      await AppPopup.toast(context,
          icon: icon, title: title, message: message, routeHandle: handle);
    } finally {
      _dismissals.remove(dismiss);
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _subscription.cancel();
    _dismiss(defer: true);
  }
}
