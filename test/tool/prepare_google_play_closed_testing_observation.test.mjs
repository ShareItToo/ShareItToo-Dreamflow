import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  prepareGooglePlayClosedTestingObservation,
  writeGooglePlayClosedTestingObservation,
} from '../../tool/prepare_google_play_closed_testing_observation.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = JSON.parse(readFileSync(resolve(root, 'store/google-play/closed-testing-readiness.json'), 'utf8'));
const feedbackBase = JSON.parse(readFileSync(
  resolve(root, 'store/google-play/closed-testing-feedback-plan.json'),
  'utf8',
));
const finalDeviceCandidate = {
  versionName: feedbackBase.candidate.versionName,
  buildNumber: feedbackBase.candidate.buildNumber,
  commit: 'b'.repeat(40),
};

function prepare(overrides = {}) {
  return prepareGooglePlayClosedTestingObservation({
    root,
    currentReadiness: structuredClone(base),
    observedAt: '2026-08-12T12:00:00Z',
    continuousTesterCount: 12,
    ...overrides,
  });
}

test('prepares the first qualifying observation with an exact 14-day window', () => {
  const result = prepare();
  assert.equal(result.readiness.status, 'running');
  assert.equal(result.readiness.window.startedAt, '2026-08-12T12:00:00Z');
  assert.equal(result.readiness.window.eligibleAt, '2026-08-26T12:00:00Z');
  assert.equal(result.readiness.productionAccessAllowed, false);
  assert.match(result.evidenceRef, /^docs\/evidence\/b11\/google-play-closed-test-observation-/);
});

test('prepares feedback collection for the exact installed final candidate', () => {
  const result = prepare({
    currentFeedbackPlan: structuredClone(feedbackBase),
    deviceCandidate: finalDeviceCandidate,
  });
  assert.equal(result.feedbackPlan.state, 'collecting');
  assert.deepEqual(result.feedbackPlan.candidate, {
    ...finalDeviceCandidate,
    bindingState: 'exact-installed-candidate',
  });
  assert.equal(result.feedbackPlan.aggregate.observedTesterCount, 12);
});

test('rejects starting feedback collection on a build other than the reserved final candidate', () => {
  assert.throws(() => prepare({
    currentFeedbackPlan: structuredClone(feedbackBase),
    deviceCandidate: { ...finalDeviceCandidate, buildNumber: '2026081402' },
  }), /installed exact reserved final candidate/);
});

test('refuses to start the qualifying window below twelve testers', () => {
  assert.throws(() => prepare({ continuousTesterCount: 11 }), /requires at least 12/);
});

test('does not mark eligibility at day fourteen without engagement evidence', () => {
  const first = prepare();
  const result = prepareGooglePlayClosedTestingObservation({
    root,
    currentReadiness: first.readiness,
    observedAt: '2026-08-26T12:00:00Z',
    continuousTesterCount: 12,
  });
  assert.equal(result.readiness.status, 'running');
});

test('marks eligibility only after the full window and engagement evidence', () => {
  const first = prepare();
  const result = prepareGooglePlayClosedTestingObservation({
    root,
    currentReadiness: first.readiness,
    observedAt: '2026-08-26T12:00:00Z',
    continuousTesterCount: 12,
    engagementEvidenceCollected: true,
  });
  assert.equal(result.readiness.status, 'eligible');
  assert.equal(result.readiness.productionAccessAllowed, false);
});

test('refuses a production approval before eligibility', () => {
  assert.throws(
    () => prepare({
      applicationSubmitted: true,
      applicationApproved: true,
      decisionObservedAt: '2026-08-12T11:59:00Z',
    }),
    /cannot be approved before the full eligibility window/,
  );
});

test('prepares approved production access only after an eligible observation', () => {
  const first = prepare();
  const eligible = prepareGooglePlayClosedTestingObservation({
    root,
    currentReadiness: first.readiness,
    observedAt: '2026-08-26T12:00:00Z',
    continuousTesterCount: 12,
    engagementEvidenceCollected: true,
  });
  const result = prepareGooglePlayClosedTestingObservation({
    root,
    currentReadiness: eligible.readiness,
    observedAt: '2026-08-29T12:00:00Z',
    continuousTesterCount: 12,
    engagementEvidenceCollected: true,
    applicationSubmitted: true,
    applicationApproved: true,
    decisionObservedAt: '2026-08-29T11:00:00Z',
  });
  assert.equal(result.readiness.status, 'production-access-approved');
  assert.equal(result.readiness.productionAccessAllowed, true);
});

test('writes repository-readable evidence once and replaces only the readiness snapshot', () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'sit-play-observation-'));
  try {
    mkdirSync(resolve(temporaryRoot, 'store/google-play'), { recursive: true });
    writeFileSync(
      resolve(temporaryRoot, 'store/google-play/closed-testing-readiness.json'),
      `${JSON.stringify(base, null, 2)}\n`,
    );
    writeFileSync(
      resolve(temporaryRoot, 'store/google-play/closed-testing-feedback-plan.json'),
      `${JSON.stringify(feedbackBase, null, 2)}\n`,
    );
    const result = prepare({
      currentFeedbackPlan: structuredClone(feedbackBase),
      deviceCandidate: finalDeviceCandidate,
    });
    writeGooglePlayClosedTestingObservation({ root: temporaryRoot, result });

    const evidencePath = resolve(temporaryRoot, result.evidenceRef);
    assert.deepEqual(JSON.parse(readFileSync(evidencePath, 'utf8')), result.evidence);
    assert.deepEqual(
      JSON.parse(readFileSync(
        resolve(temporaryRoot, 'store/google-play/closed-testing-readiness.json'),
        'utf8',
      )),
      result.readiness,
    );
    assert.deepEqual(
      JSON.parse(readFileSync(
        resolve(temporaryRoot, 'store/google-play/closed-testing-feedback-plan.json'),
        'utf8',
      )),
      result.feedbackPlan,
    );
    assert.equal(statSync(evidencePath).mode & 0o777, 0o644);
    assert.throws(
      () => writeGooglePlayClosedTestingObservation({ root: temporaryRoot, result }),
      /EEXIST/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
