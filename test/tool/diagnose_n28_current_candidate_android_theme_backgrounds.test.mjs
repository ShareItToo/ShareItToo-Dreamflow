import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAndroidNightMode,
  summarizeN28ThemeBackgrounds,
} from '../../tool/diagnose_n28_current_candidate_android_theme_backgrounds.mjs';
import { readFileSync } from 'node:fs';

const candidate = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090306',
  commit: '9d7e2601dc477cf3ae3d469b65448ce2065375e0',
  android: { apkSha256: 'a'.repeat(64) },
};
const device = {
  platform: 'android', physical: true, manufacturer: 'Google', model: 'Pixel 7 Pro',
  osVersion: '17', apiLevel: 37, securityPatch: '2026-07-05', containsRawDeviceIdentifier: false,
};
const hash = 'b'.repeat(64);

function validInput() {
  return {
    candidate,
    deviceSummary: device,
    sourceDrift: { changedPathCount: 85, mobileSourceChanged: false },
    originalMode: 'yes',
    restoredMode: 'yes',
    dark: { mode: 'yes', sha256: hash, candidateBuildNumber: '2026090306' },
    light: { mode: 'no', sha256: 'c'.repeat(64), candidateBuildNumber: '2026090306' },
    backgroundOptionCount: 4,
    backgroundCaptureSha256: 'd'.repeat(64),
    capturedAt: '2026-09-03T14:00:00.000Z',
  };
}

test('parses only exactly restorable Android night modes', () => {
  assert.equal(parseAndroidNightMode('Night mode: yes'), 'yes');
  assert.equal(parseAndroidNightMode('Night mode: no'), 'no');
  assert.equal(parseAndroidNightMode('Night mode: auto'), 'auto');
  assert.throws(() => parseAndroidNightMode('Night mode: custom_schedule'));
  assert.throws(() => parseAndroidNightMode('unknown'));
});

test('accepts protected light, dark and four-option captures with exact restoration', () => {
  const evidence = summarizeN28ThemeBackgrounds(validInput());
  assert.equal(evidence.status, 'captures-created-visual-review-pending');
  assert.deepEqual(evidence.tests.backgroundOptionsReachable, ['Dark 1', 'Dark 2', 'Light 1', 'Light 2']);
  assert.equal(evidence.tests.exactOriginalNightModeRestored, true);
  assert.equal(evidence.boundaries.privateCapturesAssumedSensitive, true);
  assert.equal(evidence.boundaries.privateCapturesDistributionAllowed, false);
});

test('rejects missing modes, capture drift or incomplete background choices', () => {
  for (const mutate of [
    (value) => { value.restoredMode = 'no'; },
    (value) => { value.dark.mode = 'no'; },
    (value) => { value.light.sha256 = 'invalid'; },
    (value) => { value.backgroundOptionCount = 3; },
    (value) => { value.sourceDrift.mobileSourceChanged = true; },
    (value) => { value.deviceSummary.model = 'owner@example.invalid'; },
  ]) {
    const changed = validInput();
    mutate(changed);
    assert.throws(() => summarizeN28ThemeBackgrounds(changed));
  }
});

test('routes through account settings and never selects a background choice', () => {
  const source = readFileSync(
    new URL('../../tool/diagnose_n28_current_candidate_android_theme_backgrounds.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /'input', 'text', 'Kontoeinstellungen'/u);
  assert.match(source, /'input', 'swipe'/u);
  assert.doesNotMatch(source, /tapSingleNamedNode\([^;]+expectedOptions/su);
});
