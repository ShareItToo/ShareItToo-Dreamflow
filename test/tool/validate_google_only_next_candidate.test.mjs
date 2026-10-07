import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateGoogleOnlyNextCandidate } from '../../tool/validate_google_only_next_candidate.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const currentPubspec = readFileSync(new URL('../../pubspec.yaml', import.meta.url), 'utf8');
const currentBuildNumber = /^version:\s*[^+\s]+\+(\d+)\s*$/mu.exec(currentPubspec)?.[1];
const futurePubspec = currentPubspec
  .replace(/^version:\s*([^+\s]+)\+\d+\s*$/mu, 'version: $1+2026081510');
const repeatedPubspec = futurePubspec
  .replace(/^version:\s*([^+\s]+)\+\d+\s*$/mu, 'version: $1+2026081509');
const preparedFixtureDirectory = mkdtempSync(join(tmpdir(), 'sit-next-candidate-'));
const preparedManifestPath = join(preparedFixtureDirectory, 'candidate.json');
const preparedManifest = JSON.parse(readFileSync(
  new URL('../../store/google-only-next-candidate.json', import.meta.url),
  'utf8',
));
preparedManifest.state = 'prepared-not-built';
delete preparedManifest.builtCandidate;
writeFileSync(preparedManifestPath, `${JSON.stringify(preparedManifest, null, 2)}\n`);
test.after(() => rmSync(preparedFixtureDirectory, { recursive: true, force: true }));

test('accepts the verified local Google-only build without treating it as uploaded', () => {
  assert.deepEqual(validateGoogleOnlyNextCandidate({ repositoryRoot }), {
    state: 'built-local-not-uploaded',
    baselineBuildNumber: '2026081509',
    plannedBuildNumber: currentBuildNumber,
    buildable: false,
  });
});

test('retains the immutable prior candidate while the source advances', () => {
  assert.throws(() => validateGoogleOnlyNextCandidate({
    repositoryRoot,
    pubspecContents: 'version: 1.0.0+2026081509\n',
  }), /locally built candidate evidence is incomplete or unsafe/);
});

test('refuses to rebuild the already archived candidate in place', () => {
  assert.throws(() => validateGoogleOnlyNextCandidate({
    repositoryRoot,
    requireBuildable: true,
  }), /already built and must not be rebuilt/);
});

test('refuses a repeated candidate build number', () => {
  assert.throws(() => validateGoogleOnlyNextCandidate({
    repositoryRoot,
    requireBuildable: true,
    manifestPath: preparedManifestPath,
    pubspecContents: repeatedPubspec,
    environment: { SIT_SOCIAL_GOOGLE_ENABLED: '1' },
  }), /strictly higher build number/);
});

test('accepts one future internal Staging build with Google only', () => {
  const result = validateGoogleOnlyNextCandidate({
    repositoryRoot,
    requireBuildable: true,
    manifestPath: preparedManifestPath,
    pubspecContents: futurePubspec,
    environment: {
      SIT_SOCIAL_GOOGLE_ENABLED: '1',
      SIT_SOCIAL_APPLE_ENABLED: '0',
      SIT_SOCIAL_FACEBOOK_ENABLED: '0',
      SIT_RELEASE_CHANNEL: 'internal',
      SIT_API_BASE_URL: 'https://staging.shareittoo.com/api/v1',
      SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC: '1',
      SIT_STAGING_CRASH_DIAGNOSTIC_RUN_ID: 'b11-android-2026081510',
    },
  });
  assert.equal(result.plannedBuildNumber, '2026081510');
  assert.equal(result.buildable, true);
});

test('rejects enabling Apple or Facebook in the Google-only build', () => {
  for (const providerFlag of ['SIT_SOCIAL_APPLE_ENABLED', 'SIT_SOCIAL_FACEBOOK_ENABLED']) {
    assert.throws(() => validateGoogleOnlyNextCandidate({
      repositoryRoot,
      requireBuildable: true,
      manifestPath: preparedManifestPath,
      pubspecContents: futurePubspec,
      environment: {
        SIT_SOCIAL_GOOGLE_ENABLED: '1',
        [providerFlag]: '1',
        SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC: '1',
        SIT_STAGING_CRASH_DIAGNOSTIC_RUN_ID: 'b11-android-2026081510',
      },
    }), /must enable Google only/);
  }
});

test('rejects production or Store submission', () => {
  assert.throws(() => validateGoogleOnlyNextCandidate({
    repositoryRoot,
    requireBuildable: true,
    manifestPath: preparedManifestPath,
    pubspecContents: futurePubspec,
    environment: {
      SIT_SOCIAL_GOOGLE_ENABLED: '1',
      SIT_API_BASE_URL: 'https://api.shareittoo.com/api/v1',
      SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC: '1',
      SIT_STAGING_CRASH_DIAGNOSTIC_RUN_ID: 'b11-android-2026081510',
    },
  }), /restricted to internal Staging/);
});

test('rejects omitting or reusing a controlled Crashlytics run id', () => {
  for (const finalEnvironment of [
    {
      SIT_SOCIAL_GOOGLE_ENABLED: '1',
    },
    {
      SIT_SOCIAL_GOOGLE_ENABLED: '1',
      SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC: '1',
      SIT_STAGING_CRASH_DIAGNOSTIC_RUN_ID: 'b11-android-2026081509',
    },
  ]) {
    assert.throws(() => validateGoogleOnlyNextCandidate({
      repositoryRoot,
      requireBuildable: true,
      manifestPath: preparedManifestPath,
      pubspecContents: futurePubspec,
      environment: finalEnvironment,
    }), /exactly one build-bound sanitized Crashlytics run/);
  }
});
