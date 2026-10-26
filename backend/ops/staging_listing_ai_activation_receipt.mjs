import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const deny = () => { throw new Error('staging_listing_ai_activation_receipt_invalid'); };
const check = (value) => { if (!value) deny(); };
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const commit = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');

const receiptKeys = ['schemaVersion', 'kind', 'status', 'environment', 'canonicalContainerId',
  'canonicalContainerName', 'runtimeCommit', 'imageId', 'repoDigest', 'greenPromotionReceiptSha256',
  'deploymentReportSha256', 'providerConfiguration', 'providerConfigurationSha256',
  'healthReadbackSha256', 'secretMetadataReceiptSha256',
  'recordedAtUtc', 'rollbackTarget'];
const configKeys = ['provider', 'model', 'promptVersion', 'schemaVersion', 'budgetCents',
  'budgetScope', 'stagingSmokeBudgetCents', 'stagingSmokeActivationId', 'runMaxProviderCalls',
  'externalProviderExecutionAllowed', 'automaticPublicationAllowed'];
const rollbackKeys = ['containerId', 'containerName', 'imageId', 'runtimeCommit'];

export function validateStagingListingAiActivationReceipt(receipt, expected = {}) {
  check(exact(receipt, receiptKeys) && receipt.schemaVersion === 1
    && receipt.kind === 'sit-staging-listing-ai-external-activation' && receipt.status === 'verified'
    && receipt.environment === 'staging' && /^[a-f0-9]{64}$/u.test(receipt.canonicalContainerId)
    && receipt.canonicalContainerName === '/shareittoo-staging-api' && commit(receipt.runtimeCommit)
    && /^sha256:[a-f0-9]{64}$/u.test(receipt.imageId)
    && /^ghcr\.io\/shareittoo\/shareittoo-api@sha256:[a-f0-9]{64}$/u.test(receipt.repoDigest)
    && [receipt.greenPromotionReceiptSha256, receipt.deploymentReportSha256,
      receipt.providerConfigurationSha256, receipt.healthReadbackSha256,
      receipt.secretMetadataReceiptSha256].every(hash)
    && exact(receipt.providerConfiguration, configKeys)
    && receipt.providerConfiguration.provider === 'openai'
    && receipt.providerConfiguration.model === 'gpt-4o-mini-2024-07-18'
    && receipt.providerConfiguration.promptVersion === 'listing-ai-prompt-v1'
    && receipt.providerConfiguration.schemaVersion === 'listing-ai-draft-v1'
    && Number.isSafeInteger(receipt.providerConfiguration.budgetCents)
    && receipt.providerConfiguration.budgetCents === 10_000
    && receipt.providerConfiguration.budgetScope === 'lifetime'
    && Number.isSafeInteger(receipt.providerConfiguration.stagingSmokeBudgetCents)
    && receipt.providerConfiguration.stagingSmokeBudgetCents >= 4
    && receipt.providerConfiguration.stagingSmokeBudgetCents <= 500
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(receipt.providerConfiguration.stagingSmokeActivationId)
    && receipt.providerConfiguration.runMaxProviderCalls === 5
    && receipt.providerConfiguration.externalProviderExecutionAllowed === true
    && receipt.providerConfiguration.automaticPublicationAllowed === false
    && exact(receipt.rollbackTarget, rollbackKeys)
    && /^[a-f0-9]{64}$/u.test(receipt.rollbackTarget.containerId)
    && receipt.rollbackTarget.containerName === '/shareittoo-staging-api'
    && /^sha256:[a-f0-9]{64}$/u.test(receipt.rollbackTarget.imageId)
    && commit(receipt.rollbackTarget.runtimeCommit)
    && receipt.canonicalContainerId !== receipt.rollbackTarget.containerId, 'receipt_shape');
  const time = Date.parse(receipt.recordedAtUtc);
  check(Number.isFinite(time) && new Date(time).toISOString() === receipt.recordedAtUtc
    && (!expected.now || time <= expected.now && expected.now - time <= 60 * 60_000), 'receipt_time');
  for (const key of ['canonicalContainerId', 'runtimeCommit', 'imageId', 'repoDigest', 'deploymentReportSha256', 'greenPromotionReceiptSha256']) {
    if (expected[key] !== undefined) check(receipt[key] === expected[key], `receipt_${key}`);
  }
  check(sha(JSON.stringify(receipt.providerConfiguration)) === receipt.providerConfigurationSha256,
    'receipt_configuration_digest');
  return receipt;
}

function readRaw(file) {
  check(path.isAbsolute(file) && path.normalize(file) === file && fs.realpathSync(file) === file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
  try {
    const before = fs.fstatSync(fd);
    check(before.isFile() && before.nlink === 1 && before.size > 1 && before.size <= 131072
      && (before.uid === 0 || before.uid === process.getuid()) && (before.mode & 0o777) === 0o600);
    const linked = fs.lstatSync(file);
    check(linked.dev === before.dev && linked.ino === before.ino && linked.nlink === 1);
    const bytes = Buffer.alloc(before.size); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0); offset += count; }
    const after = fs.fstatSync(fd);
    const linkedAfter = fs.lstatSync(file);
    check(before.dev === after.dev && before.ino === after.ino && before.size === after.size
      && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs
      && linkedAfter.dev === after.dev && linkedAfter.ino === after.ino
      && linkedAfter.size === after.size && linkedAfter.mtimeMs === after.mtimeMs
      && linkedAfter.ctimeMs === after.ctimeMs);
    return bytes;
  } finally { fs.closeSync(fd); }
}

export function composeStagingListingAiActivationReceipt({ runtime, rollbackTarget, greenPromotionReceiptBytes,
  deploymentReportBytes, healthReadbackBytes, secretMetadataReceipt, recordedAtUtc }) {
  check(Buffer.isBuffer(greenPromotionReceiptBytes) && Buffer.isBuffer(deploymentReportBytes)
    && Buffer.isBuffer(healthReadbackBytes) && exact(runtime, ['containerId', 'containerName', 'running',
      'green', 'runtimeCommit', 'imageId', 'repoDigest']) && runtime.running === true && runtime.green === true
    && /^[a-f0-9]{64}$/u.test(runtime.containerId)
    && runtime.containerId !== rollbackTarget?.containerId
    && runtime.containerName === '/shareittoo-staging-api' && commit(runtime.runtimeCommit)
    && /^sha256:[a-f0-9]{64}$/u.test(runtime.imageId)
    && /^ghcr\.io\/shareittoo\/shareittoo-api@sha256:[a-f0-9]{64}$/u.test(runtime.repoDigest)
    && exact(rollbackTarget, rollbackKeys) && exact(secretMetadataReceipt,
      ['fileMode', 'fileSize', 'credentialPresent', 'ownerUid', 'groupGid'])
    && ((secretMetadataReceipt.fileMode === 0o640 && secretMetadataReceipt.ownerUid === 0
      && secretMetadataReceipt.groupGid === 65532)
      || (secretMetadataReceipt.fileMode === 0o600
        && (secretMetadataReceipt.ownerUid === 0 || secretMetadataReceipt.ownerUid === process.getuid())))
    && Number.isSafeInteger(secretMetadataReceipt.fileSize) && secretMetadataReceipt.fileSize >= 20
    && secretMetadataReceipt.fileSize <= 512 && secretMetadataReceipt.credentialPresent === true);
  let green, report, health;
  try {
    green = JSON.parse(greenPromotionReceiptBytes.toString('utf8'));
    report = JSON.parse(deploymentReportBytes.toString('utf8'));
    health = JSON.parse(healthReadbackBytes.toString('utf8'));
  } catch { deny(); }
  check(green?.kind === 'sit-green-staging-106-106-promotion' && green.schemaVersion === 2
    && green.status === 'promoted_owner_smoke_pending' && green.ownerSmokePassed === false
    && green.publicReleaseComplete === false && green.runtimeCommit === rollbackTarget.runtimeCommit
    && rollbackTarget.runtimeCommit === runtime.runtimeCommit
    && green.candidateId === rollbackTarget.containerId
    && green.runtimeCommit === runtime.runtimeCommit
    && report?.environment === 'staging' && report.stagingListingAi === true
    && report.commit === runtime.runtimeCommit
    && health?.checks?.listingAi?.status === 'enabled'
    && health.checks.listingAi.provider === 'openai'
    && health.checks.listingAi.model === 'gpt-4o-mini-2024-07-18'
    && health.checks.listingAi.promptVersion === 'listing-ai-prompt-v1'
    && health.checks.listingAi.schemaVersion === 'listing-ai-draft-v1'
    && Number.isSafeInteger(health.checks.listingAi.budgetCents)
    && health.checks.listingAi.budgetCents === 10_000
    && health.checks.listingAi.budgetScope === 'lifetime'
    && Number.isSafeInteger(health.checks.listingAi.stagingSmokeBudgetCents)
    && health.checks.listingAi.stagingSmokeBudgetCents >= 4
    && health.checks.listingAi.stagingSmokeBudgetCents <= 500
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(health.checks.listingAi.stagingSmokeActivationId)
    && health.checks.listingAi.runMaxProviderCalls === 5
    && health.checks.listingAi.externalProviderExecutionAllowed === true
    && health.checks.listingAi.automaticPublicationAllowed === false, 'readback_mismatch');
  const providerConfiguration = Object.fromEntries(configKeys.map((key) => [key,
    key === 'schemaVersion' ? health.checks.listingAi.schemaVersion : health.checks.listingAi[key]]));
  const value = {
    schemaVersion: 1, kind: 'sit-staging-listing-ai-external-activation', status: 'verified',
    environment: 'staging', canonicalContainerId: runtime.containerId,
    canonicalContainerName: runtime.containerName, runtimeCommit: runtime.runtimeCommit,
    imageId: runtime.imageId, repoDigest: runtime.repoDigest,
    greenPromotionReceiptSha256: sha(greenPromotionReceiptBytes),
    deploymentReportSha256: sha(deploymentReportBytes), providerConfiguration,
    providerConfigurationSha256: sha(JSON.stringify(providerConfiguration)),
    healthReadbackSha256: sha(healthReadbackBytes),
    secretMetadataReceiptSha256: sha(JSON.stringify(secretMetadataReceipt)),
    recordedAtUtc: recordedAtUtc ?? new Date().toISOString(), rollbackTarget,
  };
  return validateStagingListingAiActivationReceipt(value);
}

export function writeStagingListingAiActivationReceipt({ directory, runId, receipt, now = Date.now(),
  beforeWrite = () => {}, afterWrite = () => {} }) {
  const filename = `staging-listing-ai-activation-${runId}.json`;
  const file = path.join(directory, filename); const fds = []; let fd; let created = false;
  const checkStable = (records) => records.forEach(({ path: p, fd: d, stat }) => {
    const current = fs.fstatSync(d, { bigint: true }), linked = fs.lstatSync(p, { bigint: true });
    check(['dev', 'ino', 'mode', 'uid', 'gid'].every((k) => current[k] === stat[k] && linked[k] === stat[k]));
  });
  try {
    check(path.isAbsolute(directory) && path.normalize(directory) === directory
      && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(runId));
    let currentPath = '/'; const dirs = [];
    for (const part of directory.split('/').filter(Boolean)) {
      currentPath = path.join(currentPath, part);
      const d = fs.openSync(currentPath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      fds.push(d); const stat = fs.fstatSync(d, { bigint: true }); check(stat.isDirectory());
      dirs.push({ path: currentPath, fd: d, stat });
    }
    const parent = dirs.at(-1).stat;
    check(parent.uid === BigInt(process.getuid()) && (parent.mode & 0o7777n) === 0o700n);
    checkStable(dirs);
    const bytes = Buffer.from(`${JSON.stringify(validateStagingListingAiActivationReceipt(receipt, { now }))}\n`);
    beforeWrite();
    fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    created = true;
    fds.push(fd); const stat = fs.fstatSync(fd, { bigint: true });
    const output = { path: file, fd, stat };
    check(stat.isFile() && stat.uid === BigInt(process.getuid()) && stat.nlink === 1n
      && (stat.mode & 0o7777n) === 0o600n && stat.size === 0n);
    checkStable([...dirs, output]);
    let offset = 0; while (offset < bytes.length) { const n = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    fs.fsyncSync(fd); checkStable([...dirs, output]);
    const readback = Buffer.alloc(bytes.length); offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, readback, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    const beforeReadback = fs.fstatSync(fd, { bigint: true });
    const linkedReadback = fs.lstatSync(file, { bigint: true });
    check(readback.equals(bytes) && beforeReadback.size === BigInt(bytes.length)
      && ['dev', 'ino', 'mode', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs']
        .every((key) => beforeReadback[key] === linkedReadback[key]));
    fs.fsyncSync(dirs.at(-1).fd); checkStable([...dirs, output]);
    afterWrite();
    return { path: file, sha256: sha(readback), bytes: readback.length, mode: '0600' };
  } catch {
    if (created && fd !== undefined) {
      try {
        const opened = fs.fstatSync(fd, { bigint: true }), linked = fs.lstatSync(file, { bigint: true });
        if (opened.isFile() && linked.isFile() && opened.dev === linked.dev && opened.ino === linked.ino
            && opened.nlink === 1n && linked.nlink === 1n && opened.uid === BigInt(process.getuid())
            && linked.uid === opened.uid) fs.unlinkSync(file);
      } catch { /* never remove a file unless its inode still matches our descriptor */ }
    }
    throw new Error('staging_listing_ai_activation_receipt_write_failed');
  }
  finally { for (const descriptor of fds.reverse()) try { fs.closeSync(descriptor); } catch { /* preserve primary failure */ } }
}

export function createStagingListingAiActivationReceiptFromFiles({ greenPromotionReceiptFile,
  deploymentReportFile, healthReadbackFile, runtime, rollbackTarget, secretMetadataReceipt,
  recordedAtUtc, fence = () => {} }) {
  fence(); const green = readRaw(greenPromotionReceiptFile); fence();
  const report = readRaw(deploymentReportFile); fence();
  const health = readRaw(healthReadbackFile); fence();
  try { return composeStagingListingAiActivationReceipt({ runtime, rollbackTarget,
    greenPromotionReceiptBytes: green, deploymentReportBytes: report, healthReadbackBytes: health,
    secretMetadataReceipt, recordedAtUtc }); }
  finally { green.fill(0); report.fill(0); health.fill(0); }
}
