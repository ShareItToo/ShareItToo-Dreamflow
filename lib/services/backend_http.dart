import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb;
import 'package:http/http.dart' as http;

import 'backend_config.dart';

class BackendException implements Exception {
  final int statusCode;
  final String code;
  final Object? details;
  final int? retryAfterSeconds;

  const BackendException(
    this.statusCode,
    this.code, {
    this.details,
    this.retryAfterSeconds,
  });

  @override
  String toString() => 'BackendException($statusCode, $code)';
}

class BackendBinaryResponse {
  final Uint8List bytes;
  final Map<String, String> headers;

  const BackendBinaryResponse({required this.bytes, required this.headers});
}

class BackendJsonResponse {
  final int statusCode;
  final Map<String, dynamic> body;
  final Duration? retryAfter;

  const BackendJsonResponse({
    required this.statusCode,
    required this.body,
    this.retryAfter,
  });

  bool get isSuccess => statusCode >= 200 && statusCode < 300;
}

class BackendHttp {
  static Future<BackendBinaryResponse> requestBytes({
    required String path,
    required String accessToken,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final response = await http.get(
      BackendConfig.uri(path),
      headers: <String, String>{
        'Accept': 'text/html,application/octet-stream',
        'Authorization': 'Bearer $accessToken',
        if (!kIsWeb) 'User-Agent': 'ShareItToo (${defaultTargetPlatform.name})',
      },
    ).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      var code = 'request_failed';
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && decoded['error'] != null) {
          code = decoded['error'].toString();
        }
      } catch (_) {}
      throw BackendException(
        response.statusCode,
        code,
        retryAfterSeconds:
            _boundedRetryAfter(response.headers['retry-after'])?.inSeconds,
      );
    }
    return BackendBinaryResponse(
      bytes: response.bodyBytes,
      headers: Map<String, String>.from(response.headers),
    );
  }

  static Future<Map<String, dynamic>> requestJson({
    required String method,
    required String path,
    String? accessToken,
    Object? body,
    Map<String, String> additionalHeaders = const <String, String>{},
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final response = await requestJsonResponse(
      method: method,
      path: path,
      accessToken: accessToken,
      body: body,
      additionalHeaders: additionalHeaders,
      timeout: timeout,
    );
    if (!response.isSuccess) {
      throw BackendException(
        response.statusCode,
        response.body['error']?.toString() ?? 'request_failed',
        details: response.body['details'],
        retryAfterSeconds: response.retryAfter?.inSeconds,
      );
    }
    return response.body;
  }

  /// Returns status and bounded response headers so protocols with explicit
  /// 202/409/410 states can classify them without replaying a request.
  static Future<BackendJsonResponse> requestJsonResponse({
    required String method,
    required String path,
    String? accessToken,
    Object? body,
    Map<String, String> additionalHeaders = const <String, String>{},
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (accessToken != null && accessToken.isNotEmpty)
        'Authorization': 'Bearer $accessToken',
      if (!kIsWeb) 'User-Agent': 'ShareItToo (${defaultTargetPlatform.name})',
      ...additionalHeaders,
    };
    final encodedBody = body == null ? null : jsonEncode(body);
    final uri = BackendConfig.uri(path);

    late final http.Response response;
    switch (method.toUpperCase()) {
      case 'GET':
        response = await http.get(uri, headers: headers).timeout(timeout);
        break;
      case 'POST':
        response = await http
            .post(uri, headers: headers, body: encodedBody)
            .timeout(timeout);
        break;
      case 'PUT':
        response = await http
            .put(uri, headers: headers, body: encodedBody)
            .timeout(timeout);
        break;
      case 'PATCH':
        response = await http
            .patch(uri, headers: headers, body: encodedBody)
            .timeout(timeout);
        break;
      case 'DELETE':
        response = await http.delete(uri, headers: headers).timeout(timeout);
        break;
      default:
        throw ArgumentError.value(method, 'method', 'Unsupported HTTP method');
    }

    final retryAfter = _boundedRetryAfter(response.headers['retry-after']);
    Map<String, dynamic> decoded = <String, dynamic>{};
    if (response.body.trim().isNotEmpty) {
      try {
        final value = jsonDecode(response.body);
        if (value is Map) decoded = Map<String, dynamic>.from(value);
      } catch (_) {
        throw BackendException(
          response.statusCode,
          'invalid_server_response',
          retryAfterSeconds: retryAfter?.inSeconds,
        );
      }
    }

    return BackendJsonResponse(
      statusCode: response.statusCode,
      body: decoded,
      retryAfter: retryAfter,
    );
  }

  static Duration? _boundedRetryAfter(String? raw) {
    final seconds = int.tryParse(raw?.trim() ?? '');
    return seconds != null && seconds >= 1 && seconds <= 300
        ? Duration(seconds: seconds)
        : null;
  }
}
