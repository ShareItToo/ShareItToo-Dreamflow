import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/web_apple_auth_config.dart';
import 'package:lendify/services/web_facebook_auth_config.dart';
import 'package:lendify/services/web_firebase_auth_startup.dart';
import 'package:lendify/services/web_google_auth.dart';

const origin = 'https://staging.shareittoo.com';
const redirect = '$origin/auth/apple/callback';
const clientId = 'com.shareittoo.synthetic.web';
final now = DateTime.utc(2026, 10, 4, 12);
String digest(String value) => sha256.convert(utf8.encode(value)).toString();

WebAppleDirectPublicConfig directConfig({
  Map<String, String> changes = const {},
  bool approved = true,
}) {
  final values = {
    'projectId': 'synthetic-project',
    'messagingSenderId': '123456789012',
    'appId': '1:123456789012:web:0123456789abcdef',
    'apiKey': ['AIza', List.filled(35, 'x').join()].join(),
    'authDomain': 'synthetic-project.firebaseapp.com',
    'backendProjectId': 'synthetic-project',
    'authorizedOrigin': origin,
    'clientId': clientId,
    'redirectUri': redirect,
    ...changes,
  };
  WebAppleDirectPublicConfig make(String approval) =>
      WebAppleDirectPublicConfig(
        projectId: values['projectId']!,
        messagingSenderId: values['messagingSenderId']!,
        appId: values['appId']!,
        apiKey: values['apiKey']!,
        authDomain: values['authDomain']!,
        backendProjectId: values['backendProjectId']!,
        authorizedOrigin: values['authorizedOrigin']!,
        clientId: values['clientId']!,
        redirectUri: values['redirectUri']!,
        approvedDigest: approval,
      );
  final pending = make('');
  return make(approved ? pending.publicConfigDigest : '');
}

Map<String, Object?> evidence(WebAppleDirectPublicConfig config) => {
      'schemaVersion': 2,
      'provider': 'apple',
      'platform': 'web_direct',
      'origin': origin,
      'apiBaseUrl': '$origin/api/v1',
      'backendFirebaseProjectId': config.backendProjectId,
      'webAppConfigSha256': config.publicConfigDigest,
      'callbackUrl': config.redirectUri,
      'firebaseProviderEnabled': true,
      'firebaseAppleOAuthConfigured': true,
      'appleServicesIdSha256': digest(config.clientId),
      'firebaseAppleServicesIdSha256': digest(config.clientId),
      'backendAppleServicesIdSha256': digest(config.clientId),
      'backendAppleOwnershipConfigured': true,
      'backendAppleAcquisitionEnabled': true,
      'appleTeamIdSha256': digest('synthetic-team'),
      'firebaseAppleTeamIdSha256': digest('synthetic-team'),
      'appleKeyIdSha256': digest('synthetic-key'),
      'firebaseAppleKeyIdSha256': digest('synthetic-key'),
      'applePrimaryAppSignInEnabled': true,
      'appleServicesIdBoundToPrimaryApp': true,
      'appleSigningKeyEnabled': true,
      'appleRedirectDomainSha256': digest('staging.shareittoo.com'),
      'backendAppleRedirectUriSha256': digest(redirect),
      'appleRedirectDomainVerified': true,
      'appleReturnUrlVerified': true,
      'scope': 'private_pilot',
      'audience': 'existing_allowlisted_accounts_only',
      'audienceVerified': true,
      'providerReadbackSha256': digest('synthetic-sanitized-readback'),
      'observedAtUtc': '2026-10-04T11:00:00Z',
      'validUntilUtc': '2026-10-04T13:00:00Z',
    };

WebApplePreparedConfig? prepare({
  WebAppleDirectPublicConfig? config,
  bool enabled = true,
  bool activated = true,
  bool backend = true,
  Map<String, Object?>? changedEvidence,
}) {
  final selected = config ?? directConfig();
  final value = {...evidence(selected), ...?changedEvidence};
  final raw = jsonEncode(value);
  return selected.configurationFor(
    appleEnabled: enabled,
    activationValidated: activated,
    backendEnabled: backend,
    apiBaseUrl: '$origin/api/v1',
    origin: origin,
    readinessJson: raw,
    approvedReadinessDigest: digest(raw),
    now: now,
  );
}

void main() {
  test('direct Apple config is independently bound and valid only after gates',
      () {
    final selected = prepare()!;
    expect(selected.firebaseOptions.projectId, 'synthetic-project');
    expect(selected.direct.clientId, clientId);
    expect(selected.direct.redirectUri, redirect);
    expect(prepare(enabled: false), isNull);
    expect(prepare(activated: false), isNull);
    expect(prepare(backend: false), isNull);
    expect(prepare(config: const WebAppleDirectPublicConfig()), isNull);
  });

  for (final change in <Map<String, Object?>>[
    {'schemaVersion': 1},
    {'platform': 'web'},
    {
      'callbackUrl': 'https://synthetic-project.firebaseapp.com/__/auth/handler'
    },
    {'appleServicesIdSha256': digest('foreign-client')},
    {'backendAppleServicesIdSha256': digest('foreign-client')},
    {'backendAppleOwnershipConfigured': false},
    {'backendAppleAcquisitionEnabled': false},
    {'appleRedirectDomainSha256': digest('synthetic-project.firebaseapp.com')},
    {'backendAppleRedirectUriSha256': digest('$redirect/')},
    {'audience': 'new_accounts'},
  ]) {
    test('direct readiness mismatch fails closed: ${change.keys.single}', () {
      expect(prepare(changedEvidence: change), isNull);
    });
  }

  test('historical Firebase-handler approval cannot activate direct flow', () {
    final config = directConfig();
    final historical = evidence(config)
      ..['schemaVersion'] = 1
      ..['platform'] = 'web'
      ..['callbackUrl'] = 'https://${config.authDomain}/__/auth/handler';
    expect(prepare(changedEvidence: historical), isNull);
  });

  test('startup selects Apple only and rejects Firebase app mismatch', () {
    final apple = directConfig();
    final raw = jsonEncode(evidence(apple));
    const emptyFacebook = WebFacebookPublicConfig(
      projectId: '',
      messagingSenderId: '',
      appId: '',
      apiKey: '',
      authDomain: '',
      backendProjectId: '',
      authorizedOrigin: '',
      approvedDigest: '',
    );
    const emptyGoogle = WebGooglePublicConfig(
      projectId: '',
      messagingSenderId: '',
      appId: '',
      apiKey: '',
      authDomain: '',
      backendProjectId: '',
      authorizedOrigin: '',
      approvedDigest: '',
    );
    final selected = selectWebFirebaseAuth(
      googleConfig: emptyGoogle,
      facebookConfig: emptyFacebook,
      googleEnabled: false,
      facebookEnabled: false,
      activationValidated: true,
      backendEnabled: true,
      apiBaseUrl: '$origin/api/v1',
      origin: origin,
      facebookReadinessJson: '',
      facebookReadinessDigest: '',
      now: now,
      appleConfig: apple,
      appleEnabled: true,
      appleReadinessJson: raw,
      appleReadinessDigest: digest(raw),
    );
    expect(selected.apple, isTrue);
    expect(selected.google || selected.facebook, isFalse);
    expect(selected.appleDirect?.redirectUri, redirect);
  });
}
