import assert from 'node:assert/strict';
import test from 'node:test';

import { validateProductionRecreatePlan } from
  '../../tool/validate_production_recreate_plan.mjs';

const digestA = `sha256:${'a'.repeat(64)}`;
const digestB = `sha256:${'b'.repeat(64)}`;

function image(name, digest) {
  return { name, digest, reference: `${name}@${digest}` };
}

function validPlan() {
  return {
    schemaVersion: 1,
    kind: 'sit-production-recreate-plan',
    status: 'prepared',
    target: {
      environment: 'production',
      host: 'srv1580960.hstgr.cloud',
      service: 'shareittoo-api',
    },
    currentRuntime: {
      image: image('registry.example.invalid/shareittoo-api', digestA),
      composeFiles: ['/srv/shareittoo/compose.yml'],
      environmentFilePath: '/srv/shareittoo/.env',
      persistentVolumes: ['shareittoo_postgres_data'],
      networks: ['shareittoo_default'],
      dependencies: ['shareittoo-postgres'],
    },
    proposedRuntime: {
      image: image('registry.example.invalid/shareittoo-api', digestB),
      availabilityProof: { kind: 'registry-digest', digest: digestB },
    },
    rollback: { image: image('registry.example.invalid/shareittoo-api', digestA) },
    preflight: {
      website: 'passed',
      api: 'passed',
      database: 'passed',
      mail: 'passed',
      containers: 'passed',
      disk: 'passed',
      backupFreshness: 'passed',
    },
    abortPolicy: {
      stopAfterPullOrRecreateFailure: true,
      rereadDependenciesBeforeRetry: true,
    },
    postReadback: {
      website: 'required',
      api: 'required',
      database: 'required',
      mail: 'required',
      containers: 'required',
      disk: 'required',
      backupFreshness: 'required',
      healthService: 'required',
      healthTimer: 'required',
      automaticHealthRun: 'required',
    },
  };
}

test('accepts a complete immutable production recreate plan', () => {
  assert.deepEqual(validateProductionRecreatePlan(validPlan()), {
    status: 'prepared',
    target: 'srv1580960.hstgr.cloud/shareittoo-api',
    proposedImageDigest: digestB,
    productionAuthorized: false,
  });
});

test('rejects the incident fallback image', () => {
  const plan = validPlan();
  plan.proposedRuntime.image = image('shareittoo-api:local', digestB);
  assert.throws(() => validateProductionRecreatePlan(plan), /forbidden fallback/u);
});

test('rejects an unproven image and incomplete preflight', () => {
  const unproven = validPlan();
  unproven.proposedRuntime.availabilityProof.digest = digestA;
  assert.throws(() => validateProductionRecreatePlan(unproven), /not proven/u);

  const incomplete = validPlan();
  incomplete.preflight.backupFreshness = 'failed';
  assert.throws(() => validateProductionRecreatePlan(incomplete), /backupFreshness/u);
});

test('requires dependency reread and automatic Health verification', () => {
  const retry = validPlan();
  retry.abortPolicy.rereadDependenciesBeforeRetry = false;
  assert.throws(() => validateProductionRecreatePlan(retry), /abort policy/u);

  const postReadback = validPlan();
  delete postReadback.postReadback.automaticHealthRun;
  assert.throws(() => validateProductionRecreatePlan(postReadback), /automaticHealthRun/u);
});

test('rejects secret-bearing plans', () => {
  const plan = validPlan();
  plan.password = 'must-not-be-recorded';
  assert.throws(() => validateProductionRecreatePlan(plan), /Secret-bearing field/u);
});
