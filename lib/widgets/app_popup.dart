import 'package:flutter/material.dart';
import 'dart:ui' as ui;
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

/// Unified popup and toast utilities to keep a consistent, modern glass style
/// across the entire app. Use these instead of SnackBar or small bottom sheets.
class AppPopup {
  /// Centered success feedback for short completed actions.
  static Future<void> success(
    BuildContext context, {
    required String title,
    String? message,
    TrackedDialogRouteHandle<void>? routeHandle,
  }) =>
      toast(
        context,
        icon: Icons.check_circle_outline_rounded,
        title: title,
        message: message,
        routeHandle: routeHandle,
      );

  /// Centered, persistent feedback for failures that need attention.
  static Future<void> error(
    BuildContext context, {
    required String title,
    String? message,
    TrackedDialogRouteHandle<void>? routeHandle,
  }) =>
      show(
        context,
        icon: Icons.error_outline_rounded,
        title: title,
        message: message,
        routeHandle: routeHandle,
      );

  /// Centered informational feedback for blocked or unavailable actions.
  static Future<void> info(
    BuildContext context, {
    required String title,
    String? message,
    TrackedDialogRouteHandle<void>? routeHandle,
  }) =>
      show(
        context,
        icon: Icons.info_outline_rounded,
        title: title,
        message: message,
        routeHandle: routeHandle,
      );

  /// Shows a lightweight anchored menu near the top-right (SIT style).
  /// Returns the selected value or null when dismissed.
  static Future<String?> showMenuActions(
    BuildContext context, {
    required List<({String value, IconData icon, String label, Color? color})>
        items,
  }) async {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final size = MediaQuery.of(context).size;
    // Anchor roughly to the top-right under the app bar
    final position = RelativeRect.fromLTRB(size.width - 8, kToolbarHeight + 8,
        8, size.height - kToolbarHeight - 8);

    return await showMenu<String>(
      context: context,
      position: position,
      color: isDark
          ? Colors.black.withValues(alpha: 0.92)
          : AppTheme.surfacePrimary(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: isDark
              ? Colors.white.withValues(alpha: 0.10)
              : cs.onSurface.withValues(alpha: 0.10),
        ),
      ),
      elevation: 0,
      items: [
        for (final it in items)
          PopupMenuItem<String>(
            value: it.value,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.06)
                      : AppTheme.surfaceSecondary(context),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.06)
                        : cs.onSurface.withValues(alpha: 0.08),
                  ),
                ),
                child: Icon(
                  it.icon,
                  size: 18,
                  color: it.color ??
                      (isDark ? Colors.white : AppTheme.textPrimary(context)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  it.label,
                  style: TextStyle(
                    color:
                        isDark ? Colors.white : AppTheme.textPrimary(context),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ]),
          ),
      ],
    );
  }

  /// Shows a centered glass dialog with optional actions.
  ///
  /// - icon: leading icon shown in a subtle circular badge
  /// - title: bold title
  /// - message: secondary text below the title
  /// - actions: optional row of action buttons (aligned to full width)
  static Future<void> show(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? message,
    List<Widget>? actions,
    bool barrierDismissible = true,
    // Optional richer styling
    Widget? leadingWidget,
    LinearGradient? accentGradient,
    Color? backgroundColor,
    Color? borderColor,
    bool useExploreBackground = false,
    // If true, the top-right close control is a plain icon (no red circle)
    bool plainCloseIcon = false,
    // New: allow hiding the close icon entirely
    bool showCloseIcon = true,
    // New: optional auto-close duration for standard popups
    Duration? autoCloseAfter,
    TrackedDialogRouteHandle<void>? routeHandle,
  }) async {
    final handle = routeHandle ?? TrackedDialogRouteHandle<void>();
    var closed = false;
    // Schedule auto-close if requested
    if (autoCloseAfter != null) {
      Future<void>.delayed(autoCloseAfter).then((_) {
        if (!closed) handle.dismiss();
      });
    }
    await showTrackedGeneralDialog<void>(
      context: context,
      handle: handle,
      barrierDismissible: barrierDismissible,
      barrierLabel: title,
      // Keep barrier technically transparent; we render our own dimming+blur layer
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (ctx, anim, secondaryAnim) {
        return Stack(children: [
          // True backdrop blur only (no dark scrim) so the page stays intact, just blurred
          Positioned.fill(
            child: IgnorePointer(
              ignoring: true,
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(color: Colors.transparent),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Material(
                    color: Colors.transparent,
                    child: _scrollableGlassCard(_GlassCard(
                      leadingIcon: icon,
                      leadingWidget: leadingWidget,
                      title: title,
                      message: message,
                      actions: actions,
                      onClose: handle.dismiss,
                      plainCloseIcon: plainCloseIcon,
                      showClose: showCloseIcon,
                      accentGradient: accentGradient,
                      backgroundColor: backgroundColor,
                      borderColor: borderColor,
                      useExploreBackground: useExploreBackground,
                    )),
                  ),
                ),
              ),
            ),
          ),
        ]);
      },
      transitionBuilder: (ctx, anim, secondary, child) {
        final t = Curves.easeOutCubic.transform(anim.value);
        return Opacity(
          opacity: anim.value,
          child: Transform.scale(
            scale: 0.96 + (0.04 * t),
            child: child,
          ),
        );
      },
    ).whenComplete(() => closed = true);
  }

  static Future<void> showLoginRequired(BuildContext context) async {
    // Replaced legacy centered dialog with the standard premium bottom sheet.
    await showGuestRestrictionSheet(context,
        gateContext: GuestGateContext.generic);
  }

  /// Lightweight variant that auto dismisses after [duration].
  /// Shows the same centered glass card but without actions and with no close icon.
  static Future<void> toast(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? message,
    Duration duration = const Duration(seconds: 2),
    // Optional richer styling
    Widget? leadingWidget,
    LinearGradient? accentGradient,
    Color? backgroundColor,
    Color? borderColor,
    bool useExploreBackground = false,
    TrackedDialogRouteHandle<void>? routeHandle,
  }) async {
    var closed = false;
    final handle = routeHandle ?? TrackedDialogRouteHandle<void>();
    Future<void>.delayed(duration).then((_) {
      if (!closed) handle.dismiss();
    });
    await showTrackedGeneralDialog<void>(
      context: context,
      handle: handle,
      barrierDismissible: true,
      barrierLabel: title,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (ctx, anim, secondaryAnim) {
        return Stack(children: [
          Positioned.fill(
            child: IgnorePointer(
              ignoring: true,
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(color: Colors.transparent),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 640),
                  child: Material(
                    color: Colors.transparent,
                    child: _scrollableGlassCard(_GlassCard(
                      leadingIcon: icon,
                      leadingWidget: leadingWidget,
                      title: title,
                      message: message,
                      // No actions and no explicit close button for toast
                      showClose: false,
                      accentGradient: accentGradient,
                      backgroundColor: backgroundColor,
                      borderColor: borderColor,
                      useExploreBackground: useExploreBackground,
                    )),
                  ),
                ),
              ),
            ),
          ),
        ]);
      },
      transitionBuilder: (ctx, anim, secondary, child) {
        final t = Curves.easeOutCubic.transform(anim.value);
        return Opacity(
          opacity: anim.value,
          child: Transform.scale(
            scale: 0.96 + (0.04 * t),
            child: child,
          ),
        );
      },
    ).whenComplete(() => closed = true);
  }

  /// Shows a centered glass dialog with arbitrary [body] content.
  /// Use for selection popups (e.g., Wunschlisten) that need custom widgets.
  static Future<T?> showCustom<T>(
    BuildContext context, {
    required IconData icon,
    required String title,
    required Widget body,
    bool barrierDismissible = true,
    // Optional: override the default leading icon with a custom widget
    Widget? leadingWidget,
    // Control close icon visibility; for selection popups we hide it
    bool showCloseIcon = false,
    // New: allow hiding the leading badge entirely
    bool showLeading = true,
    // New: allow disabling the blue accent line under the header
    bool showAccentLine = false,
    // New: customize the glass card background color
    Color? cardBackgroundColor,
    TrackedDialogRouteHandle<T>? routeHandle,
  }) async {
    final handle = routeHandle ?? TrackedDialogRouteHandle<T>();
    return showTrackedGeneralDialog<T>(
      context: context,
      handle: handle,
      barrierDismissible: barrierDismissible,
      barrierLabel: title,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (ctx, anim, secondaryAnim) {
        return Stack(children: [
          Positioned.fill(
            child: IgnorePointer(
              ignoring: true,
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 26, sigmaY: 26),
                // Pure blur without scrim to keep background visible
                child: Container(color: Colors.transparent),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Material(
                    color: Colors.transparent,
                    child: _scrollableGlassCard(_GlassCard(
                      leadingIcon: icon,
                      leadingWidget: leadingWidget,
                      title: title,
                      // Inject custom body
                      body: body,
                      onClose: handle.dismiss,
                      showClose: showCloseIcon,
                      // Add subtle brand accent to the leading badge (can be hidden via showAccentLine)
                      accentGradient: showAccentLine
                          ? LinearGradient(colors: [
                              Theme.of(ctx).colorScheme.primary,
                              Theme.of(ctx)
                                  .colorScheme
                                  .primary
                                  .withValues(alpha: 0.85),
                            ])
                          : null,
                      // Default custom dialogs to light surfaces in light theme and dark glass in dark theme
                      backgroundColor: cardBackgroundColor ??
                          (Theme.of(ctx).brightness == Brightness.dark
                              ? Colors.black.withValues(alpha: 0.60)
                              : AppTheme.surfacePrimary(ctx)),
                      showLeading: showLeading,
                    )),
                  ),
                ),
              ),
            ),
          ),
        ]);
      },
      transitionBuilder: (ctx, anim, secondary, child) {
        final t = Curves.easeOutCubic.transform(anim.value);
        return Opacity(
          opacity: anim.value,
          child: Transform.scale(
            scale: 0.96 + (0.04 * t),
            child: child,
          ),
        );
      },
    );
  }
}

Widget _scrollableGlassCard(Widget child) => SingleChildScrollView(
      primary: false,
      child: child,
    );

class _GlassCard extends StatelessWidget {
  final IconData? leadingIcon;
  final Widget? leadingWidget;
  final String title;
  final String? message;
  final List<Widget>? actions;
  final VoidCallback? onClose;
  final bool showClose;
  final bool plainCloseIcon;
  final LinearGradient? accentGradient;
  final Color? backgroundColor;
  final Color? borderColor;
  final bool useExploreBackground;
  final Widget? body;
  final bool showLeading;

  const _GlassCard({
    this.leadingIcon,
    this.leadingWidget,
    required this.title,
    this.message,
    this.actions,
    this.onClose,
    this.showClose = true,
    this.plainCloseIcon = false,
    this.accentGradient,
    this.backgroundColor,
    this.borderColor,
    this.useExploreBackground = false,
    this.body,
    this.showLeading = true,
  });

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(20);
    // Make the glass card itself more opaque for better readability on busy backdrops
    final baseColor = backgroundColor ??
        (useExploreBackground
            ? Colors.black.withValues(alpha: 0.28)
            : Colors.black.withValues(alpha: 0.58));
    final isLightCard =
        ThemeData.estimateBrightnessForColor(baseColor) == Brightness.light;
    final titleColor =
        isLightCard ? AppTheme.textPrimary(context) : Colors.white;
    final secondaryColor =
        isLightCard ? AppTheme.textSecondary(context) : Colors.white70;
    final borderClr = borderColor ??
        (isLightCard
            ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)
            : Colors.white.withValues(alpha: 0.16));
    final danger = Theme.of(context).colorScheme.error;
    return ClipRRect(
      borderRadius: radius,
      child: Stack(children: [
        if (useExploreBackground) ...[
          Positioned.fill(
            child: ImageFiltered(
              imageFilter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
              child:
                  Image.asset('assets/images/fulllogo.jpg', fit: BoxFit.cover),
            ),
          ),
          // Keep light cards bright; only darken dark cards for contrast
          Positioned.fill(
            child: Container(
              color: isLightCard
                  ? Colors.transparent
                  : Colors.black.withValues(alpha: 0.30),
            ),
          ),
        ],
        Container(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          decoration: BoxDecoration(
            color: baseColor,
            borderRadius: radius,
            border: Border.all(color: borderClr),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (showLeading) ...[
                    _buildLeading(context),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: Text(
                      title,
                      style: TextStyle(
                          color: titleColor,
                          fontWeight: FontWeight.w800,
                          fontSize: 16),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  if (showClose)
                    (plainCloseIcon
                        ? IconButton(
                            onPressed: onClose,
                            tooltip: 'Schließen',
                            icon: Icon(Icons.close,
                                size: 20, color: secondaryColor),
                            padding: const EdgeInsets.all(4),
                            splashRadius: 18,
                          )
                        : Semantics(
                            button: true,
                            label: 'Schließen',
                            child: InkResponse(
                              onTap: onClose,
                              radius: 18,
                              child: Container(
                                width: 30,
                                height: 30,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: danger,
                                  boxShadow: [
                                    BoxShadow(
                                      color: danger.withValues(alpha: 0.35),
                                      blurRadius: 12,
                                      spreadRadius: 0,
                                    ),
                                  ],
                                ),
                                child: const Center(
                                  child: Icon(Icons.close,
                                      color: Colors.white, size: 16),
                                ),
                              ),
                            ),
                          )),
                ],
              ),
              if (accentGradient != null) ...[
                const SizedBox(height: 8),
                Container(
                  height: 4,
                  decoration: BoxDecoration(
                    gradient: accentGradient,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ],
              if (message != null) ...[
                const SizedBox(height: 6),
                Text(message!,
                    style: TextStyle(color: secondaryColor, fontSize: 13)),
              ],
              if (body != null) ...[
                const SizedBox(height: 12),
                body!,
              ],
              if (actions != null && actions!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Row(children: [
                  for (int i = 0; i < actions!.length; i++) ...[
                    Expanded(child: actions![i]),
                    if (i != actions!.length - 1) const SizedBox(width: 8),
                  ]
                ]),
              ],
            ],
          ),
        ),
      ]),
    );
  }

  Widget _buildLeading(BuildContext context) {
    final baseColor = backgroundColor ??
        (useExploreBackground
            ? Colors.black.withValues(alpha: 0.28)
            : Colors.black.withValues(alpha: 0.58));
    final isLightCard =
        ThemeData.estimateBrightnessForColor(baseColor) == Brightness.light;
    final leadingBg = isLightCard
        ? AppTheme.surfaceSecondary(context)
        : Colors.white.withValues(alpha: 0.10);
    final leadingFg =
        isLightCard ? AppTheme.textPrimary(context) : Colors.white;
    if (leadingWidget != null) return leadingWidget!;
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: accentGradient,
        color: accentGradient == null ? leadingBg : null,
      ),
      child: Icon(leadingIcon ?? Icons.info_outline, color: leadingFg),
    );
  }
}
