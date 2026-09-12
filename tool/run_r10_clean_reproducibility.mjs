#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  statfs,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidToolchain } from './validate_android_toolchain.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempPrefix = 'sit-r10-clean-reproducibility-';

// The cold run temporarily holds more than project output: fresh package
// caches, a Git clone, two APKs and two fully extracted APK inventories.
// Preserve the existing output/cache bounds and leave 5 GiB of headroom.
export const r10StorageBudgetKiB = Object.freeze({
  projectGenerated: 5 * 1024 * 1024,
  isolatedPackageCaches: 8 * 1024 * 1024,
  clone: 1 * 1024 * 1024,
  apkCopiesAndExtractions: 5 * 1024 * 1024,
  reserve: 5 * 1024 * 1024,
});

export async function assertR10StorageCapacity(directory, { inspect = statfs } = {}) {
  const info = await inspect(directory, { bigint: true });
  if (typeof info?.bavail !== 'bigint' || typeof info?.bsize !== 'bigint'
      || info.bavail < 0n || info.bsize <= 0n) fail('r10_invalid_temp_capacity');
  const available = info.bavail * info.bsize / 1024n;
  if (available > BigInt(Number.MAX_SAFE_INTEGER)) fail('r10_invalid_temp_capacity');
  const availableKiB = Number(available);
  const requiredKiB = Object.values(r10StorageBudgetKiB).reduce((sum, value) => sum + value, 0);
  if (availableKiB < requiredKiB) fail('r10_insufficient_temp_capacity');
  return Object.freeze({ availableKiB, requiredKiB });
}

export const r10ExpectedPermissions = Object.freeze([
  Object.freeze({ name: 'android.permission.ACCESS_COARSE_LOCATION', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.ACCESS_FINE_LOCATION', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.ACCESS_NETWORK_STATE', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.CAMERA', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.INTERNET', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.POST_NOTIFICATIONS', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.READ_EXTERNAL_STORAGE', maxSdkVersion: 32 }),
  Object.freeze({ name: 'android.permission.USE_BIOMETRIC', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.USE_FINGERPRINT', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.WAKE_LOCK', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.WRITE_EXTERNAL_STORAGE', maxSdkVersion: 28 }),
  Object.freeze({ name: 'com.google.android.c2dm.permission.RECEIVE', maxSdkVersion: null }),
  Object.freeze({ name: 'com.google.android.providers.gsf.permission.READ_GSERVICES', maxSdkVersion: null }),
  Object.freeze({ name: 'com.shareittoo.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION', maxSdkVersion: null }),
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function containsConservativeRawByteMarker(value, asciiMarker) {
  if (!Buffer.isBuffer(value)
      || typeof asciiMarker !== 'string'
      || asciiMarker.length === 0
      || !/^[\x20-\x7e]+$/u.test(asciiMarker)) {
    fail('r10_invalid_raw_byte_marker');
  }
  // This is deliberately a conservative compiled-artifact byte probe, not URL
  // parsing or host authorization. Any occurrence, including one embedded in
  // surrounding bytes, counts as present.
  return value.indexOf(Buffer.from(asciiMarker, 'ascii')) !== -1;
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function compactFailureOutput(value) {
  return value.trim().split(/\r?\n/u).slice(-60).join('\n').slice(0, 16_000);
}

async function runCommand(command, args, {
  cwd,
  env,
  label = path.basename(command),
  sensitiveOutput = false,
} = {}) {
  const startedAt = Date.now();
  process.stdout.write(`[R10] ${label}: start\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
      if (code === 0) {
        process.stdout.write(`[R10] ${label}: passed (${durationSeconds}s)\n`);
        resolve({ stdout, stderr, durationSeconds });
        return;
      }
      const detail = sensitiveOutput
        ? ' Output withheld because this command can report credential-like material.'
        : compactFailureOutput(`${stderr}\n${stdout}`);
      reject(new Error(
        `${label} failed with exit ${code ?? signal ?? 'unknown'}`
          + (detail === '' ? '.' : `: ${detail}`),
      ));
    });
  });
}

export function assertSafeR10TempRoot(candidate, base = os.tmpdir()) {
  const resolvedBase = path.resolve(base);
  const resolvedCandidate = path.resolve(candidate);
  if (path.dirname(resolvedCandidate) !== resolvedBase
      || !path.basename(resolvedCandidate).startsWith(tempPrefix)) {
    fail('unsafe_r10_temp_root');
  }
  return resolvedCandidate;
}

export function resolveR10SourceBranch(actualBranch, branchHint) {
  const actual = (actualBranch ?? '').trim();
  const hint = (branchHint ?? '').trim();
  const safe = (value) => value !== ''
    && value.length <= 200
    && !value.includes('..')
    && !value.startsWith('/')
    && /^[A-Za-z0-9._/-]+$/u.test(value);
  if (actual !== '') {
    if (!safe(actual) || (hint !== '' && hint !== actual)) fail('r10_source_branch_invalid');
    return actual;
  }
  if (!safe(hint)) fail('r10_detached_source_branch_hint_missing');
  return hint;
}

export function parseAaptBadging(value) {
  const packageMatch = /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'[^\n]*compileSdkVersion='(\d+)'/mu.exec(value);
  const minSdk = /^sdkVersion:'(\d+)'/mu.exec(value);
  const targetSdk = /^targetSdkVersion:'(\d+)'/mu.exec(value);
  if (packageMatch === null || minSdk === null || targetSdk === null) {
    fail('r10_android_badging_unparseable');
  }
  return Object.freeze({
    applicationId: packageMatch[1],
    versionCode: packageMatch[2],
    versionName: packageMatch[3],
    compileSdk: Number(packageMatch[4]),
    minSdk: Number(minSdk[1]),
    targetSdk: Number(targetSdk[1]),
    debuggable: /^application-debuggable$/mu.test(value),
  });
}

export function parseAaptPermissions(value) {
  return value
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('uses-permission:'))
    .map((line) => {
      const name = /name='([^']+)'/u.exec(line)?.[1];
      if (name === undefined) fail('r10_android_permission_unparseable');
      const maxSdk = /maxSdkVersion='(\d+)'/u.exec(line)?.[1];
      return Object.freeze({
        name,
        maxSdkVersion: maxSdk === undefined ? null : Number(maxSdk),
      });
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function compareApkInventories(first, second) {
  const firstEntries = new Map(first.entries.map((entry) => [entry.name, entry]));
  const secondEntries = new Map(second.entries.map((entry) => [entry.name, entry]));
  const names = [...new Set([...firstEntries.keys(), ...secondEntries.keys()])].sort();
  const differingEntries = names.filter(
    (name) => firstEntries.get(name)?.sha256 !== secondEntries.get(name)?.sha256,
  );
  const knownD8MetadataOnlyEntries = differingEntries.filter((name) => {
    const left = firstEntries.get(name);
    const right = secondEntries.get(name);
    return /^classes\d*\.dex$/u.test(name)
      && left?.normalizedKnownMetadataSha256 !== undefined
      && left.normalizedKnownMetadataSha256 === right?.normalizedKnownMetadataSha256;
  });
  const unexplainedDifferingEntries = differingEntries.filter(
    (name) => !knownD8MetadataOnlyEntries.includes(name),
  );
  const byteIdentical = first.sha256 === second.sha256;
  const extractedEntriesIdentical = differingEntries.length === 0;
  const knownEquivalent = unexplainedDifferingEntries.length === 0;
  return Object.freeze({
    classification: byteIdentical
      ? 'byte-identical'
      : extractedEntriesIdentical
        ? 'zip-container-or-signing-metadata-only'
        : knownEquivalent
          ? 'd8-synthetic-checksum-metadata-only'
          : 'unexplained-payload-drift',
    byteIdentical,
    extractedEntriesIdentical,
    knownEquivalent,
    differingEntries,
    knownD8MetadataOnlyEntries,
    unexplainedDifferingEntries,
  });
}

export function knownD8MetadataNormalizedSha256(bytes) {
  const normalized = Buffer.from(bytes);
  if (normalized.length < 32 || normalized.subarray(0, 4).toString('ascii') !== 'dex\n') {
    fail('r10_invalid_dex_entry');
  }
  normalized.fill(0, 8, 32);
  const ascii = normalized.toString('latin1');
  for (const match of ascii.matchAll(/~~~\{[^}\0]+\}/gu)) {
    const value = match[0];
    for (const checksum of value.matchAll(/:"([0-9a-f]{9})"/gu)) {
      const hashOffset = match.index + checksum.index + 2;
      normalized.fill(0x30, hashOffset, hashOffset + 9);
    }
  }
  return sha256(normalized);
}

export function selectFlutterRuntimePayloadEntries(entries) {
  const appLibraries = entries.filter((entry) => /(^|\/)libapp\.so$/u.test(entry));
  if (appLibraries.length > 0) {
    return Object.freeze({ format: 'aot-libapp', entries: Object.freeze(appLibraries) });
  }
  const debugKernels = entries.filter(
    (entry) => entry === 'assets/flutter_assets/kernel_blob.bin',
  );
  if (debugKernels.length === 1) {
    return Object.freeze({ format: 'debug-kernel-blob', entries: Object.freeze(debugKernels) });
  }
  fail('r10_flutter_runtime_payload_missing');
}

async function exists(candidate) {
  try {
    await access(candidate, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readFilesRecursively(root, relative = '') {
  const absolute = path.join(root, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    if (entry.isDirectory()) {
      files.push(...await readFilesRecursively(root, child));
    } else if (entry.isFile()) {
      files.push(child);
    } else {
      fail(`r10_unexpected_archive_entry_type:${child}`);
    }
  }
  return files;
}

async function directorySizeBytes(root) {
  if (!await exists(root)) return 0;
  const info = await lstat(root);
  if (info.isSymbolicLink()) return 0;
  if (info.isFile()) return info.size;
  let total = 0;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    total += await directorySizeBytes(path.join(root, entry.name));
  }
  return total;
}

async function generatedFootprint(checkout, cacheRoot) {
  const paths = [
    '.dart_tool',
    'build',
    'android/.gradle',
    'backend/node_modules',
  ];
  const byPath = {};
  for (const relative of paths) {
    byPath[relative] = Math.ceil(await directorySizeBytes(path.join(checkout, relative)) / 1024);
  }
  const projectGeneratedKiB = Object.values(byPath).reduce((sum, value) => sum + value, 0);
  const isolatedPackageCachesKiB = Math.ceil(await directorySizeBytes(cacheRoot) / 1024);
  return Object.freeze({
    pathsKiB: Object.freeze(byPath),
    projectGeneratedKiB,
    isolatedPackageCachesKiB,
    totalKiB: projectGeneratedKiB + isolatedPackageCachesKiB,
  });
}

export function validateR10GeneratedFootprint(value, {
  maximumProjectGeneratedKiB = r10StorageBudgetKiB.projectGenerated,
  maximumIsolatedPackageCachesKiB = r10StorageBudgetKiB.isolatedPackageCaches,
} = {}) {
  if (value.projectGeneratedKiB > maximumProjectGeneratedKiB) {
    fail('r10_project_generated_footprint_exceeds_bound');
  }
  if (value.isolatedPackageCachesKiB > maximumIsolatedPackageCachesKiB) {
    fail('r10_isolated_package_cache_exceeds_bound');
  }
  if (value.totalKiB !== value.projectGeneratedKiB + value.isolatedPackageCachesKiB) {
    fail('r10_generated_footprint_total_invalid');
  }
  return Object.freeze({
    maximumProjectGeneratedKiB,
    maximumIsolatedPackageCachesKiB,
    withinBounds: true,
  });
}

async function gitFiles(root, pathspecs) {
  const result = await runCommand(
    'git',
    ['-C', root, 'ls-files', '-z', '--', ...pathspecs],
    { label: `inventory ${pathspecs.join(',')}` },
  );
  return result.stdout.split('\0').filter(Boolean).sort();
}

async function fileInventory(root, files) {
  const entries = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(root, relative));
    entries.push(Object.freeze({ path: relative, bytes: bytes.length, sha256: sha256(bytes) }));
  }
  return Object.freeze({
    count: entries.length,
    sha256: sha256(JSON.stringify(entries)),
    entries: Object.freeze(entries),
  });
}

async function sourceInventories(root) {
  const dependencyFiles = [
    'pubspec.yaml',
    'pubspec.lock',
    'backend/package.json',
    'backend/pnpm-lock.yaml',
    'android/gradle/wrapper/gradle-wrapper.properties',
    'android/settings.gradle',
    'android/app/build.gradle',
  ];
  const migrationFiles = await gitFiles(root, ['backend/sql/schema.sql', 'backend/sql/migrations']);
  const assetFiles = await gitFiles(root, ['assets/images', 'assets/fonts', 'assets/licenses']);
  const fontFiles = assetFiles.filter((file) => file.startsWith('assets/fonts/'));
  return Object.freeze({
    dependencies: await fileInventory(root, dependencyFiles),
    migrations: await fileInventory(root, migrationFiles),
    assets: await fileInventory(root, assetFiles),
    fonts: await fileInventory(root, fontFiles),
  });
}

function summarizeInventory(inventory) {
  return Object.freeze({ count: inventory.count, sha256: inventory.sha256 });
}

function compareSourceInventories(before, after) {
  const categories = ['dependencies', 'migrations', 'assets', 'fonts'];
  const comparison = {};
  for (const category of categories) {
    comparison[category] = Object.freeze({
      before: summarizeInventory(before[category]),
      after: summarizeInventory(after[category]),
      exactMatch: exact(before[category], after[category]),
    });
    if (!comparison[category].exactMatch) fail(`r10_${category}_inventory_drift`);
  }
  return Object.freeze(comparison);
}

async function resolveAapt(androidSdkRoot) {
  const buildToolsRoot = path.join(androidSdkRoot, 'build-tools');
  const directories = (await readdir(buildToolsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const candidate = path.join(buildToolsRoot, directories.at(-1) ?? '', 'aapt');
  try {
    await access(candidate, fsConstants.X_OK);
  } catch {
    fail('r10_aapt_unavailable');
  }
  return candidate;
}

async function resolveAndroidSdkRoot(sourceRoot) {
  const configured = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (configured !== undefined && configured.trim() !== '') return configured.trim();
  const localProperties = path.join(sourceRoot, 'android/local.properties');
  if (await exists(localProperties)) {
    const contents = await readFile(localProperties, 'utf8');
    const sdkDir = /^sdk\.dir=(.+)$/mu.exec(contents)?.[1]?.trim();
    if (sdkDir !== undefined && sdkDir !== '') return sdkDir.replace(/\\:/gu, ':');
  }
  const candidates = [
    path.join(os.homedir(), 'Library/Android/sdk'),
    '/opt/homebrew/share/android-commandlinetools',
  ];
  for (const candidate of candidates) {
    if (await exists(path.join(candidate, 'build-tools'))) return candidate;
  }
  fail('r10_android_sdk_unavailable');
}

export async function captureR10Toolchain(checkout, env, { run = runCommand } = {}) {
  const flutter = JSON.parse((await run(
    'flutter', ['--version', '--machine'], { cwd: checkout, env, label: 'Flutter toolchain identity' },
  )).stdout);
  const node = (await run(
    'node', ['--version'], { cwd: checkout, env, label: 'Node toolchain identity' },
  )).stdout.trim();
  const pnpm = (await run(
    // Corepack resolves packageManager from cwd. Measure the same backend
    // package context used below for restore, tests and audit, not a global
    // fallback selected from the Flutter repository root.
    'pnpm', ['--version'], { cwd: path.join(checkout, 'backend'), env, label: 'pnpm toolchain identity' },
  )).stdout.trim();
  const javaOutput = await run(
    'java', ['-version'], { cwd: checkout, env, label: 'Java toolchain identity' },
  );
  const java = `${javaOutput.stderr}\n${javaOutput.stdout}`.trim();
  const gradleOutput = (await run(
    './android/gradlew', ['--version'], { cwd: checkout, env, label: 'Gradle wrapper identity' },
  )).stdout;
  const gradle = /^Gradle (\S+)$/mu.exec(gradleOutput)?.[1];
  const nodeMajor = Number(/^v(\d+)\./u.exec(node)?.[1]);
  const javaMajor = Number(/version "(\d+)/u.exec(java)?.[1]);
  if (flutter.frameworkVersion !== '3.41.7'
      || flutter.dartSdkVersion !== '3.11.5'
      || !Number.isSafeInteger(nodeMajor) || nodeMajor < 22
      || pnpm !== '11.16.0'
      || javaMajor !== 17
      || gradle !== androidToolchain.gradle) {
    fail('r10_toolchain_identity_unexpected');
  }
  return Object.freeze({
    flutter: flutter.frameworkVersion,
    dart: flutter.dartSdkVersion,
    node,
    pnpm,
    javaMajor,
    gradle,
  });
}

async function apkInventory(apk, extractionRoot) {
  await mkdir(extractionRoot, { recursive: true });
  await runCommand('unzip', ['-qq', apk, '-d', extractionRoot], {
    label: `extract ${path.basename(apk)}`,
  });
  const files = await readFilesRecursively(extractionRoot);
  const entries = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(extractionRoot, relative));
    const entry = { name: relative, bytes: bytes.length, sha256: sha256(bytes) };
    if (/^classes\d*\.dex$/u.test(relative)) {
      entry.normalizedKnownMetadataSha256 = knownD8MetadataNormalizedSha256(bytes);
    }
    entries.push(Object.freeze(entry));
  }
  const apkBytes = await readFile(apk);
  return Object.freeze({
    bytes: apkBytes.length,
    sha256: sha256(apkBytes),
    payloadInventorySha256: sha256(JSON.stringify(entries)),
    entries: Object.freeze(entries),
  });
}

function parsePubspecVersion(source) {
  const match = /^version:\s*([^+\s]+)\+(\d+)\s*$/mu.exec(source);
  if (match === null) fail('r10_pubspec_version_unparseable');
  return Object.freeze({ versionName: match[1], versionCode: match[2] });
}

function requireSourceContract(source, pattern, label) {
  if (!pattern.test(source)) fail(`r10_runtime_contract_missing:${label}`);
}

async function runtimeConfiguration(checkout, manifest, compiledPayload) {
  const backend = await readFile(path.join(checkout, 'lib/services/backend_config.dart'), 'utf8');
  const openAi = await readFile(path.join(checkout, 'lib/openai/openai_config.dart'), 'utf8');
  const privatePilot = await readFile(path.join(checkout, 'lib/config/private_pilot_config.dart'), 'utf8');
  const auth = await readFile(path.join(checkout, 'lib/services/auth_service.dart'), 'utf8');
  requireSourceContract(backend, /'SIT_BACKEND_ENABLED',[\s\S]{0,100}defaultValue: kReleaseMode/u, 'backend-debug-disabled');
  requireSourceContract(backend, /defaultValue: 'https:\/\/shareittoo\.com\/api\/v1'/u, 'backend-default-origin');
  requireSourceContract(openAi, /externalAiNetworkAllowed = false/u, 'external-ai-network-disabled');
  requireSourceContract(openAi, /static bool get isAvailable => false/u, 'external-ai-unavailable');
  requireSourceContract(privatePilot, /realPaymentsEnabled = false/u, 'real-payments-disabled');
  requireSourceContract(privatePilot, /aiFeaturesEnabled = false/u, 'pilot-ai-disabled');
  for (const provider of ['GOOGLE', 'APPLE', 'FACEBOOK']) {
    requireSourceContract(
      auth,
      new RegExp(`'SIT_SOCIAL_${provider}_ENABLED',[\\s\\S]{0,100}defaultValue: false`, 'u'),
      `social-${provider.toLowerCase()}-disabled`,
    );
  }
  const value = Object.freeze({
    backendEnabledInDebugByDefault: false,
    compiledDefaultBackendOriginPresent: containsConservativeRawByteMarker(
      compiledPayload,
      'https://shareittoo.com/api/v1',
    ),
    externalAiNetworkAllowed: false,
    compiledOpenAiApiOriginPresent: containsConservativeRawByteMarker(
      compiledPayload,
      'https://api.openai.com',
    ),
    realPaymentsEnabled: false,
    socialProvidersEnabledByDefault: Object.freeze({ google: false, apple: false, facebook: false }),
    firebaseSdkPresent: manifest.includes('FirebaseMessagingRegistrar')
      && manifest.includes('CrashlyticsRegistrar')
      && manifest.includes('FirebaseAuthRegistrar'),
    firebaseMessagingAutoInitDisabled: /firebase_messaging_auto_init_enabled[\s\S]{0,240}android:value[^\n]*\(type 0x12\)0x0/u.test(manifest),
    firebaseAnalyticsCollectionDisabled: /firebase_analytics_collection_enabled[\s\S]{0,240}android:value[^\n]*\(type 0x12\)0x0/u.test(manifest),
    firebaseCrashlyticsCollectionDisabled: /firebase_crashlytics_collection_enabled[\s\S]{0,240}android:value[^\n]*\(type 0x12\)0x0/u.test(manifest),
  });
  if (!value.compiledDefaultBackendOriginPresent
      || value.compiledOpenAiApiOriginPresent
      || !value.firebaseSdkPresent
      || !value.firebaseMessagingAutoInitDisabled
      || !value.firebaseAnalyticsCollectionDisabled
      || !value.firebaseCrashlyticsCollectionDisabled) {
    fail('r10_runtime_configuration_unexpected');
  }
  return value;
}

async function compiledAppPayload(apk) {
  const entries = (await runCommand('unzip', ['-Z1', apk], {
    label: 'list APK compiled payload',
  })).stdout.split(/\r?\n/u).filter(Boolean);
  const selection = selectFlutterRuntimePayloadEntries(entries);
  const buffers = [];
  for (const entry of selection.entries) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('unzip', ['-p', apk, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks = [];
      let stderr = '';
      child.stdout.on('data', (chunk) => chunks.push(chunk));
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`r10_apk_payload_extract_failed:${compactFailureOutput(stderr)}`));
      });
    });
    buffers.push(result);
  }
  return Object.freeze({
    format: selection.format,
    entries: selection.entries,
    bytes: Buffer.concat(buffers),
  });
}

async function androidCharacteristics(checkout, apk, aapt) {
  const badging = (await runCommand(aapt, ['dump', 'badging', apk], {
    label: 'inspect APK badging',
  })).stdout;
  const permissionDump = (await runCommand(aapt, ['dump', 'permissions', apk], {
    label: 'inspect APK permissions',
  })).stdout;
  const manifest = (await runCommand(aapt, ['dump', 'xmltree', apk, 'AndroidManifest.xml'], {
    label: 'inspect merged APK manifest',
  })).stdout;
  const identity = parseAaptBadging(badging);
  const permissions = parseAaptPermissions(permissionDump);
  const expectedVersion = parsePubspecVersion(
    await readFile(path.join(checkout, 'pubspec.yaml'), 'utf8'),
  );
  if (!exact(identity, {
    applicationId: 'com.shareittoo.app',
    versionCode: expectedVersion.versionCode,
    versionName: expectedVersion.versionName,
    compileSdk: 36,
    minSdk: 24,
    targetSdk: 36,
    debuggable: true,
  })) fail('r10_android_identity_unexpected');
  if (!exact(permissions, r10ExpectedPermissions)) fail('r10_android_permission_surface_unexpected');
  const policies = Object.freeze({
    debugArtifact: identity.debuggable,
    backupDisabled: /android:allowBackup[^\n]*\(type 0x12\)0x0/u.test(manifest),
    cleartextTrafficDisabled: /android:usesCleartextTraffic[^\n]*\(type 0x12\)0x0/u.test(manifest),
    legacyExternalStorageDisabled: !manifest.includes('android:requestLegacyExternalStorage'),
  });
  if (!policies.backupDisabled
      || !policies.cleartextTrafficDisabled
      || !policies.legacyExternalStorageDisabled) {
    fail('r10_android_manifest_policy_unexpected');
  }
  const payload = await compiledAppPayload(apk);
  return Object.freeze({
    identity,
    permissions,
    policies,
    runtimePayload: Object.freeze({
      format: payload.format,
      entries: payload.entries,
    }),
    runtimeConfiguration: await runtimeConfiguration(checkout, manifest, payload.bytes),
  });
}

async function assertNoPrivateInputs(checkout) {
  const forbidden = [
    '.env',
    'backend/.env',
    'android/key.properties',
    'android/app/google-services.json',
    'ios/Runner/GoogleService-Info.plist',
    'ios/Flutter/SocialAuth.xcconfig',
  ];
  const present = [];
  for (const relative of forbidden) {
    if (await exists(path.join(checkout, relative))) present.push(relative);
  }
  if (present.length > 0) fail('r10_clean_checkout_contains_private_inputs');
  return Object.freeze({ checked: forbidden.length, present: 0 });
}

async function currentGitIdentity(sourceRoot, branchHint) {
  const head = (await runCommand('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
    label: 'source Git HEAD',
  })).stdout.trim();
  const branch = (await runCommand('git', ['-C', sourceRoot, 'branch', '--show-current'], {
    label: 'source Git branch',
  })).stdout.trim();
  const trackedStatus = (await runCommand(
    'git', ['-C', sourceRoot, 'status', '--porcelain', '--untracked-files=no'],
    { label: 'source tracked working tree' },
  )).stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(head) || trackedStatus !== '') {
    fail('r10_source_must_be_clean_and_identified');
  }
  return Object.freeze({ branch: resolveR10SourceBranch(branch, branchHint), head });
}

async function commandProof(command, args, options) {
  const result = await runCommand(command, args, options);
  return Object.freeze({ status: 'passed', durationSeconds: result.durationSeconds });
}

export async function executeR10CleanReproducibility({
  sourceRoot = repositoryRoot,
  sourceBranch,
  output,
  observedOn = new Date().toISOString().slice(0, 10),
  inspectStorage = statfs,
} = {}) {
  const storage = await assertR10StorageCapacity(os.tmpdir(), { inspect: inspectStorage });
  process.stdout.write(`[R10] temp capacity: available=${storage.availableKiB} KiB, required=${storage.requiredKiB} KiB\n`);
  const source = path.resolve(sourceRoot);
  const outputPath = output === undefined
    ? path.join(source, 'docs/evidence/48h-remote/r10-clean-reproducibility-20260824.json')
    : path.resolve(output);
  const git = await currentGitIdentity(source, sourceBranch);
  const tempRoot = assertSafeR10TempRoot(await mkdtemp(path.join(os.tmpdir(), tempPrefix)));
  const checkout = path.join(tempRoot, 'checkout');
  const cacheRoot = path.join(tempRoot, 'isolated-package-caches');
  const artifacts = path.join(tempRoot, 'artifacts');
  let evidence;
  let cleanupComplete = false;
  try {
    await mkdir(cacheRoot, { recursive: true });
    await mkdir(artifacts, { recursive: true });
    await runCommand('git', [
      'clone', '--no-hardlinks', '--no-checkout', '--quiet', source, checkout,
    ], { label: 'create isolated local clone' });
    await runCommand('git', ['-C', checkout, 'checkout', '--detach', '--quiet', git.head], {
      label: 'checkout exact detached HEAD',
    });
    const checkoutHead = (await runCommand('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
      label: 'clean checkout HEAD',
    })).stdout.trim();
    const initialStatus = (await runCommand(
      'git', ['-C', checkout, 'status', '--porcelain'], { label: 'initial clean checkout status' },
    )).stdout.trim();
    if (checkoutHead !== git.head || initialStatus !== '') fail('r10_isolated_checkout_not_exact');
    const privateInputs = await assertNoPrivateInputs(checkout);

    const androidSdkRoot = await resolveAndroidSdkRoot(source);
    const env = {
      ...process.env,
      ANDROID_HOME: androidSdkRoot,
      ANDROID_SDK_ROOT: androidSdkRoot,
      PUB_CACHE: path.join(cacheRoot, 'pub'),
      GRADLE_USER_HOME: path.join(cacheRoot, 'gradle'),
      CI: 'true',
      SIT_ALLOW_CANDIDATE_ROLLOVER: '1',
    };
    const aapt = await resolveAapt(androidSdkRoot);
    const beforeFootprint = await generatedFootprint(checkout, cacheRoot);
    if (beforeFootprint.projectGeneratedKiB !== 0
        || beforeFootprint.isolatedPackageCachesKiB !== 0) {
      fail('r10_clean_checkout_generated_footprint_not_zero');
    }
    const beforeInventories = await sourceInventories(checkout);
    const toolchain = await captureR10Toolchain(checkout, env);
    const commands = {};
    commands.backendLockedRestore = await commandProof(
      'pnpm', ['install', '--frozen-lockfile', '--store-dir', path.join(cacheRoot, 'pnpm-store')],
      { cwd: path.join(checkout, 'backend'), env, label: 'restore backend dependencies from lock' },
    );
    commands.flutterLockedRestore = await commandProof(
      'flutter', ['pub', 'get', '--enforce-lockfile'],
      { cwd: checkout, env, label: 'restore Flutter dependencies from lock' },
    );
    commands.backendSuite = await commandProof(
      'pnpm', ['test'], { cwd: path.join(checkout, 'backend'), env, label: 'Backend suite' },
    );
    commands.backendSyntax = await commandProof(
      'pnpm', ['run', 'check'], { cwd: path.join(checkout, 'backend'), env, label: 'Backend syntax checks' },
    );
    commands.dependencyAudit = await commandProof(
      'pnpm', ['run', 'security:audit'],
      { cwd: path.join(checkout, 'backend'), env, label: 'dependency security audit' },
    );
    commands.secretScan = await commandProof(
      'pnpm', ['run', 'security:secrets'],
      {
        cwd: path.join(checkout, 'backend'),
        env,
        label: 'repository secret scan',
        sensitiveOutput: true,
      },
    );
    commands.postgresRunner = await commandProof(
      'pnpm', ['run', 'test:postgres:local'],
      { cwd: path.join(checkout, 'backend'), env, label: 'isolated PostgreSQL runner' },
    );
    commands.fullTechnicalRegression = await commandProof(
      'bash', ['scripts/technical_regression_check.sh'],
      { cwd: checkout, env, label: 'analyzer Flutter Web Wasm Android technical gate' },
    );

    const builtApk = path.join(checkout, 'build/app/outputs/flutter-apk/app-debug.apk');
    if (!await exists(builtApk)) fail('r10_first_debug_apk_missing');
    const firstApk = path.join(artifacts, 'app-debug-first.apk');
    const secondApk = path.join(artifacts, 'app-debug-second.apk');
    await cp(builtApk, firstApk);
    commands.secondAndroidBuild = await commandProof(
      './android/gradlew',
      ['-p', 'android', ':app:assembleDebug', '--rerun-tasks', '--no-daemon', '--warning-mode', 'all'],
      { cwd: checkout, env, label: 'second equivalent Android debug build' },
    );
    await cp(builtApk, secondApk);
    const firstInventory = await apkInventory(firstApk, path.join(artifacts, 'first-extracted'));
    const secondInventory = await apkInventory(secondApk, path.join(artifacts, 'second-extracted'));
    const reproduction = compareApkInventories(firstInventory, secondInventory);
    if (!reproduction.knownEquivalent) fail('r10_equivalent_apk_payload_drift');
    const android = await androidCharacteristics(checkout, secondApk, aapt);

    const afterInventories = await sourceInventories(checkout);
    const sourceComparison = compareSourceInventories(beforeInventories, afterInventories);
    const finalStatus = (await runCommand(
      'git', ['-C', checkout, 'status', '--porcelain'], { label: 'final clean checkout status' },
    )).stdout.trim();
    if (finalStatus !== '') fail('r10_build_changed_tracked_checkout');
    const afterFootprint = await generatedFootprint(checkout, cacheRoot);
    process.stdout.write(
      `[R10] generated footprint: project=${afterFootprint.projectGeneratedKiB} KiB, `
        + `isolated-caches=${afterFootprint.isolatedPackageCachesKiB} KiB\n`,
    );
    const footprintBounds = validateR10GeneratedFootprint(afterFootprint);

    evidence = {
      schemaVersion: 1,
      kind: 'sit-48h-r10-clean-reproducibility',
      status: 'verified-local-clean-checkout-ci-pending',
      observedOn,
      source: {
        branch: git.branch,
        implementationHead: git.head,
        checkoutHead,
        sourceTrackedTreeClean: true,
        isolatedCheckoutInitiallyClean: true,
        isolatedCheckoutFinallyClean: true,
      },
      boundaries: {
        localIsolatedCheckoutOnly: true,
        productionChanged: false,
        vpsChanged: false,
        cloudChanged: false,
        firebaseProjectChanged: false,
        storeChanged: false,
        paymentChanged: false,
        accountChanged: false,
        credentialsReadOrExtracted: false,
        privateInputsCopied: false,
        apiBillingUsed: false,
        pullRequestMerged: false,
      },
      cleanCheckout: {
        mechanism: 'local-git-clone-no-hardlinks-detached-head',
        dependencyCaches: 'fresh-bounded-temp-directories',
        undocumentedMachineCacheRequired: false,
        privateInputs,
      },
      toolchain,
      sourceComparison,
      commands,
      generatedFootprint: {
        before: beforeFootprint,
        after: afterFootprint,
        ...footprintBounds,
      },
      android: {
        buildType: 'debug',
        buildAttempts: 2,
        first: {
          bytes: firstInventory.bytes,
          sha256: firstInventory.sha256,
          payloadInventorySha256: firstInventory.payloadInventorySha256,
          entries: firstInventory.entries.length,
        },
        second: {
          bytes: secondInventory.bytes,
          sha256: secondInventory.sha256,
          payloadInventorySha256: secondInventory.payloadInventorySha256,
          entries: secondInventory.entries.length,
        },
        reproduction,
        knownNondeterminism: reproduction.classification === 'd8-synthetic-checksum-metadata-only'
          ? {
              mechanism: 'D8 synthetic-class checksum metadata',
              normalizedBytes: [
                'DEX header checksum and SHA-1 signature bytes 8-31',
                'nine-hex-digit values in the embedded D8 synthetic-class checksum map',
              ],
              affectedEntries: reproduction.knownD8MetadataOnlyEntries,
              rawBinaryIdentityClaimed: false,
            }
          : null,
        ...android,
      },
      ciAndCodeql: {
        localCodeqlClaimed: false,
        exactGithubVerification: 'pending',
      },
      limitations: {
        debugArtifactOnly: true,
        signedInternalArtifactBuilt: false,
        binaryIdentityClaimedOnlyWhenRawShaMatches: reproduction.byteIdentical,
        knownMetadataClassificationRequiresExactNormalizedEntryMatch: true,
        retainedBuildArtifact: false,
      },
      cleanup: {
        tempCheckoutRemoved: true,
        isolatedDependencyCachesRemoved: true,
        apkCopiesRemoved: true,
      },
      nextPackage: 'R11',
    };
  } finally {
    await rm(assertSafeR10TempRoot(tempRoot), { recursive: true, force: true });
    cleanupComplete = !await exists(tempRoot);
  }
  if (!cleanupComplete || evidence === undefined) fail('r10_cleanup_incomplete');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  process.stdout.write(
    `R10 clean reproducibility passed: head=${evidence.source.implementationHead}, `
      + `apk=${evidence.android.reproduction.classification}, next=R11\n`,
  );
  return evidence;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail(`invalid_argument:${key ?? '<end>'}`);
    values[key.slice(2)] = value;
  }
  return values;
}

if (process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  await executeR10CleanReproducibility({
    sourceRoot: args['source-root'] ?? repositoryRoot,
    sourceBranch: args['source-branch'],
    output: args.output,
    observedOn: args['observed-on'],
  });
}
