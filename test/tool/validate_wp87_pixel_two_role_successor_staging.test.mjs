import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp87PixelTwoRoleSuccessorStaging } from '../../tool/validate_wp87_pixel_two_role_successor_staging.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(root, 'docs/evidence/release-readiness/wp87-pixel-two-role-successor-staging-20260910.json');
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('binds the controlled Pixel core journey without promoting legal or payment scope', () => {
  assert.deepEqual(validateWp87PixelTwoRoleSuccessorStaging(), {
    status: 'complete-controlled-nonbinding-pixel-core-journey',
    candidateVersionCode: '2026090905',
    coreJourney: 'owner-renter-publish-discover-chat-isolation-passed',
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp87_pixel_two_role_successor_staging\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp87_pixel_two_role_successor_staging\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp87_pixel_two_role_successor_staging\.mjs/u);
});

test('rejects successor-wide promotion and sensitive values', () => {
  const promoted = evidence();
  promoted.provenanceLimit.wholeCandidateOrLegalAcceptanceTransferred = true;
  assert.throws(() => validateWp87PixelTwoRoleSuccessorStaging({ evidence: promoted }), /provenance/u);

  const privateValue = evidence();
  privateValue.note = 'contact@example.test';
  assert.throws(() => validateWp87PixelTwoRoleSuccessorStaging({ evidence: privateValue }), /private or secret-shaped/u);
});
