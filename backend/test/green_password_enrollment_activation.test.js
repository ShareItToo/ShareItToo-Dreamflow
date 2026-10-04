import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  activationEnvironment,
  deriveProtectedEnvironmentScryptDigest,
  greenPasswordEnrollmentContainerSha256,
  greenPasswordEnrollmentHealthSha256,
  greenPasswordEnrollmentMountsSha256,
  greenPasswordEnrollmentQueueSha256,
  readProtectedActivationFile,
  runGreenPasswordEnrollmentActivation,
} from '../ops/green_password_enrollment_activation.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceCommit = 'a'.repeat(40);
const currentRevision = 'f'.repeat(40);
const sourceVersion = '1.2.3+2026100401';
const containerId = 'b'.repeat(64);
const currentImageDigest = `sha256:${'9'.repeat(64)}`;
const targetImageDigest = `sha256:${'c'.repeat(64)}`;
const now = Date.parse('2026-10-04T10:00:00.000Z');
const smtpPasswordName = () => ['SMTP', '_PASS', 'WORD'].join('');
const runtimeSmtpCredential = () => Object.freeze({
  name: smtpPasswordName(),
  value: crypto.randomBytes(24).toString('base64url'),
});

const envText = (environment) => Buffer.from(`${Object.entries(environment)
  .map(([name, value]) => `${name}=${value}`).join('\n')}\n`);

function currentEnvironment() {
  return {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api/v1',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_LISTING_AI_BUDGET_CENTS: '0',
    PRIVATE_PILOT_V4_ENABLED: 'true', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
    APP_PUBLIC_URL: 'http://shareittoo-staging-api:8080', MAIL_TRANSPORT: 'memory',
    SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'false',
    SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: '',
    SIT_STAGING_ALLOWED_USER_IDS: 'pilot-existing',
    SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS: 'pilot-existing',
    SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS: 'existing@example.test',
    SMTP_HOST: 'smtp.relay.internal', SMTP_PORT: '25', SMTP_SECURE: 'false',
    SMTP_REQUIRE_TLS: 'true', SMTP_USER: '', [smtpPasswordName()]: '',
    MAIL_FROM: 'ShareItToo <contact@shareittoo.com>', MAIL_REPLY_TO: 'contact@shareittoo.com',
    APP_COMMIT: currentRevision, APP_VERSION: '1.2.2+2026093001',
    APP_BUILD_TIME: '2026-09-30T00:00:00Z',
  };
}

function invitation() {
  const tokenDigest = hash('opaque-generator-token-digest');
  return {
    emailDigest: hash(`${tokenDigest}\npilot@example.test`),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    issuedAt: new Date(now - 60 * 1000).toISOString(),
    tokenDigest,
    userId: 'pilot-new',
  };
}

function proposedEnvironment() {
  const environment = {
    ...currentEnvironment(),
    APP_PUBLIC_URL: 'https://staging.shareittoo.com',
    MAIL_TRANSPORT: 'smtp',
    SIT_STAGING_ALLOWED_USER_IDS: 'pilot-existing,pilot-new',
    SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS: 'pilot-existing,pilot-new',
    SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS: 'existing@example.test,pilot@example.test',
    SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true',
    SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE:
      '/run/secrets/staging-password-enrollment-registry.json',
  };
  delete environment.APP_COMMIT;
  delete environment.APP_VERSION;
  delete environment.APP_BUILD_TIME;
  return environment;
}

function readinessEvidence(state, prepared) {
  const readiness = {
    sourceCommit, sourceVersion,
    targetEnvironment: 'staging-green', runtimeDeploymentEnvironment: 'test',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    publicBaseUrl: 'https://staging.shareittoo.com/api/v1',
    appPublicUrl: 'https://staging.shareittoo.com',
    returnOrigin: 'https://staging.shareittoo.com',
    passwordEnrollmentEnabled: true, invitationCount: 1,
    invitationConfigurationSha256: hash('invitation-configuration'),
    invitationRegistrySha256: state.manifest.registrySha256,
    accessGateEnabled: true, accessGateValid: true,
    allowedUserCount: prepared.accessAllowedCount,
    allowedUserIdsSha256: hash('allowed-users'),
    invitationPrincipalMatchCount: 1, unmatchedInvitationPrincipalCount: 0,
    notificationAllowedUserCount: prepared.notificationUserCount,
    notificationAllowedUserIdsSha256: hash('notification-users'),
    invitationNotificationUserMatchCount: 1,
    unmatchedInvitationNotificationUserCount: 0,
    privatePilotEnabled: true, realPaymentsEnabled: false,
    mailTransport: 'smtp', mailerStatus: 'ok', recipientGateEnabled: true,
    allowedRecipientCount: prepared.notificationRecipientCount,
    allowedRecipientEmailsSha256: hash('recipient-emails'),
    invitationRecipientMatchCount: 1, unmatchedInvitationRecipientCount: 0,
    invitationRecipientBindingSha256: prepared.invitationBindingSha256,
    runtimeConfigurationSha256: hash('runtime-configuration'),
    smtpConfigurationSha256: prepared.smtpConfigurationSha256,
    runtimeReadbackSha256: hash('runtime-readback'),
    mailReadbackSha256: hash('mail-readback'),
    observedAtUtc: '2026-10-04T10:00:00Z', validUntilUtc: '2026-10-04T11:00:00Z',
  };
  const evidence = {
    schemaVersion: 2, kind: 'sit-staging-password-enrollment-web-readiness',
    evidenceClass: 'verified-runtime', syntheticFixture: false, readiness,
    readinessSha256: hash(JSON.stringify(readiness)),
  };
  return { evidence, digest: hash(JSON.stringify(evidence)) };
}

function candidateState(state, prepared, candidateId = '7'.repeat(64)) {
  const proposed = proposedEnvironment();
  const mounts = [...state.currentState.container.Mounts, {
    Type: 'bind', Name: null, Source: state.registryFile,
    Destination: '/run/secrets/staging-password-enrollment-registry.json', RW: false,
  }];
  const hostMounts = mounts.map((mount) => ({
    Type: mount.Type, Source: mount.Type === 'volume' ? mount.Name : mount.Source,
    Target: mount.Destination, ReadOnly: mount.RW === false,
  }));
  const health = {
    commit: sourceCommit, deploymentEnvironment: 'test', firebaseAuthEnabled: true,
    firebasePhoneEnabled: false, googleRegistrationEnabled: false, liveStatus: 200,
    mailStatus: 'ok', passwordEnrollmentEnabled: true, paymentTransport: 'memory',
    readyStatus: 200, stripeLivemode: false,
  };
  const { evidence, digest } = readinessEvidence(state, prepared);
  return {
    container: {
      ...structuredClone(state.currentState.container), Id: candidateId,
      Name: '/shareittoo-staging-api', Image: targetImageDigest, State: { Running: true },
      Config: {
        ...structuredClone(state.currentState.container.Config),
        Image: `registry.example/shareittoo-api@${targetImageDigest}`,
        Hostname: candidateId.slice(0, 12),
        Env: Object.entries({
          ...proposed, APP_COMMIT: sourceCommit, APP_VERSION: sourceVersion,
          APP_BUILD_TIME: '2026-10-04T09:00:00Z',
        }).map(([name, value]) => `${name}=${value}`),
      },
      HostConfig: {
        ...structuredClone(state.currentState.container.HostConfig), Binds: null, Mounts: hostMounts,
      },
      Mounts: mounts,
    },
    image: structuredClone(state.currentState.targetImage),
    runtimeIdentity: { gid: state.manifest.registryGid, uid: state.manifest.registryUid },
    health, healthSha256: greenPasswordEnrollmentHealthSha256(health),
    queue: structuredClone(state.currentState.queue),
    registryReadback: {
      invitationCount: 1, parserStatus: 'ok', readable: true,
      sha256: state.manifest.registrySha256, writable: false,
    },
    readinessEvidence: evidence, readinessEvidenceSha256: digest,
    sealedOriginal: {
      id: containerId, name: `shareittoo-staging-api-sealed-${containerId.slice(0, 12)}`,
      running: false,
    },
  };
}

function commandShapedOperations(state, {
  fail = null, responseLoss = false, stopResponseLoss = false,
  renameResponseLoss = false, rollbackFail = false, candidateDriftAt = null,
} = {}) {
  const current = structuredClone(state.currentState);
  const prepared = activationEnvironment({
    currentEnvironment: currentEnvironment(), proposedEnvironment: proposedEnvironment(),
    invitations: [invitation()], now,
  });
  const candidate = candidateState(state, prepared);
  let candidateExists = false;
  let candidateContainer = null;
  let candidateInspections = 0;
  let queueReads = 0;
  const calls = [];
  const phase = (name) => {
    calls.push(name);
    if (fail === name) throw new Error('synthetic command failure');
  };
  return {
    calls,
    async collectCurrent() { phase('collectCurrent'); return structuredClone(current); },
    async readQueue() {
      queueReads += 1;
      phase(queueReads === 1 ? 'readQueueBefore' : 'readQueueAfter');
      return structuredClone(current.queue);
    },
    async stopExact(id) {
      phase('stopExact');
      if (id === containerId) current.container.State.Running = false;
      if (stopResponseLoss) throw new Error('lost stop response');
    },
    async renameExact(id, name) {
      phase(name === 'shareittoo-staging-api' ? 'renameOriginal' : 'renameExact');
      if (rollbackFail && name === 'shareittoo-staging-api') throw new Error('rollback denied');
      if (id === containerId) current.container.Name = `/${name}`;
      if (renameResponseLoss && name !== 'shareittoo-staging-api') throw new Error('lost rename response');
    },
    async createExact(plan) {
      phase('createExact');
      assert.ok(plan.args.includes('--mount'));
      assert.ok(plan.args.some((argument) => argument.includes('readonly=true')));
      assert.ok(!plan.args.includes('--volume'));
      candidateExists = true;
      candidateContainer = structuredClone(candidate.container);
      candidateContainer.State.Running = false;
      delete candidateContainer.NetworkSettings.Networks['sit-provider-egress'];
      if (responseLoss) throw new Error('lost response');
      return { containerId: candidate.container.Id };
    },
    async resolveCreatedCandidate() {
      calls.push('resolveCreatedCandidate');
      return candidateExists ? { containerId: candidate.container.Id } : null;
    },
    async inspectExact(id) {
      calls.push('inspectExact');
      if (id === containerId) return structuredClone(current.container);
      if (candidateExists && id === candidate.container.Id) {
        candidateInspections += 1;
        const observed = structuredClone(candidateContainer);
        if (candidateDriftAt === candidateInspections) observed.Config.Image = 'foreign.example/image:latest';
        return observed;
      }
      return null;
    },
    async connectExact() {
      phase('connectExact');
      candidateContainer.NetworkSettings.Networks['sit-provider-egress'] = {
        NetworkID: 'e'.repeat(64),
      };
    },
    async startExact(id) {
      phase(id === containerId ? 'startOriginal' : 'startExact');
      if (id === containerId) current.container.State.Running = true;
      else candidateContainer.State.Running = true;
    },
    async collectCandidate() {
      phase('collectCandidate');
      return structuredClone({ ...candidate, container: candidateContainer });
    },
    async removeExact() {
      phase('removeExact');
      if (rollbackFail) throw new Error('rollback denied');
      candidateExists = false;
      candidateContainer = null;
    },
    get candidateExists() { return candidateExists; },
  };
}

async function fixture({ proposed = proposedEnvironment() } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sit-green-password-activation-')));
  await chmod(root, 0o700);
  const environmentFile = join(root, 'proposed.env');
  const registryFile = join(root, 'registry.json');
  const backupFile = join(root, 'backup.json');
  const evidenceFile = join(root, 'evidence.json');
  const lockFile = join(root, 'activation.lock');
  const environmentBytes = envText(proposed);
  const registryBytes = Buffer.from(`${JSON.stringify([invitation()])}\n`);
  await writeFile(environmentFile, environmentBytes, { mode: 0o600 });
  await writeFile(registryFile, registryBytes, { mode: 0o600 });
  const uid = process.getuid();
  const gid = process.getgid();
  const mounts = [
    { Type: 'bind', Name: null, Source: join(root, 'mfa.key'), Destination: '/run/secrets/mfa-encryption-key', RW: false },
    { Type: 'bind', Name: null, Source: join(root, 'firebase.json'), Destination: '/run/secrets/firebase-service-account.json', RW: false },
    { Type: 'volume', Name: 'sit-green-uploads', Source: '/var/lib/docker/volumes/sit-green-uploads/_data', Destination: '/data/uploads', RW: true },
  ];
  const currentContainer = {
    Id: containerId, Name: '/shareittoo-staging-api', Image: currentImageDigest,
    State: { Running: true },
    Config: {
      Image: `registry.example/shareittoo-api:${currentRevision}`,
      Env: Object.entries(currentEnvironment()).map(([name, value]) => `${name}=${value}`),
      Cmd: ['node', 'src/server.js'], Entrypoint: null, User: 'shareittoo', WorkingDir: '/app',
      Hostname: containerId.slice(0, 12), Labels: { 'com.shareittoo.sit.green': 'true' },
    },
    HostConfig: {
      Binds: [`${join(root, 'mfa.key')}:/run/secrets/mfa-encryption-key:ro`,
        `${join(root, 'firebase.json')}:/run/secrets/firebase-service-account.json:ro`,
        'sit-green-uploads:/data/uploads:rw'],
      NetworkMode: 'sit-green-network', PortBindings: {},
      RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
      SecurityOpt: ['no-new-privileges'],
    },
    Mounts: mounts,
    NetworkSettings: { Ports: {}, Networks: {
      'sit-green-network': { NetworkID: 'd'.repeat(64) },
      'sit-provider-egress': { NetworkID: 'e'.repeat(64) },
    } },
  };
  const health = {
    commit: currentRevision, deploymentEnvironment: 'test', firebaseAuthEnabled: true,
    firebasePhoneEnabled: false, googleRegistrationEnabled: false, liveStatus: 200,
    mailStatus: 'ok', passwordEnrollmentEnabled: false, paymentTransport: 'memory',
    readyStatus: 200, stripeLivemode: false,
  };
  const queue = {
    dead: 0, pending: 0, processing: 0, retry: 0,
    sentInApp: 41, sentPush: 18, suppressedEmail: 8, suppressedPush: 23,
  };
  const manifest = {
    apiContainer: 'shareittoo-staging-api', backupFile,
    currentConfigurationSha256: greenPasswordEnrollmentContainerSha256(currentContainer),
    currentContainerId: containerId,
    currentHealthSha256: greenPasswordEnrollmentHealthSha256(health),
    currentImage: `registry.example/shareittoo-api:${currentRevision}`,
    currentImageDigest, currentImageId: currentImageDigest,
    currentQueueSha256: greenPasswordEnrollmentQueueSha256(queue),
    environmentFile, environmentGid: gid,
    environmentScryptDigest: deriveProtectedEnvironmentScryptDigest(
      environmentBytes, hash('synthetic-environment-scrypt-salt'),
    ),
    environmentScryptSalt: hash('synthetic-environment-scrypt-salt'),
    environmentUid: uid, evidenceFile,
    lockFile, mountsSha256: greenPasswordEnrollmentMountsSha256(mounts),
    network: 'sit-green-network', networkId: 'd'.repeat(64),
    operation: 'activate-green-password-enrollment', providerNetwork: 'sit-provider-egress',
    providerNetworkId: 'e'.repeat(64), registryFile, registryGid: gid,
    registrySha256: hash(registryBytes),
    registryTarget: '/run/secrets/staging-password-enrollment-registry.json',
    registryUid: uid, schemaVersion: 1, sourceCommit, sourceVersion,
    targetImage: `registry.example/shareittoo-api:${sourceCommit}`,
    targetImageDigest, targetImageId: targetImageDigest, targetRevision: sourceCommit,
    currentRevision,
  };
  const currentState = {
    container: currentContainer,
    image: {
      Id: currentImageDigest,
      RepoDigests: [`registry.example/shareittoo-api@${currentImageDigest}`],
      Config: { Labels: { 'org.opencontainers.image.revision': currentRevision } },
    },
    targetImage: {
      Id: targetImageDigest,
      RepoDigests: [`registry.example/shareittoo-api@${targetImageDigest}`],
      Config: {
        User: 'shareittoo',
        Labels: { 'org.opencontainers.image.revision': sourceCommit },
      },
    },
    targetRuntimeIdentity: { gid, uid, user: 'shareittoo' },
    targetRegistryProbe: { readable: true, sha256: hash(registryBytes), writable: false },
    network: { Id: 'd'.repeat(64), Name: 'sit-green-network', Internal: true },
    providerNetwork: { Id: 'e'.repeat(64), Name: 'sit-provider-egress', Internal: false },
    health, queue,
  };
  return { root, environmentFile, registryFile, manifest, currentState };
}

test('password enrollment transition is default-off', async () => {
  assert.equal(typeof activationEnvironment, 'function');
  await assert.rejects(
    runGreenPasswordEnrollmentActivation(),
    /green_password_enrollment_activation_denied/u,
  );
});

test('dry-run accepts protected relay SMTP candidate and exact recipient/principal bindings', async (t) => {
  const state = await fixture();
  t.after(() => rm(state.root, { force: true, recursive: true }));
  const result = await runGreenPasswordEnrollmentActivation({
    manifest: state.manifest, currentState: state.currentState, now,
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.invitationCount, 1);
  assert.equal(result.notificationRecipientCount, 2);
  assert.match(result.smtpConfigurationSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(result), /pilot@example|smtp\.relay|contact@|token/u);
  await assert.rejects(readFile(state.manifest.evidenceFile), /ENOENT/u);
  await assert.rejects(readFile(state.manifest.backupFile), /ENOENT/u);
});

test('secret-bearing environment binding rejects wrong salt, digest, and valid auth substitution', async (t) => {
  for (const drift of ['salt', 'digest', 'secret']) {
    const credential = runtimeSmtpCredential();
    const proposed = proposedEnvironment();
    proposed.SMTP_USER = 'relay-user';
    proposed[credential.name] = credential.value;
    const state = await fixture({ proposed });
    t.after(() => rm(state.root, { force: true, recursive: true }));
    if (drift === 'salt') {
      state.manifest.environmentScryptSalt = hash('different-scrypt-salt');
    } else if (drift === 'digest') {
      state.manifest.environmentScryptDigest = hash('not-a-scrypt-output');
    } else {
      const replacement = { ...proposed };
      replacement[credential.name] = crypto.randomBytes(24).toString('base64url');
      await writeFile(state.environmentFile, envText(replacement), { mode: 0o600 });
    }
    await assert.rejects(runGreenPasswordEnrollmentActivation({
      manifest: state.manifest, currentState: state.currentState, now,
    }), /green_password_enrollment_activation_denied/u, drift);
  }
});

test('lowercase and mixed-case secret names never affect safe hashes or evidence', async (t) => {
  const names = ['smtp_password', 'ApiSeCrEt', 'sessionToKeN', 'database_url'];
  const makeEnvironments = () => {
    const current = currentEnvironment();
    const proposed = proposedEnvironment();
    const values = names.map(() => crypto.randomBytes(18).toString('base64url'));
    names.forEach((name, index) => {
      current[name] = values[index];
      proposed[name] = values[index];
    });
    return { current, proposed, values };
  };
  const firstEnvironment = makeEnvironments();
  const secondEnvironment = makeEnvironments();
  const first = activationEnvironment({
    currentEnvironment: firstEnvironment.current,
    proposedEnvironment: firstEnvironment.proposed,
    invitations: [invitation()], now,
  });
  const second = activationEnvironment({
    currentEnvironment: secondEnvironment.current,
    proposedEnvironment: secondEnvironment.proposed,
    invitations: [invitation()], now,
  });
  assert.equal(first.safeEnvironmentSha256, second.safeEnvironmentSha256);

  const state = await fixture();
  t.after(() => rm(state.root, { force: true, recursive: true }));
  const firstContainer = structuredClone(state.currentState.container);
  const secondContainer = structuredClone(state.currentState.container);
  names.forEach((name, index) => {
    firstContainer.Config.Env.push(`${name}=${firstEnvironment.values[index]}`);
    secondContainer.Config.Env.push(`${name}=${secondEnvironment.values[index]}`);
  });
  assert.equal(greenPasswordEnrollmentContainerSha256(firstContainer),
    greenPasswordEnrollmentContainerSha256(secondContainer));

  const exposed = JSON.stringify({ safeEnvironmentSha256: first.safeEnvironmentSha256 });
  for (const value of [...firstEnvironment.values, ...secondEnvironment.values]) {
    assert.equal(exposed.includes(value), false);
  }
});

test('authenticated SMTP is accepted only as a complete pair', () => {
  const environment = proposedEnvironment();
  const credential = runtimeSmtpCredential();
  environment.SMTP_USER = 'relay-user';
  environment[credential.name] = credential.value;
  const prepared = activationEnvironment({
    currentEnvironment: currentEnvironment(), proposedEnvironment: environment,
    invitations: [invitation()], now,
  });
  assert.equal(prepared.invitationCount, 1);
  assert.doesNotMatch(JSON.stringify(prepared), new RegExp(credential.value, 'u'));
  environment[credential.name] = '';
  assert.throws(() => activationEnvironment({
    currentEnvironment: currentEnvironment(), proposedEnvironment: environment,
    invitations: [invitation()], now,
  }), /green_password_enrollment_activation_denied/u);
});

test('candidate rejects wrong runtime label, payment mode, TLS, and recipient binding', () => {
  const mutations = [
    (environment) => { environment.DEPLOYMENT_ENVIRONMENT = 'staging'; },
    (environment) => { environment.PAYMENT_TRANSPORT = 'stripe'; },
    (environment) => { environment.SMTP_REQUIRE_TLS = 'false'; },
    (environment) => { environment.SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS = 'other@example.test'; },
  ];
  for (const mutate of mutations) {
    const environment = proposedEnvironment();
    mutate(environment);
    assert.throws(() => activationEnvironment({
      currentEnvironment: currentEnvironment(), proposedEnvironment: environment,
      invitations: [invitation()], now,
    }), /green_password_enrollment_activation_denied/u);
  }
});

test('candidate rejects provider drift and noncanonical allowlists', () => {
  for (const [name, value] of [
    ['FIREBASE_AUTH_ENABLED', 'false'],
    ['SIT_STAGING_ALLOWED_USER_IDS', 'pilot-new,pilot-new'],
    ['SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS', 'Pilot@Example.test'],
  ]) {
    const environment = proposedEnvironment();
    environment[name] = value;
    assert.throws(() => activationEnvironment({
      currentEnvironment: currentEnvironment(), proposedEnvironment: environment,
      invitations: [invitation()], now,
    }), /green_password_enrollment_activation_denied/u);
  }
});

test('candidate rejects baked identity in env file, rerun origins, and allowlist extras', () => {
  const proposedIdentity = proposedEnvironment();
  proposedIdentity.APP_COMMIT = sourceCommit;
  const rerun = currentEnvironment();
  rerun.MAIL_TRANSPORT = 'smtp';
  const extra = proposedEnvironment();
  extra.SIT_STAGING_ALLOWED_USER_IDS = 'pilot-existing,pilot-new,unbound-extra';
  for (const [current, proposed] of [
    [currentEnvironment(), proposedIdentity], [rerun, proposedEnvironment()],
    [currentEnvironment(), extra],
  ]) assert.throws(() => activationEnvironment({
    currentEnvironment: current, proposedEnvironment: proposed,
    invitations: [invitation()], now,
  }), /green_password_enrollment_activation_denied/u);
});

test('protected reader rejects post-open leaf replacement and close failure', async (t) => {
  const state = await fixture();
  t.after(() => rm(state.root, { force: true, recursive: true }));
  const stable = readProtectedActivationFile(state.registryFile, {
    expectedUid: process.getuid(), expectedGid: process.getgid(),
  });
  assert.deepEqual(Object.keys(stable), ['bytes']);
  stable.bytes.fill(0);
  const replacement = join(state.root, 'replacement.env');
  await writeFile(replacement, envText(proposedEnvironment()), { mode: 0o600 });
  let replaced = false;
  const replacingFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'fstatSync') return (descriptor, options) => {
        const metadata = target.fstatSync(descriptor, options);
        if (!replaced && metadata.mode && (metadata.mode & 0o170000n) === 0o100000n) {
          replaced = true;
          target.renameSync(replacement, state.environmentFile);
        }
        return metadata;
      };
      return Reflect.get(target, property);
    },
  });
  assert.throws(() => readProtectedActivationFile(state.environmentFile, {
    fileSystem: replacingFs, expectedUid: process.getuid(), expectedGid: process.getgid(),
  }), /green_password_enrollment_activation_denied/u);

  let closeFailed = false;
  const closingFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'closeSync') return (descriptor) => {
        target.closeSync(descriptor);
        if (!closeFailed) { closeFailed = true; throw new Error('synthetic close failure'); }
      };
      return Reflect.get(target, property);
    },
  });
  assert.throws(() => readProtectedActivationFile(state.registryFile, {
    fileSystem: closingFs, expectedUid: process.getuid(), expectedGid: process.getgid(),
  }), /green_password_enrollment_activation_denied/u);
});

test('protected reader binds ancestor chain across post-open parent substitution', async (t) => {
  const state = await fixture();
  const moved = `${state.root}-moved`;
  t.after(async () => {
    await rm(state.root, { force: true, recursive: true });
    if (fs.existsSync(moved)) await fs.promises.rename(moved, state.root);
    await rm(state.root, { force: true, recursive: true });
  });
  let substituted = false;
  const racingFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'openSync') return (file, flags, mode) => {
        const descriptor = target.openSync(file, flags, mode);
        if (!substituted && file === state.environmentFile) {
          substituted = true;
          target.renameSync(state.root, moved);
          target.mkdirSync(state.root, { mode: 0o700 });
          target.writeFileSync(state.environmentFile, envText(proposedEnvironment()), { mode: 0o600 });
        }
        return descriptor;
      };
      return Reflect.get(target, property);
    },
  });
  assert.throws(() => readProtectedActivationFile(state.environmentFile, {
    fileSystem: racingFs, expectedUid: process.getuid(), expectedGid: process.getgid(),
  }), /green_password_enrollment_activation_denied/u);
  await rm(state.root, { force: true, recursive: true });
  await fs.promises.rename(moved, state.root);
});

const confirmations = (state) => ({
  sourceCommit,
  currentContainerId: containerId,
  registrySha256: state.manifest.registrySha256,
});

test('execute seals current API and publishes only aggregate proof after v2/readback checks', async (t) => {
  const state = await fixture();
  t.after(() => rm(state.root, { force: true, recursive: true }));
  const operations = commandShapedOperations(state);
  const result = await runGreenPasswordEnrollmentActivation({
    manifest: state.manifest, currentState: state.currentState, now, execute: true,
    confirmations: confirmations(state), operations,
  });
  assert.equal(result.status, 'activated');
  assert.equal(result.deliveryAuthorized, false);
  assert.equal(result.invitationCount, 1);
  assert.ok(operations.calls.includes('stopExact'));
  assert.ok(operations.calls.includes('collectCandidate'));
  const createdAt = operations.calls.indexOf('createExact');
  const connectedAt = operations.calls.indexOf('connectExact');
  const startedAt = operations.calls.indexOf('startExact');
  assert.equal(operations.calls[createdAt + 1], 'inspectExact');
  assert.equal(operations.calls[connectedAt + 1], 'inspectExact');
  assert.ok(createdAt < connectedAt && connectedAt < startedAt);
  assert.deepEqual(operations.calls.slice(-2), ['collectCandidate', 'readQueueAfter']);
  const evidence = await readFile(state.manifest.evidenceFile, 'utf8');
  const backup = await readFile(state.manifest.backupFile, 'utf8');
  assert.match(evidence, /"safeEnvironmentSha256":"[a-f0-9]{64}"/u);
  assert.doesNotMatch(evidence, /environmentScrypt/u);
  assert.doesNotMatch(JSON.stringify(result), /environmentScrypt/u);
  assert.doesNotMatch(`${evidence}${backup}${JSON.stringify(result)}`,
    /pilot@example|smtp\.relay|contact@|registry\.json|proposed\.env/u);
  assert.equal((await fs.promises.stat(state.manifest.evidenceFile)).mode & 0o777, 0o600);
  await assert.rejects(readFile(state.manifest.lockFile), /ENOENT/u);
});

test('source retains no static SMTP password assignment literal', async () => {
  const source = await readFile(new URL(import.meta.url), 'utf8');
  const implementation = await readFile(
    new URL('../ops/green_password_enrollment_activation.mjs', import.meta.url), 'utf8',
  );
  const property = smtpPasswordName();
  const literalAssignment = new RegExp(
    `${property}\\s*(?::|=)\\s*['\"\\x60][^'\"\\x60]+['\"\\x60]`, 'u',
  );
  assert.doesNotMatch(source, literalAssignment);
  assert.equal(source.includes(['private', '-value'].join('')), false);
  assert.match(implementation, /crypto\.scryptSync\(/u);
  assert.doesNotMatch(implementation, /environmentSha256/u);
  assert.doesNotMatch(implementation,
    /sha256\((?:environmentFile\.bytes|proposedEnvironment)\)/u);
});

test('evidence close failure rolls back; lock close after durable evidence is distinct', async (t) => {
  for (const closeTarget of ['evidence', 'lock']) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    const descriptors = new Set();
    let failed = false;
    const targetPath = closeTarget === 'evidence'
      ? state.manifest.evidenceFile : state.manifest.lockFile;
    const faultFs = new Proxy(fs, {
      get(target, property) {
        if (property === 'openSync') return (file, flags, mode) => {
          const descriptor = target.openSync(file, flags, mode);
          if (file === targetPath) descriptors.add(descriptor);
          return descriptor;
        };
        if (property === 'closeSync') return (descriptor) => {
          target.closeSync(descriptor);
          if (!failed && descriptors.has(descriptor)) {
            failed = true;
            throw new Error('synthetic close failure');
          }
        };
        return Reflect.get(target, property);
      },
    });
    const operations = commandShapedOperations(state);
    let caught;
    try {
      await runGreenPasswordEnrollmentActivation({
        manifest: state.manifest, currentState: state.currentState, now, execute: true,
        confirmations: confirmations(state), operations, fileSystem: faultFs,
      });
    } catch (error) { caught = error; }
    if (closeTarget === 'evidence') {
      assert.equal(caught?.state, 'rolled-back');
      assert.equal(caught?.rollback?.originalVerified, true);
      await assert.rejects(readFile(state.manifest.evidenceFile), /ENOENT/u);
    } else {
      assert.equal(caught?.state, 'activation-complete-lock-release-unconfirmed');
      assert.equal(caught?.rollback?.status, 'activation-complete-lock-release-unconfirmed');
      assert.match(await readFile(state.manifest.evidenceFile, 'utf8'), /"status":"activated"/u);
      assert.ok(!operations.calls.includes('startOriginal'));
    }
  }
});

test('every command fault after stop rolls back exact original; pre-stop fault mutates nothing', async (t) => {
  for (const failure of [
    'stopExact', 'renameExact', 'createExact', 'connectExact', 'startExact',
    'collectCandidate', 'readQueueAfter',
  ]) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    const operations = commandShapedOperations(state, { fail: failure });
    let caught;
    try {
      await runGreenPasswordEnrollmentActivation({
        manifest: state.manifest, currentState: state.currentState, now, execute: true,
        confirmations: confirmations(state), operations,
      });
    } catch (error) { caught = error; }
    assert.equal(caught?.code, 'green_password_enrollment_activation_denied', failure);
    if (failure === 'stopExact') {
      assert.equal(caught.state, 'denied');
      assert.ok(!operations.calls.includes('startOriginal'));
    } else {
      assert.equal(caught.state, 'rolled-back', `${failure}:${JSON.stringify(caught.rollback)}`);
      assert.equal(caught.rollback?.originalVerified, true, failure);
      assert.ok(operations.calls.includes('startOriginal'), failure);
    }
    assert.equal(operations.candidateExists, false, failure);
    await assert.rejects(readFile(state.manifest.evidenceFile), /ENOENT/u);
  }
});

test('create response loss resolves owned candidate and removes it during rollback', async (t) => {
  const state = await fixture();
  t.after(() => rm(state.root, { force: true, recursive: true }));
  const operations = commandShapedOperations(state, { responseLoss: true });
  await assert.rejects(runGreenPasswordEnrollmentActivation({
    manifest: state.manifest, currentState: state.currentState, now, execute: true,
    confirmations: confirmations(state), operations,
  }), (error) => error.state === 'rolled-back' && error.rollback?.candidateRemoved === true);
  assert.ok(operations.calls.includes('resolveCreatedCandidate'));
  assert.equal(operations.candidateExists, false);
});

test('stop and rename response loss converge immutable original state then roll back once', async (t) => {
  for (const option of ['stopResponseLoss', 'renameResponseLoss']) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    const operations = commandShapedOperations(state, { [option]: true });
    let caught;
    try {
      await runGreenPasswordEnrollmentActivation({
        manifest: state.manifest, currentState: state.currentState, now, execute: true,
        confirmations: confirmations(state), operations,
      });
    } catch (error) { caught = error; }
    assert.equal(caught?.state, 'rolled-back', option);
    assert.equal(caught?.rollback?.originalVerified, true, option);
    assert.equal(operations.calls.filter((entry) => entry === 'stopExact').length, 1, option);
    if (option === 'renameResponseLoss') {
      assert.equal(operations.calls.filter((entry) => entry === 'renameExact').length, 1);
      assert.equal(operations.calls.filter((entry) => entry === 'renameOriginal').length, 1);
    }
  }
});

test('candidate is inspected by immutable ID before network attach and again before start', async (t) => {
  for (const candidateDriftAt of [1, 2]) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    const operations = commandShapedOperations(state, { candidateDriftAt });
    let caught;
    try {
      await runGreenPasswordEnrollmentActivation({
        manifest: state.manifest, currentState: state.currentState, now, execute: true,
        confirmations: confirmations(state), operations,
      });
    } catch (error) { caught = error; }
    assert.equal(caught?.state, 'rolled-back', `candidate inspect ${candidateDriftAt}`);
    if (candidateDriftAt === 1) assert.ok(!operations.calls.includes('connectExact'));
    assert.ok(!operations.calls.includes('startExact'));
    assert.equal(operations.candidateExists, false);
  }
});

test('rollback failure is a distinct sanitized recovery state', async (t) => {
  const state = await fixture();
  t.after(() => rm(state.root, { force: true, recursive: true }));
  const operations = commandShapedOperations(state, {
    fail: 'collectCandidate', rollbackFail: true,
  });
  let caught;
  try {
    await runGreenPasswordEnrollmentActivation({
      manifest: state.manifest, currentState: state.currentState, now, execute: true,
      confirmations: confirmations(state), operations,
    });
  } catch (error) { caught = error; }
  assert.equal(caught?.state, 'rollback-failed');
  assert.equal(caught?.rollback?.status, 'rollback-failed');
  assert.doesNotMatch(JSON.stringify(caught.rollback), /pilot@example|smtp|registry|token/u);
});

test('fresh foreign drift and non-exact confirmation deny before stop', async (t) => {
  for (const drift of ['confirmation', 'container']) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    const operations = commandShapedOperations(state);
    if (drift === 'container') {
      const collect = operations.collectCurrent;
      operations.collectCurrent = async () => {
        const current = await collect();
        current.container.State.Running = false;
        return current;
      };
    }
    const exact = confirmations(state);
    if (drift === 'confirmation') exact.registrySha256 = hash('wrong');
    await assert.rejects(runGreenPasswordEnrollmentActivation({
      manifest: state.manifest, currentState: state.currentState, now, execute: true,
      confirmations: exact, operations,
    }), /green_password_enrollment_activation_denied/u);
    assert.ok(!operations.calls.includes('stopExact'), drift);
    await assert.rejects(readFile(state.manifest.backupFile), /ENOENT/u);
  }
});

test('active queue, unhealthy runtime, and target image drift fail closed in dry-run', async (t) => {
  for (const drift of ['queue', 'health', 'target-image']) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    if (drift === 'queue') {
      state.currentState.queue.pending = 1;
      state.manifest.currentQueueSha256 = greenPasswordEnrollmentQueueSha256(
        state.currentState.queue,
      );
    } else if (drift === 'health') {
      state.currentState.health.readyStatus = 503;
      state.manifest.currentHealthSha256 = greenPasswordEnrollmentHealthSha256(
        state.currentState.health,
      );
    } else {
      state.currentState.targetImage.Config.Labels['org.opencontainers.image.revision'] = currentRevision;
    }
    await assert.rejects(runGreenPasswordEnrollmentActivation({
      manifest: state.manifest, currentState: state.currentState, now,
    }), /green_password_enrollment_activation_denied/u, drift);
  }
});

test('current and target semantic drift is rejected even when observation hashes are rebound', async (t) => {
  const cases = {
    'target-user': (state) => { state.currentState.targetImage.Config.User = 'root'; },
    'target-digest': (state) => { state.currentState.targetImage.RepoDigests = []; },
    ports: (state) => {
      state.currentState.container.HostConfig.PortBindings = { '8080/tcp': [{ HostPort: '8080' }] };
      state.manifest.currentConfigurationSha256 = greenPasswordEnrollmentContainerSha256(
        state.currentState.container,
      );
    },
    mounts: (state) => {
      state.currentState.container.Mounts[0].RW = true;
      state.manifest.mountsSha256 = greenPasswordEnrollmentMountsSha256(
        state.currentState.container.Mounts,
      );
      state.manifest.currentConfigurationSha256 = greenPasswordEnrollmentContainerSha256(
        state.currentState.container,
      );
    },
    networks: (state) => {
      delete state.currentState.container.NetworkSettings.Networks['sit-provider-egress'];
      state.manifest.currentConfigurationSha256 = greenPasswordEnrollmentContainerSha256(
        state.currentState.container,
      );
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    mutate(state);
    await assert.rejects(runGreenPasswordEnrollmentActivation({
      manifest: state.manifest, currentState: state.currentState, now,
    }), /green_password_enrollment_activation_denied/u, name);
  }
});

test('every active/dead queue class rejects both current and post-start candidate', async (t) => {
  for (const status of ['pending', 'retry', 'processing', 'dead']) {
    const current = await fixture();
    t.after(() => rm(current.root, { force: true, recursive: true }));
    current.currentState.queue[status] = 1;
    current.manifest.currentQueueSha256 = greenPasswordEnrollmentQueueSha256(
      current.currentState.queue,
    );
    await assert.rejects(runGreenPasswordEnrollmentActivation({
      manifest: current.manifest, currentState: current.currentState, now,
    }), /green_password_enrollment_activation_denied/u, `current ${status}`);

    const candidate = await fixture();
    t.after(() => rm(candidate.root, { force: true, recursive: true }));
    const operations = commandShapedOperations(candidate);
    const collect = operations.collectCandidate;
    operations.collectCandidate = async (...args) => {
      const observed = await collect(...args);
      observed.queue[status] = 1;
      return observed;
    };
    await assert.rejects(runGreenPasswordEnrollmentActivation({
      manifest: candidate.manifest, currentState: candidate.currentState, now, execute: true,
      confirmations: confirmations(candidate), operations,
    }), (error) => error.state === 'rolled-back', `candidate ${status}`);
  }
});

test('post-start registry parser/hash/count proof and readiness v2 freshness/bindings fail closed', async (t) => {
  const mutations = {
    'registry-parser': (candidate) => { candidate.registryReadback.parserStatus = 'error'; },
    'registry-hash': (candidate) => { candidate.registryReadback.sha256 = hash('substitute'); },
    'registry-count': (candidate) => { candidate.registryReadback.invitationCount = 2; },
    'readiness-expiry': (candidate) => {
      candidate.readinessEvidence.readiness.validUntilUtc = '2026-10-04T09:59:59Z';
    },
    'readiness-substitution': (candidate) => {
      candidate.readinessEvidence.readiness.invitationRegistrySha256 = hash('substitute');
    },
    'readiness-count': (candidate) => {
      candidate.readinessEvidence.readiness.invitationCount = 2;
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    const operations = commandShapedOperations(state);
    const collect = operations.collectCandidate;
    operations.collectCandidate = async (...args) => {
      const candidate = await collect(...args);
      mutate(candidate);
      if (name.startsWith('readiness-')) {
        candidate.readinessEvidence.readinessSha256 = hash(
          JSON.stringify(candidate.readinessEvidence.readiness),
        );
        candidate.readinessEvidenceSha256 = hash(JSON.stringify(candidate.readinessEvidence));
      }
      return candidate;
    };
    await assert.rejects(runGreenPasswordEnrollmentActivation({
      manifest: state.manifest, currentState: state.currentState, now, execute: true,
      confirmations: confirmations(state), operations,
    }), (error) => error.state === 'rolled-back', name);
  }
});

test('protected env/registry substitution and all exposed failure shapes contain no private identity', async (t) => {
  for (const input of ['environment', 'registry']) {
    const state = await fixture();
    t.after(() => rm(state.root, { force: true, recursive: true }));
    if (input === 'environment') {
      const changed = proposedEnvironment();
      changed.MAIL_REPLY_TO = 'changed@example.test';
      await writeFile(state.environmentFile, envText(changed), { mode: 0o600 });
    } else {
      const changed = invitation();
      changed.userId = 'substitute-user';
      await writeFile(state.registryFile, `${JSON.stringify([changed])}\n`, { mode: 0o600 });
    }
    let caught;
    try {
      await runGreenPasswordEnrollmentActivation({
        manifest: state.manifest, currentState: state.currentState, now,
      });
    } catch (error) { caught = error; }
    const exposed = JSON.stringify({
      message: caught?.message, code: caught?.code, state: caught?.state,
      rollback: caught?.rollback,
    });
    assert.equal(caught?.code, 'green_password_enrollment_activation_denied');
    assert.doesNotMatch(exposed,
      /pilot@example|existing@example|contact@|smtp\.relay|substitute-user|registry\.json|proposed\.env/u);
  }
});

test('queue drift immediately before SMTP activation denies without stopping API', async (t) => {
  const state = await fixture();
  t.after(() => rm(state.root, { force: true, recursive: true }));
  const operations = commandShapedOperations(state);
  operations.readQueue = async () => {
    operations.calls.push('readQueueBefore');
    return { ...state.currentState.queue, pending: 1 };
  };
  await assert.rejects(runGreenPasswordEnrollmentActivation({
    manifest: state.manifest, currentState: state.currentState, now, execute: true,
    confirmations: confirmations(state), operations,
  }), /green_password_enrollment_activation_denied/u);
  assert.ok(!operations.calls.includes('stopExact'));
  await assert.rejects(readFile(state.manifest.backupFile), /ENOENT/u);
});
