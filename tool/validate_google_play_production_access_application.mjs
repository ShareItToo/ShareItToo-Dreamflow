#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const states = [
  'draft-before-closed-test',
  'ready-to-apply',
  'submitted',
  'production-access-approved',
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
  const actual = Object.keys(value).sort().join(',');
  const required = expected.slice().sort().join(',');
  if (actual !== required) fail(`${label} must contain exactly: ${expected.join(', ')}.`);
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value.trim();
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} could not be read as JSON: ${error.message}`);
  }
}

function sanitized(value, label = 'production-access application') {
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
    if (/(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/i.test(key)) {
      fail(`${label}.${key} is a forbidden secret-shaped field.`);
    }
    sanitized(entry, `${label}.${key}`);
  }
}

export function validateGooglePlayProductionAccessApplication({
  application,
  closedTestingReadiness,
  requireReady = false,
  requireApproved = false,
}) {
  const manifest = object(application, 'production-access application');
  sanitized(manifest);
  exactKeys(manifest, [
    'schemaVersion',
    'state',
    'applicationId',
    'sourceLocale',
    'sections',
    'evidence',
    'boundaries',
  ], 'production-access application');
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1.');
  if (!states.includes(manifest.state)) fail('state is not recognized.');
  if (manifest.applicationId !== 'com.shareittoo.app') fail('applicationId must remain com.shareittoo.app.');
  if (manifest.sourceLocale !== 'de-DE') fail('sourceLocale must remain de-DE.');

  const sections = object(manifest.sections, 'sections');
  exactKeys(sections, ['closedTest', 'app', 'productionReadiness'], 'sections');
  const closedTest = object(sections.closedTest, 'sections.closedTest');
  exactKeys(closedTest, [
    'testerRecruitmentDifficulty',
    'engagementSummary',
    'feedbackSummary',
    'feedbackChannels',
  ], 'sections.closedTest');
  if (!Array.isArray(closedTest.feedbackChannels)) fail('feedbackChannels must be an array.');
  const app = object(sections.app, 'sections.app');
  exactKeys(app, ['intendedAudience', 'userValue', 'expectedFirstYearInstalls'], 'sections.app');
  nonEmpty(app.intendedAudience, 'intendedAudience');
  nonEmpty(app.userValue, 'userValue');
  const productionReadiness = object(sections.productionReadiness, 'sections.productionReadiness');
  exactKeys(productionReadiness, ['changesBasedOnTesting', 'readinessDecision'], 'sections.productionReadiness');

  const evidence = object(manifest.evidence, 'evidence');
  exactKeys(evidence, ['closedTestingReadiness', 'feedbackSummary', 'releaseCandidate'], 'evidence');
  if (evidence.closedTestingReadiness !== 'store/google-play/closed-testing-readiness.json') {
    fail('The application must bind the canonical closed-testing readiness file.');
  }
  nonEmpty(evidence.releaseCandidate, 'evidence.releaseCandidate');
  const boundaries = object(manifest.boundaries, 'boundaries');
  exactKeys(boundaries, [
    'containsTesterPersonalData',
    'containsAccountIdentifiers',
    'containsSecrets',
    'containsInventedTestResults',
    'applicationSubmitted',
    'storeSubmissionChanged',
  ], 'boundaries');
  for (const field of [
    'containsTesterPersonalData',
    'containsAccountIdentifiers',
    'containsSecrets',
    'containsInventedTestResults',
    'storeSubmissionChanged',
  ]) {
    if (boundaries[field] !== false) fail(`boundaries.${field} must remain false.`);
  }
  if (typeof boundaries.applicationSubmitted !== 'boolean') {
    fail('boundaries.applicationSubmitted must be boolean.');
  }

  const closedReadiness = object(closedTestingReadiness, 'closed-testing readiness');
  const productionAccess = object(closedReadiness.productionAccess, 'closed-testing productionAccess');
  const completedAnswers = typeof closedTest.testerRecruitmentDifficulty === 'string'
    && closedTest.testerRecruitmentDifficulty !== 'pending-console-selection'
    && typeof closedTest.engagementSummary === 'string'
    && closedTest.engagementSummary.trim().length > 0
    && typeof closedTest.feedbackSummary === 'string'
    && closedTest.feedbackSummary.trim().length > 0
    && closedTest.feedbackChannels.length > 0
    && closedTest.feedbackChannels.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
    && typeof app.expectedFirstYearInstalls === 'string'
    && app.expectedFirstYearInstalls !== 'pending-owner-estimate'
    && typeof productionReadiness.changesBasedOnTesting === 'string'
    && productionReadiness.changesBasedOnTesting.trim().length > 0
    && typeof productionReadiness.readinessDecision === 'string'
    && productionReadiness.readinessDecision.trim().length > 0
    && typeof evidence.feedbackSummary === 'string'
    && evidence.feedbackSummary.startsWith('docs/evidence/b11/')
    && !evidence.feedbackSummary.includes('..')
    && evidence.feedbackSummary.endsWith('.json');
  const eligibleClosedTest = closedReadiness.status === 'eligible'
    && closedReadiness.productionAccessAllowed === false
    && closedReadiness.testing?.engagementEvidenceCollected === true
    && productionAccess.applicationSubmitted === false
    && productionAccess.applicationApproved === false;
  const submittedClosedTest = closedReadiness.status === 'eligible'
    && closedReadiness.productionAccessAllowed === false
    && closedReadiness.testing?.engagementEvidenceCollected === true
    && productionAccess.applicationSubmitted === true
    && productionAccess.applicationApproved === false;
  const approvedClosedTest = closedReadiness.status === 'production-access-approved'
    && closedReadiness.productionAccessAllowed === true
    && closedReadiness.testing?.engagementEvidenceCollected === true
    && productionAccess.applicationSubmitted === true
    && productionAccess.applicationApproved === true;

  if (manifest.state === 'draft-before-closed-test') {
    if (boundaries.applicationSubmitted !== false) fail('A draft application cannot be submitted.');
    if (closedTest.engagementSummary !== null
        || closedTest.feedbackSummary !== null
        || closedTest.feedbackChannels.length !== 0
        || productionReadiness.changesBasedOnTesting !== null
        || productionReadiness.readinessDecision !== null
        || evidence.feedbackSummary !== null) {
      fail('A pre-test draft must not invent test outcomes or production-readiness evidence.');
    }
  } else {
    if (!completedAnswers) fail('A ready or submitted application requires complete evidence-backed answers.');
    if (manifest.state === 'ready-to-apply') {
      if (!eligibleClosedTest || boundaries.applicationSubmitted !== false) {
        fail('ready-to-apply requires an eligible, not-yet-submitted closed test.');
      }
    } else if (manifest.state === 'submitted') {
      if (!submittedClosedTest || boundaries.applicationSubmitted !== true) {
        fail('submitted requires an observed submitted application awaiting a decision.');
      }
    } else if (!approvedClosedTest || boundaries.applicationSubmitted !== true) {
      fail('production-access-approved requires the observed positive Console decision.');
    }
  }
  if (requireReady && manifest.state !== 'ready-to-apply') {
    fail('A complete, evidence-backed application ready for production-access submission is required.');
  }
  if (requireApproved && manifest.state !== 'production-access-approved') {
    fail('Observed Google Play production-access approval is required.');
  }
  return {
    state: manifest.state,
    readyToApply: manifest.state === 'ready-to-apply',
    productionAccessApproved: manifest.state === 'production-access-approved',
  };
}

function runCli() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const application = readJson(
    resolve(root, 'store/google-play/production-access-application.json'),
    'production-access application',
  );
  const closedTestingReadiness = readJson(
    resolve(root, 'store/google-play/closed-testing-readiness.json'),
    'closed-testing readiness',
  );
  const result = validateGooglePlayProductionAccessApplication({
    application,
    closedTestingReadiness,
    requireReady: process.argv.includes('--require-ready'),
    requireApproved: process.argv.includes('--require-approved'),
  });
  process.stdout.write(
    `Google Play production-access application: ${result.state}; readyToApply=${result.readyToApply}; `
    + `productionAccessApproved=${result.productionAccessApproved}.\n`,
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
