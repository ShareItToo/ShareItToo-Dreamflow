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
const _googleCurrentEnvelopeKeys = <String>[
  'schemaVersion',
  'kind',
  'evidenceClass',
  'syntheticFixture',
  'sourceCommit',
  'buildVersion',
  'configuration',
  'configurationSha256',
  'serviceAccountReadback',
  'serviceAccountReadbackSha256',
  'cloudConsoleReadback',
  'cloudConsoleReadbackSha256',
  'decision',
  'decisionSha256',
];
const _googleCurrentConfigKeys = <String>[
  'projectId',
  'messagingSenderId',
  'appId',
  'apiKey',
  'authDomain',
  'backendProjectId',
  'authorizedOrigin',
];
const _googleCurrentServiceKeys = <String>[
  'schemaVersion',
  'kind',
  'evidenceClass',
  'syntheticFixture',
  'readAtUtc',
  'validUntilUtc',
  'projectId',
  'projectState',
  'webAppId',
  'webAppPresent',
  'publicWebConfig',
  'authorizedDomains',
  'googleProviderEnabled',
  'appleProviderEnabled',
  'facebookProviderEnabled',
  'firebaseAuthEnabled',
  'firebaseEmulatorEnabled',
  'runtime',
];
const _googleCurrentRuntimeKeys = <String>[
  'service',
  'identity',
  'environment',
  'projectId',
  'green',
  'running',
  'commit',
  'image',
];
const _googleCurrentConsoleKeys = <String>[
  'schemaVersion',
  'kind',
  'evidenceClass',
  'syntheticFixture',
  'readAtUtc',
  'validUntilUtc',
  'projectId',
  'operatorAccountEmailSha256',
  'apiKeyResourceId',
  'apiKeySha256',
  'apiRestrictions',
  'websiteRestrictions',
];
const _googleCurrentDecisionKeys = <String>[
  'schemaVersion',
  'kind',
  'evidenceClass',
  'syntheticFixture',
  'decision',
  'sourceCommit',
  'buildVersion',
  'serviceAccountReadbackSha256',
  'cloudConsoleReadbackSha256',
  'configurationSha256',
  'projectId',
  'webAppId',
  'apiKeyResourceId',
  'decidedAtUtc',
  'validUntilUtc',
];
const _googleCurrentAuthApis = <String>[
  'Cloud Datastore API',
  'Cloud Firestore API',
  'Cloud Logging API',
  'Cloud SQL Admin API',
  'Cloud Storage for Firebase API',
  'FCM Registration API',
  'Firebase AI Logic API',
  'Firebase App Check API',
  'Firebase App Distribution API',
  'Firebase App Hosting API',
  'Firebase App Testers API',
  'Firebase Hosting API',
  'Firebase In-App Messaging API',
  'Firebase Installations API',
  'Firebase Management API',
  'Firebase ML API',
  'Firebase Phone Number Verification API',
  'Firebase Realtime Database Management API',
  'Firebase Remote Config API',
  'Firebase Remote Config Realtime API',
  'Firebase Rules API',
  'Firebase SQL Connect API',
  'Identity Toolkit API',
  'ML Kit API',
  'Token Service API',
];
const _googleCurrentOrigins = <String>[
  'https://shareittoo-staging.firebaseapp.com/*',
  'https://shareittoo-staging.web.app/*',
  'https://staging.shareittoo.com/*',
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
    String expectedBuildVersion = '',
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
          expectedBuildVersion: expectedBuildVersion,
          now: (now ?? DateTime.now()).toUtc(),
        )) {
      return null;
    }
    return FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: messagingSenderId,
      projectId: projectId,
      authDomain: authDomain,
    );
  }

  bool _readinessBound({
    required String readinessJson,
    required String approvedReadinessDigest,
    required String decisionJson,
    required String approvedDecisionDigest,
    required String approvedEvidenceDigest,
    required String expectedSourceCommit,
    required String expectedBuildVersion,
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
      if (readiness is Map<String, dynamic> &&
          readiness['kind'] == 'sit-google-web-current-readback') {
        return _currentReadbackBound(
          readiness: readiness,
          readinessJson: readinessJson,
          approvedReadinessDigest: approvedReadinessDigest,
          decision: decision,
          decisionJson: decisionJson,
          approvedDecisionDigest: approvedDecisionDigest,
          approvedEvidenceDigest: approvedEvidenceDigest,
          expectedSourceCommit: expectedSourceCommit,
          expectedBuildVersion: expectedBuildVersion,
          now: now,
        );
      }
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
      final digestFields = _googleReadinessKeys.where(
        (key) => key.endsWith('Sha256'),
      );
      const maximumValidity = Duration(hours: 2);
      // Freshness is enforced at build, sealing and candidate deployment.
      // Like current/rollback artifact validation, an installed client retains
      // the exact accepted evidence after that deployment window expires.
      // Preserve the bounded approval window and reject future evidence here;
      // expiry is not a provider revocation or a runtime session expiry.
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
          now.isBefore(collected)) {
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
          now.isBefore(decided)) {
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

  bool _currentReadbackBound({
    required Map<String, dynamic> readiness,
    required String readinessJson,
    required String approvedReadinessDigest,
    required Object? decision,
    required String decisionJson,
    required String approvedDecisionDigest,
    required String approvedEvidenceDigest,
    required String expectedSourceCommit,
    required String expectedBuildVersion,
    required DateTime now,
  }) {
    bool exactKeys(Object? value, List<String> keys) =>
        value is Map<String, dynamic> &&
        value.length == keys.length &&
        value.keys.toList(growable: false).join('\u0000') ==
            keys.join('\u0000');
    DateTime? utc(Object? value) {
      if (value is! String) return null;
      final parsed = DateTime.tryParse(value)?.toUtc();
      return parsed != null && parsed.toIso8601String() == value
          ? parsed
          : null;
    }

    final hashPattern = RegExp(r'^[a-f0-9]{64}$');
    final sourcePattern = RegExp(r'^[a-f0-9]{40}$');
    const maxAge = Duration(hours: 2);
    if (!exactKeys(readiness, _googleCurrentEnvelopeKeys) ||
        jsonEncode(readiness) != readinessJson ||
        _googleDigest(readinessJson) != approvedReadinessDigest ||
        readiness['schemaVersion'] != 1 ||
        readiness['kind'] != 'sit-google-web-current-readback' ||
        readiness['evidenceClass'] !=
            'direct-authoritative-provider-runtime-and-console-readback' ||
        readiness['syntheticFixture'] != false ||
        readiness['sourceCommit'] != expectedSourceCommit ||
        !sourcePattern.hasMatch(expectedSourceCommit) ||
        readiness['buildVersion'] != expectedBuildVersion ||
        !RegExp(r'^\d+\.\d+\.\d+\+\d+$').hasMatch(expectedBuildVersion)) {
      return false;
    }
    final config = readiness['configuration'];
    if (!exactKeys(config, _googleCurrentConfigKeys) ||
        jsonEncode(config) != jsonEncode(_publicConfig) ||
        readiness['configurationSha256'] != publicConfigDigest ||
        !hashPattern.hasMatch(
          readiness['configurationSha256'] as String? ?? '',
        )) {
      return false;
    }
    final service = readiness['serviceAccountReadback'];
    final console = readiness['cloudConsoleReadback'];
    final currentDecision = readiness['decision'];
    if (!exactKeys(service, _googleCurrentServiceKeys) ||
        !exactKeys(console, _googleCurrentConsoleKeys) ||
        !exactKeys(currentDecision, _googleCurrentDecisionKeys) ||
        jsonEncode(currentDecision) != decisionJson ||
        jsonEncode(decision) != decisionJson ||
        _googleDigest(decisionJson) != approvedDecisionDigest ||
        readiness['decisionSha256'] != approvedDecisionDigest ||
        readiness['serviceAccountReadbackSha256'] is! String ||
        readiness['cloudConsoleReadbackSha256'] is! String ||
        _googleDigest(jsonEncode(service)) !=
            readiness['serviceAccountReadbackSha256'] ||
        _googleDigest(jsonEncode(console)) !=
            readiness['cloudConsoleReadbackSha256'] ||
        !hashPattern.hasMatch(
          readiness['serviceAccountReadbackSha256'] as String,
        ) ||
        !hashPattern.hasMatch(
          readiness['cloudConsoleReadbackSha256'] as String,
        ) ||
        _googleDigest(readinessJson) != approvedEvidenceDigest) {
      return false;
    }
    final r = service as Map<String, dynamic>;
    final c = console as Map<String, dynamic>;
    final d = currentDecision as Map<String, dynamic>;
    final runtimeMap = r['runtime'] is Map<String, dynamic>
        ? r['runtime'] as Map<String, dynamic>
        : null;
    final serviceAt = utc(r['readAtUtc']);
    final serviceUntil = utc(r['validUntilUtc']);
    final consoleAt = utc(c['readAtUtc']);
    final consoleUntil = utc(c['validUntilUtc']);
    final decided = utc(d['decidedAtUtc']);
    final decisionUntil = utc(d['validUntilUtc']);
    final runtime = r['runtime'];
    final resource = c['apiKeyResourceId'];
    final apis = c['apiRestrictions'];
    final origins = c['websiteRestrictions'];
    // Compare exact sets while rejecting duplicates and non-string values.
    bool exactSet(Object? value, List<String> expected) {
      if (value is! List || value.any((item) => item is! String)) return false;
      final observed = value.cast<String>().toList()..sort();
      return observed.length == expected.length &&
          observed.toSet().length == observed.length &&
          observed.join('\u0000') == ([...expected]..sort()).join('\u0000');
    }

    if (r['schemaVersion'] != 1 ||
        r['kind'] != 'sit-google-web-service-account-readback' ||
        r['evidenceClass'] !=
            'direct-firebase-management-identity-toolkit-and-runtime-readback' ||
        r['syntheticFixture'] != false ||
        r['projectId'] != projectId ||
        r['projectState'] != 'ACTIVE' ||
        r['webAppId'] != appId ||
        r['webAppPresent'] != true ||
        jsonEncode(r['publicWebConfig']) != jsonEncode(_publicConfig) ||
        r['authorizedDomains'] is! List ||
        !(r['authorizedDomains'] as List).contains('staging.shareittoo.com') ||
        r['googleProviderEnabled'] != true ||
        r['appleProviderEnabled'] != false ||
        r['facebookProviderEnabled'] != false ||
        r['firebaseAuthEnabled'] != true ||
        r['firebaseEmulatorEnabled'] != false ||
        runtimeMap == null ||
        !exactKeys(runtimeMap, _googleCurrentRuntimeKeys) ||
        runtimeMap['service'] != '/shareittoo-staging-api' ||
        runtimeMap['identity'] is! String ||
        !hashPattern.hasMatch(runtimeMap['identity'] as String) ||
        runtimeMap['environment'] != 'staging' ||
        runtimeMap['projectId'] != projectId ||
        runtimeMap['green'] != true ||
        runtimeMap['running'] != true ||
        runtimeMap['commit'] is! String ||
        !sourcePattern.hasMatch(runtimeMap['commit'] as String) ||
        runtimeMap['image'] is! String ||
        !RegExp(
          r'^ghcr\.io/shareittoo/shareittoo-api@sha256:[a-f0-9]{64}$',
        ).hasMatch(runtimeMap['image'] as String) ||
        c['schemaVersion'] != 1 ||
        c['kind'] != 'sit-google-web-cloud-console-api-key-readback' ||
        c['evidenceClass'] != 'direct-google-cloud-console-readback' ||
        c['syntheticFixture'] != false ||
        c['projectId'] != projectId ||
        c['operatorAccountEmailSha256'] !=
            'ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776' ||
        resource is! String ||
        !RegExp(
          '^projects/${RegExp.escape(messagingSenderId)}/locations/global/keys/[A-Za-z0-9_-]{16,64}\$',
        ).hasMatch(resource) ||
        c['apiKeySha256'] != _googleDigest(apiKey) ||
        !exactSet(apis, _googleCurrentAuthApis) ||
        !exactSet(origins, _googleCurrentOrigins) ||
        d['schemaVersion'] != 1 ||
        d['kind'] != 'sit-google-web-sol-release-decision' ||
        d['evidenceClass'] != 'independent-sol-release-review' ||
        d['syntheticFixture'] != false ||
        d['decision'] != 'approved' ||
        d['sourceCommit'] != expectedSourceCommit ||
        d['buildVersion'] != expectedBuildVersion ||
        d['serviceAccountReadbackSha256'] !=
            readiness['serviceAccountReadbackSha256'] ||
        d['cloudConsoleReadbackSha256'] !=
            readiness['cloudConsoleReadbackSha256'] ||
        d['configurationSha256'] != publicConfigDigest ||
        d['projectId'] != projectId ||
        d['webAppId'] != appId ||
        d['apiKeyResourceId'] != resource ||
        serviceAt == null ||
        serviceUntil == null ||
        consoleAt == null ||
        consoleUntil == null ||
        decided == null ||
        decisionUntil == null ||
        !serviceUntil.isAfter(serviceAt) ||
        serviceUntil.difference(serviceAt) > maxAge ||
        !consoleUntil.isAfter(consoleAt) ||
        consoleUntil.difference(consoleAt) > maxAge ||
        !decisionUntil.isAfter(decided) ||
        decisionUntil.difference(decided) > maxAge ||
        decisionUntil.isAfter(serviceUntil) ||
        decisionUntil.isAfter(consoleUntil) ||
        decided.isBefore(serviceAt) ||
        decided.isBefore(consoleAt) ||
        now.isBefore(serviceAt) ||
        !now.isBefore(serviceUntil) ||
        now.isBefore(consoleAt) ||
        !now.isBefore(consoleUntil) ||
        now.isBefore(decided) ||
        !now.isBefore(decisionUntil)) {
      return false;
    }
    return true;
  }
}

bool webGoogleControlAvailable({
  required bool googleEnabled,
  required bool optionsBound,
  required bool initialized,
}) => googleEnabled && optionsBound && initialized;

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
      'canceled',
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
