import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_svg/flutter_svg.dart';

/// Renders an SVG icon but removes likely background/frame `rect` elements
/// (e.g., full-canvas rectangles from exported screenshots) at runtime.
///
/// This avoids showing any solid background or border so the icon matches
/// outlined Material icons visually.
class SanitizedSvgIcon extends StatelessWidget {
  const SanitizedSvgIcon(
    this.assetPath, {
    super.key,
    this.size = 20,
    this.color,
    this.stripLightFills = false,
  });

  final String assetPath;
  final double size;
  final Color? color;
  final bool stripLightFills;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: FutureBuilder<String>(
        future: _loadAndSanitize(assetPath),
        builder: (context, snapshot) {
          if (snapshot.hasData) {
            return SvgPicture.string(
              snapshot.data!,
              width: size,
              height: size,
              fit: BoxFit.contain,
              colorFilter: color != null ? ColorFilter.mode(color!, BlendMode.srcIn) : null,
            );
          }
          if (snapshot.hasError) {
            debugPrint('SanitizedSvgIcon: failed to load $assetPath: ${snapshot.error}');
          }
          // Fallback: render original asset if sanitization/async load fails
          return SvgPicture.asset(
            assetPath,
            width: size,
            height: size,
            fit: BoxFit.contain,
            colorFilter: color != null ? ColorFilter.mode(color!, BlendMode.srcIn) : null,
          );
        },
      ),
    );
  }

  Future<String> _loadAndSanitize(String path) async {
    try {
      final raw = await rootBundle.loadString(path);
      var sanitized = _removeLargeBackgroundRects(raw);
      if (stripLightFills) {
        sanitized = _removeLightFillPaths(sanitized);
      }
      return sanitized;
    } catch (e) {
      debugPrint('SanitizedSvgIcon: error loading $path: $e');
      rethrow;
    }
  }

  // Heuristic remover: strips <rect> elements that likely act as full-canvas
  // backgrounds/frames based on size relative to the SVG viewBox.
  String _removeLargeBackgroundRects(String svg) {
    try {
      final viewBoxMatch = RegExp(r'viewBox\s*=\s*"([\d\.-]+)\s+([\d\.-]+)\s+([\d\.-]+)\s+([\d\.-]+)"', caseSensitive: false).firstMatch(svg);
      double vbW = 0, vbH = 0;
      if (viewBoxMatch != null) {
        vbW = double.tryParse(viewBoxMatch.group(3) ?? '0') ?? 0;
        vbH = double.tryParse(viewBoxMatch.group(4) ?? '0') ?? 0;
      }

      String sanitized = svg;

      // 1) Remove any rects with 100% width/height (typical exported backgrounds)
      sanitized = sanitized.replaceAll(RegExp(r'<rect[^>]*?width\s*=\s*"100%"[^>]*?>[\s\S]*?<\/rect>', caseSensitive: false), '');
      sanitized = sanitized.replaceAll(RegExp(r'<rect[^>]*?height\s*=\s*"100%"[^>]*?>[\s\S]*?<\/rect>', caseSensitive: false), '');
      sanitized = sanitized.replaceAllMapped(RegExp(r'<rect[^>]*/>', caseSensitive: false), (Match m) {
        final tag = m.group(0)!;
        if (tag.contains('width="100%"') || tag.contains('height="100%"')) return '';
        return tag;
      });

      if (vbW > 0 && vbH > 0) {
        // 2) Remove rects that cover >= 90% of the viewBox on both axes.
        final rectRegex = RegExp(r'<rect[^>]*>', multiLine: true, caseSensitive: false);
        sanitized = sanitized.replaceAllMapped(rectRegex, (match) {
          final tag = match.group(0)!;
          final widthMatch = RegExp(r'width\s*=\s*"([\d\.]+)').firstMatch(tag);
          final heightMatch = RegExp(r'height\s*=\s*"([\d\.]+)').firstMatch(tag);
          final xMatch = RegExp(r'x\s*=\s*"([\d\.-]+)').firstMatch(tag);
          final yMatch = RegExp(r'y\s*=\s*"([\d\.-]+)').firstMatch(tag);
          final fillMatch = RegExp(r'fill\s*=\s*"([^"\s]+)').firstMatch(tag);
          final strokeMatch = RegExp(r'stroke\s*=\s*"([^"\s]+)').firstMatch(tag);

          final w = double.tryParse(widthMatch?.group(1) ?? '');
          final h = double.tryParse(heightMatch?.group(1) ?? '');
          final x = double.tryParse(xMatch?.group(1) ?? '0') ?? 0;
          final y = double.tryParse(yMatch?.group(1) ?? '0') ?? 0;

          final coversCanvas = (w != null && h != null && w >= vbW * 0.9 && h >= vbH * 0.9 && x.abs() <= vbW * 0.05 && y.abs() <= vbH * 0.05);
          final isSolidBg = (fillMatch != null && fillMatch.group(1) != null && fillMatch.group(1)!.toLowerCase() != 'none');
          final isJustBorder = (strokeMatch != null && (fillMatch == null || fillMatch.group(1)!.toLowerCase() == 'none'));

          // Remove solid backgrounds or full-canvas borders
          if (coversCanvas && (isSolidBg || isJustBorder)) {
            return '';
          }
          return tag;
        });
      }

      return sanitized;
    } catch (e) {
      debugPrint('SanitizedSvgIcon: sanitization failed: $e');
      return svg; // fall back to original if something goes wrong
    }
  }

  // Additional filter: strip paths that are likely canvas backgrounds
  // (very light fills such as white/near-white). This is opt-in so other
  // icons remain unaffected.
  String _removeLightFillPaths(String svg) {
    try {
      const lightHexes = [
        '#FFFFFF',
        '#FFF',
        '#FEFEFE',
        '#FEFDFD',
        '#FDFDFD',
        '#F9FCFD',
        '#F4F3F3',
        '#F3F3F3',
        '#F4F3F2',
      ];

      var sanitized = svg;
      for (final hex in lightHexes) {
        final escaped = hex.replaceAll('#', r'\#');
        final selfClosing = RegExp(
          '<path[^>]*fills*=s*"$escaped"[^>]*?/s*>',
          caseSensitive: false,
          multiLine: true,
        );
        final block = RegExp(
          '<path[^>]*fills*=s*"$escaped"[^>]*?>[sS]*?</path>',
          caseSensitive: false,
          multiLine: true,
        );
        sanitized = sanitized.replaceAll(selfClosing, '');
        sanitized = sanitized.replaceAll(block, '');
      }

      // Generic catch for literal "white"
      sanitized = sanitized.replaceAll(
        RegExp(
          '<path[^>]*fills*=s*"s*whites*"[^>]*?>[sS]*?</path>',
          caseSensitive: false,
          multiLine: true,
        ),
        '',
      );
      sanitized = sanitized.replaceAll(
        RegExp(
          '<path[^>]*fills*=s*"s*whites*"[^>]*?/s*>',
          caseSensitive: false,
          multiLine: true,
        ),
        '',
      );

      return sanitized;
    } catch (e) {
      debugPrint('SanitizedSvgIcon: light fill strip failed: $e');
      return svg;
    }
  }
}
