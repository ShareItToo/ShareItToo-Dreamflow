import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/web_apple_auth_config.dart';

void main() {
  test('actual Node builder profile is accepted by Direct-Web Dart runtime',
      () {
    // Pure synthetic public configuration. This executes the real builder
    // profile/binding code; no Apple, Firebase or backend requests are made.
    final result = Process.runSync('node', [
      '--input-type=module',
      '-e',
      '''
import { profile } from './tool/staging_web_contract.mjs';
import { syntheticAppleBinding } from './test/tool/staging_apple_web_readiness_fixture.mjs';
const source = 'a'.repeat(40);
const apple = syntheticAppleBinding(source, { now: new Date('2026-10-04T12:00:00Z') });
console.log(JSON.stringify(profile(source, '1.0.0+2026092905', null, null, null, apple)));
''',
    ]);
    expect(result.exitCode, 0, reason: '${result.stderr}');
    final p = Map<String, dynamic>.from(jsonDecode(result.stdout as String));
    final config = WebAppleDirectPublicConfig(
      projectId: p['SIT_APPLE_WEB_PROJECT_ID'],
      messagingSenderId: p['SIT_APPLE_WEB_SENDER_ID'],
      appId: p['SIT_APPLE_WEB_APP_ID'],
      apiKey: p['SIT_APPLE_WEB_API_KEY'],
      authDomain: p['SIT_APPLE_WEB_AUTH_DOMAIN'],
      backendProjectId: p['SIT_APPLE_WEB_BACKEND_PROJECT_ID'],
      authorizedOrigin: p['SIT_APPLE_WEB_ORIGIN'],
      clientId: p['SIT_APPLE_WEB_CLIENT_ID'],
      redirectUri: p['SIT_APPLE_WEB_REDIRECT_URI'],
      approvedDigest: p['SIT_APPLE_WEB_CONFIG_SHA256'],
    );
    WebApplePreparedConfig? prepare(DateTime now) => config.configurationFor(
          appleEnabled: p['SIT_SOCIAL_APPLE_ENABLED'] == 'true',
          activationValidated:
              p['SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED'] == 'true',
          backendEnabled: p['SIT_BACKEND_ENABLED'] == 'true',
          apiBaseUrl: p['SIT_API_BASE_URL'],
          origin: p['SIT_APPLE_WEB_ORIGIN'],
          readinessJson: p['SIT_APPLE_WEB_READINESS_JSON'],
          approvedReadinessDigest: p['SIT_APPLE_WEB_READINESS_SHA256'],
          now: now,
        );
    final ready = prepare(DateTime.utc(2026, 10, 4, 12));
    expect(ready, isNotNull);
    expect(ready!.direct.clientId, 'com.shareittoo.synthetic.web');
    expect(ready.direct.redirectUri,
        'https://staging.shareittoo.com/auth/apple/callback');
    expect(prepare(DateTime.utc(2026, 10, 4, 13)), isNull);
    p['SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED'] = 'false';
    expect(prepare(DateTime.utc(2026, 10, 4, 12)), isNull);
  });
}
