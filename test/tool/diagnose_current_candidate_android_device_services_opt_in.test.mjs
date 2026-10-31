import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  diagnoseCurrentCandidateAndroidDeviceServicesOptIn,
  inspectCurrentCandidateAndroidDeviceServiceState,
  inspectDeviceServiceControls,
  parseDeviceServicesOptInArguments,
  readDeviceServiceControls,
} from '../../tool/diagnose_current_candidate_android_device_services_opt_in.mjs';

const installedApk = Buffer.from('exact-current-candidate-apk');
const apkSha256 = createHash('sha256').update(installedApk).digest('hex');
const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026082302',
  commit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: Object.freeze({ apkSha256 }),
});
const device = Object.freeze({ serial: 'PRIVATE-SERIAL' });
const deviceSummary = Object.freeze({
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
});

function bottomNavigation() {
  return [
    ['Entdecken', 0, 288],
    ['Mietkorb', 288, 576],
    ['Buchungen', 576, 864],
    ['Nachrichten', 864, 1152],
    ['Mein SIT', 1152, 1440],
  ].map(([label, x1, x2]) => (
    `<node content-desc="${label}" clickable="true" bounds="[${x1},2844][${x2},3049]"/>`
  )).join('');
}

function hierarchy(screen, {
  pushEnabled = false,
  crashEnabled = false,
  omitCrashLabel = false,
  omitSecondSwitch = false,
} = {}) {
  const navigation = bottomNavigation();
  if (screen === 'explore') {
    return `<hierarchy>${navigation}<node text="Jetzt suchen" bounds="[0,300][500,400]"/></hierarchy>`;
  }
  if (screen === 'profile') {
    return `<hierarchy>${navigation}`
      + '<node content-desc="Benachrichtigungen" clickable="true" bounds="[1285,156][1428,299]"/>'
      + '<node text="Meine Anzeigen" bounds="[0,500][600,600]"/>'
      + '<node text="Mietanfragen" bounds="[0,700][600,800]"/>'
      + '<node text="Abmelden" bounds="[0,2400][600,2500]"/>'
      + '</hierarchy>';
  }
  if (screen === 'notifications') {
    return '<hierarchy>'
      + '<node text="Benachrichtigungen" bounds="[214,199][1238,256]"/>'
      + '<node content-desc="Mehr Optionen" clickable="true" bounds="[1285,156][1428,299]"/>'
      + '</hierarchy>';
  }
  if (screen === 'menu') {
    return '<hierarchy>'
      + '<node text="Alle als gelesen markieren" clickable="true" bounds="[750,328][1416,453]"/>'
      + '<node text="Nur ungelesene anzeigen" clickable="true" bounds="[750,477][1416,644]"/>'
      + '</hierarchy>';
  }
  if (screen === 'settings-top') {
    return '<hierarchy><node text="Benachrichtigungseinstellungen" bounds="[0,150][1200,300]"/></hierarchy>';
  }
  const sectionDescription = omitCrashLabel
    ? 'Push-Mitteilungen auf diesem Gerät\nWichtige Hinweise'
    : 'Push-Mitteilungen auf diesem Gerät\nWichtige Hinweise\nFreiwillige Crashdiagnose\nKeine Werbung';
  const switches = [
    `<node class="android.widget.Switch" checkable="true" checked="${pushEnabled}" clickable="true" enabled="true" bounds="[1175,2320][1354,2463]"/>`,
    ...(omitSecondSwitch ? [] : [
      `<node class="android.widget.Switch" checkable="true" checked="${crashEnabled}" clickable="true" enabled="true" bounds="[1175,2525][1354,2668]"/>`,
    ]),
  ].join('');
  return '<hierarchy>'
    + '<node text="Benachrichtigungseinstellungen" bounds="[0,150][1200,300]"/>'
    + `<node content-desc="${sectionDescription}" bounds="[48,2088][1392,2701]"/>`
    + switches
    + '</hierarchy>';
}

function fakeRunner({
  locked = false,
  pushEnabled = false,
  crashEnabled = false,
  changeAfterFirstObservation = false,
  omitCrashLabel = false,
  omitSecondSwitch = false,
} = {}) {
  let screen = 'explore';
  let swiped = false;
  let settingsDumpCount = 0;
  const serviceTaps = [];
  const runner = (_file, args, options = {}) => {
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell dumpsys window policy') {
      return locked ? 'mIsShowing=true' : 'mIsShowing=false showing=false';
    }
    if (joined === 'shell pm path com.shareittoo.app') {
      return 'package:/data/app/shareittoo/base.apk\n';
    }
    if (joined === 'exec-out cat /data/app/shareittoo/base.apk') return installedApk;
    if (joined === 'shell dumpsys package com.shareittoo.app') {
      return ' versionCode=2026082302 minSdk=24 targetSdk=35\n versionName=1.0.0\n';
    }
    if (joined === 'shell am force-stop com.shareittoo.app') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      screen = 'explore';
      swiped = false;
      return 'Events injected: 1';
    }
    if (joined === 'shell wm size') return 'Physical size: 1440x3120\n';
    if (joined === 'shell uiautomator dump /sdcard/sit-main-navigation-diagnostic.xml') {
      return 'UI hierarchy dumped';
    }
    if (joined === 'exec-out cat /sdcard/sit-main-navigation-diagnostic.xml') {
      if (screen === 'settings' && swiped) settingsDumpCount += 1;
      return hierarchy(
        screen === 'settings' && !swiped ? 'settings-top' : screen,
        {
          pushEnabled: changeAfterFirstObservation && settingsDumpCount >= 2
            ? true
            : pushEnabled,
          crashEnabled,
          omitCrashLabel,
          omitSecondSwitch,
        },
      );
    }
    if (joined === 'shell rm -f /sdcard/sit-main-navigation-diagnostic.xml') return '';
    if (command.slice(0, 3).join(' ') === 'shell input swipe') {
      swiped = true;
      return '';
    }
    if (command.slice(0, 3).join(' ') === 'shell input keyevent') {
      if (screen === 'settings') screen = 'notifications';
      else if (screen === 'notifications' || screen === 'menu') screen = 'profile';
      else screen = 'explore';
      return '';
    }
    if (command.slice(0, 3).join(' ') === 'shell input tap') {
      const x = Number(command[3]);
      const y = Number(command[4]);
      if (screen === 'explore' && x >= 1152 && y >= 2800) screen = 'profile';
      else if (screen === 'profile' && x >= 1200 && y < 400) screen = 'notifications';
      else if (screen === 'notifications' && x >= 1200 && y < 400) screen = 'menu';
      else if (screen === 'menu' && y < 328) screen = 'settings';
      else if (screen === 'settings' && y >= 2200) serviceTaps.push({ x, y });
      else if (x < 288 && y >= 2800) screen = 'explore';
      return '';
    }
    throw new Error(`Unexpected fake ADB command (${options.binary ? 'binary' : 'text'}): ${joined}`);
  };
  runner.serviceTaps = serviceTaps;
  runner.screen = () => screen;
  return runner;
}

function diagnose(commandRunner, candidateOverride = candidate) {
  return diagnoseCurrentCandidateAndroidDeviceServicesOptIn({
    commandRunner,
    device,
    deviceSummary,
    candidate: candidateOverride,
    capturedAt: '2026-08-23T18:00:00.000Z',
    wait: async () => {},
  });
}

test('observes both independent exact-candidate controls off without consent or telemetry action', async () => {
  const runner = fakeRunner();
  const evidence = await diagnose(runner);
  assert.equal(evidence.status, 'passed-bounded-default-off-device-services-preflight');
  assert.equal(evidence.controls.independentSwitchCount, 2);
  assert.equal(evidence.controls.pushEnabled, false);
  assert.equal(evidence.controls.crashDiagnosticsEnabled, false);
  assert.equal(evidence.controls.exactSecondObservationUnchanged, true);
  assert.equal(evidence.controls.exploreSurfaceRestored, true);
  assert.equal(evidence.boundaries.externalServiceConsentChanged, false);
  assert.equal(evidence.boundaries.controlledCrashDiagnosticTriggered, false);
  assert.equal(evidence.boundaries.optInDependentRegistrationOrReportRequested, false);
  assert.deepEqual(runner.serviceTaps, []);
  assert.equal(runner.screen(), 'explore');
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
});

test('reads an enabled push opt-in without requiring crash diagnostics or changing either choice', async () => {
  const runner = fakeRunner({ pushEnabled: true });
  const state = await inspectCurrentCandidateAndroidDeviceServiceState({
    commandRunner: runner,
    adbPath: 'adb',
    device,
    wait: async () => {},
  });
  assert.deepEqual(state, {
    independentSwitchCount: 2,
    pushEnabled: true,
    crashDiagnosticsEnabled: false,
    exactSecondObservationUnchanged: true,
    consentDialogOpened: false,
    exploreSurfaceRestored: true,
  });
  assert.deepEqual(runner.serviceTaps, []);
  assert.equal(runner.screen(), 'explore');
});

test('fails closed instead of treating an unknown switch state as disabled', () => {
  const unknown = hierarchy('settings', { pushEnabled: false })
    .replace('checked="false"', 'checked="mixed"');
  assert.throws(
    () => readDeviceServiceControls(unknown),
    /switches are not available/u,
  );
});

test('refuses a locked phone and candidate drift before opening the app', async () => {
  const locked = fakeRunner({ locked: true });
  await assert.rejects(() => diagnose(locked), /never enters a passcode/u);

  const drift = { ...candidate, buildNumber: '2026082301' };
  await assert.rejects(() => diagnose(fakeRunner(), drift), /exact verified current candidate/u);
});

test('fails closed when either existing device-service choice is already enabled', async () => {
  for (const options of [{ pushEnabled: true }, { crashEnabled: true }]) {
    const runner = fakeRunner(options);
    await assert.rejects(() => diagnose(runner), /requires both user choices to remain off/u);
    assert.deepEqual(runner.serviceTaps, []);
    assert.equal(runner.screen(), 'explore');
  }
});

test('rejects a missing independent label or switch', async () => {
  await assert.rejects(
    () => diagnose(fakeRunner({ omitCrashLabel: true })),
    /labels are not exposed together/u,
  );
  await assert.rejects(
    () => diagnose(fakeRunner({ omitSecondSwitch: true })),
    /two independent Firebase device-service switches/u,
  );
});

test('rejects a state change between the two read-only observations', async () => {
  await assert.rejects(
    () => diagnose(fakeRunner({ changeAfterFirstObservation: true })),
    /requires both user choices to remain off|choices changed/u,
  );
});

test('parses the bounded command line and validates service-section geometry', () => {
  assert.deepEqual(parseDeviceServicesOptInArguments([]), { adbPath: 'adb' });
  assert.deepEqual(parseDeviceServicesOptInArguments(['--adb', '/safe/adb']), {
    adbPath: '/safe/adb',
  });
  assert.throws(() => parseDeviceServicesOptInArguments(['--adb']), /requires a path/u);
  assert.throws(() => parseDeviceServicesOptInArguments(['--other']), /Unknown argument/u);

  assert.deepEqual(inspectDeviceServiceControls(hierarchy('settings')), {
    independentSwitchCount: 2,
    push: { controlPresent: true, enabled: false },
    crashDiagnostics: { controlPresent: true, enabled: false },
  });
});
