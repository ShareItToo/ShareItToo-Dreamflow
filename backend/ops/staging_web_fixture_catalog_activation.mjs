#!/usr/bin/env node
// One-key Green activation for the already prepared noncontractual fixture.
// DB preparation and login proof are immutable prerequisites; this module only
// changes SIT_STAGING_SYNTHETIC_CATALOG_ENABLED from false to true.
import crypto from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReplacementCreateArgs, runCommand } from './activate_staging_google_auth.mjs';
import { assertGoogleRegistrationRuntimeManifest } from './enable_staging_google_registration.mjs';
import { dedicatedFixture } from './staging_web_fixture_bootstrap.mjs';
import {
  assertFixtureSeedReadback,
  fixtureEnvDigest,
  fixtureSeedReadbackSql,
  runFixtureEnvReplacement,
  sanitizeFixtureEnvError,
} from './staging_web_fixture_env_transition.mjs';
import { fixtureNotice } from './staging_web_fixture_preflight.mjs';
import { readStablePrivateFile, writeExclusivePrivateFile } from './stable_private_file.mjs';
import { corsContainerFingerprint, withCorsTransitionLock } from './staging_web_cors_transition.mjs';

export const catalogActivationManifestKind = 'sit-staging-web-fixture-catalog-activation-runtime-manifest';
export const catalogActivationKey = 'SIT_STAGING_SYNTHETIC_CATALOG_ENABLED';
export const requiredDatabasePreparationEvidenceSha256 = '109e29f5e0f13db97b0423cc6e00dbc1501f8a8daed85209d76f1565071acc32';
export const requiredLoginProofEvidenceSha256 = 'f1b8310c88d0bc1937d4ef5d6f0efb41af09f261b6c75deae2a77938765e5419';
export const requiredLoginProofOpsCommit = 'ef5eae4472f6349f6da0cec6249dc8ca88f96fa3';
export const requiredBootstrapLedgerDigest = '4fff35fbe15c64a38f0ca423222b32298b5595da8dab81e306a7ad5a48e80f08';
export const requiredLoginProofLedgerDigest = '4fff35fbe15c64a38f0ca423222b32298b5595da8dab81e306a7ad5a48e80f08';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const requiredTerminalMigration = '098_booking_checkout_declaration_constraints.up.sql';
const requiredMigrationLedger = '796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196';
const apiContainer = 'shareittoo-staging-api';
const databaseContainer = 'sit-green-postgres-20260918011528-wp254';
const databaseVolume = 'sit-green-volume-20260918011528-wp254';
const networkName = 'sit-green-network-20260918011528-wp254';
const providerNetwork = 'sit-staging-provider-egress';
const uploadsVolume = 'sit-green-uploads-20260918011528-wp254';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const check = (value, code) => { if (!value) fail(code); };

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
const digest = (value) => hash(JSON.stringify(canonical(value)));

function exactKeys(value, keys, code) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), code);
}

function parseJson(value, code) {
  try { return JSON.parse(String(value).trim()); } catch { fail(code); }
}

function safeExternalPath(value, code) {
  check(typeof value === 'string' && isAbsolute(value) && !value.startsWith(`${repositoryRoot}/`)
    && !value.includes('..'), code);
  return value;
}

function envMap(entries, code = 'catalog_activation_environment_invalid') {
  const result = {};
  for (const entry of entries ?? []) {
    const index = String(entry).indexOf('=');
    check(index > 0 && !Object.hasOwn(result, String(entry).slice(0, index)), code);
    result[String(entry).slice(0, index)] = String(entry).slice(index + 1);
  }
  return result;
}

function parseEnvContent(content) {
  const values = {};
  for (const line of String(content).split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    check(match && !Object.hasOwn(values, match[1]), 'catalog_activation_env_file_invalid');
    values[match[1]] = match[2];
  }
  return values;
}

export function validateCatalogActivationBootstrap(bytes, expectedSha256) {
  check(Buffer.isBuffer(bytes) && hash(bytes) === expectedSha256, 'catalog_activation_bootstrap_digest_invalid');
  const manifest = parseJson(bytes, 'catalog_activation_bootstrap_json_invalid');
  check(manifest?.kind === 'sit-dedicated-web-fixture-bootstrap' && manifest.schemaVersion === 1
    && manifest.operation === 'seed' && commitPattern.test(manifest.sourceCommit ?? '')
    && manifest.schemaCount === 98 && manifest.ledgerDigest === requiredBootstrapLedgerDigest
    && Array.isArray(manifest.passwordDigests) && manifest.passwordDigests.length === 2
    && manifest.passwordDigests.every((value) => digestPattern.test(value ?? ''))
    && typeof manifest.preflight?.runId === 'string'
    && /^web-fixture-[A-Za-z0-9-]{16,120}$/u.test(manifest.preflight.runId)
    && manifest.preflight.listingId === dedicatedFixture.listing
    && manifest.preflight.uploadName === dedicatedFixture.upload
    && JSON.stringify(manifest.preflight.roles?.map(({ role, userId }) => ({ role, userId }))) === JSON.stringify([
      { role: 'owner', userId: dedicatedFixture.owner }, { role: 'renter', userId: dedicatedFixture.renter },
    ]), 'catalog_activation_bootstrap_invalid');
  return Object.freeze({ manifest, runId: manifest.preflight.runId });
}

function validateEvidenceBytes(bytes, expectedSha256, code, evidenceHash = hash) {
  check(Buffer.isBuffer(bytes) && evidenceHash(bytes) === expectedSha256, `${code}_digest_invalid`);
  const evidence = parseJson(bytes, `${code}_json_invalid`);
  check(evidence && typeof evidence === 'object' && !Array.isArray(evidence), `${code}_invalid`);
  return evidence;
}

export function validateLoginProofEvidence(evidence, { runtimeRevision, imageDigest,
  bootstrapManifestSha256, bootstrapRunIdSha256 }) {
  check(evidence.kind === 'sit-green-web-fixture-login-proof' && evidence.schemaVersion === 1
    && evidence.status === 'fixture-login-proof-verified-sessions-revoked'
    && evidence.opsCommit === requiredLoginProofOpsCommit && evidence.runtimeCommit === runtimeRevision
    && evidence.imageDigest === imageDigest
    && evidence.bootstrapManifestSha256 === bootstrapManifestSha256
    && evidence.bootstrapRunIdSha256 === bootstrapRunIdSha256
    && evidence.rolesVerified === 2 && evidence.loginsVerified === 2 && evidence.meVerified === 2
    && evidence.logoutsVerified === 2 && evidence.accessTokensRejected === 2
    && evidence.credentialsAttested === 2 && evidence.activeSessions === 0
    && evidence.activeRefreshTokens === 0 && evidence.retainedSessionRecords === 2
    && evidence.loginAudits === 2 && evidence.schemaCount === 98
    && evidence.ledgerDigest === requiredLoginProofLedgerDigest
    && digestPattern.test(evidence.identityDigest ?? '') && evidence.identityUnchanged === true
    && digestPattern.test(evidence.catalogStateDigest ?? '') && evidence.visibilityUnchanged === true
    && digestPattern.test(evidence.effectDigest ?? '') && evidence.apiReadback === true
    && evidence.paymentMemory === true && evidence.stripeLivemode === false
    && evidence.registrationClosed === true && evidence.catalogEnabled === false
    && evidence.externalProvidersEnabled === false && evidence.cleanupVerified === true
    && evidence.runtimeActivated === false, 'catalog_activation_login_evidence_invalid');
  return evidence;
}

export const catalogActivationStateSql = `WITH activation_listing AS (
  SELECT count(*)::int AS count, min(payload->>'syntheticFixtureRun') AS run_id FROM listings
  WHERE id='${dedicatedFixture.listing}'
), activation_audits AS (
  SELECT count(*)::int AS count, min(request_id) AS run_id FROM audit_log
  WHERE resource_type='staging_web_fixture'
    AND resource_id='${dedicatedFixture.listing}'
    AND actor_role='system'
    AND action='staging_web_fixture.activated'
), activation_binding AS (
  SELECT CASE WHEN
    listing.count=1 AND audit.count=1
    AND listing.run_id ~ '^web-fixture-[a-z0-9-]{8,48}$'
    AND audit.run_id ~ '^web-fixture-[a-z0-9-]{8,48}$'
    AND listing.run_id=audit.run_id
    THEN encode(sha256(convert_to(listing.run_id,'UTF8')),'hex')
    ELSE NULL END AS digest FROM activation_listing listing CROSS JOIN activation_audits audit
)
SELECT json_build_object(
  'users',(SELECT count(*)::int FROM users WHERE id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')
    AND role='user' AND account_status='active' AND deactivated_at IS NULL AND profile->>'syntheticOnly'='true'),
  'listing',(SELECT count(*)::int FROM listings WHERE id='${dedicatedFixture.listing}'
    AND owner_id='${dedicatedFixture.owner}' AND is_active=true AND status='active'
    AND moderation_status='active' AND catalog_version=1
    AND private_status_confirmed_at IS NULL AND COALESCE(private_pilot_region_code,'') <> 'heilbronn'
    AND title='Synthetische Katalogfixture' AND description='${fixtureNotice}'
    AND lower(btrim(city))='heilbronn' AND lower(btrim(country)) IN ('de','deutschland','germany')
    AND payload->>'syntheticNotice'='${fixtureNotice}'),
  'upload',(SELECT count(*)::int FROM uploads WHERE storage_name='${dedicatedFixture.upload}'
    AND listing_id='${dedicatedFixture.listing}' AND owner_id='${dedicatedFixture.owner}'
    AND purpose='listing_image' AND visibility='public' AND content_scan_status='passed'),
  'seedAudits',(SELECT count(*)::int FROM audit_log WHERE resource_type='staging_web_fixture_seed'
    AND resource_id='${dedicatedFixture.listing}' AND action='staging_web_fixture_seed.seeded'),
  'activationAudits',(SELECT count FROM activation_audits),
  'activationRunDigest',(SELECT digest FROM activation_binding),
  'activeSessions',(SELECT count(*)::int FROM auth_sessions WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}') AND revoked_at IS NULL),
  'activeRefresh',(SELECT count(*)::int FROM refresh_tokens WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}') AND revoked_at IS NULL),
  'mfaFactors',(SELECT count(*)::int FROM mfa_totp_factors
    WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}') AND status='enabled'),
  'retainedSessions',(SELECT count(*)::int FROM auth_sessions WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'retainedRefresh',(SELECT count(*)::int FROM refresh_tokens WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'loginAudits',(SELECT count(*)::int FROM audit_log WHERE actor_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}') AND action='auth.login'),
  'bookings',(SELECT count(*)::int FROM bookings WHERE listing_id='${dedicatedFixture.listing}' OR owner_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}') OR renter_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'requests',(SELECT count(*)::int FROM rental_requests WHERE item_id='${dedicatedFixture.listing}' OR owner_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}') OR renter_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'identities',(SELECT count(*)::int FROM auth_identities WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'pushDevices',(SELECT count(*)::int FROM push_devices WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'paymentCommands',(SELECT count(*)::int FROM payment_commands WHERE actor_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'identityProviderSessions',(SELECT count(*)::int FROM identity_verification_sessions WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'technicalProviderRuns',(SELECT count(*)::int FROM technical_sandbox_runs WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'notifications',(SELECT count(*)::int FROM notifications WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'notificationOutbox',(SELECT count(*)::int FROM notification_outbox WHERE user_id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'identityDigest',(SELECT encode(digest(COALESCE(jsonb_agg(jsonb_build_array(account.id,account.email,account.role,
    account.account_status,account.deactivated_at,account.password_hash,account.profile,
    account.failed_login_attempts,account.login_locked_until) ORDER BY account.id)::text,'[]'),'sha256'),'hex')
    FROM users account WHERE account.id IN ('${dedicatedFixture.owner}','${dedicatedFixture.renter}')),
  'catalogDigest',(SELECT encode(digest(jsonb_build_object(
    'listing',(SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.id),'[]'::jsonb) FROM listings item WHERE item.id='${dedicatedFixture.listing}'),
    'upload',(SELECT COALESCE(jsonb_agg(to_jsonb(media) ORDER BY media.id),'[]'::jsonb) FROM uploads media WHERE media.listing_id='${dedicatedFixture.listing}' OR media.storage_name='${dedicatedFixture.upload}')
  )::text,'sha256'),'hex'))
)`;

export function assertCatalogActivationState(stdout, binding = {}) {
  const value = parseJson(stdout, 'catalog_activation_database_state_invalid');
  const countKeys = ['users', 'listing', 'upload', 'seedAudits', 'activationAudits', 'activeSessions',
    'mfaFactors',
    'activeRefresh', 'retainedSessions', 'retainedRefresh', 'loginAudits', 'bookings', 'requests',
    'identities', 'pushDevices', 'paymentCommands', 'identityProviderSessions', 'technicalProviderRuns',
    'notifications', 'notificationOutbox'];
  exactKeys(value, [...countKeys, 'activationRunDigest', 'identityDigest', 'catalogDigest'],
    'catalog_activation_database_state_invalid');
  check(countKeys.every((key) => Number.isInteger(value[key]) && value[key] >= 0)
    && value.users === 2 && value.listing === 1 && value.upload === 1
    && value.seedAudits === 1 && value.activationAudits === 1
    && value.activeSessions === 0 && value.activeRefresh === 0 && value.mfaFactors === 0
    && value.retainedSessions === 2 && value.retainedRefresh === 2 && value.loginAudits === 2
    && ['bookings', 'requests', 'identities', 'pushDevices', 'paymentCommands', 'identityProviderSessions',
      'technicalProviderRuns', 'notifications', 'notificationOutbox'].every((key) => value[key] === 0)
    && digestPattern.test(value.activationRunDigest ?? '')
    && digestPattern.test(value.identityDigest ?? '') && digestPattern.test(value.catalogDigest ?? '')
    && (!binding.activationRunDigest || value.activationRunDigest === binding.activationRunDigest)
    && (!binding.loginIdentityDigest || value.identityDigest === binding.loginIdentityDigest)
    && (!binding.loginCatalogDigest || value.catalogDigest === binding.loginCatalogDigest)
    && (!binding.databaseStateDigest || digest(value) === binding.databaseStateDigest),
  'catalog_activation_database_state_invalid');
  return Object.freeze(value);
}

export function catalogActivationConfigScript(enabled) {
  return `const {config}=await import('./src/config.js');process.stdout.write(JSON.stringify({enabled:config.syntheticCatalog.enabled,listingCount:config.stagingAccess.publicListingIds.length,uploadCount:config.stagingAccess.publicUploadNames.length,registration:config.stagingGoogleRegistration.enabled,payment:process.env.PAYMENT_TRANSPORT,stripe:process.env.STRIPE_LIVEMODE,expected:${enabled}}));`;
}

export function assertCatalogActivationConfig(stdout, enabled) {
  const value = parseJson(stdout, 'catalog_activation_config_invalid');
  exactKeys(value, ['enabled', 'listingCount', 'uploadCount', 'registration', 'payment', 'stripe', 'expected'],
    'catalog_activation_config_invalid');
  check(value.enabled === enabled && value.expected === enabled && value.listingCount === 1
    && value.uploadCount === 1 && value.registration === false && value.payment === 'memory'
    && value.stripe === 'false', 'catalog_activation_config_invalid');
  return value;
}

export function catalogActivationPublicScript(expectVisible) {
  const expectedId = hash(dedicatedFixture.listing); const expectedTitle = hash('Synthetische Katalogfixture');
  const expectedNotice = hash(fixtureNotice);
  return `import crypto from 'node:crypto';const h=(v)=>crypto.createHash('sha256').update(String(v)).digest('hex');const r=await fetch('http://127.0.0.1:8080/v1/listings');let b={};try{b=await r.json()}catch{}const rows=Array.isArray(b.listings)?b.listings:[];const x=rows[0]??{};process.stdout.write(JSON.stringify({status:r.status,count:rows.length,pageCount:b.page?.count,idDigest:rows.length?h(x.id):null,titleDigest:rows.length?h(x.title):null,noticeDigest:rows.length?h(x.syntheticNotice):null,catalogClass:x.catalogClass??null,realOffer:x.realOffer??null,ownerDeclaration:x.ownerDeclaration??null,bookingAllowed:x.bookingAllowed??null,paymentAllowed:x.paymentAllowed??null,expectedVisible:${expectVisible},expectedId:'${expectedId}',expectedTitle:'${expectedTitle}',expectedNotice:'${expectedNotice}'}));`;
}

export function assertCatalogActivationPublic(stdout, visible) {
  const value = parseJson(stdout, 'catalog_activation_public_readback_invalid');
  check(value.status === 200 && value.expectedVisible === visible && value.pageCount === value.count,
    'catalog_activation_public_readback_invalid');
  if (!visible) check(value.count === 0, 'catalog_activation_public_readback_invalid');
  else check(value.count === 1 && value.idDigest === value.expectedId && value.titleDigest === value.expectedTitle
    && value.noticeDigest === value.expectedNotice
    && value.catalogClass === 'synthetic_noncontractual_catalog_only'
    && value.realOffer === false && value.ownerDeclaration === false
    && value.bookingAllowed === false && value.paymentAllowed === false,
  'catalog_activation_public_readback_invalid');
  return value;
}

function assertActivationEnvironment(environment, runtimeRevision) {
  const allowed = String(environment.SIT_STAGING_ALLOWED_USER_IDS ?? '').split(',');
  check(environment.APP_COMMIT === runtimeRevision && environment.DEPLOYMENT_ENVIRONMENT === 'test'
    && environment.SIT_STAGING_ACCESS_GATE_ENABLED === 'true'
    && allowed[0] === dedicatedFixture.owner && allowed[1] === dedicatedFixture.renter
    && allowed.length >= 2 && new Set(allowed).size === allowed.length
    && environment.SIT_STAGING_PUBLIC_LISTING_IDS === dedicatedFixture.listing
    && environment.SIT_STAGING_PUBLIC_UPLOAD_NAMES === dedicatedFixture.upload
    && environment[catalogActivationKey] === 'false'
    && environment.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED === 'false'
    && String(environment.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '') === ''
    && environment.PAYMENT_TRANSPORT === 'memory' && environment.STRIPE_LIVEMODE === 'false'
    && environment.MAIL_TRANSPORT === 'memory' && environment.PUSH_TRANSPORT === 'memory'
    && environment.IDENTITY_VERIFICATION_TRANSPORT === 'memory'
    && environment.SIT_LISTING_AI_PROVIDER === 'on_device'
    && environment.SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED === '0'
    && environment.SIT_LISTING_AI_BUDGET_CENTS === '0'
    && environment.TECHNICAL_SANDBOX_ENABLED === '0' && environment.TECHNICAL_SANDBOX_KILL_SWITCH === '1'
    && ['TECHNICAL_SANDBOX_ACCOUNT_ID', 'TECHNICAL_SANDBOX_USER_IDS',
      'TECHNICAL_SANDBOX_AUTHORIZATION_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT',
      'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE',
      'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE'].every((key) => String(environment[key] ?? '') === ''),
  'catalog_activation_effect_boundary_invalid');
  return environment;
}

function assertBinding(binding) {
  const keys = ['opsCommit', 'loginProofOpsCommit', 'bootstrapManifestSha256', 'bootstrapRunIdSha256',
    'seedScopeDigest', 'seedSnapshotDigest', 'activationRunDigest',
    'databasePreparationEvidenceSha256', 'loginProofEvidenceSha256', 'loginIdentityDigest',
    'loginCatalogDigest', 'databaseStateDigest', 'publicBeforeDigest', 'envSha256',
    'environmentDigest', 'apiFingerprint', 'backupFile', 'evidenceFile'];
  exactKeys(binding, keys, 'catalog_activation_binding_invalid');
  check(commitPattern.test(binding.opsCommit ?? '') && binding.loginProofOpsCommit === requiredLoginProofOpsCommit
    && keys.filter((key) => key.endsWith('Sha256') || key.endsWith('Digest') || key === 'apiFingerprint')
      .every((key) => digestPattern.test(binding[key] ?? ''))
    && binding.databasePreparationEvidenceSha256 === requiredDatabasePreparationEvidenceSha256
    && binding.loginProofEvidenceSha256 === requiredLoginProofEvidenceSha256
    && [binding.backupFile, binding.evidenceFile].every((path) => typeof path === 'string'
      && isAbsolute(path) && !path.startsWith(`${repositoryRoot}/`) && !path.includes('..'))
    && resolve(binding.backupFile) !== resolve(binding.evidenceFile),
  'catalog_activation_binding_invalid');
  return Object.freeze({ ...binding });
}

export function assertCatalogActivationManifest(manifest) {
  check(manifest?.kind === catalogActivationManifestKind && manifest.schemaVersion === 1
    && digestPattern.test(manifest.apiContainerId ?? ''), 'catalog_activation_manifest_invalid');
  const { fixtureBinding, apiContainerId, ...base } = manifest;
  const validated = assertGoogleRegistrationRuntimeManifest({ ...base, apiContainerId,
    kind: 'sit-staging-google-registration-runtime-manifest' });
  const binding = assertBinding(fixtureBinding);
  check(new Set([validated.envFile, binding.backupFile, binding.evidenceFile].map((path) => resolve(path))).size === 3,
    'catalog_activation_manifest_paths_alias');
  return Object.freeze({ ...validated, kind: catalogActivationManifestKind,
    fixtureBinding: binding });
}

async function assertPrivateTarget(filePath, code) {
  safeExternalPath(filePath, code);
  const parent = await lstat(dirname(filePath)).catch(() => fail(`${code}_parent`));
  check(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o777) === 0o700
    && (process.getuid?.() === undefined || parent.uid === process.getuid())
    && (process.getgid?.() === undefined || parent.gid === process.getgid()), `${code}_parent`);
  try { await lstat(filePath); fail(`${code}_exists`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function readEnv(manifest) {
  const content = readStablePrivateFile(manifest.envFile, { expectedMode: 0o600,
    expectedUid: manifest.envUid, expectedGid: manifest.envGid, minBytes: 1,
    code: 'catalog_activation_env_metadata_invalid' });
  const values = parseEnvContent(content);
  check(['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME'].every((name) => !Object.hasOwn(values, name)),
    'catalog_activation_env_identity_override_forbidden');
  return Object.freeze({ content, values });
}

async function commandJson(command, args, phase, commandEnv) {
  return parseJson((await command('docker', args, { phase, env: commandEnv })).stdout, `${phase}_invalid`);
}

function assertInventory({ manifest, api, database, volume, network, provider, uploads, image }) {
  check(api.Id === manifest.apiContainerId && api.Name === `/${manifest.apiContainer}` && api.State?.Running === true
    && corsContainerFingerprint(api) === manifest.fixtureBinding.apiFingerprint
    && api.Image === image.Id && [manifest.image, `${manifest.image}@${manifest.imageDigest}`].includes(api.Config?.Image)
    && database.Name === `/${manifest.databaseContainer}` && database.State?.Running === true
    && volume.Name === manifest.databaseVolume && network.Name === manifest.network && network.Internal === true
    && provider.Name === manifest.providerNetwork && uploads.Name === manifest.uploadsVolume
    && image.Config?.Labels?.['org.opencontainers.image.revision'] === manifest.runtimeRevision
    && image.Config?.User === 'shareittoo'
    && image.RepoDigests?.some((entry) => entry.endsWith(`@${manifest.imageDigest}`)),
  'catalog_activation_runtime_inventory_invalid');
  const networks = api.NetworkSettings?.Networks ?? {};
  check(JSON.stringify(Object.keys(networks).sort()) === JSON.stringify([manifest.network, manifest.providerNetwork].sort())
    && networks[manifest.network]?.NetworkID === network.Id
    && networks[manifest.providerNetwork]?.NetworkID === provider.Id
    && !Object.values(api.HostConfig?.PortBindings ?? {}).flat().some(Boolean)
    && !Object.values(api.NetworkSettings?.Ports ?? {}).flat().some(Boolean),
  'catalog_activation_network_inventory_invalid');
  return Object.freeze({ [manifest.network]: network.Id, [manifest.providerNetwork]: provider.Id });
}

async function databaseState(command, manifest, phase, commandEnv) {
  const result = await command('docker', ['exec', manifest.databaseContainer, 'psql', '-X',
    '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName,
    '-Atc', catalogActivationStateSql], { phase, env: commandEnv });
  return result.stdout;
}

async function seedState(command, manifest, phase, commandEnv) {
  const result = await command('docker', ['exec', manifest.databaseContainer, 'psql', '-X',
    '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName,
    '-Atc', fixtureSeedReadbackSql], { phase, env: commandEnv });
  return result.stdout;
}

function captureSeedState(stdout, bootstrapRunIdSha256) {
  const parts = String(stdout ?? '').trim().split('|');
  check(parts.length === 8 && parts.slice(1, 4).every((value) => digestPattern.test(value))
    && parts[3] === bootstrapRunIdSha256, 'catalog_activation_seed_readback_invalid');
  const binding = Object.freeze({ seedScopeDigest: parts[1], seedSnapshotDigest: parts[2],
    bootstrapRunIdSha256 });
  assertFixtureSeedReadback(stdout, binding);
  return binding;
}

async function databaseIntegrity(command, manifest, phase, commandEnv) {
  const schema = await command('docker', ['exec', manifest.databaseContainer, 'psql', '-X',
    '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc',
    `SELECT count(*) || '|' || (SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1)
      FROM schema_migrations`], { phase: `${phase}_schema`, env: commandEnv });
  check(String(schema.stdout ?? '').trim() === `98|${requiredTerminalMigration}`,
    'catalog_activation_schema_readback_invalid');
  const ledger = await command('docker', ['exec', manifest.databaseContainer, 'sh', '-c',
    `set -eu; psql -X --set ON_ERROR_STOP=1 -U '${manifest.databaseUser}' -d '${manifest.databaseName}' -Atc "SELECT string_agg(name || '|' || checksum, E'\\n' ORDER BY name) FROM schema_migrations" | sha256sum | awk '{print $1}'`],
  { phase: `${phase}_ledger`, env: commandEnv });
  check(String(ledger.stdout ?? '').trim() === requiredMigrationLedger,
    'catalog_activation_ledger_readback_invalid');
}

async function publicState(command, containerId, visible, phase, commandEnv) {
  const result = await command('docker', ['exec', containerId, 'node', '--input-type=module', '-e',
    catalogActivationPublicScript(visible)], { phase, env: commandEnv });
  return assertCatalogActivationPublic(result.stdout, visible);
}

async function collectPreflight({ manifest, sourceCommit, evidenceFile, command, commandEnv }) {
  check(sourceCommit === manifest.fixtureBinding.opsCommit, 'catalog_activation_source_binding_invalid');
  check(!evidenceFile || evidenceFile === manifest.fixtureBinding.evidenceFile,
    'catalog_activation_evidence_path_invalid');
  const env = readEnv(manifest);
  check(hash(env.content) === manifest.fixtureBinding.envSha256, 'catalog_activation_env_digest_invalid');
  await assertPrivateTarget(manifest.fixtureBinding.backupFile, 'catalog_activation_backup_target_invalid');
  if (evidenceFile) await assertPrivateTarget(evidenceFile, 'catalog_activation_evidence_target_invalid');
  const inspect = (target, phase) => commandJson(command, ['inspect', '--format', '{{json .}}', target], phase, commandEnv);
  const api = await inspect(manifest.apiContainer, 'catalog_activation_current_api_inspect');
  const database = await inspect(manifest.databaseContainer, 'catalog_activation_current_database_inspect');
  const volume = await inspect(manifest.databaseVolume, 'catalog_activation_current_database_volume_inspect');
  const network = await inspect(manifest.network, 'catalog_activation_current_network_inspect');
  const provider = await inspect(manifest.providerNetwork, 'catalog_activation_current_provider_network_inspect');
  const uploads = await inspect(manifest.uploadsVolume, 'catalog_activation_current_uploads_volume_inspect');
  const image = await commandJson(command, ['image', 'inspect', '--format', '{{json .}}', manifest.image],
    'catalog_activation_current_image_inspect', commandEnv);
  const networkIds = assertInventory({ manifest, api, database, volume, network, provider, uploads, image });
  const apiValues = envMap(api.Config?.Env);
  check(digest(apiValues) === manifest.fixtureBinding.environmentDigest,
    'catalog_activation_environment_digest_invalid');
  for (const [name, value] of Object.entries(env.values)) {
    check(apiValues[name] === value, 'catalog_activation_file_runtime_drift');
  }
  assertActivationEnvironment(apiValues, manifest.runtimeRevision);
  await databaseIntegrity(command, manifest, 'catalog_activation_database_integrity', commandEnv);
  assertFixtureSeedReadback(await seedState(command, manifest, 'catalog_activation_seed_readback', commandEnv),
    manifest.fixtureBinding);
  const state = assertCatalogActivationState(await databaseState(command, manifest,
    'catalog_activation_database_state_readback', commandEnv), manifest.fixtureBinding);
  const publicBefore = await publicState(command, manifest.apiContainerId, false,
    'catalog_activation_public_before_readback', commandEnv);
  check(digest(publicBefore) === manifest.fixtureBinding.publicBeforeDigest,
    'catalog_activation_public_before_drift');
  const candidate = await command('docker', ['exec', manifest.apiContainerId, 'node', '--input-type=module', '-e',
    `process.env.${catalogActivationKey}='true';${catalogActivationConfigScript(true)}`],
  { phase: 'catalog_activation_candidate_config_import', env: commandEnv });
  assertCatalogActivationConfig(candidate.stdout, true);
  const sealedName = `${manifest.apiContainer}-web-catalog-rollback-${manifest.apiContainerId.slice(0, 12)}`;
  const conflict = await command('docker', ['ps', '--all', '--filter', `name=^/${sealedName}$`, '--format', '{{.Names}}'],
    { phase: 'catalog_activation_sealed_name_conflict', env: commandEnv });
  check(!String(conflict.stdout ?? '').trim(), 'catalog_activation_rollback_name_conflict');
  const primaryNetworkMode = api.HostConfig?.NetworkMode;
  check([manifest.network, network.Id].includes(primaryNetworkMode), 'catalog_activation_primary_network_invalid');
  buildReplacementCreateArgs({ manifest, envFile: manifest.envFile, currentApi: api, networkName: primaryNetworkMode });
  return Object.freeze({ env, api, state, publicBefore, networkIds, sealedName, primaryNetworkMode,
    proposal: Object.freeze({ values: Object.freeze({ [catalogActivationKey]: 'true' }) }),
    phases: Object.freeze(['catalog_activation_current_api_inspect', 'catalog_activation_current_database_inspect',
      'catalog_activation_current_database_volume_inspect', 'catalog_activation_current_network_inspect',
      'catalog_activation_current_provider_network_inspect', 'catalog_activation_current_uploads_volume_inspect',
      'catalog_activation_current_image_inspect', 'catalog_activation_database_integrity_schema',
      'catalog_activation_database_integrity_ledger', 'catalog_activation_seed_readback',
      'catalog_activation_database_state_readback',
      'catalog_activation_public_before_readback', 'catalog_activation_candidate_config_import',
      'catalog_activation_sealed_name_conflict']) });
}

export async function prepareCatalogActivationManifest({
  sourceCommit, bootstrapManifestBytes, bootstrapManifestSha256,
  databaseEvidenceBytes, databaseEvidenceSha256,
  loginEvidenceBytes, loginEvidenceSha256,
  backupFile, evidenceFile, outputFile, command = runCommand, commandEnv = process.env,
  envFile = '/docker/shareittoo/ops/green.env', writeOutput = writeExclusivePrivateFile,
  testOnlyEvidenceHash = hash,
} = {}) {
  check(testOnlyEvidenceHash === hash || command !== runCommand,
    'catalog_activation_test_hash_seam_forbidden');
  check(commitPattern.test(sourceCommit ?? ''), 'catalog_activation_prepare_source_invalid');
  check(databaseEvidenceSha256 === requiredDatabasePreparationEvidenceSha256
    && loginEvidenceSha256 === requiredLoginProofEvidenceSha256, 'catalog_activation_prepare_evidence_hash_invalid');
  check(new Set([resolve(backupFile ?? ''), resolve(evidenceFile ?? ''), resolve(outputFile ?? ''),
    resolve(envFile ?? '')]).size === 4, 'catalog_activation_prepare_output_paths_alias');
  const bootstrap = validateCatalogActivationBootstrap(bootstrapManifestBytes, bootstrapManifestSha256);
  validateEvidenceBytes(databaseEvidenceBytes, databaseEvidenceSha256,
    'catalog_activation_database_evidence', testOnlyEvidenceHash);
  const loginEvidence = validateEvidenceBytes(loginEvidenceBytes, loginEvidenceSha256,
    'catalog_activation_login_evidence', testOnlyEvidenceHash);
  safeExternalPath(envFile, 'catalog_activation_prepare_env_path_invalid');
  for (const [path, code] of [[backupFile, 'catalog_activation_prepare_backup_target_invalid'],
    [evidenceFile, 'catalog_activation_prepare_evidence_target_invalid'],
    [outputFile, 'catalog_activation_prepare_output_target_invalid']]) await assertPrivateTarget(path, code);
  check(backupFile.endsWith('.env'), 'catalog_activation_prepare_backup_target_invalid');
  const envMetadata = await lstat(envFile);
  check(envMetadata.isFile() && !envMetadata.isSymbolicLink() && (envMetadata.mode & 0o777) === 0o600,
    'catalog_activation_prepare_env_metadata_invalid');
  const envContent = readStablePrivateFile(envFile, { expectedMode: 0o600, expectedUid: envMetadata.uid,
    expectedGid: envMetadata.gid, minBytes: 1, code: 'catalog_activation_prepare_env_metadata_invalid' });
  const envValues = parseEnvContent(envContent);
  check(['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME'].every((name) => !Object.hasOwn(envValues, name)),
    'catalog_activation_env_identity_override_forbidden');
  const inspect = (target, phase) => commandJson(command, ['inspect', '--format', '{{json .}}', target], phase, commandEnv);
  const api = await inspect(apiContainer, 'catalog_activation_prepare_api_inspect');
  const database = await inspect(databaseContainer, 'catalog_activation_prepare_database_inspect');
  const volume = await inspect(databaseVolume, 'catalog_activation_prepare_database_volume_inspect');
  const network = await inspect(networkName, 'catalog_activation_prepare_network_inspect');
  const provider = await inspect(providerNetwork, 'catalog_activation_prepare_provider_network_inspect');
  const uploads = await inspect(uploadsVolume, 'catalog_activation_prepare_uploads_volume_inspect');
  const image = await commandJson(command, ['image', 'inspect', '--format', '{{json .}}', api.Image],
    'catalog_activation_prepare_image_inspect', commandEnv);
  const runtimeRevision = image.Config?.Labels?.['org.opencontainers.image.revision'];
  const tags = [...new Set((image.RepoTags ?? []).filter((tag) => tag.endsWith(`:${runtimeRevision}`)))];
  const digests = [...new Set((image.RepoDigests ?? []).map((entry) => entry.split('@').at(-1))
    .filter((value) => /^sha256:[a-f0-9]{64}$/u.test(value)))];
  check(api.Id?.length === 64 && api.Name === `/${apiContainer}` && api.State?.Running === true
    && database.Name === `/${databaseContainer}` && database.State?.Running === true
    && volume.Name === databaseVolume && network.Name === networkName && network.Internal === true
    && provider.Name === providerNetwork && uploads.Name === uploadsVolume && api.Image === image.Id
    && commitPattern.test(runtimeRevision ?? '') && tags.length === 1 && digests.length === 1,
  'catalog_activation_prepare_inventory_invalid');
  const apiValues = envMap(api.Config?.Env);
  for (const [name, value] of Object.entries(envValues)) {
    check(apiValues[name] === value, 'catalog_activation_prepare_file_runtime_drift');
  }
  assertActivationEnvironment(apiValues, runtimeRevision);
  const bootstrapRunIdSha256 = hash(bootstrap.runId);
  validateLoginProofEvidence(loginEvidence, { runtimeRevision, imageDigest: digests[0],
    bootstrapManifestSha256, bootstrapRunIdSha256 });
  await databaseIntegrity(command, { databaseContainer, databaseUser: 'shareittoo_green',
    databaseName: 'shareittoo_green' }, 'catalog_activation_prepare_database_integrity', commandEnv);
  const databaseManifest = { databaseContainer, databaseUser: 'shareittoo_green',
    databaseName: 'shareittoo_green' };
  const seed = captureSeedState(await seedState(command, databaseManifest,
    'catalog_activation_prepare_seed_readback', commandEnv), bootstrapRunIdSha256);
  const state = assertCatalogActivationState(await databaseState(command, {
    databaseContainer, databaseUser: 'shareittoo_green', databaseName: 'shareittoo_green',
  }, 'catalog_activation_prepare_database_state', commandEnv), {
    loginIdentityDigest: loginEvidence.identityDigest, loginCatalogDigest: loginEvidence.catalogStateDigest,
  });
  const publicBefore = await publicState(command, api.Id, false, 'catalog_activation_prepare_public_before', commandEnv);
  const candidate = await command('docker', ['exec', api.Id, 'node', '--input-type=module', '-e',
    `process.env.${catalogActivationKey}='true';${catalogActivationConfigScript(true)}`],
  { phase: 'catalog_activation_prepare_candidate_import', env: commandEnv });
  assertCatalogActivationConfig(candidate.stdout, true);
  const mounts = (api.Mounts ?? []).map((mount) => ({ type: mount.Type,
    name: mount.Type === 'volume' ? mount.Name : String(mount.Destination).split('/').at(-1),
    source: mount.Source, destination: mount.Destination, readOnly: mount.RW === false }));
  const safetyEnv = { DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'true',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0' };
  const manifest = {
    kind: catalogActivationManifestKind, schemaVersion: 1, apiContainerId: api.Id,
    environment: 'staging', composeProject: 'sit-green', apiContainer,
    databaseContainer, databaseVolume, databaseName: 'shareittoo_green', databaseUser: 'shareittoo_green',
    network: networkName, providerNetwork, uploadsVolume, image: tags[0], runtimeRevision,
    imageDigest: digests[0], envFile, envUid: envMetadata.uid, envGid: envMetadata.gid, mounts, safetyEnv,
    label: { key: 'com.shareittoo.sit.green', value: 'true' }, fixtureBinding: {
      opsCommit: sourceCommit, loginProofOpsCommit: requiredLoginProofOpsCommit,
      bootstrapManifestSha256, bootstrapRunIdSha256,
      seedScopeDigest: seed.seedScopeDigest, seedSnapshotDigest: seed.seedSnapshotDigest,
      activationRunDigest: state.activationRunDigest,
      databasePreparationEvidenceSha256: databaseEvidenceSha256,
      loginProofEvidenceSha256: loginEvidenceSha256, loginIdentityDigest: loginEvidence.identityDigest,
      loginCatalogDigest: loginEvidence.catalogStateDigest, databaseStateDigest: digest(state),
      publicBeforeDigest: digest(publicBefore), envSha256: hash(envContent),
      environmentDigest: digest(apiValues), apiFingerprint: corsContainerFingerprint(api), backupFile, evidenceFile,
    },
  };
  assertCatalogActivationManifest(manifest);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeOutput(outputFile, bytes, { mode: 0o600, uid: process.getuid(), gid: process.getgid() });
  return Object.freeze({ status: 'catalog-activation-manifest-prepared-read-only',
    manifestSha256: hash(bytes), opsCommit: sourceCommit, runtimeRevision,
    loginProofOpsCommit: requiredLoginProofOpsCommit,
    bootstrapManifestSha256, bootstrapRunIdSha256,
    seedScopeDigest: seed.seedScopeDigest, seedSnapshotDigest: seed.seedSnapshotDigest,
    activationRunDigest: state.activationRunDigest,
    databasePreparationEvidenceSha256: databaseEvidenceSha256,
    loginProofEvidenceSha256: loginEvidenceSha256, envSha256: hash(envContent),
    changedEnvironmentKeys: [catalogActivationKey], syntheticCatalogEnabled: false });
}

export function readCatalogActivationManifest(filePath, expectedSha256) {
  safeExternalPath(filePath, 'catalog_activation_manifest_path_invalid');
  const bytes = readStablePrivateFile(filePath, { encoding: null, expectedMode: 0o600,
    expectedUid: process.getuid?.(), expectedGid: process.getgid?.(), minBytes: 1, maxBytes: 128 * 1024,
    code: 'catalog_activation_manifest_metadata_invalid' });
  check(digestPattern.test(expectedSha256 ?? '') && hash(bytes) === expectedSha256,
    'catalog_activation_manifest_digest_invalid');
  return assertCatalogActivationManifest(parseJson(bytes, 'catalog_activation_manifest_json_invalid'));
}

export async function runCatalogActivation({ manifest, bootstrapManifestBytes, databaseEvidenceBytes,
  loginEvidenceBytes, sourceCommit, evidenceFile,
  execute = false, confirmSource, confirmRun, command = runCommand, commandEnv = process.env,
  testOnlyEvidenceHash = hash } = {}) {
  check(testOnlyEvidenceHash === hash || command !== runCommand,
    'catalog_activation_test_hash_seam_forbidden');
  const target = assertCatalogActivationManifest(manifest);
  const bootstrap = validateCatalogActivationBootstrap(bootstrapManifestBytes,
    target.fixtureBinding.bootstrapManifestSha256);
  validateEvidenceBytes(databaseEvidenceBytes, target.fixtureBinding.databasePreparationEvidenceSha256,
    'catalog_activation_database_evidence', testOnlyEvidenceHash);
  validateLoginProofEvidence(validateEvidenceBytes(loginEvidenceBytes,
    target.fixtureBinding.loginProofEvidenceSha256, 'catalog_activation_login_evidence', testOnlyEvidenceHash), {
    runtimeRevision: target.runtimeRevision, imageDigest: target.imageDigest,
    bootstrapManifestSha256: target.fixtureBinding.bootstrapManifestSha256,
    bootstrapRunIdSha256: target.fixtureBinding.bootstrapRunIdSha256,
  });
  const run = async () => {
    const preflight = await collectPreflight({ manifest: target, sourceCommit, evidenceFile, command, commandEnv });
    if (!execute) {
      check(confirmSource === undefined && confirmRun === undefined
        && commandEnv.STAGING_WEB_FIXTURE_CATALOG_EXECUTE === undefined
        && commandEnv.STAGING_WEB_FIXTURE_CATALOG_CONFIRM_SOURCE === undefined
        && commandEnv.STAGING_WEB_FIXTURE_CATALOG_CONFIRM_RUN === undefined,
      'catalog_activation_execute_not_authorized');
      return Object.freeze({ status: 'catalog-activation-preflight-passed-no-mutation', executed: false,
        firstIrreversiblePhase: 'write_protected_catalog_activation_backup', opsCommit: sourceCommit,
        bootstrapManifestSha256: target.fixtureBinding.bootstrapManifestSha256,
        bootstrapRunIdSha256: target.fixtureBinding.bootstrapRunIdSha256,
        databasePreparationEvidenceSha256: target.fixtureBinding.databasePreparationEvidenceSha256,
        loginProofEvidenceSha256: target.fixtureBinding.loginProofEvidenceSha256,
        changedEnvironmentKeys: [catalogActivationKey], syntheticCatalogEnabled: false,
        publicCatalogCount: 0, activeSessions: 0, activeRefreshTokens: 0, commands: preflight.phases });
    }
    check(commandEnv.STAGING_WEB_FIXTURE_CATALOG_EXECUTE === '1'
      && commandEnv.STAGING_WEB_FIXTURE_CATALOG_CONFIRM_SOURCE === sourceCommit
      && commandEnv.STAGING_WEB_FIXTURE_CATALOG_CONFIRM_RUN === bootstrap.runId
      && confirmSource === sourceCommit && confirmRun === bootstrap.runId,
    'catalog_activation_explicit_confirmation_required');
    check(evidenceFile === target.fixtureBinding.evidenceFile, 'catalog_activation_evidence_path_required');
    return runFixtureEnvReplacement({ manifest: target, preflight, sourceCommit, evidenceFile,
      changedKeys: [catalogActivationKey], command, commandEnv,
      preMutationReadback: async () => {
        await databaseIntegrity(command, target, 'catalog_activation_pre_mutation_database_integrity', commandEnv);
        assertFixtureSeedReadback(await seedState(command, target,
          'catalog_activation_pre_mutation_seed_readback', commandEnv), target.fixtureBinding);
        assertCatalogActivationState(await databaseState(command, target,
          'catalog_activation_pre_mutation_database_readback', commandEnv), target.fixtureBinding);
        await publicState(command, preflight.api.Id, false,
          'catalog_activation_pre_mutation_public_readback', commandEnv);
      },
      replacementReadback: async ({ replacementId }) => {
        const config = await command('docker', ['exec', replacementId, 'node', '--input-type=module', '-e',
          catalogActivationConfigScript(true)], { phase: 'catalog_activation_replacement_config_readback', env: commandEnv });
        assertCatalogActivationConfig(config.stdout, true);
        await publicState(command, replacementId, true,
          'catalog_activation_replacement_public_readback', commandEnv);
      },
      finalReadback: async ({ replacementId }) => {
        await databaseIntegrity(command, target, 'catalog_activation_final_database_integrity', commandEnv);
        assertFixtureSeedReadback(await seedState(command, target,
          'catalog_activation_final_seed_readback', commandEnv), target.fixtureBinding);
        assertCatalogActivationState(await databaseState(command, target,
          'catalog_activation_final_database_readback', commandEnv), target.fixtureBinding);
        await publicState(command, replacementId, true,
          'catalog_activation_final_public_readback', commandEnv);
      },
      rollbackReadback: async () => {
        await databaseIntegrity(command, target, 'catalog_activation_rollback_database_integrity', commandEnv);
        assertFixtureSeedReadback(await seedState(command, target,
          'catalog_activation_rollback_seed_readback', commandEnv), target.fixtureBinding);
        assertCatalogActivationState(await databaseState(command, target,
          'catalog_activation_rollback_database_readback', commandEnv), target.fixtureBinding);
        const config = await command('docker', ['exec', preflight.api.Id, 'node', '--input-type=module', '-e',
          catalogActivationConfigScript(false)], { phase: 'catalog_activation_rollback_config_readback', env: commandEnv });
        assertCatalogActivationConfig(config.stdout, false);
        await publicState(command, preflight.api.Id, false,
          'catalog_activation_rollback_public_readback', commandEnv);
      },
      buildResult: ({ replacementId, appliedEnv }) => ({
        status: 'staging-web-synthetic-catalog-activated-noncontractual', executed: true,
        opsCommit: sourceCommit, runtimeRevision: target.runtimeRevision, imageDigest: target.imageDigest,
        loginProofOpsCommit: target.fixtureBinding.loginProofOpsCommit,
        bootstrapManifestSha256: target.fixtureBinding.bootstrapManifestSha256,
        bootstrapRunIdSha256: target.fixtureBinding.bootstrapRunIdSha256,
        seedScopeDigest: target.fixtureBinding.seedScopeDigest,
        seedSnapshotDigest: target.fixtureBinding.seedSnapshotDigest,
        activationRunDigest: target.fixtureBinding.activationRunDigest,
        databasePreparationEvidenceSha256: target.fixtureBinding.databasePreparationEvidenceSha256,
        loginProofEvidenceSha256: target.fixtureBinding.loginProofEvidenceSha256,
        databaseStateDigest: target.fixtureBinding.databaseStateDigest,
        changedEnvironmentKeys: [catalogActivationKey], syntheticCatalogEnabled: true,
        publicCatalogCount: 1, catalogClass: 'synthetic_noncontractual_catalog_only',
        bookingAllowed: false, paymentAllowed: false, registrationClosed: true,
        paymentMemory: true, stripeLivemode: false, externalProvidersEnabled: false,
        activeSessions: 0, activeRefreshTokens: 0,
        envSha256Before: hash(preflight.env.content), envSha256After: hash(appliedEnv),
        backupSha256: hash(preflight.env.content), backupMode: '0600', backupRetained: true,
        sealedName: preflight.sealedName, originalContainerId: preflight.api.Id,
        replacementContainerId: replacementId,
        rollbackContract: 'failure restores exact old env and immutable original API before reporting success=false',
      }),
      buildEvidence: ({ result }) => ({ kind: 'sit-staging-web-fixture-catalog-activation', schemaVersion: 1,
        schemaMigration: requiredTerminalMigration, migrationLedger: requiredMigrationLedger, ...result }),
    });
  };
  return withCorsTransitionLock(target, execute, run);
}

export const sanitizeCatalogActivationError = sanitizeFixtureEnvError;

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stderr.write('{"status":"failed","code":"use_activate_staging_web_fixture_catalog_entrypoint"}\n');
  process.exitCode = 1;
}
