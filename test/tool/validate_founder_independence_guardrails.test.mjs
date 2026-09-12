import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateFounderIndependenceGuardrails,
} from '../../tool/validate_founder_independence_guardrails.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifest = JSON.parse(readFileSync(
  resolve(root, 'docs/operations/founder-independence-guardrails.json'),
  'utf8',
));

test('FI0 guardrails bind neutral roles, append-only audit and aggregate founder hours', () => {
  assert.deepEqual(validateFounderIndependenceGuardrails({ root, manifest }), {
    state: 'foundation-hold-external-assignments',
    requirements: 6,
    functionalRoles: 6,
    founderHoursCategories: 5,
    currentAssignmentsReady: false,
    invasiveTrackingEnabled: false,
  });
});

test('named-person authorization cannot be enabled', () => {
  const changed = structuredClone(manifest);
  changed.roleModel.namedPersonAuthorizationAllowed = true;
  assert.throws(
    () => validateFounderIndependenceGuardrails({ root, manifest: changed }),
    /role assignment or bus-factor safeguards are unsafe/u,
  );
});

test('critical process schema cannot omit the delegate role', () => {
  const changed = structuredClone(manifest);
  changed.criticalProcessTemplate.requiredFields =
    changed.criticalProcessTemplate.requiredFields.filter((field) => field !== 'delegateRoleId');
  assert.throws(
    () => validateFounderIndependenceGuardrails({ root, manifest: changed }),
    /criticalProcessTemplate.requiredFields/u,
  );
});

test('automatic or invasive founder tracking remains forbidden', () => {
  const automatic = structuredClone(manifest);
  automatic.founderHoursEvents.automaticCollectionAllowed = true;
  assert.throws(
    () => validateFounderIndependenceGuardrails({ root, manifest: automatic }),
    /manual, aggregate-only/u,
  );

  const invasive = structuredClone(manifest);
  invasive.boundaries.invasiveTimeTracking = true;
  assert.throws(
    () => validateFounderIndependenceGuardrails({ root, manifest: invasive }),
    /boundary must remain false/u,
  );

  const escalationDetails = structuredClone(manifest);
  escalationDetails.founderEscalationEvents.caseDetailsAllowed = true;
  assert.throws(
    () => validateFounderIndependenceGuardrails({
      root,
      manifest: escalationDetails,
    }),
    /manual, aggregate-only and privacy-minimal/u,
  );
});

test('a named person cannot return to a critical runtime source', () => {
  const workflowPath = '.github/workflows/regression.yml';
  const workflow = readFileSync(resolve(root, workflowPath), 'utf8');
  assert.throws(
    () => validateFounderIndependenceGuardrails({
      root,
      manifest,
      sourceOverrides: { [workflowPath]: `${workflow}\n# Walid-only approval\n` },
    }),
    /named-person hardcode/u,
  );
});

test('the GHCR repository owner is normalized to a valid lowercase image path', () => {
  const workflowPath = '.github/workflows/regression.yml';
  const workflow = readFileSync(resolve(root, workflowPath), 'utf8');
  assert.match(
    workflow,
    /REGISTRY_IMAGE="ghcr\.io\/\$\{GITHUB_REPOSITORY_OWNER,,\}\/shareittoo-api"/u,
  );
  assert.doesNotMatch(
    workflow,
    /REGISTRY_IMAGE:\s*ghcr\.io\/\$\{\{\s*github\.repository_owner\s*\}\}/u,
  );
});

test('external assignments and account changes remain open', () => {
  const changed = structuredClone(manifest);
  changed.externalGates.accountRbacChanges = 'complete';
  assert.throws(
    () => validateFounderIndependenceGuardrails({ root, manifest: changed }),
    /must remain open/u,
  );
});
