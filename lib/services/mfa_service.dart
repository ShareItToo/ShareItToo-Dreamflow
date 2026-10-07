import 'package:lendify/models/mfa.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';

/// Server-authoritative MFA management. Secrets and codes remain in memory
/// only; this service never writes or logs them.
class MfaService {
  const MfaService();

  bool get isAvailable => BackendConfig.enabled;

  Future<Map<String, dynamic>> _authorized(
    AuthSessionOwner owner, {
    required String method,
    required String path,
    Object? body,
  }) async {
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const MfaException(409, 'principal_changed');
    }
    final token = await AuthService.accessTokenForOwner(owner);
    if (token == null || token.isEmpty) {
      throw const MfaException(401, 'authentication_required');
    }
    try {
      final response = await BackendHttp.requestJson(
        method: method,
        path: path,
        accessToken: token,
        body: body,
      );
      if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
        throw const MfaException(409, 'principal_changed');
      }
      return response;
    } on BackendException catch (error) {
      throw MfaException(error.statusCode, error.code);
    }
  }

  Future<MfaStatus> getStatus(AuthSessionOwner owner) async {
    final response =
        await _authorized(owner, method: 'GET', path: '/auth/mfa/status');
    final enabled = response['enabled'];
    final pending = response['pending'];
    final remaining = response['recoveryCodesRemaining'];
    if (enabled is! bool ||
        pending is! bool ||
        remaining is! num ||
        remaining < 0 ||
        remaining > 20) {
      throw const MfaException(502, 'invalid_mfa_status');
    }
    return MfaStatus(
      enabled: enabled,
      pending: pending,
      recoveryCodesRemaining: remaining.toInt(),
    );
  }

  Future<MfaEnrollment> beginEnrollment({
    required AuthSessionOwner owner,
    required String idempotencyKey,
    String? currentPassword,
    String? reauthSocialIdToken,
  }) async {
    final response = await _authorized(
      owner,
      method: 'POST',
      path: '/auth/mfa/enroll',
      body: {
        'idempotencyKey': idempotencyKey,
        if (currentPassword != null) 'currentPassword': currentPassword,
        if (reauthSocialIdToken != null)
          'reauthSocialIdToken': reauthSocialIdToken,
      },
    );
    final secret = response['secret']?.toString() ?? '';
    final uri = response['otpauthUrl']?.toString() ?? '';
    if (!RegExp(r'^[A-Z2-7]{16,64}$').hasMatch(secret) ||
        !uri.startsWith('otpauth://totp/')) {
      throw const MfaException(502, 'invalid_mfa_enrollment');
    }
    return MfaEnrollment(secret: secret, otpauthUrl: uri);
  }

  Future<List<String>> confirmEnrollment({
    required AuthSessionOwner owner,
    required String code,
    String? currentPassword,
    String? reauthSocialIdToken,
  }) async {
    final response = await _authorized(
      owner,
      method: 'POST',
      path: '/auth/mfa/confirm',
      body: {
        'code': code,
        if (currentPassword != null) 'currentPassword': currentPassword,
        if (reauthSocialIdToken != null)
          'reauthSocialIdToken': reauthSocialIdToken,
      },
    );
    final raw = response['recoveryCodes'];
    if (raw is! List ||
        raw.length != 10 ||
        raw.any((entry) => entry is! String || entry.length < 8)) {
      throw const MfaException(502, 'invalid_mfa_recovery_codes');
    }
    return List<String>.unmodifiable(raw.cast<String>());
  }

  Future<void> cancelEnrollment({
    required AuthSessionOwner owner,
    String? currentPassword,
    String? reauthSocialIdToken,
  }) async {
    await _authorized(
      owner,
      method: 'POST',
      path: '/auth/mfa/enroll/cancel',
      body: {
        if (currentPassword != null) 'currentPassword': currentPassword,
        if (reauthSocialIdToken != null)
          'reauthSocialIdToken': reauthSocialIdToken,
      },
    );
  }

  Future<void> disable({
    required AuthSessionOwner owner,
    required String code,
    String? currentPassword,
    String? reauthSocialIdToken,
  }) async {
    await _authorized(
      owner,
      method: 'POST',
      path: '/auth/mfa/disable',
      body: {
        'code': code,
        if (currentPassword != null) 'currentPassword': currentPassword,
        if (reauthSocialIdToken != null)
          'reauthSocialIdToken': reauthSocialIdToken,
      },
    );
  }
}
