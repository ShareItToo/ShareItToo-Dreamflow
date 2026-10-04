#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProtectedEnrollmentRegistry } from '../src/staging_password_enrollment.js';
import { GREEN_ENROLLMENT_EXACT_TTL_SECONDS } from './build_green_enrollment_candidate_inputs.mjs';
import {
  activationEnvironment, assertGreenPasswordEnrollmentActivationManifest,
  assertGreenPasswordEnrollmentCurrentState, deriveProtectedEnvironmentScryptDigest,
  greenPasswordEnrollmentContainerSha256, greenPasswordEnrollmentHealthSha256,
  greenPasswordEnrollmentMountsSha256, greenPasswordEnrollmentQueueSha256,
  runGreenPasswordEnrollmentActivation,
} from './green_password_enrollment_activation.mjs';
import { createGreenPasswordEnrollmentCommandAdapter,
  GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT } from './green_password_enrollment_activation_cli.mjs';
import { GREEN_ENROLLMENT_PRETRANSITION_PROBE } from './green_enrollment_pretransition.mjs';
import { absolute, canonical, commandRunner, containerEnvironment, deny, environment, exact,
  inspect, privateBytes, privateJson, publishPrivateJsonSet, sha256, sourcePreflight,
} from './green_enrollment_guarded_io.mjs';

export const GREEN_ENROLLMENT_MANIFEST_CONFIRMATION = 'WRITE-W12-ACTIVATION-MANIFEST';
const specKeys = ['sourceCommit', 'sourceVersion', 'currentContainerId', 'currentImageDigest',
  'targetImage', 'targetImageId', 'targetImageDigest', 'network', 'networkId', 'providerNetwork',
  'providerNetworkId', 'environmentFile', 'environmentUid', 'environmentGid', 'environmentScryptSalt',
  'environmentScryptDigest', 'registryFile', 'registryUid', 'registryGid', 'registrySha256',
  'backupFile', 'evidenceFile', 'lockFile', 'requestFile', 'allowlistFile', 'runtimeIdentityFile',
  'manifestFile', 'bindingsFile'];

function healthFromProbe(container, probe) {
  const env = containerEnvironment(container);
  const bool = (key) => env[key] === 'true';
  return {
    commit: probe.commit, deploymentEnvironment: env.DEPLOYMENT_ENVIRONMENT,
    firebaseAuthEnabled: bool('FIREBASE_AUTH_ENABLED'), firebasePhoneEnabled: bool('FIREBASE_PHONE_VERIFICATION_ENABLED'),
    googleRegistrationEnabled: bool('SIT_STAGING_GOOGLE_REGISTRATION_ENABLED'),
    liveStatus: probe.live, mailStatus: probe.mail, passwordEnrollmentEnabled: bool('SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED'),
    paymentTransport: env.PAYMENT_TRANSPORT, readyStatus: probe.ready, stripeLivemode: bool('STRIPE_LIVEMODE'),
  };
}

// The CLI manifest keeps the established v1 shape. A separately versioned
// envelope binds its exact canonical bytes to all additional input artifacts.
export async function buildGreenEnrollmentActivationManifest({ spec, execute = false,
  confirmation, command, cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
  now = Date.now(),
} = {}) {
  try {
    if (!exact(spec, specKeys) || typeof execute !== 'boolean'
        || (!execute && confirmation !== undefined)
        || (execute && confirmation !== GREEN_ENROLLMENT_MANIFEST_CONFIRMATION)
        || !Number.isSafeInteger(now)) deny();
    const paths = specKeys.filter((key) => key.endsWith('File')).map((key) => absolute(spec[key]));
    if (new Set(paths).size !== paths.length) deny();
    const run = commandRunner(command, cwd);
    await sourcePreflight(run, spec.sourceCommit, cwd);
    const container = await inspect(run, 'container', spec.currentContainerId);
    if (container?.Id !== spec.currentContainerId) deny();
    const current = containerEnvironment(container);
    if (current.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED !== 'false') deny('pretransition-required');
    const byName = await inspect(run, 'container', 'shareittoo-staging-api');
    if (byName?.Id !== container.Id) deny();
    const response = await run('docker', ['exec', container.Id, 'node', '--input-type=module',
      '--eval', GREEN_ENROLLMENT_PRETRANSITION_PROBE]);
    let probe;
    try { probe = JSON.parse(response.stdout); } catch { deny(); }
    if (probe.version !== current.APP_VERSION || probe.enrollment !== 'false') deny();
    const request = privateJson(spec.requestFile);
    const allowlist = privateJson(spec.allowlistFile);
    const identity = privateJson(spec.runtimeIdentityFile);
    if (!exact(request.value, ['email', 'ttlSeconds', 'userId'])
        || request.value.ttlSeconds !== GREEN_ENROLLMENT_EXACT_TTL_SECONDS
        || !exact(allowlist.value, ['allowedUserIds', 'schema', 'version'])
        || allowlist.value.schema !== 'sit-staging-access-allowlist' || allowlist.value.version !== 1
        || !exact(identity.value, ['gid', 'schema', 'uid', 'version'])
        || identity.value.schema !== 'sit-staging-runtime-identity-readback' || identity.value.version !== 1
        || identity.value.uid !== spec.registryUid || identity.value.gid !== spec.registryGid
        || identity.value.uid < 1 || identity.value.gid < 1) deny();
    const registry = readProtectedEnrollmentRegistry(spec.registryFile, { ownerUid: spec.registryUid });
    const registryBytes = privateBytes(spec.registryFile, { uid: spec.registryUid, gid: spec.registryGid });
    try {
      if (sha256(registryBytes) !== spec.registrySha256
          || !registryBytes.equals(Buffer.from(`${JSON.stringify(registry)}\n`))
          || registry.length !== 1 || registry[0].userId !== request.value.userId
          || registry[0].emailDigest !== sha256(`${registry[0].tokenDigest}\n${request.value.email}`)
          || Date.parse(registry[0].expiresAt) - Date.parse(registry[0].issuedAt)
            !== request.value.ttlSeconds * 1000) deny();
    } finally { registryBytes.fill(0); }
    const envBytes = privateBytes(spec.environmentFile, { uid: spec.environmentUid, gid: spec.environmentGid });
    let proposed;
    try {
      if (deriveProtectedEnvironmentScryptDigest(envBytes, spec.environmentScryptSalt)
          !== spec.environmentScryptDigest) deny();
      proposed = environment(envBytes);
    } finally { envBytes.fill(0); }
    const prepared = activationEnvironment({ currentEnvironment: current,
      proposedEnvironment: proposed, invitations: registry, now });
    if (canonical(allowlist.value.allowedUserIds)
        !== canonical(proposed.SIT_STAGING_ALLOWED_USER_IDS.split(','))) deny();
    const health = healthFromProbe(container, probe);
    const manifest = assertGreenPasswordEnrollmentActivationManifest({
      schemaVersion: 1, operation: 'activate-green-password-enrollment', apiContainer: 'shareittoo-staging-api',
      sourceCommit: spec.sourceCommit, sourceVersion: spec.sourceVersion,
      currentContainerId: container.Id, currentImage: container.Config.Image, currentImageId: container.Image,
      currentImageDigest: spec.currentImageDigest, currentRevision: current.APP_COMMIT,
      currentConfigurationSha256: greenPasswordEnrollmentContainerSha256(container),
      currentHealthSha256: greenPasswordEnrollmentHealthSha256(health),
      currentQueueSha256: greenPasswordEnrollmentQueueSha256(probe.queue),
      mountsSha256: greenPasswordEnrollmentMountsSha256(container.Mounts),
      targetImage: spec.targetImage, targetImageId: spec.targetImageId,
      targetImageDigest: spec.targetImageDigest, targetRevision: spec.sourceCommit,
      network: spec.network, networkId: spec.networkId,
      providerNetwork: spec.providerNetwork, providerNetworkId: spec.providerNetworkId,
      environmentFile: spec.environmentFile, environmentUid: spec.environmentUid,
      environmentGid: spec.environmentGid, environmentScryptSalt: spec.environmentScryptSalt,
      environmentScryptDigest: spec.environmentScryptDigest,
      registryFile: spec.registryFile, registryUid: spec.registryUid, registryGid: spec.registryGid,
      registrySha256: spec.registrySha256,
      registryTarget: '/run/secrets/staging-password-enrollment-registry.json',
      backupFile: spec.backupFile, evidenceFile: spec.evidenceFile, lockFile: spec.lockFile,
    });
    const adapter = createGreenPasswordEnrollmentCommandAdapter({ manifest, command, cwd, activationNow: now });
    // Includes a read-only, network-none target-image registry probe, using the
    // same primitive as the consumer; no service transition occurs here.
    const fresh = await adapter.preflight();
    assertGreenPasswordEnrollmentCurrentState(fresh, manifest);
    const targetEnvironment = containerEnvironment(fresh.targetImage);
    if (targetEnvironment.APP_COMMIT !== spec.sourceCommit
        || targetEnvironment.APP_VERSION !== spec.sourceVersion
        || fresh.targetImage.Config.Labels['org.opencontainers.image.version'] !== spec.sourceVersion) deny();
    await runGreenPasswordEnrollmentActivation({ manifest, currentState: fresh, now });
    const manifestSha256 = sha256(`${JSON.stringify(manifest)}\n`);
    const bindings = {
      schemaVersion: 1, kind: 'sit-w12-activation-manifest-bindings', sourceCommit: spec.sourceCommit,
      manifestSha256, sourceVersion: spec.sourceVersion, currentVersion: current.APP_VERSION,
      currentContainerId: container.Id, currentImageId: container.Image,
      targetImageId: spec.targetImageId, targetImageDigest: spec.targetImageDigest,
      targetRevision: spec.sourceCommit, runtimeIdentity: fresh.targetRuntimeIdentity,
      registrySha256: spec.registrySha256, queue: fresh.queue,
      environmentScryptSalt: spec.environmentScryptSalt, environmentScryptDigest: spec.environmentScryptDigest,
      artifacts: {
        request: { file: spec.requestFile, sha256: request.sha256 },
        allowlist: { file: spec.allowlistFile, sha256: allowlist.sha256 },
        runtimeIdentity: { file: spec.runtimeIdentityFile, sha256: identity.sha256 },
      },
      prepared,
      activationArguments: ['--manifest', spec.manifestFile, '--execute', '--confirm-source',
        spec.sourceCommit, '--confirm-container', container.Id, '--confirm-registry', spec.registrySha256],
    };
    if (execute) {
      // Re-read artifacts after live observations; a swapped protected input
      // cannot acquire a manifest based on the earlier snapshot.
      if (privateJson(spec.requestFile).sha256 !== request.sha256
          || privateJson(spec.allowlistFile).sha256 !== allowlist.sha256
          || privateJson(spec.runtimeIdentityFile).sha256 !== identity.sha256) deny();
      await sourcePreflight(run, spec.sourceCommit, cwd);
      const latest = await adapter.collectCurrent();
      assertGreenPasswordEnrollmentCurrentState(latest, manifest);
      await runGreenPasswordEnrollmentActivation({ manifest, currentState: latest, now });
      publishPrivateJsonSet([
        { file: spec.manifestFile, value: manifest },
        { file: spec.bindingsFile, value: bindings },
      ]);
    }
    // Do not include environment contents, invitation rows or request identities.
    return { status: execute ? 'created' : 'dry-run', manifestSha256,
      bindingsSha256: sha256(`${JSON.stringify(bindings)}\n`),
      sourceCommit: spec.sourceCommit, currentContainerId: container.Id,
      registrySha256: spec.registrySha256,
      activationArguments: bindings.activationArguments };
  } catch (error) {
    if (error?.state === 'publication-unconfirmed') deny('publication-unconfirmed');
    deny();
  }
}

export async function runGreenEnrollmentActivationManifestCli(argv, options) {
  const args = {}; let execute = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--execute' && !execute) { execute = true; continue; }
    const key = argv[i]; const value = argv[++i];
    if (!['--spec', '--confirm-execute'].includes(key) || Object.hasOwn(args, key)
        || typeof value !== 'string' || value.startsWith('--')) deny();
    args[key] = value;
  }
  return buildGreenEnrollmentActivationManifest({ ...options,
    spec: privateJson(args['--spec']).value, execute, confirmation: args['--confirm-execute'] });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runGreenEnrollmentActivationManifestCli(process.argv.slice(2)))}\n`); }
  catch (error) {
    const status = error?.state === 'publication-unconfirmed' ? 'publication-unconfirmed' : 'denied';
    process.stderr.write(`${JSON.stringify({ status })}\n`); process.exitCode = status === 'denied' ? 1 : 2;
  }
}
