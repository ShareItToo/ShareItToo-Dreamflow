import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  summarizeN28HelpCenterPreparation,
  summarizeN28HelpSupportFromCurrent,
  summarizeN28PrivacyDataExportFromCurrent,
  parseN28AccountSupportSurfaceArguments,
  summarizeN28AccountSupportSettingsPreparation,
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

test('records a prepared account settings root without treating it as an entry result', () => {
  const input = validInput();
  const result = summarizeN28AccountSupportSettingsPreparation({
    candidate: input.candidate,
    deviceSummary: input.deviceSummary,
    sourceDrift: input.sourceDrift,
    capturedAt: input.capturedAt,
  });
  assert.equal(result.status, 'prepared-read-only-account-settings-root');
  assert.equal(result.tests.accountSettingsRootVisible, true);
  assert.equal(result.tests.entryVerified, false);
  assert.equal(result.boundaries.readOnly, true);
});

test('records a retained account-settings root only for an explicit scoped result', () => {
  const input = validInput();
  input.surfaces = { 'Zahlungsmethoden': input.surfaces.Zahlungsmethoden };
  const result = summarizeN28AccountSupportSurfaces({
    ...input,
    checks: [{ entry: 'Zahlungsmethoden' }],
    helpSupportEntryReachable: false,
    accountSettingsRootRetained: true,
  });
  assert.equal(result.tests.accountSettingsRootRetainedAfterEntryDiagnostic, true);
});

test('records the privacy export section without invoking the export action', () => {
  const input = validInput();
  const result = summarizeN28PrivacyDataExportFromCurrent({
    candidate: input.candidate,
    deviceSummary: input.deviceSummary,
    sourceDrift: input.sourceDrift,
    scrollsUsed: 3,
    capturedAt: input.capturedAt,
  });
  assert.equal(result.status, 'passed-read-only-privacy-data-export-visible');
  assert.equal(result.tests.dataExportSectionVisible, true);
  assert.equal(result.boundaries.privacyExportRequested, false);
  assert.equal(result.boundaries.exportFileCreated, false);
  assert.throws(() => summarizeN28PrivacyDataExportFromCurrent({
    candidate: input.candidate,
    deviceSummary: input.deviceSummary,
    sourceDrift: input.sourceDrift,
    scrollsUsed: 5,
    capturedAt: input.capturedAt,
  }));
});

test('keeps the help-center preparation and support visibility proof separate', () => {
  const input = validInput();
  const preparation = summarizeN28HelpCenterPreparation({
    candidate: input.candidate,
    deviceSummary: input.deviceSummary,
    sourceDrift: input.sourceDrift,
    capturedAt: input.capturedAt,
  });
  assert.equal(preparation.status, 'prepared-read-only-help-center');
  assert.equal(preparation.tests.supportEntryVerified, false);
  const support = summarizeN28HelpSupportFromCurrent({
    candidate: input.candidate,
    deviceSummary: input.deviceSummary,
    sourceDrift: input.sourceDrift,
    scrollsUsed: 4,
    capturedAt: input.capturedAt,
  });
  assert.equal(support.status, 'passed-read-only-help-support-visible');
  assert.equal(support.boundaries.supportSubmitted, false);
  assert.throws(() => summarizeN28HelpSupportFromCurrent({
    candidate: input.candidate,
    deviceSummary: input.deviceSummary,
    sourceDrift: input.sourceDrift,
    scrollsUsed: 9,
    capturedAt: input.capturedAt,
  }));
});

test('makes the persistent settings-root handoff explicit and fails closed for ambiguous modes', () => {
  const preparation = parseN28AccountSupportSurfaceArguments([
    '--candidate-dir', 'private-candidate', '--prepare-settings',
  ]);
  assert.equal(preparation.prepareSettings, true);
  assert.equal(preparation.fromCurrentSettings, false);
  assert.equal(preparation.onlyEntry, null);

  const entry = parseN28AccountSupportSurfaceArguments([
    '--candidate-dir', 'private-candidate', '--from-current-settings', '--only', 'Zahlungsmethoden',
    '--retain-settings-root',
  ]);
  assert.equal(entry.prepareSettings, false);
  assert.equal(entry.fromCurrentSettings, true);
  assert.equal(entry.onlyEntry, 'Zahlungsmethoden');
  assert.equal(entry.retainSettingsRoot, true);

  assert.throws(() => parseN28AccountSupportSurfaceArguments([
    '--candidate-dir', 'private-candidate', '--prepare-settings', '--only', 'Zahlungsmethoden',
  ]));
  assert.throws(() => parseN28AccountSupportSurfaceArguments([
    '--candidate-dir', 'private-candidate', '--from-current-settings',
  ]));
  assert.throws(() => parseN28AccountSupportSurfaceArguments([
    '--candidate-dir', 'private-candidate', '--retain-settings-root', '--only', 'Zahlungsmethoden',
  ]));
  assert.throws(() => parseN28AccountSupportSurfaceArguments([
    '--candidate-dir', 'private-candidate', '--privacy-data-export-from-current', '--only', 'Datenschutz-Infos',
  ]));
  assert.throws(() => parseN28AccountSupportSurfaceArguments([
    '--candidate-dir', 'private-candidate', '--prepare-help-center', '--prepare-settings',
  ]));
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
  assert.match(source, /--prepare-settings/u);
  assert.match(source, /--from-current-settings/u);
  assert.match(source, /--retain-settings-root/u);
  assert.match(source, /Öffentliche Informationen/u);
  assert.match(source, /Datenexport/u);
  assert.match(source, /--privacy-data-export-from-current/u);
  assert.match(source, /--prepare-help-center/u);
  assert.match(source, /--help-support-from-current/u);
  assert.match(source, /inspectAccountEntryFromSettings/u);
});
