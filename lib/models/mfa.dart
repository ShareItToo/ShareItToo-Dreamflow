class AuthMfaChallenge {
  final String challenge;
  final DateTime expiresAt;

  const AuthMfaChallenge({required this.challenge, required this.expiresAt});
}

class MfaStatus {
  final bool enabled;
  final bool pending;
  final int recoveryCodesRemaining;

  const MfaStatus({
    required this.enabled,
    required this.pending,
    required this.recoveryCodesRemaining,
  });
}

class MfaEnrollment {
  final String secret;
  final String otpauthUrl;

  const MfaEnrollment({required this.secret, required this.otpauthUrl});
}

class MfaException implements Exception {
  final int statusCode;
  final String code;

  const MfaException(this.statusCode, this.code);

  @override
  String toString() => 'MfaException($statusCode, $code)';
}
