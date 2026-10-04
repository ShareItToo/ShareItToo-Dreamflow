import 'package:flutter/material.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

/// Screen-local principal/epoch and route-identity guard for profile actions.
///
/// One controller belongs to one mounted screen. Invalidating it dismisses
/// only the exact dialog or sheet owned by the old action and never pops the
/// navigator's current route.
class ProfileMutationInteractionController {
  ProfileMutationContext? _context;
  int _actionEpoch = 0;
  Object? _activeRouteIdentity;
  void Function()? _dismissActiveRoute;

  ProfileMutationContext? get context => _context;

  void replaceContext(ProfileMutationContext? context) {
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

  ProfileMutationActionOwner? capture() {
    final context = _context;
    if (context == null) return null;
    return ProfileMutationActionOwner(
      context: context,
      actionEpoch: ++_actionEpoch,
    );
  }

  bool isSynchronouslyCurrent(ProfileMutationActionOwner owner) =>
      owner.isSynchronouslyCurrent(
        context: _context,
        actionEpoch: _actionEpoch,
      );

  Future<bool> isCurrent(
    ProfileMutationService service,
    ProfileMutationActionOwner owner,
  ) async {
    if (!isSynchronouslyCurrent(owner)) return false;
    final current = await service.isContextCurrent(owner.context);
    return current && isSynchronouslyCurrent(owner);
  }

  void _bindRoute<T>(
    ProfileMutationActionOwner owner,
    Object identity,
    TrackedDialogRouteHandle<T> handle,
  ) {
    if (!isSynchronouslyCurrent(owner)) return;
    _activeRouteIdentity = identity;
    _dismissActiveRoute = handle.dismiss;
  }

  void _releaseRoute(Object identity) {
    if (!identical(identity, _activeRouteIdentity)) return;
    _activeRouteIdentity = null;
    _dismissActiveRoute = null;
  }

  Future<T?> showOwnedDialog<T>({
    required BuildContext context,
    required ProfileMutationActionOwner owner,
    required WidgetBuilder builder,
    bool barrierDismissible = true,
    bool useRootNavigator = true,
  }) async {
    if (!isSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final handle = TrackedDialogRouteHandle<T>();
    _bindRoute(owner, identity, handle);
    try {
      return await showTrackedDialog<T>(
        context: context,
        handle: handle,
        builder: builder,
        barrierDismissible: barrierDismissible,
        barrierLabel:
            MaterialLocalizations.of(context).modalBarrierDismissLabel,
        useRootNavigator: useRootNavigator,
      );
    } finally {
      _releaseRoute(identity);
    }
  }

  Future<T?> showOwnedSheet<T>({
    required BuildContext context,
    required ProfileMutationActionOwner owner,
    required WidgetBuilder builder,
    bool isScrollControlled = false,
    bool useRootNavigator = false,
    Color? backgroundColor,
  }) async {
    if (!isSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final handle = TrackedDialogRouteHandle<T>();
    _bindRoute(owner, identity, handle);
    try {
      return await showTrackedModalBottomSheet<T>(
        context: context,
        handle: handle,
        builder: builder,
        isScrollControlled: isScrollControlled,
        useRootNavigator: useRootNavigator,
        backgroundColor: backgroundColor,
      );
    } finally {
      _releaseRoute(identity);
    }
  }

  Future<T?> pushOwnedRoute<T>({
    required BuildContext context,
    required ProfileMutationActionOwner owner,
    required Route<T> route,
    bool useRootNavigator = false,
  }) async {
    if (!isSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final navigator = Navigator.of(context, rootNavigator: useRootNavigator);
    _activeRouteIdentity = identity;
    _dismissActiveRoute = () {
      final routeNavigator = route.navigator;
      if (routeNavigator != null && route.isActive) {
        routeNavigator.removeRoute(route);
      }
    };
    try {
      return await navigator.push<T>(route);
    } finally {
      _releaseRoute(identity);
    }
  }

  void removeOwnedNavigationRoute(Route<dynamic>? route) {
    final navigator = route?.navigator;
    if (route == null || navigator == null || !route.isActive) return;
    navigator.removeRoute(route);
  }

  void dispose() => invalidate();
}
