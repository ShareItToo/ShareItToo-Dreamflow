import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseOnePlusOwnerSmokeArguments,
  runOnePlusPlayInternalOwnerSmoke,
} from '../../tool/run_oneplus_play_internal_owner_smoke.mjs';

const device = {
  serial: '192.0.2.44:39211',
  state: 'device',
  attributes: { model: 'CPH2581' },
};
const expectedCandidate = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  versionCode: '2026082601',
  minSdk: 24,
  targetSdk: 35,
  artifactSourceHead: 'a1aa3f2528f1923c092a1fb15bdd3dc083673890',
  aabSha256: '8cf36552f39fe9558411809518b374c437125cbd6ef123258ad9df7061acd873',
};

function fakeRunner({
  locked = false,
  versionCode = expectedCandidate.versionCode,
  installer = 'com.android.vending',
  changePidOnWarm = false,
  continuityAfter = 'unchanged',
} = {}) {
  const calls = [];
  let running = true;
  let foreground = false;
  let pid = '987654321';
  let starts = 0;
  let packageReads = 0;
  const runner = (_file, args) => {
    calls.push(args);
    const command = args.slice(2).join(' ');
    if (command === 'shell getprop ro.product.manufacturer') return 'OnePlus\n';
    if (command === 'shell getprop ro.product.model') return 'CPH2581\n';
    if (command === 'shell getprop ro.build.version.release') return '16\n';
    if (command === 'shell getprop ro.build.version.sdk') return '36\n';
    if (command === 'shell getprop ro.build.version.security_patch') return '2026-08-05\n';
    if (command === 'shell dumpsys package com.shareittoo.app') {
      packageReads += 1;
      const inode = continuityAfter === 'changed' && packageReads >= 3 ? '999' : '456';
      return `versionCode=${versionCode} minSdk=24 targetSdk=35\n`
        + 'versionName=1.0.0\n'
        + 'firstInstallTime=2026-08-26 18:00:00\n'
        + `ceDataInode=${inode}\n`;
    }
    if (command === 'shell pm path com.shareittoo.app') {
      return 'package:/data/app/example/base.apk\n'
        + 'package:/data/app/example/split_config.arm64_v8a.apk\n';
    }
    if (command === 'shell pm list packages -i com.shareittoo.app') {
      return `package:com.shareittoo.app installer=${installer}\n`;
    }
    if (command === 'shell dumpsys window policy') {
      return locked ? 'keyguardShowing=true\n' : 'keyguardShowing=false\n';
    }
    if (command === 'shell pidof com.shareittoo.app') {
      if (!running) throw new Error('not running');
      return `${pid}\n`;
    }
    if (command === 'shell am force-stop com.shareittoo.app') {
      running = false;
      foreground = false;
      return '';
    }
    if (command === 'shell am start -W -n com.shareittoo.app/.MainActivity') {
      starts += 1;
      running = true;
      foreground = true;
      if (changePidOnWarm && starts === 2) pid = '987654322';
      return 'Status: ok\nActivity: com.shareittoo.app/.MainActivity\n';
    }
    if (command === 'shell dumpsys activity activities') {
      return foreground
        ? 'topResumedActivity=ActivityRecord{abc com.shareittoo.app/.MainActivity}\n'
        : 'topResumedActivity=ActivityRecord{abc com.android.launcher/.Launcher}\n';
    }
    if (command === 'shell input keyevent 3') {
      foreground = false;
      return '';
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  return { runner, calls };
}

function execute(fake, overrides = {}) {
  return runOnePlusPlayInternalOwnerSmoke({
    commandRunner: fake.runner,
    device,
    expectedCandidate,
    releaseGoConfirmed: true,
    ownerWindowConfirmed: true,
    capturedAt: '2026-08-27T02:00:00.000Z',
    ...overrides,
  });
}

test('requires both exact owner gates before a future CLI can query ADB', () => {
  assert.throws(() => parseOnePlusOwnerSmokeArguments([]), /both exact gates/u);
  assert.throws(() => parseOnePlusOwnerSmokeArguments([
    '--confirm-release-go', 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
  ]), /both exact gates/u);
  assert.throws(() => parseOnePlusOwnerSmokeArguments([
    '--confirm-release-go', 'WRONG',
    '--confirm-owner-window', 'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
  ]), /exact Google Play Internal release gate/u);
  assert.throws(() => parseOnePlusOwnerSmokeArguments([
    '--confirm-release-go', 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    '--confirm-owner-window', 'WRONG',
  ]), /exact personal-device owner-window gate/u);
  assert.deepEqual(parseOnePlusOwnerSmokeArguments([
    '--confirm-release-go', 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    '--confirm-owner-window', 'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
    '--adb', '/opt/android/adb',
  ]), {
    adbPath: '/opt/android/adb',
    releaseGoConfirmed: true,
    ownerWindowConfirmed: true,
  });
});

test('refuses programmatic ADB access unless both gates are true', () => {
  for (const authorization of [
    {},
    { releaseGoConfirmed: true },
    { ownerWindowConfirmed: true },
  ]) {
    const fake = fakeRunner();
    assert.throws(() => runOnePlusPlayInternalOwnerSmoke({
      commandRunner: fake.runner,
      device,
      expectedCandidate,
      ...authorization,
    }), /not authorized/u);
    assert.equal(fake.calls.length, 0);
  }
});

test('runs only the bounded process lifecycle and emits sanitized evidence', () => {
  const fake = fakeRunner();
  const result = execute(fake);
  assert.equal(result.status, 'passed-bounded-nondestructive-process-lifecycle-smoke');
  assert.equal(result.candidate.versionCode, '2026082601');
  assert.equal(result.candidate.installerPackageName, 'com.android.vending');
  assert.equal(result.observations.coldStartToForeground, 'passed');
  assert.equal(result.observations.foregroundResumeSameProcess, 'passed');
  assert.equal(result.boundaries.appLaunched, true);
  assert.equal(result.boundaries.processStopped, true);
  assert.equal(result.boundaries.homeKeyPressed, true);
  assert.equal(result.boundaries.appInstalledOrUpdated, false);
  assert.equal(result.boundaries.accountContentInspected, false);
  assert.equal(result.limitations.functionalScreenBehaviorClaimed, false);
  assert.equal(result.limitations.authenticatedSessionClaimed, false);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(device.serial), false);
  assert.equal(serialized.includes('987654321'), false);
  for (const forbidden of [
    ' install ', 'uninstall', 'pm clear', 'settings put', 'settings delete',
    'uiautomator', 'logcat', 'screencap', 'input tap', 'input text',
  ]) {
    assert.equal(
      fake.calls.some((args) => ` ${args.join(' ')} `.includes(forbidden)),
      false,
    );
  }
});

test('fails before process mutation for a locked phone or wrong candidate', () => {
  for (const fake of [
    fakeRunner({ locked: true }),
    fakeRunner({ versionCode: '2026081509' }),
    fakeRunner({ installer: 'com.example.sideload' }),
  ]) {
    assert.throws(() => execute(fake));
    assert.equal(fake.calls.some((args) => args.includes('force-stop')), false);
    assert.equal(fake.calls.some((args) => args.includes('start')), false);
  }
});

test('fails closed on process or continuity drift without recording a pass', () => {
  assert.throws(
    () => execute(fakeRunner({ changePidOnWarm: true })),
    /warm start did not preserve/u,
  );
  assert.throws(
    () => execute(fakeRunner({ continuityAfter: 'changed' })),
    /app-data identity changed/u,
  );
});
