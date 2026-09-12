import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertReportTransition,
  canTransitionReport,
  ModerationDomainError,
  moderationIdempotencyKey,
  normalizeHarassmentBlockReportInput,
  normalizeReportInput,
  normalizeReviewInput,
  shapeStaffUser,
} from '../src/moderation_domain.js';

test('report input is bounded, categorized and deduplicates evidence', () => {
  const report = normalizeReportInput({
    targetType: 'USER',
    targetId: 'user-2',
    reasonCode: 'fraud.suspected',
    priority: 'high',
    details: 'Dokumentierter kontrollierter Fall',
    reference: 'Buchung 42',
    evidenceUploadIds: [
      '11111111-1111-1111-1111-111111111111',
      '11111111-1111-1111-1111-111111111111',
    ],
  });
  assert.equal(report.targetType, 'user');
  assert.equal(report.priority, 'high');
  assert.equal(report.evidenceUploadIds.length, 1);
});

test('non-acute harassment intake owns reason and priority server-side', () => {
  const report = normalizeHarassmentBlockReportInput({
    targetUserId: 'user-2',
    immediateDanger: false,
    details: 'Dokumentierter nicht-akuter Testfall',
    evidenceUploadIds: [
      '11111111-1111-1111-1111-111111111111',
      '11111111-1111-1111-1111-111111111111',
    ],
  });
  assert.equal(report.targetType, 'user');
  assert.equal(report.targetId, 'user-2');
  assert.equal(report.reasonCode, 'harassment');
  assert.equal(report.priority, 'normal');
  assert.equal(report.immediateDanger, false);
  assert.equal(report.evidenceUploadIds.length, 1);
});

test('harassment intake diverts acute danger and rejects client-owned policy fields', () => {
  assert.throws(
    () => normalizeHarassmentBlockReportInput({
      targetUserId: 'user-2',
      immediateDanger: true,
    }),
    (error) => error instanceof ModerationDomainError
      && error.status === 409
      && error.code === 'immediate_danger_requires_safety_path',
  );
  assert.throws(
    () => normalizeHarassmentBlockReportInput({
      targetUserId: 'user-2',
      immediateDanger: false,
      priority: 'urgent',
    }),
    (error) => error instanceof ModerationDomainError
      && error.code === 'invalid_harassment_block_report_fields',
  );
  assert.throws(
    () => normalizeHarassmentBlockReportInput({ targetUserId: 'user-2' }),
    (error) => error instanceof ModerationDomainError
      && error.code === 'non_acute_confirmation_required',
  );
});

test('report workflow separates support triage from admin action', () => {
  assert.equal(canTransitionReport({ role: 'support', fromStatus: 'open', toStatus: 'triaged' }), true);
  assert.equal(canTransitionReport({ role: 'support', fromStatus: 'investigating', toStatus: 'actioned' }), false);
  assert.equal(canTransitionReport({ role: 'admin', fromStatus: 'investigating', toStatus: 'actioned' }), true);
  assert.throws(
    () => assertReportTransition({ role: 'admin', fromStatus: 'investigating', toStatus: 'closed' }),
    (error) => error instanceof ModerationDomainError && error.code === 'report_resolution_required',
  );
});

test('review requires the four canonical criteria and derives one decimal rating', () => {
  const review = normalizeReviewInput({
    direction: 'renter_to_owner',
    criteria: [
      { key: 'communication', stars: 5, note: 'Schnell' },
      { key: 'reliability', stars: 4 },
      { key: 'article_as_described', stars: 5 },
      { key: 'handover_return', stars: 4 },
    ],
  });
  assert.equal(review.rating, 4.5);
  assert.equal(review.criteria.length, 4);
  assert.match(review.body, /communication: Schnell/);
});

test('support user summaries omit email while admins receive it', () => {
  const row = {
    id: 'user-1', email: 'private@example.test', role: 'user', account_status: 'active',
    email_verified_at: new Date(), created_at: new Date('2026-08-09T00:00:00Z'),
    profile: { displayName: 'Private Person' },
  };
  assert.equal(Object.hasOwn(shapeStaffUser(row, 'support'), 'email'), false);
  assert.equal(shapeStaffUser(row, 'admin').email, 'private@example.test');
});

test('moderation idempotency keys are namespaced and reject unsafe values', () => {
  assert.equal(moderationIdempotencyKey('case-1', 'report.transition'), 'report.transition:case-1');
  assert.throws(
    () => moderationIdempotencyKey('contains spaces'),
    (error) => error.code === 'invalid_idempotency_key',
  );
});
