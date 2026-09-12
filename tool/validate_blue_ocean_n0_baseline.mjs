#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n0-baseline-20260823.json';
const baselineHead = '763aecc12122d34e332bc2a561d3fb55fff544c3';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function requireMarkers(content, markers, label) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N0 ${label} marker missing: ${marker}`);
  }
}

function assertBaselineHeadIsAncestor(repositoryRoot) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baselineHead, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail('N0 baseline head is not an ancestor of the current checkout.');
  }
}

export function validateBlueOceanN0Baseline({
  repositoryRoot = root,
  evidence,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n0-baseline'
      || value.status !== 'verified-ready-for-n1'
      || value.capturedAt !== '2026-08-23T20:24:00Z') {
    fail('N0 baseline identity is invalid.');
  }
  if (!exact(value.repository, {
    identity: 'ShareItToo-Dreamflow',
    branch: 'codex/master-workflow-20260808',
    upstream: 'origin/codex/master-workflow-20260808',
    baselineHead,
    ahead: 0,
    behind: 0,
    workingTreeCleanAtCapture: true,
    pullRequest: {
      number: 7,
      state: 'OPEN',
      draft: true,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      merged: false,
    },
    exactCi: {
      regressionRunId: 32659802836,
      regressionConclusion: 'success',
      codeqlRunId: 32659802896,
      codeqlConclusion: 'success',
      headSha: baselineHead,
    },
  })) {
    fail('N0 repository, PR or exact-CI baseline is invalid.');
  }
  if (checkGitCommit) assertBaselineHeadIsAncestor(repositoryRoot);

  if (!exact(value.driveInstruction, {
    title: '00_NEXT_GOAL_STAGE_A_BLUE_OCEAN_AI_LISTING_PILOT_V1.md',
    selectedFileId: '1sftFS7vGUPFuXwFIQad_fC204VGIGxK-',
    selectedModifiedAt: '2026-08-23T20:17:19.601Z',
    selectedSizeBytes: 30609,
    sameTitleFileCount: 2,
    selectionRule: 'newest-modified-file-wins',
    newerInstructionPresent: false,
    previousGoalReopened: false,
  })) {
    fail('N0 Drive instruction selection is invalid.');
  }
  if (!exact(value.ownerDecisions, {
    professionalReview: [
      'PROFESSIONAL_REVIEW_DEFERRED_BY_OWNER',
      'UNREVIEWED_RISK_ACCEPTED',
    ],
    stageAPilotNature: [
      'CLOSED',
      'INVITED',
      'NON-BINDING',
      'ANDROID-FIRST',
      'NO-REAL-MONEY',
      'PRODUCT-AND-PROCESS PILOT',
    ],
    pilotId: 'heilbronn_wave0',
    listingAiException: 'AI-ASSISTED LISTING DRAFT CREATION',
    iosStatus: 'DEFERRED_NOT_REQUIRED_FOR_STAGE_A',
  })) {
    fail('N0 binding owner decisions are invalid.');
  }
  if (!exact(value.externalGateState, {
    requiredGateCount: 11,
    technicallyPreparedGateCount: 11,
    externallyReadyGateCount: 0,
    issuedReleaseTokenCount: 0,
    releaseDecision: 'hold-no-go',
  })) {
    fail('N0 external-gate state is overstated.');
  }
  if (!exact(value.featureFlagBaseline, {
    privatePilotEnabled: true,
    broadAiFeaturesEnabled: false,
    realPaymentsEnabled: false,
    bookingGroupsBackendEnabled: false,
    bookingGroupsUiDefaultEnabled: false,
    plannerUiDefaultEnabled: false,
    supplyEnrichmentUiDefaultEnabled: false,
    listingSetsUiDefaultEnabled: false,
    g3ToG5ReleaseExposureAllowed: false,
    pushTransport: 'memory',
    firebaseAuthEnabled: false,
    firebasePhoneVerificationEnabled: false,
    privatePilotAllowedRegionsConfigured: false,
  })) {
    fail('N0 feature-flag baseline is invalid or overstated.');
  }
  if (!exact(value.implementationIntake, {
    nextPackage: 'N1',
    dedicatedListingAiPathPresentAtBaseline: false,
    regionalPriceEngineV2PresentAtBaseline: false,
    manualListingFlowMustRemain: true,
    historicalDataMustRemain: true,
  })) {
    fail('N0 implementation intake is invalid.');
  }
  if (!allFalse(value.boundaries)) fail('N0 records a forbidden mutation.');

  const privatePilot = readFileSync(resolve(repositoryRoot, 'lib/config/private_pilot_config.dart'), 'utf8');
  requireMarkers(privatePilot, [
    'static const bool enabled = true;',
    'static const bool aiFeaturesEnabled = false;',
    'static const bool realPaymentsEnabled = false;',
  ], 'private-pilot');
  const staging = readFileSync(resolve(repositoryRoot, 'backend/.env.staging.example'), 'utf8');
  requireMarkers(staging, [
    'BOOKING_GROUPS_ENABLED=false',
    'PRIVATE_PILOT_ALLOWED_REGIONS=',
    'PUSH_TRANSPORT=memory',
    'FIREBASE_AUTH_ENABLED=false',
    'FIREBASE_PHONE_VERIFICATION_ENABLED=false',
  ], 'staging');
  for (const [path, flag] of [
    ['lib/config/booking_group_technical_config.dart', 'SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED'],
    ['lib/config/planner_technical_config.dart', 'SIT_PLANNER_TECHNICAL_UI_ENABLED'],
    ['lib/config/supply_enrichment_technical_config.dart', 'SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED'],
    ['lib/config/listing_sets_technical_config.dart', 'SIT_LISTING_SETS_TECHNICAL_UI_ENABLED'],
  ]) {
    const content = readFileSync(resolve(repositoryRoot, path), 'utf8');
    requireMarkers(content, [
      flag,
      'defaultValue: false',
      'signedStageAInternalEnvelope',
      'technicalSurfaceAvailableFor',
    ], path);
  }

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|@/iu.test(serialized)) {
    fail('N0 evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    baselineHead,
    driveInstructionId: value.driveInstruction.selectedFileId,
    externallyReadyGateCount: value.externalGateState.externallyReadyGateCount,
    nextPackage: value.implementationIntake.nextPackage,
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('N0 CI metadata-only mode is restricted to CI.');
    }
    const result = validateBlueOceanN0Baseline({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `Blue Ocean N0 baseline valid: head=${result.baselineHead}, `
      + `externalReady=${result.externallyReadyGateCount}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Blue Ocean N0 baseline validation failed.'}\n`);
    process.exitCode = 1;
  }
}
