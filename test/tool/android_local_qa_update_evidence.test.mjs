import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r2-pixel-local-qa-update-20260824.json',
), 'utf8'));
const operation = readFileSync(resolve(
  root,
  'docs/operations/48H_R2_PIXEL_LOCAL_QA_UPDATE_2026-08-24.md',
), 'utf8');
const installer = readFileSync(resolve(
  root,
  'tool/install_current_head_android_candidate_update.mjs',
), 'utf8');
const regressionWorkflow = readFileSync(resolve(
  root,
  '.github/workflows/regression.yml',
), 'utf8');

test('R2 evidence binds the installed local-QA candidate and all seven conditions', () => {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.kind, 'sit-48h-r2-pixel-local-qa-update');
  assert.equal(evidence.status, 'passed-data-preserving-local-qa-update');
  assert.deepEqual(evidence.source, {
    branch: 'codex/master-workflow-20260808',
    toolingCommit: 'c15e12e71a3caaf6918c5b9fa8ec8de3666bd7a8',
    candidateCommit: '13359f209857690d53feeaff1bab3eca40bdbb48',
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    buildNumber: '2026082303',
  });
  assert.equal(
    Object.values(evidence.preflight.conditions).every((value) => value === true),
    true,
  );
  assert.equal(evidence.update.installedVersionBefore, '1.0.0+2026082302');
  assert.equal(evidence.update.installedVersionAfter, '1.0.0+2026082303');
  assert.equal(evidence.update.firstInstallTimePreserved, true);
  assert.equal(evidence.update.ceDataInodePreserved, true);
  assert.equal(evidence.independentVerification.secondInstallPerformed, false);
  execFileSync('git', ['cat-file', '-e', `${evidence.source.candidateCommit}^{commit}`], {
    cwd: root,
    stdio: 'ignore',
  });
  execFileSync('git', ['cat-file', '-e', `${evidence.source.toolingCommit}^{commit}`], {
    cwd: root,
    stdio: 'ignore',
  });
});

test('R2 closes the timing debt with deterministic launch checks', () => {
  const launch = installer.slice(
    installer.indexOf('function launchAndVerifyForeground'),
    installer.indexOf('export function installCurrentHeadAndroidCandidateUpdate'),
  );
  assert.match(launch, /'am',\s*\n\s*'start',\s*\n\s*'-W'/u);
  assert.doesNotMatch(launch, /'monkey'/u);
  assert.equal(evidence.technicalDebt.id, 'TD-48H-001');
  assert.equal(evidence.technicalDebt.status, 'closed');
  assert.equal(evidence.technicalDebt.failedTimingCheckAcceptedAsFinalEvidence, false);
  assert.equal(evidence.technicalDebt.workaroundIsReleasePrerequisite, false);
  assert.match(operation, /TD-48H-001/u);
  assert.match(operation, /am start -W/u);
});

test('Flutter CI fetches the history required by commit-bound R2 evidence', () => {
  const flutterJob = regressionWorkflow.slice(
    regressionWorkflow.indexOf('  flutter-regression:'),
    regressionWorkflow.indexOf('  publish-api-image:'),
  );
  assert.match(
    flutterJob,
    /- uses: actions\/checkout@v6\n\s+with:\n\s+fetch-depth: 0/u,
  );
});

test('R2 repository evidence stays non-live and excludes sensitive identifiers', () => {
  assert.equal(
    Object.values(evidence.boundaries).every((value) => value === false),
    true,
  );
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(
    serialized,
    /\/(?:Users|home)\/|deviceSerial|androidId|signingCertificateSha256|password|token|ssid|bssid|ipAddress/iu,
  );
  assert.match(operation, /No production, cloud, payment, Store/u);
});
