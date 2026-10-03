import 'package:firebase_auth/firebase_auth.dart';

import 'remote_auth_attempt_transaction.dart';

bool webFacebookControlAvailable({
  required bool isWeb,
  required bool facebookEnabled,
  required bool configurationReady,
}) =>
    isWeb && facebookEnabled && configurationReady;

class WebFacebookAuthFailure implements Exception {
  final String code;
  final bool cancelled;
  const WebFacebookAuthFailure(this.code, {this.cancelled = false});
}

/// SDK injection supports deterministic VM and actual kIsWeb browser tests.
/// This returns only a fresh Firebase ID token, never a Meta credential or SIT
/// session. Client provider metadata is only a mismatch guard; the backend
/// independently verifies the token and derives authoritative provider claims.
Future<String> acquireWebFacebookToken({
  required FirebaseAuth auth,
  required bool Function() available,
  required void Function() requireCurrent,
  required void Function(String uid) acquired,
}) async {
  requireCurrent();
  if (!available()) {
    throw const WebFacebookAuthFailure('web_config_unavailable');
  }
  try {
    final result = await auth.signInWithPopup(
      FacebookAuthProvider()..addScope('email'),
    );
    // Do not inspect credential, additionalUserInfo, profile or providerData.
    final user = result.user;
    if (user == null) {
      requireCurrent();
      throw const WebFacebookAuthFailure('missing_firebase_user');
    }
    // Capture cleanup ownership even when the UI became obsolete in the popup.
    acquired(user.uid);
    requireCurrent();
    if (!available()) {
      throw const WebFacebookAuthFailure('web_config_unavailable');
    }
    if (user.uid.isEmpty || auth.currentUser?.uid != user.uid) {
      throw const RemoteAuthAttemptSuperseded();
    }
    final fresh = await user.getIdTokenResult(true);
    requireCurrent();
    if (!available()) {
      throw const WebFacebookAuthFailure('web_config_unavailable');
    }
    if (auth.currentUser?.uid != user.uid) {
      throw const RemoteAuthAttemptSuperseded();
    }
    if (fresh.signInProvider != 'facebook.com') {
      throw const WebFacebookAuthFailure('provider_mismatch');
    }
    final token = fresh.token;
    if (token == null || token.trim().isEmpty) {
      throw const WebFacebookAuthFailure('missing_firebase_id_token');
    }
    return token;
  } on RemoteAuthAttemptSuperseded {
    rethrow;
  } on WebFacebookAuthFailure {
    rethrow;
  } catch (error) {
    // Check ownership on failures too; a late cancellation cannot represent
    // the successor action. Never retain SDK messages, credentials/customData.
    requireCurrent();
    const cancelled = {
      'popup-closed-by-user',
      'cancelled-popup-request',
      'web-context-cancelled',
      'canceled',
    };
    final isCancelled =
        error is FirebaseAuthException && cancelled.contains(error.code);
    throw WebFacebookAuthFailure(
      isCancelled ? 'popup_cancelled' : 'popup_unavailable',
      cancelled: isCancelled,
    );
  }
}
