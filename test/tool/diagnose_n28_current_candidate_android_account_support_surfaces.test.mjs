import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  summarizeN28AccountSupportSurfaces,
} from '../../tool/diagnose_n28_current_candidate_android_account_support_surfaces.mjs';

const candidate = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090306',
  commit: '9d7e2601dc477cf3ae3d469b65448ce2065375e0',
  android: { apkSha256: 'a'.repeat(64) },
};
const deviceSummary = {
  platform: 'android', physical: true, manufacturer: 'Google', model: 'Pixel 7 Pro',
  osVersion: '17', apiLevel: 37, securityPatch: '2026-07-05', containsRawDeviceIdentifier: false,
};
const entries = [
  'Profilinformationen',
  'Kontaktinformationen',
  'Passwort ändern',
  'Zahlungsmethoden',
  'Auszahlungsmethoden',
  'Rechnungen & Belege',
  'Benachrichtigungen',
  'Blockierte Nutzer',
  'Datenschutz-Infos',
];

function validInput() {
  return {
    candidate,
    deviceSummary,
    sourceDrift: { changedPathCount: 89, mobileSourceChanged: false },
    surfaces: Object.fromEntries(entries.map((entry) => [entry, {
      status: 'passed',
      result: ['Zahlungsmethoden', 'Auszahlungsmethoden'].includes(entry)
        ? 'read-only-staging-provider-hold-visible'
        : 'authenticated-read-only-surface-reachable',
    }])),
    helpSupportEntryReachable: true,
    capturedAt: '2026-09-03T15:00:00.000Z',
  };
}

test('accepts nine read-only account surfaces, help and exact provider holds', () => {
  const result = summarizeN28AccountSupportSurfaces(validInput());
  assert.equal(result.status, 'passed-account-support-read-only-provider-holds-confirmed');
  assert.equal(result.tests.accountSurfaceCount, 9);
  assert.equal(result.tests.paymentProviderHoldVisible, true);
  assert.equal(result.tests.supportEntryReachableWithoutSubmission, true);
  assert.equal(result.boundaries.supportSubmitted, false);
  assert.equal(result.boundaries.phoneVerificationRequested, false);
});

test('accepts one scoped account surface without claiming the complete account/support matrix', () => {
  const input = validInput();
  input.surfaces = {
    'Zahlungsmethoden': input.surfaces.Zahlungsmethoden,
  };
  const result = summarizeN28AccountSupportSurfaces({
    ...input,
    checks: [{ entry: 'Zahlungsmethoden' }],
    helpSupportEntryReachable: false,
  });
  assert.equal(result.status, 'passed-account-support-read-only-surface-subset');
  assert.deepEqual(result.tests.accountEntriesTested, ['Zahlungsmethoden']);
  assert.equal(result.tests.completeAccountSupportMatrixPassed, false);
});

test('rejects missing surfaces, provider drift, mutation claims and private output', () => {
  for (const mutate of [
    (value) => { delete value.surfaces['Blockierte Nutzer']; },
    (value) => { value.surfaces.Zahlungsmethoden.result = 'live-provider'; },
    (value) => { value.sourceDrift.mobileSourceChanged = true; },
    (value) => { value.helpSupportEntryReachable = false; },
    (value) => { value.deviceSummary.model = 'owner@example.invalid'; },
  ]) {
    const changed = validInput();
    mutate(changed);
    assert.throws(() => summarizeN28AccountSupportSurfaces(changed));
  }
});

test('checks below-fold destination markers by bounded read-only scrolling', () => {
  const source = readFileSync(
    new URL('../../tool/diagnose_n28_current_candidate_android_account_support_surfaces.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /for \(const marker of check\.markers\.slice\(1\)\)/u);
  assert.match(source, /findByScrolling\(\{/u);
  assert.match(source, /requireUnique: false/u);
});
