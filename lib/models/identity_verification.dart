enum IdentityVerificationStatus {
  notStarted,
  requiresInput,
  processing,
  verified,
  canceled,
  redacted,
}

class IdentityVerificationState {
  final String? sessionId;
  final IdentityVerificationStatus status;
  final bool livemode;
  final DateTime? updatedAt;
  final String? redactionStatus;

  const IdentityVerificationState({
    required this.sessionId,
    required this.status,
    required this.livemode,
    required this.updatedAt,
    this.redactionStatus,
  });
}

class IdentityVerificationSession extends IdentityVerificationState {
  final String? url;
  final bool replayed;
  final bool resumed;

  const IdentityVerificationSession({
    required super.sessionId,
    required super.status,
    required super.livemode,
    required super.updatedAt,
    super.redactionStatus,
    required this.url,
    this.replayed = false,
    this.resumed = false,
  });
}

class IdentityVerificationException implements Exception {
  final int statusCode;
  final String code;

  const IdentityVerificationException(this.statusCode, this.code);

  @override
  String toString() => 'IdentityVerificationException($statusCode, $code)';
}
