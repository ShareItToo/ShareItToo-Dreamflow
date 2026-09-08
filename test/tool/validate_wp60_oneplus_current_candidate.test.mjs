import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp60OnePlusCurrentCandidate,
} from '../../tool/validate_wp60_oneplus_current_candidate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = resolve(root, 'store/google-play/wp60-oneplus-current-candidate.json');

function manifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

test('binds the active 2026090711 Internal candidate to the previous OnePlus state', () => {
  const result = validateWp60OnePlusCurrentCandidate({ root });
  assert.equal(result.applicationId, 'com.shareittoo.app');
  assert.equal(result.versionCode, '2026090711');
  assert.equal(result.previousVersionCode, '2026090204');
  assert.deepEqual(result.allowedAdbTransports, ['usb', 'wireless-adb']);
  assert.equal(result.updateMechanism, 'google-play-only');
});

test('fails closed on candidate, release, transport or destructive-runway drift', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026090712'; },
    (value) => { value.playInternal.track = 'production'; },
    (value) => { value.playInternal.trackState = 'draft'; },
    (value) => { value.previousOnePlusObservation.versionCode = '2026090711'; },
    (value) => { value.execution.allowedAdbTransports.push('tcp'); },
    (value) => { value.execution.directApkReplacementAllowed = true; },
    (value) => { value.execution.appDataResetAllowed = true; },
    (value) => { value.boundaries.onePlusContacted = true; },
  ]) {
    const value = manifest();
    mutate(value);
    assert.throws(() => validateWp60OnePlusCurrentCandidate({ root, manifest: value }));
  }
});

test('emits no account identity, device identifier, network address or credential', () => {
  const serialized = JSON.stringify(manifest());
  for (const forbidden of [
    '@',
    '192.168.',
    '100.',
    'access_token',
    'refresh_token',
    'password',
    'private_key',
  ]) assert.equal(serialized.toLowerCase().includes(forbidden), false);
});
