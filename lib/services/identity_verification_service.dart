import 'dart:math';

import 'package:lendify/models/identity_verification.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';

class IdentityVerificationService {
  const IdentityVerificationService();

  static const consentVersion = 'sit-identity-test-consent-v1';

  bool get isAvailable => BackendConfig.enabled;

  Future<Map<String, dynamic>> _authorized(
    AuthSessionOwner owner, {
    required String method,
    required String path,
    Object? body,
    Map<String, String> headers = const <String, String>{},
  }) async {
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const IdentityVerificationException(409, 'principal_changed');
    }
    final token = await AuthService.accessTokenForOwner(owner);
    if (token == null || token.isEmpty) {
      throw const IdentityVerificationException(401, 'authentication_required');
    }
    try {
      final result = await BackendHttp.requestJson(
        method: method,
        path: path,
        accessToken: token,
        body: body,
        additionalHeaders: headers,
      );
      if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
        throw const IdentityVerificationException(409, 'principal_changed');
      }
      return result;
    } on BackendException catch (error) {
      throw IdentityVerificationException(error.statusCode, error.code);
    }
  }

  IdentityVerificationStatus _status(Object? raw) {
    return switch (raw) {
      'not_started' => IdentityVerificationStatus.notStarted,
      'requires_input' => IdentityVerificationStatus.requiresInput,
      'processing' => IdentityVerificationStatus.processing,
      'verified' => IdentityVerificationStatus.verified,
      'canceled' => IdentityVerificationStatus.canceled,
      'redacted' => IdentityVerificationStatus.redacted,
      _ => throw const IdentityVerificationException(
          502, 'invalid_identity_verification_status'),
    };
  }

  DateTime? _date(Object? raw) => raw is String ? DateTime.tryParse(raw) : null;

  String? _redactionStatus(Object? raw) {
    if (raw == null) return null;
    if (raw is! String ||
        !const {'queued', 'pending', 'processing', 'retry', 'redacted'}
            .contains(raw)) {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_redaction_status');
    }
    return raw;
  }

  IdentityVerificationState _state(Map<String, dynamic> response) {
    final status = _status(response['status']);
    final livemode = response['livemode'];
    if (livemode is! bool || livemode) {
      throw const IdentityVerificationException(
          502, 'identity_verification_live_mode');
    }
    final sessionId = response['sessionId'];
    if (sessionId != null && (sessionId is! String || sessionId.isEmpty)) {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_session');
    }
    final updatedAt = _date(response['updatedAt']);
    final redactionStatus = _redactionStatus(response['redactionStatus']);
    if (status == IdentityVerificationStatus.redacted &&
        redactionStatus != 'redacted') {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_redaction_state');
    }
    if (status != IdentityVerificationStatus.redacted &&
        redactionStatus == 'redacted') {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_redaction_state');
    }
    if (status == IdentityVerificationStatus.notStarted &&
        redactionStatus != null) {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_not_started_state');
    }
    if (status == IdentityVerificationStatus.notStarted &&
        (sessionId != null || updatedAt != null)) {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_not_started_state');
    }
    if (status != IdentityVerificationStatus.notStarted &&
        (sessionId is! String || sessionId.isEmpty || updatedAt == null)) {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_session_state');
    }
    return IdentityVerificationState(
      sessionId: sessionId as String?,
      status: status,
      livemode: livemode,
      updatedAt: updatedAt,
      redactionStatus: redactionStatus,
    );
  }

  /// Parses a server response using the same strict invariants as runtime calls.
  IdentityVerificationState parseResponse(Map<String, dynamic> response) =>
      _state(response);

  Future<IdentityVerificationState> getStatus(AuthSessionOwner owner) async {
    return _state(await _authorized(owner,
        method: 'GET', path: '/identity-verification/status'));
  }

  Future<IdentityVerificationSession> start({
    required AuthSessionOwner owner,
    required String idempotencyKey,
  }) async {
    final response = await _authorized(
      owner,
      method: 'POST',
      path: '/identity-verification/session',
      body: {
        'idempotencyKey': idempotencyKey,
        'consentVersion': consentVersion,
      },
      headers: {'Idempotency-Key': idempotencyKey},
    );
    return parseStartResponse(response);
  }

  /// Parses the server-authoritative start response, including the explicit
  /// local test-fixture exception for an in-app requires_input state without
  /// a provider URL. Production/provider responses must always carry a safe
  /// hosted entrypoint for requires_input.
  IdentityVerificationSession parseStartResponse(
      Map<String, dynamic> response) {
    final state = _state(response);
    final url = response['url'];
    if (url != null && (url is! String || !isSafeEntrypoint(url))) {
      throw const IdentityVerificationException(
          502, 'invalid_identity_verification_url');
    }
    if (url == null &&
        state.status == IdentityVerificationStatus.requiresInput &&
        response['testFixture'] != true) {
      throw const IdentityVerificationException(
          502, 'identity_verification_entrypoint_missing');
    }
    return IdentityVerificationSession(
      sessionId: state.sessionId,
      status: state.status,
      livemode: false,
      updatedAt: state.updatedAt,
      redactionStatus: state.redactionStatus,
      url: url as String?,
      replayed: response['replayed'] == true,
      resumed: response['resumed'] == true,
    );
  }

  static bool isSafeEntrypoint(String value) {
    final parsed = Uri.tryParse(value);
    return parsed != null &&
        parsed.scheme == 'https' &&
        parsed.host == 'verify.stripe.com' &&
        parsed.port == 443 &&
        parsed.userInfo.isEmpty;
  }

  Future<IdentityVerificationState> refresh(AuthSessionOwner owner) async {
    return _state(await _authorized(owner,
        method: 'POST', path: '/identity-verification/refresh'));
  }

  Future<IdentityVerificationState> revoke(AuthSessionOwner owner) async {
    return _state(await _authorized(owner,
        method: 'POST', path: '/identity-verification/revoke'));
  }

  static String newIdempotencyKey() {
    final random = Random.secure();
    final value = List<int>.generate(16, (_) => random.nextInt(256));
    return 'sit_identity_${value.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join()}';
  }
}
