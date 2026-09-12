#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const expectedScenarios = [
  'install-onboarding-session',
  'feed-search-listing-detail',
  'create-edit-listing',
  'booking-owner-renter',
  'chat-push-deep-link',
  'offline-network-recovery',
  'handover-return-cancellation',
  'report-block-review',
  'accessibility-export-deletion',
];

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (Object.keys(value).sort().join(',') !== expected.slice().sort().join(',')) {
    fail(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value) || value.join(',') !== expected.join(',')) {
    fail(`${label} must remain the canonical ordered list.`);
  }
}

function sanitized(value, label = 'closed-test feedback plan') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => sanitized(entry, `${label}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
      fail(`${label} must not contain tester or account email addresses.`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (/(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|device.?id)$/i.test(key)) {
      fail(`${label}.${key} is a forbidden private field.`);
    }
    sanitized(entry, `${label}.${key}`);
  }
}

export function validateGooglePlayClosedTestingFeedback({
  plan,
  closedTestingReadiness,
  currentCandidate = null,
  deviceCandidate = null,
  root = null,
}) {
  const manifest = object(plan, 'closed-test feedback plan');
  sanitized(manifest);
  exactKeys(manifest, [
    'schemaVersion',
    'state',
    'applicationId',
    'candidate',
    'testerOnboarding',
    'rules',
    'checkpoints',
    'scenarios',
    'feedbackRecordFields',
    'allowedResults',
    'allowedSeverities',
    'aggregate',
    'boundaries',
  ], 'closed-test feedback plan');
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1.');
  if (!['planned', 'collecting', 'summarized'].includes(manifest.state)) fail('state is not recognized.');
  if (manifest.applicationId !== 'com.shareittoo.app') fail('applicationId must remain com.shareittoo.app.');
  const candidate = object(manifest.candidate, 'candidate');
  exactKeys(candidate, ['versionName', 'buildNumber', 'commit', 'bindingState'], 'candidate');
  const expectedCurrentCandidate = currentCandidate ?? {
    versionName: '1.0.0',
    buildNumber: '2026081403',
  };
  const expectedDeviceCandidate = deviceCandidate ?? {
    versionName: '1.0.0',
    buildNumber: '2026081202',
    commit: '72dd8f13b5d3be0e82392a8b28c31292bdc23b53',
  };
  const testerOnboarding = object(manifest.testerOnboarding, 'testerOnboarding');
  exactKeys(testerOnboarding, [
    'guidePath',
    'privateOptInLinkInjectedAtSendTime',
    'privateFeedbackChannelInjectedAtSendTime',
    'containsTesterPersonalData',
    'containsLiveOptInLink',
  ], 'testerOnboarding');
  if (testerOnboarding.guidePath
        !== 'docs/operations/B11_GOOGLE_PLAY_CLOSED_TESTER_ONBOARDING_2026-08-14.md'
      || testerOnboarding.privateOptInLinkInjectedAtSendTime !== true
      || testerOnboarding.privateFeedbackChannelInjectedAtSendTime !== true
      || testerOnboarding.containsTesterPersonalData !== false
      || testerOnboarding.containsLiveOptInLink !== false) {
    fail('Tester onboarding must remain private, sanitized and bound to the canonical guide.');
  }
  if (root !== null) {
    const guide = readFileSync(resolve(root, testerOnboarding.guidePath), 'utf8');
    const normalizedGuide = guide.replace(/\s+/gu, ' ');
    for (const marker of [
      'mindestens 14 aufeinanderfolgende Tage',
      'ausschließlich synthetische Inhalte',
      'keine echten Zahlungen',
      'privaten Opt-in-Link',
      'privaten Feedbackkanal',
    ]) {
      if (!normalizedGuide.includes(marker)) fail(`Tester onboarding guide is missing: ${marker}`);
    }
    if (/https?:\/\//iu.test(guide)
        || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(guide)) {
      fail('Tester onboarding guide must not contain a live opt-in link or account address.');
    }
  }
  const rules = object(manifest.rules, 'rules');
  exactKeys(rules, [
    'minimumContinuousTesterCount',
    'minimumConsecutiveDays',
    'syntheticContentOnly',
    'realPaymentForbidden',
    'testerRosterStoredInRepository',
    'individualFeedbackStoredInRepository',
  ], 'rules');
  if (rules.minimumContinuousTesterCount !== 12 || rules.minimumConsecutiveDays !== 14) {
    fail('The feedback plan must remain aligned to 12 continuous testers for 14 days.');
  }
  for (const field of ['syntheticContentOnly', 'realPaymentForbidden']) {
    if (rules[field] !== true) fail(`rules.${field} must remain true.`);
  }
  for (const field of ['testerRosterStoredInRepository', 'individualFeedbackStoredInRepository']) {
    if (rules[field] !== false) fail(`rules.${field} must remain false.`);
  }
  exactArray(manifest.scenarios, expectedScenarios, 'scenarios');
  exactArray(manifest.feedbackRecordFields, [
    'capturedAt',
    'scenario',
    'platform',
    'appVersion',
    'result',
    'severity',
    'expected',
    'actual',
    'sanitizedEvidenceRef',
  ], 'feedbackRecordFields');
  exactArray(manifest.allowedResults, ['passed', 'issue', 'blocked'], 'allowedResults');
  exactArray(manifest.allowedSeverities, ['none', 'p0', 'p1', 'p2', 'p3'], 'allowedSeverities');
  if (!Array.isArray(manifest.checkpoints) || manifest.checkpoints.length !== 5) {
    fail('Exactly five closed-test checkpoints are required.');
  }

  const aggregate = object(manifest.aggregate, 'aggregate');
  exactKeys(aggregate, [
    'observedTesterCount',
    'completedScenarioRuns',
    'feedbackItemCount',
    'issueCounts',
    'feedbackThemes',
    'changesMade',
    'summaryEvidenceRef',
  ], 'aggregate');
  for (const field of ['observedTesterCount', 'completedScenarioRuns', 'feedbackItemCount']) {
    if (!Number.isInteger(aggregate[field]) || aggregate[field] < 0) fail(`aggregate.${field} must be non-negative.`);
  }
  const issueCounts = object(aggregate.issueCounts, 'aggregate.issueCounts');
  exactKeys(issueCounts, ['p0', 'p1', 'p2', 'p3'], 'aggregate.issueCounts');
  for (const [severity, count] of Object.entries(issueCounts)) {
    if (!Number.isInteger(count) || count < 0) fail(`aggregate.issueCounts.${severity} must be non-negative.`);
  }
  if (!Array.isArray(aggregate.feedbackThemes) || !Array.isArray(aggregate.changesMade)) {
    fail('Aggregate feedback themes and changes must be arrays.');
  }
  const boundaries = object(manifest.boundaries, 'boundaries');
  exactKeys(boundaries, [
    'containsTesterPersonalData',
    'containsAccountIdentifiers',
    'containsSecrets',
    'containsIndividualFeedback',
    'containsInventedResults',
    'storeSubmissionChanged',
  ], 'boundaries');
  for (const field of Object.keys(boundaries)) {
    if (boundaries[field] !== false) fail(`boundaries.${field} must remain false.`);
  }

  const readiness = object(closedTestingReadiness, 'closed-testing readiness');
  if (manifest.state === 'planned') {
    if (candidate.versionName !== expectedCurrentCandidate.versionName
        || candidate.buildNumber !== expectedCurrentCandidate.buildNumber
        || candidate.commit !== null
        || candidate.bindingState !== 'reserved-final-candidate') {
      fail('A planned feedback run must bind only the reserved final candidate.');
    }
    if (readiness.status !== 'not-started'
        || aggregate.observedTesterCount !== 0
        || aggregate.completedScenarioRuns !== 0
        || aggregate.feedbackItemCount !== 0
        || Object.values(issueCounts).some((count) => count !== 0)
        || aggregate.feedbackThemes.length !== 0
        || aggregate.changesMade.length !== 0
        || aggregate.summaryEvidenceRef !== null) {
      fail('A planned feedback run must remain empty until the real closed test starts.');
    }
  } else {
    if (candidate.versionName !== expectedDeviceCandidate.versionName
        || candidate.buildNumber !== expectedDeviceCandidate.buildNumber
        || candidate.commit !== expectedDeviceCandidate.commit
        || candidate.bindingState !== 'exact-installed-candidate') {
      fail('Active feedback must bind the exact installed B11 release candidate.');
    }
    if (!['running', 'eligible', 'production-access-approved'].includes(readiness.status)) {
      fail('Feedback collection requires an active or completed closed test.');
    }
    if (aggregate.observedTesterCount < 12) fail('Feedback collection requires at least 12 observed testers.');
    if (manifest.state === 'summarized') {
      if (readiness.testing?.engagementEvidenceCollected !== true
          || typeof aggregate.summaryEvidenceRef !== 'string'
          || !aggregate.summaryEvidenceRef.startsWith('docs/evidence/b11/')
          || aggregate.summaryEvidenceRef.includes('..')
          || !aggregate.summaryEvidenceRef.endsWith('.json')) {
        fail('A summarized feedback run requires sanitized engagement evidence.');
      }
    }
  }
  return {
    state: manifest.state,
    scenarioCount: manifest.scenarios.length,
    feedbackItemCount: aggregate.feedbackItemCount,
  };
}

export function selectReservedCandidateForClosedTestingFeedback({
  planCandidate,
  pubspecCandidate,
  allowCandidateRollover = false,
  releaseChannel = 'internal',
  apiBaseUrl = 'https://staging.shareittoo.com/api/v1',
  requireStoreSubmission = false,
}) {
  const planned = object(planCandidate, 'planned closed-test candidate');
  const current = object(pubspecCandidate, 'pubspec candidate');
  const same = planned.versionName === current.versionName
    && planned.buildNumber === current.buildNumber;
  if (same || !allowCandidateRollover) return current;
  if (releaseChannel !== 'internal'
      || apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || requireStoreSubmission
      || planned.versionName !== current.versionName
      || !/^\d{10}$/u.test(planned.buildNumber)
      || !/^\d{10}$/u.test(current.buildNumber)
      || BigInt(current.buildNumber) <= BigInt(planned.buildNumber)) {
    fail('Closed-test candidate rollover is restricted to a strictly newer internal Staging diagnostic build.');
  }
  return {
    versionName: planned.versionName,
    buildNumber: planned.buildNumber,
  };
}

function parseArguments(values) {
  let allowCandidateRollover = false;
  for (const value of values) {
    if (value === '--allow-candidate-rollover') {
      allowCandidateRollover = true;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return { allowCandidateRollover };
}

function runCli() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const args = parseArguments(process.argv.slice(2));
  const plan = JSON.parse(readFileSync(resolve(root, 'store/google-play/closed-testing-feedback-plan.json'), 'utf8'));
  const closedTestingReadiness = JSON.parse(readFileSync(
    resolve(root, 'store/google-play/closed-testing-readiness.json'),
    'utf8',
  ));
  const deviceCandidate = JSON.parse(readFileSync(
    resolve(root, 'store/device-validation.json'),
    'utf8',
  )).candidate;
  const pubspec = readFileSync(resolve(root, 'pubspec.yaml'), 'utf8');
  const version = /^version:\s+([^+\s]+)\+(\d{10})$/mu.exec(pubspec);
  if (version === null) fail('pubspec candidate version is invalid.');
  const currentCandidate = selectReservedCandidateForClosedTestingFeedback({
    planCandidate: plan.candidate,
    pubspecCandidate: { versionName: version[1], buildNumber: version[2] },
    allowCandidateRollover: args.allowCandidateRollover,
    releaseChannel: process.env.SIT_RELEASE_CHANNEL ?? 'internal',
    apiBaseUrl: process.env.SIT_API_BASE_URL
      ?? 'https://staging.shareittoo.com/api/v1',
    requireStoreSubmission: process.env.SIT_REQUIRE_STORE_SUBMISSION === '1',
  });
  const result = validateGooglePlayClosedTestingFeedback({
    plan,
    closedTestingReadiness,
    currentCandidate,
    deviceCandidate,
    root,
  });
  process.stdout.write(
    `Google Play closed-test feedback: ${result.state}; scenarios=${result.scenarioCount}; `
    + `feedbackItems=${result.feedbackItemCount}.\n`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
