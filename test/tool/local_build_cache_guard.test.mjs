import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { minimumCacheFreeKiB, parseBuildCacheProfile, parseBuildCacheArguments, validateBuildCacheObservation } from '../../tool/run_with_local_build_cache.mjs';

const profile = {
  version: 1,
  mountPoint: '/Volumes/SIT-Build-fixture',
  cacheDirectory: '/Volumes/SIT-Build-fixture/gradle',
  backingDirectory: '/Volumes/External/SIT-build-fixture',
  imagePath: '/Volumes/External/SIT-build-fixture/SIT-Build.sparsebundle',
};
const good = {
  platform: 'darwin', directoriesAreReal: true, ownerOnly: true,
  filesystemType: 'apfs', cacheOnMountedDevice: true, backingOnSeparateDevice: true,
  imagePath: profile.imagePath, mountPoint: profile.mountPoint,
  cacheFreeKiB: minimumCacheFreeKiB, backingFreeKiB: minimumCacheFreeKiB,
};

test('profile accepts only exact dedicated locations and fixed schema', () => {
  assert.deepEqual(parseBuildCacheProfile(profile), profile);
  for (const change of [
    { version: 2 }, { command: 'unexpected' }, { cacheDirectory: '/Users/owner/.gradle' },
    { mountPoint: '/Volumes' }, { imagePath: '/Volumes/unrelated.sparsebundle' },
    { backingDirectory: '/Volumes/SIT-Build-fixture/backing', imagePath: '/Volumes/SIT-Build-fixture/backing/file.sparsebundle' },
    { imagePath: '/Volumes/External/SIT-build-fixture/../other.sparsebundle' },
    { cacheDirectory: 'relative' },
  ]) assert.throws(() => parseBuildCacheProfile({ ...profile, ...change }));
});

test('exact verified APFS and physical backing reserves are both required', () => {
  assert.deepEqual(validateBuildCacheObservation(profile, good), {
    cacheFreeKiB: minimumCacheFreeKiB, backingFreeKiB: minimumCacheFreeKiB,
  });
  for (const change of [
    { platform: 'linux' }, { directoriesAreReal: false }, { ownerOnly: false },
    { filesystemType: 'exfat' }, { cacheOnMountedDevice: false },
    { backingOnSeparateDevice: false }, { imagePath: null }, { mountPoint: null },
    { imagePath: '/Volumes/other.sparsebundle' }, { mountPoint: '/Volumes/other' },
    { cacheFreeKiB: minimumCacheFreeKiB - 1 }, { backingFreeKiB: minimumCacheFreeKiB - 1 },
    { cacheFreeKiB: NaN }, { backingFreeKiB: Infinity },
  ]) assert.throws(() => validateBuildCacheObservation(profile, { ...good, ...change }));
});

test('commands remain argument arrays and cannot come from the profile', () => {
  const args = parseBuildCacheArguments(['--profile', '/private/profile.json', '--', 'node', '-e', 'literal; argument']);
  assert.equal(args.command, 'node');
  assert.deepEqual(args.args, ['-e', 'literal; argument']);
  for (const bad of [[], ['--profile', '/p'], ['--profile', '/p', '--'], ['--profile', '/p', 'node']])
    assert.throws(() => parseBuildCacheArguments(bad));
});

test('runner owns only child environment and validates again after completion', () => {
  const source = readFileSync(new URL('../../tool/run_with_local_build_cache.mjs', import.meta.url), 'utf8');
  assert.match(source, /GRADLE_USER_HOME: profile.cacheDirectory/u);
  assert.match(source, /shell: false/u);
  assert.equal([...source.matchAll(/validateBuildCacheObservation\(profile, observeCache\(profile\)\)/gu)].length, 2);
  assert.doesNotMatch(source, /rmSync|unlinkSync|writeFileSync|chmodSync|createKey|process\.env\.GRADLE_USER_HOME\s*=/u);
  assert.match(source, /result\.signal \|\| result\.code === null \? 1 : result\.code/u);
});

test('unsafe or missing profile fails before child execution without printing contents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sit-build-cache-cli-'));
  try {
    const regular = join(directory, 'profile.json');
    const link = join(directory, 'profile-link.json');
    const runner = fileURLToPath(new URL('../../tool/run_with_local_build_cache.mjs', import.meta.url));
    const rejected = (candidate) => {
      const result = spawnSync(process.execPath, [runner, '--profile', candidate, '--', process.execPath,
        '-e', 'process.stdout.write("unexpected-child-execution")'], { encoding: 'utf8', timeout: 5_000 });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, 'SIT build-cache guard failed; no fallback to the global cache.\n');
    };
    writeFileSync(regular, JSON.stringify(profile), { mode: 0o644 });
    rejected(regular);
    chmodSync(regular, 0o600);
    symlinkSync(regular, link);
    rejected(link);
    rejected(join(directory, 'missing.json'));
    writeFileSync(regular, 'synthetic-invalid-profile-content');
    rejected(regular);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
