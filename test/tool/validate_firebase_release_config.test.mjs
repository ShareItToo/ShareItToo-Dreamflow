import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveAndroidFirebaseReleaseEnvironment,
  deriveIosFirebaseReleaseEnvironment,
  parseGoogleServiceInfoPlist,
  validateFirebaseReleaseConfig,
} from '../../tool/validate_firebase_release_config.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const environment = {
  SIT_FIREBASE_PROJECT_ID: 'shareittoo-staging-2026',
  SIT_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  SIT_FIREBASE_STORAGE_BUCKET: 'shareittoo-staging-2026.firebasestorage.app',
  SIT_FIREBASE_ANDROID_APP_ID: '1:123456789012:android:abcdef0123456789',
  SIT_FIREBASE_ANDROID_API_KEY: 'AIzaSyD1234567890_abcdefghijkLMNOPQRST',
  SIT_FIREBASE_IOS_APP_ID: '1:123456789012:ios:0123456789abcdef',
  SIT_FIREBASE_IOS_API_KEY: 'AIzaSyI1234567890_abcdefghijkLMNOPQRST',
};
const androidConfig = {
  project_info: {
    project_number: environment.SIT_FIREBASE_MESSAGING_SENDER_ID,
    project_id: environment.SIT_FIREBASE_PROJECT_ID,
    storage_bucket: environment.SIT_FIREBASE_STORAGE_BUCKET,
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: environment.SIT_FIREBASE_ANDROID_APP_ID,
        android_client_info: { package_name: 'com.shareittoo.app' },
      },
      api_key: [{ current_key: environment.SIT_FIREBASE_ANDROID_API_KEY }],
      oauth_client: [
        {
          client_id: '123456789012-upload.apps.googleusercontent.com',
          client_type: 1,
          android_info: {
            package_name: 'com.shareittoo.app',
            certificate_hash: '6A7973861485F7330D5725FFD6AAA9066D789714',
          },
        },
        {
          client_id: '123456789012-play.apps.googleusercontent.com',
          client_type: 1,
          android_info: {
            package_name: 'com.shareittoo.app',
            certificate_hash: '11223344556677889900AABBCCDDEEFF00112233',
          },
        },
        {
          client_id: '123456789012-web.apps.googleusercontent.com',
          client_type: 3,
        },
      ],
    },
  ],
};
const iosConfig = {
  API_KEY: environment.SIT_FIREBASE_IOS_API_KEY,
  GCM_SENDER_ID: environment.SIT_FIREBASE_MESSAGING_SENDER_ID,
  BUNDLE_ID: 'com.shareittoo.app',
  PROJECT_ID: environment.SIT_FIREBASE_PROJECT_ID,
  STORAGE_BUCKET: environment.SIT_FIREBASE_STORAGE_BUCKET,
  GOOGLE_APP_ID: environment.SIT_FIREBASE_IOS_APP_ID,
  CLIENT_ID: '123456789012-iosclient.apps.googleusercontent.com',
  REVERSED_CLIENT_ID: 'com.googleusercontent.apps.123456789012-iosclient',
  IS_ADS_ENABLED: false,
  IS_ANALYTICS_ENABLED: false,
  IS_SIGNIN_ENABLED: true,
};

function validate(options = {}) {
  return validateFirebaseReleaseConfig({
    root: repositoryRoot,
    androidConfig: null,
    iosConfig: null,
    ...options,
  });
}

test('parses both compact and expanded Firebase plist booleans', () => {
  const parsed = parseGoogleServiceInfoPlist(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>IS_ADS_ENABLED</key><false/>
  <key>IS_ANALYTICS_ENABLED</key><false></false>
  <key>IS_SIGNIN_ENABLED</key><true></true>
</dict></plist>`);
  assert.equal(parsed.IS_ADS_ENABLED, false);
  assert.equal(parsed.IS_ANALYTICS_ENABLED, false);
  assert.equal(parsed.IS_SIGNIN_ENABLED, true);
});

test('accepts the honest pre-Firebase scaffold as planned', () => {
  assert.deepEqual(validate(), {
    state: 'planned',
    androidConfigured: false,
    iosConfigured: false,
    analyticsEnabled: false,
    bundleId: 'com.shareittoo.app',
  });
});

test('strict all-platform mode rejects missing console configuration', () => {
  assert.throws(
    () => validate({ requireConfigured: true }),
    /requires android\/app\/google-services.json/,
  );
});

test('rejects release values without platform configuration files', () => {
  assert.throws(
    () => validate({ environment }),
    /values are present without platform configuration files/,
  );
});

test('accepts a matching Android-only build configuration', () => {
  const summary = validate({
    requireConfigured: true,
    platform: 'android',
    environment,
    androidConfig,
  });
  assert.equal(summary.state, 'partial');
  assert.equal(summary.androidConfigured, true);
  assert.equal(summary.iosConfigured, false);
});

test('derives the exact public Android Firebase build environment from the local config', () => {
  assert.deepEqual(deriveAndroidFirebaseReleaseEnvironment(androidConfig), {
    SIT_FIREBASE_PROJECT_ID: environment.SIT_FIREBASE_PROJECT_ID,
    SIT_FIREBASE_MESSAGING_SENDER_ID: environment.SIT_FIREBASE_MESSAGING_SENDER_ID,
    SIT_FIREBASE_STORAGE_BUCKET: environment.SIT_FIREBASE_STORAGE_BUCKET,
    SIT_FIREBASE_ANDROID_APP_ID: environment.SIT_FIREBASE_ANDROID_APP_ID,
    SIT_FIREBASE_ANDROID_API_KEY: environment.SIT_FIREBASE_ANDROID_API_KEY,
  });
});

test('derives the exact public Apple Firebase build environment from the local config', () => {
  assert.deepEqual(deriveIosFirebaseReleaseEnvironment(iosConfig), {
    SIT_FIREBASE_PROJECT_ID: environment.SIT_FIREBASE_PROJECT_ID,
    SIT_FIREBASE_MESSAGING_SENDER_ID: environment.SIT_FIREBASE_MESSAGING_SENDER_ID,
    SIT_FIREBASE_STORAGE_BUCKET: environment.SIT_FIREBASE_STORAGE_BUCKET,
    SIT_FIREBASE_IOS_APP_ID: environment.SIT_FIREBASE_IOS_APP_ID,
    SIT_FIREBASE_IOS_API_KEY: environment.SIT_FIREBASE_IOS_API_KEY,
  });
});

test('refuses an ambiguous local Android Firebase client', () => {
  const ambiguous = structuredClone(androidConfig);
  ambiguous.client.push(structuredClone(ambiguous.client[0]));
  assert.throws(
    () => deriveAndroidFirebaseReleaseEnvironment(ambiguous),
    /exactly one Android client/,
  );
});

test('rejects Google Sign-In without a distinct Play App Signing client', () => {
  const incomplete = structuredClone(androidConfig);
  incomplete.client[0].oauth_client = incomplete.client[0].oauth_client.filter(
    (entry) => entry.client_type !== 1 ||
      entry.android_info.certificate_hash === '6A7973861485F7330D5725FFD6AAA9066D789714',
  );
  assert.throws(
    () => deriveAndroidFirebaseReleaseEnvironment(incomplete),
    /upload and Play App Signing SHA-1 clients/,
  );
});

test('rejects Google Sign-In without one valid Web OAuth client', () => {
  const incomplete = structuredClone(androidConfig);
  incomplete.client[0].oauth_client = incomplete.client[0].oauth_client.filter(
    (entry) => entry.client_type !== 3,
  );
  assert.throws(
    () => deriveAndroidFirebaseReleaseEnvironment(incomplete),
    /exactly one valid Web OAuth client/,
  );
});

test('Android-only mode ignores incomplete Apple configuration', () => {
  const summary = validate({
    requireConfigured: true,
    platform: 'android',
    environment: {
      ...environment,
      SIT_FIREBASE_IOS_APP_ID: '',
      SIT_FIREBASE_IOS_API_KEY: '',
    },
    androidConfig,
    iosConfig: { ...iosConfig, IS_SIGNIN_ENABLED: false },
  });
  assert.equal(summary.state, 'partial');
  assert.equal(summary.androidConfigured, true);
  assert.equal(summary.iosConfigured, false);
});

test('accepts matching Android and Apple release configuration', () => {
  const summary = validate({
    requireConfigured: true,
    platform: 'all',
    environment,
    androidConfig,
    iosConfig,
  });
  assert.equal(summary.state, 'configured');
});

test('rejects an Android client registered to another package', () => {
  const wrong = structuredClone(androidConfig);
  wrong.client[0].client_info.android_client_info.package_name = 'com.example.wrong';
  assert.throws(
    () => validate({ environment, androidConfig: wrong }),
    /no Android client for com\.shareittoo\.app/,
  );
});

test('rejects an Apple app registered to another bundle ID', () => {
  assert.throws(
    () => validate({ environment, iosConfig: { ...iosConfig, BUNDLE_ID: 'com.example.wrong' } }),
    /must target com\.shareittoo\.app/,
  );
});

test('rejects Firebase Analytics or advertising activation', () => {
  assert.throws(
    () => validate({ environment, iosConfig: { ...iosConfig, IS_ANALYTICS_ENABLED: true } }),
    /Analytics and advertising must remain disabled/,
  );
});

test('rejects Crashlytics collection without the persisted opt-in gate', () => {
  const currentRuntime = readFileSync(
    resolve(repositoryRoot, 'lib/services/firebase_runtime.dart'),
    'utf8',
  );
  assert.throws(
    () => validate({
      sourceOverrides: {
        'lib/services/firebase_runtime.dart': currentRuntime.replaceAll(
          'userEnabled: _crashDiagnosticsEnabled',
          'userEnabled: true',
        ),
      },
    }),
    /userEnabled: _crashDiagnosticsEnabled/,
  );
});

test('rejects an Apple Firebase file before Google Sign-In is enabled', () => {
  assert.throws(
    () => validate({ environment, iosConfig: { ...iosConfig, IS_SIGNIN_ENABLED: false } }),
    /Google Sign-In enabled/,
  );
});

test('requires the complete fail-closed social provider scaffold', () => {
  const currentManifest = readFileSync(
    resolve(repositoryRoot, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  assert.throws(
    () => validate({
      sourceOverrides: {
        'android/app/src/main/AndroidManifest.xml': currentManifest.replace(
          'com.facebook.sdk.AdvertiserIDCollectionEnabled',
          'removed.facebook.advertiser.id.setting',
        ),
      },
    }),
    /AdvertiserIDCollectionEnabled/,
  );
});

test('requires Facebook Login to remove the advertising identifier permission', () => {
  const currentManifest = readFileSync(
    resolve(repositoryRoot, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  assert.throws(
    () => validate({
      sourceOverrides: {
        'android/app/src/main/AndroidManifest.xml': currentManifest.replace(
          'android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"',
          'android:name="com.google.android.gms.permission.AD_ID"',
        ),
      },
    }),
    /AD_ID/,
  );
});

test('requires the opt-in exact Android native-symbol upload wiring', () => {
  const currentBuild = readFileSync(resolve(repositoryRoot, 'android/app/build.gradle'), 'utf8');
  assert.throws(
    () => validate({
      sourceOverrides: {
        'android/app/build.gradle': currentBuild.replace(
          'nativeSymbolUploadEnabled true',
          'nativeSymbolUploadEnabled false',
        ),
      },
    }),
    /nativeSymbolUploadEnabled true/,
  );
});

test('parses the public Apple Firebase plist without flattening booleans', () => {
  const parsed = parseGoogleServiceInfoPlist(`<?xml version="1.0"?><plist><dict>
    <key>BUNDLE_ID</key><string>com.shareittoo.app</string>
    <key>IS_ANALYTICS_ENABLED</key><false/>
  </dict></plist>`);
  assert.equal(parsed.BUNDLE_ID, 'com.shareittoo.app');
  assert.equal(parsed.IS_ANALYTICS_ENABLED, false);
});

test('rejects disabling Firebase Apple method swizzling', () => {
  const currentInfo = readFileSync(resolve(repositoryRoot, 'ios/Runner/Info.plist'), 'utf8');
  assert.throws(
    () => validate({
      sourceOverrides: {
        'ios/Runner/Info.plist': currentInfo.replace(
          '</dict>',
          '<key>FirebaseAppDelegateProxyEnabled</key><false/></dict>',
        ),
      },
    }),
    /method swizzling must remain enabled/,
  );
});
