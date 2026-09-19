import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/background_theme_service.dart';

class BrandColors {
  static const logoGradientStart = Color(0xFF5868A9);
  static const logoGradientEnd = Color(0xFF6E2B74);
  static const logoAccent = Color(0xFFFFB277);

  // App background gradient (legacy fallback)
  static const appBlueTop = Color(0xFF0B1421);
  static const appBlueBottom = Color(0xFF060A12);

  static const goldLine = Color(0xFFFFD56E);
  static const goldShadow = Color(0xFF8C6A1F);

  static const inactiveNav = Color(0xFF94A3B8);

  static const primary = Color(0xFF0EA5E9);
  static const success = Color(0xFF22C55E);
  static const danger = Color(0xFFF43F5E);
  static const highlight = Color(0xFFFB923C);

  // Premium surfaces
  static const glassSurface = Color(0xFF0B1220);
  static const glassStroke = Color(0x14FFFFFF);
  static const imageScrim = Color(0xCC000000);

  // Social brand colors
  static const xBlue =
      Color(0xFF1DA1F2); // X/Twitter legacy blue for recognizability
  static const instagram = Color(0xFFE1306C);
  static const facebook = Color(0xFF1877F2);
  static const tiktok = Color(0xFFEE1D52);
}

class AppTheme {
  static bool isDark(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark;

  static Color textPrimary(BuildContext context) =>
      isDark(context) ? Colors.white : const Color(0xFF111111);
  static Color textBody(BuildContext context) =>
      isDark(context) ? const Color(0xFFE5E7EB) : const Color(0xFF1F2937);
  static Color textSecondary(BuildContext context) =>
      isDark(context) ? Colors.white70 : const Color(0xFF334155);
  static Color textDisabled(BuildContext context) =>
      isDark(context) ? Colors.white38 : const Color(0xFF64748B);
  static Color navInactive(BuildContext context) =>
      isDark(context) ? BrandColors.inactiveNav : const Color(0xFF334155);

  static Color surfacePrimary(BuildContext context) => isDark(context)
      ? BrandColors.glassSurface.withValues(alpha: 0.55)
      : Colors.white.withValues(alpha: 0.96);
  static Color surfaceSecondary(BuildContext context) => isDark(context)
      ? Colors.white.withValues(alpha: 0.06)
      : Colors.white.withValues(alpha: 0.98);
  static Color surfaceMuted(BuildContext context) => isDark(context)
      ? Colors.white.withValues(alpha: 0.02)
      : const Color(0xFFF1F5F9).withValues(alpha: 0.98);
  static Color glassSurface(BuildContext context) => isDark(context)
      ? BrandColors.glassSurface.withValues(alpha: 0.55)
      : const Color(0xFFF8FAFC).withValues(alpha: 0.94);
  static Color glassStroke(BuildContext context) => isDark(context)
      ? BrandColors.glassStroke
      : BrandColors.primary.withValues(alpha: 0.22);
  static Color imageScrim(BuildContext context) => isDark(context)
      ? BrandColors.imageScrim.withValues(alpha: 0.55)
      : Colors.white.withValues(alpha: 0.08);
  static Color searchBorder(BuildContext context) =>
      isDark(context) ? Colors.white : BrandColors.primary;
  static Color categoryCircleFill(BuildContext context,
          {required bool active}) =>
      isDark(context)
          ? Colors.white.withValues(alpha: 0.03)
          : Colors.white.withValues(alpha: 0.98);
  static Color categoryCircleBorder(BuildContext context,
          {required bool active}) =>
      isDark(context)
          ? (active
              ? BrandColors.primary
              : Colors.white.withValues(alpha: 0.14))
          : BrandColors.primary;
  static List<BoxShadow> cardShadow(BuildContext context) => [
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark(context) ? 0.16 : 0.08),
          blurRadius: isDark(context) ? 16 : 14,
          offset: const Offset(0, 6),
        ),
      ];
}

class AppTypography {
  static TextTheme textTheme(BuildContext context, {required bool isDark}) {
    final primary = isDark ? Colors.white : const Color(0xFF111111);
    // Keep release typography fully offline. Runtime web-font downloads can
    // fail during startup and must never be able to crash the marketplace.
    final base = Theme.of(context)
        .textTheme
        .apply(bodyColor: primary, displayColor: primary);
    const h = 1.25;
    return base.copyWith(
      titleLarge: base.titleLarge?.copyWith(
          fontSize: 18, height: h, fontWeight: FontWeight.w700, color: primary),
      titleMedium: base.titleMedium?.copyWith(
          fontSize: 16, height: h, fontWeight: FontWeight.w600, color: primary),
      bodyMedium: base.bodyMedium?.copyWith(
          fontSize: 13, height: h, fontWeight: FontWeight.w500, color: primary),
      bodySmall: base.bodySmall?.copyWith(
          fontSize: 12, height: h, fontWeight: FontWeight.w500, color: primary),
      labelSmall: base.labelSmall?.copyWith(
          fontSize: 11, height: h, fontWeight: FontWeight.w600, color: primary),
    );
  }
}

Gradient get appBackgroundGradient => const LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [BrandColors.appBlueTop, BrandColors.appBlueBottom]);

ThemeData buildLightTheme(BuildContext context) {
  final base = ThemeData(useMaterial3: true, brightness: Brightness.light);
  final text = AppTypography.textTheme(context, isDark: false);
  return base.copyWith(
    colorScheme: base.colorScheme.copyWith(
      primary: BrandColors.primary,
      secondary: const Color(0xFF111827),
      tertiary: BrandColors.success,
      error: BrandColors.danger,
      // Use dark surface with white foreground to match our global dark backdrop
      surface: const Color(0xFFFFFFFF),
      onSurface: const Color(0xFF0F172A),
      onSurfaceVariant: const Color(0xFF334155),
    ),
    scaffoldBackgroundColor: Colors.transparent,
    appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: Color(0xFF111111),
        elevation: 0,
        centerTitle: false),
    listTileTheme: const ListTileThemeData(
        iconColor: Color(0xFF0F172A), textColor: Color(0xFF0F172A)),
    iconTheme: const IconThemeData(color: Color(0xFF0F172A)),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: Colors.transparent,
      selectedItemColor: BrandColors.primary,
      unselectedItemColor: Color(0xFF334155),
      selectedIconTheme: IconThemeData(color: BrandColors.primary),
      unselectedIconTheme: IconThemeData(color: Color(0xFF334155)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xF5FFFFFF),
      hintStyle:
          text.bodyMedium?.copyWith(color: AppTheme.textSecondary(context)),
      labelStyle: text.bodyMedium?.copyWith(color: AppTheme.textBody(context)),
      prefixIconColor: BrandColors.primary,
      suffixIconColor: AppTheme.textSecondary(context),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: BrandColors.primary, width: 1.2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: BrandColors.primary, width: 1.2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: BrandColors.primary, width: 1.5),
      ),
    ),
    textTheme: text,
  );
}

ThemeData buildDarkTheme(BuildContext context) {
  final base = ThemeData(useMaterial3: true, brightness: Brightness.dark);
  final text = AppTypography.textTheme(context, isDark: true);
  return base.copyWith(
    colorScheme: base.colorScheme.copyWith(
      primary: BrandColors.primary,
      secondary: const Color(0xFFE5E7EB),
      tertiary: BrandColors.success,
      error: BrandColors.danger,
      surface: const Color(0xFF0F172A),
      onSurface: const Color(0xFFE5E7EB),
    ),
    scaffoldBackgroundColor: Colors.transparent,
    appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false),
    listTileTheme: const ListTileThemeData(
        iconColor: Colors.white, textColor: Colors.white),
    iconTheme: const IconThemeData(color: Colors.white),
    textTheme: text,
  );
}

class GradientIcon extends StatelessWidget {
  final IconData icon;
  final double size;
  const GradientIcon(this.icon, {super.key, this.size = 22});
  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      shaderCallback: (Rect bounds) =>
          appBackgroundGradient.createShader(bounds),
      child: Icon(icon, size: size, color: Colors.white),
    );
  }
}

class AppGradientBackground extends StatelessWidget {
  final Widget child;
  const AppGradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final brightness = MediaQuery.platformBrightnessOf(context);
    final backgroundTheme = context.watch<BackgroundThemeController>();
    final choice = backgroundTheme.effectiveChoice(brightness);

    return Stack(
      children: [
        Positioned.fill(
          child: ImageFiltered(
            imageFilter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: Image.asset(choice.assetPath, fit: BoxFit.cover),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: (choice.family == Brightness.dark
                      ? Colors.black
                      : Colors.white)
                  .withValues(alpha: choice.overlayOpacity),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

class HoverScale extends StatefulWidget {
  final Widget child;
  final double scale;
  final Duration duration;
  const HoverScale(
      {super.key,
      required this.child,
      this.scale = 1.07,
      this.duration = const Duration(milliseconds: 180)});
  @override
  State<HoverScale> createState() => _HoverScaleState();
}

class _HoverScaleState extends State<HoverScale> {
  bool _hovering = false;
  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: AnimatedScale(
          scale: _hovering ? widget.scale : 1.0,
          duration: widget.duration,
          curve: Curves.easeOut,
          child: widget.child),
    );
  }
}
