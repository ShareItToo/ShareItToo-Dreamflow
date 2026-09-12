#!/usr/bin/env node

import crypto from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const wp68ApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
export const wp68SshHost = 'sit-staging-vps';
export const wp68ExecutionGate = 'SIT_WP68_STAGING_SUPPORT_SIMULATION_GO';
export const wp68ExpectedStagingRuntimeImage = 'shareittoo-api:78c663248aec089b08d19fd0fb40a9a63f19408b';
const privateQaRoot = resolve(os.homedir(), 'Library/Application Support/ShareItToo/qa');
const expectedRoles = Object.freeze(['user', 'admin', 'admin']);
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

function idempotencyKey(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sanitizeError(error) {
  const message = String(error?.message ?? error ?? 'wp68_staging_support_failure');
  return message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, '[redacted-email]')
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/gu, '[redacted-token]')
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/giu, '[redacted-id]')
    .replace(/\bSIT-[A-Z0-9]+\b/gu, '[redacted-case]');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

function privateVaultPath(now = new Date()) {
  return resolve(privateQaRoot, `wp68-staging-support-${safeTimestamp(now)}`, 'vault.json');
}

function assertPrivateVaultPath(vaultPath) {
  const normalized = resolve(vaultPath);
  const rel = relative(privateQaRoot, normalized);
  if (!rel || rel.startsWith('..') || rel.includes('\0')) {
    fail('WP68 private vault path must stay below the ShareItToo private QA directory.');
  }
  return normalized;
}

export function assertWp68ExecutionGate({
  gate,
  apiBaseUrl = wp68ApiBaseUrl,
  sshHost = wp68SshHost,
} = {}) {
  exact(gate, '1', wp68ExecutionGate);
  exact(apiBaseUrl, wp68ApiBaseUrl, 'WP68 staging API base URL');
  exact(sshHost, wp68SshHost, 'WP68 SSH host');
  return Object.freeze({
    environment: 'staging',
    operatingMode: 'simulation',
    apiBaseUrl,
    sshHost,
    production: false,
  });
}

export function assertWp68StagingRuntimeImage(image) {
  exact(image, wp68ExpectedStagingRuntimeImage, 'WP68 staging runtime image');
  return image;
}

function randomPassword() {
  return `SITwp68-${crypto.randomBytes(24).toString('base64url')}a1`;
}

function accountEmail(runId, role) {
  return `wp68-${runId}-${role}@staging.shareittoo.invalid`;
}

export async function buildWp68PrivateVault({ now = new Date() } = {}) {
  const runId = crypto.randomUUID().replace(/-/gu, '').slice(0, 16);
  const roleLabels = ['reporter', 'author', 'reviewer'];
  const accounts = [];
  for (let index = 0; index < expectedRoles.length; index += 1) {
    const password = randomPassword();
    accounts.push(Object.freeze({
      id: crypto.randomUUID(),
      role: expectedRoles[index],
      label: roleLabels[index],
      email: accountEmail(runId, roleLabels[index]),
      password,
      passwordHash: await hashPassword(password),
      displayName: `Staging ${roleLabels[index]} QA`,
    }));
  }
  return Object.freeze({
    schemaVersion: 1,
    purpose: 'wp68_staging_support_simulation_only',
    createdAt: now.toISOString(),
    runId,
    accounts: Object.freeze(accounts),
  });
}

export async function writeWp68PrivateVault(vaultPath, vault) {
  const target = assertPrivateVaultPath(vaultPath);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, `${JSON.stringify(vault)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  await chmod(target, 0o600);
  return target;
}

async function readWp68PrivateVault(vaultPath) {
  const target = assertPrivateVaultPath(vaultPath);
  const parsed = JSON.parse(await readFile(target, 'utf8'));
  if (parsed?.schemaVersion !== 1
      || parsed?.purpose !== 'wp68_staging_support_simulation_only'
      || !Array.isArray(parsed.accounts)
      || parsed.accounts.length !== 3
      || parsed.accounts.map((entry) => entry?.role).join(',') !== expectedRoles.join(',')) {
    fail('WP68 private vault is invalid.');
  }
  for (const account of parsed.accounts) {
    if (typeof account?.id !== 'string' || typeof account?.email !== 'string'
        || typeof account?.password !== 'string' || typeof account?.passwordHash !== 'string') {
      fail('WP68 private vault account is incomplete.');
    }
  }
  return parsed;
}

function runProcess(command, args, { input = null, timeoutMs = 45_000 } = {}) {
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
      else rejectPromise(new Error(`WP68 command failed (${code}): ${result.stderr || result.stdout || 'no output'}`));
    });
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function readWp68StagingRuntimeImage({ sshHost = wp68SshHost } = {}) {
  const result = await runProcess('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    sshHost,
    "docker inspect --format '{{.Config.Image}}' shareittoo-staging-api",
  ], { timeoutMs: 30_000 });
  const image = result.stdout.trim();
  if (!/^shareittoo-api:[0-9a-f]{40}$/u.test(image)) {
    fail('WP68 staging runtime image probe returned an invalid value.');
  }
  return assertWp68StagingRuntimeImage(image);
}

function remoteNodeCommand(script) {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  return `docker exec -i shareittoo-staging-api node --input-type=module --eval "$(printf %s ${encoded} | base64 -d)"`;
}

async function runRemoteJson(script, payload, { sshHost = wp68SshHost } = {}) {
  const result = await runProcess('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    sshHost,
    remoteNodeCommand(script),
  ], {
    input: JSON.stringify(payload),
    timeoutMs: 60_000,
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('WP68 remote operation did not return sanitized JSON.');
  }
}

const remoteBootstrapScript = `
import { pool, inTransaction } from './src/db.js';

const inputChunks = [];
for await (const chunk of process.stdin) inputChunks.push(chunk);
const input = JSON.parse(Buffer.concat(inputChunks).toString('utf8'));
if (input?.schemaVersion !== 1 || input?.purpose !== 'wp68_staging_support_simulation_only'
    || !Array.isArray(input?.accounts) || input.accounts.length !== 3) {
  throw new Error('wp68_bootstrap_input_invalid');
}
const expected = ['user', 'admin', 'admin'];
if (input.accounts.map((entry) => entry.role).join(',') !== expected.join(',')) {
  throw new Error('wp68_bootstrap_roles_invalid');
}
await inTransaction(async (client) => {
  for (const account of input.accounts) {
    if (!/^[0-9a-f-]{36}$/u.test(account.id)
        || !/^wp68-[a-z0-9]+-(reporter|author|reviewer)@staging\\.shareittoo\\.invalid$/u.test(account.email)
        || typeof account.passwordHash !== 'string' || !account.passwordHash.startsWith('scrypt$')) {
      throw new Error('wp68_bootstrap_account_invalid');
    }
    const existing = await client.query('SELECT 1 FROM users WHERE id = $1 OR email = $2', [account.id, account.email]);
    if (existing.rowCount) throw new Error('wp68_bootstrap_collision');
    const profile = JSON.stringify({
      displayName: account.displayName,
      preferredLanguage: 'de-DE',
      emailVerified: true,
      phoneVerified: false,
      isVerified: false,
      isBanned: false,
      role: account.role,
    });
    await client.query(
      \`INSERT INTO users (
         id, email, password_hash, profile, role, account_status,
         email_verified_at, password_changed_at,
         terms_accepted_at, privacy_accepted_at, minimum_age_confirmed_at,
         private_use_confirmed_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, 'active', now(), now(), now(), now(), now(), now())\`,
      [account.id, account.email, account.passwordHash, profile, account.role],
    );
    await client.query(
      \`INSERT INTO audit_log (actor_role, action, resource_type, resource_id, metadata)
       VALUES ('system', 'staging.support_test_actor_bootstrapped', 'user', $1, $2::jsonb)\`,
      [account.id, JSON.stringify({ environment: 'staging', simulationOnly: true, role: account.role })],
    );
  }
});
await pool.end();
process.stdout.write(JSON.stringify({
  status: 'bootstrapped', environment: 'staging', simulationOnly: true,
  createdAccountCount: 3, roles: expected,
}));
`;

const remoteDecommissionScript = `
import { pool, inTransaction } from './src/db.js';

const inputChunks = [];
for await (const chunk of process.stdin) inputChunks.push(chunk);
const input = JSON.parse(Buffer.concat(inputChunks).toString('utf8'));
const expectedRoles = ['user', 'admin', 'admin'];
if (input?.schemaVersion !== 1 || !Array.isArray(input?.accounts)
    || input.accounts.length !== 3
    || input.accounts.map((account) => account?.role).join(',') !== expectedRoles.join(',')
    || input.accounts.some((account) => !/^[0-9a-f-]{36}$/u.test(account?.id)
      || !/^wp68-[a-z0-9]+-(reporter|author|reviewer)@staging\\.shareittoo\\.invalid$/u.test(account?.email))) {
  throw new Error('wp68_decommission_input_invalid');
}
const expectedById = new Map(input.accounts.map((account) => [account.id, account]));
let outcome = null;
await inTransaction(async (client) => {
  const locked = await client.query(
    \`SELECT id, email, role, account_status FROM users WHERE id = ANY($1::text[]) FOR UPDATE\`,
    [input.accounts.map((account) => account.id)],
  );
  if (locked.rowCount === 0) {
    outcome = { status: 'no_accounts_found', decommissionedAccountCount: 0, credentialsRevoked: true, revokedSessionCount: 0 };
    return;
  }
  if (locked.rowCount !== 3 || locked.rows.some((row) => {
    const expected = expectedById.get(row.id);
    return !expected || expected.email !== row.email || expected.role !== row.role
      || row.account_status !== 'active';
  })) {
    throw new Error('wp68_decommission_account_state_invalid');
  }
  const accountIds = input.accounts.map((account) => account.id);
  const sessions = await client.query(
    \`UPDATE auth_sessions
        SET revoked_at = COALESCE(revoked_at, now()),
            revoked_reason = COALESCE(revoked_reason, 'wp68_staging_support_test_decommissioned')
      WHERE user_id = ANY($1::text[])
      RETURNING user_id\`,
    [accountIds],
  );
  await client.query(
    \`UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, now()),
            revoked_reason = COALESCE(revoked_reason, 'wp68_staging_support_test_decommissioned')
      WHERE user_id = ANY($1::text[])\`,
    [accountIds],
  );
  await client.query(
    \`UPDATE staff_elevations SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = ANY($1::text[])\`,
    [accountIds],
  );
  await client.query(
    \`UPDATE users
        SET password_hash = NULL, role = 'user', account_status = 'closed', deactivated_at = now()
      WHERE id = ANY($1::text[])\`,
    [accountIds],
  );
  const remaining = await client.query(
    \`SELECT count(*)::int AS active_session_count
       FROM auth_sessions
      WHERE user_id = ANY($1::text[]) AND revoked_at IS NULL\`,
    [accountIds],
  );
  if (remaining.rows[0].active_session_count !== 0) {
    throw new Error('wp68_decommission_active_session_remaining');
  }
  for (const id of accountIds) {
    await client.query(
      \`INSERT INTO audit_log (actor_role, action, resource_type, resource_id, metadata)
       VALUES ('system', 'staging.support_test_actor_decommissioned', 'user', $1, $2::jsonb)\`,
      [id, JSON.stringify({ environment: 'staging', simulationOnly: true, credentialsRevoked: true })],
    );
  }
  outcome = {
    status: 'decommissioned',
    decommissionedAccountCount: 3,
    credentialsRevoked: true,
    revokedSessionCount: sessions.rowCount,
  };
});
await pool.end();
process.stdout.write(JSON.stringify({
  ...outcome, environment: 'staging', simulationOnly: true,
}));
`;

async function requestJson(path, {
  method = 'GET',
  accessToken = null,
  stepUpToken = null,
  idempotency = null,
  body = undefined,
  fetchImpl = globalThis.fetch,
} = {}) {
  const response = await fetchImpl(`${wp68ApiBaseUrl}${path}`, {
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
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  return { response, value };
}

function requireStatus(result, expected, label) {
  if (result.response.status !== expected) {
    fail(`${label} returned ${result.response.status}:${result.value?.error ?? 'invalid_response'}`);
  }
  return result.value;
}

async function login(account) {
  const result = await requestJson('/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  const value = requireStatus(result, 200, `WP68 ${account.label} login`);
  if (typeof value?.accessToken !== 'string' || value.accessToken.length < 20
      || typeof value?.refreshToken !== 'string' || value.refreshToken.length < 20) {
    fail(`WP68 ${account.label} session is incomplete.`);
  }
  return Object.freeze({ accessToken: value.accessToken, refreshToken: value.refreshToken });
}

async function logout(session) {
  const result = await requestJson('/auth/logout', {
    method: 'POST',
    body: { refreshToken: session.refreshToken },
  });
  return result.response.status === 204;
}

async function stepUp(account, session) {
  const result = await requestJson('/admin/step-up', {
    method: 'POST',
    accessToken: session.accessToken,
    body: { currentPassword: account.password },
  });
  const value = requireStatus(result, 200, `WP68 ${account.label} step-up`);
  if (typeof value?.elevation?.token !== 'string' || value.elevation.token.length < 20
      || value.elevation.role !== 'admin') {
    fail(`WP68 ${account.label} step-up is incomplete.`);
  }
  return value.elevation.token;
}

function supportIntakePayload() {
  return {
    caseType: 'general_help',
    caseSubType: 'app_error_or_display',
    summary: 'Kontrollierter WP68-Staging-Supportfall ohne Personen-, Zahlungs- oder Buchungsdaten.',
    immediateDanger: false,
    safetyTriage: {
      version: 'sit_support_safety_triage_v1',
      packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
      guidanceVersion: 'T-003@1.0.0',
      immediateDanger: false,
      guidanceShown: false,
    },
    issueScope: {
      version: 'sit_support_single_issue_scope_v1',
      singleIssueConfirmed: true,
      separationGuidanceShown: true,
    },
  };
}

function futureIso(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function buildWp68Evidence({
  candidate,
  bootstrap,
  support,
  cleanup,
  capturedAt = new Date().toISOString(),
} = {}) {
  if (candidate?.applicationId !== 'com.shareittoo.app'
      || candidate?.versionCode !== '2026090904'
      || candidate?.apkSha256 !== '8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4'
      || candidate?.stagingRuntimeImage !== wp68ExpectedStagingRuntimeImage
      || bootstrap?.environment !== 'staging'
      || bootstrap?.simulationOnly !== true
      || bootstrap?.createdAccountCount !== 3
      || bootstrap?.roles?.join(',') !== expectedRoles.join(',')
      || support?.caseCreated !== true
      || support?.caseOperatingMode !== 'simulation'
      || support?.draftCreated !== true
      || support?.independentAdminReviewApproved !== true
      || support?.progressPublished !== true
      || support?.recipientReadbackVisible !== true
      || support?.publishedExternalMessageSent !== false
      || support?.futureDeadlineConfirmed !== true
      || cleanup?.credentialsRevoked !== true
      || cleanup?.decommissionedAccountCount !== 3
      || cleanup?.privateVaultDeleted !== true) {
    fail('WP68 evidence is incomplete or contradictory.');
  }
  const evidence = {
    schemaVersion: 1,
    kind: 'sit-wp68-staging-support-lifecycle',
    status: 'passed-simulation-only-temporary-roles-decommissioned',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionCode: candidate.versionCode,
      apkSha256: candidate.apkSha256,
      stagingRuntimeImage: candidate.stagingRuntimeImage,
      releaseChannel: 'internal',
      environment: 'staging',
    },
    bootstrap: {
      environment: 'staging',
      simulationOnly: true,
      temporaryAccountCount: bootstrap.createdAccountCount,
      temporaryRoleSequence: [...bootstrap.roles],
      directProductionAccess: false,
    },
    support: {
      intake: 'passed',
      operatingMode: support.caseOperatingMode,
      independentReview: 'approved-by-separate-admin',
      progressPublication: 'passed',
      recipientReadback: 'passed',
      externalMessageSent: false,
      futureDeadlineConfirmed: true,
      existingSupportCasesChanged: false,
    },
    cleanup: {
      temporaryAccountsDecommissioned: cleanup.decommissionedAccountCount,
      credentialsRevoked: true,
      privateVaultDeleted: true,
      auditHistoryRetained: true,
    },
    boundaries: {
      productionChanged: false,
      realUserChanged: false,
      existingSupportCasesChanged: false,
      externalEmailSent: false,
      externalMessageSent: false,
      paymentChanged: false,
      realMoneyUsed: false,
      googlePlayChanged: false,
      firebaseChanged: false,
      prMerged: false,
      containsAccountIdentity: false,
      containsCaseIdentity: false,
      containsCredential: false,
      containsToken: false,
      containsPrivateFilesystemPath: false,
    },
  };
  if (/\/Users\/|@[a-z0-9.-]+\.[a-z]{2,}|"(?:accessToken|refreshToken|password|secret)"/iu
    .test(JSON.stringify(evidence))) {
    fail('WP68 evidence contains private identity, path or credential material.');
  }
  return evidence;
}

export async function executeWp68StagingSupportLifecycle({
  gate = process.env[wp68ExecutionGate],
  vaultPath = privateVaultPath(),
  candidate = {
    applicationId: 'com.shareittoo.app',
    versionCode: '2026090904',
    apkSha256: '8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4',
  },
} = {}) {
  assertWp68ExecutionGate({ gate });
  const runtimeImage = await readWp68StagingRuntimeImage();
  const boundCandidate = Object.freeze({ ...candidate, stagingRuntimeImage: runtimeImage });
  const targetVault = assertPrivateVaultPath(vaultPath);
  const vault = await buildWp68PrivateVault();
  const sessions = [];
  let bootstrapAttempted = false;
  let bootstrapped = false;
  let remoteCleanup = null;
  let primaryError = null;
  try {
    await writeWp68PrivateVault(targetVault, vault);
    bootstrapAttempted = true;
    const bootstrap = await runRemoteJson(remoteBootstrapScript, {
      schemaVersion: 1,
      purpose: vault.purpose,
      accounts: vault.accounts.map(({ id, role, email, passwordHash, displayName }) => ({
        id, role, email, passwordHash, displayName,
      })),
    });
    if (bootstrap?.status !== 'bootstrapped') fail('WP68 remote bootstrap failed.');
    bootstrapped = true;

    const [reporter, author, reviewer] = vault.accounts;
    const reporterSession = await login(reporter);
    const authorSession = await login(author);
    const reviewerSession = await login(reviewer);
    sessions.push(reporterSession, authorSession, reviewerSession);
    const [authorStepUp, reviewerStepUp] = await Promise.all([
      stepUp(author, authorSession),
      stepUp(reviewer, reviewerSession),
    ]);

    const created = requireStatus(await requestJson('/support/cases', {
      method: 'POST',
      accessToken: reporterSession.accessToken,
      idempotency: idempotencyKey('wp68-intake'),
      body: supportIntakePayload(),
    }), 201, 'WP68 support intake');
    const supportCase = created?.supportCase;
    if (typeof supportCase?.id !== 'string' || supportCase?.operatingMode !== 'simulation'
        || !Number.isSafeInteger(supportCase?.version)) {
      fail('WP68 support intake result is incomplete.');
    }

    const draft = requireStatus(await requestJson(
      `/admin/support/cases/${encodeURIComponent(supportCase.id)}/progress-updates`, {
        method: 'POST',
        accessToken: authorSession.accessToken,
        stepUpToken: authorStepUp,
        idempotency: idempotencyKey('wp68-progress-draft'),
        body: {
          expectedVersion: supportCase.version,
          nextUpdateAt: futureIso(48),
          recipientUserId: reporter.id,
          firstName: 'Staging-Testperson',
          progressSinceLastUpdate: 'Der kontrollierte Staging-Fall wurde technisch aufgenommen und geprüft.',
          openCheck: 'Die simulierte Darstellung wird anhand der gespeicherten Falldaten geprüft.',
          userActionOrNoAction: 'Du musst aktuell nichts weiter unternehmen.',
          provisionalImpactStatement: 'Die kontrollierte Simulation hat keine Auswirkung auf echte Buchungen oder Zahlungen.',
          nextAction: 'Der dokumentierte Fortschritt wird im Staging-Fall nachvollziehbar bereitgestellt.',
        },
      },
    ), 201, 'WP68 progress draft');
    if (draft?.message?.sendStatus !== 'pending_approval'
        || draft?.message?.approvalLevel !== 'yellow_human_review'
        || draft?.progressUpdate?.proposalStatus !== 'pending_review') {
      fail('WP68 progress draft does not require independent approval.');
    }

    const review = requireStatus(await requestJson(
      `/admin/support/cases/${encodeURIComponent(supportCase.id)}/messages/${encodeURIComponent(draft.message.id)}/review`, {
        method: 'POST',
        accessToken: reviewerSession.accessToken,
        stepUpToken: reviewerStepUp,
        idempotency: idempotencyKey('wp68-progress-review'),
        body: {
          outcome: 'approved',
          expectedVersion: draft.message.version,
          expectedPayloadSha256: draft.message.renderedContentSha256,
          reviewNotes: 'Wortlaut, Staging-Modus und zukünftiger Prüfzeitpunkt wurden unabhängig geprüft.',
        },
      },
    ), 200, 'WP68 independent review');
    if (review?.message?.sendStatus !== 'approved' || review?.message?.reviewOutcome !== 'approved') {
      fail('WP68 independent review did not approve the draft.');
    }

    const publication = requireStatus(await requestJson(
      `/admin/support/cases/${encodeURIComponent(supportCase.id)}/progress-updates/${encodeURIComponent(draft.progressUpdate.id)}/publication`, {
        method: 'POST',
        accessToken: authorSession.accessToken,
        stepUpToken: authorStepUp,
        idempotency: idempotencyKey('wp68-progress-publication'),
        body: {
          expectedProgressVersion: draft.progressUpdate.proposalVersion + 1,
          expectedMessageVersion: review.message.version,
          expectedPayloadSha256: review.message.renderedContentSha256,
        },
      },
    ), 200, 'WP68 progress publication');
    if (publication?.progressUpdate?.proposalStatus !== 'published'
        || publication?.message?.sendStatus !== 'sent'
        || publication?.message?.externalMessageSent !== false
        || typeof publication?.supportCase?.nextUpdateAt !== 'string'
        || new Date(publication.supportCase.nextUpdateAt).getTime() <= Date.now()) {
      fail('WP68 progress publication result is incomplete.');
    }

    const recipientReadback = requireStatus(await requestJson(
      `/support/cases/${encodeURIComponent(supportCase.id)}`,
      { accessToken: reporterSession.accessToken },
    ), 200, 'WP68 recipient support readback');
    if (recipientReadback?.supportCase?.id !== supportCase.id
        || !Array.isArray(recipientReadback?.messages)
        || recipientReadback.messages.length !== 1) {
      fail('WP68 recipient cannot read the published support result.');
    }

    const support = {
      caseCreated: true,
      caseOperatingMode: supportCase.operatingMode,
      draftCreated: true,
      independentAdminReviewApproved: true,
      progressPublished: true,
      recipientReadbackVisible: true,
      publishedExternalMessageSent: publication.message.externalMessageSent,
      futureDeadlineConfirmed: true,
    };
    return { candidate: boundCandidate, bootstrap, support };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError = null;
    for (const session of sessions.reverse()) {
      try {
        if (!(await logout(session))) cleanupError ??= new Error('WP68 session revocation failed.');
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (bootstrapAttempted) {
      try {
        remoteCleanup = await runRemoteJson(remoteDecommissionScript, {
          schemaVersion: 1,
          accounts: vault.accounts.map(({ id, email, role }) => ({ id, email, role })),
        });
        const cleanupConfirmed = remoteCleanup?.status === 'decommissioned'
          && remoteCleanup?.decommissionedAccountCount === 3
          && remoteCleanup?.credentialsRevoked === true;
        const noBootstrapTarget = !bootstrapped && remoteCleanup?.status === 'no_accounts_found'
          && remoteCleanup?.decommissionedAccountCount === 0
          && remoteCleanup?.credentialsRevoked === true;
        if (!cleanupConfirmed && !noBootstrapTarget) {
          throw new Error('WP68 remote decommission result is incomplete.');
        }
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      await rm(targetVault, { force: true });
    } catch (error) {
      cleanupError ??= error;
    }
    if (cleanupError !== null) {
      if (primaryError !== null) primaryError.message = `${primaryError.message}; cleanup: ${sanitizeError(cleanupError)}`;
      else throw cleanupError;
    }
  }
}

export function parseWp68Arguments(values) {
  const result = { execute: false, vaultPath: null };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--execute') result.execute = true;
    else if (value === '--vault') result.vaultPath = values[++index] ?? fail('--vault requires a path.');
    else fail(`Unknown argument: ${value}`);
  }
  return result;
}

async function run() {
  const args = parseWp68Arguments(process.argv.slice(2));
  if (!args.execute) {
    process.stdout.write(`${JSON.stringify({
      status: 'plan-only',
      gate: wp68ExecutionGate,
      environment: 'staging',
      operatingMode: 'simulation',
      temporaryRoles: expectedRoles,
      production: false,
    })}\n`);
    return;
  }
  const result = await executeWp68StagingSupportLifecycle({ vaultPath: args.vaultPath ?? privateVaultPath() });
  const evidence = buildWp68Evidence({
    ...result,
    cleanup: {
      decommissionedAccountCount: 3,
      credentialsRevoked: true,
      privateVaultDeleted: true,
    },
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => {
    process.stderr.write(`ERROR: ${sanitizeError(error)}\n`);
    process.exitCode = 1;
  });
}
