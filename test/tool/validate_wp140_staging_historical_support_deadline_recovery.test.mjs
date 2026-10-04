import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp140StagingHistoricalSupportDeadlineRecovery,
} from '../../tool/validate_wp140_staging_historical_support_deadline_recovery.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp140-staging-historical-support-deadline-recovery-20260913.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts the exact closed historical simulation deadline recovery', () => {
  const result = validateWp140StagingHistoricalSupportDeadlineRecovery({
    repositoryRoot: root,
    evidence: readEvidence(),
    checkGitState: false,
  });
  assert.equal(result.readiness, 'ready');
  assert.equal(result.overdueCount, 0);
  assert.equal(result.temporaryAccountsActive, 0);
  assert.deepEqual(result.portfolio, { pass: 21, partial: 4, open: 7 });
});

test('rejects hiding an overdue or pending support action', () => {
  const changed = readEvidence();
  changed.support.overdueCountAfter = 1;
  changed.support.pendingProgressCountAfter = 1;
  assert.throws(
    () => validateWp140StagingHistoricalSupportDeadlineRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /Support result/u,
  );
});

test('rejects direct support mutation, recipient reactivation or external delivery', () => {
  const changed = readEvidence();
  changed.recoverySemantics.supportCaseTableWrittenDirectly = true;
  changed.recoverySemantics.closedSyntheticRecipientReactivated = true;
  changed.boundaries.externalMessageSent = true;
  assert.throws(
    () => validateWp140StagingHistoricalSupportDeadlineRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /recovery semantics|boundary contract/u,
  );
});

test('rejects active temporary access or identity-shaped evidence', () => {
  const changed = readEvidence();
  changed.cleanup.activeTemporarySessionCountAfter = 1;
  changed.extra = { caseId: 'synthetic-case' };
  assert.throws(
    () => validateWp140StagingHistoricalSupportDeadlineRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /cleanup|identity/u,
  );
});
