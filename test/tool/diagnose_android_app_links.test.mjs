import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  diagnoseAndroidAppLinks,
  parseArguments,
} from '../../tool/diagnose_android_app_links.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const installedApk = Buffer.from('exact installed candidate');
const candidate = {
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026081018',
  commit: 'a'.repeat(40),
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: { apkSha256: digest(installedApk) },
};
const archive = { apkSha256: digest(installedApk) };
const deviceSummary = {
  platform: 'android',
  physical: true,
  manufacturer: 'Sanitized Android',
  model: 'Physical test phone',
  osVersion: '16',
  apiLevel: 36,
  securityPatch: '2026-04-05',
  containsRawDeviceIdentifier: false,
};

function fakeRunner({ locked = false, associateForeignHost = false } = {}) {
  let activeCase = 'guest';
  return (_file, args, options = {}) => {
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell dumpsys window policy') {
      return locked ? 'keyguardShowing=true' : 'keyguardShowing=false';
    }
    if (joined === 'shell pm path com.shareittoo.app') return 'package:/data/app/test/base.apk\n';
    if (joined === 'exec-out cat /data/app/test/base.apk') return installedApk;
    if (joined === 'shell dumpsys package com.shareittoo.app') {
      return '  versionCode=2026081018 minSdk=23 targetSdk=35\n  versionName=1.0.0\n';
    }
    if (command[0] === 'shell' && command[1] === 'am' && command[2] === 'force-stop') return '';
    if (command[0] === 'shell' && command[1] === 'am' && command[2] === 'start') {
      const uri = command.at(-1);
      if (uri.includes('sit-link-diagnostic-missing')) activeCase = 'missing-listing';
      else if (uri.startsWith('shareittoo://chat/')) activeCase = 'guest-chat';
      else if (uri === 'shareittoo://notifications') activeCase = 'authenticated-notifications';
      else if (uri.includes('not%2Fsafe')) activeCase = 'unsafe-id';
      return 'Status: ok\nActivity: com.shareittoo.app/.MainActivity\n';
    }
    if (joined === 'shell uiautomator dump /sdcard/sit-app-link-diagnostic.xml') return 'UI hierarchy dumped';
    if (joined === 'exec-out cat /sdcard/sit-app-link-diagnostic.xml') {
      if (activeCase === 'missing-listing') {
        return '<node content-desc="Anzeige nicht verfügbar"/><node content-desc="Die Anzeige wurde entfernt, pausiert oder ist nicht mehr öffentlich."/><node content-desc="Erneut prüfen"/>';
      }
      if (activeCase === 'guest-chat') {
        return '<node content-desc="Bitte zuerst anmelden"/><node content-desc="Nach der Anmeldung öffnen wir den sicheren Chat-Kontext."/><node content-desc="Anmelden"/>';
      }
      if (activeCase === 'authenticated-notifications') {
        return '<node content-desc="Benachrichtigungen"/><node content-desc="Keine Benachrichtigungen"/>';
      }
      return '<node content-desc="ShareItToo"/><node content-desc="Entdecken"/>';
    }
    if (joined === 'shell rm -f /sdcard/sit-app-link-diagnostic.xml') return '';
    if (command[0] === 'shell' && command[1] === 'cmd' && command[2] === 'package') {
      return associateForeignHost ? 'com.shareittoo.app/.MainActivity' : 'com.android.browser/.BrowserActivity';
    }
    if (command[0] === 'shell' && command[1] === 'monkey') return 'Events injected: 1';
    throw new Error(`Unexpected fake ADB command (${options.binary ? 'binary' : 'text'}): ${joined}`);
  };
}

function diagnose(overrides = {}) {
  return diagnoseAndroidAppLinks({
    commandRunner: fakeRunner(),
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    deviceSummary,
    candidate,
    archive,
    capturedAt: '2026-08-10T06:00:00.000Z',
    wait: async () => {},
    ...overrides,
  });
}

test('records four bounded app-link checks without a raw device identifier', async () => {
  const evidence = await diagnose();
  assert.equal(evidence.status, 'passed-bounded-app-link-diagnostic');
  assert.deepEqual(
    Object.values(evidence.tests).map((result) => result.status),
    ['passed', 'passed', 'passed', 'passed'],
  );
  assert.equal(evidence.installed.apkSha256, digest(installedApk));
  assert.equal(evidence.installed.delivery, 'direct-apk');
  assert.equal(evidence.boundaries.storeInstallationGateSatisfied, false);
  assert.equal(evidence.boundaries.authenticatedDeepLinksPassed, false);
  assert.equal(evidence.boundaries.lockCodeUsed, false);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
});

test('refuses to enter or bypass a device passcode', async () => {
  await assert.rejects(
    () => diagnose({ commandRunner: fakeRunner({ locked: true }) }),
    /Unlock it manually; this diagnostic never enters a passcode/,
  );
});

test('rejects a foreign host associated with the ShareItToo package', async () => {
  await assert.rejects(
    () => diagnose({ commandRunner: fakeRunner({ associateForeignHost: true }) }),
    /must not be associated with a foreign web host/,
  );
});

test('rejects a different installed APK even with the same visible version', async () => {
  const changedArchive = { apkSha256: digest(Buffer.from('different candidate')) };
  await assert.rejects(
    () => diagnose({ archive: changedArchive }),
    /Installed ShareItToo APK does not match/,
  );
});

test('preserves an authenticated session across bounded read-only safe links', async () => {
  const evidence = await diagnose({ sessionMode: 'authenticated-preserved' });
  assert.equal(
    evidence.status,
    'passed-bounded-authenticated-safe-app-link-diagnostic',
  );
  assert.deepEqual(Object.keys(evidence.tests), [
    'authenticatedNotificationsBefore',
    'verifiedHttpsMissingListing',
    'unsafeIdentifierRejected',
    'foreignHostNotAssociated',
    'authenticatedNotificationsAfter',
  ]);
  assert.equal(evidence.boundaries.authenticatedSafeLinksPassed, true);
  assert.equal(evidence.boundaries.authenticatedFixtureLinksPassed, false);
  assert.equal(evidence.boundaries.accountMutationPerformed, false);
  assert.equal(evidence.boundaries.accountIdentityRecorded, false);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
});

test('parses only the source-bound current-head authenticated route', () => {
  assert.deepEqual(
    parseArguments(['--current-head', '--preserve-authenticated-session']),
    {
      candidateDirectory: null,
      vaultFile: null,
      adbPath: 'adb',
      currentHead: true,
      preserveAuthenticatedSession: true,
    },
  );
  assert.throws(
    () => parseArguments(['--current-head']),
    /must be used together/u,
  );
  assert.throws(
    () => parseArguments([
      '--current-head',
      '--preserve-authenticated-session',
      '--vault-file',
      'private.json',
    ]),
    /never accepts archive or vault overrides/u,
  );
});
