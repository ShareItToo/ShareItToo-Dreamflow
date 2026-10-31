import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const auth = read('lib/services/auth_service.dart');
const helper = read('lib/services/web_facebook_auth.dart');

test('Facebook Web branch is gated, Firebase-only, before native fallback', () => {
  const start = auth.indexOf('static Future<String> _firebaseSocialIdToken(');
  const acquisition = auth.slice(start, auth.indexOf('static AuthMfaChallenge? _parseMfaChallenge', start));
  const web = acquisition.slice(acquisition.indexOf('if (kIsWeb)'), acquisition.indexOf('await FirebaseRuntime.ensureFirebaseApp();'));
  for (const text of ['provider == AuthSocialProvider.facebook', 'acquireWebFacebookToken(',
    'available: () => FirebaseRuntime.webFacebookConfigurationReady', 'requireCurrent: requireCurrent',
    'acquisition.firebaseUid = uid', 'on WebFacebookAuthFailure', 'throw const _SocialProviderUnavailable()']) assert.ok(web.includes(text), text);
  assert.doesNotMatch(web, /facebookAcquired\s*=|FacebookAuth.instance|appleAuthorizationCode\s*=/);
  assert.match(helper, /FacebookAuthProvider\(\)\.\.addScope\('email'\)/);
  assert.match(helper, /getIdTokenResult\(true\)/);
  assert.match(helper, /fresh.signInProvider != 'facebook.com'/);
  assert.doesNotMatch(helper, /\.credential|\.additionalUserInfo|\.providerData|\.accessToken|\.customData|\.message|debugPrint\(|print\(/);
});

test('same transaction, minimal backend payload, exact cleanup ownership, no native Web logout', () => {
  const start = auth.indexOf('static Future<AuthResult> _signInWithSocialProviderOwned(');
  const owned = auth.slice(start, auth.indexOf('static AuthFailure classifySocialBackendError', start));
  for (const text of ['RemoteAuthAttemptTransaction<', "path: '/auth/social'", "'idToken': idToken", 'discardRemote: _discardIssuedRemoteSession',
    'persistedCurrent: _authResultSessionDefinitelyCurrent', 'discardPersisted: _discardPersistedAuthResult',
    'attemptEpoch: sdkOperationEpoch', 'currentAttemptEpoch: _providerSdkOperationGeneration',
    'signedInUid: acquisition.firebaseUid', 'currentUid: FirebaseAuth.instance.currentUser?.uid']) assert.ok(owned.includes(text), text);
  const body = owned.slice(owned.indexOf('body: {'), owned.indexOf('persist: (response)'));
  assert.deepEqual([...body.matchAll(/'([a-zA-Z]+)':/g)].map((m) => m[1]),
    ['idToken', 'appleAuthorizationCode', 'termsAccepted', 'privacyAccepted', 'minimumAgeConfirmed', 'privateUseConfirmed', 'registrationActionLabel']);
  assert.match(body, /provider == AuthSocialProvider.apple &&/);
  assert.match(owned, /if \(acquisition.facebookAcquired\) \{\s*await FacebookAuth.instance.logOut\(\)/);
  assert.match(auth, /_providerSdkMutationQueue.run\(\(\) => _signInWithSocialProviderOwned\(/);
});

test('Facebook is login-only; registration has no Facebook action or source activation', () => {
  for (const path of ['lib/screens/login_screen.dart']) {
    const screen = read(path);
    assert.ok(/AuthService\s*\.socialProviderEnabled\(/.test(screen), `${path} gate consumer`);
    assert.ok(/AuthSocialProvider\s*\.facebook/.test(screen), `${path} Facebook control`);
  }
  const registration = read('lib/screens/register_screen.dart');
  assert.ok(registration.includes('!AuthService.socialRegistrationProviderEnabled(provider)'));
  assert.doesNotMatch(registration, /Mit Facebook registrieren/);
  assert.match(auth, /provider != AuthSocialProvider.facebook &&\s*socialProviderEnabled\(provider\)/);
  assert.match(auth, /SIT_SOCIAL_FACEBOOK_ENABLED',\s*defaultValue: false/);
  assert.doesNotMatch(read('tool/staging_web_contract.mjs'), /SIT_SOCIAL_FACEBOOK_ENABLED:\s*'true'/);
});
