#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStagingListingAiMockWebCollector } from './staging_listing_ai_mock_web_collector.mjs';
import { readStagingListingAiSessionToken, readStableSourceFile } from './staging_listing_ai_capability_collector_v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_SOURCE_PATHS = Object.freeze(['pubspec.yaml', 'lib/config/private_pilot_config.dart']);
const fail = () => { throw new Error('staging_listing_ai_mock_web_not_verified'); };
const check = (value) => { if (!value) fail(); };
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const commitPattern = /^[a-f0-9]{40}$/u;
const runIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function parseArgs(argv) {
  const allowed = new Set(['--source-commit', '--client-version', '--session-file', '--evidence-dir', '--run-id']);
  check(Array.isArray(argv) && argv.length === allowed.size * 2);
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    check(allowed.has(argv[i]) && !Object.hasOwn(values, argv[i]) && typeof argv[i + 1] === 'string' && argv[i + 1].length > 0);
    values[argv[i]] = argv[i + 1];
  }
  check([...allowed].every((key) => Object.hasOwn(values, key))
    && commitPattern.test(values['--source-commit'])
    && /^\d+\.\d+\.\d+\+\d+$/u.test(values['--client-version'])
    && runIdPattern.test(values['--run-id']));
  return values;
}

function currentClientSource(repositoryRoot, expectedSource, expectedVersion) {
  const git = (args) => execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  check(git(['rev-parse', '--show-toplevel']) === repositoryRoot);
  const sourceCommit = git(['rev-parse', 'HEAD']);
  check(sourceCommit === expectedSource && commitPattern.test(sourceCommit));
  check(git(['status', '--porcelain=v1', '--untracked-files=all', '--', 'lib', 'assets', 'pubspec.yaml', 'web', 'index.html']) === '');
  let version;
  for (const relativePath of CLIENT_SOURCE_PATHS) {
    const bytes = readStableSourceFile(path.join(repositoryRoot, relativePath));
    const committed = execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceCommit}:${relativePath}`]);
    check(bytes.equals(committed));
    if (relativePath === 'lib/config/private_pilot_config.dart') {
      check(bytes.toString('utf8').includes(`defaultValue: '${expectedVersion}'`));
    }
    if (relativePath === 'pubspec.yaml') {
      version = /^version:\s*(\d+\.\d+\.\d+\+\d+)\s*$/mu.exec(bytes.toString('utf8'))?.[1];
    }
    bytes.fill(0);
  }
  check(version === expectedVersion && git(['rev-parse', 'HEAD']) === sourceCommit
    && git(['status', '--porcelain=v1', '--untracked-files=all', '--', 'lib', 'assets', 'pubspec.yaml', 'web', 'index.html']) === '');
  return sourceCommit;
}

export function dockerRuntimeReader(execute = execFileSync) {
  const options = { encoding: 'utf8', timeout: 10000, maxBuffer: 131072, stdio: ['ignore', 'pipe', 'ignore'] };
  const inspectContainer = () => JSON.parse(execute('docker', [
    'inspect', '--format', '{{json .}}', 'shareittoo-staging-api',
  ], options));
  const container = inspectContainer();
  const labels = container.Config?.Labels ?? {};
  check(container.Id && /^[a-f0-9]{64}$/u.test(container.Id)
    && container.Name === '/shareittoo-staging-api' && container.State?.Running === true
    && labels['com.shareittoo.sit.green'] === 'true'
    && commitPattern.test(labels['org.opencontainers.image.revision'] ?? '')
    && /^sha256:[a-f0-9]{64}$/u.test(container.Image ?? '')
    && Array.isArray(container.Config?.Env));
  const image = JSON.parse(execute('docker', ['image', 'inspect', '--format', '{{json .}}', container.Image], options));
  const after = inspectContainer();
  const stable = (value) => JSON.stringify({ id: value.Id, name: value.Name, running: value.State?.Running,
    image: value.Image, green: value.Config?.Labels?.['com.shareittoo.sit.green'],
    commit: value.Config?.Labels?.['org.opencontainers.image.revision'], env: value.Config?.Env });
  check(image.Id === container.Image && image.Config?.Labels?.['org.opencontainers.image.revision'] === labels['org.opencontainers.image.revision']
    && Array.isArray(image.RepoDigests) && stable(container) === stable(after));
  const repoDigest = image.RepoDigests.find((value) => /^ghcr\.io\/shareittoo\/shareittoo-api@sha256:[a-f0-9]{64}$/u.test(value));
  check(repoDigest);
  return { environment: 'staging', runtimeCommit: labels['org.opencontainers.image.revision'],
    imageDigest: repoDigest.slice(repoDigest.lastIndexOf('@') + 1), environmentEntries: container.Config.Env };
}

function assertOutputDirectory(directory) {
  check(path.isAbsolute(directory) && path.normalize(directory) === directory);
  const stat = fs.lstatSync(directory, { bigint: true });
  check(stat.isDirectory() && stat.uid === BigInt(process.getuid()) && (stat.mode & 0o7777n) === 0o700n);
  return stat;
}

function writeProtectedEvidence(directory, fileName, bytes) {
  const beforeDirectory = assertOutputDirectory(directory);
  const file = path.join(directory, fileName);
  const temp = path.join(directory, `.${fileName}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  let fd;
  let directoryFd;
  let published = false;
  const assertDirectoryStable = () => {
    const current = fs.lstatSync(directory, { bigint: true });
    check(current.isDirectory() && current.dev === beforeDirectory.dev && current.ino === beforeDirectory.ino
      && current.uid === beforeDirectory.uid && current.mode === beforeDirectory.mode
      && (current.mode & 0o7777n) === 0o700n);
  };
  try {
    directoryFd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
      | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
    const openedDirectory = fs.fstatSync(directoryFd, { bigint: true });
    check(openedDirectory.isDirectory() && openedDirectory.dev === beforeDirectory.dev
      && openedDirectory.ino === beforeDirectory.ino && openedDirectory.uid === BigInt(process.getuid())
      && (openedDirectory.mode & 0o7777n) === 0o700n);
    assertDirectoryStable();
    fd = fs.openSync(temp, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL
      | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC, 0o600);
    const initial = fs.fstatSync(fd, { bigint: true });
    check(initial.isFile() && initial.uid === BigInt(process.getuid()) && initial.nlink === 1n
      && (initial.mode & 0o7777n) === 0o600n && initial.size === 0n);
    let offset = 0;
    while (offset < bytes.length) { const count = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0); offset += count; }
    fs.fsyncSync(fd);
    const written = fs.fstatSync(fd, { bigint: true });
    check(written.size === BigInt(bytes.length) && written.nlink === 1n && written.uid === BigInt(process.getuid())
      && (written.mode & 0o7777n) === 0o600n);
    const tempLink = fs.lstatSync(temp, { bigint: true });
    check(tempLink.isFile() && tempLink.dev === written.dev && tempLink.ino === written.ino
      && tempLink.nlink === 1n && tempLink.size === BigInt(bytes.length));
    const readback = Buffer.alloc(bytes.length);
    offset = 0;
    while (offset < readback.length) { const count = fs.readSync(fd, readback, offset, readback.length - offset, offset); check(count > 0); offset += count; }
    check(readback.equals(bytes) && fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0);
    assertDirectoryStable();
    fs.linkSync(temp, file); published = true;
    assertDirectoryStable();
    const result = fs.lstatSync(file, { bigint: true });
    check(result.isFile() && result.uid === BigInt(process.getuid()) && result.nlink === 2n
      && (result.mode & 0o7777n) === 0o600n && result.size === BigInt(bytes.length));
    fs.unlinkSync(temp);
    const final = fs.lstatSync(file, { bigint: true });
    check(final.dev === result.dev && final.ino === result.ino && final.nlink === 1n
      && (final.mode & 0o7777n) === 0o600n && final.size === BigInt(bytes.length));
    fs.fsyncSync(fd); fs.fsyncSync(directoryFd); assertDirectoryStable();
    return { file, bytes: bytes.length, sha256: sha(readback), mode: '0600', directoryMode: '0700' };
  } catch {
    if (published) {
      try { const own = fs.fstatSync(fd, { bigint: true }); const named = fs.lstatSync(file, { bigint: true });
        if (own.dev === named.dev && own.ino === named.ino) fs.unlinkSync(file); } catch { /* retain unverified path */ }
    }
    try { fs.unlinkSync(temp); } catch { /* already absent */ }
    fail();
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { fail(); }
    if (directoryFd !== undefined) try { fs.closeSync(directoryFd); } catch { fail(); }
  }
}

export async function runStagingListingAiMockWebReadinessCli(argv, dependencies = {}) {
  let token;
  try {
    const args = parseArgs(argv);
    const repositoryRoot = dependencies.repositoryRoot ?? ROOT;
    check(path.resolve(repositoryRoot) === repositoryRoot && fs.realpathSync(repositoryRoot) === repositoryRoot);
    const sourceCommit = currentClientSource(repositoryRoot, args['--source-commit'], args['--client-version']);
    token = dependencies.token ?? readStagingListingAiSessionToken(args['--session-file'], repositoryRoot);
    const collector = createStagingListingAiMockWebCollector({ token, sourceCommit,
      clientVersion: args['--client-version'], runtimeReader: dependencies.runtimeReader
        ?? (() => dockerRuntimeReader(dependencies.execute)),
      fetchImpl: dependencies.fetchImpl, now: dependencies.now ?? Date.now });
    const result = await collector.collect();
    const written = writeProtectedEvidence(args['--evidence-dir'],
      `staging-listing-ai-mock-web-readiness-${args['--run-id']}.json`, result.bytes);
    result.bytes.fill(0);
    return written;
  } catch { fail(); }
  finally { token = undefined; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStagingListingAiMockWebReadinessCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(() => { process.stderr.write('staging_listing_ai_mock_web_not_verified\n'); process.exitCode = 1; });
}
