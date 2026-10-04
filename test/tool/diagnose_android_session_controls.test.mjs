import assert from 'node:assert/strict';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  classifyRevokedSessionProbe,
  classifyTwoSessionInventory,
  isLogoutAllConfirmation,
  isRemoteSessionConfirmation,
  prepareSessionControlsJournal,
  sanitizeSessionControlsFailure,
  selectRemoteSessionSignOutNode,
  summarizeTwoSessionInventory,
  waitForExactTwoSessionInventory,
} from '../../tool/diagnose_android_session_controls.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090610',
  commit: 'a'.repeat(40),
  apkSha256: 'b'.repeat(64),
  signingCertificateSha256: 'c'.repeat(64),
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
});

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'sit-session-controls-'));
  const sourceVaultFile = resolve(directory, 'accounts.json');
  writeFileSync(sourceVaultFile, '{}\n', { mode: 0o600 });
  chmodSync(sourceVaultFile, 0o600);
  const journalFile = resolve(directory, 'journal', 'state.json');
  const syntheticCredential = (role) => [role, 'fixture', 'credential', 'only'].join('-');
  const accounts = [
    {
      role: 'owner',
      email: 'owner@example.invalid',
      password: syntheticCredential('owner'),
      displayName: 'Exact Owner',
    },
    {
      role: 'renter',
      email: 'renter@example.invalid',
      password: syntheticCredential('renter'),
      displayName: 'Exact Renter',
    },
  ];
  const readVault = () => ({
    canonical: sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts,
    },
  });
  return { directory, sourceVaultFile, journalFile, accounts, readVault };
}

function readOwnerOnlyJson(path) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.mode & 0o077, 0);
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } finally {
    closeSync(descriptor);
  }
}

test('prepares owner-only recovery before creating any diagnostic session', (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  const result = prepareSessionControlsJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
    now: new Date('2026-09-07T12:00:00.000Z'),
    random: (size) => Buffer.alloc(size, 4),
  });
  assert.equal(result.status, 'prepared-before-session-mutation');
  assert.equal(result.recoveryRequired, false);
  assert.equal(result.containsEmailAddress, false);
  assert.equal(result.containsCredential, false);
  assert.equal(result.containsToken, false);
  assert.equal(result.containsSessionId, false);
  assert.equal(statSync(resolve(value.directory, 'journal')).mode & 0o077, 0);
  assert.equal(statSync(value.journalFile).mode & 0o077, 0);
  const journal = readOwnerOnlyJson(value.journalFile);
  assert.equal(journal.status, 'prepared-before-session-mutation');
  assert.equal(journal.recoveryRequired, false);
  assert.match(journal.sourceVaultIntegrityKey, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(journal.sourceVaultMac, /^[0-9a-f]{64}$/u);
  assert.deepEqual(journal.events.map((entry) => entry.event), [
    'isolated-session-recovery-durably-prepared',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /owner@|renter@|private-password|state\.json/u);
});

test('two-session truth requires exact distinct Linux current and Android remote sessions', () => {
  const linuxId = '11111111-1111-4111-8111-111111111111';
  const androidId = '22222222-2222-4222-8222-222222222222';
  const exact = [
    { id: linuxId, name: 'Linux', isThisDevice: true },
    { id: androidId, name: 'Android', isThisDevice: false },
  ];
  assert.equal(
    classifyTwoSessionInventory(exact, linuxId),
    'exact-linux-current-and-android-remote',
  );
  for (const ambiguous of [
    exact.slice(0, 1),
    [...exact, { id: '33333333-3333-4333-8333-333333333333', name: 'Mac', isThisDevice: false }],
    [{ ...exact[0], name: 'Browser' }, exact[1]],
    [exact[0], { ...exact[1], isThisDevice: true }],
    [exact[0], { ...exact[1], id: linuxId }],
  ]) {
    assert.equal(
      classifyTwoSessionInventory(ambiguous, linuxId),
      'session-inventory-ambiguous',
    );
  }
});

test('session inventory polling waits only for server-confirmed exact two-session truth', async () => {
  const linuxId = '11111111-1111-4111-8111-111111111111';
  const androidId = '22222222-2222-4222-8222-222222222222';
  const snapshots = [
    [{ id: linuxId, name: 'Linux', isThisDevice: true }],
    [
      { id: linuxId, name: 'Linux', isThisDevice: true },
      { id: androidId, name: 'Android', isThisDevice: false },
    ],
  ];
  const waits = [];
  assert.equal(await waitForExactTwoSessionInventory({
    fetchImpl: async () => {},
    session: { sessionId: linuxId },
    wait: async (milliseconds) => waits.push(milliseconds),
    readInventory: async () => snapshots.shift(),
  }), true);
  assert.deepEqual(waits, [250]);
});

test('session inventory polling fails closed after bounded confirmed ambiguity', async () => {
  const linuxId = '11111111-1111-4111-8111-111111111111';
  const waits = [];
  assert.equal(await waitForExactTwoSessionInventory({
    fetchImpl: async () => {},
    session: { sessionId: linuxId },
    wait: async (milliseconds) => waits.push(milliseconds),
    attempts: 3,
    intervalMs: 125,
    readInventory: async () => [{ id: linuxId, name: 'Linux', isThisDevice: true }],
  }), false);
  assert.deepEqual(waits, [125, 125]);
});

test('session inventory summary exposes only bounded structural counts', () => {
  const linuxId = '11111111-1111-4111-8111-111111111111';
  assert.equal(summarizeTwoSessionInventory([
    { id: linuxId, name: 'Linux', isThisDevice: true },
    { id: 'private-id', name: 'Private workstation label', isThisDevice: false },
  ], linuxId), 'total=2,current=1,remote=1,linux=1,android=0,other=1,currentMatch=true');
});

test('revocation truth accepts only the exact structured revoked-session response', () => {
  assert.equal(
    classifyRevokedSessionProbe({ status: 401, value: { error: 'account_not_active' } }),
    'session-definitely-revoked',
  );
  assert.equal(
    classifyRevokedSessionProbe({ status: 200, value: { sessions: [] } }),
    'session-definitely-active',
  );
  for (const result of [
    { status: 408, value: { error: 'timeout' } },
    { status: 401, value: null },
    { status: 401, value: { error: 'authentication_required' } },
    { status: 403, value: { error: 'account_not_active' } },
    { status: 502, value: null },
  ]) {
    assert.equal(classifyRevokedSessionProbe(result), 'session-state-unknown');
  }
});

test('remote sign-out selection binds to the Linux-owned row and rejects ambiguity', () => {
  const node = (label, bounds, clickable = false) => (
    `<node text="${label}" enabled="true" clickable="${clickable}" bounds="${bounds}" />`
  );
  const android = node('Android (Dieses Gerät)', '[20,100][600,180]');
  const linux = node('Linux', '[20,300][600,380]');
  const remoteAction = node('Abmelden', '[800,300][1050,380]', true);
  const unrelatedAction = node('Abmelden', '[800,800][1050,880]', true);
  assert.equal(
    selectRemoteSessionSignOutNode(`${android}${linux}${remoteAction}${unrelatedAction}`),
    remoteAction,
  );
  assert.throws(
    () => selectRemoteSessionSignOutNode(`${linux}${remoteAction}${remoteAction}`),
    /ambiguous/u,
  );
  assert.throws(
    () => selectRemoteSessionSignOutNode(`${node('Mac', '[20,300][600,380]')}${remoteAction}`),
    /unavailable/u,
  );
});

test('dialog recognition accepts duplicate route-barrier semantics without weakening actions', () => {
  const node = (label) => `<node content-desc="${label}" enabled="true" />`;
  assert.equal(isRemoteSessionConfirmation([
    node('Gerät abmelden?'),
    node('Abbrechen'),
    node('Abmelden'),
    node('Gerät abmelden?'),
  ].join('')), true);
  assert.equal(isRemoteSessionConfirmation([
    node('Gerät abmelden?'),
    node('Abbrechen'),
  ].join('')), false);
  assert.equal(isLogoutAllConfirmation([
    node('Alle Geräte abmelden?'),
    node('Alle abmelden'),
    node('Alle Geräte abmelden?'),
  ].join('')), true);
  assert.equal(isLogoutAllConfirmation(node('Alle Geräte abmelden?')), false);
});

test('sanitizer retains bounded operational errors and removes private-looking values', () => {
  assert.equal(
    sanitizeSessionControlsFailure(new Error('The targeted Staging session was not definitely revoked.')),
    'The targeted Staging session was not definitely revoked.',
  );
  assert.equal(
    sanitizeSessionControlsFailure(new Error('private renter@example.invalid token abcdefghijklmnopqrstuvwxyz123456')),
    'The sanitized current-candidate session-control diagnostic failed.',
  );
});
