import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseWp100ThemePhaseArguments,
  summarizeWp100BackgroundChoiceCapture,
  summarizeWp100BackgroundOptionsPreparation,
  summarizeWp100SystemThemeCapture,
} from '../../tool/diagnose_wp100_current_candidate_android_theme_phases.mjs';

const candidate = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026091001',
  commit: 'a'.repeat(40),
  android: { apkSha256: 'b'.repeat(64) },
};
const deviceSummary = {
  platform: 'android', physical: true, manufacturer: 'Google', model: 'Pixel 7 Pro',
  osVersion: '17', apiLevel: 37, securityPatch: '2026-07-05', containsRawDeviceIdentifier: false,
};
const common = {
  candidate,
  sourceDrift: { mobileSourceChanged: false },
  deviceSummary,
  capturedAt: '2026-09-10T12:00:00.000Z',
};

test('records a system-theme capture only after exact restoration', () => {
  const result = summarizeWp100SystemThemeCapture({
    ...common,
    targetMode: 'yes',
    originalMode: 'auto',
    restoredMode: 'auto',
    captureSha256: 'c'.repeat(64),
  });
  assert.equal(result.status, 'passed-private-system-theme-capture-restored');
  assert.equal(result.tests.targetSystemMode, 'dark');
  assert.equal(result.boundaries.privateCapturesCommitted, false);
  assert.throws(() => summarizeWp100SystemThemeCapture({
    ...common,
    targetMode: 'yes',
    originalMode: 'auto',
    restoredMode: 'no',
    captureSha256: 'c'.repeat(64),
  }));
});

test('records background preparation without a background preference change', () => {
  const result = summarizeWp100BackgroundOptionsPreparation(common);
  assert.equal(result.status, 'prepared-read-only-background-options');
  assert.deepEqual(result.tests.backgroundOptionsVisible, ['Dark 1', 'Dark 2', 'Light 1', 'Light 2']);
  assert.equal(result.boundaries.backgroundPreferenceTemporarilyChanged, false);
});

test('records one background choice only after restoring its original selection', () => {
  const result = summarizeWp100BackgroundChoiceCapture({
    ...common,
    targetChoice: 'dark-1',
    originalChoice: 'system',
    restoredChoice: 'system',
    captureSha256: 'd'.repeat(64),
  });
  assert.equal(result.status, 'passed-private-background-choice-capture-restored');
  assert.equal(result.tests.exactOriginalChoiceRestored, true);
  assert.equal(result.boundaries.backgroundPreferenceRestored, true);
  assert.equal(result.boundaries.backgroundPreferenceTemporarilyChanged, true);
  assert.equal(result.boundaries.backgroundPreferencePersistentlyChanged, false);
  assert.throws(() => summarizeWp100BackgroundChoiceCapture({
    ...common,
    targetChoice: 'dark-1',
    originalChoice: 'system',
    restoredChoice: 'light-1',
    captureSha256: 'd'.repeat(64),
  }));
});

test('requires exactly one phase and private output only where a capture is produced', () => {
  const system = parseWp100ThemePhaseArguments([
    '--candidate-dir', 'candidate', '--private-artifact-dir', 'private', '--system-mode', 'dark',
  ]);
  assert.equal(system.systemMode, 'dark');
  const preparation = parseWp100ThemePhaseArguments([
    '--candidate-dir', 'candidate', '--prepare-background-options-from-current-settings',
  ]);
  assert.equal(preparation.prepareBackgroundOptions, true);
  assert.throws(() => parseWp100ThemePhaseArguments([
    '--candidate-dir', 'candidate', '--system-mode', 'dark',
  ]));
  assert.throws(() => parseWp100ThemePhaseArguments([
    '--candidate-dir', 'candidate', '--system-mode', 'dark',
    '--prepare-background-options-from-current-settings', '--private-artifact-dir', 'private',
  ]));
});
