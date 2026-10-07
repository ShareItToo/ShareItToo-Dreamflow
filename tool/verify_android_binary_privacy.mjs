#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) {
      throw new Error(`Invalid argument near ${key ?? '<end>'}`);
    }
    values[key.slice(2)] = value;
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
const applicationId = args['application-id'] ?? 'com.shareittoo.app';
if (!/^com\.shareittoo\.app(?:\.qa)?$/.test(applicationId)) {
  throw new Error('Unsupported --application-id');
}
const required = [
  'apk',
  'aab',
  'aapt',
  'commit',
  'api-base-url',
  'version-name',
  'version-code',
  'output',
];
for (const name of required) {
  if (!args[name]) throw new Error(`Missing --${name}`);
}

function command(file, commandArgs, encoding = 'utf8') {
  return execFileSync(file, commandArgs, {
    encoding,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function archiveEntries(archive) {
  return command('unzip', ['-Z1', archive])
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function archivePayload(archive, predicate) {
  const selected = archiveEntries(archive).filter(predicate);
  if (selected.length === 0) return { entries: [], payload: Buffer.alloc(0) };
  const payloads = selected.map((entry) =>
    command('unzip', ['-p', archive, entry], null),
  );
  return { entries: selected, payload: Buffer.concat(payloads) };
}

function includesAscii(buffer, value) {
  return buffer.includes(Buffer.from(value, 'utf8'));
}

function includesAsciiPattern(buffer, pattern) {
  return pattern.test(buffer.toString('latin1'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const manifest = command(args.aapt, [
  'dump',
  'xmltree',
  args.apk,
  'AndroidManifest.xml',
]);
const badging = command(args.aapt, ['dump', 'badging', args.apk]);
const permissionDump = command(args.aapt, ['dump', 'permissions', args.apk]);
const apkDex = archivePayload(args.apk, (entry) => /^classes\d*\.dex$/.test(entry));
const apkApp = archivePayload(args.apk, (entry) => /(^|\/)libapp\.so$/.test(entry));
const aabApp = archivePayload(args.aab, (entry) => /(^|\/)libapp\.so$/.test(entry));
const compiledPayload = Buffer.concat([apkDex.payload, apkApp.payload, aabApp.payload]);

const findings = [];
const requireCheck = (condition, code, message) => {
  if (!condition) findings.push({ code, message });
};
const manifestBooleanIsFalse = (name) =>
  new RegExp(`A: android:${name}[^\\n]*\\(type 0x12\\)0x0`).test(manifest);
const manifestMetadataBooleanIsFalse = (name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `A: android:name[^\\n]*="${escaped}"[\\s\\S]{0,320}`
      + 'A: android:value[^\\n]*\\(type 0x12\\)0x0',
  ).test(manifest);
};

requireCheck(
  badging.includes(
    `package: name='${applicationId}' versionCode='${args['version-code']}' versionName='${args['version-name']}'`,
  ),
  'identity_mismatch',
  'Package name or release version does not match the release request.',
);
requireCheck(
  /targetSdkVersion:'36'/.test(badging),
  'target_sdk_mismatch',
  'The signed APK must target Android API 36.',
);
requireCheck(
  manifestBooleanIsFalse('allowBackup'),
  'backup_not_disabled',
  'Application backup must be disabled in the merged release manifest.',
);
requireCheck(
  manifestBooleanIsFalse('usesCleartextTraffic'),
  'cleartext_not_disabled',
  'Cleartext network traffic must be disabled in the merged release manifest.',
);
requireCheck(
  !manifest.includes('android:requestLegacyExternalStorage'),
  'legacy_storage_enabled',
  'Legacy external storage must not be enabled.',
);
requireCheck(
  manifest.includes('android:dataExtractionRules'),
  'data_extraction_rules_missing',
  'Android 12+ data extraction rules are missing.',
);
requireCheck(
  manifest.includes('android:fullBackupContent'),
  'backup_rules_missing',
  'Legacy full-backup exclusion rules are missing.',
);

const permissionLines = permissionDump
  .split('\n')
  .filter((line) => line.startsWith('uses-permission:'));
const permissions = permissionLines.map((line) => {
  const name = line.match(/name='([^']+)'/)?.[1] ?? 'unknown';
  const maxSdkVersion = line.match(/maxSdkVersion='([^']+)'/)?.[1] ?? null;
  return { name, maxSdkVersion };
});

requireCheck(
  permissionLines.includes(
    "uses-permission: name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'",
  ),
  'read_storage_scope',
  'Legacy read-storage access must be capped at Android API 32.',
);
requireCheck(
  permissionLines.includes(
    "uses-permission: name='android.permission.WRITE_EXTERNAL_STORAGE' maxSdkVersion='28'",
  ),
  'write_storage_scope',
  'Legacy write-storage access must be capped at Android API 28.',
);

const prohibitedPermissions = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.RECORD_AUDIO',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.PACKAGE_USAGE_STATS',
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
];
for (const name of prohibitedPermissions) {
  requireCheck(
    !permissions.some((permission) => permission.name === name),
    'prohibited_permission',
    `Unexpected high-risk permission in signed APK: ${name}`,
  );
}

const requiredFirebaseRegistrars = [
  'FirebaseMessagingRegistrar',
  'CrashlyticsRegistrar',
  'FirebaseInstallationsRegistrar',
  'FirebaseAuthRegistrar',
];
for (const registrar of requiredFirebaseRegistrars) {
  requireCheck(
    manifest.includes(registrar),
    'firebase_sdk_missing',
    `Expected disclosed Firebase component is missing: ${registrar}`,
  );
}

const prohibitedSdkMarkers = [
  'AnalyticsConnectorRegistrar',
  'FirebaseAnalytics',
  'AppMeasurement',
  'MobileAds',
  'appsflyer',
  'com.adjust',
  'mixpanel',
  'amplitude',
  'segment.analytics',
];
for (const marker of prohibitedSdkMarkers) {
  requireCheck(
    !includesAscii(apkDex.payload, marker),
    'prohibited_sdk',
    `Undisclosed analytics, advertising, or attribution SDK marker found: ${marker}`,
  );
}

requireCheck(apkApp.entries.length > 0, 'apk_app_code_missing', 'APK libapp.so is missing.');
requireCheck(aabApp.entries.length > 0, 'aab_app_code_missing', 'AAB libapp.so is missing.');
for (const [artifact, payload] of [
  ['APK', apkApp.payload],
  ['AAB', aabApp.payload],
]) {
  requireCheck(
    includesAscii(payload, args.commit),
    'commit_binding_missing',
    `${artifact} is not bound to the requested Git commit.`,
  );
  requireCheck(
    includesAscii(payload, args['api-base-url']),
    'api_binding_missing',
    `${artifact} is not bound to the requested API base URL.`,
  );
}

const forbiddenRuntimeMarkers = [
  'https://app.example',
  'https://shareittoo.app/items/',
  'https://shareittoo.app/u/',
  'http://127.0.0.1:8123/',
  'https://api.openai.com/',
  'nominatim.openstreetmap.org',
  'tile.openstreetmap.org',
];
for (const marker of forbiddenRuntimeMarkers) {
  requireCheck(
    !includesAscii(apkApp.payload, marker) && !includesAscii(aabApp.payload, marker),
    'forbidden_runtime_origin',
    `Placeholder, legacy, or local runtime origin found: ${marker}`,
  );
}

const googleMapsEndpointPresent = includesAscii(compiledPayload, 'maps.googleapis.com');
const googleMapsProxyEndpointPresent = includesAscii(compiledPayload, '/maps/places/autocomplete');
const facebookLoginPresent = manifest.includes('com.facebook.FacebookActivity');
const firebaseAuthPresent = manifest.includes('FirebaseAuthRegistrar');
requireCheck(
  !facebookLoginPresent || manifestMetadataBooleanIsFalse('com.facebook.sdk.AutoLogAppEventsEnabled'),
  'facebook_auto_events_enabled',
  'Facebook automatic app events must be explicitly disabled in the signed manifest.',
);
requireCheck(
  !facebookLoginPresent || manifestMetadataBooleanIsFalse('com.facebook.sdk.AdvertiserIDCollectionEnabled'),
  'facebook_advertiser_id_enabled',
  'Facebook advertiser ID collection must be explicitly disabled in the signed manifest.',
);
requireCheck(
  !googleMapsEndpointPresent,
  'direct_google_maps_client_forbidden',
  'Google Maps web-service endpoints must not be embedded in the app; use the authenticated backend proxy.',
);
requireCheck(
  googleMapsProxyEndpointPresent,
  'google_maps_proxy_missing',
  'The authenticated backend address-suggestion endpoint is missing from the app.',
);

const externalServices = {
  firebaseCloudMessaging: {
    detected: manifest.includes('FirebaseMessagingRegistrar'),
    disclosure: 'Firebase Cloud Messaging',
  },
  firebaseCrashlytics: {
    detected: manifest.includes('CrashlyticsRegistrar'),
    disclosure: 'Firebase Crashlytics',
  },
  firebaseAuthentication: {
    detected: firebaseAuthPresent,
    disclosure: 'Firebase Authentication',
    providers: ['Google', 'Apple', 'Facebook'],
  },
  facebookLogin: {
    detected: facebookLoginPresent,
    disclosure: 'Facebook Login',
    automaticAppEvents: false,
    advertiserIdCollection: false,
  },
  googleMapsPlatform: {
    detected: googleMapsProxyEndpointPresent,
    disclosure: 'Google Maps Platform',
    codeEndpointPresent: googleMapsEndpointPresent,
    backendProxyEndpointPresent: googleMapsProxyEndpointPresent,
    clientCredentialEmbedded: false,
    serverCredentialVerification: 'backend-deployment-gate',
  },
  openAiHelpers: {
    detected: includesAscii(compiledPayload, 'api.openai.com'),
    disclosure: 'disabled-in-candidate',
  },
};

const disclosedSdks = [
  'Firebase Cloud Messaging',
  'Firebase Crashlytics',
  ...(externalServices.firebaseAuthentication.detected ? ['Firebase Authentication'] : []),
  ...(externalServices.facebookLogin.detected ? ['Facebook Login'] : []),
  ...(externalServices.googleMapsPlatform.detected ? ['Google Maps Platform'] : []),
];

const report = {
  schemaVersion: 1,
  platform: 'android',
  status: findings.length === 0 ? 'passed' : 'failed',
  generatedAt: new Date().toISOString(),
  identity: {
    applicationId,
    versionName: args['version-name'],
    versionCode: args['version-code'],
    commit: args.commit,
    apiBaseUrl: args['api-base-url'],
    targetSdkVersion: 36,
  },
  artifacts: {
    apk: { path: args.apk, sha256: sha256(args.apk) },
    aab: { path: args.aab, sha256: sha256(args.aab) },
  },
  policies: {
    backupDisabled: manifestBooleanIsFalse('allowBackup'),
    cleartextTrafficDisabled: manifestBooleanIsFalse('usesCleartextTraffic'),
    legacyExternalStorageDisabled: !manifest.includes(
      'android:requestLegacyExternalStorage',
    ),
    backupExclusionRulesPresent:
      manifest.includes('android:dataExtractionRules') &&
      manifest.includes('android:fullBackupContent'),
  },
  permissions,
  disclosedSdks,
  externalServices,
  requiredConsoleVerifications: externalServices.googleMapsPlatform.detected
    ? ['googleMapsServerCredentialApiAndIpRestrictions']
    : [],
  prohibitedSdkMarkersChecked: prohibitedSdkMarkers,
  forbiddenRuntimeMarkersChecked: forbiddenRuntimeMarkers,
  findings,
};

mkdirSync(dirname(args.output), { recursive: true });
writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`ERROR [${finding.code}]: ${finding.message}`);
  }
  console.error(`Android binary privacy scan failed. Evidence: ${args.output}`);
  process.exit(1);
}

console.log(`Android binary privacy scan passed. Evidence: ${args.output}`);
