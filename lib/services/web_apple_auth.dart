import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

import 'apple_web_v2_client.dart';
import 'remote_auth_attempt_transaction.dart';
import 'web_apple_browser_bridge.dart';

class WebAppleAuthFailure implements Exception {
  final String code;
  final bool cancelled;
  const WebAppleAuthFailure(this.code, {this.cancelled = false});

  @override
  String toString() => 'WebAppleAuthFailure($code)';
}

class WebAppleFirebaseToken {
  final String? token;
  final String? signInProvider;

  const WebAppleFirebaseToken({this.token, this.signInProvider});
}

class WebAppleFirebaseIdentity {
  final String uid;
  final Future<WebAppleFirebaseToken> Function() readFreshToken;

  const WebAppleFirebaseIdentity({
    required this.uid,
    required this.readFreshToken,
  });
}

typedef WebAppleRandomBytes = List<int> Function(int length);

List<int> _secureRandomBytes(int length) {
  final random = Random.secure();
  return List<int>.generate(length, (_) => random.nextInt(256),
      growable: false);
}

String createAppleWebOpaqueId(
    [WebAppleRandomBytes randomBytes = _secureRandomBytes]) {
  final bytes = randomBytes(32);
  if (bytes.length != 32 || bytes.any((value) => value < 0 || value > 255)) {
    throw const WebAppleAuthFailure('secure_random_unavailable');
  }
  return base64Url.encode(bytes).replaceAll('=', '');
}

/// Direct Apple JS acquisition. State and raw nonce are independent 32-byte
/// values; only the nonce digest is sent to Apple and only the raw nonce is
/// supplied to Firebase. The Apple authorization code remains single-use SIT
/// material and is never forwarded to Firebase or persisted by this client.
Future<AppleWebV2Material> acquireWebAppleMaterial({
  required WebAppleDirectConfig config,
  required bool Function() available,
  required void Function() requireCurrent,
  required Future<WebApplePopupResponse> Function(WebApplePopupRequest request)
      popup,
  required Future<WebAppleFirebaseIdentity> Function(
          String appleIdToken, String rawNonce)
      signInToFirebase,
  required String? Function() currentFirebaseUid,
  required void Function(String uid) acquired,
  WebAppleRandomBytes randomBytes = _secureRandomBytes,
}) async {
  void guard([String? uid]) {
    requireCurrent();
    if (!available() || !config.isValid) {
      throw const WebAppleAuthFailure('web_config_unavailable');
    }
    if (uid != null && (uid.isEmpty || currentFirebaseUid() != uid)) {
      throw const RemoteAuthAttemptSuperseded();
    }
  }

  guard();
  final state = createAppleWebOpaqueId(randomBytes);
  final rawNonce = createAppleWebOpaqueId(randomBytes);
  if (state == rawNonce) {
    throw const WebAppleAuthFailure('secure_random_unavailable');
  }
  final nonce = sha256.convert(utf8.encode(rawNonce)).toString();
  String? acquiredUid;
  try {
    final response = await popup(WebApplePopupRequest(
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state: state,
      nonce: nonce,
    ));
    guard();
    if (response.state != state) {
      throw const WebAppleAuthFailure('state_mismatch');
    }
    final code = response.authorizationCode.trim();
    final appleIdToken = response.appleIdToken.trim();
    if (code.isEmpty || code.length > 12000) {
      throw const WebAppleAuthFailure('missing_authorization_code');
    }
    if (appleIdToken.length < 100 || appleIdToken.length > 12000) {
      throw const WebAppleAuthFailure('missing_apple_id_token');
    }
    final identity = await signInToFirebase(appleIdToken, rawNonce);
    acquiredUid = identity.uid;
    // Claim exact Firebase cleanup ownership before any stale-action check.
    acquired(identity.uid);
    guard(identity.uid);

    Future<String> freshToken() async {
      guard(identity.uid);
      final fresh = await identity.readFreshToken();
      guard(identity.uid);
      if (fresh.signInProvider != 'apple.com') {
        throw const WebAppleAuthFailure('provider_mismatch');
      }
      final token = fresh.token?.trim() ?? '';
      if (token.length < 100 || token.length > 12000) {
        throw const WebAppleAuthFailure('missing_firebase_id_token');
      }
      return token;
    }

    // The v2 client calls this guarded reader immediately before every server
    // command, including acquire; avoid an otherwise redundant token refresh.
    return AppleWebV2Material(
      authorizationCode: code,
      readFreshFirebaseIdToken: freshToken,
    );
  } on RemoteAuthAttemptSuperseded {
    rethrow;
  } on WebAppleAuthFailure {
    rethrow;
  } on WebApplePopupFailure catch (error) {
    guard(acquiredUid);
    throw WebAppleAuthFailure(error.code, cancelled: error.cancelled);
  } catch (_) {
    guard(acquiredUid);
    throw const WebAppleAuthFailure('popup_unavailable');
  }
}

Future<WebApplePopupResponse> openConfiguredWebApplePopup(
        WebApplePopupRequest request) =>
    openWebApplePopup(request);
