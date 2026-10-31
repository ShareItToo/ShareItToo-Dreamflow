import '../models/mfa.dart';
import 'auth_service.dart';

typedef MfaChallengePrompt = Future<String?> Function(
    AuthMfaChallenge challenge);
typedef MfaChallengeSubmit = Future<AuthResult> Function(
  AuthMfaChallenge challenge,
  String code,
);

/// Resolves a server-issued MFA challenge without treating the challenge as a
/// successful login. Prompting and feedback are injected so every auth entry
/// point can use the same retry, expiry, lock and stale-owner semantics.
Future<AuthResult?> resolveMfaChallenge({
  required AuthResult initial,
  required MfaChallengePrompt prompt,
  required MfaChallengeSubmit submit,
  required bool Function() isCurrent,
  DateTime Function()? now,
  Future<void> Function()? onExpired,
  Future<void> Function()? onRejected,
  Future<void> Function()? onLocked,
  Future<void> Function()? onInvalid,
  Future<void> Function()? onFailed,
}) async {
  var challenge = initial.mfaChallenge;
  if (challenge == null) return initial;
  final clock = now ?? DateTime.now;
  while (isCurrent()) {
    if (!challenge.expiresAt.isAfter(clock())) {
      await onExpired?.call();
      return null;
    }
    final code = await prompt(challenge);
    if (code == null || !isCurrent()) return null;
    final result = await submit(challenge, code);
    if (!isCurrent()) return null;
    if (result.ok && result.session != null) return result;
    switch (result.failure) {
      case AuthFailure.mfaCodeRejected:
        await onRejected?.call();
        continue;
      case AuthFailure.mfaChallengeExpired:
        await onExpired?.call();
        return null;
      case AuthFailure.mfaChallengeInvalid:
        await onInvalid?.call();
        return null;
      case AuthFailure.mfaLocked:
        await onLocked?.call();
        return null;
      case AuthFailure.principalChanged:
        return null;
      default:
        await onFailed?.call();
        return null;
    }
  }
  return null;
}
