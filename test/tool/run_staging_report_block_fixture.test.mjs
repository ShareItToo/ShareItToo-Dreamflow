import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  cleanupStagingReportBlockFixture,
  exactPublicRunSearchListingsVisible,
  exactPublicSearchListingVisible,
  inspectStagingReportBlockFixture,
  markStagingReportBlockPixelRestored,
} from '../../tool/run_staging_report_block_fixture.mjs';

const apiBaseUrl = 'https://staging.shareittoo.com/api/v1';

test('accepts only one exact id-and-title result for an exact-title search', () => {
  const expected = { id: 'listing-1', title: 'SIT Meldung wp132-run' };
  assert.equal(exactPublicSearchListingVisible({ listings: [expected] }, expected), true);
  assert.equal(exactPublicSearchListingVisible({
    listings: [expected, { id: 'listing-2', title: expected.title }],
  }, expected), false);
  assert.equal(exactPublicSearchListingVisible({
    listings: [{ id: expected.id, title: 'SIT Sichtbarkeit wp132-run' }],
  }, expected), false);
});

test('accepts only the exact pair for the unique-run public search', () => {
  const expected = [
    { id: 'listing-1', title: 'SIT Meldung wp132-run' },
    { id: 'listing-2', title: 'SIT Sichtbarkeit wp132-run' },
  ];
  assert.equal(exactPublicRunSearchListingsVisible({ listings: expected }, expected), true);
  assert.equal(exactPublicRunSearchListingsVisible({ listings: [expected[0]] }, expected), false);
  assert.equal(exactPublicRunSearchListingsVisible({
    listings: [expected[0], { ...expected[1], title: 'Andere Anzeige' }],
  }, expected), false);
});

function response(status, value = null) {
  return { status, text: async () => (value === null ? '' : JSON.stringify(value)) };
}

function syntheticPassword(role) {
  return [role, 'password', '132'].join('-');
}

function privateState(status = 'ready-for-pixel') {
  const root = mkdtempSync(join(tmpdir(), 'sit-wp132-'));
  chmodSync(root, 0o700);
  const journeyVaultFile = join(root, 'accounts.json');
  const journalFile = join(root, 'journal.json');
  const accounts = [
    {
      role: 'owner',
      displayName: 'WP132 Owner',
      email: 'owner-wp132@example.test',
      password: syntheticPassword('owner'),
      registrationStatus: 'accepted',
      verificationStatus: 'email-link-verified',
    },
    {
      role: 'renter',
      displayName: 'WP132 Renter',
      email: 'renter-wp132@example.test',
      password: syntheticPassword('renter'),
      registrationStatus: 'accepted',
      verificationStatus: 'email-link-verified',
    },
  ];
  writeFileSync(journeyVaultFile, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    runId: 'wp132-run',
    status: 'non-binding-simulation-retired',
    apiBaseUrl,
    stripeLivemode: false,
    verificationMethod: 'email-link',
    accounts,
    nonBindingSimulation: {
      status: 'retired',
      workflowStatus: 'cancelled',
      listingStatus: 'paused',
      paymentEndpointCalled: false,
      stripeLivemode: false,
    },
  }, null, 2)}\n`, { mode: 0o600 });
  const journal = {
    schemaVersion: 1,
    kind: 'sit-wp132-staging-report-block-journal',
    status,
    apiBaseUrl,
    stripeLivemode: false,
    paymentEndpointCalled: false,
    journeyVaultFile,
    runId: 'wp132-run',
    ownerUserId: 'owner-user',
    renterUserId: 'renter-user',
    targetListing: { id: 'target-listing', title: 'SIT Meldung wp132-run' },
    companionListing: { id: 'companion-listing', title: 'SIT Sichtbarkeit wp132-run' },
    messageListingId: 'message-listing',
    messageThreadId: 'message-thread',
    recoveryRequired: true,
    ...(['cleanup-server-confirmed-session-revocation-pending',
      'cleanup-server-confirmed-recovery-required'].includes(status)
      ? {
          cleanup: {
            exactListingsEnded: 3,
            exactListingsAbsentFromPublicCatalog: 3,
            exactBlockCount: 0,
            retainedModerationReportCount: 1,
            sessionRevocation: { owner: true, renter: false },
            exactRoleSessionsRevoked: false,
            protectedOwnerSessionRestored: false,
          },
        }
      : {}),
  };
  writeFileSync(journalFile, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
  return { journalFile, accounts };
}

function inspectionApi({ blocked, threadVisible }) {
  return async (url, options = {}) => {
    const path = String(url).slice(apiBaseUrl.length);
    if (path === '/auth/login') {
      const body = JSON.parse(options.body);
      const owner = body.email.startsWith('owner-');
      return response(200, {
        accessToken: owner ? 'owner-access-token-value' : 'renter-access-token-value',
        sessionId: owner ? 'owner-session' : 'renter-session',
        user: { id: owner ? 'owner-user' : 'renter-user' },
      });
    }
    if (path === '/user-blocks') {
      return response(200, { blocks: blocked ? [{ userId: 'owner-user' }] : [] });
    }
    if (path === '/reports/mine') {
      return response(200, {
        reports: [{
          targetType: 'listing',
          targetId: 'target-listing',
          reasonCode: 'fraud_or_deception',
          status: 'open',
        }],
      });
    }
    if (path === '/message-threads') {
      return response(200, {
        threads: threadVisible ? [{ id: 'message-thread' }] : [],
      });
    }
    if (path === '/listings?sort=newest&limit=100') {
      return response(200, {
        listings: [{ id: 'target-listing' }, { id: 'companion-listing' }],
      });
    }
    throw new Error(`Unexpected path ${path}`);
  };
}

test('requires exact report, block and thread isolation for blocked truth', async () => {
  const fixture = privateState();
  const result = await inspectStagingReportBlockFixture({
    journalFile: fixture.journalFile,
    expectedPhase: 'blocked',
    fetchImpl: inspectionApi({ blocked: true, threadVisible: false }),
  });
  assert.deepEqual(result, {
    status: 'blocked-server-confirmed',
    exactTargetReportCount: 1,
    exactTargetBlockCount: 1,
    exactThreadVisible: false,
    publicSameOwnerListingCount: 2,
    containsSecrets: false,
    containsAccountIdentifiers: false,
    containsFixtureIdentifiers: false,
  });
  const journal = JSON.parse(readFileSync(fixture.journalFile, 'utf8'));
  assert.equal(journal.status, 'blocked-server-confirmed');
});

test('rejects a blocked observation while the exact thread remains visible', async () => {
  const fixture = privateState();
  await assert.rejects(
    () => inspectStagingReportBlockFixture({
      journalFile: fixture.journalFile,
      expectedPhase: 'blocked',
      fetchImpl: inspectionApi({ blocked: true, threadVisible: true }),
    }),
    /block or message isolation/u,
  );
  assert.equal(JSON.parse(readFileSync(fixture.journalFile, 'utf8')).status, 'ready-for-pixel');
});

test('requires server-confirmed empty block truth after unblock', async () => {
  const fixture = privateState('blocked-server-confirmed');
  const result = await inspectStagingReportBlockFixture({
    journalFile: fixture.journalFile,
    expectedPhase: 'unblocked',
    fetchImpl: inspectionApi({ blocked: false, threadVisible: false }),
  });
  assert.equal(result.status, 'unblocked-server-confirmed');
  assert.equal(result.exactTargetBlockCount, 0);
});

test('marks terminal restoration only after server cleanup requires it', () => {
  const fixture = privateState('cleanup-server-confirmed-recovery-required');
  const result = markStagingReportBlockPixelRestored({ journalFile: fixture.journalFile });
  assert.equal(result.status, 'complete-restored');
  assert.equal(result.recoveryRequired, false);
  const journal = JSON.parse(readFileSync(fixture.journalFile, 'utf8'));
  assert.equal(journal.cleanup.protectedOwnerSessionRestored, true);
  assert.equal(journal.recoveryRequired, false);
});

test('resumes only the unfinished role-session revocation after a rate limit', async () => {
  const fixture = privateState('cleanup-server-confirmed-session-revocation-pending');
  const loginEmails = [];
  const result = await cleanupStagingReportBlockFixture({
    journalFile: fixture.journalFile,
    fetchImpl: async (url, options = {}) => {
      const path = String(url).slice(apiBaseUrl.length);
      if (path === '/auth/login') {
        const body = JSON.parse(options.body);
        loginEmails.push(body.email);
        return response(200, {
          accessToken: 'renter-access-token-value',
          sessionId: 'renter-session',
          user: { id: 'renter-user' },
        });
      }
      if (path === '/auth/logout-all') return response(204);
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(result.status, 'cleanup-server-confirmed-recovery-required');
  assert.equal(result.exactRoleSessionsRevoked, true);
  assert.deepEqual(loginEmails, ['renter-wp132@example.test']);
  const journal = JSON.parse(readFileSync(fixture.journalFile, 'utf8'));
  assert.deepEqual(journal.cleanup.sessionRevocation, { owner: true, renter: true });
});

test('re-authenticates and retries an uncertain idempotent session revocation', async () => {
  const fixture = privateState('cleanup-server-confirmed-session-revocation-pending');
  const loginEmails = [];
  let revocationAttempts = 0;
  const result = await cleanupStagingReportBlockFixture({
    journalFile: fixture.journalFile,
    wait: async () => {},
    fetchImpl: async (url, options = {}) => {
      const path = String(url).slice(apiBaseUrl.length);
      if (path === '/auth/login') {
        const body = JSON.parse(options.body);
        loginEmails.push(body.email);
        return response(200, {
          accessToken: `renter-access-token-${loginEmails.length}`,
          sessionId: `renter-session-${loginEmails.length}`,
          user: { id: 'renter-user' },
        });
      }
      if (path === '/auth/logout-all') {
        revocationAttempts += 1;
        if (revocationAttempts === 1) throw new Error('uncertain transport result');
        return response(204);
      }
      throw new Error(`Unexpected path ${path}`);
    },
  });
  assert.equal(result.status, 'cleanup-server-confirmed-recovery-required');
  assert.equal(revocationAttempts, 2);
  assert.deepEqual(loginEmails, [
    'renter-wp132@example.test',
    'renter-wp132@example.test',
  ]);
  const journal = JSON.parse(readFileSync(fixture.journalFile, 'utf8'));
  assert.deepEqual(journal.cleanup.sessionRevocation, { owner: true, renter: true });
});
