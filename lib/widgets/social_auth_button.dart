import 'dart:ui';

import 'package:flutter/material.dart';

/// Social auth button in the SIT "glass" style.
///
enum SocialAuthBrand { google, apple, facebook }

class SocialAuthButton extends StatelessWidget {
  final SocialAuthBrand brand;
  final String label;
  final VoidCallback? onTap;
  const SocialAuthButton(
      {super.key,
      required this.brand,
      required this.label,
      required this.onTap});

  static const double _blurSigma = 4;
  static const double _tintOpacity = 0.18;
  static const double _strokeOpacity = 0.16;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (Widget leading, Color fg) = switch (brand) {
      SocialAuthBrand.google => (const _SocialGlyph(text: 'G'), Colors.white),
      SocialAuthBrand.apple => (
          const Icon(Icons.apple, color: Colors.white, size: 20),
          Colors.white
        ),
      SocialAuthBrand.facebook => (const _SocialGlyph(text: 'f'), Colors.white),
    };

    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      onTap: onTap,
      excludeSemantics: true,
      child: _Pressable(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: _blurSigma, sigmaY: _blurSigma),
            child: Container(
              height: 52,
              decoration: BoxDecoration(
                // Match the auth glass panels (same tint + stroke as the form card).
                color: Colors.black.withValues(alpha: _tintOpacity),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                    color: Colors.white.withValues(alpha: _strokeOpacity)),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(children: [
                leading,
                const SizedBox(width: 12),
                Expanded(
                    child: Text(label,
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w800,
                            color: fg))),
                Icon(Icons.arrow_forward_ios_rounded,
                    size: 14, color: Colors.white.withValues(alpha: 0.55)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class SocialAuthOrDivider extends StatelessWidget {
  const SocialAuthOrDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Auth screens render on top of imagery; keep divider white for readability.
    final line = Colors.white.withValues(alpha: 0.22);
    final label = Colors.white.withValues(alpha: 0.72);
    return Row(children: [
      Expanded(
        child: Container(
          height: 1,
          decoration: BoxDecoration(
            gradient:
                LinearGradient(colors: [line.withValues(alpha: 0.00), line]),
          ),
        ),
      ),
      const SizedBox(width: 10),
      Text('ODER',
          style: theme.textTheme.labelSmall?.copyWith(
              color: label, letterSpacing: 0.8, fontWeight: FontWeight.w800)),
      const SizedBox(width: 10),
      Expanded(
        child: Container(
          height: 1,
          decoration: BoxDecoration(
            gradient:
                LinearGradient(colors: [line, line.withValues(alpha: 0.00)]),
          ),
        ),
      ),
    ]);
  }
}

class _SocialGlyph extends StatelessWidget {
  final String text;
  const _SocialGlyph({required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: 22,
      height: 22,
      child: Center(
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              height: 1,
              color: Colors.white),
        ),
      ),
    );
  }
}

class _Pressable extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final BorderRadius borderRadius;
  const _Pressable(
      {required this.child, required this.onTap, required this.borderRadius});

  @override
  State<_Pressable> createState() => _PressableState();
}

class _PressableState extends State<_Pressable> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: enabled ? (_) => setState(() => _down = true) : null,
      onTapCancel: enabled ? () => setState(() => _down = false) : null,
      onTapUp: enabled ? (_) => setState(() => _down = false) : null,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOut,
        scale: _down ? 0.985 : 1.0,
        child: AnimatedOpacity(
            duration: const Duration(milliseconds: 140),
            opacity: enabled ? 1.0 : 0.55,
            child: widget.child),
      ),
    );
  }
}
