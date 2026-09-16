import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  diagnoseCurrentCandidateAndroidTalkBackSettingsMainNavigation,
  parseTalkBackSettingsArguments,
} from '../../tool/diagnose_current_candidate_android_talkback_settings_main_navigation.mjs';

const installedApk = Buffer.from('exact-pf21-apk');
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
const talkBackService =
  'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService';
const labels = ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'];

function navigationHierarchy(active) {
  const navigation = labels.map((label, index) => (
    `<node content-desc="${label}" bounds="[${index * 200},1800][${(index + 1) * 200},2000]"/>`
  )).join('');
  const surface = {
    Entdecken: '<node text="Jetzt suchen" bounds="[0,100][400,200]"/>',
    Mietkorb: '<node text="Gemerkt" bounds="[0,100][400,200]"/><node text="Dein Mietkorb" bounds="[0,300][400,400]"/>',
    Buchungen: '<node text="Meine Buchungen" bounds="[0,100][400,200]"/>',
    Nachrichten: '<node content-desc="Nachrichten-Einstellungen" bounds="[800,100][900,200]"/><node text="Noch keine Nachrichten" bounds="[0,300][600,400]"/>',
    'Mein SIT': '<node text="Meine Anzeigen" bounds="[0,300][400,400]"/><node text="Mietanfragen" bounds="[0,400][400,500]"/><node text="Abmelden" bounds="[0,500][400,600]"/>',
  }[active];
  return `<hierarchy>${navigation}${surface}</hierarchy>`;
}

function settingsHierarchy(screen, { missingToggle = false } = {}) {
  if (screen === 'accessibility-root') {
    return '<hierarchy>'
      + '<node text="Bedienungshilfen" bounds="[0,144][1440,311]"/>'
      + '<node text="Screenreader" bounds="[0,1300][1440,1400]"/>'
      + '<node text="TalkBack" bounds="[250,1477][417,1531]"/>'
      + '</hierarchy>';
  }
  if (screen === 'talkback-details') {
    return '<hierarchy>'
      + '<node text="TalkBack" bounds="[0,144][1440,311]"/>'
      + (missingToggle ? '' : '<node text="TalkBack verwenden" bounds="[143,1751][545,1805]"/>')
      + '<node text="Kurzbefehl für TalkBack" bounds="[143,2160][800,2210]"/>'
      + '</hierarchy>';
  }
  if (screen === 'confirmation') {
    return '<hierarchy>'
      + '<node text="TalkBack zulassen?" bounds="[200,1200][1200,1400]"/>'
      + '<node text="Abbrechen" clickable="true" bounds="[236,1841][713,1984]"/>'
      + '<node text="Zulassen" clickable="true" bounds="[737,1841][1207,1984]"/>'
      + '</hierarchy>';
  }
  return navigationHierarchy(screen);
}

function fakeRunner({
  locked = false,
  runtimeTouchExploration = true,
  initialAccessibility = '0',
  missingToggle = false,
  refuseRestore = false,
} = {}) {
  let screen = 'Entdecken';
  let active = 'Entdecken';
  let focused = null;
  const settings = new Map([
    ['accessibility_enabled', initialAccessibility],
    ['enabled_accessibility_services', 'null'],
    ['touch_exploration_enabled', '0'],
    ['touch_exploration_granted_accessibility_services', 'null'],
    ['accessibility_key_gesture_targets', ''],
  ]);
  const writes = [];
  const activate = () => {
    settings.set('accessibility_enabled', '1');
    settings.set('enabled_accessibility_services', talkBackService);
    if (runtimeTouchExploration) {
      settings.set('touch_exploration_enabled', '1');
      settings.set('touch_exploration_granted_accessibility_services', talkBackService);
    }
    screen = 'talkback-details';
  };
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
    if (joined === 'shell pm path com.google.android.marvin.talkback') {
      return 'package:/product/app/talkback/base.apk\n';
    }
    if (command.slice(0, 4).join(' ') === 'shell settings get secure') {
      return `${settings.get(command[4])}\n`;
    }
    if (command.slice(0, 4).join(' ') === 'shell settings put secure') {
      const key = command[4];
      const value = command[5];
      writes.push([key, value]);
      if (!(refuseRestore && key === 'accessibility_enabled' && value === '0')) {
        settings.set(key, value);
      }
      return '';
    }
    if (command.slice(0, 4).join(' ') === 'shell settings delete secure') {
      const key = command[4];
      writes.push([key, 'null']);
      settings.set(key, 'null');
      return '';
    }
    if (command[0] === 'shell'
        && command[1]?.startsWith('settings put secure accessibility_key_gesture_targets')) {
      settings.set('accessibility_key_gesture_targets', '');
      return '';
    }
    if (joined === 'shell pidof com.google.android.marvin.talkback') {
      return settings.get('accessibility_enabled') === '1' ? '1234\n' : '';
    }
    if (joined === 'shell dumpsys accessibility') {
      return settings.get('accessibility_enabled') === '1'
        ? `attributes:{touchExplorationEnabled=${runtimeTouchExploration}} ${talkBackService}`
        : 'attributes:{touchExplorationEnabled=false}';
    }
    if (joined === 'shell am start --activity-clear-top -a android.settings.ACCESSIBILITY_SETTINGS') {
      screen = 'accessibility-root';
      return 'Starting: Intent';
    }
    if (joined === 'shell am force-stop com.shareittoo.app') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      active = 'Entdecken';
      focused = null;
      screen = active;
      return 'Events injected: 1';
    }
    if (joined === 'shell uiautomator dump /sdcard/sit-main-navigation-diagnostic.xml') {
      return 'UI hierarchy dumped';
    }
    if (joined === 'exec-out cat /sdcard/sit-main-navigation-diagnostic.xml') {
      return settingsHierarchy(screen, { missingToggle });
    }
    if (joined === 'shell rm -f /sdcard/sit-main-navigation-diagnostic.xml') return '';
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      const x = Number(command[3]);
      const y = Number(command[4]);
      if (screen === 'accessibility-root') {
        screen = 'talkback-details';
      } else if (screen === 'talkback-details') {
        screen = 'confirmation';
      } else if (screen === 'confirmation' && x > 700) {
        activate();
      } else {
        focused = labels[Math.min(labels.length - 1, Math.floor(x / 200))];
        screen = active;
      }
      return '';
    }
    if (command.slice(0, 3).join(' ') === 'shell sh -c') {
      active = focused;
      screen = active;
      return '';
    }
    throw new Error(`Unexpected fake ADB command (${options.binary ? 'binary' : 'text'}): ${joined}`);
  };
  runner.settings = settings;
  runner.writes = writes;
  runner.screen = () => screen;
  return runner;
}

function diagnose(commandRunner, options = {}) {
  return diagnoseCurrentCandidateAndroidTalkBackSettingsMainNavigation({
    commandRunner,
    device,
    deviceSummary,
    candidate,
    capturedAt: '2026-08-23T19:00:00.000Z',
    wait: async () => {},
    ...options,
  });
}

test('enables TalkBack through Android Settings, traverses five destinations and restores', async () => {
  const runner = fakeRunner();
  const evidence = await diagnose(runner);
  assert.equal(
    evidence.status,
    'passed-bounded-authenticated-talkback-settings-main-navigation-diagnostic',
  );
  assert.deepEqual(Object.keys(evidence.tests), labels);
  assert.equal(evidence.configuration.confirmationAccepted, true);
  assert.equal(evidence.configuration.runtimeTouchExplorationEnabledDuringDiagnostic, true);
  assert.equal(evidence.configuration.secureTouchExplorationEnabledDuringDiagnostic, true);
  assert.equal(evidence.configuration.secureTouchExplorationGrantPresentDuringDiagnostic, true);
  assert.equal(evidence.configuration.runtimeTouchExplorationSignalCount, 1);
  assert.equal(evidence.configuration.runtimeTouchExplorationTrueSignalCount, 1);
  assert.equal(evidence.configuration.exactPreviousConfigurationRestored, true);
  assert.equal(evidence.configuration.exploreSurfaceRestored, true);
  assert.equal(evidence.boundaries.automatedTalkBackMainNavigationPassed, true);
  assert.equal(evidence.boundaries.manualTalkBackTraversalPassed, false);
  assert.equal(runner.settings.get('accessibility_enabled'), '0');
  assert.equal(runner.settings.get('enabled_accessibility_services'), 'null');
  assert.equal(runner.settings.get('touch_exploration_enabled'), '0');
  assert.equal(runner.screen(), 'Entdecken');
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
});

test('refuses a locked phone and non-disabled baseline before Settings mutation', async () => {
  const locked = fakeRunner({ locked: true });
  await assert.rejects(() => diagnose(locked), /never enters a passcode/u);
  assert.deepEqual(locked.writes, []);

  const enabled = fakeRunner({ initialAccessibility: '1' });
  await assert.rejects(() => diagnose(enabled), /known disabled baseline/u);
  assert.deepEqual(enabled.writes, []);
});

test('probe mode records missing runtime touch exploration without a pass claim', async () => {
  const runner = fakeRunner({ runtimeTouchExploration: false });
  const evidence = await diagnose(runner, { probeOnly: true });
  assert.equal(evidence.status, 'blocked-settings-runtime-touch-exploration-unavailable');
  assert.equal(evidence.configuration.settingsSurfaceOpened, true);
  assert.equal(evidence.configuration.serviceBound, true);
  assert.equal(evidence.configuration.runtimeTouchExplorationEnabledDuringDiagnostic, false);
  assert.equal(evidence.configuration.secureTouchExplorationEnabledDuringDiagnostic, false);
  assert.equal(evidence.configuration.secureTouchExplorationGrantPresentDuringDiagnostic, false);
  assert.equal(evidence.configuration.runtimeTouchExplorationSignalCount, 1);
  assert.equal(evidence.configuration.runtimeTouchExplorationTrueSignalCount, 0);
  assert.equal(evidence.configuration.exactPreviousConfigurationRestored, true);
  assert.equal(evidence.boundaries.talkBackPassClaimed, false);
  assert.equal(runner.settings.get('accessibility_enabled'), '0');
});

test('rejects a missing Settings toggle and still restores the app surface', async () => {
  const runner = fakeRunner({ missingToggle: true });
  await assert.rejects(() => diagnose(runner), /TalkBack service details did not appear/u);
  assert.equal(runner.settings.get('accessibility_enabled'), '0');
  assert.equal(runner.screen(), 'Entdecken');
});

test('fails closed when exact accessibility restoration is refused', async () => {
  const runner = fakeRunner({ refuseRestore: true });
  await assert.rejects(() => diagnose(runner), /not restored exactly/u);
});

test('rejects an unverified candidate before any device mutation', async () => {
  const runner = fakeRunner();
  await assert.rejects(
    () => diagnose(runner, {
      candidate: { ...candidate, buildNumber: 'invalid' },
    }),
    /exact verified Internal Staging candidate/u,
  );
  assert.deepEqual(runner.writes, []);
});

test('accepts only the optional candidate, ADB path and probe flag', () => {
  assert.deepEqual(parseTalkBackSettingsArguments([]), {
    adbPath: 'adb',
    probeOnly: false,
  });
  assert.deepEqual(parseTalkBackSettingsArguments(['--adb', '/safe/adb']), {
    adbPath: '/safe/adb',
    probeOnly: false,
  });
  assert.deepEqual(parseTalkBackSettingsArguments(['--probe-only']), {
    adbPath: 'adb',
    probeOnly: true,
  });
  assert.deepEqual(
    parseTalkBackSettingsArguments(['--candidate-dir', './private-candidate']),
    {
      adbPath: 'adb',
      probeOnly: false,
      candidateDirectory: resolve('./private-candidate'),
    },
  );
  assert.throws(() => parseTalkBackSettingsArguments(['--adb']), /requires a path/u);
  assert.throws(
    () => parseTalkBackSettingsArguments(['--candidate-dir']),
    /requires a path/u,
  );
  assert.throws(() => parseTalkBackSettingsArguments(['--unknown']), /Unknown argument/u);
});
