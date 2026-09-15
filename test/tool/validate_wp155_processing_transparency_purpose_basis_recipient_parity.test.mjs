import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp155ProcessingTransparency,
} from '../../tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const evidencePath = resolve(
  repositoryRoot,
  'docs/evidence/release-readiness/wp155-processing-transparency-purpose-basis-recipient-parity-20260915.json',
);
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts the fail-closed WP155 processing-transparency package', () => {
  const result = validateWp155ProcessingTransparency({ repositoryRoot });
  assert.equal(result.processingActivityCount, 14);
  assert.equal(result.approvedProcessingDecisions, 0);
  assert.equal(result.externalGates, 'hold');
});

test('rejects any processing approval or external activation', () => {
  const value = structuredClone(evidence);
  value.decision.privacyApprovalAllowed = true;
  value.gates.providerActivationAllowed = true;
  assert.throws(
    () => validateWp155ProcessingTransparency({ repositoryRoot, evidence: value }),
    /decision is invalid/u,
  );
});

test('rejects closing one decision without its professional evidence', () => {
  const value = structuredClone(evidence);
  value.decision.approvedProcessingDecisions = 1;
  value.decision.openProcessingDecisions = value.decision.openProcessingDecisions.slice(1);
  assert.throws(
    () => validateWp155ProcessingTransparency({ repositoryRoot, evidence: value }),
    /decision is invalid/u,
  );
});

test('rejects a stale source hash or inventory digest', () => {
  const value = structuredClone(evidence);
  value.sourceInventory['store/privacy-disclosures.json'] = '0'.repeat(64);
  assert.throws(
    () => validateWp155ProcessingTransparency({ repositoryRoot, evidence: value }),
    /source inventory digest|source inventory store\/privacy-disclosures/u,
  );
});

test('rejects an incomplete consent, Article 9 or service-recipient register', () => {
  const value = structuredClone(evidence);
  const path = 'store/privacy-disclosures.json';
  const privacy = JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
  privacy.processingTransparency.activities[2].purposes[1].consentControl = null;
  privacy.processingTransparency.activities[5].specialCategory.article9BasisStatus = 'not_applicable';
  privacy.processingTransparency.activities[8].recipients = ['firstPartyBackend'];
  assert.throws(
    () => validateWp155ProcessingTransparency({
      repositoryRoot,
      evidence: value,
      sourceTexts: { [path]: JSON.stringify(privacy) },
    }),
    /consent|Article 9|recipient|processing/u,
  );
});

test('permanent regression retains the WP155 closure ratchet', () => {
  const regression = readFileSync(
    resolve(repositoryRoot, 'scripts/technical_regression_check.sh'),
    'utf8',
  );
  for (const marker of [
    'node --check tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.mjs',
    'node --test test/tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.test.mjs',
    'node tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.mjs',
  ]) assert.match(regression, new RegExp(marker.replaceAll('.', '\\.'), 'u'));
});
