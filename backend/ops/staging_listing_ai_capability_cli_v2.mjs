#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createStagingListingAiCapabilityCollectorV2, readStagingListingAiSessionToken,
  readStableProtectedFile, readStableSourceFile,
  writeStagingListingAiCapabilityCandidate } from './staging_listing_ai_capability_collector_v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_PATHS = Object.freeze(['backend/ops/staging_listing_ai_activation_receipt.mjs',
  'backend/ops/staging_listing_ai_capability_collector_v2.mjs', 'backend/ops/staging_listing_ai_capability_cli_v2.mjs']);
const deny = () => { throw new Error('staging_listing_ai_capability_not_verified'); };
const check = (value) => { if (!value) deny(); };
const args = (argv) => {
  const allowed = new Set(['--activation-receipt', '--session-file', '--expected-user-id', '--client-version', '--evidence-dir', '--run-id']);
  check(Array.isArray(argv) && argv.length % 2 === 0);
  const out = {};
  for (let i = 0; i < argv.length; i += 2) { check(allowed.has(argv[i]) && !Object.hasOwn(out, argv[i]) && argv[i + 1]); out[argv[i]] = argv[i + 1]; }
  check(Object.keys(out).length === allowed.size && [...allowed].every((key) => out[key]));
  return out;
};
const readProtected = (file, repositoryRoot, options = {}) => readStableProtectedFile(file, {
  repositoryRoot, allowedUids: [0, process.getuid()], maxBytes: 131072, exactMode: 0o600, ...options,
});
function committedSourceSnapshot(repositoryRoot, expectedCommit, { afterSourceOpen } = {}) {
  const git = (argv) => execFileSync('git', ['-C', repositoryRoot, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sourceCommit = git(['rev-parse', 'HEAD']);
  check(sourceCommit === expectedCommit && /^[a-f0-9]{40}$/u.test(sourceCommit));
  check(git(['status', '--porcelain', '--', ...SOURCE_PATHS]) === '');
  const files = SOURCE_PATHS.map((relativePath) => {
    const bytes = readStableSourceFile(path.join(repositoryRoot, relativePath), {
      afterOpen: (fd, parents) => afterSourceOpen?.(relativePath, fd, parents),
    });
    const committed = execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceCommit}:${relativePath}`]);
    check(bytes.equals(committed));
    return { relativePath, sourceCommit, sha256: cryptoSha(bytes) };
  });
  check(git(['rev-parse', 'HEAD']) === sourceCommit && git(['status', '--porcelain', '--', ...SOURCE_PATHS]) === '');
  return { sourceCommit, files };
}
function cryptoSha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

export async function runStagingListingAiCapabilityCliV2(argv, dependencies = {}) {
  try {
    const a = args(argv); const repositoryRoot = dependencies.repositoryRoot ?? ROOT;
    check(path.resolve(repositoryRoot) === repositoryRoot && fs.realpathSync(repositoryRoot) === repositoryRoot);
    check(/^[a-z0-9][a-z0-9-]{0,63}$/u.test(a['--run-id']));
    const execute = dependencies.execute ?? execFileSync;
    const source = dependencies.sourceSnapshot ?? committedSourceSnapshot(repositoryRoot, dependencies.sourceCommit
      ?? execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    { afterSourceOpen: dependencies.afterSourceOpen });
    const token = dependencies.token ?? readStagingListingAiSessionToken(a['--session-file'], repositoryRoot);
    const activationReceiptBytes = dependencies.activationReceiptBytes ?? readProtected(a['--activation-receipt'], repositoryRoot,
      { afterOpen: dependencies.afterActivationOpen });
    const activationReceiptReader = dependencies.activationReceiptReader
      ?? (() => dependencies.activationReceiptBytes ?? readProtected(a['--activation-receipt'], repositoryRoot,
        { afterOpen: dependencies.afterActivationOpen }));
    const activation = JSON.parse(activationReceiptBytes.toString('utf8'));
    const runtimeReader = dependencies.runtimeReader ?? (() => {
      const options = { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] };
      const inspect = () => JSON.parse(execute('docker', ['inspect', '--format', '{{json .}}', activation.canonicalContainerId], options));
      const container = inspect();
      check(container.Id === activation.canonicalContainerId && container.Name === '/shareittoo-staging-api'
        && container.State?.Running === true && container.Config?.Labels?.['com.shareittoo.sit.green'] === 'true'
        && container.Config?.Labels?.['org.opencontainers.image.revision'] === activation.runtimeCommit
        && /^sha256:[a-f0-9]{64}$/u.test(container.Image ?? ''));
      const image = JSON.parse(execute('docker', ['image', 'inspect', '--format', '{{json .}}', container.Image], options));
      const after = inspect();
      const stable = (value) => JSON.stringify({ id: value.Id, name: value.Name, running: value.State?.Running,
        green: value.Config?.Labels?.['com.shareittoo.sit.green'], commit: value.Config?.Labels?.['org.opencontainers.image.revision'], image: value.Image });
      check(image.Id === activation.imageId && Array.isArray(image.RepoDigests) && image.RepoDigests.includes(activation.repoDigest)
        && stable(container) === stable(after));
      return { containerId: container.Id, containerName: container.Name, running: true, green: true,
        runtimeCommit: activation.runtimeCommit, imageId: image.Id, repoDigest: activation.repoDigest };
    });
    const collector = createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: a['--expected-user-id'],
      activationReceiptBytes, activationReceiptReader, runtimeReader, fetchImpl: dependencies.fetchImpl, now: dependencies.now ?? Date.now,
      sourceCommit: source.sourceCommit, sourceInventory: source.files, clientVersion: a['--client-version'] });
    const result = await collector.collect();
    const written = writeStagingListingAiCapabilityCandidate({ directory: a['--evidence-dir'],
      fileName: `staging-listing-ai-capability-${a['--run-id']}.json`, bytes: result.bytes });
    result.bytes.fill(0);
    return written;
  } catch { throw new Error('staging_listing_ai_capability_not_verified'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStagingListingAiCapabilityCliV2(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify({ bytes: result.bytes, sha256: result.sha256, mode: result.mode })}\n`);
  }).catch(() => { process.stderr.write('staging_listing_ai_capability_not_verified\n'); process.exitCode = 1; });
}
