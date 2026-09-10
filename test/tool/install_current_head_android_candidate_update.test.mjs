import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  installCurrentHeadAndroidCandidateUpdate,
  parseCurrentHeadAndroidCandidateUpdateArguments,
  parseAndroidInstalledPackageSnapshot,
  preflightCurrentHeadAndroidCandidateUpdate,
  validateRolloverAndroidInstallBinding,
} from '../../tool/install_current_head_android_candidate_update.mjs';

const certificate = 'a'.repeat(64);
const beforeApk = Buffer.from('previous-signed-apk');
const afterApk = Buffer.from('new-signed-apk');
const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026082302',
  commit: 'b'.repeat(40),
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  apkSha256: createHash('sha256').update(afterApk).digest('hex'),
  signingCertificateSha256: certificate,
  privacyScan: 'passed',
  apkPath: '/private/current-head.apk',
});
const device = Object.freeze({ serial: 'sanitized-test-device' });
const deviceSummary = Object.freeze({
  platform: 'android',
  physical: true,
  model: 'Pixel test',
  containsRawDeviceIdentifier: false,
});

function packageDump(buildNumber, ceDataInode = '4242') {
  return [
    `  versionCode=${buildNumber} minSdk=23 targetSdk=35`,
    '  versionName=1.0.0',
    `  User 0: ceDataInode=${ceDataInode} deDataInode=2121 installed=true`,
    '    dataDir=/data/user/0/com.shareittoo.app',
    '    firstInstallTime=2026-08-01 12:34:56',
  ].join('\n');
}

function fixture({
  beforeBuild = '2026082301',
  afterInode = '4242',
  installResult = 'Success',
} = {}) {
  let installed = false;
  const commands = [];
  const commandRunner = (_file, args, options = {}) => {
    const adbArgs = args.slice(2);
    commands.push(adbArgs);
    if (adbArgs.join(' ') === 'shell dumpsys window policy') return 'keyguardShowing=false';
    if (adbArgs.join(' ') === 'shell am get-current-user') return '0';
    if (adbArgs.join(' ') === 'shell dumpsys package com.shareittoo.app') {
      return installed
        ? packageDump(candidate.buildNumber, afterInode)
        : packageDump(beforeBuild);
    }
    if (adbArgs.join(' ') === 'shell pm path com.shareittoo.app') {
      return 'package:/data/app/shareittoo/base.apk';
    }
    if (adbArgs.join(' ') === 'exec-out cat /data/app/shareittoo/base.apk') {
      return installed ? afterApk : beforeApk;
    }
    if (adbArgs[0] === 'install') {
      installed = true;
      return installResult;
    }
    if (adbArgs.join(' ') === 'shell am start -W -n com.shareittoo.app/.MainActivity') {
      return [
        'Starting: Intent { cmp=com.shareittoo.app/.MainActivity }',
        'Status: ok',
        'Activity: com.shareittoo.app/.MainActivity',
        'ThisTime: 285',
        'TotalTime: 285',
        'WaitTime: 288',
        'Complete',
      ].join('\n');
    }
    if (adbArgs.join(' ') === 'shell dumpsys activity activities') {
      return 'mResumedActivity: ActivityRecord com.shareittoo.app/.MainActivity';
    }
    throw new Error(`Unexpected command: ${adbArgs.join(' ')}, binary=${options.binary}`);
  };
  return { commandRunner, commands };
}

test('parses the exact package facts required to prove update preservation', () => {
  assert.deepEqual(parseAndroidInstalledPackageSnapshot(packageDump('2026082301')), {
    versionName: '1.0.0',
    buildNumber: '2026082301',
    firstInstallTime: '2026-08-01 12:34:56',
    ceDataInode: '4242',
  });
  assert.throws(
    () => parseAndroidInstalledPackageSnapshot('versionName=1.0.0\nversionCode=1'),
    /preservation facts/,
  );
  assert.throws(
    () => parseAndroidInstalledPackageSnapshot([
      'versionCode=2026082301 minSdk=24 targetSdk=35',
      'versionName=1.0.0',
      'User 10: ceDataInode=4242 installed=true',
      '  firstInstallTime=2026-08-01 12:34:56',
    ].join('\n'), '0'),
    /preservation facts/,
  );
});

test('requires an explicit read-only preflight or install mode for the device CLI', () => {
  assert.deepEqual(
    parseCurrentHeadAndroidCandidateUpdateArguments(['--preflight-only']),
    {
      candidateDirectory: undefined,
      adbPath: 'adb',
      apksignerPath: undefined,
      mode: 'preflight',
    },
  );
  assert.deepEqual(
    parseCurrentHeadAndroidCandidateUpdateArguments(['--install', '--adb', '/safe/adb']),
    {
      candidateDirectory: undefined,
      adbPath: '/safe/adb',
      apksignerPath: undefined,
      mode: 'install',
    },
  );
  assert.throws(
    () => parseCurrentHeadAndroidCandidateUpdateArguments([]),
    /preflight-only.*install/u,
  );
  assert.throws(
    () => parseCurrentHeadAndroidCandidateUpdateArguments(['--preflight-only', '--install']),
    /exactly one/u,
  );
});

test('installs only a strictly newer signed candidate and proves app data identity', () => {
  const data = fixture();
  const evidence = installCurrentHeadAndroidCandidateUpdate({
    commandRunner: data.commandRunner,
    device,
    deviceSummary,
    candidate,
    certificateInspector: () => certificate,
    capturedAt: '2026-08-23T12:00:00.000Z',
  });
  assert.equal(evidence.status, 'passed-data-preserving-direct-update');
  assert.equal(evidence.update.firstInstallTimePreserved, true);
  assert.equal(evidence.update.ceDataInodePreserved, true);
  assert.equal(evidence.boundaries.uninstallUsed, false);
  assert.equal(evidence.boundaries.dataResetUsed, false);
  assert.deepEqual(
    data.commands.find((args) => args[0] === 'install'),
    ['install', '--no-streaming', '-r', candidate.apkPath],
  );
  assert.equal(JSON.stringify(evidence).includes(device.serial), false);
  assert.equal(JSON.stringify(evidence).includes('/private/'), false);
});

test('preflight proves update eligibility without writing to the device', () => {
  const data = fixture();
  const evidence = preflightCurrentHeadAndroidCandidateUpdate({
    commandRunner: data.commandRunner,
    device,
    candidate,
    certificateInspector: () => certificate,
    capturedAt: '2026-08-24T12:00:00.000Z',
  });
  assert.equal(evidence.status, 'eligible-no-device-write-performed');
  assert.equal(evidence.conditions.exactPackageIdentity, true);
  assert.equal(evidence.conditions.deviceAlreadyUnlocked, true);
  assert.equal(evidence.boundaries.deviceWritePerformed, false);
  assert.equal(data.commands.some((args) => args[0] === 'install'), false);
  assert.equal(JSON.stringify(evidence).includes(device.serial), false);
  assert.equal(JSON.stringify(evidence).includes(certificate), false);
});

test('rejects a non-newer build before any install command', () => {
  const data = fixture({ beforeBuild: candidate.buildNumber });
  assert.throws(
    () => installCurrentHeadAndroidCandidateUpdate({
      commandRunner: data.commandRunner,
      device,
      deviceSummary,
      candidate,
      certificateInspector: () => certificate,
    }),
    /strictly newer/,
  );
  assert.equal(data.commands.some((args) => args[0] === 'install'), false);
});

test('fails closed when Android app data identity changes', () => {
  const data = fixture({ afterInode: '9999' });
  assert.throws(
    () => installCurrentHeadAndroidCandidateUpdate({
      commandRunner: data.commandRunner,
      device,
      deviceSummary,
      candidate,
      certificateInspector: () => certificate,
    }),
    /data identity changed/,
  );
});

test('rejects a candidate signed by a different certificate before install', () => {
  const data = fixture();
  assert.throws(
    () => installCurrentHeadAndroidCandidateUpdate({
      commandRunner: data.commandRunner,
      device,
      deviceSummary,
      candidate,
      certificateInspector: () => 'f'.repeat(64),
    }),
    /does not match the verified private archive/,
  );
  assert.equal(data.commands.some((args) => args[0] === 'install'), false);
});

function rolloverFixture() {
  return {
    schemaVersion: 1,
    kind: 'android-current-rollover-candidate',
    status: 'build-ready-play-internal-upload-pending',
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      versionCode: candidate.buildNumber,
      artifactSourceHead: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
    },
    artifact: {
      apkSha256: candidate.apkSha256,
      aabSha256: 'c'.repeat(64),
      uploadCertificateSha256: candidate.signingCertificateSha256,
    },
  };
}

test('accepts the exact current rollover archive after evidence-only commits', () => {
  const archive = { ...candidate, aabSha256: 'c'.repeat(64) };
  assert.equal(validateRolloverAndroidInstallBinding({
    rollover: rolloverFixture(),
    candidate: archive,
    sourceIsAncestor: true,
    changedPaths: ['docs/current_state.md', 'store/google-play/current-rollover-candidate.json'],
  }), archive);
});

test('rejects superseded bytes, non-ancestor sources and post-build runtime drift', () => {
  const archive = { ...candidate, aabSha256: 'c'.repeat(64) };
  assert.throws(() => validateRolloverAndroidInstallBinding({
    rollover: rolloverFixture(),
    candidate: { ...archive, apkSha256: 'd'.repeat(64) },
    sourceIsAncestor: true,
  }), /does not match/u);
  assert.throws(() => validateRolloverAndroidInstallBinding({
    rollover: rolloverFixture(),
    candidate: archive,
    sourceIsAncestor: false,
  }), /not eligible/u);
  assert.throws(() => validateRolloverAndroidInstallBinding({
    rollover: rolloverFixture(),
    candidate: archive,
    sourceIsAncestor: true,
    changedPaths: ['lib/main.dart'],
  }), /Runtime-affecting/u);
});
