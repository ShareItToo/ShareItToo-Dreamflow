import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profile } from '../../tool/staging_web_contract.mjs';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('Apple W1 has no production Dart consumer or provider coupling', () => {
  const configPath = 'lib/services/web_apple_auth_config.dart';
  function inspect(directory) {
    for (const entry of fs.readdirSync(new URL(directory, root), { withFileTypes: true })) {
      const file = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (file.endsWith('.dart') && file !== configPath) {
        assert.doesNotMatch(read(file), /web_apple_auth_config|WebApplePublicConfig/, file);
      }
    }
  }
  inspect('lib');
  const source = read(configPath);
  assert.doesNotMatch(source, /web_google_auth|web_facebook_auth|fromEnvironment|firebase_auth|signInWith|initializeApp|currentUser|sessionEpoch/);
  assert.match(source, /bool appleEnabled = false/);
  assert.match(source, /bool activationValidated = false/);
  assert.match(source, /bool backendEnabled = false/);
});

test('staging profile still cannot activate Apple or ship W1 evidence', () => {
  const candidate = profile('a'.repeat(40), '1.0.0+2026092905');
  assert.equal(candidate.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(candidate.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'false');
  assert.ok(Object.keys(candidate).every((key) => !key.startsWith('SIT_APPLE_WEB_')));
});

test('W1 documentation preserves acquisition, revocation and live gaps', () => {
  const doc = read('docs/operations/SIT_APPLE_WEB_W1_CONFIG_CONTRACT_2026-10-03.md');
  for (const required of ['NOT VERIFIED', 'code exchange', 'revocation', '24 hours', 'existing_allowlisted_accounts_only']) {
    assert.ok(doc.includes(required), required);
  }
  assert.doesNotMatch(doc, /\/Users\/|\/home\//);
});
