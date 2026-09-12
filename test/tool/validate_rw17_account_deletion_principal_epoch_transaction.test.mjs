import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw17AccountDeletionPrincipalEpochTransaction,
} from '../../tool/validate_rw17_account_deletion_principal_epoch_transaction.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw17-account-deletion-principal-epoch-transaction-20260826.json',
    root,
  ),
  'utf8',
));

test('accepts the bounded RW17 deletion closure and completed follow-up inventory', () => {
  const result = validateRw17AccountDeletionPrincipalEpochTransaction({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 6);
  assert.equal(result.openActions, 0);
  assert.equal(result.focusedRw17Flutter, 'passed-13');
});

test('rejects broad rejection semantics or a granted live gate', () => {
  const broadened = evidence();
  broadened.definiteRejectionContracts.push({
    status: 408,
    code: 'request_timeout',
  });
  assert.throws(
    () => validateRw17AccountDeletionPrincipalEpochTransaction({
      repositoryRoot,
      evidence: broadened,
    }),
    /definite-rejection/u,
  );

  const granted = evidence();
  granted.gates.BUILD_READY = 'granted';
  assert.throws(
    () => validateRw17AccountDeletionPrincipalEpochTransaction({
      repositoryRoot,
      evidence: granted,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects a new uninventoried deletion call site or stale source', () => {
  const accountPath = 'lib/screens/account_settings_screen.dart';
  const account = readFileSync(new URL(accountPath, root), 'utf8');
  assert.throws(
    () => validateRw17AccountDeletionPrincipalEpochTransaction({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        [accountPath]: `${account}\nvoid rw17Drift() { _accountDeletionService.deleteAccount(); }\n`,
      },
    }),
    /call-site inventory drifted/u,
  );

  const stale = evidence();
  stale.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateRw17AccountDeletionPrincipalEpochTransaction({
      repositoryRoot,
      evidence: stale,
    }),
    /source inventory hash is stale/u,
  );
});
