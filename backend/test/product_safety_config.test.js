import assert from 'node:assert/strict';
import test from 'node:test';

import {
  productSafetyConfigurationContract,
  readProductSafetyConfiguration,
} from '../src/product_safety_config.js';

const approvedEnvironment = Object.freeze({
  SIT_PRODUCT_SAFETY_APPROVED: 'true',
  SIT_PRODUCT_SAFETY_CONFIGURATION_VERSION: 'GPSR-REVIEW-1',
  SIT_PRODUCT_SAFETY_CONSUMER_CONTACT_EMAIL: 'produktsicherheit@example.test',
  SIT_PRODUCT_SAFETY_AUTHORITY_CONTACT_REGISTERED: 'true',
  SIT_PRODUCT_SAFETY_SAFETY_GATE_REGISTERED: 'true',
  SIT_PRODUCT_SAFETY_INTERNAL_PROCESS_APPROVED: 'true',
});

test('complete product-safety configuration requires every approved fact', () => {
  assert.deepEqual(readProductSafetyConfiguration(approvedEnvironment), {
    isApproved: true,
    isComplete: true,
    configurationVersion: 'GPSR-REVIEW-1',
    consumerContactEmail: 'produktsicherheit@example.test',
    authorityContactRegistered: true,
    safetyGateRegistered: true,
    internalProcessApproved: true,
  });
  assert.deepEqual(productSafetyConfigurationContract, {
    intakeVersion: 'sit_product_safety_intake_v1',
    consumerContactPointVersion: 'sit_product_safety_contact_point_v1',
    maximumCandidateTriageMinutes: 60,
  });
});

test('missing, malformed or unapproved product-safety facts fail closed', () => {
  for (const override of [
    { SIT_PRODUCT_SAFETY_APPROVED: 'false' },
    { SIT_PRODUCT_SAFETY_CONFIGURATION_VERSION: 'TBD!' },
    { SIT_PRODUCT_SAFETY_CONSUMER_CONTACT_EMAIL: 'not-an-email' },
    { SIT_PRODUCT_SAFETY_AUTHORITY_CONTACT_REGISTERED: 'false' },
    { SIT_PRODUCT_SAFETY_SAFETY_GATE_REGISTERED: 'false' },
    { SIT_PRODUCT_SAFETY_INTERNAL_PROCESS_APPROVED: 'false' },
  ]) {
    assert.equal(readProductSafetyConfiguration({
      ...approvedEnvironment,
      ...override,
    }).isComplete, false);
  }
  assert.equal(readProductSafetyConfiguration({}).isComplete, false);
});
