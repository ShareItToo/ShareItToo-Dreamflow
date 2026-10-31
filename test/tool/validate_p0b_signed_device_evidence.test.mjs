import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateP0BSignedDeviceEvidence } from '../../tool/validate_p0b_signed_device_evidence.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(
  resolve(root, 'docs/evidence/p0b-next/signed-device-evidence.json'),
  'utf8',
));

test('accepts current-source Android evidence while keeping iOS and overall gate blocked', () => {
  assert.deepEqual(validateP0BSignedDeviceEvidence({
    root,
    evidence,
    checkGitCommit: false,
  }), {
    version: 'P0B-DEVICE-2026-08-21.1',
    status: 'partial-android-passed-ios-blocked',
    candidateCommit: 'e8cd4a99d95f74c279afa86a24a9a61df6ee98c8',
    androidCandidate: true,
    androidPhysical: true,
    iosCandidate: false,
    iosPhysical: false,
    candidateCiGreen: true,
    signedDeviceGateReady: false,
  });
});

test('rejects an Android hash mismatch or destructive device action', () => {
  const changed = structuredClone(evidence);
  changed.androidCandidate.apkSha256 = '0'.repeat(64);
  changed.androidPhysicalEvidence.uninstallUsed = true;
  assert.throws(
    () => validateP0BSignedDeviceEvidence({ root, evidence: changed, checkGitCommit: false }),
    /candidate evidence is incomplete|physical evidence is incomplete or unsafe/u,
  );
});

test('rejects invented iOS evidence when tooling and device are absent', () => {
  const changed = structuredClone(evidence);
  changed.iosEvidence.signedCandidateCreated = true;
  changed.releaseGate.iosCurrentSourceSignedCandidate = true;
  assert.throws(
    () => validateP0BSignedDeviceEvidence({ root, evidence: changed, checkGitCommit: false }),
    /iOS evidence must remain explicitly blocked/u,
  );
});

test('rejects Store, public or real-money activation', () => {
  const changed = structuredClone(evidence);
  changed.releaseGate.storeSubmissionAllowed = true;
  changed.releaseGate.publicActivationAllowed = true;
  changed.releaseGate.realMoneyAllowed = true;
  assert.throws(
    () => validateP0BSignedDeviceEvidence({ root, evidence: changed, checkGitCommit: false }),
    /gate must remain partial and non-activating/u,
  );
});

test('rejects a CI success claim without exact run evidence', () => {
  const changed = structuredClone(evidence);
  changed.releaseGate.candidateCommitCiGreen = true;
  changed.releaseGate.candidateCommitCiRun = null;
  assert.throws(
    () => validateP0BSignedDeviceEvidence({ root, evidence: changed, checkGitCommit: false }),
    /CI claim requires an exact run ID/u,
  );
});

test('rejects private paths or raw device identifiers in repository evidence', () => {
  const changed = structuredClone(evidence);
  changed.privateNote = '/Users/example/private/archive';
  assert.throws(
    () => validateP0BSignedDeviceEvidence({ root, evidence: changed, checkGitCommit: false }),
    /private path, identifier or credential/u,
  );
});

test('permits metadata-only validation only inside an explicit CI environment', () => {
  const cli = resolve(root, 'tool/validate_p0b_signed_device_evidence.mjs');
  const ci = spawnSync(process.execPath, [cli, '--ci-metadata-only'], {
    cwd: root,
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8',
  });
  assert.equal(ci.status, 0, ci.stderr);
  const local = spawnSync(process.execPath, [cli, '--ci-metadata-only'], {
    cwd: root,
    env: { ...process.env, CI: 'false' },
    encoding: 'utf8',
  });
  assert.notEqual(local.status, 0);
  assert.match(local.stderr, /restricted to CI/u);
});
