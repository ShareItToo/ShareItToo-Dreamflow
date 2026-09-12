import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw13SecurityLogoutAllOutcomePrincipalEpoch,
} from '../../tool/validate_rw13_security_logout_all_outcome_principal_epoch.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw13-security-logout-all-outcome-principal-epoch-20260825.json',
    root,
  ),
  'utf8',
));

test('accepts the current bounded RW13 evidence state', () => {
  const result = validateRw13SecurityLogoutAllOutcomePrincipalEpoch({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 4);
  assert.equal(result.focusedRw13Flutter, 'passed-12');
  assert.equal(result.residualRisks, 4);
});

test('rejects collapsing unknown logout into a definite rejection', () => {
  const value = evidence();
  value.stateModel.outcomeUnknown = 'allowlisted-structured-4xx-only';
  assert.throws(
    () => validateRw13SecurityLogoutAllOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /fail-closed state model/u,
  );
});

test('rejects a live auth scope expansion', () => {
  const value = evidence();
  value.scope.liveAuthTrafficAllowed = true;
  assert.throws(
    () => validateRw13SecurityLogoutAllOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /scope or deterministic-test policy/u,
  );
});

test('rejects a granted live gate', () => {
  const value = evidence();
  value.gates.PR7_MERGE_APPROVED = 'granted';
  assert.throws(
    () => validateRw13SecurityLogoutAllOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects stale protected source inventory', () => {
  assert.throws(
    () => validateRw13SecurityLogoutAllOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        'lib/screens/security_screen.dart': '// drift\n',
      },
    }),
    /source inventory hash is stale/u,
  );
});
