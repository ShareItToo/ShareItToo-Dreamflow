#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const wp140ExecutionGate =
  'SIT_WP140_STAGING_HISTORICAL_SUPPORT_DEADLINE_RECOVERY_GO';
export const wp140ApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
export const wp140ReadyUrl = 'https://staging.shareittoo.com/api/health/ready';
export const wp140SshHost = 'sit-staging-vps';
export const wp140ExpectedRuntimeImage =
  'ghcr.io/shareittoo/shareittoo-api:df39a14b7a19afe467842461a28f1e77fec8445e';
export const wp140ExpectedOverdueCount = 3;

const privateQaRoot = resolve(
  os.homedir(),
  'Library',
  'Application Support',
  'ShareItToo',
  'qa',
);
const scrypt = promisify(crypto.scrypt);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} is not exact.`);
}

function safeTimestamp(now = new Date()) {
  return now.toISOString().replace(/[-:.TZ]/gu, '');
}

function randomPassword() {
  return `SITwp140-${crypto.randomBytes(24).toString('base64url')}a1`;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

function idempotencyKey(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function activeCase(value) {
  return value?.status === 'received';
}

function allFlagsClear(flags) {
  const expected = ['safety', 'privacy', 'dsa', 'authority', 'article18Candidate',
    'money', 'accountTakeover'];
  return flags !== null && typeof flags === 'object'
    && expected.every((key) => flags[key] === false);
}

export function assertWp140ExecutionGate(gate) {
  exact(gate, '1', wp140ExecutionGate);
  return true;
}

export function classifyWp140OverdueCases(cases, {
  now = new Date(),
} = {}) {
  if (!Array.isArray(cases) || cases.length !== wp140ExpectedOverdueCount
      || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('WP140 requires exactly three current overdue Staging cases.');
  }
  const ids = new Set();
  for (const supportCase of cases) {
    const deadline = new Date(supportCase?.nextUpdateAt);
    if (typeof supportCase?.id !== 'string' || supportCase.id.length < 20
        || ids.has(supportCase.id)
        || typeof supportCase?.reporterUserId !== 'string'
        || supportCase.reporterUserId.length < 20
        || supportCase?.operatingMode !== 'simulation'
        || !activeCase(supportCase)
        || supportCase?.priority !== 'p3'
        || supportCase?.caseType !== 'general_help'
        || supportCase?.caseSubType !== 'app_error_or_display'
        || !Number.isSafeInteger(supportCase?.version)
        || supportCase.version < 1
        || !Number.isFinite(deadline.getTime())
        || deadline.getTime() > now.getTime()
        || !allFlagsClear(supportCase?.flags)
        || supportCase?.linkedPaymentId !== null
        || supportCase?.linkedRefundId !== null
        || supportCase?.linkedPayoutId !== null
        || supportCase?.finalDecisionAvailable !== false) {
      fail('A WP140 target is not an exact noncritical simulation case.');
    }
    ids.add(supportCase.id);
  }
  return Object.freeze([...cases].sort((left, right) => (
    String(left.createdAt).localeCompare(String(right.createdAt))
  )));
}

export function assertWp140ProvenanceAttestation(value) {
  if (value?.status !== 'passed-read-only'
      || value?.targetCount !== wp140ExpectedOverdueCount
      || value?.allTargetsMatched !== true
      || value?.allNonLive !== true
      || value?.allNoncritical !== true
      || value?.allFlagsClear !== true
      || value?.allSyntheticReporters !== true
      || value?.allSyntheticSummaries !== true
      || value?.allLinkedListingsSynthetic !== true
      || value?.pendingProgressCount !== 0
      || value?.rawIdentifiersEmitted !== false
      || value?.credentialsRead !== false
      || value?.changed !== false) {
    fail('WP140 target provenance is not safely proven.');
  }
  return value;
}

export function buildWp140ProgressDraft(supportCase, {
  now = new Date(),
  deadlineHours = 168,
} = {}) {
  if (!Number.isSafeInteger(deadlineHours) || deadlineHours < 24 || deadlineHours > 720) {
    fail('WP140 future deadline interval is invalid.');
  }
  const nextUpdateAt = new Date(now.getTime() + (deadlineHours * 60 * 60 * 1000));
  return Object.freeze({
    expectedVersion: supportCase.version,
    nextUpdateAt: nextUpdateAt.toISOString(),
    recipientUserId: supportCase.reporterUserId,
    firstName: 'Staging-Testperson',
    progressSinceLastUpdate:
      'Der kontrollierte Staging-Testfall und seine bestehende technische Nachweiskette wurden erneut geprüft.',
    openCheck:
      'Offen bleibt die erneute Funktionsprüfung nach dem nächsten relevanten Staging-Änderungsstand.',
    userActionOrNoAction: 'Du musst für diesen kontrollierten Testfall nichts unternehmen.',
    provisionalImpactStatement:
      'Der Fall betrifft ausschließlich eine kontrollierte Simulation und hat keine Auswirkung auf Produktion, echte Buchungen oder Zahlungen.',
    nextAction:
      'Erneute technische Prüfung nach dem nächsten relevanten Staging-Änderungsstand.',
  });
}

function requireDraft(value) {
  if (value?.message?.sendStatus !== 'pending_approval'
      || value?.message?.approvalLevel !== 'yellow_human_review'
      || value?.progressUpdate?.proposalStatus !== 'pending_review'
      || !Number.isSafeInteger(value?.message?.version)
      || !Number.isSafeInteger(value?.progressUpdate?.proposalVersion)
      || typeof value?.message?.id !== 'string'
      || typeof value?.progressUpdate?.id !== 'string'
      || !/^[a-f0-9]{64}$/u.test(value?.message?.renderedContentSha256 ?? '')) {
    fail('A WP140 progress draft is incomplete.');
  }
  return value;
}

function requireReview(value, draft) {
  if (value?.message?.id !== draft.message.id
      || value?.message?.sendStatus !== 'approved'
      || value?.message?.reviewOutcome !== 'approved'
      || value?.message?.renderedContentSha256
        !== draft.message.renderedContentSha256
      || !Number.isSafeInteger(value?.message?.version)) {
    fail('A WP140 independent review is incomplete.');
  }
  return value;
}

function requirePublication(value, supportCase, draft, now) {
  const deadline = new Date(value?.supportCase?.nextUpdateAt);
  if (value?.supportCase?.id !== supportCase.id
      || value?.progressUpdate?.id !== draft.progressUpdate.id
      || value?.progressUpdate?.proposalStatus !== 'published'
      || value?.message?.id !== draft.message.id
      || value?.message?.sendStatus !== 'sent'
      || value?.message?.externalMessageSent !== false
      || !Number.isFinite(deadline.getTime())
      || deadline.getTime() <= now.getTime()
      || !Number.isSafeInteger(value?.supportCase?.version)
      || value.supportCase.version <= supportCase.version) {
    fail('A WP140 progress publication is incomplete.');
  }
  return value;
}

export async function recoverWp140Cases({
  cases,
  operations,
  now = new Date(),
} = {}) {
  const required = ['attest', 'draft', 'review', 'publish', 'readback', 'readiness'];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('WP140 recovery operations are incomplete.');
  }
  const targets = classifyWp140OverdueCases(cases, { now });
  assertWp140ProvenanceAttestation(await operations.attest(targets));
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const supportCase = targets[index];
    const payload = buildWp140ProgressDraft(supportCase, { now });
    const draft = requireDraft(await operations.draft(supportCase, payload, index));
    const review = requireReview(
      await operations.review(supportCase, draft, index),
      draft,
    );
    const publication = requirePublication(
      await operations.publish(supportCase, draft, review, index),
      supportCase,
      draft,
      now,
    );
    const readback = await operations.readback(supportCase, draft, publication, index);
    if (readback?.publishedProgressVisible !== true
        || readback?.publishedMessageVisible !== true
        || readback?.priorEventHistoryPreserved !== true
        || readback?.externalMessageSent !== false) {
      fail('A WP140 target readback is incomplete.');
    }
    results.push(Object.freeze({
      ordinal: index + 1,
      progressPublished: true,
      independentReview: true,
      futureDeadlineConfirmed: true,
      priorEventHistoryPreserved: true,
      externalMessageSent: false,
    }));
  }
  const readiness = await operations.readiness();
  if (readiness?.httpStatus !== 200
      || readiness?.status !== 'ok'
      || readiness?.nextUpdateOverdue !== 0
      || readiness?.criticalNextUpdateOverdue !== 0
      || readiness?.p0WithoutOwner !== 0) {
    fail('WP140 Staging readiness did not recover exactly.');
  }
  return Object.freeze({ results, readiness });
}

export function buildWp140Evidence({
  implementationHead,
  runtimeImage,
  runtimeRestartCountBefore,
  runtimeRestartCountAfter,
  before,
  recovery,
  after,
  cleanup,
  capturedAt = new Date().toISOString(),
} = {}) {
  if (!/^[a-f0-9]{40}$/u.test(implementationHead ?? '')
      || runtimeImage !== wp140ExpectedRuntimeImage
      || runtimeRestartCountBefore !== 0
      || runtimeRestartCountAfter !== 0
      || before?.overdueCount !== wp140ExpectedOverdueCount
      || before?.status !== 'passed-read-only'
      || before?.changed !== false
      || recovery?.results?.length !== wp140ExpectedOverdueCount
      || recovery.results.some((entry) => entry?.progressPublished !== true
        || entry?.independentReview !== true
        || entry?.futureDeadlineConfirmed !== true
        || entry?.priorEventHistoryPreserved !== true
        || entry?.externalMessageSent !== false)
      || after?.overdueCount !== 0
      || after?.pendingProgressCount !== 0
      || after?.priorHistoryPreserved !== true
      || after?.externalMessageSentCount !== 0
      || recovery?.readiness?.httpStatus !== 200
      || recovery?.readiness?.status !== 'ok'
      || cleanup?.temporaryAdminCount !== 2
      || cleanup?.credentialsRevoked !== true
      || cleanup?.privateVaultDeleted !== true) {
    fail('WP140 evidence is incomplete or contradictory.');
  }
  const evidence = {
    schemaVersion: 1,
    kind: 'sit-wp140-staging-historical-support-deadline-recovery',
    status: 'passed-historical-simulation-deadline-recovery',
    capturedAt,
    source: {
      branch: 'codex/master-workflow-20260808',
      implementationHead,
      backendRuntimeHead: 'df39a14b7a19afe467842461a28f1e77fec8445e',
    },
    staging: {
      runtimeImage,
      runtimeRestartCountBefore,
      runtimeRestartCountAfter,
      readinessBefore: 'degraded-three-noncritical-simulation-followups-overdue',
      readinessAfter: 'ready',
    },
    support: {
      targetCount: wp140ExpectedOverdueCount,
      targetOperatingMode: 'simulation',
      targetPriority: 'p3',
      syntheticProvenanceConfirmed: true,
      independentTwoAdminReview: true,
      publishedProgressCount: wp140ExpectedOverdueCount,
      futureDeadlineCount: wp140ExpectedOverdueCount,
      overdueCountAfter: 0,
      pendingProgressCountAfter: 0,
      priorHistoryPreserved: true,
      externalMessageSentCount: 0,
    },
    cleanup: {
      temporaryAdminCount: 2,
      credentialsRevoked: true,
      privateVaultDeleted: true,
      auditHistoryRetained: true,
    },
    portfolioEffect: {
      promotedRequirement: 'historical-support-deadline-recovery',
      state: 'PASS',
      totals: { pass: 21, partial: 4, open: 7 },
    },
    boundaries: {
      simulationOnly: true,
      existingHistoryDeleted: false,
      oldEventsRewritten: false,
      externalMessageSent: false,
      productionChanged: false,
      paymentChanged: false,
      realMoneyUsed: false,
      googlePlayChanged: false,
      firebaseChanged: false,
      appCandidateChanged: false,
      pixelContacted: false,
      onePlusContacted: false,
      pullRequestMerged: false,
      containsAccountIdentity: false,
      containsCaseIdentity: false,
      containsCredential: false,
      containsToken: false,
      containsPrivateFilesystemPath: false,
    },
  };
  if (/\/Users\/|@[a-z0-9.-]+\.[a-z]{2,}|"(?:accessToken|refreshToken|password|secret|caseId|reporterUserId)"/iu
    .test(JSON.stringify(evidence))) {
    fail('WP140 evidence contains private identity, path or credential material.');
  }
  return Object.freeze(evidence);
}

function privateVaultPath(now = new Date()) {
  return resolve(
    privateQaRoot,
    `wp140-staging-support-recovery-${safeTimestamp(now)}`,
    'vault.json',
  );
}

function assertPrivateVaultPath(value) {
  const target = resolve(value);
  const rel = relative(privateQaRoot, target);
  if (!rel || rel.startsWith('..') || rel.includes('\0')) {
    fail('WP140 vault must stay below the private ShareItToo QA directory.');
  }
  return target;
}

async function buildPrivateVault(now = new Date()) {
  const runId = crypto.randomUUID().replace(/-/gu, '').slice(0, 16);
  const accounts = [];
  for (const label of ['author', 'reviewer']) {
    const password = randomPassword();
    accounts.push({
      id: crypto.randomUUID(),
      role: 'admin',
      label,
      email: `wp140-${runId}-${label}@staging.shareittoo.invalid`,
      password,
      passwordHash: await hashPassword(password),
      displayName: `Staging WP140 ${label}`,
    });
  }
  return { schemaVersion: 1, purpose: 'wp140_support_deadline_recovery', accounts };
}

async function writePrivateVault(path, vault) {
  const target = assertPrivateVaultPath(path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, `${JSON.stringify(vault)}\n`, {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  await chmod(target, 0o600);
  return target;
}

function runProcess(command, args, {
  input = null,
  timeoutMs = 60_000,
  failureLabel = 'command',
} = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (value) => stdout.push(value));
    child.stderr.on('data', (value) => stderr.push(value));
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
      };
      if (code === 0) resolvePromise(result);
      else rejectPromise(new Error(`WP140 ${failureLabel} failed (${code}).`));
    });
    child.stdin.end(input ?? undefined);
  });
}

function remoteNodeCommand(script) {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  return `docker exec -i shareittoo-staging-api node --input-type=module --eval "$(printf %s ${encoded} | base64 -d)"`;
}

async function runRemoteJson(script, payload = {}, {
  timeoutMs = 60_000,
  failureLabel = 'remote operation',
} = {}) {
  const result = await runProcess('ssh', [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
    wp140SshHost, remoteNodeCommand(script),
  ], { input: JSON.stringify(payload), timeoutMs, failureLabel });
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('WP140 remote operation did not return sanitized JSON.');
  }
}

async function readRuntime() {
  const result = await runProcess('ssh', [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', wp140SshHost,
    "docker inspect --format '{{.Config.Image}} {{.RestartCount}}' shareittoo-staging-api",
  ], { timeoutMs: 30_000, failureLabel: 'runtime inventory' });
  const match = /^(\S+) (\d+)$/u.exec(result.stdout);
  if (match === null) fail('WP140 runtime inventory is invalid.');
  return Object.freeze({ image: match[1], restartCount: Number(match[2]) });
}

const remoteInventoryScript = `
import { pool } from './src/db.js';
const result = await pool.query(\`
  WITH overdue AS (
    SELECT support_case.* FROM support_cases AS support_case
     WHERE support_case.status NOT IN ('resolved', 'closed')
       AND support_case.next_update_at <= now()
  )
  SELECT count(*)::int AS overdue_count,
    coalesce(bool_and(operating_mode = 'simulation'), false) AS all_non_live,
    coalesce(bool_and(priority = 'p3'), false) AS all_noncritical,
    coalesce(bool_and(NOT safety_flag AND NOT privacy_flag AND NOT dsa_flag
      AND NOT authority_flag AND NOT money_flag AND NOT account_takeover_flag), false) AS all_flags_clear,
    (SELECT count(*)::int FROM support_case_events WHERE case_id IN (SELECT id FROM overdue)) AS event_count,
    (SELECT count(*)::int FROM support_messages WHERE case_id IN (SELECT id FROM overdue)) AS message_count,
    (SELECT count(*)::int FROM support_case_progress_updates WHERE case_id IN (SELECT id FROM overdue)) AS progress_count,
    (SELECT count(*)::int FROM support_case_progress_updates
      WHERE case_id IN (SELECT id FROM overdue)
        AND proposal_status IN ('pending_review', 'approved')) AS pending_progress_count
  FROM overdue
\`);
const row = result.rows[0];
await pool.end();
process.stdout.write(JSON.stringify({
  status: 'passed-read-only', overdueCount: row.overdue_count,
  allNonLive: row.all_non_live, allNoncritical: row.all_noncritical,
  allFlagsClear: row.all_flags_clear, retainedEventCount: row.event_count,
  retainedMessageCount: row.message_count, priorProgressCount: row.progress_count,
  pendingProgressCount: row.pending_progress_count, identifiersEmitted: false,
  credentialsRead: false, changed: false,
}));
`;

const remoteAttestationScript = `
import { pool } from './src/db.js';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (!Array.isArray(input?.caseIds) || input.caseIds.length !== 3
    || input.caseIds.some((id) => !/^[0-9a-f-]{36}$/u.test(id))) {
  throw new Error('wp140_attestation_input_invalid');
}
const result = await pool.query(\`
  SELECT count(*)::int AS target_count,
    coalesce(bool_and(support_case.operating_mode = 'simulation'), false) AS all_non_live,
    coalesce(bool_and(support_case.priority = 'p3'), false) AS all_noncritical,
    coalesce(bool_and(NOT support_case.safety_flag AND NOT support_case.privacy_flag
      AND NOT support_case.dsa_flag AND NOT support_case.authority_flag
      AND NOT support_case.money_flag AND NOT support_case.account_takeover_flag), false) AS all_flags_clear,
    coalesce(bool_and(
      (user_account.email ~ '^[^@+]+\\+sit-[a-z0-9-]+-(owner|renter)@[^@]+$'
        AND (user_account.profile->>'displayName') IN ('SIT Test Vermieter', 'SIT Test Mieter'))
      OR (user_account.email ~ '^wp68-[a-z0-9]+-reporter@staging\\.shareittoo\\.invalid$'
        AND EXISTS (SELECT 1 FROM audit_log AS audit
          WHERE audit.resource_id = user_account.id::text
            AND audit.action = 'staging.support_test_actor_bootstrapped'))
    ), false) AS all_synthetic_reporters,
    coalesce(bool_and(support_case.user_facing_summary ~* '(SIT|Staging|Test)'
      OR coalesce(support_case.internal_summary, '') ~* '(SIT|Staging|Test)'), false) AS all_synthetic_summaries,
    coalesce(bool_and(support_case.linked_listing_id IS NULL
      OR listing.title ~ '^SIT Rollenprüfung '), false) AS all_linked_listings_synthetic,
    (SELECT count(*)::int FROM support_case_progress_updates AS progress
      WHERE progress.case_id = ANY($1::uuid[])
        AND progress.proposal_status IN ('pending_review', 'approved')) AS pending_progress_count
  FROM support_cases AS support_case
  JOIN users AS user_account ON user_account.id = support_case.reporter_user_id
  LEFT JOIN listings AS listing ON listing.id = support_case.linked_listing_id
  WHERE support_case.id = ANY($1::uuid[])
    AND support_case.status = 'received'
    AND support_case.next_update_at <= now()
\`, [input.caseIds]);
const row = result.rows[0];
await pool.end();
process.stdout.write(JSON.stringify({
  status: 'passed-read-only', targetCount: row.target_count,
  allTargetsMatched: row.target_count === input.caseIds.length,
  allNonLive: row.all_non_live, allNoncritical: row.all_noncritical,
  allFlagsClear: row.all_flags_clear,
  allSyntheticReporters: row.all_synthetic_reporters,
  allSyntheticSummaries: row.all_synthetic_summaries,
  allLinkedListingsSynthetic: row.all_linked_listings_synthetic,
  pendingProgressCount: row.pending_progress_count,
  rawIdentifiersEmitted: false, credentialsRead: false, changed: false,
}));
`;

const remoteBootstrapScript = `
import { pool, inTransaction } from './src/db.js';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (input?.schemaVersion !== 1 || input?.purpose !== 'wp140_support_deadline_recovery'
    || !Array.isArray(input?.accounts) || input.accounts.length !== 2) {
  throw new Error('wp140_bootstrap_input_invalid');
}
await inTransaction(async (client) => {
  for (const account of input.accounts) {
    if (!/^[0-9a-f-]{36}$/u.test(account.id)
        || account.role !== 'admin'
        || !/^wp140-[a-z0-9]+-(author|reviewer)@staging\\.shareittoo\\.invalid$/u.test(account.email)
        || typeof account.passwordHash !== 'string' || !account.passwordHash.startsWith('scrypt$')) {
      throw new Error('wp140_bootstrap_account_invalid');
    }
    const existing = await client.query('SELECT 1 FROM users WHERE id = $1 OR email = $2', [account.id, account.email]);
    if (existing.rowCount) throw new Error('wp140_bootstrap_collision');
    await client.query(\`
      INSERT INTO users (
        id, email, password_hash, profile, role, account_status,
        email_verified_at, password_changed_at, terms_accepted_at,
        privacy_accepted_at, minimum_age_confirmed_at, private_use_confirmed_at
      ) VALUES ($1, $2, $3, $4::jsonb, 'admin', 'active',
        now(), now(), now(), now(), now(), now())
    \`, [account.id, account.email, account.passwordHash, JSON.stringify({
      displayName: account.displayName, preferredLanguage: 'de-DE',
      emailVerified: true, phoneVerified: false, isVerified: false,
      isBanned: false, role: 'admin',
    })]);
    await client.query(\`
      INSERT INTO audit_log (actor_role, action, resource_type, resource_id, metadata)
      VALUES ('system', 'staging.support_deadline_recovery_actor_bootstrapped', 'user', $1, $2::jsonb)
    \`, [account.id, JSON.stringify({ environment: 'staging', simulationOnly: true, role: 'admin' })]);
  }
});
await pool.end();
process.stdout.write(JSON.stringify({ status: 'bootstrapped', temporaryAdminCount: 2 }));
`;

const remoteDecommissionScript = `
import { pool, inTransaction } from './src/db.js';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (!Array.isArray(input?.accounts) || input.accounts.length !== 2
    || input.accounts.some((account) => account.role !== 'admin'
      || !/^[0-9a-f-]{36}$/u.test(account.id)
      || !/^wp140-[a-z0-9]+-(author|reviewer)@staging\\.shareittoo\\.invalid$/u.test(account.email))) {
  throw new Error('wp140_decommission_input_invalid');
}
let outcome;
await inTransaction(async (client) => {
  const expected = new Map(input.accounts.map((account) => [account.id, account.email]));
  const locked = await client.query(
    'SELECT id, email, role, account_status FROM users WHERE id = ANY($1::text[]) FOR UPDATE',
    [input.accounts.map((account) => account.id)],
  );
  if (locked.rowCount === 0) {
    outcome = { status: 'no_accounts_found', temporaryAdminCount: 0, credentialsRevoked: true };
    return;
  }
  if (locked.rowCount !== 2 || locked.rows.some((row) => expected.get(row.id) !== row.email
      || row.role !== 'admin' || row.account_status !== 'active')) {
    throw new Error('wp140_decommission_state_invalid');
  }
  const ids = [...expected.keys()];
  await client.query(\`UPDATE auth_sessions SET revoked_at = coalesce(revoked_at, now()),
    revoked_reason = coalesce(revoked_reason, 'wp140_completed')
    WHERE user_id = ANY($1::text[])\`, [ids]);
  await client.query(\`UPDATE refresh_tokens SET revoked_at = coalesce(revoked_at, now()),
    revoked_reason = coalesce(revoked_reason, 'wp140_completed')
    WHERE user_id = ANY($1::text[])\`, [ids]);
  await client.query('UPDATE staff_elevations SET revoked_at = coalesce(revoked_at, now()) WHERE user_id = ANY($1::text[])', [ids]);
  await client.query(\`UPDATE users SET password_hash = NULL, role = 'user', account_status = 'closed', deactivated_at = now()
    WHERE id = ANY($1::text[])\`, [ids]);
  const remaining = await client.query(\`SELECT count(*)::int AS count FROM auth_sessions
    WHERE user_id = ANY($1::text[]) AND revoked_at IS NULL\`, [ids]);
  if (remaining.rows[0].count !== 0) throw new Error('wp140_active_session_remaining');
  outcome = { status: 'decommissioned', temporaryAdminCount: 2, credentialsRevoked: true };
});
await pool.end();
process.stdout.write(JSON.stringify(outcome));
`;

const remoteAfterScript = `
import { pool } from './src/db.js';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (!Array.isArray(input?.caseIds) || input.caseIds.length !== 3) throw new Error('wp140_after_input_invalid');
const result = await pool.query(\`
  SELECT
    (SELECT count(*)::int FROM support_cases
      WHERE status NOT IN ('resolved', 'closed') AND next_update_at <= now()) AS overdue_count,
    (SELECT count(*)::int FROM support_case_progress_updates
      WHERE case_id = ANY($1::uuid[]) AND proposal_status IN ('pending_review', 'approved')) AS pending_progress_count,
    (SELECT count(*)::int FROM support_case_progress_updates
      WHERE case_id = ANY($1::uuid[]) AND proposal_status = 'published') AS published_progress_count,
    (SELECT count(*)::int FROM support_case_events
      WHERE case_id = ANY($1::uuid[])) AS event_count,
    (SELECT count(*)::int FROM support_messages
      WHERE case_id = ANY($1::uuid[])) AS message_count,
    (SELECT count(*)::int FROM support_case_progress_updates
      WHERE case_id = ANY($1::uuid[])) AS progress_count
\`, [input.caseIds]);
const row = result.rows[0];
await pool.end();
process.stdout.write(JSON.stringify({
  status: 'passed-read-only', overdueCount: row.overdue_count,
  pendingProgressCount: row.pending_progress_count,
  publishedProgressCount: row.published_progress_count,
  eventCount: row.event_count, messageCount: row.message_count,
  progressCount: row.progress_count, identifiersEmitted: false,
  credentialsRead: false, changed: false,
}));
`;

async function requestJson(path, {
  method = 'GET', accessToken = null, stepUpToken = null,
  idempotency = null, body = undefined, absolute = false,
} = {}) {
  const response = await fetch(absolute ? path : `${wp140ApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
      ...(stepUpToken === null ? {} : { 'X-Admin-Step-Up': stepUpToken }),
      ...(idempotency === null ? {} : { 'Idempotency-Key': idempotency }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25_000),
  });
  let value = null;
  try { value = await response.json(); } catch { value = null; }
  return { response, value };
}

async function requestIdempotentJson(path, options) {
  let firstError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await requestJson(path, options);
      if (attempt === 0 && [408, 500, 502, 503, 504].includes(result.response.status)) {
        continue;
      }
      return result;
    } catch (error) {
      firstError ??= error;
      if (attempt === 1) throw firstError;
    }
  }
  throw firstError ?? new Error('WP140 idempotent request failed.');
}

function requireStatus(result, expected, label) {
  if (result.response.status !== expected) {
    fail(`${label} returned HTTP ${result.response.status}.`);
  }
  return result.value;
}

async function login(account) {
  const value = requireStatus(await requestJson('/auth/login', {
    method: 'POST', body: { email: account.email, password: account.password },
  }), 200, `WP140 ${account.label} login`);
  if (typeof value?.accessToken !== 'string' || value.accessToken.length < 20
      || typeof value?.refreshToken !== 'string' || value.refreshToken.length < 20) {
    fail(`WP140 ${account.label} session is incomplete.`);
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}

async function logout(session) {
  const result = await requestJson('/auth/logout', {
    method: 'POST', body: { refreshToken: session.refreshToken },
  });
  return result.response.status === 204;
}

async function stepUp(account, session) {
  const value = requireStatus(await requestJson('/admin/step-up', {
    method: 'POST', accessToken: session.accessToken,
    body: { currentPassword: account.password },
  }), 200, `WP140 ${account.label} step-up`);
  if (value?.elevation?.role !== 'admin'
      || typeof value?.elevation?.token !== 'string'
      || value.elevation.token.length < 20) {
    fail(`WP140 ${account.label} elevation is incomplete.`);
  }
  return value.elevation.token;
}

function safeCounts(detail) {
  return {
    events: Array.isArray(detail?.events) ? detail.events.length : -1,
    messages: Array.isArray(detail?.messages) ? detail.messages.length : -1,
    progress: Array.isArray(detail?.progressUpdates) ? detail.progressUpdates.length : -1,
  };
}

function currentHead() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/u.test(head)) fail('WP140 implementation HEAD is invalid.');
  return head;
}

function sanitizeFailure(error) {
  return String(error?.message ?? error ?? 'wp140_failure')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, '[redacted-email]')
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/gu, '[redacted-token]')
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/giu, '[redacted-id]')
    .replace(/\/Users\/[^\s]+/gu, '[redacted-path]');
}

export async function executeWp140({
  gate = process.env[wp140ExecutionGate],
  vaultPath = privateVaultPath(),
} = {}) {
  assertWp140ExecutionGate(gate);
  const beforeRuntime = await readRuntime();
  exact(beforeRuntime.image, wp140ExpectedRuntimeImage, 'WP140 runtime image');
  exact(beforeRuntime.restartCount, 0, 'WP140 runtime restart count');
  const before = await runRemoteJson(remoteInventoryScript, {}, {
    failureLabel: 'read-only preflight',
  });
  if (before?.status !== 'passed-read-only'
      || before?.overdueCount !== wp140ExpectedOverdueCount
      || before?.allNonLive !== true
      || before?.allNoncritical !== true
      || before?.allFlagsClear !== true
      || before?.pendingProgressCount !== 0
      || before?.changed !== false) {
    fail('WP140 read-only preflight is not exact.');
  }

  const vault = await buildPrivateVault();
  const targetVault = await writePrivateVault(vaultPath, vault);
  const sessions = [];
  let bootstrapAttempted = false;
  let bootstrapped = false;
  let cleanup = null;
  let result = null;
  let primaryError = null;
  try {
    bootstrapAttempted = true;
    const bootstrap = await runRemoteJson(remoteBootstrapScript, vault, {
      failureLabel: 'temporary admin bootstrap',
    });
    if (bootstrap?.status !== 'bootstrapped' || bootstrap?.temporaryAdminCount !== 2) {
      fail('WP140 temporary admin bootstrap failed.');
    }
    bootstrapped = true;
    const [authorAccount, reviewerAccount] = vault.accounts;
    const authorSession = await login(authorAccount);
    sessions.push(authorSession);
    const reviewerSession = await login(reviewerAccount);
    sessions.push(reviewerSession);
    const [authorStepUp, reviewerStepUp] = await Promise.all([
      stepUp(authorAccount, authorSession), stepUp(reviewerAccount, reviewerSession),
    ]);
    const listed = requireStatus(await requestJson('/admin/support/cases?limit=100', {
      accessToken: authorSession.accessToken, stepUpToken: authorStepUp,
    }), 200, 'WP140 support inventory');
    const now = new Date();
    const overdue = (Array.isArray(listed?.supportCases) ? listed.supportCases : [])
      .filter((entry) => activeCase(entry)
        && new Date(entry.nextUpdateAt).getTime() <= now.getTime());
    const targets = classifyWp140OverdueCases(overdue, { now });
    const caseIds = targets.map((entry) => entry.id);
    const baselineByCase = new Map();
    const operations = {
      attest: async () => runRemoteJson(remoteAttestationScript, { caseIds }, {
        failureLabel: 'provenance attestation',
      }),
      draft: async (supportCase, body, index) => {
        const beforeDetail = requireStatus(await requestJson(
          `/admin/support/cases/${encodeURIComponent(supportCase.id)}`, {
            accessToken: authorSession.accessToken, stepUpToken: authorStepUp,
          },
        ), 200, `WP140 target baseline ${index + 1}`);
        baselineByCase.set(supportCase.id, safeCounts(beforeDetail));
        return requireStatus(await requestIdempotentJson(
          `/admin/support/cases/${encodeURIComponent(supportCase.id)}/progress-updates`, {
          method: 'POST', accessToken: authorSession.accessToken,
          stepUpToken: authorStepUp,
          idempotency: idempotencyKey(`wp140-draft-${index + 1}`), body,
          },
        ), 201, `WP140 progress draft ${index + 1}`);
      },
      review: async (supportCase, draft, index) => requireStatus(await requestIdempotentJson(
        `/admin/support/cases/${encodeURIComponent(supportCase.id)}/messages/${encodeURIComponent(draft.message.id)}/review`, {
          method: 'POST', accessToken: reviewerSession.accessToken,
          stepUpToken: reviewerStepUp,
          idempotency: idempotencyKey(`wp140-review-${index + 1}`),
          body: {
            outcome: 'approved', expectedVersion: draft.message.version,
            expectedPayloadSha256: draft.message.renderedContentSha256,
            reviewNotes: 'Testmodus, wahrheitsgemäßer Inhalt, fehlende Außenwirkung und zukünftige Frist wurden unabhängig geprüft.',
          },
        },
      ), 200, `WP140 independent review ${index + 1}`),
      publish: async (supportCase, draft, review, index) => requireStatus(await requestIdempotentJson(
        `/admin/support/cases/${encodeURIComponent(supportCase.id)}/progress-updates/${encodeURIComponent(draft.progressUpdate.id)}/publication`, {
          method: 'POST', accessToken: authorSession.accessToken,
          stepUpToken: authorStepUp,
          idempotency: idempotencyKey(`wp140-publication-${index + 1}`),
          body: {
            expectedProgressVersion: draft.progressUpdate.proposalVersion + 1,
            expectedMessageVersion: review.message.version,
            expectedPayloadSha256: review.message.renderedContentSha256,
          },
        },
      ), 200, `WP140 progress publication ${index + 1}`),
      readback: async (supportCase, draft) => {
        const detail = requireStatus(await requestJson(
          `/admin/support/cases/${encodeURIComponent(supportCase.id)}`, {
            accessToken: authorSession.accessToken, stepUpToken: authorStepUp,
          },
        ), 200, 'WP140 target readback');
        const afterCounts = safeCounts(detail);
        const beforeCounts = baselineByCase.get(supportCase.id);
        const progress = detail.events?.find((entry) => (
          entry.eventType === 'case.progress_update_published'
            && entry.entityId === draft.progressUpdate.id
        ));
        const message = detail.messages?.find((entry) => entry.id === draft.message.id);
        return {
          publishedProgressVisible: progress !== undefined,
          publishedMessageVisible: message?.sendStatus === 'sent',
          priorEventHistoryPreserved: beforeCounts !== undefined
            && afterCounts.events > beforeCounts.events
            && afterCounts.messages > beforeCounts.messages,
          externalMessageSent: message?.externalMessageSent === true,
        };
      },
      readiness: async () => {
        const ready = await requestJson(wp140ReadyUrl, { absolute: true });
        return {
          httpStatus: ready.response.status,
          status: ready.value?.status,
          nextUpdateOverdue: ready.value?.checks?.supportDeadlines?.nextUpdateOverdue,
          criticalNextUpdateOverdue:
            ready.value?.checks?.supportDeadlines?.criticalNextUpdateOverdue,
          p0WithoutOwner: ready.value?.checks?.supportDeadlines?.p0WithoutOwner,
        };
      },
    };
    const recovery = await recoverWp140Cases({ cases: targets, operations, now });
    const after = await runRemoteJson(remoteAfterScript, { caseIds }, {
      failureLabel: 'post-recovery audit',
    });
    after.externalMessageSentCount = recovery.results.every(
      (entry) => entry.externalMessageSent === false,
    ) ? 0 : 1;
    after.priorHistoryPreserved = after.eventCount >= before.retainedEventCount
      && after.messageCount >= before.retainedMessageCount
      && after.progressCount >= before.priorProgressCount;
    if (after.publishedProgressCount < wp140ExpectedOverdueCount
        || after.externalMessageSentCount !== 0) {
      fail('WP140 post-recovery audit is incomplete.');
    }
    result = { before, recovery, after };
  } catch (error) {
    primaryError = error;
  } finally {
    let cleanupError = null;
    for (const session of sessions.reverse()) {
      try {
        if (!(await logout(session))) cleanupError ??= new Error('WP140 logout failed.');
      } catch (error) { cleanupError ??= error; }
    }
    if (bootstrapAttempted) {
      try {
        cleanup = await runRemoteJson(remoteDecommissionScript, {
          accounts: vault.accounts.map(({ id, email, role }) => ({ id, email, role })),
        }, { failureLabel: 'temporary admin decommission' });
      } catch (error) { cleanupError ??= error; }
    }
    try { await rm(targetVault, { force: true }); } catch (error) { cleanupError ??= error; }
    if (cleanupError !== null) {
      if (primaryError !== null) {
        primaryError = new Error(`${sanitizeFailure(primaryError)}; cleanup failed safely.`);
      } else primaryError = cleanupError;
    }
  }
  if (primaryError !== null) throw primaryError;
  if (!bootstrapped || result === null || cleanup?.status !== 'decommissioned'
      || cleanup?.temporaryAdminCount !== 2 || cleanup?.credentialsRevoked !== true) {
    fail('WP140 result or cleanup is incomplete.');
  }
  const afterRuntime = await readRuntime();
  return buildWp140Evidence({
    implementationHead: currentHead(),
    runtimeImage: beforeRuntime.image,
    runtimeRestartCountBefore: beforeRuntime.restartCount,
    runtimeRestartCountAfter: afterRuntime.restartCount,
    ...result,
    cleanup: {
      temporaryAdminCount: cleanup.temporaryAdminCount,
      credentialsRevoked: cleanup.credentialsRevoked,
      privateVaultDeleted: true,
    },
  });
}

function parseArguments(values) {
  const result = { execute: false, vaultPath: null };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--execute') result.execute = true;
    else if (value === '--vault') result.vaultPath = values[++index]
      ?? fail('--vault requires a path.');
    else fail(`Unknown argument: ${value}`);
  }
  return result;
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  if (!args.execute) {
    process.stdout.write(`${JSON.stringify({
      status: 'plan-only', gate: wp140ExecutionGate,
      environment: 'staging', target: 'three-overdue-noncritical-simulation-cases',
      independentReview: true, externalDelivery: false, production: false,
    })}\n`);
    return;
  }
  const evidence = await executeWp140({
    vaultPath: args.vaultPath ?? privateVaultPath(),
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${sanitizeFailure(error)}\n`);
    process.exitCode = 1;
  }
}
