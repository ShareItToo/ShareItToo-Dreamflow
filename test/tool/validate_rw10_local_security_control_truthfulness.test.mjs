import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw10LocalSecurityControlTruthfulness,
} from '../../tool/validate_rw10_local_security_control_truthfulness.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw10-local-security-control-truthfulness-20260825.json',
    root,
  ),
  'utf8',
));

test('accepts the current bounded RW10 evidence state', () => {
  const result = validateRw10LocalSecurityControlTruthfulness({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 11);
  assert.equal(result.residualRisks, 4);
});

test('rejects a local security simulation scope expansion', () => {
  const value = evidence();
  value.scope.allowed.push('local-two-factor-demo');
  assert.throws(
    () => validateRw10LocalSecurityControlTruthfulness({
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
    () => validateRw10LocalSecurityControlTruthfulness({
      repositoryRoot,
      evidence: value,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects source drift', () => {
  assert.throws(
    () => validateRw10LocalSecurityControlTruthfulness({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {'lib/screens/security_screen.dart': '// drift\n'},
    }),
    /source inventory hash is stale: lib\/screens\/security_screen\.dart/u,
  );
});

test('rejects CI closure without exact candidate evidence', () => {
  const value = evidence();
  value.status = 'verified-regression-and-codeql-passed';
  value.implementationHead = null;
  value.localRegression = null;
  value.githubVerification = null;
  value.verification.fullTechnicalRegression = 'passed';
  value.verification.githubRegression = 'passed';
  value.verification.githubCodeql = 'passed-no-new-alerts';
  assert.throws(
    () => validateRw10LocalSecurityControlTruthfulness({
      repositoryRoot,
      evidence: value,
    }),
    /full-regression evidence is invalid/u,
  );
});
