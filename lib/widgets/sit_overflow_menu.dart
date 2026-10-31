import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/saved_cart_action_scope.dart';

class SitMenuOption<T> {
  final IconData icon;
  final String label;
  final T value;
  const SitMenuOption(
      {required this.icon, required this.label, required this.value});
}

/// Shows a compact, modern SIT-style overflow menu anchored to the top-right
/// of the current page (below the app bar). Use instead of PopupMenuButton for
/// a glassy, vertical options list.
Future<T?> showSITOverflowMenu<T>(
  BuildContext context, {
  required List<SitMenuOption<T>> options,
  SavedCartActionScope? scope,
}) async {
  final media = MediaQuery.of(context);
  final topInset = media.padding.top;
  // AppBar default height (48..56). We try to land the menu right under it.
  final double appBarHeight = kToolbarHeight;

  RoutePageBuilder pageBuilder(ValueChanged<T?> complete) => (ctx, a1, a2) {
        return Stack(children: [
          // Blur the background just a touch to keep focus on the menu
          Positioned.fill(
            child: BackdropFilter(
              filter: ui.ImageFilter.blur(sigmaX: 2, sigmaY: 2),
              child: const SizedBox.shrink(),
            ),
          ),
          Positioned(
            right: 10,
            top: topInset + appBarHeight - 4,
            child: _SitMenuPanel<T>(options: options, complete: complete),
          ),
        ]);
      };
  Widget transitionBuilder(BuildContext ctx, Animation<double> anim,
      Animation<double> secondary, Widget child) {
    final t = Curves.easeOutCubic.transform(anim.value);
    return Opacity(
      opacity: anim.value,
      child: Transform.translate(
        offset: Offset(0, (1 - t) * -8),
        child: child,
      ),
    );
  }

  if (scope != null) {
    return scope.generalDialog<T>(
      context,
      pageBuilder: pageBuilder,
      barrierLabel: 'Menü',
      barrierColor: Colors.black.withValues(alpha: 0.35),
      transitionDuration: const Duration(milliseconds: 180),
      transitionBuilder: transitionBuilder,
    );
  }
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Menü',
    barrierColor: Colors.black.withValues(alpha: 0.35),
    transitionDuration: const Duration(milliseconds: 180),
    pageBuilder: pageBuilder(
        (value) => Navigator.of(context, rootNavigator: true).pop<T>(value)),
    transitionBuilder: transitionBuilder,
  );
}

class _SitMenuPanel<T> extends StatelessWidget {
  final List<SitMenuOption<T>> options;
  final ValueChanged<T?> complete;
  const _SitMenuPanel({required this.options, required this.complete});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: Colors.transparent,
      child: Container(
        width: 250,
        decoration: BoxDecoration(
          color: isDark
              ? const Color(0xFF0B1220).withValues(alpha: 0.92)
              : AppTheme.surfacePrimary(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.glassStroke(context)),
          boxShadow: AppTheme.cardShadow(context),
        ),
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (int i = 0; i < options.length; i++) ...[
              _SitMenuItem<T>(opt: options[i], complete: complete),
              if (i != options.length - 1)
                Divider(
                    height: 1,
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.06)
                        : const Color(0xFFE2E8F0)),
            ]
          ],
        ),
      ),
    );
  }
}

class _SitMenuItem<T> extends StatelessWidget {
  final SitMenuOption<T> opt;
  final ValueChanged<T?> complete;
  const _SitMenuItem({required this.opt, required this.complete});
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: () => complete(opt.value),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        child: Row(children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.08)
                  : AppTheme.surfaceSecondary(context),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(opt.icon,
                color:
                    isDark ? Colors.white70 : AppTheme.textSecondary(context),
                size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              opt.label,
              style: TextStyle(
                  color: isDark ? Colors.white : AppTheme.textPrimary(context),
                  fontWeight: FontWeight.w700),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ]),
      ),
    );
  }
}
