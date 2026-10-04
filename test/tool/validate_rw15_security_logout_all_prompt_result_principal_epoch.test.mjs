import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw15SecurityLogoutAllPromptResultPrincipalEpoch,
} from '../../tool/validate_rw15_security_logout_all_prompt_result_principal_epoch.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw15-security-interaction-owner-route-invariant-20260825.json',
    root,
  ),
  'utf8',
));

test('accepts the bounded RW15 invariant and completed follow-up inventory', () => {
  const result = validateRw15SecurityLogoutAllPromptResultPrincipalEpoch({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 4);
  assert.equal(result.openActions, 0);
  assert.equal(result.focusedRw15Flutter, 'passed-5');
});

test('rejects classifying a timeout as a definite rejection', () => {
  const value = evidence();
  value.definiteRejectionContract.alwaysUnknownExamples[0] =
    '408:definite-rejection';
  assert.throws(
    () => validateRw15SecurityLogoutAllPromptResultPrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /exact rejection contract/u,
  );
});

test('rejects an uninventoried security call site or a granted gate', () => {
  const profilePath = 'lib/screens/profile_screen.dart';
  const profile = readFileSync(new URL(profilePath, root), 'utf8');
  assert.throws(
    () => validateRw15SecurityLogoutAllPromptResultPrincipalEpoch({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        [profilePath]: `${profile}\nvoid rw15Drift() { AuthService.requestEmailChange(); }\n`,
      },
    }),
    /call-site inventory drifted/u,
  );

  const value = evidence();
  value.gates.BUILD_READY = 'granted';
  assert.throws(
    () => validateRw15SecurityLogoutAllPromptResultPrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /gate or boundary truth/u,
  );
});
