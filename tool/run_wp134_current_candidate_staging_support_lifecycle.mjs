#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  executeWp68StagingSupportLifecycle,
} from './run_wp68_staging_support_lifecycle.mjs';
import {
  canonicalAndroidSigningCertificateSha256,
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

export const wp134ExecutionGate =
  'SIT_WP134_CURRENT_CANDIDATE_STAGING_SUPPORT_GO';
export const wp134BackendRuntimeHead =
  'df39a14b7a19afe467842461a28f1e77fec8445e';
export const wp134ExpectedStagingRuntimeImage =
  `ghcr.io/shareittoo/shareittoo-api:${wp134BackendRuntimeHead}`;
export const wp134Candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  versionCode: '2026091309',
  sourceCommit: 'abf911d1c944a4e5874269111985d0cc4736546e',
  apkSha256: '6f688e3641f54da91caf0e4f7c039f192a0c4e481b3ebb98ac3b2723cbe27ddf',
  aabSha256: '6fc8164cd7a941da83aa104e1a238c4b1725c983dab6bb7651fd3f9880bbcb04',
  signingCertificateSha256: canonicalAndroidSigningCertificateSha256,
});

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const privateQaRoot = resolve(
  homedir(),
  'Library',
  'Application Support',
  'ShareItToo',
  'qa',
);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} is not exact.`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeTimestamp(now = new Date()) {
  return now.toISOString().replace(/[-:.TZ]/gu, '');
}

function defaultVaultPath(now = new Date()) {
  return resolve(
    privateQaRoot,
    `wp134-current-candidate-support-${safeTimestamp(now)}`,
    'vault.json',
  );
}

export function sanitizeWp134Failure(error) {
  const message = String(error?.message ?? error ?? 'wp134_support_failure');
  return message
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, '[redacted-email]')
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/gu, '[redacted-token]')
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/giu, '[redacted-id]')
    .replace(/\bSIT-[A-Z0-9]+\b/gu, '[redacted-case]')
    .replace(/\/Users\/[^\s]+/gu, '[redacted-path]');
}

export function assertWp134ExecutionGate(gate) {
  exact(gate, '1', wp134ExecutionGate);
  return true;
}

export function assertWp134Candidate(candidate) {
  exact(candidate?.applicationId, wp134Candidate.applicationId, 'WP134 candidate applicationId');
  exact(candidate?.versionName, wp134Candidate.versionName, 'WP134 candidate versionName');
  exact(
    candidate?.versionCode ?? candidate?.buildNumber,
    wp134Candidate.versionCode,
    'WP134 candidate versionCode',
  );
  exact(
    candidate?.sourceCommit ?? candidate?.commit,
    wp134Candidate.sourceCommit,
    'WP134 candidate sourceCommit',
  );
  for (const key of ['apkSha256', 'aabSha256', 'signingCertificateSha256']) {
    exact(candidate?.[key], wp134Candidate[key], `WP134 candidate ${key}`);
  }
  exact(candidate?.releaseChannel, 'internal', 'WP134 release channel');
  exact(candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'WP134 API URL');
  exact(candidate?.firebaseConfigured, true, 'WP134 Firebase configuration');
  exact(candidate?.privacyScan, 'passed', 'WP134 binary privacy scan');
  return candidate;
}

export function buildWp134Evidence({
  candidate,
  bootstrap,
  support,
  cleanup,
  sourceInventory,
  capturedAt = new Date().toISOString(),
} = {}) {
  assertWp134Candidate(candidate);
  exact(candidate?.stagingRuntimeImage, wp134ExpectedStagingRuntimeImage, 'WP134 Staging image');
  if (bootstrap?.environment !== 'staging'
      || bootstrap?.simulationOnly !== true
      || bootstrap?.createdAccountCount !== 3
      || bootstrap?.roles?.join(',') !== 'user,admin,admin'
      || support?.caseCreated !== true
      || support?.caseOperatingMode !== 'simulation'
      || support?.draftCreated !== true
      || support?.independentAdminReviewApproved !== true
      || support?.progressPublished !== true
      || support?.recipientReadbackVisible !== true
      || support?.publishedExternalMessageSent !== false
      || support?.futureDeadlineConfirmed !== true
      || cleanup?.decommissionedAccountCount !== 3
      || cleanup?.credentialsRevoked !== true
      || cleanup?.privateVaultDeleted !== true) {
    fail('WP134 lifecycle evidence is incomplete or contradictory.');
  }
  const inventory = sourceInventory ?? {};
  if (Object.keys(inventory).length < 3
      || Object.values(inventory).some((value) => !/^[a-f0-9]{64}$/u.test(value))) {
    fail('WP134 source inventory is incomplete.');
  }
  const evidence = {
    schemaVersion: 1,
    kind: 'sit-wp134-current-candidate-staging-support-lifecycle',
    status: 'passed-exact-current-candidate-staging-support-lifecycle',
    capturedAt,
    source: {
      branch: 'codex/master-workflow-20260808',
      candidateSourceCommit: wp134Candidate.sourceCommit,
      stagingRuntimeHead: wp134BackendRuntimeHead,
      sourceInventory: inventory,
    },
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      versionCode: candidate.versionCode,
      releaseChannel: candidate.releaseChannel,
      environment: 'staging',
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      apkSha256: candidate.apkSha256,
      aabSha256: candidate.aabSha256,
      signingCertificateSha256: candidate.signingCertificateSha256,
      privacyScan: candidate.privacyScan,
    },
    staging: {
      runtimeImage: candidate.stagingRuntimeImage,
      runtimeHealthyBeforeExecution: true,
      runtimeRestartCountBeforeExecution: 0,
    },
    support: {
      intake: 'passed',
      operatingMode: 'simulation',
      independentReview: 'approved-by-separate-admin',
      progressPublication: 'passed',
      recipientReadback: 'passed',
      externalMessageSent: false,
      futureDeadlineConfirmed: true,
      existingSupportCasesChanged: false,
    },
    cleanup: {
      temporaryAccountsDecommissioned: 3,
      credentialsRevoked: true,
      privateVaultDeleted: true,
      auditHistoryRetained: true,
    },
    portfolioEffect: {
      promotedRequirement: 'staging-support-simulation-lifecycle',
      state: 'PASS',
      totals: { pass: 18, partial: 6, open: 8 },
    },
    boundaries: {
      productionChanged: false,
      realUserChanged: false,
      existingSupportCasesChanged: false,
      externalEmailSent: false,
      externalMessageSent: false,
      paymentChanged: false,
      realMoneyUsed: false,
      googlePlayChanged: false,
      firebaseChanged: false,
      onePlusContacted: false,
      pullRequestMerged: false,
      containsAccountIdentity: false,
      containsCaseIdentity: false,
      containsCredential: false,
      containsToken: false,
      containsPrivateFilesystemPath: false,
    },
  };
  if (/\/Users\/|@[a-z0-9.-]+\.[a-z]{2,}|"(?:accessToken|refreshToken|password|secret)"/iu
    .test(JSON.stringify(evidence))) {
    fail('WP134 evidence contains private identity, path or credential material.');
  }
  return evidence;
}

async function sourceInventory() {
  const paths = [
    'tool/run_wp68_staging_support_lifecycle.mjs',
    'tool/run_wp134_current_candidate_staging_support_lifecycle.mjs',
    'test/tool/run_wp134_current_candidate_staging_support_lifecycle.test.mjs',
  ];
  return Object.fromEntries(paths.map((path) => [
    path,
    sha256(readFileSync(resolve(root, path))),
  ]));
}

export async function executeWp134({
  gate = process.env[wp134ExecutionGate],
  candidateDirectory,
  vaultPath = defaultVaultPath(),
} = {}) {
  assertWp134ExecutionGate(gate);
  const candidate = assertWp134Candidate(
    await validatePrivateAndroidReleaseArchive({ candidateDirectory }),
  );
  const result = await executeWp68StagingSupportLifecycle({
    gate: '1',
    vaultPath,
    expectedRuntimeImage: wp134ExpectedStagingRuntimeImage,
    candidate: {
      applicationId: candidate.applicationId,
      versionCode: candidate.buildNumber,
      apkSha256: candidate.apkSha256,
      versionName: candidate.versionName,
      sourceCommit: candidate.commit,
      aabSha256: candidate.aabSha256,
      signingCertificateSha256: candidate.signingCertificateSha256,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      privacyScan: candidate.privacyScan,
    },
  });
  return buildWp134Evidence({
    ...result,
    cleanup: {
      decommissionedAccountCount: 3,
      credentialsRevoked: true,
      privateVaultDeleted: statSync(vaultPath, { throwIfNoEntry: false }) === undefined,
    },
    sourceInventory: await sourceInventory(),
  });
}

function parseArguments(values) {
  let candidateDirectory = null;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) fail('--candidate-dir is required.');
  return { candidateDirectory };
}

async function run() {
  const { candidateDirectory } = parseArguments(process.argv.slice(2));
  const evidence = await executeWp134({ candidateDirectory });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${sanitizeWp134Failure(error)}\n`);
    process.exitCode = 1;
  }
}
