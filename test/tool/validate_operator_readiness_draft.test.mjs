import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateOperatorReadinessDraft } from '../../tool/validate_operator_readiness_draft.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('accepts the confirmed but non-activating sole-proprietor operator draft', () => {
  assert.deepEqual(validateOperatorReadinessDraft({ root }), {
    status: 'confirmed-facts-draft-only',
    operatorModel: 'sole-proprietor',
    publicCommercialOperationAllowed: false,
    bindingContractAcceptanceAllowed: false,
  });
});

test('rejects turning internal preparation into public or contractual operation', () => {
  const path = 'assets/legal/de/operator_readiness_draft_20260909.json';
  const source = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  source.operationBoundary.publicCommercialOperationAllowed = true;
  assert.throws(
    () => validateOperatorReadinessDraft({
      root,
      sourceOverrides: { [path]: JSON.stringify(source) },
    }),
    /operation boundary is not fail-closed/u,
  );
});

test('rejects alteration of historical baseline manifests', () => {
  assert.throws(
    () => validateOperatorReadinessDraft({
      root,
      sourceOverrides: { 'assets/legal/de/legal_manifest_v52.json': '{}' },
    }),
    /preserve historical baseline evidence/u,
  );
});
