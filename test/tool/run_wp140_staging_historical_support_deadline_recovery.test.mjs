import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

import {
  assertWp140ExecutionGate,
  assertWp140ProvenanceAttestation,
  buildWp140Evidence,
  buildWp140ProgressDraft,
  classifyWp140OverdueCases,
  recoverWp140Cases,
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
    results: [1, 2, 3].map((ordinal) => ({
      ordinal,
      progressPublished: true,
      independentReview: true,
      futureDeadlineConfirmed: true,
      priorEventHistoryPreserved: true,
      externalMessageSent: false,
    })),
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
    before: { status: 'passed-read-only', overdueCount: 3, changed: false },
    recovery,
    after: {
      overdueCount: 0,
      pendingProgressCount: 0,
      priorHistoryPreserved: true,
      externalMessageSentCount: 0,
    },
    cleanup: { temporaryAdminCount: 2, credentialsRevoked: true, privateVaultDeleted: true },
  });
  assert.equal(evidence.portfolioEffect.totals.pass, 21);
  assert.equal(evidence.boundaries.externalMessageSent, false);
  assert.doesNotMatch(JSON.stringify(evidence), /caseId|reporterUserId|@/u);

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
