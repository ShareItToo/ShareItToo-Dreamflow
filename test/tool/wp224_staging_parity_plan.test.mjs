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
    'bddc3b59b3adfcba8e7e532718625ebadc60070a',
  );
  assert.equal(
    plan.sourceToStagingDelta.sourceCommitDeltaFromObservedStaging.migrationFilesInSourceDelta,
    '075-087',
  );
  assert.equal(
    plan.sourceToStagingDelta.stagingSchemaMigrationReadback.exactAppliedRange,
    '001-074',
  );
  assert.equal(
    plan.sourceToStagingDelta.stagingSchemaMigrationReadback.exactUnappliedCurrentSourceRange,
    '075-087',
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
