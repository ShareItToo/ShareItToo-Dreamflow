import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildManualMatrixReadiness,
  parseActiveTransport,
  parseInstallerPackage,
  parsePackageIdentity,
  wifiNetworkFingerprint,
} from '../../tool/preflight_android_manual_matrix.mjs';

const candidate = {
  versionName: '1.0.0',
  buildNumber: '2026081029',
};

function readyInput(overrides = {}) {
  return {
    cellId: 'android-hotspot-renter',
    candidate,
    packageDump: '  versionCode=2026081029 minSdk=23 targetSdk=35\n  versionName=1.0.0\n',
    installerOutput: 'package:com.shareittoo.app  installer=com.android.vending\n',
    connectivityDump: [
      'Active default network: 123',
      'NetworkAgentInfo{ network{123}  handle{123} ni{WIFI CONNECTED} }',
    ].join('\n'),
    wifiStatus: 'Wi-Fi is enabled\nSSID: Test phone hotspot\n',
    fontScaleOutput: '2.0\n',
    accessibilityServices: 'com.google.android.marvin.talkback/.TalkBackService\n',
    baselineNetworkFingerprint: wifiNetworkFingerprint('SSID: Home network\n'),
    confirmedHotspot: true,
    ...overrides,
  };
}

test('parses only the safe package, installer, and transport fields needed for readiness', () => {
  assert.deepEqual(
    parsePackageIdentity('versionCode=2026081029 minSdk=23\nversionName=1.0.0\n'),
    { versionName: '1.0.0', versionCode: '2026081029' },
  );
  assert.equal(
    parseInstallerPackage('package:com.shareittoo.app installer=com.android.vending'),
    'com.android.vending',
  );
  assert.equal(parseActiveTransport(readyInput().connectivityDump), 'WIFI');
});

test('accepts a changed, manually confirmed hotspot only after Play install, TalkBack, and 200 percent text', () => {
  const report = buildManualMatrixReadiness(readyInput());
  assert.equal(report.status, 'ready-for-manual-matrix');
  assert.deepEqual(report.blockers, []);
  assert.equal(report.boundaries.manualMatrixPassed, false);
  assert.equal(report.boundaries.evidenceWritten, false);
});

test('direct APK, ordinary Wi-Fi, disabled TalkBack, and small text remain fail-closed', () => {
  const baseline = wifiNetworkFingerprint('SSID: Home network\n');
  const report = buildManualMatrixReadiness(readyInput({
    installerOutput: 'package:com.shareittoo.app installer=null\n',
    wifiStatus: 'SSID: Home network\n',
    baselineNetworkFingerprint: baseline,
    confirmedHotspot: false,
    fontScaleOutput: '0.85\n',
    accessibilityServices: 'null\n',
  }));
  assert.equal(report.status, 'pending-prerequisites');
  assert.deepEqual(report.blockers, [
    'play-internal-install-not-proven',
    'hotspot-not-manually-confirmed',
    'hotspot-network-change-not-proven',
    'talkback-not-enabled',
    'font-scale-below-200-percent',
  ]);
});

test('wrong candidate build can never become ready', () => {
  const report = buildManualMatrixReadiness(readyInput({
    packageDump: 'versionCode=2026081028\nversionName=1.0.0\n',
  }));
  assert.equal(report.status, 'pending-prerequisites');
  assert.ok(report.blockers.includes('exact-candidate-not-installed'));
});

test('preflight report never records raw SSID or device identifiers', () => {
  const report = buildManualMatrixReadiness(readyInput({
    wifiStatus: 'SSID: PRIVATE NETWORK NAME\n',
  }));
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('PRIVATE NETWORK NAME'), false);
  assert.equal(serialized.includes('serial'), false);
  assert.match(report.observed.networkFingerprint, /^[a-f0-9]{16}$/u);
  assert.equal(report.boundaries.containsRawNetworkNames, false);
  assert.equal(report.boundaries.containsRawNetworkRoutes, false);
  assert.equal(report.boundaries.containsRawDeviceIdentifiers, false);
});

test('uses a sanitized route fingerprint when Android hides the SSID', () => {
  const privateRoute = 'default via 192.0.2.1 dev wlan0 proto dhcp src 192.0.2.8\n';
  const report = buildManualMatrixReadiness(readyInput({
    wifiStatus: 'Wi-Fi is enabled\nSSID: <unknown ssid>\n',
    routeStatus: privateRoute,
    baselineNetworkFingerprint: wifiNetworkFingerprint(
      'SSID: <unknown ssid>\n',
      'default via 198.51.100.1 dev wlan0 proto dhcp src 198.51.100.8\n',
    ),
  }));
  assert.equal(report.status, 'ready-for-manual-matrix');
  assert.match(report.observed.networkFingerprint, /^[a-f0-9]{16}$/u);
  assert.equal(JSON.stringify(report).includes('192.0.2'), false);
  assert.equal(JSON.stringify(report).includes('wlan0'), false);
});
