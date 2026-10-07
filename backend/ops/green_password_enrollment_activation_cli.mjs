#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  GreenPasswordEnrollmentActivationError,
  assertGreenEnrollmentActivationManifest,
  greenPasswordEnrollmentHealthSha256,
  readProtectedActivationFile,
  runGreenPasswordEnrollmentActivation,
} from './green_password_enrollment_activation.mjs';

const execFileAsync = promisify(execFile);
export const GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..',
);
const denialCode = 'green_password_enrollment_activation_cli_denied';
const registryTarget = '/run/secrets/staging-password-enrollment-registry.json';
const maximumOutputBytes = 1024 * 1024;
const defaultTimeoutMs = 20_000;
const candidateConvergenceDeadlineMs = 15_000;
const mutationConvergenceDeadlineMs = 30_000;
const convergenceIntervalMs = 500;
const maximumConvergenceAttempts = 61;
const commitPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const containerPattern = /^[a-f0-9]{64}$/u;
const requiredSourcePaths = Object.freeze([
  'backend/ops/activate_staging_google_auth.mjs',
  'backend/ops/green_password_enrollment_activation_cli.mjs',
  'backend/ops/green_password_enrollment_activation.mjs',
  'backend/src/config.js',
  'backend/src/db.js',
  'backend/src/mailer.js',
  'backend/src/release.js',
  'backend/src/staging_password_enrollment.js',
  'tool/staging_password_enrollment_web_readiness.mjs',
]);

export class GreenPasswordEnrollmentActivationCliError extends Error {
  constructor(state = 'denied') {
    super(denialCode);
    this.code = denialCode;
    this.state = state;
  }
}

const deny = (state = 'denied') => { throw new GreenPasswordEnrollmentActivationCliError(state); };
const plain = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value)
  && Object.keys(value).length === keys.length
  && Object.keys(value).every((key) => keys.includes(key));
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;

export function greenEnrollmentCandidateRuntimeReadbackSha256({
  mounts, registryReadback, runtimeIdentity, runtime,
}) {
  if (!Array.isArray(mounts) || mounts.length !== 4
      || mounts.some((mount) => !exact(mount, ['readOnly', 'source', 'target', 'type'])
        || !['bind', 'volume'].includes(mount.type) || typeof mount.source !== 'string'
        || mount.source === '' || typeof mount.target !== 'string'
        || !path.isAbsolute(mount.target) || typeof mount.readOnly !== 'boolean')
      || new Set(mounts.map((mount) => mount.target)).size !== mounts.length
      || !exact(runtimeIdentity, ['gid', 'uid'])
      || !Number.isSafeInteger(runtimeIdentity.gid) || runtimeIdentity.gid < 0
      || !Number.isSafeInteger(runtimeIdentity.uid) || runtimeIdentity.uid < 0
      || !exact(registryReadback, [
        'invitationCount', 'parserStatus', 'readable', 'sha256', 'writable',
      ]) || !Number.isSafeInteger(registryReadback.invitationCount)
      || registryReadback.invitationCount < 1 || registryReadback.parserStatus !== 'ok'
      || registryReadback.readable !== true || registryReadback.writable !== false
      || !digestPattern.test(registryReadback.sha256)
      || !exact(runtime, [
        'accessGateEnabled', 'accessGateValid', 'appPublicUrl', 'commit',
        'deploymentEnvironment', 'enrollmentEnabled', 'mailTransport',
        'paymentTransport', 'privatePilotEnabled', 'stripeLivemode', 'version',
      ]) || !commitPattern.test(runtime.commit) || typeof runtime.version !== 'string'
      || typeof runtime.appPublicUrl !== 'string'
      || typeof runtime.deploymentEnvironment !== 'string'
      || typeof runtime.mailTransport !== 'string' || typeof runtime.paymentTransport !== 'string'
      || ['accessGateEnabled', 'accessGateValid', 'enrollmentEnabled', 'privatePilotEnabled',
        'stripeLivemode'].some((key) => typeof runtime[key] !== 'boolean')) deny();
  const normalizedMounts = mounts.map((mount) => ({ ...mount }))
    .sort((left, right) => left.target.localeCompare(right.target));
  return crypto.createHash('sha256').update(JSON.stringify(canonical({
    mounts: normalizedMounts, registryReadback, runtimeIdentity, runtime,
  }))).digest('hex');
}

export function greenPasswordEnrollmentCommandRequest(executable, args, cwd) {
  if (!['docker', 'git'].includes(executable) || !Array.isArray(args)
      || args.some((argument) => typeof argument !== 'string' || argument.includes('\0'))
      || typeof cwd !== 'string' || !path.isAbsolute(cwd)) deny('command-shape');
  return Object.freeze({ executable, args: Object.freeze([...args]), cwd });
}

export async function executeGreenPasswordEnrollmentArgv(executable, args, {
  cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
  timeoutMs = defaultTimeoutMs,
} = {}) {
  const request = greenPasswordEnrollmentCommandRequest(executable, args, cwd);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) deny();
  try {
    const result = await execFileAsync(executable, args, {
      cwd, env: process.env, encoding: 'utf8', maxBuffer: maximumOutputBytes,
      timeout: timeoutMs, windowsHide: true,
    });
    return Object.freeze({ ...request, status: 0, stdout: result.stdout });
  } catch (error) {
    return Object.freeze({
      ...request,
      status: Number.isInteger(error?.code) ? error.code : 125,
      stdout: typeof error?.stdout === 'string'
        && Buffer.byteLength(error.stdout) <= maximumOutputBytes ? error.stdout : '',
    });
  }
}

function commandRunner(command, cwd) {
  if (typeof command !== 'function' || typeof cwd !== 'string' || !path.isAbsolute(cwd)) deny();
  return async (executable, args, {
    allowFailure = false, timeoutMs = defaultTimeoutMs,
  } = {}) => {
    const expected = greenPasswordEnrollmentCommandRequest(executable, args, cwd);
    let result;
    try {
      result = await command(executable, Object.freeze([...args]), Object.freeze({ cwd, timeoutMs }));
    } catch { deny('command-failed'); }
    if (!exact(result, ['args', 'cwd', 'executable', 'status', 'stdout'])
        || result.executable !== expected.executable || result.cwd !== expected.cwd
        || JSON.stringify(result.args) !== JSON.stringify(expected.args)
        || !Number.isInteger(result.status)
        || result.status < 0 || result.status > 255 || typeof result.stdout !== 'string'
        || Buffer.byteLength(result.stdout) > maximumOutputBytes) deny('command-drift');
    if (result.status !== 0 && !allowFailure) deny('command-failed');
    return result;
  };
}

function oneLine(value) {
  if (typeof value !== 'string' || value.includes('\0') || value.includes('\r')) deny();
  const body = value.endsWith('\n') ? value.slice(0, -1) : value;
  if (body === '' || body.includes('\n')) deny();
  return body;
}

function jsonLine(value) {
  try {
    const parsed = JSON.parse(oneLine(value));
    if (!plain(parsed)) deny();
    return parsed;
  } catch (error) {
    if (error instanceof GreenPasswordEnrollmentActivationCliError) throw error;
    deny();
  }
}

function immutableImageReference(image, digest) {
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  return `${lastColon > lastSlash ? image.slice(0, lastColon) : image}@${digest}`;
}

const healthProbeSource = String.raw`
const get = async (route) => {
  const response = await fetch('http://127.0.0.1:8080' + route,
    { signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json() };
};
const [live, ready, version] = await Promise.all([
  get('/health/live'), get('/health/ready'), get('/version'),
]);
const flag = (name) => String(process.env[name] ?? '').trim().toLowerCase() === 'true';
process.stdout.write(JSON.stringify({
  commit: version.body?.commit,
  deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT,
  firebaseAuthEnabled: flag('FIREBASE_AUTH_ENABLED'),
  firebasePhoneEnabled: flag('FIREBASE_PHONE_VERIFICATION_ENABLED'),
  googleRegistrationEnabled: flag('SIT_STAGING_GOOGLE_REGISTRATION_ENABLED'),
  liveStatus: live.status, mailStatus: ready.body?.checks?.mail,
  passwordEnrollmentEnabled: flag('SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED'),
  paymentTransport: process.env.PAYMENT_TRANSPORT, readyStatus: ready.status,
  stripeLivemode: flag('STRIPE_LIVEMODE'),
}) + '\n');
`;

export const GREEN_ENROLLMENT_QUEUE_AGGREGATE_SQL =
  'SELECT status, channel, count(*)::int AS count FROM notification_outbox GROUP BY status, channel';

const queueProbeSource = String.raw`
import { pool } from './src/db.js';
try {
  const result = await pool.query(
    ${JSON.stringify(GREEN_ENROLLMENT_QUEUE_AGGREGATE_SQL)},
  );
  const output = { dead: 0, pending: 0, processing: 0, retry: 0,
    sentInApp: 0, sentPush: 0, suppressedEmail: 0, suppressedPush: 0 };
  for (const row of result.rows) {
    const count = Number(row.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('queue');
    if (['dead', 'pending', 'processing', 'retry'].includes(row.status)) output[row.status] += count;
    else if (row.status === 'sent' && row.channel === 'in_app') output.sentInApp += count;
    else if (row.status === 'sent' && row.channel === 'push') output.sentPush += count;
    else if (row.status === 'suppressed' && row.channel === 'email') output.suppressedEmail += count;
    else if (row.status === 'suppressed' && row.channel === 'push') output.suppressedPush += count;
    else throw new Error('queue');
  }
  process.stdout.write(JSON.stringify(output) + '\n');
} finally { await pool.end(); }
`;

const registryProbeSource = String.raw`
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readProtectedEnrollmentRegistry } from './src/staging_password_enrollment.js';
const file = process.env.SIT_W12_REGISTRY_TARGET;
const records = readProtectedEnrollmentRegistry(file);
const bytes = Buffer.from(JSON.stringify(records) + '\n');
let writable = false;
try { const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
  fs.closeSync(fd); writable = true; } catch {}
process.stdout.write(JSON.stringify({
  gid: process.getgid(), uid: process.getuid(), user: 'shareittoo', readable: true,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'), writable,
}) + '\n');
bytes.fill(0);
`;

const candidateProofSource = String.raw`
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from './src/config.js';
import { getMailerStatus, verifyMailer } from './src/mailer.js';
import { releaseMetadata } from './src/release.js';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => hash(JSON.stringify(canonical(value)));
const invitations = config.stagingPasswordEnrollment.invitations;
const users = config.stagingAccess.allowedUserIds;
const notificationUsers = config.notifications.externalRecipientGate.userIds;
const emails = config.notifications.externalRecipientGate.emails;
const recipientMatches = invitations.map((record) => emails.filter((email) =>
  hash(record.tokenDigest + '\n' + email) === record.emailDigest));
const file = process.env.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE;
const registryBytes = Buffer.from(JSON.stringify(invitations) + '\n');
let writable = false;
try { const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
  fs.closeSync(fd); writable = true; } catch {}
await verifyMailer();
const mailerStatus = getMailerStatus();
const smtp = {
  host: config.mail.host, port: String(config.mail.port), secure: String(config.mail.secure),
  requireTls: String(config.mail.requireTls), from: config.mail.from,
  replyTo: config.mail.replyTo, authMode: config.mail.user === '' ? 'relay' : 'authenticated',
};
const runtime = {
  appPublicUrl: config.appPublicUrl, deploymentEnvironment: config.deploymentEnvironment,
  passwordEnrollmentEnabled: config.stagingPasswordEnrollment.enabled,
  accessGateEnabled: config.stagingAccess.enabled, accessGateValid: config.stagingAccess.valid,
  privatePilotEnabled: config.privatePilotV4Enabled, paymentTransport: config.payments.transport,
  stripeLivemode: config.payments.livemode, mailTransport: config.mail.transport,
};
const mounts = JSON.parse(process.env.SIT_W12_CANDIDATE_MOUNTS_JSON ?? 'null');
if (!Array.isArray(mounts) || mounts.length !== 4
    || mounts.some((mount) => !mount || typeof mount !== 'object'
      || Object.keys(mount).sort().join(',') !== 'readOnly,source,target,type'
      || !['bind', 'volume'].includes(mount.type) || typeof mount.source !== 'string'
      || mount.source === '' || typeof mount.target !== 'string'
      || !mount.target.startsWith('/') || typeof mount.readOnly !== 'boolean')
    || new Set(mounts.map((mount) => mount.target)).size !== mounts.length) throw new Error('mounts');
mounts.sort((left, right) => left.target.localeCompare(right.target));
const runtimeIdentity = { gid: process.getgid(), uid: process.getuid() };
const registryReadback = { invitationCount: invitations.length, parserStatus: 'ok', readable: true,
  sha256: hash(registryBytes), writable };
const runtimeReadback = {
  accessGateEnabled: runtime.accessGateEnabled, accessGateValid: runtime.accessGateValid,
  appPublicUrl: runtime.appPublicUrl, commit: releaseMetadata.commit,
  deploymentEnvironment: runtime.deploymentEnvironment,
  enrollmentEnabled: runtime.passwordEnrollmentEnabled,
  mailTransport: runtime.mailTransport, paymentTransport: runtime.paymentTransport,
  privatePilotEnabled: runtime.privatePilotEnabled, stripeLivemode: runtime.stripeLivemode,
  version: releaseMetadata.version,
};
const observed = new Date(process.env.SIT_W12_OBSERVED_AT);
const validUntil = new Date(observed.getTime() + 15 * 60 * 1000);
const readiness = {
  sourceCommit: releaseMetadata.commit, sourceVersion: releaseMetadata.version,
  targetEnvironment: 'staging-green', runtimeDeploymentEnvironment: config.deploymentEnvironment,
  apiBaseUrl: config.publicBaseUrl, publicBaseUrl: config.publicBaseUrl,
  appPublicUrl: config.appPublicUrl, returnOrigin: new URL(config.appPublicUrl).origin,
  passwordEnrollmentEnabled: config.stagingPasswordEnrollment.enabled,
  invitationCount: invitations.length, invitationConfigurationSha256: digest(invitations),
  invitationRegistrySha256: hash(registryBytes),
  accessGateEnabled: config.stagingAccess.enabled, accessGateValid: config.stagingAccess.valid,
  allowedUserCount: users.length, allowedUserIdsSha256: digest(users),
  invitationPrincipalMatchCount: invitations.filter((record) => users.includes(record.userId)).length,
  unmatchedInvitationPrincipalCount: invitations.filter((record) => !users.includes(record.userId)).length,
  notificationAllowedUserCount: notificationUsers.length,
  notificationAllowedUserIdsSha256: digest(notificationUsers),
  invitationNotificationUserMatchCount:
    invitations.filter((record) => notificationUsers.includes(record.userId)).length,
  unmatchedInvitationNotificationUserCount:
    invitations.filter((record) => !notificationUsers.includes(record.userId)).length,
  privatePilotEnabled: config.privatePilotV4Enabled,
  realPaymentsEnabled: config.payments.transport === 'stripe' && config.payments.livemode,
  mailTransport: config.mail.transport, mailerStatus,
  recipientGateEnabled: config.notifications.externalRecipientGate.enabled,
  allowedRecipientCount: emails.length, allowedRecipientEmailsSha256: digest(emails),
  invitationRecipientMatchCount: recipientMatches.filter((matches) => matches.length === 1).length,
  unmatchedInvitationRecipientCount: recipientMatches.filter((matches) => matches.length !== 1).length,
  invitationRecipientBindingSha256:
    digest(invitations.map((record) => ({ emailDigest: record.emailDigest, userId: record.userId }))),
  runtimeConfigurationSha256: digest(runtime), smtpConfigurationSha256: digest(smtp),
  runtimeReadbackSha256: digest({ mounts, registryReadback, runtimeIdentity,
    runtime: runtimeReadback }),
  mailReadbackSha256: digest({ mailerStatus, smtpConfigurationSha256: digest(smtp) }),
  observedAtUtc: observed.toISOString().replace('.000Z', 'Z'),
  validUntilUtc: validUntil.toISOString().replace('.000Z', 'Z'),
};
const readinessJson = JSON.stringify(readiness);
const evidence = {
  schemaVersion: 2, kind: 'sit-staging-password-enrollment-web-readiness',
  evidenceClass: 'verified-runtime', syntheticFixture: false, readiness,
  readinessSha256: hash(readinessJson),
};
const evidenceJson = JSON.stringify(evidence);
process.stdout.write(JSON.stringify({
  runtimeIdentity, registryReadback,
  readinessEvidence: evidence, readinessEvidenceSha256: hash(evidenceJson),
}) + '\n');
registryBytes.fill(0);
`;

const dockerNodeArgs = (containerId, source, environment = []) => [
  'exec', ...environment.flatMap(([name, value]) => ['--env', `${name}=${value}`]),
  containerId, 'node', '--input-type=module', '--eval', source,
];

export function createGreenPasswordEnrollmentCommandAdapter({
  manifest,
  command = executeGreenPasswordEnrollmentArgv,
  cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
  activationNow = Date.now(),
  monotonicNow = () => performance.now(),
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  const target = assertGreenEnrollmentActivationManifest(manifest);
  if (!Number.isSafeInteger(activationNow) || typeof monotonicNow !== 'function'
      || typeof wait !== 'function') deny();
  const run = commandRunner(command, cwd);
  const observedAt = new Date(activationNow); observedAt.setUTCMilliseconds(0);
  const observedAtUtc = observedAt.toISOString().replace('.000Z', 'Z');
  let queueContainerId = target.currentContainerId;
  let lastMonotonic = -1;

  const readMonotonic = () => {
    const value = monotonicNow();
    if (typeof value !== 'number' || !Number.isFinite(value) || value < lastMonotonic) {
      deny('monotonic-clock-invalid');
    }
    lastMonotonic = value;
    return value;
  };
  const remainingMilliseconds = (deadline) => {
    const remaining = Math.floor(deadline - readMonotonic());
    if (remaining < 1) deny('convergence-unconfirmed');
    return Math.min(30_000, remaining);
  };
  const boundedRun = (deadline, executable, args, options = {}) => run(executable, args, {
    ...options,
    timeoutMs: Math.min(options.timeoutMs ?? defaultTimeoutMs,
      remainingMilliseconds(deadline)),
  });

  const inspectContainer = async (identity, deadline = null) => {
    const invoke = deadline === null ? run
      : (executable, args, options) => boundedRun(deadline, executable, args, options);
    const result = await invoke('docker', [
      'container', 'inspect', '--format', '{{json .}}', identity,
    ], { allowFailure: true });
    if (result.status === 0) return jsonLine(result.stdout);
    const filter = containerPattern.test(identity) ? `id=${identity}` : `name=^/${identity}$`;
    const inventory = await invoke('docker', [
      'container', 'ls', '--all', '--no-trunc', '--filter', filter, '--format', '{{.ID}}',
    ]);
    if (inventory.stdout === '') return null;
    const observedId = oneLine(inventory.stdout);
    if (!containerPattern.test(observedId)) deny('container-inventory-invalid');
    deny('container-inspect-unconfirmed');
  };
  const inspectImage = async (identity, deadline = null) => jsonLine((await (deadline === null
    ? run('docker', [
      'image', 'inspect', '--format', '{{json .}}', identity,
    ])
    : boundedRun(deadline, 'docker', [
      'image', 'inspect', '--format', '{{json .}}', identity,
    ]))).stdout);
  const inspectNetwork = async (identity) => jsonLine((await run('docker', [
    'network', 'inspect', '--format', '{{json .}}', identity,
  ])).stdout);
  const probeHealth = async (id, deadline = null) => jsonLine((await (deadline === null
    ? run('docker', dockerNodeArgs(id, healthProbeSource))
    : boundedRun(deadline, 'docker', dockerNodeArgs(id, healthProbeSource)))).stdout);
  const readQueue = async (id = target.currentContainerId, deadline = null) => jsonLine((await (
    deadline === null ? run('docker', dockerNodeArgs(id, queueProbeSource))
      : boundedRun(deadline, 'docker', dockerNodeArgs(id, queueProbeSource))
  )).stdout);

  const collectTargetProbe = async () => {
    const result = await run('docker', [
      'run', '--rm', '--network', 'none', '--read-only', '--user', 'shareittoo',
      '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL',
      '--env', `SIT_W12_REGISTRY_TARGET=${registryTarget}`,
      '--mount', `type=bind,src=${target.registryFile},dst=${registryTarget},readonly=true`,
      '--entrypoint', 'node', immutableImageReference(target.targetImage, target.targetImageDigest),
      '--input-type=module', '--eval', registryProbeSource,
    ]);
    const probe = jsonLine(result.stdout);
    if (!exact(probe, ['gid', 'readable', 'sha256', 'uid', 'user', 'writable'])
        || probe.user !== 'shareittoo' || probe.uid !== target.registryUid
        || probe.gid !== target.registryGid || probe.readable !== true
        || probe.writable !== false || probe.sha256 !== target.registrySha256) deny();
    return {
      targetRuntimeIdentity: { gid: probe.gid, uid: probe.uid, user: probe.user },
      targetRegistryProbe: {
        readable: probe.readable, sha256: probe.sha256, writable: probe.writable,
      },
    };
  };

  const collectCurrentState = async () => {
    const [container, image, targetImage, network, providerNetwork, health, queue, probe] =
      await Promise.all([
        inspectContainer(target.currentContainerId), inspectImage(target.currentImageId),
        inspectImage(target.targetImageId), inspectNetwork(target.networkId),
        inspectNetwork(target.providerNetworkId), probeHealth(target.currentContainerId),
        readQueue(target.currentContainerId), collectTargetProbe(),
      ]);
    if (container === null) deny();
    return Object.freeze({
      container, image, targetImage, network, providerNetwork, health, queue, ...probe,
    });
  };

  const convergeWithin = async ({ deadlineMs, observation }) => {
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1
        || deadlineMs > mutationConvergenceDeadlineMs || typeof observation !== 'function') deny();
    const deadline = readMonotonic() + deadlineMs;
    for (let attempt = 0; attempt < maximumConvergenceAttempts; attempt += 1) {
      if (readMonotonic() >= deadline) deny('convergence-unconfirmed');
      const value = await observation(deadline);
      if (readMonotonic() >= deadline) deny('convergence-unconfirmed');
      if (value !== undefined) return value;
      if (attempt + 1 >= maximumConvergenceAttempts) break;
      const remaining = Math.floor(deadline - readMonotonic());
      if (remaining < 1) break;
      await wait(Math.min(convergenceIntervalMs, remaining));
    }
    deny('convergence-unconfirmed');
  };
  const convergeMutation = (observation) => convergeWithin({
    deadlineMs: mutationConvergenceDeadlineMs,
    observation: async (deadline) => {
      try { return await observation(deadline); } catch { return undefined; }
    },
  });

  const mutation = async (args, expectedOutput = null) => {
    const result = await run('docker', args, { allowFailure: true, timeoutMs: 30_000 });
    if (result.status !== 0) {
      throw new GreenPasswordEnrollmentActivationCliError('mutation-response-unconfirmed');
    }
    const output = expectedOutput === '' ? result.stdout : oneLine(result.stdout);
    if (expectedOutput !== null && output !== expectedOutput) deny('mutation-response-invalid');
    return output;
  };

  const preflightControlPlane = async () => {
    await run('git', ['--version']);
    let expectedRoot; let actualCwd; let observedRoot;
    try {
      expectedRoot = fs.realpathSync(GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT);
      actualCwd = fs.realpathSync(cwd);
      observedRoot = fs.realpathSync(oneLine((await run(
        'git', ['rev-parse', '--show-toplevel'],
      )).stdout));
    } catch { deny('wrong-workdir'); }
    if (actualCwd !== expectedRoot || observedRoot !== expectedRoot) deny('wrong-workdir');
    const head = oneLine((await run('git', ['rev-parse', 'HEAD'])).stdout);
    if (!commitPattern.test(head) || head !== target.sourceCommit) deny('source-mismatch');
    await run('git', ['ls-files', '--error-unmatch', '--', ...requiredSourcePaths]);
    await run('git', [
      'diff', '--quiet', 'HEAD', '--', '.',
      ':(exclude)docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md',
    ]);
    const untracked = await run('git', ['ls-files', '--others', '--exclude-standard', '--', '.']);
    if (untracked.stdout !== '') deny('untracked-worktree');
    await run('docker', ['--version']);
  };

  return Object.freeze({
    async preflight() {
      await preflightControlPlane();
      return collectCurrentState();
    },
    async collectCurrent() {
      await preflightControlPlane();
      return collectCurrentState();
    },
    async readQueue() { return readQueue(queueContainerId); },
    async inspectExact(id) {
      if (!containerPattern.test(id)) deny();
      return inspectContainer(id);
    },
    async stopExact(id) {
      if (id !== target.currentContainerId) deny();
      const result = await run('docker', ['stop', '--time', '30', id],
        { allowFailure: true, timeoutMs: 30_000 });
      if (result.status === 0) {
        if (oneLine(result.stdout) !== id) deny('mutation-response-invalid');
        return;
      }
      await convergeMutation(async (deadline) => {
        const container = await inspectContainer(id, deadline);
        return container?.Id === id && container.State?.Running === false ? true : undefined;
      });
    },
    async renameExact(id, name) {
      if (!containerPattern.test(id)
          || !/^shareittoo-staging-api(?:-sealed-[a-f0-9]{12})?$/u.test(name)) deny();
      const result = await run('docker', ['rename', id, name],
        { allowFailure: true, timeoutMs: 30_000 });
      if (result.status === 0) {
        if (result.stdout !== '') deny('mutation-response-invalid');
        return;
      }
      await convergeMutation(async (deadline) => {
        const container = await inspectContainer(id, deadline);
        return container?.Id === id && container.Name === `/${name}` ? true : undefined;
      });
    },
    async createExact(request) {
      if (!exact(request, [
        'args', 'currentContainerId', 'expectedContainerName', 'targetImageId',
      ]) || !Object.isFrozen(request) || !Object.isFrozen(request.args)
          || request.currentContainerId !== target.currentContainerId
          || request.expectedContainerName !== target.apiContainer
          || request.targetImageId !== target.targetImageId) deny();
      const id = await mutation(request.args);
      if (!containerPattern.test(id) || id === target.currentContainerId) deny();
      return Object.freeze({ containerId: id });
    },
    async resolveCreatedCandidate(request) {
      if (!Object.isFrozen(request) || !Object.isFrozen(request?.args)
          || request.expectedContainerName !== target.apiContainer) deny();
      const container = await inspectContainer(target.apiContainer);
      if (container === null) return null;
      if (!containerPattern.test(container.Id) || container.Id === target.currentContainerId) deny();
      return Object.freeze({ containerId: container.Id });
    },
    async connectExact(id, name, networkId) {
      if (!containerPattern.test(id) || name !== target.providerNetwork
          || networkId !== target.providerNetworkId) deny();
      const result = await run('docker', ['network', 'connect', networkId, id],
        { allowFailure: true });
      if (result.status === 0 && result.stdout === '') return;
      await convergeMutation(async (deadline) => {
        const container = await inspectContainer(id, deadline);
        return container?.NetworkSettings?.Networks?.[name]?.NetworkID === networkId
          ? true : undefined;
      });
    },
    async startExact(id) {
      if (!containerPattern.test(id)) deny();
      const result = await run('docker', ['start', id],
        { allowFailure: true, timeoutMs: 30_000 });
      if (result.status === 0) {
        if (oneLine(result.stdout) !== id) deny('mutation-response-invalid');
        queueContainerId = id;
        return;
      }
      await convergeMutation(async (deadline) => (await inspectContainer(id, deadline))?.State?.Running === true
        ? true : undefined);
      queueContainerId = id;
    },
    async removeExact(id) {
      if (!containerPattern.test(id) || id === target.currentContainerId) deny();
      const result = await run('docker', ['rm', '--force', id], { allowFailure: true });
      if (result.status === 0) {
        if (oneLine(result.stdout) !== id) deny('mutation-response-invalid');
        queueContainerId = target.currentContainerId;
        return;
      }
      await convergeMutation(async (deadline) => await inspectContainer(id, deadline) === null
        ? true : undefined);
      queueContainerId = target.currentContainerId;
    },
    async collectCandidate(id, request) {
      if (!containerPattern.test(id) || !exact(request, [
        'deadlineMs', 'sourceCommit', 'sourceVersion',
      ]) || request.sourceCommit !== target.sourceCommit
          || request.sourceVersion !== target.sourceVersion
          || request.deadlineMs !== candidateConvergenceDeadlineMs) deny();
      return convergeWithin({ deadlineMs: request.deadlineMs,
        observation: async (deadline) => {
        try {
          const container = await inspectContainer(id, deadline);
          if (container === null) return undefined;
          const mounts = Array.isArray(container.Mounts) ? container.Mounts.map((mount) => ({
            type: mount.Type,
            source: mount.Type === 'volume' ? mount.Name : mount.Source,
            target: mount.Destination,
            readOnly: mount.RW === false,
          })).sort((left, right) => left.target.localeCompare(right.target)) : [];
          const [image, health, queue, proof, sealedOriginal] = await Promise.all([
            inspectImage(target.targetImageId, deadline), probeHealth(id, deadline),
            readQueue(id, deadline),
            boundedRun(deadline, 'docker', dockerNodeArgs(id, candidateProofSource, [
              ['SIT_W12_CANDIDATE_MOUNTS_JSON', JSON.stringify(mounts)],
              ['SIT_W12_OBSERVED_AT', observedAtUtc],
            ])).then((result) => jsonLine(result.stdout)),
            inspectContainer(target.currentContainerId, deadline),
          ]);
          if (sealedOriginal === null || !exact(proof, [
            'readinessEvidence', 'readinessEvidenceSha256', 'registryReadback', 'runtimeIdentity',
          ])) return undefined;
          const readiness = proof.readinessEvidence?.readiness;
          if (!plain(readiness) || readiness.passwordEnrollmentEnabled !== true
            || health.passwordEnrollmentEnabled !== true
            || readiness.runtimeReadbackSha256
            !== greenEnrollmentCandidateRuntimeReadbackSha256({
              mounts, registryReadback: proof.registryReadback,
              runtimeIdentity: proof.runtimeIdentity,
              runtime: {
                accessGateEnabled: readiness.accessGateEnabled,
                accessGateValid: readiness.accessGateValid,
                appPublicUrl: readiness.appPublicUrl,
                commit: health.commit,
                deploymentEnvironment: health.deploymentEnvironment,
                enrollmentEnabled: true,
                mailTransport: readiness.mailTransport,
                paymentTransport: health.paymentTransport,
                privatePilotEnabled: readiness.privatePilotEnabled,
                stripeLivemode: health.stripeLivemode,
                version: readiness.sourceVersion,
              },
            })) return undefined;
          return Object.freeze({
            container, image, runtimeIdentity: proof.runtimeIdentity,
            health, healthSha256: greenPasswordEnrollmentHealthSha256(health), queue,
            registryReadback: proof.registryReadback,
            readinessEvidence: proof.readinessEvidence,
            readinessEvidenceSha256: proof.readinessEvidenceSha256,
            sealedOriginal: {
              id: sealedOriginal.Id,
              name: String(sealedOriginal.Name ?? '').replace(/^\//u, ''),
              running: sealedOriginal.State?.Running === true,
            },
          });
        } catch { return undefined; }
      } });
    },
  });
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.some((argument) => typeof argument !== 'string')) deny();
  const parsed = { execute: false, manifestPath: null, confirmations: {} };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (seen.has(argument)) deny();
    seen.add(argument);
    if (argument === '--execute') parsed.execute = true;
    else if (['--manifest', '--confirm-source', '--confirm-container', '--confirm-registry']
      .includes(argument)) {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.startsWith('--')) deny();
      index += 1;
      if (argument === '--manifest') parsed.manifestPath = value;
      else if (argument === '--confirm-source') parsed.confirmations.sourceCommit = value;
      else if (argument === '--confirm-container') parsed.confirmations.currentContainerId = value;
      else parsed.confirmations.registrySha256 = value;
    } else deny();
  }
  if (typeof parsed.manifestPath !== 'string' || !path.isAbsolute(parsed.manifestPath)
      || path.normalize(parsed.manifestPath) !== parsed.manifestPath) deny();
  if (!parsed.execute && Object.keys(parsed.confirmations).length !== 0) deny();
  if (parsed.execute && (!exact(parsed.confirmations, [
    'currentContainerId', 'registrySha256', 'sourceCommit',
  ]) || !commitPattern.test(parsed.confirmations.sourceCommit)
    || !containerPattern.test(parsed.confirmations.currentContainerId)
    || !digestPattern.test(parsed.confirmations.registrySha256))) deny();
  return Object.freeze(parsed);
}

function readManifest(manifestPath, { fileSystem, operatorUid, operatorGid }) {
  const opened = readProtectedActivationFile(manifestPath, {
    fileSystem, expectedUid: operatorUid, expectedGid: operatorGid, operatorUid,
  });
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes);
    const manifest = JSON.parse(text);
    if (text !== `${JSON.stringify(manifest)}\n`) deny();
    return assertGreenEnrollmentActivationManifest(manifest);
  } catch (error) {
    if (error instanceof GreenPasswordEnrollmentActivationCliError) throw error;
    deny();
  } finally { opened.bytes.fill(0); }
}

export async function runGreenPasswordEnrollmentActivationCli(argv, {
  command = executeGreenPasswordEnrollmentArgv,
  cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
  fileSystem = fs,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  operatorGid = typeof process.getgid === 'function' ? process.getgid() : undefined,
  now = Date.now,
  monotonicNow = () => performance.now(),
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  if (typeof now !== 'function' || typeof monotonicNow !== 'function'
      || typeof wait !== 'function') deny();
  const parsed = parseArguments(argv);
  const manifest = readManifest(parsed.manifestPath, { fileSystem, operatorUid, operatorGid });
  if (parsed.execute && (
    parsed.confirmations.sourceCommit !== manifest.sourceCommit
      || parsed.confirmations.currentContainerId !== manifest.currentContainerId
      || parsed.confirmations.registrySha256 !== manifest.registrySha256
  )) deny('confirmation-mismatch');
  const activationNow = now();
  const adapter = createGreenPasswordEnrollmentCommandAdapter({
    manifest, command, cwd, activationNow, monotonicNow, wait,
  });
  const currentState = await adapter.preflight();
  return runGreenPasswordEnrollmentActivation({
    manifest, currentState, execute: parsed.execute, confirmations: parsed.confirmations,
    fileSystem, operatorUid, operatorGid, now: activationNow, operations: adapter,
  });
}

export function greenPasswordEnrollmentActivationCliErrorCode(error) {
  if (error instanceof GreenPasswordEnrollmentActivationError) return Object.freeze({
    status: error.state, code: 'green_password_enrollment_activation_denied',
    ...(error.rollback ? { rollback: error.rollback } : {}),
  });
  return Object.freeze({ status: 'denied', code: denialCode });
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(
      await runGreenPasswordEnrollmentActivationCli(process.argv.slice(2)),
    )}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(greenPasswordEnrollmentActivationCliErrorCode(error))}\n`);
    process.exitCode = error instanceof GreenPasswordEnrollmentActivationError
      && error.state.includes('unconfirmed') ? 2 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
