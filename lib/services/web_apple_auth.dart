import 'package:firebase_auth/firebase_auth.dart';

import 'remote_auth_attempt_transaction.dart';

class WebAppleAuthFailure implements Exception {
  final String code;
  final bool cancelled;
  const WebAppleAuthFailure(this.code, {this.cancelled = false});
}

/// Transient exchange material only. No profile or provider credential is kept.
/// The caller must use its owned remote-auth transaction and must never log or
/// persist this object or its payload. It is not a SIT session.
class WebAppleExchangeMaterial {
  final String _idToken;
  final String _authorizationCode;
  const WebAppleExchangeMaterial._(this._idToken, this._authorizationCode);

  /// Exact existing /auth/social credential fields, without invented consents.
  Map<String, String> toBackendPayload() => {
        'idToken': _idToken,
        'appleAuthorizationCode': _authorizationCode,
      };

  @override
  String toString() => 'WebAppleExchangeMaterial(redacted)';
}

/// Dormant SDK seam, not integrated or approved for provider use.
/// firebase_auth_web 6.2.6 omits authorizationCode in its result conversion;
/// therefore the installed real Web path must fail missing_authorization_code.
/// No credential/access-token/profile fallback may substitute for that code.
Future<WebAppleExchangeMaterial> acquireWebAppleMaterial({
  required FirebaseAuth auth,
  required bool Function() available,
  required void Function() requireCurrent,
  required void Function(String uid) acquired,
}) async {
  void guard([String? uid]) {
    // Caller binds both the principal/action and SDK-operation generation.
    requireCurrent();
    if (!available()) {
      throw const WebAppleAuthFailure('web_config_unavailable');
    }
    if (uid != null && (uid.isEmpty || auth.currentUser?.uid != uid)) {
      throw const RemoteAuthAttemptSuperseded();
    }
  }

  guard();
  String? acquiredUid;
  try {
    final result = await auth.signInWithPopup(
      AppleAuthProvider()
        ..addScope('email')
        ..addScope('name'),
    );
    final user = result.user;
    if (user == null) {
      guard();
      throw const WebAppleAuthFailure('missing_firebase_user');
    }
    final uid = user.uid;
    acquiredUid = uid;
    // Claim exact cleanup ownership before checking whether popup became stale.
    acquired(uid);
    guard(uid);
    final fresh = await user.getIdTokenResult(true);
    guard(uid);
    if (fresh.signInProvider != 'apple.com') {
      throw const WebAppleAuthFailure('provider_mismatch');
    }
    final token = fresh.token;
    if (token == null || token.trim().length < 100 || token.length > 12000) {
      throw const WebAppleAuthFailure('missing_firebase_id_token');
    }
    guard(uid);
    // Read only this narrow field, never profile/isNewUser/providerData or
    // credential. The installed Web SDK leaves it null: fail closed below.
    final code = result.additionalUserInfo?.authorizationCode?.trim();
    guard(uid);
    if (code == null || code.isEmpty || code.length > 12000) {
      throw const WebAppleAuthFailure('missing_authorization_code');
    }
    return WebAppleExchangeMaterial._(token, code);
  } on RemoteAuthAttemptSuperseded {
    rethrow;
  } on WebAppleAuthFailure {
    rethrow;
  } catch (error) {
    // A stale action cannot report cancellation on behalf of its successor.
    guard(acquiredUid);
    const cancelled = {
      'popup-closed-by-user',
      'cancelled-popup-request',
      'web-context-cancelled',
      'canceled',
    };
    final isCancelled =
        error is FirebaseAuthException && cancelled.contains(error.code);
    throw WebAppleAuthFailure(
      isCancelled ? 'popup_cancelled' : 'popup_unavailable',
      cancelled: isCancelled,
    );
  }
}
