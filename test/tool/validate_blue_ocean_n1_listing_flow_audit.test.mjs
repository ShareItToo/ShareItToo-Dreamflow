import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN1ListingFlowAudit } from '../../tool/validate_blue_ocean_n1_listing_flow_audit.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n1-listing-flow-audit-20260823.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN1ListingFlowAudit({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact N1 DONE OPEN CONFLICT matrix', () => {
  assert.deepEqual(validate(), {
    status: 'verified-ready-for-n2',
    done: 4,
    open: 4,
    conflict: 3,
    nextPackage: 'N2',
  });
});

test('rejects missing areas or softened status classifications', () => {
  const missing = structuredClone(evidence);
  missing.matrix.pop();
  assert.throws(() => validate(missing), /eleven requested areas/u);

  const softened = structuredClone(evidence);
  softened.matrix[4].status = 'DONE';
  assert.throws(() => validate(softened), /draft_model/u);
});

test('rejects false counts or reordered implementation', () => {
  const counts = structuredClone(evidence);
  counts.counts.CONFLICT = 2;
  assert.throws(() => validate(counts), /matrix counts/u);

  const order = structuredClone(evidence);
  order.implementationOrder = ['N3', 'N2', 'N4', 'N5', 'N6'];
  assert.throws(() => validate(order), /implementation order/u);
});

test('rejects weakened preservation or a forbidden mutation', () => {
  const publish = structuredClone(evidence);
  publish.preservedInvariants.listingAutoPublishAllowed = true;
  assert.throws(() => validate(publish), /preservation boundary/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.providerCallPerformed = true;
  assert.throws(() => validate(mutation), /forbidden mutation/u);
});

test('rejects private-shaped evidence', () => {
  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});
