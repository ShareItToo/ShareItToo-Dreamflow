#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateOpenAiStagingSecret } from './validate_openai_staging_secret.mjs';
import { createStagingListingAiActivationReceiptFromFiles, writeStagingListingAiActivationReceipt } from './staging_listing_ai_activation_receipt.mjs';

const deny = () => { throw new Error('staging_listing_ai_activation_receipt_invalid'); };
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function outsideRepository(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.normalize(file) !== file
      || fs.realpathSync(file) !== file || file === repositoryRoot || file.startsWith(`${repositoryRoot}${path.sep}`)) deny();
}
function args(argv) {
  const allowed = new Set(['--green-promotion-receipt', '--deployment-report', '--health-readback',
    '--secret-file', '--release-dir', '--run-id', '--expected-commit', '--rollback-container-id',
    '--rollback-image-id', '--rollback-commit', '--runtime-container-id']);
  if (!Array.isArray(argv) || argv.length % 2) deny();
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || Object.hasOwn(result, argv[i]) || !argv[i + 1]) deny();
    result[argv[i]] = argv[i + 1];
  }
  if (Object.keys(result).length !== allowed.size || [...allowed].some((key) => !result[key])) deny();
  return result;
}
export function runStagingListingAiActivationReceiptCli(argv, { execute = execFileSync, now = () => new Date() } = {}) {
  const a = args(argv); const commit = a['--expected-commit'];
  if (!/^[a-f0-9]{40}$/u.test(commit) || !/^[a-f0-9]{64}$/u.test(a['--rollback-container-id'])
      || !/^sha256:[a-f0-9]{64}$/u.test(a['--rollback-image-id'])
      || !/^[a-f0-9]{40}$/u.test(a['--rollback-commit'])
      || !/^[a-f0-9]{64}$/u.test(a['--runtime-container-id'])) deny();
  for (const key of ['--green-promotion-receipt', '--deployment-report', '--health-readback', '--release-dir']) {
    outsideRepository(a[key]);
  }
  const inspect = (id) => JSON.parse(execute('docker', ['inspect', '--format', '{{json .}}', id],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  const imageInspect = (id) => JSON.parse(execute('docker', ['image', 'inspect', '--format', '{{json .}}', id],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  const readRuntime = () => {
    const before = inspect(a['--runtime-container-id']);
    if (before.Id !== a['--runtime-container-id'] || before.Name !== '/shareittoo-staging-api'
        || before.State?.Running !== true || before.Config?.Labels?.['com.shareittoo.sit.green'] !== 'true'
        || before.Config?.Labels?.['org.opencontainers.image.revision'] !== commit
        || !/^sha256:[a-f0-9]{64}$/u.test(before.Image ?? '')) deny();
    const image = imageInspect(before.Image);
    const repoDigest = (image.RepoDigests ?? []).find((value) =>
      /^ghcr\.io\/shareittoo\/shareittoo-api@sha256:[a-f0-9]{64}$/u.test(value));
    const after = inspect(a['--runtime-container-id']);
    const identity = (value) => ({ id: value.Id, name: value.Name, running: value.State?.Running === true,
      green: value.Config?.Labels?.['com.shareittoo.sit.green'],
      revision: value.Config?.Labels?.['org.opencontainers.image.revision'], image: value.Image });
    if (image.Id !== before.Image || !repoDigest || JSON.stringify(identity(before)) !== JSON.stringify(identity(after))) deny();
    return { containerId: before.Id, containerName: before.Name, running: true, green: true,
      runtimeCommit: commit, imageId: before.Image, repoDigest };
  };
  const runtime = readRuntime();
  const assertRuntimeUnchanged = () => {
    if (JSON.stringify(readRuntime()) !== JSON.stringify(runtime)) deny();
  };
  const secretPath = a['--secret-file'];
  assertRuntimeUnchanged();
  const secretMeta = validateOpenAiStagingSecret({ filePath: secretPath, repositoryRoot });
  assertRuntimeUnchanged();
  const secretStat = fs.lstatSync(secretPath);
  const secretMetadataReceipt = { ...secretMeta, ownerUid: secretStat.uid, groupGid: secretStat.gid };
  const rollbackTarget = { containerId: a['--rollback-container-id'], containerName: '/shareittoo-staging-api',
    imageId: a['--rollback-image-id'], runtimeCommit: a['--rollback-commit'] };
  const receipt = createStagingListingAiActivationReceiptFromFiles({
    greenPromotionReceiptFile: a['--green-promotion-receipt'], deploymentReportFile: a['--deployment-report'],
    healthReadbackFile: a['--health-readback'], runtime, rollbackTarget, secretMetadataReceipt,
    recordedAtUtc: now().toISOString(), fence: assertRuntimeUnchanged,
  });
  return writeStagingListingAiActivationReceipt({ directory: a['--release-dir'], runId: a['--run-id'], receipt,
    now: now().getTime(), beforeWrite: assertRuntimeUnchanged, afterWrite: assertRuntimeUnchanged });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runStagingListingAiActivationReceiptCli(process.argv.slice(2)))}\n`); }
  catch { process.stderr.write('staging_listing_ai_activation_receipt_invalid\n'); process.exitCode = 1; }
}
