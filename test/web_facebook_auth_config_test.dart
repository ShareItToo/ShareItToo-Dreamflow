import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/web_facebook_auth_config.dart';
import 'package:lendify/services/web_firebase_auth_startup.dart';
import 'package:lendify/services/web_google_auth.dart';
import 'web_apple_direct_config_test.dart' as apple_fixture;
import 'web_google_auth_test.dart' as google_fixture;

const origin = WebGooglePublicConfig.stagingOrigin;
final now = DateTime.utc(2026, 10, 3, 12);
String digest(String text) => sha256.convert(utf8.encode(text)).toString();

WebFacebookPublicConfig facebookConfig({
  Map<String, String> changes = const {},
  bool approved = true,
}) {
  final v = {
    'project': 'synthetic-project',
    'sender': '123456789012',
    'app': '1:123456789012:web:0123456789abcdef',
    'key': ['AIza', List.filled(35, 'x').join()].join(),
    'domain': 'synthetic-project.firebaseapp.com',
    'backend': 'synthetic-project',
    'origin': origin,
    ...changes,
  };
  WebFacebookPublicConfig make(String approval) => WebFacebookPublicConfig(
        projectId: v['project']!,
        messagingSenderId: v['sender']!,
        appId: v['app']!,
        apiKey: v['key']!,
        authDomain: v['domain']!,
        backendProjectId: v['backend']!,
        authorizedOrigin: v['origin']!,
        approvedDigest: approval,
      );
  return make(approved ? make('').publicConfigDigest : '');
}

WebGooglePublicConfig googleConfig() {
  final f = facebookConfig();
  return WebGooglePublicConfig(
    projectId: f.projectId,
    messagingSenderId: f.messagingSenderId,
    appId: f.appId,
    apiKey: f.apiKey,
    authDomain: f.authDomain,
    backendProjectId: f.backendProjectId,
    authorizedOrigin: f.authorizedOrigin,
    approvedDigest: f.approvedDigest,
  );
}

Map<String, Object?> evidence(WebFacebookPublicConfig f) => {
      'schemaVersion': 1,
      'provider': 'facebook',
      'platform': 'web',
      'origin': origin,
      'backendFirebaseProjectId': f.backendProjectId,
      'webAppConfigSha256': f.publicConfigDigest,
      'callbackUrl': 'https://${f.authDomain}/__/auth/handler',
      'firebaseProviderEnabled': true,
      'metaAppMode': 'development',
      'audience': 'app_roles_only',
      'audienceVerified': true,
      'providerReadbackSha256': digest('synthetic-readback-no-live-claim'),
      'observedAtUtc': '2026-10-03T11:00:00Z',
      'validUntilUtc': '2026-10-03T13:00:00Z',
    };

WebFirebaseAuthSelection select({
  bool google = false,
  bool facebook = true,
  bool validated = true,
  bool backend = true,
  String atOrigin = origin,
  String api = '$origin/api/v1',
  WebFacebookPublicConfig? config,
  WebGooglePublicConfig? googlePublicConfig,
  String? rawEvidence,
  String? approval,
  DateTime? clock,
}) {
  final f = config ?? facebookConfig();
  final raw = rawEvidence ?? jsonEncode(evidence(f));
  final g = googlePublicConfig ?? googleConfig();
  final googleBound = google_fixture.googleEvidence(g, at: clock ?? now);
  return selectWebFirebaseAuth(
    googleConfig: g,
    facebookConfig: f,
    googleEnabled: google,
    facebookEnabled: facebook,
    activationValidated: validated,
    backendEnabled: backend,
    apiBaseUrl: api,
    origin: atOrigin,
    googleReadinessJson: googleBound.readinessJson,
    googleReadinessDigest: googleBound.readinessDigest,
    googleDecisionJson: googleBound.decisionJson,
    googleDecisionDigest: googleBound.decisionDigest,
    googleEvidenceDigest: googleBound.evidenceDigest,
    googleSourceCommit: googleBound.sourceCommit,
    facebookReadinessJson: raw,
    facebookReadinessDigest: approval ?? digest(raw),
    now: clock ?? now,
  );
}

void main() {
  test('all-off and missing validation/config/readback stay unavailable', () {
    for (final selection in [
      select(facebook: false),
      select(validated: false),
      select(backend: false),
      select(config: facebookConfig(approved: false)),
      select(rawEvidence: ''),
      select(approval: ''),
      select(approval: digest('stale approval')),
    ]) {
      expect(selection.options, isNull);
      expect(selection.google, isFalse);
      expect(selection.facebook, isFalse);
    }
  });

  test('Google-only exactly preserves previous options without FB approval',
      () {
    final chosen = select(
        google: true,
        facebook: false,
        validated: true,
        rawEvidence: '',
        approval: '');
    final previous = google_fixture.verifiedOptions(googleConfig());
    expect(chosen.options!.asMap, previous!.asMap);
    expect(chosen.google, isTrue);
    expect(chosen.facebook, isFalse);
  });

  test('Facebook-only is independent; both require the exact same app', () {
    final fb = select();
    expect(fb.options?.projectId, 'synthetic-project');
    expect(fb.google, isFalse);
    expect(fb.facebook, isTrue);
    final both = select(google: true);
    expect(both.options!.asMap, fb.options!.asMap);
    expect(both.google && both.facebook, isTrue);
    expect(select(google: true, validated: false).google, isFalse);
    expect(select(google: true, rawEvidence: '').google, isTrue);
  });

  test('missing Google approval cannot disable independently approved Facebook',
      () {
    const missingGoogle = WebGooglePublicConfig(
        projectId: '',
        messagingSenderId: '',
        appId: '',
        apiKey: '',
        authDomain: '',
        backendProjectId: '',
        authorizedOrigin: '',
        approvedDigest: '');
    expect(select(googlePublicConfig: missingGoogle).facebook, isTrue);
    expect(select(google: true, googlePublicConfig: missingGoogle).facebook,
        isTrue);
    expect(
        select(
                google: true,
                facebook: false,
                config: facebookConfig(approved: false),
                rawEvidence: 'invalid')
            .google,
        isTrue);
  });

  test(
      'expired Facebook approval preserves Google but never borrows its approval',
      () {
    final selected = select(google: true, clock: DateTime.utc(2026, 10, 3, 13));
    expect(selected.google, isTrue);
    expect(selected.facebook, isFalse);
    expect(selected.options!.asMap,
        select(google: true, facebook: false).options!.asMap);
    final foreign = facebookConfig(changes: {
      'project': 'foreign-project',
      'backend': 'foreign-project',
      'domain': 'foreign-project.firebaseapp.com'
    });
    expect(
        select(
                google: true,
                config: foreign,
                clock: DateTime.utc(2026, 10, 3, 13))
            .options,
        isNull);
  });

  test(
      'expired or missing Facebook approval preserves independently approved Apple',
      () {
    final apple = apple_fixture.directConfig();
    final appleRaw = jsonEncode(apple_fixture.evidence(apple));
    final fb = facebookConfig();
    final googleBound =
        google_fixture.googleEvidence(googleConfig(), at: apple_fixture.now);
    for (final raw in ['', jsonEncode(evidence(fb))]) {
      final selected = selectWebFirebaseAuth(
          googleConfig: googleConfig(),
          facebookConfig: fb,
          googleEnabled: true,
          facebookEnabled: true,
          activationValidated: true,
          backendEnabled: true,
          apiBaseUrl: '$origin/api/v1',
          origin: origin,
          googleReadinessJson: googleBound.readinessJson,
          googleReadinessDigest: googleBound.readinessDigest,
          googleDecisionJson: googleBound.decisionJson,
          googleDecisionDigest: googleBound.decisionDigest,
          googleEvidenceDigest: googleBound.evidenceDigest,
          googleSourceCommit: googleBound.sourceCommit,
          facebookReadinessJson: raw,
          facebookReadinessDigest: digest(raw),
          now: apple_fixture.now,
          appleConfig: apple,
          appleEnabled: true,
          appleReadinessJson: appleRaw,
          appleReadinessDigest: digest(appleRaw));
      expect(selected.facebook, isFalse);
      expect(selected.google, isTrue);
      expect(selected.apple, isTrue);
    }
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
    {'backend': 'foreign-project'},
    {'domain': 'foreign.invalid'},
    {'origin': 'https://shareittoo.com'},
    {'key': 'invalid'},
  ]) {
    test('reapproved malformed public config rejected: $mutation', () {
      expect(select(config: facebookConfig(changes: mutation)).options, isNull);
    });
  }

  for (final mutation in <Map<String, String>>[
    {'app': '1:123456789012:web:abcdef0123456789'},
    {
      'key': ['AIza', List.filled(35, 'y').join()].join()
    },
    {
      'project': 'foreign-project',
      'backend': 'foreign-project',
      'domain': 'foreign-project.firebaseapp.com'
    },
    {'sender': '234567890123', 'app': '1:234567890123:web:0123456789abcdef'},
  ]) {
    test(
        'individually approved conflicting app fails before SDK: ${mutation.keys}',
        () async {
      final f = facebookConfig(changes: mutation);
      expect(select(config: f).options, isNotNull);
      final both = select(google: true, config: f);
      expect(both.options, isNull);
      final calls = <String>[];
      expect(
          await prepareWebFirebaseAuth(
              selection: both,
              initializeBoundApp: (_) async => calls.add('app'),
              useMemoryPersistence: () async => calls.add('memory')),
          isFalse);
      expect(calls, isEmpty);
    });
  }

  final f = facebookConfig();
  for (final key in evidence(f).keys) {
    test('missing readiness field $key rejects even newly approved evidence',
        () {
      final incomplete = evidence(f)..remove(key);
      expect(select(rawEvidence: jsonEncode(incomplete)).options, isNull);
    });
  }
  for (final mutation in <Map<String, Object?>>[
    {'schemaVersion': 2},
    {'schemaVersion': 1.0},
    {'provider': 'google'},
    {'provider': 'apple'},
    {'platform': 'android'},
    {'platform': 'ios'},
    {'origin': 'https://shareittoo.com'},
    {'backendFirebaseProjectId': 'foreign-project'},
    {'webAppConfigSha256': digest('foreign config')},
    {'callbackUrl': 'https://foreign.invalid/__/auth/handler'},
    {'callbackUrl': 'https://${f.authDomain}/__/auth/handler/'},
    {'firebaseProviderEnabled': false},
    {'firebaseProviderEnabled': 'true'},
    {'metaAppMode': 'live'},
    {'metaAppMode': 'unknown'},
    {'audience': 'public'},
    {'audienceVerified': false},
    {'audienceVerified': 'true'},
    {'providerReadbackSha256': ''},
    {'providerReadbackSha256': true},
    {'observedAtUtc': '2026-10-03T12:00:01Z'},
    {'validUntilUtc': '2026-10-03T12:00:00Z'},
    {'validUntilUtc': '2026-10-03T10:00:00Z'},
    {'observedAtUtc': '2026-09-31T11:00:00Z'},
    {'observedAtUtc': '2026-10-03T11:00:00+00:00'},
    {'validUntilUtc': null},
    {'extraField': 'not-permitted'},
  ]) {
    test('foreign/stale/unverified evidence fails closed: $mutation', () {
      expect(
          select(rawEvidence: jsonEncode({...evidence(f), ...mutation}))
              .options,
          isNull);
    });
  }
  for (final raw in ['{', '[]', 'null', 'true', '"not-evidence"']) {
    test('malformed readiness shape $raw fails without throwing', () {
      expect(select(rawEvidence: raw).options, isNull);
    });
  }
  test('stale digest cannot authorize changed evidence/config', () {
    final old = jsonEncode(evidence(f));
    final changed =
        jsonEncode({...evidence(f), 'validUntilUtc': '2026-10-04T13:00:00Z'});
    expect(select(rawEvidence: changed, approval: digest(old)).options, isNull);
    expect(
        select(
                config: facebookConfig(changes: {'app': '${f.appId}a'}),
                rawEvidence: old)
            .options,
        isNull);
  });
  test('freshness bounds are start inclusive, end exclusive, no clock default',
      () {
    expect(select(clock: DateTime.utc(2026, 10, 3, 11)).options, isNotNull);
    expect(
        select(clock: DateTime.utc(2026, 10, 3, 10, 59, 59)).options, isNull);
    expect(select(clock: DateTime.utc(2026, 10, 3, 12, 59, 59)).options,
        isNotNull);
    expect(select(clock: DateTime.utc(2026, 10, 3, 13)).options, isNull);
  });
  test('exact backend and origin, never local/prod/lookalike origins', () {
    for (final other in [
      'http://localhost:8080',
      'https://shareittoo.com',
      '$origin.evil.invalid',
      '$origin/',
      'http://staging.shareittoo.com'
    ]) {
      expect(select(atOrigin: other).options, isNull);
      expect(select(api: '$other/api/v1').options, isNull);
    }
  });
  test('Firebase existing-app comparison binds every Firebase auth option', () {
    final a = select().options!;
    expect(sameWebFirebaseApp(a, a), isTrue);
    for (final field in [
      'projectId',
      'appId',
      'apiKey',
      'authDomain',
      'messagingSenderId'
    ]) {
      final values = Map<String, String?>.from(a.asMap);
      values[field] = 'foreign';
      expect(
          sameWebFirebaseApp(
              a,
              FirebaseOptions(
                  apiKey: values['apiKey']!,
                  appId: values['appId']!,
                  projectId: values['projectId']!,
                  authDomain: values['authDomain'],
                  messagingSenderId: values['messagingSenderId']!)),
          isFalse);
    }
  });
  for (final failure in ['none', 'unavailable', 'app', 'memory']) {
    test('startup $failure is ordered, fail-closed and auth-only', () async {
      final calls = <String>[];
      final chosen =
          failure == 'unavailable' ? select(validated: false) : select();
      final result = await prepareWebFirebaseAuth(
          selection: chosen,
          initializeBoundApp: (options) async {
            expect(identical(options, chosen.options), isTrue);
            calls.add('app');
            if (failure == 'app') throw StateError('synthetic');
          },
          useMemoryPersistence: () async {
            calls.add('memory');
            if (failure == 'memory') throw StateError('synthetic');
          });
      expect(result, failure == 'none');
      expect(
          calls,
          failure == 'unavailable'
              ? []
              : failure == 'app'
                  ? ['app']
                  : ['app', 'memory']);
    });
  }
  test('startup captures options, not user identity or a principal session',
      () async {
    final gate = Completer<void>();
    var unrelatedPrincipal = 'synthetic-old';
    final chosen = select();
    final calls = <String>[];
    final pending = prepareWebFirebaseAuth(
        selection: chosen,
        initializeBoundApp: (options) async {
          expect(identical(options, chosen.options), isTrue);
          calls.add('app');
          await gate.future;
        },
        useMemoryPersistence: () async {
          calls.add('memory');
        });
    unrelatedPrincipal = 'synthetic-new';
    gate.complete();
    expect(await pending, isTrue);
    expect(unrelatedPrincipal, 'synthetic-new');
    expect(calls, ['app', 'memory']);
    // A startup success never yields an acquired user/token/backend session.
    expect(chosen.facebook, isTrue);
  });
}
