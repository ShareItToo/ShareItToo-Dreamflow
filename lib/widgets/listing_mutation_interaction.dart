import 'package:flutter/material.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

/// Screen-local principal/epoch and exact-route guard for listing actions.
class ListingMutationInteractionController {
  ListingMutationContext? _context;
  int _actionEpoch = 0;
  Object? _activeRouteIdentity;
  void Function()? _dismissActiveRoute;

  ListingMutationContext? get context => _context;

  void replaceContext(ListingMutationContext? context) {
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

  ListingMutationActionOwner? capture() {
    final context = _context;
    if (context == null) return null;
    return ListingMutationActionOwner(
      context: context,
      actionEpoch: ++_actionEpoch,
    );
  }

  bool isSynchronouslyCurrent(ListingMutationActionOwner owner) =>
      owner.isSynchronouslyCurrent(
        context: _context,
        actionEpoch: _actionEpoch,
      );

  Future<bool> isCurrent(
    ListingMutationService service,
    ListingMutationActionOwner owner,
  ) async {
    if (!isSynchronouslyCurrent(owner)) return false;
    final current = await service.isContextCurrent(owner.context);
    return current && isSynchronouslyCurrent(owner);
  }

  void _bindRoute<T>(
    ListingMutationActionOwner owner,
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
    required ListingMutationActionOwner owner,
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

  Future<T?> pushOwnedRoute<T>({
    required BuildContext context,
    required ListingMutationActionOwner owner,
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
