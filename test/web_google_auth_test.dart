import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';
import 'package:lendify/services/web_google_auth.dart';

class SyntheticProviderError implements Exception {
  final String code;
  const SyntheticProviderError(this.code);
}

final googleFixtureNow = DateTime.utc(2026, 10, 4, 12);
const googleFixtureSource = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const googleFixtureVersion = '1.2.3+20261026';

String googleFixtureDigest(String value) =>
    sha256.convert(utf8.encode(value)).toString();

class GoogleEvidenceFixture {
  final String readinessJson;
  final String readinessDigest;
  final String decisionJson;
  final String decisionDigest;
  final String evidenceDigest;
  final String sourceCommit;
  final DateTime now;

  const GoogleEvidenceFixture({
    required this.readinessJson,
    required this.readinessDigest,
    required this.decisionJson,
    required this.decisionDigest,
    required this.evidenceDigest,
    required this.sourceCommit,
    required this.now,
  });
}

WebGooglePublicConfig config({
  Map<String, String> changes = const {},
  bool approve = true,
}) {
  final values = <String, String>{
    'project': 'synthetic-project',
    'sender': '123456789012',
    'app': '1:123456789012:web:0123456789abcdef',
    'key': ['AIza', List.filled(35, 'x').join()].join(),
    'domain': 'synthetic-project.firebaseapp.com',
    'backend': 'synthetic-project',
    'origin': WebGooglePublicConfig.stagingOrigin,
    ...changes,
  };
  WebGooglePublicConfig make(String digest) => WebGooglePublicConfig(
        projectId: values['project']!,
        messagingSenderId: values['sender']!,
        appId: values['app']!,
        apiKey: values['key']!,
        authDomain: values['domain']!,
        backendProjectId: values['backend']!,
        authorizedOrigin: values['origin']!,
        approvedDigest: digest,
      );
  return make(approve ? make('').publicConfigDigest : '');
}

GoogleEvidenceFixture googleEvidence(
  WebGooglePublicConfig candidate, {
  DateTime? at,
  String sourceCommit = googleFixtureSource,
  Map<String, Object?> readinessChanges = const {},
  Map<String, Object?> decisionChanges = const {},
}) {
  final now = (at ?? googleFixtureNow).toUtc();
  final readiness = <String, Object?>{
    'sourceCommit': sourceCommit,
    'prerequisiteRunnerSha256': googleFixtureDigest('runner'),
    'firebaseAccountEmailSha256': googleFixtureDigest('account'),
    'gateEvidenceSha256': googleFixtureDigest('gate'),
    'baselineSha256': googleFixtureDigest('baseline'),
    'projectId': candidate.projectId,
    'projectNumber': candidate.messagingSenderId,
    'backendProjectId': candidate.backendProjectId,
    'webAppId': candidate.appId,
    'authorizedDomain': 'staging.shareittoo.com',
    'firebaseProviderId': 'google.com',
    'firebaseProviderEnabled': true,
    'firebaseAuthEnabled': true,
    'firebaseEmulatorEnabled': false,
    'finalSnapshotSha256': googleFixtureDigest('final-snapshot'),
    'finalRevisionSha256': googleFixtureDigest('final-revision'),
    'authConfigReadbackSha256': googleFixtureDigest('auth-config'),
    'providerConfigReadbackSha256': googleFixtureDigest('provider-config'),
    'webAppReadbackSha256': googleFixtureDigest('web-app'),
    'authorizedDomainsReadbackSha256': googleFixtureDigest('domains'),
    'keyInventoryReadbackSha256': googleFixtureDigest('key-inventory'),
    'otherAppsReadbackSha256': googleFixtureDigest('other-apps'),
    'runtimeReadbackSha256': googleFixtureDigest('runtime'),
    'prerequisiteJournalSha256': googleFixtureDigest('journal'),
    'prerequisiteFinalRecordSha256': googleFixtureDigest('final-record'),
    'collectedAtUtc':
        now.subtract(const Duration(minutes: 1)).toIso8601String(),
    'validUntilUtc': now.add(const Duration(hours: 1)).toIso8601String(),
    ...readinessChanges,
  };
  final readinessJson = jsonEncode(readiness);
  final readinessDigest = googleFixtureDigest(readinessJson);
  final decision = <String, Object?>{
    'schemaVersion': 1,
    'kind': 'sit-google-web-prerequisite-activation-decision',
    'evidenceClass': 'independent-release-review',
    'syntheticFixture': false,
    'decision': 'approved',
    'sourceCommit': readiness['sourceCommit'],
    'prerequisiteJournalSha256': readiness['prerequisiteJournalSha256'],
    'prerequisiteFinalRecordSha256': readiness['prerequisiteFinalRecordSha256'],
    'configurationSha256': candidate.publicConfigDigest,
    'readinessSha256': readinessDigest,
    'projectId': readiness['projectId'],
    'projectNumber': readiness['projectNumber'],
    'webAppId': readiness['webAppId'],
    'authorizedDomain': readiness['authorizedDomain'],
    'firebaseProviderId': readiness['firebaseProviderId'],
    'decidedAtUtc': now.toIso8601String(),
    'validUntilUtc': now.add(const Duration(minutes: 30)).toIso8601String(),
    ...decisionChanges,
  };
  final decisionJson = jsonEncode(decision);
  final decisionDigest = googleFixtureDigest(decisionJson);
  final envelope = <String, Object?>{
    'schemaVersion': 2,
    'kind': 'sit-google-web-prerequisite-readiness-candidate',
    'evidenceClass': 'verified-prerequisite-journal-and-independent-decision',
    'syntheticFixture': false,
    'activationDecision': 'approved-independent-review',
    'activationEligible': true,
    'configuration': <String, String>{
      'projectId': candidate.projectId,
      'messagingSenderId': candidate.messagingSenderId,
      'appId': candidate.appId,
      'apiKey': candidate.apiKey,
      'authDomain': candidate.authDomain,
      'backendProjectId': candidate.backendProjectId,
      'authorizedOrigin': candidate.authorizedOrigin,
    },
    'configurationSha256': candidate.publicConfigDigest,
    'readiness': readiness,
    'readinessSha256': readinessDigest,
    'decision': decision,
    'decisionSha256': decisionDigest,
  };
  return GoogleEvidenceFixture(
    readinessJson: readinessJson,
    readinessDigest: readinessDigest,
    decisionJson: decisionJson,
    decisionDigest: decisionDigest,
    evidenceDigest: googleFixtureDigest(jsonEncode(envelope)),
    sourceCommit: sourceCommit,
    now: now,
  );
}

GoogleEvidenceFixture googleCurrentReadbackEvidence(
  WebGooglePublicConfig candidate, {
  DateTime? at,
  String sourceCommit = googleFixtureSource,
  bool wrongOperator = false,
  bool wrongApiRestriction = false,
  void Function(Map<String, Object?> runtime)? mutateRuntime,
}) {
  final now = (at ?? googleFixtureNow).toUtc();
  final configMap = <String, String>{
    'projectId': candidate.projectId,
    'messagingSenderId': candidate.messagingSenderId,
    'appId': candidate.appId,
    'apiKey': candidate.apiKey,
    'authDomain': candidate.authDomain,
    'backendProjectId': candidate.backendProjectId,
    'authorizedOrigin': candidate.authorizedOrigin,
  };
  final apis = <String>[
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
  ]..sort();
  final runtime = <String, Object?>{
    'service': '/shareittoo-staging-api',
    'identity': List.filled(64, 'c').join(),
    'environment': 'staging',
    'projectId': candidate.projectId,
    'green': true,
    'running': true,
    'commit': 'c904aed9f58691176a30aadb222f0cb3635f167e',
    'image':
        'ghcr.io/shareittoo/shareittoo-api@sha256:${List.filled(64, 'b').join()}',
  };
  mutateRuntime?.call(runtime);
  final origins = <String>[
    'https://shareittoo-staging.firebaseapp.com/*',
    'https://shareittoo-staging.web.app/*',
    'https://staging.shareittoo.com/*',
  ];
  final service = <String, Object?>{
    'schemaVersion': 1,
    'kind': 'sit-google-web-service-account-readback',
    'evidenceClass':
        'direct-firebase-management-identity-toolkit-and-runtime-readback',
    'syntheticFixture': false,
    'readAtUtc': now.subtract(const Duration(minutes: 1)).toIso8601String(),
    'validUntilUtc': now.add(const Duration(hours: 1)).toIso8601String(),
    'projectId': candidate.projectId,
    'projectState': 'ACTIVE',
    'webAppId': candidate.appId,
    'webAppPresent': true,
    'publicWebConfig': configMap,
    'authorizedDomains': <String>[
      'staging.shareittoo.com',
      '${candidate.projectId}.firebaseapp.com',
    ],
    'googleProviderEnabled': true,
    'appleProviderEnabled': false,
    'facebookProviderEnabled': false,
    'firebaseAuthEnabled': true,
    'firebaseEmulatorEnabled': false,
    'runtime': runtime,
  };
  final serviceDigest = googleFixtureDigest(jsonEncode(service));
  final console = <String, Object?>{
    'schemaVersion': 1,
    'kind': 'sit-google-web-cloud-console-api-key-readback',
    'evidenceClass': 'direct-google-cloud-console-readback',
    'syntheticFixture': false,
    'readAtUtc': now.subtract(const Duration(seconds: 30)).toIso8601String(),
    'validUntilUtc': now.add(const Duration(hours: 1)).toIso8601String(),
    'projectId': candidate.projectId,
    'operatorAccountEmailSha256': wrongOperator
        ? List.filled(64, '0').join()
        : 'ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776',
    'apiKeyResourceId':
        'projects/123456789012/locations/global/keys/64e7f44b-32c2-4188-92b4-7983349ceeb6',
    'apiKeySha256': googleFixtureDigest(candidate.apiKey),
    'apiRestrictions': wrongApiRestriction ? apis.take(24).toList() : apis,
    'websiteRestrictions': origins,
  };
  final consoleDigest = googleFixtureDigest(jsonEncode(console));
  final decision = <String, Object?>{
    'schemaVersion': 1,
    'kind': 'sit-google-web-sol-release-decision',
    'evidenceClass': 'independent-sol-release-review',
    'syntheticFixture': false,
    'decision': 'approved',
    'sourceCommit': sourceCommit,
    'buildVersion': googleFixtureVersion,
    'serviceAccountReadbackSha256': serviceDigest,
    'cloudConsoleReadbackSha256': consoleDigest,
    'configurationSha256': candidate.publicConfigDigest,
    'projectId': candidate.projectId,
    'webAppId': candidate.appId,
    'apiKeyResourceId': console['apiKeyResourceId'],
    'decidedAtUtc': now.toIso8601String(),
    'validUntilUtc': now.add(const Duration(minutes: 30)).toIso8601String(),
  };
  final decisionJson = jsonEncode(decision);
  final decisionDigest = googleFixtureDigest(decisionJson);
  final envelope = <String, Object?>{
    'schemaVersion': 1,
    'kind': 'sit-google-web-current-readback',
    'evidenceClass':
        'direct-authoritative-provider-runtime-and-console-readback',
    'syntheticFixture': false,
    'sourceCommit': sourceCommit,
    'buildVersion': googleFixtureVersion,
    'configuration': configMap,
    'configurationSha256': candidate.publicConfigDigest,
    'serviceAccountReadback': service,
    'serviceAccountReadbackSha256': serviceDigest,
    'cloudConsoleReadback': console,
    'cloudConsoleReadbackSha256': consoleDigest,
    'decision': decision,
    'decisionSha256': decisionDigest,
  };
  final readinessJson = jsonEncode(envelope);
  return GoogleEvidenceFixture(
    readinessJson: readinessJson,
    readinessDigest: googleFixtureDigest(readinessJson),
    decisionJson: decisionJson,
    decisionDigest: decisionDigest,
    evidenceDigest: googleFixtureDigest(readinessJson),
    sourceCommit: sourceCommit,
    now: now,
  );
}

verifiedOptions(
  WebGooglePublicConfig candidate, {
  bool googleEnabled = true,
  bool activationValidated = true,
  bool backendEnabled = true,
  String apiBaseUrl = '${WebGooglePublicConfig.stagingOrigin}/api/v1',
  String origin = WebGooglePublicConfig.stagingOrigin,
  GoogleEvidenceFixture? evidence,
  String? expectedSourceCommit,
  DateTime? runtimeNow,
}) {
  final binding = evidence ?? googleEvidence(candidate);
  return candidate.optionsFor(
    googleEnabled: googleEnabled,
    activationValidated: activationValidated,
    backendEnabled: backendEnabled,
    apiBaseUrl: apiBaseUrl,
    origin: origin,
    readinessJson: binding.readinessJson,
    approvedReadinessDigest: binding.readinessDigest,
    decisionJson: binding.decisionJson,
    approvedDecisionDigest: binding.decisionDigest,
    approvedEvidenceDigest: binding.evidenceDigest,
    expectedSourceCommit: expectedSourceCommit ?? binding.sourceCommit,
    now: runtimeNow ?? binding.now,
  );
}

void main() {
  test(
    'current-readback profile binds build identity, exact runtime, operator, console restrictions and decision',
    () {
      final candidate = config();
      final evidence = googleCurrentReadbackEvidence(candidate);
      FirebaseOptions? optionsFor(
        GoogleEvidenceFixture proof, {
        String expectedSourceCommit = googleFixtureSource,
        DateTime? runtimeNow,
      }) =>
          candidate.optionsFor(
            googleEnabled: true,
            activationValidated: true,
            backendEnabled: true,
            apiBaseUrl: '${WebGooglePublicConfig.stagingOrigin}/api/v1',
            origin: WebGooglePublicConfig.stagingOrigin,
            readinessJson: proof.readinessJson,
            approvedReadinessDigest: proof.readinessDigest,
            decisionJson: proof.decisionJson,
            approvedDecisionDigest: proof.decisionDigest,
            approvedEvidenceDigest: proof.evidenceDigest,
            expectedSourceCommit: expectedSourceCommit,
            expectedBuildVersion: googleFixtureVersion,
            now: runtimeNow ?? proof.now,
          );
      expect(optionsFor(evidence)?.projectId, candidate.projectId);
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(candidate, wrongOperator: true),
        ),
        isNull,
      );
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(candidate, wrongApiRestriction: true),
        ),
        isNull,
      );
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(
            candidate,
            mutateRuntime: (runtime) =>
                runtime['service'] = 'shareittoo-staging-api',
          ),
        ),
        isNull,
      );
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(
            candidate,
            mutateRuntime: (runtime) =>
                runtime['identity'] = 'staging-api-container-123',
          ),
        ),
        isNull,
      );
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(
            candidate,
            mutateRuntime: (runtime) => runtime['commit'] = 'C' * 40,
          ),
        ),
        isNull,
      );
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(
            candidate,
            mutateRuntime: (runtime) => runtime['image'] =
                'ghcr.io/shareittoo/other-api@sha256:${'b' * 64}',
          ),
        ),
        isNull,
      );
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(candidate, sourceCommit: 'b' * 40),
          expectedSourceCommit: googleFixtureSource,
        ),
        isNull,
      );
      expect(
        optionsFor(
          googleCurrentReadbackEvidence(candidate),
          runtimeNow: googleFixtureNow.add(const Duration(hours: 3)),
        ),
        isNull,
      );
    },
  );

  test(
    'verified public options bind Web app, sender, project and staging only',
    () {
      final candidate = config();
      expect(candidate.isBound, isTrue);
      final options = verifiedOptions(candidate);
      expect(options?.appId, candidate.appId);
      expect(options?.authDomain, candidate.authDomain);
      expect(options?.projectId, candidate.backendProjectId);
    },
  );
  test('accepted Google options survive the deployment freshness window', () {
    final candidate = config();
    final evidence = googleEvidence(candidate);
    for (final elapsed in [
      const Duration(minutes: 30),
      const Duration(hours: 1),
      const Duration(hours: 2),
      const Duration(days: 30),
    ]) {
      final options = verifiedOptions(
        candidate,
        evidence: evidence,
        runtimeNow: evidence.now.add(elapsed),
      );
      expect(options?.appId, candidate.appId);
      expect(options?.projectId, candidate.backendProjectId);
    }
  });
  test('runtime longevity preserves invalid and future evidence rejection', () {
    final candidate = config();
    final later = googleFixtureNow.add(const Duration(days: 30));
    for (final changes in <Map<String, Object?>>[
      {'firebaseProviderEnabled': false},
      {'firebaseAuthEnabled': false},
      {'firebaseEmulatorEnabled': true},
      {'backendProjectId': 'other-project'},
      {'webAppId': '${candidate.appId}a'},
      {'authorizedDomain': 'shareittoo.com'},
      {
        'validUntilUtc': googleFixtureNow.toIso8601String(),
        'collectedAtUtc': googleFixtureNow.toIso8601String(),
      },
      {
        'validUntilUtc':
            googleFixtureNow.add(const Duration(hours: 3)).toIso8601String(),
      },
    ]) {
      expect(
        verifiedOptions(
          candidate,
          evidence: googleEvidence(candidate, readinessChanges: changes),
          runtimeNow: later,
        ),
        isNull,
        reason: changes.toString(),
      );
    }
    for (final changes in <Map<String, Object?>>[
      {'decision': 'revoked'},
      {'decision': 'rejected'},
      {'sourceCommit': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'},
      {'configurationSha256': googleFixtureDigest('other-config')},
      {'validUntilUtc': googleFixtureNow.toIso8601String()},
      {
        'validUntilUtc':
            googleFixtureNow.add(const Duration(hours: 3)).toIso8601String(),
      },
    ]) {
      expect(
        verifiedOptions(
          candidate,
          evidence: googleEvidence(candidate, decisionChanges: changes),
          runtimeNow: later,
        ),
        isNull,
        reason: changes.toString(),
      );
    }
    final evidence = googleEvidence(candidate);
    expect(
      verifiedOptions(
        candidate,
        evidence: evidence,
        runtimeNow: googleFixtureNow.subtract(const Duration(minutes: 2)),
      ),
      isNull,
    );
    expect(
      verifiedOptions(
        candidate,
        evidence: evidence,
        runtimeNow: googleFixtureNow.subtract(const Duration(seconds: 1)),
      ),
      isNull,
    );
    expect(
      verifiedOptions(
        candidate,
        evidence: evidence,
        expectedSourceCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        runtimeNow: later,
      ),
      isNull,
    );
    expect(
      verifiedOptions(
        candidate,
        evidence: evidence,
        activationValidated: false,
        runtimeNow: later,
      ),
      isNull,
    );
    expect(
      verifiedOptions(
        config(changes: {'app': '${candidate.appId}a'}),
        evidence: evidence,
        runtimeNow: later,
      ),
      isNull,
    );
  });
  for (final mutation in <Map<String, String>>[
    {'project': ''},
    {'sender': ''},
    {'app': ''},
    {'key': ''},
    {'domain': ''},
    {'backend': ''},
    {'origin': ''},
    {'app': '1:123456789012:android:0123456789abcdef'},
    {'app': '1:987654321012:web:0123456789abcdef'},
    {'backend': 'other-project'},
    {'domain': 'other-project.firebaseapp.com'},
    {'domain': 'evil.invalid'},
    {'key': 'not-an-api-key'},
    {'sender': '.*'},
    {'origin': 'https://shareittoo.com'},
  ]) {
    test(
      'even rehashed invalid public options are rejected: ${mutation.keys}',
      () {
        expect(config(changes: mutation).isBound, isFalse);
      },
    );
  }
  test('missing or stale approval digest cannot enable Web auth', () {
    expect(config(approve: false).isBound, isFalse);
    final old = config();
    final drift = WebGooglePublicConfig(
      projectId: old.projectId,
      messagingSenderId: old.messagingSenderId,
      appId: '${old.appId}a',
      apiKey: old.apiKey,
      authDomain: old.authDomain,
      backendProjectId: old.backendProjectId,
      authorizedOrigin: old.authorizedOrigin,
      approvedDigest: old.publicConfigDigest,
    );
    expect(drift.isBound, isFalse);
  });
  test(
    'flags, backend binding, exact origin and initialization all fail closed',
    () {
      final candidate = config();
      for (final origin in [
        'https://shareittoo.com',
        'http://staging.shareittoo.com',
        'https://staging.shareittoo.com.evil.invalid',
        'http://localhost:1234',
      ]) {
        expect(verifiedOptions(candidate, origin: origin), isNull);
      }
      for (final flags in [(false, true), (true, false)]) {
        expect(
          verifiedOptions(
            candidate,
            googleEnabled: flags.$1,
            backendEnabled: flags.$2,
          ),
          isNull,
        );
      }
      expect(
        verifiedOptions(candidate, apiBaseUrl: 'https://shareittoo.com/api/v1'),
        isNull,
      );
      for (final enabled in [false, true]) {
        for (final bound in [false, true]) {
          for (final ready in [false, true]) {
            expect(
              webGoogleControlAvailable(
                googleEnabled: enabled,
                optionsBound: bound,
                initialized: ready,
              ),
              enabled && bound && ready,
            );
          }
        }
      }
    },
  );
  test(
    'activation and exact current readiness/decision evidence fail closed',
    () {
      final candidate = config();
      expect(verifiedOptions(candidate, activationValidated: false), isNull);
      final valid = googleEvidence(candidate);
      expect(
        candidate.optionsFor(
          googleEnabled: true,
          activationValidated: true,
          backendEnabled: true,
          apiBaseUrl: '${WebGooglePublicConfig.stagingOrigin}/api/v1',
          origin: WebGooglePublicConfig.stagingOrigin,
          readinessJson: '',
          approvedReadinessDigest: valid.readinessDigest,
          decisionJson: valid.decisionJson,
          approvedDecisionDigest: valid.decisionDigest,
          approvedEvidenceDigest: valid.evidenceDigest,
          expectedSourceCommit: valid.sourceCommit,
          now: valid.now,
        ),
        isNull,
      );
      expect(
        verifiedOptions(
          candidate,
          evidence: googleEvidence(
            candidate,
            readinessChanges: const {'firebaseProviderEnabled': false},
          ),
        ),
        isNull,
      );
      expect(
        verifiedOptions(
          candidate,
          evidence: googleEvidence(
            candidate,
            decisionChanges: const {'decision': 'rejected'},
          ),
        ),
        isNull,
      );
      final foreignEvidence = googleEvidence(
        candidate,
        sourceCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      );
      expect(
        verifiedOptions(
          candidate,
          evidence: foreignEvidence,
          expectedSourceCommit: googleFixtureSource,
        ),
        isNull,
      );
    },
  );
  for (final failure in [
    'none',
    'missing-options',
    'initialize',
    'persistence',
  ]) {
    test(
      'auth-only preparation $failure never reports premature readiness',
      () async {
        final calls = <String>[];
        final options = verifiedOptions(config());
        final ready = await prepareWebGoogleAuth(
          options: failure == 'missing-options' ? null : options,
          initializeBoundApp: () async {
            calls.add('app');
            if (failure == 'initialize') throw StateError('fixture');
          },
          useMemoryPersistence: () async {
            calls.add('memory');
            if (failure == 'persistence') throw StateError('fixture');
          },
        );
        expect(ready, failure == 'none');
        expect(
          calls,
          failure == 'missing-options'
              ? []
              : failure == 'initialize'
                  ? ['app']
                  : ['app', 'memory'],
        );
      },
    );
  }

  Future<String> token({
    bool available = true,
    void Function()? current,
    Future<WebGoogleIdentity> Function()? popup,
    String? Function()? currentUid,
    void Function(String)? acquired,
  }) =>
      acquireWebGoogleToken(
        available: available,
        requireCurrent: current ?? () {},
        popup: popup ??
            () async => WebGoogleIdentity(
                  uid: 'synthetic-a',
                  readFreshIdToken: () async => 'synthetic-firebase-token',
                ),
        currentFirebaseUid: currentUid ?? () => 'synthetic-a',
        acquired: acquired ?? (_) {},
        providerErrorCode: (error) =>
            error is SyntheticProviderError ? error.code : null,
      );

  test('disabled Google never invokes popup', () async {
    var called = false;
    await expectLater(
      token(
        available: false,
        popup: () async {
          called = true;
          throw StateError('unexpected');
        },
      ),
      throwsA(isA<WebGoogleAuthFailure>()),
    );
    expect(called, isFalse);
  });
  test(
    'untyped provider-looking error cannot forge popup cancellation',
    () async {
      await expectLater(
        token(popup: () async => throw StateError('popup-closed-by-user')),
        throwsA(
          isA<WebGoogleAuthFailure>()
              .having((error) => error.cancelled, 'cancelled', isFalse)
              .having((error) => error.code, 'code', 'popup_unavailable'),
        ),
      );
    },
  );
  for (final code in [
    'popup-closed-by-user',
    'cancelled-popup-request',
    'web-context-cancelled',
    'canceled',
    'popup-blocked',
    'unauthorized-domain',
    'network-request-failed',
    'operation-not-allowed',
  ]) {
    test(
      'popup $code has a sanitized cancellation/error outcome and no backend call',
      () async {
        var remoteCalled = false;
        await expectLater(
          const RemoteAuthAttemptTransaction<String, String, String>().run(
            preflightCurrent: () => true,
            actionCurrent: () => true,
            acquire: () =>
                token(popup: () async => throw SyntheticProviderError(code)),
            invokeRemote: (_) async {
              remoteCalled = true;
              return 'unexpected';
            },
            persist: (value) async => value,
            discardRemote: (_) async {},
            persistedCurrent: (_) async => true,
            discardPersisted: (_) async {},
          ),
          throwsA(
            isA<WebGoogleAuthFailure>()
                .having(
                  (error) => error.cancelled,
                  'cancelled',
                  const {
                    'popup-closed-by-user',
                    'cancelled-popup-request',
                    'web-context-cancelled',
                    'canceled',
                  }.contains(code),
                )
                .having(
                    (error) => error.code,
                    'sanitized code',
                    switch (code) {
                      'popup-blocked' => 'popup_blocked',
                      'network-request-failed' => 'network_request_failed',
                      'popup-closed-by-user' ||
                      'cancelled-popup-request' ||
                      'web-context-cancelled' ||
                      'canceled' =>
                        'popup_cancelled',
                      _ => 'popup_unavailable',
                    }),
          ),
        );
        expect(remoteCalled, isFalse);
      },
    );
  }
  test(
    'only the backend response becomes a session, never the Firebase credential',
    () async {
      final events = <String>[];
      final result =
          await const RemoteAuthAttemptTransaction<String, String, String>()
              .run(
        preflightCurrent: () => true,
        actionCurrent: () => true,
        acquire: () => token(acquired: (_) => events.add('owned')),
        invokeRemote: (idToken) async {
          expect(idToken, 'synthetic-firebase-token');
          events.add('exchange');
          return 'backend-owned-session';
        },
        persist: (value) async {
          events.add('persist');
          return value;
        },
        discardRemote: (_) async {},
        persistedCurrent: (_) async => true,
        discardPersisted: (_) async {},
      );
      expect(result, 'backend-owned-session');
      expect(events, ['owned', 'exchange', 'persist']);
    },
  );
  test(
    'UI loss after popup still records cleanup ownership but never exchanges',
    () async {
      var current = true;
      String? cleanupUid;
      var remoteCalled = false;
      await expectLater(
        const RemoteAuthAttemptTransaction<String, String, String>().run(
          preflightCurrent: () => current,
          actionCurrent: () => current,
          acquire: () => token(
            current: () {
              if (!current) throw const RemoteAuthAttemptSuperseded();
            },
            popup: () async {
              current = false;
              return WebGoogleIdentity(
                uid: 'synthetic-a',
                readFreshIdToken: () async => 'unused',
              );
            },
            acquired: (uid) => cleanupUid = uid,
          ),
          invokeRemote: (_) async {
            remoteCalled = true;
            return 'unused';
          },
          persist: (value) async => value,
          discardRemote: (_) async {},
          persistedCurrent: (_) async => true,
          discardPersisted: (_) async {},
        ),
        throwsA(isA<RemoteAuthAttemptSuperseded>()),
      );
      expect(cleanupUid, 'synthetic-a');
      expect(remoteCalled, isFalse);
    },
  );
  test(
    'principal change during token acquisition and empty token both fail closed',
    () async {
      var uid = 'synthetic-a';
      await expectLater(
        token(
          currentUid: () => uid,
          popup: () async => WebGoogleIdentity(
            uid: uid,
            readFreshIdToken: () async {
              uid = 'synthetic-b';
              return 'stale';
            },
          ),
        ),
        throwsA(isA<RemoteAuthAttemptSuperseded>()),
      );
      await expectLater(
        token(
          popup: () async => WebGoogleIdentity(
            uid: 'synthetic-a',
            readFreshIdToken: () async => null,
          ),
        ),
        throwsA(isA<WebGoogleAuthFailure>()),
      );
    },
  );
}
