import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw9LocalAccountProfileAuthorizationDurability,
} from '../../tool/validate_rw9_local_account_profile_authorization_durability.mjs';

const root = new URL('../../', import.meta.url);
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw9-local-account-profile-authorization-durability-20260825.json',
    root,
  ),
  'utf8',
));
const repositoryRoot = new URL('.', root).pathname;

test('accepts exact-candidate RW9 regression and CodeQL closure', () => {
  const result = validateRw9LocalAccountProfileAuthorizationDurability({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.status, 'verified-regression-and-codeql-passed');
  assert.equal(result.resolvedFindings, 10);
});

test('rejects a protected field scope expansion', () => {
  const value = evidence();
  value.scope.allowed.push('caller-mutable-email');
  assert.throws(
    () => validateRw9LocalAccountProfileAuthorizationDurability({
      repositoryRoot,
      evidence: value,
    }),
    /scope or deterministic-test policy/u,
  );
});

test('rejects a granted live gate', () => {
  const value = evidence();
  value.gates.BUILD_READY = 'granted';
  assert.throws(
    () => validateRw9LocalAccountProfileAuthorizationDurability({
      repositoryRoot,
      evidence: value,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects source drift', () => {
  assert.throws(
    () => validateRw9LocalAccountProfileAuthorizationDurability({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {'lib/services/data_service.dart': '// drift\n'},
    }),
    /source inventory hash is stale: lib\/services\/data_service\.dart/u,
  );
});

test('rejects full-regression claims without an exact head', () => {
  const value = evidence();
  value.status = 'implemented-full-technical-regression-passed-ci-pending';
  value.implementationHead = null;
  value.localRegression = null;
  value.githubVerification = null;
  value.verification.githubRegression = 'pending';
  value.verification.githubCodeql = 'pending';
  assert.throws(
    () => validateRw9LocalAccountProfileAuthorizationDurability({
      repositoryRoot,
      evidence: value,
    }),
    /full-regression evidence is invalid/u,
  );
});
