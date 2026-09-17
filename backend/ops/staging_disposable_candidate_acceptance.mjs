#!/usr/bin/env node

import crypto from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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

export const disposableCandidateCommit = 'f0bb868a8a487cbf33ae67a555946fb9c67f4e9f';
export const disposableCandidateImage = `shareittoo-api-wp244:${disposableCandidateCommit}`;
export const disposableCandidateImageDigest = 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620';
export const disposableCandidateOpsCommit = '7ccf56ccf7caf335c93c0bd7ed36d0fa2c5bb926';

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
  const hashFile = suppliedHashFile ?? (async (path) => {
  const hash = crypto.createHash('sha256');
  const data = await readFile(path);
  hash.update(data);
  return hash.digest('hex');
  });
  if (!backupPath || !manifestPath || !backupPath.startsWith('/') || !manifestPath.startsWith('/')) {
    fail('backup_manifest_path_invalid');
  }
  if (resolve(backupPath).startsWith(`${repositoryRoot}/`) || resolve(manifestPath).startsWith(`${repositoryRoot}/`)) {
    fail('backup_manifest_inside_repository');
  }
  const metadata = await stat(backupPath);
  if (metadata.size <= 0 || (metadata.mode & 0o077) !== 0) fail('backup_not_private_or_empty');
  const manifest = (await readFile(manifestPath, 'utf8')).trim();
  const match = manifest.match(/^([0-9a-f]{64})\s+(.+)$/u);
  if (!match || resolve(match[2]) !== resolve(backupPath)) fail('backup_manifest_binding_invalid');
  const actual = await hashFile(backupPath);
  if (actual !== match[1]) fail('backup_sha256_mismatch');
  return Object.freeze({ bytes: metadata.size, sha256: actual });
}

function compatibilityReadinessSql() {
  return `
WITH payment_findings AS (
  SELECT 'dispute' AS source, encode(digest(id::text, 'sha256'), 'hex') AS id_hash,
         'transfer_recovery_needs_review' AS cause, status,
         CASE WHEN updated_at <= now() - interval '24 hours' THEN '>24h'
              WHEN updated_at <= now() - interval '1 hour' THEN '1-24h' ELSE '<1h' END AS time_class
    FROM disputes WHERE transfer_recovery_needs_review = true
  UNION ALL
  SELECT 'payout', encode(digest(id::text, 'sha256'), 'hex'), 'payout_failed', status,
         CASE WHEN updated_at <= now() - interval '24 hours' THEN '>24h'
              WHEN updated_at <= now() - interval '1 hour' THEN '1-24h' ELSE '<1h' END
    FROM payouts WHERE status = 'failed'
), support_findings AS (
  SELECT encode(digest(id::text, 'sha256'), 'hex') AS id_hash,
         'next_update_overdue' AS cause, status, priority,
         CASE WHEN next_update_at <= now() - interval '24 hours' THEN '>24h'
              WHEN next_update_at <= now() - interval '1 hour' THEN '1-24h' ELSE '<1h' END AS time_class
    FROM support_cases WHERE operating_mode IN ('simulation', 'internal_testing')
      AND status NOT IN ('resolved', 'closed') AND next_update_at <= now()
)
SELECT jsonb_build_object(
  'paymentRecoveryNeedsReview', COALESCE((SELECT jsonb_agg(to_jsonb(payment_findings)
    ORDER BY source, id_hash, cause, status, time_class) FROM payment_findings), '[]'::jsonb),
  'supportNextUpdateOverdue', COALESCE((SELECT jsonb_agg(to_jsonb(support_findings)
    ORDER BY id_hash, cause, status, priority, time_class) FROM support_findings), '[]'::jsonb)
)::text;`;
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

async function hostPort(command, container, port) {
  const output = await command('docker', ['inspect', '--format', `{{(index (index .NetworkSettings.Ports "${port}/tcp") 0).HostPort}}`, container], { phase: 'candidate_port' });
  const value = String(typeof output === 'string' ? output : output.stdout).trim();
  if (!/^\d+$/u.test(value)) fail('candidate_port_invalid');
  return Number(value);
}

const mfaProbe = `import crypto from 'node:crypto';
import { pool } from '/app/src/db.js';
import { hashPassword, signAccessToken } from '/app/src/security.js';
const id = 'disposable-mfa-' + crypto.randomUUID(); const email = id + '@example.invalid'; const password = 'DisposableMfa9!';
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
  fetchImpl = fetch,
  hashFile,
  evidencePath = environment.SIT_DISPOSABLE_CANDIDATE_EVIDENCE_PATH,
  removeResource = removeAndVerifyDockerResource,
} = {}) {
  fullCommit(targetCommit, 'targetCommit');
  if (targetCommit !== disposableCandidateCommit) fail('candidate_commit_mismatch');
  if (!execute) fail('explicit_execute_required');
  if (confirmation !== targetCommit) fail('exact_candidate_confirmation_required');
  const backup = await verifyBackup({ backupPath, manifestPath, hashFile });
  const runId = `${new Date().toISOString().replace(/[^0-9]/gu, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
  const network = `sit-staging-rehearsal-network-${runId}`;
  const volume = `sit-staging-rehearsal-volume-${runId}`;
  const database = `sit-staging-rehearsal-pg-${runId}`;
  const api = `sit-staging-rehearsal-api-${runId}`;
  const labels = ['--label', 'com.shareittoo.staging.rehearsal=true', '--label', `com.shareittoo.staging.rehearsal_run_id=${runId}`];
  const resources = { network, volume, database, api };
  let cleanup = { removed: false };
  let evidence;
  try {
    assertSafeDisposableTarget({ ...resources, runId });
    const databasePassword = `disposable-${crypto.randomBytes(18).toString('base64url')}`;
    const imageMeta = await command('docker', ['image', 'inspect', disposableCandidateImage, '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}|{{json .RepoDigests}}'], { phase: 'candidate_image_identity' });
    const imageMetaText = String(typeof imageMeta === 'string' ? imageMeta : imageMeta.stdout).trim();
    const [imageRevision, repoDigestsJson] = imageMetaText.split('|', 2);
    if (imageRevision !== targetCommit) fail('candidate_image_revision_mismatch');
    let repoDigests;
    try { repoDigests = JSON.parse(repoDigestsJson); } catch { fail('candidate_image_digest_unreadable'); }
    if (!Array.isArray(repoDigests) || !repoDigests.some((digest) => digest.endsWith(`@${disposableCandidateImageDigest}`))) {
      fail('candidate_image_digest_mismatch');
    }
    await command('docker', ['network', 'create', '--internal', ...labels, network], { phase: 'network_create' });
    await command('docker', ['volume', 'create', ...labels, volume], { phase: 'volume_create' });
    await command('docker', ['create', '--name', database, ...labels, '--network', network, '--network-alias', 'db', '--mount', `type=volume,src=${volume},dst=/var/lib/postgresql/data`, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=shareittoo_rehearsal', '-e', 'POSTGRES_USER=shareittoo_rehearsal', '-e', `POSTGRES_PASSWORD=${databasePassword}`, 'postgres:16-alpine'], { phase: 'database_create' });
    await command('docker', ['create', '--name', api, ...labels, '--network', network, '--network-alias', 'api', '-p', '127.0.0.1::8080', '-e', 'NODE_ENV=production', '-e', 'DEPLOYMENT_ENVIRONMENT=staging', '-e', 'PORT=8080', '-e', 'BIND_HOST=0.0.0.0', '-e', `APP_COMMIT=${targetCommit}`, '-e', 'JWT_SECRET=disposable-jwt-secret-not-persisted', '-e', `DATABASE_URL=postgres://shareittoo_rehearsal:${databasePassword}@db:5432/shareittoo_rehearsal`, '-e', 'MFA_ENCRYPTION_KEY=disposable-mfa-key-not-persisted', '-e', 'PAYMENT_TRANSPORT=memory', '-e', 'STRIPE_LIVEMODE=false', '-e', 'IDENTITY_VERIFICATION_TRANSPORT=disabled', '-e', 'SIT_LISTING_AI_PROVIDER=mock', '-e', 'PUSH_TRANSPORT=memory', '-e', 'MAIL_TRANSPORT=disabled', disposableCandidateImage], { phase: 'candidate_create' });
    for (const [resourceType, name] of [['network', network], ['volume', volume], ['container', database], ['container', api]]) {
      const inspected = await inspectLabels(command, name, resourceType === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}', `${resourceType}_identity`);
      assertDisposableResourceIdentity({ resourceType, name, labels: inspected, runId });
    }
    await command('docker', ['start', database], { phase: 'database_start' });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try { await command('docker', ['exec', database, 'pg_isready', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal'], { phase: 'database_ready' }); break; } catch { if (attempt === 59) fail('database_not_ready'); }
    }
    await commandWithFileInput('docker', ['exec', '-i', database, 'pg_restore', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal', '--no-owner', '--no-acl'], backupPath, { phase: 'restore' });
    const preFingerprint = await queryFingerprint({ command, container: database, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal', sql: compatibilityReadinessSql() });
    await command('docker', ['start', api], { phase: 'candidate_start' });
    const apiPort = await hostPort(command, api, 8080);
    let version;
    for (let attempt = 0; attempt < 60; attempt += 1) { try { const response = await fetchImpl(`http://127.0.0.1:${apiPort}/version`); if (response.ok) { version = await response.json(); break; } } catch {} if (attempt === 59) fail('candidate_version_timeout'); }
    if (version?.commit !== targetCommit) fail('candidate_version_commit_mismatch');
    const live = await fetchImpl(`http://127.0.0.1:${apiPort}/health/live`); if (!live.ok) fail('candidate_live_failed');
    const ready = await fetchImpl(`http://127.0.0.1:${apiPort}/health/ready`); if (ready.status !== 503) fail('readiness_blocker_not_observed');
    let readinessPayload;
    try { readinessPayload = await ready.json(); } catch { fail('readiness_payload_unreadable'); }
    if (readinessPayload?.status !== 'degraded') fail('readiness_status_not_degraded');
    const postFingerprint = await queryFingerprint({ command, container: database, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal', sql: buildReadinessFindingSql({ contractVersion: readinessContractVersion, payoutHoldHours: 48 }) });
    assertReadinessFindingsUnchanged(preFingerprint, postFingerprint);
    const ledger = await queryText({ command, container: database, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal', sql: "SELECT count(*), count(DISTINCT (regexp_match(name, '^([0-9]+)_'))[1]::int), min((regexp_match(name, '^([0-9]+)_'))[1]::int), max((regexp_match(name, '^([0-9]+)_'))[1]::int) FROM schema_migrations", phase: 'ledger' });
    if (ledger !== '87|87|1|87') fail('ledger_invalid');
    await command('docker', ['exec', '-i', api, 'node', '--input-type=module'], { input: mfaProbe, phase: 'mfa_probe' }).catch(() => fail('mfa_probe_failed'));
    evidence = { status: 'technical-probes-passed-operational-release-blocked', runtimeCommit: targetCommit, image: disposableCandidateImage, imageDigest: disposableCandidateImageDigest, backup, runId, resources, readiness: { http: 503, status: readinessPayload.status, preFingerprint, postFingerprint }, providerTraffic: false, liveDatabaseMutated: false };
    return evidence;
  } finally {
    const errors = [];
    for (const [kind, name] of [['container', api], ['container', database], ['volume', volume], ['network', network]]) { try { const error = await removeResource(kind, name); if (error) errors.push(error); } catch { errors.push(`cleanup_${kind}_failed`); } }
    cleanup = { removed: errors.length === 0, errors };
    if (errors.length > 0) fail('cleanup_required');
    if (evidence) evidence.cleanup = cleanup;
    if (evidence && evidencePath) {
      await mkdir(resolve(evidencePath, '..'), { recursive: true, mode: 0o700 });
      await writeFile(evidencePath, `${JSON.stringify({ ...evidence, cleanup }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      await chmod(evidencePath, 0o600);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDisposableCandidateAcceptance({ backupPath: process.argv[2], manifestPath: process.argv[3], execute: true, confirmation: process.argv[4] })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${error?.message ?? 'Disposable candidate acceptance failed.'}\n`); process.exitCode = 1; });
}
