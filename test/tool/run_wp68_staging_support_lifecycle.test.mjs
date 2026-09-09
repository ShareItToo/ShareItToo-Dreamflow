import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertWp68ExecutionGate,
  assertWp68StagingRuntimeImage,
  buildWp68Evidence,
  buildWp68PrivateVault,
  parseWp68Arguments,
  wp68ExecutionGate,
  wp68ExpectedStagingRuntimeImage,
} from '../../tool/run_wp68_staging_support_lifecycle.mjs';

const candidate = {
  applicationId: 'com.shareittoo.app',
  versionCode: '2026090904',
  apkSha256: '8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4',
  stagingRuntimeImage: 'shareittoo-api:78c663248aec089b08d19fd0fb40a9a63f19408b',
};

function completeEvidenceInput() {
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
  };
}

test('WP68 refuses every execution target except exact Staging and the dedicated gate', () => {
  assert.deepEqual(assertWp68ExecutionGate({ gate: '1' }), {
    environment: 'staging',
    operatingMode: 'simulation',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    sshHost: 'sit-staging-vps',
    production: false,
  });
  assert.throws(() => assertWp68ExecutionGate({ gate: undefined }), new RegExp(wp68ExecutionGate, 'u'));
  assert.throws(() => assertWp68ExecutionGate({ gate: '1', apiBaseUrl: 'https://shareittoo.com/api/v1' }), /base URL/u);
  assert.throws(() => assertWp68ExecutionGate({ gate: '1', sshHost: 'other-host' }), /SSH host/u);
  assert.equal(assertWp68StagingRuntimeImage(wp68ExpectedStagingRuntimeImage), wp68ExpectedStagingRuntimeImage);
  assert.throws(() => assertWp68StagingRuntimeImage('shareittoo-api:unexpected'), /runtime image/u);
});

test('WP68 private bootstrap identities have only temporary role shape and password hashes', async () => {
  const vault = await buildWp68PrivateVault({ now: new Date('2026-09-09T09:00:00.000Z') });
  assert.equal(vault.purpose, 'wp68_staging_support_simulation_only');
  assert.deepEqual(vault.accounts.map((account) => account.role), ['user', 'admin', 'admin']);
  assert.equal(new Set(vault.accounts.map((account) => account.id)).size, 3);
  assert.ok(vault.accounts.every((account) => account.email.endsWith('@staging.shareittoo.invalid')));
  assert.ok(vault.accounts.every((account) => account.passwordHash.startsWith('scrypt$')));
});

test('WP68 evidence rejects a production, external-message, incomplete-review or retained-credential claim', () => {
  const evidence = buildWp68Evidence(completeEvidenceInput());
  assert.equal(evidence.status, 'passed-simulation-only-temporary-roles-decommissioned');
  assert.equal(evidence.support.externalMessageSent, false);
  const review = completeEvidenceInput();
  review.support.independentAdminReviewApproved = false;
  assert.throws(() => buildWp68Evidence(review), /incomplete or contradictory/u);
  const message = completeEvidenceInput();
  message.support.publishedExternalMessageSent = true;
  assert.throws(() => buildWp68Evidence(message), /incomplete or contradictory/u);
  const cleanup = completeEvidenceInput();
  cleanup.cleanup.privateVaultDeleted = false;
  assert.throws(() => buildWp68Evidence(cleanup), /incomplete or contradictory/u);
});

test('WP68 command line defaults to plan-only and rejects unknown arguments', () => {
  assert.deepEqual(parseWp68Arguments([]), { execute: false, vaultPath: null });
  assert.deepEqual(parseWp68Arguments(['--execute', '--vault', '/tmp/ignored-in-test']), {
    execute: true,
    vaultPath: '/tmp/ignored-in-test',
  });
  assert.throws(() => parseWp68Arguments(['--production']), /Unknown argument/u);
});
