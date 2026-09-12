import assert from 'node:assert/strict';
import test from 'node:test';

import { stageAOperatorConfigStatus } from '../../tool/check_stage_a_operator_config.mjs';

test('N9 operator status helper stays open without external owner values', () => {
  const status = stageAOperatorConfigStatus({});
  assert.equal(status.state, 'facts-open');
  assert.equal(status.activationAllowed, false);
  assert.equal(status.containsValues, false);
});

test('N9 operator status helper exposes no supplied owner value', () => {
  const status = stageAOperatorConfigStatus({
    SIT_OPERATOR_LEGAL_NAME: 'Private Test Person',
    SIT_OPERATOR_POSTAL_ADDRESS: 'Testweg 10, 74000 Testort',
    SIT_OPERATOR_CONTACT_EMAIL: 'owner@test.invalid',
  });
  assert.equal(status.factsComplete, true);
  assert.equal(status.activationAllowed, false);
  assert.doesNotMatch(JSON.stringify(status), /Private Test Person|Testweg|owner@/u);
});
