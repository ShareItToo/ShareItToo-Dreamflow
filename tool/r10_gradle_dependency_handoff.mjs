#!/usr/bin/env node
// Same-run dependency transport only: no task outputs, transforms, credentials,
// daemon state or project .gradle directory may cross the clean-build boundary.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidToolchain, readAndValidateAndroidToolchain } from './validate_android_toolchain.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const limits = { files: 100000, bytes: 4 * 1024 ** 3 };
const roots = ['caches/modules-2', `wrapper/dists/gradle-${androidToolchain.gradle}-bin`];
const pins = { ...androidToolchain, flutter: '3.41.7', dart: '3.11.5', javaMajor: 17 };

export async function r10DependencyIdentity(root, sourceHead) {
  if (!/^[a-f0-9]{40}$/u.test(sourceHead)) fail('r10_handoff_source_invalid');
  readAndValidateAndroidToolchain(root);
  const names = ['pubspec.lock', 'android/build.gradle', 'android/settings.gradle',
    'android/app/build.gradle', 'android/gradle.properties', 'android/gradle/wrapper/gradle-wrapper.properties'];
  const inputs = await Promise.all(names.map(async name => [name, hash(await readFile(path.join(root, name)))]));
  return { sourceHead, platform: process.platform, arch: process.arch, pins,
    dependencyInputsSha256: hash(JSON.stringify(inputs)) };
}

async function regularBytes(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > limits.bytes) fail('r10_handoff_file_invalid');
    const bytes = await handle.readFile();
    if (bytes.length !== metadata.size) fail('r10_handoff_file_changed');
    return { bytes, mode: metadata.mode & 0o777 };
  } finally { await handle.close(); }
}

async function inventory(root, { exporting = false } = {}) {
  const files = []; let totalBytes = 0;
  for (const relative of ['', 'caches', 'wrapper', 'wrapper/dists']) {
    const metadata = await lstat(path.join(root, relative));
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('r10_handoff_symlink');
  }
  async function visit(relative) {
    const full = path.join(root, relative);
    const metadata = await lstat(full);
    if (metadata.isSymbolicLink()) fail('r10_handoff_symlink');
    if (metadata.isDirectory()) {
      for (const name of (await readdir(full)).sort()) {
        if (exporting && (name.endsWith('.lock') || name.endsWith('.lck') || name === 'gc.properties')) continue;
        await visit(path.posix.join(relative, name));
      }
      return;
    }
    const { bytes, mode } = await regularBytes(full);
    totalBytes += bytes.length;
    if (files.length >= limits.files || totalBytes > limits.bytes) fail('r10_handoff_limit');
    files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes), executable: (mode & 0o111) !== 0 });
  }
  for (const relative of roots) await visit(relative);
  if (!files.some(file => file.path.startsWith('caches/modules-2/files-2.1/'))
      || !files.some(file => file.path.endsWith(`/gradle-${androidToolchain.gradle}/bin/gradle`))) {
    fail('r10_handoff_incomplete');
  }
  return { files, totalBytes };
}

async function copyVerified(source, destination, files) {
  for (const file of files) {
    const { bytes } = await regularBytes(path.join(source, file.path));
    if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) fail('r10_handoff_checksum_mismatch');
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx', mode: file.executable ? 0o755 : 0o644 });
  }
}

export async function exportR10GradleDependencies({ source, output, identity }) {
  const snapshot = await inventory(source, { exporting: true });
  await mkdir(output); // Never merge with a previous artifact.
  await copyVerified(source, output, snapshot.files);
  const manifest = { schemaVersion: 1, kind: 'sit-r10-gradle-dependencies', identity, ...snapshot };
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest)}\n`, { flag: 'wx' });
  return manifest;
}

export async function importR10GradleDependencies({ source, destination, identity }) {
  const { bytes } = await regularBytes(path.join(source, 'manifest.json'));
  const manifest = JSON.parse(bytes);
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'sit-r10-gradle-dependencies'
      || JSON.stringify(manifest.identity) !== JSON.stringify(identity)) fail('r10_handoff_identity_mismatch');
  // Enumerate real files instead of trusting manifest paths. Reject extra roots,
  // altered bytes and missing dependencies before copying anything.
  if (JSON.stringify((await readdir(source)).sort()) !== JSON.stringify(['caches', 'manifest.json', 'wrapper'])
      || JSON.stringify(await readdir(path.join(source, 'caches'))) !== JSON.stringify(['modules-2'])
      || JSON.stringify(await readdir(path.join(source, 'wrapper'))) !== JSON.stringify(['dists'])
      || JSON.stringify(await readdir(path.join(source, 'wrapper/dists'))) !== JSON.stringify([`gradle-${androidToolchain.gradle}-bin`])) {
    fail('r10_handoff_extra_state');
  }
  const observed = await inventory(source);
  if (JSON.stringify(manifest.files) !== JSON.stringify(observed.files)
      || manifest.totalBytes !== observed.totalBytes) fail('r10_handoff_checksum_mismatch');
  await mkdir(destination); // Fresh, isolated Gradle home only.
  await copyVerified(source, destination, observed.files);
  return { mechanism: 'same-run-exact-head-gradle-dependencies', manifestSha256: hash(bytes),
    sourceHead: identity.sourceHead, dependencyInputsSha256: identity.dependencyInputsSha256,
    pins, files: observed.files.length, bytes: observed.totalBytes, offlineBuilds: true,
    projectOutputsCopied: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, source, output] = process.argv.slice(2);
  if (mode !== 'export' || !source || !output || process.argv.length !== 5) fail('r10_handoff_arguments_invalid');
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const sourceHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const identity = await r10DependencyIdentity(root, sourceHead);
  const manifest = await exportR10GradleDependencies({ source: path.resolve(source), output: path.resolve(output), identity });
  console.log(`R10 dependency handoff: ${sourceHead}, ${manifest.files.length} files, ${manifest.totalBytes} bytes`);
}
