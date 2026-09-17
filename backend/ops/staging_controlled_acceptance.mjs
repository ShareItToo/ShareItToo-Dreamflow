#!/usr/bin/env node

import { chmod, lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const backendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const composeFile = join(backendRoot, 'compose.staging.acceptance.yml');

function fail(code) {
  const error = new Error(`Controlled Staging acceptance failed: ${code}`);
  error.code = code;
  throw error;
}

function fullCommit(value, name) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(`${name}_must_be_full_commit`);
  return value;
}

function runCommand(command, args, { env = process.env, phase = 'command' } = {}) {
  return runCommandWithInput(command, args, '', { env, phase });
}

function runCommandWithInput(command, args, input, { env = process.env, phase = 'command' } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: backendRoot, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', () => reject(new Error(`controlled_acceptance_${phase}_failed`)));
    child.once('close', (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`controlled_acceptance_${phase}_failed`));
    });
    child.stdin.end(input);
  });
}

export function runCommandStatus(command, args, { env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: backendRoot, env, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', () => reject(new Error('controlled_acceptance_status_failed')));
    child.once('close', (code) => resolvePromise({ code, stdout: stdout.trim() }));
  });
}

async function assertEvidenceDirectory(filePath) {
  if (!isAbsolute(filePath)) fail('evidence_path_not_absolute');
  const parent = resolve(filePath, '..');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (parentStat.mode & 0o077) !== 0) {
    fail('evidence_directory_unsafe');
  }
  const canonical = await realpath(parent);
  const repositoryRelative = relative(repositoryRoot, canonical);
  if (repositoryRelative === '' || (!repositoryRelative.startsWith('..') && !isAbsolute(repositoryRelative))) {
    fail('evidence_directory_inside_repository');
  }
}

async function imageRevision(image) {
  const label = await runCommand('docker', ['image', 'inspect', image, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}'], { phase: 'image_inspect' });
  if (!/^[0-9a-f]{40}$/u.test(label)) fail('image_revision_invalid');
  return label;
}

async function startAcceptance({ runtimeCommit, opsCommit, port }) {
  if (process.env.SIT_STAGING_CONTROLLED_ACCEPTANCE_EXECUTE !== '1') fail('explicit_execute_required');
  if (process.env.SIT_STAGING_ACCEPTANCE_CONFIRM !== runtimeCommit) fail('exact_runtime_confirmation_required');
  if ((await runCommand('git', ['rev-parse', 'HEAD'], { phase: 'ops_head_read' })) !== opsCommit) {
    fail('ops_checkout_commit_mismatch');
  }
  const publicService = await runCommandStatus('docker', [
    'inspect', '--format', '{{if .State.Running}}true{{else}}false{{end}}', 'shareittoo-staging-api',
  ]);
  if (publicService.code === 0 && publicService.stdout === 'true') fail('public_staging_service_running');
  if (publicService.code !== 0 && publicService.code !== 1) fail('public_staging_service_status_failed');
  await runCommand(process.env.NODE_BINARY ?? 'node', [
    join(backendRoot, 'ops', 'validate_mfa_staging_secret.mjs'),
  ], {
    env: { ...process.env, MFA_ENCRYPTION_KEY_HOST_FILE: process.env.MFA_ENCRYPTION_KEY_HOST_FILE ?? '' },
    phase: 'mfa_secret_validation',
  });
  const publicPort = Number(process.env.STAGING_API_PORT ?? '18080');
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === publicPort) fail('acceptance_port_not_distinct');
  const image = `${process.env.IMAGE_REPOSITORY ?? 'shareittoo-api'}:${runtimeCommit}`;
  if (await imageRevision(image) !== runtimeCommit) fail('acceptance_image_revision_mismatch');
  await runCommand('docker', [
    'compose', '--project-name', 'sit-staging-acceptance', '--env-file', join(backendRoot, '.env.staging'),
    '-f', composeFile, 'up', '-d', '--no-build', '--wait', 'api_acceptance',
  ], { env: { ...process.env, ACCEPTANCE_IMAGE: image, APP_COMMIT: runtimeCommit, STAGING_ACCEPTANCE_PORT: String(port) }, phase: 'acceptance_start' });
  return Object.freeze({ runtimeCommit, opsCommit, port, image });
}

const mfaProbe = `
import crypto from 'node:crypto';
import { pool } from '/app/src/db.js';
import { hashPassword, signAccessToken } from '/app/src/security.js';

const runId = 'controlled-acceptance-' + crypto.randomUUID();
const userId = runId + '-user';
const sessionId = crypto.randomUUID();
const email = runId + '@example.invalid';
const password = 'ControlledAcceptance9!';
const profile = {
  displayName: 'Controlled Acceptance',
  preferredLanguage: 'de-DE',
  emailVerified: true,
  phoneVerified: false,
  isVerified: false,
  isBanned: false,
  role: 'user',
};

async function request(path, { method = 'GET', token, body, expected }) {
  const response = await fetch('http://127.0.0.1:8080/v1' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let value = null;
  try { value = text ? JSON.parse(text) : null; } catch { /* status-only response */ }
  if (response.status !== expected) throw new Error('mfa_probe_http_' + path.replace(/[^A-Za-z0-9]+/gu, '_') + '_' + response.status);
  return value;
}

try {
  const passwordHash = await hashPassword(password);
  await pool.query(
    \`INSERT INTO users (
       id, email, password_hash, profile, role, account_status,
       email_verified_at, terms_accepted_at, privacy_accepted_at,
       minimum_age_confirmed_at, private_use_confirmed_at
     ) VALUES ($1, $2, $3, $4::jsonb, 'user', 'active', now(), now(), now(), now(), now())\`,
    [userId, email, passwordHash, JSON.stringify(profile)],
  );
  await pool.query(
    \`INSERT INTO auth_sessions (id, user_id, device_label)
     VALUES ($1, $2, 'controlled acceptance')\`,
    [sessionId, userId],
  );
  const token = signAccessToken({ id: userId, email }, { sessionId });
  const enrolled = await request('/auth/mfa/enroll', {
    method: 'POST', token, expected: 201,
    body: { currentPassword: password, idempotencyKey: runId + '-enroll' },
  });
  if (typeof enrolled?.secret !== 'string' || enrolled.secret.length < 16) throw new Error('mfa_probe_secret_missing');
  const pending = await request('/auth/mfa/status', { token, expected: 200 });
  if (pending?.pending !== true || pending?.enabled !== false) throw new Error('mfa_probe_pending_missing');
  const cancelled = await request('/auth/mfa/enroll/cancel', {
    method: 'POST', token, expected: 200,
    body: { currentPassword: password },
  });
  if (cancelled?.cancelled !== true) throw new Error('mfa_probe_cancel_missing');
  const finalStatus = await request('/auth/mfa/status', { token, expected: 200 });
  if (finalStatus?.pending !== false || finalStatus?.enabled !== false) throw new Error('mfa_probe_disabled_missing');
  process.stdout.write(JSON.stringify({ mfa: 'enroll-pending-cancel-passed' }));
} finally {
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  await pool.end();
}
`;

async function runMfaProbe() {
  const output = await runCommandWithInput(
    'docker',
    ['exec', '-i', 'shareittoo-staging-acceptance-api', 'node', '--input-type=module'],
    mfaProbe,
    { phase: 'mfa_probe' },
  );
  if (output !== JSON.stringify({ mfa: 'enroll-pending-cancel-passed' })) fail('mfa_probe_result_invalid');
}

async function publicCandidateProbe(runtimeCommit) {
  const publicBase = process.env.SIT_STAGING_PUBLIC_BASE_URL;
  if (typeof publicBase !== 'string' || !/^https:\/\//u.test(publicBase)) fail('public_staging_base_url_required');
  let url;
  try { url = new URL('/version', publicBase); } catch { fail('public_staging_base_url_invalid'); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch {
    return Object.freeze({ publicProxyReachable: false, publicCandidateServed: false, publicEndpointReachable: false });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return Object.freeze({ publicProxyReachable: false, publicCandidateServed: false, publicEndpointReachable: true });
  let payload;
  try { payload = await response.json(); } catch { return Object.freeze({ publicProxyReachable: false, publicCandidateServed: false, publicEndpointReachable: true }); }
  assertPublicCandidateNotServed(payload, runtimeCommit);
  return Object.freeze({ publicProxyReachable: false, publicCandidateServed: false, publicEndpointReachable: true });
}

export function assertPublicCandidateNotServed(payload, runtimeCommit) {
  if (payload?.commit === runtimeCommit) fail('public_proxy_serves_candidate');
  return true;
}

async function verifyAcceptance({ runtimeCommit, opsCommit, port, evidenceFile }) {
  const response = await fetch(`http://127.0.0.1:${port}/version`);
  if (!response.ok) fail('acceptance_version_unreachable');
  const version = await response.json();
  if (version?.commit !== runtimeCommit) fail('acceptance_version_commit_mismatch');
  const health = await fetch(`http://127.0.0.1:${port}/health/ready`);
  if (!health.ok) fail('acceptance_readiness_failed');
  await runMfaProbe();
  const publicProbe = await publicCandidateProbe(runtimeCommit);
  await assertEvidenceDirectory(evidenceFile);
  const evidence = {
    kind: 'sit-staging-controlled-acceptance',
    status: 'passed',
    runtimeCommit,
    opsCommit,
    acceptanceTarget: 'loopback',
    acceptancePort: port,
    ...publicProbe,
    publicReleaseComplete: false,
    servicesRemainQuiesced: true,
    providerTraffic: false,
    createdAt: new Date().toISOString(),
  };
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(evidenceFile, 0o600);
  return evidence;
}

async function promotePublic({ runtimeCommit, opsCommit, evidenceFile }) {
  await runCommand(process.env.NODE_BINARY ?? 'node', [
    join(backendRoot, 'ops', 'validate_staging_controlled_acceptance.mjs'),
  ], {
    env: {
      ...process.env,
      SIT_STAGING_ACCEPTANCE_EVIDENCE_FILE: evidenceFile,
      SIT_EXPECTED_RUNTIME_COMMIT: runtimeCommit,
      SIT_EXPECTED_OPS_COMMIT: opsCommit,
      SIT_REQUIRE_PUBLIC_RELEASE: '1',
    },
    phase: 'acceptance_validation',
  });
  if (process.env.SIT_STAGING_PUBLIC_RELEASE_CONFIRM !== runtimeCommit) fail('public_release_confirmation_required');
  await runCommand('docker', [
    'compose', '--project-name', 'sit-staging-acceptance', '--env-file', join(backendRoot, '.env.staging'),
    '-f', composeFile, 'down', '--remove-orphans',
  ], { phase: 'acceptance_stop' });
  await runCommand(join(backendRoot, 'ops', 'deploy_release.sh'), ['staging', runtimeCommit], {
    env: {
      ...process.env,
      SIT_STAGING_CONTROLLED_RELEASE: '1',
      SIT_STAGING_PUBLIC_RELEASE_CONFIRM: runtimeCommit,
      SIT_STAGING_ACCEPTANCE_EVIDENCE_FILE: evidenceFile,
      SIT_STAGING_REHEARSAL_OPS_COMMIT: opsCommit,
    },
    phase: 'public_release',
  });
  return Object.freeze({ status: 'public-release-complete', runtimeCommit, opsCommit });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  try {
    const runtimeCommit = fullCommit(process.argv[3], 'runtimeCommit');
    const opsCommit = fullCommit(process.env.SIT_STAGING_REHEARSAL_OPS_COMMIT, 'opsCommit');
    const port = Number(process.env.STAGING_ACCEPTANCE_PORT ?? '18081');
    const evidenceFile = process.env.SIT_STAGING_ACCEPTANCE_EVIDENCE_FILE ?? '';
    if (mode === 'start') process.stdout.write(`${JSON.stringify(await startAcceptance({ runtimeCommit, opsCommit, port }))}\n`);
    else if (mode === 'verify') process.stdout.write(`${JSON.stringify(await verifyAcceptance({ runtimeCommit, opsCommit, port, evidenceFile }))}\n`);
    else if (mode === 'release') process.stdout.write(`${JSON.stringify(await promotePublic({ runtimeCommit, opsCommit, evidenceFile }))}\n`);
    else fail('mode_invalid');
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Controlled Staging acceptance failed.'}\n`);
    process.exitCode = 1;
  }
}
