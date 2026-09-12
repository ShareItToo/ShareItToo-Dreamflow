import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateP0BOpsReadiness } from '../../tool/validate_p0b_ops_readiness.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifest = JSON.parse(readFileSync(
  resolve(root, 'docs/operations/p0b-ops-role-delegate-absence-gate.json'),
  'utf8',
));

test('accepts technical rehearsals while keeping missing human evidence on hold', () => {
  assert.deepEqual(validateP0BOpsReadiness({ root, manifest }), {
    version: 'P0B-OPS-2026-08-21.1',
    state: 'hold-external-assignments-and-human-absence-tests',
    requiredRoles: 6,
    assignedRoles: 0,
    soleFounderPrimaryRoleMappings: 6,
    technicalRehearsalsPassed: 4,
    humanAbsenceTestsPassed: 0,
    operationsReady: false,
  });
});

test('rejects invented people, RBAC or human absence evidence', () => {
  const changed = structuredClone(manifest);
  changed.roleAssignments[0].primaryPrincipalRef = 'invented:primary';
  changed.roleAssignments[0].delegatePrincipalRef = 'invented:delegate';
  changed.roleAssignments[0].companySystemRef = 'invented:system';
  changed.roleAssignments[0].primaryRbacEvidenceRef = 'invented:rbac-primary';
  changed.roleAssignments[0].delegateRbacEvidenceRef = 'invented:rbac-delegate';
  changed.roleAssignments[0].primaryMfaVerified = true;
  changed.roleAssignments[0].delegateMfaVerified = true;
  changed.roleAssignments[0].ownerApproved = true;
  assert.throws(
    () => validateP0BOpsReadiness({ root, manifest: changed }),
    /recorded evaluation does not match|readiness is overstated/u,
  );
});

test('rejects a missing or changed Drive Support Packet binding', () => {
  const changed = structuredClone(manifest);
  changed.sourceBindings.drive[2].modifiedTime = '2026-08-20T00:00:00.000Z';
  assert.throws(
    () => validateP0BOpsReadiness({ root, manifest: changed }),
    /Drive source binding drift/u,
  );
});

test('rejects repository source or runbook drift', () => {
  assert.throws(
    () => validateP0BOpsReadiness({
      root,
      manifest,
      sourceOverrides: {
        'docs/operations/P0B_OPS_ASSIGNMENT_AND_ABSENCE_RUNBOOK.md': '# changed',
      },
    }),
    /repository source drift/u,
  );
});

test('rejects softened external or product boundaries', () => {
  const changed = structuredClone(manifest);
  changed.externalGates.functionalRoleAssignees = 'ready';
  changed.boundaries.productionChanged = true;
  assert.throws(
    () => validateP0BOpsReadiness({ root, manifest: changed }),
    /boundary must remain false|gates must remain open/u,
  );
});
