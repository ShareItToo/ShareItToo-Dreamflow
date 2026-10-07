import 'package:flutter/material.dart';

/// Owns one concrete dialog route by identity.
///
/// Dismissal removes only the route bound to this handle. It never pops the
/// navigator's current route, so a later dialog pushed above it is preserved.
class TrackedDialogRouteHandle<T> {
  Route<T>? _route;

  bool get isActive => _route?.isActive == true;

  void dismiss([T? result]) {
    final route = _route;
    final navigator = route?.navigator;
    if (route == null || navigator == null || !route.isActive) return;
    navigator.removeRoute(route, result);
  }

  void _bind(Route<T> route) {
    if (_route != null) {
      throw StateError('A dialog handle cannot own two active routes.');
    }
    _route = route;
  }

  void _release(Route<T> route) {
    if (identical(_route, route)) _route = null;
  }
}

Future<T?> showTrackedDialog<T>({
  required BuildContext context,
  required TrackedDialogRouteHandle<T> handle,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
  Color? barrierColor,
  String? barrierLabel,
  bool useSafeArea = true,
  bool useRootNavigator = true,
}) async {
  final navigator = Navigator.of(context, rootNavigator: useRootNavigator);
  final route = DialogRoute<T>(
    context: context,
    builder: builder,
    barrierDismissible: barrierDismissible,
    barrierColor: barrierColor,
    barrierLabel: barrierLabel,
    useSafeArea: useSafeArea,
  );
  handle._bind(route);
  try {
    return await navigator.push<T>(route);
  } finally {
    handle._release(route);
  }
}

Future<T?> showTrackedGeneralDialog<T>({
  required BuildContext context,
  required TrackedDialogRouteHandle<T> handle,
  required RoutePageBuilder pageBuilder,
  bool barrierDismissible = false,
  String? barrierLabel,
  Color barrierColor = const Color(0x80000000),
  Duration transitionDuration = const Duration(milliseconds: 200),
  RouteTransitionsBuilder? transitionBuilder,
  bool useRootNavigator = true,
}) async {
  assert(!barrierDismissible || barrierLabel != null);
  final navigator = Navigator.of(context, rootNavigator: useRootNavigator);
  final route = RawDialogRoute<T>(
    pageBuilder: pageBuilder,
    barrierDismissible: barrierDismissible,
    barrierLabel: barrierLabel,
    barrierColor: barrierColor,
    transitionDuration: transitionDuration,
    transitionBuilder: transitionBuilder,
  );
  handle._bind(route);
  try {
    return await navigator.push<T>(route);
  } finally {
    handle._release(route);
  }
}

/// Shows one modal bottom sheet whose exact route can be dismissed without
/// popping a newer route that another principal opened above it.
Future<T?> showTrackedModalBottomSheet<T>({
  required BuildContext context,
  required TrackedDialogRouteHandle<T> handle,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
  bool useRootNavigator = false,
  bool isDismissible = true,
  bool enableDrag = true,
  bool useSafeArea = false,
  Color? backgroundColor,
  Color? barrierColor,
  String? barrierLabel,
}) async {
  assert(debugCheckHasMediaQuery(context));
  assert(debugCheckHasMaterialLocalizations(context));
  final navigator = Navigator.of(context, rootNavigator: useRootNavigator);
  final localizations = MaterialLocalizations.of(context);
  final route = ModalBottomSheetRoute<T>(
    builder: builder,
    capturedThemes: InheritedTheme.capture(
      from: context,
      to: navigator.context,
    ),
    isScrollControlled: isScrollControlled,
    barrierLabel: barrierLabel ?? localizations.scrimLabel,
    barrierOnTapHint:
        localizations.scrimOnTapHint(localizations.bottomSheetLabel),
    backgroundColor: backgroundColor,
    modalBarrierColor:
        barrierColor ?? Theme.of(context).bottomSheetTheme.modalBarrierColor,
    isDismissible: isDismissible,
    enableDrag: enableDrag,
    useSafeArea: useSafeArea,
  );
  handle._bind(route);
  try {
    return await navigator.push<T>(route);
  } finally {
    handle._release(route);
  }
}
