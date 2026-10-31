import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateWp156RetentionLegalHoldSafety,
} from '../../tool/validate_wp156_retention_legal_hold_enforcement_safety.mjs';

const evidencePath = new URL(
  '../../docs/evidence/release-readiness/wp156-retention-legal-hold-enforcement-safety-20260915.json',
  import.meta.url,
);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));

test('accepts the fail-closed WP156 technical package', () => {
  const result = validateWp156RetentionLegalHoldSafety({ evidence });
  assert.equal(result.openDecisions, 10);
  assert.equal(result.externalGates, 'hold');
});

test('rejects any attempt to close a retention decision or enable execution', () => {
  const mutated = structuredClone(evidence);
  mutated.decisions.openCount = 9;
  assert.throws(
    () => validateWp156RetentionLegalHoldSafety({ evidence: mutated }),
    /decisions is invalid/u,
  );
  const execution = structuredClone(evidence);
  execution.decisions.executionEnabled = true;
  assert.throws(
    () => validateWp156RetentionLegalHoldSafety({ evidence: execution }),
    /decisions is invalid/u,
  );
});

test('rejects removal of the isolated deleted-profile restore guard', () => {
  const mutated = structuredClone(evidence);
  mutated.invariants.noProfileRestoreFromBackup = false;
  assert.throws(
    () => validateWp156RetentionLegalHoldSafety({ evidence: mutated }),
    /invariants is invalid/u,
  );
});
