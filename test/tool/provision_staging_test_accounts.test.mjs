import assert from 'node:assert/strict';
import { readFileSync, renameSync, statSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildSyntheticAlias,
  provisionSyntheticAccounts,
  recordSyntheticAccountVerification,
  stagingRegistrationPayload,
  verifyEmailLinkedSyntheticAccounts,
} from '../../tool/provision_staging_test_accounts.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

const fixedNow = new Date('2026-08-10T09:30:00.000Z');
const syntheticCredential = ['not', 'a', 'real', 'password'].join('-');

function deterministicRandom(size) {
  return Buffer.alloc(size, size);
}

test('builds distinct role aliases without retaining an existing plus tag', () => {
  assert.equal(
    buildSyntheticAlias('Walid+old@example.com', '20260810t093000z-04040404', 'owner'),
    'walid+sit-20260810t093000z-04040404-owner@example.com',
  );
  assert.throws(
    () => buildSyntheticAlias('not-an-email', '20260810t093000z-04040404', 'owner'),
    /invalid format/,
  );
  assert.throws(
    () => buildSyntheticAlias('walid@example.com', '20260810t093000z-04040404', 'admin'),
    /role is invalid/,
  );
});

test('binds synthetic registration to every private-pilot declaration', () => {
  assert.deepEqual(
    stagingRegistrationPayload({
      email: 'owner@example.com',
      password: syntheticCredential,
      displayName: 'SIT Test Vermieter',
    }),
    {
      email: 'owner@example.com',
      password: syntheticCredential,
      displayName: 'SIT Test Vermieter',
      termsAccepted: true,
      privacyAccepted: true,
      minimumAgeConfirmed: true,
      privateUseConfirmed: true,
    },
  );
});

test('provisions two accepted accounts into an owner-only vault and returns no credentials', async () => {
  const vaultRoot = tempFixtures.makeSync('sit-staging-account-test-');
  const registrations = [];
  const summary = await provisionSyntheticAccounts({
    baseEmail: 'walid@example.com',
    vaultRoot,
    now: fixedNow,
    random: deterministicRandom,
    register: async (account) => {
      registrations.push(structuredClone(account));
      return { accepted: true, status: 202 };
    },
  });

  assert.equal(summary.status, 'registration-accepted-pending-verification');
  assert.equal(summary.vaultReady, true);
  assert.equal(summary.containsSecrets, false);
  assert.equal(summary.containsEmailAddresses, false);
  assert.equal(JSON.stringify(summary).includes('walid@example.com'), false);
  assert.equal(registrations.length, 2);
  assert.deepEqual(registrations.map((entry) => entry.role), ['owner', 'renter']);
  assert.notEqual(registrations[0].email, registrations[1].email);
  assert.equal(registrations.every((entry) => entry.password.length >= 32), true);

  const vaultPath = resolve(vaultRoot, summary.runId, 'accounts.json');
  const vault = JSON.parse(readFileSync(vaultPath, 'utf8'));
  assert.equal(statSync(vaultPath).mode & 0o077, 0);
  assert.equal(statSync(resolve(vaultRoot, summary.runId)).mode & 0o077, 0);
  assert.equal(vault.status, summary.status);
  assert.deepEqual(vault.accounts.map((entry) => entry.registrationStatus), ['accepted', 'accepted']);
  assert.equal(vault.accounts.every((entry) => entry.verificationStatus === 'pending'), true);
  assert.equal(vault.stripeLivemode, false);
  assert.equal(vault.containsProductionCredentials, false);
});

test('keeps recoverable private state and emits a role-only error after partial registration', async () => {
  const vaultRoot = tempFixtures.makeSync('sit-staging-account-partial-');
  let call = 0;
  await assert.rejects(
    provisionSyntheticAccounts({
      baseEmail: 'walid@example.com',
      vaultRoot,
      now: fixedNow,
      random: deterministicRandom,
      register: async () => {
        call += 1;
        return call === 1 ? { accepted: true, status: 202 } : { accepted: false, status: 429 };
      },
    }),
    (error) => {
      assert.match(error.message, /renter role/);
      assert.equal(error.message.includes('walid@example.com'), false);
      return true;
    },
  );

  const runId = '20260810t093000z-04040404';
  const vaultPath = resolve(vaultRoot, runId, 'accounts.json');
  const vault = JSON.parse(readFileSync(vaultPath, 'utf8'));
  assert.equal(statSync(vaultPath).mode & 0o077, 0);
  assert.equal(vault.status, 'registration-partial');
  assert.deepEqual(
    vault.accounts.map((entry) => entry.registrationStatus),
    ['accepted', 'rejected-http-429'],
  );
});

test('refuses a vault inside the repository before registering accounts', async () => {
  await assert.rejects(
    provisionSyntheticAccounts({
      baseEmail: 'walid@example.com',
      vaultRoot: resolve(process.cwd(), 'build', 'unsafe-account-vault'),
      now: fixedNow,
      random: deterministicRandom,
      register: async () => ({ accepted: true, status: 202 }),
    }),
    /must remain outside the repository/,
  );
});

test('records fixture verification without exposing the private accounts', async () => {
  const vaultRoot = tempFixtures.makeSync('sit-staging-account-verified-');
  const provisioned = await provisionSyntheticAccounts({
    baseEmail: 'walid@example.com',
    vaultRoot,
    now: fixedNow,
    random: deterministicRandom,
    register: async () => ({ accepted: true, status: 202 }),
  });
  const summary = recordSyntheticAccountVerification({
    runId: provisioned.runId,
    vaultRoot,
    verifiedAt: new Date('2026-08-10T09:35:00.000Z'),
  });
  assert.equal(summary.status, 'fixture-verified-ready-for-login');
  assert.equal(summary.containsSecrets, false);
  assert.equal(summary.containsEmailAddresses, false);
  assert.equal(JSON.stringify(summary).includes('walid@example.com'), false);
  assert.deepEqual(
    summary.roles.map((entry) => entry.verificationStatus),
    ['fixture-verified', 'fixture-verified'],
  );
  const vault = JSON.parse(readFileSync(
    resolve(vaultRoot, provisioned.runId, 'accounts.json'),
    'utf8',
  ));
  assert.equal(vault.verificationMethod, 'isolated-staging-fixture');
  assert.equal(vault.accounts.every((entry) => entry.verifiedAt === '2026-08-10T09:35:00.000Z'), true);
});

test('promotes e-mail verification only after both roles are server-verified', async () => {
  const vaultRoot = tempFixtures.makeSync('sit-staging-account-email-link-');
  const provisioned = await provisionSyntheticAccounts({
    baseEmail: 'walid@example.com',
    vaultRoot,
    now: fixedNow,
    random: deterministicRandom,
    register: async () => ({ accepted: true, status: 202 }),
  });
  const calls = [];
  const verified = await verifyEmailLinkedSyntheticAccounts({
    runId: provisioned.runId,
    vaultRoot,
    verifiedAt: new Date('2026-08-10T09:35:00.000Z'),
    verify: async (account) => {
      calls.push(account.role);
      return { verified: true, status: 200 };
    },
  });
  assert.equal(verified.status, 'email-link-verified-ready-for-login');
  assert.equal(verified.serverVerified, true);
  assert.equal(verified.verificationSessionsCleaned, true);
  assert.deepEqual(calls, ['owner', 'renter']);
  assert.equal(JSON.stringify(verified).includes('walid@example.com'), false);
  const vault = JSON.parse(readFileSync(
    resolve(vaultRoot, provisioned.runId, 'accounts.json'),
    'utf8',
  ));
  assert.equal(vault.verificationMethod, 'email-link');
  assert.equal(vault.accounts.every((entry) => entry.verificationStatus === 'email-link-verified'), true);
});

test('proves each verified principal and revokes the short-lived verification session', async () => {
  const vaultRoot = tempFixtures.makeSync('sit-staging-account-server-verification-');
  const provisioned = await provisionSyntheticAccounts({
    baseEmail: 'walid@example.com',
    vaultRoot,
    now: fixedNow,
    random: deterministicRandom,
    register: async () => ({ accepted: true, status: 202 }),
  });
  const calls = [];
  let activeEmail = null;
  const verified = await verifyEmailLinkedSyntheticAccounts({
    runId: provisioned.runId,
    vaultRoot,
    verifiedAt: new Date('2026-08-10T09:35:00.000Z'),
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/api/v1', '');
      calls.push(path);
      if (path === '/auth/login') {
        activeEmail = JSON.parse(options.body).email;
        return new Response(JSON.stringify({
          accessToken: 'a'.repeat(24),
          refreshToken: 'r'.repeat(24),
        }), { status: 200 });
      }
      if (path === '/auth/me') return new Response(JSON.stringify({ user: { email: activeEmail } }), { status: 200 });
      if (path === '/auth/logout') return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(verified.serverVerified, true);
  assert.equal(verified.verificationSessionsCleaned, true);
  assert.deepEqual(calls, [
    '/auth/login', '/auth/me', '/auth/logout',
    '/auth/login', '/auth/me', '/auth/logout',
  ]);
});

test('does not promote either role when a server verification is incomplete', async () => {
  const vaultRoot = tempFixtures.makeSync('sit-staging-account-email-link-refusal-');
  const provisioned = await provisionSyntheticAccounts({
    baseEmail: 'walid@example.com',
    vaultRoot,
    now: fixedNow,
    random: deterministicRandom,
    register: async () => ({ accepted: true, status: 202 }),
  });
  let calls = 0;
  await assert.rejects(
    verifyEmailLinkedSyntheticAccounts({
      runId: provisioned.runId,
      vaultRoot,
      verify: async () => ({ verified: ++calls === 1, status: calls === 1 ? 200 : 403 }),
    }),
    /renter role/,
  );
  const vault = JSON.parse(readFileSync(
    resolve(vaultRoot, provisioned.runId, 'accounts.json'),
    'utf8',
  ));
  assert.equal(vault.status, 'registration-accepted-pending-verification');
  assert.equal(vault.accounts.every((entry) => entry.verificationStatus === 'pending'), true);
});

test('refuses a symlinked private vault before any server verification request', async () => {
  const vaultRoot = tempFixtures.makeSync('sit-staging-account-symlink-');
  const provisioned = await provisionSyntheticAccounts({
    baseEmail: 'walid@example.com',
    vaultRoot,
    now: fixedNow,
    random: deterministicRandom,
    register: async () => ({ accepted: true, status: 202 }),
  });
  const vaultPath = resolve(vaultRoot, provisioned.runId, 'accounts.json');
  const retainedPath = resolve(vaultRoot, provisioned.runId, 'retained-accounts.json');
  renameSync(vaultPath, retainedPath);
  symlinkSync(retainedPath, vaultPath);
  let calls = 0;
  await assert.rejects(
    verifyEmailLinkedSyntheticAccounts({
      runId: provisioned.runId,
      vaultRoot,
      verify: async () => {
        calls += 1;
        return { verified: true, status: 200 };
      },
    }),
    /must be a non-empty owner-only file/,
  );
  assert.equal(calls, 0);
});
