import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN2ListingAiFoundation } from '../../tool/validate_blue_ocean_n2_listing_ai_foundation.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n2-listing-ai-foundation-20260823.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN2ListingAiFoundation({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact additive N2 foundation', () => {
  assert.deepEqual(validate(), {
    status: 'verified-ready-for-n3',
    storageFoundationCount: 7,
    nextPackage: 'N3',
  });
});

test('rejects auto-publish, provider authority and historical rewrites', () => {
  const publish = structuredClone(evidence);
  publish.domain.autoPublishAllowed = true;
  assert.throws(() => validate(publish), /domain contract/u);

  const provider = structuredClone(evidence);
  provider.preservedInvariants.providerPriceAuthoritative = true;
  assert.throws(() => validate(provider), /preservation boundary/u);

  const historical = structuredClone(evidence);
  historical.preservedInvariants.historicalListingsRewritten = true;
  assert.throws(() => validate(historical), /preservation boundary/u);
});

test('rejects lost privacy lifecycle gates and rollback protection', () => {
  const privacy = structuredClone(evidence);
  privacy.lifecycle.privacyExportIntegrationRequiredBeforeActivation = false;
  assert.throws(() => validate(privacy), /lifecycle boundary/u);

  const rollback = structuredClone(evidence);
  rollback.lifecycle.rollbackBlockedWhenDataExists = false;
  assert.throws(() => validate(rollback), /lifecycle boundary/u);
});

test('rejects a missing table or forbidden mutation', () => {
  const missing = structuredClone(evidence);
  missing.storageFoundations.pop();
  assert.throws(() => validate(missing), /storage foundation/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.providerCallPerformed = true;
  assert.throws(() => validate(mutation), /mutation boundary/u);
});

test('rejects an invalid exact CI binding or a weakened local regression record', () => {
  const ci = structuredClone(evidence);
  ci.exactGitHubVerification.headSha = '0000000000000000000000000000000000000000';
  assert.throws(() => validate(ci), /exact GitHub verification/u);

  const regression = structuredClone(evidence);
  regression.targetedVerification.postgres16MigrationIntegration = 'pending';
  assert.throws(() => validate(regression), /verification record/u);
});

test('rejects private-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
