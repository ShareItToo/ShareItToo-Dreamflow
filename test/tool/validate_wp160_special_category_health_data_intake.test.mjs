import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateWp160SpecialCategoryHealthDataIntake } from '../../tool/validate_wp160_special_category_health_data_intake.mjs';

const evidencePath = new URL('../../docs/evidence/release-readiness/wp160-special-category-health-data-intake-minimization-safety-20260915.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));

test('accepts technical WP160 closure while keeping Article 9 open', () => {
  const result = validateWp160SpecialCategoryHealthDataIntake({ evidence });
  assert.equal(result.article9Gate, 'ASTRA_GATE_REQUIRED:SPECIAL_CATEGORY_ARTICLE9_BASIS');
  assert.equal(result.sourceCount, 57);
});

test('rejects a selected Article 9 basis', () => {
  const mutated = structuredClone(evidence);
  mutated.technicalBoundary.article9BasisSelected = true;
  assert.throws(() => validateWp160SpecialCategoryHealthDataIntake({ evidence: mutated }), /technical boundary is invalid/u);
});

test('rejects inferred injury truth', () => {
  const mutated = structuredClone(evidence);
  mutated.accidentInjurySeparation.genericAccidentOrInjuryWordingDoesNotInferHealth = false;
  assert.throws(() => validateWp160SpecialCategoryHealthDataIntake({ evidence: mutated }), /accident\/injury separation is invalid/u);
});

test('rejects a stale source binding', () => {
  const mutated = structuredClone(evidence);
  mutated.sourceInventory['backend/src/special_category_data_guard.js'] = '0'.repeat(64);
  assert.throws(() => validateWp160SpecialCategoryHealthDataIntake({ evidence: mutated }), /source inventory digest is invalid|source inventory backend\/src\/special_category_data_guard.js is invalid/u);
});
