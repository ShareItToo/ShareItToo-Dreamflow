import 'dart:async';

import 'backend_http.dart';

typedef AppleWebV2Request = Future<BackendJsonResponse> Function(
    Map<String, dynamic> body);

class AppleWebV2Material {
  final String _authorizationCode;
  final Future<String> Function() _readFreshFirebaseIdToken;

  const AppleWebV2Material({
    required String authorizationCode,
    required Future<String> Function() readFreshFirebaseIdToken,
  })  : _authorizationCode = authorizationCode,
        _readFreshFirebaseIdToken = readFreshFirebaseIdToken;

  Future<String> readFreshFirebaseIdToken() => _readFreshFirebaseIdToken();

  Map<String, dynamic> acquireBody({
    required String idToken,
    required String requestId,
  }) =>
      {
        'idToken': idToken,
        'appleAuth': {
          'version': 2,
          'operation': 'acquire',
          'requestId': requestId,
          'authorizationCode': _authorizationCode,
        },
      };

  @override
  String toString() => 'AppleWebV2Material(redacted)';
}

class AppleWebV2Failure implements Exception {
  final String code;
  final int? statusCode;

  const AppleWebV2Failure(this.code, {this.statusCode});

  @override
  String toString() => 'AppleWebV2Failure($code)';
}

class _AppleProjection {
  final String receipt;
  final String state;
  final DateTime expiresAt;

  const _AppleProjection(this.receipt, this.state, this.expiresAt);
}

/// Consumes a single Apple authorization code through the server-owned v2
/// protocol. The acquire command is never replayed. An uncertain acquire is
/// recovered only through status reads; uncertain session delivery is replaced
/// with a fresh delivery ID, allowing the backend to revoke its predecessor.
Future<Map<String, dynamic>> exchangeAppleWebV2({
  required AppleWebV2Material material,
  required AppleWebV2Request request,
  required String Function() createOpaqueId,
  required void Function() requireCurrent,
  Future<void> Function(Duration duration) delay = Future<void>.delayed,
  DateTime Function() now = DateTime.now,
  List<Duration> statusBackoff = const [
    Duration(seconds: 2),
    Duration(seconds: 4),
    Duration(seconds: 8),
    Duration(seconds: 30),
  ],
  Duration maxElapsed = const Duration(seconds: 90),
}) async {
  final deadline = now().toUtc().add(maxElapsed);
  Duration remaining() => deadline.difference(now().toUtc());
  void requireWithinDeadline() {
    if (remaining() <= Duration.zero) {
      throw const AppleWebV2Failure('apple_ownership_deadline_elapsed');
    }
  }

  Future<T> bounded<T>(Future<T> Function() operation) async {
    requireWithinDeadline();
    return operation().timeout(remaining(), onTimeout: () {
      throw const AppleWebV2Failure('apple_ownership_deadline_elapsed');
    });
  }

  Future<void> wait(Duration duration) async {
    requireCurrent();
    requireWithinDeadline();
    if (duration >= remaining()) {
      throw const AppleWebV2Failure('apple_ownership_deadline_elapsed');
    }
    await delay(duration);
    requireCurrent();
    requireWithinDeadline();
  }

  requireCurrent();
  final requestId = _opaqueId(createOpaqueId(), 'invalid_apple_request_id');
  _AppleProjection? projection;
  Duration? acquireRetryAfter;
  try {
    final token = await _freshToken(material, requireCurrent);
    final response = await bounded(() => request(
          material.acquireBody(idToken: token, requestId: requestId),
        ));
    requireCurrent();
    projection = _projectionFrom(response, now());
    acquireRetryAfter = response.retryAfter;
    if (projection.state != 'pending' && projection.state != 'ready') {
      throw const AppleWebV2Failure('invalid_apple_ownership_response');
    }
  } on AppleWebV2Failure {
    rethrow;
  } on BackendException {
    rethrow;
  } on Object {
    // The provider may already have consumed the code. Never replay acquire.
    requireCurrent();
  }

  var lookup = <String, dynamic>{'requestId': requestId};
  Duration? requestedDelay = acquireRetryAfter;
  if (projection != null) {
    lookup = <String, dynamic>{'receipt': projection.receipt};
  }
  for (final backoff in statusBackoff) {
    if (projection != null && projection.state == 'ready') break;
    if (projection != null && projection.state != 'pending') {
      throw AppleWebV2Failure('apple_ownership_${projection.state}');
    }
    final waitFor = requestedDelay != null && requestedDelay > backoff
        ? requestedDelay
        : backoff;
    requestedDelay = null;
    await wait(waitFor);
    try {
      final token = await _freshToken(material, requireCurrent);
      final response = await bounded(() => request({
            'idToken': token,
            'appleAuth': {
              'version': 2,
              'operation': 'status',
              ...lookup,
            },
          }));
      requireCurrent();
      if (response.statusCode == 429) {
        requestedDelay = response.retryAfter;
        continue;
      }
      projection = _projectionFrom(response, now());
      requestedDelay = response.retryAfter;
      lookup = <String, dynamic>{'receipt': projection.receipt};
    } on BackendException catch (error) {
      if (error.code != 'invalid_server_response') rethrow;
      // A response parse failure consumes this status slot. The code-bearing
      // acquire command remains single-shot.
    } on AppleWebV2Failure catch (error) {
      if (error.code == 'apple_ownership_deadline_elapsed') rethrow;
      // Invalid/non-projecting status response consumes one bounded slot.
    } on TimeoutException {
      // Transport uncertainty consumes one bounded status slot.
    } on Object {
      requireCurrent();
      // Other transport failures consume one bounded status slot too.
    }
  }
  final readyProjection = projection;
  if (readyProjection == null || readyProjection.state != 'ready') {
    throw AppleWebV2Failure(
      readyProjection == null
          ? 'apple_ownership_status_unavailable'
          : 'apple_ownership_${readyProjection.state}',
    );
  }

  Object? lastUncertain;
  for (var generation = 0; generation < 3; generation += 1) {
    requireCurrent();
    final deliveryId = _opaqueId(createOpaqueId(), 'invalid_apple_delivery_id');
    try {
      final token = await _freshToken(material, requireCurrent);
      final response = await bounded(() => request({
            'idToken': token,
            'appleAuth': {
              'version': 2,
              'operation': 'session',
              'receipt': readyProjection.receipt,
              'deliveryId': deliveryId,
            },
          }));
      if (response.statusCode == 200 || response.statusCode == 202) {
        _validateDeliveredResponse(response.body, readyProjection.receipt);
        final mfa = response.body['mfaRequired'] == true;
        if ((mfa && response.statusCode != 202) ||
            (!mfa && response.statusCode != 200)) {
          throw const AppleWebV2Failure('invalid_apple_session_response');
        }
        // The caller owns the post-response currentness check and exact remote
        // session cleanup; returning first preserves the response for cleanup.
        return response.body;
      }
      final code = _errorCode(response);
      if (response.statusCode == 409 &&
          code == 'apple_session_delivery_uncertain') {
        lastUncertain = BackendException(response.statusCode, code);
        continue;
      }
      throw BackendException(response.statusCode, code,
          details: response.body['details']);
    } on BackendException catch (error) {
      if (error.statusCode == 409 &&
          error.code == 'apple_session_delivery_uncertain') {
        lastUncertain = error;
        continue;
      }
      rethrow;
    } on AppleWebV2Failure {
      rethrow;
    } on Object catch (error) {
      // Unknown delivery outcome: a new ID asks the backend to supersede any
      // prior session or MFA challenge. Never repeat the same delivery ID.
      lastUncertain = error;
    }
  }
  throw AppleWebV2Failure(
    lastUncertain == null
        ? 'apple_session_delivery_unavailable'
        : 'apple_session_delivery_uncertain',
  );
}

Future<String> _freshToken(
  AppleWebV2Material material,
  void Function() requireCurrent,
) async {
  requireCurrent();
  final token = (await material.readFreshFirebaseIdToken()).trim();
  requireCurrent();
  if (token.length < 100 || token.length > 12000) {
    throw const AppleWebV2Failure('missing_firebase_id_token');
  }
  return token;
}

String _opaqueId(String value, String code) {
  if (!RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(value)) {
    throw AppleWebV2Failure(code);
  }
  return value;
}

_AppleProjection _projectionFrom(
  BackendJsonResponse response,
  DateTime now,
) {
  final raw = response.body['appleAuth'];
  if (raw is! Map ||
      raw.length != 4 ||
      raw['version'] != 2 ||
      !const {'pending', 'ready', 'unresolved', 'cleanup_required', 'closed'}
          .contains(raw['state'])) {
    if (!response.isSuccess) {
      throw BackendException(response.statusCode, _errorCode(response),
          details: response.body['details']);
    }
    throw const AppleWebV2Failure('invalid_apple_ownership_response');
  }
  final receipt = raw['receipt']?.toString() ?? '';
  final expiresAt = DateTime.tryParse(raw['expiresAt']?.toString() ?? '');
  final expectedStatus = switch (raw['state']) {
    'pending' => 202,
    'ready' => 200,
    'closed' => 410,
    'unresolved' || 'cleanup_required' => 409,
    _ => -1,
  };
  if (!RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(receipt) ||
      expiresAt == null ||
      !expiresAt.toUtc().isAfter(now.toUtc()) ||
      response.statusCode != expectedStatus) {
    throw const AppleWebV2Failure('invalid_apple_ownership_response');
  }
  return _AppleProjection(receipt, raw['state'] as String, expiresAt.toUtc());
}

void _validateDeliveredResponse(
    Map<String, dynamic> body, String expectedReceipt) {
  final projection = body['appleAuth'];
  if (projection is! Map ||
      projection['version'] != 2 ||
      projection['state'] != 'ready' ||
      projection['receipt'] != expectedReceipt) {
    throw const AppleWebV2Failure('invalid_apple_session_response');
  }
  final session = body['session'];
  final challenge = body['mfaChallenge'];
  final hasSession = session is Map;
  final hasMfa = body['mfaRequired'] == true &&
      challenge is String &&
      challenge.length >= 32 &&
      challenge.length <= 200;
  if (hasSession == hasMfa) {
    throw const AppleWebV2Failure('invalid_apple_session_response');
  }
}

String _errorCode(BackendJsonResponse response) =>
    response.body['error']?.toString() ?? 'request_failed';
