import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw12SecuritySuccessUiPrincipalEpoch,
} from '../../tool/validate_rw12_security_success_ui_principal_epoch.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw12-security-success-ui-principal-epoch-20260825.json',
    root,
  ),
  'utf8',
));

test('accepts the current bounded RW12 evidence state', () => {
  const result = validateRw12SecuritySuccessUiPrincipalEpoch({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 4);
  assert.equal(result.focusedRw12Flutter, 'passed-12');
  assert.equal(result.residualRisks, 4);
});

test('rejects treating stored malformed bytes as definite absence', () => {
  const value = evidence();
  value.stateModel.notSuccessEligible = value.stateModel.notSuccessEligible
    .filter((entry) => entry !== 'session-key-present-malformed-or-opaque');
  assert.throws(
    () => validateRw12SecuritySuccessUiPrincipalEpoch({
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
    () => validateRw12SecuritySuccessUiPrincipalEpoch({
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
    () => validateRw12SecuritySuccessUiPrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects stale protected source inventory', () => {
  assert.throws(
    () => validateRw12SecuritySuccessUiPrincipalEpoch({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        'lib/screens/security_screen.dart': '// drift\n',
      },
    }),
    /source inventory hash is stale/u,
  );
});
