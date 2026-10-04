import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildAndroidLocalQaUpdateGateEvidence,
  sanitizeAndroidLocalQaInstallEvidence,
} from '../../tool/prepare_android_local_qa_update.mjs';

const signingCertificateSha256 = 'a'.repeat(64);
const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026082303',
  commit: '13359f209857690d53feeaff1bab3eca40bdbb48',
  apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
  signingCertificateSha256,
  configuration: Object.freeze({
    requiredLocalBackendProvider: 'mock',
    externalProviderAllowed: false,
    realMoneyAllowed: false,
    productionAllowed: false,
    publicRegistrationAllowed: false,
    publicReleaseAllowed: false,
  }),
});
const rollback = Object.freeze({
  applicationId: 'com.shareittoo.app',
  buildNumber: '2026082302',
  commit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
  signingCertificateSha256,
  privacyScan: 'passed',
  releaseChannel: 'internal',
});
const preflight = Object.freeze({
  status: 'eligible-no-device-write-performed',
  applicationId: 'com.shareittoo.app',
  conditions: Object.freeze({
    exactPackageIdentity: true,
    candidateSignatureMatchesArchiveAndInstalledApp: true,
    strictlyNewerBuild: true,
    replaceInstallOnly: true,
    uninstallOrResetRequired: false,
    deviceAlreadyUnlocked: true,
    postInstallDataIdentityVerificationRequired: true,
  }),
});
const priorUpdate = Object.freeze({
  buildNumber: '2026082302',
  dataPreservingDirectUpdate: true,
  stageAReady: false,
});
const deviceSummary = Object.freeze({
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel test',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
});

test('requires all seven R2 conditions and emits no private path or signing digest', () => {
  const gate = buildAndroidLocalQaUpdateGateEvidence({
    preflight,
    candidate,
    rollback,
    priorUpdate,
    deviceSummary,
    capturedAt: '2026-08-24T12:00:00.000Z',
  });
  assert.equal(gate.status, 'eligible-seven-conditions-green-no-device-write-yet');
  assert.equal(Object.values(gate.conditions).every((value) => value === true), true);
  assert.equal(gate.boundaries.storeInstallationGateSatisfied, false);
  assert.equal(JSON.stringify(gate).includes(signingCertificateSha256), false);
  assert.equal(JSON.stringify(gate).includes('/Users/'), false);
});

test('rejects a locked device or missing rollback signature relationship', () => {
  assert.throws(
    () => buildAndroidLocalQaUpdateGateEvidence({
      preflight: {
        ...preflight,
        conditions: { ...preflight.conditions, deviceAlreadyUnlocked: false },
      },
      candidate,
      rollback,
      priorUpdate,
      deviceSummary,
    }),
    /seven-condition/u,
  );
  assert.throws(
    () => buildAndroidLocalQaUpdateGateEvidence({
      preflight,
      candidate,
      rollback: { ...rollback, signingCertificateSha256: 'b'.repeat(64) },
      priorUpdate,
      deviceSummary,
    }),
    /rollback archive/u,
  );
});

test('publishes only sanitized data-preservation facts after installation', () => {
  const gate = buildAndroidLocalQaUpdateGateEvidence({
    preflight,
    candidate,
    rollback,
    priorUpdate,
    deviceSummary,
  });
  const evidence = sanitizeAndroidLocalQaInstallEvidence({
    gate,
    install: {
      status: 'passed-data-preserving-direct-update',
      candidate: { applicationId: 'com.shareittoo.app', buildNumber: '2026082303' },
      update: {
        installedVersionBefore: '1.0.0+2026082302',
        installedVersionAfter: '1.0.0+2026082303',
        method: 'adb-install-no-streaming-replace',
        strictlyNewerBuildInstalled: true,
        candidateSignatureMatchedInstalledApp: true,
        installedCandidateHashMatches: true,
        firstInstallTimePreserved: true,
        ceDataInodePreserved: true,
        foregroundActivityVerified: true,
      },
      boundaries: { uninstallUsed: false, dataResetUsed: false, downgradeUsed: false },
    },
  });
  assert.equal(evidence.status, 'passed-data-preserving-local-qa-update');
  assert.equal(evidence.update.firstInstallTimePreserved, true);
  assert.equal(JSON.stringify(evidence).includes(signingCertificateSha256), false);
});

test('independent installed-state mode remains read-only apart from app launch', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../tool/prepare_android_local_qa_update.mjs', import.meta.url)),
    'utf8',
  );
  const verifyBranch = source.slice(
    source.indexOf('if (args.verifyInstalled)'),
    source.indexOf('const preflight = preflightCurrentHeadAndroidCandidateUpdate'),
  );
  assert.match(verifyBranch, /verifyCurrentHeadAndroidInstalledCandidate/u);
  assert.match(verifyBranch, /firstInstallTimePredatesR2Update: true/u);
  assert.match(verifyBranch, /'am', 'start', '-W'/u);
  assert.doesNotMatch(verifyBranch, /installCurrentHeadAndroidCandidateUpdate\(/u);
  assert.doesNotMatch(verifyBranch, /\['shell', 'pm', 'clear'/u);
  assert.doesNotMatch(verifyBranch, /\['uninstall'/u);
});
