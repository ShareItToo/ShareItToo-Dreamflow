#!/usr/bin/env node

import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const statuses = ['not-started', 'running', 'eligible', 'production-access-approved'];
const dayMilliseconds = 24 * 60 * 60 * 1000;

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

function instant(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    fail(`${label} must be a UTC RFC 3339 timestamp.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail(`${label} is not a valid timestamp.`);
  return milliseconds;
}

function assertSanitized(value, label = 'closed-test readiness') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${label}[${index}]`));
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
    assertSanitized(entry, `${label}.${key}`);
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} could not be read as JSON: ${error.message}`);
  }
}

function readRepositoryEvidence(root, ref) {
  const evidenceRoot = realpathSync(resolve(root, 'docs/evidence/b11'));
  const path = resolve(root, ref);
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    fail('The referenced closed-test evidence file does not exist.');
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail('Closed-test evidence must be a normal file, not a symbolic link.');
  }
  const real = realpathSync(path);
  if (!real.startsWith(`${evidenceRoot}/`)) {
    fail('Closed-test evidence must remain under docs/evidence/b11/.');
  }
  return readJson(real, 'closed-test evidence');
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} must be ${JSON.stringify(expected)}.`);
}

export function validateGooglePlayClosedTesting({
  root,
  readiness,
  evidence = null,
  requireProductionAccess = false,
}) {
  const manifest = object(readiness, 'closed-test readiness');
  assertSanitized(manifest);
  exactKeys(manifest, [
    'schemaVersion',
    'status',
    'productionAccessAllowed',
    'applicationId',
    'accountType',
    'track',
    'requirements',
    'window',
    'testing',
    'productionAccess',
    'evidenceRef',
    'boundaries',
  ], 'closed-test readiness');
  same(manifest.schemaVersion, 1, 'schemaVersion');
  if (!statuses.includes(manifest.status)) fail('status is not recognized.');
  same(manifest.applicationId, 'com.shareittoo.app', 'applicationId');
  same(manifest.accountType, 'personal', 'accountType');
  same(manifest.track, 'closed', 'track');
  if (typeof manifest.productionAccessAllowed !== 'boolean') {
    fail('productionAccessAllowed must be boolean.');
  }

  const requirements = object(manifest.requirements, 'requirements');
  exactKeys(requirements, ['minimumContinuousTesterCount', 'minimumConsecutiveDays'], 'requirements');
  same(requirements.minimumContinuousTesterCount, 12, 'minimumContinuousTesterCount');
  same(requirements.minimumConsecutiveDays, 14, 'minimumConsecutiveDays');

  const window = object(manifest.window, 'window');
  exactKeys(window, ['startedAt', 'eligibleAt', 'observedAt'], 'window');
  const testing = object(manifest.testing, 'testing');
  exactKeys(testing, [
    'continuousQualifiedTesterCount',
    'minimumRosterContinuouslyOptedIn',
    'engagementEvidenceCollected',
  ], 'testing');
  if (!Number.isInteger(testing.continuousQualifiedTesterCount)
      || testing.continuousQualifiedTesterCount < 0) {
    fail('continuousQualifiedTesterCount must be a non-negative integer.');
  }
  for (const field of ['minimumRosterContinuouslyOptedIn', 'engagementEvidenceCollected']) {
    if (typeof testing[field] !== 'boolean') fail(`testing.${field} must be boolean.`);
  }

  const productionAccess = object(manifest.productionAccess, 'productionAccess');
  exactKeys(productionAccess, [
    'applicationSubmitted',
    'applicationApproved',
    'decisionObservedAt',
  ], 'productionAccess');
  for (const field of ['applicationSubmitted', 'applicationApproved']) {
    if (typeof productionAccess[field] !== 'boolean') fail(`productionAccess.${field} must be boolean.`);
  }
  const boundaries = object(manifest.boundaries, 'boundaries');
  exactKeys(boundaries, [
    'containsTesterPersonalData',
    'containsAccountIdentifiers',
    'containsSecrets',
    'storeSubmissionChanged',
  ], 'boundaries');
  for (const field of Object.keys(boundaries)) same(boundaries[field], false, `boundaries.${field}`);

  const active = manifest.status !== 'not-started';
  if (!active) {
    for (const [label, value] of Object.entries(window)) same(value, null, `window.${label}`);
    same(testing.continuousQualifiedTesterCount, 0, 'continuousQualifiedTesterCount');
    same(testing.minimumRosterContinuouslyOptedIn, false, 'minimumRosterContinuouslyOptedIn');
    same(testing.engagementEvidenceCollected, false, 'engagementEvidenceCollected');
    same(productionAccess.applicationSubmitted, false, 'applicationSubmitted');
    same(productionAccess.applicationApproved, false, 'applicationApproved');
    same(productionAccess.decisionObservedAt, null, 'decisionObservedAt');
    same(manifest.productionAccessAllowed, false, 'productionAccessAllowed');
    same(manifest.evidenceRef, null, 'evidenceRef');
  } else {
    const startedAt = instant(window.startedAt, 'window.startedAt');
    const eligibleAt = instant(window.eligibleAt, 'window.eligibleAt');
    const observedAt = instant(window.observedAt, 'window.observedAt');
    const requiredEligibleAt = startedAt + requirements.minimumConsecutiveDays * dayMilliseconds;
    if (eligibleAt !== requiredEligibleAt) {
      fail('window.eligibleAt must be exactly 14 consecutive days after window.startedAt.');
    }
    if (observedAt < startedAt) fail('window.observedAt cannot precede window.startedAt.');
    if (typeof manifest.evidenceRef !== 'string'
        || !manifest.evidenceRef.startsWith('docs/evidence/b11/')
        || manifest.evidenceRef.includes('..')
        || !manifest.evidenceRef.endsWith('.json')) {
      fail('An active closed test requires a sanitized evidenceRef under docs/evidence/b11/.');
    }
    if (evidence === null) fail('The referenced closed-test evidence must be provided.');
    const observation = object(evidence, 'closed-test evidence');
    assertSanitized(observation, 'closed-test evidence');
    exactKeys(observation, [
      'schemaVersion',
      'kind',
      'capturedAt',
      'applicationId',
      'accountType',
      'track',
      'status',
      'window',
      'testing',
      'productionAccess',
      'boundaries',
    ], 'closed-test evidence');
    same(observation.schemaVersion, 1, 'evidence.schemaVersion');
    same(observation.kind, 'google-play-closed-testing-observation', 'evidence.kind');
    same(observation.capturedAt, window.observedAt, 'evidence.capturedAt');
    for (const field of ['applicationId', 'accountType', 'track', 'status']) {
      same(observation[field], manifest[field], `evidence.${field}`);
    }
    for (const field of Object.keys(window)) same(observation.window?.[field], window[field], `evidence.window.${field}`);
    for (const field of Object.keys(testing)) same(observation.testing?.[field], testing[field], `evidence.testing.${field}`);
    for (const field of Object.keys(productionAccess)) {
      same(observation.productionAccess?.[field], productionAccess[field], `evidence.productionAccess.${field}`);
    }
    const evidenceBoundaries = object(observation.boundaries, 'evidence.boundaries');
    exactKeys(evidenceBoundaries, Object.keys(boundaries), 'evidence.boundaries');
    for (const field of Object.keys(evidenceBoundaries)) same(evidenceBoundaries[field], false, `evidence.boundaries.${field}`);

    if (manifest.status === 'running') {
      if (testing.continuousQualifiedTesterCount < requirements.minimumContinuousTesterCount) {
        fail('A qualifying 14-day window cannot start below 12 continuously opted-in testers.');
      }
      same(testing.minimumRosterContinuouslyOptedIn, true, 'minimumRosterContinuouslyOptedIn');
      same(productionAccess.applicationSubmitted, false, 'applicationSubmitted');
      same(productionAccess.applicationApproved, false, 'applicationApproved');
      same(productionAccess.decisionObservedAt, null, 'decisionObservedAt');
      same(manifest.productionAccessAllowed, false, 'productionAccessAllowed');
    } else {
      if (observedAt < eligibleAt) fail('Eligibility requires an observation after the full 14-day window.');
      if (testing.continuousQualifiedTesterCount < requirements.minimumContinuousTesterCount) {
        fail('Eligibility requires at least 12 continuously opted-in qualified testers.');
      }
      same(testing.minimumRosterContinuouslyOptedIn, true, 'minimumRosterContinuouslyOptedIn');
      same(testing.engagementEvidenceCollected, true, 'engagementEvidenceCollected');
      if (manifest.status === 'eligible') {
        same(productionAccess.applicationApproved, false, 'applicationApproved');
        same(productionAccess.decisionObservedAt, null, 'decisionObservedAt');
        same(manifest.productionAccessAllowed, false, 'productionAccessAllowed');
      } else {
        same(testing.engagementEvidenceCollected, true, 'engagementEvidenceCollected');
        same(productionAccess.applicationSubmitted, true, 'applicationSubmitted');
        same(productionAccess.applicationApproved, true, 'applicationApproved');
        const decisionAt = instant(productionAccess.decisionObservedAt, 'productionAccess.decisionObservedAt');
        if (decisionAt < eligibleAt || decisionAt > observedAt) {
          fail('The production-access decision must be observed after eligibility and no later than the evidence observation.');
        }
        same(manifest.productionAccessAllowed, true, 'productionAccessAllowed');
      }
    }
  }

  const ready = manifest.status === 'production-access-approved'
    && manifest.productionAccessAllowed === true;
  if (requireProductionAccess && !ready) fail('Approved Google Play production access is required.');
  return {
    status: manifest.status,
    productionAccessAllowed: ready,
    continuousQualifiedTesterCount: testing.continuousQualifiedTesterCount,
  };
}

function runCli() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const readinessPath = resolve(root, 'store/google-play/closed-testing-readiness.json');
  const readiness = readJson(readinessPath, 'closed-test readiness');
  let evidence = null;
  if (readiness.evidenceRef !== null) {
    evidence = readRepositoryEvidence(root, readiness.evidenceRef);
  }
  const result = validateGooglePlayClosedTesting({
    root,
    readiness,
    evidence,
    requireProductionAccess: process.argv.includes('--require-production-access'),
  });
  process.stdout.write(
    `Google Play closed testing: ${result.status}; productionAccessAllowed=${result.productionAccessAllowed}; continuousTesters=${result.continuousQualifiedTesterCount}.\n`,
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
