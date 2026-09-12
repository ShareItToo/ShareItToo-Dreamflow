import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  bookingGroupEvidenceSlots,
  buildBookingGroupItemHandoverState,
  buildSharedBookingGroupAppointments,
  deriveBookingGroupOperationalState,
} from '../src/booking_group_handover_domain.js';

test('shared appointments derive exact group boundaries without an address', () => {
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ];
  const appointments = buildSharedBookingGroupAppointments({
    bookingGroupId: 'booking_group_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    groupQuoteId: 'booking_group_quote_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    groupQuoteHash: 'b'.repeat(64),
    startsAt: '2027-06-30T22:00:00.000Z',
    endsAt: '2027-07-02T22:00:00.000Z',
    timezone: 'Europe/Berlin',
    handoverLocationKey: 'c'.repeat(64),
    createdById: 'renter',
    commandKey: 'g3d-shared-appointments',
  }, { idFactory: () => ids.shift() });
  assert.deepEqual(appointments.map((entry) => entry.appointmentType), ['pickup', 'return']);
  assert.deepEqual(appointments.map((entry) => entry.scheduledAt), [
    '2027-06-30T22:00:00.000Z',
    '2027-07-02T22:00:00.000Z',
  ]);
  assert.ok(appointments.every((entry) => entry.handoverLocationKey === 'c'.repeat(64)));
  assert.equal(JSON.stringify(appointments).includes('address'), true);
  assert.equal(JSON.stringify(appointments).includes('Owner exact address'), false);
  assert.ok(Object.isFrozen(appointments));
});

test('item evidence, accessories, damage, timers and needsReview remain isolated', () => {
  const base = {
    group_position_id: 'position-camera',
    group_quote_position_id: 'quote-position-camera',
    listing_id: 'listing-camera',
    booking_id: 'booking-camera',
    platform_contract_id: 'contract-camera',
    workflow_status: 'completed',
    return_state: 'needsReview',
    return_t0: '2027-07-02T22:00:00.000Z',
    return_report_deadline: '2027-07-04T22:00:00.000Z',
    return_clarification_deadline: '2027-07-09T22:00:00.000Z',
    thread_id: 'thread-camera',
  };
  const evidenceRows = bookingGroupEvidenceSlots.map((slot, index) => ({
    evidence_id: `evidence-${index}`,
    segment: 'return',
    evidence_kind: 'presenter_photo',
    semantic_slot: slot,
    upload_id: `upload-${index}`,
    upload_sha256: String(index).repeat(64),
    observed_at: '2027-07-02T22:05:00.000Z',
  }));
  const disputed = buildBookingGroupItemHandoverState({
    position: base,
    evidenceRows,
    returnCase: {
      id: 'case-camera',
      reason_code: 'damage',
      contested_authorized_minor: 500,
      undisputed_releasable_minor: 2800,
      response_due_at: '2027-07-07T22:05:00.000Z',
      next_status_update_due_at: '2027-07-09T22:05:00.000Z',
    },
  });
  const unrelated = buildBookingGroupItemHandoverState({
    position: {
      ...base,
      group_position_id: 'position-lens',
      group_quote_position_id: 'quote-position-lens',
      listing_id: 'listing-lens',
      booking_id: 'booking-lens',
      platform_contract_id: 'contract-lens',
      return_state: 'payoutEligible',
      thread_id: 'thread-lens',
    },
  });
  assert.equal(disputed.operationalState, 'needs_review');
  assert.equal(disputed.damage.returnCase.id, 'case-camera');
  assert.equal(disputed.return.accessories.evidenceId, 'evidence-2');
  assert.equal(disputed.chat.threadId, 'thread-camera');
  assert.equal(unrelated.operationalState, 'independent');
  assert.equal(unrelated.damage.needsReview, false);
  assert.equal(unrelated.damage.returnCase, null);
  assert.equal(unrelated.chat.threadId, 'thread-lens');
});

test('only an explicit system-risk hold elevates the group state', () => {
  assert.equal(deriveBookingGroupOperationalState({
    systemRiskHold: false, requiredItemCount: 2, boundItemCount: 2, appointmentCount: 2,
  }), 'ready');
  assert.equal(deriveBookingGroupOperationalState({
    systemRiskHold: false, requiredItemCount: 2, boundItemCount: 1, appointmentCount: 0,
  }), 'awaiting_item_booking_bindings');
  assert.equal(deriveBookingGroupOperationalState({
    systemRiskHold: true, requiredItemCount: 2, boundItemCount: 2, appointmentCount: 2,
  }), 'held_system_risk');
});

test('G3D migration is additive, V5.2-bound, item-granular and fail-closed', async () => {
  const [up, down] = await Promise.all([
    readFile(new URL('../sql/migrations/030_g3d_shared_handover_item_evidence.up.sql', import.meta.url), 'utf8'),
    readFile(new URL('../sql/migrations/030_g3d_shared_handover_item_evidence.down.sql', import.meta.url), 'utf8'),
  ]);
  for (const table of [
    'booking_group_position_booking_bindings',
    'booking_group_appointment_commands',
    'booking_group_appointments',
  ]) assert.match(up, new RegExp(`CREATE TABLE ${table}`, 'u'));
  assert.match(up, /target_contract\.contract_version NOT LIKE 'V5\.2-%'/u);
  assert.match(up, /declaration_count <> 2 OR valid_declaration_count <> 2/u);
  assert.match(up, /v52_item_specific_four_slots_v1/u);
  assert.match(up, /v52_item_booking_threads_only/u);
  assert.match(up, /scope = 'account'/u);
  assert.match(up, /booking_group_position_bindings_append_only/u);
  assert.match(up, /booking_group_appointments_append_only/u);
  assert.doesNotMatch(up, /ALTER TABLE (?:bookings|platform_contracts|booking_quotes)/u);
  assert.doesNotMatch(up, /(?:UPDATE|DELETE FROM) (?:bookings|platform_contracts|booking_quotes)/u);
  assert.match(down, /G3D rollback blocked: booking group handover data exists/u);
});

test('G3D route exposes the overlay but binding stays an internal materializer seam', async () => {
  const [workflow, app] = await Promise.all([
    readFile(new URL('../src/booking_group_handover_workflow.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(workflow, /export async function bindBookingGroupPositionToV52Booking/u);
  assert.match(workflow, /v52_condition_evidence_bindings/u);
  assert.match(workflow, /v52_condition_confirmation_bindings/u);
  assert.match(workflow, /v52_return_cases/u);
  assert.match(workflow, /booking_group\.item_v52_booking_bound/u);
  assert.match(workflow, /booking_group\.shared_appointments_scheduled/u);
  assert.match(workflow, /ON CONFLICT DO NOTHING[\s\S]*RETURNING id, created_at/u);
  assert.match(workflow, /message_threads AS thread ON thread\.booking_id/u);
  assert.match(workflow, /groupNeedsReview: null/u);
  assert.match(workflow, /itemReviewIsolation: true/u);
  assert.doesNotMatch(workflow, /location_text/u);
  assert.doesNotMatch(app, /bindBookingGroupPositionToV52Booking/u);
  assert.match(app, /\/shared-appointments'/u);
  assert.match(app, /\/handover-return'/u);
  assert.match(app, /assertBookingGroupsEnabled\(config\)/u);
});
