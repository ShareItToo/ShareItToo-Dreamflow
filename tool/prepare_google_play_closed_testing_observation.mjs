#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateGooglePlayClosedTesting } from './validate_google_play_closed_testing.mjs';
import { validateGooglePlayClosedTestingFeedback } from './validate_google_play_closed_testing_feedback.mjs';

const dayMilliseconds = 24 * 60 * 60 * 1000;

function fail(message) {
  throw new Error(message);
}

function utc(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
      || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be a UTC timestamp such as 2026-08-12T12:00:00Z.`);
  }
  return value;
}

function boolean(value, label) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  fail(`${label} must be true or false.`);
}

function safeTimestamp(value) {
  return value.replaceAll('-', '').replaceAll(':', '');
}

function observation(readiness) {
  return {
    schemaVersion: 1,
    kind: 'google-play-closed-testing-observation',
    capturedAt: readiness.window.observedAt,
    applicationId: readiness.applicationId,
    accountType: readiness.accountType,
    track: readiness.track,
    status: readiness.status,
    window: structuredClone(readiness.window),
    testing: structuredClone(readiness.testing),
    productionAccess: structuredClone(readiness.productionAccess),
    boundaries: structuredClone(readiness.boundaries),
  };
}

export function prepareGooglePlayClosedTestingObservation({
  root,
  currentReadiness,
  observedAt,
  continuousTesterCount,
  engagementEvidenceCollected = false,
  applicationSubmitted = false,
  applicationApproved = false,
  decisionObservedAt = null,
  currentFeedbackPlan = null,
  deviceCandidate = null,
}) {
  utc(observedAt, 'observedAt');
  if (!Number.isInteger(continuousTesterCount) || continuousTesterCount < 12) {
    fail('A qualifying observation requires at least 12 continuously opted-in testers.');
  }
  if (typeof engagementEvidenceCollected !== 'boolean'
      || typeof applicationSubmitted !== 'boolean'
      || typeof applicationApproved !== 'boolean') {
    fail('Observation status fields must be boolean.');
  }
  if (applicationApproved && !applicationSubmitted) {
    fail('Production access cannot be approved before its application was submitted.');
  }
  if (currentReadiness.status === 'production-access-approved') {
    fail('Approved production access is terminal and must not be rewritten by the observation preparer.');
  }

  const readiness = structuredClone(currentReadiness);
  const firstQualifiedObservation = readiness.status === 'not-started';
  if (firstQualifiedObservation) {
    readiness.window.startedAt = observedAt;
    readiness.window.eligibleAt = new Date(
      Date.parse(observedAt) + readiness.requirements.minimumConsecutiveDays * dayMilliseconds,
    ).toISOString().replace('.000Z', 'Z');
  }
  const eligibleAt = Date.parse(readiness.window.eligibleAt);
  const observationAt = Date.parse(observedAt);
  if (!firstQualifiedObservation && observationAt < Date.parse(readiness.window.observedAt)) {
    fail('A new observation cannot predate the currently recorded observation.');
  }
  readiness.window.observedAt = observedAt;
  readiness.testing.continuousQualifiedTesterCount = continuousTesterCount;
  readiness.testing.minimumRosterContinuouslyOptedIn = true;
  readiness.testing.engagementEvidenceCollected = engagementEvidenceCollected;
  readiness.productionAccess.applicationSubmitted = applicationSubmitted;
  readiness.productionAccess.applicationApproved = applicationApproved;
  readiness.productionAccess.decisionObservedAt = decisionObservedAt;
  readiness.productionAccessAllowed = applicationApproved;

  if (applicationApproved) {
    if (decisionObservedAt === null) fail('Approved production access requires decisionObservedAt.');
    utc(decisionObservedAt, 'decisionObservedAt');
    if (observationAt < eligibleAt || Date.parse(decisionObservedAt) < eligibleAt) {
      fail('Production access cannot be approved before the full eligibility window.');
    }
    if (!engagementEvidenceCollected) {
      fail('Approved production access requires collected engagement evidence.');
    }
    readiness.status = 'production-access-approved';
  } else if (observationAt >= eligibleAt && engagementEvidenceCollected) {
    readiness.status = 'eligible';
  } else {
    readiness.status = 'running';
  }
  const evidenceRef = `docs/evidence/b11/google-play-closed-test-observation-${safeTimestamp(observedAt)}.json`;
  readiness.evidenceRef = evidenceRef;
  const evidence = observation(readiness);
  validateGooglePlayClosedTesting({ root, readiness, evidence });
  let feedbackPlan = null;
  if (currentFeedbackPlan !== null || deviceCandidate !== null) {
    if (currentFeedbackPlan === null || deviceCandidate === null) {
      fail('Feedback-plan rebinding requires both the current plan and device candidate.');
    }
    feedbackPlan = structuredClone(currentFeedbackPlan);
    if (firstQualifiedObservation) {
      if (feedbackPlan.state !== 'planned'
          || feedbackPlan.candidate?.bindingState !== 'reserved-final-candidate'
          || feedbackPlan.candidate?.commit !== null
          || feedbackPlan.candidate?.versionName !== deviceCandidate.versionName
          || feedbackPlan.candidate?.buildNumber !== deviceCandidate.buildNumber
          || !/^[a-f0-9]{40}$/u.test(deviceCandidate.commit ?? '')) {
        fail('Closed-test start requires the installed exact reserved final candidate.');
      }
      feedbackPlan.state = 'collecting';
      feedbackPlan.candidate = {
        versionName: deviceCandidate.versionName,
        buildNumber: deviceCandidate.buildNumber,
        commit: deviceCandidate.commit,
        bindingState: 'exact-installed-candidate',
      };
    }
    feedbackPlan.aggregate.observedTesterCount = continuousTesterCount;
    validateGooglePlayClosedTestingFeedback({
      plan: feedbackPlan,
      closedTestingReadiness: readiness,
      deviceCandidate,
    });
  }
  return { readiness, evidence, evidenceRef, feedbackPlan };
}

function parseArguments(values) {
  const options = {
    engagementEvidenceCollected: false,
    applicationSubmitted: false,
    applicationApproved: false,
    decisionObservedAt: null,
    confirm: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--confirm-console-observation') {
      options.confirm = true;
      continue;
    }
    const next = values[index + 1] ?? fail(`${value} requires a value.`);
    index += 1;
    if (value === '--observed-at') options.observedAt = next;
    else if (value === '--continuous-testers') options.continuousTesterCount = Number(next);
    else if (value === '--engagement-evidence-collected') {
      options.engagementEvidenceCollected = boolean(next, value);
    } else if (value === '--application-submitted') {
      options.applicationSubmitted = boolean(next, value);
    } else if (value === '--application-approved') {
      options.applicationApproved = boolean(next, value);
    } else if (value === '--decision-observed-at') options.decisionObservedAt = next;
    else fail(`Unknown argument: ${value}`);
  }
  if (options.observedAt === undefined || options.continuousTesterCount === undefined) {
    fail('--observed-at and --continuous-testers are required.');
  }
  return options;
}

function atomicJson(path, value, { replace }) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o644,
  });
  chmodSync(temporary, 0o644);
  try {
    if (replace) renameSync(temporary, path);
    else linkSync(temporary, path);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export function writeGooglePlayClosedTestingObservation({ root, result }) {
  atomicJson(resolve(root, result.evidenceRef), result.evidence, { replace: false });
  atomicJson(resolve(root, 'store/google-play/closed-testing-readiness.json'), result.readiness, {
    replace: true,
  });
  if (result.feedbackPlan !== null) {
    atomicJson(
      resolve(root, 'store/google-play/closed-testing-feedback-plan.json'),
      result.feedbackPlan,
      { replace: true },
    );
  }
}

function runCli() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const readinessPath = resolve(root, 'store/google-play/closed-testing-readiness.json');
  const currentReadiness = JSON.parse(readFileSync(readinessPath, 'utf8'));
  const currentFeedbackPlan = JSON.parse(readFileSync(
    resolve(root, 'store/google-play/closed-testing-feedback-plan.json'),
    'utf8',
  ));
  const deviceCandidate = JSON.parse(readFileSync(
    resolve(root, 'store/device-validation.json'),
    'utf8',
  )).candidate;
  const options = parseArguments(process.argv.slice(2));
  const result = prepareGooglePlayClosedTestingObservation({
    root,
    currentReadiness,
    currentFeedbackPlan,
    deviceCandidate,
    ...options,
  });
  if (!options.confirm) {
    process.stdout.write(
      `PREVIEW ONLY: status=${result.readiness.status}; startedAt=${result.readiness.window.startedAt}; `
      + `eligibleAt=${result.readiness.window.eligibleAt}; continuousTesters=${result.readiness.testing.continuousQualifiedTesterCount}.\n`
      + 'No file was changed. Re-run with --confirm-console-observation only after the aggregate Console values were verified.\n',
    );
    return;
  }
  writeGooglePlayClosedTestingObservation({ root, result });
  process.stdout.write(
    `Recorded sanitized Google Play observation: status=${result.readiness.status}; evidence=${result.evidenceRef}.\n`,
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
