#!/usr/bin/env node

import crypto from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readStablePrivateFile } from './stable_private_file.mjs';

const OPS_CHECKOUT = '/docker/shareittoo/staging-builds/8e7283e69c4f052ac4357c9e496ceb5ece801c20';
const OPS_COMMIT = '8e7283e69c4f052ac4357c9e496ceb5ece801c20';
const CANDIDATE_COMMIT = 'f0bb868a8a487cbf33ae67a555946fb9c67f4e9f';
const CANDIDATE_IMAGE = 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620';
const POSTGRES_IMAGE = 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const DUMP = '/docker/shareittoo/backups/rehearsals/staging-20260917211705-4e345294.dump';
const MANIFEST = `${DUMP}.sha256`;
const EVIDENCE_DIR = '/docker/shareittoo/backups/rehearsals';

const runId = `${new Date().toISOString().replace(/[^0-9]/gu, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
const labelArgs = ['--label', 'com.shareittoo.staging.rehearsal=true', '--label', `com.shareittoo.staging.rehearsal_run_id=${runId}`];
const resources = {
  network: `sit-staging-rehearsal-network-${runId}`,
  volume: `sit-staging-rehearsal-volume-${runId}`,
  database: `sit-staging-rehearsal-pg-${runId}`,
  bootstrap: `sit-staging-rehearsal-bootstrap-${runId}`,
};
let lastDockerAction = '';

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function execFile(command, args, { input, allowFailure = false } = {}) {
  if (command === 'docker') lastDockerAction = String(args.slice(0, 3).join(' '));
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    if (input?.pipe) input.pipe(child.stdin);
    else if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code, stdout, stderr };
      if (code !== 0 && !allowFailure) reject(Object.assign(new Error(`command_failed:${command}:${lastDockerAction}:${String(stderr).replace(/postgres:\/\/[^\s]+/gu, 'postgres://[redacted]').slice(-1200)}`), { result }));
      else resolvePromise(result);
    });
  });
}

const docker = (args, options) => execFile('docker', args, options);
const out = (result) => result.stdout.trim();

async function dockerInspect(name, format) {
  const result = await docker(['inspect', name, '--format', format]);
  return out(result);
}

async function dockerExec(container, args) {
  return out(await docker(['exec', container, ...args]));
}

async function waitForPostgres(container) {
  for (let i = 0; i < 90; i += 1) {
    const logs = await docker(['logs', container], { allowFailure: true });
    if (`${logs.stdout}\n${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.')) {
      const sql = await docker(['exec', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal', '-Atc', 'SELECT 1'], { allowFailure: true });
      if (sql.code === 0) return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  fail('database_final_init_timeout');
}

const findingSql = `
WITH contract_blocked AS (
  SELECT DISTINCT ON (payment.id) encode(digest(payment.id::text, 'sha256'), 'hex') AS id_hash,
    'contract_blocked' AS cause, payment.status,
    CASE WHEN COALESCE(booking.payout_instruction_due_at, booking.completed_at, booking.ends_at) <= now() - interval '24 hours' THEN '>24h'
         WHEN COALESCE(booking.payout_instruction_due_at, booking.completed_at, booking.ends_at) <= now() - interval '1 hour' THEN '1-24h' ELSE '<1h' END AS time_class
  FROM payments payment JOIN bookings booking ON booking.id = payment.booking_id
  LEFT JOIN platform_contracts contract ON contract.booking_id = booking.id
  LEFT JOIN LATERAL (SELECT payout.status FROM payouts payout WHERE payout.payment_id = payment.id AND payout.status IN ('scheduled','pending','failed') ORDER BY payout.created_at DESC,payout.id DESC LIMIT 1) active_payout ON true
  JOIN sit_payment_refund_truth refund_truth ON refund_truth.payment_id = payment.id
  WHERE booking.workflow_status IN ('completed','cancelled') AND payment.status IN ('captured','partially_refunded')
    AND payment.transferred_minor < payment.owner_payout_minor - refund_truth.settled_owner_refund_minor
    AND active_payout.status IS DISTINCT FROM 'failed' AND refund_truth.refund_truth_status IN ('none','providerBound')
    AND ((booking.workflow_status='completed' AND (booking.payout_instruction_due_at <= now() OR (booking.payout_instruction_due_at IS NULL AND booking.completed_at <= now() - (48 * interval '1 hour'))))
      OR (booking.workflow_status='cancelled' AND booking.ends_at <= now() - (48 * interval '1 hour')))
    AND (contract.id IS NULL OR contract.contract_version IS DISTINCT FROM 'V5.2-2026-08-16' OR contract.user_id IS DISTINCT FROM booking.renter_id OR contract.accepted_at IS NULL OR NOT isfinite(contract.accepted_at) OR contract.created_at IS NULL OR NOT isfinite(contract.created_at)
      OR date_trunc('milliseconds',contract.accepted_at) < date_trunc('milliseconds',contract.created_at)-interval '5 minutes' OR date_trunc('milliseconds',contract.accepted_at) > date_trunc('milliseconds',contract.created_at)+interval '5 minutes')
), payment_findings AS (
  SELECT 'dispute' source, encode(digest(id::text,'sha256'),'hex') id_hash,'transfer_recovery_needs_review' cause,status,CASE WHEN updated_at<=now()-interval '24 hours' THEN '>24h' WHEN updated_at<=now()-interval '1 hour' THEN '1-24h' ELSE '<1h' END time_class FROM disputes WHERE transfer_recovery_needs_review=true
  UNION ALL SELECT 'refund_transfer_reversal',encode(digest(id::text,'sha256'),'hex'),'refund_transfer_reversal_needs_review',status,CASE WHEN updated_at<=now()-interval '24 hours' THEN '>24h' WHEN updated_at<=now()-interval '1 hour' THEN '1-24h' ELSE '<1h' END FROM refund_transfer_reversals WHERE needs_review=true OR status='manual_review'
  UNION ALL SELECT 'payout',encode(digest(id::text,'sha256'),'hex'),'payout_failed',status,CASE WHEN updated_at<=now()-interval '24 hours' THEN '>24h' WHEN updated_at<=now()-interval '1 hour' THEN '1-24h' ELSE '<1h' END FROM payouts WHERE status='failed'
  UNION ALL SELECT 'payment_refund_truth',encode(digest(payment_id::text,'sha256'),'hex'),'refund_truth_needs_review',refund_truth_status,'derived' FROM sit_payment_refund_truth WHERE refund_truth_status='needsReview'
  UNION ALL SELECT 'contract_blocked',id_hash,cause,status,time_class FROM contract_blocked
), support_findings AS (
  SELECT encode(digest(id::text,'sha256'),'hex') id_hash,'next_update_overdue' cause,status,priority,CASE WHEN next_update_at<=now()-interval '24 hours' THEN '>24h' WHEN next_update_at<=now()-interval '1 hour' THEN '1-24h' ELSE '<1h' END time_class
  FROM support_cases WHERE operating_mode IN ('simulation','internal_testing') AND status NOT IN ('resolved','closed') AND next_update_at<=now()
)
SELECT jsonb_build_object('paymentRecoveryNeedsReview',COALESCE((SELECT jsonb_agg(to_jsonb(payment_findings) ORDER BY source,id_hash,cause,status,time_class) FROM payment_findings),'[]'::jsonb),'supportNextUpdateOverdue',COALESCE((SELECT jsonb_agg(to_jsonb(support_findings) ORDER BY id_hash,cause,status,priority,time_class) FROM support_findings),'[]'::jsonb))::text;`;

const causeSql = `
SELECT jsonb_build_object(
  'refunds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'payment_id_hash', encode(digest(t.payment_id::text,'sha256'),'hex'),
    'refund_truth_status', t.refund_truth_status,
    'payment_status', p.status,
    'payment_refunded_minor_matches', t.refund_cache_matches_settlement,
    'refund_status_matches_settlement', t.refund_status_matches_settlement,
    'untrusted_refund_count', t.untrusted_refund_count,
    'invalid_refund_count', t.invalid_refund_count,
    'provider_observation_review_count', t.provider_observation_review_count,
    'provider_bound_local_review_count', t.provider_bound_local_review_count,
    'provider_bound_local_pending_count', t.provider_bound_local_pending_count,
    'settled_refund_minor', t.settled_refund_minor
  ) ORDER BY t.payment_id) FROM sit_payment_refund_truth t JOIN payments p ON p.id=t.payment_id WHERE t.refund_truth_status='needsReview'),'[]'::jsonb),
  'support', COALESCE((SELECT jsonb_agg(jsonb_build_object('id_hash',encode(digest(s.id::text,'sha256'),'hex'),'status',s.status,'priority',s.priority,'time_class',CASE WHEN s.next_update_at<=now()-interval '24 hours' THEN '>24h' WHEN s.next_update_at<=now()-interval '1 hour' THEN '1-24h' ELSE '<1h' END) ORDER BY s.id) FROM support_cases s WHERE s.operating_mode IN ('simulation','internal_testing') AND s.status NOT IN ('resolved','closed') AND s.next_update_at<=now()),'[]'::jsonb)
)::text;`;

async function queryJson(container, sql) {
  const value = await dockerExec(container, ['psql','-X','--set','ON_ERROR_STOP=1','-U','shareittoo_rehearsal','-d','shareittoo_rehearsal','-Atc',sql]);
  try { return JSON.parse(value); } catch { fail('diagnosis_query_unreadable'); }
}

function classify(fingerprint) {
  const payment = (fingerprint.paymentRecoveryNeedsReview ?? []).map((f) => ({ ...f, classification: 'staging_operation', remediation: 'reconcile provider refund truth and perform authorized review; do not auto-resolve' }));
  const support = (fingerprint.supportNextUpdateOverdue ?? []).map((f) => ({ ...f, classification: 'staging_operation', remediation: 'support owner must post a valid progress update or close via governed workflow; do not auto-resolve' }));
  return { status: 'classified', payment, support, liveRemediation: 'blocked-until-source-classification-and-expected-set-match' };
}

async function verifyBackup() {
  const dump = readStablePrivateFile(DUMP, { encoding: null, mode: 0o077, code: 'backup_not_private' });
  const expected = readStablePrivateFile(MANIFEST, { expectedMode: 0o600, code: 'backup_manifest_not_private' }).trim().split(/\s+/u)[0];
  const actual = crypto.createHash('sha256').update(dump).digest('hex');
  if (expected !== actual) fail('backup_sha256_mismatch');
  return { bytes: dump.length, sha256: actual, input: dump };
}

let mfaPath;
let evidence;
let failureDetail;
const created = [];
try {
  const opsHead = out(await execFile('git', ['-C', OPS_CHECKOUT, 'rev-parse', 'HEAD']));
  if (opsHead !== OPS_COMMIT) fail('ops_checkout_commit_mismatch');
  const backup = await verifyBackup();
  const imageMeta = out(await docker(['image','inspect',CANDIDATE_IMAGE,'--format','{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}']));
  const [imageId, revision] = imageMeta.split('|');
  if (imageId !== CANDIDATE_IMAGE || revision !== CANDIDATE_COMMIT) fail('candidate_image_identity_mismatch');
  const temp = await mkdtemp(join(tmpdir(), 'sit-wp249-'));
  mfaPath = `${temp}/mfa-key`;
  await writeFile(mfaPath, `${crypto.randomBytes(32).toString('base64url')}\n`, { mode: 0o640 });
  await chmod(mfaPath, 0o640);
  await execFile('chown', ['65532:65532', mfaPath]);
  const dbPassword = ['disposable', crypto.randomBytes(18).toString('base64url')].join('-');
  const baseEnv = [
    '--group-add', '65532', '-e', 'NODE_ENV=production', '-e', 'DEPLOYMENT_ENVIRONMENT=staging',
    '-e', `APP_COMMIT=${CANDIDATE_COMMIT}`,
    '-e', ['JWT_SECRET=', ['disposable', crypto.randomBytes(32).toString('base64url')].join('-')].join(''),
    '-e', `DATABASE_URL=postgres://shareittoo_rehearsal:${dbPassword}@db:5432/shareittoo_rehearsal`,
    '-e', 'MFA_ENCRYPTION_KEY_FILE=/run/secrets/mfa-encryption-key', '-e', 'PAYMENT_TRANSPORT=memory',
    '-e', 'STRIPE_LIVEMODE=false', '-e', 'IDENTITY_VERIFICATION_TRANSPORT=disabled',
    '-e', 'SIT_LISTING_AI_PROVIDER=mock', '-e', 'PUSH_TRANSPORT=memory', '-e', 'MAIL_TRANSPORT=disabled',
    '--mount', `type=bind,src=${mfaPath},dst=/run/secrets/mfa-encryption-key,readonly`,
  ];
  await docker(['network','create','--internal',...labelArgs,resources.network]); created.push(['network',resources.network]);
  await docker(['volume','create',...labelArgs,resources.volume]); created.push(['volume',resources.volume]);
  await docker(['create','--name',resources.database,...labelArgs,'--network',resources.network,'--network-alias','db','--mount',`type=volume,src=${resources.volume},dst=/var/lib/postgresql/data`,'-e','POSTGRES_DB=shareittoo_rehearsal','-e','POSTGRES_USER=shareittoo_rehearsal','-e',`POSTGRES_PASSWORD=${dbPassword}`,POSTGRES_IMAGE]); created.push(['container',resources.database]);
  await docker(['create','--name',resources.bootstrap,...labelArgs,'--network',resources.network,...baseEnv,CANDIDATE_IMAGE,'node','--input-type=module','-e',"import { initializeDatabase, pool } from '/app/src/db.js'; await initializeDatabase(); await pool.end();"]); created.push(['container',resources.bootstrap]);
  await docker(['start',resources.database]); await waitForPostgres(resources.database);
  await docker(['exec','-i',resources.database,'pg_restore','-U','shareittoo_rehearsal','-d','shareittoo_rehearsal','--no-owner','--no-acl'], { input: backup.input });
  await docker(['start',resources.bootstrap]);
  const exit = out(await docker(['wait',resources.bootstrap]));
  if (exit !== '0') {
    const logs = out(await docker(['logs', resources.bootstrap], { allowFailure: true }));
    const state = out(await docker(['inspect', resources.bootstrap, '--format', '{{json .State}}'], { allowFailure: true }));
    failureDetail = JSON.stringify({ exit, state, logs: logs.replace(/postgres:\/\/[^\s]+/gu, 'postgres://[redacted]').slice(-2400) });
    fail('bootstrap_migrations_failed');
  }
  const fingerprint = await queryJson(resources.database, findingSql);
  const causes = await queryJson(resources.database, causeSql);
  evidence = { status: 'classified-source-readback-complete-operational-release-blocked', runId, opsCheckout: OPS_CHECKOUT, opsCommit: OPS_COMMIT, runtimeCommit: CANDIDATE_COMMIT, imageDigest: CANDIDATE_IMAGE, postgresImage: POSTGRES_IMAGE, backup, findings: fingerprint, classified: classify(fingerprint), causes, providerTraffic: false, liveDatabaseMutated: false, acceptanceTarget: 'docker-exec-internal', hostPortPublished: false };
} catch (error) {
  evidence = { status: 'diagnosis-failed', runId, opsCheckout: OPS_CHECKOUT, opsCommit: OPS_COMMIT, runtimeCommit: CANDIDATE_COMMIT, errorCode: error?.code ?? 'diagnosis_failed', failureDetail: failureDetail ?? String(error?.message ?? '').slice(0, 800), providerTraffic: false, liveDatabaseMutated: false };
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  for (const [kind,name] of [...created].reverse()) {
    const inspected = await docker(['inspect',name,'--format',kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}'], { allowFailure: true });
    if (inspected.code !== 0 || !inspected.stdout.includes(runId)) { cleanupErrors.push(`cleanup_${kind}_identity_failed`); continue; }
    const removed = await docker(kind === 'container' ? ['rm','-f',name] : [kind,'rm',name], { allowFailure: true });
    if (removed.code !== 0) cleanupErrors.push(`cleanup_${kind}_failed`);
  }
  if (mfaPath) await rm(dirname(mfaPath), { recursive: true, force: true }).catch(() => cleanupErrors.push('mfa_key_cleanup_failed'));
  const absent = await Promise.all(Object.values(resources).map(async (name) => (await docker(['inspect',name], { allowFailure: true })).code !== 0));
  if (absent.some((value) => !value)) cleanupErrors.push('disposable_resource_still_present');
  evidence = { ...evidence, cleanup: { removed: cleanupErrors.length === 0, errors: cleanupErrors }, disposableAbsent: cleanupErrors.length === 0 };
  await mkdir(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  const path = `${EVIDENCE_DIR}/staging-wp249-diagnosis-${runId}.json`;
  const serialized = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(path, serialized, { mode: 0o600, flag: 'wx' });
  await chmod(path, 0o600);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');
  process.stdout.write(`${JSON.stringify({ evidencePath: path, evidenceBytes: serialized.byteLength, evidenceSha256: hash, ...evidence })}\n`);
}
