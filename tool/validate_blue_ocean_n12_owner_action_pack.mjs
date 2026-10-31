#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n12-owner-action-pack-20260824.json';

const sections = [
  'FREE / NO ACCOUNT ACTION',
  'OWNER LOGIN REQUIRED',
  'PHYSICAL DEVICE REQUIRED',
  'EXTERNAL CONTRACT REQUIRED',
  'PAID / COST APPROVAL REQUIRED',
  'LATER ONLY',
];

const replyTokens = [
  'AI_LISTING_PILOT_BUDGET_5_EUR_GO',
  'AI_LISTING_PROVIDER_HOLD',
  'GOOGLE_PLAY_INTERNAL_UPLOAD_GO',
  'GOOGLE_PLAY_INTERNAL_HOLD',
  'HEILBRONN_WAVE0_ACTIVATION_GO',
  'HEILBRONN_WAVE0_HOLD',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N12 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N12 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN12OwnerActionPack({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'implemented-targeted-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-ready-for-n13',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n12-owner-action-pack'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== '31bdfb9fff0b423c85508d1b9944f3588a56d70c'
      || value.packRef !== 'docs/operations/BLUE_OCEAN_OWNER_ACTION_PACK.md') {
    fail('N12 evidence identity is invalid.');
  }
  if (!exact(value.sections, sections)) fail('N12 six-section action structure is invalid.');
  if (!exact(value.minimumCoverage, {
    operatorConfigValues: 'prepared-private-owner-action-not-collected',
    openAiApiProjectKeyBilling: 'later-owner-login-and-budget-gated',
    eur5PilotBudgetToken: 'AI_LISTING_PILOT_BUDGET_5_EUR_GO',
    googlePlayInternalTesting: 'later-owner-login-exact-aab-only',
    testerGoogleEmails: 'later-owner-entry-outside-repository',
    firebaseOwnerChecks: 'later-owner-login-initial-services-off',
    realRolesAndDelegates: 'later-private-mapping-no-invented-people',
    appleIos: 'DEFERRED_NOT_REQUIRED_FOR_STAGE_A',
    supportScanner: 'deferred-off',
    marketplacePsp: 'deferred-off-no-real-money',
    authenticEconomics: 'later-real-aggregate-inputs-profitability-undetermined',
    heilbronnWave0Activation: 'later-explicit-owner-token-only',
  })) fail('N12 minimum owner-action coverage is invalid.');
  if (!exact(value.preparedReplyTokens, replyTokens)) fail('N12 reply-token set is invalid.');
  if (!exact(value.acceptedAndDeferredRisk, {
    professionalReview: 'PROFESSIONAL_REVIEW_DEFERRED_BY_OWNER',
    unreviewedRisk: 'UNREVIEWED_RISK_ACCEPTED',
    professionalLegalApprovalClaimed: false,
    riskResolvedClaimed: false,
  })) fail('N12 accepted/deferred risk record is invalid.');
  if (!exact(value.costState, {
    freePacketAndPrivateFactPreparationExpectedNewExternalEur: 0,
    optionalAiPilotHardCapEur: 5,
    aiBudgetApproved: false,
    allOtherNewExternalCosts: 'unknown-unapproved-require-concrete-offer-and-max-eur-token',
  })) fail('N12 cost boundary is invalid.');

  const expectedBoundaries = {
    thirdPartyContacted: false,
    ownerLoginPerformed: false,
    operatorValuesCollectedOrStored: false,
    openAiProjectKeyOrBillingChanged: false,
    paidCallPerformed: false,
    playConsoleChanged: false,
    testerEmailCollectedOrAdded: false,
    firebaseChanged: false,
    physicalDeviceChanged: false,
    contractAccepted: false,
    scannerActivated: false,
    pspOrRealMoneyActivated: false,
    appleActionPerformed: false,
    humanPilotActivated: false,
    productionChanged: false,
    cloudChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
  };
  if (!exact(value.boundaries, expectedBoundaries)) fail('N12 mutation boundary is invalid.');

  const fullPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === 'verified-ready-for-n13';
  if (!exact(value.targetedVerification, {
    actionPackWiringTests: 'passed-8',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) fail('N12 verification record is invalid for its status.');
  if (value.nextPackage !== 'N13') fail('N12 next package is invalid.');
  if (githubPassed) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N12 exact GitHub verification is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined) {
    fail('N12 cannot bind exact GitHub verification before CI is complete.');
  }

  const pack = source(repositoryRoot, value.packRef);
  let previousSection = -1;
  for (const section of sections) {
    const index = pack.indexOf(`## ${section}`);
    if (index <= previousSection) fail(`N12 section missing or unordered: ${section}`);
    previousSection = index;
  }
  requireMarkers(pack, value.packRef, [
    'PREPARED — NOTHING EXECUTED — ALL OWNER/EXTERNAL GATES CLOSED',
    'SIT_OPERATOR_LEGAL_NAME', 'OpenAI API project/key/billing',
    'Google Play Console with passkey/2FA', 'Tester Google emails',
    'Firebase/Google Cloud owner checks', 'Pixel 7 Pro',
    'Real roles and delegates', 'DEFERRED_NOT_REQUIRED_FOR_STAGE_A',
    'Support scanner/upload: OFF', 'PSP/KYC/real money: OFF',
    'Current profitability remains undetermined',
    'PROFESSIONAL_REVIEW_DEFERRED_BY_OWNER', 'UNREVIEWED_RISK_ACCEPTED',
    ...replyTokens,
  ]);
  const serialized = `${pack}\n${JSON.stringify(value)}`;
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('N12 pack or evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    sections: value.sections.length,
    replyTokens: value.preparedReplyTokens.length,
    optionalAiPilotHardCapEur: value.costState.optionalAiPilotHardCapEur,
    liveMutation: Object.values(value.boundaries).some(Boolean),
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateBlueOceanN12OwnerActionPack();
  process.stdout.write(
    `Blue Ocean N12 owner pack valid: sections=${result.sections}, tokens=${result.replyTokens}, capEur=${result.optionalAiPilotHardCapEur}, liveMutation=${result.liveMutation}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
