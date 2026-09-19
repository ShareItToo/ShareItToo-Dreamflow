import 'package:flutter/material.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/rental_request_decision_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

/// Screen-local action epoch plus exact route ownership for booking decisions.
class RentalRequestDecisionInteractionController {
  RentalRequestDecisionContext? _context;
  int _actionEpoch = 0;
  Object? _activeRouteIdentity;
  void Function()? _dismissActiveRoute;
  Route<dynamic>? _ownedScreenRoute;

  RentalRequestDecisionContext? get context => _context;

  void replaceContext(RentalRequestDecisionContext? context) {
    invalidate();
    _context = context;
  }

  void invalidate() {
    _actionEpoch += 1;
    _context = null;
    final dismiss = _dismissActiveRoute;
    _activeRouteIdentity = null;
    _dismissActiveRoute = null;
    dismiss?.call();
  }

  RentalRequestDecisionActionOwner? capture() {
    final context = _context;
    if (context == null) return null;
    return RentalRequestDecisionActionOwner(
      context: context,
      actionEpoch: ++_actionEpoch,
    );
  }

  bool isSynchronouslyCurrent(RentalRequestDecisionActionOwner owner) =>
      owner.isSynchronouslyCurrent(
        context: _context,
        actionEpoch: _actionEpoch,
      ) &&
      owner.context.owner.authOwner.epoch == AuthService.sessionEpoch;

  Future<bool> isCurrent(
    RentalRequestDecisionService service,
    RentalRequestDecisionActionOwner owner,
  ) async {
    if (!isSynchronouslyCurrent(owner)) return false;
    final current = await service.isContextCurrent(owner.context);
    return current && isSynchronouslyCurrent(owner);
  }

  VoidCallback trackOwnedScreenRoute(Route<dynamic> route) {
    _ownedScreenRoute = route;
    return () {
      if (identical(_ownedScreenRoute, route)) _ownedScreenRoute = null;
    };
  }

  void completeOwnedScreenRoute<T>(
    RentalRequestDecisionActionOwner owner,
    T result,
  ) {
    if (!isSynchronouslyCurrent(owner)) return;
    final route = _ownedScreenRoute;
    final navigator = route?.navigator;
    if (route == null ||
        navigator == null ||
        !route.isActive ||
        route.isFirst) {
      return;
    }
    _ownedScreenRoute = null;
    navigator.removeRoute(route, result);
  }

  void replaceOwnedScreenRoute(
    RentalRequestDecisionActionOwner owner,
    Route<dynamic> replacement,
  ) {
    if (!isSynchronouslyCurrent(owner)) return;
    final route = _ownedScreenRoute;
    final navigator = route?.navigator;
    if (route == null ||
        navigator == null ||
        !route.isActive ||
        route.isFirst) {
      return;
    }
    _ownedScreenRoute = replacement;
    navigator.replace(oldRoute: route, newRoute: replacement);
  }

  void _bindRoute(
    RentalRequestDecisionActionOwner owner,
    Object identity,
    void Function() dismiss,
  ) {
    if (!isSynchronouslyCurrent(owner)) return;
    _activeRouteIdentity = identity;
    _dismissActiveRoute = dismiss;
  }

  void _releaseRoute(Object identity) {
    if (!identical(identity, _activeRouteIdentity)) return;
    _activeRouteIdentity = null;
    _dismissActiveRoute = null;
  }

  Future<T?> showOwnedDialog<T>({
    required BuildContext context,
    required RentalRequestDecisionActionOwner owner,
    required Widget Function(
      BuildContext context,
      void Function(T? result) dismiss,
    ) builder,
    bool barrierDismissible = true,
    bool useRootNavigator = true,
  }) async {
    if (!isSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final handle = TrackedDialogRouteHandle<T>();
    _bindRoute(owner, identity, handle.dismiss);
    try {
      return await showTrackedDialog<T>(
        context: context,
        handle: handle,
        builder: (context) => builder(context, handle.dismiss),
        barrierDismissible: barrierDismissible,
        barrierLabel:
            MaterialLocalizations.of(context).modalBarrierDismissLabel,
        useRootNavigator: useRootNavigator,
      );
    } finally {
      _releaseRoute(identity);
    }
  }

  Future<T?> showOwnedPopup<T>({
    required BuildContext context,
    required RentalRequestDecisionActionOwner owner,
    required IconData icon,
    required String title,
    String? message,
    required List<Widget> Function(void Function(T? result) dismiss) actions,
    bool barrierDismissible = true,
    bool showCloseIcon = true,
    bool plainCloseIcon = true,
    Duration? autoCloseAfter,
    Widget? leadingWidget,
  }) async {
    if (!isSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final handle = TrackedDialogRouteHandle<void>();
    T? result;
    void dismiss(T? value) {
      result = value;
      handle.dismiss();
    }

    _bindRoute(owner, identity, handle.dismiss);
    try {
      await AppPopup.show(
        context,
        icon: icon,
        title: title,
        message: message,
        actions: actions(dismiss),
        barrierDismissible: barrierDismissible,
        showCloseIcon: showCloseIcon,
        plainCloseIcon: plainCloseIcon,
        autoCloseAfter: autoCloseAfter,
        leadingWidget: leadingWidget,
        routeHandle: handle,
      );
      return result;
    } finally {
      _releaseRoute(identity);
    }
  }

  Future<T?> pushOwnedRoute<T>({
    required BuildContext context,
    required RentalRequestDecisionActionOwner owner,
    required Route<T> route,
    bool useRootNavigator = false,
  }) async {
    if (!isSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final navigator = Navigator.of(context, rootNavigator: useRootNavigator);
    _bindRoute(owner, identity, () {
      final routeNavigator = route.navigator;
      if (routeNavigator != null && route.isActive) {
        routeNavigator.removeRoute(route);
      }
    });
    try {
      return await navigator.push<T>(route);
    } finally {
      _releaseRoute(identity);
    }
  }

  void dispose() => invalidate();
}
