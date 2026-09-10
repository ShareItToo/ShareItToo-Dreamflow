import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  classifyCurrentHeadAndroidMainNavigationAbsence,
  diagnoseCurrentHeadAndroidColdStartStability,
  diagnoseCurrentHeadAndroidMainNavigation,
  parseMainNavigationArguments,
} from '../../tool/diagnose_current_head_android_main_navigation.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const installedApk = Buffer.from('exact current-head main navigation candidate');
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
  osVersion: '16',
  apiLevel: 36,
  securityPatch: '2026-04-05',
  containsRawDeviceIdentifier: false,
};

const labels = ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'];

function hierarchy(active, { omitMessagesSurface = false } = {}) {
  const navigation = labels.map((label, index) => (
    `<node text="" content-desc="${label}&#10;Tab ${index + 1} of 5" bounds="[${index * 200},2200][${(index + 1) * 200},2400]"/>`
  )).join('');
  const surface = {
    Entdecken: '<node text="Jetzt suchen" bounds="[0,100][400,200]"/>',
    Mietkorb: '<node text="" content-desc="Gemerkt. Unverbindlich gespeichert. Keine Reservierung." bounds="[0,100][200,200]"/><node text="Dein Mietkorb" bounds="[0,200][400,300]"/>',
    Buchungen: '<node text="Meine Buchungen" bounds="[0,100][400,200]"/>',
    Nachrichten: omitMessagesSurface
      ? ''
      : '<node content-desc="Nachrichten-Einstellungen" bounds="[800,100][900,200]"/><node text="Noch keine Nachrichten" bounds="[0,300][600,400]"/>',
    'Mein SIT': '<node text="Meine Anzeigen" bounds="[0,300][400,400]"/><node text="Mietanfragen" bounds="[0,400][400,500]"/><node text="Abmelden" bounds="[0,500][400,600]"/>',
  }[active];
  return `<hierarchy>${navigation}${surface}</hierarchy>`;
}

function fakeRunner({
  locked = false,
  changedApk = false,
  omitMessagesSurface = false,
  hideNavigationOnLaunch = null,
} = {}) {
  let active = 'Entdecken';
  let launches = 0;
  return (_file, args, options = {}) => {
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell dumpsys window policy') {
      return locked ? 'mIsShowing=true' : 'mIsShowing=false showing=false';
    }
    if (joined === 'shell pm path com.shareittoo.app') return 'package:/data/app/test/base.apk\n';
    if (joined === 'exec-out cat /data/app/test/base.apk') {
      return changedApk ? Buffer.from('changed') : installedApk;
    }
    if (joined === 'shell dumpsys package com.shareittoo.app') {
      return '  versionCode=2026082301 minSdk=24 targetSdk=35\n  versionName=1.0.0\n';
    }
    if (joined === 'shell am force-stop com.shareittoo.app') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      launches += 1;
      active = 'Entdecken';
      return 'Events injected: 1';
    }
    if (joined === 'shell uiautomator dump /sdcard/sit-main-navigation-diagnostic.xml') {
      return 'UI hierarchy dumped';
    }
    if (joined === 'exec-out cat /sdcard/sit-main-navigation-diagnostic.xml') {
      if (hideNavigationOnLaunch === launches) return '<hierarchy/>';
      return hierarchy(active, { omitMessagesSurface });
    }
    if (joined === 'shell rm -f /sdcard/sit-main-navigation-diagnostic.xml') return '';
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      const x = Number(command[3]);
      active = labels[Math.min(labels.length - 1, Math.floor(x / 200))];
      return '';
    }
    throw new Error(`Unexpected fake ADB command (${options.binary ? 'binary' : 'text'}): ${joined}`);
  };
}

function diagnose(overrides = {}) {
  return diagnoseCurrentHeadAndroidMainNavigation({
    commandRunner: fakeRunner(),
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    deviceSummary,
    candidate,
    capturedAt: '2026-08-23T12:00:00.000Z',
    wait: async () => {},
    ...overrides,
  });
}

test('proves five authenticated read-only destinations and returns sanitized evidence', async () => {
  const evidence = await diagnose();
  assert.equal(evidence.status, 'passed-bounded-authenticated-main-navigation-diagnostic');
  assert.deepEqual(Object.keys(evidence.tests), labels);
  assert.deepEqual(
    Object.values(evidence.tests).map((value) => value.status),
    ['passed', 'passed', 'passed', 'passed', 'passed'],
  );
  assert.equal(evidence.installed.delivery, 'direct-apk');
  assert.equal(evidence.boundaries.authenticatedMainNavigationPassed, true);
  assert.equal(evidence.boundaries.bookingFlowPassed, false);
  assert.equal(evidence.boundaries.accountMutationPerformed, false);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
});

test('refuses a current Android lock state without entering a passcode', async () => {
  await assert.rejects(
    () => diagnose({ commandRunner: fakeRunner({ locked: true }) }),
    /never enters a passcode/u,
  );
});

test('rejects an installed APK that differs from the current-head candidate', async () => {
  await assert.rejects(
    () => diagnose({ commandRunner: fakeRunner({ changedApk: true }) }),
    /does not match the current-head candidate/u,
  );
});

test('fails closed when one authenticated destination surface is missing', async () => {
  await assert.rejects(
    () => diagnose({ commandRunner: fakeRunner({ omitMessagesSurface: true }) }),
    /authenticated Nachrichten navigation surface did not appear/u,
  );
});

test('classifies missing navigation with a fixed non-private vocabulary', () => {
  assert.equal(
    classifyCurrentHeadAndroidMainNavigationAbsence('<hierarchy><node text="Bitte zuerst anmelden"/></hierarchy>'),
    'unauthenticated-session',
  );
  assert.equal(
    classifyCurrentHeadAndroidMainNavigationAbsence('<hierarchy/>'),
    'bottom-navigation-absent',
  );
  assert.equal(
    classifyCurrentHeadAndroidMainNavigationAbsence(hierarchy('Entdecken').replace('content-desc="Mietkorb', 'content-desc="x')),
    'bottom-navigation-incomplete',
  );
  const allLabelsOnly = labels.map((label) => `<node content-desc="${label}"/>`).join('');
  assert.equal(
    classifyCurrentHeadAndroidMainNavigationAbsence(`<hierarchy>${allLabelsOnly}</hierarchy>`),
    'navigation-labels-present-surface-pending',
  );
  assert.equal(
    classifyCurrentHeadAndroidMainNavigationAbsence('<hierarchy><node content-desc="Benachrichtigung: test"/></hierarchy>'),
    'system-notification-overlay',
  );
});

test('measures up to three cold starts and stops at the first safe navigation failure', async () => {
  const passed = await diagnoseCurrentHeadAndroidColdStartStability({
    commandRunner: fakeRunner(),
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    deviceSummary,
    candidate,
    capturedAt: '2026-08-23T12:00:00.000Z',
    wait: async () => {},
  });
  assert.equal(passed.status, 'passed-three-bounded-cold-start-navigation-observations');
  assert.equal(passed.coldStarts.attemptsCompleted, 3);
  assert.equal(JSON.stringify(passed).includes('PRIVATE-SERIAL'), false);

  const failed = await diagnoseCurrentHeadAndroidColdStartStability({
    commandRunner: fakeRunner({ hideNavigationOnLaunch: 2 }),
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    deviceSummary,
    candidate,
    wait: async () => {},
  });
  assert.equal(failed.status, 'partial-fail-closed-cold-start-navigation-observation');
  assert.deepEqual(failed.coldStarts.firstFailure, {
    attempt: 2,
    result: 'navigation-unavailable',
    failureClass: 'bottom-navigation-absent',
  });
  await assert.rejects(
    () => diagnoseCurrentHeadAndroidColdStartStability({
      commandRunner: fakeRunner(), device: { serial: 'PRIVATE-SERIAL' }, deviceSummary, candidate,
      attempts: 4, wait: async () => {},
    }),
    /between one and three/u,
  );
});

test('requires the explicit current-head route and accepts safe ADB or candidate overrides', () => {
  assert.deepEqual(parseMainNavigationArguments(['--current-head']), {
    currentHead: true,
    adbPath: 'adb',
    candidateDirectory: null,
    coldStartAttempts: null,
  });
  assert.deepEqual(parseMainNavigationArguments(['--current-head', '--adb', '/safe/adb']), {
    currentHead: true,
    adbPath: '/safe/adb',
    candidateDirectory: null,
    coldStartAttempts: null,
  });
  assert.deepEqual(parseMainNavigationArguments([
    '--current-head', '--candidate-dir', '/private/candidate',
  ]), {
    currentHead: true,
    adbPath: 'adb',
    candidateDirectory: '/private/candidate',
    coldStartAttempts: null,
  });
  assert.equal(parseMainNavigationArguments(['--current-head', '--cold-start-attempts', '3']).coldStartAttempts, 3);
  assert.throws(() => parseMainNavigationArguments([]), /requires --current-head/u);
  assert.throws(
    () => parseMainNavigationArguments(['--current-head', '--other', 'x']),
    /Unknown argument/u,
  );
});
