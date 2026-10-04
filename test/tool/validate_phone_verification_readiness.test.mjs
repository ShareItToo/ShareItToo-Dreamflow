import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validatePhoneVerificationReadiness } from
  '../../tool/validate_phone_verification_readiness.mjs';

const root = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(readFileSync(
  new URL('../../store/phone-verification-readiness.json', import.meta.url),
  'utf8',
));
const canonicalPubspec =
  `name: lendify\nversion: ${canonical.sourceBuild.versionName}+${canonical.sourceBuild.buildNumber}\n`;

function validateReadiness(options = {}) {
  return validatePhoneVerificationReadiness({
    root,
    ...options,
    sourceOverrides: {
      'pubspec.yaml': canonicalPubspec,
      ...(options.sourceOverrides ?? {}),
    },
  });
}

test('accepts the evidenced Android real-device SMS pass while Apple and store gates remain closed', () => {
  assert.deepEqual(validateReadiness(), {
    state: 'android-real-device-sms-passed',
    buildNumber: canonical.sourceBuild.buildNumber,
    openGates: 3,
    activationAllowed: true,
  });
});

test('rejects store submission while Apple and disclosure gates remain open', () => {
  const readiness = structuredClone(canonical);
  readiness.storeSubmissionAllowed = true;
  assert.throws(
    () => validateReadiness({ readiness }),
    /external gates must remain fail-closed/,
  );
});

test('rejects removing the observed Firebase phone provider activation', () => {
  const readiness = structuredClone(canonical);
  readiness.consoleEvidence.phoneProviderEnabled = false;
  assert.throws(
    () => validateReadiness({ readiness }),
    /console evidence is incomplete or unsafe/,
  );
});

test('rejects removing the saved Germany-only SMS region policy', () => {
  const readiness = structuredClone(canonical);
  readiness.consoleEvidence.smsRegionPolicySaved = false;
  assert.throws(
    () => validateReadiness({ readiness }),
    /console evidence is incomplete or unsafe/,
  );
});

test('rejects a client-side phone verification bypass', () => {
  const current = readFileSync(
    new URL('../../lib/services/auth_service.dart', import.meta.url),
    'utf8',
  );
  assert.throws(
    () => validateReadiness({
      readiness: canonical,
      sourceOverrides: {
        'lib/services/auth_service.dart': `${current}\n// phoneVerified: true`,
      },
    }),
    /must not grant client-side phone verification/,
  );
});

test('rejects a reused source build number after pubspec advances', () => {
  assert.throws(
    () => validateReadiness({
      readiness: canonical,
      sourceOverrides: {
        'pubspec.yaml': `name: lendify\nversion: 1.0.0+${BigInt(canonical.sourceBuild.buildNumber) + 1n}\n`,
      },
    }),
    /not bound to the current source build/,
  );
});

test('permits an older passed phone check only during an explicit internal candidate rollover', () => {
  assert.deepEqual(
    validatePhoneVerificationReadiness({
      root,
      readiness: canonical,
      allowCandidateRollover: true,
    }),
    {
      state: 'android-real-device-sms-passed',
      buildNumber: canonical.sourceBuild.buildNumber,
      openGates: 3,
      activationAllowed: true,
    },
  );
});

test('rejects a claimed Android pass when the real SMS evidence is weakened', () => {
  const smsRef = canonical.androidRealDeviceEvidence.evidenceRefs[1];
  const sms = JSON.parse(readFileSync(new URL(`../../${smsRef}`, import.meta.url), 'utf8'));
  sms.realDeviceResults.invalidCodeRejected = false;
  assert.throws(
    () => validateReadiness({
      sourceOverrides: { [smsRef]: JSON.stringify(sms) },
    }),
    /does not prove the declared Android result/,
  );
});

test('rejects binding the phone readiness to a different current Play candidate', () => {
  const candidateRef = canonical.androidRealDeviceEvidence.evidenceRefs[2];
  const candidate = JSON.parse(readFileSync(new URL(`../../${candidateRef}`, import.meta.url), 'utf8'));
  candidate.candidate.buildNumber = '2026081504';
  assert.throws(
    () => validateReadiness({
      sourceOverrides: { [candidateRef]: JSON.stringify(candidate) },
    }),
    /not bound to the current Play candidate/,
  );
});

test('rejects phone numbers in readiness evidence', () => {
  const readiness = structuredClone(canonical);
  readiness.note = '+4915212345678';
  assert.throws(
    () => validateReadiness({ readiness }),
    /account data or a secret/,
  );
});
