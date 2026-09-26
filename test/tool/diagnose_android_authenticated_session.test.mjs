import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  bindAuthenticatedSessionCandidateArchive,
  diagnoseAndroidAuthenticatedSession,
  parseAuthenticatedSessionArguments,
} from '../../tool/diagnose_android_authenticated_session.mjs';

const apkBytes = Buffer.from('verified authenticated candidate bytes');
const apkSha256 = createHash('sha256').update(apkBytes).digest('hex');
const device = { serial: 'private-device-id', state: 'device', attributes: {} };
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
const candidate = {
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026081018',
  commit: '555946e64e583e5b6ee3321de2c1f74f35fbf238',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: { apkSha256 },
};
const archive = { apkSha256 };

test('binds the explicit private archive without stale store-manifest truth', () => {
  const privateArchive = {
    ...candidate,
    privacyScan: 'passed',
    apkSha256,
    aabSha256: 'a'.repeat(64),
    signingCertificateSha256: 'b'.repeat(64),
    android: {
      apkSha256,
      aabSha256: 'a'.repeat(64),
      signingCertificateSha256: 'b'.repeat(64),
    },
  };
  const bound = bindAuthenticatedSessionCandidateArchive(privateArchive);
  assert.equal(bound.buildNumber, candidate.buildNumber);
  assert.equal(bound.commit, candidate.commit);
  assert.equal(bound.paymentMode, 'memory');
  assert.equal(bound.stripeLivemode, false);
  assert.throws(
    () => bindAuthenticatedSessionCandidateArchive({
      ...privateArchive,
      releaseChannel: 'production',
    }),
    /exact signed Internal Staging candidate/u,
  );
});

function node(label, bounds, extra = '') {
  return `<node text="" content-desc="${label}" enabled="true" clickable="true" bounds="${bounds}" ${extra}/>`;
}

const mainHierarchy = `<hierarchy>${node('Entdecken&#10;Tab 1 of 5', '[0,100][200,200]')}${node('Nachrichten&#10;Tab 4 of 5', '[400,100][600,200]')}${node('Mein SIT&#10;Tab 5 of 5', '[800,100][1000,200]')}</hierarchy>`;
const authenticatedHierarchy = `<hierarchy>${node('Meine Anzeigen', '[10,10][300,80]')}${node('Offene Box mit runder Sprechblase&#10;Mietanfragen', '[10,90][300,160]')}${node('Abmelden', '[10,170][300,240]')}${node('Entdecken', '[0,100][200,200]')}${node('Mein SIT', '[800,100][1000,200]')}<node text="private@example.com" content-desc=""/></hierarchy>`;
const guestHierarchy = `<hierarchy>${node('Anmelden', '[10,10][300,80]')}${node('Konto erstellen', '[10,90][300,160]')}${node('Entdecken', '[0,100][200,200]')}${node('Mein SIT', '[800,100][1000,200]')}</hierarchy>`;

function fakeRunner({
  locked = false,
  guest = false,
  transientGuestDumps = 0,
  bytes = apkBytes,
  internetLeak = false,
  playSplit = false,
  playInstaller = 'com.android.vending',
} = {}) {
  let surface = 'main';
  let launches = 0;
  let profileDumps = 0;
  let wifiEnabled = true;
  let mobileDataEnabled = true;
  const calls = [];
  const runner = (_file, args, options = {}) => {
    calls.push(args);
    const command = args.slice(2);
    if (command.join(' ') === 'shell dumpsys window policy') {
      return locked ? 'keyguardShowing=true' : 'keyguardShowing=false';
    }
    if (command.join(' ') === 'shell pm path com.shareittoo.app') {
      return playSplit
        ? 'package:/data/app/com.shareittoo.app/base.apk\npackage:/data/app/com.shareittoo.app/split_config.de.apk'
        : 'package:/data/app/base.apk';
    }
    if (command.join(' ') === 'shell pm list packages -i com.shareittoo.app') {
      return `package:com.shareittoo.app installer=${playInstaller}`;
    }
    if (command.join(' ') === 'exec-out cat /data/app/base.apk') return options.binary ? bytes : bytes.toString();
    if (command.join(' ') === 'shell dumpsys package com.shareittoo.app') {
      return '  versionName=1.0.0\n  versionCode=2026081018 minSdk=23 targetSdk=36';
    }
    if (command.join(' ') === 'shell settings get global wifi_on') {
      return wifiEnabled ? '1' : '0';
    }
    if (command.join(' ') === 'shell settings get global mobile_data') {
      return mobileDataEnabled ? '1' : '0';
    }
    if (command.join(' ') === 'shell svc wifi disable') {
      wifiEnabled = false;
      return '';
    }
    if (command.join(' ') === 'shell svc wifi enable') {
      wifiEnabled = true;
      return '';
    }
    if (command.join(' ') === 'shell svc data disable') {
      mobileDataEnabled = false;
      return '';
    }
    if (command.join(' ') === 'shell svc data enable') {
      mobileDataEnabled = true;
      return '';
    }
    if (command[0] === 'shell' && command[1] === 'ping') {
      if (internetLeak || wifiEnabled || mobileDataEnabled) return 'reachable';
      throw new Error('offline');
    }
    if (command[0] === 'shell' && command[1] === 'am' && command[2] === 'force-stop') {
      surface = 'main';
      profileDumps = 0;
      return '';
    }
    if (command[0] === 'shell' && command[1] === 'monkey') {
      launches += 1;
      surface = 'main';
      return 'Events injected: 1';
    }
    if (command[0] === 'shell' && command[1] === 'uiautomator') return 'UI hierarchy dumped';
    if (command.join(' ') === 'exec-out cat /sdcard/sit-authenticated-session-diagnostic.xml') {
      if (surface === 'profile') {
        profileDumps += 1;
        return guest || profileDumps <= transientGuestDumps
          ? guestHierarchy
          : authenticatedHierarchy;
      }
      return mainHierarchy;
    }
    if (command[0] === 'shell' && command[1] === 'input' && command[2] === 'tap') {
      const x = Number(command[3]);
      surface = x >= 700 ? 'profile' : 'main';
      return '';
    }
    if (command[0] === 'shell' && command[1] === 'rm') return '';
    throw new Error(`unexpected command: ${command.join(' ')}`);
  };
  return {
    runner,
    calls,
    get launches() { return launches; },
    get wifiEnabled() { return wifiEnabled; },
    get mobileDataEnabled() { return mobileDataEnabled; },
  };
}

test('proves a bounded authenticated cold-start session without emitting identity data', async () => {
  const fake = fakeRunner();
  const evidence = await diagnoseAndroidAuthenticatedSession({
    commandRunner: fake.runner,
    adbPath: 'adb',
    device,
    deviceSummary,
    candidate,
    archive,
    capturedAt: '2026-08-10T09:45:00.000Z',
    wait: async () => {},
  });
  assert.equal(evidence.status, 'passed-bounded-authenticated-session-diagnostic');
  assert.equal(evidence.tests.authenticatedProfileAccess.status, 'passed');
  assert.equal(evidence.tests.coldStartSessionRestore.status, 'passed');
  assert.equal(evidence.boundaries.syntheticRoleMatrixPassed, false);
  assert.equal(evidence.boundaries.accountIdentityRecorded, false);
  assert.equal(evidence.boundaries.containsPersonalAccountData, false);
  assert.equal(JSON.stringify(evidence).includes('private@example.com'), false);
  assert.equal(JSON.stringify(evidence).includes(device.serial), false);
  assert.equal(fake.launches, 2);
});

test('refuses a locked phone without entering a passcode', async () => {
  const fake = fakeRunner({ locked: true });
  await assert.rejects(
    diagnoseAndroidAuthenticatedSession({
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /locked.*never enters a passcode/,
  );
  assert.equal(fake.calls.some((args) => args.includes('input')), false);
});

test('does not misclassify the guest profile as an authenticated session', async () => {
  const fake = fakeRunner({ guest: true });
  await assert.rejects(
    diagnoseAndroidAuthenticatedSession({
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /still signed out.*never enters review credentials/,
  );
  const dumps = fake.calls.filter((args) => args.includes('uiautomator'));
  assert.equal(dumps.length, 10);
});

test('waits through a transient guest profile while the persisted session hydrates', async () => {
  const fake = fakeRunner({ transientGuestDumps: 2 });
  const evidence = await diagnoseAndroidAuthenticatedSession({
    commandRunner: fake.runner,
    adbPath: 'adb',
    device,
    deviceSummary,
    candidate,
    archive,
    wait: async () => {},
  });
  assert.equal(evidence.tests.coldStartSessionRestore.status, 'passed');
  assert.equal(fake.launches, 2);
});

test('proves the authenticated cold-start session offline and restores both network toggles', async () => {
  const fake = fakeRunner();
  const evidence = await diagnoseAndroidAuthenticatedSession({
    commandRunner: fake.runner,
    adbPath: 'adb',
    device,
    deviceSummary,
    candidate,
    archive,
    networkCondition: 'offline',
    wait: async () => {},
  });
  assert.deepEqual(evidence.network, {
    condition: 'offline',
    onlinePrecondition: 'passed',
    wifiDisabled: true,
    mobileDataDisabled: true,
    connectivityGate: 'passed-no-connectivity',
    networkRestored: 'passed-online',
  });
  assert.equal(fake.wifiEnabled, true);
  assert.equal(fake.mobileDataEnabled, true);
  assert.equal(fake.launches, 2);
});

test('rejects an offline diagnostic with remaining connectivity and still restores the network', async () => {
  const fake = fakeRunner({ internetLeak: true });
  await assert.rejects(
    diagnoseAndroidAuthenticatedSession({
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      networkCondition: 'offline',
      wait: async () => {},
    }),
    /offline gate still had Internet connectivity/,
  );
  assert.equal(fake.wifiEnabled, true);
  assert.equal(fake.mobileDataEnabled, true);
});

test('rejects an installed APK that differs from the candidate', async () => {
  const fake = fakeRunner({ bytes: Buffer.from('different bytes') });
  await assert.rejects(
    diagnoseAndroidAuthenticatedSession({
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /APK does not match/,
  );
});

test('accepts an exact-version split installation delivered by Google Play', async () => {
  const fake = fakeRunner({ playSplit: true });
  const evidence = await diagnoseAndroidAuthenticatedSession({
    commandRunner: fake.runner,
    adbPath: 'adb',
    device,
    deviceSummary,
    candidate,
    archive,
    wait: async () => {},
  });
  assert.equal(evidence.installed.delivery, 'google-play-split');
  assert.equal(evidence.installed.installerPackageName, 'com.android.vending');
  assert.equal(evidence.installed.splitCount, 2);
  assert.equal(evidence.installed.apkSha256, undefined);
  assert.equal(evidence.boundaries.storeInstallationGateSatisfied, true);
  assert.equal(evidence.boundaries.directDiagnosticOnly, false);
  assert.equal(fake.calls.some((args) => args.includes('cat') && args.includes('/data/app/com.shareittoo.app/base.apk')), false);
});

test('rejects a split installation not delivered by Google Play', async () => {
  const fake = fakeRunner({ playSplit: true, playInstaller: 'com.example.unknown' });
  await assert.rejects(
    diagnoseAndroidAuthenticatedSession({
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /not delivered by Google Play/,
  );
});

test('parses the source-bound current-head route without allowing an archive override', () => {
  assert.deepEqual(parseAuthenticatedSessionArguments(['--current-head']), {
    candidateDirectory: null,
    adbPath: 'adb',
    networkCondition: null,
    currentHead: true,
  });
  assert.throws(
    () => parseAuthenticatedSessionArguments([
      '--current-head',
      '--candidate-dir',
      '/private/alternate',
    ]),
    /cannot be combined/u,
  );
});
