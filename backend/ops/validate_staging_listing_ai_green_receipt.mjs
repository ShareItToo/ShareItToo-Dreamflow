#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deny = () => { throw new Error('staging_listing_ai_green_receipt_invalid'); };
export function validatePriorGreenListingAiReceipt({ file, containerId, imageId, runtimeCommit },
  { execute = execFileSync } = {}) {
  let fd; const inspectRuntime = () => {
    const container = JSON.parse(execute('docker', ['inspect', '--format', '{{json .}}', containerId],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    const image = JSON.parse(execute('docker', ['image', 'inspect', '--format', '{{json .}}', imageId],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    const digest = (image.RepoDigests ?? []).find((value) =>
      /^ghcr\.io\/shareittoo\/shareittoo-api@sha256:[a-f0-9]{64}$/u.test(value));
    if (container.Id !== containerId || container.Name !== '/shareittoo-staging-api'
        || container.State?.Running !== true || container.Config?.Labels?.['com.shareittoo.sit.green'] !== 'true'
        || container.Config?.Labels?.['org.opencontainers.image.revision'] !== runtimeCommit
        || container.Image !== imageId || image.Id !== imageId || !digest) deny();
    return { id: container.Id, name: container.Name, running: true, image: container.Image,
      commit: container.Config.Labels['org.opencontainers.image.revision'], repoDigest: digest };
  };
  try {
    if (typeof file !== 'string' || !path.isAbsolute(file) || path.normalize(file) !== file
        || fs.realpathSync(file) !== file || file === repositoryRoot || file.startsWith(`${repositoryRoot}${path.sep}`)
        || !/^[a-f0-9]{64}$/u.test(containerId) || !/^sha256:[a-f0-9]{64}$/u.test(imageId)
        || !/^[a-f0-9]{40}$/u.test(runtimeCommit)) deny();
    const runtimeBefore = inspectRuntime();
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size < 2 || before.size > 131072
        || (before.uid !== 0 && before.uid !== process.getuid()) || (before.mode & 0o777) !== 0o600) deny();
    const linked = fs.lstatSync(file);
    if (linked.dev !== before.dev || linked.ino !== before.ino) deny();
    const bytes = Buffer.alloc(before.size); let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (n < 1) deny(); offset += n; }
    const after = fs.fstatSync(fd), linkedAfter = fs.lstatSync(file);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
        || linkedAfter.dev !== after.dev || linkedAfter.ino !== after.ino) deny();
    const receiptSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const receipt = JSON.parse(bytes.toString('utf8'));
    bytes.fill(0);
    if (receipt?.kind !== 'sit-green-staging-106-106-promotion' || receipt.schemaVersion !== 2
        || receipt.status !== 'promoted_owner_smoke_pending' || receipt.candidateId !== containerId
        || receipt.runtimeCommit !== runtimeCommit || receipt.ownerSmokePassed !== false
        || receipt.publicReleaseComplete !== false || receipt.intentionalProviderCalls !== 0) deny();
    if (JSON.stringify(inspectRuntime()) !== JSON.stringify(runtimeBefore)) deny();
    return { status: 'verified-prior-green-runtime', receiptSha256 };
  } catch { deny(); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [file, containerId, imageId, runtimeCommit, ...extra] = process.argv.slice(2);
    if (extra.length) deny();
    const result = validatePriorGreenListingAiReceipt({ file, containerId, imageId, runtimeCommit });
    process.stdout.write(`Prior Green Listing-AI receipt: PASS ${result.receiptSha256}\n`);
  } catch { process.stderr.write('staging_listing_ai_green_receipt_invalid\n'); process.exitCode = 1; }
}
