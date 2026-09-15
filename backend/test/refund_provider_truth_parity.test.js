import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { listStaffPayments } from '../src/moderation_workflow.js';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const up = read('../sql/migrations/077_refund_provider_truth_parity.up.sql');
const down = read('../sql/migrations/077_refund_provider_truth_parity.down.sql');
const moderation = read('../src/moderation_workflow.js');
const privacyExport = read('../src/privacy_export.js');
const model = 'separate_charge_manual_transfer_reversal_v1';

test('migration preserves the raw legacy claim without promoting it to provider truth', () => {
  assert.match(up, /LOCK TABLE refunds IN ACCESS EXCLUSIVE MODE/u);
  assert.match(
    up,
    /RENAME COLUMN refund_platform_fee TO legacy_refund_platform_fee_claim/u,
  );
  assert.match(up, /legacy_refund_platform_fee_claim DROP DEFAULT/u);
  assert.match(up, /legacy_refund_platform_fee_claim DROP NOT NULL/u);
  assert.match(up, /ADD COLUMN provider_refund_model TEXT/u);
  assert.match(
    up,
    new RegExp(`provider_refund_model = '${model}'`, 'u'),
  );
  assert.match(up, /Unverified pre-WP151 application claim/u);
  assert.match(up, /never provider outcome evidence/u);
  assert.doesNotMatch(up, /\b(?:UPDATE|DELETE FROM)\s+refunds\b/iu);
});

test('new refunds require one exact model and provider truth is immutable', () => {
  assert.match(
    up,
    /TG_OP = 'INSERT'[\s\S]*NEW\.legacy_refund_platform_fee_claim IS NOT NULL[\s\S]*NEW\.provider_refund_model IS DISTINCT FROM[\s\S]*refund_provider_model_required/u,
  );
  assert.match(
    up,
    /NEW\.legacy_refund_platform_fee_claim IS DISTINCT FROM[\s\S]*OLD\.legacy_refund_platform_fee_claim[\s\S]*NEW\.provider_refund_model IS DISTINCT FROM OLD\.provider_refund_model[\s\S]*refund_provider_truth_immutable/u,
  );
  assert.match(up, /BEFORE INSERT OR UPDATE OR DELETE ON refunds/u);
  for (const field of [
    'payment_id',
    'idempotency_key',
    'amount_minor',
    'currency',
    'reason',
    'provider_charge_id',
    'owner_share_minor',
    'platform_share_minor',
    'livemode',
  ]) {
    assert.match(up, new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`, 'u'));
  }
  assert.match(up, /refund_preparation_immutable/u);
  assert.match(up, /refund_provider_outcome_initial_state_invalid/u);
  assert.match(up, /OLD\.status = 'succeeded'/u);
  assert.match(up, /refund_provider_outcome_immutable/u);
  assert.match(up, /refund_provider_outcome_incomplete/u);
  assert.match(up, /TG_OP = 'DELETE'[\s\S]*refund_provider_record_delete_forbidden/u);
  assert.match(up, /BEFORE INSERT OR UPDATE OR DELETE ON refunds/u);
});

test('rollback preserves legacy values and refuses to fabricate post-migration truth', () => {
  const guardAt = down.indexOf('post-migration refunds exist');
  const dropAt = down.indexOf('DROP TRIGGER');
  assert.match(down, /LOCK TABLE refunds IN ACCESS EXCLUSIVE MODE/u);
  assert.match(
    down,
    /legacy_refund_platform_fee_claim IS NULL[\s\S]*provider_refund_model IS NOT NULL/u,
  );
  assert.ok(guardAt >= 0 && guardAt < dropAt);
  assert.match(
    down,
    /RENAME COLUMN legacy_refund_platform_fee_claim TO refund_platform_fee/u,
  );
  assert.match(down, /refund_platform_fee SET DEFAULT true/u);
  assert.match(down, /refund_platform_fee SET NOT NULL/u);
  assert.doesNotMatch(down, /\b(?:UPDATE|DELETE FROM|TRUNCATE)\s+refunds\b/iu);
});

test('staff payment truth comes only from the central view and hides unresolved amounts', () => {
  assert.match(moderation, /JOIN sit_payment_refund_truth AS refund_truth/u);
  assert.match(
    moderation,
    /refund_truth\.refund_truth_status IN \('pending', 'needsReview'\)[\s\S]*THEN NULL[\s\S]*ELSE refund_truth\.settled_refund_minor/u,
  );
  assert.match(moderation, /END AS verified_refunded_minor/u);
  const staffPaymentQuery = moderation.slice(
    moderation.indexOf('export async function listStaffPayments'),
    moderation.indexOf('export async function listStaffAudit'),
  );
  assert.doesNotMatch(staffPaymentQuery, /payment\.refunded_minor/u);
  assert.match(
    staffPaymentQuery,
    /refundedMinor: row\.verified_refunded_minor === null[\s\S]*\? null/u,
  );
});

test('central view maps terminal, observation, local settlement and cache drift to review', () => {
  const view = up.slice(up.indexOf('CREATE VIEW sit_payment_refund_truth'));
  assert.match(
    up,
    /refunds_provider_refund_model_check CHECK \(\([\s\S]*\) IS TRUE\)/u,
  );
  assert.match(
    up,
    /refunds_local_settlement_status_check CHECK \(\([\s\S]*\) IS TRUE\)/u,
  );
  assert.match(view, /\) IS DISTINCT FROM TRUE[\s\S]*AS invalid_refund_count/u);
  for (const marker of [
    "refund.status IN ('failed', 'cancelled')",
    "refund.provider_observation_status = 'needs_review'",
    "refund.local_settlement_status = 'needs_review'",
    'payment.refunded_minor IS DISTINCT FROM rollup.settled_refund_minor',
    "payment.status IN ('refunded', 'partially_refunded')",
    "THEN 'needsReview'",
  ]) assert.match(view, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.match(
    view,
    /rollup\.active_refund_count > 0[\s\S]*rollup\.provider_bound_local_pending_count > 0[\s\S]*THEN 'pending'/u,
  );
});

test('staff payment aggregate drift is review-only and never exposes the stored total', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return {
        rows: [{
          id: 'payment-1',
          booking_id: 'booking-1',
          status: 'partially_refunded',
          currency: 'EUR',
          amount_minor: '1000',
          captured_minor: '1000',
          verified_refunded_minor: null,
          transferred_minor: '0',
          livemode: false,
          created_at: '2026-09-14T00:00:00.000Z',
          refund_truth_status: 'needsReview',
        }],
      };
    },
  };
  const [payment] = await listStaffPayments(client, { limit: 50, offset: 0 });
  assert.equal(payment.refundedMinor, null);
  assert.equal(payment.refundTruthStatus, 'needsReview');
  assert.equal(calls[0].parameters.length, 2);
  assert.match(calls[0].sql, /JOIN sit_payment_refund_truth AS refund_truth/u);
});

test('staff pending, cancelled or payment-status drift never exposes an amount', async () => {
  for (const [id, truthStatus] of [
    ['pending-refund', 'pending'],
    ['cancelled-refund', 'needsReview'],
    ['refunded-without-provider-proof', 'needsReview'],
  ]) {
    const client = {
      async query() {
        return {
          rows: [{
            id,
            booking_id: 'booking-1',
            status: id === 'cancelled-refund' ? 'captured' : 'refunded',
            currency: 'EUR',
            amount_minor: '1000',
            captured_minor: '1000',
            verified_refunded_minor: null,
            transferred_minor: '0',
            livemode: false,
            created_at: '2026-09-14T00:00:00.000Z',
            refund_truth_status: truthStatus,
          }],
        };
      },
    };
    const [payment] = await listStaffPayments(client, { limit: 50, offset: 0 });
    assert.equal(payment.refundTruthStatus, truthStatus);
    assert.equal(payment.refundedMinor, null);
  }
});

test('privacy export preserves historical rows with explicit derived truth labels', () => {
  assert.match(privacyExport, /AS provider_truth_status/u);
  assert.match(privacyExport, /AS source_truth_status/u);
  assert.match(privacyExport, /'historical_unverified'/u);
  assert.match(privacyExport, /'provider_outcome_unconfirmed'/u);
  assert.match(privacyExport, /refund\.status = 'succeeded'/u);
  assert.match(privacyExport, /refund\.provider_refund_id IS NOT NULL/u);
  assert.match(privacyExport, /refund\.succeeded_at IS NOT NULL/u);
  assert.match(privacyExport, /refund\.failure_code IS NULL/u);
  assert.match(privacyExport, /refund\.provider_refund_model = \$2/u);
  assert.match(privacyExport, /refund\.legacy_refund_platform_fee_claim IS NULL/u);
  assert.match(
    privacyExport,
    /notification\.event_key =[\s\S]*'refund:' \|\| refund\.id::text \|\| ':succeeded'/u,
  );
  assert.doesNotMatch(privacyExport, /refund\.provider_refund_id\s*(?:,|AS\s+)/u);
});
