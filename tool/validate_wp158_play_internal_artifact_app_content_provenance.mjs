#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp158-play-internal-artifact-app-content-provenance-20260915.json';
const handoverPath = 'docs/operations/WP158_PLAY_INTERNAL_ARTIFACT_APP_CONTENT_PROVENANCE_2026-09-15.md';
export const wp158SourcePaths = Object.freeze([
  'AGENTS.md',
  'scripts/technical_regression_check.sh',
  'store/google-play/current-rollover-candidate.json',
  'store/google-play/app-content-handoff.json',
  'store/google-play/rw20d-play-draft-truth-reconciliation.json',
  'docs/evidence/release-readiness/wp138-google-signin-current-candidate-pixel-closure-20260913.json',
  'docs/evidence/release-readiness/wp142-current-goal-external-gate-checkpoint-20260913.json',
  'docs/evidence/release-readiness/wp143-oneplus-current-candidate-two-role-preparation-20260913.json',
  'docs/evidence/release-readiness/wp145-oneplus-current-candidate-two-role-closure-20260914.json',
  handoverPath,
  'tool/validate_wp158_play_internal_artifact_app_content_provenance.mjs',
  'test/tool/validate_wp158_play_internal_artifact_app_content_provenance.test.mjs',
]);
const wp158FinalHead = '0eb67df1992d9a234b22281fa4ef1161137399d2';
// WP158 assembled its immutable inventory across the recorded handoff commits:
// policy/tooling was captured at 8df, while the WP158 handoff sources were
// introduced at 9d4. All other entries are resolved from the recorded finalHead.
const wp158InventoryRevisions = Object.freeze({
  'AGENTS.md': '8df42db74a9669cf6a720df75f9eb89cee1d544c',
  'scripts/technical_regression_check.sh': '8df42db74a9669cf6a720df75f9eb89cee1d544c',
  'docs/operations/WP158_PLAY_INTERNAL_ARTIFACT_APP_CONTENT_PROVENANCE_2026-09-15.md':
    '9d4b252234af8ea200d73485f35f9ff0823f617e',
  'tool/validate_wp158_play_internal_artifact_app_content_provenance.mjs':
    '9d4b252234af8ea200d73485f35f9ff0823f617e',
  'test/tool/validate_wp158_play_internal_artifact_app_content_provenance.test.mjs':
    '9d4b252234af8ea200d73485f35f9ff0823f617e',
});

function fail(message) { throw new Error(`WP158 ${message}.`); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid`);
}
function inventoryDigest(inventory) {
  return createHash('sha256').update(Object.entries(inventory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, hash]) => `${path}\0${hash}\n`).join('')).digest('hex');
}
function hasAll(text, markers, label) {
  for (const marker of markers) if (!text.includes(marker)) fail(`${label} marker missing: ${marker}`);
}

function digestAtRevision(repositoryRoot, path, revision) {
  let bytes;
  try {
    bytes = execFileSync('git', ['-C', repositoryRoot, 'show', `${revision}:${path}`], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    fail(`historical source inventory cannot resolve ${revision}:${path}`);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateWp158PlayInternalArtifactAppContentProvenance({ repositoryRoot = root, evidence, sourceTexts = {} } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value.schemaVersion, 1, 'schemaVersion');
  exact(value.package, 'WP158-PLAY-INTERNAL-ARTIFACT-APP-CONTENT-PROVENANCE-20260915', 'package');
  exact(value.status, 'owner-gate-required-play-internal-current-release-readback', 'status');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    finalHead: '0eb67df1992d9a234b22281fa4ef1161137399d2',
    workingTreeClean: true,
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository');
  exact(value.currentCandidate.applicationId, 'com.shareittoo.app', 'candidate package');
  exact(value.currentCandidate.versionName, '1.0.0', 'candidate version name');
  exact(value.currentCandidate.versionCode, '2026091312', 'candidate version code');
  exact(value.currentCandidate.sourceCommit, '904c2b734160544aaeb1128cac15191a521739e7', 'candidate source commit');
  exact(value.currentCandidate.releaseChannel, 'internal', 'candidate release channel');
  exact(value.currentCandidate.environment, 'staging', 'candidate environment');
  exact(value.currentCandidate.artifactArchive, {
    present: true,
    exactOwnerOnlyFiles: 4,
    aabBytes: 138947362,
    aabSha256: 'c0c0f27fb14d393b97c46b55bf81f201081dce1d9756f3468bfa442c4bdf9c6e',
    apkBytes: 200132865,
    apkSha256: 'e6d1df85e4e8973765c594b8fe9eb2654c876ee11cafe6d94cfe5c57ff8d7fb9',
    privacyReportSha256: '77ecdd7ed447623243c2a04f4100eb284217a2a5f0005efa9487e8581bd84528',
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    archiveValidation: 'passed-owner-only-exact-four-files',
    privacyScan: 'passed',
  }, 'artifact archive');
  exact(value.archiveInventory, {
    primaryLocalLatestVersionCode: '2026091312',
    primaryLocalLatestSourceCommit: '904c2b734160544aaeb1128cac15191a521739e7',
    offloadedVolumeLatestVersionCode: '2026091311',
    offloadedVolumeCurrentCandidatePresent: false,
    privateFilesystemPathsRecorded: false,
  }, 'archive inventory');
  exact(value.driveInventory, {
    latestExactSITArtifactVersionCode: '2026091110',
    latestExactSITArtifactKind: 'private-device-qa-apk',
    latestExactSITArtifactSourceCommit: 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b',
    latestExactSITArtifactBytes: 199608577,
    latestExactSITArtifactSha256: '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f3',
    currentCandidateVersionCodePresent: false,
    privateDriveIdsOrUrlsRecorded: false,
  }, 'Drive inventory');
  exact(value.appContent, {
    savedHandoffBuildNumber: '2026081505',
    dataSafetyBindingBuildNumber: '2026081509',
    strictValidator: 'fails-closed-candidate-binding-mismatch',
    currentCandidateRebound: false,
    historicalFilesRewritten: false,
  }, 'app-content reconciliation');
  exact(value.playState, {
    currentTrackProven: false,
    currentActiveVersionProven: false,
    currentDraftsProven: false,
    currentTesterListProven: false,
    currentSigningAndPackageProven: false,
    authenticatedReadbackPerformed: false,
  }, 'Play state');
  exact(value.ownerGate, {
    required: true,
    token: 'OWNER_GATE_REQUIRED:PLAY_INTERNAL_CURRENT_RELEASE_READBACK',
    reason: 'Current Play state cannot be proven from repository, local archives and SIT Drive evidence alone.',
    nextAction: 'Owner performs a read-only authenticated Play Console readback of INTERNAL track, active release, drafts, package, signing, app-content and tester list.',
  }, 'owner gate');
  exact(value.boundaries, {
    consoleAccessed: false, storeChanged: false, uploadPerformed: false, activationPerformed: false,
    testerListChanged: false, providerChanged: false, paymentChanged: false, firebaseChanged: false,
    productionChanged: false, deviceChanged: false, pullRequestMerged: false,
    credentialsReadOrRecorded: false, privateFilesystemPathRecorded: false,
  }, 'boundaries');
  exact(Object.keys(value.sourceInventory).sort(), [...wp158SourcePaths].sort(), 'source inventory paths');
  exact(value.captureAttestation.inventoryDigestAlgorithm, 'sha256-path-nul-digest-newline-v1', 'inventory digest algorithm');
  exact(value.captureAttestation.sourceInventoryDigest, inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp158SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) fail(`source inventory ${path} is not a SHA-256 digest`);
    const revision = wp158InventoryRevisions[path] ?? wp158FinalHead;
    exact(digestAtRevision(repositoryRoot, path, revision), value.sourceInventory[path],
      `source inventory ${path} at ${revision}`);
  }
  const handover = sourceTexts[handoverPath] ?? readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  hasAll(handover, ['WP158', 'owner gate', '2026091312', 'OWNER_GATE_REQUIRED:PLAY_INTERNAL_CURRENT_RELEASE_READBACK', 'No Play Console readback'], 'handover');
  const regression = sourceTexts['scripts/technical_regression_check.sh'] ?? readFileSync(resolve(repositoryRoot, 'scripts/technical_regression_check.sh'), 'utf8');
  hasAll(regression, ['node --test test/tool/*.test.mjs'], 'complete regression test inventory');
  const serialized = JSON.stringify(value);
  if (/(?:password|secret|api[_-]?key|private[_-]?key|service[_-]?account|@)/iu.test(serialized)) fail('evidence contains a secret-shaped or personal identifier');
  return { status: value.status, ownerGate: value.ownerGate.token, currentCandidate: value.currentCandidate.versionCode };
}

function source(repositoryRoot, path, sourceTexts) { return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8'); }
function main() {
  const result = validateWp158PlayInternalArtifactAppContentProvenance();
  console.log(`WP158 valid: candidate=${result.currentCandidate}, ownerGate=${result.ownerGate}.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
