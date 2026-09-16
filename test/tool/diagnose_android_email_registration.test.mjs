import assert from 'node:assert/strict';
import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  beginUiRegistrationSubmission,
  markUiRegistrationSubmissionOutcomeUnknown,
  prepareUiRegistrationVault,
  reconcileUiRegistrationEmailDelivery,
  transitionUiRegistrationVault,
} from '../../tool/diagnose_android_email_registration.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();
const source = readFileSync(
  new URL('../../tool/diagnose_android_email_registration.mjs', import.meta.url),
  'utf8',
);

function fixedRandom(size) {
  return Buffer.alloc(size, 7);
}

test('prepares one owner-only UI registration vault without exposing credentials', () => {
  const root = tempFixtures.makeSync('sit-ui-registration-vault-');
  const result = prepareUiRegistrationVault({
    baseEmail: 'owner@example.test',
    vaultRoot: root,
    now: new Date('2026-09-03T08:00:00.000Z'),
    random: fixedRandom,
  });
  const vault = JSON.parse(readFileSync(result.vaultFile, 'utf8'));
  assert.equal(result.status, 'prepared-for-pixel-ui-registration');
  assert.equal(result.containsEmailAddress, false);
  assert.equal(result.containsCredential, false);
  assert.equal(vault.kind, 'sit-staging-ui-registration-vault');
  assert.equal(vault.account.role, 'owner');
  assert.match(vault.account.email, /\+sit-.*-owner@example\.test$/u);
  assert.equal(statSync(result.vaultFile).mode & 0o077, 0);
});

test('enforces exact private state transitions', () => {
  const root = tempFixtures.makeSync('sit-ui-registration-transition-');
  const prepared = prepareUiRegistrationVault({
    baseEmail: 'owner@example.test',
    vaultRoot: root,
    now: new Date('2026-09-03T08:00:00.000Z'),
    random: fixedRandom,
  });
  beginUiRegistrationSubmission({ vaultFile: prepared.vaultFile });
  for (const [event, status] of [
    ['pixel-ui-submitted', 'pixel-ui-registration-accepted-pending-email'],
    ['email-link-confirmed', 'email-link-verified-ready-for-pixel-login'],
    ['pixel-login-cold-start-passed', 'pixel-ui-registration-login-complete'],
  ]) {
    const result = transitionUiRegistrationVault({
      vaultFile: prepared.vaultFile,
      event,
      occurredAt: new Date('2026-09-03T08:10:00.000Z'),
    });
    assert.equal(result.status, status);
    assert.equal(result.containsEmailAddress, false);
    assert.equal(result.containsCredential, false);
  }
});

test('retains an unknown registration submission until mail delivery reconciles it', () => {
  const root = tempFixtures.makeSync('sit-ui-registration-unknown-');
  const prepared = prepareUiRegistrationVault({
    baseEmail: 'owner@example.test',
    vaultRoot: root,
    now: new Date('2026-09-03T08:00:00.000Z'),
    random: fixedRandom,
  });
  assert.equal(beginUiRegistrationSubmission({ vaultFile: prepared.vaultFile }).status,
    'pixel-ui-registration-submission-in-progress');
  const unknown = markUiRegistrationSubmissionOutcomeUnknown({
    vaultFile: prepared.vaultFile,
  });
  assert.equal(unknown.status, 'pixel-ui-registration-submission-outcome-unknown');
  assert.equal(unknown.freshSubmissionAllowed, false);
  assert.equal(unknown.reconciliationRequired, true);
  assert.throws(
    () => transitionUiRegistrationVault({
      vaultFile: prepared.vaultFile,
      event: 'pixel-ui-submitted',
    }),
    /out of order/u,
  );
  const reconciled = reconcileUiRegistrationEmailDelivery({
    vaultFile: prepared.vaultFile,
  });
  assert.equal(reconciled.status, 'pixel-ui-registration-accepted-pending-email');
  assert.equal(reconciled.deliveryReconciled, true);
});

test('rejects skipped transitions and non-private vaults', () => {
  const root = tempFixtures.makeSync('sit-ui-registration-reject-');
  const prepared = prepareUiRegistrationVault({
    baseEmail: 'owner@example.test', vaultRoot: root,
    now: new Date('2026-09-03T08:00:00.000Z'), random: fixedRandom,
  });
  assert.throws(
    () => transitionUiRegistrationVault({
      vaultFile: prepared.vaultFile,
      event: 'email-link-confirmed',
    }),
    /out of order/u,
  );
  chmodSync(prepared.vaultFile, 0o644);
  assert.throws(
    () => transitionUiRegistrationVault({
      vaultFile: prepared.vaultFile,
      event: 'pixel-ui-submitted',
    }),
    /owner-only|invalid/u,
  );
});

test('wires the exact candidate, form, consent, verification and cold-start gates', () => {
  assert.match(source, /validatePrivateAndroidReleaseArchive/u);
  assert.match(source, /verifyInstalledCandidate/u);
  assert.match(source, /ensureAndroidGuestSession/u);
  assert.match(source, /restoreSyntheticSession/u);
  for (const marker of [
    'Dein SIT-Konto erstellen',
    'Name',
    'E-Mail',
    'Passwort wiederholen',
    'Kostenlos registrieren',
    'Prüfe deine E-Mail',
    'pixel-ui-registration-submission-outcome-unknown',
    'registration-email-delivery-reconciled',
    ...[
      'Ich bin 18 Jahre oder älter.',
      'Ich akzeptiere die AGB.',
      'Ich akzeptiere die Datenschutzbestimmungen.',
    ],
  ]) assert.match(source, new RegExp(marker, 'u'));
  assert.match(source, /pixel-login-cold-start-passed/u);
  assert.doesNotMatch(source, /console\.log\([^\n]*(email|password|token)/u);
});
