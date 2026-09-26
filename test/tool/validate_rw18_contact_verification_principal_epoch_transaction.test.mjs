import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw18ContactVerificationPrincipalEpochTransaction,
} from '../../tool/validate_rw18_contact_verification_principal_epoch_transaction.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw18-contact-verification-principal-epoch-transaction-20260826.json',
    root,
  ),
  'utf8',
));

test('accepts the bounded RW18 contact and verification closure', () => {
  const result = validateRw18ContactVerificationPrincipalEpochTransaction({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 8);
  assert.equal(result.openActions, 0);
  assert.equal(result.focusedRw18Flutter, 'passed-17');
});

test('rejects 408 as a rejection or a granted live gate', () => {
  const broadened = evidence();
  broadened.definiteRejectionContracts.phoneConfirmation.push({
    status: 408,
    code: 'request_timeout',
  });
  assert.throws(
    () => validateRw18ContactVerificationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: broadened,
    }),
    /definite-rejection/u,
  );

  const granted = evidence();
  granted.gates.BUILD_READY = 'granted';
  assert.throws(
    () => validateRw18ContactVerificationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: granted,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects an uninventoried mutation call site or stale protected source', () => {
  const contactPath = 'lib/screens/contact_data_screen.dart';
  const contact = readFileSync(new URL(contactPath, root), 'utf8');
  assert.throws(
    () => validateRw18ContactVerificationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        [contactPath]: `${contact}\nvoid rw18Drift() { service.requestEmailChange(); }\n`,
      },
    }),
    /call-site inventory drifted/u,
  );

  const stale = evidence();
  stale.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateRw18ContactVerificationPrincipalEpochTransaction({
      repositoryRoot,
      evidence: stale,
    }),
    /source inventory hash is stale/u,
  );
});
