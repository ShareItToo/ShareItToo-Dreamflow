import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePublicStoreBackendCandidatePreflight,
} from '../../tool/validate_public_store_backend_candidate_preflight.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'evidence', 'b11',
  'public-store-backend-candidate-preflight-20260813.json'), 'utf8'));
const preflightScript = fs.readFileSync(path.join(root, 'backend', 'ops',
  'preflight_public_store_backend.sh'), 'utf8');

test('saved production-mode backend preflight proves compatibility without deployment', () => {
  assert.deepEqual(validatePublicStoreBackendCandidatePreflight(evidence), {
    status: 'passed-production-mode-isolated-awaiting-production-approval',
    commit: 'f952e2a6c3bdd7cf900eee385a6d3f1110fa39dc',
    imageDigest: 'ghcr.io/walidwalidchraibi-dot/shareittoo-api@sha256:05a71da806804d1b283fae96a883f90fa49084877346139b63e34494d0b7c608',
    routesVerified: true,
    liveEnvironmentsUnchanged: true,
    productionDeploymentApproved: false,
  });
});

test('the reusable preflight is isolated, production-mode, fail-closed, and self-cleaning', () => {
  assert.match(preflightScript, /trap task_cleanup EXIT/u);
  assert.match(preflightScript, /DEPLOYMENT_ENVIRONMENT=production/u);
  assert.match(preflightScript, /PUBLIC_COMPLIANCE_APPROVED=false/u);
  assert.match(preflightScript, /PAYMENT_TRANSPORT=disabled/u);
  assert.match(preflightScript, /task_assert_route \/v1\/public\/support 503 support draft/u);
  assert.match(preflightScript, /task_assert_route \/v1\/public\/privacy 503 privacy draft/u);
  assert.match(preflightScript, /task_assert_route \/v1\/account-deletion 200 account-deletion operational/u);
  assert.doesNotMatch(preflightScript, /CONFIRM_PRODUCTION_DEPLOY/u);
  assert.doesNotMatch(preflightScript, /docker compose[^\n]*up/u);
});

test('a deployment or store gate cannot be promoted by the isolated preflight', () => {
  const changed = structuredClone(evidence);
  changed.gates.productionBackendDeploymentApproved = true;
  assert.throws(
    () => validatePublicStoreBackendCandidatePreflight(changed),
    /Gate must remain closed/u,
  );
});

test('live or staged data reuse invalidates the preflight', () => {
  const changed = structuredClone(evidence);
  changed.isolatedRuntime.productionDataMounted = true;
  assert.throws(
    () => validatePublicStoreBackendCandidatePreflight(changed),
    /Data isolation must remain false/u,
  );
});

test('a stale image identity cannot masquerade as the exact commit candidate', () => {
  const changed = structuredClone(evidence);
  changed.candidate.image = 'ghcr.io/walidwalidchraibi-dot/shareittoo-api:stale';
  assert.throws(
    () => validatePublicStoreBackendCandidatePreflight(changed),
    /not bound to the exact commit/u,
  );
});

test('leftover temporary resources invalidate the isolated preflight', () => {
  const changed = structuredClone(evidence);
  changed.liveStateAfterPreflight.temporaryNetworksRemaining = 1;
  assert.throws(
    () => validatePublicStoreBackendCandidatePreflight(changed),
    /cleanup or unchanged Caddy evidence is incomplete/u,
  );
});
