import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (name) => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
test('Web Google uses popup before native SDK path and preserves backend/principal transaction', () => {
  const auth = read('lib/services/auth_service.dart');
  const acquisition = auth.slice(auth.indexOf('static Future<String> _firebaseSocialIdToken('), auth.indexOf('static AuthMfaChallenge? _parseMfaChallenge'));
  assert.ok(acquisition.indexOf('if (kIsWeb)') < acquisition.indexOf('GoogleSignIn.instance.initialize()'));
  for (const token of ['acquireWebGoogleToken(', 'signInWithPopup(', "'prompt': 'select_account'", 'user.getIdToken(true)', 'acquisition.firebaseUid = uid']) assert.ok(acquisition.includes(token), token);
  const exchange = auth.slice(auth.indexOf('static Future<AuthResult> _signInWithSocialProviderOwned('), auth.indexOf('static AuthFailure classifySocialBackendError'));
  for (const token of ['RemoteAuthAttemptTransaction<', "path: '/auth/social'", "'idToken': idToken", "'termsAccepted': termsAccepted", 'discardRemote: _discardIssuedRemoteSession', 'persistedCurrent: _authResultSessionDefinitelyCurrent', 'shouldCleanUpPhoneIdentity(', 'await FirebaseAuth.instance.signOut()']) assert.ok(exchange.includes(token), token);
  const gate = auth.slice(auth.indexOf('static bool socialProviderEnabled('), auth.indexOf('static bool socialProviderEnabled(') + 600);
  assert.match(gate, /if \(kIsWeb\)[\s\S]*provider == AuthSocialProvider.google[\s\S]*FirebaseRuntime.webGoogleReady/);
});
test('Web initialization is auth-only, memory-persistent and cannot enable native device services', () => {
  const runtime = read('lib/services/firebase_runtime.dart');
  const branch = runtime.slice(runtime.indexOf('static Future<bool> _initialize('), runtime.indexOf('await _initializeNativeActionLinks();'));
  for (const token of ['if (kIsWeb)', 'prepareWebAuth != null', 'prepareWebGoogleAuth(', 'useMemoryPersistence: prepareWebAuth', 'return false;']) assert.ok(branch.includes(token), token);
  assert.doesNotMatch(branch, /FirebaseMessaging|FirebaseCrashlytics|FirebaseInstallations/);
  assert.match(runtime, /web_firebase_app_binding_mismatch/);
  for (const name of ['_retryPendingInstallationCleanup', '_retryPendingPushLocalCleanup', '_retryPendingCrashCleanup']) assert.ok(runtime.includes(`static Future<bool> ${name}() async {\n    if (kIsWeb) return false;`));
  const auth = read('lib/services/auth_service.dart');
  const preparation = auth.slice(auth.indexOf('static Future<void> prepareWebGoogleAuthMemoryPersistence('), auth.indexOf('static bool socialProviderEnabled('));
  assert.match(preparation, /!kIsWeb \|\| FirebaseRuntimeConfig.currentOptions == null/u);
  assert.match(preparation, /_providerSdkMutationQueue.run\([\s\S]*FirebaseAuth.instance.setPersistence\(Persistence.NONE\)/u);
  assert.match(read('lib/main.dart'), /await FirebaseRuntime.initialize\(\s*prepareWebAuth: AuthService.prepareWebGoogleAuthMemoryPersistence,\s*\)/u);
  assert.match(auth, /providerErrorCode: \(error\) =>\s*error is FirebaseAuthException \? error.code : null/u);
  assert.doesNotMatch(read('lib/services/web_google_auth.dart'), /firebase_auth|FirebaseAuthException/u);
});
test('registration consent and login continuation reuse existing authoritative routing', () => {
  const login = read('lib/screens/login_screen.dart');
  const registration = read('lib/screens/register_screen.dart');
  assert.match(login, /result.failure == AuthFailure.consentRequired[\s\S]*RegisterScreen\(/);
  assert.match(login, /_retainSuccessfulSocialLoginOwner[\s\S]*_goHome\(replace: true\)/);
  for (const token of ['termsAccepted: true', 'privacyAccepted: true', 'minimumAgeConfirmed: true', 'privateUseConfirmed: true', 'registrationActionLabel:', 'MainNavigation(initialIndex: targetIndex ?? 0)', '_retainSuccessfulSocialRegistrationOwner(']) assert.ok(registration.includes(token), token);
});
