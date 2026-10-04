#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundleId = 'com.shareittoo.app';
const uploadSigningSha1 = '6A7973861485F7330D5725FFD6AAA9066D789714';
const firebaseNames = [
  'SIT_FIREBASE_PROJECT_ID',
  'SIT_FIREBASE_MESSAGING_SENDER_ID',
  'SIT_FIREBASE_STORAGE_BUCKET',
  'SIT_FIREBASE_ANDROID_APP_ID',
  'SIT_FIREBASE_ANDROID_API_KEY',
  'SIT_FIREBASE_IOS_APP_ID',
  'SIT_FIREBASE_IOS_API_KEY',
];

function fail(message) {
  throw new Error(message);
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function source(root, relativePath, overrides) {
  if (Object.hasOwn(overrides, relativePath)) return overrides[relativePath];
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function requireIncludes(contents, expected, label) {
  if (!contents.includes(expected)) fail(`${label} is missing: ${expected}`);
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

export function parseGoogleServiceInfoPlist(contents) {
  if (typeof contents !== 'string' || !contents.includes('<plist')) {
    fail('GoogleService-Info.plist must be a valid XML property list.');
  }
  const values = {};
  const entries = /<key>\s*([^<]+?)\s*<\/key>\s*(?:<string>\s*([^<]*?)\s*<\/string>|<(true|false)\s*(?:\/>|>\s*<\/\3\s*>))/g;
  for (const match of contents.matchAll(entries)) {
    const key = decodeXml(match[1].trim());
    if (Object.hasOwn(values, key)) fail(`GoogleService-Info.plist contains duplicate key ${key}.`);
    values[key] = match[3] ? match[3] === 'true' : decodeXml(match[2] ?? '').trim();
  }
  return values;
}

function validateRepositoryScaffold(root, overrides) {
  const pubspec = source(root, 'pubspec.yaml', overrides);
  for (const dependency of [
    'firebase_core:',
    'firebase_messaging:',
    'firebase_crashlytics:',
    'firebase_auth:',
    'google_sign_in:',
    'flutter_facebook_auth:',
  ]) {
    requireIncludes(pubspec, dependency, 'pubspec.yaml');
  }
  for (const forbidden of ['firebase_analytics:', 'firebase_performance:', 'google_mobile_ads:']) {
    if (pubspec.includes(forbidden)) fail(`Undisclosed analytics, performance, or advertising SDK is forbidden: ${forbidden}`);
  }

  const gitignore = source(root, '.gitignore', overrides);
  for (const ignored of [
    '/android/app/google-services.json',
    '/ios/Runner/GoogleService-Info.plist',
    '**/firebase-service-account*.json',
  ]) {
    requireIncludes(gitignore, ignored, '.gitignore');
  }

  const androidSettings = source(root, 'android/settings.gradle', overrides);
  requireIncludes(androidSettings, 'com.google.gms.google-services', 'android/settings.gradle');
  requireIncludes(androidSettings, 'com.google.firebase.crashlytics', 'android/settings.gradle');
  const androidBuild = source(root, 'android/app/build.gradle', overrides);
  requireIncludes(androidBuild, 'file("google-services.json").exists()', 'android/app/build.gradle');
  requireIncludes(androidBuild, 'pluginManager.apply("com.google.gms.google-services")', 'android/app/build.gradle');
  requireIncludes(androidBuild, 'pluginManager.apply("com.google.firebase.crashlytics")', 'android/app/build.gradle');
  requireIncludes(androidBuild, `applicationId = "${bundleId}"`, 'android/app/build.gradle');
  requireIncludes(androidBuild, 'resValue "string", "facebook_app_id"', 'android/app/build.gradle');
  requireIncludes(androidBuild, 'resValue "string", "facebook_client_token"', 'android/app/build.gradle');
  requireIncludes(
    androidBuild,
    'SIT_CRASHLYTICS_NATIVE_SYMBOL_UPLOAD',
    'android/app/build.gradle',
  );
  requireIncludes(
    androidBuild,
    'SIT_CRASHLYTICS_UNSTRIPPED_NATIVE_LIBS_DIR',
    'android/app/build.gradle',
  );
  requireIncludes(androidBuild, 'nativeSymbolUploadEnabled true', 'android/app/build.gradle');
  requireIncludes(androidBuild, 'symbolGeneratorType "csym"', 'android/app/build.gradle');

  const androidManifest = source(root, 'android/app/src/main/AndroidManifest.xml', overrides);
  for (const marker of [
    'com.facebook.sdk.ApplicationId',
    'com.facebook.sdk.ClientToken',
    'com.facebook.sdk.AutoLogAppEventsEnabled',
    'com.facebook.sdk.AdvertiserIDCollectionEnabled',
  ]) {
    requireIncludes(androidManifest, marker, 'android/app/src/main/AndroidManifest.xml');
  }
  requireIncludes(
    androidManifest,
    'android:value="@string/facebook_app_id"',
    'android/app/src/main/AndroidManifest.xml',
  );
  requireIncludes(
    androidManifest,
    'android:value="@string/facebook_client_token"',
    'android/app/src/main/AndroidManifest.xml',
  );
  requireIncludes(
    androidManifest,
    'android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"',
    'android/app/src/main/AndroidManifest.xml',
  );
  requireIncludes(
    androidManifest,
    'android:name="com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE" tools:node="remove"',
    'android/app/src/main/AndroidManifest.xml',
  );

  const infoPlist = source(root, 'ios/Runner/Info.plist', overrides);
  requireIncludes(infoPlist, '<string>fetch</string>', 'ios/Runner/Info.plist');
  requireIncludes(infoPlist, '<string>remote-notification</string>', 'ios/Runner/Info.plist');
  for (const marker of [
    '<key>FacebookAppID</key>',
    '<key>FacebookClientToken</key>',
    '<key>FacebookAutoLogAppEventsEnabled</key>',
    '<key>FacebookAdvertiserIDCollectionEnabled</key>',
    '<string>fb$(SIT_FACEBOOK_APP_ID)</string>',
    '<string>$(SIT_GOOGLE_REVERSED_CLIENT_ID)</string>',
  ]) {
    requireIncludes(infoPlist, marker, 'ios/Runner/Info.plist');
  }
  if (/<key>FirebaseAppDelegateProxyEnabled<\/key>\s*<false\s*\/>/.test(infoPlist)) {
    fail('Firebase method swizzling must remain enabled for Apple FCM token handling.');
  }

  const entitlements = source(root, 'ios/Runner/Runner.entitlements', overrides);
  requireIncludes(entitlements, '<key>aps-environment</key>', 'ios/Runner/Runner.entitlements');
  requireIncludes(entitlements, '<string>$(APS_ENVIRONMENT)</string>', 'ios/Runner/Runner.entitlements');
  requireIncludes(entitlements, '<key>com.apple.developer.applesignin</key>', 'ios/Runner/Runner.entitlements');

  const xcodeProject = source(root, 'ios/Runner.xcodeproj/project.pbxproj', overrides);
  requireIncludes(xcodeProject, 'com.apple.Push', 'ios/Runner.xcodeproj/project.pbxproj');
  requireIncludes(xcodeProject, 'APS_ENVIRONMENT = development;', 'ios/Runner.xcodeproj/project.pbxproj');
  if ((xcodeProject.match(/APS_ENVIRONMENT = production;/g) ?? []).length < 2) {
    fail('iOS Profile and Release must both use the production APNs environment.');
  }
  requireIncludes(
    xcodeProject,
    '[firebase_crashlytics] Crashlytics Upload Symbols',
    'ios/Runner.xcodeproj/project.pbxproj',
  );
  requireIncludes(
    xcodeProject,
    'scripts/upload_ios_crashlytics_symbols.sh',
    'ios/Runner.xcodeproj/project.pbxproj',
  );

  const symbolScript = source(root, 'scripts/upload_ios_crashlytics_symbols.sh', overrides);
  requireIncludes(symbolScript, 'FirebaseCrashlytics/upload-symbols', 'Crashlytics symbol script');
  requireIncludes(symbolScript, 'GoogleService-Info.plist', 'Crashlytics symbol script');
  requireIncludes(symbolScript, 'DWARF_DSYM_FOLDER_PATH', 'Crashlytics symbol script');

  const runtime = source(root, 'lib/services/firebase_runtime.dart', overrides);
  requireIncludes(runtime, 'waitForApplePushToken', 'Firebase runtime');
  requireIncludes(runtime, 'getAPNSToken', 'Firebase runtime');
  requireIncludes(
    runtime,
    'crashDiagnosticsCollectionAllowed(',
    'Firebase runtime',
  );
  requireIncludes(
    runtime,
    'userEnabled: _crashDiagnosticsEnabled',
    'Firebase runtime',
  );
  requireIncludes(
    runtime,
    'FirebaseServicePreferencesStore.read()',
    'Firebase runtime',
  );
}

function environmentValues(environment) {
  return Object.fromEntries(firebaseNames.map((name) => [name, environment[name]?.trim() ?? '']));
}

function validateCommonValues(values) {
  const projectId = text(values.SIT_FIREBASE_PROJECT_ID, 'SIT_FIREBASE_PROJECT_ID');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    fail('SIT_FIREBASE_PROJECT_ID has an invalid Firebase project ID format.');
  }
  const senderId = text(values.SIT_FIREBASE_MESSAGING_SENDER_ID, 'SIT_FIREBASE_MESSAGING_SENDER_ID');
  if (!/^\d{6,20}$/.test(senderId)) fail('SIT_FIREBASE_MESSAGING_SENDER_ID must be numeric.');
  return { projectId, senderId };
}

function validateApiKey(value, label) {
  const apiKey = text(value, label);
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(apiKey)) fail(`${label} has an invalid Firebase client API key format.`);
  return apiKey;
}

export function deriveAndroidFirebaseReleaseEnvironment(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail('android/app/google-services.json must contain a JSON object.');
  }
  const clients = (Array.isArray(config.client) ? config.client : []).filter(
    (entry) => entry?.client_info?.android_client_info?.package_name === bundleId,
  );
  if (clients.length !== 1) {
    fail(`google-services.json must contain exactly one Android client for ${bundleId}.`);
  }
  const projectInfo = config.project_info;
  if (projectInfo === null || typeof projectInfo !== 'object') {
    fail('google-services.json project_info is missing.');
  }
  const client = clients[0];
  const values = {
    SIT_FIREBASE_PROJECT_ID: text(projectInfo.project_id, 'Firebase project ID'),
    SIT_FIREBASE_MESSAGING_SENDER_ID: text(
      String(projectInfo.project_number ?? ''),
      'Firebase messaging sender ID',
    ),
    SIT_FIREBASE_STORAGE_BUCKET: typeof projectInfo.storage_bucket === 'string'
      ? projectInfo.storage_bucket.trim()
      : '',
    SIT_FIREBASE_ANDROID_APP_ID: text(
      client.client_info?.mobilesdk_app_id,
      'Android Firebase App ID',
    ),
    SIT_FIREBASE_ANDROID_API_KEY: text(
      client.api_key?.[0]?.current_key,
      'Android Firebase API key',
    ),
  };
  validateAndroidConfig(config, values);
  return values;
}

export function deriveIosFirebaseReleaseEnvironment(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail('ios/Runner/GoogleService-Info.plist must contain scalar Firebase configuration values.');
  }
  const values = {
    SIT_FIREBASE_PROJECT_ID: text(config.PROJECT_ID, 'Firebase project ID'),
    SIT_FIREBASE_MESSAGING_SENDER_ID: text(
      String(config.GCM_SENDER_ID ?? ''),
      'Firebase messaging sender ID',
    ),
    SIT_FIREBASE_STORAGE_BUCKET: typeof config.STORAGE_BUCKET === 'string'
      ? config.STORAGE_BUCKET.trim()
      : '',
    SIT_FIREBASE_IOS_APP_ID: text(config.GOOGLE_APP_ID, 'Apple Firebase App ID'),
    SIT_FIREBASE_IOS_API_KEY: text(config.API_KEY, 'Apple Firebase API key'),
  };
  validateIosConfig(config, values);
  return values;
}

function validateAndroidConfig(config, values) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail('android/app/google-services.json must contain a JSON object.');
  }
  const { projectId, senderId } = validateCommonValues(values);
  const projectInfo = config.project_info;
  if (projectInfo === null || typeof projectInfo !== 'object') fail('google-services.json project_info is missing.');
  if (projectInfo.project_id !== projectId || String(projectInfo.project_number) !== senderId) {
    fail('google-services.json project ID or sender ID does not match the release environment.');
  }
  const clients = Array.isArray(config.client) ? config.client : [];
  const client = clients.find((entry) => entry?.client_info?.android_client_info?.package_name === bundleId);
  if (!client) fail(`google-services.json has no Android client for ${bundleId}.`);
  const appId = text(values.SIT_FIREBASE_ANDROID_APP_ID, 'SIT_FIREBASE_ANDROID_APP_ID');
  if (!/^1:\d+:android:[0-9a-f]+$/i.test(appId) || client.client_info?.mobilesdk_app_id !== appId) {
    fail('Android Firebase App ID is invalid or does not match google-services.json.');
  }
  const apiKey = validateApiKey(values.SIT_FIREBASE_ANDROID_API_KEY, 'SIT_FIREBASE_ANDROID_API_KEY');
  if (!(client.api_key ?? []).some((entry) => entry?.current_key === apiKey)) {
    fail('Android Firebase API key does not match google-services.json.');
  }
  const oauthClients = Array.isArray(client.oauth_client) ? client.oauth_client : [];
  const androidOauthClients = oauthClients.filter(
    (entry) => entry?.client_type === 1 && entry?.android_info?.package_name === bundleId,
  );
  const certificateHashes = androidOauthClients.map(
    (entry) => String(entry?.android_info?.certificate_hash ?? '').toUpperCase(),
  );
  if (androidOauthClients.length !== 2 ||
      certificateHashes.some((hash) => !/^[0-9A-F]{40}$/.test(hash)) ||
      new Set(certificateHashes).size !== 2 ||
      !certificateHashes.includes(uploadSigningSha1)) {
    fail('Android Google Sign-In must contain distinct upload and Play App Signing SHA-1 clients.');
  }
  const webOauthClients = oauthClients.filter((entry) => entry?.client_type === 3);
  if (webOauthClients.length !== 1 ||
      !/^\d+-[0-9a-z]+\.apps\.googleusercontent\.com$/i.test(webOauthClients[0]?.client_id ?? '')) {
    fail('Android Google Sign-In must contain exactly one valid Web OAuth client.');
  }
  const bucket = values.SIT_FIREBASE_STORAGE_BUCKET;
  if (bucket && projectInfo.storage_bucket && bucket !== projectInfo.storage_bucket) {
    fail('Firebase storage bucket does not match google-services.json.');
  }
  return { projectId, senderId };
}

function validateIosConfig(config, values) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail('ios/Runner/GoogleService-Info.plist must contain scalar Firebase configuration values.');
  }
  const { projectId, senderId } = validateCommonValues(values);
  if (config.PROJECT_ID !== projectId || String(config.GCM_SENDER_ID) !== senderId) {
    fail('GoogleService-Info.plist project ID or sender ID does not match the release environment.');
  }
  if (config.BUNDLE_ID !== bundleId) fail(`GoogleService-Info.plist must target ${bundleId}.`);
  const appId = text(values.SIT_FIREBASE_IOS_APP_ID, 'SIT_FIREBASE_IOS_APP_ID');
  if (!/^1:\d+:ios:[0-9a-f]+$/i.test(appId) || config.GOOGLE_APP_ID !== appId) {
    fail('Apple Firebase App ID is invalid or does not match GoogleService-Info.plist.');
  }
  const apiKey = validateApiKey(values.SIT_FIREBASE_IOS_API_KEY, 'SIT_FIREBASE_IOS_API_KEY');
  if (config.API_KEY !== apiKey) fail('Apple Firebase API key does not match GoogleService-Info.plist.');
  if (config.IS_SIGNIN_ENABLED !== true) {
    fail('Apple Firebase configuration must have Google Sign-In enabled.');
  }
  if (!/^\d+-[0-9a-z]+\.apps\.googleusercontent\.com$/i.test(config.CLIENT_ID ?? '')) {
    fail('Apple Firebase configuration is missing a valid Google OAuth client ID.');
  }
  if (config.REVERSED_CLIENT_ID !== `com.googleusercontent.apps.${config.CLIENT_ID.replace('.apps.googleusercontent.com', '')}`) {
    fail('Apple Firebase reversed Google OAuth client ID is invalid.');
  }
  if (config.IS_ANALYTICS_ENABLED === true || config.IS_ADS_ENABLED === true) {
    fail('Firebase Analytics and advertising must remain disabled for ShareItToo.');
  }
  const bucket = values.SIT_FIREBASE_STORAGE_BUCKET;
  if (bucket && config.STORAGE_BUCKET && bucket !== config.STORAGE_BUCKET) {
    fail('Firebase storage bucket does not match GoogleService-Info.plist.');
  }
  return { projectId, senderId };
}

export function validateFirebaseReleaseConfig({
  root,
  requireConfigured = false,
  platform = 'all',
  environment = {},
  androidConfig = undefined,
  iosConfig = undefined,
  sourceOverrides = {},
}) {
  if (!['android', 'ios', 'all'].includes(platform)) fail('platform must be android, ios, or all.');
  validateRepositoryScaffold(root, sourceOverrides);

  const androidPath = resolve(root, 'android/app/google-services.json');
  const iosPath = resolve(root, 'ios/Runner/GoogleService-Info.plist');
  const resolvedAndroid = platform === 'ios'
    ? null
    : androidConfig === undefined
      ? (existsSync(androidPath) ? JSON.parse(readFileSync(androidPath, 'utf8')) : null)
      : androidConfig;
  const resolvedIos = platform === 'android'
    ? null
    : iosConfig === undefined
      ? (existsSync(iosPath) ? parseGoogleServiceInfoPlist(readFileSync(iosPath, 'utf8')) : null)
      : iosConfig;
  const values = environmentValues(environment);
  const anyEnvironmentValue = Object.values(values).some(Boolean);
  const androidPresent = resolvedAndroid !== null;
  const iosPresent = resolvedIos !== null;

  if (!androidPresent && !iosPresent && anyEnvironmentValue) {
    fail('Firebase release values are present without platform configuration files.');
  }

  let androidIdentity = null;
  let iosIdentity = null;
  if (androidPresent) androidIdentity = validateAndroidConfig(resolvedAndroid, values);
  if (iosPresent) iosIdentity = validateIosConfig(resolvedIos, values);
  if (androidIdentity && iosIdentity &&
      (androidIdentity.projectId !== iosIdentity.projectId || androidIdentity.senderId !== iosIdentity.senderId)) {
    fail('Android and Apple Firebase configurations must use the same project and sender ID.');
  }

  if (requireConfigured) {
    if ((platform === 'android' || platform === 'all') && !androidPresent) {
      fail('A Firebase-enabled Android release requires android/app/google-services.json.');
    }
    if ((platform === 'ios' || platform === 'all') && !iosPresent) {
      fail('A Firebase-enabled Apple release requires ios/Runner/GoogleService-Info.plist.');
    }
  }

  const state = androidPresent && iosPresent ? 'configured' : androidPresent || iosPresent ? 'partial' : 'planned';
  return {
    state,
    androidConfigured: androidPresent,
    iosConfigured: iosPresent,
    analyticsEnabled: false,
    bundleId,
  };
}

function parseArguments(arguments_) {
  let requireConfigured = false;
  let platform = 'all';
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === '--require-configured') {
      requireConfigured = true;
    } else if (value === '--platform') {
      platform = arguments_[index + 1] ?? fail('--platform requires android, ios, or all.');
      index += 1;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return { requireConfigured, platform };
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const arguments_ = parseArguments(process.argv.slice(2));
  const summary = validateFirebaseReleaseConfig({ root, environment: process.env, ...arguments_ });
  console.log(
    `Firebase release configuration valid: state=${summary.state}, ` +
      `android=${summary.androidConfigured}, ios=${summary.iosConfigured}, ` +
      `analytics=${summary.analyticsEnabled}, bundleId=${summary.bundleId}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
