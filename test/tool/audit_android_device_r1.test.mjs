import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditAndroidDeviceR1,
  parseBatteryAudit,
  parseDataStorageAudit,
  parseDebugApkIdentity,
  parseInstalledPackageAudit,
} from '../../tool/audit_android_device_r1.mjs';
import { canonicalAndroidSigningCertificateSha256 } from '../../tool/validate_current_head_android_release_archive.mjs';

const debugCertificate = 'a'.repeat(64);

function commandRunner(_file, args, options = {}) {
  const command = args.slice(2).join(' ');
  if (command === 'shell getprop ro.product.manufacturer') return 'Google\n';
  if (command === 'shell getprop ro.product.model') return 'Pixel 7 Pro\n';
  if (command === 'shell getprop ro.build.version.release') return '17\n';
  if (command === 'shell getprop ro.build.version.sdk') return '37\n';
  if (command === 'shell getprop ro.build.version.security_patch') return '2026-08-05\n';
  if (command === 'shell dumpsys package com.shareittoo.app') {
    return '  versionCode=2026082301 minSdk=24 targetSdk=36\n  versionName=1.0.0\n';
  }
  if (command === 'shell pm path com.shareittoo.app') return 'package:/data/app/base.apk\n';
  if (command === 'exec-out cat /data/app/base.apk' && options.binary === true) {
    return Buffer.from('installed-canonical-apk');
  }
  if (command === 'shell pidof com.shareittoo.app') return '123 456\n';
  if (command === 'shell df -k /data') {
    return 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block 10000000 3000000 7000000 30% /data\n';
  }
  if (command === 'shell dumpsys battery') {
    return 'level: 80\nstatus: 3\ntemperature: 310\n';
  }
  if (command === 'shell getprop sys.boot_completed') return '1\n';
  throw new Error(`Unexpected command: ${command}`);
}

test('parses bounded package, storage, battery and APK identity fields', () => {
  assert.deepEqual(
    parseInstalledPackageAudit('versionCode=2026082301 minSdk=24 targetSdk=36\nversionName=1.0.0\n'),
    { versionName: '1.0.0', versionCode: '2026082301', minSdk: 24, targetSdk: 36 },
  );
  assert.deepEqual(
    parseDataStorageAudit('/dev/block 1000 250 750 25% /data\n'),
    { totalKiB: 1000, availableKiB: 750, usedPercent: 25 },
  );
  assert.deepEqual(
    parseBatteryAudit('level: 80\nstatus: 3\ntemperature: 310\n'),
    { levelPercent: 80, status: 'discharging', temperatureC: 31 },
  );
  assert.deepEqual(
    parseDebugApkIdentity("package: name='com.shareittoo.app' versionCode='2026082302' versionName='1.0.0'"),
    { applicationId: 'com.shareittoo.app', versionCode: '2026082302', versionName: '1.0.0' },
  );
});

test('produces a sanitized read-only audit and blocks the different-signature debug update', () => {
  const result = auditAndroidDeviceR1({
    commandRunner,
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    expectedIdentity: {
      versionName: '1.0.0',
      buildNumber: '2026082302',
      commit: 'b'.repeat(40),
    },
    debugApkPath: '/private/debug.apk',
    certificateInspector: (path) => (
      path.endsWith('/installed.apk')
        ? canonicalAndroidSigningCertificateSha256
        : debugCertificate
    ),
    debugIdentityInspector: () => ({
      applicationId: 'com.shareittoo.app',
      versionName: '1.0.0',
      versionCode: '2026082302',
    }),
    capturedAt: '2026-08-24T10:00:00.000Z',
  });

  assert.equal(result.package.installedUsesCanonicalSigning, true);
  assert.equal(result.currentSourceDebugCandidate.signatureMatchesInstalled, false);
  assert.equal(result.installDecision.result, 'PHYSICAL_ACTION_REQUIRED');
  assert.equal(result.installDecision.installAttempted, false);
  assert.equal(result.boundaries.deviceMutationPerformed, false);
  assert.equal(JSON.stringify(result).includes('PRIVATE-SERIAL'), false);
  assert.equal(JSON.stringify(result).includes(canonicalAndroidSigningCertificateSha256), false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});
