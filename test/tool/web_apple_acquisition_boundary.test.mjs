import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('Apple W2 remains dormant and has no implicit provider/config approval', () => {
  const own = 'lib/services/web_apple_auth.dart';
  function visit(directory) {
    for (const entry of fs.readdirSync(new URL(directory, root), { withFileTypes: true })) {
      const file = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('.dart') && file !== own) {
        assert.doesNotMatch(read(file), /web_apple_auth\.dart|acquireWebAppleMaterial/, file);
      }
    }
  }
  visit('lib');
  const source = read(own);
  assert.doesNotMatch(source, /FirebaseAuth\.instance|fromEnvironment|web_google_auth|web_facebook_auth|debugPrint\(|print\(|jsonEncode\(|\.profile|\.providerData|\.credential|\.accessToken|\.idToken/);
  assert.match(source, /result\.additionalUserInfo\?\.authorizationCode\?\.trim\(\)/);
  assert.match(source, /getIdTokenResult\(true\)/);
});

test('installed locked Web SDK omits authorizationCode: real-flow blocker stays explicit', () => {
  const configUrl = new URL('.dart_tool/package_config.json', root);
  const packages = JSON.parse(fs.readFileSync(configUrl, 'utf8')).packages;
  const sdk = packages.find((entry) => entry.name === 'firebase_auth_web');
  assert.ok(sdk, 'run Flutter dependency resolution before this installed-SDK check');
  const sdkRoot = new URL(sdk.rootUri.endsWith('/') ? sdk.rootUri : `${sdk.rootUri}/`, configUrl);
  const manifest = fs.readFileSync(new URL('pubspec.yaml', sdkRoot), 'utf8');
  assert.match(manifest, /^version: 6\.2\.6$/m, 'SDK upgrade requires reviewing this blocker');
  const utils = fs.readFileSync(new URL('lib/src/utils/web_utils.dart', sdkRoot), 'utf8');
  const converter = utils.slice(utils.indexOf('AdditionalUserInfo? convertWebAdditionalUserInfo('), utils.indexOf('/// Converts a [auth_interop.IdTokenResult]'));
  assert.match(converter, /return AdditionalUserInfo\(/);
  assert.doesNotMatch(converter, /authorizationCode/);
  const doc = read('docs/operations/SIT_APPLE_WEB_W2_ACQUISITION_CONTRACT_2026-10-03.md');
  assert.match(doc, /NOT VERIFIED/);
  assert.match(doc, /authorizationCode/);
  assert.doesNotMatch(doc, /\/Users\/|\/home\//);
});
