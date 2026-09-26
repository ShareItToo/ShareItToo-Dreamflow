import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  diagnoseCurrentHeadAndroidLargeTextMainNavigation,
  parseAndroidFontScale,
  parseLargeTextMainNavigationArguments,
} from '../../tool/diagnose_current_head_android_large_text_main_navigation.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const installedApk = Buffer.from('exact current-head large-text candidate');
const candidate = {
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026082301',
  commit: 'a'.repeat(40),
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: { apkSha256: digest(installedApk) },
};
const deviceSummary = {
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
};
const labels = ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'];

function hierarchy(active, {
  omitMessagesSurface = false,
  profileScrolled = false,
} = {}) {
  const navigation = labels.map((label, index) => (
    `<node text="" content-desc="${label}&#10;Tab ${index + 1} of 5" bounds="[${index * 200},2200][${(index + 1) * 200},2400]"/>`
  )).join('');
  const surface = {
    Entdecken: '<node text="Jetzt suchen" bounds="[0,100][400,200]"/>',
    Mietkorb: '<node content-desc="Gemerkt. Unverbindlich gespeichert. Keine Reservierung." bounds="[0,100][200,200]"/><node text="Dein Mietkorb" bounds="[0,200][400,300]"/>',
    Buchungen: '<node text="Meine Buchungen" bounds="[0,100][400,200]"/>',
    Nachrichten: omitMessagesSurface
      ? ''
      : '<node content-desc="Nachrichten-Einstellungen" bounds="[800,100][900,200]"/><node text="Noch keine Nachrichten" bounds="[0,300][600,400]"/>',
    'Mein SIT': profileScrolled
      ? '<node text="Abmelden" bounds="[0,500][400,600]"/>'
      : '<node text="Meine Anzeigen" bounds="[0,300][400,400]"/><node text="Mietanfragen" bounds="[0,400][400,500]"/>',
  }[active];
  return `<hierarchy>${navigation}${surface}</hierarchy>`;
}

function fakeRunner({
  locked = false,
  omitMessagesSurface = false,
  refuseTargetScale = false,
  refuseRestoration = false,
} = {}) {
  let active = 'Entdecken';
  let profileScrolled = false;
  let fontScale = '0.85';
  const settingsWrites = [];
  let swipeCount = 0;
  const runner = (_file, args, options = {}) => {
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell dumpsys window policy') {
      return locked ? 'mIsShowing=true' : 'mIsShowing=false showing=false';
    }
    if (joined === 'shell settings get system font_scale') return `${fontScale}\n`;
    if (command.slice(0, 5).join(' ') === 'shell settings put system font_scale') {
      const requested = command[5];
      settingsWrites.push(requested);
      if (requested === '2' && !refuseTargetScale) fontScale = requested;
      if (requested !== '2' && !refuseRestoration) fontScale = requested;
      return '';
    }
    if (joined === 'shell settings delete system font_scale') {
      settingsWrites.push('delete');
      if (!refuseRestoration) fontScale = 'null';
      return '';
    }
    if (joined === 'shell pm path com.shareittoo.app') return 'package:/data/app/test/base.apk\n';
    if (joined === 'exec-out cat /data/app/test/base.apk') return installedApk;
    if (joined === 'shell dumpsys package com.shareittoo.app') {
      return '  versionCode=2026082301 minSdk=24 targetSdk=35\n  versionName=1.0.0\n';
    }
    if (joined === 'shell am force-stop com.shareittoo.app') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      active = 'Entdecken';
      profileScrolled = false;
      return 'Events injected: 1';
    }
    if (joined === 'shell uiautomator dump /sdcard/sit-main-navigation-diagnostic.xml') {
      return 'UI hierarchy dumped';
    }
    if (joined === 'exec-out cat /sdcard/sit-main-navigation-diagnostic.xml') {
      return hierarchy(active, { omitMessagesSurface, profileScrolled });
    }
    if (joined === 'shell rm -f /sdcard/sit-main-navigation-diagnostic.xml') return '';
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      const x = Number(command[3]);
      active = labels[Math.min(labels.length - 1, Math.floor(x / 200))];
      profileScrolled = false;
      return '';
    }
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'swipe') {
      swipeCount += 1;
      if (active === 'Mein SIT') profileScrolled = true;
      return '';
    }
    throw new Error(`Unexpected fake ADB command (${options.binary ? 'binary' : 'text'}): ${joined}`);
  };
  runner.settingsWrites = settingsWrites;
  runner.fontScale = () => fontScale;
  runner.swipeCount = () => swipeCount;
  return runner;
}

function diagnose(commandRunner) {
  return diagnoseCurrentHeadAndroidLargeTextMainNavigation({
    commandRunner,
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    deviceSummary,
    candidate,
    capturedAt: '2026-08-23T13:00:00.000Z',
    wait: async () => {},
  });
}

test('proves five authenticated destinations at 200 percent and restores the exact scale', async () => {
  const runner = fakeRunner();
  const evidence = await diagnose(runner);
  assert.equal(evidence.status, 'passed-bounded-authenticated-large-text-main-navigation-diagnostic');
  assert.deepEqual(runner.settingsWrites, ['2', '0.85']);
  assert.equal(runner.fontScale(), '0.85');
  assert.deepEqual(Object.keys(evidence.tests), labels);
  assert.equal(runner.swipeCount() >= 1, true);
  assert.equal(evidence.configuration.targetFontScale, 2);
  assert.equal(evidence.configuration.exactPreviousFontScaleRestored, true);
  assert.equal(evidence.boundaries.manualVisualLargeTextReviewPassed, false);
  assert.equal(evidence.boundaries.manualTalkBackTraversalPassed, false);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
});

test('accepts one large-text destination only as an explicit subset', async () => {
  const runner = fakeRunner();
  const evidence = await diagnoseCurrentHeadAndroidLargeTextMainNavigation({
    commandRunner: runner,
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    deviceSummary,
    candidate,
    checks: [{ label: 'Nachrichten' }],
    capturedAt: '2026-08-23T13:00:00.000Z',
    wait: async () => {},
  });
  assert.equal(evidence.status, 'passed-bounded-authenticated-large-text-main-navigation-subset');
  assert.deepEqual(Object.keys(evidence.tests), ['Nachrichten']);
  assert.equal(evidence.boundaries.completeLargeTextNavigationMatrixPassed, false);
  assert.deepEqual(runner.settingsWrites, ['2', '0.85']);
});

test('refuses a locked phone before modifying the system font scale', async () => {
  const runner = fakeRunner({ locked: true });
  await assert.rejects(() => diagnose(runner), /never enters a passcode/u);
  assert.deepEqual(runner.settingsWrites, []);
});

test('fails closed when Android does not apply 200 percent and still restores', async () => {
  const runner = fakeRunner({ refuseTargetScale: true });
  await assert.rejects(() => diagnose(runner), /did not apply/u);
  assert.deepEqual(runner.settingsWrites, ['2', '0.85']);
  assert.equal(runner.fontScale(), '0.85');
});

test('restores the exact scale after a destination failure', async () => {
  const runner = fakeRunner({ omitMessagesSurface: true });
  await assert.rejects(() => diagnose(runner), /authenticated Nachrichten/u);
  assert.deepEqual(runner.settingsWrites, ['2', '0.85']);
  assert.equal(runner.fontScale(), '0.85');
});

test('fails closed when the previous font scale cannot be restored', async () => {
  const runner = fakeRunner({ refuseRestoration: true });
  await assert.rejects(() => diagnose(runner), /not restored exactly/u);
});

test('parses bounded Android font scales and explicit current-head arguments', () => {
  assert.equal(parseAndroidFontScale('0.85'), 0.85);
  assert.equal(parseAndroidFontScale('2.0'), 2);
  assert.equal(parseAndroidFontScale('null'), null);
  assert.throws(() => parseAndroidFontScale('4.0'), /unsupported/u);
  assert.deepEqual(parseLargeTextMainNavigationArguments(['--current-head']), {
    currentHead: true,
    adbPath: 'adb',
    candidateDirectory: null,
    onlyLabel: null,
  });
  assert.deepEqual(
    parseLargeTextMainNavigationArguments(['--current-head', '--adb', '/safe/adb']),
    { currentHead: true, adbPath: '/safe/adb', candidateDirectory: null, onlyLabel: null },
  );
  assert.throws(() => parseLargeTextMainNavigationArguments([]), /requires --current-head/u);
  assert.throws(
    () => parseLargeTextMainNavigationArguments(['--current-head', '--only', 'Unbekannt']),
    /must name one supported/u,
  );
  assert.deepEqual(
    parseLargeTextMainNavigationArguments([
      '--current-head', '--candidate-dir', 'private-candidate', '--only', 'Entdecken',
    ]),
    {
      currentHead: true,
      adbPath: 'adb',
      candidateDirectory: 'private-candidate',
      onlyLabel: 'Entdecken',
    },
  );
});
