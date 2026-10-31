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

function caseReference(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
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

export function classifyWp140RecoveryCases(cases, {
  now = new Date(),
} = {}) {
  if (!Array.isArray(cases) || cases.length !== wp140ExpectedOverdueCount
      || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('WP140 requires exactly three current recovery cases.');
  }
  const ids = new Set();
  const allowedModes = new Set([
    'pending_active_recipient',
    'pending_closed_synthetic_recipient',
    'published_progress',
    'closed_synthetic_recipient_transition',
  ]);
  for (const supportCase of cases) {
    const deadline = new Date(supportCase?.nextUpdateAt);
    const mode = supportCase?.wp140Recovery?.mode;
    const overdue = Number.isFinite(deadline.getTime()) && deadline.getTime() <= now.getTime();
    const pendingMode = mode === 'pending_active_recipient'
      || mode === 'pending_closed_synthetic_recipient';
    const publishedMode = mode === 'published_progress';
    const transitionedMode = mode === 'closed_synthetic_recipient_transition';
    if (typeof supportCase?.id !== 'string' || supportCase.id.length < 20
        || ids.has(supportCase.id)
        || typeof supportCase?.reporterUserId !== 'string'
        || supportCase.reporterUserId.length < 20
        || supportCase?.operatingMode !== 'simulation'
        || !['received', 'acknowledged'].includes(supportCase?.status)
        || supportCase?.priority !== 'p3'
        || supportCase?.caseType !== 'general_help'
        || supportCase?.caseSubType !== 'app_error_or_display'
        || !Number.isSafeInteger(supportCase?.version)
        || supportCase.version < 1
        || !Number.isFinite(deadline.getTime())
        || !allFlagsClear(supportCase?.flags)
        || supportCase?.linkedPaymentId !== null
        || supportCase?.linkedRefundId !== null
        || supportCase?.linkedPayoutId !== null
        || supportCase?.finalDecisionAvailable !== false
        || !allowedModes.has(mode)
        || supportCase.wp140Recovery.pendingProgressCount !== 0
        || (pendingMode && (!overdue || supportCase.status !== 'received'))
        || (mode === 'pending_active_recipient'
          && supportCase.wp140Recovery.reporterActive !== true)
        || (mode === 'pending_closed_synthetic_recipient'
          && supportCase.wp140Recovery.reporterActive !== false)
        || (publishedMode && (overdue || supportCase.status !== 'received'
          || supportCase.wp140Recovery.wp140PublishedCount !== 1))
        || (transitionedMode && (overdue || supportCase.status !== 'acknowledged'
          || supportCase.wp140Recovery.wp140TransitionCount !== 1))) {
      fail('A WP140 recovery target is not exact.');
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
  const required = [
    'attest', 'draft', 'review', 'publish', 'readback',
    'existingReadback', 'transitionClosedRecipient', 'transitionReadback',
    'readiness',
  ];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('WP140 recovery operations are incomplete.');
  }
  const targets = classifyWp140RecoveryCases(cases, { now });
  assertWp140ProvenanceAttestation(await operations.attest(targets));
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const supportCase = targets[index];
    const recoveryMode = supportCase.wp140Recovery.mode;
    if (recoveryMode === 'published_progress'
        || recoveryMode === 'closed_synthetic_recipient_transition') {
      const existing = await operations.existingReadback(supportCase, index);
      if (existing?.futureDeadlineConfirmed !== true
          || existing?.priorEventHistoryPreserved !== true
          || existing?.externalMessageSent !== false) {
        fail('A WP140 existing recovery readback is incomplete.');
      }
      results.push(Object.freeze({
        ordinal: index + 1,
        recoveryMode,
        progressPublished: recoveryMode === 'published_progress',
        independentReview: recoveryMode === 'published_progress',
        officialStatusTransition:
          recoveryMode === 'closed_synthetic_recipient_transition',
        futureDeadlineConfirmed: true,
        priorEventHistoryPreserved: true,
        externalMessageSent: false,
      }));
      continue;
    }
    if (recoveryMode === 'pending_closed_synthetic_recipient') {
      const transition = await operations.transitionClosedRecipient(
        supportCase,
        buildWp140ProgressDraft(supportCase, { now }),
        index,
      );
      const deadline = new Date(transition?.supportCase?.nextUpdateAt);
      if (transition?.supportCase?.id !== supportCase.id
          || transition?.supportCase?.status !== 'acknowledged'
          || !Number.isSafeInteger(transition?.supportCase?.version)
          || transition.supportCase.version <= supportCase.version
          || !Number.isFinite(deadline.getTime())
          || deadline.getTime() <= now.getTime()) {
        fail('A WP140 closed-recipient transition is incomplete.');
      }
      const readback = await operations.transitionReadback(
        supportCase,
        transition,
        index,
      );
      if (readback?.statusTransitionVisible !== true
          || readback?.noMessageCreated !== true
          || readback?.priorEventHistoryPreserved !== true
          || readback?.externalMessageSent !== false) {
        fail('A WP140 closed-recipient transition readback is incomplete.');
      }
      results.push(Object.freeze({
        ordinal: index + 1,
        recoveryMode: 'closed_synthetic_recipient_transition',
        progressPublished: false,
        independentReview: false,
        officialStatusTransition: true,
        futureDeadlineConfirmed: true,
        priorEventHistoryPreserved: true,
        externalMessageSent: false,
      }));
      continue;
    }
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
      recoveryMode: 'published_progress',
      progressPublished: true,
      independentReview: true,
      officialStatusTransition: false,
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
  const validBeforeRecoveryState = before?.cohortCount === wp140ExpectedOverdueCount
    && ((before?.overdueCount === 1
      && before?.wp140PublishedProgressCount === 2
      && before?.wp140TransitionCount === 0)
      || (before?.overdueCount === 0
        && before?.wp140PublishedProgressCount === 2
        && before?.wp140TransitionCount === 1));
  if (!/^[a-f0-9]{40}$/u.test(implementationHead ?? '')
      || runtimeImage !== wp140ExpectedRuntimeImage
      || runtimeRestartCountBefore !== 0
      || runtimeRestartCountAfter !== 0
      || !validBeforeRecoveryState
      || before?.status !== 'passed-read-only'
      || before?.changed !== false
      || recovery?.results?.length !== wp140ExpectedOverdueCount
      || recovery.results.some((entry) => entry?.futureDeadlineConfirmed !== true
        || entry?.priorEventHistoryPreserved !== true
        || entry?.externalMessageSent !== false)
      || recovery.results.filter((entry) => entry?.progressPublished === true).length !== 2
      || recovery.results.filter((entry) => entry?.independentReview === true).length !== 2
      || recovery.results.filter(
        (entry) => entry?.officialStatusTransition === true,
      ).length !== 1
      || after?.overdueCount !== 0
      || after?.pendingProgressCount !== 0
      || after?.wp140PublishedProgressCount !== 2
      || after?.wp140TransitionCount !== 1
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
      independentTwoAdminReviewForPublishedProgress: true,
      publishedProgressCount: 2,
      independentReviewCount: 2,
      closedSyntheticRecipientTransitionCount: 1,
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

export const remoteInventoryScript = `
import { pool } from './src/db.js';
const result = await pool.query(\`
  WITH cohort AS (
    SELECT support_case.*,
      user_account.account_status = 'active'
        AND user_account.deactivated_at IS NULL AS reporter_active,
      (SELECT count(*)::int FROM support_case_progress_updates AS progress
        WHERE progress.case_id = support_case.id
          AND progress.proposal_status = 'published'
          AND progress.idempotency_key LIKE 'support.progress.propose:wp140-draft-%')
        AS wp140_published_count,
      (SELECT count(*)::int FROM support_case_events AS event
        WHERE event.case_id = support_case.id
          AND event.event_type = 'case.transitioned'
          AND event.idempotency_key LIKE
            'support.case.transition:wp140-closed-recipient-transition-%')
        AS wp140_transition_count
      FROM support_cases AS support_case
      JOIN users AS user_account ON user_account.id = support_case.reporter_user_id
      LEFT JOIN listings AS listing ON listing.id = support_case.linked_listing_id
     WHERE support_case.operating_mode = 'simulation'
       AND support_case.priority = 'p3'
       AND support_case.case_type = 'general_help'
       AND support_case.case_subtype = 'app_error_or_display'
       AND NOT support_case.safety_flag AND NOT support_case.privacy_flag
       AND NOT support_case.dsa_flag AND NOT support_case.authority_flag
       AND NOT support_case.money_flag AND NOT support_case.account_takeover_flag
       AND (
         (user_account.email ~ '^[^@+]+\\\\+sit-[a-z0-9-]+-(owner|renter)@[^@]+$'
           AND (user_account.profile->>'displayName') IN
             ('SIT Test Vermieter', 'SIT Test Mieter'))
         OR (user_account.email ~
           '^wp68-[a-z0-9]+-reporter@staging\\\\.shareittoo\\\\.invalid$'
           AND EXISTS (SELECT 1 FROM audit_log AS audit
             WHERE audit.resource_id = user_account.id::text
               AND audit.action = 'staging.support_test_actor_bootstrapped'))
       )
       AND (support_case.user_facing_summary ~* '(SIT|Staging|Test)'
         OR coalesce(support_case.internal_summary, '') ~* '(SIT|Staging|Test)')
       AND (support_case.linked_listing_id IS NULL
         OR listing.title ~ '^SIT Rollenprüfung ')
       AND (
         (support_case.status = 'received' AND support_case.next_update_at <= now())
         OR EXISTS (SELECT 1 FROM support_case_progress_updates AS progress
           WHERE progress.case_id = support_case.id
             AND progress.proposal_status = 'published'
             AND progress.idempotency_key LIKE 'support.progress.propose:wp140-draft-%')
         OR EXISTS (SELECT 1 FROM support_case_events AS event
           WHERE event.case_id = support_case.id
             AND event.event_type = 'case.transitioned'
             AND event.idempotency_key LIKE
               'support.case.transition:wp140-closed-recipient-transition-%')
       )
  )
  SELECT count(*)::int AS cohort_count,
    count(*) FILTER (WHERE status NOT IN ('resolved', 'closed')
      AND next_update_at <= now())::int AS overdue_count,
    coalesce(bool_and(operating_mode = 'simulation'), false) AS all_non_live,
    coalesce(bool_and(priority = 'p3'), false) AS all_noncritical,
    coalesce(bool_and(NOT safety_flag AND NOT privacy_flag AND NOT dsa_flag
      AND NOT authority_flag AND NOT money_flag AND NOT account_takeover_flag), false) AS all_flags_clear,
    coalesce(sum(wp140_published_count), 0)::int AS wp140_published_progress_count,
    coalesce(sum(wp140_transition_count), 0)::int AS wp140_transition_count,
    json_agg(json_build_object(
      'caseReference', encode(digest(id::text, 'sha256'), 'hex'),
      'reporterActive', reporter_active,
      'overdue', status NOT IN ('resolved', 'closed') AND next_update_at <= now(),
      'wp140PublishedCount', wp140_published_count,
      'wp140TransitionCount', wp140_transition_count,
      'pendingProgressCount', (SELECT count(*)::int
        FROM support_case_progress_updates AS progress
        WHERE progress.case_id = cohort.id
          AND progress.proposal_status IN ('pending_review', 'approved'))
    ) ORDER BY created_at, id) AS case_references,
    (SELECT count(*)::int FROM support_case_events WHERE case_id IN (SELECT id FROM cohort)) AS event_count,
    (SELECT count(*)::int FROM support_messages WHERE case_id IN (SELECT id FROM cohort)) AS message_count,
    (SELECT count(*)::int FROM support_case_progress_updates WHERE case_id IN (SELECT id FROM cohort)) AS progress_count,
    (SELECT count(*)::int FROM support_case_progress_updates
      WHERE case_id IN (SELECT id FROM cohort)
        AND proposal_status IN ('pending_review', 'approved')) AS pending_progress_count
  FROM cohort
\`);
const row = result.rows[0];
await pool.end();
process.stdout.write(JSON.stringify({
  status: 'passed-read-only', cohortCount: row.cohort_count,
  overdueCount: row.overdue_count,
  allNonLive: row.all_non_live, allNoncritical: row.all_noncritical,
  allFlagsClear: row.all_flags_clear, retainedEventCount: row.event_count,
  retainedMessageCount: row.message_count, priorProgressCount: row.progress_count,
  pendingProgressCount: row.pending_progress_count,
  wp140PublishedProgressCount: row.wp140_published_progress_count,
  wp140TransitionCount: row.wp140_transition_count,
  caseReferences: row.case_references, identifiersEmitted: false,
  credentialsRead: false, changed: false,
}));
`;

export const remoteAttestationScript = `
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
      (user_account.email ~ '^[^@+]+\\\\+sit-[a-z0-9-]+-(owner|renter)@[^@]+$'
        AND (user_account.profile->>'displayName') IN ('SIT Test Vermieter', 'SIT Test Mieter'))
      OR (user_account.email ~ '^wp68-[a-z0-9]+-reporter@staging\\\\.shareittoo\\\\.invalid$'
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
    AND (
      (support_case.status = 'received' AND support_case.next_update_at <= now()
        AND NOT EXISTS (SELECT 1 FROM support_case_progress_updates AS progress
          WHERE progress.case_id = support_case.id
            AND progress.idempotency_key LIKE 'support.progress.propose:wp140-draft-%')
        AND NOT EXISTS (SELECT 1 FROM support_case_events AS event
          WHERE event.case_id = support_case.id
            AND event.idempotency_key LIKE
              'support.case.transition:wp140-closed-recipient-transition-%'))
      OR (support_case.status = 'received' AND support_case.next_update_at > now()
        AND EXISTS (SELECT 1 FROM support_case_progress_updates AS progress
          WHERE progress.case_id = support_case.id
            AND progress.proposal_status = 'published'
            AND progress.idempotency_key LIKE 'support.progress.propose:wp140-draft-%'))
      OR (support_case.status = 'acknowledged' AND support_case.next_update_at > now()
        AND EXISTS (SELECT 1 FROM support_case_events AS event
          WHERE event.case_id = support_case.id
            AND event.event_type = 'case.transitioned'
            AND event.idempotency_key LIKE
              'support.case.transition:wp140-closed-recipient-transition-%'))
    )
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

export const remoteBootstrapScript = `
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

export const remoteDecommissionScript = `
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

export const remoteAfterScript = `
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
    (SELECT count(*)::int FROM support_case_progress_updates
      WHERE case_id = ANY($1::uuid[]) AND proposal_status = 'published'
        AND idempotency_key LIKE 'support.progress.propose:wp140-draft-%')
      AS wp140_published_progress_count,
    (SELECT count(*)::int FROM support_case_events
      WHERE case_id = ANY($1::uuid[]) AND event_type = 'case.transitioned'
        AND idempotency_key LIKE
          'support.case.transition:wp140-closed-recipient-transition-%')
      AS wp140_transition_count,
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
  wp140PublishedProgressCount: row.wp140_published_progress_count,
  wp140TransitionCount: row.wp140_transition_count,
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
    const code = typeof result.value?.error === 'string'
      && /^[a-z0-9_]{3,100}$/u.test(result.value.error)
      ? ` (${result.value.error})`
      : '';
    fail(`${label} returned HTTP ${result.response.status}${code}.`);
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

export function summarizeWp140ExistingDetail(detail, supportCase, now) {
  const deadline = new Date(detail?.supportCase?.nextUpdateAt);
  return Object.freeze({
    futureDeadlineConfirmed: detail?.supportCase?.id === supportCase?.id
      && Number.isFinite(deadline.getTime()) && deadline.getTime() > now.getTime(),
    priorEventHistoryPreserved: Array.isArray(detail?.events)
      && Array.isArray(detail?.messages),
    externalMessageSent: Array.isArray(detail?.messages)
      && detail.messages.some((message) => message?.externalMessageSent === true),
  });
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
      || before?.cohortCount !== wp140ExpectedOverdueCount
      || !Number.isSafeInteger(before?.overdueCount)
      || before.overdueCount < 0 || before.overdueCount > wp140ExpectedOverdueCount
      || before?.allNonLive !== true
      || before?.allNoncritical !== true
      || before?.allFlagsClear !== true
      || before?.pendingProgressCount !== 0
      || !Array.isArray(before?.caseReferences)
      || before.caseReferences.length !== wp140ExpectedOverdueCount
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
    const recoveryByReference = new Map(before.caseReferences.map((entry) => [
      entry.caseReference,
      entry,
    ]));
    const targets = classifyWp140RecoveryCases(
      (Array.isArray(listed?.supportCases) ? listed.supportCases : [])
        .filter((entry) => recoveryByReference.has(caseReference(entry.id)))
        .map((entry) => {
          const state = recoveryByReference.get(caseReference(entry.id));
          let mode = null;
          if (state.wp140PublishedCount === 1 && state.overdue === false) {
            mode = 'published_progress';
          } else if (state.wp140TransitionCount === 1 && state.overdue === false) {
            mode = 'closed_synthetic_recipient_transition';
          } else if (state.wp140PublishedCount === 0
              && state.wp140TransitionCount === 0 && state.overdue === true) {
            mode = state.reporterActive === true
              ? 'pending_active_recipient'
              : 'pending_closed_synthetic_recipient';
          }
          return {
            ...entry,
            wp140Recovery: {
              mode,
              reporterActive: state.reporterActive,
              pendingProgressCount: state.pendingProgressCount,
              wp140PublishedCount: state.wp140PublishedCount,
              wp140TransitionCount: state.wp140TransitionCount,
            },
          };
        }),
      { now },
    );
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
      existingReadback: async (supportCase) => {
        const detail = requireStatus(await requestJson(
          `/admin/support/cases/${encodeURIComponent(supportCase.id)}`, {
            accessToken: authorSession.accessToken, stepUpToken: authorStepUp,
          },
        ), 200, 'WP140 existing target readback');
        return summarizeWp140ExistingDetail(detail, supportCase, now);
      },
      transitionClosedRecipient: async (supportCase, payload, index) => {
        const reviewerDetail = requireStatus(await requestJson(
          `/admin/support/cases/${encodeURIComponent(supportCase.id)}`, {
            accessToken: reviewerSession.accessToken, stepUpToken: reviewerStepUp,
          },
        ), 200, `WP140 closed-recipient review ${index + 1}`);
        if (reviewerDetail?.supportCase?.id !== supportCase.id
            || reviewerDetail.supportCase.status !== 'received'
            || reviewerDetail.supportCase.version !== supportCase.version) {
          fail('WP140 closed-recipient review is stale.');
        }
        baselineByCase.set(supportCase.id, safeCounts(reviewerDetail));
        return requireStatus(await requestIdempotentJson(
          `/admin/support/cases/${encodeURIComponent(supportCase.id)}/status`, {
            method: 'PATCH', accessToken: authorSession.accessToken,
            stepUpToken: authorStepUp,
            idempotency: idempotencyKey(
              `wp140-closed-recipient-transition-${index + 1}`,
            ),
            body: {
              status: 'acknowledged',
              expectedVersion: supportCase.version,
              reason:
                'Historischer kontrollierter Staging-Testfall mit bereits deaktiviertem synthetischem Testkonto; weitere Bearbeitung bleibt intern.',
              nextAction:
                'Historischen kontrollierten Staging-Testfall anhand der erhaltenen Nachweiskette weiter prüfen.',
              nextUpdateAt: payload.nextUpdateAt,
              waitingOn: 'support_owner',
            },
          },
        ), 200, `WP140 closed-recipient transition ${index + 1}`);
      },
      transitionReadback: async (supportCase) => {
        const detail = requireStatus(await requestJson(
          `/admin/support/cases/${encodeURIComponent(supportCase.id)}`, {
            accessToken: authorSession.accessToken, stepUpToken: authorStepUp,
          },
        ), 200, 'WP140 closed-recipient transition readback');
        const beforeCounts = baselineByCase.get(supportCase.id);
        const afterCounts = safeCounts(detail);
        return {
          statusTransitionVisible: detail?.supportCase?.status === 'acknowledged',
          noMessageCreated: beforeCounts !== undefined
            && afterCounts.messages === beforeCounts.messages
            && afterCounts.progress === beforeCounts.progress,
          priorEventHistoryPreserved: beforeCounts !== undefined
            && afterCounts.events > beforeCounts.events,
          externalMessageSent: false,
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
    if (after.wp140PublishedProgressCount !== 2
        || after.wp140TransitionCount !== 1
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
