import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw7LocalListingCatalogAuthorizationDurability,
} from '../../tool/validate_rw7_local_listing_catalog_authorization_durability.mjs';

const root = new URL('../../', import.meta.url);
const evidencePath =
  'docs/evidence/48h-remote/rw7-local-listing-catalog-authorization-durability-20260825.json';
const baseEvidence = JSON.parse(
  readFileSync(new URL(evidencePath, root), 'utf8'),
);
const clone = (value) => structuredClone(value);

function validate(evidence = clone(baseEvidence), sourceTexts = {}) {
  return validateRw7LocalListingCatalogAuthorizationDurability({
    repositoryRoot: new URL('.', root).pathname,
    evidence,
    sourceTexts,
  });
}

test('accepts the exact bounded RW7 package', () => {
  assert.deepEqual(validate(), {
    status: baseEvidence.status,
    allowedSurfaces: 12,
    excludedSurfaces: 7,
    resolvedFindings: 10,
    fullTechnicalRegression:
      baseEvidence.verification.fullTechnicalRegression,
  });
});

test('rejects a changed live gate or boundary', () => {
  const gate = clone(baseEvidence);
  gate.gates.BUILD_READY = 'granted';
  assert.throws(() => validate(gate), /gate or boundary truth/u);

  const boundary = clone(baseEvidence);
  boundary.boundaries.productionChanged = true;
  assert.throws(() => validate(boundary), /gate or boundary truth/u);
});

test('rejects premature full regression or GitHub claims', () => {
  const regression = clone(baseEvidence);
  regression.status =
    'implemented-default-flutter-passed-full-technical-regression-pending';
  assert.throws(() => validate(regression), /verification truth/u);

  const github = clone(baseEvidence);
  delete github.githubVerification;
  assert.throws(() => validate(github), /GitHub verification/u);
});

test('rejects reordered missing or stale source inventory', () => {
  const reordered = clone(baseEvidence);
  reordered.sourceInventory.reverse();
  assert.throws(() => validate(reordered), /source inventory paths/u);

  const missing = clone(baseEvidence);
  missing.sourceInventory.pop();
  assert.throws(() => validate(missing), /source inventory paths/u);

  const path = 'lib/services/data_service.dart';
  assert.throws(
    () => validate(clone(baseEvidence), { [path]: '// changed\n' }),
    /source inventory hash is stale/u,
  );
});

test('rejects workaround media pruning or a false provider transition', () => {
  for (const key of [
    'timingWorkaroundAllowed',
    'testParallelismReductionAllowed',
    'silentMediaPruningAllowed',
  ]) {
    const evidence = clone(baseEvidence);
    evidence.scope[key] = true;
    assert.throws(() => validate(evidence), /deterministic-test policy/u);
  }
  const provider = clone(baseEvidence);
  provider.ratchets.externalReadiness = true;
  assert.throws(() => validate(provider), /ratchet cause or provider truth/u);
});

test('rejects secret-shaped or private evidence', () => {
  const evidence = clone(baseEvidence);
  evidence.findings[0].resolution = 'contact-owner@example.invalid';
  assert.throws(() => validate(evidence), /private or secret-shaped/u);
});
