import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/web_apple_auth_config.dart';

const origin = WebApplePublicConfig.stagingOrigin;
final now = DateTime.utc(2026, 10, 3, 12);
String digest(String value) => sha256.convert(utf8.encode(value)).toString();

WebApplePublicConfig config({Map<String, String> changes = const {}}) {
  final v = {
    'projectId': 'synthetic-project',
    'messagingSenderId': '123456789012',
    'appId': '1:123456789012:web:0123456789abcdef',
    'apiKey': ['AIza', List.filled(35, 'x').join()].join(),
    'authDomain': 'synthetic-project.firebaseapp.com',
    'backendProjectId': 'synthetic-project',
    'authorizedOrigin': origin,
    ...changes,
  };
  return WebApplePublicConfig(
    projectId: v['projectId']!,
    messagingSenderId: v['messagingSenderId']!,
    appId: v['appId']!,
    apiKey: v['apiKey']!,
    authDomain: v['authDomain']!,
    backendProjectId: v['backendProjectId']!,
    authorizedOrigin: v['authorizedOrigin']!,
    approvedDigest: digest(jsonEncode(v)),
  );
}

Map<String, Object?> evidence(WebApplePublicConfig c) => {
      'schemaVersion': 1,
      'provider': 'apple',
      'platform': 'web',
      'origin': origin,
      'apiBaseUrl': '$origin/api/v1',
      'backendFirebaseProjectId': c.backendProjectId,
      'webAppConfigSha256': c.publicConfigDigest,
      'callbackUrl': 'https://${c.authDomain}/__/auth/handler',
      'firebaseProviderEnabled': true,
      'firebaseAppleOAuthConfigured': true,
      'appleServicesIdSha256': digest('synthetic-services'),
      'firebaseAppleServicesIdSha256': digest('synthetic-services'),
      'appleTeamIdSha256': digest('synthetic-team'),
      'firebaseAppleTeamIdSha256': digest('synthetic-team'),
      'appleKeyIdSha256': digest('synthetic-key-id'),
      'firebaseAppleKeyIdSha256': digest('synthetic-key-id'),
      'applePrimaryAppSignInEnabled': true,
      'appleServicesIdBoundToPrimaryApp': true,
      'appleSigningKeyEnabled': true,
      'appleRedirectDomainSha256': digest(c.authDomain),
      'appleRedirectDomainVerified': true,
      'appleReturnUrlVerified': true,
      'scope': 'private_pilot',
      'audience': 'existing_allowlisted_accounts_only',
      'audienceVerified': true,
      'providerReadbackSha256': digest('synthetic-sanitized-readback'),
      'observedAtUtc': '2026-10-03T11:00:00Z',
      'validUntilUtc': '2026-10-03T13:00:00Z',
    };

FirebaseOptions? select({
  WebApplePublicConfig? publicConfig,
  bool apple = true,
  bool validated = true,
  bool backend = true,
  String atOrigin = origin,
  String api = '$origin/api/v1',
  String? raw,
  String? approval,
  DateTime? clock,
}) {
  final c = publicConfig ?? config();
  final json = raw ?? jsonEncode(evidence(c));
  return c.optionsFor(
    appleEnabled: apple,
    activationValidated: validated,
    backendEnabled: backend,
    origin: atOrigin,
    apiBaseUrl: api,
    readinessJson: json,
    approvedReadinessDigest: approval ?? digest(json),
    now: clock ?? now,
  );
}

void main() {
  test('empty configuration and all omitted gates stay OFF', () {
    const empty = WebApplePublicConfig();
    expect(empty.isBound, isFalse);
    expect(empty.optionsFor(now: now), isNull);
    expect(config().optionsFor(now: now), isNull);
    for (final result in [
      select(publicConfig: empty),
      select(apple: false),
      select(validated: false),
      select(backend: false),
      select(raw: ''),
      select(approval: ''),
      select(approval: digest('other')),
    ]) {
      expect(result, isNull);
    }
  });

  test('synthetic independently bound Apple config yields exact options only',
      () {
    final c = config();
    final result = select()!;
    expect(result.projectId, c.projectId);
    expect(result.appId, c.appId);
    expect(result.messagingSenderId, c.messagingSenderId);
    expect(result.apiKey, c.apiKey);
    expect(result.authDomain, c.authDomain);
    expect(select(), isNotNull); // No Google/Facebook inputs or approvals.
  });

  for (final field in [
    'projectId',
    'messagingSenderId',
    'appId',
    'apiKey',
    'authDomain',
    'backendProjectId',
    'authorizedOrigin',
  ]) {
    test('missing public $field rejects even with recomputed approval', () {
      expect(select(publicConfig: config(changes: {field: ''})), isNull);
    });
  }
  for (final mutation in <Map<String, String>>[
    {'projectId': 'Invalid-project'},
    {'messagingSenderId': '12345'},
    {'appId': '1:123456789012:ios:0123456789abcdef'},
    {'appId': '1:987654321012:web:0123456789abcdef'},
    {'apiKey': 'invalid'},
    {'authDomain': 'foreign.firebaseapp.com'},
    {'backendProjectId': 'foreign-project'},
    {'authorizedOrigin': 'https://shareittoo.com'},
  ]) {
    test('malformed or foreign public config rejects: $mutation', () {
      expect(select(publicConfig: config(changes: mutation)), isNull);
    });
  }
  test('approved config digest rejects stale and malformed bindings', () {
    final c = config();
    WebApplePublicConfig copy(String approval) => WebApplePublicConfig(
          projectId: c.projectId,
          messagingSenderId: c.messagingSenderId,
          appId: c.appId,
          apiKey: c.apiKey,
          authDomain: c.authDomain,
          backendProjectId: c.backendProjectId,
          authorizedOrigin: c.authorizedOrigin,
          approvedDigest: approval,
        );
    for (final approval in [
      '',
      digest('foreign'),
      c.approvedDigest.toUpperCase()
    ]) {
      expect(select(publicConfig: copy(approval)), isNull);
    }
  });
  for (final endpoint in [
    '',
    'http://staging.shareittoo.com',
    'https://shareittoo.com',
    '$origin/',
    '$origin:443',
    '$origin?x=1',
    '$origin.evil.invalid',
  ]) {
    test('exact origin and API only: $endpoint', () {
      expect(select(atOrigin: endpoint), isNull);
      expect(select(api: '$endpoint/api/v1'), isNull);
    });
  }
  test('API suffix cannot change', () {
    for (final api in [
      '$origin/api',
      '$origin/api/v1/',
      '$origin/api/v1?x=1'
    ]) {
      expect(select(api: api), isNull);
    }
  });

  final valid = evidence(config());
  for (final key in valid.keys) {
    test('missing or null readiness field $key fails closed', () {
      expect(select(raw: jsonEncode({...valid}..remove(key))), isNull);
      expect(select(raw: jsonEncode({...valid, key: null})), isNull);
    });
    if (valid[key] == true) {
      test('readiness boolean $key cannot be false/string/integer', () {
        for (final value in [false, 'true', 1]) {
          expect(select(raw: jsonEncode({...valid, key: value})), isNull);
        }
      });
    }
    if (key.endsWith('Sha256')) {
      test('readiness hash $key must be lowercase SHA256', () {
        for (final value in ['', 'not-a-hash', true, 'A' * 64]) {
          expect(select(raw: jsonEncode({...valid, key: value})), isNull);
        }
      });
    }
  }
  for (final mutation in <Map<String, Object?>>[
    {'schemaVersion': 2},
    {'schemaVersion': 1.0},
    {'schemaVersion': '1'},
    {'provider': 'google'},
    {'provider': 'facebook'},
    {'platform': 'ios'},
    {'origin': 'https://shareittoo.com'},
    {'apiBaseUrl': '$origin/api/v1/'},
    {'backendFirebaseProjectId': 'foreign-project'},
    {'webAppConfigSha256': digest('other-config')},
    {'callbackUrl': 'https://foreign.invalid/__/auth/handler'},
    {
      'callbackUrl':
          'https://synthetic-project.firebaseapp.com/__/auth/handler/'
    },
    {'appleServicesIdSha256': digest('other-services')},
    {'appleTeamIdSha256': digest('other-team')},
    {'appleKeyIdSha256': digest('other-key')},
    {'firebaseAppleServicesIdSha256': digest('other-services')},
    {'firebaseAppleTeamIdSha256': digest('other-team')},
    {'firebaseAppleKeyIdSha256': digest('other-key')},
    {'appleRedirectDomainSha256': digest('staging.shareittoo.com')},
    {'scope': 'public'},
    {'audience': 'public'},
    {'audience': 'new_accounts'},
    {'observedAtUtc': '2026-10-03T12:00:01Z'},
    {'validUntilUtc': '2026-10-03T12:00:00Z'},
    {'validUntilUtc': '2026-10-03T11:00:00Z'},
    {'validUntilUtc': '2026-10-03T10:00:00Z'},
    {'validUntilUtc': '2026-10-04T11:00:01Z'},
    {'observedAtUtc': '2026-09-31T11:00:00Z'},
    {'observedAtUtc': '2026-10-03T11:00:00+00:00'},
    {'observedAtUtc': '2026-10-03T11:00:00.000Z'},
    {'validUntilUtc': '2026-10-03T25:00:00Z'},
    {'unknown': true},
    {'accountEmail': 'synthetic@example.invalid'},
  ]) {
    test('reapproved invalid readiness rejected: ${mutation.keys}', () {
      expect(select(raw: jsonEncode({...valid, ...mutation})), isNull);
    });
  }
  test('freshness boundaries inclusive observation, exclusive expiry, max 24h',
      () {
    expect(select(clock: DateTime.utc(2026, 10, 3, 11)), isNotNull);
    expect(select(clock: DateTime.utc(2026, 10, 3, 13)), isNull);
    expect(select(clock: DateTime.utc(2026, 10, 2)), isNull);
    expect(select(clock: DateTime.utc(2026, 10, 4)), isNull);
    expect(
        select(
            raw: jsonEncode({
          ...valid,
          'validUntilUtc': '2026-10-04T11:00:00Z',
        })),
        isNotNull);
  });
  test('malformed, duplicate, extra and noncanonical JSON rejects', () {
    final raw = jsonEncode(valid);
    for (final bad in [
      'null',
      '[]',
      'true',
      '42',
      '{',
      '$raw\n',
      ' $raw',
      '{"provider":"apple",${raw.substring(1)}',
      raw.replaceFirst('"schemaVersion":1', '"schemaVersion": 1'),
      jsonEncode({'huge': 'x' * 8193}),
    ]) {
      expect(select(raw: bad), isNull);
    }
    expect(select(raw: raw, approval: digest('$raw\n')), isNull);
  });
}
