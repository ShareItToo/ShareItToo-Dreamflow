import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  candidateRolloverRuntimeDrift,
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

test('candidate rollover ignores test-only drift but retains runtime drift', () => {
  assert.deepEqual(candidateRolloverRuntimeDrift([
    'AGENTS.md',
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
    'android/app/build.gradle',
  ]), ['AGENTS.md.backup', 'android/app/build.gradle']);
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
