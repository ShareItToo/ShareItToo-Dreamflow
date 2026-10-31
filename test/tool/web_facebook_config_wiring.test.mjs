import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { profile } from '../../tool/staging_web_contract.mjs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const runtime = read('lib/services/firebase_runtime.dart');
const auth = read('lib/services/auth_service.dart');

test('Facebook configuration is independently empty/off and consumed by web startup only', () => {
  const config = runtime.slice(runtime.indexOf('static const webFacebookConfig'), runtime.indexOf('static const webGoogleConfig'));
  for (const key of ['PROJECT_ID', 'SENDER_ID', 'APP_ID', 'API_KEY', 'AUTH_DOMAIN', 'BACKEND_PROJECT_ID', 'ORIGIN', 'CONFIG_SHA256', 'READINESS_JSON', 'READINESS_SHA256']) {
    assert.ok(config.includes(`SIT_FACEBOOK_WEB_${key}`), key);
  }
  assert.doesNotMatch(config, /defaultValue|SIT_FIREBASE_WEB_CONFIG_SHA256/);
  assert.match(config, /SIT_SOCIAL_FACEBOOK_ENABLED/);
  assert.match(config, /SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED/);
  assert.match(config, /now: DateTime\.now\(\)\.toUtc\(\)/);
  assert.match(runtime, /if \(kIsWeb\) \{\s*return webAuthSelection\.options;/);
  const startup = runtime.slice(runtime.indexOf('static Future<bool> _initialize('), runtime.indexOf('await _initializeNativeActionLinks();'));
  for (const token of ['prepareWebFirebaseAuth(', 'selection: FirebaseRuntimeConfig.webAuthSelection', 'initializeBoundApp: _ensureBoundFirebaseApp', 'useMemoryPersistence: prepareWebAuth', 'return false;']) assert.ok(startup.includes(token), token);
  assert.doesNotMatch(startup, /FirebaseMessaging|FirebaseCrashlytics|FirebaseInstallations|currentUser|sessionEpoch/);
  assert.match(runtime, /optionsBound: FirebaseRuntimeConfig.webAuthSelection.google/);
  assert.match(runtime, /webFacebookConfigurationReady[\s\S]*_webAuthInitialized &&\s*FirebaseRuntimeConfig.webAuthSelection.facebook/);
  assert.match(runtime, /sameWebFirebaseApp\(actual, options\)[\s\S]*web_firebase_app_binding_mismatch/);
});

test('FB-W2 acquisition remains W1-gated and cannot bypass native/Apple gates', () => {
  const gate = auth.slice(auth.indexOf('static bool socialProviderEnabled('), auth.indexOf('static Future<void> ensureSeeded('));
  assert.match(gate, /if \(kIsWeb\)[\s\S]*provider == AuthSocialProvider.google &&/);
  assert.match(gate, /webFacebookControlAvailable\([\s\S]*configurationReady: FirebaseRuntime.webFacebookConfigurationReady/);
  assert.match(gate, /AuthSocialProvider.facebook => _facebookSocialAuthEnabled &&\s*\(!_productBuild \|\| _socialProviderActivationValidated\)/);
  assert.match(gate, /AuthSocialProvider.apple => _appleSocialAuthEnabled &&\s*\(!_productBuild \|\| _socialProviderActivationValidated\)/);
  assert.match(auth, /FacebookAuth.instance.login\(/);
  assert.match(auth, /FacebookAuthProvider.credential\(/);
  const nativeOptions = runtime.slice(runtime.indexOf('switch (defaultTargetPlatform)'), runtime.indexOf('class ForegroundPushMessage'));
  assert.doesNotMatch(nativeOptions, /webFacebookConfig|webAuthSelection|SIT_FACEBOOK_WEB/);
});

test('startup contract stays principal-independent and preserves memory persistence', () => {
  const startup = read('lib/services/web_firebase_auth_startup.dart');
  assert.doesNotMatch(startup, /firebase_auth|backend_repository|auth_service|currentUser|sessionEpoch|signInWithPopup|signOut/);
  assert.match(startup, /initializeBoundApp\(selection.options!\)/);
  assert.match(auth, /prepareWebGoogleAuthMemoryPersistence[\s\S]*_providerSdkMutationQueue.run\([\s\S]*setPersistence\(Persistence.NONE\)/);
  assert.match(read('lib/main.dart'), /prepareWebAuth: AuthService.prepareWebGoogleAuthMemoryPersistence/);
  const candidate = profile('a'.repeat(40), '1.0.0+2026092905');
  assert.equal(candidate.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
  assert.equal(candidate.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(candidate.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'false');
  assert.ok(Object.keys(candidate).every((key) => !key.startsWith('SIT_FACEBOOK_WEB_')));
});
