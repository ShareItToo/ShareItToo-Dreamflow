#!/usr/bin/env node
// Read-only public static readback. The output directory must already be a
// fresh owner-0700 directory outside the repository and sealed artifact.
// node tool/verify_served_staging_web.mjs --artifact ABS_SEALED_ARTIFACT \
//   --manifest-sha256 EXACT_MANIFEST_SHA --source-commit EXACT_HEAD \
//   --evidence-dir ABS_FRESH_OWNER_0700_DIR
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGET, validateArtifact } from './staging_web_contract.mjs';

const SOURCE_ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const RECEIPT_NAME = 'served-web-readback.json';
const ESSENTIAL_FILES = Object.freeze([
  'flutter_bootstrap.js', 'index.html', 'staging-release.json',
  'staging_bootstrap.js', 'flutter_service_worker.js',
]);
const MAX_FILES = 4096;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const HASH = /^[a-f0-9]{64}$/u;
const SOURCE = /^[a-f0-9]{40}$/u;
const deny = () => { throw new Error('served_web_readback_refused'); };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function parseServedWebReadbackArgs(argv) {
  const allowed = new Set(['--artifact', '--manifest-sha256', '--source-commit', '--evidence-dir']);
  if (!Array.isArray(argv) || argv.length !== allowed.size * 2) deny();
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const value = argv[i + 1];
    if (!allowed.has(flag) || Object.hasOwn(values, flag.slice(2))
      || typeof value !== 'string' || value.length === 0) deny();
    values[flag.slice(2)] = value;
  }
  if (Object.keys(values).sort().join('|') !== [...allowed].map(x => x.slice(2)).sort().join('|')) deny();
  if (!path.isAbsolute(values.artifact) || !path.isAbsolute(values['evidence-dir'])
    || !HASH.test(values['manifest-sha256']) || !SOURCE.test(values['source-commit'])) deny();
  return Object.freeze(values);
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith(`..${path.sep}`));
}

function evidenceDirectory(directory, artifact) {
  let real;
  try { real = fs.realpathSync(directory); } catch { deny(); }
  if (real !== path.resolve(directory) || inside(SOURCE_ROOT, real)
    || inside(artifact, real) || inside(real, artifact)) deny();
  let stat; let names;
  try {
    stat = fs.lstatSync(real); names = fs.readdirSync(real);
  } catch { deny(); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o7777) !== 0o700 || names.length !== 0) deny();
  return Object.freeze({ path: real, device: stat.dev, inode: stat.ino, uid: stat.uid, gid: stat.gid });
}

function relativeFile(name) {
  if (typeof name !== 'string' || name.length === 0 || name.includes('\\')
    || name.startsWith('/') || path.posix.normalize(name) !== name) deny();
  const parts = name.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..'
    || !/^[A-Za-z0-9_.@+-]+$/u.test(part))) deny();
  return name;
}

function readArtifactSnapshot(artifact, manifestSha, expectedSource) {
  let manifest;
  try { manifest = validateArtifact(artifact, manifestSha, expectedSource, { mode: 'current' }); }
  catch { deny(); }
  if (!manifest || manifest.source !== expectedSource || !manifest.files
    || Object.getPrototypeOf(manifest.files) !== Object.prototype) deny();
  const entries = Object.keys(manifest.files).sort();
  if (entries.length === 0 || entries.length > MAX_FILES
    || ESSENTIAL_FILES.some(name => !Object.hasOwn(manifest.files, name))) deny();
  const releasePath = path.join(artifact, 'web', 'staging-release.json');
  let release;
  try { release = JSON.parse(fs.readFileSync(releasePath, 'utf8')); } catch { deny(); }
  if (!release || Array.isArray(release) || Object.keys(release).sort().join('|')
    !== ['profileDigest', 'source', 'target', 'version'].sort().join('|')
    || release.target !== TARGET || release.source !== expectedSource
    || typeof release.version !== 'string' || !/^\d+\.\d+\.\d+\+\d+$/u.test(release.version)
    || !HASH.test(release.profileDigest)
    || release.profileDigest !== sha256(Buffer.from(JSON.stringify(manifest.profile)))) deny();

  const expected = [];
  let totalBytes = 0;
  for (const name of entries) {
    relativeFile(name);
    const expectedHash = manifest.files[name];
    if (!HASH.test(expectedHash ?? '')) deny();
    let bytes;
    try { bytes = fs.readFileSync(path.join(artifact, 'web', name)); } catch { deny(); }
    if (bytes.length > MAX_FILE_BYTES || sha256(bytes) !== expectedHash) deny();
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) deny();
    expected.push(Object.freeze({ path: name, bytes, sha256: expectedHash }));
  }
  return Object.freeze({ manifest, release: Object.freeze(release), expected: Object.freeze(expected), totalBytes });
}

async function readResponseBytes(response, maximum) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    if (maximum !== 0) deny();
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      length += chunk.length;
      if (length > maximum) { await reader.cancel(); deny(); }
      chunks.push(chunk);
    }
  } catch { deny(); }
  return Buffer.concat(chunks, length);
}

async function fetchOne(fetchImpl, file, manifestSha, expectedBytes) {
  const url = new URL(file, `${TARGET}/`);
  url.searchParams.set('artifact', manifestSha);
  if (url.protocol !== 'https:' || url.origin !== TARGET || url.username || url.password
    || url.hash || url.pathname !== `/${file}`) deny();
  const controller = new AbortController();
  let timeout;
  const bounded = new Promise((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error('served_web_timeout')); }, REQUEST_TIMEOUT_MS);
  });
  const operation = (async () => {
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
        headers: { 'accept-encoding': 'identity' }, signal: controller.signal,
      });
    } catch { deny(); }
    if (!response || response.status !== 200 || response.redirected === true
      || response.url !== url.href || response.type === 'opaqueredirect') deny();
    const encoding = response.headers?.get?.('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') deny();
    const contentLength = response.headers?.get?.('content-length');
    if (contentLength !== null && contentLength !== undefined
      && (!/^\d+$/u.test(contentLength) || Number(contentLength) !== expectedBytes)) deny();
    return readResponseBytes(response, expectedBytes);
  })();
  try { return await Promise.race([operation, bounded]); }
  catch { deny(); }
  finally { clearTimeout(timeout); }
}

function assertEvidenceDirUnchanged(info) {
  let stat; let names;
  try { stat = fs.lstatSync(info.path); names = fs.readdirSync(info.path); } catch { deny(); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== info.device
    || stat.ino !== info.inode || stat.uid !== info.uid || stat.gid !== info.gid
    || (stat.mode & 0o7777) !== 0o700 || names.length !== 0) deny();
}

function writeReceipt(info, receipt) {
  assertEvidenceDirUnchanged(info);
  const output = path.join(info.path, RECEIPT_NAME);
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`, 'utf8');
  let fd; let created = false; let createdIdentity = null;
  try {
    fd = fs.openSync(output, fs.constants.O_RDWR | fs.constants.O_CREAT
      | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    created = true;
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid()
      || (before.mode & 0o7777) !== 0o600) deny();
    createdIdentity = { dev: before.dev, ino: before.ino };
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (written <= 0) deny();
      offset += written;
    }
    fs.fsyncSync(fd);
    const observed = Buffer.alloc(bytes.length);
    let readOffset = 0;
    while (readOffset < observed.length) {
      const count = fs.readSync(fd, observed, readOffset, observed.length - readOffset, readOffset);
      if (count <= 0) deny();
      readOffset += count;
    }
    const after = fs.lstatSync(output);
    const descriptorAfter = fs.fstatSync(fd);
    if (!observed.equals(bytes) || !after.isFile() || after.isSymbolicLink()
      || after.nlink !== 1 || after.uid !== process.getuid()
      || (after.mode & 0o7777) !== 0o600
      || after.dev !== descriptorAfter.dev || after.ino !== descriptorAfter.ino) deny();
    const dirFd = fs.openSync(info.path, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    return Object.freeze({ path: output, sha256: sha256(bytes), bytes: bytes.length });
  } catch {
    try { if (fd !== undefined) fs.closeSync(fd); } catch { /* fixed failure */ }
    if (created && createdIdentity) {
      try {
        const current = fs.lstatSync(output);
        if (current.isFile() && !current.isSymbolicLink() && current.dev === createdIdentity.dev
          && current.ino === createdIdentity.ino) fs.unlinkSync(output);
      } catch { /* only remove the exact file created above */ }
    }
    deny();
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch { /* already closed */ }
  }
}

export async function verifyServedStagingWeb({ artifact, manifestSha256, sourceCommit, evidenceDir } = {}, dependencies = {}) {
  try {
    if (dependencies === null || Object.getPrototypeOf(dependencies) !== Object.prototype
      || Object.keys(dependencies).some(key => !['fetchImpl', 'now'].includes(key))) deny();
    if (!path.isAbsolute(artifact ?? '') || !HASH.test(manifestSha256 ?? '')
      || !SOURCE.test(sourceCommit ?? '') || !path.isAbsolute(evidenceDir ?? '')) deny();
    const canonicalArtifact = fs.realpathSync(artifact);
    if (canonicalArtifact !== path.resolve(artifact)) deny();
    const outputInfo = evidenceDirectory(evidenceDir, canonicalArtifact);
    const snapshot = readArtifactSnapshot(canonicalArtifact, manifestSha256, sourceCommit);
    const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') deny();
    const readbacks = [];
    for (const file of snapshot.expected) {
      const body = await fetchOne(fetchImpl, file.path, manifestSha256, file.bytes.length);
      if (!body.equals(file.bytes)) deny();
      readbacks.push(Object.freeze({ path: file.path, httpStatus: 200, sha256: file.sha256, bytes: body.length }));
    }
    // Re-validate after requests to reject local artifact drift during the readback.
    const final = readArtifactSnapshot(canonicalArtifact, manifestSha256, sourceCommit);
    if (final.release.profileDigest !== snapshot.release.profileDigest
      || final.expected.length !== snapshot.expected.length
      || final.expected.some((file, i) => file.path !== snapshot.expected[i].path
        || file.sha256 !== snapshot.expected[i].sha256)) deny();
    const now = dependencies.now ?? new Date();
    const date = new Date(now);
    if (!Number.isFinite(date.getTime())) deny();
    const receipt = {
      schemaVersion: 1,
      kind: 'sit-served-staging-web-readback',
      evidenceClass: 'direct-served-static-readback',
      status: 'passed',
      target: TARGET,
      sourceCommit,
      buildVersion: snapshot.release.version,
      manifestSha256,
      profileDigest: snapshot.release.profileDigest,
      createdAtUtc: date.toISOString(),
      fileCount: readbacks.length,
      totalBytes: snapshot.totalBytes,
      readbacks,
    };
    const written = writeReceipt(outputInfo, receipt);
    return Object.freeze({ status: 'served-web-readback-passed', ...written, fileCount: readbacks.length });
  } catch { deny(); }
}

function parseAndRun(argv) {
  const args = parseServedWebReadbackArgs(argv);
  return verifyServedStagingWeb({
    artifact: args.artifact,
    manifestSha256: args['manifest-sha256'],
    sourceCommit: args['source-commit'],
    evidenceDir: args['evidence-dir'],
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await parseAndRun(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('served_web_readback_refused\n');
    process.exitCode = 1;
  }
}
