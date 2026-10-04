import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  diagnoseCurrentHeadAndroidLegalRoutes,
  parseLegalRouteArguments,
  summarizeCurrentCandidateLegalRootPreparation,
} from '../../tool/diagnose_current_head_android_legal_routes.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const installedApk = Buffer.from('exact current-head legal route candidate');
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

const navigation = ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'];
const documents = [
  ['Impressum', 'Anbieter'],
  ['Datenschutz', 'Welche Daten Nutzer angeben'],
  ['AGB', 'Geltungsbereich und Dokumentenstand'],
  ['Community‑Regeln', 'Erlaubte Inhalte'],
  ['Gebühren & Zahlungsbedingungen', 'Plattformgebühr'],
  ['Stornierungsbedingungen', 'Wann kann storniert werden?'],
  ['Haftungsausschluss', 'Rolle der Plattform'],
];

function node(label, bounds, { clickable = true } = {}) {
  const encodedLabel = label.replaceAll('&', '&amp;').replaceAll('\n', '&#10;');
  return `<node text="" content-desc="${encodedLabel}" clickable="${clickable}" enabled="true" bounds="${bounds}"/>`;
}

function fakeRunner({ locked = false, changedApk = false, omittedDocument = null } = {}) {
  let screen = 'explore';
  const hierarchy = () => {
    const nav = navigation.map((label, index) => (
      node(`${label}\nTab ${index + 1} of 5`, `[${index * 200},2200][${(index + 1) * 200},2400]`)
    )).join('');
    if (screen === 'explore') return `<hierarchy>${nav}${node('Jetzt suchen', '[0,100][400,200]')}</hierarchy>`;
    if (screen === 'profile') {
      return `<hierarchy>${nav}${node('Meine Anzeigen', '[0,100][300,200]')}${node('Mietanfragen', '[0,200][300,300]')}${node('Abmelden', '[0,300][300,400]')}${node('Suchen', '[850,0][950,100]')}</hierarchy>`;
    }
    if (screen === 'search') {
      return `<hierarchy>${nav}${node('Suche schließen', '[850,0][950,100]')}${node('Profil durchsuchen', '[0,100][800,220]')}</hierarchy>`;
    }
    if (screen === 'legal') {
      const rows = documents
        .filter(([label]) => label !== omittedDocument)
        .map(([label], index) => node(label, `[0,${100 + index * 120}][1000,${200 + index * 120}]`))
        .join('');
      return `<hierarchy>${node('Rechtliches', '[200,0][800,100]', { clickable: false })}${rows}</hierarchy>`;
    }
    const document = documents.find(([label]) => label === screen);
    if (document !== undefined) {
      return `<hierarchy>${node(document[0], '[200,0][800,100]', { clickable: false })}${node(document[1], '[0,150][1000,300]', { clickable: false })}</hierarchy>`;
    }
    throw new Error(`Unexpected fake screen: ${screen}`);
  };

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
      screen = 'explore';
      return 'Events injected: 1';
    }
    if (joined === 'shell uiautomator dump /sdcard/sit-main-navigation-diagnostic.xml') {
      return 'UI hierarchy dumped';
    }
    if (joined === 'exec-out cat /sdcard/sit-main-navigation-diagnostic.xml') return hierarchy();
    if (joined === 'shell rm -f /sdcard/sit-main-navigation-diagnostic.xml') return '';
    if (joined === 'shell input text Rechtliches') return '';
    if (joined === 'shell input keyevent 66') {
      screen = 'legal';
      return '';
    }
    if (joined === 'shell input keyevent 4') {
      if (documents.some(([label]) => label === screen)) screen = 'legal';
      else if (screen === 'legal') screen = 'profile';
      return '';
    }
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'swipe') return '';
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      const x = Number(command[3]);
      const y = Number(command[4]);
      if (screen === 'explore' && y >= 2200 && x >= 800) screen = 'profile';
      else if (screen === 'profile' && y < 200) screen = 'search';
      else if (screen === 'legal') {
        const index = Math.floor((y - 100) / 120);
        screen = documents.filter(([label]) => label !== omittedDocument)[index][0];
      } else if (screen === 'profile' && y >= 2200 && x < 200) screen = 'explore';
      return '';
    }
    throw new Error(`Unexpected fake ADB command (${options.binary ? 'binary' : 'text'}): ${joined}`);
  };
}

function diagnose(overrides = {}) {
  return diagnoseCurrentHeadAndroidLegalRoutes({
    commandRunner: fakeRunner(),
    device: { serial: 'PRIVATE-SERIAL', state: 'device', attributes: {} },
    deviceSummary,
    candidate,
    capturedAt: '2026-08-23T13:00:00.000Z',
    wait: async () => {},
    ...overrides,
  });
}

test('proves seven informational legal routes with sanitized read-only evidence', async () => {
  const evidence = await diagnose();
  assert.equal(evidence.status, 'passed-bounded-authenticated-legal-route-diagnostic');
  assert.deepEqual(Object.keys(evidence.tests), documents.map(([label]) => label));
  assert.equal(evidence.boundaries.authenticatedLegalRoutesPassed, true);
  assert.equal(evidence.boundaries.professionalLegalApprovalPassed, false);
  assert.equal(evidence.boundaries.platformWithdrawalOpened, false);
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

test('fails closed when an informational legal route is missing', async () => {
  await assert.rejects(
    () => diagnose({
      commandRunner: fakeRunner({ omittedDocument: 'Haftungsausschluss' }),
    }),
    /Haftungsausschluss legal entry is unavailable/u,
  );
});

test('requires the explicit current-head route and accepts only an ADB override', () => {
  assert.deepEqual(parseLegalRouteArguments(['--current-head']), {
    currentHead: true,
    adbPath: 'adb',
    candidateDirectory: null,
    onlyLabel: null,
    prepareLegalRoot: false,
    fromCurrentLegalRoot: false,
    retainLegalRoot: false,
  });
  assert.deepEqual(parseLegalRouteArguments(['--current-head', '--adb', '/safe/adb']), {
    currentHead: true,
    adbPath: '/safe/adb',
    candidateDirectory: null,
    onlyLabel: null,
    prepareLegalRoot: false,
    fromCurrentLegalRoot: false,
    retainLegalRoot: false,
  });
  assert.deepEqual(parseLegalRouteArguments([
    '--candidate-dir', 'private-candidate', '--prepare-legal-root',
  ]), {
    currentHead: false,
    adbPath: 'adb',
    candidateDirectory: resolve('private-candidate'),
    onlyLabel: null,
    prepareLegalRoot: true,
    fromCurrentLegalRoot: false,
    retainLegalRoot: false,
  });
  assert.throws(() => parseLegalRouteArguments([]), /requires --current-head or --candidate-dir/u);
  assert.throws(
    () => parseLegalRouteArguments(['--current-head', '--candidate-dir', 'x']),
    /cannot be combined/u,
  );
});

test('prepares an exact current-candidate legal root without treating it as a document result', () => {
  const result = summarizeCurrentCandidateLegalRootPreparation({
    candidate,
    deviceSummary,
    sourceDrift: { mobileSourceChanged: false },
    capturedAt: '2026-08-23T13:00:00.000Z',
  });
  assert.equal(result.status, 'prepared-read-only-legal-root');
  assert.equal(result.tests.legalRootVisible, true);
  assert.equal(result.tests.documentVerified, false);
});
