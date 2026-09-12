import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw19ProfileLocationMutationPrincipalEpochTransaction,
} from '../../tool/validate_rw19_profile_location_mutation_principal_epoch_transaction.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw19-profile-location-mutation-principal-epoch-transaction-20260826.json',
    root,
  ),
  'utf8',
));

test('accepts the bounded RW19 profile and location closure', () => {
  const result = validateRw19ProfileLocationMutationPrincipalEpochTransaction({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 8);
  assert.equal(result.openActions, 0);
  assert.equal(result.focusedRw19Flutter, 'passed-9');
});

test('rejects 408 as a rejection or a granted external gate', () => {
  const broadened = evidence();
  broadened.definiteRejectionContracts.profileMutation.push({
    status: 408,
    code: 'request_timeout',
  });
  assert.throws(
    () => validateRw19ProfileLocationMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: broadened,
    }),
    /definite-rejection/u,
  );

  const granted = evidence();
  granted.gates.BUILD_READY = 'granted';
  assert.throws(
    () => validateRw19ProfileLocationMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: granted,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects a direct screen mutation call site or stale protected source', () => {
  const screenPath = 'lib/screens/change_address_screen.dart';
  const screen = readFileSync(new URL(screenPath, root), 'utf8');
  assert.throws(
    () => validateRw19ProfileLocationMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        [screenPath]: `${screen}\nvoid rw19Drift() { DataService.updateCurrentUserProfile(); }\n`,
      },
    }),
    /call-site inventory drifted/u,
  );

  const stale = evidence();
  stale.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateRw19ProfileLocationMutationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: stale,
    }),
    /source inventory hash is stale/u,
  );
});
