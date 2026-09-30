import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';

import 'remote_auth_attempt_transaction.dart';

/// Public Web-app options only. The approval digest must come from a reviewed
/// Firebase Web-app/authorized-domain readback matched to the backend project;
/// computing a hash of guessed values is not provider activation evidence.
class WebGooglePublicConfig {
  static const stagingOrigin = 'https://staging.shareittoo.com';
  final String projectId;
  final String messagingSenderId;
  final String appId;
  final String apiKey;
  final String authDomain;
  final String backendProjectId;
  final String authorizedOrigin;
  final String approvedDigest;

  const WebGooglePublicConfig({
    required this.projectId,
    required this.messagingSenderId,
    required this.appId,
    required this.apiKey,
    required this.authDomain,
    required this.backendProjectId,
    required this.authorizedOrigin,
    required this.approvedDigest,
  });

  /// Exact JSON key order is part of the external build configuration contract.
  String get publicConfigDigest => sha256
      .convert(utf8.encode(jsonEncode({
        'projectId': projectId,
        'messagingSenderId': messagingSenderId,
        'appId': appId,
        'apiKey': apiKey,
        'authDomain': authDomain,
        'backendProjectId': backendProjectId,
        'authorizedOrigin': authorizedOrigin,
      })))
      .toString();

  bool get isBound =>
      RegExp(r'^[a-z][a-z0-9-]{4,28}[a-z0-9]$').hasMatch(projectId) &&
      RegExp(r'^[0-9]{6,20}$').hasMatch(messagingSenderId) &&
      RegExp('^1:$messagingSenderId:web:[a-f0-9]{16,64}\$').hasMatch(appId) &&
      RegExp(r'^AIza[A-Za-z0-9_-]{35}$').hasMatch(apiKey) &&
      authDomain == '$projectId.firebaseapp.com' &&
      backendProjectId == projectId &&
      authorizedOrigin == stagingOrigin &&
      RegExp(r'^[a-f0-9]{64}$').hasMatch(approvedDigest) &&
      approvedDigest == publicConfigDigest;

  FirebaseOptions? optionsFor({
    required bool googleEnabled,
    required bool backendEnabled,
    required String apiBaseUrl,
    required String origin,
  }) {
    if (!googleEnabled ||
        !backendEnabled ||
        !isBound ||
        origin != stagingOrigin ||
        apiBaseUrl != '$stagingOrigin/api/v1') {
      return null;
    }
    return FirebaseOptions(
        apiKey: apiKey,
        appId: appId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
        authDomain: authDomain);
  }
}

bool webGoogleControlAvailable(
        {required bool googleEnabled,
        required bool optionsBound,
        required bool initialized}) =>
    googleEnabled && optionsBound && initialized;

Future<bool> prepareWebGoogleAuth({
  required FirebaseOptions? options,
  required Future<void> Function() initializeBoundApp,
  required Future<void> Function() useMemoryPersistence,
}) async {
  if (options == null) return false;
  try {
    await initializeBoundApp();
    await useMemoryPersistence();
    return true;
  } catch (_) {
    return false;
  }
}

class WebGoogleIdentity {
  final String uid;
  final Future<String?> Function() readFreshIdToken;
  const WebGoogleIdentity({required this.uid, required this.readFreshIdToken});
}

class WebGoogleAuthFailure implements Exception {
  final bool cancelled;
  final String code;
  const WebGoogleAuthFailure(this.code, {this.cancelled = false});
}

/// The returned token is only an acquisition result. The existing principal-
/// bound remote-auth transaction must exchange it and persist the SIT session.
Future<String> acquireWebGoogleToken({
  required bool available,
  required void Function() requireCurrent,
  required Future<WebGoogleIdentity> Function() popup,
  required String? Function() currentFirebaseUid,
  required void Function(String uid) acquired,
  required String? Function(Object error) providerErrorCode,
}) async {
  requireCurrent();
  if (!available) throw const WebGoogleAuthFailure('web_config_unavailable');
  try {
    final identity = await popup();
    // Claim cleanup ownership before checking a possibly superseded UI action.
    acquired(identity.uid);
    requireCurrent();
    if (identity.uid.isEmpty || currentFirebaseUid() != identity.uid) {
      throw const RemoteAuthAttemptSuperseded();
    }
    final token = await identity.readFreshIdToken();
    requireCurrent();
    if (currentFirebaseUid() != identity.uid) {
      throw const RemoteAuthAttemptSuperseded();
    }
    if (token == null || token.isEmpty) {
      throw const WebGoogleAuthFailure('missing_firebase_id_token');
    }
    return token;
  } on RemoteAuthAttemptSuperseded {
    rethrow;
  } on WebGoogleAuthFailure {
    rethrow;
  } catch (error) {
    final code = providerErrorCode(error);
    const cancelled = {
      'popup-closed-by-user',
      'cancelled-popup-request',
      'web-context-cancelled',
      'canceled'
    };
    // SDK messages/customData can contain identity/token details: never retain
    // them in the typed result or user-visible logs.
    throw WebGoogleAuthFailure(
      cancelled.contains(code) ? 'popup_cancelled' : 'popup_unavailable',
      cancelled: cancelled.contains(code),
    );
  }
}
