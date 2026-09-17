import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const planPath = new URL(
  '../../docs/evidence/release-readiness/wp224-staging-mfa-identity-parity-plan-20260917.json',
  import.meta.url,
);

test('WP224 staging parity plan is bound and fail-closed', async () => {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  assert.equal(
    plan.repository.deployableSourceCommit,
    '7d9fef6efcb65b3613c91d01ad5ca76f87c99d2c',
  );
  assert.equal(
    plan.sourceToStagingDelta.sourceCommitDeltaFromObservedStaging.migrationFilesInSourceDelta,
    '075-087',
  );
  assert.equal(
    plan.sourceToStagingDelta.stagingSchemaMigrationReadback.exactAppliedRange,
    'unknown',
  );
  assert.equal(
    plan.sourceToStagingDelta.stagingSchemaMigrationReadback.requiredBeforeDeploy,
    true,
  );
  assert.equal(plan.rollback.previousImageAndCommitCapturedBeforeDeploy, false);
  assert.equal(plan.rollback.requiredAtExecution, true);
  assert.equal(plan.providerReadinessReadOnly.providerActivationProven, false);
  assert.equal(plan.providerReadinessReadOnly.mfaSecretPresence.stagingPresence, 'unknown; no authorized secret readback performed');
  assert.equal(plan.postDeployReadback.mfaFunctionalE2E.required, true);
  assert.match(
    plan.postDeployReadback.mfaFunctionalE2E.failureRule,
    /not MFA readiness/u,
  );
});
