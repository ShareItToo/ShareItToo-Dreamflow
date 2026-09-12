import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp72CurrentCandidateReportBlock,
} from '../../tool/validate_wp72_current_candidate_report_block.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp72-current-candidate-report-block-20260909.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp72CurrentCandidateReportBlock({
    repositoryRoot: root,
    evidence: changed,
    checkGitState: false,
  });
}

test('accepts exact current-candidate Pixel report/block evidence', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    candidateVersionCode: '2026090904',
    supportReportBlockState: 'PASS',
    physicalMessageIsolationPassed: true,
    protectedOwnerRestored: true,
    onePlusContacted: false,
  });
});

test('rejects candidate and source drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.versionCode = '2026090905';
  assert.throws(() => validate(candidate), /candidate binding/u);

  const source = structuredClone(evidence);
  source.sourceInventory[2].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source hash drift/u);
});

test('rejects report, reversible block and message-isolation overclaims', () => {
  const report = structuredClone(evidence);
  report.pixelProof.report.beforeExactTargetCount = 1;
  assert.throws(() => validate(report), /report observation/u);

  const block = structuredClone(evidence);
  block.pixelProof.unblock.afterExactOwnerCount = 1;
  assert.throws(() => validate(block), /unblock observation/u);

  const message = structuredClone(evidence);
  message.pixelProof.messageIsolation.directMessageSendAttemptedDuringBlock = true;
  assert.throws(() => validate(message), /message-isolation/u);
});

test('rejects cleanup, boundary and private-data drift', () => {
  const cleanup = structuredClone(evidence);
  cleanup.pixelProof.cleanup.allDiagnosticSessionsRevoked = false;
  assert.throws(() => validate(cleanup), /cleanup is incomplete/u);

  const boundary = structuredClone(evidence);
  boundary.boundaries.onePlusContacted = true;
  assert.throws(() => validate(boundary), /boundary/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});

test('rejects incomplete complete verification', () => {
  const changed = structuredClone(evidence);
  changed.packageVerification.githubCodeqlRun = null;
  assert.throws(() => validate(changed), /complete verification/u);
});

test('rejects exact-head GitHub verification drift', () => {
  const changed = structuredClone(evidence);
  changed.packageVerification.githubRegressionRun += 1;
  assert.throws(() => validate(changed), /complete verification/u);
});
