import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw16SessionTransitionPrincipalEpoch,
} from '../../tool/validate_rw16_session_transition_principal_epoch.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw16-session-transition-principal-epoch-20260826.json',
    root,
  ),
  'utf8',
));

test('accepts the bounded RW16 transition closure and completed follow-up inventory', () => {
  const result = validateRw16SessionTransitionPrincipalEpoch({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 5);
  assert.equal(result.openActions, 0);
  assert.equal(result.focusedRw16Flutter, 'passed-9');
});

test('rejects reopening a guarded RW16 transition or granting a gate', () => {
  const value = evidence();
  value.securityActionInventory[3].status = 'open-p0';
  assert.throws(
    () => validateRw16SessionTransitionPrincipalEpoch({
      repositoryRoot,
      evidence: value,
    }),
    /security-action inventory/u,
  );

  const granted = evidence();
  granted.gates.BUILD_READY = 'granted';
  assert.throws(
    () => validateRw16SessionTransitionPrincipalEpoch({
      repositoryRoot,
      evidence: granted,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects a new uninventoried session clear call site or stale source', () => {
  const profilePath = 'lib/screens/profile_screen.dart';
  const profile = readFileSync(new URL(profilePath, root), 'utf8');
  assert.throws(
    () => validateRw16SessionTransitionPrincipalEpoch({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        [profilePath]: `${profile}\nvoid rw16Drift() { AuthService.clearSession(); }\n`,
      },
    }),
    /call-site inventory drifted/u,
  );

  const stale = evidence();
  stale.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateRw16SessionTransitionPrincipalEpoch({
      repositoryRoot,
      evidence: stale,
    }),
    /source inventory hash is stale/u,
  );
});
