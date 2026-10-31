import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp139StagingRegistryReadPathAudit,
} from '../../tool/validate_wp139_staging_registry_read_path_audit.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp139-staging-registry-read-path-audit-20260913.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts authenticated read while retaining the scope and fresh-pull gap', () => {
  const result = validateWp139StagingRegistryReadPathAudit({
    repositoryRoot: root,
    evidence: readEvidence(),
    checkGitState: false,
  });
  assert.equal(result.authenticatedRead, 'passed');
  assert.equal(result.leastPrivilegeProven, false);
  assert.equal(result.freshLayerPull, false);
  assert.deepEqual(result.portfolio, { pass: 20, partial: 4, open: 8 });
});

test('rejects promoting metadata read into a least-privilege or layer-pull claim', () => {
  const changed = readEvidence();
  changed.readPath.leastPrivilegeReadPackagesOnlyProven = true;
  changed.readPath.freshLayerPullPerformed = true;
  changed.decision.after = 'PASS';
  assert.throws(
    () => validateWp139StagingRegistryReadPathAudit({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /read path|decision/u,
  );
});

test('rejects a runtime mutation or credential-shaped evidence', () => {
  const changed = readEvidence();
  changed.boundaries.vpsImageCacheChanged = true;
  changed.extra = { credential: 'ghp_' + 'A'.repeat(40) };
  assert.throws(
    () => validateWp139StagingRegistryReadPathAudit({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /boundary contract|credential-shaped/u,
  );
});
