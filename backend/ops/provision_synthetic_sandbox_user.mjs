#!/usr/bin/env node

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const syntheticSandboxUser = Object.freeze({
  id: 'synthetic_sandbox_user_pilot_20260919',
  email: 'synthetic_sandbox_user_pilot_20260919@example.invalid',
  role: 'user',
  accountStatus: 'active',
  marker: 'sit_technical_sandbox_pilot_v1',
});

export const stagingDatabaseIdentity = Object.freeze({
  environment: 'staging',
  databaseName: 'shareittoo_staging',
  databaseUser: 'shareittoo_staging',
  composeProject: 'sit-staging',
});

export const greenDatabaseIdentity = Object.freeze({
  environment: 'staging',
  databaseName: 'shareittoo_green',
  databaseUser: 'shareittoo_green',
  composeProject: 'sit-green',
});

export const greenRehearsalDatabaseIdentity = Object.freeze({
  environment: 'staging', databaseName: 'green_rehearsal', databaseUser: 'green_rehearsal', composeProject: 'sit-green', rehearsal: true,
});

const minimumPasswordLength = 32;
const maximumPasswordLength = 200;
const runtimeUid = 100;
const runtimeGid = 101;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeEmailHash() {
  return sha256(syntheticSandboxUser.email);
}

function readPasswordFile(filePath, { expectedUid = runtimeUid, expectedGid = runtimeGid } = {}) {
  if (typeof filePath !== 'string' || !filePath.startsWith('/')) fail('password_file_path_invalid');
  let descriptor;
  try {
    const link = lstatSync(filePath);
    if (!link.isFile() || link.isSymbolicLink()
        || (link.mode & 0o777) !== 0o600
        || link.uid !== expectedUid || link.gid !== expectedGid
        || link.size < minimumPasswordLength || link.size > maximumPasswordLength + 1) {
      fail('password_file_must_be_0600_runtime_owned');
    }
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600
        || metadata.uid !== expectedUid || metadata.gid !== expectedGid
        || metadata.size < minimumPasswordLength || metadata.size > maximumPasswordLength + 1) {
      fail('password_file_must_be_0600_runtime_owned');
    }
    const password = readFileSync(descriptor, 'utf8').trim();
    if (password.length < minimumPasswordLength || password.length > maximumPasswordLength
        || /\s/u.test(password) || !/[A-Za-z]/u.test(password) || !/[0-9]/u.test(password)) {
      fail('password_file_content_invalid');
    }
    return password;
  } catch (error) {
    if (String(error?.code ?? '').startsWith('password_file_')) throw error;
    if (error?.code === 'ELOOP') fail('password_file_symlink_forbidden');
    fail('password_file_unreadable');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function validateProvisioningContext({
  deploymentEnvironment,
  databaseIdentity,
} = {}) {
  const environment = String(deploymentEnvironment ?? '').trim().toLowerCase();
  if (environment === 'staging') {
    const isStaging = databaseIdentity?.environment === stagingDatabaseIdentity.environment
      && databaseIdentity.databaseName === stagingDatabaseIdentity.databaseName
      && databaseIdentity.databaseUser === stagingDatabaseIdentity.databaseUser
      && databaseIdentity.composeProject === stagingDatabaseIdentity.composeProject;
    const isGreen = databaseIdentity?.environment === greenDatabaseIdentity.environment
      && databaseIdentity.databaseName === greenDatabaseIdentity.databaseName
      && databaseIdentity.databaseUser === greenDatabaseIdentity.databaseUser
      && databaseIdentity.composeProject === greenDatabaseIdentity.composeProject;
    const isGreenRehearsal = databaseIdentity?.rehearsal === true
      && databaseIdentity.environment === greenRehearsalDatabaseIdentity.environment
      && databaseIdentity.databaseName === greenRehearsalDatabaseIdentity.databaseName
      && databaseIdentity.databaseUser === greenRehearsalDatabaseIdentity.databaseUser
      && databaseIdentity.composeProject === greenRehearsalDatabaseIdentity.composeProject;
    if (!isStaging && !isGreen && !isGreenRehearsal) {
      fail('staging_database_identity_required');
    }
    return Object.freeze(isGreenRehearsal ? greenRehearsalDatabaseIdentity : isGreen ? greenDatabaseIdentity : stagingDatabaseIdentity);
  }
  if (environment === 'test' && databaseIdentity?.injected === true
      && typeof databaseIdentity.databaseName === 'string'
      && typeof databaseIdentity.databaseUser === 'string') {
    return Object.freeze({
      environment: 'test',
      databaseName: databaseIdentity.databaseName,
      databaseUser: databaseIdentity.databaseUser,
      composeProject: databaseIdentity.composeProject ?? 'injected-test',
      injected: true,
    });
  }
  fail('staging_environment_required');
}

function parseDatabaseIdentity(databaseUrl, environment, composeProject, rehearsal = false) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail('database_url_invalid');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  const databaseUser = decodeURIComponent(parsed.username);
  return {
    environment,
    databaseName,
    databaseUser,
    composeProject,
    rehearsal,
  };
}

function profileForSyntheticUser() {
  return {
    displayName: 'Synthetic Sandbox Pilot User',
    syntheticOnly: true,
    syntheticMarker: syntheticSandboxUser.marker,
    syntheticPurpose: 'technical_sandbox_only',
    emailVerified: true,
    phoneVerified: false,
    isVerified: false,
    isBanned: false,
    role: syntheticSandboxUser.role,
    legalAcknowledgements: {
      terms: true,
      privacy: true,
      minimumAge: true,
      privateUse: true,
    },
  };
}

function isExactSyntheticRow(row) {
  let profile;
  try {
    profile = typeof row?.profile === 'string' ? JSON.parse(row.profile) : row?.profile;
  } catch {
    return false;
  }
  return row?.id === syntheticSandboxUser.id
    && row?.email === syntheticSandboxUser.email
    && row?.role === syntheticSandboxUser.role
    && profile?.syntheticOnly === true
    && profile?.syntheticMarker === syntheticSandboxUser.marker
    && profile?.syntheticPurpose === 'technical_sandbox_only';
}

async function assertDatabaseIdentity(client, identity) {
  const result = await client.query(
    'SELECT current_database() AS database_name, current_user AS database_user',
  );
  const row = result.rows?.[0];
  if (row?.database_name !== identity.databaseName || row?.database_user !== identity.databaseUser) {
    fail('database_identity_readback_mismatch');
  }
}

export async function provisionSyntheticSandboxUser({
  deploymentEnvironment,
  databaseIdentity,
  passwordFile,
  PoolClass,
  databaseUrl,
  hashPasswordFn,
  expectedUid = runtimeUid,
  expectedGid = runtimeGid,
} = {}) {
  const identity = validateProvisioningContext({ deploymentEnvironment, databaseIdentity });
  if (typeof PoolClass !== 'function') fail('postgres_pool_required');
  let password = readPasswordFile(passwordFile, { expectedUid, expectedGid });
  const hasher = hashPasswordFn ?? (await import('../src/security.js')).hashPassword;
  const passwordHash = await hasher(password);
  password = '';
  const pool = new PoolClass({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await assertDatabaseIdentity(client, identity);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [syntheticSandboxUser.id]);
      const existing = await client.query(
        `SELECT id, email, profile, role, account_status
           FROM users
          WHERE id = $1
          FOR UPDATE`,
        [syntheticSandboxUser.id],
      );
      if (existing.rows.length > 0 && !isExactSyntheticRow(existing.rows[0])) {
        fail('synthetic_user_id_collision');
      }
      if (existing.rows.length === 0) {
        const emailCollision = await client.query(
          'SELECT id, email FROM users WHERE email = $1 FOR UPDATE',
          [syntheticSandboxUser.email],
        );
        if (emailCollision.rows.length > 0) fail('synthetic_user_email_collision');
      }
      const profile = profileForSyntheticUser();
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO users (
             id, email, password_hash, profile, role, account_status,
             email_verified_at, terms_accepted_at, privacy_accepted_at,
             minimum_age_confirmed_at, private_use_confirmed_at
           ) VALUES ($1, $2, $3, $4::jsonb, 'user', 'active',
                     now(), now(), now(), now(), now())`,
          [syntheticSandboxUser.id, syntheticSandboxUser.email, passwordHash, JSON.stringify(profile)],
        );
      } else {
        await client.query(
          `UPDATE users
              SET password_hash = $2,
                  profile = $3::jsonb,
                  role = 'user',
                  account_status = 'active',
                  deactivated_at = NULL,
                  email_verified_at = now(),
                  terms_accepted_at = now(),
                  privacy_accepted_at = now(),
                  minimum_age_confirmed_at = now(),
                  private_use_confirmed_at = now(),
                  password_changed_at = now(),
                  updated_at = now()
            WHERE id = $1`,
          [syntheticSandboxUser.id, passwordHash, JSON.stringify(profile)],
        );
      }
      const revoked = await client.query(
        `UPDATE auth_sessions
            SET revoked_at = COALESCE(revoked_at, now()),
                revoked_reason = COALESCE(revoked_reason, 'synthetic_sandbox_reprovisioned')
          WHERE user_id = $1 AND revoked_at IS NULL
          RETURNING id`,
        [syntheticSandboxUser.id],
      );
      const readback = await client.query(
        `SELECT id, email, role, account_status,
                profile->>'syntheticMarker' AS synthetic_marker,
                password_hash IS NOT NULL AS has_password,
                email_verified_at IS NOT NULL AS email_verified,
                terms_accepted_at IS NOT NULL AS terms_accepted,
                privacy_accepted_at IS NOT NULL AS privacy_accepted,
                minimum_age_confirmed_at IS NOT NULL AS minimum_age_confirmed,
                private_use_confirmed_at IS NOT NULL AS private_use_confirmed
           FROM users WHERE id = $1`,
        [syntheticSandboxUser.id],
      );
      const row = readback.rows?.[0];
      if (row?.id !== syntheticSandboxUser.id
          || row.email !== syntheticSandboxUser.email
          || row.role !== 'user'
          || row.account_status !== 'active'
          || row.synthetic_marker !== syntheticSandboxUser.marker
          || row.has_password !== true
          || row.email_verified !== true
          || row.terms_accepted !== true
          || row.privacy_accepted !== true
          || row.minimum_age_confirmed !== true
          || row.private_use_confirmed !== true) {
        fail('synthetic_user_readback_mismatch');
      }
      await client.query('COMMIT');
      return Object.freeze({
        status: existing.rows.length === 0 ? 'created' : 'reprovisioned',
        userId: syntheticSandboxUser.id,
        emailSha256: safeEmailHash(),
        syntheticMarker: syntheticSandboxUser.marker,
        revokedSessionCount: revoked.rowCount ?? 0,
        readback: Object.freeze({
          role: row.role,
          accountStatus: row.account_status,
          hasPassword: row.has_password,
          acknowledgements: Object.freeze({
            emailVerified: row.email_verified,
            terms: row.terms_accepted,
            privacy: row.privacy_accepted,
            minimumAge: row.minimum_age_confirmed,
            privateUse: row.private_use_confirmed,
          }),
        }),
      });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const environment = process.env.DEPLOYMENT_ENVIRONMENT ?? '';
  if (environment.trim().toLowerCase() !== 'staging') fail('staging_environment_required');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) fail('database_url_required');
  const identity = parseDatabaseIdentity(
    databaseUrl,
    'staging',
    process.env.SIT_STAGING_COMPOSE_PROJECT?.trim(),
    process.env.SIT_GREEN_REHEARSAL === '1',
  );
  const passwordFile = process.env.SYNTHETIC_SANDBOX_PASSWORD_FILE?.trim();
  if (!passwordFile) fail('password_file_required');
  const { Pool } = await import('pg');
  const result = await provisionSyntheticSandboxUser({
    deploymentEnvironment: environment,
    databaseIdentity: identity,
    passwordFile,
    PoolClass: Pool,
    databaseUrl,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? 'synthetic_sandbox_provisioning_failed'}\n`);
    process.exitCode = 1;
  });
}
