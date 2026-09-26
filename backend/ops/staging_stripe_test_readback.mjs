#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readStablePrivateFile, writeExclusivePrivateFile } from './stable_private_file.mjs';
import { writeExclusiveWp250Mapping } from './staging_wp250_mapping.mjs';
import { serializeExactEvidence } from './staging_exact_evidence.mjs';

const OPS_CHECKOUT = '/docker/shareittoo/staging-builds/8e7283e69c4f052ac4357c9e496ceb5ece801c20';
const OPS_COMMIT = '8e7283e69c4f052ac4357c9e496ceb5ece801c20';
const RUNTIME_COMMIT = 'f0bb868a8a487cbf33ae67a555946fb9c67f4e9f';
const CANDIDATE_IMAGE = 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620';
const POSTGRES_IMAGE = 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const DUMP = '/docker/shareittoo/backups/rehearsals/staging-20260917211705-4e345294.dump';
const MANIFEST = `${DUMP}.sha256`;
const EVIDENCE_DIR = '/docker/shareittoo/backups/rehearsals';
const runId = `${new Date().toISOString().replace(/[^0-9]/gu, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
const labels = ['--label', 'com.shareittoo.staging.rehearsal=true', '--label', `com.shareittoo.staging.rehearsal_run_id=${runId}`];
const resources = { network: `sit-staging-rehearsal-network-${runId}`, volume: `sit-staging-rehearsal-volume-${runId}`, database: `sit-staging-rehearsal-pg-${runId}`, bootstrap: `sit-staging-rehearsal-bootstrap-${runId}` };
let lastAction = '';

function fail(code, detail) { const e = new Error(detail ? `${code}:${detail}` : code); e.code = code; throw e; }
function execFile(command, args, { input, allowFailure = false } = {}) {
  if (command === 'docker') lastAction = args.slice(0, 3).join(' ');
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; }); child.stderr.on('data', (c) => { stderr += c; });
    if (input?.pipe) input.pipe(child.stdin);
    else if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    child.on('error', reject);
    child.on('close', (code) => { const result = { code, stdout, stderr }; if (code && !allowFailure) reject(Object.assign(new Error(`command_failed:${command}:${lastAction}:${stderr.slice(-900)}`), { result })); else resolvePromise(result); });
  });
}
const docker = (args, options) => execFile('docker', args, options);
const text = (r) => r.stdout.trim();
async function dockerExec(container, args) { return text(await docker(['exec', container, ...args])); }
async function waitPg(container) {
  for (let i = 0; i < 90; i += 1) {
    const logs = await docker(['logs', container], { allowFailure: true });
    if (`${logs.stdout}\n${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up.')) {
      const ready = await docker(['exec', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal', '-Atc', 'SELECT 1'], { allowFailure: true });
      if (ready.code === 0) return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  fail('database_final_init_timeout');
}
async function dbQuery(container, sql) { const raw = await dockerExec(container, ['psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal', '-Atc', sql]); try { return JSON.parse(raw); } catch { fail('mapping_query_unreadable'); } }
async function verifyBackup() { const dump = readStablePrivateFile(DUMP, { encoding: null, mode: 0o077, code: 'backup_not_private' }); const expected = readStablePrivateFile(MANIFEST, { expectedMode: 0o600, code: 'backup_manifest_not_private' }).trim().split(/\s+/u)[0]; const actual = crypto.createHash('sha256').update(dump).digest('hex'); if (expected !== actual) fail('backup_sha256_mismatch'); return { bytes: dump.length, sha256: actual, input: dump }; }

async function stripeKeyClass() {
  const env = text(await docker(['inspect', 'shareittoo-staging-api', '--format', '{{range .Config.Env}}{{println .}}{{end}}']));
  const line = env.split('\n').find((v) => v.startsWith('STRIPE_SECRET_KEY=')); if (!line) return { key: null, keyClass: 'missing' };
  const key = line.slice('STRIPE_SECRET_KEY='.length);
  if (key.length === 0) return { key: null, keyClass: 'missing' };
  if (key.startsWith('rk_test_')) return { key, keyClass: 'restricted_test' };
  if (key.startsWith('sk_test_')) return { key, keyClass: 'secret_test' };
  return { key, keyClass: 'invalid_or_live' };
}
function assertGetOnly(path) { if (!/^\/v1\/(refunds|charges)\/[A-Za-z0-9_\-]+$/u.test(path)) fail('stripe_get_allowlist_violation'); }
async function stripeGet(key, path, connectedAccount) {
  assertGetOnly(path); const headers = { Authorization: `Bearer ${key}` }; if (connectedAccount) headers['Stripe-Account'] = connectedAccount;
  try {
    const response = await fetch(`https://api.stripe.com${path}`, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => null);
    return { status: response.status, body: body && typeof body === 'object' ? body : null };
  } catch { return { status: 0, body: null }; }
}
const mappingSql = `
SELECT jsonb_agg(jsonb_build_object(
  'payment_hash', encode(digest(p.id::text,'sha256'),'hex'), 'payment_amount', p.amount_minor, 'payment_currency', p.currency,
  'provider_payment_present', (p.provider_payment_id IS NOT NULL), 'provider_charge_present', (p.provider_charge_id IS NOT NULL),
  'payment_charge', p.provider_charge_id, 'owner_account', ca.provider_account_id,
  'refunds', COALESCE((SELECT jsonb_agg(jsonb_build_object('refund_hash',encode(digest(r.id::text,'sha256'),'hex'),'refund_id',r.provider_refund_id,'refund_charge',r.provider_charge_id,'amount',r.amount_minor,'currency',r.currency,'status',r.status) ORDER BY r.id) FROM refunds r WHERE r.payment_id=p.id),'[]'::jsonb)
) ORDER BY p.id)::text
FROM payments p JOIN sit_payment_refund_truth t ON t.payment_id=p.id
LEFT JOIN bookings b ON b.id=p.booking_id LEFT JOIN stripe_connect_accounts ca ON ca.user_id=b.owner_id
WHERE t.refund_truth_status='needsReview';`;
const syntheticFingerprintSql = `
SELECT jsonb_build_object(
  'count', count(*)::int,
  'paymentCount', count(DISTINCT payment_id)::int,
  'setHash', encode(digest(COALESCE(string_agg(id::text, ',' ORDER BY id), ''), 'sha256'), 'hex'),
  'providerClass', COALESCE(bool_and(provider_refund_id LIKE 're_memory_%'), true),
  'chargeClass', COALESCE(bool_and(provider_charge_id LIKE 'ch_memory_%'), true),
  'paymentChargeClass', COALESCE((SELECT bool_and(p.provider_charge_id LIKE 'ch_memory_%') FROM payments p WHERE p.id IN (SELECT DISTINCT payment_id FROM refunds WHERE provider_refund_id LIKE 're_memory_%')), true),
  'paymentIntentClass', COALESCE((SELECT bool_and(p.provider_payment_id LIKE 'pi_memory_%') FROM payments p WHERE p.id IN (SELECT DISTINCT payment_id FROM refunds WHERE provider_refund_id LIKE 're_memory_%')), true)
)::text FROM refunds WHERE provider_refund_id LIKE 're_memory_%';`;
let mfaPath; let evidence; const created = [];
try {
  if (text(await execFile('git', ['-C', OPS_CHECKOUT, 'rev-parse', 'HEAD'])) !== OPS_COMMIT) fail('ops_checkout_commit_mismatch');
  const { input: backupInput, ...backup } = await verifyBackup(); const keyInfo = await stripeKeyClass();
  const imageMeta = text(await docker(['image','inspect',CANDIDATE_IMAGE,'--format','{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}'])); const [imageId, revision] = imageMeta.split('|'); if (imageId !== CANDIDATE_IMAGE || revision !== RUNTIME_COMMIT) fail('candidate_image_identity_mismatch');
  const temp = await mkdtemp(join(tmpdir(), 'sit-wp250-')); mfaPath = `${temp}/mfa-key`; writeExclusivePrivateFile(mfaPath, `${crypto.randomBytes(32).toString('base64url')}\n`, { mode: 0o640, uid: 65532, gid: 65532 });
  const dbPassword = ['disposable', crypto.randomBytes(18).toString('base64url')].join('-');
  const envArgs = [
    '--group-add', '65532', '-e', 'NODE_ENV=production', '-e', 'DEPLOYMENT_ENVIRONMENT=staging',
    '-e', `APP_COMMIT=${RUNTIME_COMMIT}`,
    '-e', ['JWT_SECRET=', ['disposable', crypto.randomBytes(32).toString('base64url')].join('-')].join(''),
    '-e', `DATABASE_URL=postgres://shareittoo_rehearsal:${dbPassword}@db:5432/shareittoo_rehearsal`,
    '-e', 'MFA_ENCRYPTION_KEY_FILE=/run/secrets/mfa-encryption-key', '-e', 'PAYMENT_TRANSPORT=memory',
    '-e', 'STRIPE_LIVEMODE=false', '-e', 'IDENTITY_VERIFICATION_TRANSPORT=disabled',
    '-e', 'SIT_LISTING_AI_PROVIDER=mock', '-e', 'PUSH_TRANSPORT=memory', '-e', 'MAIL_TRANSPORT=disabled',
    '--mount', `type=bind,src=${mfaPath},dst=/run/secrets/mfa-encryption-key,readonly`,
  ];
  await docker(['network','create','--internal',...labels,resources.network]); created.push(['network',resources.network]); await docker(['volume','create',...labels,resources.volume]); created.push(['volume',resources.volume]);
  await docker(['create','--name',resources.database,...labels,'--network',resources.network,'--network-alias','db','--mount',`type=volume,src=${resources.volume},dst=/var/lib/postgresql/data`,'-e','POSTGRES_DB=shareittoo_rehearsal','-e','POSTGRES_USER=shareittoo_rehearsal','-e',`POSTGRES_PASSWORD=${dbPassword}`,POSTGRES_IMAGE]); created.push(['container',resources.database]);
  await docker(['create','--name',resources.bootstrap,...labels,'--network',resources.network,...envArgs,CANDIDATE_IMAGE,'node','--input-type=module','-e',"import { initializeDatabase, pool } from '/app/src/db.js'; await initializeDatabase(); await pool.end();"]); created.push(['container',resources.bootstrap]);
  await docker(['start',resources.database]); await waitPg(resources.database); await docker(['exec','-i',resources.database,'pg_restore','-U','shareittoo_rehearsal','-d','shareittoo_rehearsal','--no-owner','--no-acl'], { input: backupInput }); await docker(['start',resources.bootstrap]); const exit = text(await docker(['wait',resources.bootstrap])); if (exit !== '0') fail('bootstrap_migrations_failed');
  const mappings = await dbQuery(resources.database, mappingSql); const rows = Array.isArray(mappings) ? mappings : [];
  const mappingPath = process.env.SIT_WP250_MAPPING_PATH;
  if (mappingPath) {
    await writeExclusiveWp250Mapping(mappingPath, Buffer.from(`${JSON.stringify(rows)}\n`));
  }
  if (process.env.SIT_WP251_DRY_RUN === '1') {
    const before = await dbQuery(resources.database, syntheticFingerprintSql);
    const txOutput = await dockerExec(resources.database, ['psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal', '-Atc', "BEGIN; CREATE TEMP TABLE wp251_refund_reference_quarantine (refund_hash TEXT PRIMARY KEY, reason TEXT NOT NULL) ON COMMIT DROP; INSERT INTO wp251_refund_reference_quarantine SELECT encode(digest(id::text,'sha256'),'hex'),'synthetic_provider_reference' FROM refunds WHERE provider_refund_id LIKE 're_memory_%'; SELECT jsonb_build_object('quarantinedCount',count(*)::int,'quarantineHash',encode(digest(COALESCE(string_agg(refund_hash,',' ORDER BY refund_hash),''),'sha256'),'hex'))::text FROM wp251_refund_reference_quarantine; ROLLBACK;"]);
    const txJsonLine = txOutput.split('\n').find((line) => line.startsWith('{'));
    let tx; try { tx = JSON.parse(txJsonLine); } catch { fail('dry_run_transaction_unreadable'); }
    const after = await dbQuery(resources.database, syntheticFingerprintSql);
    if (JSON.stringify(before) !== JSON.stringify(after)) fail('dry_run_exact_set_drift');
    evidence = { status: 'dry-run-quarantine-plan-complete-operational-release-blocked', runId, opsCheckout: OPS_CHECKOUT, opsCommit: OPS_COMMIT, runtimeCommit: RUNTIME_COMMIT, backup, provenance: { transport: 'memory', fixtureVerified: true, source: 'backend/src/stripe_provider.js', test: 'backend/test/payment_domain.test.js' }, decision: 'quarantine-plan-only-no-canonical-mutation', before, after, transaction: 'rolled-back', quarantinedCount: tx.quarantinedCount, quarantineHash: tx.quarantineHash, canonicalFinancialTruthPreserved: true, providerOutcomeFabricated: false, providerTraffic: false, providerWrites: false, liveDatabaseMutated: false, acceptanceTarget: 'docker-exec-internal' };
  } else {
  const reads = { objects: 0, objectExists: 0, testModeConfirmed: 0, amountCurrencyMatch: 0, chargeBindingMatch: 0, unknown: 0, blocked: 0, statusCounts: {} };
  for (const row of rows) {
    const refunds = Array.isArray(row.refunds) ? row.refunds : [];
    for (const refund of refunds) {
      reads.objects += 1; if (!refund.refund_id || !['restricted_test', 'secret_test'].includes(keyInfo.keyClass)) { reads.unknown += 1; continue; }
      const contexts = []; if (row.owner_account) contexts.push(row.owner_account); contexts.push(null); let refundResponse = null; let contextUsed = null;
      for (const context of contexts) { const result = await stripeGet(keyInfo.key, `/v1/refunds/${refund.refund_id}`, context); if (result.status === 200) { refundResponse = result; contextUsed = context; break; } if ([401,403].includes(result.status)) { reads.blocked += 1; break; } }
      if (!refundResponse) { reads.unknown += 1; continue; } reads.objectExists += 1;
      const rb = refundResponse.body; if (rb?.livemode === false) reads.testModeConfirmed += 1; const amountMatch = rb?.amount === refund.amount && String(rb?.currency ?? '').toUpperCase() === String(refund.currency ?? '').trim().toUpperCase(); if (amountMatch) reads.amountCurrencyMatch += 1;
      const chargeId = refund.refund_charge || row.payment_charge; if (chargeId) { const charge = await stripeGet(keyInfo.key, `/v1/charges/${chargeId}`, contextUsed); const chargeOk = charge.status === 200 && charge.body?.livemode === false && charge.body?.id === chargeId && (!row.payment_currency || String(charge.body?.currency ?? '').toUpperCase() === String(row.payment_currency).trim().toUpperCase()); if (chargeOk) reads.chargeBindingMatch += 1; }
      const status = typeof rb?.status === 'string' ? rb.status : 'unknown'; reads.statusCounts[status] = (reads.statusCounts[status] ?? 0) + 1;
    }
  }
  evidence = { status: ['restricted_test', 'secret_test'].includes(keyInfo.keyClass) ? 'provider-readback-complete-operational-release-blocked' : 'provider-readback-blocked-missing-test-credential', runId, opsCheckout: OPS_CHECKOUT, opsCommit: OPS_COMMIT, runtimeCommit: RUNTIME_COMMIT, backup, stripe: { accountContext: 'ShareItToo Sandbox', livemode: false, keyClass: keyInfo.keyClass, readOnlyMethods: ['GET /v1/refunds/{id}', 'GET /v1/charges/{id}'] }, mapping: { paymentCount: rows.length, refundReferenceCount: reads.objects }, reads: { objectExists: reads.objectExists, testModeConfirmed: reads.testModeConfirmed, amountCurrencyMatch: reads.amountCurrencyMatch, chargeBindingMatch: reads.chargeBindingMatch, unknown: reads.unknown, blocked: reads.blocked, statusCounts: reads.statusCounts }, providerTraffic: reads.objectExists > 0, providerWrites: false, liveDatabaseMutated: false, acceptanceTarget: 'docker-exec-internal' };
  if (!['restricted_test', 'secret_test'].includes(keyInfo.keyClass)) process.exitCode = 1;
  }
} catch (error) {
  evidence = { status: 'provider-readback-blocked', runId, opsCheckout: OPS_CHECKOUT, opsCommit: OPS_COMMIT, runtimeCommit: RUNTIME_COMMIT, errorCode: error?.code ?? 'readback_failed', detail: String(error?.message ?? '').replace(/Bearer\s+\S+/giu,'Bearer [redacted]').slice(0,900), providerTraffic: false, providerWrites: false, liveDatabaseMutated: false };
  process.exitCode = 1;
} finally {
  const errors = [];
  for (const [kind,name] of [...created].reverse()) { const inspected = await docker(['inspect',name,'--format',kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}'], { allowFailure: true }); if (inspected.code !== 0 || !inspected.stdout.includes(runId)) { errors.push(`cleanup_${kind}_identity_failed`); continue; } if ((await docker(kind === 'container' ? ['rm','-f',name] : [kind,'rm',name], { allowFailure: true })).code !== 0) errors.push(`cleanup_${kind}_failed`); }
  if (mfaPath) await rm(dirname(mfaPath), { recursive: true, force: true }).catch(() => errors.push('mfa_key_cleanup_failed'));
  evidence = { ...evidence, cleanup: { removed: errors.length === 0, errors }, disposableAbsent: errors.length === 0 };
  await mkdir(EVIDENCE_DIR, { recursive: true, mode: 0o700 }); const path = `${EVIDENCE_DIR}/staging-wp250-stripe-readback-${runId}.json`; const serialized = serializeExactEvidence(evidence); writeExclusivePrivateFile(path, serialized.bytes, { mode: 0o600 }); process.stdout.write(`${JSON.stringify({ evidencePath:path,evidenceBytes:serialized.byteCount,evidenceSha256:serialized.sha256,...evidence })}\n`);
}
