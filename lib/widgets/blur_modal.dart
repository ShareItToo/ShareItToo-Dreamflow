import 'dart:ui';
import 'package:flutter/material.dart';

/// Shows a blurred-background bottom sheet with a glassy container.
/// The [child] should include its own padding and (optionally) a sticky footer.
Future<T?> showBlurBottomSheet<T>(
  BuildContext context, {
  required Widget child,
  double maxHeightFactor = 0.9,
  bool useRootNavigator = true,
  double barrierOpacity = 0.55,
  double blurSigma = 8,
  bool dismissOnOutsideTap = true,
  Color? sheetColor,
  BorderRadiusGeometry sheetBorderRadius = const BorderRadius.vertical(top: Radius.circular(24)),
  bool showHandle = true,
  bool glassPanel = false,
  double glassSigma = 5,
}) {
  final media = MediaQuery.of(context);
  final maxH = media.size.height * maxHeightFactor;
  return showModalBottomSheet<T>(
    context: context,
    useRootNavigator: useRootNavigator,
    isScrollControlled: true,
    isDismissible: dismissOnOutsideTap,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: barrierOpacity),
    builder: (_) {
      final effectiveSigma = blurSigma < 0 ? 0.0 : blurSigma;
      return Stack(children: [
        if (effectiveSigma > 0.01)
          Positioned.fill(
            child: BackdropFilter(filter: ImageFilter.blur(sigmaX: effectiveSigma, sigmaY: effectiveSigma), child: const SizedBox()),
          ),
        Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxH),
            child: _GlassContainer(
              color: sheetColor,
              borderRadius: sheetBorderRadius,
              showHandle: showHandle,
              glassPanel: glassPanel,
              glassSigma: glassSigma,
              child: child,
            ),
          ),
        ),
      ]);
    },
  );
}

/// Shows a centered blurred modal dialog with a glassy container.
///
/// Use this for conversion / nudge moments where the UI should remain visible behind.
Future<T?> showBlurDialog<T>(
  BuildContext context, {
  required Widget child,
  bool useRootNavigator = true,
  double barrierOpacity = 0.45,
  double blurSigma = 10,
  bool dismissOnOutsideTap = true,
  Color? panelColor,
  BorderRadiusGeometry panelBorderRadius = const BorderRadius.all(Radius.circular(24)),
  double maxWidth = 560,
  bool glassPanel = false,
  double glassSigma = 5,
}) {
  final effectiveSigma = blurSigma < 0 ? 0.0 : blurSigma;
  return showGeneralDialog<T>(
    context: context,
    useRootNavigator: useRootNavigator,
    barrierDismissible: dismissOnOutsideTap,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withValues(alpha: barrierOpacity),
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (ctx, __, ___) {
      return SafeArea(
        child: Stack(children: [
          if (effectiveSigma > 0.01)
            Positioned.fill(
              child: BackdropFilter(filter: ImageFilter.blur(sigmaX: effectiveSigma, sigmaY: effectiveSigma), child: const SizedBox()),
            ),
          Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxWidth),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Material(
                  type: MaterialType.transparency,
                  child: _GlassContainer(
                    color: panelColor,
                    borderRadius: panelBorderRadius,
                    showHandle: false,
                    glassPanel: glassPanel,
                    glassSigma: glassSigma,
                    child: child,
                  ),
                ),
              ),
            ),
          ),
        ]),
      );
    },
    transitionBuilder: (ctx, animation, secondaryAnimation, dialogChild) {
      final t = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
      return FadeTransition(
        opacity: t,
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.98, end: 1).animate(t),
          child: dialogChild,
        ),
      );
    },
  );
}

/// A glassy container with rounded corners and an optional top handle.
class _GlassContainer extends StatelessWidget {
  final Widget child;
  final Color? color;
  final BorderRadiusGeometry borderRadius;
  final bool showHandle;
  /// Nullable on purpose: after hot reloads (especially on web) an older
  /// element instance can temporarily carry a missing field which becomes `null`
  /// at runtime. We treat `null` as `false` to avoid `Null is not a subtype of bool`.
  final bool? glassPanel;
  final double glassSigma;
  const _GlassContainer({required this.child, required this.borderRadius, required this.showHandle, this.color, this.glassPanel, required this.glassSigma});
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isGlass = glassPanel == true;

    final panel = Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: isGlass
            ? (color ?? theme.colorScheme.surface).withValues(alpha: theme.brightness == Brightness.dark ? 0.16 : 0.22)
            : (color ?? theme.colorScheme.surface).withValues(alpha: 0.96),
        borderRadius: borderRadius,
        border: Border.all(
          color: isGlass
              ? theme.colorScheme.onSurface.withValues(alpha: theme.brightness == Brightness.dark ? 0.14 : 0.10)
              : Colors.white.withValues(alpha: 0.06),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showHandle) ...[
              const SizedBox(height: 8),
              Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: (isGlass ? theme.colorScheme.onSurface : Colors.white).withValues(alpha: 0.22),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              const SizedBox(height: 8),
            ],
            Flexible(child: child),
          ],
        ),
      ),
    );

    if (!isGlass) return panel;

    final effectiveSigma = glassSigma < 0 ? 0.0 : glassSigma;
    return ClipRRect(
      borderRadius: borderRadius.resolve(Directionality.of(context)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: effectiveSigma, sigmaY: effectiveSigma),
        child: panel,
      ),
    );
  }
}

/// Standardized structure for modals: title, optional actions, body, and a sticky bottom area.
class SheetScaffold extends StatelessWidget {
  final String title;
  final Widget body;
  final Widget? bottomBar;
  final List<Widget>? actions;
  const SheetScaffold({super.key, required this.title, required this.body, this.bottomBar, this.actions});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 6),
        child: Row(children: [
          Expanded(child: Text(title, style: theme.textTheme.titleLarge?.copyWith(color: theme.colorScheme.onSurface))),
          ...?actions,
        ]),
      ),
      const Divider(height: 1, thickness: 1, color: Colors.white24),
      Expanded(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: body,
        ),
      ),
      if (bottomBar != null) ...[
        const Divider(height: 1, thickness: 1, color: Colors.white24),
        SafeArea(child: Padding(padding: const EdgeInsets.all(12), child: bottomBar!)),
      ],
    ]);
  }
}
