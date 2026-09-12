import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateOperationalDelegation } from '../../tool/validate_operational_delegation.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifest = JSON.parse(readFileSync(
  resolve(root, 'docs/operations/fi1-operational-delegation.json'),
  'utf8',
));

test('FI1 binds four role-owned operations and eight escalation thresholds', () => {
  assert.deepEqual(validateOperationalDelegation({ root, manifest }), {
    state: 'hold-external-role-assignments',
    processes: 4,
    thresholds: 8,
    assignmentsReady: false,
    reportingBlended: false,
  });
});

test('FI1 cannot claim assignments or absence readiness', () => {
  const assigned = structuredClone(manifest);
  assigned.processes[0].assignmentEvidenceAvailable = true;
  assert.throws(
    () => validateOperationalDelegation({ root, manifest: assigned }),
    /unsafe role, readiness or runbook data/u,
  );

  const tested = structuredClone(manifest);
  tested.processes[0].absenceTestPassed = true;
  assert.throws(
    () => validateOperationalDelegation({ root, manifest: tested }),
    /unsafe role, readiness or runbook data/u,
  );
});

test('FI1 owner and delegate roles must remain distinct and known', () => {
  const changed = structuredClone(manifest);
  changed.processes[0].delegateRoleId = changed.processes[0].ownerRoleId;
  assert.throws(
    () => validateOperationalDelegation({ root, manifest: changed }),
    /unsafe role, readiness or runbook data/u,
  );
});

test('normal operational thresholds cannot route directly to a founder', () => {
  const changed = structuredClone(manifest);
  changed.processes[0].escalationThresholds[0].founderEscalation = true;
  assert.throws(
    () => validateOperationalDelegation({ root, manifest: changed }),
    /unsafe escalation threshold/u,
  );
});

test('cockpit must keep normal operations and founder reporting separate', () => {
  const changed = structuredClone(manifest);
  changed.cockpit.blended = true;
  assert.throws(
    () => validateOperationalDelegation({ root, manifest: changed }),
    /cockpit reporting separation is invalid/u,
  );
});

test('runbooks reject named-person dependencies', () => {
  const path = manifest.processes[0].runbookRef;
  const runbook = readFileSync(resolve(root, path), 'utf8');
  assert.throws(
    () => validateOperationalDelegation({
      root,
      manifest,
      sourceOverrides: { [path]: `${runbook}\nEscalate to Walid.\n` },
    }),
    /named-person dependency/u,
  );
});
