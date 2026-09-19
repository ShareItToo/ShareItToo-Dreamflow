import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumerDisputeConfigurationContract,
  readConsumerDisputeConfiguration,
} from '../src/consumer_dispute_config.js';

const approvedEnvironment = Object.freeze({
  SIT_CONSUMER_DISPUTE_APPROVED: 'true',
  SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION: 'VSBG-REVIEW-1',
  SIT_CONSUMER_DISPUTE_BODY_NAME: 'Universalschlichtungsstelle des Bundes',
  SIT_CONSUMER_DISPUTE_BODY_ADDRESS: 'Beispielweg 1, 00000 Beispielstadt',
  SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'https://www.verbraucher-schlichter.de/',
  SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS:
    'not_willing_or_obliged_except_mandatory_case',
});

test('consumer-dispute configuration is fail-closed by default', () => {
  const result = readConsumerDisputeConfiguration({});
  assert.equal(result.isApproved, false);
  assert.equal(result.isComplete, false);
  assert.equal(result.conciliationBodyName, '');
  assert.equal(result.conciliationBodyWebsite, '');
  assert.equal(result.oldOdrLinkPresent, false);
});

test('complete approved configuration maps one bounded participation statement', () => {
  const result = readConsumerDisputeConfiguration(approvedEnvironment);
  assert.equal(result.isComplete, true);
  assert.equal(result.policyVersion, 'V52-VSBG-2026-08-22.1');
  assert.equal(result.conciliationBodyWebsite, 'https://www.verbraucher-schlichter.de/');
  assert.equal(
    result.participationStatusPlain,
    consumerDisputeConfigurationContract.participationStatusPlain,
  );
});

test('TBD, unapproved, insecure, credentialed and old ODR configurations fail closed', () => {
  for (const changed of [
    { SIT_CONSUMER_DISPUTE_APPROVED: 'false' },
    { SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION: 'TBD!' },
    { SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS: 'TBD' },
    { SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'http://www.verbraucher-schlichter.de/' },
    { SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'https://user:pass@example.test/' },
    { SIT_CONSUMER_DISPUTE_BODY_WEBSITE: 'https://ec.europa.eu/consumers/odr/' },
  ]) {
    const result = readConsumerDisputeConfiguration({
      ...approvedEnvironment,
      ...changed,
    });
    assert.equal(result.isComplete, false, JSON.stringify(changed));
  }
});
