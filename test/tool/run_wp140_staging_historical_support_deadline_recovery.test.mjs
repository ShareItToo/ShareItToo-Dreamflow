import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { resolve } from 'node:path';

import {
  assertWp140ExecutionGate,
  assertWp140ProvenanceAttestation,
  buildWp140Evidence,
  buildWp140ProgressDraft,
  classifyWp140OverdueCases,
  classifyWp140RecoveryCases,
  recoverWp140Cases,
  remoteAttestationScript,
  remoteBootstrapScript,
  remoteDecommissionScript,
  remoteInventoryScript,
  remoteAfterScript,
  summarizeWp140ExistingDetail,
  wp140ExpectedRuntimeImage,
} from '../../tool/run_wp140_staging_historical_support_deadline_recovery.mjs';

const now = new Date('2026-09-13T13:00:00.000Z');
const clearFlags = Object.freeze({
  safety: false,
  privacy: false,
  dsa: false,
  authority: false,
  article18Candidate: false,
  money: false,
  accountTakeover: false,
});

function supportCase(index) {
  return {
    id: `00000000-0000-4000-8000-00000000000${index}`,
    reporterUserId: `10000000-0000-4000-8000-00000000000${index}`,
    operatingMode: 'simulation',
    status: 'received',
    priority: 'p3',
    caseType: 'general_help',
    caseSubType: 'app_error_or_display',
    version: index,
    nextUpdateAt: new Date(now.getTime() - (index * 86_400_000)).toISOString(),
    createdAt: new Date(now.getTime() - ((index + 3) * 86_400_000)).toISOString(),
    linkedPaymentId: null,
    linkedRefundId: null,
    linkedPayoutId: null,
    finalDecisionAvailable: false,
    flags: clearFlags,
    wp140Recovery: {
      mode: 'pending_active_recipient',
      reporterActive: true,
      pendingProgressCount: 0,
      wp140PublishedCount: 0,
      wp140TransitionCount: 0,
    },
  };
}

const cases = [supportCase(3), supportCase(1), supportCase(2)];

function attestation(overrides = {}) {
  return {
    status: 'passed-read-only',
    targetCount: 3,
    allTargetsMatched: true,
    allNonLive: true,
    allNoncritical: true,
    allFlagsClear: true,
    allSyntheticReporters: true,
    allSyntheticSummaries: true,
    allLinkedListingsSynthetic: true,
    pendingProgressCount: 0,
    rawIdentifiersEmitted: false,
    credentialsRead: false,
    changed: false,
    ...overrides,
  };
}

test('accepts only the exact three noncritical overdue simulation cases', () => {
  const classified = classifyWp140OverdueCases(cases, { now });
  assert.deepEqual(classified.map((entry) => entry.version), [3, 2, 1]);
  assert.equal(assertWp140ExecutionGate('1'), true);
  assert.throws(() => assertWp140ExecutionGate('true'), /not exact/u);
  assert.throws(
    () => classifyWp140OverdueCases([
      supportCase(1),
      { ...supportCase(2), priority: 'p1' },
      supportCase(3),
    ], { now }),
    /not an exact noncritical simulation case/u,
  );
  assert.throws(
    () => classifyWp140OverdueCases([
      supportCase(1),
      { ...supportCase(2), nextUpdateAt: '2026-09-14T00:00:00.000Z' },
      supportCase(3),
    ], { now }),
    /not an exact noncritical simulation case/u,
  );
});

test('requires read-only synthetic provenance and zero pending proposals', () => {
  assert.equal(assertWp140ProvenanceAttestation(attestation()).targetCount, 3);
  assert.throws(
    () => assertWp140ProvenanceAttestation(attestation({ allSyntheticReporters: false })),
    /provenance is not safely proven/u,
  );
  assert.throws(
    () => assertWp140ProvenanceAttestation(attestation({ pendingProgressCount: 1 })),
    /provenance is not safely proven/u,
  );
});

test('classifies a retry-safe mixed recovery cohort without reopening a closed reporter', () => {
  const mixed = [
    {
      ...supportCase(1),
      nextUpdateAt: '2026-09-20T13:00:00.000Z',
      wp140Recovery: {
        mode: 'published_progress', reporterActive: true,
        pendingProgressCount: 0, wp140PublishedCount: 1, wp140TransitionCount: 0,
      },
    },
    {
      ...supportCase(2),
      nextUpdateAt: '2026-09-20T13:00:00.000Z',
      wp140Recovery: {
        mode: 'published_progress', reporterActive: true,
        pendingProgressCount: 0, wp140PublishedCount: 1, wp140TransitionCount: 0,
      },
    },
    {
      ...supportCase(3),
      wp140Recovery: {
        mode: 'pending_closed_synthetic_recipient', reporterActive: false,
        pendingProgressCount: 0, wp140PublishedCount: 0, wp140TransitionCount: 0,
      },
    },
  ];
  const classified = classifyWp140RecoveryCases(mixed, { now });
  assert.equal(classified.length, 3);
  assert.equal(classified.at(-1).wp140Recovery.mode, 'published_progress');
  assert.throws(
    () => classifyWp140RecoveryCases([
      mixed[0], mixed[1],
      { ...mixed[2], wp140Recovery: { ...mixed[2].wp140Recovery, reporterActive: true } },
    ], { now }),
    /recovery target is not exact/u,
  );
});

test('preserves remote regex escapes through both JavaScript evaluations', () => {
  assert.equal(remoteInventoryScript.includes(String.raw`\\+sit-`), true);
  assert.equal(remoteInventoryScript.includes(
    String.raw`@staging\\.shareittoo\\.invalid`,
  ), true);
  assert.equal(remoteAttestationScript.includes(String.raw`\\+sit-`), true);
  assert.equal(remoteAttestationScript.includes(
    String.raw`@staging\\.shareittoo\\.invalid`,
  ), true);
  assert.equal(remoteBootstrapScript.includes(
    String.raw`@staging\.shareittoo\.invalid`,
  ), true);
  assert.equal(remoteDecommissionScript.includes(
    String.raw`@staging\.shareittoo\.invalid`,
  ), true);
  assert.equal(remoteBootstrapScript.includes(String.raw`@staging\\.shareittoo`), false);
  assert.equal(remoteDecommissionScript.includes(String.raw`@staging\\.shareittoo`), false);
  for (const script of [
    remoteInventoryScript,
    remoteAttestationScript,
    remoteBootstrapScript,
    remoteDecommissionScript,
    remoteAfterScript,
  ]) {
    const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], {
      input: script,
      encoding: 'utf8',
    });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
});

test('builds truthful bounded progress content with a future deadline', () => {
  const draft = buildWp140ProgressDraft(supportCase(1), { now });
  assert.equal(draft.expectedVersion, 1);
  assert.equal(draft.recipientUserId, supportCase(1).reporterUserId);
  assert.equal(draft.nextUpdateAt, '2026-09-20T13:00:00.000Z');
  assert.match(draft.progressSinceLastUpdate, /kontrollierte Staging-Testfall/u);
  assert.match(draft.provisionalImpactStatement, /keine Auswirkung auf Produktion/u);
  assert.throws(
    () => buildWp140ProgressDraft(supportCase(1), { now, deadlineHours: 800 }),
    /interval is invalid/u,
  );
});

test('accepts the actual support detail shape without inventing a progressUpdates field', () => {
  const summary = summarizeWp140ExistingDetail({
    supportCase: {
      id: supportCase(1).id,
      nextUpdateAt: '2026-09-20T13:00:00.000Z',
    },
    events: [{ eventType: 'case.progress_update_published' }],
    messages: [{ sendStatus: 'sent', externalMessageSent: false }],
  }, supportCase(1), now);
  assert.deepEqual(summary, {
    futureDeadlineConfirmed: true,
    priorEventHistoryPreserved: true,
    externalMessageSent: false,
  });
  assert.equal(summarizeWp140ExistingDetail({
    supportCase: { id: supportCase(1).id, nextUpdateAt: '2026-09-20T13:00:00.000Z' },
    events: [],
    messages: [{ externalMessageSent: true }],
  }, supportCase(1), now).externalMessageSent, true);
});

test('recovers every case through independent review, publication and readback', async () => {
  const calls = [];
  const recovery = await recoverWp140Cases({
    cases,
    now,
    operations: {
      async attest(targets) {
        calls.push(`attest-${targets.length}`);
        return attestation();
      },
      async draft(target, payload, index) {
        calls.push(`draft-${index + 1}`);
        assert.equal(payload.expectedVersion, target.version);
        return {
          message: {
            id: `message-${index + 1}`,
            version: 1,
            sendStatus: 'pending_approval',
            approvalLevel: 'yellow_human_review',
            renderedContentSha256: 'a'.repeat(64),
          },
          progressUpdate: {
            id: `progress-${index + 1}`,
            proposalVersion: 1,
            proposalStatus: 'pending_review',
          },
        };
      },
      async review(_target, draft, index) {
        calls.push(`review-${index + 1}`);
        return {
          message: {
            ...draft.message,
            version: 2,
            sendStatus: 'approved',
            reviewOutcome: 'approved',
          },
        };
      },
      async publish(target, draft, review, index) {
        calls.push(`publish-${index + 1}`);
        assert.equal(review.message.id, draft.message.id);
        return {
          supportCase: {
            id: target.id,
            version: target.version + 1,
            nextUpdateAt: '2026-09-20T13:00:00.000Z',
          },
          progressUpdate: { id: draft.progressUpdate.id, proposalStatus: 'published' },
          message: { id: draft.message.id, sendStatus: 'sent', externalMessageSent: false },
        };
      },
      async readback(_target, _draft, _publication, index) {
        calls.push(`readback-${index + 1}`);
        return {
          publishedProgressVisible: true,
          publishedMessageVisible: true,
          priorEventHistoryPreserved: true,
          externalMessageSent: false,
        };
      },
      async existingReadback() {
        assert.fail('fresh active recipients must not use existing readback');
      },
      async transitionClosedRecipient() {
        assert.fail('fresh active recipients must not transition');
      },
      async transitionReadback() {
        assert.fail('fresh active recipients must not use transition readback');
      },
      async readiness() {
        calls.push('readiness');
        return {
          httpStatus: 200,
          status: 'ok',
          nextUpdateOverdue: 0,
          criticalNextUpdateOverdue: 0,
          p0WithoutOwner: 0,
        };
      },
    },
  });
  assert.equal(recovery.results.length, 3);
  assert.deepEqual(calls, [
    'attest-3',
    'draft-1', 'review-1', 'publish-1', 'readback-1',
    'draft-2', 'review-2', 'publish-2', 'readback-2',
    'draft-3', 'review-3', 'publish-3', 'readback-3',
    'readiness',
  ]);
});

test('resumes two published cases and advances one closed synthetic recipient without a message', async () => {
  const mixed = [
    {
      ...supportCase(1),
      nextUpdateAt: '2026-09-20T13:00:00.000Z',
      wp140Recovery: {
        mode: 'published_progress', reporterActive: true,
        pendingProgressCount: 0, wp140PublishedCount: 1, wp140TransitionCount: 0,
      },
    },
    {
      ...supportCase(2),
      nextUpdateAt: '2026-09-20T13:00:00.000Z',
      wp140Recovery: {
        mode: 'published_progress', reporterActive: true,
        pendingProgressCount: 0, wp140PublishedCount: 1, wp140TransitionCount: 0,
      },
    },
    {
      ...supportCase(3),
      wp140Recovery: {
        mode: 'pending_closed_synthetic_recipient', reporterActive: false,
        pendingProgressCount: 0, wp140PublishedCount: 0, wp140TransitionCount: 0,
      },
    },
  ];
  const calls = [];
  const recovery = await recoverWp140Cases({
    cases: mixed,
    now,
    operations: {
      attest: async () => attestation(),
      draft: async () => assert.fail('published cases must not be drafted again'),
      review: async () => assert.fail('published cases must not be reviewed again'),
      publish: async () => assert.fail('published cases must not be published again'),
      readback: async () => assert.fail('published cases use existing readback'),
      existingReadback: async (_target, index) => {
        calls.push(`existing-${index + 1}`);
        return {
          futureDeadlineConfirmed: true,
          priorEventHistoryPreserved: true,
          externalMessageSent: false,
        };
      },
      transitionClosedRecipient: async (target, payload, index) => {
        calls.push(`transition-${index + 1}`);
        return {
          supportCase: {
            id: target.id,
            status: 'acknowledged',
            version: target.version + 1,
            nextUpdateAt: payload.nextUpdateAt,
          },
        };
      },
      transitionReadback: async (_target, _transition, index) => {
        calls.push(`transition-readback-${index + 1}`);
        return {
          statusTransitionVisible: true,
          noMessageCreated: true,
          priorEventHistoryPreserved: true,
          externalMessageSent: false,
        };
      },
      readiness: async () => ({
        httpStatus: 200,
        status: 'ok',
        nextUpdateOverdue: 0,
        criticalNextUpdateOverdue: 0,
        p0WithoutOwner: 0,
      }),
    },
  });
  assert.deepEqual(calls, ['transition-1', 'transition-readback-1', 'existing-2', 'existing-3']);
  assert.equal(recovery.results.filter((entry) => entry.progressPublished).length, 2);
  assert.equal(recovery.results.filter((entry) => entry.officialStatusTransition).length, 1);
});

test('fails closed when publication or final readiness is ambiguous', async () => {
  const base = {
    attest: async () => attestation(),
    draft: async (_target, _payload, index) => ({
      message: {
        id: `message-${index}`,
        version: 1,
        sendStatus: 'pending_approval',
        approvalLevel: 'yellow_human_review',
        renderedContentSha256: 'b'.repeat(64),
      },
      progressUpdate: { id: `progress-${index}`, proposalVersion: 1, proposalStatus: 'pending_review' },
    }),
    review: async (_target, draft) => ({
      message: { ...draft.message, version: 2, sendStatus: 'approved', reviewOutcome: 'approved' },
    }),
    publish: async (target, draft) => ({
      supportCase: { id: target.id, version: target.version + 1, nextUpdateAt: '2026-09-20T13:00:00.000Z' },
      progressUpdate: { id: draft.progressUpdate.id, proposalStatus: 'published' },
      message: { id: draft.message.id, sendStatus: 'sent', externalMessageSent: false },
    }),
    readback: async () => ({
      publishedProgressVisible: true,
      publishedMessageVisible: true,
      priorEventHistoryPreserved: true,
      externalMessageSent: false,
    }),
    existingReadback: async () => ({
      futureDeadlineConfirmed: true,
      priorEventHistoryPreserved: true,
      externalMessageSent: false,
    }),
    transitionClosedRecipient: async () => assert.fail('not expected'),
    transitionReadback: async () => assert.fail('not expected'),
    readiness: async () => ({
      httpStatus: 503,
      status: 'degraded',
      nextUpdateOverdue: 1,
      criticalNextUpdateOverdue: 0,
      p0WithoutOwner: 0,
    }),
  };
  await assert.rejects(
    recoverWp140Cases({ cases, operations: base, now }),
    /readiness did not recover exactly/u,
  );
});

test('builds identity-free closure evidence and keeps direct case writes forbidden', () => {
  const recovery = {
    results: [
      ...[1, 2].map((ordinal) => ({
        ordinal,
        recoveryMode: 'published_progress',
        progressPublished: true,
        independentReview: true,
        officialStatusTransition: false,
        futureDeadlineConfirmed: true,
        priorEventHistoryPreserved: true,
        externalMessageSent: false,
      })),
      {
        ordinal: 3,
        recoveryMode: 'closed_synthetic_recipient_transition',
        progressPublished: false,
        independentReview: false,
        officialStatusTransition: true,
        futureDeadlineConfirmed: true,
        priorEventHistoryPreserved: true,
        externalMessageSent: false,
      },
    ],
    readiness: {
      httpStatus: 200,
      status: 'ok',
      nextUpdateOverdue: 0,
      criticalNextUpdateOverdue: 0,
      p0WithoutOwner: 0,
    },
  };
  const evidence = buildWp140Evidence({
    implementationHead: 'c'.repeat(40),
    runtimeImage: wp140ExpectedRuntimeImage,
    runtimeRestartCountBefore: 0,
    runtimeRestartCountAfter: 0,
    before: {
      status: 'passed-read-only', cohortCount: 3, overdueCount: 1,
      wp140PublishedProgressCount: 2, wp140TransitionCount: 0, changed: false,
    },
    recovery,
    after: {
      overdueCount: 0,
      pendingProgressCount: 0,
      wp140PublishedProgressCount: 2,
      wp140TransitionCount: 1,
      priorHistoryPreserved: true,
      externalMessageSentCount: 0,
    },
    cleanup: { temporaryAdminCount: 2, credentialsRevoked: true, privateVaultDeleted: true },
  });
  assert.equal(evidence.portfolioEffect.totals.pass, 21);
  assert.equal(evidence.boundaries.externalMessageSent, false);
  assert.doesNotMatch(JSON.stringify(evidence), /caseId|reporterUserId|@/u);
  assert.equal(buildWp140Evidence({
    implementationHead: 'd'.repeat(40),
    runtimeImage: wp140ExpectedRuntimeImage,
    runtimeRestartCountBefore: 0,
    runtimeRestartCountAfter: 0,
    before: {
      status: 'passed-read-only', cohortCount: 3, overdueCount: 0,
      wp140PublishedProgressCount: 2, wp140TransitionCount: 1, changed: false,
    },
    recovery,
    after: {
      overdueCount: 0,
      pendingProgressCount: 0,
      wp140PublishedProgressCount: 2,
      wp140TransitionCount: 1,
      priorHistoryPreserved: true,
      externalMessageSentCount: 0,
    },
    cleanup: { temporaryAdminCount: 2, credentialsRevoked: true, privateVaultDeleted: true },
  }).status, 'passed-historical-simulation-deadline-recovery');

  const source = readFileSync(resolve(
    process.cwd(),
    'tool/run_wp140_staging_historical_support_deadline_recovery.mjs',
  ), 'utf8');
  assert.doesNotMatch(source, /UPDATE\s+support_cases/iu);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+support_(?:cases|case_events|messages)/iu);
  assert.match(source, /externalMessageSent !== false/u);
  assert.match(source, /audit\.resource_id = user_account\.id::text/u);
  assert.match(source, /failureLabel: 'provenance attestation'/u);
  assert.match(source, /failureLabel: 'post-recovery audit'/u);
  assert.doesNotMatch(source, /stderr.*failed/u);
  assert.match(source, /SIT_WP140_STAGING_HISTORICAL_SUPPORT_DEADLINE_RECOVERY_GO/u);
});
