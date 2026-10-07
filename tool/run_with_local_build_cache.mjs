#!/usr/bin/env node
// Optional Mac-mini build-host profile. No credential copying, cache deletion,
// volume creation, mount operation or global environment/configuration change.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statfsSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const minimumCacheFreeKiB = 5 * 1024 * 1024;
const root = fileURLToPath(new URL('..', import.meta.url));
const fail = (message) => { throw new Error(message); };
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith(`..${path.sep}`)
    && relative !== '..' && !path.isAbsolute(relative);
};

export function parseBuildCacheProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_build_cache_profile');
  if (![1, 2].includes(value.version)) fail('unsupported_build_cache_profile_version');
  const keys = ['version', 'cacheDirectory', 'mountPoint', 'imagePath', 'backingDirectory',
    ...(value.version === 2 ? ['androidSdkDirectory', 'flutterConfigDirectory'] : [])];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    fail('unexpected_build_cache_profile_fields');
  for (const key of keys.slice(1)) {
    if (typeof value[key] !== 'string' || !path.isAbsolute(value[key])
        || path.normalize(value[key]) !== value[key] || /[\r\n\0]/u.test(value[key]))
      fail('invalid_build_cache_path');
  }
  if (path.dirname(value.mountPoint) !== '/Volumes'
      || !path.basename(value.mountPoint).startsWith('SIT-Build-')) fail('unexpected_build_cache_mount');
  if (value.cacheDirectory !== path.join(value.mountPoint, 'gradle')) fail('unexpected_build_cache_directory');
  if (!inside('/Volumes', value.backingDirectory)
      || !inside(value.backingDirectory, value.imagePath)
      || !value.imagePath.endsWith('.sparsebundle')
      || inside(value.mountPoint, value.backingDirectory)) fail('invalid_build_cache_backing');
  if (value.version === 2 && (!inside(value.mountPoint, value.androidSdkDirectory)
      || value.androidSdkDirectory === value.cacheDirectory
      || inside(value.cacheDirectory, value.androidSdkDirectory)
      || [value.androidSdkDirectory, value.cacheDirectory].some((directory) =>
        directory === value.flutterConfigDirectory || inside(directory, value.flutterConfigDirectory)
        || inside(value.flutterConfigDirectory, directory)))) fail('invalid_scoped_android_paths');
  return Object.freeze({ ...value });
}

function optionalInfo(location) {
  try { return lstatSync(location); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function scopedSettingsDigest(profile, environment) {
  if (!environment.HOME || !path.isAbsolute(environment.HOME)) fail('missing_android_build_home');
  // Flutter 3.41 uses this legacy file before XDG, even when both SDK variables
  // are set. Refuse it; never move, delete, read or rewrite the user's settings.
  if (optionalInfo(path.join(environment.HOME, '.flutter_settings')))
    fail('global_flutter_settings_override_scoped_config');
  if ([environment.HOME, path.join(environment.HOME, '.config', 'flutter')]
    .includes(profile.flutterConfigDirectory)) fail('global_flutter_config_not_scoped');
  for (const directory of [profile.androidSdkDirectory, profile.flutterConfigDirectory]) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(directory) !== directory
        || info.uid !== process.getuid() || (info.mode & 0o077) !== 0)
      fail('unsafe_scoped_android_directory');
  }
  const location = path.join(profile.flutterConfigDirectory, 'settings');
  const info = optionalInfo(location);
  if (!info) return null; // Empty isolated config deliberately uses the SDK env.
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()
      || (info.mode & 0o022) !== 0 || info.size > 1024 * 1024)
    fail('unsafe_scoped_flutter_settings');
  const contents = readFileSync(location);
  // Flutter deletes malformed settings on read. Reject locally before invoking
  // it, and never print config output (which can contain unrelated user values).
  const value = JSON.parse(contents.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_scoped_flutter_settings');
  return createHash('sha256').update(contents).digest('hex');
}

function readFlutterConfiguration(environment) {
  return execFileSync('flutter', ['config', '--machine'], {
    cwd: root, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000, maxBuffer: 1024 * 1024,
  });
}

export function prepareBuildEnvironment(profile, environment = process.env, probeConfig = readFlutterConfiguration) {
  const env = { ...environment, GRADLE_USER_HOME: profile.cacheDirectory };
  if (profile.version === 1) return { env, settingsDigest: null };
  env.ANDROID_HOME = profile.androidSdkDirectory;
  env.ANDROID_SDK_ROOT = profile.androidSdkDirectory;
  env.XDG_CONFIG_HOME = profile.flutterConfigDirectory;
  const settingsDigest = scopedSettingsDigest(profile, env);
  const config = JSON.parse(probeConfig(env));
  if (!config || typeof config !== 'object' || Array.isArray(config)
      || config['android-sdk'] !== profile.androidSdkDirectory) fail('effective_flutter_sdk_mismatch');
  if (scopedSettingsDigest(profile, env) !== settingsDigest) fail('scoped_flutter_settings_changed');
  return { env, settingsDigest };
}

export function validateBuildCacheObservation(profile, observation) {
  if (observation.platform !== 'darwin') fail('build_cache_requires_macos');
  if (!observation.directoriesAreReal || !observation.ownerOnly) fail('unsafe_build_cache_directory');
  if (observation.filesystemType !== 'apfs' || !observation.cacheOnMountedDevice)
    fail('build_cache_requires_exact_apfs_mount');
  if (observation.imagePath !== profile.imagePath || observation.mountPoint !== profile.mountPoint)
    fail('build_cache_image_mount_mismatch');
  if (!observation.backingOnSeparateDevice) fail('build_cache_backing_device_mismatch');
  for (const key of ['cacheFreeKiB', 'backingFreeKiB']) {
    if (!Number.isSafeInteger(observation[key]) || observation[key] < minimumCacheFreeKiB)
      fail('insufficient_build_cache_capacity');
  }
  return { cacheFreeKiB: observation.cacheFreeKiB, backingFreeKiB: observation.backingFreeKiB };
}

function plist(command, args) {
  try {
    const xml = execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 });
    return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], {
      input: xml, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000, encoding: 'utf8',
    }));
  } catch { fail('build_cache_disk_inventory_unavailable'); }
}

function freeKiB(directory) {
  const info = statfsSync(directory);
  return Math.floor(info.bavail * info.bsize / 1024);
}

export function observeBuildCache(profile) {
  if (process.platform !== 'darwin') fail('build_cache_requires_macos');
  const mount = lstatSync(profile.mountPoint);
  const cache = lstatSync(profile.cacheDirectory);
  const image = lstatSync(profile.imagePath);
  const backing = lstatSync(profile.backingDirectory);
  const real = [profile.mountPoint, profile.cacheDirectory, profile.imagePath, profile.backingDirectory]
    .every((entry) => realpathSync(entry) === entry);
  const disk = plist('/usr/sbin/diskutil', ['info', '-plist', profile.mountPoint]);
  const images = plist('/usr/bin/hdiutil', ['info', '-plist']);
  const matching = (images.images ?? []).find((entry) => entry['image-path'] === profile.imagePath
    && (entry['system-entities'] ?? []).some((entity) => entity['mount-point'] === profile.mountPoint));
  return {
    platform: process.platform,
    directoriesAreReal: real && [mount, cache, image, backing].every((entry) => entry.isDirectory() && !entry.isSymbolicLink()),
    ownerOnly: [mount, cache].every((entry) => entry.uid === process.getuid() && (entry.mode & 0o077) === 0),
    filesystemType: disk.FilesystemType,
    cacheOnMountedDevice: cache.dev === mount.dev && disk.MountPoint === profile.mountPoint,
    backingOnSeparateDevice: backing.dev !== mount.dev && statSync(profile.imagePath).dev === backing.dev,
    imagePath: matching?.['image-path'] ?? null,
    mountPoint: matching ? profile.mountPoint : null,
    cacheFreeKiB: freeKiB(profile.cacheDirectory),
    backingFreeKiB: freeKiB(profile.backingDirectory),
  };
}

export function parseBuildCacheArguments(args) {
  if (args[0] !== '--profile' || !args[1] || args[2] !== '--' || args.length < 4)
    fail('usage: --profile <owner-only-json> -- <command> [arguments]');
  return { profilePath: path.resolve(args[1]), command: args[3], args: args.slice(4) };
}

function readOwnerOnlyBuildProfile(profilePath) {
  let descriptor;
  try {
    descriptor = openSync(
      profilePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0
        || info.size < 2 || info.size > 64 * 1024) {
      fail('unsafe_build_cache_profile_file');
    }
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function spawnBuildChild(request, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(request.command, request.args, {
      cwd: root, env: environment, stdio: 'inherit', shell: false,
    });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    const remove = () => { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); };
    child.once('error', (error) => { remove(); reject(error); });
    child.once('close', (code, signal) => { remove(); resolve({ code, signal }); });
  });
}

export async function runBuildCacheCommand(profile, request, {
  environment = process.env, observeCache = observeBuildCache,
  probeConfig = readFlutterConfiguration, runChild = spawnBuildChild,
  report = (message) => process.stdout.write(message),
} = {}) {
  const before = validateBuildCacheObservation(profile, observeCache(profile));
  const prepared = prepareBuildEnvironment(profile, environment, probeConfig);
  report(`[SIT build cache] verified dedicated APFS cache; free KiB=${before.cacheFreeKiB}, backing KiB=${before.backingFreeKiB}\n`);
  if (profile.version === 2) report('[SIT build cache] effective scoped Android SDK verified.\n');
  const result = await runChild(request, prepared.env);
  // A disconnected/replaced disk or exhausted sparse backing is not success,
  // even when a child command returned zero. Never fall back to the global home.
  validateBuildCacheObservation(profile, observeCache(profile));
  const after = prepareBuildEnvironment(profile, environment, probeConfig);
  if (after.settingsDigest !== prepared.settingsDigest) fail('scoped_flutter_settings_changed');
  assert.ok(result.code === null || Number.isInteger(result.code));
  return result.signal || result.code === null ? 1 : result.code;
}

async function main(args) {
  const request = parseBuildCacheArguments(args);
  const profile = parseBuildCacheProfile(readOwnerOnlyBuildProfile(request.profilePath));
  process.exitCode = await runBuildCacheCommand(profile, request);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => {
    // Do not relay disk inventory, profile contents or arbitrary child errors.
    process.stderr.write('SIT build-cache guard failed; no fallback to the global cache.\n');
    process.exitCode = 1;
  });
}
