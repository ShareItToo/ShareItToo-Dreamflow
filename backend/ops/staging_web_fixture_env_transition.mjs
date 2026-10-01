#!/usr/bin/env node

import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { link, lstat, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReplacementCreateArgs, runBoundedStartupProbe, runCommand } from './activate_staging_google_auth.mjs';
import { assertGoogleRegistrationRuntimeManifest, registrationConfigDrift } from './enable_staging_google_registration.mjs';
import { dedicatedFixture, fixtureBootstrapHandoff } from './staging_web_fixture_bootstrap.mjs';
import { fixtureEnvironmentDigest } from './staging_web_fixture_preflight.mjs';
import { readStablePrivateFile } from './stable_private_file.mjs';
import { corsContainerFingerprint, withCorsTransitionLock } from './staging_web_cors_transition.mjs';

export const fixtureEnvManifestKind = 'sit-staging-web-fixture-env-runtime-manifest';
export const fixtureEnvKeys = Object.freeze([
  'SIT_STAGING_ALLOWED_USER_IDS',
  'SIT_STAGING_PUBLIC_LISTING_IDS',
  'SIT_STAGING_PUBLIC_UPLOAD_NAMES',
  'SIT_STAGING_SYNTHETIC_CATALOG_ENABLED',
]);

const digestPattern = /^[a-f0-9]{64}$/u;
const passwordBindingPattern = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requiredTerminalMigration = '100_private_shelf_items.up.sql';
const requiredMigrationLedger = '1dd319ef1ecd4904e0b524568809e099e9e71fe565b04c7347ca21eb71f4b660';
const apiContainer = 'shareittoo-staging-api';
const sealedReadbackAttempts = 8;
const sealedReadbackDelayMs = 100;

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export const fixtureEnvDigest = (value) => hash(JSON.stringify(canonical(value)));
export const isFixtureEnvTransition = (manifest) => manifest?.kind === fixtureEnvManifestKind;

export function assertFixtureEnvBinding(binding) {
  exactKeys(binding, [
    'opsCommit', 'bootstrapManifestSha256', 'bootstrapSourceCommit', 'bootstrapRunIdSha256',
    'seedScopeDigest', 'seedSnapshotDigest', 'envSha256', 'allowedUserIdsBeforeDigest',
    'allowedUserIdsBeforeCount', 'handoffDigest', 'apiFingerprint', 'backupFile',
  ], 'fixture_env_binding_invalid');
  if (!commitPattern.test(binding.opsCommit ?? '') || !commitPattern.test(binding.bootstrapSourceCommit ?? '')
      || ![
        'bootstrapManifestSha256', 'bootstrapRunIdSha256', 'seedScopeDigest', 'seedSnapshotDigest',
        'envSha256', 'allowedUserIdsBeforeDigest', 'handoffDigest', 'apiFingerprint',
      ].every((key) => digestPattern.test(binding[key] ?? ''))
      || !Number.isInteger(binding.allowedUserIdsBeforeCount) || binding.allowedUserIdsBeforeCount < 1
      || typeof binding.backupFile !== 'string' || !isAbsolute(binding.backupFile)
      || binding.backupFile.startsWith(`${repositoryRoot}/`)
      || !binding.backupFile.endsWith('.env') || binding.backupFile.includes('..')) fail('fixture_env_binding_invalid');
  return Object.freeze({ ...binding });
}

export function parseFixtureBootstrapBinding(bytes, binding) {
  const exactBinding = assertFixtureEnvBinding(binding);
  if (!Buffer.isBuffer(bytes) || hash(bytes) !== exactBinding.bootstrapManifestSha256) fail('fixture_env_bootstrap_digest_invalid');
  let manifest;
  try { manifest = JSON.parse(bytes); } catch { fail('fixture_env_bootstrap_json_invalid'); }
  if (manifest?.kind !== 'sit-dedicated-web-fixture-bootstrap' || manifest.schemaVersion !== 2
      || manifest.operation !== 'seed' || manifest.sourceCommit !== exactBinding.bootstrapSourceCommit
      || !Array.isArray(manifest.passwordDigests) || manifest.passwordDigests.length !== 2
      || !manifest.passwordDigests.every((value) => passwordBindingPattern.test(value ?? ''))
      || hash(String(manifest.preflight?.runId ?? '')) !== exactBinding.bootstrapRunIdSha256
      || manifest.preflight?.listingId !== dedicatedFixture.listing
      || manifest.preflight?.uploadName !== dedicatedFixture.upload
      || JSON.stringify(manifest.preflight?.roles?.map(({ role, userId }) => ({ role, userId }))) !== JSON.stringify([
        { role: 'owner', userId: dedicatedFixture.owner },
        { role: 'renter', userId: dedicatedFixture.renter },
      ])) fail('fixture_env_bootstrap_binding_invalid');
  return Object.freeze({ manifest, runId: manifest.preflight.runId });
}

function allowedIds(value) {
  const entries = String(value ?? '').split(',');
  if (entries.some((entry) => !identifierPattern.test(entry)) || new Set(entries).size !== entries.length) {
    fail('fixture_env_allowed_ids_invalid');
  }
  return entries;
}

export function fixtureEnvProposal(environment, bootstrapManifest, binding) {
  const exactBinding = assertFixtureEnvBinding(binding);
  const beforeIds = allowedIds(environment?.SIT_STAGING_ALLOWED_USER_IDS);
  if (hash(String(environment?.SIT_STAGING_ALLOWED_USER_IDS ?? '')) !== exactBinding.allowedUserIdsBeforeDigest
      || beforeIds.length !== exactBinding.allowedUserIdsBeforeCount
      || fixtureEnvironmentDigest(environment) !== bootstrapManifest?.preflight?.environmentDigest) {
    fail('fixture_env_prestate_binding_invalid');
  }
  const handoff = fixtureBootstrapHandoff(bootstrapManifest, environment);
  exactKeys(handoff.proposed, fixtureEnvKeys, 'fixture_env_handoff_invalid');
  if (handoff.activationAllowed !== false || handoff.proposed.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED !== 'false'
      || handoff.proposed.SIT_STAGING_PUBLIC_LISTING_IDS !== dedicatedFixture.listing
      || handoff.proposed.SIT_STAGING_PUBLIC_UPLOAD_NAMES !== dedicatedFixture.upload
      || fixtureEnvDigest(handoff.proposed) !== exactBinding.handoffDigest) fail('fixture_env_handoff_invalid');
  const afterIds = allowedIds(handoff.proposed.SIT_STAGING_ALLOWED_USER_IDS);
  const expectedIds = [dedicatedFixture.owner, dedicatedFixture.renter,
    ...beforeIds.filter((id) => id !== dedicatedFixture.owner && id !== dedicatedFixture.renter)];
  if (JSON.stringify(afterIds) !== JSON.stringify(expectedIds)) fail('fixture_env_allowed_ids_order_invalid');
  return Object.freeze({
    values: Object.freeze({ ...handoff.proposed }),
    beforeAllowedCount: beforeIds.length,
    beforeAllowedDigest: hash(environment.SIT_STAGING_ALLOWED_USER_IDS),
    afterAllowedCount: afterIds.length,
    afterAllowedDigest: hash(handoff.proposed.SIT_STAGING_ALLOWED_USER_IDS),
    publicListingDigest: hash(dedicatedFixture.listing),
    publicUploadDigest: hash(dedicatedFixture.upload),
  });
}

export const fixtureSeedReadbackSql = `WITH seeded AS (
  SELECT request_id,metadata FROM audit_log
  WHERE resource_type='staging_web_fixture_seed'
    AND resource_id='${dedicatedFixture.listing}'
    AND action='staging_web_fixture_seed.seeded'
), later AS (
  SELECT count(*)::int AS count FROM audit_log
  WHERE resource_type='staging_web_fixture_seed'
    AND resource_id='${dedicatedFixture.listing}'
    AND action IN ('staging_web_fixture_seed.hidden','staging_web_fixture_seed.cleaned')
), fixture AS (
  SELECT
    (SELECT count(*) FROM users WHERE id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}'))::int AS users,
    (SELECT count(*) FROM listings WHERE id='${dedicatedFixture.listing}' AND owner_id='${dedicatedFixture.owner}' AND is_active=true)::int AS listings,
    (SELECT count(*) FROM uploads WHERE storage_name='${dedicatedFixture.upload}' AND listing_id='${dedicatedFixture.listing}' AND owner_id='${dedicatedFixture.owner}')::int AS uploads
)
SELECT count(*) || '|' || min(metadata->>'scope') || '|' || min(metadata->>'snapshotHash') || '|'
  || min(encode(sha256(convert_to(request_id,'UTF8')),'hex')) || '|' || min(later.count) || '|'
  || min(fixture.users) || '|' || min(fixture.listings) || '|' || min(fixture.uploads)
FROM seeded CROSS JOIN later CROSS JOIN fixture`;

export function assertFixtureSeedReadback(stdout, binding) {
  const parts = String(stdout ?? '').trim().split('|');
  if (parts.length !== 8 || parts[0] !== '1' || parts[1] !== binding.seedScopeDigest
      || parts[2] !== binding.seedSnapshotDigest || parts[3] !== binding.bootstrapRunIdSha256
      || parts[4] !== '0' || parts[5] !== '2' || parts[6] !== '1' || parts[7] !== '1') {
    fail('fixture_env_seed_readback_invalid');
  }
  return Object.freeze({
    seedScopeDigest: parts[1], seedSnapshotDigest: parts[2], bootstrapRunIdSha256: parts[3],
    dedicatedUsers: 2, dedicatedListings: 1, dedicatedUploads: 1,
  });
}

export function fixtureEnvReadbackArgument(values) {
  exactKeys(values, fixtureEnvKeys, 'fixture_env_readback_argument_invalid');
  if (Object.values(values).some((value) => typeof value !== 'string')) fail('fixture_env_readback_argument_invalid');
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function fixtureEnvReadbackScript() {
  return `import crypto from 'node:crypto';const names=${JSON.stringify(fixtureEnvKeys)};const encoded=process.argv[1]??'';if(encoded){let values;try{values=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{throw Error('fixture_env_readback_argument_invalid');}if(!values||Array.isArray(values)||JSON.stringify(Object.keys(values).sort())!==JSON.stringify([...names].sort())||Object.values(values).some((value)=>typeof value!=='string'))throw Error('fixture_env_readback_argument_invalid');Object.assign(process.env,values);}const h=(v)=>crypto.createHash('sha256').update(v).digest('hex');const csv=(n)=>(process.env[n]??'').split(',').filter(Boolean);const {config}=await import('./src/config.js');const allowed=process.env.SIT_STAGING_ALLOWED_USER_IDS??'';const listings=process.env.SIT_STAGING_PUBLIC_LISTING_IDS??'';const uploads=process.env.SIT_STAGING_PUBLIC_UPLOAD_NAMES??'';process.stdout.write(JSON.stringify({accessGateEnabled:config.stagingAccess.enabled,accessGateValid:config.stagingAccess.valid,allowedCount:csv('SIT_STAGING_ALLOWED_USER_IDS').length,allowedDigest:h(allowed),listingCount:csv('SIT_STAGING_PUBLIC_LISTING_IDS').length,listingDigest:h(listings),uploadCount:csv('SIT_STAGING_PUBLIC_UPLOAD_NAMES').length,uploadDigest:h(uploads),syntheticCatalogEnabled:config.syntheticCatalog.enabled,registrationEnabled:config.stagingGoogleRegistration.enabled}));`;
}

export function assertFixtureEnvReadback(stdout, proposal) {
  let value;
  try { value = JSON.parse(String(stdout ?? '').trim()); } catch { fail('fixture_env_runtime_readback_invalid'); }
  exactKeys(value, ['accessGateEnabled', 'accessGateValid', 'allowedCount', 'allowedDigest', 'listingCount',
    'listingDigest', 'uploadCount', 'uploadDigest', 'syntheticCatalogEnabled', 'registrationEnabled'],
  'fixture_env_runtime_readback_invalid');
  const expected = {
    allowedCount: proposal.afterAllowedCount, allowedDigest: proposal.afterAllowedDigest,
    listingCount: 1, listingDigest: proposal.publicListingDigest,
    uploadCount: 1, uploadDigest: proposal.publicUploadDigest,
  };
  if (value.accessGateEnabled !== true || value.accessGateValid !== true
      || value.syntheticCatalogEnabled !== false || value.registrationEnabled !== false
      || Object.entries(expected).some(([key, expectedValue]) => value[key] !== expectedValue)) {
    fail('fixture_env_runtime_readback_invalid');
  }
  return Object.freeze({ ...expected, syntheticCatalogEnabled: false, registrationEnabled: false });
}

function safeExternalPath(value, code) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.startsWith(`${repositoryRoot}/`)) fail(code);
  return value;
}

function envMap(entries) {
  const values = {};
  for (const entry of entries ?? []) {
    const index = String(entry).indexOf('=');
    if (index < 1) fail('fixture_env_runtime_environment_invalid');
    const name = String(entry).slice(0, index);
    if (Object.hasOwn(values, name)) fail('fixture_env_runtime_environment_invalid');
    values[name] = String(entry).slice(index + 1);
  }
  return values;
}

function parseEnvContent(content) {
  const values = {};
  for (const line of String(content).split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match || Object.hasOwn(values, match[1])) fail('fixture_env_file_parse_invalid');
    values[match[1]] = match[2];
  }
  return values;
}

function replaceEnvKey(content, name, value) {
  const expression = new RegExp(`^([ \\t]*${name}=)[^\\r\\n]*(\\r?\\n|$)`, 'mu');
  if (expression.test(content)) return content.replace(expression, `$1${value}$2`);
  const ending = content.endsWith('\n') || content.endsWith('\r') ? '' : '\n';
  return `${content}${ending}${name}=${value}\n`;
}

function fixtureEnvContent(content, proposal, changedKeys = fixtureEnvKeys) {
  let next = content;
  for (const name of changedKeys) {
    if (!Object.hasOwn(proposal.values, name) || typeof proposal.values[name] !== 'string') {
      fail('fixture_env_replacement_proposal_invalid');
    }
    next = replaceEnvKey(next, name, proposal.values[name]);
  }
  return next;
}

export function assertFixtureEnvRuntimeManifest(manifest) {
  if (manifest?.kind !== fixtureEnvManifestKind || manifest.schemaVersion !== 1
      || !digestPattern.test(manifest?.apiContainerId ?? '')) fail('fixture_env_runtime_manifest_invalid');
  const { fixtureBinding, apiContainerId, ...base } = manifest;
  const validated = assertGoogleRegistrationRuntimeManifest({
    ...base, kind: 'sit-staging-google-registration-runtime-manifest', apiContainerId,
  });
  return Object.freeze({ ...validated, kind: fixtureEnvManifestKind, fixtureBinding: assertFixtureEnvBinding(fixtureBinding) });
}

export function readFixtureEnvRuntimeManifest(filePath, expectedSha256) {
  safeExternalPath(filePath, 'fixture_env_runtime_manifest_path_invalid');
  const bytes = readStablePrivateFile(filePath, {
    expectedMode: 0o600, expectedUid: process.getuid?.(), expectedGid: process.getgid?.(),
    minBytes: 1, maxBytes: 128 * 1024, code: 'fixture_env_runtime_manifest_metadata_invalid',
  });
  if (!digestPattern.test(expectedSha256 ?? '') || hash(bytes) !== expectedSha256) fail('fixture_env_runtime_manifest_digest_invalid');
  let manifest;
  try { manifest = JSON.parse(bytes); } catch { fail('fixture_env_runtime_manifest_json_invalid'); }
  return assertFixtureEnvRuntimeManifest(manifest);
}

async function readEnv(manifest) {
  try {
    const content = readStablePrivateFile(manifest.envFile, {
      expectedMode: 0o600, expectedUid: manifest.envUid, expectedGid: manifest.envGid,
      minBytes: 1, code: 'fixture_env_file_metadata_invalid',
    });
    return Object.freeze({ content, values: parseEnvContent(content) });
  } catch (error) {
    if (error?.code === 'fixture_env_file_metadata_invalid') throw error;
    fail(error?.code === 'ELOOP' ? 'fixture_env_file_symlink_forbidden' : 'fixture_env_file_unreadable');
  }
}

async function assertPrivateTarget(filePath, code) {
  safeExternalPath(filePath, code);
  const parent = await lstat(dirname(filePath)).catch(() => fail(`${code}_parent`));
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700
      || uid !== undefined && parent.uid !== uid || gid !== undefined && parent.gid !== gid) fail(`${code}_parent`);
  try { await lstat(filePath); fail(`${code}_exists`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

async function writePrivateFile(filePath, bytes, code) {
  await assertPrivateTarget(filePath, code);
  const temporary = `${filePath}.private-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`;
  let handle;
  let temporaryCreated = false;
  try {
    handle = await open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
    temporaryCreated = true;
    await handle.writeFile(bytes);
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, filePath);
    const parent = await open(dirname(filePath), fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try { await parent.sync(); } finally { await parent.close(); }
    await unlink(temporary);
    temporaryCreated = false;
    const readback = readStablePrivateFile(filePath, {
      encoding: null, expectedMode: 0o600, expectedUid: process.getuid?.(), expectedGid: process.getgid?.(),
      minBytes: bytes.length, maxBytes: bytes.length, code: `${code}_readback`,
    });
    if (!Buffer.from(readback).equals(bytes)) fail(`${code}_readback`);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (temporaryCreated) await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicReplaceEnv(content, manifest) {
  const temporary = `${manifest.envFile}.fixture-env-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`;
  let handle;
  let replaced = false;
  try {
    handle = await open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.chmod(0o600);
    await handle.chown(manifest.envUid, manifest.envGid);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, manifest.envFile);
    replaced = true;
    const parent = await open(dirname(manifest.envFile), fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try { await parent.sync(); } finally { await parent.close(); }
    if ((await readEnv(manifest)).content !== content) fail('fixture_env_atomic_readback_invalid');
  } catch (error) {
    error.envReplaced = replaced;
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function bootstrapForPreparation(bytes, expectedSha256) {
  if (!Buffer.isBuffer(bytes) || !digestPattern.test(expectedSha256 ?? '') || hash(bytes) !== expectedSha256) {
    fail('fixture_env_prepare_bootstrap_digest_invalid');
  }
  let manifest;
  try { manifest = JSON.parse(bytes); } catch { fail('fixture_env_prepare_bootstrap_json_invalid'); }
  if (manifest?.kind !== 'sit-dedicated-web-fixture-bootstrap' || manifest.schemaVersion !== 2
      || manifest.operation !== 'seed' || !commitPattern.test(manifest.sourceCommit ?? '')
      || !Array.isArray(manifest.passwordDigests) || manifest.passwordDigests.length !== 2
      || !manifest.passwordDigests.every((value) => passwordBindingPattern.test(value ?? ''))
      || typeof manifest.preflight?.runId !== 'string' || !manifest.preflight.runId
      || manifest.preflight?.listingId !== dedicatedFixture.listing
      || manifest.preflight?.uploadName !== dedicatedFixture.upload
      || JSON.stringify(manifest.preflight?.roles?.map(({ role, userId }) => ({ role, userId }))) !== JSON.stringify([
        { role: 'owner', userId: dedicatedFixture.owner }, { role: 'renter', userId: dedicatedFixture.renter },
      ])) fail('fixture_env_prepare_bootstrap_invalid');
  return manifest;
}

function seedPreparation(stdout) {
  const parts = String(stdout ?? '').trim().split('|');
  if (parts.length !== 8 || parts[0] !== '1' || !parts.slice(1, 4).every((value) => digestPattern.test(value))
      || parts[4] !== '0' || parts[5] !== '2' || parts[6] !== '1' || parts[7] !== '1') fail('fixture_env_prepare_seed_invalid');
  return Object.freeze({ seedScopeDigest: parts[1], seedSnapshotDigest: parts[2], bootstrapRunIdSha256: parts[3] });
}

export async function prepareFixtureEnvRuntimeManifest({
  bootstrapManifestBytes, bootstrapManifestSha256, backupFile, outputFile, sourceCommit,
  command = runCommand, commandEnv = process.env, envFile = '/docker/shareittoo/ops/green.env',
} = {}) {
  if (!commitPattern.test(sourceCommit ?? '')) fail('fixture_env_prepare_source_invalid');
  safeExternalPath(envFile, 'fixture_env_prepare_env_path_invalid');
  safeExternalPath(backupFile, 'fixture_env_prepare_backup_path_invalid');
  if (!backupFile.endsWith('.env') || backupFile.includes('..')) fail('fixture_env_prepare_backup_path_invalid');
  await assertPrivateTarget(backupFile, 'fixture_env_prepare_backup_target_invalid');
  await assertPrivateTarget(outputFile, 'fixture_env_prepare_output_target_invalid');
  const bootstrap = bootstrapForPreparation(bootstrapManifestBytes, bootstrapManifestSha256);
  const envMetadata = await lstat(envFile);
  if (!envMetadata.isFile() || envMetadata.isSymbolicLink() || (envMetadata.mode & 0o777) !== 0o600) fail('fixture_env_prepare_env_metadata_invalid');
  const envContent = readStablePrivateFile(envFile, { expectedMode: 0o600, expectedUid: envMetadata.uid,
    expectedGid: envMetadata.gid, minBytes: 1, code: 'fixture_env_prepare_env_metadata_invalid' });
  const inspect = async (target, phase) => parseJson((await command('docker', ['inspect', '--format', '{{json .}}', target], { phase, env: commandEnv })).stdout, `${phase}_invalid`);
  const api = await inspect(apiContainer, 'fixture_env_prepare_api_inspect');
  const databaseContainer = 'sit-green-postgres-20260918011528-wp254';
  const databaseVolume = 'sit-green-volume-20260918011528-wp254';
  const networkName = 'sit-green-network-20260918011528-wp254';
  const providerNetwork = 'sit-staging-provider-egress';
  const uploadsVolume = 'sit-green-uploads-20260918011528-wp254';
  const database = await inspect(databaseContainer, 'fixture_env_prepare_database_inspect');
  const volume = await inspect(databaseVolume, 'fixture_env_prepare_database_volume_inspect');
  const network = await inspect(networkName, 'fixture_env_prepare_network_inspect');
  const provider = await inspect(providerNetwork, 'fixture_env_prepare_provider_network_inspect');
  const uploads = await inspect(uploadsVolume, 'fixture_env_prepare_uploads_volume_inspect');
  const image = parseJson((await command('docker', ['image', 'inspect', '--format', '{{json .}}', api.Image], {
    phase: 'fixture_env_prepare_image_inspect', env: commandEnv,
  })).stdout, 'fixture_env_prepare_image_inspect_invalid');
  const runtimeRevision = image.Config?.Labels?.['org.opencontainers.image.revision'];
  const tags = [...new Set((image.RepoTags ?? []).filter((tag) => tag.endsWith(`:${runtimeRevision}`)))];
  const digests = [...new Set((image.RepoDigests ?? []).map((entry) => entry.split('@').at(-1)).filter((value) => /^sha256:[a-f0-9]{64}$/u.test(value)))];
  if (api.Id?.length !== 64 || api.Name !== `/${apiContainer}` || api.State?.Running !== true
      || database.Name !== `/${databaseContainer}` || database.State?.Running !== true || volume.Name !== databaseVolume
      || network.Name !== networkName || network.Internal !== true || provider.Name !== providerNetwork || uploads.Name !== uploadsVolume
      || !commitPattern.test(runtimeRevision ?? '') || tags.length !== 1 || digests.length !== 1 || api.Image !== image.Id) {
    fail('fixture_env_prepare_inventory_invalid');
  }
  const networkIds = Object.freeze({ [networkName]: network.Id, [providerNetwork]: provider.Id });
  assertNoHostPorts(api); assertNetworks(api, { network: networkName, providerNetwork }, { networkIds });
  const apiValues = envMap(api.Config?.Env);
  const envValues = parseEnvContent(envContent);
  for (const [name, value] of Object.entries(envValues)) if (apiValues[name] !== value) fail('fixture_env_prepare_file_runtime_drift');
  const safetyEnv = { DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0' };
  for (const [name, value] of Object.entries(safetyEnv)) if (apiValues[name] !== value) fail('fixture_env_prepare_safety_invalid');
  if (apiValues.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED !== 'false'
      || String(apiValues.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '') !== ''
      || fixtureEnvironmentDigest(apiValues) !== bootstrap.preflight.environmentDigest) fail('fixture_env_prepare_bootstrap_runtime_drift');
  const allowed = allowedIds(apiValues.SIT_STAGING_ALLOWED_USER_IDS);
  const proposal = fixtureBootstrapHandoff(bootstrap, apiValues);
  const seedResult = await command('docker', ['exec', databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1',
    '-U', 'shareittoo_green', '-d', 'shareittoo_green', '-Atc', fixtureSeedReadbackSql], { phase: 'fixture_env_prepare_seed_readback', env: commandEnv });
  const seed = seedPreparation(seedResult.stdout);
  if (seed.bootstrapRunIdSha256 !== hash(bootstrap.preflight.runId)) fail('fixture_env_prepare_seed_run_mismatch');
  const mounts = (api.Mounts ?? []).map((mount) => ({
    type: mount.Type, name: mount.Type === 'volume' ? mount.Name : String(mount.Destination).split('/').at(-1),
    source: mount.Source, destination: mount.Destination, readOnly: mount.RW === false,
  }));
  const manifest = {
    kind: fixtureEnvManifestKind, schemaVersion: 1, apiContainerId: api.Id,
    environment: 'staging', composeProject: 'sit-green', apiContainer,
    databaseContainer, databaseVolume, databaseName: 'shareittoo_green', databaseUser: 'shareittoo_green',
    network: networkName, providerNetwork, uploadsVolume, image: tags[0], runtimeRevision, imageDigest: digests[0],
    envFile, envUid: envMetadata.uid, envGid: envMetadata.gid, mounts, safetyEnv,
    label: { key: 'com.shareittoo.sit.green', value: 'true' },
    fixtureBinding: {
      opsCommit: sourceCommit, bootstrapManifestSha256, bootstrapSourceCommit: bootstrap.sourceCommit,
      bootstrapRunIdSha256: seed.bootstrapRunIdSha256, seedScopeDigest: seed.seedScopeDigest,
      seedSnapshotDigest: seed.seedSnapshotDigest, envSha256: hash(envContent),
      allowedUserIdsBeforeDigest: hash(apiValues.SIT_STAGING_ALLOWED_USER_IDS), allowedUserIdsBeforeCount: allowed.length,
      handoffDigest: fixtureEnvDigest(proposal.proposed), apiFingerprint: corsContainerFingerprint(api), backupFile,
    },
  };
  assertFixtureEnvRuntimeManifest(manifest);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writePrivateFile(outputFile, bytes, 'fixture_env_prepare_output_write');
  return Object.freeze({ status: 'fixture-env-runtime-manifest-prepared-read-only', manifestSha256: hash(bytes),
    opsCommit: sourceCommit, runtimeRevision, bootstrapManifestSha256,
    bootstrapRunIdSha256: seed.bootstrapRunIdSha256, seedScopeDigest: seed.seedScopeDigest,
    seedSnapshotDigest: seed.seedSnapshotDigest, envSha256: hash(envContent), syntheticCatalogEnabled: false });
}

function parseJson(stdout, code) {
  try { return JSON.parse(String(stdout ?? '').trim()); } catch { fail(code); }
}

function assertNoHostPorts(record, code = 'fixture_env_host_port_forbidden') {
  if (Object.values(record?.HostConfig?.PortBindings ?? {}).flat().some(Boolean)
      || Object.values(record?.NetworkSettings?.Ports ?? {}).flat().some(Boolean)) fail(code);
}

function assertNetworks(record, manifest, { providerAttached = true, networkIds } = {}) {
  const expected = providerAttached ? [manifest.network, manifest.providerNetwork] : [manifest.network];
  const networks = record?.NetworkSettings?.Networks ?? {};
  if (JSON.stringify(Object.keys(networks).sort()) !== JSON.stringify([...expected].sort())) {
    fail('fixture_env_network_inventory_invalid');
  }
  for (const name of expected) {
    const actualId = networks[name]?.NetworkID;
    if (!digestPattern.test(actualId ?? '')
        || networkIds && (!digestPattern.test(networkIds[name] ?? '') || actualId !== networkIds[name])) {
      fail('fixture_env_network_inventory_invalid');
    }
  }
}

function exactEnvironment(left, right) {
  return JSON.stringify(canonical(envMap(left))) === JSON.stringify(canonical(envMap(right)));
}

function assertOriginalRecord(record, manifest, original, networkIds, { stopped = null, name = manifest.apiContainer } = {}) {
  if (record?.Id !== original.Id || record?.Name !== `/${name}`
      || stopped !== null && record?.State?.Running !== !stopped
      || record?.Image !== original.Image || !exactEnvironment(record?.Config?.Env, original?.Config?.Env)) {
    fail('fixture_env_original_identity_invalid');
  }
  const comparable = structuredClone(record);
  comparable.Config.Env = [...original.Config.Env];
  if (registrationConfigDrift(original, comparable).fields.length) fail('fixture_env_original_identity_invalid');
  assertNoHostPorts(record); assertNetworks(record, manifest, { networkIds });
}

function assertReplacementRecord(record, manifest, original, proposal, networkIds,
  { requireRunning = true, providerAttached = true } = {}) {
  if (!digestPattern.test(record?.Id ?? '') || record.Id === original.Id
      || requireRunning !== null && record?.State?.Running !== requireRunning
      || record?.Config?.Image !== `${manifest.image}@${manifest.imageDigest}`
      || record?.Image !== original.Image) fail('fixture_env_replacement_identity_invalid');
  assertNoHostPorts(record);
  if (providerAttached === null) {
    try { assertNetworks(record, manifest, { providerAttached: false, networkIds }); }
    catch { assertNetworks(record, manifest, { providerAttached: true, networkIds }); }
  } else assertNetworks(record, manifest, { providerAttached, networkIds });
  const before = envMap(original.Config.Env);
  const expected = { ...before, ...proposal.values };
  if (!exactEnvironment(record.Config.Env, Object.entries(expected).map(([name, value]) => `${name}=${value}`))) {
    fail('fixture_env_replacement_environment_invalid');
  }
  const comparable = structuredClone(record);
  comparable.Config.Image = original.Config.Image;
  comparable.Config.Env = [...original.Config.Env];
  const drift = registrationConfigDrift(original, comparable);
  if (drift.fields.length) fail('fixture_env_replacement_config_drift');
}

async function commandJson(command, args, phase, commandEnv, code) {
  return parseJson((await command('docker', args, { phase, env: commandEnv })).stdout, code);
}

async function collectPreflight({ manifest, bootstrap, sourceCommit, evidenceFile, command, commandEnv }) {
  if (sourceCommit !== manifest.fixtureBinding.opsCommit) fail('fixture_env_source_binding_invalid');
  const env = await readEnv(manifest);
  if (hash(env.content) !== manifest.fixtureBinding.envSha256) fail('fixture_env_file_digest_invalid');
  await assertPrivateTarget(manifest.fixtureBinding.backupFile, 'fixture_env_backup_target_invalid');
  if (evidenceFile) await assertPrivateTarget(evidenceFile, 'fixture_env_evidence_target_invalid');
  const inspect = (target, phase) => commandJson(command, ['inspect', '--format', '{{json .}}', target], phase, commandEnv, `${phase}_invalid`);
  const api = await inspect(manifest.apiContainer, 'fixture_env_current_api_inspect');
  const database = await inspect(manifest.databaseContainer, 'fixture_env_current_database_inspect');
  const volume = await inspect(manifest.databaseVolume, 'fixture_env_current_database_volume_inspect');
  const network = await inspect(manifest.network, 'fixture_env_current_network_inspect');
  const providerNetwork = await inspect(manifest.providerNetwork, 'fixture_env_current_provider_network_inspect');
  const uploads = await inspect(manifest.uploadsVolume, 'fixture_env_current_uploads_volume_inspect');
  const image = await commandJson(command, ['image', 'inspect', '--format', '{{json .}}', manifest.image], 'fixture_env_current_image_inspect', commandEnv, 'fixture_env_current_image_inspect_invalid');
  if (api.Id !== manifest.apiContainerId || api.Name !== `/${manifest.apiContainer}` || api.State?.Running !== true
      || corsContainerFingerprint(api) !== manifest.fixtureBinding.apiFingerprint
      || api.Image !== image.Id || ![manifest.image, `${manifest.image}@${manifest.imageDigest}`].includes(api.Config?.Image)
      || database.Name !== `/${manifest.databaseContainer}` || database.State?.Running !== true
      || volume.Name !== manifest.databaseVolume || network.Name !== manifest.network || network.Internal !== true
      || providerNetwork.Name !== manifest.providerNetwork || uploads.Name !== manifest.uploadsVolume
      || image.Config?.Labels?.['org.opencontainers.image.revision'] !== manifest.runtimeRevision
      || image.Config?.User !== 'shareittoo'
      || !(image.RepoDigests ?? []).some((entry) => entry.endsWith(`@${manifest.imageDigest}`))) fail('fixture_env_runtime_inventory_invalid');
  const networkIds = Object.freeze({ [manifest.network]: network.Id, [manifest.providerNetwork]: providerNetwork.Id });
  assertNoHostPorts(api); assertNetworks(api, manifest, { networkIds });
  const apiValues = envMap(api.Config.Env);
  for (const [name, value] of Object.entries(env.values)) if (apiValues[name] !== value) fail('fixture_env_file_runtime_drift');
  for (const [name, value] of Object.entries(manifest.safetyEnv)) if (apiValues[name] !== value) fail('fixture_env_safety_environment_invalid');
  if (apiValues.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED !== 'false'
      || String(apiValues.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '') !== '') fail('fixture_env_registration_not_closed');
  const proposal = fixtureEnvProposal(apiValues, bootstrap.manifest, manifest.fixtureBinding);
  const sealedName = `${manifest.apiContainer}-web-fixture-env-rollback-${manifest.apiContainerId.slice(0, 12)}`;
  const conflict = await command('docker', ['ps', '--all', '--filter', `name=^/${sealedName}$`, '--format', '{{.Names}}'], { phase: 'fixture_env_sealed_name_conflict', env: commandEnv });
  if (String(conflict.stdout ?? '').trim()) fail('fixture_env_rollback_name_conflict');
  const dbExec = async (args, phase) => command('docker', ['exec', manifest.databaseContainer, ...args], { phase, env: commandEnv });
  const dbProbe = await dbExec(['psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc', 'SELECT 1'], 'fixture_env_database_probe');
  if (String(dbProbe.stdout ?? '').trim() !== '1') fail('fixture_env_database_probe_invalid');
  const schema = await dbExec(['psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc', 'SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'], 'fixture_env_schema_readback');
  if (String(schema.stdout ?? '').trim() !== requiredTerminalMigration) fail('fixture_env_schema_readback_invalid');
  const ledger = await dbExec(['sh', '-c', `set -eu; psql -X --set ON_ERROR_STOP=1 -U '${manifest.databaseUser}' -d '${manifest.databaseName}' -Atc "SELECT string_agg(name || '|' || checksum, E'\\n' ORDER BY name) FROM schema_migrations" | sha256sum | awk '{print $1}'`], 'fixture_env_ledger_readback');
  if (String(ledger.stdout ?? '').trim() !== requiredMigrationLedger) fail('fixture_env_ledger_readback_invalid');
  const seed = await dbExec(['psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc', fixtureSeedReadbackSql], 'fixture_env_seed_readback');
  assertFixtureSeedReadback(seed.stdout, manifest.fixtureBinding);
  const live = await command('docker', ['exec', manifest.apiContainerId, 'node', '--input-type=module', '-e', "const l=await fetch('http://127.0.0.1:8080/health/live');const r=await fetch('http://127.0.0.1:8080/health/ready');const v=await fetch('http://127.0.0.1:8080/version');process.stdout.write(JSON.stringify({live:l.status,ready:r.status,version:await v.json()}));"], { phase: 'fixture_env_current_runtime_readback', env: commandEnv });
  const runtime = parseJson(live.stdout, 'fixture_env_current_runtime_readback_invalid');
  if (runtime.live !== 200 || runtime.ready !== 200 || runtime.version?.commit !== manifest.runtimeRevision || runtime.version?.environment !== 'test') fail('fixture_env_current_runtime_readback_invalid');
  const candidate = await command('docker', ['exec', manifest.apiContainerId, 'node', '--input-type=module', '-e',
    fixtureEnvReadbackScript(), fixtureEnvReadbackArgument(proposal.values)],
  { phase: 'fixture_env_candidate_config_import', env: commandEnv });
  assertFixtureEnvReadback(candidate.stdout, proposal);
  const primaryNetworkMode = api.HostConfig?.NetworkMode;
  if (![manifest.network, network.Id].includes(primaryNetworkMode)
      || api.NetworkSettings?.Networks?.[manifest.network]?.NetworkID !== network.Id
      || api.NetworkSettings?.Networks?.[manifest.providerNetwork]?.NetworkID !== providerNetwork.Id) fail('fixture_env_primary_network_invalid');
  buildReplacementCreateArgs({ manifest, envFile: manifest.envFile, currentApi: api, networkName: primaryNetworkMode });
  return Object.freeze({ env, api, proposal, sealedName, primaryNetworkMode, networkIds,
    phases: Object.freeze(['fixture_env_current_api_inspect', 'fixture_env_current_database_inspect',
      'fixture_env_current_database_volume_inspect', 'fixture_env_current_network_inspect',
      'fixture_env_current_provider_network_inspect', 'fixture_env_current_uploads_volume_inspect',
      'fixture_env_current_image_inspect', 'fixture_env_sealed_name_conflict', 'fixture_env_database_probe',
      'fixture_env_schema_readback', 'fixture_env_ledger_readback', 'fixture_env_seed_readback',
      'fixture_env_current_runtime_readback', 'fixture_env_candidate_config_import']) });
}

async function inspectOptional(command, target, phase, commandEnv) {
  try {
    const result = await command('docker', ['inspect', '--format', '{{json .}}', target], { phase, env: commandEnv, allowFailure: true });
    if (result?.code !== undefined && result.code !== 0) return null;
    return parseJson(result.stdout, `${phase}_invalid`);
  } catch { return undefined; }
}

async function safeDocker(command, args, phase, commandEnv) {
  try {
    const result = await command('docker', args, { phase, env: commandEnv, allowFailure: true });
    return { ok: result?.code === undefined || result.code === 0, phase };
  } catch (error) { return { ok: false, phase, code: error?.code ?? `${phase}_failed` }; }
}

async function readConvergedSealedOriginal({ command, commandEnv, manifest, preflight }) {
  for (let attempt = 1; attempt <= sealedReadbackAttempts; attempt += 1) {
    try {
      const sealed = await commandJson(command, ['inspect', '--format', '{{json .}}', preflight.api.Id],
        'fixture_env_rollback_seal_readback', commandEnv, 'fixture_env_rollback_seal_readback_invalid');
      assertOriginalRecord(sealed, manifest, preflight.api, preflight.networkIds,
        { stopped: true, name: preflight.sealedName });
      return sealed;
    } catch {
      if (attempt === sealedReadbackAttempts) {
        const error = new Error('fixture_env_sealed_readback_not_converged');
        error.code = 'fixture_env_sealed_readback_not_converged';
        error.failurePhase = 'fixture_env_sealed_readback';
        throw error;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, sealedReadbackDelayMs));
    }
  }
  throw new Error('fixture_env_sealed_readback_unreachable');
}

async function rollbackFixtureEnv({ manifest, preflight, appliedEnv, command, commandEnv, replacementId }) {
  const results = [];
  let safe = true;
  try {
    const current = await readEnv(manifest);
    if (current.content === appliedEnv) await atomicReplaceEnv(preflight.env.content, manifest);
    else if (current.content !== preflight.env.content) fail('fixture_env_rollback_env_foreign');
    results.push({ phase: 'fixture_env_rollback_env_restore', ok: true });
  } catch (error) { results.push({ phase: 'fixture_env_rollback_env_restore', ok: false, code: error.code ?? 'fixture_env_rollback_env_restore_failed' }); safe = false; }
  let current = await inspectOptional(command, manifest.apiContainer, 'fixture_env_rollback_current_inspect', commandEnv);
  if (current === undefined) { results.push({ phase: 'fixture_env_rollback_current_inspect', ok: false, code: 'fixture_env_rollback_current_unknown' }); safe = false; }
  if (safe && current && current.Id !== preflight.api.Id) {
    try { assertReplacementRecord(current, manifest, preflight.api, preflight.proposal, preflight.networkIds,
      { requireRunning: null, providerAttached: null }); }
    catch { safe = false; results.push({ phase: 'fixture_env_rollback_replacement_identity', ok: false, code: 'fixture_env_rollback_replacement_ambiguous' }); }
    if (safe && replacementId && current.Id !== replacementId) { safe = false; results.push({ phase: 'fixture_env_rollback_replacement_identity', ok: false, code: 'fixture_env_rollback_replacement_id_drift' }); }
    if (safe) {
      const removed = await safeDocker(command, ['rm', '--force', current.Id], 'fixture_env_rollback_replacement_remove', commandEnv);
      results.push(removed); safe &&= removed.ok; current = null;
    }
  }
  const original = await inspectOptional(command, preflight.api.Id, 'fixture_env_rollback_original_inspect', commandEnv);
  if (original === undefined || original === null) { safe = false; results.push({ phase: 'fixture_env_rollback_original_inspect', ok: false, code: 'fixture_env_rollback_original_missing' }); }
  if (safe) {
    try {
      const currentName = original.Name?.replace(/^\//u, '');
      if (![manifest.apiContainer, preflight.sealedName].includes(currentName)) fail('fixture_env_rollback_original_name_invalid');
      assertOriginalRecord(original, manifest, preflight.api, preflight.networkIds,
        { stopped: original.State?.Running === false, name: currentName });
      if (currentName === preflight.sealedName) {
        const renamed = await safeDocker(command, ['rename', original.Id, manifest.apiContainer], 'fixture_env_rollback_original_rename', commandEnv);
        results.push(renamed); safe &&= renamed.ok;
      }
      if (safe && original.State?.Running !== true) {
        const started = await safeDocker(command, ['start', original.Id], 'fixture_env_rollback_original_start', commandEnv);
        results.push(started); safe &&= started.ok;
      }
      if (safe) {
        const restored = await commandJson(command, ['inspect', '--format', '{{json .}}', original.Id], 'fixture_env_rollback_original_readback', commandEnv, 'fixture_env_rollback_original_readback_invalid');
        assertOriginalRecord(restored, manifest, preflight.api, preflight.networkIds, { stopped: false });
        const startup = await runBoundedStartupProbe(command, original.Id, commandEnv, 'fixture_env_rollback_runtime_readback');
        if (startup.version?.commit !== manifest.runtimeRevision || startup.version?.environment !== 'test') fail('fixture_env_rollback_runtime_readback_invalid');
        results.push({ phase: 'fixture_env_rollback_runtime_readback', ok: true });
      }
    } catch (error) { safe = false; results.push({ phase: 'fixture_env_rollback_original_restore', ok: false, code: error.code ?? 'fixture_env_rollback_original_restore_failed' }); }
  }
  return Object.freeze({ restored: safe, results: Object.freeze(results) });
}

// The mutation lifecycle is shared by narrowly scoped successors. Callers must
// finish all profile-specific read-only gates before entering it and supply the
// post-start/final witnesses and sanitized evidence payload. Container identity,
// atomic env IO and rollback ownership remain centralized here.
export async function runFixtureEnvReplacement({
  manifest, preflight, sourceCommit, evidenceFile, changedKeys,
  command = runCommand, commandEnv = process.env,
  preMutationReadback, replacementReadback, finalReadback, rollbackReadback = async () => {},
  buildResult, buildEvidence,
} = {}) {
  if (!Array.isArray(changedKeys) || changedKeys.length < 1 || new Set(changedKeys).size !== changedKeys.length
      || !changedKeys.every((name) => /^[A-Z][A-Z0-9_]*$/u.test(name))
      || typeof preMutationReadback !== 'function' || typeof replacementReadback !== 'function'
      || typeof finalReadback !== 'function' || typeof rollbackReadback !== 'function'
      || typeof buildResult !== 'function'
      || typeof buildEvidence !== 'function' || !evidenceFile) fail('fixture_env_replacement_contract_invalid');
  const appliedEnv = fixtureEnvContent(preflight.env.content, preflight.proposal, changedKeys);
  let replacementId;
  let envMutationOwned = false;
  try {
    const before = await commandJson(command, ['inspect', '--format', '{{json .}}', preflight.api.Id],
      'fixture_env_pre_mutation_api_readback', commandEnv, 'fixture_env_pre_mutation_api_readback_invalid');
    if (corsContainerFingerprint(before) !== manifest.fixtureBinding.apiFingerprint) {
      fail('fixture_env_pre_mutation_fingerprint_invalid');
    }
    assertOriginalRecord(before, manifest, preflight.api, preflight.networkIds, { stopped: false });
    await preMutationReadback({ before, preflight, manifest, command, commandEnv });
    await writePrivateFile(manifest.fixtureBinding.backupFile, Buffer.from(preflight.env.content),
      'fixture_env_backup_write');
    if ((await readEnv(manifest)).content !== preflight.env.content) fail('fixture_env_changed_since_preflight');
    await atomicReplaceEnv(appliedEnv, manifest); envMutationOwned = true;
    try { await command('docker', ['stop', preflight.api.Id], { phase: 'fixture_env_stop_current_api', env: commandEnv }); }
    catch (error) {
      const stopped = await inspectOptional(command, preflight.api.Id, 'fixture_env_stop_response_readback', commandEnv);
      if (!stopped) throw error;
      assertOriginalRecord(stopped, manifest, preflight.api, preflight.networkIds, { stopped: true });
    }
    try { await command('docker', ['rename', preflight.api.Id, preflight.sealedName], { phase: 'fixture_env_seal_current_api', env: commandEnv }); }
    catch (error) {
      const sealed = await inspectOptional(command, preflight.api.Id, 'fixture_env_rename_response_readback', commandEnv);
      if (!sealed || sealed.Name !== `/${preflight.sealedName}`) throw error;
      assertOriginalRecord(sealed, manifest, preflight.api, preflight.networkIds,
        { stopped: true, name: preflight.sealedName });
    }
    const createArgs = [...buildReplacementCreateArgs({ manifest, envFile: manifest.envFile,
      currentApi: preflight.api, networkName: preflight.primaryNetworkMode })];
    const imageIndex = createArgs.lastIndexOf(manifest.image);
    if (imageIndex < 0) fail('fixture_env_replacement_image_argument_missing');
    createArgs[imageIndex] = `${manifest.image}@${manifest.imageDigest}`;
    try {
      const created = await command('docker', createArgs, { phase: 'fixture_env_create_replacement_api', env: commandEnv });
      replacementId = String(created.stdout ?? '').trim();
      if (!digestPattern.test(replacementId) || replacementId === preflight.api.Id) fail('fixture_env_replacement_create_invalid');
    } catch (error) {
      const observed = await inspectOptional(command, manifest.apiContainer, 'fixture_env_create_response_readback', commandEnv);
      if (observed) {
        assertReplacementRecord(observed, manifest, preflight.api, preflight.proposal, preflight.networkIds,
          { requireRunning: false, providerAttached: false });
        replacementId = observed.Id;
      }
      throw error;
    }
    await command('docker', ['network', 'connect', manifest.providerNetwork, replacementId],
      { phase: 'fixture_env_attach_provider_network', env: commandEnv });
    await command('docker', ['start', replacementId], { phase: 'fixture_env_start_replacement_api', env: commandEnv });
    const replacement = await commandJson(command, ['inspect', '--format', '{{json .}}', replacementId],
      'fixture_env_replacement_readback', commandEnv, 'fixture_env_replacement_readback_invalid');
    assertReplacementRecord(replacement, manifest, preflight.api, preflight.proposal, preflight.networkIds);
    const startup = await runBoundedStartupProbe(command, replacementId, commandEnv,
      'fixture_env_replacement_runtime_probe');
    if (startup.version?.commit !== manifest.runtimeRevision || startup.version?.environment !== 'test'
        || startup.flags?.PAYMENT_TRANSPORT !== 'memory' || startup.flags?.STRIPE_LIVEMODE !== 'false') {
      fail('fixture_env_replacement_runtime_probe_invalid');
    }
    await replacementReadback({ replacementId, replacement, startup, preflight, manifest, command, commandEnv });
    if ((await readEnv(manifest)).content !== appliedEnv) fail('fixture_env_final_file_readback_invalid');
    const seal = await readConvergedSealedOriginal({ command, commandEnv, manifest, preflight });
    await finalReadback({ replacementId, replacement, startup, seal, preflight, manifest, command, commandEnv });
    const result = Object.freeze(buildResult({ replacementId, appliedEnv, preflight, manifest, sourceCommit }));
    const evidence = buildEvidence({ result, replacementId, appliedEnv, preflight, manifest, sourceCommit });
    await writePrivateFile(evidenceFile, Buffer.from(`${JSON.stringify(evidence)}\n`), 'fixture_env_evidence_write');
    return result;
  } catch (error) {
    let rollback = await rollbackFixtureEnv({ manifest, preflight, appliedEnv, command, commandEnv, replacementId });
    if (rollback.restored) {
      try {
        await rollbackReadback({ preflight, manifest, command, commandEnv });
        rollback = Object.freeze({ restored: true, results: Object.freeze([
          ...rollback.results, { phase: 'fixture_env_rollback_profile_readback', ok: true },
        ]) });
      } catch (rollbackError) {
        rollback = Object.freeze({ restored: false, results: Object.freeze([
          ...rollback.results, { phase: 'fixture_env_rollback_profile_readback', ok: false,
            code: rollbackError?.code ?? 'fixture_env_rollback_profile_readback_failed' },
        ]) });
      }
    }
    error.rollback = rollback;
    if (!envMutationOwned && rollback.restored === false) {
      error.code = error.code ?? 'fixture_env_pre_mutation_failure_rollback_uncertain';
    }
    throw error;
  }
}

export async function runStagingWebFixtureEnvTransition({
  manifest, bootstrapManifestBytes, sourceCommit, evidenceFile,
  execute = false, confirmSource, confirmRun,
  command = runCommand, commandEnv = process.env,
} = {}) {
  const target = assertFixtureEnvRuntimeManifest(manifest);
  const bootstrap = parseFixtureBootstrapBinding(bootstrapManifestBytes, target.fixtureBinding);
  const run = async () => {
    const preflight = await collectPreflight({ manifest: target, bootstrap, sourceCommit, evidenceFile, command, commandEnv });
    if (!execute) {
      if (confirmSource !== undefined || confirmRun !== undefined
          || commandEnv.STAGING_WEB_FIXTURE_ENV_EXECUTE !== undefined
          || commandEnv.STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE !== undefined
          || commandEnv.STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN !== undefined) fail('fixture_env_execute_not_authorized');
      return Object.freeze({ status: 'preflight-passed-no-mutation', firstIrreversiblePhase: 'write_protected_fixture_env_backup',
        opsCommit: sourceCommit, bootstrapManifestSha256: target.fixtureBinding.bootstrapManifestSha256,
        bootstrapRunIdSha256: target.fixtureBinding.bootstrapRunIdSha256,
        seedScopeDigest: target.fixtureBinding.seedScopeDigest, seedSnapshotDigest: target.fixtureBinding.seedSnapshotDigest,
        envSha256: target.fixtureBinding.envSha256, changedEnvironmentKeys: [...fixtureEnvKeys],
        syntheticCatalogEnabled: false, commands: preflight.phases });
    }
    if (commandEnv.STAGING_WEB_FIXTURE_ENV_EXECUTE !== '1'
        || commandEnv.STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE !== sourceCommit
        || commandEnv.STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN !== bootstrap.runId
        || confirmSource !== sourceCommit || confirmRun !== bootstrap.runId) fail('fixture_env_explicit_confirmation_required');
    if (!evidenceFile) fail('fixture_env_evidence_path_required');
    return runFixtureEnvReplacement({
      manifest: target, preflight, sourceCommit, evidenceFile, changedKeys: fixtureEnvKeys, command, commandEnv,
      preMutationReadback: async () => {
        const seedBefore = await command('docker', ['exec', target.databaseContainer, 'psql', '-X',
          '--set', 'ON_ERROR_STOP=1', '-U', target.databaseUser, '-d', target.databaseName, '-Atc',
          fixtureSeedReadbackSql], { phase: 'fixture_env_pre_mutation_seed_readback', env: commandEnv });
        assertFixtureSeedReadback(seedBefore.stdout, target.fixtureBinding);
      },
      replacementReadback: async ({ replacementId }) => {
        const config = await command('docker', ['exec', replacementId, 'node', '--input-type=module', '-e',
          fixtureEnvReadbackScript()],
        { phase: 'fixture_env_replacement_config_readback', env: commandEnv });
        assertFixtureEnvReadback(config.stdout, preflight.proposal);
      },
      finalReadback: async () => {
        const seedAfter = await command('docker', ['exec', target.databaseContainer, 'psql', '-X',
          '--set', 'ON_ERROR_STOP=1', '-U', target.databaseUser, '-d', target.databaseName, '-Atc',
          fixtureSeedReadbackSql], { phase: 'fixture_env_final_seed_readback', env: commandEnv });
        assertFixtureSeedReadback(seedAfter.stdout, target.fixtureBinding);
      },
      buildResult: ({ replacementId, appliedEnv }) => ({
        status: 'staging-web-fixture-env-handoff-applied-catalog-disabled',
        opsCommit: sourceCommit, runtimeRevision: target.runtimeRevision, imageDigest: target.imageDigest,
        bootstrapManifestSha256: target.fixtureBinding.bootstrapManifestSha256,
        bootstrapSourceCommit: target.fixtureBinding.bootstrapSourceCommit,
        bootstrapRunIdSha256: target.fixtureBinding.bootstrapRunIdSha256,
        seedScopeDigest: target.fixtureBinding.seedScopeDigest, seedSnapshotDigest: target.fixtureBinding.seedSnapshotDigest,
        changedEnvironmentKeys: [...fixtureEnvKeys], allowedUserCountBefore: preflight.proposal.beforeAllowedCount,
        allowedUserIdsDigestBefore: preflight.proposal.beforeAllowedDigest,
        allowedUserCountAfter: preflight.proposal.afterAllowedCount,
        allowedUserIdsDigestAfter: preflight.proposal.afterAllowedDigest,
        publicListingIdsDigest: preflight.proposal.publicListingDigest,
        publicUploadNamesDigest: preflight.proposal.publicUploadDigest,
        syntheticCatalogEnabled: false, runtimeActivated: false,
        envSha256Before: hash(preflight.env.content), envSha256After: hash(appliedEnv),
        backupSha256: hash(preflight.env.content), backupMode: '0600', backupRetained: true,
        sealedName: preflight.sealedName, originalContainerId: preflight.api.Id, replacementContainerId: replacementId,
        rollbackContract: 'failure restores exact old env and immutable original API before reporting success=false',
      }),
      buildEvidence: ({ result }) => ({ kind: 'sit-staging-web-fixture-env-transition', schemaVersion: 1,
        schemaMigration: requiredTerminalMigration, migrationLedger: requiredMigrationLedger, ...result }),
    });
  };
  return withCorsTransitionLock(target, execute, run);
}

export function sanitizeFixtureEnvError(error) {
  const safeCode = typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,95}$/u.test(error.code)
    ? error.code : 'fixture_env_transition_failed';
  const safePhase = error?.failurePhase === 'fixture_env_sealed_readback'
    ? error.failurePhase : undefined;
  return Object.freeze({ status: 'failed', code: safeCode,
    ...(safePhase ? { failurePhase: safePhase } : {}),
    ...(error?.rollback ? { rollback: { restored: error.rollback.restored === true,
      results: (error.rollback.results ?? []).map((entry) => ({ phase: entry.phase, ok: entry.ok === true,
        ...(entry.code ? { code: entry.code } : {}) })) } } : {}) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stderr.write('{"status":"failed","code":"use_promote_staging_web_fixture_env_entrypoint"}\n');
  process.exitCode = 1;
}
