import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  classifyPhoneVerificationObservation,
  clearVerifiedPhoneFromStagingTestAccount,
  createPhoneVerificationCommandRunner,
  createPhoneConfirmationResultObserver,
  currentHeadAndroidEditableNodeForLabel,
  hasPhoneVerificationSmsInput,
  encodeAdbNumericInput,
  inspectStagingPhoneBackendGate,
  inspectPhoneVerificationSurface,
  normalizePrivatePhoneInput,
  normalizePrivateSmsCode,
  sanitizePhoneVerificationFailure,
  validateFrozenCandidateMobileCompatibility,
  waitForPhoneVerificationHierarchy,
  wakePhoneVerificationScreen,
} from '../../tool/diagnose_android_phone_verification.mjs';

const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(
  resolve(root, 'tool/diagnose_android_phone_verification.mjs'),
  'utf8',
);
const syntheticFixturePassword = ['not', 'printed'].join('-');

test('accepts only a German E.164 phone input', () => {
  assert.equal(normalizePrivatePhoneInput('0049 151 23456789'), '+4915123456789');
  assert.throws(
    () => normalizePrivatePhoneInput('+33123456789'),
    /valid German E.164/u,
  );
});

test('all persisted phone-verification states use the current N29 evidence kind', () => {
  assert.doesNotMatch(source, /n24-private-phone-verification-state/u);
  assert.match(source, /n29-private-phone-verification-state/u);
});

test('post-confirmation observation never turns an unproven attempt back into awaiting-code state', () => {
  assert.deepEqual(classifyPhoneVerificationObservation('verified'), {
    status: 'phone-verification-confirmed',
    freshSmsRequestRequired: false,
    reconciliationRequired: false,
  });
  assert.deepEqual(classifyPhoneVerificationObservation('unverified'), {
    status: 'phone-verification-not-confirmed-fresh-request-required',
    freshSmsRequestRequired: true,
    reconciliationRequired: false,
  });
  assert.deepEqual(classifyPhoneVerificationObservation('unknown'), {
    status: 'phone-verification-result-unproven-reconciliation-required',
    freshSmsRequestRequired: false,
    reconciliationRequired: true,
  });
  assert.throws(
    () => classifyPhoneVerificationObservation('awaiting-owner-sms-code'),
    /observation state is invalid/u,
  );
});

test('accepts exactly one six-digit private SMS confirmation input', () => {
  assert.equal(normalizePrivateSmsCode(' 123456\n'), '123456');
  for (const invalid of ['12345', '1234567', '12 3456', 'abcdef', '']) {
    assert.throws(() => normalizePrivateSmsCode(invalid), /six-digit code/u);
  }
});

test('encodes the international prefix as digits for Android text injection', () => {
  assert.equal(encodeAdbNumericInput('+4915123456789'), '004915123456789');
  assert.equal(encodeAdbNumericInput('123456'), '123456');
  assert.throws(() => encodeAdbNumericInput('12 34'), /numeric Android input/u);
});

test('selects the enabled EditText below its semantic label instead of tapping the label', () => {
  const hierarchy = [
    '<hierarchy>',
    '<node class="android.view.View" content-desc="Telefonnummer" enabled="true" bounds="[48,443][1392,494]" />',
    '<node class="android.widget.EditText" text="" enabled="true" bounds="[92,568][1348,716]" />',
    '<node class="android.widget.EditText" text="" enabled="true" bounds="[92,1200][1348,1348]" />',
    '</hierarchy>',
  ].join('');
  assert.match(
    currentHeadAndroidEditableNodeForLabel(hierarchy, 'Telefonnummer'),
    /\[92,568\]\[1348,716\]/u,
  );
  assert.throws(
    () => currentHeadAndroidEditableNodeForLabel(hierarchy, 'SMS-Code'),
    /input field is unavailable/u,
  );
});

test('SMS input accepts an exact Android hint with the app non-breaking hyphen', () => {
  const field = '<node class="android.widget.EditText" text="" content-desc="" hint="SMS&#x2011;Code" enabled="true" bounds="[51,2622][1389,2820]" />';
  assert.equal(hasPhoneVerificationSmsInput(field), true);
  assert.equal(currentHeadAndroidEditableNodeForLabel(field, 'SMS-Code'), field);
  assert.equal(hasPhoneVerificationSmsInput(field.replace('enabled="true"', 'enabled="false"')), false);
  assert.equal(hasPhoneVerificationSmsInput(field.replace('SMS&#x2011;Code', 'Unrelated code')), false);
  assert.equal(hasPhoneVerificationSmsInput(field + field), false);
  assert.throws(() => currentHeadAndroidEditableNodeForLabel(field + field, 'SMS-Code'), /ambiguous/u);
});

const smsSheet = '<node class="android.widget.EditText" hint="SMS-Code" enabled="true" bounds="[40,100][400,180]" />';
const rejectedSmsSheet = `${smsSheet}<node content-desc="SMS-Code prüfen" />`;

test('unchanged previous SMS rejection cannot terminate current confirmation polling', () => {
  const observed = createPhoneConfirmationResultObserver(rejectedSmsSheet);
  assert.equal(observed(rejectedSmsSheet), false);
  assert.equal(observed(rejectedSmsSheet), false);
  assert.equal(observed('<node content-desc="Telefonnummer verifiziert" />'), true);
});

test('pending retry clears prior rejection before an identical new rejection', () => {
  const observed = createPhoneConfirmationResultObserver(rejectedSmsSheet);
  assert.equal(observed(smsSheet), false);
  assert.equal(observed(rejectedSmsSheet), true);
});

test('missing or unrelated surface does not manufacture a fresh SMS result', () => {
  const observed = createPhoneConfirmationResultObserver(rejectedSmsSheet);
  assert.equal(observed('<hierarchy />'), false);
  assert.equal(observed('<node content-desc="Other dialog" />'), false);
  assert.equal(observed(rejectedSmsSheet), false);
});

test('first rejection, changed unknown result and known confirmation are observable', () => {
  assert.equal(createPhoneConfirmationResultObserver(smsSheet)(rejectedSmsSheet), true);
  assert.equal(createPhoneConfirmationResultObserver(rejectedSmsSheet)(`${smsSheet}Ergebnisstatus unklar`), true);
  assert.equal(createPhoneConfirmationResultObserver(rejectedSmsSheet)(`${smsSheet}Telefonnummer bestätigt`), true);
});

function phoneSurface({ verified = false, fieldText = '', status = true } = {}) {
  return [
    '<node class="android.view.View" content-desc="Telefonnummer" bounds="[40,100][400,150]" />',
    `<node class="android.widget.EditText" text="${fieldText}" enabled="true" bounds="[40,180][400,250]" />`,
    status ? `<node class="android.view.View" content-desc="${verified ? 'Verifiziert' : 'Nicht verifiziert'}" bounds="[40,270][400,310]" />` : '',
    `<node class="android.widget.Button" content-desc="Telefonnummer verifizieren" enabled="${!verified}" bounds="[40,330][400,390]" />`,
    '<node class="android.view.View" content-desc="E-Mail-Adresse" bounds="[40,420][400,450]" />',
    '<node class="android.view.View" content-desc="Verifiziert" bounds="[40,520][400,550]" />',
  ].join('');
}

test('phone truth is scoped to its own section and does not borrow verified email truth', () => {
  assert.deepEqual(inspectPhoneVerificationSurface(phoneSurface()), { state: 'unverified', phoneInputEmpty: true });
  assert.deepEqual(inspectPhoneVerificationSurface(phoneSurface({ verified: true, fieldText: 'synthetic-phone' })), { state: 'verified', phoneInputEmpty: false });
  assert.equal(inspectPhoneVerificationSurface(phoneSurface({ status: false })).state, 'unknown');
  assert.equal(inspectPhoneVerificationSurface(phoneSurface({ verified: true }).replace('enabled="false"', 'enabled="true"')).state, 'unknown');
  assert.equal(inspectPhoneVerificationSurface(phoneSurface() + '<node class="android.widget.EditText" hint="SMS-Code" enabled="true" bounds="[40,580][400,630]" />').state, 'unknown');
});

test('phone command runner bounds every device command and keeps output captured', () => {
  let observed;
  const runner = createPhoneVerificationCommandRunner((file, args, options) => {
    observed = { file, args, options };
    return 'safe-fixture';
  });
  assert.equal(runner('adb', ['devices']), 'safe-fixture');
  assert.equal(observed.options.timeout, 30000);
  assert.deepEqual(observed.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(observed.options.encoding, 'utf8');
  runner('adb', ['exec-out'], { binary: true });
  assert.equal(observed.options.encoding, null);
});

test('phone diagnostics wake without a persistent setting and still fail closed when locked', () => {
  const calls = [];
  wakePhoneVerificationScreen((file, args) => {
    calls.push({ file, args });
    return '';
  }, 'adb', { serial: 'synthetic-device' });
  assert.deepEqual(calls.map(({ args }) => args.slice(2)), [
    ['shell', 'input', 'keyevent', '224'],
    ['shell', 'dumpsys', 'window', 'policy'],
  ]);
  assert.equal(calls.some(({ args }) => args.includes('settings')), false);
  assert.equal(calls.some(({ args }) => args.includes('dismiss-keyguard')), false);

  assert.throws(() => wakePhoneVerificationScreen((_file, args) => (
    args.includes('dumpsys') ? 'keyguardShowing=true' : ''
  ), 'adb', { serial: 'synthetic-device' }), /locked/u);
});

test('phone surface polling has an elapsed-time deadline instead of a timing workaround', async () => {
  let clock = 0;
  let dumps = 0;
  await assert.rejects(waitForPhoneVerificationHierarchy({
    commandRunner: (_file, args) => {
      if (args.includes('uiautomator')) dumps += 1;
      return '<hierarchy />';
    },
    adbPath: 'adb',
    device: { serial: 'synthetic-device' },
    wait: async () => { clock += 600; },
    now: () => clock,
    timeoutMs: 1000,
    predicate: () => false,
    attempts: 150,
    label: 'fixture result',
  }), /surface did not appear/u);
  assert.equal(dumps, 1);
});

test('diagnostic failures suppress phone numbers and SMS secrets', () => {
  assert.equal(
    sanitizePhoneVerificationFailure(new Error('failed for +4915123456789')),
    'safe diagnostic reason unavailable',
  );
  assert.equal(
    sanitizePhoneVerificationFailure(new Error('The sanitized action is unavailable.')),
    'The sanitized action is unavailable.',
  );
});

test('frozen candidate accepts only non-mobile post-build changes', () => {
  assert.deepEqual(
    validateFrozenCandidateMobileCompatibility({
      candidateIsAncestor: true,
      changedPaths: [
        'backend/src/config.js',
        'docs/current_state.md',
        'tool/diagnose_android_phone_verification.mjs',
        'test/tool/diagnose_android_phone_verification.test.mjs',
        'store/privacy-disclosures.json',
        'store/retention-deletion-readiness.json',
      ],
    }),
    {
      candidateIsAncestor: true,
      changedPathCount: 6,
      mobileSourceChanged: false,
    },
  );
  assert.throws(
    () => validateFrozenCandidateMobileCompatibility({
      candidateIsAncestor: true,
      changedPaths: ['lib/services/auth_service.dart'],
    }),
    /Mobile source changed/u,
  );
  assert.throws(
    () => validateFrozenCandidateMobileCompatibility({
      candidateIsAncestor: false,
      changedPaths: [],
    }),
    /not an ancestor/u,
  );
});

function jsonResponse(status, value = null) {
  return {
    status,
    json: async () => value,
  };
}

test('backend-gate preflight reports disabled and revokes its exact diagnostic session', async () => {
  const calls = [];
  const result = await inspectStagingPhoneBackendGate(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/login')) {
      return jsonResponse(200, {
        accessToken: 'a'.repeat(24),
        refreshToken: 'r'.repeat(24),
      });
    }
    if (url.endsWith('/auth/phone-verification/status')) {
      return jsonResponse(200, { available: false, provider: null });
    }
    if (url.endsWith('/auth/logout')) return jsonResponse(204);
    throw new Error('unexpected request');
  }, { email: 'private-at-invalid', password: syntheticFixturePassword });

  assert.deepEqual(result, {
    enabled: false,
    advertisedProvider: null,
    diagnosticSessionRevoked: true,
  });
  assert.equal(calls.length, 3);
  assert.match(calls[2].options.body, /refreshToken/u);
});

test('backend-gate preflight recognizes only exact advertised state and always cleans up', async () => {
  const calls = [];
  const enabled = await inspectStagingPhoneBackendGate(async (url) => {
    calls.push(url);
    if (url.endsWith('/auth/login')) {
      return jsonResponse(200, {
        accessToken: 'a'.repeat(24),
        refreshToken: 'r'.repeat(24),
      });
    }
    if (url.endsWith('/auth/phone-verification/status')) {
      return jsonResponse(200, { available: true, provider: 'firebase-phone' });
    }
    return jsonResponse(204);
  }, { email: 'private-at-invalid', password: syntheticFixturePassword });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.advertisedProvider, 'firebase-phone');
  assert.equal(enabled.diagnosticSessionRevoked, true);
  assert.equal(calls.at(-1).endsWith('/auth/logout'), true);

  const ambiguousCalls = [];
  await assert.rejects(
    inspectStagingPhoneBackendGate(async (url) => {
      ambiguousCalls.push(url);
      if (url.endsWith('/auth/login')) {
        return jsonResponse(200, {
          accessToken: 'a'.repeat(24),
          refreshToken: 'r'.repeat(24),
        });
      }
      if (url.endsWith('/auth/phone-verification/status')) {
        return jsonResponse(200, { available: true, provider: null });
      }
      return jsonResponse(204);
    }, { email: 'private-at-invalid', password: syntheticFixturePassword }),
    /status is ambiguous/u,
  );
  assert.equal(ambiguousCalls.at(-1).endsWith('/auth/logout'), true);
});

test('backend-gate preflight fails closed when its diagnostic session cannot be revoked', async () => {
  await assert.rejects(
    inspectStagingPhoneBackendGate(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(200, {
          accessToken: 'a'.repeat(24),
          refreshToken: 'r'.repeat(24),
        });
      }
      if (url.endsWith('/auth/phone-verification/status')) {
        return jsonResponse(200, { available: false, provider: null });
      }
      return jsonResponse(503);
    }, { email: 'private-at-invalid', password: syntheticFixturePassword }),
    /session cleanup failed/u,
  );
});

test('verified-phone cleanup requires exact before, mutation, readback and session revocation', async () => {
  const calls = [];
  const expectedPhone = '+4915123456789';
  const result = await clearVerifiedPhoneFromStagingTestAccount(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/login')) {
      return jsonResponse(200, {
        accessToken: 'a'.repeat(24),
        refreshToken: 'r'.repeat(24),
      });
    }
    if (url.endsWith('/auth/me')
        && calls.filter((entry) => entry.url.endsWith('/auth/me')).length === 1) {
      return jsonResponse(200, { user: { phone: expectedPhone, phoneVerified: true } });
    }
    if (url.endsWith('/profile')) {
      return jsonResponse(200, { user: { phone: null, phoneVerified: false } });
    }
    if (url.endsWith('/auth/me')) {
      return jsonResponse(200, { user: { phone: null, phoneVerified: false } });
    }
    if (url.endsWith('/auth/logout')) return jsonResponse(204);
    throw new Error('unexpected request');
  }, { email: 'private-at-invalid', password: syntheticFixturePassword }, expectedPhone);

  assert.deepEqual(result, {
    exactVerifiedStateObservedBeforeCleanup: true,
    exactClearedStateConfirmedByMutation: true,
    exactClearedStateConfirmedByReadback: true,
    diagnosticSessionRevoked: true,
  });
  assert.equal(calls.length, 5);
  assert.equal(calls[2].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[2].options.body), { profile: { phone: null } });
  assert.equal(calls.at(-1).url.endsWith('/auth/logout'), true);
});

test('verified-phone cleanup fails closed on mismatch and still revokes its exact session', async () => {
  const calls = [];
  await assert.rejects(
    clearVerifiedPhoneFromStagingTestAccount(async (url) => {
      calls.push(url);
      if (url.endsWith('/auth/login')) {
        return jsonResponse(200, {
          accessToken: 'a'.repeat(24),
          refreshToken: 'r'.repeat(24),
        });
      }
      if (url.endsWith('/auth/me')) {
        return jsonResponse(200, {
          user: { phone: '+4915111111111', phoneVerified: true },
        });
      }
      if (url.endsWith('/auth/logout')) return jsonResponse(204);
      throw new Error('unexpected request');
    }, { email: 'private-at-invalid', password: syntheticFixturePassword }, '+4915123456789'),
    /no exact verified phone/u,
  );
  assert.equal(calls.at(-1).endsWith('/auth/logout'), true);
});

test('verified-phone cleanup fails closed if its exact session cannot be revoked', async () => {
  let meCount = 0;
  await assert.rejects(
    clearVerifiedPhoneFromStagingTestAccount(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(200, {
          accessToken: 'a'.repeat(24),
          refreshToken: 'r'.repeat(24),
        });
      }
      if (url.endsWith('/auth/me')) {
        meCount += 1;
        return jsonResponse(200, {
          user: meCount === 1
            ? { phone: '+4915123456789', phoneVerified: true }
            : { phone: null, phoneVerified: false },
        });
      }
      if (url.endsWith('/profile')) {
        return jsonResponse(200, { user: { phone: null, phoneVerified: false } });
      }
      return jsonResponse(503);
    }, { email: 'private-at-invalid', password: syntheticFixturePassword }, '+4915123456789'),
    /session could not be revoked/u,
  );
});

test('phone diagnostic is artifact-bound and never emits or persists the SMS input', () => {
  for (const marker of [
    'validatePrivateAndroidReleaseArchive',
    'SIT_N29_PHASE',
    'SIT_N29_PROTECTED_OWNER_VAULT_FILE',
    'SIT_N29_CANDIDATE_DIRECTORY',
    'SIT_N29_PHONE_FILE',
    'SIT_N29_PRIVATE_EVIDENCE_DIR',
    "phase === 'preflight'",
    "phase === 'confirm'",
    "phase === 'cleanup'",
    'SIT_N29_SMS_CODE_FILE',
    'clearVerifiedPhoneFromStagingTestAccount',
    'diagnosticSessionRevoked',
    'verifyCurrentHeadAndroidInstalledCandidate',
    "advertisedProvider: 'firebase-phone'",
    "status = 'awaiting-owner-sms-code'",
    'sms-confirmation-submitted-result-unproven',
    'phone-verification-not-confirmed-fresh-request-required',
    'phone-verification-result-unproven-reconciliation-required',
    "status = 'passed-valid-code-and-cold-restart'",
    'containsPhoneNumber: false',
    'containsSmsCode: false',
    'protectedSyntheticOwnerRetained: true',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(source, /validateCurrentHeadAndroidReleaseArchive/gu);
  assert.doesNotMatch(source, /phoneSha256/gu);
  assert.doesNotMatch(source, /sms(?:Code|ConfirmationInput)Sha256/gu);
  assert.doesNotMatch(source, /JSON\.stringify\([^\n]*(?:smsCode|smsConfirmationInput)/gu);
  assert.doesNotMatch(source, /content query --uri|sms inbox|READ_SMS|RECEIVE_SMS/giu);
  assert.doesNotMatch(source, /pm clear|uninstall|clear data/giu);
  assert.doesNotMatch(source, /SIT_N24_|n24-phone-verification/gu);
});
