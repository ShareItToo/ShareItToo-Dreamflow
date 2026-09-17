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
    '82221caa2b0fb58e701ded35198bf65e80ac9d03',
  );
  assert.equal(
    plan.repository.planPredecessorRevision,
    'd27324f2004458db5255276ec70e382f5518ae5a',
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
  assert.equal(plan.rollback.automaticRollback, false);
  assert.equal(plan.rollback.automaticRollbackStrategy, 'staging_isolation_only');
  assert.equal(plan.rollback.oldImageAutoRollback, false);
  assert.equal(plan.rollback.backupRestoreGateRequired, true);
  assert.equal(plan.rollback.restoredBoundary.mfaOverlay, 'retained');
  assert.equal(plan.rollback.migrationRollback.automaticDownMigration, false);
  assert.equal(plan.sourceToStagingDelta.candidateMigrationRange.files, 26);
  assert.equal(plan.sourceToStagingDelta.candidateMigrationRange.upMigrations, 13);
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.status, 'passed-executed');
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.exactTargetCommit, plan.repository.deployableSourceCommit);
  assert.equal(
    plan.sourceToStagingDelta.protectedRehearsal.exactOpsCommit,
    '06dce07a048e7ed2aebd41961be8a346092a4add',
  );
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.executionEvidence.status, 'passed');
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.executionEvidence.backup.bytes, 3855507);
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.executionEvidence.liveStaging.databaseMutated, false);
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.status, 'failed-start-stopped');
  assert.equal(
    plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.exactOpsCommit,
    '1315d595785a349b159a5f9fc27a86bf5809caf1',
  );
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.priorFailedAttempt.phase, 'start_input');
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.priorFailedAttempt.cleanup, 'passed');
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.failedAttempt.phase, 'acceptance_start');
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.failedAttempt.cleanup, 'passed-after-acceptance-only-cleanup');
  assert.equal(plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.failedAttempt.liveSchema, '001-074');
  assert.notEqual(
    plan.sourceToStagingDelta.protectedRehearsal.exactOpsCommit,
    plan.sourceToStagingDelta.protectedRehearsal.controlledAcceptance.exactOpsCommit,
  );
  assert.equal(
    plan.sourceToStagingDelta.protectedRehearsal.priorImageSqlContractComparison.status,
    'required-not-executed',
  );
  assert.match(
    plan.sourceToStagingDelta.protectedRehearsal.filesystemAndQuiesceInvariant,
    /complete Staging container\/service label set/u,
  );
  assert.match(plan.sourceToStagingDelta.requiredSourceConfig.mfaConfigPlan.injection, /MFA_ENCRYPTION_KEY_FILE/u);
  assert.doesNotMatch(plan.sourceToStagingDelta.requiredSourceConfig.mfaConfigPlan.injection, /MFA_ENCRYPTION_KEY:\s*\$\{/u);
  assert.equal(plan.providerReadinessReadOnly.providerActivationProven, false);
  assert.equal(plan.providerReadinessReadOnly.mfaSecretPresence.stagingPresence, 'unknown; no authorized secret readback performed');
  assert.equal(plan.postDeployReadback.mfaFunctionalE2E.required, true);
  assert.match(
    plan.postDeployReadback.mfaFunctionalE2E.failureRule,
    /not MFA readiness/u,
  );
});
