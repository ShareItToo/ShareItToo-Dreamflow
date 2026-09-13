import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateWp134 } from '../../tool/validate_wp134_current_candidate_staging_support.mjs';

function fixtures() {
  const evidence = structuredClone(validateWp134());
  const pointer = JSON.parse(readFileSync(
    new URL('../../store/google-play/current-rollover-candidate.json', import.meta.url),
    'utf8',
  ));
  return { evidence, pointer };
}

test('accepts exact current-candidate support lifecycle evidence', () => {
  const evidence = validateWp134();
  assert.equal(evidence.portfolioEffect.state, 'PASS');
});

test('rejects external delivery, incomplete cleanup or portfolio overclaim', () => {
  const { evidence, pointer } = fixtures();
  evidence.support.externalMessageSent = true;
  assert.throws(
    () => validateWp134({ evidence, pointer, verifyInventory: false, verifyAncestry: false }),
    /external message/u,
  );
  const cleanup = fixtures();
  cleanup.evidence.cleanup.privateVaultDeleted = false;
  assert.throws(
    () => validateWp134({ ...cleanup, verifyInventory: false, verifyAncestry: false }),
    /vault cleanup/u,
  );
  const totals = fixtures();
  totals.evidence.portfolioEffect.totals.pass = 19;
  assert.throws(
    () => validateWp134({ ...totals, verifyInventory: false, verifyAncestry: false }),
    /totals/u,
  );
});

test('rejects candidate, runtime and pointer drift', () => {
  const candidate = fixtures();
  candidate.evidence.candidate.versionCode = '2026091310';
  assert.throws(
    () => validateWp134({ ...candidate, verifyInventory: false, verifyAncestry: false }),
    /version code/u,
  );
  const runtime = fixtures();
  runtime.evidence.staging.runtimeImage = 'ghcr.io/shareittoo/shareittoo-api:0000000000000000000000000000000000000000';
  assert.throws(
    () => validateWp134({ ...runtime, verifyInventory: false, verifyAncestry: false }),
    /runtime image/u,
  );
  const pointer = fixtures();
  pointer.pointer.evidenceRef = 'stale.json';
  assert.throws(
    () => validateWp134({ ...pointer, verifyInventory: false, verifyAncestry: false }),
    /evidence pointer/u,
  );
});
