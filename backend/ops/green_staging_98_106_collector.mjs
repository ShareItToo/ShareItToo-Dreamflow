import { execFileSync } from 'node:child_process';
import { greenTarget } from './green_staging_promotion.mjs';
import { assert, digest, green98106, networkMembers, objectDigest, validateConfiguration, validateTarget } from './green_staging_98_106_contract.mjs';
import { assertEnvironment, canonicalMounts, containerFingerprint } from './green_staging_98_106_promotion.mjs';
import { assertArtifactFamily, privateDirectory, writeArtifact } from './green_staging_98_106_evidence.mjs';

export function collectorCommand({ args }) {
  assert(Array.isArray(args) && ((args.length === 2 && args[0] === 'inspect')
    || (args.length === 3 && ['image', 'network', 'volume'].includes(args[0]) && args[1] === 'inspect'))
    && /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/u.test(args.at(-1)), 'green_98_106_collector_read_only');
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] });
}
export const historicalWitnesses = Object.freeze([...greenTarget.retainedSealed,
  { name: greenTarget.sealedApiContainer, imageDigest: greenTarget.prePromotionImageDigest }]);

// Collection only reads Docker. Writing the owner-only result does NOT authorize
// execution: an independently reviewed target/content hash must enter the binding.
export async function collectTarget({ directory, command = collectorCommand, prefix = 'collected', acceptanceMfaFile }) {
  const output = privateDirectory(directory);
  assert(/^[a-z0-9-]{1,40}$/u.test(prefix), 'green_98_106_collector_prefix');
  assertArtifactFamily(output, [`${prefix}.target.json`, `${prefix}.config.json`, `${prefix}.private-runtime.json`]);
  const inspect = async (kind, name) => {
    const args = kind === 'container' ? ['inspect', name] : [kind, 'inspect', name];
    const rows = JSON.parse(await command({ phase: `collect_${kind}`, args }));
    assert(Array.isArray(rows) && rows.length === 1, 'green_98_106_collector_inspect'); return rows[0];
  };
  const descriptor = async (name, expectedDigest, running) => {
    const record = await inspect('container', name);
    // The WP254 database predates the API run-id label (the legacy target-set
    // contract explicitly records its empty Docker label readback). Accept only
    // an absent key on that exact database; never relax API/witness identity.
    const historicalDatabase = name === greenTarget.databaseContainer
      && record.Config?.Labels && !Object.hasOwn(record.Config.Labels, 'com.shareittoo.sit.green.run_id');
    assert(record.Name === `/${name}` && record.State?.Running === running && record.State.Paused === false
      && record.Config?.Labels?.['com.shareittoo.sit.green'] === 'true'
      && (historicalDatabase || record.Config.Labels['com.shareittoo.sit.green.run_id'] === greenTarget.runId),
    'green_98_106_collector_identity');
    const image = await inspect('image', record.Image);
    assert(image.Id === record.Image && image.RepoDigests?.some(value => value.endsWith(`@${expectedDigest}`)),
      'green_98_106_collector_image');
    return { record, value: { name, id: record.Id, imageId: record.Image, imageDigest: expectedDigest,
      configSha256: containerFingerprint(record) } };
  };
  const api = await descriptor(greenTarget.apiContainer, green98106.predecessorDigest, true);
  const database = await descriptor(greenTarget.databaseContainer, green98106.postgresImage.split('@')[1], true);
  const witnesses = [];
  for (const expected of historicalWitnesses) witnesses.push((await descriptor(expected.name, expected.imageDigest, false)).value);
  const networks = [];
  for (const name of [greenTarget.network, greenTarget.providerNetwork]) {
    const record = await inspect('network', name);
    assert(record.Name === name && typeof record.Internal === 'boolean', 'green_98_106_collector_network');
    networks.push({ name, id: record.Id, internal: record.Internal, members: networkMembers(record.Containers) });
  }
  const uploads = await inspect('volume', greenTarget.uploadsVolume);
  const target = { kind: 'sit-green-staging-98-106-target', schemaVersion: 3,
    api: api.value, database: database.value, networks,
    uploads: { name: greenTarget.uploadsVolume, configSha256: objectDigest(uploads) }, witnesses,
    databaseUser: greenTarget.databaseUser, databaseName: greenTarget.databaseName,
    sourceLedger: green98106.sourceLedger, targetLedger: green98106.targetLedger };
  validateTarget(target);
  const allowlist = api.record.Config.Env.find(entry => entry.startsWith('SIT_STAGING_ALLOWED_USER_IDS='))?.split('=').slice(1).join('=');
  assert(typeof allowlist === 'string', 'green_98_106_collector_allowlist');
  const config = { kind: 'sit-green-staging-98-106-config', schemaVersion: 2, environment: 'test',
    firebaseAuthEnabled: true, emulatorEnabled: false, accessGateEnabled: true,
    allowedUsersSha256: digest(allowlist), googleRegistrationEnabled: false,
    appleRevocationEnabled: false, appleAcquisitionEnabled: false, paymentTransport: 'memory', stripeLivemode: false,
    mailTransport: 'memory', pushTransport: 'memory', identityTransport: 'memory', listingAiProvider: 'on_device',
    externalListingAiEnabled: false, technicalSandboxEnabled: false,
    mountsSha256: objectDigest(canonicalMounts(api.record.Mounts)), runtimeEnvironmentSha256: objectDigest(api.record.Config.Env) };
  validateConfiguration(config); assertEnvironment(api.record.Config.Env, config);
  // Verify the captured identities again before creating any artifact.
  for (const captured of [api, database]) {
    const now = await inspect('container', captured.value.id);
    assert(now.Id === captured.value.id && now.Name === captured.record.Name && now.State?.Running === true
      && containerFingerprint(now) === captured.value.configSha256, 'green_98_106_collector_drift');
  }
  assert(typeof acceptanceMfaFile === 'string' && acceptanceMfaFile.startsWith('/'), 'green_98_106_acceptance_mfa_required');
  const snapshot = { kind: 'sit-green-staging-98-106-private-runtime', schemaVersion: 1,
    collectedAt: new Date().toISOString(), api: api.record, acceptanceMfaFile };
  return { status: 'collected_not_authorized', artifacts: [
    writeArtifact(output, `${prefix}.target.json`, target), writeArtifact(output, `${prefix}.config.json`, config),
    writeArtifact(output, `${prefix}.private-runtime.json`, snapshot),
  ] };
}
