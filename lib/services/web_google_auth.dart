import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';

import 'remote_auth_attempt_transaction.dart';

const _googleReadinessKeys = <String>[
  'sourceCommit',
  'prerequisiteRunnerSha256',
  'firebaseAccountEmailSha256',
  'gateEvidenceSha256',
  'baselineSha256',
  'projectId',
  'projectNumber',
  'backendProjectId',
  'webAppId',
  'authorizedDomain',
  'firebaseProviderId',
  'firebaseProviderEnabled',
  'firebaseAuthEnabled',
  'firebaseEmulatorEnabled',
  'finalSnapshotSha256',
  'finalRevisionSha256',
  'authConfigReadbackSha256',
  'providerConfigReadbackSha256',
  'webAppReadbackSha256',
  'authorizedDomainsReadbackSha256',
  'keyInventoryReadbackSha256',
  'otherAppsReadbackSha256',
  'runtimeReadbackSha256',
  'prerequisiteJournalSha256',
  'prerequisiteFinalRecordSha256',
  'collectedAtUtc',
  'validUntilUtc',
];

const _googleDecisionKeys = <String>[
  'schemaVersion',
  'kind',
  'evidenceClass',
  'syntheticFixture',
  'decision',
  'sourceCommit',
  'prerequisiteJournalSha256',
  'prerequisiteFinalRecordSha256',
  'configurationSha256',
  'readinessSha256',
  'projectId',
  'projectNumber',
  'webAppId',
  'authorizedDomain',
  'firebaseProviderId',
  'decidedAtUtc',
  'validUntilUtc',
];

String _googleDigest(String value) =>
    sha256.convert(utf8.encode(value)).toString();

bool _exactOrderedMap(Object? value, List<String> keys) =>
    value is Map<String, dynamic> &&
    value.length == keys.length &&
    value.keys.toList(growable: false).join('\u0000') == keys.join('\u0000');

DateTime? _exactUtc(Object? value) {
  if (value is! String) return null;
  final parsed = DateTime.tryParse(value)?.toUtc();
  if (parsed == null || parsed.toIso8601String() != value) return null;
  return parsed;
}

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

  Map<String, String> get _publicConfig => {
        'projectId': projectId,
        'messagingSenderId': messagingSenderId,
        'appId': appId,
        'apiKey': apiKey,
        'authDomain': authDomain,
        'backendProjectId': backendProjectId,
        'authorizedOrigin': authorizedOrigin,
      };

  /// Exact JSON key order is part of the external build configuration contract.
  String get publicConfigDigest => _googleDigest(jsonEncode(_publicConfig));

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
    bool activationValidated = false,
    required bool backendEnabled,
    required String apiBaseUrl,
    required String origin,
    String readinessJson = '',
    String approvedReadinessDigest = '',
    String decisionJson = '',
    String approvedDecisionDigest = '',
    String approvedEvidenceDigest = '',
    String expectedSourceCommit = '',
    DateTime? now,
  }) {
    if (!googleEnabled ||
        !activationValidated ||
        !backendEnabled ||
        !isBound ||
        origin != stagingOrigin ||
        apiBaseUrl != '$stagingOrigin/api/v1' ||
        !_readinessBound(
          readinessJson: readinessJson,
          approvedReadinessDigest: approvedReadinessDigest,
          decisionJson: decisionJson,
          approvedDecisionDigest: approvedDecisionDigest,
          approvedEvidenceDigest: approvedEvidenceDigest,
          expectedSourceCommit: expectedSourceCommit,
          now: (now ?? DateTime.now()).toUtc(),
        )) {
      return null;
    }
    return FirebaseOptions(
        apiKey: apiKey,
        appId: appId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
        authDomain: authDomain);
  }

  bool _readinessBound({
    required String readinessJson,
    required String approvedReadinessDigest,
    required String decisionJson,
    required String approvedDecisionDigest,
    required String approvedEvidenceDigest,
    required String expectedSourceCommit,
    required DateTime now,
  }) {
    final hashPattern = RegExp(r'^[a-f0-9]{64}$');
    final sourcePattern = RegExp(r'^[a-f0-9]{40}$');
    if (readinessJson.length > 32768 ||
        decisionJson.length > 32768 ||
        !hashPattern.hasMatch(approvedReadinessDigest) ||
        !hashPattern.hasMatch(approvedDecisionDigest) ||
        !hashPattern.hasMatch(approvedEvidenceDigest) ||
        !sourcePattern.hasMatch(expectedSourceCommit) ||
        _googleDigest(readinessJson) != approvedReadinessDigest ||
        _googleDigest(decisionJson) != approvedDecisionDigest) {
      return false;
    }
    try {
      final readiness = jsonDecode(readinessJson);
      final decision = jsonDecode(decisionJson);
      if (!_exactOrderedMap(readiness, _googleReadinessKeys) ||
          !_exactOrderedMap(decision, _googleDecisionKeys) ||
          jsonEncode(readiness) != readinessJson ||
          jsonEncode(decision) != decisionJson) {
        return false;
      }
      final r = readiness as Map<String, dynamic>;
      final d = decision as Map<String, dynamic>;
      final collected = _exactUtc(r['collectedAtUtc']);
      final readinessUntil = _exactUtc(r['validUntilUtc']);
      final decided = _exactUtc(d['decidedAtUtc']);
      final decisionUntil = _exactUtc(d['validUntilUtc']);
      final digestFields =
          _googleReadinessKeys.where((key) => key.endsWith('Sha256'));
      const maximumValidity = Duration(hours: 2);
      if (r['sourceCommit'] != expectedSourceCommit ||
          r['projectId'] != projectId ||
          r['projectNumber'] != messagingSenderId ||
          r['backendProjectId'] != backendProjectId ||
          r['webAppId'] != appId ||
          r['authorizedDomain'] != 'staging.shareittoo.com' ||
          r['firebaseProviderId'] != 'google.com' ||
          r['firebaseProviderEnabled'] != true ||
          r['firebaseAuthEnabled'] != true ||
          r['firebaseEmulatorEnabled'] != false ||
          digestFields.any((key) {
            final value = r[key];
            return value is! String || !hashPattern.hasMatch(value);
          }) ||
          collected == null ||
          readinessUntil == null ||
          !readinessUntil.isAfter(collected) ||
          readinessUntil.difference(collected) > maximumValidity ||
          now.isBefore(collected) ||
          !now.isBefore(readinessUntil)) {
        return false;
      }
      if (d['schemaVersion'] != 1 ||
          d['kind'] != 'sit-google-web-prerequisite-activation-decision' ||
          d['evidenceClass'] != 'independent-release-review' ||
          d['syntheticFixture'] != false ||
          d['decision'] != 'approved' ||
          d['sourceCommit'] != r['sourceCommit'] ||
          d['prerequisiteJournalSha256'] != r['prerequisiteJournalSha256'] ||
          d['prerequisiteFinalRecordSha256'] !=
              r['prerequisiteFinalRecordSha256'] ||
          d['configurationSha256'] != publicConfigDigest ||
          d['readinessSha256'] != approvedReadinessDigest ||
          d['projectId'] != r['projectId'] ||
          d['projectNumber'] != r['projectNumber'] ||
          d['webAppId'] != r['webAppId'] ||
          d['authorizedDomain'] != r['authorizedDomain'] ||
          d['firebaseProviderId'] != r['firebaseProviderId'] ||
          decided == null ||
          decisionUntil == null ||
          decided.isBefore(collected) ||
          !decisionUntil.isAfter(decided) ||
          decisionUntil.difference(decided) > maximumValidity ||
          decisionUntil.isAfter(readinessUntil) ||
          now.isBefore(decided) ||
          !now.isBefore(decisionUntil)) {
        return false;
      }
      final envelope = <String, Object?>{
        'schemaVersion': 2,
        'kind': 'sit-google-web-prerequisite-readiness-candidate',
        'evidenceClass':
            'verified-prerequisite-journal-and-independent-decision',
        'syntheticFixture': false,
        'activationDecision': 'approved-independent-review',
        'activationEligible': true,
        'configuration': _publicConfig,
        'configurationSha256': publicConfigDigest,
        'readiness': r,
        'readinessSha256': approvedReadinessDigest,
        'decision': d,
        'decisionSha256': approvedDecisionDigest,
      };
      return _googleDigest(jsonEncode(envelope)) == approvedEvidenceDigest;
    } on FormatException {
      return false;
    }
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
    final sanitizedCode = switch (code) {
      'popup-blocked' => 'popup_blocked',
      'network-request-failed' => 'network_request_failed',
      _ => cancelled.contains(code) ? 'popup_cancelled' : 'popup_unavailable',
    };
    throw WebGoogleAuthFailure(
      sanitizedCode,
      cancelled: cancelled.contains(code),
    );
  }
}
