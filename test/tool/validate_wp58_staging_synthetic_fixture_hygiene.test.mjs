import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp58StagingSyntheticFixtureHygiene,
} from '../../tool/validate_wp58_staging_synthetic_fixture_hygiene.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp58-staging-synthetic-fixture-hygiene-20260908.json',
), 'utf8'));

function changed(mutator) {
  const copy = structuredClone(evidence);
  mutator(copy);
  return copy;
}

test('accepts exact sanitized WP58 fixture hygiene evidence', () => {
  assert.equal(validateWp58StagingSyntheticFixtureHygiene({ evidence, repositoryRoot: root }), evidence);
});

test('rejects a claimed payment or monetary effect', () => {
  assert.throws(() => validateWp58StagingSyntheticFixtureHygiene({
    evidence: changed((copy) => { copy.stagingResult.monetaryEffectMinor = 1; }),
    repositoryRoot: root,
  }), /monetary effect/u);
  assert.throws(() => validateWp58StagingSyntheticFixtureHygiene({
    evidence: changed((copy) => { copy.stagingResult.paymentEndpointCalled = true; }),
    repositoryRoot: root,
  }), /payment call/u);
});

test('rejects weakened booking protection and rollback', () => {
  for (const key of ['activeBookingProtectionRequired', 'rollbackOnFeedFailure']) {
    assert.throws(() => validateWp58StagingSyntheticFixtureHygiene({
      evidence: changed((copy) => { copy.implementation[key] = false; }),
      repositoryRoot: root,
    }), /verified WP58 value/u);
  }
});

test('rejects direct database cleanup or false legacy closure', () => {
  assert.throws(() => validateWp58StagingSyntheticFixtureHygiene({
    evidence: changed((copy) => { copy.heldBoundary.directDatabaseCleanupAllowed = true; }),
    repositoryRoot: root,
  }), /database cleanup/u);
  assert.throws(() => validateWp58StagingSyntheticFixtureHygiene({
    evidence: changed((copy) => { copy.stagingResult.hiddenLegacyTechnicalListingCount = 0; }),
    repositoryRoot: root,
  }), /hidden legacy count/u);
});

test('rejects private or credential-shaped evidence', () => {
  assert.throws(() => validateWp58StagingSyntheticFixtureHygiene({
    evidence: changed((copy) => { copy.heldBoundary.reason = 'owner@example.invalid'; }),
    repositoryRoot: root,
  }), /private or credential-shaped/u);
});
