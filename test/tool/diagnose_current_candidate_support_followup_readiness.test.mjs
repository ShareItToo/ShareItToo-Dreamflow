import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWp48SupportReadinessEvidence,
  inspectCurrentCandidateSupportApi,
  parseWp48Arguments,
} from '../../tool/diagnose_current_candidate_support_followup_readiness.mjs';

const owner = { role: 'owner', email: 'owner.invalid', password: 'owner-secret' };
const renter = { role: 'renter', email: 'renter.invalid', password: 'renter-secret' };
const targetId = '00000000-0000-4000-8000-000000000001';

function response(status, value = null) {
  return {
    status,
    async json() {
      if (value === null) throw new Error('no body');
      return value;
    },
  };
}

function apiFetch({ ownerAdmin = 403, renterDetail = 404, logout = 204 } = {}) {
  const sessions = new Map();
  let loginCount = 0;
  return async (url, options = {}) => {
    const path = new URL(url).pathname.replace(/^\/api\/v1/u, '');
    if (path === '/auth/login') {
      const body = JSON.parse(options.body);
      const role = body.email === owner.email ? 'owner' : 'renter';
      loginCount += 1;
      sessions.set(`${role}-access`, role);
      return response(200, {
        accessToken: `${role}-access-token-value-that-is-long`,
        refreshToken: `${role}-refresh-token-value-that-is-long`,
      });
    }
    if (path === '/auth/logout') return response(logout);
    const token = options.headers?.authorization?.replace('Bearer ', '');
    const role = token?.startsWith('owner-') ? 'owner' : 'renter';
    if (path === '/auth/me') return response(200, { user: { role: 'user' } });
    if (path === '/admin/support/cases') {
      return response(role === 'owner' ? ownerAdmin : 403, { error: 'forbidden' });
    }
    if (path === '/support/cases') {
      return response(200, {
        supportCases: role === 'owner' ? [{
          id: targetId,
          caseType: 'general_help',
          caseSubType: 'app_error_or_display',
          operatingMode: 'simulation',
        }] : [],
      });
    }
    if (path === `/support/cases/${targetId}` && role === 'owner') {
      return response(200, {
        supportCase: {
          id: targetId,
          caseType: 'general_help',
          caseSubType: 'app_error_or_display',
          operatingMode: 'simulation',
          status: 'received',
          nextUpdateAt: '2026-09-01T00:00:00.000Z',
        },
        events: [{}],
        messages: [],
      });
    }
    if (path === `/support/cases/${targetId}` && role === 'renter') {
      return response(renterDetail, { error: 'support_case_not_found' });
    }
    throw new Error(`unexpected mock route after ${loginCount} logins: ${path}`);
  };
}

test('accepts exact retained-case read, renter isolation and staff denial', async () => {
  const result = await inspectCurrentCandidateSupportApi({
    accounts: [owner, renter],
    fetchImpl: apiFetch(),
    now: new Date('2026-09-07T00:00:00.000Z'),
  });
  assert.equal(result.exactRetainedSimulationCaseCount, 1);
  assert.equal(result.nextUpdateOverdue, true);
  assert.equal(result.publicMessageCount, 0);
  assert.equal(result.renterDirectRead, '404-support_case_not_found');
  assert.equal(result.authorizedStaffIdentityAvailable, false);
  assert.equal(result.diagnosticSessionsRevoked, true);
});

test('rejects accidental admin access rather than treating it as staff readiness', async () => {
  await assert.rejects(
    inspectCurrentCandidateSupportApi({
      accounts: [owner, renter],
      fetchImpl: apiFetch({ ownerAdmin: 200 }),
      now: new Date('2026-09-07T00:00:00.000Z'),
    }),
    /owner support authorization surface/u,
  );
});

test('rejects cross-account support detail disclosure', async () => {
  await assert.rejects(
    inspectCurrentCandidateSupportApi({
      accounts: [owner, renter],
      fetchImpl: apiFetch({ renterDetail: 200 }),
      now: new Date('2026-09-07T00:00:00.000Z'),
    }),
    /renter support isolation/u,
  );
});

test('session cleanup failure remains a failure', async () => {
  await assert.rejects(
    inspectCurrentCandidateSupportApi({
      accounts: [owner, renter],
      fetchImpl: apiFetch({ logout: 500 }),
      now: new Date('2026-09-07T00:00:00.000Z'),
    }),
    /session cleanup failed/u,
  );
});

function evidence() {
  return {
    candidate: {
      applicationId: 'com.shareittoo.app',
      versionName: '1.0.0',
      buildNumber: '2026090610',
      commit: '2fd793bac970866aa94a2940f28d6bbc3e04e377',
      releaseChannel: 'internal',
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      android: { apkSha256: 'a'.repeat(64) },
    },
    device: {
      platform: 'android',
      physical: true,
      manufacturer: 'Google',
      model: 'Pixel 7 Pro',
      osVersion: '17',
      apiLevel: 37,
      securityPatch: '2026-07-05',
      containsRawDeviceIdentifier: false,
    },
    sourceDrift: { mobileSourceChanged: false },
    api: {
      exactRetainedSimulationCaseCount: 1,
      status: 'received',
      eventCount: 1,
      publicMessageCount: 0,
      nextUpdateOverdue: true,
      ownerBackendRole: 'user',
      renterBackendRole: 'user',
      renterCaseCount: 0,
      renterDirectRead: '404-support_case_not_found',
      ownerAdminRead: '403-forbidden',
      renterAdminRead: '403-forbidden',
      authorizedStaffIdentityAvailable: false,
      staffMutationAttempted: false,
      diagnosticSessionsRevoked: true,
    },
    pixel: {
      supportListLoaded: true,
      exactOwnedCaseCardCount: 1,
      supportDetailLoaded: true,
      receivedStatusVisible: true,
      simulationDisclosureVisible: true,
      timelineVisible: true,
      publicMessageSectionAbsent: true,
      errorSurfaceAbsent: true,
    },
    capturedAt: '2026-09-07T00:00:00.000Z',
  };
}

test('builds sanitized fail-closed WP48 evidence', () => {
  const result = buildWp48SupportReadinessEvidence(evidence());
  assert.equal(result.status, 'passed-current-candidate-read-staff-action-blocked-no-mutation');
  assert.equal(result.nextAction.gate, 'authorized-elevated-staff-identity-required');
  assert.equal(result.boundaries.supportCaseChanged, false);
  assert.equal(result.boundaries.containsCaseIdentity, false);
});

test('rejects a staff mutation or a non-overdue substituted case', () => {
  const staffMutation = evidence();
  staffMutation.api.staffMutationAttempted = true;
  assert.throws(
    () => buildWp48SupportReadinessEvidence(staffMutation),
    /incomplete or contradictory/u,
  );
  const substituted = evidence();
  substituted.api.nextUpdateOverdue = false;
  assert.throws(
    () => buildWp48SupportReadinessEvidence(substituted),
    /incomplete or contradictory/u,
  );
});

test('requires explicit candidate archive and owner-only vault arguments', () => {
  assert.deepEqual(parseWp48Arguments([
    '--candidate-dir', '/private/candidate',
    '--vault', '/private/vault.json',
    '--adb', '/private/adb',
  ]), {
    candidateDirectory: '/private/candidate',
    vaultFile: '/private/vault.json',
    adbPath: '/private/adb',
  });
  assert.throws(() => parseWp48Arguments([]), /required/u);
  assert.throws(() => parseWp48Arguments(['--unknown']), /Unknown argument/u);
});
