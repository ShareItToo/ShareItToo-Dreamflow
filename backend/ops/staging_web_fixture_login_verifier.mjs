#!/usr/bin/env node
// Protected two-role Staging login proof. Default mode is read-only; execution
// uses only the canonical internal API and always reconciles its exact marker.
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { readStablePrivateFile, writeExclusivePrivateFile } from './stable_private_file.mjs';

export const fixtureLoginProofKind = 'sit-green-web-fixture-login-proof';
const root = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const self = 'backend/ops/staging_web_fixture_login_verifier.mjs';
const stableFile = 'backend/ops/stable_private_file.mjs';
const sourceFiles = Object.freeze([self, stableFile]);
const apiName = 'shareittoo-staging-api';
const dbName = 'sit-green-postgres-20260918011528-wp254';
const networkName = 'sit-green-network-20260918011528-wp254';
const envFile = '/docker/shareittoo/ops/green.env';
const inputRoot = '/run/sit-login-proof-input';
const codeRoot = '/run/sit-login-proof-code';
const uid = 100;
const gid = 101;
const ids = Object.freeze(['synthetic_web_catalog_owner_v1', 'synthetic_web_catalog_renter_v1']);
const credentialFieldName = ['pass', 'word'].join('');
const listingId = 'synthetic_web_catalog_listing_v1';
const uploadName = 'synthetic_web_catalog_placeholder_v1.webp';
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const scrypt = promisify(crypto.scrypt);
const cleanupQuietWindowMs = 5000;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const check = (value, code) => { if (!value) fail(code); };
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
export const fixtureLoginProofDigest = (value) => hash(JSON.stringify(canonical(value)));

export async function verifyFixtureLoginProofPassword(secret, encoded) {
  if (typeof secret !== 'string' || typeof encoded !== 'string') return false;
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/u.exec(encoded);
  if (!match) return false;
  const [, saltHex, hashHex] = match;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = Buffer.from(await scrypt(secret, Buffer.from(saltHex, 'hex'), expected.length));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function exact(value, keys, code) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), code);
}

function environmentOf(entries) {
  const result = {};
  for (const entry of entries ?? []) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/us.exec(String(entry));
    check(match && !Object.hasOwn(result, match[1]), 'fixture_login_proof_environment_invalid');
    result[match[1]] = match[2];
  }
  return result;
}

function parseEnvBytes(bytes) {
  const result = {};
  for (const line of bytes.toString().split(/\r?\n/u)) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    check(match && !Object.hasOwn(result, match[1]), 'fixture_login_proof_environment_invalid');
    result[match[1]] = match[2];
  }
  return result;
}

export function fixtureLoginProofFingerprint(record) {
  return fixtureLoginProofDigest({ Id: record.Id, Name: record.Name, Image: record.Image,
    Config: record.Config, HostConfig: record.HostConfig, Running: record.State?.Running,
    Mounts: [...(record.Mounts ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    Networks: record.NetworkSettings?.Networks, Ports: record.NetworkSettings?.Ports });
}

export function readFixtureLoginProofSource() {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  check(git('status', '--porcelain') === '', 'fixture_login_proof_source_dirty');
  return Object.freeze({ commit: git('rev-parse', 'HEAD'),
    hashes: Object.fromEntries(sourceFiles.map((file) => [file, hash(readFileSync(resolve(root, file))) ])) });
}

function validateSource(source) {
  exact(source, ['commit', 'hashes'], 'fixture_login_proof_source_invalid');
  check(commitPattern.test(source.commit ?? '')
    && JSON.stringify(Object.keys(source.hashes).sort()) === JSON.stringify([...sourceFiles].sort())
    && Object.values(source.hashes).every((value) => digestPattern.test(value)), 'fixture_login_proof_source_invalid');
  return source;
}

function assertExternalPath(filePath, code) {
  check(typeof filePath === 'string' && resolve(filePath) === filePath
    && filePath.startsWith('/docker/shareittoo/evidence/') && !filePath.includes(','), code);
}

function assertPrivateParent(filePath, { expectedUid = 0, expectedGid = 0 } = {}) {
  assertExternalPath(filePath, 'fixture_login_proof_output_path_invalid');
  const parentPath = dirname(filePath); const parent = lstatSync(parentPath);
  check(parent.isDirectory() && !parent.isSymbolicLink() && realpathSync(parentPath) === parentPath
    && parent.uid === expectedUid && parent.gid === expectedGid && (parent.mode & 0o777) === 0o700,
  'fixture_login_proof_output_parent_invalid');
}

function parseBootstrapBytes(manifestBytes, credentialsBytes) {
  let manifest; let credentials;
  try { manifest = JSON.parse(manifestBytes); credentials = JSON.parse(credentialsBytes); }
  catch { fail('fixture_login_proof_private_json_invalid'); }
  exact(credentials, ['kind', 'sourceCommit', 'runId', 'manifestSha256', 'accounts'],
    'fixture_login_proof_credentials_invalid');
  check(manifest?.kind === 'sit-dedicated-web-fixture-bootstrap' && manifest.schemaVersion === 1
    && manifest.operation === 'seed' && commitPattern.test(manifest.sourceCommit ?? '')
    && manifest.schemaCount === 98 && digestPattern.test(manifest.ledgerDigest ?? '')
    && credentials.kind === 'sit-private-dedicated-fixture-credentials'
    && credentials.sourceCommit === manifest.sourceCommit && credentials.runId === manifest.preflight?.runId
    && credentials.manifestSha256 === hash(manifestBytes)
    && /^web-fixture-[A-Za-z0-9-]{16,120}$/u.test(credentials.runId ?? '')
    && Array.isArray(manifest.passwordDigests) && manifest.passwordDigests.length === 2
    && manifest.passwordDigests.every((value) => digestPattern.test(value ?? ''))
    && manifest.preflight?.runtimeCommit && commitPattern.test(manifest.preflight.runtimeCommit)
    && manifest.preflight?.listingId === listingId && manifest.preflight?.uploadName === uploadName,
  'fixture_login_proof_bootstrap_invalid');
  const expectedRoles = ids.map((userId, index) => ({ role: index ? 'renter' : 'owner', userId,
    syntheticMarker: credentials.runId }));
  check(fixtureLoginProofDigest(manifest.preflight.roles) === fixtureLoginProofDigest(expectedRoles)
    && Array.isArray(credentials.accounts) && credentials.accounts.length === 2,
  'fixture_login_proof_bootstrap_scope_invalid');
  for (let index = 0; index < ids.length; index++) {
    const account = credentials.accounts[index];
    exact(account, ['id', 'email', credentialFieldName], 'fixture_login_proof_credentials_invalid');
    const secret = account[credentialFieldName];
    check(account.id === ids[index] && account.email === `${ids[index]}@example.invalid`
      && typeof secret === 'string' && secret.length >= 32 && secret.length <= 200
      && !/\s/u.test(secret) && /[A-Za-z]/u.test(secret) && /[0-9]/u.test(secret)
      && hash(secret) === manifest.passwordDigests[index], 'fixture_login_proof_credentials_invalid');
  }
  return Object.freeze({ manifest, credentials, manifestBytes, credentialsBytes });
}

export function readProtectedFixtureLoginInput(inputDirectory, {
  read = readStablePrivateFile, stat = lstatSync, realpath = realpathSync, checkParent = true,
} = {}) {
  if (checkParent) {
    assertExternalPath(inputDirectory, 'fixture_login_proof_input_path_invalid');
    const parent = stat(inputDirectory);
    check(parent.isDirectory() && !parent.isSymbolicLink() && realpath(inputDirectory) === inputDirectory
      && parent.uid === uid && parent.gid === gid && (parent.mode & 0o777) === 0o700,
    'fixture_login_proof_input_parent_invalid');
  } else check(inputDirectory === inputRoot, 'fixture_login_proof_input_path_invalid');
  const options = { encoding: null, expectedMode: 0o600, expectedUid: uid, expectedGid: gid,
    minBytes: 1, maxBytes: 256 * 1024, code: 'fixture_login_proof_input_metadata_invalid' };
  return parseBootstrapBytes(read(resolve(inputDirectory, 'adapter.json'), options),
    read(resolve(inputDirectory, 'credentials.json'), options));
}

export function validateFixtureLoginProofEnvironment(environment, manifest) {
  const allowed = String(environment.SIT_STAGING_ALLOWED_USER_IDS ?? '').split(',');
  let database;
  try { database = new URL(environment.DATABASE_URL); } catch { fail('fixture_login_proof_database_invalid'); }
  check(['test', 'staging'].includes(environment.DEPLOYMENT_ENVIRONMENT)
    && environment.APP_COMMIT === manifest.preflight.runtimeCommit
    && environment.SIT_STAGING_ACCESS_GATE_ENABLED === 'true'
    && allowed.length >= 2 && allowed[0] === ids[0] && allowed[1] === ids[1]
    && new Set(allowed).size === allowed.length
    && environment.SIT_STAGING_PUBLIC_LISTING_IDS === listingId
    && environment.SIT_STAGING_PUBLIC_UPLOAD_NAMES === uploadName
    && environment.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED === 'false'
    && environment.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED === 'false'
    && String(environment.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '') === ''
    && environment.PAYMENT_TRANSPORT === 'memory' && environment.STRIPE_LIVEMODE === 'false'
    && environment.MAIL_TRANSPORT === 'memory' && environment.PUSH_TRANSPORT === 'memory'
    && environment.IDENTITY_VERIFICATION_TRANSPORT === 'memory'
    && environment.SIT_LISTING_AI_PROVIDER === 'on_device'
    && environment.SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED === '0'
    && environment.SIT_LISTING_AI_BUDGET_CENTS === '0'
    && environment.TECHNICAL_SANDBOX_ENABLED === '0'
    && environment.TECHNICAL_SANDBOX_KILL_SWITCH === '1'
    && ['TECHNICAL_SANDBOX_ACCOUNT_ID', 'TECHNICAL_SANDBOX_USER_IDS',
      'TECHNICAL_SANDBOX_AUTHORIZATION_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT',
      'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE',
      'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE'].every((name) => String(environment[name] ?? '') === '')
    && ['postgres:', 'postgresql:'].includes(database.protocol) && database.hostname === dbName
    && database.hostname === manifest.preflight.database?.host
    && database.pathname.slice(1) === manifest.preflight.database?.name
    && decodeURIComponent(database.username) === manifest.preflight.database?.user,
  'fixture_login_proof_effect_boundary_invalid');
  return Object.freeze({ ...environment });
}

export function buildFixtureLoginProofBinding({ source, api, database, network, image, envBytes,
  inputDirectory, input, evidenceFile, now = new Date(), proofNonce = crypto.randomBytes(16).toString('hex'),
  io = {} }) {
  validateSource(source); (io.assertOutput ?? assertPrivateParent)(evidenceFile);
  check(!(io.outputStat ?? lstatOrNull)(evidenceFile), 'fixture_login_proof_evidence_exists');
  const match = /^ghcr\.io\/shareittoo\/shareittoo-api:([a-f0-9]{40})@(sha256:[a-f0-9]{64})$/u.exec(api.Config?.Image ?? '');
  check(match && /^[a-f0-9]{32}$/u.test(proofNonce), 'fixture_login_proof_runtime_invalid');
  const environment = validateRuntimeInventory({ api, database, network, image, envBytes, expected: null });
  validateFixtureLoginProofEnvironment(environment, input.manifest);
  const marker = loginProofMarker(input.manifest.preflight.runId, proofNonce);
  return validateFixtureLoginProofBinding({ kind: fixtureLoginProofKind, schemaVersion: 1,
    createdAt: now.toISOString(), opsCommit: source.commit, sourceHashes: source.hashes,
    runtimeCommit: match[1], imageDigest: match[2], apiId: api.Id,
    apiFingerprint: fixtureLoginProofFingerprint(api), databaseId: database.Id,
    databaseFingerprint: fixtureLoginProofFingerprint(database), networkId: network.Id,
    envSha256: hash(envBytes), inputDirectory, bootstrapManifestSha256: hash(input.manifestBytes),
    credentialsSha256: hash(input.credentialsBytes), bootstrapRunIdSha256: hash(input.manifest.preflight.runId),
    roleDigest: fixtureLoginProofDigest(input.manifest.preflight.roles), proofNonce,
    markerSha256: hash(marker), evidenceFile });
}

function lstatOrNull(filePath) {
  try { return lstatSync(filePath); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function validateFixtureLoginProofBinding(binding, source, now = Date.now()) {
  exact(binding, ['kind', 'schemaVersion', 'createdAt', 'opsCommit', 'sourceHashes', 'runtimeCommit',
    'imageDigest', 'apiId', 'apiFingerprint', 'databaseId', 'databaseFingerprint', 'networkId',
    'envSha256', 'inputDirectory', 'bootstrapManifestSha256', 'credentialsSha256',
    'bootstrapRunIdSha256', 'roleDigest', 'proofNonce', 'markerSha256', 'evidenceFile'],
  'fixture_login_proof_binding_invalid');
  check(binding.kind === fixtureLoginProofKind && binding.schemaVersion === 1
    && Number.isFinite(Date.parse(binding.createdAt)) && now - Date.parse(binding.createdAt) >= 0
    && now - Date.parse(binding.createdAt) <= 3600000
    && commitPattern.test(binding.opsCommit ?? '') && commitPattern.test(binding.runtimeCommit ?? '')
    && /^sha256:[a-f0-9]{64}$/u.test(binding.imageDigest ?? '')
    && ['apiId', 'apiFingerprint', 'databaseId', 'databaseFingerprint', 'networkId', 'envSha256',
      'bootstrapManifestSha256', 'credentialsSha256', 'bootstrapRunIdSha256', 'roleDigest', 'markerSha256']
      .every((key) => digestPattern.test(binding[key] ?? ''))
    && /^[a-f0-9]{32}$/u.test(binding.proofNonce ?? ''), 'fixture_login_proof_binding_invalid');
  validateSource({ commit: binding.opsCommit, hashes: binding.sourceHashes });
  if (source) check(binding.opsCommit === source.commit
    && fixtureLoginProofDigest(binding.sourceHashes) === fixtureLoginProofDigest(source.hashes),
  'fixture_login_proof_source_drift');
  assertExternalPath(binding.inputDirectory, 'fixture_login_proof_input_path_invalid');
  assertExternalPath(binding.evidenceFile, 'fixture_login_proof_evidence_path_invalid');
  return Object.freeze({ ...binding });
}

function validateRuntimeInventory({ binding, api, database, network, image, envBytes, expected }) {
  const reference = api.Config?.Image ?? '';
  const match = /^ghcr\.io\/shareittoo\/shareittoo-api:([a-f0-9]{40})@(sha256:[a-f0-9]{64})$/u.exec(reference);
  check(match && api.Name === `/${apiName}` && api.State?.Running === true && api.Config.User === 'shareittoo'
    && !Object.values(api.NetworkSettings?.Ports ?? {}).flat().some(Boolean)
    && database.Name === `/${dbName}` && database.State?.Running === true
    && !Object.values(database.NetworkSettings?.Ports ?? {}).flat().some(Boolean)
    && network.Name === networkName && network.Internal === true
    && api.NetworkSettings?.Networks?.[networkName]?.NetworkID === network.Id
    && database.NetworkSettings?.Networks?.[networkName]?.NetworkID === network.Id
    && image.Id === api.Image && image.Config?.Labels?.['org.opencontainers.image.revision'] === match[1]
    && image.Config?.User === 'shareittoo'
    && image.RepoDigests?.includes(`ghcr.io/shareittoo/shareittoo-api@${match[2]}`),
  'fixture_login_proof_runtime_invalid');
  if (binding) check(api.Id === binding.apiId && database.Id === binding.databaseId && network.Id === binding.networkId
    && match[1] === binding.runtimeCommit && match[2] === binding.imageDigest
    && fixtureLoginProofFingerprint(api) === binding.apiFingerprint
    && fixtureLoginProofFingerprint(database) === binding.databaseFingerprint
    && hash(envBytes) === binding.envSha256, 'fixture_login_proof_runtime_drift');
  const values = { ...environmentOf(image.Config?.Env), ...parseEnvBytes(envBytes) };
  const current = environmentOf(api.Config?.Env);
  check(fixtureLoginProofDigest(current) === fixtureLoginProofDigest(values),
    'fixture_login_proof_runtime_environment_drift');
  check(values.APP_COMMIT === match[1] && (!expected || values.APP_COMMIT === expected),
    'fixture_login_proof_runtime_environment_invalid');
  return values;
}

export function loginProofMarker(runId, proofNonce) {
  check(/^web-fixture-[A-Za-z0-9-]{16,120}$/u.test(runId ?? '') && /^[a-f0-9]{32}$/u.test(proofNonce ?? ''),
    'fixture_login_proof_marker_invalid');
  return `SIT-Staging-Login-Proof/${hash(`${runId}:${proofNonce}`).slice(0, 40)}`;
}

export function validateFixtureLoginProofConfirmation({ execute = false, source, input,
  confirmSource, confirmRun }) {
  check(execute === false
    ? confirmSource === undefined && confirmRun === undefined
    : execute === true && confirmSource === source.commit
      && confirmRun === input.manifest.preflight.runId,
  'fixture_login_proof_confirmation_required');
  return execute;
}

const forbiddenState = (state) => ({ bookings: state.bookings, requests: state.requests,
  identities: state.identities, pushDevices: state.pushDevices, paymentCommands: state.paymentCommands,
  identityProviderSessions: state.identityProviderSessions, technicalProviderRuns: state.technicalProviderRuns,
  notifications: state.notifications, notificationOutbox: state.notificationOutbox });

function assertPreflightState(state) {
  exact(state, ['users', 'seedAudits', 'mfaFactors', 'activeSessions', 'activeRefreshTokens',
    'markerSessions', 'markerActiveSessions', 'markerRefreshTokens', 'markerActiveRefreshTokens',
    'markerLoginAudits', 'identityDigest', 'catalogDigest',
    'bookings', 'requests', 'identities', 'pushDevices', 'paymentCommands', 'identityProviderSessions',
    'technicalProviderRuns', 'notifications', 'notificationOutbox'], 'fixture_login_proof_state_invalid');
  const counts = Object.entries(state).filter(([key]) => !['identityDigest', 'catalogDigest'].includes(key))
    .map(([, value]) => value);
  check(counts.every(Number.isInteger) && counts.every((value) => value >= 0)
    && digestPattern.test(state.identityDigest ?? '') && digestPattern.test(state.catalogDigest ?? '')
    && state.users === 2 && state.seedAudits === 1 && state.mfaFactors === 0
    && state.activeSessions === 0 && state.activeRefreshTokens === 0
    && state.markerSessions === 0 && state.markerActiveSessions === 0
    && state.markerRefreshTokens === 0 && state.markerActiveRefreshTokens === 0
    && state.markerLoginAudits === 0
    && Object.values(forbiddenState(state)).every((value) => value === 0),
  'fixture_login_proof_preflight_rejected');
}

function assertPostState(before, after) {
  check(after.users === 2 && after.seedAudits === 1 && after.mfaFactors === 0
    && after.activeSessions === 0 && after.activeRefreshTokens === 0
    && after.markerActiveSessions === 0 && after.markerActiveRefreshTokens === 0
    && after.identityDigest === before.identityDigest
    && after.catalogDigest === before.catalogDigest
    && fixtureLoginProofDigest(forbiddenState(after)) === fixtureLoginProofDigest(forbiddenState(before)),
  'fixture_login_proof_post_readback_invalid');
}

export function createFixtureLoginProofStore(client, { runId, marker }) {
  const attest = async (manifest) => {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      await client.query("SET LOCAL statement_timeout='5s'");
      const ledger = (await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
      const database = (await client.query('SELECT current_database() AS name,current_user AS "user"')).rows[0];
      check(ledger.length === manifest.schemaCount
        && fixtureLoginProofDigest(ledger) === manifest.ledgerDigest
        && database?.name === manifest.preflight.database.name
        && database?.user === manifest.preflight.database.user,
      'fixture_login_proof_database_drift');
      return Object.freeze({ schemaCount: ledger.length, ledgerDigest: fixtureLoginProofDigest(ledger) });
    } finally { await client.query('ROLLBACK'); }
  };
  const attestCredentials = async (credentials) => {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      await client.query("SET LOCAL statement_timeout='5s'");
      const rows = (await client.query(`SELECT account.id,account.email,account.password_hash,
        account.role,account.account_status,account.deactivated_at,account.profile,
        account.failed_login_attempts,account.login_locked_until,
        EXISTS (SELECT 1 FROM mfa_totp_factors AS factor
          WHERE factor.user_id=account.id AND factor.status='enabled') AS mfa_enabled
        FROM users AS account WHERE account.id=ANY($1::text[]) ORDER BY account.id`, [ids])).rows;
      check(rows.length === ids.length, 'fixture_login_proof_credential_attestation_failed');
      for (let index = 0; index < ids.length; index++) {
        const account = credentials.accounts[index];
        const row = rows.find((candidate) => candidate.id === ids[index]);
        check(row?.email === account.email && row.role === 'user' && row.account_status === 'active'
          && row.deactivated_at === null && row.profile?.syntheticOnly === true
          && row.failed_login_attempts === 0 && row.login_locked_until === null
          && row.mfa_enabled === false
          && await verifyFixtureLoginProofPassword(account[credentialFieldName], row.password_hash),
        'fixture_login_proof_credential_attestation_failed');
      }
      return Object.freeze({ credentialsAttested: ids.length });
    } finally { await client.query('ROLLBACK'); }
  };
  const snapshot = async ({ readOnly = false } = {}) => {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      await client.query("SET LOCAL statement_timeout='5s'");
      const row = (await client.query(`SELECT
        (SELECT count(*)::int FROM users WHERE id=ANY($1::text[]) AND role='user' AND account_status='active'
          AND deactivated_at IS NULL AND profile->>'syntheticOnly'='true') AS users,
        (SELECT count(*)::int FROM audit_log WHERE resource_type='staging_web_fixture_seed'
          AND resource_id=$2 AND request_id=$3 AND action='staging_web_fixture_seed.seeded') AS seed_audits,
        (SELECT count(*)::int FROM mfa_totp_factors WHERE user_id=ANY($1::text[]) AND status='enabled') AS mfa_factors,
        (SELECT count(*)::int FROM auth_sessions WHERE user_id=ANY($1::text[]) AND revoked_at IS NULL) AS active_sessions,
        (SELECT count(*)::int FROM refresh_tokens WHERE user_id=ANY($1::text[]) AND revoked_at IS NULL) AS active_refresh_tokens,
        (SELECT count(*)::int FROM auth_sessions WHERE user_agent=$4) AS marker_sessions,
        (SELECT count(*)::int FROM auth_sessions WHERE user_agent=$4 AND revoked_at IS NULL) AS marker_active_sessions,
        (SELECT count(*)::int FROM refresh_tokens WHERE user_agent=$4) AS marker_refresh_tokens,
        (SELECT count(*)::int FROM refresh_tokens WHERE user_agent=$4 AND revoked_at IS NULL) AS marker_active_refresh_tokens,
        (SELECT count(*)::int FROM audit_log AS audit JOIN auth_sessions AS session
          ON audit.resource_type='auth_session' AND audit.resource_id=session.id::text
          WHERE session.user_agent=$4 AND audit.actor_id=ANY($1::text[]) AND audit.action='auth.login') AS marker_login_audits,
        (SELECT encode(digest(COALESCE(jsonb_agg(jsonb_build_array(account.id,account.email,account.role,
          account.account_status,account.deactivated_at,account.password_hash,account.profile,
          account.failed_login_attempts,account.login_locked_until) ORDER BY account.id)::text,'[]'),'sha256'),'hex')
          FROM users AS account WHERE account.id=ANY($1::text[])) AS identity_digest,
        (SELECT encode(digest(jsonb_build_object(
          'listing',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.id),'[]'::jsonb)
            FROM listings AS item WHERE item.id=$2),
          'upload',(SELECT COALESCE(jsonb_agg(to_jsonb(media) ORDER BY media.id),'[]'::jsonb)
            FROM uploads AS media WHERE media.listing_id=$2 OR media.storage_name=$5)
        )::text,'sha256'),'hex')) AS catalog_digest,
        (SELECT count(*)::int FROM bookings WHERE listing_id=$2 OR owner_id=ANY($1::text[]) OR renter_id=ANY($1::text[])) AS bookings,
        (SELECT count(*)::int FROM rental_requests WHERE item_id=$2 OR owner_id=ANY($1::text[]) OR renter_id=ANY($1::text[])) AS requests,
        (SELECT count(*)::int FROM auth_identities WHERE user_id=ANY($1::text[])) AS identities,
        (SELECT count(*)::int FROM push_devices WHERE user_id=ANY($1::text[])) AS push_devices,
        (SELECT count(*)::int FROM payment_commands WHERE actor_id=ANY($1::text[])) AS payment_commands,
        (SELECT count(*)::int FROM identity_verification_sessions WHERE user_id=ANY($1::text[])) AS identity_provider_sessions,
        (SELECT count(*)::int FROM technical_sandbox_runs WHERE user_id=ANY($1::text[])) AS technical_provider_runs,
        (SELECT count(*)::int FROM notifications WHERE user_id=ANY($1::text[])) AS notifications,
        (SELECT count(*)::int FROM notification_outbox WHERE user_id=ANY($1::text[])) AS notification_outbox`,
      [ids, listingId, runId, marker, uploadName])).rows[0];
      check(row, 'fixture_login_proof_state_invalid');
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/gu, (_, c) => c.toUpperCase()),
        ['identity_digest', 'catalog_digest'].includes(key) ? value : Number(value)]));
    } finally { await client.query('ROLLBACK'); }
  };
  const reconcile = async () => {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    try {
      await client.query("SET LOCAL statement_timeout='5s'"); await client.query("SET LOCAL lock_timeout='2s'");
      const principals = (await client.query(`SELECT id FROM users
        WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`, [ids])).rows;
      check(principals.length === ids.length && principals.every((row, index) => row.id === ids[index]),
        'fixture_login_proof_cleanup_principal_drift');
      const rows = (await client.query(`SELECT id::text,user_id,revoked_at FROM auth_sessions
        WHERE user_agent=$1 ORDER BY user_id,id FOR UPDATE`, [marker])).rows;
      const owned = rows.filter((row) => ids.includes(row.user_id));
      const ambiguous = rows.some((row) => !ids.includes(row.user_id))
        || ids.some((id) => owned.filter((row) => row.user_id === id).length > 1);
      const sessionIds = owned.map((row) => row.id);
      if (sessionIds.length) {
        await client.query(`UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()),
          revoked_reason=COALESCE(revoked_reason,'staging_fixture_login_proof')
          WHERE session_id=ANY($1::uuid[]) AND user_id=ANY($2::text[]) AND user_agent=$3`,
        [sessionIds, ids, marker]);
        await client.query(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),
          revoked_reason=COALESCE(revoked_reason,'staging_fixture_login_proof')
          WHERE id=ANY($1::uuid[]) AND user_id=ANY($2::text[]) AND user_agent=$3`,
        [sessionIds, ids, marker]);
      }
      await client.query('COMMIT');
      check(!ambiguous, 'fixture_login_proof_marker_ambiguous');
      return Object.freeze({ matchedSessions: sessionIds.length });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { fail('fixture_login_proof_cleanup_rollback_failed'); }
      throw error;
    }
  };
  return Object.freeze({ attest, attestCredentials, snapshot, reconcile });
}

async function responseJson(response, code) {
  try { return await response.json(); } catch { fail(code); }
}

export async function runFixtureLoginProof({ input, environment, store, request, execute = false, marker,
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)) }) {
  validateFixtureLoginProofEnvironment(environment, input.manifest);
  check(typeof request === 'function' && store?.attest && store?.attestCredentials
    && store?.snapshot && store?.reconcile
    && /^SIT-Staging-Login-Proof\/[a-f0-9]{40}$/u.test(marker ?? '')
    && input.credentials.runId === input.manifest.preflight.runId,
  'fixture_login_proof_request_invalid');
  const database = await store.attest(input.manifest);
  const credentialAttestation = await store.attestCredentials(input.credentials);
  check(credentialAttestation.credentialsAttested === 2,
    'fixture_login_proof_credential_attestation_failed');
  const before = await store.snapshot({ readOnly: true }); assertPreflightState(before);
  try {
    const headers = { 'User-Agent': marker };
    const live = await request('/health/live', { method: 'GET', headers });
    const ready = await request('/health/ready', { method: 'GET', headers });
    const version = await request('/version', { method: 'GET', headers });
    check(live.status === 200 && ready.status === 200 && version.status === 200,
      'fixture_login_proof_api_readback_failed');
    const release = await responseJson(version, 'fixture_login_proof_api_readback_failed');
    check(release?.commit === environment.APP_COMMIT
      && release?.environment === environment.DEPLOYMENT_ENVIRONMENT,
    'fixture_login_proof_api_readback_failed');
  } catch (error) {
    if (error?.code === 'fixture_login_proof_api_readback_failed') throw error;
    fail('fixture_login_proof_api_readback_failed');
  }
  const effectDigest = fixtureLoginProofDigest(forbiddenState(before));
  if (!execute) return Object.freeze({ status: 'fixture-login-proof-preflight-passed-no-mutation', executed: false,
    rolesVerified: 2, loginsVerified: 0, meVerified: 0, logoutsVerified: 0, accessTokensRejected: 0,
    activeSessions: 0, activeRefreshTokens: 0, schemaCount: database.schemaCount,
    credentialsAttested: credentialAttestation.credentialsAttested,
    quiescenceReadbacks: 0,
    retainedSessionRecords: 0, loginAudits: 0, ledgerDigest: database.ledgerDigest,
    identityDigest: before.identityDigest, identityUnchanged: true,
    catalogStateDigest: before.catalogDigest, visibilityUnchanged: true, effectDigest,
    apiReadback: true,
    paymentMemory: true, stripeLivemode: false, registrationClosed: true, catalogEnabled: false,
    externalProvidersEnabled: false, markerSha256: hash(marker), cleanupVerified: true });
  const tokens = [];
  let loginsVerified = 0; let meVerified = 0; let logoutsVerified = 0; let accessTokensRejected = 0;
  let failure;
  try {
    for (let index = 0; index < input.credentials.accounts.length; index++) {
      const account = input.credentials.accounts[index]; const role = index ? 'renter' : 'owner';
      const headers = { 'Content-Type': 'application/json', 'User-Agent': marker,
        'X-Request-ID': `sit-login-proof-${hash(`${marker}:${role}`).slice(0, 32)}` };
      const login = await request('/v1/auth/login', { method: 'POST', headers,
        body: JSON.stringify({ email: account.email, [credentialFieldName]: account[credentialFieldName] }) });
      if (login.status === 202) fail('fixture_login_proof_mfa_unexpected');
      check(login.status === 200, 'fixture_login_proof_login_failed');
      const session = await responseJson(login, 'fixture_login_proof_login_response_invalid');
      check(typeof session?.accessToken === 'string' && typeof session?.refreshToken === 'string'
        && /^[0-9a-f-]{36}$/u.test(session?.sessionId ?? '') && session.user?.id === ids[index]
        && session.user?.email === account.email && session.user?.role === 'user',
      'fixture_login_proof_login_response_invalid');
      tokens.push({ access: session.accessToken, refresh: session.refreshToken }); loginsVerified++;
      const me = await request('/v1/auth/me', { method: 'GET', headers: { ...headers,
        Authorization: `Bearer ${session.accessToken}` } });
      check(me.status === 200, 'fixture_login_proof_me_failed');
      const identity = await responseJson(me, 'fixture_login_proof_me_response_invalid');
      check(identity?.user?.id === ids[index] && identity.user.email === account.email
        && identity.user.role === 'user', 'fixture_login_proof_me_response_invalid');
      meVerified++;
      const logout = await request('/v1/auth/logout', { method: 'POST', headers,
        body: JSON.stringify({ refreshToken: session.refreshToken }) });
      check(logout.status === 204, 'fixture_login_proof_logout_failed'); logoutsVerified++;
      const rejected = await request('/v1/auth/me', { method: 'GET', headers: { ...headers,
        Authorization: `Bearer ${session.accessToken}` } });
      check(rejected.status === 401, 'fixture_login_proof_access_token_still_active'); accessTokensRejected++;
    }
  } catch (error) { failure = error; }
  let previousCleanupDigest; let stableWindows = 0; let after; let quiescenceReadbacks = 0;
  for (let round = 0; round < 4; round++) {
    if (round > 0) await sleep(cleanupQuietWindowMs);
    try { await store.reconcile(); }
    catch { fail('fixture_login_proof_cleanup_failed_manual_readback_required'); }
    after = await store.snapshot(); assertPostState(before, after); quiescenceReadbacks++;
    const cleanupDigest = fixtureLoginProofDigest({ markerSessions: after.markerSessions,
      markerRefreshTokens: after.markerRefreshTokens, markerActiveSessions: after.markerActiveSessions,
      markerActiveRefreshTokens: after.markerActiveRefreshTokens,
      activeSessions: after.activeSessions, activeRefreshTokens: after.activeRefreshTokens });
    if (cleanupDigest === previousCleanupDigest) stableWindows++;
    else stableWindows = 0;
    if (stableWindows >= 2) break;
    previousCleanupDigest = cleanupDigest;
  }
  check(stableWindows >= 2,
    'fixture_login_proof_cleanup_quiescence_unproven_manual_readback_required');
  for (const token of tokens) {
    try {
      const rejected = await request('/v1/auth/me', { method: 'GET', headers: {
        'User-Agent': marker, Authorization: `Bearer ${token.access}` } });
      check(rejected.status === 401, 'fixture_login_proof_access_token_still_active');
    } catch { if (!failure) fail('fixture_login_proof_access_token_readback_failed'); }
  }
  if (failure) throw failure;
  check(loginsVerified === 2 && meVerified === 2 && logoutsVerified === 2 && accessTokensRejected === 2,
    'fixture_login_proof_incomplete');
  check(after.markerSessions === 2 && after.markerRefreshTokens === 2 && after.markerLoginAudits === 2,
    'fixture_login_proof_session_readback_invalid');
  return Object.freeze({ status: 'fixture-login-proof-verified-sessions-revoked', executed: true,
    rolesVerified: 2, loginsVerified, meVerified, logoutsVerified, accessTokensRejected,
    activeSessions: after.activeSessions, activeRefreshTokens: after.activeRefreshTokens,
    credentialsAttested: credentialAttestation.credentialsAttested,
    quiescenceReadbacks,
    retainedSessionRecords: after.markerSessions, loginAudits: after.markerLoginAudits,
    schemaCount: database.schemaCount, ledgerDigest: database.ledgerDigest,
    identityDigest: after.identityDigest, identityUnchanged: true,
    catalogStateDigest: after.catalogDigest, visibilityUnchanged: true, effectDigest,
    apiReadback: true,
    paymentMemory: true, stripeLivemode: false, registrationClosed: true, catalogEnabled: false,
    externalProvidersEnabled: false, markerSha256: hash(marker), cleanupVerified: true });
}

export function buildFixtureLoginProofLaunch({ binding, source, execute, name, nonce }) {
  check(/^sit-web-login-proof-[a-f0-9]{24}$/u.test(name) && /^[a-f0-9]{24}$/u.test(nonce),
    'fixture_login_proof_runner_name_invalid');
  const mounts = [
    `type=bind,src=${resolve(root, self)},dst=${codeRoot}/${basename(self)},readonly`,
    `type=bind,src=${resolve(root, stableFile)},dst=${codeRoot}/${basename(stableFile)},readonly`,
    `type=bind,src=${resolve(binding.inputDirectory, 'adapter.json')},dst=${inputRoot}/adapter.json,readonly`,
    `type=bind,src=${resolve(binding.inputDirectory, 'credentials.json')},dst=${inputRoot}/credentials.json,readonly`,
  ];
  const child = `
const input=${JSON.stringify({ execute, sourceCommit: source.commit, sourceHashes: source.hashes,
    bootstrapManifestSha256: binding.bootstrapManifestSha256, credentialsSha256: binding.credentialsSha256,
    bootstrapRunIdSha256: binding.bootstrapRunIdSha256, roleDigest: binding.roleDigest,
    markerSha256: binding.markerSha256 })};
try {
  const verifier=await import('${codeRoot}/${basename(self)}');
  const protectedInput=verifier.readProtectedFixtureLoginInput('${inputRoot}',{checkParent:false});
  const marker=verifier.loginProofMarker(protectedInput.manifest.preflight.runId,'${binding.proofNonce}');
  const crypto=await import('node:crypto'); const fs=await import('node:fs');
  const sha=(value)=>crypto.createHash('sha256').update(value).digest('hex');
  if (input.sourceCommit!=='${source.commit}'
      || sha(fs.readFileSync('${codeRoot}/${basename(self)}'))!==input.sourceHashes['${self}']
      || sha(fs.readFileSync('${codeRoot}/${basename(stableFile)}'))!==input.sourceHashes['${stableFile}']
      || sha(protectedInput.manifestBytes)!==input.bootstrapManifestSha256
      || sha(protectedInput.credentialsBytes)!==input.credentialsSha256
      || sha(protectedInput.manifest.preflight.runId)!==input.bootstrapRunIdSha256
      || verifier.fixtureLoginProofDigest(protectedInput.manifest.preflight.roles)!==input.roleDigest
      || sha(marker)!==input.markerSha256) throw Error('binding');
  const {Pool}=await import('pg'); const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  try { const client=await pool.connect(); try {
    const store=verifier.createFixtureLoginProofStore(client,{runId:protectedInput.manifest.preflight.runId,marker});
    const request=(path,options)=>fetch('http://${apiName}:8080'+path,{...options,signal:AbortSignal.timeout(5000)});
    const result=await verifier.runFixtureLoginProof({input:protectedInput,environment:process.env,store,request,execute:input.execute,marker});
    process.stdout.write(JSON.stringify(result)+'\\n');
  } finally { client.release(); } } finally { await pool.end(); }
} catch { process.stderr.write('fixture_login_proof_child_failed\\n'); process.exitCode=1; }
`;
  return { args: ['create', '--pull=never', '--log-driver', 'none', '--name', name,
    '--label', `com.shareittoo.fixture-login-proof=${nonce}`, '--user', '100:101', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--network', binding.networkId,
    '--env-file', envFile, ...mounts.flatMap((mount) => ['--mount', mount]), '--entrypoint', 'node',
    `ghcr.io/shareittoo/shareittoo-api:${binding.runtimeCommit}@${binding.imageDigest}`,
    '--input-type=module', '-e', child], child, mounts };
}

export function assertFixtureLoginProofContainer({ runner, binding, launch, id, name, nonce, image }) {
  const expectedMounts = launch.mounts.map((mount) => Object.fromEntries(mount.split(',').map((part) => part.includes('=') ? part.split('=') : [part, true])));
  check(runner.Id === id && runner.Name === `/${name}` && runner.State?.Running === false
    && runner.Config?.Labels?.['com.shareittoo.fixture-login-proof'] === nonce
    && runner.Config?.Image === `ghcr.io/shareittoo/shareittoo-api:${binding.runtimeCommit}@${binding.imageDigest}`
    && runner.Image === image.Id && runner.Config.User === '100:101'
    && runner.HostConfig?.ReadonlyRootfs === true && runner.HostConfig?.Privileged === false
    && JSON.stringify(runner.HostConfig?.CapDrop) === JSON.stringify(['ALL']) && !runner.HostConfig?.CapAdd?.length
    && runner.HostConfig?.SecurityOpt?.includes('no-new-privileges')
    && runner.HostConfig?.LogConfig?.Type === 'none' && runner.HostConfig?.NetworkMode === binding.networkId
    && JSON.stringify(Object.keys(runner.NetworkSettings?.Networks ?? {})) === JSON.stringify([networkName])
    && Object.keys(runner.HostConfig?.PortBindings ?? {}).length === 0 && !runner.HostConfig?.Devices?.length
    && runner.Config?.Entrypoint?.[0] === 'node'
    && JSON.stringify(runner.Config?.Cmd) === JSON.stringify(['--input-type=module', '-e', launch.child])
    && runner.Mounts?.length === expectedMounts.length
    && expectedMounts.every((expected) => runner.Mounts.filter((actual) => actual.Type === expected.type
      && actual.Source === expected.src && actual.Destination === expected.dst && actual.RW === false).length === 1),
  'fixture_login_proof_runner_drift');
}

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000 });
  check(!result.error && result.status === 0, 'fixture_login_proof_docker_failed'); return result.stdout.trim();
}
const inspect = (target) => JSON.parse(docker(['inspect', '--format', '{{json .}}', target]));

function currentInventory() {
  const api = inspect(apiName); const database = inspect(dbName); const network = inspect(networkName);
  const image = JSON.parse(docker(['image', 'inspect', '--format', '{{json .}}', api.Config.Image]));
  const envBytes = readStablePrivateFile(envFile, { encoding: null, expectedMode: 0o600, expectedUid: 0,
    minBytes: 1, code: 'fixture_login_proof_env_metadata_invalid' });
  return { api, database, network, image, envBytes };
}

function readBinding(filePath, expectedSha256) {
  assertExternalPath(filePath, 'fixture_login_proof_binding_path_invalid');
  const bytes = readStablePrivateFile(filePath, { encoding: null, expectedMode: 0o600,
    expectedUid: process.getuid(), expectedGid: process.getgid(), minBytes: 1, maxBytes: 256 * 1024,
    code: 'fixture_login_proof_binding_metadata_invalid' });
  check(digestPattern.test(expectedSha256 ?? '') && hash(bytes) === expectedSha256,
    'fixture_login_proof_binding_digest_invalid');
  let binding; try { binding = JSON.parse(bytes); } catch { fail('fixture_login_proof_binding_json_invalid'); }
  return validateFixtureLoginProofBinding(binding);
}

function validateResult(result, binding, execute) {
  exact(result, ['status', 'executed', 'rolesVerified', 'loginsVerified', 'meVerified', 'logoutsVerified',
    'accessTokensRejected', 'activeSessions', 'activeRefreshTokens', 'credentialsAttested',
    'quiescenceReadbacks', 'retainedSessionRecords',
    'loginAudits', 'schemaCount', 'ledgerDigest', 'identityDigest', 'identityUnchanged',
    'catalogStateDigest', 'visibilityUnchanged', 'effectDigest', 'apiReadback',
    'paymentMemory', 'stripeLivemode', 'registrationClosed', 'catalogEnabled',
    'externalProvidersEnabled', 'markerSha256',
    'cleanupVerified'], 'fixture_login_proof_result_invalid');
  const expected = execute ? [true, 'fixture-login-proof-verified-sessions-revoked', 2, 2, 2, 2]
    : [false, 'fixture-login-proof-preflight-passed-no-mutation', 2, 0, 0, 0];
  check(result.executed === expected[0] && result.status === expected[1] && result.rolesVerified === expected[2]
    && result.loginsVerified === expected[3] && result.meVerified === expected[4] && result.logoutsVerified === expected[5]
    && result.accessTokensRejected === (execute ? 2 : 0) && result.activeSessions === 0
    && result.credentialsAttested === 2
    && (execute ? Number.isInteger(result.quiescenceReadbacks)
      && result.quiescenceReadbacks >= 3 && result.quiescenceReadbacks <= 4
      : result.quiescenceReadbacks === 0)
    && result.retainedSessionRecords === (execute ? 2 : 0) && result.loginAudits === (execute ? 2 : 0)
    && result.activeRefreshTokens === 0 && result.schemaCount === 98
    && digestPattern.test(result.ledgerDigest ?? '') && digestPattern.test(result.identityDigest ?? '')
    && digestPattern.test(result.catalogStateDigest ?? '')
    && result.identityUnchanged === true && result.visibilityUnchanged === true
    && result.apiReadback === true && result.paymentMemory === true
    && result.stripeLivemode === false && result.registrationClosed === true
    && result.catalogEnabled === false && result.externalProvidersEnabled === false
    && result.cleanupVerified === true
    && digestPattern.test(result.effectDigest ?? '') && result.markerSha256 === binding.markerSha256,
  'fixture_login_proof_result_invalid');
  return result;
}

export async function runFixtureLoginProofContainer({ binding, source, execute = false,
  command = docker, inspectRecord = inspect, inventory = currentInventory(), readInput = readProtectedFixtureLoginInput,
  assertOutput = assertPrivateParent, outputStat = lstatOrNull,
  readEnv = () => readStablePrivateFile(envFile, { encoding: null, expectedMode: 0o600, expectedUid: 0 }),
  writeEvidence = writeExclusivePrivateFile }) {
  validateFixtureLoginProofBinding(binding, source); assertOutput(binding.evidenceFile);
  check(!outputStat(binding.evidenceFile), 'fixture_login_proof_evidence_exists');
  const input = readInput(binding.inputDirectory);
  check(hash(input.manifestBytes) === binding.bootstrapManifestSha256
    && hash(input.credentialsBytes) === binding.credentialsSha256
    && hash(input.manifest.preflight.runId) === binding.bootstrapRunIdSha256
    && fixtureLoginProofDigest(input.manifest.preflight.roles) === binding.roleDigest
    && hash(loginProofMarker(input.manifest.preflight.runId, binding.proofNonce)) === binding.markerSha256,
  'fixture_login_proof_private_binding_drift');
  const environment = validateRuntimeInventory({ binding, ...inventory, expected: binding.runtimeCommit });
  validateFixtureLoginProofEnvironment(environment, input.manifest);
  const nonce = crypto.randomBytes(12).toString('hex'); const name = `sit-web-login-proof-${nonce}`;
  const launch = buildFixtureLoginProofLaunch({ binding, source, execute, name, nonce });
  let id; let result; let failure;
  try {
    id = command(launch.args); check(digestPattern.test(id ?? ''), 'fixture_login_proof_container_id_invalid');
    assertFixtureLoginProofContainer({ runner: inspectRecord(id), binding, launch, id, name, nonce, image: inventory.image });
    check(fixtureLoginProofFingerprint(inspectRecord(binding.apiId)) === binding.apiFingerprint
      && fixtureLoginProofFingerprint(inspectRecord(binding.databaseId)) === binding.databaseFingerprint
      && hash(readEnv()) === binding.envSha256,
    'fixture_login_proof_prestart_drift');
    result = validateResult(JSON.parse(command(['start', '--attach', id])), binding, execute);
  } catch (error) { failure = error; }
  finally {
    if (!digestPattern.test(id ?? '')) {
      const found = command(['ps', '--all', '--filter', `label=com.shareittoo.fixture-login-proof=${nonce}`, '--format', '{{.ID}}']);
      check(found === '' || digestPattern.test(found), 'fixture_login_proof_ambiguous_creation'); if (found) id = found;
    }
    if (digestPattern.test(id ?? '')) {
      const owned = inspectRecord(id);
      check(owned.Id === id && owned.Name === `/${name}`
        && owned.Config?.Labels?.['com.shareittoo.fixture-login-proof'] === nonce,
      'fixture_login_proof_cleanup_ownership');
      command(['rm', '--force', '--volumes', id]);
      check(command(['ps', '--all', '--filter', `id=${id}`, '--format', '{{.ID}}']) === '',
        'fixture_login_proof_container_cleanup_failed');
    }
  }
  if (failure) throw failure;
  check(fixtureLoginProofFingerprint(inspectRecord(binding.apiId)) === binding.apiFingerprint
    && fixtureLoginProofFingerprint(inspectRecord(binding.databaseId)) === binding.databaseFingerprint
    && hash(readEnv()) === binding.envSha256,
  'fixture_login_proof_final_runtime_drift');
  if (execute) {
    const evidence = { kind: fixtureLoginProofKind, schemaVersion: 1, createdAt: new Date().toISOString(),
      status: result.status, opsCommit: source.commit, runtimeCommit: binding.runtimeCommit,
      imageDigest: binding.imageDigest, bootstrapManifestSha256: binding.bootstrapManifestSha256,
      credentialsSha256: binding.credentialsSha256, bootstrapRunIdSha256: binding.bootstrapRunIdSha256,
      roleDigest: binding.roleDigest, markerSha256: binding.markerSha256, rolesVerified: result.rolesVerified,
      loginsVerified: result.loginsVerified, meVerified: result.meVerified, logoutsVerified: result.logoutsVerified,
      accessTokensRejected: result.accessTokensRejected, activeSessions: result.activeSessions,
      activeRefreshTokens: result.activeRefreshTokens, credentialsAttested: result.credentialsAttested,
      quiescenceReadbacks: result.quiescenceReadbacks,
      retainedSessionRecords: result.retainedSessionRecords,
      loginAudits: result.loginAudits, schemaCount: result.schemaCount, ledgerDigest: result.ledgerDigest,
      identityDigest: result.identityDigest, identityUnchanged: result.identityUnchanged,
      catalogStateDigest: result.catalogStateDigest, visibilityUnchanged: result.visibilityUnchanged,
      effectDigest: result.effectDigest, apiReadback: result.apiReadback, paymentMemory: result.paymentMemory,
      stripeLivemode: result.stripeLivemode, registrationClosed: result.registrationClosed,
      catalogEnabled: result.catalogEnabled, externalProvidersEnabled: result.externalProvidersEnabled,
      cleanupVerified: result.cleanupVerified, runtimeActivated: false };
    writeEvidence(binding.evidenceFile, Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
      { mode: 0o600, uid: process.getuid(), gid: process.getgid() });
  }
  return Object.freeze({ ...result, opsCommit: source.commit, runtimeCommit: binding.runtimeCommit,
    imageDigest: binding.imageDigest, bootstrapRunIdSha256: binding.bootstrapRunIdSha256,
    credentialsSha256: binding.credentialsSha256, containerCleanup: 'verified' });
}

async function main() {
  check(process.getuid() === 0 && Number(process.versions.node.split('.')[0]) >= 22,
    'fixture_login_proof_host_required');
  const argv = process.argv.slice(2); const source = readFixtureLoginProofSource();
  if (argv[0] === '--prepare') {
    check(argv.length === 4, 'fixture_login_proof_arguments');
    const [inputDirectory, bindingFile, evidenceFile] = argv.slice(1);
    check(bindingFile !== evidenceFile, 'fixture_login_proof_output_paths_invalid');
    assertPrivateParent(bindingFile); assertPrivateParent(evidenceFile);
    check(!lstatOrNull(bindingFile) && !lstatOrNull(evidenceFile), 'fixture_login_proof_output_exists');
    const input = readProtectedFixtureLoginInput(inputDirectory); const inventory = currentInventory();
    const binding = buildFixtureLoginProofBinding({ source, ...inventory, inputDirectory, input, evidenceFile });
    const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
    writeExclusivePrivateFile(bindingFile, bytes, { mode: 0o600, uid: 0, gid: 0 });
    process.stdout.write(`${JSON.stringify({ status: 'fixture-login-proof-binding-prepared-no-auth',
      bindingSha256: hash(bytes), opsCommit: source.commit, runtimeCommit: binding.runtimeCommit })}\n`); return;
  }
  check(argv.length === 2 || (argv.length === 5 && argv[2] === '--execute'),
    'fixture_login_proof_arguments');
  const binding = readBinding(argv[0], argv[1]); const execute = argv.length === 5;
  const input = readProtectedFixtureLoginInput(binding.inputDirectory);
  validateFixtureLoginProofConfirmation({ execute, source, input,
    confirmSource: argv[3], confirmRun: argv[4] });
  const result = await runFixtureLoginProofContainer({ binding, source, execute });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(() => {
  process.stderr.write('fixture_login_proof_failed_no_automatic_retry\n'); process.exitCode = 1;
});
