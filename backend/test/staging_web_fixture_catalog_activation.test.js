import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { dedicatedFixture } from '../ops/staging_web_fixture_bootstrap.mjs';
import {
  assertCatalogActivationState,
  assertCatalogActivationManifest,
  catalogActivationStateSql,
  catalogActivationKey,
  prepareCatalogActivationManifest,
  requiredBootstrapLedgerDigest,
  requiredDatabasePreparationEvidenceSha256,
  requiredLoginProofEvidenceSha256,
  requiredLoginProofLedgerDigest,
  requiredLoginProofOpsCommit,
  runCatalogActivation,
  validateCatalogActivationBootstrap,
  validateLoginProofEvidence,
} from '../ops/staging_web_fixture_catalog_activation.mjs';
import { fixtureNotice } from '../ops/staging_web_fixture_preflight.mjs';
import { corsContainerFingerprint } from '../ops/staging_web_cors_transition.mjs';
import { assertCatalogActivationHost,
  assertCatalogActivationPreparePaths } from '../ops/activate_staging_web_fixture_catalog.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const digest = (value) => hash(JSON.stringify(canonical(value)));
const opsCommit = 'f'.repeat(40);
const bootstrapCommit = 'e'.repeat(40);
const runtimeCommit = 'd'.repeat(40);
const imageDigest = `sha256:${'c'.repeat(64)}`;
const migrationLedger = '796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196';
const primaryNetworkId = '7'.repeat(64);
const providerNetworkId = '8'.repeat(64);
const activationRunId = 'web-fixture-catalog-activation-run';
const seedScopeDigest = '4'.repeat(64);
const seedSnapshotDigest = '5'.repeat(64);
const forbiddenRunHashInterpolation = `:${String.fromCharCode(39)}run_hash${String.fromCharCode(39)}`;

function environment() {
  return {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test', APP_COMMIT: runtimeCommit,
    FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    DATABASE_URL: 'postgres://sit-green-postgres-20260918011528-wp254/shareittoo_green',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_ALLOWED_USER_IDS: `${dedicatedFixture.owner},${dedicatedFixture.renter},existing-pilot-user`,
    SIT_STAGING_PUBLIC_LISTING_IDS: dedicatedFixture.listing,
    SIT_STAGING_PUBLIC_UPLOAD_NAMES: dedicatedFixture.upload,
    SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', MAIL_TRANSPORT: 'memory',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_LISTING_AI_BUDGET_CENTS: '0', TECHNICAL_SANDBOX_ENABLED: '0',
    TECHNICAL_SANDBOX_KILL_SWITCH: '1', TECHNICAL_SANDBOX_ACCOUNT_ID: '',
    TECHNICAL_SANDBOX_USER_IDS: '', TECHNICAL_SANDBOX_AUTHORIZATION_ID: '',
    TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: '', TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '',
    TECHNICAL_SANDBOX_SECRET_KEY_FILE: '', TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: '',
    PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
  };
}
const envText = (values) => `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;

function activationState() {
  return { users: 2, listing: 1, upload: 1, seedAudits: 1, activationAudits: 1,
    activationRunDigest: hash(activationRunId),
    activeSessions: 0, activeRefresh: 0, mfaFactors: 0,
    retainedSessions: 2, retainedRefresh: 2, loginAudits: 2,
    bookings: 0, requests: 0, identities: 0, pushDevices: 0, paymentCommands: 0,
    identityProviderSessions: 0, technicalProviderRuns: 0, notifications: 0, notificationOutbox: 0,
    identityDigest: '1'.repeat(64), catalogDigest: '2'.repeat(64) };
}

function publicState(visible) {
  const expectedPhoto = hash(`https://staging.example.invalid/api/v1/uploads/${dedicatedFixture.upload}`);
  return { status: 200, count: visible ? 1 : 0, pageCount: visible ? 1 : 0,
    idDigest: visible ? hash(dedicatedFixture.listing) : null,
    titleDigest: visible ? hash('Synthetische Katalogfixture') : null,
    noticeDigest: visible ? hash(fixtureNotice) : null,
    photoCount: visible ? 1 : 0, photoDigest: visible ? expectedPhoto : null,
    catalogClass: visible ? 'synthetic_noncontractual_catalog_only' : null,
    realOffer: visible ? false : null, ownerDeclaration: visible ? false : null,
    bookingAllowed: visible ? false : null, paymentAllowed: visible ? false : null,
    expectedVisible: visible, expectedId: hash(dedicatedFixture.listing),
    expectedTitle: hash('Synthetische Katalogfixture'), expectedNotice: hash(fixtureNotice), expectedPhoto };
}

function loginEvidence(bootstrapSha, runSha, overrides = {}) {
  return { kind: 'sit-green-web-fixture-login-proof', schemaVersion: 1,
    status: 'fixture-login-proof-verified-sessions-revoked', opsCommit: requiredLoginProofOpsCommit,
    runtimeCommit, imageDigest, bootstrapManifestSha256: bootstrapSha, bootstrapRunIdSha256: runSha,
    rolesVerified: 2, loginsVerified: 2, meVerified: 2, logoutsVerified: 2,
    accessTokensRejected: 2, credentialsAttested: 2, activeSessions: 0, activeRefreshTokens: 0,
    retainedSessionRecords: 2, loginAudits: 2, schemaCount: 98, ledgerDigest: requiredLoginProofLedgerDigest,
    identityDigest: activationState().identityDigest, identityUnchanged: true,
    catalogStateDigest: activationState().catalogDigest, visibilityUnchanged: true,
    effectDigest: '3'.repeat(64), apiReadback: true, paymentMemory: true, stripeLivemode: false,
    registrationClosed: true, catalogEnabled: false, externalProvidersEnabled: false,
    cleanupVerified: true, runtimeActivated: false, ...overrides };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-catalog-activation-')); await chmod(root, 0o700);
  const envFile = join(root, 'green.env'); const backupFile = join(root, 'old.env');
  const evidenceFile = join(root, 'evidence.json'); const outputFile = join(root, 'runtime.json');
  const firebase = join(root, 'firebase.json'); const mfa = join(root, 'mfa.key'); const uploadsPath = join(root, 'uploads');
  await mkdir(uploadsPath, { mode: 0o700 }); await writeFile(firebase, '{}', { mode: 0o600 });
  await writeFile(mfa, 'm'.repeat(32), { mode: 0o600 });
  const values = environment();
  const envFileValues = Object.fromEntries(Object.entries(values)
    .filter(([key]) => !['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME'].includes(key)));
  const originalEnv = envText(envFileValues); await writeFile(envFile, originalEnv, { mode: 0o600 });
  const runId = 'web-fixture-catalog-activation-test';
  const bootstrap = { kind: 'sit-dedicated-web-fixture-bootstrap', schemaVersion: 1, operation: 'seed',
    sourceCommit: bootstrapCommit, schemaCount: 98, ledgerDigest: requiredBootstrapLedgerDigest,
    passwordDigests: ['4'.repeat(64), '5'.repeat(64)],
    preflight: { runId, listingId: dedicatedFixture.listing, uploadName: dedicatedFixture.upload,
      roles: [{ role: 'owner', userId: dedicatedFixture.owner }, { role: 'renter', userId: dedicatedFixture.renter }] } };
  const bootstrapBytes = Buffer.from(`${JSON.stringify(bootstrap)}\n`); const bootstrapSha = hash(bootstrapBytes);
  const image = `registry.example/shareittoo-api:${runtimeCommit}`;
  const mounts = [
    { type: 'bind', name: 'mfa', source: mfa, destination: '/run/secrets/mfa-encryption-key', readOnly: true },
    { type: 'bind', name: 'firebase', source: firebase, destination: '/run/secrets/firebase-service-account.json', readOnly: true },
    { type: 'volume', name: 'sit-green-uploads-20260918011528-wp254', source: uploadsPath, destination: '/data/uploads', readOnly: false },
  ];
  const api = { Id: 'a'.repeat(64), Image: `sha256:${'9'.repeat(64)}`, Name: '/shareittoo-staging-api', State: { Running: true },
    Config: { Image: image, Env: Object.entries(values).map(([key, value]) => `${key}=${value}`),
      Cmd: ['node', 'src/server.js'], Entrypoint: null, WorkingDir: '/app', User: 'shareittoo',
      Hostname: 'a'.repeat(12), Tty: false, OpenStdin: false, Labels: { 'com.shareittoo.sit.green': 'true' } },
    HostConfig: { GroupAdd: ['65532'], RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
      PortBindings: {}, NetworkMode: 'sit-green-network-20260918011528-wp254', SecurityOpt: ['no-new-privileges'],
      NoNewPrivileges: true, Memory: 64, CapAdd: [], CapDrop: [], Devices: [], DeviceRequests: [], Ulimits: [],
      Tmpfs: {}, MaskedPaths: [], ReadonlyPaths: [], Dns: [], DnsSearch: [], ExtraHosts: [], Binds: [], Links: [] },
    Mounts: mounts.map((mount) => ({ Type: mount.type, Name: mount.type === 'volume' ? mount.name : null,
      Source: mount.source, Destination: mount.destination, RW: !mount.readOnly })),
    NetworkSettings: { Ports: {}, Networks: {
      'sit-green-network-20260918011528-wp254': { NetworkID: primaryNetworkId },
      'sit-staging-provider-egress': { NetworkID: providerNetworkId },
    } } };
  const state = activationState(); const before = publicState(false);
  const fixtureBinding = { opsCommit, loginProofOpsCommit: requiredLoginProofOpsCommit,
    bootstrapManifestSha256: bootstrapSha, bootstrapRunIdSha256: hash(runId),
    seedScopeDigest, seedSnapshotDigest, activationRunDigest: state.activationRunDigest,
    databasePreparationEvidenceSha256: requiredDatabasePreparationEvidenceSha256,
    loginProofEvidenceSha256: requiredLoginProofEvidenceSha256,
    loginIdentityDigest: state.identityDigest, loginCatalogDigest: state.catalogDigest,
    databaseStateDigest: digest(state), publicBeforeDigest: digest(before), envSha256: hash(originalEnv),
    environmentDigest: digest(values), apiFingerprint: corsContainerFingerprint(api), backupFile, evidenceFile };
  const manifest = { kind: 'sit-staging-web-fixture-catalog-activation-runtime-manifest', schemaVersion: 1,
    apiContainerId: api.Id, environment: 'staging', composeProject: 'sit-green', apiContainer: 'shareittoo-staging-api',
    databaseContainer: 'sit-green-postgres-20260918011528-wp254', databaseVolume: 'sit-green-volume-20260918011528-wp254',
    databaseName: 'shareittoo_green', databaseUser: 'shareittoo_green', network: 'sit-green-network-20260918011528-wp254',
    providerNetwork: 'sit-staging-provider-egress', uploadsVolume: 'sit-green-uploads-20260918011528-wp254', image,
    runtimeRevision: runtimeCommit, imageDigest, envFile, envUid: process.getuid(), envGid: process.getgid(), mounts,
    safetyEnv: { DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
      PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0' },
    label: { key: 'com.shareittoo.sit.green', value: 'true' }, fixtureBinding };
  const dbBytes = Buffer.from('{"status":"database-prepared"}\n');
  const loginBytes = Buffer.from(`${JSON.stringify(loginEvidence(bootstrapSha, hash(runId)))}\n`);
  return { root, envFile, backupFile, evidenceFile, outputFile, values, envFileValues, originalEnv, runId, bootstrapBytes,
    bootstrapSha, api, manifest, state, before, dbBytes, loginBytes };
}

function startupPayload() {
  return JSON.stringify({ ok: true, attempts: { live: 1, ready: 1 },
    last: { live: { status: 200 }, ready: { status: 200 } },
    version: { status: 200, commit: runtimeCommit, environment: 'test' },
    flags: { DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'true',
      FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
      SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0' } });
}

function fakeExecutor(fx, { failPhase, lateEvidenceCollision = false, publicPhotoFault = null } = {}) {
  const containers = new Map([[fx.manifest.apiContainer, structuredClone(fx.api)]]); const calls = [];
  const fixed = new Map([
    [fx.manifest.databaseContainer, { Name: `/${fx.manifest.databaseContainer}`, State: { Running: true } }],
    [fx.manifest.databaseVolume, { Name: fx.manifest.databaseVolume }],
    [fx.manifest.network, { Name: fx.manifest.network, Id: primaryNetworkId, Internal: true }],
    [fx.manifest.providerNetwork, { Name: fx.manifest.providerNetwork, Id: providerNetworkId }],
    [fx.manifest.uploadsVolume, { Name: fx.manifest.uploadsVolume }],
  ]);
  const imageRecord = { Id: fx.api.Image, RepoTags: [fx.manifest.image], Config: { User: 'shareittoo',
    Labels: { 'org.opencontainers.image.revision': runtimeCommit } }, RepoDigests: [`${fx.manifest.image}@${imageDigest}`] };
  const byRef = (value) => containers.get(value) ?? [...containers.values()].find((r) => r.Id === value) ?? fixed.get(value);
  const mutateNetwork = (record) => {
    for (const network of Object.values(record.NetworkSettings?.Networks ?? {})) {
      network.Aliases = ['changed']; network.IPAddress = '172.31.8.9'; network.EndpointID = '6'.repeat(64);
    }
  };
  const command = async (program, args, options = {}) => {
    assert.equal(program, 'docker'); calls.push({ phase: options.phase, args: [...args] });
    if (options.phase === failPhase) throw Object.assign(Error('injected'), { code: 'catalog_activation_injected' });
    if (args[0] === 'inspect') {
      const record = byRef(args.at(-1));
      if (!record && options.allowFailure) return { stdout: '', code: 1 };
      if (!record) throw Error('missing_inspect');
      if (lateEvidenceCollision && options.phase === 'fixture_env_rollback_seal_readback') {
        await writeFile(fx.evidenceFile, 'foreign-evidence\n', { mode: 0o600 });
      }
      return { stdout: JSON.stringify(record), code: 0 };
    }
    if (args[0] === 'image') return { stdout: JSON.stringify(imageRecord), code: 0 };
    if (args[0] === 'ps') {
      const name = /^name=\^\/(.+)\$$/u.exec(args[args.indexOf('--filter') + 1])?.[1];
      return { stdout: name && containers.has(name) ? `${name}\n` : '', code: 0 };
    }
    if (args[0] === 'exec') {
      if (args[1] === fx.manifest.databaseContainer) {
        const sql = String(args.at(-1));
        assert.ok(!sql.includes(forbiddenRunHashInterpolation));
        assert.ok(!args.some((arg) => String(arg).startsWith('run_hash=')));
        if (sql.includes('FROM seeded CROSS JOIN later CROSS JOIN fixture')) {
          return { stdout: `1|${seedScopeDigest}|${seedSnapshotDigest}|${hash(fx.runId)}|0|2|1|1\n`, code: 0 };
        }
        if (sql.includes("count(*) || '|'")) return { stdout: `98|098_booking_checkout_declaration_constraints.up.sql\n`, code: 0 };
        if (sql.includes('string_agg')) return { stdout: `${migrationLedger}\n`, code: 0 };
        return { stdout: `${JSON.stringify(fx.state)}\n`, code: 0 };
      }
      if (String(args.at(-1)).includes('runtimeNames')) return { stdout: startupPayload(), code: 0 };
      if (String(args.at(-1)).includes("config.syntheticCatalog.enabled")) {
        const enabled = !String(options.phase).includes('rollback');
        return { stdout: JSON.stringify({ enabled, listingCount: 1, uploadCount: 1,
          registration: false, payment: 'memory', stripe: 'false', expected: enabled }), code: 0 };
      }
      if (String(args.at(-1)).includes('expectedVisible')) {
        const visible = !String(options.phase).includes('before') && !String(options.phase).includes('pre_mutation')
          && !String(options.phase).includes('rollback');
        const value = publicState(visible);
        if (visible && publicPhotoFault === 'missing') Object.assign(value, { photoCount: 0, photoDigest: null });
        if (visible && publicPhotoFault === 'wrong-digest') value.photoDigest = hash('wrong-canonical-public-photo');
        return { stdout: JSON.stringify(value), code: 0 };
      }
      throw Error(`unexpected_exec:${options.phase}`);
    }
    if (args[0] === 'stop') { const r = byRef(args[1]); r.State.Running = false; mutateNetwork(r); return { stdout: '', code: 0 }; }
    if (args[0] === 'rename') { const r = byRef(args[1]); containers.delete(r.Name.slice(1)); r.Name = `/${args[2]}`;
      containers.set(args[2], r); mutateNetwork(r); return { stdout: '', code: 0 }; }
    if (args[0] === 'create') {
      const option = (name) => args[args.indexOf(name) + 1]; const name = option('--name');
      const networkIndex = args.indexOf('--network'); const record = structuredClone(fx.api);
      record.Id = 'b'.repeat(64); record.Name = `/${name}`; record.State.Running = false;
      record.Config.Image = args[networkIndex + 2]; record.Config.Hostname = 'b'.repeat(12);
      record.Config.Env = [`APP_COMMIT=${runtimeCommit}`,
        ...(await readFile(option('--env-file'), 'utf8')).split(/\r?\n/u).filter(Boolean)].reverse();
      record.HostConfig.NetworkMode = args[networkIndex + 1];
      record.NetworkSettings = { Ports: {}, Networks: { [fx.manifest.network]: { NetworkID: primaryNetworkId } } };
      containers.set(name, record); return { stdout: `${record.Id}\n`, code: 0 };
    }
    if (args[0] === 'network') { byRef(args[3]).NetworkSettings.Networks[fx.manifest.providerNetwork] = { NetworkID: providerNetworkId }; return { stdout: '', code: 0 }; }
    if (args[0] === 'start') { const r = byRef(args[1]); r.State.Running = true; mutateNetwork(r); return { stdout: '', code: 0 }; }
    if (args[0] === 'rm') { const r = byRef(args.at(-1)); containers.delete(r.Name.slice(1)); return { stdout: '', code: 0 }; }
    throw Error(`unexpected:${args.join(' ')}`);
  };
  return { command, calls, containers };
}

const evidenceHash = (bytes) => bytes.toString().includes('database-prepared')
  ? requiredDatabasePreparationEvidenceSha256 : requiredLoginProofEvidenceSha256;

test('login proof remains bound to its historical commit and canonical-row ledger digest', async () => {
  const fx = await fixture();
  try {
    const evidence = JSON.parse(fx.loginBytes);
    for (const drift of [{ runtimeCommit: 'e'.repeat(40) }, { imageDigest: `sha256:${'e'.repeat(64)}` }]) {
      assert.throws(() => validateLoginProofEvidence({ ...evidence, ...drift }, {
        runtimeRevision: runtimeCommit, imageDigest,
        bootstrapManifestSha256: fx.bootstrapSha, bootstrapRunIdSha256: hash(fx.runId),
      }), /catalog_activation_login_evidence_invalid/u);
    }
    assert.doesNotThrow(() => validateLoginProofEvidence(evidence, { runtimeRevision: runtimeCommit, imageDigest,
      bootstrapManifestSha256: fx.bootstrapSha, bootstrapRunIdSha256: hash(fx.runId) }));
    assert.throws(() => validateLoginProofEvidence({ ...evidence, schemaVersion: 2 }, {
      runtimeRevision: runtimeCommit, imageDigest,
      bootstrapManifestSha256: fx.bootstrapSha, bootstrapRunIdSha256: hash(fx.runId),
    }), /catalog_activation_login_evidence_invalid/u,
    'unchanged consumer must reject schema 2 until a separate exact-proof binding commit');
    assert.throws(() => validateLoginProofEvidence({ ...evidence, opsCommit }, { runtimeRevision: runtimeCommit, imageDigest,
      bootstrapManifestSha256: fx.bootstrapSha, bootstrapRunIdSha256: hash(fx.runId) }),
    /catalog_activation_login_evidence_invalid/u);
    for (const ledgerDigest of [migrationLedger, '6'.repeat(64)]) {
      assert.throws(() => validateLoginProofEvidence({ ...evidence, ledgerDigest }, {
        runtimeRevision: runtimeCommit, imageDigest,
        bootstrapManifestSha256: fx.bootstrapSha, bootstrapRunIdSha256: hash(fx.runId),
      }), /catalog_activation_login_evidence_invalid/u);
    }
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('bootstrap binds the real canonical-row ledger, not the current DB text ledger', async () => {
  const fx = await fixture();
  try {
    assert.doesNotThrow(() => validateCatalogActivationBootstrap(fx.bootstrapBytes, fx.bootstrapSha));
    for (const ledgerDigest of [migrationLedger, '6'.repeat(64)]) {
      const manifest = { ...JSON.parse(fx.bootstrapBytes), ledgerDigest };
      const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
      assert.throws(() => validateCatalogActivationBootstrap(bytes, hash(bytes)),
        /catalog_activation_bootstrap_invalid/u);
    }
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('prepare is read-only and binds exact prerequisite evidence plus one-key transition', async () => {
  const fx = await fixture();
  try {
    const fake = fakeExecutor(fx);
    const result = await prepareCatalogActivationManifest({ sourceCommit: opsCommit,
      bootstrapManifestBytes: fx.bootstrapBytes, bootstrapManifestSha256: fx.bootstrapSha,
      databaseEvidenceBytes: fx.dbBytes, databaseEvidenceSha256: requiredDatabasePreparationEvidenceSha256,
      loginEvidenceBytes: fx.loginBytes, loginEvidenceSha256: requiredLoginProofEvidenceSha256,
      backupFile: fx.backupFile, evidenceFile: fx.evidenceFile, outputFile: fx.outputFile,
      envFile: fx.envFile, command: fake.command, commandEnv: {}, testOnlyEvidenceHash: evidenceHash });
    assert.equal(result.status, 'catalog-activation-manifest-prepared-read-only');
    assert.deepEqual(result.changedEnvironmentKeys, [catalogActivationKey]);
    const prepared = JSON.parse(await readFile(fx.outputFile)); assertCatalogActivationManifest(prepared);
    assert.equal(prepared.fixtureBinding.loginProofOpsCommit, requiredLoginProofOpsCommit);
    assert.equal(prepared.fixtureBinding.seedScopeDigest, seedScopeDigest);
    assert.equal(prepared.fixtureBinding.seedSnapshotDigest, seedSnapshotDigest);
    assert.equal(prepared.fixtureBinding.activationRunDigest, hash(activationRunId));
    assert.equal((await lstat(fx.outputFile)).mode & 0o777, 0o600);
    assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
    await assert.rejects(readFile(fx.backupFile), { code: 'ENOENT' });
    await assert.rejects(readFile(fx.evidenceFile), { code: 'ENOENT' });
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('prepare rejects aliased inputs/outputs before Docker and production entry never forwards the hash seam', async () => {
  const fx = await fixture();
  try {
    const fake = fakeExecutor(fx);
    await assert.rejects(prepareCatalogActivationManifest({ sourceCommit: opsCommit,
      bootstrapManifestBytes: fx.bootstrapBytes, bootstrapManifestSha256: fx.bootstrapSha,
      databaseEvidenceBytes: fx.dbBytes, databaseEvidenceSha256: requiredDatabasePreparationEvidenceSha256,
      loginEvidenceBytes: fx.loginBytes, loginEvidenceSha256: requiredLoginProofEvidenceSha256,
      backupFile: fx.backupFile, evidenceFile: fx.backupFile, outputFile: fx.outputFile,
      envFile: fx.envFile, command: fake.command, commandEnv: {}, testOnlyEvidenceHash: evidenceHash }),
    /catalog_activation_prepare_output_paths_alias/u);
    assert.equal(fake.calls.length, 0);
    assert.throws(() => assertCatalogActivationPreparePaths([
      '/protected/bootstrap.json', '/protected/db.json', '/protected/login.json',
      '/protected/backup.env', '/protected/backup.env', '/protected/runtime.json',
    ]), /catalog_activation_prepare_paths_alias/u);
    const entry = await readFile(new URL('../ops/activate_staging_web_fixture_catalog.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(entry, /evidenceHash/u);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('runtime manifest self-validation rejects backup, evidence, and env path aliases', async () => {
  const fx = await fixture();
  try {
    for (const [backupFile, evidenceFile] of [
      [fx.evidenceFile, fx.evidenceFile],
      [fx.envFile, fx.evidenceFile],
      [fx.backupFile, fx.envFile],
    ]) {
      assert.throws(() => assertCatalogActivationManifest({ ...fx.manifest,
        fixtureBinding: { ...fx.manifest.fixtureBinding, backupFile, evidenceFile } }),
      /catalog_activation_(binding_invalid|manifest_paths_alias)/u);
    }
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('prepare rejects env-file runtime identity overrides before every Docker command', async () => {
  const fx = await fixture();
  try {
    await writeFile(fx.envFile, `${fx.originalEnv}APP_COMMIT=${runtimeCommit}\n`, { mode: 0o600 });
    const fake = fakeExecutor(fx);
    await assert.rejects(prepareCatalogActivationManifest({ sourceCommit: opsCommit,
      bootstrapManifestBytes: fx.bootstrapBytes, bootstrapManifestSha256: fx.bootstrapSha,
      databaseEvidenceBytes: fx.dbBytes, databaseEvidenceSha256: requiredDatabasePreparationEvidenceSha256,
      loginEvidenceBytes: fx.loginBytes, loginEvidenceSha256: requiredLoginProofEvidenceSha256,
      backupFile: fx.backupFile, evidenceFile: fx.evidenceFile, outputFile: fx.outputFile,
      envFile: fx.envFile, command: fake.command, commandEnv: {}, testOnlyEvidenceHash: evidenceHash }),
    /catalog_activation_env_identity_override_forbidden/u);
    assert.equal(fake.calls.length, 0);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('entry requires root and Node 22 before source or protected input reads', async () => {
  assert.doesNotThrow(() => assertCatalogActivationHost({ uid: 0, nodeMajor: 22 }));
  assert.throws(() => assertCatalogActivationHost({ uid: 501, nodeMajor: 22 }),
    /catalog_activation_root_node22_required/u);
  assert.throws(() => assertCatalogActivationHost({ uid: 0, nodeMajor: 21 }),
    /catalog_activation_root_node22_required/u);
  const entry = await readFile(new URL('../ops/activate_staging_web_fixture_catalog.mjs', import.meta.url), 'utf8');
  const main = entry.slice(entry.indexOf('async function main'));
  assert.ok(main.indexOf('assertCatalogActivationHost();') < main.indexOf('readCleanCatalogActivationSource()'));
  assert.ok(main.indexOf('assertCatalogActivationHost();') < main.indexOf('readFixtureEnvBootstrapManifest'));
});

test('activation source contains no login, booking, payment, Play or external-provider action path', async () => {
  const source = await readFile(new URL('../ops/staging_web_fixture_catalog_activation.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source,
    /\/v1\/auth|\/v1\/bookings|\/v1\/rental-requests|stripe\.com|googleapis\.com|play\.google/u);
  assert.ok(!source.includes(forbiddenRunHashInterpolation));
  assert.ok(!catalogActivationStateSql.includes(forbiddenRunHashInterpolation));
});

test('database state binds only the protected activation run digest', async () => {
  const fx = await fixture();
  try {
    assert.doesNotThrow(() => assertCatalogActivationState(JSON.stringify(fx.state), fx.manifest.fixtureBinding));
    assert.throws(() => assertCatalogActivationState(JSON.stringify(fx.state), {
      ...fx.manifest.fixtureBinding, activationRunDigest: '6'.repeat(64),
    }), /catalog_activation_database_state_invalid/u);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('default preflight is read-only and execute changes only catalog flag with exact public projection', async () => {
  const fx = await fixture();
  try {
    const fake = fakeExecutor(fx); assertCatalogActivationManifest(fx.manifest);
    const preflight = await runCatalogActivation({ manifest: fx.manifest,
      bootstrapManifestBytes: fx.bootstrapBytes, databaseEvidenceBytes: fx.dbBytes,
      loginEvidenceBytes: fx.loginBytes, sourceCommit: opsCommit, evidenceFile: fx.evidenceFile,
      command: fake.command, commandEnv: {}, testOnlyEvidenceHash: evidenceHash });
    assert.equal(preflight.status, 'catalog-activation-preflight-passed-no-mutation');
    assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
    assert.ok(fake.calls.every((call) => !['stop', 'rename', 'create', 'start', 'rm'].includes(call.args[0])));
    const result = await runCatalogActivation({ manifest: fx.manifest,
      bootstrapManifestBytes: fx.bootstrapBytes, databaseEvidenceBytes: fx.dbBytes,
      loginEvidenceBytes: fx.loginBytes, sourceCommit: opsCommit, evidenceFile: fx.evidenceFile,
      execute: true, confirmSource: opsCommit, confirmRun: fx.runId, command: fake.command,
      commandEnv: { STAGING_WEB_FIXTURE_CATALOG_EXECUTE: '1',
        STAGING_WEB_FIXTURE_CATALOG_CONFIRM_SOURCE: opsCommit,
        STAGING_WEB_FIXTURE_CATALOG_CONFIRM_RUN: fx.runId }, testOnlyEvidenceHash: evidenceHash });
    assert.equal(result.status, 'staging-web-synthetic-catalog-activated-noncontractual');
    const after = Object.fromEntries((await readFile(fx.envFile, 'utf8')).trim().split('\n')
      .map((line) => line.split(/=(.*)/su).slice(0, 2)));
    assert.equal(after[catalogActivationKey], 'true');
    assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([key]) => key !== catalogActivationKey)),
      Object.fromEntries(Object.entries(fx.envFileValues).filter(([key]) => key !== catalogActivationKey)));
    assert.equal(await readFile(fx.backupFile, 'utf8'), fx.originalEnv);
    assert.equal((await lstat(fx.evidenceFile)).mode & 0o777, 0o600);
    assert.doesNotMatch(await readFile(fx.evidenceFile, 'utf8'),
      /synthetic_web_catalog_owner_v1|synthetic_web_catalog_renter_v1|example\.invalid|DATABASE_URL/u);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('all activation replacement and public/evidence faults restore exact old env and original identity', async (t) => {
  const phases = ['fixture_env_stop_current_api', 'fixture_env_seal_current_api',
    'fixture_env_create_replacement_api', 'fixture_env_attach_provider_network',
    'fixture_env_start_replacement_api', 'fixture_env_replacement_readback',
    'fixture_env_replacement_runtime_probe', 'catalog_activation_replacement_config_readback',
    'catalog_activation_replacement_public_readback', 'catalog_activation_final_database_readback',
    'catalog_activation_final_database_integrity_schema', 'catalog_activation_final_database_integrity_ledger',
    'catalog_activation_final_seed_readback',
    'catalog_activation_final_public_readback'];
  for (const phase of phases) await t.test(phase, async () => {
    const fx = await fixture();
    try {
      const fake = fakeExecutor(fx, { failPhase: phase });
      await assert.rejects(runCatalogActivation({ manifest: fx.manifest,
        bootstrapManifestBytes: fx.bootstrapBytes, databaseEvidenceBytes: fx.dbBytes,
        loginEvidenceBytes: fx.loginBytes, sourceCommit: opsCommit, evidenceFile: fx.evidenceFile,
        execute: true, confirmSource: opsCommit, confirmRun: fx.runId, command: fake.command,
        commandEnv: { STAGING_WEB_FIXTURE_CATALOG_EXECUTE: '1',
          STAGING_WEB_FIXTURE_CATALOG_CONFIRM_SOURCE: opsCommit,
          STAGING_WEB_FIXTURE_CATALOG_CONFIRM_RUN: fx.runId }, testOnlyEvidenceHash: evidenceHash }),
      (error) => error.rollback?.restored === true);
      assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
      assert.equal(fake.containers.get(fx.manifest.apiContainer).Id, fx.api.Id);
      await assert.rejects(readFile(fx.evidenceFile), { code: 'ENOENT' });
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  });
});

test('missing or wrong canonical synthetic photo fails public readback and restores the original', async (t) => {
  for (const publicPhotoFault of ['missing', 'wrong-digest']) await t.test(publicPhotoFault, async () => {
    const fx = await fixture();
    try {
      const fake = fakeExecutor(fx, { publicPhotoFault });
      await assert.rejects(runCatalogActivation({ manifest: fx.manifest,
        bootstrapManifestBytes: fx.bootstrapBytes, databaseEvidenceBytes: fx.dbBytes,
        loginEvidenceBytes: fx.loginBytes, sourceCommit: opsCommit, evidenceFile: fx.evidenceFile,
        execute: true, confirmSource: opsCommit, confirmRun: fx.runId, command: fake.command,
        commandEnv: { STAGING_WEB_FIXTURE_CATALOG_EXECUTE: '1',
          STAGING_WEB_FIXTURE_CATALOG_CONFIRM_SOURCE: opsCommit,
          STAGING_WEB_FIXTURE_CATALOG_CONFIRM_RUN: fx.runId }, testOnlyEvidenceHash: evidenceHash }),
      (error) => error.code === 'catalog_activation_public_readback_invalid' && error.rollback?.restored === true);
      assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
      assert.equal(fake.containers.get(fx.manifest.apiContainer).Id, fx.api.Id);
      await assert.rejects(readFile(fx.evidenceFile), { code: 'ENOENT' });
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  });
});

test('late foreign evidence is preserved and still triggers identity-checked rollback', async () => {
  const fx = await fixture();
  try {
    const fake = fakeExecutor(fx, { lateEvidenceCollision: true });
    await assert.rejects(runCatalogActivation({ manifest: fx.manifest,
      bootstrapManifestBytes: fx.bootstrapBytes, databaseEvidenceBytes: fx.dbBytes,
      loginEvidenceBytes: fx.loginBytes, sourceCommit: opsCommit, evidenceFile: fx.evidenceFile,
      execute: true, confirmSource: opsCommit, confirmRun: fx.runId, command: fake.command,
      commandEnv: { STAGING_WEB_FIXTURE_CATALOG_EXECUTE: '1',
        STAGING_WEB_FIXTURE_CATALOG_CONFIRM_SOURCE: opsCommit,
        STAGING_WEB_FIXTURE_CATALOG_CONFIRM_RUN: fx.runId }, testOnlyEvidenceHash: evidenceHash }),
    (error) => error.code === 'fixture_env_evidence_write_exists' && error.rollback?.restored === true);
    assert.equal(await readFile(fx.evidenceFile, 'utf8'), 'foreign-evidence\n');
    assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
    assert.equal(fake.containers.get(fx.manifest.apiContainer).Id, fx.api.Id);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});
