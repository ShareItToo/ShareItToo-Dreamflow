import assert from 'node:assert/strict';
import {
  chmodSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  germanGboardDeletionConfirmationPoint,
  isExactGuestProfile,
  prepareAccountDeletionJournal,
  probeDeletionCredential,
  readAccountDeletionJournal,
  sanitizeAccountDeletionFailure,
  selectDeletionNode,
} from '../../tool/diagnose_android_account_deletion.mjs';
import { detectHighConfidenceSecretRules } from '../../backend/ops/secret_scan_rules.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090610',
  commit: '2fd793bac970866aa94a2940f28d6bbc3e04e377',
  apkSha256: 'a'.repeat(64),
  signingCertificateSha256: 'b'.repeat(64),
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
});

function privateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function fixtures({ collide = false } = {}) {
  const root = tempFixtures.makeSync('sit-account-deletion-');
  chmodSync(root, 0o700);
  const targetFile = resolve(root, 'target.json');
  const protectedFile = resolve(root, 'protected.json');
  const journalFile = resolve(root, 'journal.json');
  const targetAddress = `delete-${'x'.repeat(20)}@example.test`;
  privateJson(targetFile, {
    schemaVersion: 1,
    kind: 'sit-staging-ui-registration-vault',
    status: 'pixel-ui-registration-login-complete',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    account: {
      role: 'owner',
      displayName: 'SITUIDeleteFixture',
      email: targetAddress,
      password: `Target${'p'.repeat(28)}`,
    },
  });
  privateJson(protectedFile, {
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    status: 'email-link-verified-ready-for-login',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    accounts: [
      {
        role: 'owner',
        displayName: 'ProtectedOwner',
        email: collide ? targetAddress : 'protected-owner@example.test',
        password: `Owner${'q'.repeat(28)}`,
        registrationStatus: 'accepted',
        verificationStatus: 'email-link-verified',
      },
      {
        role: 'renter',
        displayName: 'ProtectedRenter',
        email: 'protected-renter@example.test',
        password: `Renter${'r'.repeat(28)}`,
        registrationStatus: 'accepted',
        verificationStatus: 'email-link-verified',
      },
    ],
  });
  return { root, targetFile, protectedFile, journalFile };
}

function response(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('prepares an owner-only exact-candidate recovery journal without public identity data', () => {
  const { targetFile, protectedFile, journalFile } = fixtures();
  const result = prepareAccountDeletionJournal({
    targetVaultFile: targetFile,
    protectedVaultFile: protectedFile,
    journalFile,
    candidate,
    occurredAt: new Date('2026-09-07T08:00:00Z'),
    random: (size) => Buffer.alloc(size, 7),
  });
  assert.equal(result.status, 'prepared-before-deletion');
  assert.equal(result.recoveryRequired, false);
  assert.equal(result.targetCredentialState, 'active');
  assert.equal(result.protectedOwnerRestored, true);
  assert.equal(result.containsEmailAddress, false);
  assert.doesNotMatch(JSON.stringify(result), /example\.test|Targetp|ProtectedOwner/u);
  const read = readAccountDeletionJournal(journalFile);
  assert.equal(read.journal.candidate.buildNumber, '2026090610');
  assert.equal(read.journal.targetVaultSha256.length, 64);
  assert.equal(read.journal.protectedVaultSha256.length, 64);
});

test('refuses a target that collides with either protected principal', () => {
  const { targetFile, protectedFile, journalFile } = fixtures({ collide: true });
  assert.throws(() => prepareAccountDeletionJournal({
    targetVaultFile: targetFile,
    protectedVaultFile: protectedFile,
    journalFile,
    candidate,
  }), /collides with a protected account/u);
});

test('refuses an unverified target and an invalid candidate before creating a journal', () => {
  const { targetFile, protectedFile, journalFile } = fixtures();
  const target = JSON.parse(readFileSync(targetFile, 'utf8'));
  target.status = 'pixel-ui-registration-accepted-pending-email';
  privateJson(targetFile, target);
  assert.throws(() => prepareAccountDeletionJournal({
    targetVaultFile: targetFile,
    protectedVaultFile: protectedFile,
    journalFile,
    candidate,
  }), /not an exact disposable verified Staging account/u);
  assert.throws(() => prepareAccountDeletionJournal({
    targetVaultFile: targetFile,
    protectedVaultFile: protectedFile,
    journalFile,
    candidate: { ...candidate, buildNumber: 'bad' },
  }), /candidate binding is invalid/u);
});

test('detects target and protected-source drift before deletion', () => {
  const first = fixtures();
  prepareAccountDeletionJournal({
    targetVaultFile: first.targetFile,
    protectedVaultFile: first.protectedFile,
    journalFile: first.journalFile,
    candidate,
  });
  const target = JSON.parse(readFileSync(first.targetFile, 'utf8'));
  target.account.displayName = 'ChangedTarget';
  privateJson(first.targetFile, target);
  assert.throws(() => readAccountDeletionJournal(first.journalFile), /disposable account source changed/u);

  const second = fixtures();
  prepareAccountDeletionJournal({
    targetVaultFile: second.targetFile,
    protectedVaultFile: second.protectedFile,
    journalFile: second.journalFile,
    candidate,
  });
  const protectedValue = JSON.parse(readFileSync(second.protectedFile, 'utf8'));
  protectedValue.accounts[0].displayName = 'ChangedOwner';
  privateJson(second.protectedFile, protectedValue);
  assert.throws(() => readAccountDeletionJournal(second.journalFile), /protected account source changed/u);
});

test('classifies only exact 401 invalid_credentials as deleted', async () => {
  const account = { email: 'target@example.test', password: `Target${'p'.repeat(28)}` };
  const calls = [];
  const deleted = await probeDeletionCredential({
    account,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(401, { error: 'invalid_credentials' });
    },
  });
  assert.equal(deleted.state, 'deleted');
  assert.equal(calls[0].url, 'https://staging.shareittoo.com/api/v1/auth/login');
  assert.deepEqual(JSON.parse(calls[0].options.body), account);
  assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)).sort(), ['email', 'password']);
  const timeout = await probeDeletionCredential({
    account,
    fetchImpl: async () => response(408, { error: 'invalid_credentials' }),
  });
  assert.equal(timeout.state, 'unknown');
  const unstructured = await probeDeletionCredential({
    account,
    fetchImpl: async () => response(401, { error: 'proxy_rejection' }),
  });
  assert.equal(unstructured.state, 'unknown');
  await assert.rejects(() => probeDeletionCredential({
    account: { email: 'target@example.test', password: 'short' },
    fetchImpl: async () => response(401, { error: 'invalid_credentials' }),
  }), /probe input is invalid/u);
});

test('accepts an exact active principal only after revoking its probe session', async () => {
  const account = { email: 'target@example.test', password: `Target${'p'.repeat(28)}` };
  const calls = [];
  const result = await probeDeletionCredential({
    account,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      calls.push(path);
      if (path.endsWith('/auth/login')) {
        return response(200, {
          accessToken: `access-${'a'.repeat(40)}`,
          refreshToken: `refresh-${'r'.repeat(40)}`,
        });
      }
      if (path.endsWith('/auth/me')) return response(200, { user: { email: account.email } });
      if (path.endsWith('/auth/logout')) return new Response(null, { status: 204 });
      return response(404, {});
    },
  });
  assert.equal(result.state, 'active');
  assert.equal(result.acceptedSessionRevoked, true);
  assert.deepEqual(calls.map((value) => value.split('/').at(-1)), ['login', 'me', 'logout']);
});

test('does not call an unreachable backend a deleted account', async () => {
  const result = await probeDeletionCredential({
    account: { email: 'target@example.test', password: `Target${'p'.repeat(28)}` },
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(result.state, 'unknown');
  assert.equal(result.acceptedSessionRevoked, false);
});

test('selects only an enabled exact owned deletion action', () => {
  const disabled = '<node text="Konto löschen" content-desc="" enabled="false" clickable="true" bounds="[0,0][40,40]" />';
  const enabled = '<node text="Konto löschen" content-desc="" enabled="true" clickable="true" bounds="[40,40][120,120]" />';
  assert.equal(selectDeletionNode(`${disabled}${enabled}`, 'Konto löschen'), enabled);
  assert.throws(() => selectDeletionNode(disabled, 'Konto löschen'), /unavailable/u);
});

test('binds the direct umlaut key to the verified Pixel German Gboard geometry', () => {
  assert.deepEqual(
    germanGboardDeletionConfirmationPoint({ width: 1440, height: 3120 }),
    { x: 1215, y: 2525 },
  );
  assert.throws(
    () => germanGboardDeletionConfirmationPoint({ width: 1080, height: 2400 }),
    /geometry is unavailable/u,
  );
});

test('accepts guest truth only on the profile surface without either known principal', () => {
  const guest = [
    '<node text="" content-desc="Konto erstellen" />',
    '<node text="" content-desc="Anmelden" />',
  ].join('');
  assert.equal(isExactGuestProfile(guest, 'DeletionTarget', 'ProtectedOwner'), true);
  assert.equal(isExactGuestProfile(`${guest}<node text="ProtectedOwner" />`, 'DeletionTarget', 'ProtectedOwner'), false);
  assert.equal(isExactGuestProfile('<node text="" content-desc="Entdecken" />', 'DeletionTarget', 'ProtectedOwner'), false);
});

test('failure sanitization never returns credentials, aliases or long tokens', () => {
  assert.equal(
    sanitizeAccountDeletionFailure(new Error('The account state is unavailable.')),
    'The account state is unavailable.',
  );
  for (const message of [
    'The account target@example.test failed.',
    `The token ${'x'.repeat(64)} failed.`,
    'backend exploded',
  ]) {
    assert.equal(
      sanitizeAccountDeletionFailure(new Error(message)),
      'The sanitized current-candidate account-deletion diagnostic failed.',
    );
  }
});

test('current wrong-password probe is scanner-clean and its immutable historical false positive is reviewed', () => {
  const diagnosticPath = resolve(import.meta.dirname, '../../tool/diagnose_android_account_deletion.mjs');
  const diagnostic = readFileSync(diagnosticPath, 'utf8');
  assert.equal(
    diagnostic.match(/SIT-INTENTIONAL-EGRESS/gu)?.length,
    1,
  );
  assert.doesNotMatch(diagnostic, /codeql\[js\/file-access-to-http\]/u);
  assert.match(diagnostic, /loginUrl\.origin !== 'https:\/\/staging\.shareittoo\.com'/u);
  assert.match(diagnostic, /loginUrl\.pathname !== '\/api\/v1\/auth\/login'/u);
  assert.deepEqual(
    detectHighConfidenceSecretRules(diagnostic, 'tool/diagnose_android_account_deletion.mjs'),
    [],
  );
  const baselinePath = resolve(import.meta.dirname, '../../backend/ops/secret_scan_history_baseline.json');
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  assert.ok(baseline.reviewedFindings.some((entry) => (
    entry.rule === 'static_password_template_assignment'
      && entry.source === '42ea6dc4206ed791081bec0433f0eb3890e3f046'
      && entry.file === 'tool/diagnose_android_account_deletion.mjs'
  )));
});
