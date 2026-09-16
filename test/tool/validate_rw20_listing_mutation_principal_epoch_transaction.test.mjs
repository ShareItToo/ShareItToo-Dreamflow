import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw20ListingMutationPrincipalEpochTransaction,
} from '../../tool/validate_rw20_listing_mutation_principal_epoch_transaction.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw20-listing-mutation-principal-epoch-transaction-20260826.json',
    root,
  ),
  'utf8',
));

test('accepts the bounded RW20 listing mutation closure', () => {
  const result = validateRw20ListingMutationPrincipalEpochTransaction({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 8);
  assert.equal(result.openActions, 0);
  assert.equal(result.focusedRw20Flutter, 'passed-13');
});

test('rejects 408 as a rejection or a granted external gate', () => {
  const broadened = evidence();
  broadened.definiteRejectionContracts.listingMutation[408] = [
    'request_timeout',
  ];
  assert.throws(
    () => validateRw20ListingMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: broadened,
    }),
    /definite-rejection/u,
  );

  const granted = evidence();
  granted.gates.BUILD_READY = 'granted';
  assert.throws(
    () => validateRw20ListingMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: granted,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects a direct screen listing write or stale protected source', () => {
  const screenPath = 'lib/screens/create_listing_screen.dart';
  const screen = readFileSync(new URL(screenPath, root), 'utf8');
  assert.throws(
    () => validateRw20ListingMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        [screenPath]: `${screen}\nvoid rw20Drift() { DataService.addItem(); }\n`,
      },
    }),
    /call-site inventory drifted/u,
  );

  const stale = evidence();
  stale.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateRw20ListingMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: stale,
    }),
    /source inventory hash is stale/u,
  );
});
