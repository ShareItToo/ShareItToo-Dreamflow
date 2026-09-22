import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  provisionSyntheticSandboxUser,
  greenDatabaseIdentity,
  greenRehearsalDatabaseIdentity,
  greenTestDatabaseIdentity,
  greenTestRehearsalDatabaseIdentity,
  stagingDatabaseIdentity,
  syntheticSandboxUser,
  validateProvisioningContext,
} from '../ops/provision_synthetic_sandbox_user.mjs';

function passwordFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-synthetic-sandbox-user-'));
  const file = path.join(root, 'password');
  const password = randomBytes(48).toString('base64url');
  writeFileSync(file, `${password}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return { root, file, password, uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0 };
}

function fakeDatabase({ existing = null, emailCollision = null, sessions = 0 } = {}) {
  const state = {
    user: existing,
    emailCollision,
    activeSessions: sessions,
    writes: [],
    transaction: [],
  };
  const client = {
    async query(sql, params = []) {
      state.transaction.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT current_database()')) {
        return { rows: [{ database_name: 'sit_test', database_user: 'test' }], rowCount: 1 };
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM users') && sql.includes('WHERE id = $1')
          && !sql.includes("profile->>'syntheticMarker'")) {
        return { rows: state.user ? [state.user] : [], rowCount: state.user ? 1 : 0 };
      }
      if (sql.includes('FROM users') && sql.includes('WHERE email = $1')) {
        return { rows: state.emailCollision ? [state.emailCollision] : [], rowCount: state.emailCollision ? 1 : 0 };
      }
      if (sql.startsWith('INSERT INTO users')) {
        state.writes.push('users.insert');
        state.user = {
          id: params[0],
          email: params[1],
          role: 'user',
          account_status: 'active',
          profile: JSON.parse(params[3]),
        };
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE users')) {
        state.writes.push('users.update');
        state.user = {
          ...state.user,
          id: params[0],
          email: syntheticSandboxUser.email,
          role: 'user',
          account_status: 'active',
          profile: JSON.parse(params[2]),
        };
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE auth_sessions')) {
        state.writes.push('auth_sessions.revoke');
        const revoked = state.activeSessions;
        state.activeSessions = 0;
        return { rows: Array.from({ length: revoked }, () => ({ id: 'session' })), rowCount: revoked };
      }
      if (sql.includes("profile->>'syntheticMarker'")) {
        const profile = state.user?.profile ?? {};
        return {
          rows: state.user ? [{
            id: state.user.id,
            email: state.user.email,
            role: state.user.role,
            account_status: state.user.account_status,
            synthetic_marker: profile.syntheticMarker,
            has_password: true,
            email_verified: true,
            terms_accepted: true,
            privacy_accepted: true,
            minimum_age_confirmed: true,
            private_use_confirmed: true,
          }] : [],
          rowCount: state.user ? 1 : 0,
        };
      }
      throw new Error(`unexpected query ${sql}`);
    },
    release() {},
  };
  class FakePool {
    constructor() {}
    async connect() { return client; }
    async end() {}
  }
  return { state, PoolClass: FakePool };
}

function identity() {
  return {
    environment: 'test',
    injected: true,
    databaseName: 'sit_test',
    databaseUser: 'test',
    composeProject: 'focused-fixture',
  };
}

function options(files, database, overrides = {}) {
  return {
    deploymentEnvironment: 'test',
    databaseIdentity: identity(),
    passwordFile: files.file,
    PoolClass: database.PoolClass,
    databaseUrl: 'postgresql://test@127.0.0.1/sit_test',
    expectedUid: files.uid,
    expectedGid: files.gid,
    ...overrides,
  };
}

test('provisioning rejects production or unbound test databases before writes', () => {
  assert.throws(
    () => validateProvisioningContext({
      deploymentEnvironment: 'production',
      databaseIdentity: stagingDatabaseIdentity,
    }),
    (error) => error.code === 'staging_environment_required',
  );
  assert.throws(
    () => validateProvisioningContext({
      deploymentEnvironment: 'staging',
      databaseIdentity: { ...stagingDatabaseIdentity, databaseName: 'other' },
    }),
    (error) => error.code === 'staging_database_identity_required',
  );
  assert.equal(validateProvisioningContext({
    deploymentEnvironment: 'test',
    databaseIdentity: identity(),
  }).injected, true);
  assert.deepEqual(validateProvisioningContext({
    deploymentEnvironment: 'staging',
    databaseIdentity: greenDatabaseIdentity,
  }), greenDatabaseIdentity);
  assert.throws(() => validateProvisioningContext({
    deploymentEnvironment: 'staging',
    databaseIdentity: { ...greenDatabaseIdentity, composeProject: 'sit-green-lookalike' },
  }), (error) => error.code === 'staging_database_identity_required');
});

test('isolated Green rehearsal identity is explicit and cannot masquerade as canonical Green', () => {
  assert.deepEqual(validateProvisioningContext({ deploymentEnvironment: 'staging', databaseIdentity: greenRehearsalDatabaseIdentity }), greenRehearsalDatabaseIdentity);
  assert.throws(() => validateProvisioningContext({ deploymentEnvironment: 'staging', databaseIdentity: { ...greenRehearsalDatabaseIdentity, rehearsal: false } }), /staging_database_identity_required/u);
});

test('test runtime accepts only exact Green canonical and rehearsal identities', () => {
  assert.deepEqual(validateProvisioningContext({ deploymentEnvironment: 'test', databaseIdentity: greenTestDatabaseIdentity }), greenTestDatabaseIdentity);
  assert.deepEqual(validateProvisioningContext({ deploymentEnvironment: 'test', databaseIdentity: greenTestRehearsalDatabaseIdentity }), greenTestRehearsalDatabaseIdentity);
  for (const databaseIdentity of [
    { ...greenTestDatabaseIdentity, databaseName: 'shareittoo_staging' },
    { ...greenTestDatabaseIdentity, databaseUser: 'other' },
    { ...greenTestDatabaseIdentity, composeProject: 'sit-staging' },
    { ...greenTestDatabaseIdentity, databaseName: 'arbitrary_test_db' },
    { ...greenTestRehearsalDatabaseIdentity, rehearsal: false },
  ]) {
    assert.throws(() => validateProvisioningContext({ deploymentEnvironment: 'test', databaseIdentity }), /staging_environment_required/u);
  }
});

test('creates exact synthetic user, acknowledges required fields and never returns password material', async () => {
  const files = passwordFixture();
  const database = fakeDatabase();
  try {
    const result = await provisionSyntheticSandboxUser(options(files, database));
    assert.equal(result.status, 'created');
    assert.equal(result.userId, syntheticSandboxUser.id);
    assert.equal(result.emailSha256, createHash('sha256').update(syntheticSandboxUser.email).digest('hex'));
    assert.equal(result.readback.role, 'user');
    assert.equal(result.readback.accountStatus, 'active');
    assert.equal(result.readback.hasPassword, true);
    assert.deepEqual(result.readback.acknowledgements, {
      emailVerified: true,
      terms: true,
      privacy: true,
      minimumAge: true,
      privateUse: true,
    });
    assert.doesNotMatch(JSON.stringify(result), /SyntheticSandboxPilotPassword|synthetic-hash/u);
    assert.deepEqual(database.state.writes, ['users.insert', 'auth_sessions.revoke']);
    assert.equal(database.state.transaction.filter((sql) => /INSERT|UPDATE/u.test(sql)).some((sql) => /notifications|payments|bookings|listings/u.test(sql)), false);
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('reprovisioning is idempotent for the exact marker and revokes only that user sessions', async () => {
  const files = passwordFixture();
  const existing = {
    id: syntheticSandboxUser.id,
    email: syntheticSandboxUser.email,
    role: 'user',
    account_status: 'active',
    profile: {
      syntheticOnly: true,
      syntheticMarker: syntheticSandboxUser.marker,
      syntheticPurpose: 'technical_sandbox_only',
    },
  };
  const database = fakeDatabase({ existing, sessions: 2 });
  try {
    const result = await provisionSyntheticSandboxUser(options(files, database));
    assert.equal(result.status, 'reprovisioned');
    assert.equal(result.revokedSessionCount, 2);
    assert.deepEqual(database.state.writes, ['users.update', 'auth_sessions.revoke']);
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('foreign ID or email collisions fail closed and roll back without cross-user writes', async () => {
  const files = passwordFixture();
  try {
    for (const database of [
      fakeDatabase({ existing: {
        id: syntheticSandboxUser.id,
        email: 'foreign@example.invalid',
        role: 'user',
        account_status: 'active',
        profile: { syntheticOnly: false },
      } }),
      fakeDatabase({ emailCollision: { id: 'foreign-user', email: syntheticSandboxUser.email } }),
    ]) {
      await assert.rejects(
        provisionSyntheticSandboxUser(options(files, database)),
        (error) => ['synthetic_user_id_collision', 'synthetic_user_email_collision'].includes(error.code),
      );
      assert.deepEqual(database.state.writes, []);
      assert.equal(database.state.transaction.at(-1), 'ROLLBACK');
    }
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('password file must be regular 0600 runtime-owned input', async () => {
  const files = passwordFixture();
  try {
    chmodSync(files.file, 0o644);
    const database = fakeDatabase();
    await assert.rejects(
      provisionSyntheticSandboxUser(options(files, database)),
      (error) => error.code === 'password_file_must_be_0600_runtime_owned',
    );
    assert.deepEqual(database.state.writes, []);
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});
