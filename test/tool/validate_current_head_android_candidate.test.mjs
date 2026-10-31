import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidCandidate,
} from '../../tool/validate_current_head_android_candidate.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));
const releaseBuilder = readFileSync(
  resolve(root, 'scripts/build_android_release_candidate.sh'),
  'utf8',
);

test('accepts the exact current-head direct-install candidate while Stage A stays blocked', () => {
  assert.deepEqual(validateCurrentHeadAndroidCandidate({
    root,
    evidence,
    checkGitCommit: false,
  }), {
    version: 'PF6-ANDROID-2026-08-23.1',
    status: 'current-head-signed-physical-direct-install-passed',
    candidateCommit: '76e6565cdb20d6a49fb417e87b044b237a1ae6c1',
    buildNumber: '2026082301',
    physicalDirectInstall: true,
    privateArchiveRecorded: true,
    stageAReady: false,
    decision: 'hold-no-go',
  });
});

test('rejects candidate hash drift or a non-canonical signing claim', () => {
  const changedHash = structuredClone(evidence);
  changedHash.androidCandidate.apkSha256 = '0'.repeat(64);
  assert.throws(
    () => validateCurrentHeadAndroidCandidate({
      root,
      evidence: changedHash,
      checkGitCommit: false,
    }),
    /candidate evidence is incomplete or invalid/u,
  );
  const changedSigning = structuredClone(evidence);
  changedSigning.androidCandidate.canonicalUploadCertificateVerified = false;
  assert.throws(
    () => validateCurrentHeadAndroidCandidate({
      root,
      evidence: changedSigning,
      checkGitCommit: false,
    }),
    /candidate evidence is incomplete or invalid/u,
  );
});

test('rejects destructive installation or unproven data preservation', () => {
  for (const field of ['uninstallUsed', 'dataResetUsed', 'downgradeUsed']) {
    const changed = structuredClone(evidence);
    changed.physicalDevice[field] = true;
    assert.throws(
      () => validateCurrentHeadAndroidCandidate({
        root,
        evidence: changed,
        checkGitCommit: false,
      }),
      /physical Android update evidence is incomplete or unsafe/u,
    );
  }
  const changed = structuredClone(evidence);
  changed.physicalDevice.ceDataInodePreserved = false;
  assert.throws(
    () => validateCurrentHeadAndroidCandidate({
      root,
      evidence: changed,
      checkGitCommit: false,
    }),
    /physical Android update evidence is incomplete or unsafe/u,
  );
});

test('rejects Store, real-money or activation claims', () => {
  for (const field of [
    'googlePlayInternalDistribution',
    'closedTestingStarted',
    'storeSubmissionAllowed',
    'publicActivationAllowed',
    'realMoneyAllowed',
    'stageAReady',
  ]) {
    const changed = structuredClone(evidence);
    changed.releaseGate[field] = true;
    assert.throws(
      () => validateCurrentHeadAndroidCandidate({
        root,
        evidence: changed,
        checkGitCommit: false,
      }),
      /release gate must remain non-Store and HOLD/u,
    );
  }
});

test('rejects stale CI evidence or a merged pull-request claim', () => {
  const changed = structuredClone(evidence);
  changed.exactCommitVerification.regressionRun = '0';
  assert.throws(
    () => validateCurrentHeadAndroidCandidate({
      root,
      evidence: changed,
      checkGitCommit: false,
    }),
    /exact-commit CI or pull-request evidence is invalid/u,
  );
});

test('requires the release-host workaround debt to be closed', () => {
  const changed = structuredClone(evidence);
  changed.releaseHostTechnicalDebt.status = 'open';
  changed.releaseHostTechnicalDebt.workaroundIsReleasePrerequisite = true;
  assert.throws(
    () => validateCurrentHeadAndroidCandidate({
      root,
      evidence: changed,
      checkGitCommit: false,
    }),
    /Technical Debt is not closed deterministically/u,
  );
});

test('rejects private paths, identifiers and any live-boundary mutation', () => {
  const changedPath = structuredClone(evidence);
  changedPath.note = '/Users/example/private/archive';
  assert.throws(
    () => validateCurrentHeadAndroidCandidate({
      root,
      evidence: changedPath,
      checkGitCommit: false,
    }),
    /private path, identifier or credential/u,
  );
  const changedBoundary = structuredClone(evidence);
  changedBoundary.boundaries.externalUploadPerformed = true;
  assert.throws(
    () => validateCurrentHeadAndroidCandidate({
      root,
      evidence: changedBoundary,
      checkGitCommit: false,
    }),
    /boundaries must all remain false/u,
  );
});

test('keeps CI metadata-only mode restricted and the private archive separate', () => {
  const cli = resolve(root, 'tool/validate_current_head_android_candidate.mjs');
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
  const impossible = spawnSync(
    process.execPath,
    [cli, '--ci-metadata-only', '--require-private-archive'],
    {
      cwd: root,
      env: { ...process.env, CI: 'true' },
      encoding: 'utf8',
    },
  );
  assert.notEqual(impossible.status, 0);
  assert.match(impossible.stderr, /cannot claim the private archive/u);
});

test('release build owns deterministic capacity and configured SDK discovery', () => {
  assert.match(
    releaseBuilder,
    /source scripts\/release_host_capacity_guard\.sh[\s\S]*?release_host_capacity_begin/u,
  );
  assert.match(
    releaseBuilder,
    /android\/local\.properties[\s\S]*?sed -n 's\/\^sdk\\\.dir=\/\/p'/u,
  );
  assert.match(releaseBuilder, /release_host_capacity_end/u);
  assert.doesNotMatch(releaseBuilder, /SIT_RELEASE_HOST|sleep|retry/u);
});
