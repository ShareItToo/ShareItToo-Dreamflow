import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateWp157DsaModerationDecisionAppealParity,
} from '../../tool/validate_wp157_dsa_moderation_decision_appeal_parity.mjs';

const evidencePath = new URL(
  '../../docs/evidence/release-readiness/wp157-dsa-moderation-decision-appeal-parity-20260915.json',
  import.meta.url,
);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));

test('accepts the fail-closed WP157 technical package', () => {
  const result = validateWp157DsaModerationDecisionAppealParity({ evidence });
  assert.equal(result.externalGates, 'hold');
});

test('rejects invented DSA applicability or operator facts', () => {
  const mutated = structuredClone(evidence);
  mutated.legalBoundaries.dsaApplicabilityDecided = true;
  assert.throws(
    () => validateWp157DsaModerationDecisionAppealParity({ evidence: mutated }),
    /legal boundaries is invalid/u,
  );
});

test('rejects a false automatic reopen or external delivery claim', () => {
  const mutated = structuredClone(evidence);
  mutated.findings.automaticReopen = true;
  assert.throws(
    () => validateWp157DsaModerationDecisionAppealParity({ evidence: mutated }),
    /findings is invalid/u,
  );
});
