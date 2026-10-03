import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('Apple Web uses direct JS state/nonce and v2 without legacy popup fallback', () => {
  const auth = read('lib/services/web_apple_auth.dart');
  const bridge = read('lib/services/web_apple_browser_bridge_web.dart');
  const service = read('lib/services/auth_service.dart');
  const client = read('lib/services/apple_web_v2_client.dart');
  for (const source of [auth, bridge, client]) {
    assert.doesNotMatch(source, /debugPrint\(|print\(|SharedPreferences|flutter_secure_storage/u);
  }
  assert.doesNotMatch(auth, /signInWithPopup|additionalUserInfo|authorizationCode\?\.trim/u);
  assert.match(auth, /Random\.secure\(\)/u);
  assert.match(auth, /sha256\.convert\(utf8\.encode\(rawNonce\)\)/u);
  assert.match(auth, /response\.state != state/u);
  assert.match(bridge, /AppleID\.auth\.signIn/u);
  assert.match(bridge, /appleid\.cdn-apple\.com\/appleauth\/static\/jsapi\/appleid\/1\/en_US\/appleid\.auth\.js/u);
  assert.match(bridge, /if \(identical\(_loader, attempt\)\) _loader = null/u);
  assert.match(service, /OAuthProvider\('apple\.com'\)\.credential\([\s\S]*idToken: appleIdToken,[\s\S]*rawNonce: rawNonce/u);
  assert.match(service, /exchangeAppleWebV2\(/u);
  assert.match(client, /'operation': 'acquire'/u);
  assert.match(client, /'operation': 'status'/u);
  assert.match(client, /'operation': 'session'/u);
  assert.doesNotMatch(client, /appleAuthorizationCode|termsAccepted|privacyAccepted/u);
});

test('installed SDK omission remains irrelevant to the direct client path', () => {
  const configUrl = new URL('.dart_tool/package_config.json', root);
  const packages = JSON.parse(fs.readFileSync(configUrl, 'utf8')).packages;
  const sdk = packages.find((entry) => entry.name === 'firebase_auth_web');
  assert.ok(sdk, 'run Flutter dependency resolution before this SDK check');
  const sdkRoot = new URL(sdk.rootUri.endsWith('/') ? sdk.rootUri : `${sdk.rootUri}/`, configUrl);
  const utils = fs.readFileSync(new URL('lib/src/utils/web_utils.dart', sdkRoot), 'utf8');
  const converter = utils.slice(utils.indexOf('AdditionalUserInfo? convertWebAdditionalUserInfo('), utils.indexOf('/// Converts a [auth_interop.IdTokenResult]'));
  assert.doesNotMatch(converter, /authorizationCode/u);
  assert.doesNotMatch(read('lib/services/web_apple_auth.dart'), /additionalUserInfo/u);
});
