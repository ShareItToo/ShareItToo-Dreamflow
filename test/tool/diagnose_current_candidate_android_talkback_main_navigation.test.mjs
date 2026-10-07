import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  diagnoseCurrentCandidateAndroidTalkBackMainNavigation,
  parseTalkBackArguments,
} from '../../tool/diagnose_current_candidate_android_talkback_main_navigation.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const installedApk = Buffer.from('exact PF19 candidate');
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
  android: Object.freeze({ apkSha256: digest(installedApk) }),
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
const labels = ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'];

function hierarchy(active) {
  const navigation = labels.map((label, index) => (
    `<node content-desc="${label}&#10;Tab ${index + 1} of 5" `
    + `bounds="[${index * 200},2200][${(index + 1) * 200},2400]"/>`
  )).join('');
  const surface = {
    Entdecken: '<node text="Jetzt suchen" bounds="[0,100][400,200]"/>',
    Mietkorb: '<node content-desc="Gemerkt. Unverbindlich gespeichert. Keine Reservierung." bounds="[0,100][200,200]"/><node text="Dein Mietkorb" bounds="[0,200][400,300]"/>',
    Buchungen: '<node text="Meine Buchungen" bounds="[0,100][400,200]"/>',
    Nachrichten: '<node content-desc="Nachrichten-Einstellungen" bounds="[800,100][900,200]"/><node text="Noch keine Nachrichten" bounds="[0,300][600,400]"/>',
    'Mein SIT': '<node text="Meine Anzeigen" bounds="[0,300][400,400]"/><node text="Mietanfragen" bounds="[0,400][400,500]"/><node text="Abmelden" bounds="[0,500][400,600]"/>',
  }[active];
  return `<hierarchy>${navigation}${surface}</hierarchy>`;
}

function settingsHierarchy(screen) {
  if (screen === 'talkback-keyboard-confirm') {
    return '<hierarchy><node text="Tastenkombination aktivieren" bounds="[500,1600][1050,1750]"/><node text="Nicht aktivieren" bounds="[1050,1600][1350,1750]"/></hierarchy>';
  }
  return hierarchy(screen);
}

function fakeRunner({
  locked = false,
  activeTalkBack = true,
  runtimeTouchExploration = true,
  refuseRestore = false,
  activateOnSingleTap = false,
  omitMessages = false,
  initialAccessibility = '0',
} = {}) {
  let active = 'Entdecken';
  let focused = null;
  let screen = 'Entdecken';
  const settings = new Map([
    ['accessibility_enabled', initialAccessibility],
    ['enabled_accessibility_services', 'null'],
    ['touch_exploration_enabled', '0'],
    ['touch_exploration_granted_accessibility_services', 'null'],
    ['accessibility_key_gesture_targets', ''],
  ]);
  const writes = [];
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
      if (!(refuseRestore && value === '0')) settings.set(key, value);
      return '';
    }
    if (command.slice(0, 4).join(' ') === 'shell settings delete secure') {
      const key = command[4];
      writes.push([key, 'null']);
      settings.set(key, 'null');
      return '';
    }
    if (joined === 'shell pidof com.google.android.marvin.talkback') {
      return activeTalkBack ? '1234\n' : '';
    }
    if (joined === 'shell dumpsys accessibility') {
      return activeTalkBack
        ? `attributes:{touchExplorationEnabled=${runtimeTouchExploration}} `
          + 'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService'
        : '';
    }
    if (joined === 'shell input keyboard keycombination -t 100 KEYCODE_META_LEFT KEYCODE_ALT_LEFT KEYCODE_T') {
      if (settings.get('accessibility_key_gesture_targets') === '') {
        screen = 'talkback-keyboard-confirm';
      } else if (activeTalkBack) {
        settings.set('accessibility_enabled', '1');
        settings.set(
          'enabled_accessibility_services',
          'com.google.android.marvin.talkback/.TalkBackService',
        );
        if (runtimeTouchExploration) {
          settings.set('touch_exploration_enabled', '1');
          settings.set(
            'touch_exploration_granted_accessibility_services',
            'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService',
          );
        }
      }
      return '';
    }
    if (joined === 'shell am force-stop com.shareittoo.app') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      active = 'Entdecken';
      focused = null;
      screen = 'Entdecken';
      return 'Events injected: 1';
    }
    if (joined === 'shell uiautomator dump /sdcard/sit-main-navigation-diagnostic.xml') {
      return 'UI hierarchy dumped';
    }
    if (joined === 'exec-out cat /sdcard/sit-main-navigation-diagnostic.xml') {
      if (screen === 'talkback-keyboard-confirm') {
        return settingsHierarchy(screen);
      }
      return omitMessages && active === 'Nachrichten'
        ? hierarchy(active).replace(/<node content-desc="Nachrichten-Einstellungen"[^>]*\/>/u, '')
        : hierarchy(active);
    }
    if (joined === 'shell rm -f /sdcard/sit-main-navigation-diagnostic.xml') return '';
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      if (screen === 'talkback-keyboard-confirm') {
        settings.set(
          'accessibility_key_gesture_targets',
          'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService',
        );
        screen = active;
        return '';
      }
      const x = Number(command[3]);
      focused = labels[Math.min(labels.length - 1, Math.floor(x / 200))];
      if (activateOnSingleTap) active = focused;
      screen = active;
      return '';
    }
    if (command[0] === 'shell'
        && command[1]?.startsWith('settings put secure accessibility_key_gesture_targets')) {
        settings.set('accessibility_key_gesture_targets', '');
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
  return runner;
}

function diagnose(commandRunner) {
  return diagnoseCurrentCandidateAndroidTalkBackMainNavigation({
    commandRunner,
    device,
    deviceSummary,
    candidate,
    capturedAt: '2026-08-23T17:00:00.000Z',
    wait: async () => {},
  });
}

test('uses TalkBack focus then activation across five destinations and restores settings', async () => {
  const runner = fakeRunner();
  const evidence = await diagnose(runner);
  assert.equal(
    evidence.status,
    'passed-bounded-authenticated-talkback-main-navigation-diagnostic',
  );
  assert.deepEqual(Object.keys(evidence.tests), labels);
  assert.equal(evidence.configuration.runtimeTouchExplorationEnabledDuringDiagnostic, true);
  assert.equal(evidence.configuration.exactPreviousConfigurationRestored, true);
  assert.equal(evidence.configuration.accessibilityEnabledAfterDiagnostic, false);
  assert.equal(evidence.boundaries.automatedTalkBackMainNavigationPassed, true);
  assert.equal(evidence.boundaries.manualTalkBackTraversalPassed, false);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
  assert.equal(runner.settings.get('accessibility_enabled'), '0');
  assert.equal(runner.settings.get('enabled_accessibility_services'), 'null');
  assert.equal(runner.settings.get('touch_exploration_enabled'), '0');
  assert.equal(
    runner.settings.get('touch_exploration_granted_accessibility_services'),
    'null',
  );
});

test('refuses a locked phone and a non-disabled accessibility baseline before mutation', async () => {
  const locked = fakeRunner({ locked: true });
  await assert.rejects(() => diagnose(locked), /never enters a passcode/u);
  assert.deepEqual(locked.writes, []);

  const enabled = fakeRunner({ initialAccessibility: '1' });
  await assert.rejects(() => diagnose(enabled), /known disabled accessibility baseline/u);
  assert.deepEqual(enabled.writes, []);
});

test('fails closed when TalkBack does not activate and restores the baseline', async () => {
  const runner = fakeRunner({ activeTalkBack: false });
  await assert.rejects(() => diagnose(runner), /required runtime touch-exploration state/u);
  assert.equal(runner.settings.get('accessibility_enabled'), '0');
  assert.equal(runner.settings.get('enabled_accessibility_services'), 'null');
  assert.equal(runner.settings.get('touch_exploration_enabled'), '0');
});

test('probe mode records a runtime touch-exploration blocker without a pass claim', async () => {
  const runner = fakeRunner({ runtimeTouchExploration: false });
  const evidence = await diagnoseCurrentCandidateAndroidTalkBackMainNavigation({
    commandRunner: runner,
    device,
    deviceSummary,
    candidate,
    probeOnly: true,
    capturedAt: '2026-08-23T17:05:00.000Z',
    wait: async () => {},
  });
  assert.equal(evidence.status, 'blocked-runtime-touch-exploration-not-requested');
  assert.equal(evidence.activation.officialSettingsAuthorizationCompleted, true);
  assert.equal(evidence.activation.serviceBound, true);
  assert.equal(evidence.activation.runtimeTouchExplorationEnabled, false);
  assert.equal(evidence.activation.traversalAttempted, false);
  assert.equal(evidence.activation.exactPreviousConfigurationRestored, true);
  assert.equal(evidence.boundaries.talkBackPassClaimed, false);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
});

test('rejects ordinary one-tap activation and incomplete destination surfaces', async () => {
  const ordinaryTap = fakeRunner({ activateOnSingleTap: true });
  await assert.rejects(() => diagnose(ordinaryTap), /single TalkBack focus tap unexpectedly/u);
  assert.equal(ordinaryTap.settings.get('accessibility_enabled'), '0');

  const incomplete = fakeRunner({ omitMessages: true });
  await assert.rejects(() => diagnose(incomplete), /authenticated Nachrichten TalkBack surface/u);
  assert.equal(incomplete.settings.get('accessibility_enabled'), '0');
});

test('fails closed when exact accessibility restoration is refused', async () => {
  const runner = fakeRunner({ refuseRestore: true });
  await assert.rejects(() => diagnose(runner), /not restored exactly/u);
});

test('accepts only the optional explicit ADB path', () => {
  assert.deepEqual(parseTalkBackArguments([]), { adbPath: 'adb', probeOnly: false });
  assert.deepEqual(parseTalkBackArguments(['--adb', '/safe/adb']), {
    adbPath: '/safe/adb',
    probeOnly: false,
  });
  assert.deepEqual(parseTalkBackArguments(['--probe-only']), {
    adbPath: 'adb',
    probeOnly: true,
  });
  assert.throws(() => parseTalkBackArguments(['--unknown']), /Unknown argument/u);
  assert.throws(() => parseTalkBackArguments(['--adb']), /requires a path/u);
});
