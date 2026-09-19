import 'dart:convert';
import 'dart:typed_data';
import 'dart:io' show File;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';

/// AppImage renders policy-approved URLs, data: URIs, and local file paths.
/// Signed releases fetch only authenticated SIT-managed image URLs and fall
/// back without a request for every unapproved or malformed source.
class AppImage extends StatelessWidget {
  /// Source URL/path. Can be null/invalid when coming from older local storage
  /// entries on web (which may surface as JS `undefined`).
  final String? url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final Widget? fallback;

  const AppImage(
      {super.key,
      required this.url,
      this.fit = BoxFit.cover,
      this.width,
      this.height,
      this.borderRadius,
      this.fallback});

  Widget _fallback() => fallback ?? const ColoredBox(color: Color(0x14000000));

  @override
  Widget build(BuildContext context) {
    Widget child = _buildInner();
    if (borderRadius != null) {
      child = ClipRRect(borderRadius: borderRadius!, child: child);
    }
    if (width != null || height != null) {
      child = SizedBox(width: width, height: height, child: child);
    }
    return child;
  }

  Widget _buildInner() {
    final src = (url ?? '').trim();
    if (src.isEmpty) {
      return _fallback();
    }
    if (src.startsWith('http')) {
      if (BackendConfig.isManagedImageUrl(src)) {
        return _ManagedNetworkImage(url: src, fit: fit, fallback: fallback);
      }
      if (!BackendConfig.isPermittedRuntimeImageUrl(src)) {
        return _fallback();
      }
      return Image.network(
        src,
        fit: fit,
        errorBuilder: (_, __, ___) => _fallback(),
      );
    }
    if (src.startsWith('data:image')) {
      try {
        final comma = src.indexOf(',');
        if (comma > 0) {
          final b64 = src.substring(comma + 1);
          final bytes = base64Decode(b64);
          return Image.memory(Uint8List.fromList(bytes), fit: fit);
        }
      } catch (_) {}
      return _fallback();
    }
    // File paths: only supported on non-web platforms
    if (!kIsWeb && (src.startsWith('/') || src.startsWith('file:'))) {
      try {
        final path =
            src.startsWith('file:') ? src.replaceFirst('file://', '') : src;
        return Image.file(File(path), fit: fit);
      } catch (_) {
        return _fallback();
      }
    }
    // Unknown schemes are never interpreted as network locations.
    return _fallback();
  }
}

class _ManagedNetworkImage extends StatefulWidget {
  final String url;
  final BoxFit fit;
  final Widget? fallback;

  const _ManagedNetworkImage({
    required this.url,
    required this.fit,
    this.fallback,
  });

  @override
  State<_ManagedNetworkImage> createState() => _ManagedNetworkImageState();
}

class _ManagedNetworkImageState extends State<_ManagedNetworkImage> {
  late Future<String?> _accessToken;

  @override
  void initState() {
    super.initState();
    _accessToken = _loadAccessToken();
  }

  @override
  void didUpdateWidget(covariant _ManagedNetworkImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _accessToken = _loadAccessToken();
    }
  }

  Future<String?> _loadAccessToken() {
    return AuthService.accessToken();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: _accessToken,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return widget.fallback ?? const ColoredBox(color: Color(0x14000000));
        }
        final token = snapshot.data;
        return Image.network(
          widget.url,
          fit: widget.fit,
          headers: token == null || token.isEmpty
              ? null
              : <String, String>{'Authorization': 'Bearer $token'},
          errorBuilder: (_, __, ___) =>
              widget.fallback ?? const ColoredBox(color: Color(0x14000000)),
        );
      },
    );
  }
}
