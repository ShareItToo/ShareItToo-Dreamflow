import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTechnicalSandbox106Evidence, validateTechnicalSandbox106Phase } from '../ops/technical_sandbox_106_activation.mjs';
import { runTechnicalSandbox106Activation, technicalSandbox106Confirmation } from '../ops/technical_sandbox_106_executor.mjs';

const now = Date.parse('2026-10-25T10:00:00.000Z');
const hash = 'a'.repeat(64);
export function evidence() {
  return {
    kind: 'sit-technical-sandbox-106-activation-evidence', schemaVersion: 1, environment: 'staging', pilotId: 'heilbronn_wave0',
    runtime: { canonicalContainerId: '9'.repeat(64), commit: 'b'.repeat(40), imageDigest: `sha256:${'c'.repeat(64)}` },
    promotion: { status: 'promoted', kind: 'sit-green-staging-106-106-promotion', runId: 'green-run-001', candidateId: '9'.repeat(64), receiptSha256: hash, sourceSchema: 106, targetSchema: 106, runtimeCommit: 'b'.repeat(40), imageDigest: `sha256:${'c'.repeat(64)}`, promotedAt: '2026-10-25T09:00:00.000Z' },
    ownerAuthorization: { id: 'owner-auth-technical-sandbox-1', issuedAt: '2026-10-25T09:00:00.000Z', expiresAt: '2026-10-25T12:00:00.000Z', receiptSha256: 'd'.repeat(64), scope: 'stripe-technical-sandbox-1eur-staging', userIds: ['synthetic_sandbox_user_owner','synthetic_sandbox_user_renter'] },
    credentials: { secretKey: { kind: 'restricted_test_key', path: '/run/secrets/technical-rk-test', sha256: 'e'.repeat(64), mode: '0600', uid: 100, gid: 101, regular: true, symlink: false, outsideRepository: true, mountReadOnly: true }, webhookSecret: { kind: 'webhook_signing_secret', path: '/run/secrets/technical-webhook', sha256: 'f'.repeat(64), mode: '0600', uid: 100, gid: 101, regular: true, symlink: false, outsideRepository: true, mountReadOnly: true } },
    stripeReadback: { authenticated: true, accountId: 'acct_synthetic1234', accountMode: 'test', livemode: false, readAt: '2026-10-25T09:30:00.000Z', receiptSha256: '1'.repeat(64) },
    rollback: { target: 'b'.repeat(40), receiptSha256: '2'.repeat(64), verifiedAt: '2026-10-25T09:40:00.000Z', mockPaymentTransport: true, technicalSandboxDisabled: true, secretMountsRemoved: true },
    boundaries: { paymentTransport: 'memory', stripeLivemode: false, marketplaceStripe: false, bookingLedger: false, connect: false, payout: false, notifications: false, amountMinor: 100, currency: 'EUR', maxRunsPerUser24h: 3, syntheticOnly: true },
    validatedAt: '2026-10-25T09:45:00.000Z',
  };
}
const digest = value => validateTechnicalSandbox106Evidence(value, { now }).evidenceSha256;
const greenPromotionReceipt = value => ({ kind: 'sit-green-staging-106-106-promotion', schemaVersion: 2,
  status: 'promoted_owner_smoke_pending', candidateId: value.runtime.canonicalContainerId, runtimeCommit: value.runtime.commit,
  ownerSmokePassed: false, publicReleaseComplete: false, oldImageRestarted: false, intentionalProviderCalls: 0, gatewayVerified: true });

test('accepts exact promoted Green 106 to 106 staging evidence and phase-bound plan', () => {
  const value = evidence();
  const binding = validateTechnicalSandbox106Evidence(value, { now });
  assert.equal(validateTechnicalSandbox106Phase({ evidence: value, phase: 'collect', now }).evidenceSha256, binding.evidenceSha256);
  assert.equal(binding.runtimeCommit, value.runtime.commit);
  assert.equal(binding.imageDigest, value.runtime.imageDigest);
  const preflight = validateTechnicalSandbox106Phase({ evidence: value, phase: 'preflight', evidenceSha256: binding.evidenceSha256, now });
  assert.equal(preflight.env.PAYMENT_TRANSPORT, 'memory');
  assert.equal(preflight.env.TECHNICAL_SANDBOX_ENABLED, '1');
  assert.equal(preflight.env.ENABLE_STAGING_STRIPE, '0');
  const confirmation = `promote:${binding.runtimeCommit}:${binding.imageDigest}:${binding.evidenceSha256}:${hash}`;
  const promotion = validateTechnicalSandbox106Phase({ evidence: value, phase: 'promote', evidenceSha256: binding.evidenceSha256,
    rehearsalSha256: hash, confirmation, now });
  assert.equal(promotion.productionTargetAllowed, false);
  assert.equal(promotion.mutationPerformed, false);
});

test('rejects stale, production, expired, and live-mode evidence', () => {
  for (const change of [
    v => { v.environment = 'production'; },
    v => { v.ownerAuthorization.expiresAt = '2026-10-25T09:59:59.000Z'; },
    v => { v.stripeReadback.livemode = true; },
    v => { v.stripeReadback.readAt = '2026-10-25T08:00:00.000Z'; },
    v => { v.validatedAt = '2026-10-25T08:00:00.000Z'; },
  ]) {
    const value = evidence(); change(value);
    assert.throws(() => validateTechnicalSandbox106Evidence(value, { now }));
  }
});

test('rejects credential metadata drift, missing rollback proof, boundary widening and digest drift', () => {
  for (const change of [
    v => { v.credentials.secretKey.mountReadOnly = false; },
    v => { v.credentials.webhookSecret.mode = '0640'; },
    v => { v.rollback.secretMountsRemoved = false; },
    v => { v.boundaries.connect = true; },
    v => { v.boundaries.paymentTransport = 'stripe'; },
  ]) {
    const value = evidence(); change(value);
    assert.throws(() => validateTechnicalSandbox106Evidence(value, { now }));
  }
  const value = evidence();
  assert.throws(() => validateTechnicalSandbox106Phase({ evidence: value, phase: 'collect', evidenceSha256: hash, now }), /sandbox106_evidence_digest/u);
});

test('rehearse and promote require explicit phase-specific external hash confirmation', () => {
  const value = evidence(); const evidenceSha256 = digest(value);
  assert.throws(() => validateTechnicalSandbox106Phase({ evidence: value, phase: 'rehearse', evidenceSha256,
    rehearsalSha256: hash, confirmation: 'yes', now }), /sandbox106_explicit_confirmation_required/u);
  const confirmation = `rehearse:${value.runtime.commit}:${value.runtime.imageDigest}:${evidenceSha256}:${hash}`;
  const result = validateTechnicalSandbox106Phase({ evidence: value, phase: 'rehearse', evidenceSha256,
    rehearsalSha256: hash, confirmation, now });
  assert.equal(result.status, 'rehearsal_authorized');
});

function activationRuntime(evidenceValue, { failAt = '', disabledReadback = true, rejectTopology = false } = {}) {
  const runtimeCommit = evidenceValue.runtime.commit;
  const networkIds = ['a'.repeat(64), 'b'.repeat(64)];
  const networkMembers = new Map(networkIds.map(id => [id, [evidenceValue.runtime.canonicalContainerId]]));
  const sourceEnv = {
    APP_COMMIT: runtimeCommit, DEPLOYMENT_ENVIRONMENT: 'test', SIT_STAGING_PILOT_ID: evidenceValue.pilotId, PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    TECHNICAL_SANDBOX_ENABLED: '0', TECHNICAL_SANDBOX_KILL_SWITCH: '1', ENABLE_STAGING_STRIPE: '0',
    STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_CONNECT_WEBHOOK_SECRET: '', DATABASE_URL: 'postgres://private',
  };
  const source = {
    Id: evidenceValue.runtime.canonicalContainerId, Name: '/shareittoo-staging-api', Image: 'sha256:' + '8'.repeat(64),
    Config: { Image: 'shareittoo/api:green', Env: Object.entries(sourceEnv).map(([k,v]) => `${k}=${v}`),
      Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': 'green-run-001',
        'com.shareittoo.green.106_106.promotion': evidenceValue.promotion.runId }, User: '100:101', WorkingDir: '/app' },
    HostConfig: { Privileged: false, AutoRemove: false, PortBindings: {}, Devices: [], DeviceRequests: [],
      Mounts: [], Binds: [], NetworkMode: 'staging', RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 } },
    Mounts: [], State: { Running: true, Paused: false },
    NetworkSettings: { Networks: { private: { NetworkID: networkIds[0] }, edge: { NetworkID: networkIds[1] } } },
  };
  const image = { Id: source.Image, RepoDigests: [`registry.example/sit/api@${evidenceValue.runtime.imageDigest}`] };
  const containers = new Map([[source.Id, structuredClone(source)]]);
  const events = [];
  let actionSeen = false;
  const inject = name => { if (!actionSeen && failAt === name) { actionSeen = true; throw Object.assign(new Error('synthetic response loss'), { code: `inject_${name}` }); } };
  const dependencies = {
    now: () => now,
    acquireLock: async binding => ({ binding, token: 'held' }),
    releaseLock: async () => {},
    inspect: async id => { if (!containers.has(id)) throw Error('not found'); return structuredClone(containers.get(id)); },
    inspectImage: async id => id === image.Id ? structuredClone(image) : null,
    inspectNetwork: async id => ({ Id: id, Name: ['private','edge'][networkIds.indexOf(id)], ContainerIds: [...networkMembers.get(id)] }),
    validateTopology: async () => !rejectTopology,
    lookupName: async name => [...containers.values()].find(c => c.Name === `/${name}`)?.Id ?? null,
    create: async spec => {
      const id = 'c'.repeat(64);
      const env = { ...sourceEnv, ...spec.environment };
      containers.set(id, { ...structuredClone(source), Id: id, Name: `/${spec.name}`,
        Config: { ...structuredClone(source.Config), Env: Object.entries(env).map(([k,v]) => `${k}=${v}`), Labels: spec.labels },
        HostConfig: { ...structuredClone(source.HostConfig), Mounts: spec.mounts.map(m => ({ Type: 'bind', Source: m.source, Target: m.destination, ReadOnly: true })) },
        Mounts: spec.mounts.map(m => ({ Type: 'bind', Source: m.source, Destination: m.destination, RW: false })),
        State: { Running: false, Paused: false }, NetworkSettings: { Networks: {} } });
      inject('create'); return id;
    },
    attach: async ({ candidateId, networkId }) => {
      const c = containers.get(candidateId); const name = `network-${networkIds.indexOf(networkId)}`;
      c.NetworkSettings.Networks[name] = { NetworkID: networkId }; networkMembers.get(networkId).push(candidateId); inject('attach');
    },
    start: async id => { events.push(`start:${id}`); containers.get(id).State.Running = true; inject('start'); },
    stop: async id => { events.push(`stop:${id}`); containers.get(id).State.Running = false; inject('stop'); },
    remove: async id => { containers.delete(id); for (const ids of networkMembers.values()) { const index = ids.indexOf(id); if (index >= 0) ids.splice(index, 1); } inject('remove'); },
    rename: async ({ id, name }) => {
      containers.get(id).Name = `/${name}`;
      inject(name === 'shareittoo-staging-api'
        ? (id === source.Id ? 'rollbackRename' : 'renameCandidate')
        : (name.startsWith('sit-technical-sandbox-old-') ? 'renameOld' : 'rollbackRenameCandidate'));
    },
    localReadback: async () => { events.push('localReadback'); return ({ authenticated: true, live: { status: 'ok' }, ready: { status: 'ok' }, technicalSandbox: {
      available: true, provider: 'stripe', mode: 'test', amountMinor: 100, currency: 'EUR', syntheticOnly: true,
      maxRunsPerUser24h: 3, professionalReview: false,
      liveMoney: false, marketplaceStripe: false, bookingEffects: false, ledgerEffects: false, connectEffects: false,
      payoutEffects: false, notificationEffects: false } }); },
    gatewayReadback: async request => {
      const active = [...containers.values()].filter(c => c.State?.Running === true);
      if (request.expectedTechnicalSandbox) assert.deepEqual(active.map(c => c.Name), ['/shareittoo-staging-api']);
      else assert.deepEqual(active.map(c => c.Name), ['/shareittoo-staging-api']);
      if (failAt === 'gateway' && request.expectedTechnicalSandbox) return { versionCommit: 'bad', imageDigest: 'bad' };
      return { versionCommit: runtimeCommit, imageDigest: evidenceValue.runtime.imageDigest,
        technicalSandbox: { available: request.expectedTechnicalSandbox, provider: 'stripe', mode: request.expectedTechnicalSandbox ? 'test' : 'disabled',
          amountMinor: 100, currency: 'EUR', syntheticOnly: true, liveMoney: false, bookingEffects: false,
          marketplaceStripe: false, ledgerEffects: false, connectEffects: false, payoutEffects: false, notificationEffects: false },
        paymentTransport: 'memory' };
    },
    writeReceipt: async ({ receipt }) => ({ sha256: receipt.status === 'passed' ? hash : '3'.repeat(64) }),
  };
  return { source, image, dependencies, containers, events };
}

test('Green-native rehearsal restores the exact canonical source; promotion requires and binds sealed rehearsal', async () => {
  const value = evidence(); const evidenceSha256 = digest(value); const runId = '00000000-0000-4000-8000-000000000001';
  const runtime = activationRuntime(value);
  const rehearsal = await runTechnicalSandbox106Activation({ evidence: value, promotionReceipt: greenPromotionReceipt(value),
    promotionReceiptSha256: value.promotion.receiptSha256, canonical: runtime.source, image: runtime.image,
    options: { execute: true, phase: 'rehearse', evidenceSha256, promotionReceiptSha256: value.promotion.receiptSha256,
      runId, confirmation: technicalSandbox106Confirmation({ phase: 'rehearse', sourceId: runtime.source.Id,
        runtimeCommit: value.runtime.commit, imageDigest: value.runtime.imageDigest, evidenceSha256 }) }, dependencies: runtime.dependencies });
  assert.equal(rehearsal.status, 'passed', JSON.stringify(rehearsal)); assert.equal(rehearsal.rollbackVerified, true);
  assert.ok(runtime.events.indexOf(`stop:${runtime.source.Id}`) > runtime.events.indexOf('localReadback'));
  assert.equal(runtime.containers.get(runtime.source.Id).Name, '/shareittoo-staging-api');
  assert.equal(runtime.containers.size, 1);
  const sealedRehearsalArtifact = { ...rehearsal }; delete sealedRehearsalArtifact.sha256;
  const rehearsalFileSha256 = hash; // writeReceipt fixture's raw artifact digest; no self-hash is stored in JSON.
  const promoted = await runTechnicalSandbox106Activation({ evidence: value, promotionReceipt: greenPromotionReceipt(value),
    promotionReceiptSha256: value.promotion.receiptSha256, canonical: runtime.source, image: runtime.image,
    rehearsalReceipt: sealedRehearsalArtifact, options: { execute: true, phase: 'promote', rehearsalSha256: rehearsalFileSha256,
      evidenceSha256, promotionReceiptSha256: value.promotion.receiptSha256, runId,
      confirmation: technicalSandbox106Confirmation({ phase: 'promote', sourceId: runtime.source.Id,
        runtimeCommit: value.runtime.commit, imageDigest: value.runtime.imageDigest, evidenceSha256, rehearsalSha256: rehearsalFileSha256 }) }, dependencies: runtime.dependencies });
  assert.equal(promoted.status, 'passed');
  assert.equal(runtime.containers.get(promoted.candidateId).Name, '/shareittoo-staging-api');
  assert.equal(runtime.containers.get(runtime.source.Id).Name, `/sit-technical-sandbox-old-${runId}`);
  assert.equal(runtime.containers.get(runtime.source.Id).State.Running, false);
});

test('activation failure injection never mutates source and restores mock/disabled boundary', async () => {
  for (const failAt of ['create','attach','start','renameOld','renameCandidate','gateway','stop','remove','rollbackRename']) {
    const value = evidence(); const evidenceSha256 = digest(value); const runtime = activationRuntime(value, { failAt });
    const runId = '00000000-0000-4000-8000-000000000003';
    const result = await runTechnicalSandbox106Activation({ evidence: value, promotionReceipt: greenPromotionReceipt(value),
      promotionReceiptSha256: value.promotion.receiptSha256, canonical: runtime.source, image: runtime.image,
      rehearsalReceipt: null, options: { execute: true, phase: 'rehearse', evidenceSha256,
        promotionReceiptSha256: value.promotion.receiptSha256, runId,
        confirmation: technicalSandbox106Confirmation({ phase: 'rehearse', sourceId: runtime.source.Id,
          runtimeCommit: value.runtime.commit, imageDigest: value.runtime.imageDigest, evidenceSha256 }) }, dependencies: runtime.dependencies });
    assert.equal(result.status, ['remove','rollbackRename'].includes(failAt) ? 'passed' : 'activation_rolled_back', `${failAt}: ${JSON.stringify(result)}`);
    assert.equal(runtime.containers.get(runtime.source.Id).Name, '/shareittoo-staging-api', failAt);
    assert.deepEqual(runtime.containers.get(runtime.source.Id), runtime.source, failAt);
    assert.equal(runtime.containers.size, 1, failAt);
  }
});

test('uncertain rollback retains lock and reports recovery required', async () => {
  const value = evidence(); const evidenceSha256 = digest(value); const runtime = activationRuntime(value, { failAt: 'start', disabledReadback: false });
  runtime.dependencies.gatewayReadback = async request => ({ versionCommit: value.runtime.commit, imageDigest: value.runtime.imageDigest,
    technicalSandbox: { available: request.expectedTechnicalSandbox, mode: request.expectedTechnicalSandbox ? 'test' : 'disabled' },
    paymentTransport: request.expectedPaymentTransport === 'memory' ? 'stripe' : 'memory' });
  const result = await runTechnicalSandbox106Activation({ evidence: value, promotionReceipt: greenPromotionReceipt(value),
    promotionReceiptSha256: value.promotion.receiptSha256, canonical: runtime.source, image: runtime.image,
    options: { execute: true, phase: 'rehearse', evidenceSha256, promotionReceiptSha256: value.promotion.receiptSha256,
      runId: '00000000-0000-4000-8000-000000000004', confirmation: technicalSandbox106Confirmation({ phase: 'rehearse',
        sourceId: runtime.source.Id, runtimeCommit: value.runtime.commit, imageDigest: value.runtime.imageDigest, evidenceSha256 }) }, dependencies: runtime.dependencies });
  assert.equal(result.status, 'recovery_required'); assert.equal(result.lockRetained, true);
});

test('executor rejects foreign canonical identity and image drift before creating a successor', async () => {
  const value = evidence(); const evidenceSha256 = digest(value);
  for (const mutate of [
    source => { source.Id = '7'.repeat(64); },
    source => { source.Config.Labels['com.shareittoo.sit.green'] = 'false'; },
    source => { source.HostConfig.Privileged = true; },
  ]) {
    const runtime = activationRuntime(value); mutate(runtime.source);
    await assert.rejects(() => runTechnicalSandbox106Activation({ evidence: value, promotionReceipt: greenPromotionReceipt(value),
      promotionReceiptSha256: value.promotion.receiptSha256, canonical: runtime.source, image: runtime.image,
      options: { execute: true, phase: 'rehearse', evidenceSha256, promotionReceiptSha256: value.promotion.receiptSha256,
        runId: '00000000-0000-4000-8000-000000000005', confirmation: technicalSandbox106Confirmation({ phase: 'rehearse',
          sourceId: '9'.repeat(64), runtimeCommit: value.runtime.commit, imageDigest: value.runtime.imageDigest, evidenceSha256 }) },
      dependencies: runtime.dependencies }));
    assert.equal(runtime.containers.size, 1);
  }
  const runtime = activationRuntime(value);
  await assert.rejects(() => runTechnicalSandbox106Activation({ evidence: value, promotionReceipt: greenPromotionReceipt(value),
    promotionReceiptSha256: value.promotion.receiptSha256, canonical: runtime.source,
    image: { ...runtime.image, RepoDigests: ['registry.invalid/api@sha256:' + '0'.repeat(64)] },
    options: { execute: true, phase: 'rehearse', evidenceSha256, promotionReceiptSha256: value.promotion.receiptSha256,
      runId: '00000000-0000-4000-8000-000000000006', confirmation: technicalSandbox106Confirmation({ phase: 'rehearse',
        sourceId: runtime.source.Id, runtimeCommit: value.runtime.commit, imageDigest: value.runtime.imageDigest, evidenceSha256 }) },
    dependencies: runtime.dependencies }));
  assert.equal(runtime.containers.size, 1);
});

test('executor rejects unsupported host topology before lock acquisition or candidate creation', async () => {
  const value = evidence(); const runtime = activationRuntime(value, { rejectTopology: true });
  const validated = validateTechnicalSandbox106Evidence(value, { now });
  await assert.rejects(() => runTechnicalSandbox106Activation({ evidence: value, promotionReceipt: greenPromotionReceipt(value), canonical: runtime.source,
    image: runtime.image, promotionReceiptSha256: value.promotion.receiptSha256,
    options: { execute: true, phase: 'rehearse', evidenceSha256: validated.evidenceSha256,
      promotionReceiptSha256: value.promotion.receiptSha256, confirmation: technicalSandbox106Confirmation({ phase: 'rehearse',
        sourceId: value.runtime.canonicalContainerId, runtimeCommit: value.runtime.commit,
        imageDigest: value.runtime.imageDigest, evidenceSha256: validated.evidenceSha256 }),
      runId: '11111111-2222-4333-8444-555555555555' }, dependencies: runtime.dependencies }), /activation_topology_unsupported/u);
  assert.equal(runtime.containers.size, 1);
});
