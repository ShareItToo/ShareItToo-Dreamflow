import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertWp134Candidate,
  assertWp134ExecutionGate,
  buildWp134Evidence,
  sanitizeWp134Failure,
  wp134BackendRuntimeHead,
  wp134Candidate,
  wp134ExpectedStagingRuntimeImage,
} from '../../tool/run_wp134_current_candidate_staging_support_lifecycle.mjs';

const candidate = {
  ...wp134Candidate,
  buildNumber: wp134Candidate.versionCode,
  commit: wp134Candidate.sourceCommit,
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  privacyScan: 'passed',
  stagingRuntimeImage: wp134ExpectedStagingRuntimeImage,
};

function input() {
  return {
    candidate,
    bootstrap: {
      environment: 'staging',
      simulationOnly: true,
      createdAccountCount: 3,
      roles: ['user', 'admin', 'admin'],
    },
    support: {
      caseCreated: true,
      caseOperatingMode: 'simulation',
      draftCreated: true,
      independentAdminReviewApproved: true,
      progressPublished: true,
      recipientReadbackVisible: true,
      publishedExternalMessageSent: false,
      futureDeadlineConfirmed: true,
    },
    cleanup: {
      decommissionedAccountCount: 3,
      credentialsRevoked: true,
      privateVaultDeleted: true,
    },
    sourceInventory: {
      a: 'a'.repeat(64),
      b: 'b'.repeat(64),
      c: 'c'.repeat(64),
    },
  };
}

test('WP134 remains exact-current candidate and immutable Staging runtime bound', () => {
  assert.equal(assertWp134ExecutionGate('1'), true);
  assert.throws(() => assertWp134ExecutionGate(undefined), /SIT_WP134/u);
  assert.equal(wp134BackendRuntimeHead.length, 40);
  assert.equal(assertWp134Candidate(candidate), candidate);
  assert.throws(
    () => assertWp134Candidate({ ...candidate, versionCode: '2026091310' }),
    /versionCode/u,
  );
});

test('WP134 accepts only the complete isolated lifecycle and cleanup truth', () => {
  const evidence = buildWp134Evidence(input());
  assert.equal(evidence.status, 'passed-exact-current-candidate-staging-support-lifecycle');
  assert.equal(evidence.portfolioEffect.state, 'PASS');
  assert.deepEqual(evidence.portfolioEffect.totals, { pass: 18, partial: 6, open: 8 });
  const external = input();
  external.support.publishedExternalMessageSent = true;
  assert.throws(() => buildWp134Evidence(external), /incomplete or contradictory/u);
  const cleanup = input();
  cleanup.cleanup.privateVaultDeleted = false;
  assert.throws(() => buildWp134Evidence(cleanup), /incomplete or contradictory/u);
});

test('WP134 redacts identities, credentials and private paths from failures', () => {
  const sanitized = sanitizeWp134Failure(
    new Error('user@example.com Bearer abcdefghijklmnopqrstuvwxyz123456 /Users/person/private'),
  );
  assert.doesNotMatch(sanitized, /user@example|abcdefghijklmnopqrstuvwxyz|\/Users\/person/u);
});
