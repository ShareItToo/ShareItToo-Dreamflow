import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  canonicalAndroidSigningCertificateSha256,
  validateCurrentHeadAndroidReleaseArchive,
  validatePrivateAndroidReleaseArchive,
} from '../../tool/validate_current_head_android_release_archive.mjs';

const identity = Object.freeze({
  versionName: '1.0.0',
  buildNumber: '2026082302',
  commit: 'a'.repeat(40),
});

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture(mutate = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'sit-current-head-archive-'));
  const directory = join(root, `${identity.buildNumber}-${identity.commit}`);
  await mkdir(directory, { mode: 0o700 });
  const apk = Buffer.from('signed-current-head-apk');
  const aab = Buffer.from('signed-current-head-aab');
  const apkName = `shareittoo-${identity.versionName}-${identity.buildNumber}-${identity.commit}.apk`;
  const aabName = `shareittoo-${identity.versionName}-${identity.buildNumber}-${identity.commit}.aab`;
  const privacy = {
    schemaVersion: 1,
    platform: 'android',
    status: 'passed',
    identity: {
      applicationId: 'com.shareittoo.app',
      versionName: identity.versionName,
      versionCode: identity.buildNumber,
      commit: identity.commit,
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    },
    artifacts: {
      apk: { sha256: digest(apk) },
      aab: { sha256: digest(aab) },
    },
    findings: [],
  };
  await mutate({ privacy });
  const privacyBytes = Buffer.from(`${JSON.stringify(privacy)}\n`);
  const manifest = {
    platform: 'android',
    applicationId: 'com.shareittoo.app',
    versionName: identity.versionName,
    versionCode: identity.buildNumber,
    commit: identity.commit,
    channel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    socialAuth: {
      googleEnabled: true,
      appleEnabled: false,
      facebookEnabled: false,
    },
    firebaseConfigured: true,
    signingCertificateSha256: canonicalAndroidSigningCertificateSha256,
    androidBinaryPrivacyScan: 'passed',
    androidBinaryPrivacyReport: 'privacy-scan.json',
    androidBinaryPrivacyReportSha256: digest(privacyBytes),
    apkSha256: digest(apk),
    aabSha256: digest(aab),
  };
  await mutate({ manifest });
  for (const [name, value] of [
    [apkName, apk],
    [aabName, aab],
    ['privacy-scan.json', privacyBytes],
    ['manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`)],
  ]) {
    await writeFile(join(directory, name), value, { mode: 0o600 });
    await chmod(join(directory, name), 0o600);
  }
  return { root, directory };
}

test('accepts the exact owner-only signed current-head archive', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const candidate = await validateCurrentHeadAndroidReleaseArchive({
    root: data.root,
    candidateDirectory: data.directory,
    expectedIdentity: identity,
  });
  assert.equal(candidate.buildNumber, identity.buildNumber);
  assert.equal(candidate.commit, identity.commit);
  assert.equal(candidate.releaseChannel, 'internal');
  assert.equal(candidate.firebaseConfigured, true);
  assert.equal(candidate.privacyScan, 'passed');
  assert.equal(candidate.android.apkSha256, candidate.apkSha256);
  assert.deepEqual(candidate.socialAuth, {
    googleEnabled: true,
    appleEnabled: false,
    facebookEnabled: false,
  });
});

test('accepts an explicit private archive by its internally cross-checked identity', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: data.root,
    candidateDirectory: data.directory,
  });
  assert.equal(candidate.versionName, identity.versionName);
  assert.equal(candidate.buildNumber, identity.buildNumber);
  assert.equal(candidate.commit, identity.commit);
  assert.equal(candidate.apkSha256, digest(Buffer.from('signed-current-head-apk')));
});

test('keeps historical archives without a recorded social profile readable', async (t) => {
  const data = await fixture(({ manifest }) => {
    if (manifest) delete manifest.socialAuth;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: data.root,
    candidateDirectory: data.directory,
  });
  assert.equal(candidate.socialAuth, null);
});

test('rejects an explicit private archive with malformed self-declared identity', async (t) => {
  const data = await fixture(({ manifest }) => {
    if (manifest) manifest.versionCode = 'not-a-version-code';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await assert.rejects(
    validatePrivateAndroidReleaseArchive({
      root: data.root,
      candidateDirectory: data.directory,
    }),
    /identity is invalid/,
  );
});

test('rejects a malformed social-auth artifact profile', async (t) => {
  const data = await fixture(({ manifest }) => {
    if (manifest) manifest.socialAuth.googleEnabled = 'yes';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await assert.rejects(
    validatePrivateAndroidReleaseArchive({
      root: data.root,
      candidateDirectory: data.directory,
    }),
    /social-auth profile is invalid/,
  );
});

test('rejects a candidate from another commit', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await assert.rejects(
    validateCurrentHeadAndroidReleaseArchive({
      root: data.root,
      candidateDirectory: data.directory,
      expectedIdentity: { ...identity, commit: 'b'.repeat(40) },
    }),
    /exact four current-head artifacts/,
  );
});

test('rejects a privacy report with a finding', async (t) => {
  const data = await fixture(({ privacy }) => {
    if (privacy) privacy.findings.push({ code: 'unexpected-sdk' });
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await assert.rejects(
    validateCurrentHeadAndroidReleaseArchive({
      root: data.root,
      candidateDirectory: data.directory,
      expectedIdentity: identity,
    }),
    /did not pass without findings/,
  );
});

test('rejects archive files that are readable by other users', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await chmod(join(data.directory, 'manifest.json'), 0o644);
  await assert.rejects(
    validateCurrentHeadAndroidReleaseArchive({
      root: data.root,
      candidateDirectory: data.directory,
      expectedIdentity: identity,
    }),
    /owner-only/,
  );
});

test('rejects a changed APK hash', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const apkName = `shareittoo-${identity.versionName}-${identity.buildNumber}-${identity.commit}.apk`;
  await writeFile(join(data.directory, apkName), 'tampered', { mode: 0o600 });
  await assert.rejects(
    validateCurrentHeadAndroidReleaseArchive({
      root: data.root,
      candidateDirectory: data.directory,
      expectedIdentity: identity,
    }),
    /APK hash does not match/,
  );
});
