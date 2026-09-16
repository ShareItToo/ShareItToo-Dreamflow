import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw14SecurityRemoteDeviceRevocationOutcomePrincipalEpoch,
} from '../../tool/validate_rw14_security_remote_device_revocation_outcome_principal_epoch.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw14-security-remote-device-revocation-outcome-principal-epoch-20260825.json',
    root,
  ),
  'utf8',
));

test('accepts the current bounded RW14 evidence state', () => {
  const result = validateRw14SecurityRemoteDeviceRevocationOutcomePrincipalEpoch({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 4);
  assert.equal(result.focusedRw14Flutter, 'passed-11');
  assert.equal(result.residualRisks, 4);
});

test('rejects collapsing unknown revocation into definite rejection', () => {
  const value = evidence();
  value.stateModel.outcomeUnknown = 'allowlisted-structured-4xx-only';
  assert.throws(
    () => validateRw14SecurityRemoteDeviceRevocationOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /fail-closed state model/u,
  );
});

test('rejects a false empty-list cache state', () => {
  const value = evidence();
  value.stateModel.cacheAfterTypedFailure = 'server-confirmed-empty';
  assert.throws(
    () => validateRw14SecurityRemoteDeviceRevocationOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /fail-closed state model/u,
  );
});

test('rejects a granted live gate', () => {
  const value = evidence();
  value.gates.PR7_MERGE_APPROVED = 'granted';
  assert.throws(
    () => validateRw14SecurityRemoteDeviceRevocationOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects stale protected source inventory', () => {
  assert.throws(
    () => validateRw14SecurityRemoteDeviceRevocationOutcomePrincipalEpoch({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        'lib/screens/security_screen.dart': '// drift\n',
      },
    }),
    /source inventory hash is stale/u,
  );
});
