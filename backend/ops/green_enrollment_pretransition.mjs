#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReplacementCreateArgs } from './activate_staging_google_auth.mjs';
import {
  deriveProtectedEnvironmentScryptDigest, greenPasswordEnrollmentContainerSha256,
  greenPasswordEnrollmentMountsSha256, greenPasswordEnrollmentQueueSha256,
} from './green_password_enrollment_activation.mjs';
import { GREEN_ENROLLMENT_QUEUE_AGGREGATE_SQL,
  GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT } from './green_password_enrollment_activation_cli.mjs';
import { absolute, canonical, commandRunner, commitPattern, containerEnvironment, deny,
  digestPattern, environment, exact, idPattern, inspect, privateBytes, privateJson,
  publishPrivateJson, sourcePreflight } from './green_enrollment_guarded_io.mjs';

export const GREEN_ENROLLMENT_PRETRANSITION_CONFIRMATION = 'APPLY-W12-EXPLICIT-FALSE';
export const GREEN_ENROLLMENT_PREPARATION_CONFIRMATION = 'WRITE-W12-PRETRANSITION-MANIFEST';
const flag = 'SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED';
const fileFlag = 'SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE';
const inlineFlag = 'SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS';
const ownerLabel = 'com.shareittoo.w12-pretransition';
const name = 'shareittoo-staging-api';
const imageKeys = ['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME'];
const keys = ['schemaVersion', 'operation', 'operationId', 'sourceCommit', 'currentContainerId',
  'currentImage', 'currentImageId', 'currentImageDigest', 'currentRevision', 'currentVersion',
  'currentConfigurationSha256', 'currentEnvironmentScryptDigest', 'currentEnvironmentScryptSalt',
  'mountsSha256', 'queueSha256', 'network', 'networkId', 'providerNetwork', 'providerNetworkId',
  'environmentFile', 'environmentUid', 'environmentGid', 'environmentScryptSalt',
  'environmentScryptDigest', 'lockFile', 'evidenceFile'];
const queueKeys = ['dead', 'pending', 'processing', 'retry', 'sentInApp', 'sentPush',
  'suppressedEmail', 'suppressedPush'];
const pretransitionManifestIntegritySha256 = (manifest) => crypto.createHash('sha256')
  .update(`${JSON.stringify(manifest)}\n`).digest('hex');

export const GREEN_ENROLLMENT_PRETRANSITION_PROBE = String.raw`
import { pool } from './src/db.js';
try {
  const queue = {dead:0,pending:0,processing:0,retry:0,sentInApp:0,sentPush:0,suppressedEmail:0,suppressedPush:0};
  const rows = (await pool.query(${JSON.stringify(GREEN_ENROLLMENT_QUEUE_AGGREGATE_SQL)})).rows;
  for (const row of rows) {
    const count = Number(row.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('queue');
    const key = ['dead','pending','processing','retry'].includes(row.status) ? row.status
      : ({sent:{in_app:'sentInApp',push:'sentPush'},suppressed:{email:'suppressedEmail',push:'suppressedPush'}})[row.status]?.[row.channel];
    if (!key) throw new Error('queue'); queue[key] += count;
  }
  const get = async (route) => { const r = await fetch('http://127.0.0.1:8080'+route,
    {signal:AbortSignal.timeout(5000)}); return {status:r.status,body:await r.json()}; };
  const [live,ready,version] = await Promise.all([get('/health/live'),get('/health/ready'),get('/version')]);
  process.stdout.write(JSON.stringify({queue,live:live.status,ready:ready.status,
    mail:ready.body?.checks?.mail,commit:version.body?.commit,version:version.body?.version,
    enrollment:process.env.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED ?? null})+'\n');
} finally { await pool.end(); }
`;

function validate(manifest) {
  if (!exact(manifest, keys) || manifest.schemaVersion !== 1
      || manifest.operation !== 'w12-explicit-false-pretransition'
      || !/^[a-f0-9]{32}$/u.test(manifest.operationId)
      || !commitPattern.test(manifest.sourceCommit) || !commitPattern.test(manifest.currentRevision)
      || !/^[0-9]+\.[0-9]+\.[0-9]+\+[0-9]+$/u.test(manifest.currentVersion)
      || !manifest.currentImage?.endsWith(`:${manifest.currentRevision}`)
      || !digestPattern.test(manifest.currentImageId) || !digestPattern.test(manifest.currentImageDigest)
      || !['currentContainerId', 'currentConfigurationSha256', 'currentEnvironmentScryptDigest',
        'currentEnvironmentScryptSalt', 'mountsSha256', 'queueSha256', 'networkId', 'providerNetworkId',
        'environmentScryptSalt', 'environmentScryptDigest'].every((key) => idPattern.test(manifest[key]))
      || !['network', 'providerNetwork'].every((key) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,127}$/u.test(manifest[key]))
      || manifest.network === manifest.providerNetwork || manifest.networkId === manifest.providerNetworkId
      || ![manifest.environmentUid, manifest.environmentGid].every((id) => Number.isSafeInteger(id) && id >= 0)
      || new Set([manifest.environmentFile, manifest.lockFile, manifest.evidenceFile].map(absolute)).size !== 3) deny();
  return Object.freeze(structuredClone(manifest));
}
function environmentBinding(container, salt) {
  const bytes = Buffer.from(`${canonical(containerEnvironment(container))}\n`);
  try { return deriveProtectedEnvironmentScryptDigest(bytes, salt); } finally { bytes.fill(0); }
}
function withoutImage(environmentValue) {
  return Object.fromEntries(Object.entries(environmentValue).filter(([key]) => !imageKeys.includes(key)));
}
function assertSafeOriginal(container, manifest) {
  const env = containerEnvironment(container);
  if (container.Id !== manifest.currentContainerId || container.Image !== manifest.currentImageId
      || container.Config.Image !== manifest.currentImage || container.Config.User !== 'shareittoo'
      || greenPasswordEnrollmentContainerSha256(container) !== manifest.currentConfigurationSha256
      || environmentBinding(container, manifest.currentEnvironmentScryptSalt)
        !== manifest.currentEnvironmentScryptDigest
      || greenPasswordEnrollmentMountsSha256(container.Mounts) !== manifest.mountsSha256
      || container.Mounts.length !== 3 || container.HostConfig.AutoRemove === true
      || container.HostConfig.Privileged === true
      || Object.values(container.HostConfig.PortBindings ?? {}).flat().filter(Boolean).length
      || Object.values(container.NetworkSettings.Ports ?? {}).flat().filter(Boolean).length
      || env.DEPLOYMENT_ENVIRONMENT !== 'test' || env.MAIL_TRANSPORT !== 'memory'
      || env.APP_PUBLIC_URL !== 'http://shareittoo-staging-api:8080'
      || env.PAYMENT_TRANSPORT !== 'memory' || env.STRIPE_LIVEMODE !== 'false'
      || env.PRIVATE_PILOT_V4_ENABLED !== 'true' || env.SIT_STAGING_ACCESS_GATE_ENABLED !== 'true'
      || env.FIREBASE_AUTH_ENABLED !== 'true' || env.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || env.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED !== 'false'
      || env.APP_COMMIT !== manifest.currentRevision || env.APP_VERSION !== manifest.currentVersion
      || ![undefined, 'false'].includes(env[flag])
      || ![undefined, ''].includes(env[fileFlag]) || ![undefined, ''].includes(env[inlineFlag])) deny();
  assertNetworks(container, manifest, true);
  const roles = new Map(container.Mounts.map((mount) => [mount.Destination, mount]));
  if (roles.get('/run/secrets/mfa-encryption-key')?.Type !== 'bind'
      || roles.get('/run/secrets/mfa-encryption-key')?.RW !== false
      || roles.get('/run/secrets/firebase-service-account.json')?.Type !== 'bind'
      || roles.get('/run/secrets/firebase-service-account.json')?.RW !== false
      || roles.get('/data/uploads')?.Type !== 'volume'
      || roles.get('/data/uploads')?.RW !== true
      || env.PUSH_TRANSPORT !== 'memory' || env.IDENTITY_VERIFICATION_TRANSPORT !== 'memory'
      || env.SIT_LISTING_AI_PROVIDER !== 'on_device'
      || env.SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED !== '0'
      || env.SIT_LISTING_AI_BUDGET_CENTS !== '0'
      || env.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST !== ''
      || env.PUBLIC_BASE_URL !== 'https://staging.shareittoo.com/api/v1') deny();
}
function assertNetworks(container, manifest, provider) {
  const networks = container.NetworkSettings?.Networks;
  const names = provider ? [manifest.network, manifest.providerNetwork].sort() : [manifest.network];
  if (!networks || canonical(Object.keys(networks).sort()) !== canonical(names)
      || networks[manifest.network]?.NetworkID !== manifest.networkId
      || (provider && networks[manifest.providerNetwork]?.NetworkID !== manifest.providerNetworkId)) deny();
}
function assertImage(image, manifest) {
  const repository = manifest.currentImage.slice(0, manifest.currentImage.lastIndexOf(':'));
  if (image?.Id !== manifest.currentImageId
      || !image.RepoDigests?.includes(`${repository}@${manifest.currentImageDigest}`)
      || image.Config?.Labels?.['org.opencontainers.image.revision'] !== manifest.currentRevision
      || image.Config?.User !== 'shareittoo') deny();
}
function assertProbe(value, manifest, explicit = false) {
  if (!exact(value, ['queue', 'live', 'ready', 'mail', 'commit', 'version', 'enrollment'])
      || !exact(value.queue, queueKeys) || value.live !== 200 || value.ready !== 200 || value.mail !== 'ok'
      || value.commit !== manifest.currentRevision || value.version !== manifest.currentVersion
      || (explicit ? value.enrollment !== 'false' : ![null, 'false'].includes(value.enrollment))
      || greenPasswordEnrollmentQueueSha256(value.queue) !== manifest.queueSha256
      || ['dead', 'pending', 'processing', 'retry'].some((key) => value.queue[key] !== 0)) deny();
}
function readEnvironment(manifest) {
  const bytes = privateBytes(manifest.environmentFile, {
    uid: manifest.environmentUid, gid: manifest.environmentGid,
  });
  try {
    if (deriveProtectedEnvironmentScryptDigest(bytes, manifest.environmentScryptSalt)
        !== manifest.environmentScryptDigest) deny();
    const env = environment(bytes);
    if (imageKeys.some((key) => Object.hasOwn(env, key)) || env[flag] !== 'false'
        || env[fileFlag] !== '' || env[inlineFlag] !== '') deny();
    return env;
  } finally { bytes.fill(0); }
}

export function buildGreenEnrollmentPretransitionManifest({ currentState, input }) {
  const container = currentState.container;
  const env = containerEnvironment(container);
  const manifest = validate({ ...input, schemaVersion: 1, operation: 'w12-explicit-false-pretransition',
    currentContainerId: container.Id, currentImage: container.Config.Image, currentImageId: container.Image,
    currentRevision: env.APP_COMMIT, currentVersion: env.APP_VERSION,
    currentConfigurationSha256: greenPasswordEnrollmentContainerSha256(container),
    currentEnvironmentScryptDigest: environmentBinding(container, input.currentEnvironmentScryptSalt),
    mountsSha256: greenPasswordEnrollmentMountsSha256(container.Mounts),
    queueSha256: greenPasswordEnrollmentQueueSha256(currentState.probe.queue),
  });
  assertSafeOriginal(container, manifest); assertImage(currentState.image, manifest);
  assertProbe(currentState.probe, manifest);
  return manifest;
}

export async function prepareGreenEnrollmentPretransition({ spec, execute = false, confirmation,
  command, cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT, publicationFileSystem,
} = {}) {
  try {
    if (!exact(spec, ['schemaVersion', 'input', 'currentContainerId', 'manifestFile'])
        || spec.schemaVersion !== 1 || !idPattern.test(spec.currentContainerId)
        || typeof execute !== 'boolean' || (!execute && confirmation !== undefined)
        || (execute && confirmation !== GREEN_ENROLLMENT_PREPARATION_CONFIRMATION)) deny();
    const manifestFile = absolute(spec.manifestFile);
    if ([spec.input?.environmentFile, spec.input?.lockFile, spec.input?.evidenceFile]
      .includes(manifestFile)) deny();
    const run = commandRunner(command, cwd);
    await sourcePreflight(run, spec.input?.sourceCommit, cwd);
    const container = await inspect(run, 'container', spec.currentContainerId);
    if (container?.Id !== spec.currentContainerId) deny();
    const image = await inspect(run, 'image', container.Image);
    const response = await run('docker', ['exec', container.Id, 'node', '--input-type=module',
      '--eval', GREEN_ENROLLMENT_PRETRANSITION_PROBE]);
    let probe;
    try { probe = JSON.parse(response.stdout); } catch { deny(); }
    const manifest = buildGreenEnrollmentPretransitionManifest({
      currentState: { container, image, probe }, input: spec.input,
    });
    // Exercise the same preflight the execution entrypoint consumes. A plan
    // cannot be published from stale or incomplete externally shaped evidence.
    await runGreenEnrollmentPretransition({ manifest, command, cwd });
    const manifestSha256 = pretransitionManifestIntegritySha256(manifest);
    if (execute) publishPrivateJson(manifestFile, manifest,
      publicationFileSystem ? { fileSystem: publicationFileSystem } : undefined);
    return { status: execute ? 'created' : 'dry-run', manifestSha256,
      sourceCommit: manifest.sourceCommit, currentContainerId: manifest.currentContainerId,
      executionArguments: ['--manifest', manifestFile, '--execute', '--confirm-execute',
        GREEN_ENROLLMENT_PRETRANSITION_CONFIRMATION, '--confirm-source', manifest.sourceCommit,
        '--confirm-container', manifest.currentContainerId, '--confirm-operation', manifest.operationId] };
  } catch (error) {
    if (error?.state === 'publication-unconfirmed') deny('publication-unconfirmed');
    deny();
  }
}

function candidateShape(container, original, manifest, proposed, expectedName, provider, running) {
  if (!idPattern.test(container?.Id) || container.Id === original.Id
      || container.Name !== `/${expectedName}` || container.Image !== manifest.currentImageId
      || container.Config?.Image !== manifest.currentImage || container.State?.Running !== running
      || container.Config?.Labels?.[ownerLabel] !== manifest.operationId) deny();
  const config = (value) => {
    const result = structuredClone(value.Config);
    delete result.Env; delete result.Hostname;
    result.Labels ??= {}; delete result.Labels[ownerLabel];
    return result;
  };
  const host = (value) => {
    const result = structuredClone(value.HostConfig); delete result.Binds; delete result.Mounts;
    return result;
  };
  const observed = containerEnvironment(container);
  if (canonical(withoutImage(observed)) !== canonical(proposed)
      || imageKeys.some((key) => observed[key] !== containerEnvironment(original)[key])
      || canonical(config(container)) !== canonical(config(original))
      || canonical(host(container)) !== canonical(host(original))
      || greenPasswordEnrollmentMountsSha256(container.Mounts) !== manifest.mountsSha256) deny();
  const originalHostname = original.Config.Hostname;
  const defaultHostname = [original.Id, original.Id.slice(0, 12)].includes(originalHostname);
  if (container.Config.Hostname !== (defaultHostname ? container.Id.slice(0, 12) : originalHostname)) deny();
  const expectedMounts = original.Mounts.map((mount) => ({ Type: mount.Type,
    Source: mount.Type === 'volume' ? mount.Name : mount.Source,
    Target: mount.Destination, ReadOnly: mount.RW === false }));
  if (canonical(container.HostConfig.Mounts) !== canonical(expectedMounts)
      || Object.values(container.NetworkSettings.Ports ?? {}).flat().filter(Boolean).length) deny();
  assertNetworks(container, manifest, provider);
  return container.Id;
}

export async function runGreenEnrollmentPretransition({ manifest, execute = false, confirmations = {},
  command, cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let touched = false; let candidateId = null; let createAttempted = false;
  let target; let original; let proposed; let candidateName; let sealedName;
  let providerAttached = false;
  const run = commandRunner(command, cwd);
  const probe = async (id) => {
    const response = await run('docker', ['exec', id, 'node', '--input-type=module', '--eval',
      GREEN_ENROLLMENT_PRETRANSITION_PROBE]);
    try { return JSON.parse(response.stdout); } catch { deny(); }
  };
  // A mutation is issued exactly once, then only bounded read-only convergence.
  const converge = async (observation) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { const result = await observation(); if (result) return result; } catch { /* readback only */ }
      if (attempt < 4) await wait(200);
    }
    deny('mutation-unconfirmed');
  };
  const mutate = async (args, observation) => {
    touched = true;
    await run('docker', args, true);
    return converge(observation);
  };
  const readOriginal = async (expectedName, running) => {
    const value = await inspect(run, 'container', target.currentContainerId);
    assertSafeOriginal(value, target);
    if (value.Name !== `/${expectedName}` || value.State?.Running !== running) deny();
    const named = await inspect(run, 'container', expectedName);
    if (named?.Id !== value.Id) deny();
    return value;
  };
  const readCandidate = async (expectedName, running) => {
    const value = await inspect(run, 'container', candidateId ?? candidateName);
    candidateShape(value, original, target, proposed, expectedName, providerAttached, running);
    if (candidateId && value.Id !== candidateId) deny();
    const named = await inspect(run, 'container', expectedName);
    if (named?.Id !== value.Id) deny();
    return value;
  };
  try {
    target = validate(manifest);
    if (typeof execute !== 'boolean' || typeof wait !== 'function'
        || (!execute && Object.keys(confirmations).length)
        || (execute && (!exact(confirmations, ['execute', 'sourceCommit', 'currentContainerId', 'operationId'])
          || confirmations.execute !== GREEN_ENROLLMENT_PRETRANSITION_CONFIRMATION
          || confirmations.sourceCommit !== target.sourceCommit
          || confirmations.currentContainerId !== target.currentContainerId
          || confirmations.operationId !== target.operationId))) deny();
    await sourcePreflight(run, target.sourceCommit, cwd);
    original = await readOriginal(name, true);
    proposed = readEnvironment(target);
    const expectedEnv = { ...withoutImage(containerEnvironment(original)),
      [flag]: 'false', [fileFlag]: '', [inlineFlag]: '' };
    if (canonical(expectedEnv) !== canonical(proposed)) deny();
    assertImage(await inspect(run, 'image', target.currentImage), target);
    const network = await inspect(run, 'network', target.networkId);
    const provider = await inspect(run, 'network', target.providerNetworkId);
    if (network?.Id !== target.networkId || network.Name !== target.network || network.Internal !== true
        || provider?.Id !== target.providerNetworkId || provider.Name !== target.providerNetwork
        || provider.Internal !== false) deny();
    assertProbe(await probe(original.Id), target);
    candidateName = `${name}-w12-${target.operationId}`;
    sealedName = `${name}-w12-original-${target.operationId}`;
    if (await inspect(run, 'container', candidateName) || await inspect(run, 'container', sealedName)) deny();
    const clone = structuredClone(original);
    clone.Config.Labels = { ...clone.Config.Labels, [ownerLabel]: target.operationId };
    const replacementArgs = buildReplacementCreateArgs({ manifest: {
      apiContainer: candidateName, network: target.network, image: target.currentImage,
    }, currentApi: clone, envFile: target.environmentFile });
    // The revision tag is required by activation v1's Config.Image contract.
    // Never let a concurrent local-tag removal trigger an implicit registry pull.
    const args = Object.freeze(['create', '--pull', 'never', ...replacementArgs.slice(1)]);
    const summary = { schemaVersion: 1, operation: target.operation, sourceCommit: target.sourceCommit,
      currentContainerId: original.Id, operationId: target.operationId,
      currentImageId: target.currentImageId, queueSha256: target.queueSha256,
      environmentScryptDigest: target.environmentScryptDigest };
    if (!execute) return { ...summary, status: 'dry-run', requiresPretransition:
      canonical(withoutImage(containerEnvironment(original))) !== canonical(proposed) };
    // Keep the one-shot lock as durable execution evidence, including failures.
    publishPrivateJson(target.lockFile, { ...summary, status: 'reserved' });
    await sourcePreflight(run, target.sourceCommit, cwd);
    await readOriginal(name, true);
    if (canonical(readEnvironment(target)) !== canonical(proposed)) deny();
    assertProbe(await probe(original.Id), target);
    assertImage(await inspect(run, 'image', target.currentImage), target);
    createAttempted = true;
    const created = await mutate(args, () => readCandidate(candidateName, false));
    candidateId = created.Id;
    // Re-read both the exact candidate and the tag before each attach/start.
    await readCandidate(candidateName, false);
    assertImage(await inspect(run, 'image', target.currentImage), target);
    await mutate(['network', 'connect', target.providerNetworkId, candidateId], async () => {
      providerAttached = true; return readCandidate(candidateName, false);
    });
    await readOriginal(name, true);
    assertProbe(await probe(original.Id), target);
    await mutate(['stop', '--time', '30', original.Id], () => readOriginal(name, false));
    await readOriginal(name, false);
    await mutate(['rename', original.Id, sealedName], () => readOriginal(sealedName, false));
    await readCandidate(candidateName, false);
    await mutate(['rename', candidateId, name], async () => {
      return readCandidate(name, false);
    });
    await readCandidate(name, false);
    assertImage(await inspect(run, 'image', target.currentImage), target);
    await mutate(['start', candidateId], () => readCandidate(name, true));
    await converge(async () => { assertProbe(await probe(candidateId), target, true); return true; });
    await readOriginal(sealedName, false); await readCandidate(name, true);
    const result = { ...summary, status: 'pretransition-verified', candidateContainerId: candidateId,
      enrollmentEnabled: false, originalPreserved: true };
    publishPrivateJson(target.evidenceFile, result);
    return result;
  } catch {
    if (!touched) deny();
    // Resolve every ambiguous phase using immutable IDs and names. Never repeat
    // create/stop/rename/start on the basis of a missing command response.
    try {
      let candidate = candidateId ? await inspect(run, 'container', candidateId)
        : createAttempted ? await inspect(run, 'container', candidateName) : null;
      if (candidate) {
        if (candidateId && candidate.Id !== candidateId) deny();
        const observedName = String(candidate.Name).replace(/^\//u, '');
        if (![candidateName, name].includes(observedName)) deny();
        const attached = Object.hasOwn(candidate.NetworkSettings?.Networks ?? {}, target.providerNetwork);
        candidateShape(candidate, original, target, proposed, observedName, attached,
          candidate.State?.Running);
        candidateId = candidate.Id;
        // A mutable-name collision or replaced label/config must never be removed.
        const named = await inspect(run, 'container', observedName);
        if (named?.Id !== candidateId) deny();
        await mutate(['rm', '--force', candidateId], async () => (
          await inspect(run, 'container', candidateId) === null
          && await inspect(run, 'container', observedName) === null));
      }
      let source = await inspect(run, 'container', target.currentContainerId);
      assertSafeOriginal(source, target);
      if (![name, sealedName].includes(String(source.Name).replace(/^\//u, ''))) deny();
      if (source.Name === `/${sealedName}`) {
        if (source.State.Running !== false || await inspect(run, 'container', name)) deny();
        await readOriginal(sealedName, false);
        await mutate(['rename', source.Id, name], () => readOriginal(name, false));
      }
      source = await inspect(run, 'container', source.Id);
      if (source.State.Running === false) {
        await readOriginal(name, false);
        await mutate(['start', source.Id], () => readOriginal(name, true));
      }
      await readOriginal(name, true); assertProbe(await probe(source.Id), target);
    } catch { deny('rollback-unconfirmed'); }
    deny('failed-original-restored');
  }
}

export async function runGreenEnrollmentPretransitionCli(argv, options) {
  const values = {}; let execute = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--execute' && !execute) { execute = true; continue; }
    const key = argv[i]; const value = argv[++i];
    if (!['--manifest', '--prepare-spec', '--confirm-execute', '--confirm-source', '--confirm-container', '--confirm-operation']
      .includes(key) || Object.hasOwn(values, key) || typeof value !== 'string' || value.startsWith('--')) deny();
    values[key] = value;
  }
  if (values['--prepare-spec']) {
    if (Object.keys(values).some((key) => !['--prepare-spec', '--confirm-execute'].includes(key))) deny();
    return prepareGreenEnrollmentPretransition({ ...options,
      spec: privateJson(values['--prepare-spec']).value, execute,
      confirmation: values['--confirm-execute'] });
  }
  if (!values['--manifest'] || (!execute && Object.keys(values).length !== 1)) deny();
  const confirmations = execute ? { execute: values['--confirm-execute'],
    sourceCommit: values['--confirm-source'], currentContainerId: values['--confirm-container'],
    operationId: values['--confirm-operation'] } : {};
  return runGreenEnrollmentPretransition({ ...options,
    manifest: privateJson(values['--manifest']).value, execute, confirmations });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runGreenEnrollmentPretransitionCli(process.argv.slice(2)))}\n`); }
  catch (error) {
    const status = ['failed-original-restored', 'rollback-unconfirmed', 'publication-unconfirmed']
      .includes(error?.state) ? error.state : 'denied';
    process.stderr.write(`${JSON.stringify({ status })}\n`); process.exitCode = status.endsWith('unconfirmed') ? 2 : 1;
  }
}
