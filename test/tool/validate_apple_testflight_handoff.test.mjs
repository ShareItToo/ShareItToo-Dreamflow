import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateAppleTestFlightHandoff } from '../../tool/validate_apple_testflight_handoff.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const canonical = JSON.parse(await readFile(
  new URL('../../store/apple/testflight-handoff.json', import.meta.url), 'utf8'));
const firebasePlist = `<?xml version="1.0"?><plist><dict>
  <key>BUNDLE_ID</key><string>com.shareittoo.app</string>
  <key>IS_ANALYTICS_ENABLED</key><false/>
  <key>IS_ADS_ENABLED</key><false/>
</dict></plist>`;
const configuredSources = {
  'ios/Runner/GoogleService-Info.plist': firebasePlist,
  'pubspec.yaml': 'version: 1.0.0+2026081509\n',
};

test('accepts the truthful static Apple handoff with account and tooling gates open', () => {
  const result = validateAppleTestFlightHandoff({ root, sourceOverrides: configuredSources });
  assert.deepEqual(result, { bundleId: 'com.shareittoo.app', buildNumber: '2026081509' });
});

test('accepts CI without copying the intentionally private Apple Firebase file into Git', () => {
  const result = validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      'ios/Runner/GoogleService-Info.plist': null,
      'pubspec.yaml': 'version: 1.0.0+2026081509\n',
    },
  });
  assert.deepEqual(result, { bundleId: 'com.shareittoo.app', buildNumber: '2026081509' });
});

test('accepts the same final cross-platform candidate in rollover mode', () => {
  const result = validateAppleTestFlightHandoff({
    root,
    sourceOverrides: configuredSources,
    allowAndroidCandidateRollover: true,
  });
  assert.deepEqual(result, { bundleId: 'com.shareittoo.app', buildNumber: '2026081509' });
});

test('accepts a newer Android-only build while the unchanged Apple handoff stays pending', () => {
  const result = validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      ...configuredSources,
      'pubspec.yaml': 'version: 1.0.0+2026081510\n',
    },
    allowAndroidCandidateRollover: true,
  });
  assert.deepEqual(result, { bundleId: 'com.shareittoo.app', buildNumber: '2026081509' });
});

test('rejects an Apple handoff newer than the current shared candidate', () => {
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      ...configuredSources,
      'pubspec.yaml': 'version: 1.0.0+2026081508\n',
    },
    allowAndroidCandidateRollover: true,
  }), /Android-only rollover/);
});

test('still requires the private Apple Firebase path to remain ignored', async () => {
  const gitignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      ...configuredSources,
      '.gitignore': gitignore.replace('/ios/Runner/GoogleService-Info.plist', ''),
    },
  }), /outside version control/);
});

test('rejects a premature Apple membership or upload claim', () => {
  const handoff = structuredClone(canonical);
  handoff.accountGates.developerProgramMembership = 'passed';
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    handoffOverride: handoff,
    sourceOverrides: configuredSources,
  }),
    /developerProgramMembership/);
});

test('rejects bundle identifier drift', async () => {
  const project = await readFile(
    new URL('../../ios/Runner.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      ...configuredSources,
      'ios/Runner.xcodeproj/project.pbxproj': project.replace(
        'PRODUCT_BUNDLE_IDENTIFIER = com.shareittoo.app;',
        'PRODUCT_BUNDLE_IDENTIFIER = com.example.wrong;',
      ),
    },
  }), /bundle ID/);
});

test('rejects Firebase analytics activation', () => {
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      ...configuredSources,
      'ios/Runner/GoogleService-Info.plist': firebasePlist.replace(
        '<key>IS_ANALYTICS_ENABLED</key><false/>',
        '<key>IS_ANALYTICS_ENABLED</key><true/>',
      ),
    },
  }), /Analytics and ads/);
});

test('rejects a Runner privacy manifest that enables tracking', async () => {
  const privacyManifest = await readFile(
    new URL('../../ios/Runner/PrivacyInfo.xcprivacy', import.meta.url), 'utf8');
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      ...configuredSources,
      'ios/Runner/PrivacyInfo.xcprivacy': privacyManifest.replace(
        '<key>NSPrivacyTracking</key>\n\t<false/>',
        '<key>NSPrivacyTracking</key>\n\t<true/>',
      ),
    },
  }), /Runner privacy manifest/);
});

test('rejects a privacy manifest that is not bound to Runner resources', async () => {
  const project = await readFile(
    new URL('../../ios/Runner.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    sourceOverrides: {
      ...configuredSources,
      'ios/Runner.xcodeproj/project.pbxproj': project.replace(
        /\s*A11F1EBB5E00000000000002 \/\* PrivacyInfo\.xcprivacy in Resources \*\/,[\r\n]+/u,
        '\n',
      ),
    },
  }), /bound once to Runner resources/);
});

test('rejects credential-shaped fields', () => {
  const handoff = structuredClone(canonical);
  handoff.applePassword = 'forbidden';
  assert.throws(() => validateAppleTestFlightHandoff({
    root,
    handoffOverride: handoff,
    sourceOverrides: configuredSources,
  }),
    /forbidden credential-shaped field/);
});
