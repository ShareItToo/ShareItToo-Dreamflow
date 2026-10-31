import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluateStagingDeploymentReadiness } from
  '../ops/validate_staging_deployment_readiness.mjs';

function payload({
  status = 'ok',
  supportStatus = 'ok',
  nextUpdateOverdue = 0,
  criticalNextUpdateOverdue = 0,
} = {}) {
  return {
    status,
    service: 'shareittoo-api',
    checks: {
      database: 'ok',
      mail: 'ok',
      notifications: { pending: 0, dead: 0 },
      payments: {
        failedEvents: 0,
        unbalanced: 0,
        recoveryPending: 0,
        recoveryNeedsReview: 0,
      },
      supportDeadlines: {
        status: supportStatus,
        stale: false,
        lastErrorCode: null,
        p0WithoutOwner: 0,
        nextUpdateOverdue,
        criticalNextUpdateOverdue,
        privacyDeadlineNear: 0,
        privacyDeadlineOverdue: 0,
        privacyIncidentDeadlineNear: 0,
        privacyIncidentDeadlineOverdue: 0,
      },
    },
  };
}

test('accepts exact healthy Staging readiness', () => {
  assert.deepEqual(
    evaluateStagingDeploymentReadiness(payload(), { httpStatus: 200 }),
    {
      status: 'passed',
      state: 'ready',
      noncriticalNextUpdateOverdue: 0,
    },
  );
});

test('permits only a truthful noncritical Staging support-update backlog', () => {
  assert.deepEqual(
    evaluateStagingDeploymentReadiness(payload({
      status: 'degraded',
      supportStatus: 'degraded',
      nextUpdateOverdue: 2,
    }), { httpStatus: 503 }),
    {
      status: 'passed',
      state: 'noncritical_support_deadline_overdue',
      noncriticalNextUpdateOverdue: 2,
    },
  );
});

test('keeps technical and critical operational degradation fail-closed', () => {
  const technical = payload({
    status: 'degraded',
    supportStatus: 'degraded',
    nextUpdateOverdue: 1,
  });
  technical.checks.notifications.dead = 1;
  assert.throws(
    () => evaluateStagingDeploymentReadiness(technical, { httpStatus: 503 }),
    (error) => error.code === 'notifications_unready',
  );

  const recovery = payload();
  recovery.status = 'degraded';
  recovery.checks.payments.recoveryNeedsReview = 1;
  assert.throws(
    () => evaluateStagingDeploymentReadiness(recovery, { httpStatus: 503 }),
    (error) => error.code === 'payments_unready',
  );

  const pendingRecovery = payload();
  pendingRecovery.status = 'degraded';
  pendingRecovery.checks.payments.recoveryPending = 1;
  assert.throws(
    () => evaluateStagingDeploymentReadiness(pendingRecovery, { httpStatus: 503 }),
    (error) => error.code === 'payments_unready',
  );

  assert.throws(
    () => evaluateStagingDeploymentReadiness(payload({
      status: 'degraded',
      supportStatus: 'degraded',
      nextUpdateOverdue: 1,
      criticalNextUpdateOverdue: 1,
    }), { httpStatus: 503 }),
    (error) => error.code === 'support_critical_next_update_overdue',
  );
});

test('staging container liveness and deployment readiness stay explicitly separated', () => {
  const compose = readFileSync(new URL('../compose.staging.yml', import.meta.url), 'utf8');
  const deployment = readFileSync(new URL('../ops/deploy_release.sh', import.meta.url), 'utf8');
  assert.match(compose, /health\/live/u);
  assert.doesNotMatch(compose, /healthcheck:[\s\S]*health\/ready/u);
  assert.match(deployment, /validate_staging_deployment_readiness\.mjs/u);
  assert.match(deployment, /--write-out '%\{http_code\}'/u);
  assert.match(deployment, /task_environment" == staging/u);
  assert.match(deployment, /curl --fail[\s\S]*health\/ready/u);
});
