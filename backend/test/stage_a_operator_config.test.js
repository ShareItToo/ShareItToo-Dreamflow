import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateStageAOperatorConfig } from '../src/stage_a_operator_config.js';

const complete = {
  SIT_OPERATOR_LEGAL_NAME: 'Privater Betreiber',
  SIT_OPERATOR_POSTAL_ADDRESS: 'Teststrasse 10, 74000 Testort',
  SIT_OPERATOR_CONTACT_EMAIL: 'kontakt@test.invalid',
};

test('N9 operator configuration defaults to an activation-blocking open state', () => {
  assert.deepEqual(evaluateStageAOperatorConfig(), {
    state: 'facts-open',
    factsComplete: false,
    activationAllowed: false,
    requiredFields: [
      'SIT_OPERATOR_LEGAL_NAME',
      'SIT_OPERATOR_POSTAL_ADDRESS',
      'SIT_OPERATOR_CONTACT_EMAIL',
    ],
    missingFields: [
      'SIT_OPERATOR_LEGAL_NAME',
      'SIT_OPERATOR_POSTAL_ADDRESS',
      'SIT_OPERATOR_CONTACT_EMAIL',
    ],
    invalidFields: [],
    containsValues: false,
  });
});

test('N9 operator configuration reports field names but returns no values', () => {
  const result = evaluateStageAOperatorConfig(complete);
  assert.equal(result.state, 'facts-complete-activation-still-separate');
  assert.equal(result.factsComplete, true);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.containsValues, false);
  assert.doesNotMatch(JSON.stringify(result), /Privater Betreiber|Teststrasse|kontakt@/u);
});

test('N9 operator configuration trims external values', () => {
  const result = evaluateStageAOperatorConfig(Object.fromEntries(
    Object.entries(complete).map(([key, value]) => [key, `  ${value}  `]),
  ));
  assert.equal(result.factsComplete, true);
});

test('N9 operator configuration rejects placeholders', () => {
  for (const field of Object.keys(complete)) {
    const result = evaluateStageAOperatorConfig({ ...complete, [field]: 'CHANGE-ME' });
    assert.deepEqual(result.invalidFields, [field]);
    assert.equal(result.factsComplete, false);
  }
});

test('N9 operator configuration rejects malformed contact email', () => {
  const result = evaluateStageAOperatorConfig({
    ...complete,
    SIT_OPERATOR_CONTACT_EMAIL: 'not-an-email',
  });
  assert.deepEqual(result.invalidFields, ['SIT_OPERATOR_CONTACT_EMAIL']);
});

test('N9 operator facts never authorize pilot activation by themselves', () => {
  assert.equal(evaluateStageAOperatorConfig(complete).activationAllowed, false);
});
