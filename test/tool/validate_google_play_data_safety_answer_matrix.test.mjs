import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateGooglePlayDataSafetyAnswerMatrix } from '../../tool/validate_google_play_data_safety_answer_matrix.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const matrix = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/b11/google-play-data-safety-answer-matrix-2026081505-20260815.json',
), 'utf8'));
const privacy = JSON.parse(readFileSync(resolve(root, 'store/privacy-disclosures.json'), 'utf8'));
const clone = (value) => structuredClone(value);

test('accepts the complete but unsaved Data Safety answer matrix', () => {
  assert.deepEqual(validateGooglePlayDataSafetyAnswerMatrix({
    root,
    allowCandidateRollover: true,
  }), {
    evaluated: 18,
    selected: 17,
    consoleSaved: false,
    submissionAllowed: false,
  });
});

test('keeps the Data Safety matrix in the permanent technical regression gate', () => {
  const regression = readFileSync(resolve(root, 'scripts/technical_regression_check.sh'), 'utf8');
  for (const command of [
    'node --check tool/validate_google_play_data_safety_answer_matrix.mjs',
    'node --test test/tool/validate_google_play_data_safety_answer_matrix.test.mjs',
    'node tool/validate_google_play_data_safety_answer_matrix.mjs --allow-candidate-rollover',
  ]) {
    assert.ok(regression.includes(command), `missing regression command: ${command}`);
  }
});

test('keeps strict candidate binding unless rollover is explicit', () => {
  assert.throws(
    () => validateGooglePlayDataSafetyAnswerMatrix({ root }),
    /not bound to the reviewed internal candidate/,
  );
});

test('rejects pretending user payment information is collected', () => {
  const changed = clone(matrix);
  const payment = changed.dataTypes.find((entry) => entry.id === 'paymentInfo');
  payment.selected = true;
  payment.collected = true;
  assert.throws(
    () => validateGooglePlayDataSafetyAnswerMatrix({
      root, matrix: changed, privacy, allowCandidateRollover: true,
    }),
    /reviewed disclosure/,
  );
});

test('rejects prematurely claiming that provider transfers are not sharing', () => {
  const changed = clone(matrix);
  changed.dataTypes.find((entry) => entry.id === 'emailAddress').shared = false;
  assert.throws(
    () => validateGooglePlayDataSafetyAnswerMatrix({
      root, matrix: changed, privacy, allowCandidateRollover: true,
    }),
    /sharing must remain unresolved/,
  );
});

test('rejects treating persisted data as ephemeral', () => {
  const changed = clone(matrix);
  changed.dataTypes.find((entry) => entry.id === 'crashData').ephemeral = true;
  assert.throws(
    () => validateGooglePlayDataSafetyAnswerMatrix({
      root, matrix: changed, privacy, allowCandidateRollover: true,
    }),
    /reviewed disclosure/,
  );
});

test('rejects opening the console save boundary before provider and legal gates', () => {
  const changed = clone(matrix);
  changed.blockingGates.consoleDraftSaveAllowed = true;
  assert.throws(
    () => validateGooglePlayDataSafetyAnswerMatrix({
      root, matrix: changed, privacy, allowCandidateRollover: true,
    }),
    /must remain closed/,
  );
});

test('rejects account data in the sanitized matrix', () => {
  const changed = clone(matrix);
  changed.privateContact = 'private@example.test';
  assert.throws(
    () => validateGooglePlayDataSafetyAnswerMatrix({
      root, matrix: changed, privacy, allowCandidateRollover: true,
    }),
    /sanitized/,
  );
});
