import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
  classifyPasswordCredentialState,
  classifyPasswordChangeSurface,
  completePixelPasswordChange,
  confirmColdStableGuestSession,
  dismissPasswordKeyboardBeforeSubmit,
  executePixelPasswordChange,
  findPasswordAction,
  isPasswordChangeLoginSurface,
  isPasswordInteractionOwnerReadySurface,
  passwordSuccessResultRequiresExplicitDismissal,
  preflightPixelPasswordChange,
  preparePasswordChangeJournal,
  probePasswordChangeJournal,
  probePasswordChangeJournalUntilKnown,
  restoreOriginalPassword,
  sanitizePasswordChangeFailure,
  selectNamedPasswordActionNode,
  transitionPasswordChangeJournal,
} from '../../tool/diagnose_android_password_change.mjs';

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

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090503',
  commit: 'a'.repeat(40),
  apkSha256: 'b'.repeat(64),
  signingCertificateSha256: 'c'.repeat(64),
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
});

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'sit-password-change-'));
  const sourceVaultFile = resolve(directory, 'accounts.json');
  writeFileSync(sourceVaultFile, '{}\n', { mode: 0o600 });
  chmodSync(sourceVaultFile, 0o600);
  const journalFile = resolve(directory, 'journal', 'state.json');
  const account = {
    role: 'renter',
    email: 'synthetic@example.invalid',
    password: ['original', 'fixture', 'password', '1'].join('-'),
  };
  const readVault = () => ({
    canonical: sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts: [account],
    },
  });
  return { directory, sourceVaultFile, journalFile, account, readVault };
}

test('prepares a durable owner-only rollback credential before any mutation', (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  const result = preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
    now: new Date('2026-09-05T12:00:00.000Z'),
    random: (size) => Buffer.alloc(size, 7),
  });
  assert.equal(result.status, 'prepared-before-password-mutation');
  assert.equal(result.rollbackRequired, false);
  assert.equal(result.containsCredential, false);
  assert.equal(result.containsEmailAddress, false);
  assert.equal(result.containsPrivateFilesystemPath, false);
  assert.equal(statSync(resolve(value.directory, 'journal')).mode & 0o077, 0);
  assert.equal(statSync(value.journalFile).mode & 0o077, 0);
  const privateValue = readOwnerOnlyJson(value.journalFile);
  assert.match(privateValue.replacementPassword, /^S1tC[A-Za-z0-9_-]{32}$/u);
  assert.match(privateValue.sourceVaultIntegrityKey, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(privateValue.sourceVaultMac, /^[0-9a-f]{64}$/u);
  assert.equal(privateValue.sourceVaultSha256, undefined);
  assert.equal(privateValue.rollbackRequired, false);
  assert.deepEqual(privateValue.events.map((entry) => entry.event), [
    'rollback-credential-durably-prepared',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /synthetic|original|fixture|state\.json/u);
});

test('credential truth requires exact structured rejection and revoked accepted sessions', () => {
  const accepted = { status: 200, principalMatches: true, sessionRevoked: true };
  const rejected = { status: 401, error: 'invalid_credentials', sessionCreated: false };
  assert.equal(classifyPasswordCredentialState({ original: accepted, replacement: rejected }), 'original-password-active');
  assert.equal(classifyPasswordCredentialState({ original: rejected, replacement: accepted }), 'replacement-password-active');
  for (const ambiguous of [
    { status: 408, error: 'timeout' },
    { status: 401, error: null },
    { status: 403, error: 'invalid_credentials' },
    { status: 200, principalMatches: false, sessionRevoked: true },
    { status: 200, principalMatches: true, sessionRevoked: false },
  ]) {
    assert.equal(
      classifyPasswordCredentialState({ original: ambiguous, replacement: rejected }),
      'password-state-unknown',
    );
  }
});

test('password surface classification stays sanitized and distinguishes navigation stages', () => {
  const node = (label) => `<node content-desc="${label}" />`;
  const field = (label) => `<node class="android.widget.EditText" enabled="true" hint="${label}" />`;
  assert.equal(classifyPasswordChangeSurface([
    field('Aktuelles Passwort'),
    field('Neues Passwort'),
    field('Neues Passwort bestätigen'),
  ].join('')), 'password-form');
  assert.notEqual(classifyPasswordChangeSurface([
    node('Aktuelles Passwort'),
    node('Neues Passwort'),
    node('Neues Passwort bestätigen'),
  ].join('')), 'password-form');
  assert.equal(classifyPasswordChangeSurface(node('Passwort ändern')), 'security-settings');
  assert.equal(classifyPasswordChangeSurface(node('Kontoeinstellungen')), 'account-settings-entry');
  assert.equal(classifyPasswordChangeSurface(node('Abmelden')), 'authenticated-profile');
  assert.equal(classifyPasswordChangeSurface(node('Anmelden')), 'login');
  assert.equal(classifyPasswordChangeSurface(node('Passwort geändert')),
    'definite-password-change-success');
  assert.equal(classifyPasswordChangeSurface(node('Passwort nicht geändert')),
    'definite-password-change-rejection');
  assert.equal(classifyPasswordChangeSurface(node('Passwort serverseitig geändert')),
    'confirmed-password-change-local-finalization-failed');
  assert.equal(classifyPasswordChangeSurface(node('Ergebnis der Passwortänderung unklar')),
    'password-change-outcome-unknown');
  assert.equal(classifyPasswordChangeSurface(node('private-unrecognized-value')), 'unclassified');
});

test('password mutation readiness requires one current device and the loaded session action', () => {
  const node = (label) => `<node text="${label}" enabled="true" />`;
  const ready = [node('Pixel (Dieses Gerät)'), node('Alle Geräte abmelden')].join('');
  assert.equal(isPasswordInteractionOwnerReadySurface(ready), true);
  assert.equal(isPasswordInteractionOwnerReadySurface(node('Pixel (Dieses Gerät)')), false);
  assert.equal(isPasswordInteractionOwnerReadySurface([
    node('Pixel (Dieses Gerät)'),
    node('Other (Dieses Gerät)'),
    node('Alle Geräte abmelden'),
  ].join('')), false);
});

test('credential entry requires guest truth to survive a cold relaunch', async () => {
  const calls = [];
  assert.equal(await confirmColdStableGuestSession({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async () => {},
    ensureGuest: async () => {
      calls.push('guest');
      return true;
    },
  }), true);
  assert.deepEqual(calls, ['guest', 'guest']);

  let unstableCalls = 0;
  assert.equal(await confirmColdStableGuestSession({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async () => {},
    ensureGuest: async () => ++unstableCalls === 1,
  }), false);
  assert.equal(unstableCalls, 2);
});

test('failed initial guest transition never attempts the cold confirmation', async () => {
  let calls = 0;
  assert.equal(await confirmColdStableGuestSession({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async () => {},
    ensureGuest: async () => {
      calls += 1;
      return false;
    },
  }), false);
  assert.equal(calls, 1);
});

test('password submit leaves an already hidden software keyboard untouched', async () => {
  let backPresses = 0;
  let waits = 0;
  assert.equal(await dismissPasswordKeyboardBeforeSubmit({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async () => {
      waits += 1;
    },
    readInputMethodState: () => 'mInputShown=false mIsInputViewShown=false',
    pressBack: () => {
      backPresses += 1;
    },
  }), true);
  assert.equal(backPresses, 0);
  assert.equal(waits, 0);
});

test('password submit dismisses a shown keyboard and proves the hidden state', async () => {
  const states = [
    'mInputShown=true mIsInputViewShown=true',
    'mInputShown=true mIsInputViewShown=true',
    'mInputShown=false mIsInputViewShown=false',
  ];
  let backPresses = 0;
  const waits = [];
  assert.equal(await dismissPasswordKeyboardBeforeSubmit({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async (milliseconds) => waits.push(milliseconds),
    readInputMethodState: () => states.shift(),
    pressBack: () => {
      backPresses += 1;
    },
  }), true);
  assert.equal(backPresses, 1);
  assert.deepEqual(waits, [250]);
});

test('password submit fails closed while the software keyboard remains shown', async () => {
  let backPresses = 0;
  const waits = [];
  assert.equal(await dismissPasswordKeyboardBeforeSubmit({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async (milliseconds) => waits.push(milliseconds),
    attempts: 3,
    intervalMs: 125,
    readInputMethodState: () => 'mInputShown=true mIsInputViewShown=true',
    pressBack: () => {
      backPresses += 1;
    },
  }), false);
  assert.equal(backPresses, 1);
  assert.deepEqual(waits, [125, 125]);
});

test('password navigation selects the final same-label action when semantics are merged', () => {
  const first = '<node content-desc="Passwort ändern" enabled="true" clickable="false" bounds="[10,10][200,80]" />';
  const second = '<node content-desc="Passwort ändern" enabled="true" clickable="false" bounds="[10,300][500,420]" />';
  assert.equal(
    selectNamedPasswordActionNode(`${first}${second}`, 'Passwort ändern', { chooseLast: true }),
    second,
  );
  const clickable = second.replace('clickable="false"', 'clickable="true"');
  assert.equal(
    selectNamedPasswordActionNode(`${first}${clickable}`, 'Passwort ändern'),
    clickable,
  );
});

test('password navigation waits for delayed action rows before any viewport movement', async () => {
  const action = '<node text="Passwort ändern" enabled="true" bounds="[10,300][500,420]" />';
  const snapshots = ['', '', action];
  const waits = [];
  let swipes = 0;
  const result = await findPasswordAction({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    label: 'Passwort ändern',
    dumpUi: () => snapshots.shift() ?? action,
    swipe: () => {
      swipes += 1;
    },
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result, action);
  assert.deepEqual(waits, [400, 400]);
  assert.equal(swipes, 0);
});

test('password navigation waits for a visible action to become interactable before movement', async () => {
  const disabled = '<node text="Passwort ändern" enabled="false" bounds="[10,300][500,420]" />';
  const enabled = '<node text="Passwort ändern" enabled="true" bounds="[10,300][500,420]" />';
  const snapshots = [disabled, enabled];
  const waits = [];
  let swipes = 0;
  const result = await findPasswordAction({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    label: 'Passwort ändern',
    dumpUi: () => snapshots.shift() ?? enabled,
    swipe: () => {
      swipes += 1;
    },
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result, enabled);
  assert.deepEqual(waits, [400]);
  assert.equal(swipes, 0);
});

test('password navigation requires valid geometry for the same final action it will tap', async () => {
  const unusableFinal = [
    '<node text="Passwort ändern" enabled="true" bounds="[10,300][500,420]" />',
    '<node text="Passwort ändern" enabled="true" />',
  ].join('');
  const usableFinal = [
    '<node text="Passwort ändern" enabled="true" bounds="[10,300][500,420]" />',
    '<node text="Passwort ändern" enabled="true" bounds="[10,500][500,620]" />',
  ].join('');
  const snapshots = [unusableFinal, usableFinal];
  const waits = [];
  const result = await findPasswordAction({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    label: 'Passwort ändern',
    chooseLast: true,
    dumpUi: () => snapshots.shift() ?? usableFinal,
    swipe: () => {},
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result, usableFinal);
  assert.deepEqual(waits, [400]);
});

test('password navigation searches both bounded viewport directions after the initial settle', async () => {
  const action = '<node content-desc="Kontoeinstellungen" enabled="true" bounds="[10,300][500,420]" />';
  const snapshots = Array.from({ length: 11 }, () => '').concat(action);
  const swipes = [];
  const result = await findPasswordAction({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    label: 'Kontoeinstellungen',
    dumpUi: () => snapshots.shift() ?? action,
    swipe: (_commandRunner, _adbPath, _device, args) => swipes.push(args),
    wait: async () => {},
  });
  assert.equal(result, action);
  assert.equal(swipes.length, 5);
  assert.deepEqual(swipes.slice(0, 4).map((args) => [args[4], args[6]]), [
    ['2450', '700'],
    ['2450', '700'],
    ['2450', '700'],
    ['2450', '700'],
  ]);
  assert.deepEqual([swipes[4][4], swipes[4][6]], ['700', '2450']);
});

test('password navigation failure exposes only a sanitized route classification', async () => {
  await assert.rejects(findPasswordAction({
    commandRunner: () => '',
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    label: 'Passwort ändern',
    dumpUi: () => '<node text="private@example.invalid" />',
    swipe: () => {},
    wait: async () => {},
  }), /Passwort ändern action is unavailable after bounded viewport search; final classification: unclassified\./u);
});

test('password success toast does not require a nonexistent dismissal action', () => {
  assert.equal(passwordSuccessResultRequiresExplicitDismissal(
    '<node content-desc="Passwort geändert" enabled="true" />',
  ), false);
  assert.equal(passwordSuccessResultRequiresExplicitDismissal([
    '<node content-desc="Passwort geändert" enabled="true" />',
    '<node text="OK" enabled="true" />',
  ].join('')), true);
  assert.equal(passwordSuccessResultRequiresExplicitDismissal([
    '<node content-desc="Passwort geändert" enabled="true" />',
    '<node text="OK" enabled="false" />',
  ].join('')), false);
});

test('post-password-change login accepts the Android email input hint', () => {
  const login = [
    '<node text="Anmelden" enabled="true" />',
    '<node class="android.widget.EditText" enabled="true" hint="E-Mail" />',
  ].join('');
  assert.equal(isPasswordChangeLoginSurface(login), true);
  assert.equal(isPasswordChangeLoginSurface(
    '<node text="Anmelden" enabled="true" /><node hint="E-Mail" />',
  ), false);
  assert.equal(isPasswordChangeLoginSurface(
    '<node class="android.widget.EditText" enabled="true" hint="E-Mail" />',
  ), false);
});

function response(status, value = null) {
  return {
    status,
    async json() {
      if (value === null) throw new SyntaxError('not json');
      return value;
    },
  };
}

test('Staging probe validates the exact principal and revokes every accepted session', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
    random: (size) => Buffer.alloc(size, 9),
  });
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/login')) {
      const body = JSON.parse(options.body);
      return body.password === value.account.password
        ? response(200, { accessToken: 'a'.repeat(24), refreshToken: 'r'.repeat(24) })
        : response(401, { error: 'invalid_credentials' });
    }
    if (url.endsWith('/auth/me')) {
      return response(200, { user: { id: 'synthetic-renter', email: value.account.email } });
    }
    if (url.endsWith('/auth/logout')) return response(204);
    throw new Error('unexpected request');
  };
  const result = await probePasswordChangeJournal({
    journalFile: value.journalFile,
    fetchImpl,
    readVault: value.readVault,
  });
  assert.equal(result.state, 'original-password-active');
  assert.equal(result.acceptedSessionRevoked, true);
  assert.equal(calls.filter(({ url }) => url.endsWith('/auth/login')).length, 1);
  assert.equal(calls.filter(({ url }) => url.endsWith('/auth/logout')).length, 1);
  assert.doesNotMatch(JSON.stringify(result), /synthetic|fixture|@|accessToken|refreshToken/u);
});

test('bounded password-state probe retries only unknown transport outcomes', async () => {
  const waits = [];
  let probes = 0;
  const result = await probePasswordChangeJournalUntilKnown({
    journalFile: '/synthetic-private-journal',
    probe: async () => ({
      state: ++probes < 3 ? 'password-state-unknown' : 'replacement-password-active',
    }),
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result.state, 'replacement-password-active');
  assert.equal(probes, 3);
  assert.deepEqual(waits, [1_000, 3_000]);
});

test('Staging probe leaves transport and unstructured authentication results unknown', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
    random: (size) => Buffer.alloc(size, 10),
  });
  let calls = 0;
  const result = await probePasswordChangeJournal({
    journalFile: value.journalFile,
    readVault: value.readVault,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error('transport');
      return response(401);
    },
  });
  assert.equal(result.state, 'password-state-unknown');
  assert.equal(result.exactStructuredRejectionObserved, false);
});

test('journal can arm, confirm replacement and clear rollback only after exact restoration', (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
    random: randomBytes,
  });
  const originalRead = readFileSync(value.sourceVaultFile, 'utf8');
  assert.throws(() => transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: 'password-state-unknown',
    readVault: value.readVault,
  }), /not safely proven/u);
  let privateValue = JSON.parse(readFileSync(value.journalFile, 'utf8'));
  assert.equal(privateValue.status, 'prepared-before-password-mutation');
  assert.equal(privateValue.rollbackRequired, false);

  let result = transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: 'original-password-active',
    readVault: value.readVault,
  });
  assert.equal(result.rollbackRequired, true);
  result = transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'armed-before-password-mutation',
    nextStatus: 'replacement-password-confirmed',
    observedCredentialState: 'replacement-password-active',
    readVault: value.readVault,
  });
  assert.equal(result.rollbackRequired, true);
  assert.throws(() => transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'replacement-password-confirmed',
    nextStatus: 'original-password-restored',
    observedCredentialState: 'password-state-unknown',
    readVault: value.readVault,
  }), /not safely proven/u);
  privateValue = JSON.parse(readFileSync(value.journalFile, 'utf8'));
  assert.equal(privateValue.rollbackRequired, true);
  result = transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'replacement-password-confirmed',
    nextStatus: 'original-password-restored',
    observedCredentialState: 'original-password-active',
    readVault: value.readVault,
  });
  assert.equal(result.rollbackRequired, false);
  assert.deepEqual(JSON.parse(readFileSync(value.journalFile, 'utf8')).events.map((entry) => entry.event), [
    'rollback-credential-durably-prepared',
    'rollback-armed-before-first-password-mutation',
    'replacement-password-exactly-confirmed',
    'original-password-exactly-restored',
  ]);
  assert.equal(JSON.parse(readFileSync(value.journalFile, 'utf8')).replacementPassword, undefined);
  assert.equal(JSON.parse(readFileSync(value.journalFile, 'utf8')).replacementCredentialRemoved, true);
  assert.equal(readFileSync(value.sourceVaultFile, 'utf8'), originalRead);
});

test('rollback submits no mutation when the armed attempt retained the original password', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: 'original-password-active',
    readVault: value.readVault,
  });
  let mutationCalls = 0;
  const result = await restoreOriginalPassword({
    journalFile: value.journalFile,
    readVault: value.readVault,
    probe: async () => ({ state: 'original-password-active' }),
    mutate: async () => {
      mutationCalls += 1;
    },
  });
  assert.equal(result.originalPasswordRestored, true);
  assert.equal(result.remoteRollbackSubmitted, false);
  assert.equal(mutationCalls, 0);
  assert.equal(JSON.parse(readFileSync(value.journalFile, 'utf8')).rollbackRequired, false);
  assert.equal(JSON.parse(readFileSync(value.journalFile, 'utf8')).replacementPassword, undefined);
});

test('rollback resolves a lost response only through an independent exact credential probe', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: 'original-password-active',
    readVault: value.readVault,
  });
  let probes = 0;
  const result = await restoreOriginalPassword({
    journalFile: value.journalFile,
    readVault: value.readVault,
    probe: async () => ({
      state: ++probes === 1 ? 'replacement-password-active' : 'original-password-active',
    }),
    mutate: async () => {
      throw new Error('transport result lost after remote acceptance');
    },
  });
  assert.equal(result.originalPasswordRestored, true);
  assert.equal(result.remoteRollbackSubmitted, false);
  assert.equal(probes, 2);
  assert.equal(JSON.parse(readFileSync(value.journalFile, 'utf8')).rollbackRequired, false);
});

test('rollback remains armed and performs no write when credential truth is unknown', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: 'original-password-active',
    readVault: value.readVault,
  });
  let mutationCalls = 0;
  await assert.rejects(restoreOriginalPassword({
    journalFile: value.journalFile,
    readVault: value.readVault,
    probe: async () => ({ state: 'password-state-unknown' }),
    wait: async () => {},
    mutate: async () => {
      mutationCalls += 1;
    },
  }), /unknown/u);
  assert.equal(mutationCalls, 0);
  assert.equal(JSON.parse(readFileSync(value.journalFile, 'utf8')).rollbackRequired, true);
});

test('Pixel execution durably arms rollback before the first UI mutation', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  value.readVault = () => ({
    canonical: value.sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts: [
        value.account,
        { ...value.account, role: 'owner', displayName: 'OwnerFixture' },
      ],
    },
  });
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  const events = [];
  let probes = 0;
  const result = await executePixelPasswordChange({
    journalFile: value.journalFile,
    candidate,
    device: { serial: 'synthetic-device' },
    readVault: value.readVault,
    commandRunner: (_file, args, options = {}) => {
      if (args.includes('dumpsys') && args.includes('package')) {
        return `versionName=1.0.0\nversionCode=2026090503 minSdk=24 targetSdk=35`;
      }
      if (args.includes('pm') && args.includes('path')) return 'package:/data/app/synthetic/base.apk';
      if (args.includes('cat') && options.binary === true) return Buffer.from('fixture-apk');
      if (args.includes('policy')) return 'keyguardShowing=false';
      return '';
    },
    probe: async () => ({
      state: ++probes === 1 ? 'original-password-active' : 'replacement-password-active',
    }),
    performUi: async () => {
      const privateState = JSON.parse(readFileSync(value.journalFile, 'utf8'));
      events.push(privateState.status, privateState.rollbackRequired);
      return { definiteSuccessPresented: true, localSessionCleared: true };
    },
    verifyInstalled: () => ({ versionName: '1.0.0', buildNumber: '2026090503' }),
  });
  assert.deepEqual(events, ['armed-before-password-mutation', true]);
  assert.equal(result.status, 'replacement-password-confirmed');
  assert.equal(result.rollbackRequired, true);
});

test('Pixel execution rejects a mismatched candidate binding before touching the device', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  let deviceCalls = 0;
  await assert.rejects(executePixelPasswordChange({
    journalFile: value.journalFile,
    candidate: { ...candidate, buildNumber: '2026090504' },
    device: { serial: 'synthetic-device' },
    readVault: value.readVault,
    commandRunner: () => {
      deviceCalls += 1;
      return '';
    },
  }), /does not match/u);
  assert.equal(deviceCalls, 0);
  const privateValue = JSON.parse(readFileSync(value.journalFile, 'utf8'));
  assert.equal(privateValue.status, 'prepared-before-password-mutation');
  assert.equal(privateValue.rollbackRequired, false);
});

test('password preflight restores the protected owner even when form navigation fails', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  const owner = { ...value.account, role: 'owner', displayName: 'OwnerFixture' };
  value.readVault = () => ({
    canonical: value.sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts: [value.account, owner],
    },
  });
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  const events = [];
  await assert.rejects(preflightPixelPasswordChange({
    journalFile: value.journalFile,
    candidate,
    device: { serial: 'synthetic-device' },
    readVault: value.readVault,
    commandRunner: (_file, args) => args.includes('policy') ? 'keyguardShowing=false' : '',
    verifyInstalled: () => ({ versionName: '1.0.0', buildNumber: '2026090503' }),
    probe: async () => ({ state: 'original-password-active' }),
    ensureGuest: async () => true,
    restoreSession: async () => true,
    openSurface: async () => {
      events.push('surface');
      throw new Error('The sanitized password change surface did not appear.');
    },
    restoreOwner: async () => {
      events.push('owner');
      return true;
    },
  }), /surface did not appear/u);
  assert.deepEqual(events, ['surface', 'owner']);
  const privateValue = JSON.parse(readFileSync(value.journalFile, 'utf8'));
  assert.equal(privateValue.status, 'prepared-before-password-mutation');
  assert.equal(privateValue.rollbackRequired, false);
});

test('failed Pixel execution rolls back and restores the protected owner session', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  const owner = { ...value.account, role: 'owner', displayName: 'OwnerFixture' };
  value.readVault = () => ({
    canonical: value.sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts: [value.account, owner],
    },
  });
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  const events = [];
  await assert.rejects(executePixelPasswordChange({
    journalFile: value.journalFile,
    candidate,
    device: { serial: 'synthetic-device' },
    readVault: value.readVault,
    commandRunner: (_file, args) => args.includes('policy') ? 'keyguardShowing=false' : '',
    verifyInstalled: () => ({ versionName: '1.0.0', buildNumber: '2026090503' }),
    probe: async () => ({ state: 'original-password-active' }),
    performUi: async () => {
      events.push('surface');
      throw new Error('The sanitized password change surface did not appear.');
    },
    rollback: async () => {
      events.push('rollback');
      return { originalPasswordRestored: true };
    },
    restoreOwner: async () => {
      events.push('owner');
      return true;
    },
  }), /surface did not appear/u);
  assert.deepEqual(events, ['surface', 'rollback', 'owner']);
});

test('failed Pixel execution still restores the protected owner when rollback stays armed', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  const owner = { ...value.account, role: 'owner', displayName: 'OwnerFixture' };
  value.readVault = () => ({
    canonical: value.sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts: [value.account, owner],
    },
  });
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  const events = [];
  await assert.rejects(executePixelPasswordChange({
    journalFile: value.journalFile,
    candidate,
    device: { serial: 'synthetic-device' },
    readVault: value.readVault,
    commandRunner: (_file, args) => args.includes('policy') ? 'keyguardShowing=false' : '',
    verifyInstalled: () => ({ versionName: '1.0.0', buildNumber: '2026090503' }),
    probe: async () => ({ state: 'original-password-active' }),
    performUi: async () => {
      events.push('surface');
      throw new Error('The sanitized password change surface did not appear.');
    },
    rollback: async () => {
      events.push('rollback');
      throw new Error('password-state-unknown');
    },
    restoreOwner: async () => {
      events.push('owner');
      return true;
    },
  }), /rollback remains required; the protected owner session was restored/u);
  assert.deepEqual(events, ['surface', 'rollback', 'owner']);
});

test('completion always restores the original password before reporting a verification failure', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: 'original-password-active',
    readVault: value.readVault,
  });
  transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'armed-before-password-mutation',
    nextStatus: 'replacement-password-confirmed',
    observedCredentialState: 'replacement-password-active',
    readVault: value.readVault,
  });
  value.readVault = () => ({
    canonical: value.sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts: [
        value.account,
        { ...value.account, role: 'owner', displayName: 'OwnerFixture' },
      ],
    },
  });
  const events = [];
  await assert.rejects(completePixelPasswordChange({
    journalFile: value.journalFile,
    candidate,
    device: { serial: 'synthetic-device' },
    readVault: value.readVault,
    commandRunner: (_file, args) => args.includes('policy') ? 'keyguardShowing=false' : '',
    verifyInstalled: () => ({ versionName: '1.0.0', buildNumber: '2026090503' }),
    performVerification: async () => {
      events.push('verification');
      throw new Error('synthetic physical failure');
    },
    rollback: async () => {
      events.push('rollback');
      return { originalPasswordRestored: true };
    },
    restoreOwner: async () => {
      events.push('owner');
      return true;
    },
  }), /synthetic physical failure/u);
  assert.deepEqual(events, ['verification', 'rollback', 'owner']);
});

test('completion reports success only after cold isolation, rollback and owner restoration', async (t) => {
  const value = fixture();
  t.after(() => rmSync(value.directory, { recursive: true, force: true }));
  preparePasswordChangeJournal({
    sourceVaultFile: value.sourceVaultFile,
    journalFile: value.journalFile,
    candidate,
    readVault: value.readVault,
  });
  transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: 'original-password-active',
    readVault: value.readVault,
  });
  transitionPasswordChangeJournal({
    journalFile: value.journalFile,
    expectedStatus: 'armed-before-password-mutation',
    nextStatus: 'replacement-password-confirmed',
    observedCredentialState: 'replacement-password-active',
    readVault: value.readVault,
  });
  value.readVault = () => ({
    canonical: value.sourceVaultFile,
    vault: {
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      stripeLivemode: false,
      accounts: [
        value.account,
        { ...value.account, role: 'owner', displayName: 'OwnerFixture' },
      ],
    },
  });
  const result = await completePixelPasswordChange({
    journalFile: value.journalFile,
    candidate,
    device: { serial: 'synthetic-device' },
    readVault: value.readVault,
    commandRunner: (_file, args) => args.includes('policy') ? 'keyguardShowing=false' : '',
    verifyInstalled: () => ({ versionName: '1.0.0', buildNumber: '2026090503' }),
    performVerification: async () => ({
      replacementLoginPassed: true,
      coldStartPassed: true,
      accountAToBIsolationPassed: true,
    }),
    rollback: async () => ({ originalPasswordRestored: true }),
    restoreOwner: async () => true,
  });
  assert.equal(result.status, 'passed-current-candidate-password-change-cold-isolation-and-cleanup');
  assert.equal(result.originalPasswordRestored, true);
  assert.equal(result.protectedOwnerSessionRestored, true);
  assert.doesNotMatch(
    JSON.stringify(result),
    /synthetic@example|original-fixture|S1tC|OwnerFixture/u,
  );
});

test('diagnostic failures never emit credentials, addresses, phone numbers or private paths', () => {
  assert.equal(
    sanitizePasswordChangeFailure(new Error('failed /private/tmp for user@example.test +491511234567 token-abcdefghijklmnopqrstuvwxyz123456')),
    'The sanitized current-candidate password diagnostic failed.',
  );
  assert.equal(
    sanitizePasswordChangeFailure(new Error('The original password is not the exact pre-mutation truth.')),
    'The original password is not the exact pre-mutation truth.',
  );
  assert.equal(
    sanitizePasswordChangeFailure(new Error('Password-change execution failed and the durable rollback remains required; the protected owner session was restored.')),
    'Password-change execution failed and the durable rollback remains required; the protected owner session was restored.',
  );
});
