import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const auth = read('lib/services/auth_service.dart');
const regression = read('scripts/technical_regression_check.sh');
const section = (start, end) => {
  const from = auth.indexOf(start);
  const to = auth.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return auth.slice(from, to);
};

test('all provider SDK imports and mutations remain in the reviewed auth facade', () => {
  const found = [];
  const walk = (path) => {
    for (const entry of readdirSync(new URL(path, root), { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.dart') && /package:(?:firebase_auth|google_sign_in|flutter_facebook_auth)\//u.test(read(child))) found.push(child);
    }
  };
  walk('lib');
  assert.deepEqual(found.sort(), ['lib/services/auth_service.dart']);
  assert.equal([...auth.matchAll(/FirebaseAuth\.instance\.signOut\(/gu)].length, 2);
  assert.equal([...auth.matchAll(/FirebaseAuth\.instance\.signInWith(?:Credential|Provider)\(/gu)].length, 4);
});

test('social and phone acquire the same queue and retain it through awaited cleanup', () => {
  const social = section('static Future<AuthResult> signInWithSocialProvider(', 'static Future<String> _firebaseSocialIdToken(');
  const phone = section('static Future<void> _confirmPhoneCredential(', 'static Future<void> _requirePhoneVerificationOwner(');
  assert.match(social, /final capturedEpoch = expectedSessionEpoch \?\? _sessionGeneration/u);
  assert.match(social, /_providerSdkMutationQueue\.run\(\(\) => _signInWithSocialProviderOwned/u);
  assert.match(phone, /_providerSdkMutationQueue\.run\(\(\) => _confirmPhoneCredentialOwned/u);
  for (const value of [social, phone]) {
    assert.match(value, /\+\+_providerSdkOperationGeneration/u);
    assert.match(value, /currentAttemptEpoch: _providerSdkOperationGeneration/u);
    assert.match(value, /finally[\s\S]*?await FirebaseAuth\.instance\.signOut\(\)/u);
    assert.doesNotMatch(value, /signOut\([^)]*\)\.timeout|_providerSdkMutationQueue[^;]*\.timeout/u);
  }
  assert.match(social, /acquisition\.firebaseUid != null/u);
  assert.match(social, /if \(acquisition\.googleAcquired\)/u);
  assert.match(social, /if \(acquisition\.facebookAcquired\)/u);
  assert.match(phone, /sdkOperationEpoch != null &&\s*signedInUid != null/u);
});

test('three isolated mock profiles are permanent full-regression requirements', () => {
  for (const profile of ['SIT_TEST_PROVIDER_SDK_OWNERSHIP', 'SIT_TEST_PROVIDER_INITIALIZATION_OWNERSHIP', 'SIT_TEST_PROVIDER_NATIVE_OWNERSHIP']) {
    const commands = regression.split(/\n(?=flutter test)/u);
    const command = commands.find((value) => value.includes(`--dart-define=${profile}=true`));
    assert.ok(command, profile);
    assert.match(command, /SIT_BACKEND_ENABLED=true/u);
    assert.match(command, /SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1/u);
    assert.match(command, /test\/provider_sdk_session_ownership_test\.dart/u);
    assert.match(command, /--test-randomize-ordering-seed=7/u);
  }
  const tests = read('test/provider_sdk_session_ownership_test.dart');
  assert.match(tests, /HttpOverrides\.global = _NoNetwork\(\)/u);
  assert.match(tests, /http\.runWithClient/u);
  assert.match(tests, /same-UID B waits through A acquisition and awaited cleanup/u);
  assert.match(tests, /phone confirmation waits for social identity cleanup/u);
  assert.match(tests, /social waits through confirmed phone backend and delayed cleanup/u);
  assert.match(tests, /mock-only cold Google initialization profile/u);
  assert.match(tests, /skip: !_initializationProfile/u);
});
