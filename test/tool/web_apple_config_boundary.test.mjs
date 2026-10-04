import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { profile } from '../../tool/staging_web_contract.mjs';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('direct Apple config cannot borrow historical Firebase callback approval', () => {
  const source = read('lib/services/web_apple_auth_config.dart');
  assert.match(source, /class WebAppleDirectPublicConfig/u);
  assert.match(source, /evidence\['schemaVersion'\] == 2/u);
  assert.match(source, /evidence\['platform'\] == 'web_direct'/u);
  assert.match(source, /evidence\['callbackUrl'\] == redirectUri/u);
  assert.match(source, /backendAppleServicesIdSha256/u);
  assert.match(source, /backendAppleOwnershipConfigured/u);
  assert.match(source, /backendAppleAcquisitionEnabled/u);
  assert.match(source, /backendAppleRedirectUriSha256/u);
  assert.match(source, /class WebApplePublicConfig/u);
  assert.match(source, /https:\/\/\$authDomain\/__\/auth\/handler/u);
});

test('runtime consumer remains independently gated and defaults empty', () => {
  const runtime = read('lib/services/firebase_runtime.dart');
  const startup = read('lib/services/web_firebase_auth_startup.dart');
  const auth = read('lib/services/auth_service.dart');
  for (const key of ['SIT_APPLE_WEB_CLIENT_ID', 'SIT_APPLE_WEB_REDIRECT_URI', 'SIT_APPLE_WEB_READINESS_JSON', 'SIT_APPLE_WEB_READINESS_SHA256']) {
    assert.match(runtime, new RegExp(key, 'u'));
  }
  assert.match(startup, /appleEnabled &&\s*conflicts\(\s*appleConfig\.projectId/u);
  assert.match(startup, /google \?\? facebook \?\? apple\?\.firebaseOptions/u);
  assert.match(startup, /google != null,\s*facebook != null,\s*apple != null/u);
  assert.doesNotMatch(startup, /appleEnabled && apple == null/u);
  assert.match(auth, /_appleSocialAuthEnabled &&[\s\S]*_socialProviderActivationValidated &&[\s\S]*FirebaseRuntime\.webAppleReady/u);
});

test('checked-in staging profile cannot activate or configure Apple', () => {
  const candidate = profile('a'.repeat(40), '1.0.0+2026092905');
  assert.equal(candidate.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(candidate.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'false');
  assert.ok(Object.keys(candidate).every((key) => !key.startsWith('SIT_APPLE_WEB_')));
});
