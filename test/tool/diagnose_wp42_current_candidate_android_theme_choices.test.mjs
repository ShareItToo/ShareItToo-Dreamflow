import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  parseWp42ThemeChoiceArguments,
  selectedWp42BackgroundChoice,
  summarizeWp42ThemeChoices,
  wp42BackgroundChoices,
} from '../../tool/diagnose_wp42_current_candidate_android_theme_choices.mjs';

function hierarchy(selectedKeys = ['dark-1']) {
  const nodes = wp42BackgroundChoices.map((choice, index) => (
    `<node content-desc="${choice.label}" clickable="true" enabled="true" `
    + `selected="${selectedKeys.includes(choice.key)}" `
    + `bounds="[${index * 100},0][${(index + 1) * 100},100]"/>`
  )).join('');
  return `<hierarchy>${nodes}</hierarchy>`;
}

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090610',
  commit: '2fd793bac970866aa94a2940f28d6bbc3e04e377',
  android: Object.freeze({ apkSha256: 'a'.repeat(64) }),
});

const device = Object.freeze({
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
});

function validSummaryInput() {
  return {
    candidate,
    deviceSummary: device,
    sourceDrift: { changedPathCount: 75, mobileSourceChanged: false },
    originalChoice: 'dark-1',
    restoredChoice: 'dark-1',
    originalNightMode: 'yes',
    restoredNightMode: 'yes',
    captures: Object.fromEntries(
      wp42BackgroundChoices.map((choice, index) => (
        [choice.key, String(index + 1).repeat(64)]
      )),
    ),
    capturedAt: '2026-09-07T08:00:00.000Z',
  };
}

test('requires exactly one authoritative selected background choice', () => {
  assert.equal(selectedWp42BackgroundChoice(hierarchy()).key, 'dark-1');
  assert.throws(() => selectedWp42BackgroundChoice(hierarchy([])), /missing or ambiguous/u);
  assert.throws(
    () => selectedWp42BackgroundChoice(hierarchy(['dark-1', 'light-1'])),
    /missing or ambiguous/u,
  );
});

test('summarizes all five choices only after exact preference and night-mode restoration', () => {
  const evidence = summarizeWp42ThemeChoices(validSummaryInput());
  assert.equal(
    evidence.status,
    'passed-five-theme-choices-restored-private-review-pending',
  );
  assert.deepEqual(
    evidence.tests.exercisedChoices,
    ['system', 'dark-1', 'dark-2', 'light-1', 'light-2'],
  );
  assert.equal(evidence.tests.exactOriginalChoiceRestored, true);
  assert.equal(evidence.tests.exactOriginalNightModeRestored, true);
  assert.equal(evidence.boundaries.backgroundPreferenceRestored, true);
});

test('rejects missing captures, restoration drift and private evidence', () => {
  for (const mutate of [
    (value) => { delete value.captures.system; },
    (value) => { value.captures.system = 'invalid'; },
    (value) => { value.restoredChoice = 'light-1'; },
    (value) => { value.restoredNightMode = 'no'; },
    (value) => { value.sourceDrift.mobileSourceChanged = true; },
    (value) => { value.deviceSummary.model = 'owner@example.invalid'; },
  ]) {
    const changed = validSummaryInput();
    changed.captures = { ...changed.captures };
    changed.deviceSummary = { ...changed.deviceSummary };
    mutate(changed);
    assert.throws(() => summarizeWp42ThemeChoices(changed));
  }
});

test('requires both private paths and accepts only the explicit ADB override', () => {
  assert.deepEqual(
    parseWp42ThemeChoiceArguments([
      '--candidate-dir', './candidate',
      '--private-artifact-dir', './private',
      '--adb', '/safe/adb',
    ]),
    {
      candidateDirectory: resolve('./candidate'),
      privateArtifactDirectory: resolve('./private'),
      adbPath: '/safe/adb',
    },
  );
  assert.throws(() => parseWp42ThemeChoiceArguments([]), /candidate-dir is required/u);
  assert.throws(
    () => parseWp42ThemeChoiceArguments(['--candidate-dir', './candidate']),
    /private-artifact-dir is required/u,
  );
  assert.throws(
    () => parseWp42ThemeChoiceArguments([
      '--candidate-dir', './candidate',
      '--private-artifact-dir', './private',
      '--unknown',
    ]),
    /Unknown argument/u,
  );
});
