import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  candidateRolloverRuntimeDrift,
  explicitCurrentRolloverCandidatePath,
  explicitCurrentRolloverStatus,
  validateExplicitCurrentRolloverCandidate,
  validateGooglePlayInternalHandoff,
} from '../../tool/validate_google_play_internal_handoff.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonicalHandoff = JSON.parse(await readFile(
  new URL('../../store/google-play/internal-upload-handoff.json', import.meta.url), 'utf8'));
const canonicalEvidence = JSON.parse(await readFile(
  new URL(`../../${canonicalHandoff.evidenceRef}`, import.meta.url), 'utf8'));
const canonicalLiveReadiness = JSON.parse(await readFile(
  new URL(`../../${canonicalHandoff.preUploadLiveReadinessEvidenceRef}`, import.meta.url),
  'utf8'));
const canonicalInternalRelease = JSON.parse(await readFile(
  new URL(`../../${canonicalHandoff.internalReleaseEvidenceRef}`, import.meta.url),
  'utf8'));
const explicitRollover = JSON.parse(await readFile(
  new URL('../../store/google-play/rollover-candidate-2026091704.json', import.meta.url),
  'utf8'));

test('candidate rollover ignores test-only drift but retains runtime drift', () => {
  assert.deepEqual(candidateRolloverRuntimeDrift([
    'AGENTS.md',
    'backend/ops/secret_scan_history_baseline.json',
    'backend/test/postgres_foundation.integration.test.js',
    'docs/evidence/current.json',
    'test/tool/guard.test.mjs',
    'tool/validate_guard.mjs',
  ]), []);
  assert.deepEqual(candidateRolloverRuntimeDrift([
    'backend/src/app.js',
    'backend/test/postgres_foundation.integration.test.js',
    'lib/main.dart',
  ]), ['backend/src/app.js', 'lib/main.dart']);
  assert.deepEqual(candidateRolloverRuntimeDrift([
    'AGENTS.md.backup',
    'backend/ops/secret_scan_history_baseline.json.backup',
    'android/app/build.gradle',
  ]), [
    'AGENTS.md.backup',
    'backend/ops/secret_scan_history_baseline.json.backup',
    'android/app/build.gradle',
  ]);
});

async function explicitRolloverFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-explicit-rollover-fixture-'));
  const archiveRoot = join(root, 'archive');
  const archiveDirectory = join(archiveRoot, explicitRollover.artifact.archiveDirectoryName);
  const rolloverPath = join(root, 'rollover.json');
  await mkdir(archiveDirectory, { recursive: true, mode: 0o700 });
  await chmod(archiveDirectory, 0o700);

  const candidate = explicitRollover.candidate;
  const apkName = `shareittoo-${candidate.versionName}-${candidate.versionCode}-${candidate.artifactSourceHead}.apk`;
  const aabName = `shareittoo-${candidate.versionName}-${candidate.versionCode}-${candidate.artifactSourceHead}.aab`;
  const apk = Buffer.from('synthetic explicit rollover APK fixture');
  const aab = Buffer.from('synthetic explicit rollover AAB fixture');
  const sha256 = (value) => createHash('sha256').update(value).digest('hex');
  const privacy = {
    schemaVersion: 1,
    platform: 'android',
    status: 'passed',
    identity: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      versionCode: candidate.versionCode,
      commit: candidate.artifactSourceHead,
      apiBaseUrl: candidate.apiBaseUrl,
    },
    artifacts: {
      apk: { sha256: sha256(apk) },
      aab: { sha256: sha256(aab) },
    },
    findings: [],
  };
  const privacyBytes = Buffer.from(`${JSON.stringify(privacy)}\n`);
  const manifest = {
    platform: 'android',
    applicationId: candidate.applicationId,
    versionName: candidate.versionName,
    versionCode: candidate.versionCode,
    commit: candidate.artifactSourceHead,
    channel: 'internal',
    apiBaseUrl: candidate.apiBaseUrl,
    socialAuth: candidate.socialAuth,
    firebaseConfigured: candidate.firebaseAndroidConfigured,
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    androidBinaryPrivacyScan: 'passed',
    androidBinaryPrivacyReport: 'privacy-scan.json',
    androidBinaryPrivacyReportSha256: sha256(privacyBytes),
    apkSha256: sha256(apk),
    aabSha256: sha256(aab),
  };
  for (const [name, value] of [
    [aabName, aab],
    [apkName, apk],
    ['manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`)],
    ['privacy-scan.json', privacyBytes],
  ]) {
    const path = join(archiveDirectory, name);
    await writeFile(path, value, { mode: 0o600 });
    await chmod(path, 0o600);
  }
  const rollover = structuredClone(explicitRollover);
  rollover.artifact = {
    ...rollover.artifact,
    aabBytes: aab.byteLength,
    aabSha256: sha256(aab),
    apkBytes: apk.byteLength,
    apkSha256: sha256(apk),
    privacyReportSha256: sha256(privacyBytes),
  };
  await writeFile(rolloverPath, `${JSON.stringify(rollover)}\n`);
  return { root, archiveRoot, rolloverPath, rollover };
}

test('validates the explicitly named current rollover candidate and zero runtime drift', async (t) => {
  const data = await explicitRolloverFixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const result = await validateExplicitCurrentRolloverCandidate({
    repositoryRoot,
    archiveRoot: data.archiveRoot,
    rolloverPath: data.rolloverPath,
    changedPaths: [],
  });
  assert.equal(explicitCurrentRolloverCandidatePath,
    'store/google-play/rollover-candidate-2026091704.json');
  assert.equal(explicitCurrentRolloverStatus,
    'built-and-archived-internal-staging-upload-pending');
  assert.equal(result.buildNumber, data.rollover.candidate.versionCode);
  assert.equal(result.candidate.artifactSourceHead, data.rollover.candidate.artifactSourceHead);
  assert.deepEqual(result.runtimeDrift, []);
  assert.equal(result.artifact.aabSha256, data.rollover.artifact.aabSha256);
  assert.equal(result.artifact.apkSha256, data.rollover.artifact.apkSha256);
  assert.equal(result.artifact.uploadCertificateSha256,
    data.rollover.artifact.uploadCertificateSha256);
  assert.equal(data.rollover.playConsoleReadback, 'not-performed');
  assert.equal(data.rollover.playStateAtLastReadback.readbackPerformed, false);
});

test('rejects a missing or wrong explicit rollover successor', async (t) => {
  const data = await explicitRolloverFixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const wrong = structuredClone(data.rollover);
  wrong.candidate.applicationId = 'com.example.wrong';
  const wrongPath = join(data.root, 'wrong.json');
  await writeFile(wrongPath, JSON.stringify(wrong));
  await assert.rejects(() => validateExplicitCurrentRolloverCandidate({
    repositoryRoot,
    archiveRoot: data.archiveRoot,
    rolloverPath: wrongPath,
  }), /canonical signed internal Staging configuration|identity/u);
  await assert.rejects(() => validateExplicitCurrentRolloverCandidate({
    repositoryRoot,
    archiveRoot: data.archiveRoot,
    rolloverPath: join(data.root, 'missing.json'),
  }), /could not be read as JSON/u);
});

test('rejects runtime drift in explicit rollover mode', async () => {
  await assert.rejects(() => validateExplicitCurrentRolloverCandidate({
    repositoryRoot,
    changedPaths: ['lib/main.dart'],
  }), /Runtime-affecting files changed/u);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-play-handoff-'));
  const archiveRoot = join(root, 'archive');
  const handoffPath = join(root, 'handoff.json');
  const evidencePath = join(root, 'evidence.json');
  const liveReadinessPath = join(root, 'live-readiness.json');
  const shortDescriptionPath = join(root, 'short-description.txt');
  const internalReleasePath = join(root, 'internal-release.json');
  const artifactPath = join(
    archiveRoot,
    canonicalHandoff.artifact.archiveDirectoryName,
    canonicalHandoff.artifact.fileName,
  );
  const bytes = Buffer.from('synthetic exact AAB');
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const handoff = structuredClone(canonicalHandoff);
  const evidence = structuredClone(canonicalEvidence);
  const liveReadiness = structuredClone(canonicalLiveReadiness);
  const internalRelease = structuredClone(canonicalInternalRelease);
  handoff.candidate.aabSha256 = hash;
  evidence.android.aabSha256 = hash;
  liveReadiness.candidate.aabSha256 = hash;
  internalRelease.candidate.aabSha256 = hash;
  handoff.internalReleaseEvidenceRef = 'internal-release.json';
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, bytes, { mode: 0o600 });
  await writeFile(handoffPath, JSON.stringify(handoff));
  await writeFile(evidencePath, JSON.stringify(evidence));
  await writeFile(liveReadinessPath, JSON.stringify(liveReadiness));
  await writeFile(internalReleasePath, JSON.stringify(internalRelease));
  await writeFile(shortDescriptionPath,
    'Miete und vermiete Dinge in deiner Nähe — mit Buchung, Chat und Übergabe.\n');
  return {
    root,
    archiveRoot,
    handoffPath,
    evidencePath,
    liveReadinessPath,
    internalReleasePath,
    shortDescriptionPath,
    artifactPath,
    handoff,
    liveReadiness,
  };
}

test('accepts the exact active internal candidate after verified store installation', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const result = validateGooglePlayInternalHandoff({ repositoryRoot, ...data });
  assert.equal(result.buildNumber, canonicalHandoff.candidate.buildNumber);
  assert.equal(result.artifactPath, data.artifactPath);
  assert.equal(result.releaseName, canonicalHandoff.releaseDraft.name);
  assert.equal(result.status, 'internal-release-active-store-install-verified');
  assert.equal(result.artifactVerified, true);
  assert.match(result.releaseNotes, /ausschließlich Staging und Testzahlungen/u);
});

test('CI can validate repository metadata while the owner-only archive is unavailable', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const unavailableArchive = join(data.root, 'not-mounted-private-archive');
  assert.throws(() => validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
    archiveRoot: unavailableArchive,
  }), /private release archive/);
  const result = validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
    archiveRoot: unavailableArchive,
    allowMissingPrivateArtifact: true,
  });
  assert.equal(result.artifactVerified, false);
  assert.equal(result.buildNumber, canonicalHandoff.candidate.buildNumber);
});

test('rejects different AAB bytes', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await writeFile(data.artifactPath, 'different bytes', { mode: 0o600 });
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /archived AAB SHA-256/);
});

test('rejects a regression to pending identity verification', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.preUploadGates.personalIdentityVerification = 'pending-user';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /personalIdentityVerification/);
});

test('rejects a regression to pending device verification', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.preUploadGates.deviceVerification = 'pending-user';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /deviceVerification/);
});

test('rejects a regression to pending phone verification', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.preUploadGates.phoneVerification = 'pending-user';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /phoneVerification/);
});

test('rejects a regression to pending Play App Signing approval', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.preUploadGates.playAppSigningTerms = 'pending-owner-approval';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /playAppSigningTerms/);
});

test('rejects a missing Play app record', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.preUploadGates.playAppRecordCreated = false;
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /playAppRecordCreated/);
});

test('rejects premature submission permission', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.submissionAllowed = true;
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /submissionAllowed/);
});

test('rejects disabling internal rollout after activation', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.releaseDraft.rolloutAllowed = false;
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /releaseDraft.rolloutAllowed/);
});

test('rejects credential-shaped fields', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.accountPassword = 'must-never-be-here';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /forbidden credential-shaped field/);
});

test('rejects a completed Crashlytics assignment without exact release evidence', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.postUploadChecks.crashlyticsCandidateAssignmentVerified =
    'passed-exact-controlled-event';
  data.handoff.crashReleaseEvidenceRef = 'docs/evidence/b11/missing-crash-release.json';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({ repositoryRoot, ...data }),
    /could not be read as JSON/);
});

test('binds exact-build Chat and message recovery without claiming keyboard completion', () => {
  const result = validateGooglePlayInternalHandoff({
    repositoryRoot,
    allowMissingPrivateArtifact: true,
  });
  assert.equal(result.buildNumber, canonicalHandoff.candidate.buildNumber);
  assert.equal(canonicalHandoff.postUploadChecks.sharedChatStability, 'passed-exact-build');
  assert.equal(canonicalHandoff.postUploadChecks.messageComposerKeyboard, 'pending-exact-build');
  assert.equal(canonicalHandoff.postUploadChecks.messageSendPersistence, 'passed-exact-build');
  assert.equal(canonicalHandoff.postUploadChecks.messageRefreshPattern, 'passed-exact-build');
});

test('rejects a message pass that is not backed by exact candidate evidence', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.postUploadEvidenceRefs.messagePersistenceAndRefresh =
    'docs/evidence/b11/android-offline-realtime-2026081508-20260815T111637Z.json';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
  }), /message persistence evidence/);
});

test('keeps the manual message composer keyboard check open', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  data.handoff.postUploadChecks.messageComposerKeyboard = 'passed-exact-build';
  await writeFile(data.handoffPath, JSON.stringify(data.handoff));
  assert.throws(() => validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
  }), /messageComposerKeyboard/);
});

test('rejects a different observed Play app signing certificate', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const live = structuredClone(data.liveReadiness);
  live.candidate.playAppSigningCertificateSha256 = 'f'.repeat(64);
  await writeFile(data.liveReadinessPath, JSON.stringify(live));
  assert.throws(() => validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
  }), /playAppSigningCertificateSha256/);
});

test('rejects a premature upload permission in the live Console gate', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const live = structuredClone(data.liveReadiness);
  live.decisionGate.submissionAllowed = true;
  await writeFile(data.liveReadinessPath, JSON.stringify(live));
  assert.throws(() => validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
  }), /decisionGate.submissionAllowed/);
});

test('rejects tester email addresses in the live Console evidence', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const live = structuredClone(data.liveReadiness);
  live.googlePlayConsole.internalTesting.testerEmail = 'tester@example.invalid';
  await writeFile(data.liveReadinessPath, JSON.stringify(live));
  assert.throws(() => validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
  }), /must not contain email addresses/);
});

test('rejects the Play-warning en dash in the prepared short description', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await writeFile(data.shortDescriptionPath,
    'Miete und vermiete Dinge in deiner Nähe – mit Buchung, Chat und Übergabe.\n');
  assert.throws(() => validateGooglePlayInternalHandoff({
    repositoryRoot,
    ...data,
  }), /prepared Google Play short description/);
});
