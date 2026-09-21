#!/usr/bin/env node

import crypto from 'node:crypto';
import { chmod, chown, lstat, mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertDisposableResourceIdentity,
  assertReadinessFindingsUnchanged,
  buildReadinessFindingSql,
  normalizeReadinessFindings,
  removeAndVerifyDockerResource,
  runCommand,
  runCommandWithFileInput,
} from './staging_forward_migration_rehearsal.mjs';
import { validateMfaStagingSecret } from './validate_mfa_staging_secret.mjs';
import { readStablePrivateFile } from './stable_private_file.mjs';

export const disposableCandidateCommit = 'f0bb868a8a487cbf33ae67a555946fb9c67f4e9f';
export const disposableCandidateImage = `shareittoo-api-wp244:${disposableCandidateCommit}`;
export const disposableCandidateImageDigest = 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620';
export const disposablePostgresImage = 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const readinessContractVersion = 'V5.2-2026-08-16';

function fail(code) {
  const error = new Error(`Disposable candidate acceptance failed: ${code}`);
  error.code = code;
  throw error;
}

function fullCommit(value, name) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(`${name}_must_be_full_commit`);
  return value;
}

export function buildCandidateRuntimeEnv({ databasePassword, mfaPath, targetCommit, api = false, jwtSecret } = {}) {
  const resolvedJwtSecret = jwtSecret ?? `disposable-${crypto.randomBytes(32).toString('base64url')}`;
  if (typeof databasePassword !== 'string' || typeof mfaPath !== 'string' || typeof targetCommit !== 'string' || resolvedJwtSecret.length < 32) {
    fail('candidate_runtime_env_invalid');
  }
  const env = {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'staging',
    APP_COMMIT: targetCommit, JWT_SECRET: resolvedJwtSecret,
    DATABASE_URL: `postgres://shareittoo_rehearsal:${databasePassword}@db:5432/shareittoo_rehearsal`,
    MFA_ENCRYPTION_KEY_FILE: '/run/secrets/mfa-encryption-key',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    IDENTITY_VERIFICATION_TRANSPORT: 'disabled', SIT_LISTING_AI_PROVIDER: 'mock',
    PUSH_TRANSPORT: 'memory', MAIL_TRANSPORT: 'disabled',
  };
  if (api) Object.assign(env, { PORT: '8080', BIND_HOST: '0.0.0.0' });
  return Object.freeze({ env: Object.freeze(env), mfaPath, groupAdd: '65532' });
}

function runtimeEnvArgs(runtime) {
  return [
    '--group-add', runtime.groupAdd,
    ...Object.entries(runtime.env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    '--mount', `type=bind,src=${runtime.mfaPath},dst=/run/secrets/mfa-encryption-key,readonly`,
  ];
}

async function createEphemeralMfaKey() {
  const root = await mkdtemp(join(tmpdir(), 'sit-disposable-mfa-'));
  const filePath = join(root, 'mfa-key');
  const bytes = crypto.randomBytes(32);
  await writeFile(filePath, `${bytes.toString('base64url')}\n`, { mode: 0o640 });
  bytes.fill(0);
  await chmod(filePath, 0o640);
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : 0;
  await chown(filePath, ownerUid, 65532);
  validateMfaStagingSecret({ filePath, runtimeReadable: true, runtimeGroup: 65532 });
  return Object.freeze({ filePath, root });
}

async function removeEphemeralMfaKey(key) {
  if (!key?.filePath) return;
  try { await rm(key.root, { recursive: true, force: false }); } catch { fail('mfa_key_cleanup_failed'); }
  try { await stat(key.filePath); fail('mfa_key_still_present'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

async function assertSafeEvidencePath(evidencePath) {
  if (typeof evidencePath !== 'string' || !evidencePath.startsWith('/')) fail('evidence_path_required');
  const absolute = resolve(evidencePath);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}/`)) fail('evidence_path_inside_repository');
  const parent = dirname(absolute);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentMeta = await lstat(parent);
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : parentMeta.uid;
  if (parentMeta.isSymbolicLink() || !parentMeta.isDirectory() || (parentMeta.mode & 0o777) !== 0o700 || parentMeta.uid !== ownerUid) fail('evidence_directory_unsafe');
  const parentReal = await realpath(parent);
  if (parentReal === repositoryRoot || parentReal.startsWith(`${repositoryRoot}/`)) fail('evidence_directory_inside_repository');
  try { const existing = await lstat(absolute); if (existing.isSymbolicLink() || !existing.isFile()) fail('evidence_path_exists'); fail('evidence_path_exists'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return absolute;
}

export async function waitForFinalPostgresReady({ command, container, attempts = 60, intervalMs = 500 } = {}) {
  let markerSeen = false;
  let stableSqlSuccesses = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const logsResult = await command('docker', ['logs', container], { phase: 'database_init_logs' }).catch(() => ({ stdout: '', stderr: '' }));
    const logs = typeof logsResult === 'string'
      ? logsResult
      : `${logsResult.stdout ?? ''}\n${logsResult.stderr ?? ''}`;
    if (logs.includes('PostgreSQL init process complete; ready for start up.')) markerSeen = true;
    if (markerSeen) {
      try {
        await command('docker', ['exec', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal', '-Atc', 'SELECT 1'], { phase: 'database_stable_sql' });
        stableSqlSuccesses += 1;
        if (stableSqlSuccesses >= 2) return true;
      } catch {
        stableSqlSuccesses = 0;
      }
    }
    if (attempt < attempts - 1) await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  fail('database_final_init_timeout');
}

function assertSafeDisposableTarget({ network, volume, database, api, runId }) {
  if (network.includes('shareittoo_staging_backend') || volume.includes('shareittoo_staging_backend')) {
    fail('live_staging_resource_forbidden');
  }
  for (const [resourceType, name] of [['network', network], ['volume', volume], ['container', database], ['container', api]]) {
    assertDisposableResourceIdentity({
      resourceType,
      name: resourceType === 'container' ? name : name,
      labels: {
        'com.shareittoo.staging.rehearsal': 'true',
        'com.shareittoo.staging.rehearsal_run_id': runId,
      },
      runId,
    });
  }
}

async function verifyBackup({ backupPath, manifestPath, hashFile: suppliedHashFile }) {
  if (!backupPath || !manifestPath || !backupPath.startsWith('/') || !manifestPath.startsWith('/')) {
    fail('backup_manifest_path_invalid');
  }
  if (resolve(backupPath).startsWith(`${repositoryRoot}/`) || resolve(manifestPath).startsWith(`${repositoryRoot}/`)) {
    fail('backup_manifest_inside_repository');
  }
  const backupData = readStablePrivateFile(backupPath, { encoding: null, mode: 0o077, minBytes: 1, code: 'backup_not_private_or_empty' });
  const manifest = readStablePrivateFile(manifestPath, { expectedMode: 0o600, code: 'backup_manifest_not_private' }).trim();
  const match = manifest.match(/^([0-9a-f]{64})\s+(.+)$/u);
  if (!match || resolve(match[2]) !== resolve(backupPath)) fail('backup_manifest_binding_invalid');
  const actual = suppliedHashFile
    ? await suppliedHashFile(backupData)
    : crypto.createHash('sha256').update(backupData).digest('hex');
  if (actual !== match[1]) fail('backup_sha256_mismatch');
  return Object.freeze({ bytes: backupData.length, sha256: actual, input: backupData });
}

async function queryFingerprint({ command, container, user, database, sql }) {
  const raw = await command('docker', [
    'exec', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-Atc', sql,
  ], { phase: 'readiness_fingerprint' });
  try { return normalizeReadinessFindings(JSON.parse(typeof raw === 'string' ? raw : raw.stdout)); } catch { fail('readiness_fingerprint_unreadable'); }
}

async function queryText({ command, container, user, database, sql, phase }) {
  const output = await command('docker', [
    'exec', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-Atc', sql,
  ], { phase });
  return String(typeof output === 'string' ? output : output.stdout).trim();
}

async function inspectLabels(command, name, format, phase) {
  const output = await command('docker', ['inspect', name, '--format', format], { phase });
  const value = typeof output === 'string' ? output : output.stdout;
  try { return JSON.parse(value.trim()); } catch { fail('disposable_identity_unreadable'); }
}

export async function probeInternalEndpoint(command, { container, path, expectedStatus, attempts = 60, intervalMs = 250 } = {}) {
  if (!/^\/(?:version|health\/live|health\/ready)$/u.test(path) || !Number.isInteger(expectedStatus)) fail('internal_probe_arguments_invalid');
  const script = `const c=new AbortController();const timer=setTimeout(()=>c.abort(),5000);try{const r=await fetch('http://127.0.0.1:8080${path}',{signal:c.signal});const t=await r.text();let p=null;try{p=t?JSON.parse(t):null}catch{};console.log(JSON.stringify({status:r.status,payload:p}));}catch{console.log(JSON.stringify({status:0,payload:null}));}finally{clearTimeout(timer);}`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const output = await command('docker', ['exec', container, 'node', '--input-type=module', '-e', script], { phase: `internal_probe_${path.slice(1).replaceAll('/', '_')}` }).catch(() => ({ stdout: '' }));
    try {
      const raw = String(typeof output === 'string' ? output : output.stdout).trim();
      const observed = JSON.parse(raw);
      if (observed.status === expectedStatus) return observed;
    } catch { /* bounded retry; raw output is never surfaced */ }
    if (attempt < attempts - 1) await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  fail(`internal_probe_${path.slice(1).replaceAll('/', '_')}_timeout`);
}

const mfaProbe = `import crypto from 'node:crypto';
import { pool } from '/app/src/db.js';
import { hashPassword, signAccessToken } from '/app/src/security.js';
const id = 'disposable-mfa-' + crypto.randomUUID(); const email = id + '@example.invalid'; const password = ['DisposableMfa', crypto.randomBytes(18).toString('base64url')].join('-');
try { const h = await hashPassword(password); await pool.query("INSERT INTO users (id,email,password_hash,profile,role,account_status,email_verified_at,terms_accepted_at,privacy_accepted_at,minimum_age_confirmed_at,private_use_confirmed_at) VALUES ($1,$2,$3,$4::jsonb,'user','active',now(),now(),now(),now(),now())", [id,email,h,JSON.stringify({displayName:'Disposable MFA',emailVerified:true})]); const session = crypto.randomUUID(); await pool.query("INSERT INTO auth_sessions (id,user_id,device_label) VALUES ($1,$2,'disposable acceptance')", [session,id]); const token=signAccessToken({id,email},{sessionId:session}); async function req(path,method='GET',body,expected=200){const r=await fetch('http://127.0.0.1:8080/v1'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}); if(r.status!==expected) throw new Error('mfa_'+r.status); return r.json();} const e=await req('/auth/mfa/enroll','POST',{currentPassword:password,idempotencyKey:id},201); if(typeof e.secret!=='string') throw new Error('mfa_secret'); const p=await req('/auth/mfa/status'); if(!p.pending||p.enabled) throw new Error('mfa_pending'); const c=await req('/auth/mfa/enroll/cancel','POST',{currentPassword:password}); if(!c.cancelled) throw new Error('mfa_cancel'); console.log('disposable-mfa-ok'); } finally { await pool.query('DELETE FROM users WHERE id=$1',[id]); await pool.end(); }`;

export async function runDisposableCandidateAcceptance({
  backupPath,
  manifestPath,
  execute = false,
  confirmation,
  targetCommit = disposableCandidateCommit,
  environment = process.env,
  command = runCommand,
  commandWithFileInput = runCommandWithFileInput,
  hashFile,
  evidencePath = environment.SIT_DISPOSABLE_CANDIDATE_EVIDENCE_PATH,
  removeResource = removeAndVerifyDockerResource,
  opsCommit = environment.SIT_STAGING_REHEARSAL_OPS_COMMIT,
  prepareMfaKey = createEphemeralMfaKey,
  cleanupMfaKey = removeEphemeralMfaKey,
  waitForPostgres = waitForFinalPostgresReady,
} = {}) {
  fullCommit(targetCommit, 'targetCommit');
  if (targetCommit !== disposableCandidateCommit) fail('candidate_commit_mismatch');
  if (!execute) fail('explicit_execute_required');
  if (confirmation !== targetCommit) fail('exact_candidate_confirmation_required');
  fullCommit(opsCommit, 'opsCommit');
  const opsHead = await command('git', ['rev-parse', 'HEAD'], { phase: 'ops_head_read' });
  if (String(typeof opsHead === 'string' ? opsHead : opsHead.stdout).trim() !== opsCommit) fail('ops_checkout_commit_mismatch');
  const safeEvidencePath = await assertSafeEvidencePath(evidencePath);
  const { input: backupInput, ...backup } = await verifyBackup({ backupPath, manifestPath, hashFile });
  const runId = `${new Date().toISOString().replace(/[^0-9]/gu, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
  const network = `sit-staging-rehearsal-network-${runId}`;
  const volume = `sit-staging-rehearsal-volume-${runId}`;
  const database = `sit-staging-rehearsal-pg-${runId}`;
  const api = `sit-staging-rehearsal-api-${runId}`;
  const bootstrap = `sit-staging-rehearsal-bootstrap-${runId}`;
  const labels = ['--label', 'com.shareittoo.staging.rehearsal=true', '--label', `com.shareittoo.staging.rehearsal_run_id=${runId}`];
  const resources = { network, volume, database, bootstrap, api };
  let cleanup = { removed: false };
  let evidence;
  let mfaKey;
  const createdResources = [];
  try {
    assertSafeDisposableTarget({ ...resources, runId });
    mfaKey = await prepareMfaKey();
    const jwtSecret = `disposable-${crypto.randomBytes(32).toString('base64url')}`;
    const databasePassword = ['disposable', crypto.randomBytes(18).toString('base64url')].join('-');
    const imageMeta = await command('docker', ['image', 'inspect', disposableCandidateImage, '--format', '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}'], { phase: 'candidate_image_identity' });
    const imageMetaText = String(typeof imageMeta === 'string' ? imageMeta : imageMeta.stdout).trim();
    const [imageId, imageRevision] = imageMetaText.split('|', 2);
    if (imageRevision !== targetCommit) fail('candidate_image_revision_mismatch');
    if (imageId !== disposableCandidateImageDigest) fail('candidate_image_digest_mismatch');
    await command('docker', ['network', 'create', '--internal', ...labels, network], { phase: 'network_create' });
    createdResources.push(['network', network]);
    for (const [resourceType, name] of [['network', network]]) {
      const inspected = await inspectLabels(command, name, resourceType === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}', `${resourceType}_identity`);
      assertDisposableResourceIdentity({ resourceType, name, labels: inspected, runId });
    }
    await command('docker', ['volume', 'create', ...labels, volume], { phase: 'volume_create' });
    createdResources.push(['volume', volume]);
    for (const [resourceType, name] of [['volume', volume]]) {
      const inspected = await inspectLabels(command, name, '{{json .Labels}}', `${resourceType}_identity`);
      assertDisposableResourceIdentity({ resourceType, name, labels: inspected, runId });
    }
    await command('docker', ['create', '--name', database, ...labels, '--network', network, '--network-alias', 'db', '--mount', `type=volume,src=${volume},dst=/var/lib/postgresql/data`, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=shareittoo_rehearsal', '-e', 'POSTGRES_USER=shareittoo_rehearsal', '-e', `POSTGRES_PASSWORD=${databasePassword}`, disposablePostgresImage], { phase: 'database_create' });
    createdResources.push(['container', database]);
    for (const [resourceType, name] of [['container', database]]) {
      const inspected = await inspectLabels(command, name, '{{json .Config.Labels}}', 'database_identity');
      assertDisposableResourceIdentity({ resourceType, name, labels: inspected, runId });
    }
    const apiRuntime = buildCandidateRuntimeEnv({ databasePassword, mfaPath: mfaKey.filePath, targetCommit, api: true, jwtSecret });
    const bootstrapRuntime = buildCandidateRuntimeEnv({ databasePassword, mfaPath: mfaKey.filePath, targetCommit, jwtSecret });
    await command('docker', ['create', '--name', api, ...labels, '--network', network, '--network-alias', 'api', ...runtimeEnvArgs(apiRuntime), disposableCandidateImageDigest], { phase: 'candidate_create' });
    createdResources.push(['container', api]);
    for (const [resourceType, name] of [['container', api]]) {
      const inspected = await inspectLabels(command, name, '{{json .Config.Labels}}', 'api_identity');
      assertDisposableResourceIdentity({ resourceType, name, labels: inspected, runId });
    }
    await command('docker', ['start', database], { phase: 'database_start' });
    await waitForPostgres({ command, container: database });
    await commandWithFileInput('docker', ['exec', '-i', database, 'pg_restore', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal', '--no-owner', '--no-acl'], backupInput, { phase: 'restore' });
    const bootstrapScript = "import { initializeDatabase, pool } from '/app/src/db.js'; await initializeDatabase(); await pool.end();";
    await command('docker', ['create', '--name', bootstrap, ...labels, '--network', network, ...runtimeEnvArgs(bootstrapRuntime), disposableCandidateImageDigest, 'node', '--input-type=module', '-e', bootstrapScript], { phase: 'bootstrap_create' });
    const bootstrapLabels = await inspectLabels(command, bootstrap, '{{json .Config.Labels}}', 'bootstrap_identity');
    assertDisposableResourceIdentity({ resourceType: 'container', name: bootstrap, labels: bootstrapLabels, runId });
    createdResources.push(['container', bootstrap]);
    await command('docker', ['start', bootstrap], { phase: 'bootstrap_start' });
    const bootstrapWait = await command('docker', ['wait', bootstrap], { phase: 'bootstrap_wait' });
    if (String(typeof bootstrapWait === 'string' ? bootstrapWait : bootstrapWait.stdout).trim() !== '0') fail('bootstrap_migrations_failed');
    const preFingerprint = await queryFingerprint({ command, container: database, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal', sql: buildReadinessFindingSql({ contractVersion: readinessContractVersion, payoutHoldHours: 48 }) });
    await command('docker', ['start', api], { phase: 'candidate_start' });
    const versionProbe = await probeInternalEndpoint(command, { container: api, path: '/version', expectedStatus: 200 });
    const version = versionProbe.payload;
    if (version?.commit !== targetCommit) fail('candidate_version_commit_mismatch');
    const liveProbe = await probeInternalEndpoint(command, { container: api, path: '/health/live', expectedStatus: 200 });
    if (!liveProbe.payload || liveProbe.payload.status !== 'ok') fail('candidate_live_failed');
    const readyProbe = await probeInternalEndpoint(command, { container: api, path: '/health/ready', expectedStatus: 503 });
    const readinessPayload = readyProbe.payload;
    if (readinessPayload?.status !== 'degraded') fail('readiness_status_not_degraded');
    const postFingerprint = await queryFingerprint({ command, container: database, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal', sql: buildReadinessFindingSql({ contractVersion: readinessContractVersion, payoutHoldHours: 48 }) });
    assertReadinessFindingsUnchanged(preFingerprint, postFingerprint);
    const checks = readinessPayload.checks ?? {};
    const payments = checks.payments ?? {};
    const support = checks.supportDeadlines ?? {};
    if (postFingerprint.paymentRecoveryNeedsReview.length !== 2 || postFingerprint.supportNextUpdateOverdue.length !== 1) {
      fail('readiness_baseline_count_unexpected');
    }
    const notifications = checks.notifications ?? {};
    if (checks.database !== 'ok' || support.status !== 'degraded'
        || payments.recoveryNeedsReview !== postFingerprint.paymentRecoveryNeedsReview.length
        || payments.failedEvents !== 0 || payments.unbalanced !== 0 || payments.recoveryPending !== 0
        || support.nextUpdateOverdue !== postFingerprint.supportNextUpdateOverdue.length
        || support.stale !== false || support.lastErrorCode != null || support.p0WithoutOwner !== 0
        || support.criticalNextUpdateOverdue !== 0 || support.privacyDeadlineNear !== 0
        || support.privacyDeadlineOverdue !== 0 || support.privacyIncidentDeadlineNear !== 0
        || support.privacyIncidentDeadlineOverdue !== 0 || notifications.dead !== 0
        || ['error', 'unverified'].includes(checks.mail)) {
      fail('readiness_degradation_not_fingerprint_bound');
    }
    const ledger = await queryText({ command, container: database, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal', sql: "SELECT count(*), count(DISTINCT (regexp_match(name, '^([0-9]+)_'))[1]::int), min((regexp_match(name, '^([0-9]+)_'))[1]::int), max((regexp_match(name, '^([0-9]+)_'))[1]::int) FROM schema_migrations", phase: 'ledger' });
    if (ledger !== '91|91|1|91') fail('ledger_invalid');
    const fkCount = await queryText({ command, container: database, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal', sql: "SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND convalidated", phase: 'fk_count' });
    if (fkCount !== '367') fail('fk_count_invalid');
    await commandWithFileInput('docker', ['exec', '-i', database, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal'], join(repositoryRoot, 'backend/ops/check_foreign_key_integrity.sql'), { phase: 'fk_integrity' });
    await command('docker', ['exec', '-i', api, 'node', '--input-type=module'], { input: mfaProbe, phase: 'mfa_probe' }).catch(() => fail('mfa_probe_failed'));
    evidence = { status: 'technical-probes-passed-operational-release-blocked', runtimeCommit: targetCommit, opsCommit, acceptanceTarget: 'docker-exec-internal', hostPortPublished: false, image: disposableCandidateImageDigest, imageDigest: disposableCandidateImageDigest, postgresImage: disposablePostgresImage, backup, runId, resources, ledger, foreignKeys: fkCount, readiness: { http: 503, status: readinessPayload.status, preFingerprint, postFingerprint }, providerTraffic: false, liveDatabaseMutated: false };
    return evidence;
  } finally {
    const errors = [];
    for (const [kind, name] of [...createdResources].reverse()) {
      try {
        const inspected = await inspectLabels(command, name, kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}', 'cleanup_identity');
        assertDisposableResourceIdentity({ resourceType: kind, name, labels: inspected, runId });
        const error = await removeResource(kind, name);
        if (error) errors.push(error);
      } catch { errors.push(`cleanup_${kind}_identity_failed`); }
    }
    try { await cleanupMfaKey(mfaKey); } catch { errors.push('mfa_key_cleanup_failed'); }
    cleanup = { removed: errors.length === 0, errors };
    if (errors.length > 0) fail('cleanup_required');
    if (evidence) evidence.cleanup = cleanup;
    if (evidence && evidencePath) {
      await mkdir(resolve(evidencePath, '..'), { recursive: true, mode: 0o700 });
      await writeFile(safeEvidencePath, `${JSON.stringify({ ...evidence, cleanup }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      await chmod(safeEvidencePath, 0o600);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDisposableCandidateAcceptance({ backupPath: process.argv[2], manifestPath: process.argv[3], execute: true, confirmation: process.argv[4] })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${error?.message ?? 'Disposable candidate acceptance failed.'}\n`); process.exitCode = 1; });
}
