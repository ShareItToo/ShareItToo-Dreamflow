import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSupportDuplicateCaseCompatibility,
  normalizeSupportDuplicateCaseLink,
} from '../src/support_duplicate_case_domain.js';
import { recordSupportDuplicateCaseLink } from '../src/support_duplicate_case_workflow.js';

const admin = { id: 'admin-1', role: 'admin' };
const duplicateId = '11111111-1111-4111-8111-111111111111';
const leadingId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const elevationId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-08-22T14:00:00.000Z');
const noRows = { rowCount: 0, rows: [] };

function input() {
  return {
    leadingCaseId: leadingId,
    duplicateExpectedVersion: 8,
    leadingExpectedVersion: 5,
    sameCoreFactsConfirmed: true,
    sameParticipantsAndObjectsConfirmed: true,
    sameDecisionQuestionConfirmed: true,
    noSeparateDeadlineLossConfirmed: true,
    privacyDsaSeparationConfirmed: true,
  };
}

function supportCase(overrides = {}) {
  return {
    id: duplicateId,
    human_readable_case_number: 'SIT-ABCDEFGH2345',
    case_type: 'general_help',
    case_subtype: 'app_error_or_display',
    status: 'resolved',
    operating_mode: 'simulation',
    lock_version: 8,
    reporter_user_id: 'user-1',
    affected_user_ids: ['user-2'],
    privacy_flag: false,
    dsa_flag: false,
    authority_flag: false,
    linked_booking_id: null,
    linked_listing_id: null,
    linked_payment_id: null,
    linked_refund_id: null,
    linked_payout_id: null,
    ...overrides,
  };
}

function scriptedClient(steps) {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      calls.push({ statement, values });
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${statement}`);
      assert.match(statement, step.pattern);
      step.check?.({ statement, values });
      return typeof step.result === 'function'
        ? step.result({ statement, values })
        : step.result;
    },
    done() {
      assert.equal(steps.length, 0);
    },
  };
}

test('duplicate-link input requires every separation and human-review confirmation', () => {
  assert.equal(
    normalizeSupportDuplicateCaseLink(input(), 'duplicate-1').leadingCaseId,
    leadingId,
  );
  for (const field of [
    'sameCoreFactsConfirmed',
    'sameParticipantsAndObjectsConfirmed',
    'sameDecisionQuestionConfirmed',
    'noSeparateDeadlineLossConfirmed',
    'privacyDsaSeparationConfirmed',
  ]) {
    assert.throws(
      () => normalizeSupportDuplicateCaseLink({ ...input(), [field]: false }, 'duplicate-1'),
      (error) => error.code === 'support_duplicate_case_confirmations_required',
    );
  }
});

test('compatibility keeps privacy and DSA lanes separate and requires exact scope', () => {
  const duplicate = supportCase();
  const leading = supportCase({
    id: leadingId,
    human_readable_case_number: 'SIT-BCDEFGHJ3456',
    status: 'under_review',
    lock_version: 5,
  });
  assert.doesNotThrow(() => assertSupportDuplicateCaseCompatibility(duplicate, leading));
  assert.throws(
    () => assertSupportDuplicateCaseCompatibility(
      { ...duplicate, case_type: 'privacy_security', privacy_flag: true },
      {
        ...leading,
        case_type: 'privacy_security',
        case_subtype: 'access_or_copy_request',
        privacy_flag: true,
      },
    ),
    (error) => error.code === 'support_duplicate_case_separate_lane_required',
  );
  assert.throws(
    () => assertSupportDuplicateCaseCompatibility(
      duplicate,
      { ...leading, linked_booking_id: 'booking-other' },
    ),
    (error) => error.code === 'support_duplicate_case_scope_mismatch',
  );
});

test('administrator records an immutable non-live duplicate link without merging rows', async () => {
  const duplicate = supportCase();
  const leading = supportCase({
    id: leadingId,
    human_readable_case_number: 'SIT-BCDEFGHJ3456',
    status: 'under_review',
    lock_version: 5,
  });
  const client = scriptedClient([
    { pattern: /FROM support_case_links AS link[\s\S]*idempotency_key/u, result: noRows },
    {
      pattern: /FROM support_cases[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/u,
      check: ({ values }) => assert.deepEqual(values[0], [duplicateId, leadingId]),
      result: { rowCount: 2, rows: [duplicate, leading] },
    },
    { pattern: /SELECT id FROM support_case_links/u, result: noRows },
    {
      pattern: /INSERT INTO support_case_links/u,
      check: ({ statement, values }) => {
        assert.doesNotMatch(statement, /UPDATE support_cases|DELETE FROM support_cases/iu);
        const snapshot = JSON.parse(values[6]);
        assert.equal(snapshot.leadingCaseNumber, 'SIT-BCDEFGHJ3456');
        assert.equal(snapshot.automaticMergeAllowed, false);
        assert.equal(snapshot.externalDeliveryAllowed, false);
        assert.equal(Object.hasOwn(snapshot, 'summary'), false);
        assert.equal(Object.hasOwn(snapshot, 'reporterUserId'), false);
      },
      result: ({ values }) => ({
        rowCount: 1,
        rows: [{
          id: values[0],
          case_id: values[1],
          object_id: values[2],
          relation_type: 'duplicate_of',
          link_version: values[3],
          case_version: values[4],
          leading_case_version: values[5],
          assessment_snapshot: JSON.parse(values[6]),
          created_by: values[7],
          human_reviewed: true,
          automatic_merge_executed: false,
          external_delivery_enabled: false,
          idempotency_key: values[10],
          created_at: values[11],
          duplicate_case_number: values[12],
          leading_case_number: values[13],
          snapshot_sha256: 'a'.repeat(64),
        }],
      }),
    },
    {
      pattern: /case\.duplicate_link_recorded/u,
      check: ({ values }) => {
        const payload = JSON.parse(values[4]);
        assert.equal(payload.leadingCaseNumber, 'SIT-BCDEFGHJ3456');
        assert.equal(payload.duplicateClosurePending, true);
        assert.equal(payload.automaticMergeExecuted, false);
      },
      result: noRows,
    },
    {
      pattern: /case\.leading_duplicate_link_recorded/u,
      check: ({ values }) => {
        const payload = JSON.parse(values[4]);
        assert.equal(payload.duplicateCaseNumber, 'SIT-ABCDEFGH2345');
        assert.equal(payload.automaticMergeExecuted, false);
      },
      result: noRows,
    },
    {
      pattern: /INSERT INTO audit_log/u,
      check: ({ values }) => {
        const metadata = JSON.parse(values[3]);
        assert.equal(metadata.humanReviewed, true);
        assert.equal(metadata.externalDeliveryEnabled, false);
        assert.equal(Object.hasOwn(metadata, 'reporterUserId'), false);
      },
      result: noRows,
    },
  ]);
  const result = await recordSupportDuplicateCaseLink(client, {
    actor: admin,
    sessionId,
    staffElevationId: elevationId,
    duplicateCaseId: duplicateId,
    raw: input(),
    idempotencyKey: 'duplicate-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.link.leadingCaseNumber, 'SIT-BCDEFGHJ3456');
  assert.equal(result.link.automaticMergeExecuted, false);
  assert.equal(result.link.externalDeliveryEnabled, false);
  client.done();
});

test('non-admin and self-link requests fail before persistence', async () => {
  await assert.rejects(
    recordSupportDuplicateCaseLink(scriptedClient([]), {
      actor: { id: 'support-1', role: 'support' },
      sessionId,
      staffElevationId: elevationId,
      duplicateCaseId: duplicateId,
      raw: input(),
      idempotencyKey: 'duplicate-support',
    }),
    (error) => error.code === 'support_duplicate_case_admin_required',
  );
  await assert.rejects(
    recordSupportDuplicateCaseLink(scriptedClient([]), {
      actor: admin,
      sessionId,
      staffElevationId: elevationId,
      duplicateCaseId: leadingId,
      raw: input(),
      idempotencyKey: 'duplicate-self',
    }),
    (error) => error.code === 'support_duplicate_case_self_link_forbidden',
  );
});
