import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateStagingListingAiActivationReceipt } from './staging_listing_ai_activation_receipt.mjs';

const ORIGIN = 'https://staging.shareittoo.com';
const API = `${ORIGIN}/api/v1`;
const CAPABILITY_PATH = '/blue-ocean/listing-drafts/capabilities';
const AUTH_ME_PATH = '/auth/me';
const CLIENT_VERSION = '1.0.0+2026092905';
export const STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS = Object.freeze([
  'backend/ops/staging_listing_ai_activation_receipt.mjs',
  'backend/ops/staging_listing_ai_capability_collector_v2.mjs',
  'backend/ops/staging_listing_ai_capability_cli_v2.mjs',
]);
const deny = () => { throw new Error('staging_listing_ai_capability_not_verified'); };
const check = (condition) => { if (!condition) deny(); };
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const isCommit = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : plain(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;

function validateRuntime(runtime, activation) {
  check(exact(runtime, ['containerId', 'containerName', 'running', 'green', 'runtimeCommit', 'imageId', 'repoDigest'])
    && runtime.containerId === activation.canonicalContainerId
    && runtime.containerName === '/shareittoo-staging-api' && runtime.running === true && runtime.green === true
    && runtime.runtimeCommit === activation.runtimeCommit && runtime.imageId === activation.imageId
    && runtime.repoDigest === activation.repoDigest
    && /^[a-f0-9]{64}$/u.test(runtime.containerId) && isCommit(runtime.runtimeCommit)
    && /^sha256:[a-f0-9]{64}$/u.test(runtime.imageId)
    && /^ghcr\.io\/shareittoo\/shareittoo-api@sha256:[a-f0-9]{64}$/u.test(runtime.repoDigest));
  return runtime;
}

function validateActivation(activation, now) {
  check(exact(activation, ['schemaVersion', 'kind', 'status', 'environment', 'canonicalContainerId',
    'canonicalContainerName', 'runtimeCommit', 'imageId', 'repoDigest', 'greenPromotionReceiptSha256',
    'deploymentReportSha256', 'providerConfiguration', 'providerConfigurationSha256',
    'healthReadbackSha256', 'secretMetadataReceiptSha256', 'recordedAtUtc', 'rollbackTarget'])
    && activation.schemaVersion === 1 && activation.kind === 'sit-staging-listing-ai-external-activation'
    && activation.status === 'verified' && activation.environment === 'staging'
    && activation.canonicalContainerName === '/shareittoo-staging-api'
    && activation.providerConfiguration?.provider === 'openai'
    && activation.providerConfiguration?.model === 'gpt-4o-mini-2024-07-18'
    && activation.providerConfiguration?.promptVersion === 'listing-ai-prompt-v1'
    && activation.providerConfiguration?.schemaVersion === 'listing-ai-draft-v1'
    && Number.isSafeInteger(activation.providerConfiguration?.budgetCents)
    && activation.providerConfiguration.budgetCents >= 2 && activation.providerConfiguration.budgetCents <= 500
    && activation.providerConfiguration?.externalProviderExecutionAllowed === true
    && activation.providerConfiguration?.automaticPublicationAllowed === false
    && ['greenPromotionReceiptSha256', 'deploymentReportSha256', 'providerConfigurationSha256',
      'healthReadbackSha256', 'secretMetadataReceiptSha256'].every((key) => isHash(activation[key])));
  const at = Date.parse(activation.recordedAtUtc);
  check(Number.isFinite(at) && new Date(at).toISOString() === activation.recordedAtUtc
    && now >= at && now - at <= 60 * 60_000);
  return activation;
}

function validateCapability(body) {
  check(exact(body, ['available', 'provider', 'mode', 'disclosureVersion', 'disclosureText', 'disclosureHash',
    'policyRevision', 'configRevision', 'supportedClientVersion', 'imageLimit'])
    && body.available === true && body.provider === 'openai' && body.mode === 'external'
    && body.supportedClientVersion === CLIENT_VERSION && Number.isSafeInteger(body.imageLimit)
    && body.imageLimit > 0 && body.imageLimit <= 4
    && typeof body.disclosureVersion === 'string' && body.disclosureVersion.length > 0
    && typeof body.disclosureText === 'string' && body.disclosureText.length > 0
    && isHash(body.disclosureHash) && sha(body.disclosureText) === body.disclosureHash
    && body.policyRevision === 'listing-ai-policy-v1'
    && isHash(body.configRevision));
  return Object.freeze({ available: true, provider: body.provider, mode: body.mode,
    supportedClientVersion: body.supportedClientVersion, imageLimit: body.imageLimit,
    disclosureVersion: body.disclosureVersion, disclosureHash: body.disclosureHash,
    configRevision: body.configRevision, policyRevision: body.policyRevision });
}

export function createStagingListingAiCapabilityCollectorV2({ token, expectedUserId, activationReceiptBytes,
  activationReceiptReader = () => activationReceiptBytes,
  runtimeReader, fetchImpl = globalThis.fetch, now = Date.now, sourceCommit, clientVersion, sourceInventory } = {}) {
  check(typeof token === 'string' && /^[\x21-\x7e]{16,8192}$/u.test(token)
    && typeof expectedUserId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/u.test(expectedUserId)
    && Buffer.isBuffer(activationReceiptBytes) && activationReceiptBytes.length > 1
    && typeof runtimeReader === 'function' && typeof fetchImpl === 'function' && typeof now === 'function'
    && isCommit(sourceCommit) && clientVersion === CLIENT_VERSION && typeof activationReceiptReader === 'function'
    && Array.isArray(sourceInventory) && sourceInventory.length === STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS.length
    && sourceInventory.every((entry) => exact(entry, ['relativePath', 'sourceCommit', 'sha256'])
      && isCommit(entry.sourceCommit) && entry.sourceCommit === sourceCommit && isHash(entry.sha256)
      && typeof entry.relativePath === 'string' && entry.relativePath.startsWith('backend/ops/'))
    && JSON.stringify(sourceInventory.map((entry) => entry.relativePath)
      .sort()) === JSON.stringify([...STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS].sort()));
  let activation;
  try { activation = JSON.parse(activationReceiptBytes.toString('utf8')); } catch { deny(); }
  try { validateStagingListingAiActivationReceipt(activation, { now: now() }); } catch { deny(); }
  validateActivation(activation, now());
  const activationReceiptSha256 = sha(activationReceiptBytes);
  const expectedRuntime = Object.freeze({ containerId: activation.canonicalContainerId,
    containerName: activation.canonicalContainerName, running: true, green: true,
    runtimeCommit: activation.runtimeCommit, imageId: activation.imageId, repoDigest: activation.repoDigest });
  const fence = () => check(JSON.stringify(validateRuntime(runtimeReader(), activation)) === JSON.stringify(expectedRuntime));

  async function get(route) {
    check(route === AUTH_ME_PATH || route === CAPABILITY_PATH);
    fence();
    const url = `${API}${route}`;
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000) });
      check(response?.status === 200 && typeof response.text === 'function');
      const text = await response.text();
      check(Buffer.byteLength(text) <= 32768 && !text.includes(token));
      const value = JSON.parse(text);
      check(plain(value));
      fence();
      return { value, status: response.status, responseSha256: sha(JSON.stringify(canonical(value))) };
    } catch { deny(); }
  }

  return Object.freeze({ async collect() {
    const startedAt = now();
    const identityBefore = await get(AUTH_ME_PATH);
    check(exact(identityBefore.value, ['user']) && plain(identityBefore.value.user)
      && identityBefore.value.user.id === expectedUserId
      && identityBefore.value.user.deactivatedAt == null);
    const capabilityResult = await get(CAPABILITY_PATH);
    const capability = validateCapability(capabilityResult.value);
    const identityAfter = await get(AUTH_ME_PATH);
    check(exact(identityAfter.value, ['user']) && plain(identityAfter.value.user)
      && identityAfter.value.user.id === expectedUserId
      && identityAfter.value.user.deactivatedAt == null
      && identityBefore.responseSha256 === identityAfter.responseSha256);
    fence();
    const finalActivationBytes = activationReceiptReader();
    check(Buffer.isBuffer(finalActivationBytes) && sha(finalActivationBytes) === activationReceiptSha256);
    const finalNow = now();
    try { validateStagingListingAiActivationReceipt(activation, { now: finalNow }); } catch { deny(); }
    validateActivation(activation, finalNow);
    validateRuntime(runtimeReader(), activation);
    const collectedAtUtc = new Date(Math.floor(finalNow / 1000) * 1000).toISOString();
    const validUntilUtc = new Date(Math.min(Date.parse(activation.recordedAtUtc) + 60 * 60_000,
      Date.parse(collectedAtUtc) + 60 * 60_000)).toISOString();
    check(finalNow < Date.parse(validUntilUtc));
    const evidence = {
      schemaVersion: 1, kind: 'sit-staging-listing-ai-capability-candidate-v2', status: 'pending-independent-review',
      syntheticFixture: false, sourceCommit, sourceInventory, sourceInventorySha256: sha(JSON.stringify(canonical(sourceInventory))),
      activationReceiptSha256, runtime: expectedRuntime,
      configuration: activation.providerConfiguration,
      configurationSha256: activation.providerConfigurationSha256,
      capability, capabilitySha256: sha(JSON.stringify(canonical(capability))),
      authenticatedUserSha256: sha(identityBefore.value.user.id),
      authMeReadbackSha256: identityBefore.responseSha256, capabilityResponseSha256: capabilityResult.responseSha256,
      authMeRepeatReadbackSha256: identityAfter.responseSha256,
      collectedAtUtc, validUntilUtc,
    };
    check(now() >= startedAt && now() - startedAt <= 60 * 60_000);
    const bytes = Buffer.from(`${JSON.stringify(evidence)}\n`);
    check(!bytes.includes(Buffer.from(token)));
    return Object.freeze({ evidence: Object.freeze(evidence), bytes, sha256: sha(bytes) });
  } });
}

export function readStagingListingAiSessionToken(filePath, repositoryRoot) {
  check(!filePath.startsWith(`${repositoryRoot}${path.sep}`));
  const bytes = readStableProtectedFile(filePath, { repositoryRoot,
    allowedUids: [process.getuid()], maxBytes: 8192, exactMode: 0o600 });
  try {
    const token = bytes.toString('utf8').trim(); bytes.fill(0);
    check(/^[\x21-\x7e]{16,8192}$/u.test(token));
    return token;
  } catch { bytes.fill(0); deny(); }
}

export function readStableProtectedFile(filePath, { repositoryRoot = '', allowedUids = [process.getuid()],
  maxBytes = 131072, exactMode = 0o600, afterOpen = () => {} } = {}) {
  check(typeof filePath === 'string' && path.isAbsolute(filePath) && path.normalize(filePath) === filePath
    && (repositoryRoot === '' || !filePath.startsWith(`${repositoryRoot}${path.sep}`))
    && Number.isSafeInteger(maxBytes) && maxBytes > 0 && typeof afterOpen === 'function');
  const parents = openStableParents(filePath, true);
  let fd;
  try {
    assertParentsStable(parents);
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      | fs.constants.O_CLOEXEC | fs.constants.O_NONBLOCK);
    afterOpen(fd, parents);
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.nlink === 1n && allowedUids.includes(Number(before.uid))
      && (before.mode & 0o7777n) === BigInt(exactMode) && before.size >= 2n && before.size <= BigInt(maxBytes));
    assertPathMatches(filePath, before); assertParentsStable(parents);
    const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0);
    assertFileStable(filePath, fd, before); assertParentsStable(parents);
    return bytes;
  } catch { deny(); }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { deny(); } closeParents(parents); }
}

export function readStableSourceFile(filePath, { afterOpen = () => {}, maxBytes = 1024 * 1024 } = {}) {
  check(typeof filePath === 'string' && path.isAbsolute(filePath) && path.normalize(filePath) === filePath
    && typeof afterOpen === 'function' && Number.isSafeInteger(maxBytes) && maxBytes > 0);
  const parents = openStableParents(filePath, false);
  let fd;
  try {
    assertParentsStable(parents);
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      | fs.constants.O_CLOEXEC | fs.constants.O_NONBLOCK);
    afterOpen(fd, parents);
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.nlink === 1n && (before.mode & 0o022n) === 0n
      && (before.uid === BigInt(process.getuid()) || before.uid === 0n)
      && before.size >= 1n && before.size <= BigInt(maxBytes));
    assertPathMatches(filePath, before); assertParentsStable(parents);
    const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0);
    assertFileStable(filePath, fd, before); assertParentsStable(parents);
    return bytes;
  } catch { deny(); }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { deny(); } closeParents(parents); }
}

export function writeStagingListingAiCapabilityCandidate({ directory, fileName, bytes,
  beforePublish = () => {}, afterPublish = () => {} }) {
  check(typeof directory === 'string' && path.isAbsolute(directory) && path.normalize(directory) === directory
    && typeof fileName === 'string' && /^staging-listing-ai-capability-[a-z0-9][a-z0-9-]{0,63}\.json$/u.test(fileName)
    && Buffer.isBuffer(bytes) && bytes.length > 1);
  let fd; let tempPath; let published = false;
  const file = path.join(directory, fileName);
  const parents = openStableParents(path.join(directory, 'candidate.json'));
  try {
    assertParentsStable(parents);
    const base = path.basename(file);
    tempPath = path.join(directory, `.${base}.${process.pid}.${crypto.randomBytes(10).toString('hex')}.tmp`);
    fd = fs.openSync(tempPath, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL
      | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC, 0o600);
    const stat = fs.fstatSync(fd, { bigint: true });
    check(stat.isFile() && stat.uid === BigInt(process.getuid()) && stat.nlink === 1n
      && (stat.mode & 0o7777n) === 0o600n && stat.size === 0n);
    assertPathMatches(tempPath, stat); assertParentsStable(parents);
    let offset = 0; while (offset < bytes.length) { const n = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    fs.fsyncSync(fd); assertFileStable(tempPath, fd, fs.fstatSync(fd, { bigint: true })); assertParentsStable(parents);
    beforePublish(); assertParentsStable(parents);
    fs.linkSync(tempPath, file); published = true;
    assertParentsStable(parents); afterPublish(); assertParentsStable(parents);
    check(fs.fstatSync(fd, { bigint: true }).nlink === 2n);
    assertPathMatches(file, fs.fstatSync(fd, { bigint: true })); assertParentsStable(parents);
    const readback = Buffer.alloc(bytes.length); offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, readback, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    check(readback.equals(bytes)); fs.fsyncSync(parents.at(-1).fd);
    assertPathMatches(tempPath, fs.fstatSync(fd, { bigint: true })); assertParentsStable(parents);
    fs.unlinkSync(tempPath); tempPath = undefined; assertParentsStable(parents);
    const finalStat = fs.fstatSync(fd, { bigint: true });
    check(finalStat.nlink === 1n && finalStat.size === BigInt(bytes.length));
    assertFileStable(file, fd, finalStat); assertParentsStable(parents); fs.fsyncSync(parents.at(-1).fd);
    return Object.freeze({ file, bytes: bytes.length, sha256: sha(readback), mode: '0600' });
  } catch (error) {
    if (fd !== undefined) {
      try {
        const own = fs.fstatSync(fd, { bigint: true });
        for (const candidate of [published ? file : null, tempPath]) {
          if (!candidate) continue;
          try { assertSameInode(candidate, own); fs.unlinkSync(candidate); } catch { /* preserve foreign or replaced paths */ }
        }
      } catch { /* preserve paths unless the open descriptor proves ownership */ }
    }
    throw new Error('staging_listing_ai_capability_candidate_write_failed');
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* sanitized failure path */ }
    closeParents(parents);
  }
}

function openStableParents(filePath, protectedRoot) {
  const directory = path.dirname(filePath), descriptors = [];
  const entries = [];
  try {
    let current = '/';
    const parts = directory.split('/').filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      current = path.join(current, parts[index]);
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
        | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC | fs.constants.O_NONBLOCK);
      descriptors.push(fd);
      const stat = fs.fstatSync(fd, { bigint: true });
      const isProtectedRoot = protectedRoot && index === parts.length - 1;
      check(stat.isDirectory() && sameDirectory(stat, fs.lstatSync(current, { bigint: true }), isProtectedRoot));
      entries.push({ path: current, fd, stat, protectedRoot: isProtectedRoot });
    }
    if (protectedRoot) {
      const root = entries.at(-1).stat;
      check(root.uid === BigInt(process.getuid()) && (root.mode & 0o7777n) === 0o700n);
    }
    return entries;
  } catch { for (const fd of descriptors.reverse()) try { fs.closeSync(fd); } catch { /* sanitized */ } deny(); }
}
function sameDirectory(left, right, protectedRoot) {
  const keys = protectedRoot ? ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink'] : ['dev', 'ino', 'mode', 'uid', 'gid'];
  return left.isDirectory() && right.isDirectory() && keys.every((key) => left[key] === right[key]);
}
function assertParentsStable(parents) {
  for (const entry of parents) check(sameDirectory(fs.fstatSync(entry.fd, { bigint: true }),
    fs.lstatSync(entry.path, { bigint: true }), entry.protectedRoot));
}
function closeParents(parents) { for (const entry of [...parents].reverse()) try { fs.closeSync(entry.fd); } catch { /* sanitized */ } }
function assertPathMatches(file, openedStat) {
  const linked = fs.lstatSync(file, { bigint: true });
  check(linked.isFile() && linked.dev === openedStat.dev && linked.ino === openedStat.ino
    && linked.uid === openedStat.uid && linked.gid === openedStat.gid && linked.mode === openedStat.mode
    && linked.nlink === openedStat.nlink);
}
function assertSameInode(file, openedStat) {
  const linked = fs.lstatSync(file, { bigint: true });
  check(linked.isFile() && linked.dev === openedStat.dev && linked.ino === openedStat.ino
    && linked.uid === openedStat.uid && linked.gid === openedStat.gid && linked.mode === openedStat.mode
    && linked.nlink >= 1n);
}
function assertFileStable(file, fd, original) {
  const current = fs.fstatSync(fd, { bigint: true });
  check(['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => current[key] === original[key]));
  assertPathMatches(file, current);
}
