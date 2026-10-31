import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateTechnicalSandbox106Evidence, validateTechnicalSandbox106Phase } from './technical_sandbox_106_activation.mjs';
import { closeArtifact, exclusiveArtifact, privateDirectory, writeArtifact } from './green_staging_98_106_evidence.mjs';

const fail = code => { const error = new Error(code); error.code = code; error.exitCode = 2; throw error; };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const canonicalJson = value => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
    : JSON.stringify(value);
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const networkIdsByName = value => Object.fromEntries(Object.entries(value?.NetworkSettings?.Networks ?? {})
  .map(([name, endpoint]) => [name, endpoint.NetworkID]).sort(([a], [b]) => a.localeCompare(b)));
function assert(ok, code) { if (!ok) fail(`sandbox106_${code}`); }

const protectedEnv = Object.freeze({ PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', ENABLE_STAGING_STRIPE: '0',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_CONNECT_WEBHOOK_SECRET: '',
  TECHNICAL_SANDBOX_ENABLED: '1', TECHNICAL_SANDBOX_KILL_SWITCH: '0' });
const changedConfig = new Set(['Env','Labels','Image','Hostname']);
const changedHost = new Set(['NetworkMode','Binds','Mounts','RestartPolicy']);
function assertPreserved(source, candidate, overrides) {
  for (const [key, value] of Object.entries(source.Config ?? {})) if (!changedConfig.has(key)) assert(same(candidate.Config?.[key], value), 'candidate_config_drift');
  assert(same(candidate.Config?.Hostname, source.Config?.Hostname), 'candidate_hostname_drift');
  for (const [key, value] of Object.entries(source.HostConfig ?? {})) if (!changedHost.has(key)) assert(same(candidate.HostConfig?.[key], value), 'candidate_host_drift');
  assert(same(candidate.HostConfig?.RestartPolicy, source.HostConfig?.RestartPolicy), 'candidate_restart_policy');
  const env = Object.fromEntries((candidate.Config?.Env ?? []).map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));
  const sourceEnv = Object.fromEntries((source.Config?.Env ?? []).map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));
  const allowedEnv = new Set([...Object.keys(protectedEnv), 'TECHNICAL_SANDBOX_SECRET_KEY_FILE','TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE',
    'TECHNICAL_SANDBOX_ACCOUNT_ID','TECHNICAL_SANDBOX_USER_IDS','TECHNICAL_SANDBOX_AUTHORIZATION_ID',
    'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT','TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT']);
  for (const key of Object.keys(env)) if (!Object.hasOwn(sourceEnv, key)) assert(allowedEnv.has(key), 'candidate_environment_widened');
  const expectedEnv = { ...sourceEnv, ...overrides };
  assert(same(env, expectedEnv), 'candidate_environment_drift');
  for (const [key, value] of Object.entries(protectedEnv)) assert(env[key] === value, 'candidate_payment_boundary');
  for (const key of ['TECHNICAL_SANDBOX_SECRET_KEY_FILE','TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE']) assert(typeof env[key] === 'string' && env[key].startsWith('/run/secrets/'), 'candidate_secret_mount_env');
  for (const key of ['TECHNICAL_SANDBOX_ACCOUNT_ID','TECHNICAL_SANDBOX_USER_IDS','TECHNICAL_SANDBOX_AUTHORIZATION_ID','TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT','TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT']) assert(typeof env[key] === 'string' && env[key].length > 0, 'candidate_authorization_env');
  for (const mount of candidate.Mounts ?? []) if ((mount.Destination ?? mount.DestinationPath) === '/run/secrets/technical-sandbox-rk'
      || (mount.Destination ?? mount.DestinationPath) === '/run/secrets/technical-sandbox-webhook') assert(mount.RW === false, 'candidate_secret_mount_writable');
}

/**
 * Green-native activation transaction. All effects are explicit dependencies so
 * the same exact-ID protocol can be rehearsed in tests before a live adapter is
 * authorized. The source is captured by exact ID, stopped before the canonical
 * name boundary to prevent duplicate workers, and restarted only on rollback.
 */
export async function runTechnicalSandbox106Activation({ evidence, promotionReceipt, promotionReceiptSha256, canonical, image, rehearsalReceipt, options = {}, dependencies = {} }) {
  const now = dependencies.now ?? Date.now;
  const validated = validateTechnicalSandbox106Evidence(evidence, { now: now() });
  const evidenceSha256 = validated.evidenceSha256;
  assert(options.evidenceSha256 === evidenceSha256, 'evidence_digest');
  assert(options.promotionReceiptSha256 === validated.promotionReceiptSha256 && promotionReceiptSha256 === validated.promotionReceiptSha256,
    'promotion_receipt_binding');
  assert(promotionReceipt?.kind === 'sit-green-staging-106-106-promotion' && promotionReceipt.schemaVersion === 2
    && promotionReceipt.status === 'promoted_owner_smoke_pending' && promotionReceipt.candidateId === evidence.runtime.canonicalContainerId
    && promotionReceipt.runtimeCommit === evidence.runtime.commit && promotionReceipt.ownerSmokePassed === false
    && promotionReceipt.publicReleaseComplete === false && promotionReceipt.oldImageRestarted === false
    && promotionReceipt.intentionalProviderCalls === 0 && promotionReceipt.gatewayVerified === true, 'green_promotion_receipt_invalid');
  assert(canonical?.Id === evidence.runtime.canonicalContainerId, 'canonical_id_binding');
  assert(canonical?.Id && canonical.Name === '/shareittoo-staging-api' && canonical.State?.Running === true
    && canonical.State?.Paused === false, 'canonical_identity');
  assert(image?.Id === canonical.Image && image?.Id && image.RepoDigests?.some(v => v.endsWith(evidence.runtime.imageDigest.slice(7))), 'canonical_image_digest');
  assert(canonical.Config?.Labels?.['com.shareittoo.sit.green'] === 'true', 'canonical_green_label');
  assert(canonical.Config?.Labels?.['com.shareittoo.sit.green.run_id'] && canonical.Config?.Labels?.['com.shareittoo.green.106_106.promotion'] === evidence.promotion.runId, 'canonical_promotion_label');
  assert(canonical.HostConfig?.Privileged !== true && canonical.HostConfig?.AutoRemove !== true
    && !Object.keys(canonical.HostConfig?.PortBindings ?? {}).length && !(canonical.HostConfig?.Devices?.length)
    && !(canonical.HostConfig?.DeviceRequests?.length), 'canonical_topology_unsupported');
  const sourceRuntimeEnv = Object.fromEntries((canonical.Config.Env ?? []).map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));
  assert(sourceRuntimeEnv.APP_COMMIT === evidence.runtime.commit && sourceRuntimeEnv.DEPLOYMENT_ENVIRONMENT === 'test'
    && sourceRuntimeEnv.SIT_STAGING_PILOT_ID === evidence.pilotId
    && sourceRuntimeEnv.PAYMENT_TRANSPORT === 'memory' && sourceRuntimeEnv.STRIPE_LIVEMODE === 'false'
    && sourceRuntimeEnv.TECHNICAL_SANDBOX_ENABLED === '0' && sourceRuntimeEnv.TECHNICAL_SANDBOX_KILL_SWITCH === '1', 'canonical_runtime_boundary');
  assert(Array.isArray(canonical.NetworkSettings?.Networks) || (canonical.NetworkSettings?.Networks && Object.keys(canonical.NetworkSettings.Networks).length >= 1), 'canonical_networks');
  assert(typeof dependencies.inspect === 'function' && typeof dependencies.create === 'function'
    && typeof dependencies.attach === 'function' && typeof dependencies.start === 'function'
    && typeof dependencies.rename === 'function' && typeof dependencies.stop === 'function'
    && typeof dependencies.remove === 'function' && typeof dependencies.localReadback === 'function'
    && typeof dependencies.gatewayReadback === 'function' && typeof dependencies.lookupName === 'function' && typeof dependencies.acquireLock === 'function'
    && typeof dependencies.inspectImage === 'function' && typeof dependencies.inspectNetwork === 'function'
    && typeof dependencies.validateTopology === 'function'
    && typeof dependencies.writeReceipt === 'function'
    && typeof dependencies.releaseLock === 'function', 'executor_dependencies_required');
  const { phase = 'preflight', execute = false, confirmation, rehearsalSha256, runId = randomUUID() } = options;
  if (!execute) return Object.freeze({ phase: 'preflight', status: 'read_only_activation_plan', evidenceSha256,
    runtimeCommit: validated.runtimeCommit, imageDigest: validated.imageDigest, mutationPerformed: false, exitCode: 0 });
  assert(phase === 'rehearse' || phase === 'promote', 'phase_invalid');
  if (phase === 'promote') assert(rehearsalReceipt?.kind === 'sit-technical-sandbox-106-activation-rehearsal'
    && rehearsalReceipt.status === 'passed' && rehearsalReceipt.rollbackVerified === true
    && rehearsalReceipt.evidenceSha256 === evidenceSha256 && rehearsalReceipt.sourceId === canonical.Id
    && rehearsalReceipt.runtimeCommit === validated.runtimeCommit && rehearsalReceipt.imageDigest === validated.imageDigest
    && rehearsalReceipt.mutationPerformed === true && rehearsalReceipt.productionTargetAllowed === false
    && rehearsalReceipt.runId === options.runId && hash(rehearsalSha256)
    && Number.isFinite(Date.parse(rehearsalReceipt.createdAt)) && Date.parse(rehearsalReceipt.createdAt) <= now()
    && now() - Date.parse(rehearsalReceipt.createdAt) <= 60 * 60 * 1000, 'rehearsal_receipt_invalid');
  const expectedConfirmation = phase === 'rehearse'
    ? `${phase}:${canonical.Id}:${validated.runtimeCommit}:${validated.imageDigest}:${evidenceSha256}`
    : `${phase}:${canonical.Id}:${validated.runtimeCommit}:${validated.imageDigest}:${evidenceSha256}:${rehearsalSha256}`;
  assert(confirmation === expectedConfirmation, 'explicit_confirmation_required');
  assert(/^[0-9a-f-]{36}$/u.test(runId), 'run_id');
  const tempName = `sit-technical-sandbox-${runId}`;
  const oldName = `sit-technical-sandbox-old-${runId}`;
  const activeName = '/shareittoo-staging-api';
  const sourceSnapshot = clone(canonical);
  const canonicalSnapshotSha256 = sha256(canonicalJson({ id: sourceSnapshot.Id, image: sourceSnapshot.Image,
    config: sourceSnapshot.Config, hostConfig: sourceSnapshot.HostConfig, mounts: sourceSnapshot.Mounts,
    networks: sourceSnapshot.NetworkSettings?.Networks }));
  const networkIds = Object.values(canonical.NetworkSettings.Networks).map(n => n.NetworkID).sort();
  assert(networkIds.length > 0 && networkIds.every(Boolean), 'network_inventory');
  assert(await dependencies.lookupName('shareittoo-staging-api') === canonical.Id
    && await dependencies.lookupName(`sit-technical-sandbox-${runId}`) === null
    && await dependencies.lookupName(`sit-technical-sandbox-old-${runId}`) === null, 'activation_name_inventory');
  const liveSource = await dependencies.inspect(canonical.Id);
  assert(liveSource.Id === canonical.Id && liveSource.Name === canonical.Name && liveSource.Image === canonical.Image
    && liveSource.State?.Running === true && same(liveSource.Config, canonical.Config)
    && same(liveSource.HostConfig, canonical.HostConfig) && same(liveSource.Mounts, canonical.Mounts)
    && same(liveSource.NetworkSettings, canonical.NetworkSettings), 'canonical_initial_cas');
  const liveImage = await dependencies.inspectImage(canonical.Image);
  assert(liveImage?.Id === canonical.Image && liveImage.RepoDigests?.some(v => v.endsWith(validated.imageDigest.slice(7))), 'canonical_image_digest_live');
  const networkBaseline = new Map();
  for (const [networkName, endpoint] of Object.entries(canonical.NetworkSettings.Networks)) {
    const network = await dependencies.inspectNetwork(endpoint.NetworkID);
    assert(network?.Id === endpoint.NetworkID && network.Name === networkName && Array.isArray(network.ContainerIds)
      && network.ContainerIds.filter(id => id === canonical.Id).length === 1, 'canonical_network_cas');
    networkBaseline.set(endpoint.NetworkID, [...network.ContainerIds].sort());
  }
  assert(await dependencies.validateTopology({ canonical, image: liveImage, runId, evidence }), 'activation_topology_unsupported');
  const lock = await dependencies.acquireLock({ runId, canonicalId: canonical.Id, canonicalSnapshotSha256, evidenceSha256,
    imageDigest: validated.imageDigest, promotionReceiptSha256: validated.promotionReceiptSha256, rehearsalSha256: rehearsalSha256 ?? null });
  let candidateId = null, boundaryStarted = false, sourceRestored = false, candidateRemoved = false,
    publicDisabledVerified = false, rollbackVerified = false, stage = 'create', failure = null;
  const candidateLabels = { ...(canonical.Config.Labels ?? {}), 'com.shareittoo.technical-sandbox.activation': runId,
    'com.shareittoo.technical-sandbox.evidence': evidenceSha256 };
  const spec = Object.freeze({ sourceId: canonical.Id, sourceImage: canonical.Image, imageDigest: validated.imageDigest,
    environment: { ...protectedEnv, TECHNICAL_SANDBOX_SECRET_KEY_FILE: '/run/secrets/technical-sandbox-rk',
      TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: '/run/secrets/technical-sandbox-webhook',
      TECHNICAL_SANDBOX_ACCOUNT_ID: evidence.stripeReadback.accountId ?? '',
      TECHNICAL_SANDBOX_USER_IDS: evidence.ownerAuthorization.userIds.join(','),
      TECHNICAL_SANDBOX_AUTHORIZATION_ID: evidence.ownerAuthorization.id,
      TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: evidence.ownerAuthorization.issuedAt,
      TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: evidence.ownerAuthorization.expiresAt },
    mounts: [{ source: evidence.credentials.secretKey.path, destination: '/run/secrets/technical-sandbox-rk', readOnly: true },
      { source: evidence.credentials.webhookSecret.path, destination: '/run/secrets/technical-sandbox-webhook', readOnly: true }],
    networkIds, labels: candidateLabels, name: tempName });
  const read = async id => dependencies.inspect(id);
  const sourceCas = async () => {
    const current = await read(canonical.Id);
    assert(current.Id === sourceSnapshot.Id && current.Image === sourceSnapshot.Image && current.State?.Running === true
      && same(current.Config, sourceSnapshot.Config) && same(current.HostConfig, sourceSnapshot.HostConfig)
      && same(current.NetworkSettings, sourceSnapshot.NetworkSettings), 'source_changed');
    return current;
  };
  const stoppedSourceCas = async expectedName => {
    const current = await read(sourceSnapshot.Id);
    assert(current.Id === sourceSnapshot.Id && current.Name === `/${expectedName}` && current.State?.Running === false
      && current.State?.Paused === false && same(current.Config, sourceSnapshot.Config)
      && same(current.HostConfig, sourceSnapshot.HostConfig)
      && same(networkIdsByName(current), networkIdsByName(sourceSnapshot)), 'source_stopped_cas');
    return current;
  };
  const verifyCandidate = async (expectedName, running, { attached = true } = {}) => {
    const c = await read(candidateId);
    assert(c.Id === candidateId && c.Name === `/${expectedName}` && c.Image === sourceSnapshot.Image
      && c.State?.Running === running && c.State?.Paused === false, 'candidate_identity');
    assertPreserved(sourceSnapshot, c, spec.environment);
    assert(same(Object.values(c.NetworkSettings?.Networks ?? {}).map(n => n.NetworkID).sort(), attached ? networkIds : []), 'candidate_networks');
    assert(same(c.Config?.Labels, candidateLabels), 'candidate_labels');
    const sourceMounts = sourceSnapshot.Mounts ?? [];
    const secretDestinations = ['/run/secrets/technical-sandbox-rk','/run/secrets/technical-sandbox-webhook'];
    const addedMounts = (c.Mounts ?? []).filter(m => secretDestinations.includes(m.Destination));
    assert(addedMounts.length === 2 && addedMounts.every(m => m.RW === false)
      && addedMounts.some(m => m.Destination === secretDestinations[0] && m.Source === spec.mounts[0].source)
      && addedMounts.some(m => m.Destination === secretDestinations[1] && m.Source === spec.mounts[1].source), 'candidate_secret_mounts');
    assert(same((c.Mounts ?? []).filter(m => !secretDestinations.includes(m.Destination)), sourceMounts), 'candidate_mounts_drift');
    return c;
  };
  const verifyNetworkMembers = async includeCandidate => {
    for (const [networkId, baseline] of networkBaseline) {
      const record = await dependencies.inspectNetwork(networkId);
      const expected = [...baseline, ...(includeCandidate ? [candidateId] : [])].sort();
      assert(record?.Id === networkId && same([...record.ContainerIds].sort(), expected), 'network_membership_cas');
    }
  };
  const restore = async () => {
    if (!candidateId) candidateId = await dependencies.lookupName(tempName);
    let c = null;
    if (candidateId) {
      try { c = await read(candidateId); } catch {
        const temporary = await dependencies.lookupName(tempName);
        const active = await dependencies.lookupName('shareittoo-staging-api');
        assert(temporary === null && active !== candidateId && (active === null || active === canonical.Id), 'rollback_candidate_inspect');
      }
    }
    if (c?.State?.Running) {
      try { await dependencies.stop(candidateId); } catch { /* Exact-ID readback below decides. */ }
      c = await read(candidateId);
      assert(c.State?.Running === false && c.State?.Paused === false, 'rollback_candidate_stop');
    }
    let old = await read(sourceSnapshot.Id);
    if (c?.Name === activeName && old.Name === `/${oldName}`) {
      try { await dependencies.rename({ id: candidateId, name: tempName }); } catch { /* Reconcile once by exact ID. */ }
      c = await read(candidateId); assert(c.Name === `/${tempName}`, 'rollback_candidate_name');
    }
    old = await read(sourceSnapshot.Id);
    if (old.Name === `/${oldName}`) {
      try { await dependencies.rename({ id: canonical.Id, name: 'shareittoo-staging-api' }); } catch { /* Reconcile by exact ID, no replay. */ }
      old = await read(canonical.Id);
    }
    assert(old.Name === activeName, 'rollback_old_name');
    if (!old.State?.Running) {
      try { await dependencies.start(sourceSnapshot.Id); } catch { /* Exact-ID state below reconciles response loss. */ }
      old = await read(sourceSnapshot.Id);
    }
    assert(old.State?.Running === true && old.State?.Paused === false, 'rollback_old_start');
    if (c) {
      const still = await read(candidateId);
      assert(still.State?.Running === false && still.Name === `/${tempName}`, 'rollback_candidate_identity');
      try { await dependencies.remove(candidateId); } catch { /* Removal response loss reconciled below. */ }
      assert(await dependencies.lookupName(tempName) === null, 'rollback_candidate_remove');
    }
    await verifyNetworkMembers(false);
    old = await read(sourceSnapshot.Id);
    assert(old.Id === sourceSnapshot.Id && old.Name === activeName && old.State?.Running === true
      && same(old.Config, sourceSnapshot.Config) && same(old.HostConfig, sourceSnapshot.HostConfig)
      && same(networkIdsByName(old), networkIdsByName(sourceSnapshot)), 'rollback_source_readback');
    const gateway = await dependencies.gatewayReadback({ expectedCommit: validated.runtimeCommit, expectedImageDigest: validated.imageDigest,
      expectedTechnicalSandbox: false, expectedPaymentTransport: 'memory', timeoutMs: 5000 });
    assert(gateway?.versionCommit === validated.runtimeCommit && gateway?.imageDigest === validated.imageDigest
      && gateway?.technicalSandbox?.available === false && gateway?.technicalSandbox?.mode === 'disabled'
      && gateway?.paymentTransport === 'memory', 'rollback_public_readback');
    await verifyNetworkMembers(false);
    return { rollbackVerified: true, candidateRemoved: !c || await dependencies.lookupName(tempName) === null, gateway };
  };
  try {
    stage = 'create';
    candidateId = await dependencies.create(spec); // Never replay after a lost reply.
    assert(typeof candidateId === 'string' && candidateId.length > 8, 'candidate_create_response');
    await sourceCas(); await verifyCandidate(tempName, false, { attached: false });
    stage = 'attach';
    for (const networkId of networkIds) await dependencies.attach({ candidateId, networkId });
    await sourceCas(); await verifyCandidate(tempName, false);
    await verifyNetworkMembers(true);
    stage = 'start'; await dependencies.start(candidateId); await sourceCas(); await verifyCandidate(tempName, true);
    stage = 'local_readback';
    const local = await dependencies.localReadback(candidateId, { authenticated: true, technicalSandbox: true });
    assert(local?.live?.status === 'ok' && local?.ready?.status === 'ok' && local?.technicalSandbox?.available === true
      && local.technicalSandbox.provider === 'stripe' && local.technicalSandbox.mode === 'test'
      && local.technicalSandbox.amountMinor === 100 && local.technicalSandbox.currency === 'EUR'
      && local.technicalSandbox.maxRunsPerUser24h === 3 && local.technicalSandbox.professionalReview === false
      && local.technicalSandbox.syntheticOnly === true && local.technicalSandbox.liveMoney === false
      && local.technicalSandbox.bookingEffects === false && local.technicalSandbox.ledgerEffects === false
      && local.technicalSandbox.connectEffects === false && local.technicalSandbox.payoutEffects === false
      && local.technicalSandbox.notificationEffects === false
      && local.technicalSandbox.marketplaceStripe === false && local.authenticated === true, 'local_capability_readback');
    stage = 'old_stop'; boundaryStarted = true;
    await dependencies.stop(canonical.Id);
    await stoppedSourceCas('shareittoo-staging-api');
    await verifyNetworkMembers(true);
    stage = 'rename_old';
    await dependencies.rename({ id: canonical.Id, name: oldName });
    await stoppedSourceCas(oldName);
    stage = 'rename_candidate'; await dependencies.rename({ id: candidateId, name: 'shareittoo-staging-api' });
    assert((await read(candidateId)).Name === activeName, 'candidate_canonical_readback');
    await verifyNetworkMembers(true);
    const gateway = await dependencies.gatewayReadback({ expectedCommit: validated.runtimeCommit, expectedImageDigest: validated.imageDigest,
      expectedTechnicalSandbox: true, timeoutMs: 5000 });
    assert(gateway?.versionCommit === validated.runtimeCommit && gateway?.imageDigest === validated.imageDigest
      && gateway?.technicalSandbox?.available === true && gateway?.technicalSandbox?.provider === 'stripe'
      && gateway?.technicalSandbox?.mode === 'test' && gateway?.technicalSandbox?.amountMinor === 100
      && gateway?.technicalSandbox?.currency === 'EUR' && gateway?.technicalSandbox?.syntheticOnly === true
      && gateway?.technicalSandbox?.liveMoney === false && gateway?.technicalSandbox?.bookingEffects === false
      && gateway?.technicalSandbox?.ledgerEffects === false && gateway?.technicalSandbox?.connectEffects === false
      && gateway?.technicalSandbox?.payoutEffects === false && gateway?.technicalSandbox?.notificationEffects === false
      && gateway?.technicalSandbox?.marketplaceStripe === false && gateway?.paymentTransport === 'memory', 'gateway_readback');
    await stoppedSourceCas(oldName); await verifyCandidate('shareittoo-staging-api', true); await verifyNetworkMembers(true);
    const receipt = { kind: phase === 'rehearse' ? 'sit-technical-sandbox-106-activation-rehearsal' : 'sit-technical-sandbox-106-activation-promotion', schemaVersion: 1,
      status: 'passed', runId, phase, createdAt: new Date(now()).toISOString(), sourceId: canonical.Id,
      candidateId, runtimeCommit: validated.runtimeCommit, imageDigest: validated.imageDigest,
      canonicalSnapshotSha256,
      promotionReceiptSha256: validated.promotionReceiptSha256, authorizationReceiptSha256: validated.authorizationReceiptSha256,
      evidenceSha256, rollbackReceiptSha256: validated.rollbackReceiptSha256, localReadbackSha256: sha256(canonicalJson(local)),
      gatewayReadbackSha256: sha256(canonicalJson(gateway)), rehearsalSha256: phase === 'promote' ? rehearsalSha256 : null,
      oneActiveRuntime: true, oldRuntimeStopped: true, oldRuntimeId: sourceSnapshot.Id,
      productionTargetAllowed: false, mutationPerformed: true };
    if (phase === 'rehearse') {
      const restored = await restore(); sourceRestored = true; candidateRemoved = restored.candidateRemoved; publicDisabledVerified = true;
      receipt.rollbackVerified = restored.rollbackVerified;
      assert(receipt.rollbackVerified === true, 'rehearsal_rollback');
    }
    const stored = await dependencies.writeReceipt({ runId, type: phase === 'rehearse' ? 'rehearsal' : 'promotion', receipt });
    assert(hash(stored?.sha256), 'sealed_receipt_write');
    const sealed = { ...receipt, sha256: stored.sha256, exitCode: 0 };
    if (phase === 'rehearse') await dependencies.releaseLock(lock);
    return Object.freeze(sealed);
  } catch (error) { failure = error; }
  try {
    const restored = await restore(); sourceRestored = true; candidateRemoved = restored.candidateRemoved;
    publicDisabledVerified = true; rollbackVerified = restored.rollbackVerified && candidateRemoved;
  } catch { /* Keep lock and failure evidence when recovery is uncertain. */ }
  const outcome = { kind: 'sit-technical-sandbox-106-activation-failure', schemaVersion: 1,
    status: rollbackVerified ? 'activation_rolled_back' : 'recovery_required', runId, phase, stage,
    canonicalSnapshotSha256,
    sourceId: canonical.Id, candidateId, sourceRestored, candidateRemoved, publicDisabledVerified,
    lockRetained: !rollbackVerified, errorCode: failure?.code ?? 'activation_failed', errorType: ['Error','TypeError','RangeError'].includes(failure?.name) ? failure.name : 'Error',
    exitCode: rollbackVerified ? 2 : 3, productionTargetAllowed: false, mutationPerformed: true };
  let failureReceiptStored = false;
  try { failureReceiptStored = hash((await dependencies.writeReceipt({ runId, type: 'failure', receipt: outcome }))?.sha256); } catch { /* Retain lock on write failure. */ }
  if (rollbackVerified && failureReceiptStored) await dependencies.releaseLock(lock);
  else if (rollbackVerified) { outcome.status = 'recovery_required'; outcome.exitCode = 3; outcome.lockRetained = true; }
  return Object.freeze(outcome);
}

export function technicalSandbox106Confirmation({ phase, sourceId, runtimeCommit, imageDigest, evidenceSha256, rehearsalSha256 }) {
  if (phase === 'rehearse') {
    assert(hash(evidenceSha256) && /^[a-f0-9]{64}$/u.test(sourceId) && /^[a-f0-9]{40}$/u.test(runtimeCommit), 'confirmation_arguments');
    return `rehearse:${sourceId}:${runtimeCommit}:${imageDigest}:${evidenceSha256}`;
  }
  assert(phase === 'promote' && hash(evidenceSha256) && hash(rehearsalSha256)
    && /^[a-f0-9]{64}$/u.test(sourceId) && /^[a-f0-9]{40}$/u.test(runtimeCommit), 'confirmation_arguments');
  return `promote:${sourceId}:${runtimeCommit}:${imageDigest}:${evidenceSha256}:${rehearsalSha256}`;
}

/** Protected receipt/lock store following the Green 106→106 artifact rules. */
export function technicalSandbox106EvidenceStore(directory) {
  const handle = privateDirectory(directory);
  const locks = new Map();
  return Object.freeze({
    acquireLock({ runId, canonicalId, canonicalSnapshotSha256, evidenceSha256, imageDigest, promotionReceiptSha256, rehearsalSha256 }) {
      assert(/^[0-9a-f-]{36}$/u.test(runId) && /^[a-f0-9]{64}$/u.test(canonicalId)
        && hash(canonicalSnapshotSha256) && hash(evidenceSha256) && /^sha256:[a-f0-9]{64}$/u.test(imageDigest)
        && hash(promotionReceiptSha256) && (rehearsalSha256 == null || hash(rehearsalSha256)), 'lock_binding');
      const artifact = exclusiveArtifact(handle, `${runId}.technical-sandbox.lock.json`);
      fs.writeFileSync(artifact.fd, `${JSON.stringify({ kind: 'sit-technical-sandbox-106-activation-lock', schemaVersion: 1,
        runId, canonicalId, canonicalSnapshotSha256, imageDigest, promotionReceiptSha256, evidenceSha256, rehearsalSha256 })}\n`);
      fs.fsyncSync(artifact.fd); locks.set(runId, artifact); return Object.freeze({ runId, artifact });
    },
    writeReceipt({ runId, type, receipt }) {
      assert(/^[0-9a-f-]{36}$/u.test(runId) && ['rehearsal','promotion','failure'].includes(type)
        && receipt?.runId === runId, 'receipt_binding');
      return writeArtifact(handle, `${runId}.technical-sandbox.${type}.json`, receipt);
    },
    releaseLock(lock) {
      const artifact = locks.get(lock?.runId);
      assert(artifact && artifact === lock.artifact && artifact.fd >= 0, 'lock_identity');
      const opened = fs.fstatSync(artifact.fd, { bigint: true });
      const pathInfo = fs.lstatSync(artifact.filename, { bigint: true });
      assert(opened.dev === pathInfo.dev && opened.ino === pathInfo.ino && opened.uid === BigInt(process.getuid())
        && opened.nlink === 1n && (opened.mode & 0o7777n) === 0o600n, 'lock_drift');
      closeArtifact(artifact); fs.unlinkSync(artifact.filename); locks.delete(lock.runId);
    },
  });
}
