import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmodSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertGreenCleanup,
  assertGreenContainerInventory,
  assertGreenProtectedEnvironment,
  assertGreenRuntimeEnvironmentReadback,
  assertGreenRuntimeConfig,
  assertGreenRuntimeImage,
  assertGreenImageReadback,
  assertGreenRuntimeReadbacks,
  assertGreenFinalContainerReadback,
  assertGreenSuccessorPreStartReadback,
  summarizeGreenFinalContainerReadback,
  assertGreenTargetManifest,
  buildGreenPromotionCommands,
  buildGreenPromotionPlan,
  greenTarget,
  greenWebCorsOrigins,
  greenBroadPromotionEnvironment,
  greenPublicFixtureProfile,
  greenSyntheticCatalogItemKeys,
  greenSyntheticCatalogProjection,
  greenSuccessorRuntime,
  assertGreenSyntheticCatalogPublicReadback,
  summarizeGreenSyntheticCatalogPayload,
  runGreenSyntheticCatalogProbe,
  greenDatabaseStateBaseline,
  greenDatabaseStateReadbackSql,
  assertGreenDatabaseStateReadback,
  greenTechnicalSandboxEnvironment,
  greenTechnicalSandboxHealth,
  assertGreenTechnicalSandboxProviderOff,
  assertGreenPublicFixtureEnvironment,
  assertGreenRetainedSealedInventory,
  assertGreenRetainedSealedInventories,
  sanitizeGreenEvidence,
  normalizedGreenTargetDigest,
  assertGreenCommandBindings,
  assertGreenControlExecutables,
  greenRequiredControlExecutables,
  assertGreenEvidenceArtifactFamilyAvailable,
  writeGreenEvidence,
  runGreenEmergencyCleanup,
  runGreenForwardRecovery,
  runGreenCommandWithBufferInput,
  runGreenPromotion,
  greenReadOnlyPreflightCommands,
  parseGreenPromotionArguments,
  syntheticSandboxCredentialFilePath,
  containsForbiddenGreenTargetIdentifier,
} from '../ops/green_staging_promotion.mjs';
import { readStagingAccessConfiguration, stagingAnonymousPathAllowed } from '../src/staging_access_gate.js';
import { readListingAiGatewayConfiguration } from '../src/listing_ai_gateway_config.js';
import { isMfaProbeContainer, runMfaProbe } from '../ops/staging_controlled_acceptance.mjs';
import { summarizeGreenAllowedIds } from '../ops/green_auth_profile.mjs';
import { dedicatedFixture } from '../ops/staging_web_fixture_bootstrap.mjs';

const runtimeCommit = greenSuccessorRuntime.commit;
const runtimeImageDigest = greenSuccessorRuntime.imageDigest;
const opsCommit = '8fecd57018ab10a0c6733531539472e6179a02db';
const targetNetworkId = '4'.repeat(64);
const providerNetworkId = '5'.repeat(64);
const isolatedNetworkId = '1'.repeat(64);
const isolatedDatabaseId = '2'.repeat(64);
const candidateId = '3'.repeat(64);
const enrolledGoogleId = 'synthetic-enrolled-google';
const enrolledAllowedIds = `synthetic_sandbox_user_pilot_20260919,synthetic-owner,synthetic-renter,${enrolledGoogleId}`;
const targetManifest = {
  kind: 'sit-green-staging-target', schemaVersion: 4, composeProject: 'sit-green',
  greenLabel: 'com.shareittoo.sit.green=true', runId: greenTarget.runId,
  apiContainer: greenTarget.apiContainer, databaseContainer: greenTarget.databaseContainer,
  databaseVolume: greenTarget.databaseVolume, network: greenTarget.network,
  providerNetwork: greenTarget.providerNetwork, uploadsVolume: greenTarget.uploadsVolume,
  networkInternal: true, sourceSchema: 98, currentSchema: 98,
  sourceLedgerDigest: greenTarget.sourceLedgerDigest, currentLedgerDigest: greenTarget.currentLedgerDigest,
  prePromotionImage: greenTarget.prePromotionImage, prePromotionImageDigest: greenTarget.prePromotionImageDigest, sealedApiContainer: greenTarget.sealedApiContainer,
  retainedSealed: greenTarget.retainedSealed.map((descriptor) => ({ ...descriptor })),
  authProfile: {
    kind: 'google-post-enrollment', schemaVersion: 1,
    sourceImageDigest: greenTarget.prePromotionImageDigest,
    ...summarizeGreenAllowedIds(enrolledAllowedIds),
    googleUserIdDigest: crypto.createHash('sha256').update(enrolledGoogleId).digest('hex'),
  },
};
targetManifest.targetDigest = normalizedGreenTargetDigest(targetManifest);
const prePromotionImageReference = `${greenTarget.prePromotionImage}@${greenTarget.prePromotionImageDigest}`;
function enrolledTargetManifest() {
  const manifest = {
    ...targetManifest,
    schemaVersion: 4,
    authProfile: {
      kind: 'google-post-enrollment', schemaVersion: 1,
      sourceImageDigest: targetManifest.prePromotionImageDigest,
      ...summarizeGreenAllowedIds(enrolledAllowedIds),
      googleUserIdDigest: crypto.createHash('sha256').update(enrolledGoogleId).digest('hex'),
    },
  };
  manifest.targetDigest = normalizedGreenTargetDigest(manifest);
  return manifest;
}
const config = {
  environment: 'test', envFile: '/docker/shareittoo/staging-secrets/green.env',
  envNames: ['NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'DATABASE_URL', 'JWT_SECRET', 'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE', 'MAIL_TRANSPORT', 'PUSH_TRANSPORT', 'IDENTITY_VERIFICATION_TRANSPORT', 'SIT_LISTING_AI_PROVIDER', 'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', 'SIT_STAGING_ACCESS_GATE_ENABLED', 'SIT_STAGING_ALLOWED_USER_IDS', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'SIT_STAGING_SYNTHETIC_CATALOG_ENABLED', 'SIT_STAGING_PUBLIC_LISTING_IDS', 'SIT_STAGING_PUBLIC_UPLOAD_NAMES', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM', 'FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_VERIFICATION_ENABLED', 'SIT_STAGING_COMPOSE_PROJECT', 'SIT_LISTING_AI_BUDGET_CENTS', 'ENABLE_STAGING_STRIPE', 'TECHNICAL_SANDBOX_ENABLED', 'TECHNICAL_SANDBOX_KILL_SWITCH', 'TECHNICAL_SANDBOX_ACCOUNT_ID', 'TECHNICAL_SANDBOX_USER_IDS', 'TECHNICAL_SANDBOX_AUTHORIZATION_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT', 'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE', 'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE', 'SIT_STAGING_PILOT_ID', 'SYNTHETIC_SANDBOX_PASSWORD_FILE'],
  mfaFile: '/docker/shareittoo/staging-secrets/mfa-encryption-key',
  firebaseFile: '/docker/shareittoo/staging-secrets/firebase.json',
  technicalSandboxKeyFile: '/docker/shareittoo/staging-secrets/technical-sandbox-key',
  technicalSandboxWebhookFile: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook',
  syntheticUserId: 'synthetic_sandbox_user_pilot_20260919', paymentTransport: 'memory',
  stripeLiveMode: false, mailTransport: 'memory', pushTransport: 'memory', identityTransport: 'memory', listingAiProvider: 'on_device',
  listingAiExternalAllowed: false, listingAiBudgetCents: 0, accessGateDigest: 'b'.repeat(64), providerConfigDigest: 'c'.repeat(64),
  mounts: [
    { source: '/docker/shareittoo/staging-secrets/mfa-encryption-key', destination: '/run/secrets/mfa-encryption-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/firebase.json', destination: '/run/secrets/firebase-service-account.json', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-key', destination: '/run/secrets/technical-sandbox-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook', destination: '/run/secrets/technical-sandbox-webhook', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/uploads', destination: '/data/uploads', readOnly: false },
  ],
};

function migrationLedgerThrough(schema) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'migrations');
  const rows = readdirSync(root).filter((name) => /^\d+_.+\.up\.sql$/u.test(name) && Number(name.slice(0, 3)) <= schema).sort()
    .map((name) => `${name}|${crypto.createHash('sha256').update(readFileSync(path.join(root, name))).digest('hex')}`);
  return `${rows.join('\n')}\n`;
}

const sourceMigrationLedger = migrationLedgerThrough(98);
const currentMigrationLedger = migrationLedgerThrough(98);
const emptyFindingFingerprint = JSON.stringify({ paymentRecoveryNeedsReview: [], supportNextUpdateOverdue: [] });
const targetContainerSet = `${greenTarget.apiContainer}\t\t\ttrue\t${greenTarget.runId}\n${greenTarget.databaseContainer}\t\t\ttrue\t\n${greenTarget.retainedSealed.map((descriptor) => `${descriptor.name}\t\t\ttrue\t${descriptor.runId}`).join('\n')}\n`;
const sourceMounts = [
  { destination: '/data/uploads', type: 'volume', source: null, volume: greenTarget.uploadsVolume, readOnly: false },
  { destination: '/run/secrets/firebase-service-account.json', type: 'bind', source: config.firebaseFile, volume: null, readOnly: true },
  { destination: '/run/secrets/mfa-encryption-key', type: 'bind', source: config.mfaFile, volume: null, readOnly: true },
];
const finalMounts = sourceMounts.filter((mount) => mount.destination === '/data/uploads'
  || mount.destination === '/run/secrets/firebase-service-account.json'
  || mount.destination === '/run/secrets/mfa-encryption-key').map((mount) => ({
  Destination: mount.destination,
  Type: mount.type,
  ...(mount.type === 'bind' ? { Source: mount.source } : { Name: mount.volume }),
  RW: !mount.readOnly,
}));
const greenFixtureEnvironment = Object.freeze({
  SIT_STAGING_PUBLIC_LISTING_IDS: dedicatedFixture.listing,
  SIT_STAGING_PUBLIC_UPLOAD_NAMES: dedicatedFixture.upload,
});
const greenRuntimeEnvEntries = Object.entries({ ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, ...greenFixtureEnvironment, CORS_ORIGINS: greenWebCorsOrigins, FIREBASE_AUTH_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: enrolledAllowedIds }).map(([name, value]) => `${name}=${value}`);
const originalApiIdentityRecord = {
  Id: 'api-original-id',
  State: { Running: false },
  Config: { Image: greenTarget.prePromotionImage, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['DATABASE_URL=postgres://shareittoo_green@green-db/shareittoo_green', 'DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', ...greenRuntimeEnvEntries] },
  NetworkSettings: { Networks: {
    [greenTarget.network]: {
      NetworkID: targetNetworkId,
      Aliases: [greenTarget.apiContainer, 'shareittoo-staging-api'],
      DNSNames: [greenTarget.apiContainer, 'shareittoo-staging-api', 'api-original-id'],
    },
    [greenTarget.providerNetwork]: {
      NetworkID: providerNetworkId,
      Aliases: [greenTarget.apiContainer],
      DNSNames: [greenTarget.apiContainer, 'api-original-id'],
    },
  } },
};
const stableIdentityValue = (value) => Array.isArray(value)
  ? value.map((entry) => stableIdentityValue(entry))
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableIdentityValue(value[key])]))
    : value;
const originalApiIdentity = {
  id: originalApiIdentityRecord.Id,
  config: JSON.stringify(stableIdentityValue(originalApiIdentityRecord.Config)),
  networks: JSON.stringify(Object.fromEntries(Object.keys(originalApiIdentityRecord.NetworkSettings.Networks).sort()
    .map((name) => [name, originalApiIdentityRecord.NetworkSettings.Networks[name].NetworkID]))),
};
const restoredApiIdentityRecord = { ...originalApiIdentityRecord, Name: `/${greenTarget.apiContainer}`, State: { Running: true } };
const renamedSealedApiIdentityRecord = {
  ...originalApiIdentityRecord,
  Name: `/${greenTarget.sealedApiContainer}`,
  NetworkSettings: {
    Networks: Object.fromEntries(Object.entries(originalApiIdentityRecord.NetworkSettings.Networks).map(([name, endpoint]) => [name, {
      ...endpoint,
      Aliases: [greenTarget.sealedApiContainer, `sealed-${name}`],
      DNSNames: [greenTarget.sealedApiContainer, `sealed-${name}`, 'api-original-id'],
    }])),
  },
};

test('MFA probe container contract accepts only dedicated names or an exact Docker ID', () => {
  assert.equal(isMfaProbeContainer('shareittoo-staging-acceptance-api'), true);
  assert.equal(isMfaProbeContainer('sit-green-acceptance-0123456789ab'), true);
  assert.equal(isMfaProbeContainer('a'.repeat(64)), true);
  for (const invalid of [
    'a'.repeat(12),
    'a'.repeat(63),
    'a'.repeat(65),
    'g'.repeat(64),
    'A'.repeat(64),
    'sit-grn-c-runtime-0123456789abcdef',
    'sit-green-acceptance-0123456789a',
  ]) assert.equal(isMfaProbeContainer(invalid), false, invalid);
});

function restoreFixture(options, running = true) {
  if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(renamedSealedApiIdentityRecord) };
  if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
  if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
  if (options.phase === 'failure_restore_current_api_identity_after_rename' || options.phase === 'failure_restore_green_api_identity_verify') return { stdout: JSON.stringify({ ...restoredApiIdentityRecord, State: { Running: running } }) };
  return null;
}

test('Green target accepts only the exact verified resource identities', () => {
  assert.deepEqual(assertGreenTargetManifest(targetManifest), targetManifest);
  assert.equal(targetManifest.schemaVersion, 4);
  assert.equal(targetManifest.prePromotionImage, 'ghcr.io/shareittoo/shareittoo-api:d3c2f5d7d7516d3bfaac4b61689c2c433924cc6e');
  assert.equal(targetManifest.prePromotionImageDigest, 'sha256:31b8b015eb0635b9fbb7d6c5e54ef43fe089d5b953dba8fa446aae2122a5888a');
  assert.equal(targetManifest.sealedApiContainer, 'shareittoo-staging-api-alt-sealed-green-d3c2f5d7');
  assert.deepEqual(targetManifest.retainedSealed.map((descriptor) => descriptor.name), [
    'shareittoo-staging-api-alt-sealed-green-bc86f831',
    'shareittoo-staging-api-alt-sealed-green',
    'shareittoo-staging-api-alt-sealed-green-01f81655',
    'shareittoo-staging-api-alt-sealed-green-56ec5dc1',
    'shareittoo-staging-api-alt-sealed-green-c2da8585',
    'shareittoo-staging-api-sealed-green-c2da-memory-20260925T214445Z',
    'shareittoo-staging-api-alt-sealed-green-cffb4e43',
    'shareittoo-staging-api-alt-sealed-green-ea25e7cb',
    'shareittoo-staging-api-alt-sealed-green-d91b50a9',
    'shareittoo-staging-api-alt-sealed-green-3c40ded0',
    'shareittoo-staging-api-google-auth-rollback-fe00faaeb46a',
    'shareittoo-staging-api-google-registration-rollback-5d3b42613da7',
    'shareittoo-staging-api-google-registration-finalization-rollback-5d3b42613da7',
    'shareittoo-staging-api-alt-sealed-green-5d3b4261',
    'shareittoo-staging-api-web-cors-rollback-aa1a4ef1e065',
    'shareittoo-staging-api-alt-sealed-green-8a90ec61',
    'shareittoo-staging-api-web-fixture-env-rollback-13b02611f3b0',
    'shareittoo-staging-api-alt-sealed-green-1ebc6eaf',
    'shareittoo-staging-api-alt-sealed-green-34194c42',
    'shareittoo-staging-api-web-catalog-rollback-ca6c2b44138e',
  ]);
  const retainedReadbacks = greenTarget.retainedSealed.map((descriptor) => ({
    Name: `/${descriptor.name}`,
    Image: descriptor.imageDigest,
    State: { Running: false },
    Config: {
      Image: descriptor.image,
      Labels: {
        'com.shareittoo.sit.green': descriptor.greenLabel,
        'com.shareittoo.sit.green.run_id': descriptor.runId,
      },
    },
  }));
  assert.equal(assertGreenRetainedSealedInventories(retainedReadbacks, targetManifest.retainedSealed), true);
  assert.throws(() => assertGreenRetainedSealedInventory({ ...retainedReadbacks[0], State: { Running: true } }, targetManifest.retainedSealed[0]), /green_retained_sealed_inventory_mismatch/u);
  for (const mutation of [
    { ...targetManifest, composeProject: 'sit-staging' },
    { ...targetManifest, network: 'sit-green-network-lookalike' },
    { ...targetManifest, databaseContainer: 'shareittoo-staging-postgres' },
    { ...targetManifest, sourceSchema: 96 },
    { ...targetManifest, currentSchema: 94 },
    { ...targetManifest, greenLabel: 'com.shareittoo.sit.green=false' },
    { ...targetManifest, retainedSealed: [{ ...targetManifest.retainedSealed[0], image: greenTarget.prePromotionImage }, targetManifest.retainedSealed[1]] },
  ]) {
    assert.throws(() => assertGreenTargetManifest(mutation));
  }
});

test('forbidden production identifiers use token boundaries, not arbitrary path substrings', () => {
  for (const value of [
    '/tmp/sit-r10-clean-reproducibility-abc123',
    'shareittoo-staging-api',
    'productional-analysis',
  ]) assert.equal(containsForbiddenGreenTargetIdentifier(value), false, value);
  for (const value of ['/prod/', 'shareittoo-prod-api', 'shareittoo_production_db', 'registry:prod']) {
    assert.equal(containsForbiddenGreenTargetIdentifier(value), true, value);
  }
});

test('web-fixture rollback seal binds the literal production-shaped Docker image tuple', () => {
  const literalDescriptor = {
    name: 'shareittoo-staging-api-web-fixture-env-rollback-13b02611f3b0',
    image: 'ghcr.io/shareittoo/shareittoo-api:1ebc6eaf695e0cd9365680cdecd711b3edbb5586@sha256:22f609f21e04ddeb633186727b72c12158c473822dfef2859d3fa357e00647a2',
    imageDigest: 'sha256:22f609f21e04ddeb633186727b72c12158c473822dfef2859d3fa357e00647a2',
    greenLabel: 'true',
    runId: '20260918011528-wp254',
    running: false,
  };
  const descriptor = greenTarget.retainedSealed.find(({ name }) => name === literalDescriptor.name);
  assert.deepEqual(descriptor, literalDescriptor);
  const observedReadback = {
    Name: '/shareittoo-staging-api-web-fixture-env-rollback-13b02611f3b0',
    Image: 'sha256:22f609f21e04ddeb633186727b72c12158c473822dfef2859d3fa357e00647a2',
    State: { Running: false },
    Config: {
      Image: 'ghcr.io/shareittoo/shareittoo-api:1ebc6eaf695e0cd9365680cdecd711b3edbb5586@sha256:22f609f21e04ddeb633186727b72c12158c473822dfef2859d3fa357e00647a2',
      Labels: {
        'com.shareittoo.sit.green': 'true',
        'com.shareittoo.sit.green.run_id': '20260918011528-wp254',
      },
    },
  };
  assert.equal(assertGreenRetainedSealedInventory(observedReadback, descriptor), true);
  for (const drifted of [
    { ...observedReadback, Config: { ...observedReadback.Config, Image: 'ghcr.io/shareittoo/shareittoo-api:1ebc6eaf695e0cd9365680cdecd711b3edbb5586' } },
    { ...observedReadback, Config: { ...observedReadback.Config, Image: 'ghcr.io/shareittoo/shareittoo-api:1ebc6eaf695e0cd9365680cdecd711b3edbb5586@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } },
    { ...observedReadback, Image: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  ]) assert.throws(() => assertGreenRetainedSealedInventory(drifted, descriptor), /green_retained_sealed_inventory_mismatch/u);
});

test('Green runtime config fails closed for external/mock/legacy or secret-bearing variants', () => {
  assert.equal(assertGreenRuntimeConfig(config).listingAiProvider, 'on_device');
  assert.equal(assertGreenRuntimeConfig({ ...config, envNames: [...config.envNames, 'APP_FEATURE_FLAG'] }).environment, 'test');
  for (const releaseName of ['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME']) {
    assert.throws(
      () => assertGreenRuntimeConfig({ ...config, envNames: [...config.envNames, releaseName] }),
      /green_config_release_identity_env_forbidden/u,
      releaseName,
    );
  }
  assert.throws(() => assertGreenRuntimeConfig({ ...config, listingAiProvider: 'mock' }), /green_config_safety_boundary_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, listingAiExternalAllowed: true }), /green_config_safety_boundary_invalid/u);
  for (const [name, value] of [
    ['mailTransport', 'smtp'], ['pushTransport', 'fcm'], ['paymentTransport', 'stripe'], ['identityTransport', 'stripe'],
    ['listingAiProvider', 'openai'], ['listingAiExternalAllowed', true], ['listingAiBudgetCents', 1],
  ]) assert.throws(() => buildGreenPromotionPlan({
    targetManifest, config: { ...config, [name]: value }, runtimeCommit,
    runtimeImageDigest, opsCommit,
    evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  }), /green_config_safety_boundary_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, envNames: [...config.envNames, 'STRIPE_SECRET_KEY'] }), /green_config_env_allowlist_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, environment: 'production' }), /green_config_env_allowlist_invalid/u);
  for (const requiredName of ['SIT_STAGING_SYNTHETIC_CATALOG_ENABLED', 'SIT_STAGING_PUBLIC_LISTING_IDS', 'SIT_STAGING_PUBLIC_UPLOAD_NAMES']) {
    assert.throws(() => assertGreenRuntimeConfig({ ...config, envNames: config.envNames.filter((name) => name !== requiredName) }), /green_config_env_allowlist_invalid/u);
  }
});

test('release identity overrides are rejected before runtime files or commands', async () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit,
    evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  for (const releaseName of ['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME']) {
    let commandCalls = 0;
    let runtimeFileCalls = 0;
    const invalidConfig = { ...config, envNames: [...config.envNames, releaseName] };
    await assert.rejects(
      () => runGreenPromotion({
        plan,
        config: invalidConfig,
        configFile: config.envFile,
        environment: { GREEN_STAGING_PROMOTION_EXECUTE: '1', GREEN_STAGING_PROMOTION_CONFIRM: runtimeCommit },
        execute: true,
        command: async () => { commandCalls += 1; return { stdout: '' }; },
        assertRuntimeFiles: async () => { runtimeFileCalls += 1; },
      }),
      (error) => error?.code === 'green_config_release_identity_env_forbidden',
      releaseName,
    );
    assert.equal(commandCalls, 0, `${releaseName} must reject before command execution`);
    assert.equal(runtimeFileCalls, 0, `${releaseName} must reject before runtime-file checks`);
  }
});

test('evidence artifact family preflight rejects retained backups and env files before commands', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-green-artifact-family-'));
  try {
    for (const suffix of ['.json', '.pgdump', '.isolated.env']) {
      const evidenceFile = path.join(root, `green-promotion-${suffix.slice(1)}.json`);
      const plan = buildGreenPromotionPlan({
        targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile,
        ownershipNonce: 'c'.repeat(32),
      });
      const retainedPath = suffix === '.json' ? evidenceFile : suffix === '.pgdump' ? `${evidenceFile}.pgdump` : plan.isolated.envFile;
      writeFileSync(retainedPath, 'retained immutable backup namespace\n', { mode: 0o600 });
      let commandCalls = 0;
      let runtimeFileCalls = 0;
      await assert.rejects(
        () => runGreenPromotion({
          plan, config, configFile: config.envFile,
          environment: { GREEN_STAGING_PROMOTION_EXECUTE: '1', GREEN_STAGING_PROMOTION_CONFIRM: runtimeCommit },
          execute: true,
          command: async () => { commandCalls += 1; return { stdout: '' }; },
          assertRuntimeFiles: async () => { runtimeFileCalls += 1; },
        }),
        (error) => error?.code === 'green_evidence_artifact_family_occupied',
        suffix,
      );
      assert.equal(commandCalls, 0, `${suffix} must fail before Docker/command execution`);
      assert.equal(runtimeFileCalls, 0, `${suffix} must fail before runtime mutation checks`);
      assert.equal(readFileSync(retainedPath, 'utf8'), 'retained immutable backup namespace\n');
      rmSync(retainedPath, { force: true });
    }
    const absentEvidenceFile = path.join(root, 'green-promotion-absent.json');
    const absentPlan = buildGreenPromotionPlan({
      targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: absentEvidenceFile,
      ownershipNonce: 'd'.repeat(32),
    });
    assert.equal(await assertGreenEvidenceArtifactFamilyAvailable({ evidenceFile: absentPlan.evidenceFile, isolatedEnvFile: absentPlan.isolated.envFile }), true);
    assert.equal(readdirSync(root).length, 0, 'absent family preflight must not reserve or mutate artifacts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Green provider-off contract matches the real Listing-AI server parser', () => {
  const listing = readListingAiGatewayConfiguration(greenBroadPromotionEnvironment, { deploymentEnvironment: 'test' });
  assert.equal(listing.provider, 'on_device');
  assert.equal(listing.budgetCents, 0);
  assert.equal(listing.externalProviderExecutionAllowed, false);
  assert.throws(() => readListingAiGatewayConfiguration({
    ...greenBroadPromotionEnvironment,
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: 'false',
  }, { deploymentEnvironment: 'test' }));
});

test('protected Green runtime environment binds memory payment, pilot, paths and no provider secrets', () => {
  const values = {
    CORS_ORIGINS: greenWebCorsOrigins,
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    ENABLE_STAGING_STRIPE: '0', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory', SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0', SIT_LISTING_AI_BUDGET_CENTS: '0',
    ...greenTechnicalSandboxEnvironment,
    ...greenFixtureEnvironment,
    SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'true',
    SIT_STAGING_PILOT_ID: 'heilbronn_wave0', SIT_STAGING_COMPOSE_PROJECT: 'sit-green', SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919',
    SYNTHETIC_SANDBOX_PASSWORD_FILE: syntheticSandboxCredentialFilePath,
  };
  assert.equal(assertGreenProtectedEnvironment(values, config), true);
  for (const CORS_ORIGINS of [undefined, 'http://shareittoo-staging-api:8080', 'https://staging.shareittoo.com', `${greenWebCorsOrigins},https://shareittoo.com`]) {
    assert.throws(() => assertGreenProtectedEnvironment({ ...values, CORS_ORIGINS }, config), /green_web_cors_environment_invalid/u);
  }
  assert.equal(assertGreenTechnicalSandboxProviderOff(values), true);
  assert.equal(assertGreenPublicFixtureEnvironment(values), greenPublicFixtureProfile);
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, FIREBASE_AUTH_ENABLED: 'true' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, FIREBASE_PHONE_VERIFICATION_ENABLED: 'true' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, DEPLOYMENT_ENVIRONMENT: 'staging' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'true' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: 'digest=owner' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, PAYMENT_TRANSPORT: 'stripe' }, config));
  for (const [name, value] of [
    ['MAIL_TRANSPORT', 'smtp'], ['PUSH_TRANSPORT', 'fcm'], ['IDENTITY_VERIFICATION_TRANSPORT', 'stripe'],
    ['SIT_LISTING_AI_PROVIDER', 'openai'], ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'], ['SIT_LISTING_AI_BUDGET_CENTS', '1'],
  ]) assert.throws(() => assertGreenProtectedEnvironment({ ...values, [name]: value }, config), /green_broad_promotion_provider_off_invalid/u);
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, OPENAI_API_KEY: 'present' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, SYNTHETIC_SANDBOX_PASSWORD_FILE: '/run/secrets/synthetic-sandbox-user-password' }, config));
  for (const value of [undefined, 'false', '1']) {
    assert.throws(() => assertGreenProtectedEnvironment({ ...values, SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: value }, config), /green_broad_promotion_provider_off_invalid/u);
  }
  for (const name of ['SIT_STAGING_PUBLIC_LISTING_IDS', 'SIT_STAGING_PUBLIC_UPLOAD_NAMES']) {
    assert.throws(() => assertGreenProtectedEnvironment({ ...values, [name]: undefined }, config), /green_public_fixture_profile_invalid/u);
    assert.throws(() => assertGreenProtectedEnvironment({ ...values, [name]: `${values[name]},drift` }, config), /green_public_fixture_profile_invalid/u);
  }
});

test('Green promotion has an explicit provider-off technical Sandbox plan and readback', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  assert.deepEqual(plan.technicalSandbox, {
    ...greenTechnicalSandboxHealth,
    authorizationRenewal: false,
    providerTraffic: false,
  });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.equal(commands.some((entry) => entry.args.some((arg) => /technical-sandbox-(?:key|webhook)/u.test(arg))), false);
  assert.equal(assertGreenRuntimeEnvironmentReadback({
    CORS_ORIGINS: greenWebCorsOrigins,
    DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false', googleRegistrationAllowlistEmpty: true,
    ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, ...greenFixtureEnvironment,
  }), true);
  assert.throws(() => assertGreenTechnicalSandboxProviderOff({
    ...greenTechnicalSandboxEnvironment, TECHNICAL_SANDBOX_AUTHORIZATION_ID: 'stale-auth',
  }), /green_technical_sandbox_provider_off_invalid/u);
  assert.throws(() => assertGreenRuntimeEnvironmentReadback({
    DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false', googleRegistrationAllowlistEmpty: true,
    ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, ...greenFixtureEnvironment, TECHNICAL_SANDBOX_ENABLED: '1',
  }), /green_technical_sandbox_provider_off_invalid/u);
  for (const [name, value] of [
    ['MAIL_TRANSPORT', 'smtp'], ['PUSH_TRANSPORT', 'fcm'], ['IDENTITY_VERIFICATION_TRANSPORT', 'stripe'],
    ['SIT_LISTING_AI_PROVIDER', 'openai'], ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'], ['SIT_LISTING_AI_BUDGET_CENTS', '1'],
  ]) assert.throws(() => assertGreenRuntimeEnvironmentReadback({
    DEPLOYMENT_ENVIRONMENT: 'test', SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    googleRegistrationAllowlistEmpty: true, ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, ...greenFixtureEnvironment, [name]: value,
  }), /green_broad_promotion_provider_off_invalid/u);
  for (const value of [undefined, 'false', '1']) assert.throws(() => assertGreenRuntimeEnvironmentReadback({
    CORS_ORIGINS: greenWebCorsOrigins, DEPLOYMENT_ENVIRONMENT: 'test', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', googleRegistrationAllowlistEmpty: true,
    ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, ...greenFixtureEnvironment,
    SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: value,
  }), /green_broad_promotion_provider_off_invalid/u);
});

test('promotion executor contract rejects external provider selections before candidate or final commands exist', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  for (const [name, value] of [
    ['mailTransport', 'smtp'], ['pushTransport', 'fcm'], ['paymentTransport', 'stripe'], ['identityTransport', 'stripe'],
    ['listingAiProvider', 'openai'], ['listingAiExternalAllowed', true], ['listingAiBudgetCents', 1],
  ]) {
    assert.throws(() => buildGreenPromotionCommands({
      plan, configFile: config.envFile, config: { ...config, [name]: value },
    }), /green_config_safety_boundary_invalid/u);
  }
});

test('runtime image must be immutable GHCR commit plus digest', () => {
  const runtime = assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: runtimeImageDigest, runtimeCommit });
  assert.equal(runtime.runtimeCommit, runtimeCommit);
  assert.deepEqual(runtime.publication, {
    runId: greenSuccessorRuntime.publicationRunId,
    manifestDigest: greenSuccessorRuntime.publicationManifestDigest,
  });
  assert.throws(() => assertGreenRuntimeImage({ image: 'shareittoo-api:latest', digest: runtimeImageDigest, runtimeCommit }), /runtime_image_tag_mismatch/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: 'sha256:short', runtimeCommit }), /runtime_image_digest_required/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: `sha256:${'d'.repeat(64)}`, runtimeCommit }), /green_successor_runtime_identity_mismatch/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${'f'.repeat(40)}`, digest: runtimeImageDigest, runtimeCommit: 'f'.repeat(40) }), /green_successor_runtime_identity_mismatch/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: runtimeImageDigest, runtimeCommit, publicationRunId: greenSuccessorRuntime.publicationRunId + 1 }), /green_successor_publication_identity_mismatch/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: runtimeImageDigest, runtimeCommit, publicationManifestDigest: 'f'.repeat(64) }), /green_successor_publication_identity_mismatch/u);
});

test('runtime readback binds version and capability safety surface', () => {
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  assert.equal(assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: payload, ready: payload, runtimeCommit }), true);
  const extendedPayload = { checks: { ...payload.checks, technicalSandbox: { ...greenTechnicalSandboxHealth, observedAt: 'synthetic-fixture' } } };
  assert.equal(assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: extendedPayload, ready: extendedPayload, runtimeCommit }), true);
  assert.throws(() => assertGreenRuntimeReadbacks({ version: { commit: '0'.repeat(40), environment: 'test' }, health: payload, ready: payload, runtimeCommit }));
  assert.throws(() => assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: { ...payload, checks: { ...payload.checks, technicalSandbox: { ...payload.checks.technicalSandbox, amountMinor: 200 } } }, ready: payload, runtimeCommit }));
});

test('production-shaped image inspect readback may omit Config.Image but must bind digest and revision', () => {
  const runtime = { image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: runtimeImageDigest, runtimeCommit };
  const readback = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`${runtime.image}@${runtime.digest}`] };
  assert.equal(assertGreenImageReadback(readback, runtime), true);
  assert.throws(() => assertGreenImageReadback({ ...readback, RepoDigests: [`${runtime.image}@sha256:${'e'.repeat(64)}`] }, runtime), /green_image_readback_mismatch/u);
});

test('inventory rejects wrong schema, host ports and non-Green labels', () => {
  const inventory = {
    api: { name: greenTarget.apiContainer, greenLabel: false, prePromotionTuple: true, hostPorts: 0, running: true, networks: [greenTarget.network, greenTarget.providerNetwork], image: prePromotionImageReference, user: 'shareittoo', databaseHost: greenTarget.databaseContainer, databaseName: greenTarget.databaseName, databaseUser: greenTarget.databaseUser, uploadsVolume: greenTarget.uploadsVolume, groupAdd: true, mounts: sourceMounts },
    database: { name: greenTarget.databaseContainer, greenLabel: true, running: true },
    network: { name: greenTarget.network, internal: true }, providerNetwork: { name: greenTarget.providerNetwork },
    uploadsVolume: { name: greenTarget.uploadsVolume }, schema: 98,
  };
  assert.equal(assertGreenContainerInventory(inventory, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), true);
  assert.throws(() => assertGreenContainerInventory({ ...inventory, schema: 96 }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config));
  assert.throws(() => assertGreenContainerInventory({ ...inventory, api: { ...inventory.api, hostPorts: 1 } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config));
  assert.throws(() => assertGreenContainerInventory({ ...inventory, network: { name: 'sit-staging', internal: true } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config));
  assert.throws(() => assertGreenContainerInventory({ ...inventory, api: { ...inventory.api, image: targetManifest.prePromotionImage } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...inventory, api: { ...inventory.api, image: `${prePromotionImageReference.slice(0, -64)}${'0'.repeat(64)}` } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
});

test('promotion plan keeps backup, isolated 98-to-98 idempotency, acceptance and final no-port promotion ordered', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  assert.deepEqual(plan.commandPolicy.finalNetworks, [greenTarget.network, greenTarget.providerNetwork]);
  assert.equal(plan.commandPolicy.finalHostPorts, 0);
  assert.ok(plan.phases.findIndex((phase) => phase.includes('stop and seal')) < plan.phases.findIndex((phase) => phase.includes('fresh protected database backup')));
  assert.match(plan.phases.join('\n'), /98_to_98/u);
  assert.match(plan.phases.join('\n'), /098_booking_checkout_declaration_constraints\.up\.sql/u);
  assert.match(plan.phases.join('\n'), /synthetic sandbox user/u);
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.equal(assertGreenCommandBindings(commands, plan, config.envFile), true);
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  const final = commands.find((entry) => entry.phase === 'final_create_no_host_port');
  const candidateRuntimeReadback = commands.find((entry) => entry.phase === 'candidate_runtime_flags_readback');
  assert.ok(candidate.args.includes('--publish') && candidate.args.includes('127.0.0.1:18082:8080'));
  assert.ok(candidate.args.includes('SIT_GREEN_REHEARSAL=1'));
  assert.ok(candidate.args.includes('SYNTHETIC_SANDBOX_PASSWORD_FILE=/run/secrets/synthetic-sandbox-user-password'));
  assert.ok(candidate.args.includes(`type=bind,src=${syntheticSandboxCredentialFilePath},dst=/run/secrets/synthetic-sandbox-user-password,readonly`));
  assert.match(candidateRuntimeReadback.args.at(-1), /SIT_STAGING_SYNTHETIC_CATALOG_ENABLED/u);
  assert.match(candidateRuntimeReadback.args.at(-1), /SIT_STAGING_PUBLIC_LISTING_IDS/u);
  assert.match(candidateRuntimeReadback.args.at(-1), /publicListingIds.*Digest/u);
  assert.doesNotMatch(candidateRuntimeReadback.args.at(-1), new RegExp(`${dedicatedFixture.listing}|${dedicatedFixture.upload}`, 'u'));
  assert.ok(!final.args.includes('--publish') && !final.args.includes('-p'));
  assert.equal(final.args.some((arg) => arg.includes('synthetic-sandbox-user-password')), false);
  assert.equal(final.args.includes(syntheticSandboxCredentialFilePath), false);
  assert.ok(final.args.includes(`type=volume,src=${greenTarget.uploadsVolume},dst=/data/uploads,readonly=false`));
  assert.ok(final.args.includes('--group-add') && final.args.includes('65532'));
  assert.ok(final.args.some((arg) => arg.includes('com.shareittoo.sit.green=true')));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_idempotent_migration_98_to_98'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_migration_readback') < commands.findIndex((entry) => entry.phase === 'isolated_migration_ledger_readback'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_migration_ledger_readback') < commands.findIndex((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_postgres_init_complete_log_readback') < commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_1'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_1') < commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_2'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_2') < commands.findIndex((entry) => entry.phase === 'isolated_restore'));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_restore' && entry.inputFile));
  assert.ok(commands.find((entry) => entry.phase === 'candidate_mfa_identity_probes'));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_network_cleanup_verify'));
  assert.ok(commands.find((entry) => entry.phase === 'canonical_idempotent_migration_98_to_98'));
  assert.ok(commands.find((entry) => entry.phase === 'canonical_schema_readback'));
  assert.ok(commands.find((entry) => entry.phase === 'sealed_name_conflict_check'));
  assert.deepEqual(commands.filter((entry) => entry.phase.startsWith('retained_sealed_inventory_readback_')).map((entry) => entry.args.at(-1)), greenTarget.retainedSealed.map((descriptor) => descriptor.name));
  assert.ok(commands.find((entry) => entry.phase === 'final_inventory_readback'));
  assert.ok(commands.find((entry) => entry.phase === 'final_image_readback'));
  assert.ok(commands.some((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'));
  assert.ok(commands.some((entry) => entry.phase === 'synthetic_sandbox_provision_canonical'));
  assert.equal(commands.some((entry) => entry.command === 'docker' && entry.args?.[0] === 'volume'), false);
  assert.equal(commands.some((entry) => /isolated_.*volume/u.test(entry.phase)), false);
  const phaseIndex = (phase) => commands.findIndex((entry) => entry.phase === phase);
  assert.ok(phaseIndex('target_container_set_readback') < phaseIndex('quiesce_green_api'));
  assert.ok(phaseIndex('quiesce_green_api') < phaseIndex('quiesce_green_api_verify'));
  assert.ok(phaseIndex('quiesce_green_api_verify') < phaseIndex('source_foreign_writer_readback_before_backup'));
  assert.ok(phaseIndex('source_foreign_writer_readback_before_backup') < phaseIndex('fresh_protected_backup'));
  assert.ok(phaseIndex('fresh_protected_backup') < phaseIndex('source_foreign_writer_readback_after_backup'));
  assert.ok(phaseIndex('isolated_finding_fingerprint_readback') < phaseIndex('candidate_start'));
  assert.ok(phaseIndex('candidate_finding_fingerprint_readback') < phaseIndex('candidate_health_and_feature_probes'));
  assert.ok(phaseIndex('quiesce_green_api') < phaseIndex('candidate_acceptance_create'));
  assert.ok(phaseIndex('candidate_cleanup_verify') < phaseIndex('canonical_idempotent_migration_98_to_98'));
  assert.ok(phaseIndex('canonical_schema_readback') < phaseIndex('final_create_no_host_port'));
  assert.equal(commands.some((entry) => entry.args?.some((arg) => (
    /shareittoo-staging-postgres|shareittoo_staging_backend|shareittoo_staging_postgres_data/iu.test(arg)
      || containsForbiddenGreenTargetIdentifier(arg)
  ))), false);
});

test('isolated lifecycle is create, inspect-by-ID, then start-by-ID with execution-bound final successor', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: '7'.repeat(32) });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const phase = (name) => commands.findIndex((entry) => entry.phase === name);
  const postgresCreate = commands.find((entry) => entry.phase === 'isolated_postgres_create');
  assert.equal(postgresCreate.args[0], 'create');
  assert.equal(postgresCreate.args.includes('--detach'), false);
  assert.ok(phase('isolated_network_create') < phase('isolated_network_identity_readback'));
  assert.ok(phase('isolated_network_identity_readback') < phase('isolated_postgres_create'));
  assert.ok(phase('isolated_postgres_create') < phase('isolated_postgres_identity_readback'));
  assert.ok(phase('isolated_postgres_identity_readback') < phase('isolated_postgres_start'));
  assert.ok(phase('isolated_postgres_start') < phase('isolated_postgres_wait'));
  const finalCreate = commands.find((entry) => entry.phase === 'final_create_no_host_port');
  assert.ok(finalCreate.args.includes(`com.shareittoo.green.execution_id=${plan.isolated.executionId}`));
  assert.equal(assertGreenCommandBindings(commands, plan, config.envFile), true);
});

test('isolated resource names and labels carry a fresh per-execution ownership nonce', () => {
  const first = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'a'.repeat(32) });
  const second = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'b'.repeat(32) });
  assert.match(first.isolated.candidate, new RegExp(first.isolated.ownershipNonce, 'u'));
  assert.match(first.isolated.rehearsalId, new RegExp(first.isolated.ownershipNonce, 'u'));
  assert.notEqual(first.isolated.ownershipNonce, second.isolated.ownershipNonce);
  assert.throws(() => buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'not-a-nonce' }), /green_ownership_nonce_invalid/u);
  const commands = buildGreenPromotionCommands({ plan: first, configFile: config.envFile, config });
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  assert.equal(candidate.args[candidate.args.indexOf('--name') + 1], first.isolated.candidate);
  assert.ok(candidate.args.includes(`com.shareittoo.green.rehearsal_id=${first.isolated.rehearsalId}`));
});

test('every promotion command has an executable command and argv, including target inventory', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const targetInventory = commands.filter(({ phase }) => phase.startsWith('target_inventory_'));
  assert.deepEqual(targetInventory.map(({ command, args }) => ({ command, args })), [
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.apiContainer] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.databaseContainer] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.network] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.providerNetwork] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.uploadsVolume] },
  ]);
  assert.ok(targetInventory.length > 0);
  for (const entry of commands) {
    assert.equal(typeof entry.command, 'string', `${entry.phase} command must be a string`);
    assert.ok(entry.command.length > 0, `${entry.phase} command must not be empty`);
    assert.ok(Array.isArray(entry.args), `${entry.phase} args must be an array`);
  }
});

test('promotion plan resolves the exact sealed API before emitting mutation commands', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  assert.equal(plan.target.sealedApiContainer, greenTarget.sealedApiContainer);
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  for (const entry of commands) {
    assert.equal(entry.args.some((arg) => arg === undefined), false, `${entry.phase} must not contain undefined argv`);
  }
  const immutableImage = `${plan.runtime.image}@${plan.runtime.digest}`;
  for (const phase of ['isolated_idempotent_migration_98_to_98', 'synthetic_sandbox_provision_isolated', 'candidate_acceptance_create', 'canonical_idempotent_migration_98_to_98', 'synthetic_sandbox_provision_canonical', 'final_create_no_host_port']) {
    const entry = commands.find((candidate) => candidate.phase === phase);
    assert.ok(entry.args.includes(immutableImage), `${phase} must execute the verified digest-pinned image`);
    assert.equal(entry.args.includes(plan.runtime.image), false, `${phase} must not execute the mutable tag`);
  }
  const missing = Object.freeze({ ...plan, target: Object.freeze({ ...plan.target, sealedApiContainer: undefined }) });
  assert.throws(() => buildGreenPromotionCommands({ plan: missing, configFile: config.envFile, config }), /green_sealed_target_invalid/u);
});

test('Docker env-file bindings reject JSON manifests and accept only real protected env files', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  assert.throws(() => buildGreenPromotionCommands({ plan, configFile: '/docker/shareittoo/ops/green-config.json', config }), /green_config_file_invalid/u);
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const mutated = commands.map((entry) => ({ ...entry, args: entry.args?.map((arg) => arg === plan.isolated.envFile ? '/docker/shareittoo/ops/green-config.json' : arg) }));
  assert.throws(() => assertGreenCommandBindings(mutated, plan, config.envFile), /green_env_file_invalid/u);
});

test('retained historical seal is read-only and the new seal is the only rename target', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  for (const descriptor of plan.target.retainedSealed) {
    const mutatingOldName = commands.filter((entry) => ['rename', 'rm', 'start', 'stop', 'network'].includes(entry.args?.[0]) && entry.args.includes(descriptor.name));
    assert.deepEqual(mutatingOldName, []);
  }
  const rename = commands.find((entry) => entry.phase === 'seal_green_api');
  assert.deepEqual(rename.args, ['rename', plan.target.apiContainer, plan.target.sealedApiContainer]);
});

test('default CLI is read-only and execution requires both explicit mode and exact environmental consent', async () => {
  assert.deepEqual(parseGreenPromotionArguments([runtimeCommit]), { runtimeCommit, execute: false });
  assert.deepEqual(parseGreenPromotionArguments([runtimeCommit, '--execute']), { runtimeCommit, execute: true });
  for (const args of [[], [runtimeCommit, '--unknown'], [runtimeCommit, '--execute', 'extra']]) assert.throws(() => parseGreenPromotionArguments(args), /green_cli_arguments_invalid/u);
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  for (const environment of [{}, { GREEN_STAGING_PROMOTION_EXECUTE: '1' }, { GREEN_STAGING_PROMOTION_EXECUTE: '1', GREEN_STAGING_PROMOTION_CONFIRM: 'f'.repeat(40) }]) {
    let calls = 0;
    await assert.rejects(runGreenPromotion({ plan, config, configFile: config.envFile, execute: true, environment, command: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const prefix = greenReadOnlyPreflightCommands(commands, plan);
  assert.equal(prefix.length, 32);
  assert.deepEqual(greenRequiredControlExecutables(prefix), ['docker']);
  assert.deepEqual(await assertGreenControlExecutables({ commands: prefix, executableAvailable: async (name) => name === 'docker' }), ['docker']);
  for (const change of [
    (entries) => { entries[0].command = 'curl'; },
    (entries) => { entries[0].args = ['stop', plan.target.apiContainer]; },
    (entries) => { entries[0].stdoutFile = '/tmp/forbidden'; },
    (entries) => { entries[1].args[3] = 'foreign-container'; },
    (entries) => { entries.find(({ phase }) => phase === 'source_database_state_readback_before').args.splice(3, 0, '--unsafe'); },
    (entries) => { entries.find(({ phase }) => phase === 'source_database_state_readback_before').args[entries.find(({ phase }) => phase === 'source_database_state_readback_before').args.length - 1] = `${greenDatabaseStateReadbackSql}; DELETE FROM users`; },
    (entries) => { [entries[0], entries[1]] = [entries[1], entries[0]]; },
  ]) {
    const altered = structuredClone(commands); change(altered);
    assert.throws(() => greenReadOnlyPreflightCommands(altered, plan), /green_read_only_preflight_command_invalid/u);
  }
  const source = readFileSync(new URL('../ops/green_staging_promotion.mjs', import.meta.url), 'utf8');
  const main = source.slice(source.indexOf('async function main()'));
  assert.match(main, /parseGreenPromotionArguments\(process\.argv\.slice\(2\)\)/u);
  assert.match(main, /execute: mode\.execute/u);
  assert.doesNotMatch(main, /execute: true/u);
});

test('control executable preflight fails before any mutating executor command and accepts modeled prerequisites', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.deepEqual(greenRequiredControlExecutables(commands), ['bash', 'curl', 'docker', 'node']);
  const calls = [];
  await assert.rejects(
    () => runGreenPromotion({
      plan,
      config,
      configFile: config.envFile,
      environment: { GREEN_STAGING_PROMOTION_EXECUTE: '1', GREEN_STAGING_PROMOTION_CONFIRM: runtimeCommit },
      execute: true,
      executableAvailable: async (executable) => executable !== 'bash',
      command: async (...args) => { calls.push(args); return { stdout: '' }; },
      assertRuntimeFiles: async () => {},
    }),
    (error) => error?.code === 'green_control_executables_missing' && error.missing?.join(',') === 'bash',
  );
  assert.equal(calls.length, 0, 'missing control executable must fail before Docker/quiesce/backup commands');
  assert.equal(await assertGreenControlExecutables({ commands, executableAvailable: async () => true }).then((value) => value.join(',')), 'bash,curl,docker,node');
});

test('isolated Postgres init-marker readback retries past an early readiness-only log', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const marker = buildGreenPromotionCommands({ plan, configFile: config.envFile, config }).find((entry) => entry.phase === 'isolated_postgres_init_complete_log_readback');
  assert.equal(marker.command, 'bash');
  assert.match(marker.args[1], /seq 1 60/u);
  assert.match(marker.args[1], /PostgreSQL init process complete; ready for start up\./u);
  const root = mkdtempSync(path.join(os.tmpdir(), 'green-init-marker-'));
  const fakeDocker = path.join(root, 'docker');
  const countFile = path.join(root, 'count');
  writeFileSync(fakeDocker, '#!/bin/sh\ncount=0\n[ -f "$MARKER_COUNT" ] && count=$(cat "$MARKER_COUNT")\ncount=$((count + 1))\nprintf "%s" "$count" > "$MARKER_COUNT"\nif [ "$count" -lt 2 ]; then echo "database system is ready to accept connections"; else echo "PostgreSQL init process complete; ready for start up."; fi\n', { mode: 0o700 });
  chmodSync(fakeDocker, 0o700);
  const output = execFileSync(marker.command, marker.args, { encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ''}`, MARKER_COUNT: countFile } });
  assert.match(output, /PostgreSQL init process complete; ready for start up\./u);
  assert.equal(readFileSync(countFile, 'utf8'), '2');
  rmSync(root, { recursive: true, force: true });
});

test('buffer restore input preserves exact bytes and fails closed on early stdin close', async () => {
  const exactBytes = Buffer.from([0, 1, 255]);
  const successfulRestore = await runGreenCommandWithBufferInput(
    process.execPath,
    ['-e', "const chunks=[]; process.stdin.on('data', (chunk) => chunks.push(chunk)); process.stdin.on('end', () => process.exit(Buffer.concat(chunks).equals(Buffer.from([0,1,255])) ? 0 : 9));"],
    exactBytes,
    { phase: 'green_buffer_exact_bytes' },
  );
  assert.equal(successfulRestore.code, 0);
  await assert.rejects(
    () => runGreenCommandWithBufferInput(process.execPath, ['-e', "process.stdin.once('data', () => { process.stdin.destroy(); setTimeout(() => process.exit(0), 10); });"], Buffer.alloc(16 * 1024 * 1024), { phase: 'green_buffer_early_close' }),
    (error) => error.code === 'green_buffer_early_close_stdin_closed_early',
  );
});

test('executor preserves required post-enrollment auth through candidate, recovery and rollback', async () => {
  const postEnrollment = true;
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-green-runner-'));
  const configFile = path.join(root, 'green.env');
  const evidenceFile = path.join(root, 'green-promotion.json');
  const runtimeConfig = { ...config, envFile: configFile };
  const databaseStateReadback = JSON.stringify(greenDatabaseStateBaseline);
  const catalogPublicReadback = (photoReachable) => JSON.stringify({ status: 200, count: 1, pageCount: 1, rowKeys: greenSyntheticCatalogItemKeys, idDigest: greenSyntheticCatalogProjection.idDigest, ownerIdDigest: greenSyntheticCatalogProjection.ownerIdDigest, titleDigest: greenSyntheticCatalogProjection.titleDigest, noticeDigest: greenSyntheticCatalogProjection.noticeDigest, photoCount: 1, photoDigest: greenSyntheticCatalogProjection.photoDigest, locationText: greenSyntheticCatalogProjection.locationText, city: greenSyntheticCatalogProjection.city, country: greenSyntheticCatalogProjection.country, lat: greenSyntheticCatalogProjection.lat, lng: greenSyntheticCatalogProjection.lng, catalogClass: greenSyntheticCatalogProjection.catalogClass, realOffer: false, ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false, isActive: true, listingStatus: 'active', verificationStatus: 'unverified', strictItemCompatible: true, canonicalValues: true, attempts: 1, converged: true, photoReachable });
  const envValues = {
    CORS_ORIGINS: greenWebCorsOrigins,
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test',
    DATABASE_URL: `postgres://shareittoo_green:fixture@${greenTarget.databaseContainer}:5432/shareittoo_green`,
    JWT_SECRET: 'synthetic-fixture-jwt', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory', SIT_LISTING_AI_PROVIDER: 'on_device',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919', SMTP_HOST: 'localhost',
    ...greenFixtureEnvironment, SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'true',
    SMTP_PORT: '2525', SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic', MAIL_FROM: 'synthetic@example.invalid',
    FIREBASE_PROJECT_ID: 'synthetic', FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    SIT_STAGING_COMPOSE_PROJECT: 'sit-green', SIT_LISTING_AI_BUDGET_CENTS: '0', ENABLE_STAGING_STRIPE: '0',
    ...greenTechnicalSandboxEnvironment, SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
    SYNTHETIC_SANDBOX_PASSWORD_FILE: syntheticSandboxCredentialFilePath,
  };
  if (postEnrollment) Object.assign(envValues, { FIREBASE_AUTH_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: enrolledAllowedIds });
  writeFileSync(configFile, `${Object.entries(envValues).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
  chmodSync(configFile, 0o600);
  const plan = buildGreenPromotionPlan({
    targetManifest: postEnrollment ? enrolledTargetManifest() : targetManifest, config: runtimeConfig, runtimeCommit, runtimeImageDigest,
    opsCommit, evidenceFile,
  });
  const imageReadback = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`${plan.runtime.image}@${plan.runtime.digest}`] };
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const prePromotionRecord = (image) => ({
    Id: originalApiIdentityRecord.Id, Name: `/${greenTarget.apiContainer}`, State: { Running: true },
    NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } },
    Config: { Image: image, User: 'shareittoo', Labels: {}, Env: Object.entries(envValues).map(([key, value]) => `${key}=${value}`) },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: sourceMounts.map((mount) => ({ Destination: mount.destination, Type: mount.type, Source: mount.source, Name: mount.volume, RW: !mount.readOnly })),
  });
  const databaseRecord = { Name: `/${greenTarget.databaseContainer}`, State: { Running: true }, Config: { Labels: { 'com.shareittoo.sit.green': 'true' } } };
  let candidateAuthOverride = null;
  let missingEnrollmentPhase = null;
  const fakeRun = async (image, isolatedLedger = currentMigrationLedger, initLog = 'PostgreSQL init process complete; ready for start up.\n', stableSelect2 = '1\n', targetSet = targetContainerSet, foreignBefore = '[]\n', foreignAfter = foreignBefore, candidateFinding = emptyFindingFingerprint, stopAtPhase = 'quiesce_green_api', restoreCode, postgresIdentityOverrides = {}, readOnly = null) => {
    const calls = [];
    let recoveryRecord = null;
    const candidateRecord = {
      Id: candidateId, Name: `/${plan.isolated.candidate}`, State: { Running: false },
      NetworkSettings: { Ports: {}, Networks: { [plan.isolated.network]: { NetworkID: '' }, [greenTarget.providerNetwork]: { NetworkID: '' } } },
      Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': plan.target.runId, 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
      HostConfig: { GroupAdd: ['65532'], NetworkMode: isolatedNetworkId, PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } }, Mounts: [...finalMounts.map((mount) => mount.Destination === '/data/uploads' ? { ...mount, Name: 'anonymous-uploads-id' } : mount), { Type: 'bind', Source: syntheticSandboxCredentialFilePath, Destination: '/run/secrets/synthetic-sandbox-user-password', RW: false }],
    };
    if (postEnrollment) candidateRecord.Config.Env = candidateRecord.Config.Env.map((entry) => entry.startsWith('FIREBASE_AUTH_ENABLED=') ? 'FIREBASE_AUTH_ENABLED=true' : entry.startsWith('SIT_STAGING_ALLOWED_USER_IDS=') ? `SIT_STAGING_ALLOWED_USER_IDS=${enrolledAllowedIds}` : entry);
    if (candidateAuthOverride) candidateRecord.Config.Env = candidateRecord.Config.Env.map((entry) => entry.startsWith(`${candidateAuthOverride.key}=`) ? `${candidateAuthOverride.key}=${candidateAuthOverride.value}` : entry);
    const recoveryFinalRecord = (running = false, attached = false) => ({
      Id: 'a'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: running },
      NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: running ? targetNetworkId : '' }, ...(attached ? { [greenTarget.providerNetwork]: { NetworkID: running ? providerNetworkId : '' } } : {}) } },
      Config: { ...candidateRecord.Config, Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': plan.target.runId, 'com.shareittoo.green.execution_id': plan.isolated.executionId } },
      HostConfig: { GroupAdd: ['65532'], NetworkMode: targetNetworkId }, Mounts: finalMounts,
    });
    const fake = async (command, args, options = {}) => {
      calls.push({ command, args, phase: options.phase, env: options.env });
      const phase = options.phase;
      if (readOnly?.failPhase === phase) return { code: 1, stdout: '' };
      if (readOnly?.overrides?.[phase] !== undefined) return { stdout: readOnly.overrides[phase] };
      if (phase.endsWith('_post_enrollment_identity_readback')) {
        if (phase === 'isolated_post_enrollment_identity_readback') assert.equal(args[1], isolatedDatabaseId);
        return { stdout: phase === missingEnrollmentPhase ? '0\n' : '1\n' };
      }
      if (phase.startsWith('recovery_')) {
        const recoveryPhase = phase.slice('recovery_'.length);
        if (recoveryPhase === 'canonical_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
        if (recoveryPhase === 'canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
        if (recoveryPhase === 'canonical_post_enrollment_identity_readback') return { stdout: '1\n' };
        if (recoveryPhase === 'successor_identity_readback') {
          if (args.at(-1) === greenTarget.apiContainer && !recoveryRecord) return { code: 1, stdout: '' };
          return { stdout: JSON.stringify(recoveryRecord ?? recoveryFinalRecord(false, false)) };
        }
        if (recoveryPhase === 'successor_exact_id_readback') return { stdout: JSON.stringify(recoveryRecord) };
        if (recoveryPhase === 'final_name_absence_readback') return { stdout: '' };
        if (recoveryPhase === 'final_create_no_host_port') {
          recoveryRecord = recoveryFinalRecord(false, false);
          assert.equal(args.at(-1), `${plan.runtime.image}@${plan.runtime.digest}`);
          return { stdout: `${recoveryRecord.Id}\n` };
        }
        if (recoveryPhase === 'final_provider_network_attach') {
          recoveryRecord = recoveryFinalRecord(false, true);
          return { stdout: '' };
        }
        if (recoveryPhase === 'final_start') {
          recoveryRecord = recoveryFinalRecord(true, true);
          return { stdout: '' };
        }
        if (recoveryPhase === 'final_image_readback') return { stdout: JSON.stringify(imageReadback) };
        if (recoveryPhase === 'final_inventory_readback') return { stdout: JSON.stringify(recoveryRecord) };
        if (recoveryPhase === 'final_health_probe' || recoveryPhase === 'final_ready_wait') return { stdout: JSON.stringify(payload) };
        if (recoveryPhase === 'final_version_readback') return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
      }
      if (phase === 'final_create_no_host_port') {
        recoveryRecord = recoveryFinalRecord(false, false);
        assert.equal(args.at(-1), `${plan.runtime.image}@${plan.runtime.digest}`);
        return { stdout: `${recoveryRecord.Id}\n` };
      }
      if (phase === 'final_provider_network_attach') {
        assert.deepEqual(args, ['network', 'connect', providerNetworkId, recoveryRecord.Id]);
        recoveryRecord = recoveryFinalRecord(false, true);
        return { stdout: '' };
      }
      if (phase === 'final_prestart_identity_readback') return { stdout: JSON.stringify(recoveryRecord) };
      if (phase === 'final_start') {
        assert.deepEqual(args, ['start', recoveryRecord.Id]);
        recoveryRecord = recoveryFinalRecord(true, true);
        return { stdout: '' };
      }
      if (phase === 'target_container_set_readback') return { stdout: targetSet };
      if (phase === 'target_inventory_api') return { stdout: JSON.stringify([prePromotionRecord(image)]) };
      if (phase === 'target_inventory_database') return { stdout: JSON.stringify([databaseRecord]) };
      if (phase === 'target_inventory_network') return { stdout: JSON.stringify([{ Id: targetNetworkId, Name: greenTarget.network, Internal: true }]) };
      if (phase === 'target_inventory_provider_network') return { stdout: JSON.stringify([{ Id: providerNetworkId, Name: greenTarget.providerNetwork }]) };
      if (phase === 'target_inventory_uploads') return { stdout: JSON.stringify([{ Name: greenTarget.uploadsVolume }]) };
      if (phase.startsWith('retained_sealed_inventory_readback_')) {
        const descriptor = greenTarget.retainedSealed[Number(phase.slice('retained_sealed_inventory_readback_'.length))];
        return { stdout: JSON.stringify({ Name: `/${descriptor.name}`, Image: descriptor.imageDigest, State: { Running: false }, Config: { Image: descriptor.image, Labels: { 'com.shareittoo.sit.green': descriptor.greenLabel, 'com.shareittoo.sit.green.run_id': descriptor.runId } } }) };
      }
      if (phase === 'runtime_image_readback') return { stdout: JSON.stringify(imageReadback) };
      if (phase === 'isolated_network_create') return { stdout: `${isolatedNetworkId}\n` };
      if (phase === 'isolated_network_identity_readback') return { stdout: JSON.stringify({ Id: isolatedNetworkId, Name: plan.isolated.network, Internal: true, Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } }) };
      if (phase === 'isolated_postgres_create') return { stdout: `${isolatedDatabaseId}\n` };
      if (phase === 'isolated_postgres_identity_readback') {
        const postgresRecord = {
          Id: isolatedDatabaseId,
          Name: `/${plan.isolated.database}`,
          State: { Running: false },
          Config: { Image: 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } },
          HostConfig: { PortBindings: null, NetworkMode: isolatedNetworkId },
          NetworkSettings: { Ports: { '5432/tcp': null }, Networks: { [plan.isolated.network]: { NetworkID: '' } } },
          Mounts: [{ Type: 'volume', Name: 'anonymous-postgres-data', Destination: '/var/lib/postgresql/data', RW: true }],
        };
        const overrideRecord = {
          ...postgresRecord,
          ...postgresIdentityOverrides,
          HostConfig: { ...postgresRecord.HostConfig, ...(postgresIdentityOverrides.HostConfig ?? {}) },
          NetworkSettings: { ...postgresRecord.NetworkSettings, ...(postgresIdentityOverrides.NetworkSettings ?? {}) },
        };
        return { stdout: JSON.stringify(overrideRecord) };
      }
      if (phase === 'candidate_acceptance_create') return { stdout: `${candidateId}\n` };
      if (phase === 'candidate_mfa_identity_probes') {
        assert.equal(options.env.STAGING_ACCEPTANCE_CONTAINER, candidateId);
        const probe = await runMfaProbe({
          container: options.env.STAGING_ACCEPTANCE_CONTAINER,
          commandRunner: async (probeCommand, probeArgs, probeInput, probeOptions) => {
            assert.equal(probeCommand, 'docker');
            assert.deepEqual(probeArgs, ['exec', '-i', candidateId, 'node', '--input-type=module']);
            assert.equal(probeOptions.phase, 'mfa_probe');
            assert.match(probeInput, /\/auth\/mfa\/enroll/u);
            assert.match(probeInput, /\/identity-verification\/session/u);
            return JSON.stringify({ mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' });
          },
        });
        assert.deepEqual(probe, { mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' });
        return { stdout: JSON.stringify(probe) };
      }
      if (phase === 'candidate_prestart_identity_readback') return { stdout: JSON.stringify(candidateRecord) };
      if (phase === 'source_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
      if (phase === 'source_migration_ledger_readback') return { stdout: sourceMigrationLedger };
      if (phase === 'source_database_state_readback_before' || phase === 'final_database_state_readback_after') return { stdout: databaseStateReadback };
      if (phase === 'canonical_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
      if (phase === 'canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
      if (phase === 'source_foreign_writer_readback_before_backup') return { stdout: foreignBefore };
      if (phase === 'source_foreign_writer_readback_after_backup') return { stdout: foreignAfter };
      if (phase === 'quiesce_green_api_verify') return { stdout: 'false\n' };
      if (phase === 'isolated_postgres_init_complete_log_readback') return { stdout: initLog };
      if (phase === 'isolated_postgres_stable_select_1') return { stdout: '1\n' };
      if (phase === 'isolated_postgres_stable_select_2') return { stdout: stableSelect2 };
      if (phase === 'isolated_migration_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
      if (phase === 'isolated_migration_ledger_readback') return { stdout: isolatedLedger };
      if (phase === 'isolated_finding_fingerprint_readback') return { stdout: emptyFindingFingerprint };
      if (phase === 'candidate_finding_fingerprint_readback') return { stdout: candidateFinding };
      if (phase === 'candidate_public_catalog_readback') return { stdout: catalogPublicReadback(null) };
      if (phase === 'final_public_catalog_readback') return { stdout: catalogPublicReadback(true) };
      if (phase === 'candidate_cleanup') assert.deepEqual(args, ['rm', '--force', '--volumes', candidateId]);
      if (phase === 'isolated_database_cleanup') assert.deepEqual(args, ['rm', '--force', '--volumes', isolatedDatabaseId]);
      if (phase === 'isolated_network_cleanup') assert.deepEqual(args, ['network', 'rm', isolatedNetworkId]);
      if (phase === 'candidate_cleanup_verify') assert.deepEqual(args, ['ps', '--all', '--filter', `id=${candidateId}`, '--format', '{{.ID}}']);
      if (phase === 'isolated_database_cleanup_verify') assert.deepEqual(args, ['ps', '--all', '--filter', `id=${isolatedDatabaseId}`, '--format', '{{.ID}}']);
      if (phase === 'isolated_network_cleanup_verify') assert.deepEqual(args, ['network', 'ls', '--filter', `id=${isolatedNetworkId}`, '--format', '{{.ID}}']);
      if (phase === 'failure_candidate_remove') assert.deepEqual(args, ['rm', '--force', '--volumes', candidateId]);
      if (phase === 'failure_isolated_database_remove') assert.deepEqual(args, ['rm', '--force', '--volumes', isolatedDatabaseId]);
      if (phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify({ ...prePromotionRecord(image), Name: `/${greenTarget.sealedApiContainer}` }) };
      if (phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
      if (phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
      if (phase === 'failure_restore_current_api_identity_after_rename' || phase === 'failure_restore_green_api_identity_verify') return { stdout: JSON.stringify(prePromotionRecord(image)) };
      if (phase === 'failure_candidate_identity_readback') return { stdout: JSON.stringify({ Id: candidateId, Name: `/${plan.isolated.candidate}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } }) };
      if (phase === 'failure_isolated_database_identity_readback') return { stdout: JSON.stringify({ Id: isolatedDatabaseId, Name: `/${plan.isolated.database}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } }) };
      if (phase === 'failure_isolated_network_identity_readback') return { stdout: JSON.stringify({ Id: isolatedNetworkId, Name: plan.isolated.network, Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } }) };
      if (phase === 'candidate_runtime_flags_readback') return { stdout: JSON.stringify({ CORS_ORIGINS: greenWebCorsOrigins, DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, ...greenPublicFixtureProfile, googleRegistrationAllowlistEmpty: true, ...(postEnrollment ? { FIREBASE_AUTH_ENABLED: 'true', ...summarizeGreenAllowedIds(enrolledAllowedIds) } : {}) }) };
      if (phase === 'candidate_health_and_feature_probes' || phase === 'candidate_ready_probe') return { stdout: JSON.stringify(payload) };
      if (phase === 'candidate_version_probe') return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
      if (phase === 'fresh_protected_backup') return { stdout: 'synthetic protected backup' };
      if (phase === 'isolated_restore') {
        rmSync(options.inputFile, { force: true });
        assert.ok(Buffer.isBuffer(options.inputBytes));
        assert.equal(options.inputDigest, crypto.createHash('sha256').update(options.inputBytes).digest('hex'));
        return restoreCode === undefined ? { stdout: '' } : { stdout: '', code: restoreCode };
      }
      if (phase === stopAtPhase) throw Object.assign(new Error(`stop at ${stopAtPhase}`), { code: stopAtPhase === 'quiesce_green_api' ? 'test_stop_before_quiesce' : 'test_stop_at_phase' });
      if (phase === 'failure_restore_green_api_verify') return { stdout: 'true\n' };
      return { stdout: '' };
    };
    let result;
    try {
      result = await runGreenPromotion({
        plan, config: runtimeConfig, configFile, environment: readOnly?.environment ?? (readOnly ? {} : {
          GREEN_STAGING_PROMOTION_EXECUTE: '1', GREEN_STAGING_PROMOTION_CONFIRM: runtimeCommit,
        }), ...(readOnly ? {} : { execute: true }), command: fake, executableAvailable: async (name) => !readOnly || name === 'docker', assertRuntimeFiles: async () => {},
      });
      if (!readOnly) assert.fail('promotion should stop before quiesce');
    } catch (error) {
      result = error;
    }
    return { calls, result };
  };
  const expectedReversible = buildGreenPromotionCommands({ plan, configFile, config: runtimeConfig })
    .slice(0, buildGreenPromotionCommands({ plan, configFile, config: runtimeConfig }).findIndex((entry) => entry.phase === 'quiesce_green_api'))
    .map((entry) => entry.phase);
  const preflight = (options = {}, image = prePromotionImageReference) => fakeRun(image, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, options);
  const beforeFiles = readdirSync(root);
  const beforeEnv = readFileSync(configFile);
  for (const environment of [{}, { GREEN_STAGING_PROMOTION_EXECUTE: '1', GREEN_STAGING_PROMOTION_CONFIRM: runtimeCommit }]) {
    const readOnly = await preflight({ environment });
    assert.equal(readOnly.result.status, 'preflight-passed-no-mutation');
    assert.equal(readOnly.result.configDigest, crypto.createHash('sha256').update(beforeEnv).digest('hex'));
    assert.deepEqual(Object.keys(readOnly.result).sort(), ['status', 'targetDigest', 'configDigest', 'inventoryDigest', 'runtimeCommit', 'runtimeImageDigest', 'runtimePublicationRunId', 'runtimePublicationManifestDigest', 'opsCommit', 'sourceLedgerDigest'].sort());
    assert.equal(readOnly.result.runtimePublicationRunId, greenSuccessorRuntime.publicationRunId);
    assert.equal(readOnly.result.runtimePublicationManifestDigest, greenSuccessorRuntime.publicationManifestDigest);
    assert.deepEqual(readOnly.calls.map((entry) => entry.phase), expectedReversible);
    assert.equal(readOnly.calls.length, 32);
    for (const [key, value] of Object.entries(readOnly.result)) {
      if (key !== 'status' && key !== 'runtimePublicationRunId') assert.match(value, /^(?:sha256:)?[0-9a-f]{40,64}$/u, key);
    }
    assert.deepEqual(readdirSync(root), beforeFiles, 'no evidence, backup, or isolated env created');
    assert.deepEqual(readFileSync(configFile), beforeEnv);
  }
  for (const failPhase of expectedReversible) {
    const rejected = await preflight({ failPhase });
    assert.equal(rejected.result.code, `green_${failPhase}_failed`);
    assert.equal(rejected.result.cleanup, undefined);
    assert.deepEqual(rejected.calls.map((entry) => entry.phase), expectedReversible.slice(0, expectedReversible.indexOf(failPhase) + 1));
    assert.deepEqual(readdirSync(root), beforeFiles);
  }
  for (const overrides of [
    { sealed_name_conflict_check: 'occupied' },
    { source_schema_readback: '097_stale.up.sql' },
    { source_migration_ledger_readback: 'drift' },
    { source_post_enrollment_identity_readback: '0' },
    { runtime_image_readback: JSON.stringify({ ...imageReadback, RepoDigests: [] }) },
    { retained_sealed_inventory_readback_14: '{}' },
    { target_inventory_network: JSON.stringify({ Id: 'f'.repeat(64), Name: greenTarget.network, Internal: true }) },
  ]) {
    const rejected = await preflight({ overrides });
    assert.ok(rejected.result.code, Object.keys(overrides).join(','));
    assert.equal(rejected.result.cleanup, undefined);
    assert.equal(rejected.calls.some((entry) => !expectedReversible.includes(entry.phase)), false);
    assert.deepEqual(readdirSync(root), beforeFiles);
  }
  const stalePredecessor = await preflight({}, 'ghcr.io/shareittoo/shareittoo-api:5d3b42613da73451e9d9169a7b99ca1aba0c4227');
  assert.ok(stalePredecessor.result.code);
  assert.deepEqual(readdirSync(root), beforeFiles);
  const good = await fakeRun(prePromotionImageReference);
  assert.equal(good.result?.code, 'test_stop_before_quiesce', `${good.result?.message ?? 'no-error'} :: ${good.calls.map((entry) => entry.phase).join('|')}`);
  const quiesceIndex = good.calls.findIndex((entry) => entry.phase === 'quiesce_green_api');
  assert.ok(quiesceIndex > 0);
  for (const [key, value] of postEnrollment ? [
    ['FIREBASE_AUTH_ENABLED', 'false'],
    ['SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'true'],
    ['SIT_STAGING_ALLOWED_USER_IDS', enrolledAllowedIds.split(',').slice(0, -1).join(',')],
    ['SIT_STAGING_ALLOWED_USER_IDS', `${enrolledAllowedIds},unapproved`],
    ['SIT_STAGING_ALLOWED_USER_IDS', enrolledAllowedIds.split(',').reverse().join(',')],
  ] : [['FIREBASE_AUTH_ENABLED', 'true']]) {
    const previous = envValues[key];
    envValues[key] = value;
    const rejected = await fakeRun(prePromotionImageReference);
    envValues[key] = previous;
    assert.equal(rejected.calls.some((entry) => entry.phase === 'quiesce_green_api'), false, key);
    assert.match(rejected.result.code, /green_(?:post_enrollment|runtime_prestate)/u);
  }
  if (postEnrollment) {
    for (const [key, value] of [
      ['FIREBASE_AUTH_ENABLED', 'false'], ['SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'true'],
      ['SIT_STAGING_ALLOWED_USER_IDS', enrolledAllowedIds.split(',').slice(0, -1).join(',')],
      ['SIT_STAGING_ALLOWED_USER_IDS', `${enrolledAllowedIds},unapproved`],
    ]) {
      candidateAuthOverride = { key, value };
      const rejected = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'candidate_start');
      assert.equal(rejected.calls.some((entry) => entry.phase === 'candidate_start'), false, key);
      assert.equal(rejected.result.cleanup.restored, true, key);
      rmSync(`${evidenceFile}.pgdump`, { force: true });
    }
    candidateAuthOverride = null;
    missingEnrollmentPhase = 'source_post_enrollment_identity_readback';
    const notEnrolled = await fakeRun(prePromotionImageReference);
    assert.equal(notEnrolled.result.code, 'green_post_enrollment_identity_missing');
    assert.equal(notEnrolled.calls.some((entry) => entry.phase === 'quiesce_green_api'), false);
    missingEnrollmentPhase = null;
  }
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  for (const [label, postgresIdentityOverrides] of [
    ['wrong NetworkMode', { HostConfig: { NetworkMode: 'bridge' } }],
    ['empty NetworkMode', { HostConfig: { NetworkMode: '' } }],
    ['network-name NetworkMode', { HostConfig: { NetworkMode: plan.isolated.network } }],
    ['wrong nonempty NetworkID', { NetworkSettings: { Networks: { [plan.isolated.network]: { NetworkID: '6'.repeat(64) } } } }],
    ['additional network', { NetworkSettings: { Networks: { [plan.isolated.network]: { NetworkID: '' }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } } }],
  ]) {
    rmSync(`${evidenceFile}.pgdump`, { force: true });
    const invalidPostgres = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_postgres_start', undefined, postgresIdentityOverrides);
    assert.equal(invalidPostgres.result?.code, 'green_isolated_database_network_identity_invalid', label);
    assert.equal(invalidPostgres.calls.some((entry) => entry.phase === 'isolated_postgres_start'), false, label);
  }
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  for (const invalidTargetSet of [
    `${greenTarget.apiContainer}\t\t\ttrue\t${greenTarget.runId}\n`,
    `${targetContainerSet}${'sit-green-extra\t\t\ttrue\textra\n'}`,
    `${greenTarget.apiContainer}\t\t\t\t${greenTarget.runId}\n${greenTarget.databaseContainer}\t\t\ttrue\t\n`,
    `${greenTarget.apiContainer}\tsit-staging\t\ttrue\t${greenTarget.runId}\n${greenTarget.databaseContainer}\t\t\ttrue\t\n`,
    `${targetContainerSet}shareittoo-staging-api-lookalike\t\t\t\t\n`,
  ]) {
    const invalidTarget = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', invalidTargetSet);
    assert.equal(invalidTarget.result?.code, 'green_target_container_set_invalid');
    assert.equal(invalidTarget.calls.some((entry) => entry.phase === 'quiesce_green_api'), false);
  }
  const preservedExitedGreen = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', `${targetContainerSet}shareittoo-staging-postgres\t sit-staging\t\t\t\n`);
  assert.equal(preservedExitedGreen.result?.code, 'test_stop_before_quiesce');
  const foreignWriter = JSON.stringify([{ role: 'foreign', application: 'staging-api', client: '10.0.0.2', state: 'active' }]);
  const writerBefore = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, foreignWriter, '[]\n', emptyFindingFingerprint, 'source_foreign_writer_readback_before_backup');
  assert.equal(writerBefore.result?.code, 'green_foreign_writer_present');
  assert.equal(writerBefore.calls.some((entry) => entry.phase === 'fresh_protected_backup'), false);
  const writerAfter = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', foreignWriter, emptyFindingFingerprint, 'source_foreign_writer_readback_after_backup');
  assert.equal(writerAfter.result?.code, 'green_foreign_writer_present');
  assert.equal(writerAfter.calls.some((entry) => entry.phase === 'fresh_protected_backup'), true);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const invalidIsolatedLedger = await fakeRun(prePromotionImageReference, 'bad-ledger\n', undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_migration_ledger_readback');
  assert.equal(invalidIsolatedLedger.result?.code, 'green_isolated_migration_ledger_invalid');
  assert.equal(invalidIsolatedLedger.result?.cleanup?.clean, true);
  assert.deepEqual(invalidIsolatedLedger.calls.find((entry) => entry.phase === 'failure_isolated_network_remove')?.args, ['network', 'rm', isolatedNetworkId]);
  assert.equal(invalidIsolatedLedger.calls.some((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const missingInitMarker = await fakeRun(prePromotionImageReference, currentMigrationLedger, '', '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_postgres_init_complete_log_readback');
  assert.equal(missingInitMarker.result?.code, 'green_isolated_init_complete_log_invalid');
  assert.equal(missingInitMarker.calls.some((entry) => entry.phase === 'isolated_restore'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const readinessOnlyMarker = await fakeRun(prePromotionImageReference, currentMigrationLedger, 'database system is ready to accept connections\n', '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_postgres_init_complete_log_readback');
  assert.equal(readinessOnlyMarker.result?.code, 'green_isolated_init_complete_log_invalid');
  assert.equal(readinessOnlyMarker.calls.some((entry) => entry.phase === 'isolated_restore'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const missingSecondStableSelect = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_postgres_stable_select_2');
  assert.equal(missingSecondStableSelect.result?.code, 'green_isolated_stable_select_2_invalid');
  assert.equal(missingSecondStableSelect.calls.some((entry) => entry.phase === 'isolated_restore'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const findingDrift = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', JSON.stringify({ paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'a'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h' }], supportNextUpdateOverdue: [] }), 'candidate_finding_fingerprint_readback');
  assert.equal(findingDrift.result?.code, 'green_finding_fingerprint_drift');
  assert.equal(findingDrift.calls.some((entry) => entry.phase === 'candidate_health_and_feature_probes'), false);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'candidate_provider_network_attach')?.args, ['network', 'connect', providerNetworkId, candidateId]);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'candidate_start')?.args, ['start', candidateId]);
  const isolatedPostgresCreate = findingDrift.calls.find((entry) => entry.phase === 'isolated_postgres_create');
  assert.equal(isolatedPostgresCreate?.args[isolatedPostgresCreate.args.indexOf('--network') + 1], isolatedNetworkId);
  assert.equal(isolatedPostgresCreate?.args.includes(plan.isolated.network), false);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'failure_candidate_remove')?.args, ['rm', '--force', '--volumes', candidateId]);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'failure_isolated_database_remove')?.args, ['rm', '--force', '--volumes', isolatedDatabaseId]);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const restoreZero = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_integrity_and_functional_probes', 0);
  assert.equal(restoreZero.result?.code, 'test_stop_at_phase');
  assert.ok(restoreZero.calls.findIndex((entry) => entry.phase === 'isolated_restore') < restoreZero.calls.findIndex((entry) => entry.phase === 'isolated_integrity_and_functional_probes'));
  assert.equal(restoreZero.calls.some((entry) => entry.phase === 'candidate_cleanup'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const restoreNonzero = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_integrity_and_functional_probes', 7);
  assert.equal(restoreNonzero.result?.code, 'green_isolated_restore_failed');
  assert.equal(restoreNonzero.calls.some((entry) => entry.phase === 'isolated_integrity_and_functional_probes'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const cleanupBindings = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'canonical_idempotent_migration_98_to_98');
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'candidate_cleanup')?.args[3], candidateId);
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'candidate_cleanup_verify')?.args[3], `id=${candidateId}`);
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'isolated_database_cleanup_verify')?.args[3], `id=${isolatedDatabaseId}`);
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'isolated_network_cleanup_verify')?.args[3], `id=${isolatedNetworkId}`);
  assert.equal(cleanupBindings.result?.forwardRecovery?.status, 'verified');
  const cleanupLast = Math.max(...cleanupBindings.calls.map((entry) => entry.phase.startsWith('failure_') ? cleanupBindings.calls.indexOf(entry) : -1));
  const recoveryFirst = cleanupBindings.calls.findIndex((entry) => entry.phase === 'recovery_canonical_schema_readback');
  assert.ok(cleanupLast >= 0 && recoveryFirst > cleanupLast);
  assert.equal(cleanupBindings.calls.some((entry) => entry.phase === 'failure_final_api_remove'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });

  const lateFinalFailure = await fakeRun(prePromotionImageReference, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'final_image_readback');
  assert.equal(lateFinalFailure.result?.code, 'test_stop_at_phase');
  assert.equal(lateFinalFailure.result?.cleanup?.clean, true);
  assert.equal(lateFinalFailure.result?.forwardRecovery?.status, 'verified');
  const lateCleanupLast = Math.max(...lateFinalFailure.calls.map((entry) => entry.phase.startsWith('failure_') ? lateFinalFailure.calls.indexOf(entry) : -1));
  const lateRecoveryFirst = lateFinalFailure.calls.findIndex((entry) => entry.phase === 'recovery_canonical_schema_readback');
  assert.ok(lateCleanupLast >= 0 && lateRecoveryFirst > lateCleanupLast);
  const finalId = lateFinalFailure.calls.find((entry) => entry.phase === 'final_create_no_host_port')?.args.at(-1);
  assert.equal(finalId, `${plan.runtime.image}@${plan.runtime.digest}`);
  const finalContainerId = 'a'.repeat(64);
  assert.deepEqual(lateFinalFailure.calls.find((entry) => entry.phase === 'final_prestart_identity_readback')?.args, ['inspect', '--format', '{{json .}}', finalContainerId]);
  assert.deepEqual(lateFinalFailure.calls.find((entry) => entry.phase === 'recovery_final_inventory_readback')?.args, ['inspect', '--format', '{{json .}}', finalContainerId]);
  assert.equal(lateFinalFailure.calls.some((entry) => /failure_final_api_(?:identity_readback|remove|verify)/u.test(entry.phase)), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  assert.deepEqual(good.calls.slice(0, quiesceIndex).map((entry) => entry.phase), expectedReversible);
  const provisionEntries = buildGreenPromotionCommands({ plan, configFile, config: runtimeConfig })
    .filter((entry) => entry.phase.startsWith('synthetic_sandbox_provision_'));
  assert.equal(provisionEntries.length, 2);
  for (const entry of provisionEntries) {
    assert.equal(entry.command, 'docker');
    assert.ok(entry.args.includes('--user') && entry.args.includes('100:101'));
    assert.ok(entry.args.includes('--group-add') && entry.args.includes('65532'));
    assert.ok(entry.args.includes('--entrypoint') && entry.args.includes('node'));
    assert.ok(entry.args.includes(`${plan.runtime.image}@${plan.runtime.digest}`));
    assert.ok(entry.args.includes('/app/ops/provision_synthetic_sandbox_user.mjs'));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/app/ops/provision_synthetic_sandbox_user.mjs,readonly')));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/app/ops/stable_private_file.mjs,readonly')));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/run/secrets/mfa-encryption-key,readonly')));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/run/secrets/firebase-service-account.json,readonly')));
    assert.ok(entry.args.includes(`type=bind,src=${syntheticSandboxCredentialFilePath},dst=/run/secrets/synthetic-sandbox-user-password,readonly`));
    assert.ok(entry.args.includes('--env') && entry.args.includes('SYNTHETIC_SANDBOX_PASSWORD_FILE=/run/secrets/synthetic-sandbox-user-password'));
    assert.ok(entry.args.includes('--network'));
  }
  const isolatedProvision = provisionEntries.find((entry) => entry.phase === 'synthetic_sandbox_provision_isolated');
  const canonicalProvision = provisionEntries.find((entry) => entry.phase === 'synthetic_sandbox_provision_canonical');
  assert.ok(isolatedProvision.args.includes(plan.isolated.network));
  assert.ok(isolatedProvision.args.includes(configFile) && isolatedProvision.args.includes(plan.isolated.envFile));
  assert.ok(isolatedProvision.args.includes('SIT_GREEN_REHEARSAL=1'));
  assert.ok(canonicalProvision.args.includes(plan.target.network));
  assert.ok(canonicalProvision.args.includes(configFile));
  assert.equal(canonicalProvision.args.includes(plan.isolated.envFile), false);
  assert.equal(good.calls.find((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'), undefined);
  assert.equal(good.calls.find((entry) => entry.phase === 'synthetic_sandbox_provision_canonical'), undefined);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const badImage = await fakeRun('shareittoo-api-wrong:old');
  assert.equal(badImage.result.code, 'green_prepromotion_tuple_mismatch');
  assert.equal(badImage.calls.some((entry) => entry.phase === 'quiesce_green_api'), false);
  rmSync(root, { recursive: true, force: true });
});

test('command executor bindings keep isolated probes and canonical runtime distinct', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.equal(assertGreenCommandBindings(commands, plan, config.envFile), true);
  const isolated = commands.find((entry) => entry.phase === 'isolated_integrity_and_functional_probes');
  assert.equal(isolated.runtimeEnv.DATABASE_CONTAINER, plan.isolated.database);
  assert.equal(isolated.runtimeEnv.DATABASE_NAME, plan.isolated.databaseName);
  assert.notEqual(isolated.runtimeEnv.DATABASE_NAME, greenTarget.databaseName);
  const canonical = commands.find((entry) => entry.phase === 'canonical_idempotent_migration_98_to_98');
  assert.equal(canonical.envFile, config.envFile);
  assert.ok(canonical.args.includes(config.envFile));
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  assert.ok(candidate.args.indexOf(config.envFile) < candidate.args.indexOf(plan.isolated.envFile));
  assert.equal(plan.candidateMounts.length, 4);
  assert.deepEqual(plan.candidateMounts.map((mount) => mount.destination).sort(), [
    '/data/uploads', '/run/secrets/firebase-service-account.json',
    '/run/secrets/mfa-encryption-key', '/run/secrets/synthetic-sandbox-user-password',
  ]);
  assert.equal(plan.finalMounts.length, 3);
  for (const entry of commands.filter(({ phase }) => ['candidate_acceptance_create', 'final_create_no_host_port'].includes(phase))) {
    assert.equal(entry.args.some((arg) => /STRIPE_(?:SECRET|WEBHOOK)|stripe-(?:key|webhook)/iu.test(arg)), false, `${entry.phase} must not mount Stripe credentials`);
  }
  assert.ok(commands.find((entry) => entry.phase === 'isolated_postgres_wait').args.join(' ').includes('pg_isready'));
  assert.ok(commands.find((entry) => entry.phase === 'candidate_health_and_feature_probes').args.includes('--retry'));
  assert.ok(commands.find((entry) => entry.phase === 'final_live_wait').args.includes('--retry'));
  const candidateHealthProbe = commands.find((entry) => entry.phase === 'candidate_health_and_feature_probes');
  const finalHealthProbe = commands.find((entry) => entry.phase === 'final_health_probe');
  assert.equal(new URL(candidateHealthProbe.args.at(-1)).pathname, '/health/ready');
  assert.equal(new URL(finalHealthProbe.args.at(-1)).pathname, '/api/health/ready');
  const accessConfiguration = readStagingAccessConfiguration({
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919',
  });
  for (const path of [
    new URL(candidateHealthProbe.args.at(-1)).pathname,
    new URL(finalHealthProbe.args.at(-1)).pathname.replace(/^\/api(?=\/)/u, ''),
  ]) {
    assert.equal(stagingAnonymousPathAllowed(accessConfiguration, { method: 'GET', path }), true, `${path} must be access-gate allowlisted`);
    assert.equal(stagingAnonymousPathAllowed(accessConfiguration, { method: 'HEAD', path }), true, `${path} HEAD must be access-gate allowlisted`);
  }
  assert.equal(stagingAnonymousPathAllowed(accessConfiguration, { method: 'GET', path: '/health' }), false);
  for (const entry of commands.filter(({ command, args }) => command === 'curl' && args.includes('--retry'))) {
    assert.ok(entry.args.includes('--retry-all-errors'), `${entry.phase} must retry transient read errors`);
    assert.equal(entry.args[entry.args.indexOf('--retry') + 1], '30');
    assert.equal(entry.args[entry.args.indexOf('--retry-delay') + 1], '1');
  }
});

test('repeat-promotion inventory requires the exact Green DB host and retained final mount cohort', () => {
  const base = {
    api: { name: greenTarget.apiContainer, greenLabel: false, prePromotionTuple: true, hostPorts: 0, running: true, networks: [greenTarget.network, greenTarget.providerNetwork], image: prePromotionImageReference, user: 'shareittoo', databaseHost: greenTarget.databaseContainer, databaseName: greenTarget.databaseName, databaseUser: greenTarget.databaseUser, uploadsVolume: greenTarget.uploadsVolume, groupAdd: true, mounts: sourceMounts },
    database: { name: greenTarget.databaseContainer, greenLabel: true, running: true }, network: { name: greenTarget.network, internal: true }, providerNetwork: { name: greenTarget.providerNetwork }, uploadsVolume: { name: greenTarget.uploadsVolume }, schema: 98,
  };
  assert.equal(assertGreenContainerInventory(base, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), true);
  assert.equal(assertGreenContainerInventory({ ...base, api: { ...base.api, greenLabel: true, prePromotionTuple: false } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), true);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, greenLabel: false, prePromotionTuple: false } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_inventory_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, databaseHost: 'legacy-db' } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.slice(0, -1) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.map((mount) => { const copy = { ...mount }; delete copy.readOnly; return copy; }) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_mount_rw_readback_invalid/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.map((mount) => mount.destination === '/run/secrets/mfa-encryption-key' ? { ...mount, source: '/wrong/path' } : mount) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: [...base.api.mounts, { destination: '/run/secrets/technical-sandbox-key', type: 'bind', source: config.technicalSandboxKeyFile, volume: null, readOnly: true }, { destination: '/run/secrets/technical-sandbox-webhook', type: 'bind', source: config.technicalSandboxWebhookFile, volume: null, readOnly: true }] } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.map((mount) => mount.destination === '/run/secrets/mfa-encryption-key' ? { ...mount, type: 'volume', volume: greenTarget.uploadsVolume, source: null } : mount) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.equal(assertGreenRuntimeConfig(config).mounts.length, 5);
  assert.equal(buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' }).finalMounts.length, 3);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, mounts: [...config.mounts, { source: '/foreign/provider-key', destination: '/run/secrets/extra', readOnly: true }] }), /green_mount_inventory_invalid/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, prePromotionTuple: true, greenLabel: true, image: 'ghcr.io/shareittoo/shareittoo-api:wrong' } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
});

test('final readback binds topology and required post-enrollment cohort', () => {
  const postEnrollment = true;
  const plan = buildGreenPromotionPlan({ targetManifest: postEnrollment ? enrolledTargetManifest() : targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const record = {
    Id: 'a'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId, 'com.shareittoo.green.execution_id': plan.isolated.executionId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'], NetworkMode: targetNetworkId }, Mounts: finalMounts,
  };
  const expectedNetworkIds = { [greenTarget.network]: targetNetworkId, [greenTarget.providerNetwork]: providerNetworkId };
  if (postEnrollment) {
    record.Config.Env = record.Config.Env.map((entry) => entry.startsWith('FIREBASE_AUTH_ENABLED=') ? 'FIREBASE_AUTH_ENABLED=true' : entry.startsWith('SIT_STAGING_ALLOWED_USER_IDS=') ? `SIT_STAGING_ALLOWED_USER_IDS=${enrolledAllowedIds}` : entry);
    for (const [key, value] of [
      ['FIREBASE_AUTH_ENABLED', 'false'], ['SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'true'],
      ['SIT_STAGING_ALLOWED_USER_IDS', enrolledAllowedIds.split(',').slice(0, -1).join(',')],
      ['SIT_STAGING_ALLOWED_USER_IDS', `${enrolledAllowedIds},extra`],
      ['SIT_STAGING_ALLOWED_USER_IDS', enrolledAllowedIds.split(',').reverse().join(',')],
    ]) {
      const drifted = { ...record, Config: { ...record.Config, Env: record.Config.Env.map((entry) => entry.startsWith(`${key}=`) ? `${key}=${value}` : entry) } };
      assert.throws(() => assertGreenFinalContainerReadback({ record: drifted, plan, expectedId: record.Id, expectedNetworkIds }), /green_(?:post_enrollment|broad_promotion|runtime)/u);
    }
  }
  assert.equal(assertGreenFinalContainerReadback({ record, plan, expectedId: record.Id, expectedNetworkIds }), true);
  assert.deepEqual(summarizeGreenFinalContainerReadback(record, plan, expectedNetworkIds, record.Id).syntheticCatalog, {
    enabled: true,
    ...greenPublicFixtureProfile,
  });
  for (const environmentEntries of [
    record.Config.Env.filter((entry) => !entry.startsWith('SIT_STAGING_SYNTHETIC_CATALOG_ENABLED=')),
    record.Config.Env.map((entry) => entry.startsWith('SIT_STAGING_SYNTHETIC_CATALOG_ENABLED=') ? 'SIT_STAGING_SYNTHETIC_CATALOG_ENABLED=false' : entry),
    [...record.Config.Env, 'SIT_STAGING_SYNTHETIC_CATALOG_ENABLED=true'],
    record.Config.Env.filter((entry) => !entry.startsWith('SIT_STAGING_PUBLIC_LISTING_IDS=')),
    record.Config.Env.map((entry) => entry.startsWith('SIT_STAGING_PUBLIC_UPLOAD_NAMES=') ? 'SIT_STAGING_PUBLIC_UPLOAD_NAMES=drift' : entry),
  ]) {
    assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, Env: environmentEntries } }, plan, expectedId: record.Id, expectedNetworkIds }), /green_(?:broad_promotion_provider_off|public_fixture_profile|runtime_environment_entries)_invalid/u);
  }
  for (const value of ['http://shareittoo-staging-api:8080', `${greenWebCorsOrigins},https://shareittoo.com`]) {
    const drifted = { ...record, Config: { ...record.Config, Env: record.Config.Env.map((entry) => entry.startsWith('CORS_ORIGINS=') ? `CORS_ORIGINS=${value}` : entry) } };
    assert.throws(() => assertGreenFinalContainerReadback({ record: drifted, plan, expectedId: record.Id, expectedNetworkIds }), /green_web_cors_environment_invalid/u);
  }
  assert.equal(summarizeGreenFinalContainerReadback(record, plan, expectedNetworkIds, record.Id).hostPorts, 0);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Id: 'b'.repeat(64) }, plan, expectedId: record.Id, expectedNetworkIds }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, NetworkSettings: { ...record.NetworkSettings, Networks: { ...record.NetworkSettings.Networks, [greenTarget.providerNetwork]: { NetworkID: '6'.repeat(64) } } } }, plan, expectedId: record.Id, expectedNetworkIds }), /green_final_network_identity_mismatch/u);
  for (const labels of [
    { ...record.Config.Labels, 'com.shareittoo.green.execution_id': 'wrong-execution' },
    Object.fromEntries(Object.entries(record.Config.Labels).filter(([name]) => name !== 'com.shareittoo.green.execution_id')),
  ]) {
    assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, Labels: labels } }, plan, expectedId: record.Id, expectedNetworkIds }), /green_final_inventory_mismatch/u);
  }
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, Env: record.Config.Env.map((entry) => entry === 'MAIL_TRANSPORT=memory' ? 'MAIL_TRANSPORT=smtp' : entry) } }, plan, expectedNetworkIds }), /green_broad_promotion_provider_off_invalid/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, User: 'nobody' } }, plan, expectedNetworkIds }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, Image: plan.runtime.image } }, plan, expectedNetworkIds }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: record.Mounts.map((mount, index) => index === 1 ? { Destination: mount.Destination, RW: undefined } : mount) }, plan, expectedNetworkIds }), /green_mount_rw_readback_invalid/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, NetworkSettings: { ...record.NetworkSettings, Ports: { '8080/tcp': [{ HostPort: '18082' }] } } }, plan, expectedNetworkIds }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, HostConfig: { ...record.HostConfig, PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } } }, plan, expectedNetworkIds }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: [...record.Mounts, { Type: 'bind', Source: '/wrong/extra', Destination: '/extra', RW: false }] }, plan, expectedNetworkIds }), /green_final_(?:inventory_mismatch|mount_inventory_mismatch)/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: record.Mounts.map((mount) => mount.Destination === '/run/secrets/mfa-encryption-key' ? { ...mount, Source: '/wrong/source' } : mount) }, plan, expectedNetworkIds }), /green_final_mount_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: record.Mounts.map((mount) => mount.Destination === '/run/secrets/mfa-encryption-key' ? { ...mount, Type: 'volume', Name: 'foreign-secret-volume', Source: undefined } : mount) }, plan, expectedNetworkIds }), /green_final_mount_inventory_mismatch/u);
});

test('live D3 baseline manifest binds all twenty seals and the exact approved digests without raw IDs', () => {
  const manifest = {
    ...targetManifest,
    authProfile: {
      kind: 'google-post-enrollment', schemaVersion: 1,
      sourceImageDigest: 'sha256:31b8b015eb0635b9fbb7d6c5e54ef43fe089d5b953dba8fa446aae2122a5888a',
      allowedUserIdsDigest: '94ea2a820e6a48d5776d3b3580e62df956a338a2c3dad2d47dd4b85dfbc746b0',
      allowedUserIdsCount: 6,
      googleUserIdDigest: '8009329bd0eec86d923640e8d878ae2bf9117948a64d0f82f9460b03fef44a16',
    },
  };
  manifest.targetDigest = normalizedGreenTargetDigest(manifest);
  assert.equal(manifest.targetDigest, '0efaffbb334b6e4f4ed7df170fa8997c1eb202afe44c2a0dabb5cc3ebf76a57a');
  assert.equal(assertGreenTargetManifest(manifest).retainedSealed.length, 20);
  const readme = readFileSync(new URL('../ops/README.md', import.meta.url), 'utf8');
  for (const value of [manifest.targetDigest, manifest.authProfile.sourceImageDigest,
    manifest.authProfile.allowedUserIdsDigest, manifest.authProfile.googleUserIdDigest]) assert.ok(readme.includes(value));
  const source = readFileSync(new URL('../ops/green_staging_promotion.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, new RegExp(`${dedicatedFixture.listing}|${dedicatedFixture.upload}`, 'u'));
  const legacy = { ...manifest, schemaVersion: 3 };
  delete legacy.authProfile;
  legacy.targetDigest = normalizedGreenTargetDigest(legacy);
  assert.throws(() => assertGreenTargetManifest(legacy), /green_target_manifest_shape_invalid/u);
});

test('web-fixture successor rejects stale predecessor, omitted seals and changed retained identities', () => {
  const stale = { ...targetManifest,
    prePromotionImage: 'ghcr.io/shareittoo/shareittoo-api:5d3b42613da73451e9d9169a7b99ca1aba0c4227',
    prePromotionImageDigest: 'sha256:4c4ed030e23563c99caf9781e5fa1ace41d4d72987570dc318e260b217ba3d90',
    sealedApiContainer: 'shareittoo-staging-api-alt-sealed-green-5d3b4261',
    retainedSealed: targetManifest.retainedSealed.slice(0, -1) };
  stale.targetDigest = normalizedGreenTargetDigest(stale);
  assert.throws(() => assertGreenTargetManifest(stale), /green_retained_sealed_descriptor_shape_invalid/u);
  for (const index of [15, 16, 17]) {
    const expected = targetManifest.retainedSealed[index];
    assert.equal(expected.running, false); assert.equal(expected.greenLabel, 'true');
    assert.equal(expected.runId, '20260918011528-wp254');
    for (const change of [{ image: 'ghcr.io/shareittoo/shareittoo-api:wrong' },
      { imageDigest: `sha256:${'0'.repeat(64)}` }, { running: true }, { runId: 'foreign' }]) {
      const mutated = { ...targetManifest, retainedSealed: targetManifest.retainedSealed.map((row, i) =>
        i === index ? { ...row, ...change } : row) };
      mutated.targetDigest = normalizedGreenTargetDigest(mutated);
      assert.throws(() => assertGreenTargetManifest(mutated));
    }
  }
  const oldImageOnly = { ...targetManifest, prePromotionImage: stale.prePromotionImage,
    prePromotionImageDigest: stale.prePromotionImageDigest };
  oldImageOnly.targetDigest = normalizedGreenTargetDigest(oldImageOnly);
  assert.throws(() => assertGreenTargetManifest(oldImageOnly), /green_target_identity_mismatch/u);
  const previousLiveBaseline = {
    ...targetManifest,
    prePromotionImage: 'ghcr.io/shareittoo/shareittoo-api:1ebc6eaf695e0cd9365680cdecd711b3edbb5586',
    prePromotionImageDigest: 'sha256:22f609f21e04ddeb633186727b72c12158c473822dfef2859d3fa357e00647a2',
    sealedApiContainer: 'shareittoo-staging-api-alt-sealed-green-1ebc6eaf',
    authProfile: {
      ...targetManifest.authProfile,
      sourceImageDigest: 'sha256:22f609f21e04ddeb633186727b72c12158c473822dfef2859d3fa357e00647a2',
    },
  };
  previousLiveBaseline.targetDigest = normalizedGreenTargetDigest(previousLiveBaseline);
  assert.throws(() => assertGreenTargetManifest(previousLiveBaseline), /green_target_identity_mismatch/u);
});

test('D3 predecessor remains separate from the exact 6c0 successor runtime', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit,
    runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  assert.equal(plan.runtime.runtimeCommit, greenSuccessorRuntime.commit);
  assert.equal(plan.runtime.digest, greenSuccessorRuntime.imageDigest);
  assert.equal(plan.target.prePromotionImage, `ghcr.io/shareittoo/shareittoo-api:d3c2f5d7d7516d3bfaac4b61689c2c433924cc6e`);
  assert.equal(plan.opsCommit, opsCommit);
  assert.notEqual(plan.opsCommit, plan.runtime.runtimeCommit);
  const readme = readFileSync(new URL('../ops/README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(greenSuccessorRuntime.commit));
  assert.ok(readme.includes(plan.runtime.digest));
  assert.ok(readme.includes(String(greenSuccessorRuntime.publicationRunId)));
  assert.ok(readme.includes(greenSuccessorRuntime.publicationManifestDigest));
});

test('post-enrollment target profile is required, digest-bound and rejects stale source binding', () => {
  const valid = enrolledTargetManifest();
  assert.equal(assertGreenTargetManifest(valid).authProfile.allowedUserIdsCount, 4);
  for (const invalid of [
    { ...valid, authProfile: undefined },
    { ...valid, schemaVersion: 3 },
    { ...valid, authProfile: { ...valid.authProfile, allowedUserIdsCount: 5 } },
  ]) assert.throws(() => assertGreenTargetManifest(invalid));
  const stale = { ...valid, authProfile: { ...valid.authProfile, sourceImageDigest: `sha256:${'f'.repeat(64)}` } };
  stale.targetDigest = normalizedGreenTargetDigest(stale);
  assert.throws(() => assertGreenTargetManifest(stale), /profile_invalid/u);
});

test('post-enrollment rollback refuses auth or allowed-ID drift before rename/start', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest: enrolledTargetManifest(), config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const original = renamedSealedApiIdentityRecord;
  const identity = { ...originalApiIdentity, config: JSON.stringify(stableIdentityValue(original.Config)) };
  const driftedEnvironments = ['FIREBASE_AUTH_ENABLED=false', `SIT_STAGING_ALLOWED_USER_IDS=${enrolledAllowedIds},extra`, 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=true'].map((replacement) => {
    const key = replacement.split('=')[0];
    return original.Config.Env.map((entry) => entry.startsWith(`${key}=`) ? replacement : entry);
  });
  driftedEnvironments.push(original.Config.Env.filter((entry) => !entry.startsWith('SIT_STAGING_SYNTHETIC_CATALOG_ENABLED=')));
  for (const environmentEntries of driftedEnvironments) {
    const drifted = { ...original, Config: { ...original.Config, Env: environmentEntries } };
    const calls = [];
    const command = async (name, args, options) => {
      calls.push({ name, args, phase: options.phase });
      if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(drifted) };
      if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
      return { stdout: '' };
    };
    const result = await runGreenEmergencyCleanup({ plan, command, completed: ['quiesce_green_api', 'seal_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity: identity });
    assert.equal(result.clean, false);
    assert.equal(calls.some(({ args }) => ['rename', 'start'].includes(args[0])), false);
  }
});

test('post-enrollment forward recovery refuses missing or ambiguous Google identity before successor creation', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest: enrolledTargetManifest(), config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  for (const count of ['0', '2', '']) {
    const phases = [];
    const command = async (name, args, options) => {
      phases.push(options.phase);
      if (options.phase === 'recovery_canonical_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
      if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
      if (options.phase === 'recovery_canonical_post_enrollment_identity_readback') return { stdout: count };
      throw new Error('unexpected command');
    };
    await assert.rejects(runGreenForwardRecovery({ plan, commands, command, targetNetworkId, providerNetworkId }), /green_post_enrollment_identity_missing/u);
    assert.equal(phases.length, 3);
  }
});

test('emergency cleanup is bounded and never restores sealed Green after schema mutation', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => { calls.push({ command, args, options }); return { stdout: '' }; };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api', 'seal_green_api'], schemaMutationStarted: true });
  assert.equal(result.clean, true);
  assert.equal(result.restored, false);
  assert.equal(calls.some((call) => call.args.includes('start') && call.args.includes(greenTarget.apiContainer)), false);
});

test('emergency cleanup with no completed creation phases issues zero deletion commands', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => { calls.push({ command, args, options }); return { stdout: '' }; };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: [] });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.args.includes('rm')), false);
  assert.equal(calls.some((call) => call.args.includes('volume') || call.args.includes('network')), false);
});

test('emergency cleanup rejects same-name foreign resources without deleting them', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const foreign = { Config: { Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': 'different-run', 'com.shareittoo.sit.green': 'true' } }, Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': 'different-run' } };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase.endsWith('identity_readback')) return { stdout: JSON.stringify({ Name: `/${args.at(-1)}`, ...foreign }) };
    if (options.phase.endsWith('_verify')) return { stdout: 'foreign-resource\n' };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({
    plan,
    command: fake,
    completed: ['candidate_acceptance_create', 'isolated_postgres_create', 'isolated_network_create'],
    resourceIds: { candidateId: 'a'.repeat(64), isolatedDatabaseId: 'b'.repeat(64), isolatedNetworkId: 'c'.repeat(64) },
  });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.args.includes('rm')), false);
});

test('emergency cleanup never deletes a prior same-name resource when create response is unknown', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_isolated_network_identity_readback') return { stdout: JSON.stringify({ Id: 'prior-network-id', Name: plan.isolated.network, Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } }) };
    if (options.phase === 'failure_isolated_network_verify') return { stdout: `${plan.isolated.network}\n` };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, phaseStarted: 'isolated_network_create' });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_isolated_network_remove'), false);
});

test('emergency cleanup removes anonymous volumes only with the owned container ID', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const databaseId = 'd'.repeat(64);
  const identity = { Id: databaseId, Name: `/${plan.isolated.database}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_isolated_database_identity_readback') return { stdout: JSON.stringify(identity) };
    if (options.phase === 'failure_isolated_database_remove') assert.deepEqual(args, ['rm', '--force', '--volumes', databaseId]);
    const restore = restoreFixture(options);
    if (restore) return restore;
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['isolated_postgres_create'], resourceIds: { isolatedDatabaseId: databaseId }, originalApiIdentity });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.command === 'docker' && call.args[0] === 'volume'), false);
});

test('emergency cleanup removes a container by the inspected immutable ID', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'c'.repeat(32) });
  const calls = [];
  const identity = { Id: 'c'.repeat(64), Name: `/${plan.isolated.candidate}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_candidate_identity_readback') return { stdout: JSON.stringify(identity) };
    if (options.phase === 'failure_candidate_remove') {
      assert.deepEqual(args, ['rm', '--force', '--volumes', identity.Id]);
      return { stdout: '' };
    }
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['candidate_acceptance_create'], resourceIds: { candidateId: identity.Id }, schemaMutationStarted: true });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.options.phase === 'failure_candidate_remove'), true);
});

test('emergency cleanup does not classify a transport error as already absent', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const candidateId = 'c'.repeat(64);
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_candidate_identity_readback') return { code: 'transport', stderr: 'daemon unavailable', stdout: '' };
    if (options.phase === 'failure_candidate_verify') return { code: 'transport', stderr: 'daemon unavailable', stdout: '' };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['candidate_acceptance_create'], schemaMutationStarted: true, resourceIds: { candidateId } });
  assert.equal(result.schemaMutationStarted, true);
  assert.equal(result.restored, false);
  assert.deepEqual(result.results, [{ phase: 'failure_candidate_identity_readback', ok: false, code: 'green_cleanup_identity_readback_failed' }]);
  assert.equal(calls.some((entry) => entry.options.phase === 'failure_candidate_verify'), true);
  assert.equal(result.clean, false);
  assert.equal(calls.some((entry) => entry.options.phase === 'failure_candidate_remove'), false);
});

test('emergency cleanup refuses a container ID rebind before deletion', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'e'.repeat(32) });
  const calls = [];
  let inspectCount = 0;
  const owned = { Id: '1'.repeat(64), Name: `/${plan.isolated.candidate}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } };
  const foreign = { ...owned, Id: '2'.repeat(64) };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_candidate_identity_readback') return { stdout: JSON.stringify(++inspectCount === 1 ? owned : foreign) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['candidate_acceptance_create'], resourceIds: { candidateId: owned.Id }, schemaMutationStarted: true });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_candidate_remove'), false);
});

test('pre-schema failure restores and verifies the sealed API', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => { calls.push({ command, args, options }); return restoreFixture(options) ?? { stdout: '' }; };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api', 'seal_green_api'], phaseStarted: 'seal_green_api', schemaMutationStarted: false, originalApiIdentity });
  assert.equal(result.clean, true);
  assert.equal(result.restored, true);
  assert.equal(calls.some((call) => call.args.includes('start') && call.args.includes(originalApiIdentity.id)), true);
});

test('restore refuses a changed network set or NetworkID before rename/start', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const cases = [
    ['network set', { Networks: { [greenTarget.network]: renamedSealedApiIdentityRecord.NetworkSettings.Networks[greenTarget.network] } }],
    ['NetworkID', { Networks: Object.fromEntries(Object.entries(renamedSealedApiIdentityRecord.NetworkSettings.Networks).map(([name, endpoint]) => [name, {
      ...endpoint,
      ...(name === greenTarget.network ? { NetworkID: '6'.repeat(64) } : {}),
    }])) }],
  ];
  for (const [label, networkSettings] of cases) {
    const calls = [];
    const sealed = { ...renamedSealedApiIdentityRecord, NetworkSettings: networkSettings };
    const fake = async (command, args, options) => {
      calls.push({ command, args, options });
      if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(sealed) };
      if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
      if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
      return { stdout: '' };
    };
    const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
    assert.equal(result.clean, false, label);
    assert.equal(result.restoreError, 'failure_restore_green_api_identity_ambiguous', label);
    assert.equal(calls.some((call) => call.options.phase === 'failure_restore_sealed_api'), false, label);
    assert.equal(calls.some((call) => call.args.includes('start')), false, label);
  }
});

test('restore rejects malformed network identity before rename/start', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const cases = [
    ['missing NetworkID', { Networks: { [greenTarget.network]: { Aliases: ['sealed-api'] } } }],
    ['invalid network key', { Networks: { 'sealed network': { NetworkID: targetNetworkId } } }],
    ['empty network map', { Networks: {} }],
  ];
  for (const [label, networkSettings] of cases) {
    const calls = [];
    const sealed = { ...renamedSealedApiIdentityRecord, NetworkSettings: networkSettings };
    const fake = async (command, args, options) => {
      calls.push({ command, args, options });
      if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(sealed) };
      if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
      if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
      return { stdout: '' };
    };
    const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
    assert.equal(result.clean, false, label);
    assert.equal(result.restoreError, 'failure_restore_green_api_identity_ambiguous', label);
    assert.equal(calls.some((call) => call.options.phase === 'failure_restore_sealed_api'), false, label);
    assert.equal(calls.some((call) => call.args.includes('start')), false, label);
  }
});

test('quiesce response loss with failed restore is not reported clean', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const fake = async (command, args, options) => restoreFixture(options, false) ?? { stdout: '' };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, phaseStarted: 'quiesce_green_api', schemaMutationStarted: false, originalApiIdentity });
  assert.equal(result.restored, false);
  assert.equal(result.clean, false);
  assert.equal(result.restoreError, 'failure_restore_green_api_not_running_or_identity_mismatch');
});

test('restore refuses a same-name rebound container after rename', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const rebound = { ...restoredApiIdentityRecord, Id: 'foreign-rebound-id' };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(renamedSealedApiIdentityRecord) };
    if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
    if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
    if (options.phase === 'failure_restore_current_api_identity_after_rename') return { stdout: JSON.stringify(rebound) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_restore_green_api'), false);
});

test('restore refuses a foreign sealed-name collision even when current name is exact', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const foreignSealed = { ...renamedSealedApiIdentityRecord, Id: 'foreign-sealed-id' };
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(foreignSealed) };
    if (options.phase === 'failure_restore_current_api_identity_readback') return { stdout: JSON.stringify({ ...restoredApiIdentityRecord, State: { Running: false } }) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_restore_green_api'), false);
});

test('restore reconciles a lost rename response before starting the exact original', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(renamedSealedApiIdentityRecord) };
    if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
    if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
    if (options.phase === 'failure_restore_sealed_api') {
      assert.equal(args[1], originalApiIdentity.id);
      return { code: 'response_lost', stdout: '' };
    }
    if (options.phase === 'failure_restore_current_api_identity_after_rename') return { stdout: JSON.stringify(restoredApiIdentityRecord) };
    if (options.phase === 'failure_restore_sealed_api_identity_after_rename') return { code: 'not_found', stdout: '' };
    if (options.phase === 'failure_restore_green_api') {
      assert.equal(args[1], originalApiIdentity.id);
      return { stdout: '' };
    }
    if (options.phase === 'failure_restore_green_api_identity_verify') return { stdout: JSON.stringify(restoredApiIdentityRecord) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.options.phase === 'failure_restore_green_api'), true);
});

test('post-schema forward recovery creates only the successor and verifies its public contract', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const record = {
    Id: 'a'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId, 'com.shareittoo.green.execution_id': plan.isolated.executionId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'], NetworkMode: targetNetworkId }, Mounts: finalMounts,
  };
  const preStartRecord = { ...record, State: { Running: false }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' } } } };
  const attachedPreStartRecord = { ...record, State: { Running: false }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' }, [greenTarget.providerNetwork]: { NetworkID: '' } } } };
  const image = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${runtimeImageDigest}`] };
  const calls = [];
  let failProviderAttach = false;
  let currentRecord = null;
  let wrongFinalIdentity = false;
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase.startsWith('recovery_')) {
      const phase = options.phase.slice('recovery_'.length);
      const expected = commands.find((entry) => entry.phase === phase);
      if (phase === 'successor_identity_readback') {
        assert.equal(command, 'docker');
        assert.ok([record.Id, greenTarget.apiContainer].includes(args.at(-1)));
      } else if (phase === 'successor_exact_id_readback') {
        assert.deepEqual(args, ['inspect', '--format', '{{json .}}', record.Id]);
      } else if (phase === 'final_provider_network_attach') {
        assert.deepEqual(args, ['network', 'connect', providerNetworkId, record.Id]);
      } else if (phase === 'final_provider_network_attach_retry') {
        assert.deepEqual(args, ['network', 'connect', providerNetworkId, record.Id]);
      } else if (phase === 'final_start') {
        assert.deepEqual(args, ['start', record.Id]);
      } else if (phase === 'final_start_retry') {
        assert.deepEqual(args, ['start', record.Id]);
      } else if (phase === 'final_inventory_readback') {
        assert.deepEqual(args, ['inspect', '--format', '{{json .}}', record.Id]);
      } else if (phase === 'final_name_absence_readback') {
        assert.equal(command, 'docker');
      } else if (phase === 'final_create_no_host_port') {
        assert.equal(command, expected.command);
        const expectedArgs = [...expected.args];
        const networkIndex = expectedArgs.indexOf(greenTarget.network);
        if (networkIndex >= 0) expectedArgs[networkIndex] = targetNetworkId;
        assert.deepEqual(args, expectedArgs);
      } else {
        assert.ok(expected, `unexpected recovery phase: ${phase}`);
        assert.equal(command, expected.command);
        assert.deepEqual(args, expected.args);
      }
    }
    if (options.phase === 'recovery_successor_identity_readback') {
      if (args.at(-1) === greenTarget.apiContainer && !currentRecord) return { code: 1, stdout: '' };
      return { stdout: JSON.stringify(currentRecord ?? preStartRecord) };
    }
    if (options.phase === 'recovery_successor_exact_id_readback') return { stdout: JSON.stringify(currentRecord ?? preStartRecord) };
    if (options.phase === 'recovery_final_provider_network_attach' || options.phase === 'recovery_final_provider_network_attach_retry') {
      if (failProviderAttach) return { code: 1, stdout: '' };
      currentRecord = attachedPreStartRecord;
      return { stdout: '' };
    }
    if (options.phase === 'recovery_final_start' || options.phase === 'recovery_final_start_retry') {
      currentRecord = record;
      return { stdout: '' };
    }
    if (options.phase === 'recovery_canonical_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
    if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
    if (options.phase === 'recovery_final_create_no_host_port') {
      currentRecord = preStartRecord;
      return { stdout: `${record.Id}\n` };
    }
    if (options.phase === 'recovery_canonical_post_enrollment_identity_readback') return { stdout: '1\n' };
    if (options.phase.endsWith('final_image_readback')) return { stdout: JSON.stringify(image) };
    if (options.phase.endsWith('final_inventory_readback')) return { stdout: JSON.stringify(wrongFinalIdentity ? { ...(currentRecord ?? record), Id: 'b'.repeat(64) } : (currentRecord ?? record)) };
    if (options.phase.endsWith('final_health_probe') || options.phase.endsWith('final_ready_wait')) return { stdout: JSON.stringify(payload) };
    if (options.phase.endsWith('final_version_readback')) return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
    return { stdout: '' };
  };
  const result = await runGreenForwardRecovery({ plan, commands, command: fake, completed: [], targetNetworkId, providerNetworkId });
  assert.equal(result.status, 'verified');
  assert.equal(calls.some((call) => call.args.includes('shareittoo-staging-api-alt-sealed-green')), false);
  wrongFinalIdentity = true;
  await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, completed: [], targetNetworkId, providerNetworkId }), /green_final_inventory_mismatch/u);
  wrongFinalIdentity = false;
  for (const phase of ['recovery_final_provider_network_attach', 'recovery_final_start']) {
    const call = calls.find((entry) => entry.options.phase === phase);
    assert.equal(call.args.at(-1), record.Id);
  }
  const retained = await runGreenForwardRecovery({ plan, commands, command: fake, completed: ['final_create_no_host_port', 'final_provider_network_attach', 'final_start'], targetNetworkId, providerNetworkId });
  assert.equal(retained.status, 'verified');
  const resumed = await runGreenForwardRecovery({ plan, commands, command: fake, completed: ['final_create_no_host_port', 'final_provider_network_attach'], targetNetworkId, providerNetworkId });
  assert.equal(resumed.status, 'verified');
  const resumedStart = calls.findLast((entry) => entry.options.phase === 'recovery_final_start');
  assert.deepEqual(resumedStart.args, ['start', record.Id]);
  const startsBeforeAttachFailure = calls.filter((entry) => entry.options.phase === 'recovery_final_start').length;
  failProviderAttach = true;
  currentRecord = preStartRecord;
  await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, completed: [], targetNetworkId, providerNetworkId }), /green_forward_recovery_final_provider_network_attach_failed/u);
  assert.equal(calls.filter((entry) => entry.options.phase === 'recovery_final_start').length, startsBeforeAttachFailure);
});

test('stateful successor lifecycle reconciles lost attach/start responses and retries once when state remains stopped', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'e'.repeat(32) });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const image = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`${plan.runtime.image}@${plan.runtime.digest}`] };
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const id = '9'.repeat(64);
  const base = {
    Id: id, Name: `/${greenTarget.apiContainer}`, State: { Running: false },
    NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' } } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': plan.target.runId, 'com.shareittoo.green.execution_id': plan.isolated.executionId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'], NetworkMode: targetNetworkId }, Mounts: finalMounts,
  };
  let current = structuredClone(base);
  let attachAttempts = 0;
  let startAttempts = 0;
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, phase: options.phase });
    const phase = options.phase;
    if (phase === 'recovery_canonical_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
    if (phase === 'recovery_canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
    if (phase === 'recovery_canonical_post_enrollment_identity_readback') return { stdout: '1\n' };
    if (phase === 'recovery_successor_identity_readback') return { stdout: JSON.stringify(current) };
    if (phase === 'recovery_successor_exact_id_readback') {
      assert.deepEqual(args, ['inspect', '--format', '{{json .}}', id]);
      return { stdout: JSON.stringify(current) };
    }
    if (phase === 'recovery_final_provider_network_attach') {
      assert.deepEqual(args, ['network', 'connect', providerNetworkId, id]);
      attachAttempts += 1;
      current = { ...current, NetworkSettings: { ...current.NetworkSettings, Networks: { ...current.NetworkSettings.Networks, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } } };
      return { code: 1, stdout: '' }; // lost response, state proves attach succeeded
    }
    if (phase === 'recovery_final_provider_network_attach_retry') assert.fail('attach must not retry after state reconciliation');
    if (phase === 'recovery_final_start') {
      assert.deepEqual(args, ['start', id]);
      startAttempts += 1;
      if (startAttempts === 2) current = { ...current, State: { Running: true }, NetworkSettings: { ...current.NetworkSettings, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } } };
      return { code: 1, stdout: '' };
    }
    if (phase === 'recovery_final_start_retry') {
      assert.deepEqual(args, ['start', id]);
      startAttempts += 1;
      current = { ...current, State: { Running: true }, NetworkSettings: { ...current.NetworkSettings, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } } };
      return { code: 1, stdout: '' };
    }
    if (phase === 'recovery_final_image_readback') return { stdout: JSON.stringify(image) };
    if (phase === 'recovery_final_inventory_readback') {
      assert.deepEqual(args, ['inspect', '--format', '{{json .}}', id]);
      return { stdout: JSON.stringify(current) };
    }
    if (phase === 'recovery_final_live_wait') return { stdout: '' };
    if (phase === 'recovery_final_health_probe' || phase === 'recovery_final_ready_wait') return { stdout: JSON.stringify(payload) };
    if (phase === 'recovery_final_version_readback') return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
    throw new Error(`unexpected phase ${phase}`);
  };
  const result = await runGreenForwardRecovery({ plan, commands, command: fake, targetNetworkId, providerNetworkId });
  assert.equal(result.status, 'verified');
  assert.equal(attachAttempts, 1);
  assert.equal(startAttempts, 2);
  assert.equal(calls.some((entry) => entry.phase === 'recovery_final_provider_network_attach_retry'), false);
  assert.equal(calls.filter((entry) => entry.phase === 'recovery_final_start_retry').length, 1);

  const attachAttemptsBeforeWrongImage = attachAttempts;
  const startAttemptsBeforeWrongImage = startAttempts;
  current = { ...structuredClone(base), Config: { ...base.Config, Image: 'ghcr.io/shareittoo/shareittoo-api:wrong' } };
  await assert.rejects(
    runGreenForwardRecovery({ plan, commands, command: fake, targetNetworkId, providerNetworkId }),
    /green_final_inventory_mismatch/u,
  );
  assert.equal(attachAttempts, attachAttemptsBeforeWrongImage);
  assert.equal(startAttempts, startAttemptsBeforeWrongImage);

  const negativeSuccessors = [
    {
      code: /green_forward_recovery_successor_identity_invalid/u,
      record: { ...structuredClone(base), NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '6'.repeat(64) } } } },
    },
    {
      code: /green_forward_recovery_successor_identity_invalid/u,
      record: { ...structuredClone(base), NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {} } } },
    },
    {
      code: /green_(?:forward_recovery_successor_identity_invalid|successor_prestart_network_invalid)/u,
      record: { ...structuredClone(base), HostConfig: { ...base.HostConfig, NetworkMode: 'bridge' } },
    },
    {
      code: /green_(?:forward_recovery_successor_identity_invalid|successor_prestart_network_invalid)/u,
      record: { ...structuredClone(base), NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' }, [greenTarget.providerNetwork]: { NetworkID: '6'.repeat(64) } } } },
    },
    {
      code: /green_forward_recovery_successor_identity_invalid/u,
      record: { ...structuredClone(base), Config: { ...base.Config, Labels: { ...base.Config.Labels, 'com.shareittoo.green.execution_id': 'wrong-execution' } } },
    },
    {
      code: /green_forward_recovery_successor_identity_invalid/u,
      record: { ...structuredClone(base), Config: { ...base.Config, Labels: Object.fromEntries(Object.entries(base.Config.Labels).filter(([name]) => name !== 'com.shareittoo.green.execution_id')) } },
    },
  ];
  for (const { code, record } of negativeSuccessors) {
    current = record;
    const before = structuredClone(record);
    const attachBefore = attachAttempts;
    const startBefore = startAttempts;
    await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, targetNetworkId, providerNetworkId }), code);
    assert.equal(attachAttempts, attachBefore);
    assert.equal(startAttempts, startBefore);
    assert.deepEqual(current, before);
  }
});

test('forward recovery stops on a foreign final-name conflict before network attach or start', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'd'.repeat(32) });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const calls = [];
  const foreign = {
    Id: 'f'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: false },
    NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId } } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': plan.target.runId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'], NetworkMode: targetNetworkId }, Mounts: finalMounts,
  };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'recovery_canonical_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
    if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
    if (options.phase === 'recovery_canonical_post_enrollment_identity_readback') return { stdout: '1\n' };
    if (options.phase === 'recovery_final_create_no_host_port') return { code: 17, stdout: '' };
    if (options.phase === 'recovery_existing_final_inspect') return { stdout: JSON.stringify(foreign) };
    return { stdout: '' };
  };
  await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, completed: [], targetNetworkId, providerNetworkId }), /green_forward_recovery_create_conflict/u);
  assert.equal(calls.some((call) => call.options.phase === 'recovery_final_provider_network_attach'), false);
  assert.equal(calls.some((call) => call.options.phase === 'recovery_final_start'), false);

  const wrongExecution = { ...foreign, Config: { ...foreign.Config, Labels: { ...foreign.Config.Labels, 'com.shareittoo.green.execution_id': 'wrong-execution' } } };
  const wrongCalls = [];
  const wrongFake = async (command, args, options) => {
    wrongCalls.push({ command, args, options });
    if (options.phase === 'recovery_canonical_schema_readback') return { stdout: '098_booking_checkout_declaration_constraints.up.sql\n' };
    if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
    if (options.phase === 'recovery_final_create_no_host_port') return { code: 17, stdout: '' };
    if (options.phase === 'recovery_canonical_post_enrollment_identity_readback') return { stdout: '1\n' };
    if (options.phase === 'recovery_existing_final_inspect') return { stdout: JSON.stringify(wrongExecution) };
    return { stdout: '' };
  };
  await assert.rejects(runGreenForwardRecovery({ plan, commands, command: wrongFake, completed: [], targetNetworkId, providerNetworkId }), /green_forward_recovery_create_conflict/u);
  assert.equal(wrongCalls.some((call) => call.options.phase === 'recovery_final_provider_network_attach'), false);
  assert.equal(wrongCalls.some((call) => call.options.phase === 'recovery_final_start'), false);
});

test('successor pre-start validation rejects wrong User, Env and mounts', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'f'.repeat(32) });
  const record = {
    Id: '9'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: false }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId } } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId, 'com.shareittoo.green.execution_id': plan.isolated.executionId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'], NetworkMode: targetNetworkId }, Mounts: finalMounts,
  };
  assert.equal(assertGreenSuccessorPreStartReadback({ record, plan, expectedId: record.Id, expectedNetworkIds: { [greenTarget.network]: targetNetworkId } }), true);
  const candidateRecord = {
    ...record,
    Id: '8'.repeat(64), Name: `/${plan.isolated.candidate}`,
    NetworkSettings: { Ports: { '8080/tcp': null }, Networks: { [plan.isolated.network]: { NetworkID: isolatedNetworkId }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } },
    Config: { ...record.Config, Labels: { ...record.Config.Labels, 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } },
    Mounts: [...finalMounts.map((mount) => mount.Destination === '/data/uploads' ? { ...mount, Name: 'anonymous-uploads-id' } : mount), { Type: 'bind', Source: syntheticSandboxCredentialFilePath, Destination: '/run/secrets/synthetic-sandbox-user-password', RW: false }],
  };
  candidateRecord.HostConfig = { ...record.HostConfig, NetworkMode: isolatedNetworkId, PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } };
  assert.equal(assertGreenSuccessorPreStartReadback({ record: candidateRecord, plan, expectedId: candidateRecord.Id, expectedNetworks: [plan.isolated.network, greenTarget.providerNetwork], expectedNetworkIds: { [plan.isolated.network]: isolatedNetworkId, [greenTarget.providerNetwork]: providerNetworkId }, expectedName: plan.isolated.candidate, expectedMounts: plan.candidateMounts, expectedCandidate: true, allowAnonymousUploadsVolume: true }), true);
  assert.equal(assertGreenSuccessorPreStartReadback({
    record: { ...candidateRecord, NetworkSettings: { Ports: { '8080/tcp': null }, Networks: { [plan.isolated.network]: { NetworkID: '' }, [greenTarget.providerNetwork]: { NetworkID: '' } } } },
    plan, expectedId: candidateRecord.Id, expectedNetworks: [plan.isolated.network, greenTarget.providerNetwork], expectedNetworkIds: { [plan.isolated.network]: isolatedNetworkId, [greenTarget.providerNetwork]: providerNetworkId }, expectedName: plan.isolated.candidate, expectedMounts: plan.candidateMounts, expectedCandidate: true, allowAnonymousUploadsVolume: true,
  }), true);
  assert.equal(assertGreenSuccessorPreStartReadback({
    record: { ...record, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' } } } },
    plan, expectedId: record.Id, expectedNetworkIds: { [greenTarget.network]: targetNetworkId },
  }), true);
  for (const invalidBinding of [
    { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '18082' }] },
    { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18081' }] },
    { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }], '9090/tcp': [{ HostIp: '127.0.0.1', HostPort: '19090' }] },
  ]) {
    assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...candidateRecord, HostConfig: { ...candidateRecord.HostConfig, PortBindings: invalidBinding } }, plan, expectedId: candidateRecord.Id, expectedNetworks: [plan.isolated.network, greenTarget.providerNetwork], expectedName: plan.isolated.candidate, expectedMounts: plan.candidateMounts, expectedCandidate: true, allowAnonymousUploadsVolume: true }), /green_successor_prestart_network_invalid/u);
  }
  const expectedRecordNetworkIds = { [greenTarget.network]: targetNetworkId };
  assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '6'.repeat(64) } } } }, plan, expectedId: record.Id, expectedNetworkIds: expectedRecordNetworkIds }), /green_successor_prestart_network_invalid/u);
  for (const invalidNetworkRecord of [
    { ...record, HostConfig: { ...record.HostConfig, NetworkMode: '' }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' } } } },
    { ...record, HostConfig: { ...record.HostConfig, NetworkMode: greenTarget.network }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' } } } },
    { ...record, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' }, [greenTarget.providerNetwork]: { NetworkID: '' } } } },
    { ...record, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: '' }, [greenTarget.providerNetwork]: { NetworkID: '6'.repeat(64) } } } },
  ]) {
    assert.throws(() => assertGreenSuccessorPreStartReadback({ record: invalidNetworkRecord, plan, expectedId: record.Id, expectedNetworkIds: expectedRecordNetworkIds }), /green_successor_prestart_network_invalid/u);
  }
  for (const labels of [
    { ...record.Config.Labels, 'com.shareittoo.green.execution_id': 'wrong-execution' },
    Object.fromEntries(Object.entries(record.Config.Labels).filter(([name]) => name !== 'com.shareittoo.green.execution_id')),
  ]) {
    assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, Config: { ...record.Config, Labels: labels } }, plan, expectedId: record.Id, expectedNetworkIds: expectedRecordNetworkIds }), /green_final_inventory_mismatch/u);
  }
  assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, Config: { ...record.Config, User: 'nobody' } }, plan, expectedId: record.Id, expectedNetworkIds: expectedRecordNetworkIds }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, Config: { ...record.Config, Env: record.Config.Env.map((entry) => entry === 'PAYMENT_TRANSPORT=memory' ? 'PAYMENT_TRANSPORT=stripe' : entry) } }, plan, expectedId: record.Id, expectedNetworkIds: expectedRecordNetworkIds }), /green_prestart|green_final|green_runtime/u);
  assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, Mounts: record.Mounts.map((mount) => mount.Destination === '/run/secrets/mfa-encryption-key' ? { ...mount, Source: '/foreign/secret' } : mount) }, plan, expectedId: record.Id, expectedNetworkIds: expectedRecordNetworkIds }), /green_final_mount_inventory_mismatch/u);
});

test('forward recovery fails closed before candidate continuation on migration readback gaps', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const record = {
    Id: 'b'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: { NetworkID: targetNetworkId }, [greenTarget.providerNetwork]: { NetworkID: providerNetworkId } } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId, 'com.shareittoo.green.execution_id': plan.isolated.executionId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: finalMounts,
  };
  const image = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${runtimeImageDigest}`] };
  for (const invalid of [
    { migration: '', ledger: currentMigrationLedger, code: 'green_forward_recovery_schema_readback_invalid' },
    { migration: '094_apple_refresh_material_only.up.sql', ledger: currentMigrationLedger, code: 'green_forward_recovery_schema_readback_invalid' },
    { migration: '098_booking_checkout_declaration_constraints.up.sql', ledger: 'bad-ledger\n', code: 'green_forward_recovery_migration_ledger_invalid' },
  ]) {
    const calls = [];
    const fake = async (command, args, options) => {
      calls.push({ command, args, options });
      if (options.phase === 'recovery_canonical_schema_readback') return { stdout: `${invalid.migration}\n` };
      if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: `${invalid.ledger}\n` };
      if (options.phase.endsWith('final_image_readback')) return { stdout: JSON.stringify(image) };
      if (options.phase.endsWith('final_inventory_readback')) return { stdout: JSON.stringify(record) };
      if (options.phase.endsWith('final_health_probe') || options.phase.endsWith('final_ready_wait')) return { stdout: JSON.stringify(payload) };
      if (options.phase.endsWith('final_version_readback')) return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
      return { stdout: '' };
    };
    await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, completed: [], targetNetworkId, providerNetworkId }), new RegExp(invalid.code, 'u'));
    assert.equal(calls.some((call) => call.options.phase === 'recovery_final_create_no_host_port'), false);
  }
});

test('synthetic catalog public readback requires one complete exact Item-compatible row', () => {
  const valid = {
    status: 200, count: 1, pageCount: 1, rowKeys: greenSyntheticCatalogItemKeys,
    idDigest: greenSyntheticCatalogProjection.idDigest,
    ownerIdDigest: greenSyntheticCatalogProjection.ownerIdDigest,
    titleDigest: greenSyntheticCatalogProjection.titleDigest,
    noticeDigest: greenSyntheticCatalogProjection.noticeDigest,
    photoCount: 1, photoDigest: greenSyntheticCatalogProjection.photoDigest,
    locationText: greenSyntheticCatalogProjection.locationText,
    city: greenSyntheticCatalogProjection.city,
    country: greenSyntheticCatalogProjection.country,
    lat: greenSyntheticCatalogProjection.lat,
    lng: greenSyntheticCatalogProjection.lng,
    catalogClass: greenSyntheticCatalogProjection.catalogClass,
    realOffer: false,
    ownerDeclaration: false,
    bookingAllowed: false,
    paymentAllowed: false,
    isActive: true,
    listingStatus: 'active',
    verificationStatus: 'unverified',
    strictItemCompatible: true,
    canonicalValues: true,
    attempts: 1,
    converged: true,
    photoReachable: null,
  };
  assert.equal(assertGreenSyntheticCatalogPublicReadback(valid), true);
  assert.equal(assertGreenSyntheticCatalogPublicReadback({ ...valid, photoReachable: true }, { requirePhotoReachable: true }), true);
  for (const invalid of [
    { ...valid, count: 2 },
    { ...valid, rowKeys: valid.rowKeys.slice(0, -1) },
    { ...valid, idDigest: 'f'.repeat(64) },
    { ...valid, titleDigest: undefined },
    { ...valid, photoCount: 0, photoDigest: null },
    { ...valid, catalogClass: 'ordinary_catalog' },
    { ...valid, bookingAllowed: true },
    { ...valid, attempts: 9 },
    { ...valid, canonicalValues: false },
    { ...valid, photoReachable: true },
  ]) assert.throws(() => assertGreenSyntheticCatalogPublicReadback(invalid), /green_synthetic_catalog_public_readback_invalid/u);
});

test('strict Item matrix rejects missing or forged synthetic public fields before canonical acceptance', () => {
  const row = { ...JSON.parse(readFileSync(new URL('../../test/fixtures/staging_synthetic_catalog_public_listing.json', import.meta.url), 'utf8')),
    id: dedicatedFixture.listing, ownerId: dedicatedFixture.owner,
    createdAt: '2026-09-30T19:57:14.044Z',
    photos: [`https://staging.shareittoo.com/api/v1/uploads/${dedicatedFixture.upload}`],
  };
  const base = summarizeGreenSyntheticCatalogPayload({ status: 200, body: { listings: [row], page: { count: 1 } }, expectedPhotoUrl: row.photos[0] });
  assert.equal(base.strictItemCompatible, true);
  assert.equal(base.canonicalValues, true);
  for (const mutation of [
    ({ ...row, ownerId: undefined }),
    ({ ...row, pricePerDay: '1' }),
    ({ ...row, bookingAllowed: 'false' }),
    ({ ...row, createdAt: 'not-a-date' }),
    ({ ...row, photos: 'forged' }),
  ]) {
    assert.equal(summarizeGreenSyntheticCatalogPayload({ status: 200, body: { listings: [mutation], page: { count: 1 } }, expectedPhotoUrl: row.photos[0] }).strictItemCompatible, false);
  }
});

test('catalog probe converges after one transient invalid readback without replaying mutations', async () => {
  const row = { ...JSON.parse(readFileSync(new URL('../../test/fixtures/staging_synthetic_catalog_public_listing.json', import.meta.url), 'utf8')),
    id: dedicatedFixture.listing, ownerId: dedicatedFixture.owner,
    createdAt: '2026-09-30T19:57:14.044Z',
    photos: [`https://staging.shareittoo.com/api/v1/uploads/${dedicatedFixture.upload}`],
  };
  let calls = 0;
  const result = await runGreenSyntheticCatalogProbe({
    url: 'http://127.0.0.1:18082/v1/listings?sort=newest&limit=100&offset=0',
    environment: { PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api/v1', SIT_STAGING_PUBLIC_UPLOAD_NAMES: dedicatedFixture.upload },
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.ok(options.signal);
      return calls === 1
        ? { status: 200, json: async () => ({ listings: [], page: { count: 0 } }) }
        : { status: 200, json: async () => ({ listings: [row], page: { count: 1 } }) };
    },
    delay: async (milliseconds) => assert.equal(milliseconds, 100),
  });
  assert.equal(result.converged, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
  assert.equal(result.photoReachable, null);
});

test('catalog probe bounds persistent invalid readback to eight read-only timed attempts', async () => {
  let calls = 0;
  let delays = 0;
  const result = await runGreenSyntheticCatalogProbe({
    url: 'http://127.0.0.1:18082/v1/listings?sort=newest&limit=100&offset=0',
    environment: { PUBLIC_BASE_URL: 'https://shareittoo.com/api/v1', SIT_STAGING_PUBLIC_UPLOAD_NAMES: dedicatedFixture.upload },
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.ok(options.signal);
      return { status: 200, json: async () => ({ listings: [], page: { count: 0 } }) };
    },
    delay: async (milliseconds) => { assert.equal(milliseconds, 100); delays += 1; },
  });
  assert.equal(result.converged, false);
  assert.equal(result.attempts, 8);
  assert.equal(calls, 8);
  assert.equal(delays, 7);
});

test('database state readback requires exact scoped counts and full auth/catalog/ledger digests', () => {
  const state = { ...greenDatabaseStateBaseline };
  assert.deepEqual(assertGreenDatabaseStateReadback(JSON.stringify(state)), state);
  for (const drift of [
    { ...state, listingCount: 2 },
    { ...state, ledgerDigest: 'd'.repeat(64) },
    { ...state, authDigest: 'd'.repeat(64) },
    { ...state, activeAuthCount: 1 },
    { ...state, paymentCommandCount: 1 },
  ]) assert.throws(() => assertGreenDatabaseStateReadback(JSON.stringify(drift)), /green_database_state_changed/u);
  assert.throws(() => assertGreenDatabaseStateReadback(JSON.stringify({ ...state, extra: true })), /green_database_state_readback_invalid/u);
  assert.match(greenDatabaseStateReadbackSql, /auth_sessions/u);
  assert.match(greenDatabaseStateReadbackSql, /refresh_tokens/u);
  assert.match(greenDatabaseStateReadbackSql, /audit_log/u);
});

test('sanitized evidence accepts approved secret mount paths but rejects secret-bearing fields', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const evidence = sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { finalInventory: { mountDestinations: [{ destination: '/run/secrets/mfa-encryption-key', readOnly: true }] } }, imageReadback: { commit: runtimeCommit } });
  assert.deepEqual(evidence.runtime.publication, {
    runId: greenSuccessorRuntime.publicationRunId,
    manifestDigest: greenSuccessorRuntime.publicationManifestDigest,
  });
  const tamperedPlan = { ...plan, runtime: { ...plan.runtime, publication: { ...plan.runtime.publication, runId: greenSuccessorRuntime.publicationRunId + 1 } } };
  assert.throws(() => sanitizeGreenEvidence({ plan: tamperedPlan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: {}, imageReadback: {} }), /green_successor_publication_identity_mismatch/u);
  const forbidden = 'pass' + 'word';
  assert.throws(() => sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { [forbidden]: 'synthetic-value' }, imageReadback: { commit: runtimeCommit } }), /green_evidence_secret_leak/u);
});

test('sanitized evidence and cleanup never turn Green promotion into legacy/prod mutation', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const evidence = sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { schema: 98 }, imageReadback: { live: 200, ready: 200 } });
  assert.equal(evidence.redaction, 'sensitive values omitted');
  assert.deepEqual(evidence.safety.syntheticCatalog, { enabled: true, ...greenPublicFixtureProfile });
  assert.deepEqual({ mail: evidence.safety.mailTransport, push: evidence.safety.pushTransport, identity: evidence.safety.identityTransport, listingProvider: evidence.safety.listingAiProvider, listingExternal: evidence.safety.listingAiExternalExecutionApproved, listingBudgetCents: evidence.safety.listingAiBudgetCents }, { mail: 'memory', push: 'memory', identity: 'memory', listingProvider: 'on_device', listingExternal: false, listingBudgetCents: 0 });
  assert.doesNotMatch(JSON.stringify(evidence), /DATABASE_URL|JWT_SECRET|password|token|whsec_|sk_live_|sk_test_/iu);
  assert.equal(assertGreenCleanup({ removed: ['sit-green-rehearsal-network-x'], verifiedAbsent: ['sit-green-rehearsal-network-x'], oldApiSealed: true, oldApiRunning: false }), true);
  assert.throws(() => assertGreenCleanup({ removed: ['shareittoo-staging-api'], verifiedAbsent: ['shareittoo-staging-api'], oldApiSealed: true, oldApiRunning: false }));
  assert.throws(() => assertGreenCleanup({ removed: ['shareittoo-staging-api-lookalike'], verifiedAbsent: ['shareittoo-staging-api-lookalike'], oldApiSealed: true, oldApiRunning: false }));
});

test('evidence writer is external, exclusive and mode 0600', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-green-promotion-evidence-'));
  const file = path.join(root, 'evidence.json');
  try {
    const result = await writeGreenEvidence(file, { kind: 'sit-green-promotion', redaction: 'sensitive values omitted' });
    assert.equal(result.path, file);
    assert.equal(lstatSync(file).mode & 0o777, 0o600);
    await assert.rejects(() => writeGreenEvidence(file, { kind: 'sit-green-promotion' }), /green_evidence_path_exists/u);
    const forbidden = 'pass' + 'word';
    await assert.rejects(() => writeGreenEvidence(path.join(root, 'secret.json'), { [forbidden]: 'not allowed' }), /green_evidence_secret_leak/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
