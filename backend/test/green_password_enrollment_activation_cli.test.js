import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  activationEnvironment,
  deriveProtectedEnvironmentScryptDigest,
  greenPasswordEnrollmentContainerSha256,
  greenPasswordEnrollmentHealthSha256,
  greenPasswordEnrollmentMountsSha256,
  greenPasswordEnrollmentQueueSha256,
} from '../ops/green_password_enrollment_activation.mjs';
import {
  GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
  GREEN_PASSWORD_ENROLLMENT_QUEUE_AGGREGATE_SQL,
  executeGreenPasswordEnrollmentArgv,
  greenPasswordEnrollmentActivationCliErrorCode,
  greenEnrollmentCandidateRuntimeReadbackSha256,
  greenPasswordEnrollmentCommandRequest,
  runGreenPasswordEnrollmentActivationCli,
} from '../ops/green_password_enrollment_activation_cli.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceCommit = 'a3e392594a77b513239a035f31a0d574339c532e';
const currentRevision = 'f'.repeat(40);
const sourceVersion = '1.2.3+2026100402';
const currentContainerId = 'b'.repeat(64);
const candidateContainerId = '7'.repeat(64);
const currentImageId = `sha256:${'9'.repeat(64)}`;
const targetImageId = `sha256:${'c'.repeat(64)}`;
const networkId = 'd'.repeat(64);
const providerNetworkId = 'e'.repeat(64);
const containerPattern = /^[a-f0-9]{64}$/u;
const activationNow = Date.parse('2026-10-04T10:00:00.000Z');
const credentialField = () => ['SMTP', '_PASS', 'WORD'].join('');
const envText = (environment) => Buffer.from(`${Object.entries(environment)
  .map(([name, value]) => `${name}=${value}`).join('\n')}\n`);

function assertQueueAggregateSqlMatchesMigration(sql, migration) {
  const table = /CREATE TABLE notification_outbox \(([\s\S]*?)\n\);/u.exec(migration)?.[1];
  assert.equal(typeof table, 'string');
  const columns = new Set([...table.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s+[A-Z]/gmu)]
    .map((match) => match[1]));
  const query = /^SELECT status, ([a-z][a-z0-9_]*), count\(\*\)::int AS count FROM notification_outbox GROUP BY status, \1$/u
    .exec(sql);
  assert.ok(query, 'queue aggregate SQL shape drifted');
  assert.ok(columns.has('status'), 'notification_outbox.status is missing');
  assert.ok(columns.has(query[1]),
    `queue SQL references unknown notification_outbox column: ${query[1]}`);
  return query[1];
}

function currentEnvironment() {
  return {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api/v1',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_LISTING_AI_BUDGET_CENTS: '0', PRIVATE_PILOT_V4_ENABLED: 'true',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', FIREBASE_AUTH_ENABLED: 'true',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
    APP_PUBLIC_URL: 'http://shareittoo-staging-api:8080', MAIL_TRANSPORT: 'memory',
    SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'false',
    SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: '',
    SIT_STAGING_ALLOWED_USER_IDS: 'pilot-existing',
    SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS: 'pilot-existing',
    SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS: 'existing@example.test',
    SMTP_HOST: 'smtp.relay.internal', SMTP_PORT: '25', SMTP_SECURE: 'false',
    SMTP_REQUIRE_TLS: 'true', SMTP_USER: '', [credentialField()]: '',
    MAIL_FROM: 'ShareItToo <contact@shareittoo.com>',
    MAIL_REPLY_TO: 'contact@shareittoo.com', APP_COMMIT: currentRevision,
    APP_VERSION: '1.2.2+2026093001', APP_BUILD_TIME: '2026-09-30T00:00:00Z',
  };
}

function proposedEnvironment() {
  const environment = {
    ...currentEnvironment(), APP_PUBLIC_URL: 'https://staging.shareittoo.com',
    MAIL_TRANSPORT: 'smtp', SIT_STAGING_ALLOWED_USER_IDS: 'pilot-existing,pilot-new',
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

function invitation() {
  const verifier = hash('opaque-generator-verifier');
  return {
    emailDigest: hash(`${verifier}\npilot@example.test`),
    expiresAt: new Date(activationNow + 60 * 60 * 1000).toISOString(),
    issuedAt: new Date(activationNow - 60 * 1000).toISOString(),
    tokenDigest: verifier, userId: 'pilot-new',
  };
}

function readinessEvidence(state, prepared, { health, mounts, registryReadback, runtimeIdentity }) {
  const runtimeReadbackSha256 = greenEnrollmentCandidateRuntimeReadbackSha256({
    mounts, registryReadback, runtimeIdentity,
    runtime: {
      accessGateEnabled: true, accessGateValid: true,
      appPublicUrl: 'https://staging.shareittoo.com', commit: sourceCommit,
      deploymentEnvironment: 'test', enrollmentEnabled: true, mailTransport: 'smtp',
      paymentTransport: health.paymentTransport, privatePilotEnabled: true,
      stripeLivemode: health.stripeLivemode, version: sourceVersion,
    },
  });
  const readiness = {
    sourceCommit, sourceVersion,
    targetEnvironment: 'staging-green', runtimeDeploymentEnvironment: 'test',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    publicBaseUrl: 'https://staging.shareittoo.com/api/v1',
    appPublicUrl: 'https://staging.shareittoo.com', returnOrigin: 'https://staging.shareittoo.com',
    passwordEnrollmentEnabled: true, invitationCount: 1,
    invitationConfigurationSha256: hash('invitation-configuration'),
    invitationRegistrySha256: state.manifest.registrySha256,
    accessGateEnabled: true, accessGateValid: true,
    allowedUserCount: prepared.accessAllowedCount, allowedUserIdsSha256: hash('allowed-users'),
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
    runtimeReadbackSha256, mailReadbackSha256: hash('mail-readback'),
    observedAtUtc: '2026-10-04T10:00:00Z', validUntilUtc: '2026-10-04T10:15:00Z',
  };
  const evidence = {
    schemaVersion: 2, kind: 'sit-staging-password-enrollment-web-readiness',
    evidenceClass: 'verified-runtime', syntheticFixture: false, readiness,
    readinessSha256: hash(JSON.stringify(readiness)),
  };
  return { evidence, evidenceSha256: hash(JSON.stringify(evidence)) };
}

function candidateArtifacts(state) {
  const proposed = proposedEnvironment();
  const prepared = activationEnvironment({
    currentEnvironment: currentEnvironment(), proposedEnvironment: proposed,
    invitations: [invitation()], now: activationNow,
  });
  const mounts = [...state.currentState.container.Mounts, {
    Type: 'bind', Name: null, Source: state.registryFile,
    Destination: '/run/secrets/staging-password-enrollment-registry.json', RW: false,
  }];
  const health = {
    commit: sourceCommit, deploymentEnvironment: 'test', firebaseAuthEnabled: true,
    firebasePhoneEnabled: false, googleRegistrationEnabled: false, liveStatus: 200,
    mailStatus: 'ok', passwordEnrollmentEnabled: true, paymentTransport: 'memory',
    readyStatus: 200, stripeLivemode: false,
  };
  const normalizedMounts = mounts.map((mount) => ({
    type: mount.Type, source: mount.Type === 'volume' ? mount.Name : mount.Source,
    target: mount.Destination, readOnly: mount.RW === false,
  })).sort((left, right) => left.target.localeCompare(right.target));
  const runtimeIdentity = { gid: state.manifest.registryGid, uid: state.manifest.registryUid };
  const registryReadback = {
    invitationCount: 1, parserStatus: 'ok', readable: true,
    sha256: state.manifest.registrySha256, writable: false,
  };
  const container = structuredClone(state.currentState.container);
  container.Id = candidateContainerId;
  container.Name = '/shareittoo-staging-api';
  container.Image = targetImageId;
  container.State = { Running: true };
  container.Config = {
    ...container.Config,
    Image: `registry.example/shareittoo-api@${targetImageId}`,
    Hostname: candidateContainerId.slice(0, 12),
    Env: Object.entries({
      ...proposed, APP_COMMIT: sourceCommit, APP_VERSION: sourceVersion,
      APP_BUILD_TIME: '2026-10-04T09:00:00Z',
    }).map(([name, value]) => `${name}=${value}`),
  };
  container.HostConfig = {
    ...container.HostConfig, Binds: null,
    Mounts: mounts.map((mount) => ({
      Type: mount.Type, Source: mount.Type === 'volume' ? mount.Name : mount.Source,
      Target: mount.Destination, ReadOnly: mount.RW === false,
    })),
  };
  container.Mounts = mounts;
  const { evidence, evidenceSha256 } = readinessEvidence(state, prepared, {
    health, mounts: normalizedMounts, registryReadback, runtimeIdentity,
  });
  return {
    container, health,
    proof: {
      runtimeIdentity, registryReadback,
      readinessEvidence: evidence, readinessEvidenceSha256: evidenceSha256,
    },
  };
}

function rebindObservedCandidateRuntime(artifacts, { enrollmentEnabled = true } = {}) {
  const readiness = artifacts.proof.readinessEvidence.readiness;
  assert.equal(typeof enrollmentEnabled, 'boolean');
  const mounts = artifacts.container.Mounts.map((mount) => ({
    type: mount.Type, source: mount.Type === 'volume' ? mount.Name : mount.Source,
    target: mount.Destination, readOnly: mount.RW === false,
  }));
  readiness.runtimeReadbackSha256 = greenEnrollmentCandidateRuntimeReadbackSha256({
    mounts, registryReadback: artifacts.proof.registryReadback,
    runtimeIdentity: artifacts.proof.runtimeIdentity,
    runtime: {
      accessGateEnabled: readiness.accessGateEnabled,
      accessGateValid: readiness.accessGateValid,
      appPublicUrl: readiness.appPublicUrl,
      commit: artifacts.health.commit,
      deploymentEnvironment: artifacts.health.deploymentEnvironment,
      enrollmentEnabled,
      mailTransport: readiness.mailTransport,
      paymentTransport: artifacts.health.paymentTransport,
      privatePilotEnabled: readiness.privatePilotEnabled,
      stripeLivemode: artifacts.health.stripeLivemode,
      version: readiness.sourceVersion,
    },
  });
  artifacts.proof.readinessEvidence.readinessSha256 = hash(JSON.stringify(readiness));
  artifacts.proof.readinessEvidenceSha256 = hash(JSON.stringify(
    artifacts.proof.readinessEvidence,
  ));
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sit-green-activation-cli-')));
  await chmod(root, 0o700);
  const environmentFile = join(root, 'proposed.env');
  const registryFile = join(root, 'registry.json');
  const manifestFile = join(root, 'manifest.json');
  const environmentBytes = envText(proposedEnvironment());
  const registryBytes = Buffer.from(`${JSON.stringify([invitation()])}\n`);
  await writeFile(environmentFile, environmentBytes, { mode: 0o600 });
  await writeFile(registryFile, registryBytes, { mode: 0o600 });
  const uid = process.getuid(); const gid = process.getgid();
  const mounts = [
    { Type: 'bind', Name: null, Source: join(root, 'mfa.key'), Destination: '/run/secrets/mfa-encryption-key', RW: false },
    { Type: 'bind', Name: null, Source: join(root, 'firebase.json'), Destination: '/run/secrets/firebase-service-account.json', RW: false },
    { Type: 'volume', Name: 'sit-green-uploads', Source: '/var/lib/docker/volumes/sit-green-uploads/_data', Destination: '/data/uploads', RW: true },
  ];
  const currentContainer = {
    Id: currentContainerId, Name: '/shareittoo-staging-api', Image: currentImageId,
    State: { Running: true },
    Config: {
      Image: `registry.example/shareittoo-api:${currentRevision}`,
      Env: Object.entries(currentEnvironment()).map(([name, value]) => `${name}=${value}`),
      Cmd: ['node', 'src/server.js'], Entrypoint: null, User: 'shareittoo', WorkingDir: '/app',
      Hostname: currentContainerId.slice(0, 12), Labels: { 'com.shareittoo.sit.green': 'true' },
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
      'sit-green-network': { NetworkID: networkId },
      'sit-provider-egress': { NetworkID: providerNetworkId },
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
    apiContainer: 'shareittoo-staging-api', backupFile: join(root, 'backup.json'),
    currentConfigurationSha256: greenPasswordEnrollmentContainerSha256(currentContainer),
    currentContainerId, currentHealthSha256: greenPasswordEnrollmentHealthSha256(health),
    currentImage: `registry.example/shareittoo-api:${currentRevision}`,
    currentImageDigest: currentImageId, currentImageId,
    currentQueueSha256: greenPasswordEnrollmentQueueSha256(queue), currentRevision,
    environmentFile, environmentGid: gid,
    environmentScryptDigest: deriveProtectedEnvironmentScryptDigest(
      environmentBytes, hash('synthetic-cli-environment-salt'),
    ),
    environmentScryptSalt: hash('synthetic-cli-environment-salt'), environmentUid: uid,
    evidenceFile: join(root, 'evidence.json'), lockFile: join(root, 'activation.lock'),
    mountsSha256: greenPasswordEnrollmentMountsSha256(mounts),
    network: 'sit-green-network', networkId,
    operation: 'activate-green-password-enrollment', providerNetwork: 'sit-provider-egress',
    providerNetworkId, registryFile, registryGid: gid, registrySha256: hash(registryBytes),
    registryTarget: '/run/secrets/staging-password-enrollment-registry.json', registryUid: uid,
    schemaVersion: 1, sourceCommit, sourceVersion,
    targetImage: `registry.example/shareittoo-api:${sourceCommit}`,
    targetImageDigest: targetImageId, targetImageId, targetRevision: sourceCommit,
  };
  const currentState = {
    container: currentContainer,
    image: {
      Id: currentImageId,
      RepoDigests: [`registry.example/shareittoo-api@${currentImageId}`],
      Config: { Labels: { 'org.opencontainers.image.revision': currentRevision } },
    },
    targetImage: {
      Id: targetImageId,
      RepoDigests: [`registry.example/shareittoo-api@${targetImageId}`],
      Config: { User: 'shareittoo', Labels: { 'org.opencontainers.image.revision': sourceCommit } },
    },
    network: { Id: networkId, Name: 'sit-green-network', Internal: true },
    providerNetwork: { Id: providerNetworkId, Name: 'sit-provider-egress', Internal: false },
    health, queue,
  };
  await writeFile(manifestFile, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  return { root, environmentFile, registryFile, manifestFile, manifest, currentState };
}

function commandHarness(state, {
  missingTool = null, wrongRoot = false, wrongHead = false, drift = false,
  stopResponseLoss = false, renameResponseLoss = false, createResponseLoss = false,
  connectResponseLoss = false, startResponseLoss = false, removeResponseLoss = false,
  rollbackRenameResponseLoss = false, targetProbeDrift = false, currentInspectFailure = false,
  requiredSourceUntracked = false, trackedDriftPath = '', untrackedPath = '',
  capsuleOnlyDrift = false,
  candidateUnavailable = false, stopReadbackDelay = 0, renameReadbackDelay = 0,
  runtimeBindingDrift = false, candidateMountDrift = null, registryProofDrift = null,
  observedReleaseDrift = null, observedEnrollmentDrift = null, clockNow = null,
} = {}) {
  const calls = [];
  const mutations = [];
  const current = structuredClone(state.currentState.container);
  const artifacts = candidateArtifacts(state);
  if (observedReleaseDrift === 'commit') {
    artifacts.health.commit = '1'.repeat(40);
    artifacts.proof.readinessEvidence.readiness.sourceCommit = '1'.repeat(40);
    rebindObservedCandidateRuntime(artifacts);
  } else if (observedReleaseDrift === 'version') {
    artifacts.proof.readinessEvidence.readiness.sourceVersion = '9.9.9+2099010101';
    rebindObservedCandidateRuntime(artifacts);
  } else if (observedReleaseDrift !== null) throw new Error('unknown observed release drift');
  if (observedEnrollmentDrift === 'readiness-false') {
    artifacts.proof.readinessEvidence.readiness.passwordEnrollmentEnabled = false;
    rebindObservedCandidateRuntime(artifacts, { enrollmentEnabled: false });
  } else if (observedEnrollmentDrift === 'health-false') {
    artifacts.health.passwordEnrollmentEnabled = false;
  } else if (observedEnrollmentDrift !== null) {
    throw new Error('unknown observed enrollment drift');
  }
  if (runtimeBindingDrift) {
    artifacts.proof.readinessEvidence.readiness.runtimeReadbackSha256 = hash('binding-drift');
    artifacts.proof.readinessEvidence.readinessSha256 = hash(JSON.stringify(
      artifacts.proof.readinessEvidence.readiness,
    ));
    artifacts.proof.readinessEvidenceSha256 = hash(JSON.stringify(
      artifacts.proof.readinessEvidence,
    ));
  }
  if (registryProofDrift !== null) {
    if (registryProofDrift === 'digest') {
      artifacts.proof.registryReadback.sha256 = hash('registry-proof-drift');
    } else if (registryProofDrift === 'count') {
      artifacts.proof.registryReadback.invitationCount += 1;
    } else if (registryProofDrift === 'readable') {
      artifacts.proof.registryReadback.readable = false;
    } else throw new Error('unknown registry proof drift');
  }
  let candidate = null;
  let staleStopRemaining = 0;
  let staleRenameRemaining = 0;
  let priorName = null;
  const result = (executable, args, options, status, stdout) => ({
    executable, args: [...args], cwd: options.cwd, status, stdout,
  });
  const command = async (executable, args, options) => {
    calls.push({ executable, args: [...args], startedAt: clockNow?.(),
      timeoutMs: options.timeoutMs });
    if (drift) {
      drift = false;
      return { executable, args: ['drift'], cwd: options.cwd, status: 0, stdout: 'drift\n' };
    }
    if (args[0] === '--version') {
      const missing = missingTool === executable;
      return result(executable, args, options, missing ? 127 : 0, missing ? '' : `${executable} version\n`);
    }
    if (executable === 'git' && args.join(' ') === 'rev-parse --show-toplevel') {
      return result(executable, args, options, 0,
        `${wrongRoot ? dirname(GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT) : GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT}\n`);
    }
    if (executable === 'git' && args.join(' ') === 'rev-parse HEAD') {
      return result(executable, args, options, 0, `${wrongHead ? '0'.repeat(40) : sourceCommit}\n`);
    }
    if (executable === 'git' && args[0] === 'ls-files'
        && args[1] === '--error-unmatch') {
      return result(executable, args, options, requiredSourceUntracked ? 1 : 0,
        requiredSourceUntracked ? '' : `${args.slice(args.indexOf('--') + 1).join('\n')}\n`);
    }
    if (executable === 'git' && args[0] === 'diff' && args[1] === '--quiet') {
      const capsuleExcluded = args.includes(
        ':(exclude)docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md',
      );
      return result(executable, args, options,
        trackedDriftPath !== '' || (capsuleOnlyDrift && !capsuleExcluded) ? 1 : 0, '');
    }
    if (executable === 'git' && args.join(' ') === 'ls-files --others --exclude-standard -- .') {
      return result(executable, args, options, 0, untrackedPath === '' ? '' : `${untrackedPath}\n`);
    }
    if (executable !== 'docker') throw new Error('unexpected executable');
    if (args[0] === 'run') {
      const probe = {
        gid: state.manifest.registryGid, readable: true,
        sha256: targetProbeDrift ? hash('drift') : state.manifest.registrySha256,
        uid: state.manifest.registryUid, user: 'shareittoo', writable: false,
      };
      return result(executable, args, options, 0, `${JSON.stringify(probe)}\n`);
    }
    if (args[0] === 'image' && args[1] === 'inspect') {
      const image = args.at(-1) === currentImageId
        ? state.currentState.image : state.currentState.targetImage;
      return result(executable, args, options, 0, `${JSON.stringify(image)}\n`);
    }
    if (args[0] === 'network' && args[1] === 'inspect') {
      const network = args.at(-1) === networkId
        ? state.currentState.network : state.currentState.providerNetwork;
      return result(executable, args, options, 0, `${JSON.stringify(network)}\n`);
    }
    if (args[0] === 'container' && args[1] === 'inspect') {
      const identity = args.at(-1);
      let observed = null;
      if (identity === currentContainerId) {
        observed = current;
        if (staleStopRemaining > 0) {
          observed = structuredClone(current); observed.State.Running = true;
          staleStopRemaining -= 1;
        } else if (staleRenameRemaining > 0) {
          observed = structuredClone(current); observed.Name = priorName;
          staleRenameRemaining -= 1;
        }
      }
      else if (identity === candidateContainerId) {
        observed = candidate;
        if (candidate?.State?.Running === true && candidateMountDrift !== null
            && (clockNow?.() ?? 0) < 15_000) {
          observed = structuredClone(candidate);
          const mount = observed.Mounts[0];
          if (candidateMountDrift === 'type') {
            mount.Type = mount.Type === 'bind' ? 'volume' : 'bind';
          } else if (candidateMountDrift === 'source') mount.Source = '/different/source';
          else if (candidateMountDrift === 'target') mount.Destination = '/different/target';
          else if (candidateMountDrift === 'readOnly') mount.RW = !mount.RW;
          else throw new Error('unknown candidate mount drift');
        }
      }
      else if (identity === state.manifest.apiContainer) {
        if (candidate?.Name === `/${state.manifest.apiContainer}`) observed = candidate;
        else if (current.Name === `/${state.manifest.apiContainer}`) observed = current;
      }
      if (currentInspectFailure && identity === currentContainerId) {
        currentInspectFailure = false;
        return result(executable, args, options, 125, '');
      }
      return result(executable, args, options, observed ? 0 : 1,
        observed ? `${JSON.stringify(observed)}\n` : '');
    }
    if (args[0] === 'container' && args[1] === 'ls') {
      const filter = args[args.indexOf('--filter') + 1];
      let observed = null;
      if (filter === `id=${currentContainerId}`) observed = current;
      else if (filter === `id=${candidateContainerId}`) observed = candidate;
      else if (filter === `name=^/${state.manifest.apiContainer}$`) {
        if (candidate?.Name === `/${state.manifest.apiContainer}`) observed = candidate;
        else if (current.Name === `/${state.manifest.apiContainer}`) observed = current;
      }
      return result(executable, args, options, 0, observed ? `${observed.Id}\n` : '');
    }
    if (args[0] === 'exec') {
      const source = args.at(-1);
      const id = args.find((argument) => containerPattern.test(argument));
      if (source.includes('notification_outbox')) {
        return result(executable, args, options, 0, `${JSON.stringify(state.currentState.queue)}\n`);
      }
      if (source.includes("get('/health/live')")) {
        const health = id === candidateContainerId ? artifacts.health : state.currentState.health;
        return result(executable, args, options, 0, `${JSON.stringify(health)}\n`);
      }
      if (source.includes('verifyMailer')) {
        if (candidateUnavailable) return result(executable, args, options, 125, '');
        return result(executable, args, options, 0, `${JSON.stringify(artifacts.proof)}\n`);
      }
    }
    if (args[0] === 'stop') {
      mutations.push('stop');
      current.State.Running = false;
      if (stopResponseLoss) staleStopRemaining = stopReadbackDelay;
      return result(executable, args, options, stopResponseLoss ? 125 : 0,
        stopResponseLoss ? '' : `${currentContainerId}\n`);
    }
    if (args[0] === 'rename') {
      mutations.push(args[2] === state.manifest.apiContainer ? 'rename-original' : 'rename');
      priorName = current.Name;
      current.Name = `/${args[2]}`;
      const initialLoss = renameResponseLoss && args[2] !== state.manifest.apiContainer;
      const rollbackLoss = rollbackRenameResponseLoss && args[2] === state.manifest.apiContainer;
      if (initialLoss || rollbackLoss) staleRenameRemaining = renameReadbackDelay;
      return result(executable, args, options,
        initialLoss || rollbackLoss ? 125 : 0, '');
    }
    if (args[0] === 'create') {
      mutations.push('create');
      candidate = structuredClone(artifacts.container);
      candidate.State.Running = false;
      delete candidate.NetworkSettings.Networks[state.manifest.providerNetwork];
      return result(executable, args, options, createResponseLoss ? 125 : 0,
        createResponseLoss ? '' : `${candidateContainerId}\n`);
    }
    if (args[0] === 'network' && args[1] === 'connect') {
      mutations.push('connect');
      candidate.NetworkSettings.Networks[state.manifest.providerNetwork] = {
        NetworkID: providerNetworkId,
      };
      return result(executable, args, options, connectResponseLoss ? 125 : 0, '');
    }
    if (args[0] === 'start') {
      const id = args[1];
      mutations.push(id === currentContainerId ? 'start-original' : 'start');
      if (id === currentContainerId) current.State.Running = true;
      else candidate.State.Running = true;
      return result(executable, args, options,
        startResponseLoss && id === candidateContainerId ? 125 : 0,
        startResponseLoss && id === candidateContainerId ? '' : `${id}\n`);
    }
    if (args[0] === 'rm') {
      mutations.push('remove');
      candidate = null;
      return result(executable, args, options, removeResponseLoss ? 125 : 0,
        removeResponseLoss ? '' : `${args.at(-1)}\n`);
    }
    throw new Error(`unexpected command ${executable} ${args.slice(0, 3).join(' ')}`);
  };
  return { calls, command, current, get candidate() { return candidate; }, mutations };
}

const dryArgs = (state) => ['--manifest', state.manifestFile];
const executeArgs = (state) => [
  '--manifest', state.manifestFile, '--execute', '--confirm-source', sourceCommit,
  '--confirm-container', currentContainerId, '--confirm-registry', state.manifest.registrySha256,
];

function monotonicClock() {
  let value = 0;
  return Object.freeze({
    now: () => value,
    value: () => value,
    wait: async (delayMs) => { value += delayMs; },
  });
}

test('real argv executor is no-shell and binds the exact request', async () => {
  const result = await executeGreenPasswordEnrollmentArgv('git', ['--version']);
  assert.equal(result.status, 0);
  assert.deepEqual({ executable: result.executable, args: result.args, cwd: result.cwd },
    greenPasswordEnrollmentCommandRequest(
      'git', ['--version'], GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
    ));
});

test('default dry-run performs exact read-only preflight and no service transition', async (t) => {
  const state = await fixture(); t.after(() => rm(state.root, { recursive: true, force: true }));
  const harness = commandHarness(state, { capsuleOnlyDrift: true });
  const result = await runGreenPasswordEnrollmentActivationCli(dryArgs(state), {
    command: harness.command, now: () => activationNow,
  });
  assert.equal(result.status, 'dry-run');
  assert.deepEqual(harness.mutations, []);
  const probe = harness.calls.find((call) => call.args[0] === 'run');
  assert.ok(probe.args.includes('none'));
  assert.ok(probe.args.includes('--read-only'));
  assert.ok(probe.args.includes('no-new-privileges'));
  assert.ok(probe.args.includes('ALL'));
  assert.ok(probe.args.includes(`registry.example/shareittoo-api@${targetImageId}`));
  assert.ok(harness.calls.some((call) => call.args.join(' ') === 'rev-parse HEAD'));
  assert.ok(harness.calls.some((call) => call.args.join(' ') === [
    'diff', '--quiet', 'HEAD', '--', '.',
    ':(exclude)docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md',
  ].join(' ')));
  assert.ok(harness.calls.some((call) => call.args.join(' ')
    === 'ls-files --others --exclude-standard -- .'));
  const queueProbe = harness.calls.find((call) => call.args[0] === 'exec'
    && call.args.at(-1).includes('notification_outbox'));
  assert.ok(queueProbe.args.at(-1).includes(GREEN_PASSWORD_ENROLLMENT_QUEUE_AGGREGATE_SQL));
  assert.match(queueProbe.args.at(-1), /row\.channel/u);
  assert.doesNotMatch(queueProbe.args.at(-1), /row\.transport/u);
  assert.doesNotMatch(JSON.stringify(result), /pilot@example|smtp\.relay|contact@/u);
});

test('queue aggregate SQL is bound to the authoritative notification_outbox schema', async () => {
  const migration = await readFile(join(
    GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
    'backend/sql/migrations/006_b7_communications.up.sql',
  ), 'utf8');
  assert.equal(
    assertQueueAggregateSqlMatchesMigration(
      GREEN_PASSWORD_ENROLLMENT_QUEUE_AGGREGATE_SQL, migration,
    ),
    'channel',
  );
  assert.throws(
    () => assertQueueAggregateSqlMatchesMigration(
      GREEN_PASSWORD_ENROLLMENT_QUEUE_AGGREGATE_SQL.replaceAll('channel', 'transport'),
      migration,
    ),
    /unknown notification_outbox column: transport/u,
  );
});

test('execute uses exact confirmations and completes the command-backed transition', async (t) => {
  const state = await fixture(); t.after(() => rm(state.root, { recursive: true, force: true }));
  const harness = commandHarness(state);
  const result = await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
    command: harness.command, now: () => activationNow,
  });
  assert.equal(result.status, 'activated');
  assert.equal(result.deliveryAuthorized, false);
  assert.deepEqual(harness.mutations.slice(0, 5), ['stop', 'rename', 'create', 'connect', 'start']);
  const firstStop = harness.calls.findIndex((call) => call.args[0] === 'stop');
  assert.ok(harness.calls.slice(0, firstStop)
    .filter((call) => call.args.join(' ') === 'rev-parse HEAD').length >= 2);
  assert.ok(harness.calls.some((call) => call.args.at(-1).includes?.('verifyMailer')));
  assert.ok(harness.calls.some((call) => call.args[0] === 'exec'
    && call.args.includes(candidateContainerId)
    && call.args.at(-1).includes('notification_outbox')));
  const evidence = await readFile(state.manifest.evidenceFile, 'utf8');
  assert.doesNotMatch(`${JSON.stringify(result)}${evidence}`,
    /pilot@example|smtp\.relay|contact@|proposed\.env|registry\.json|mfa\.key|firebase\.json/u);
  assert.equal(`${JSON.stringify(result)}${evidence}`.includes(state.root), false);
});

test('stop and rename response loss converge by immutable readback without retry', async (t) => {
  for (const phase of ['stop', 'rename']) {
    const state = await fixture();
    t.after(() => rm(state.root, { recursive: true, force: true }));
    const clock = monotonicClock();
    const harness = commandHarness(state, {
      stopResponseLoss: phase === 'stop', renameResponseLoss: phase === 'rename',
      stopReadbackDelay: 2, renameReadbackDelay: 2, clockNow: clock.now,
    });
    const result = await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
      command: harness.command, now: () => activationNow,
      monotonicNow: clock.now, wait: clock.wait,
    });
    assert.equal(result.status, 'activated', phase);
    assert.equal(harness.mutations.filter((entry) => entry === phase).length, 1, phase);
  }
});

test('lost stop response never accepts missing or foreign immutable ownership', async (t) => {
  for (const observed of ['missing', 'foreign']) {
    const state = await fixture();
    t.after(() => rm(state.root, { recursive: true, force: true }));
    const clock = monotonicClock();
    const harness = commandHarness(state, { clockNow: clock.now });
    const original = harness.command;
    let stopLost = false;
    harness.command = async (executable, args, options) => {
      if (executable === 'docker' && args[0] === 'stop') {
        stopLost = true; harness.mutations.push('stop');
        return { executable, args: [...args], cwd: options.cwd, status: 125, stdout: '' };
      }
      if (stopLost && executable === 'docker' && args[0] === 'container'
          && args[1] === 'inspect' && args.at(-1) === currentContainerId) {
        if (observed === 'missing') {
          return { executable, args: [...args], cwd: options.cwd, status: 1, stdout: '' };
        }
        const foreign = structuredClone(harness.current); foreign.Id = '6'.repeat(64);
        return { executable, args: [...args], cwd: options.cwd, status: 0,
          stdout: `${JSON.stringify(foreign)}\n` };
      }
      if (stopLost && observed === 'missing' && executable === 'docker'
          && args[0] === 'container' && args[1] === 'ls'
          && args.includes(`id=${currentContainerId}`)) {
        return { executable, args: [...args], cwd: options.cwd, status: 0, stdout: '' };
      }
      return original(executable, args, options);
    };
    await assert.rejects(runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
      command: harness.command, now: () => activationNow,
      monotonicNow: clock.now, wait: clock.wait,
    }));
    assert.deepEqual(harness.mutations, ['stop'], observed);
    assert.equal(clock.value(), 30_000, observed);
  }
});

test('create and remove response loss roll back exact original', async (t) => {
  for (const phase of ['create', 'remove']) {
    const state = await fixture();
    t.after(() => rm(state.root, { recursive: true, force: true }));
    const harness = commandHarness(state, {
      stopResponseLoss: phase === 'stop', renameResponseLoss: phase === 'rename',
      createResponseLoss: phase === 'create' || phase === 'remove',
      removeResponseLoss: phase === 'remove',
    });
    await assert.rejects(runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
      command: harness.command, now: () => activationNow,
    }), (error) => error.state === 'rolled-back', phase);
    if (['create', 'remove'].includes(phase)) assert.ok(harness.mutations.includes('remove'));
    if (phase !== 'stop') assert.ok(harness.mutations.includes('rename-original'));
    assert.ok(harness.mutations.includes('start-original'));
    assert.equal(harness.current.Name, '/shareittoo-staging-api');
    assert.equal(harness.current.State.Running, true);
    assert.equal(harness.candidate, null);
  }
});

test('rollback rename response loss converges delayed exact immutable readback', async (t) => {
  const state = await fixture(); t.after(() => rm(state.root, { recursive: true, force: true }));
  const clock = monotonicClock();
  const harness = commandHarness(state, {
    createResponseLoss: true, rollbackRenameResponseLoss: true,
    renameReadbackDelay: 3, clockNow: clock.now,
  });
  await assert.rejects(runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
    command: harness.command, now: () => activationNow,
    monotonicNow: clock.now, wait: clock.wait,
  }), (error) => error.state === 'rolled-back');
  assert.equal(harness.mutations.filter((entry) => entry === 'rename-original').length, 1);
  assert.equal(harness.current.Name, '/shareittoo-staging-api');
  assert.equal(harness.current.State.Running, true);
});

test('connect and start response loss converge read-only without repeating mutation', async (t) => {
  for (const responseLoss of ['connect', 'start']) {
    const state = await fixture();
    t.after(() => rm(state.root, { recursive: true, force: true }));
    const harness = commandHarness(state, {
      connectResponseLoss: responseLoss === 'connect',
      startResponseLoss: responseLoss === 'start',
    });
    const result = await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
      command: harness.command, now: () => activationNow,
    });
    assert.equal(result.status, 'activated', responseLoss);
    assert.equal(harness.mutations.filter((entry) => entry === responseLoss).length, 1);
  }
});

test('candidate convergence enforces one 15s deadline and remaining command budgets', async (t) => {
  const state = await fixture(); t.after(() => rm(state.root, { recursive: true, force: true }));
  const clock = monotonicClock();
  const harness = commandHarness(state, { candidateUnavailable: true, clockNow: clock.now });
  let caught;
  try {
    await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
      command: harness.command, now: () => activationNow,
      monotonicNow: clock.now, wait: clock.wait,
    });
  } catch (error) { caught = error; }
  assert.equal(caught?.state, 'rolled-back');
  assert.equal(clock.value(), 15_000);
  const proofCalls = harness.calls.filter((call) => call.args[0] === 'exec'
    && call.args.at(-1).includes?.('verifyMailer'));
  assert.equal(proofCalls.length, 30);
  assert.equal(proofCalls[0].timeoutMs, 15_000);
  assert.equal(proofCalls.at(-1).timeoutMs, 500);
  assert.ok(proofCalls.every((call) => call.startedAt < 15_000
    && call.timeoutMs === 15_000 - call.startedAt));
  const startIndex = harness.calls.findIndex((call) => call.args[0] === 'start'
    && call.args[1] === candidateContainerId);
  const removeIndex = harness.calls.findIndex((call, index) => index > startIndex
    && call.args[0] === 'rm');
  const afterStartBeforeRollback = harness.calls.slice(startIndex + 1, removeIndex);
  const candidateProbeCalls = afterStartBeforeRollback.filter((call) => call.startedAt < 15_000);
  assert.equal(candidateProbeCalls.length, 180);
  assert.ok(candidateProbeCalls.every((call) => call.startedAt < 15_000
    && call.timeoutMs === 15_000 - call.startedAt));
  assert.equal(afterStartBeforeRollback.filter((call) => call.startedAt >= 15_000
    && call.args.at(-1).includes?.('verifyMailer')).length, 0);
  assert.deepEqual(harness.mutations.slice(-3), ['remove', 'rename-original', 'start-original']);
  const exposed = JSON.stringify(greenPasswordEnrollmentActivationCliErrorCode(caught));
  assert.doesNotMatch(exposed,
    /pilot|smtp|contact|registry|proposed|shareittoo-staging-api|[a-f0-9]{40}/u);
});

test('runtime readback binding covers every mount field and registry aggregate', async (t) => {
  const state = await fixture(); t.after(() => rm(state.root, { recursive: true, force: true }));
  const artifacts = candidateArtifacts(state);
  const mounts = artifacts.container.Mounts.map((mount) => ({
    type: mount.Type, source: mount.Type === 'volume' ? mount.Name : mount.Source,
    target: mount.Destination, readOnly: mount.RW === false,
  }));
  const runtime = {
    accessGateEnabled: true, accessGateValid: true,
    appPublicUrl: 'https://staging.shareittoo.com', commit: sourceCommit,
    deploymentEnvironment: 'test', enrollmentEnabled: true, mailTransport: 'smtp',
    paymentTransport: 'memory', privatePilotEnabled: true, stripeLivemode: false,
    version: sourceVersion,
  };
  const input = {
    mounts, registryReadback: artifacts.proof.registryReadback,
    runtimeIdentity: artifacts.proof.runtimeIdentity, runtime,
  };
  const baseline = greenEnrollmentCandidateRuntimeReadbackSha256(input);
  const validDrifts = [
    ['mount-type', (copy) => { copy.mounts[0].type = copy.mounts[0].type === 'bind'
      ? 'volume' : 'bind'; }],
    ['mount-source', (copy) => { copy.mounts[0].source = '/different/source'; }],
    ['mount-target', (copy) => { copy.mounts[0].target = '/different/target'; }],
    ['mount-readonly', (copy) => { copy.mounts[0].readOnly = !copy.mounts[0].readOnly; }],
    ['registry-digest', (copy) => { copy.registryReadback.sha256 = hash('registry-drift'); }],
    ['registry-count', (copy) => { copy.registryReadback.invitationCount += 1; }],
  ];
  for (const [name, change] of validDrifts) {
    const copy = structuredClone(input); change(copy);
    assert.notEqual(greenEnrollmentCandidateRuntimeReadbackSha256(copy), baseline, name);
  }
  const unreadable = structuredClone(input); unreadable.registryReadback.readable = false;
  assert.throws(() => greenEnrollmentCandidateRuntimeReadbackSha256(unreadable),
    /green_password_enrollment_activation_cli_denied/u);

  const clock = monotonicClock();
  const harness = commandHarness(state, { runtimeBindingDrift: true, clockNow: clock.now });
  let caught;
  try {
    await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
      command: harness.command, now: () => activationNow,
      monotonicNow: clock.now, wait: clock.wait,
    });
  } catch (error) { caught = error; }
  assert.equal(caught?.state, 'rolled-back');
  assert.doesNotMatch(JSON.stringify(greenPasswordEnrollmentActivationCliErrorCode(caught)),
    /pilot|smtp|contact|registry|proposed|shareittoo-staging-api|[a-f0-9]{40}/u);
});

test('consistent observed release drift reaches and fails the independent core identity gate',
  async (t) => {
    for (const field of ['commit', 'version']) {
      const state = await fixture();
      t.after(() => rm(state.root, { recursive: true, force: true }));
      const clock = monotonicClock();
      const harness = commandHarness(state, { observedReleaseDrift: field, clockNow: clock.now });
      let caught;
      try {
        await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
          command: harness.command, now: () => activationNow,
          monotonicNow: clock.now, wait: clock.wait,
        });
      } catch (error) { caught = error; }
      assert.equal(caught?.state, 'rolled-back', field);
      assert.equal(clock.value(), 0, `${field}: adapter must accept the internally consistent proof`);
      assert.equal(harness.calls.filter((call) => call.args[0] === 'exec'
        && call.args.at(-1).includes?.('verifyMailer')).length, 1, field);
      assert.doesNotMatch(JSON.stringify(greenPasswordEnrollmentActivationCliErrorCode(caught)),
        /pilot|smtp|contact|registry|proposed|shareittoo-staging-api|[a-f0-9]{40}/u, field);
    }
  });

test('observed enrollment false is rejected before runtime readback hashing', async (t) => {
  for (const field of ['readiness-false', 'health-false']) {
    const state = await fixture();
    t.after(() => rm(state.root, { recursive: true, force: true }));
    const clock = monotonicClock();
    const harness = commandHarness(state, {
      observedEnrollmentDrift: field, clockNow: clock.now,
    });
    let caught;
    try {
      await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
        command: harness.command, now: () => activationNow,
        monotonicNow: clock.now, wait: clock.wait,
      });
    } catch (error) { caught = error; }
    assert.equal(caught?.state, 'rolled-back', field);
    assert.equal(clock.value(), 15_000, field);
    assert.doesNotMatch(JSON.stringify(greenPasswordEnrollmentActivationCliErrorCode(caught)),
      /pilot|smtp|contact|registry|proposed|shareittoo-staging-api|[a-f0-9]{40}/u, field);
  }
});

test('mount and registry substitution cannot satisfy post-start runtime binding', async (t) => {
  const cases = [
    ['mount-type', { candidateMountDrift: 'type' }],
    ['mount-source', { candidateMountDrift: 'source' }],
    ['mount-target', { candidateMountDrift: 'target' }],
    ['mount-readonly', { candidateMountDrift: 'readOnly' }],
    ['registry-digest', { registryProofDrift: 'digest' }],
    ['registry-count', { registryProofDrift: 'count' }],
    ['registry-readable', { registryProofDrift: 'readable' }],
  ];
  for (const [name, drift] of cases) {
    const state = await fixture();
    t.after(() => rm(state.root, { recursive: true, force: true }));
    const clock = monotonicClock();
    const harness = commandHarness(state, { ...drift, clockNow: clock.now });
    let caught;
    try {
      await runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
        command: harness.command, now: () => activationNow,
        monotonicNow: clock.now, wait: clock.wait,
      });
    } catch (error) { caught = error; }
    assert.equal(caught?.state, 'rolled-back', name);
    assert.equal(clock.value(), 15_000, name);
    assert.doesNotMatch(JSON.stringify(greenPasswordEnrollmentActivationCliErrorCode(caught)),
      /pilot|smtp|contact|registry|proposed|shareittoo-staging-api|[a-f0-9]{40}/u, name);
  }
});

test('missing tools, wrong workdir/source, command drift and target probe drift deny pre-mutation', async (t) => {
  const cases = [
    ['missing-git', { missingTool: 'git' }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['missing-docker', { missingTool: 'docker' }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['wrong-root', { wrongRoot: true }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['wrong-head', { wrongHead: true }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['command-drift', { drift: true }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['target-probe', { targetProbeDrift: true }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['inspect-fault', { currentInspectFailure: true }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['required-source-untracked', { requiredSourceUntracked: true },
      GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['required-source-modified', {
      trackedDriftPath: 'backend/ops/green_password_enrollment_activation_cli.mjs',
    }, GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['unrelated-tracked-drift', { trackedDriftPath: 'store/privacy-disclosures.json' },
      GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['untracked-override', { untrackedPath: 'backend/src/config.js.tmp' },
      GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT],
    ['wrong-cwd', {}, dirname(GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT)],
  ];
  for (const [name, options, cwd] of cases) {
    const state = await fixture();
    t.after(() => rm(state.root, { recursive: true, force: true }));
    const harness = commandHarness(state, options);
    await assert.rejects(runGreenPasswordEnrollmentActivationCli(dryArgs(state), {
      command: harness.command, cwd, now: () => activationNow,
    }), /green_password_enrollment_activation_cli_denied|green_password_enrollment_activation_denied/u,
    name);
    assert.deepEqual(harness.mutations, [], name);
    if (['required-source-untracked', 'required-source-modified',
      'unrelated-tracked-drift', 'untracked-override'].includes(name)) {
      assert.equal(harness.calls.some((call) => call.executable === 'docker'), false, name);
    }
  }
});

test('execute confirmation failure and first stop fault never advance to rename/create', async (t) => {
  const state = await fixture(); t.after(() => rm(state.root, { recursive: true, force: true }));
  const wrong = executeArgs(state);
  wrong[wrong.indexOf('--confirm-registry') + 1] = hash('wrong-confirmation');
  const confirmationHarness = commandHarness(state);
  await assert.rejects(runGreenPasswordEnrollmentActivationCli(wrong, {
    command: confirmationHarness.command, now: () => activationNow,
  }), /green_password_enrollment_activation_cli_denied/u);
  assert.deepEqual(confirmationHarness.mutations, []);

  const stopHarness = commandHarness(state, { stopResponseLoss: true });
  const clock = monotonicClock();
  stopHarness.command = ((original) => async (executable, args, options) => {
    if (executable === 'docker' && args[0] === 'stop') {
      stopHarness.mutations.push('stop');
      return { executable, args: [...args], cwd: options.cwd, status: 125, stdout: '' };
    }
    return original(executable, args, options);
  })(stopHarness.command);
  await assert.rejects(runGreenPasswordEnrollmentActivationCli(executeArgs(state), {
    command: stopHarness.command, now: () => activationNow,
    monotonicNow: clock.now, wait: clock.wait,
  }));
  assert.deepEqual(stopHarness.mutations, ['stop']);
  assert.equal(clock.value(), 30_000);
});

test('all CLI failures expose only fixed aggregate error fields', async (t) => {
  const state = await fixture(); t.after(() => rm(state.root, { recursive: true, force: true }));
  let caught;
  try {
    await runGreenPasswordEnrollmentActivationCli(dryArgs(state), {
      command: commandHarness(state, { targetProbeDrift: true }).command,
      now: () => activationNow,
    });
  } catch (error) { caught = error; }
  const exposed = JSON.stringify(greenPasswordEnrollmentActivationCliErrorCode(caught));
  assert.deepEqual(JSON.parse(exposed), {
    status: 'denied', code: 'green_password_enrollment_activation_cli_denied',
  });
  assert.doesNotMatch(exposed,
    /pilot|smtp|contact|registry|proposed|shareittoo-staging-api|[a-f0-9]{40}/u);
});

test('adapter source retains no static credential or shell execution path', async () => {
  const source = await readFile(new URL('../ops/green_password_enrollment_activation_cli.mjs',
    import.meta.url), 'utf8');
  assert.doesNotMatch(source, /exec\s*\(|spawn\s*\([^,]+,\s*[^[]/u);
  assert.doesNotMatch(source, /shell\s*:\s*true/u);
  assert.doesNotMatch(source,
    /(?:commit|version):\s*target\.(?:sourceCommit|sourceVersion)/u);
  assert.match(source, /readiness\.passwordEnrollmentEnabled !== true/u);
  assert.match(source, /health\.passwordEnrollmentEnabled !== true/u);
  assert.doesNotMatch(source,
    /enrollmentEnabled:\s*(?:readiness|health)\.passwordEnrollmentEnabled/u);
  assert.equal(source.includes(['private', '-value'].join('')), false);
});
