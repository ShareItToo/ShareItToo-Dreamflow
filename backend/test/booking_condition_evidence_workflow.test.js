import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertConditionEvidenceReadyForVerification,
  getConditionEvidenceSummary,
  parseConditionEvidence,
  recordConditionConfirmation,
  recordConditionEvidenceForMessage,
} from '../src/booking_condition_evidence_workflow.js';

const pickupBooking = Object.freeze({
  id: 'booking-1',
  owner_id: 'owner-1',
  renter_id: 'renter-1',
  workflow_status: 'accepted',
});

function memoryClient({
  booking = pickupBooking,
  presenterPhotos = 4,
  deviationPhotos = 0,
  confirmation = null,
} = {}) {
  const state = {
    booking: { ...booking },
    presenterPhotos,
    deviationPhotos,
    confirmation,
    evidenceInserts: [],
  };
  return {
    state,
    async query(sql, values) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.startsWith('SELECT id, owner_id, renter_id, workflow_status FROM bookings')) {
        return { rowCount: 1, rows: [{ ...state.booking }] };
      }
      if (compact.startsWith('INSERT INTO booking_condition_evidence')) {
        state.evidenceInserts.push(values);
        return {
          rowCount: 1,
          rows: [{
            id: '00000000-0000-4000-8000-000000000001',
            created_at: new Date('2026-08-17T08:00:00.000Z'),
          }],
        };
      }
      if (compact.includes('LEFT JOIN platform_contracts AS contract')) {
        return {
          rowCount: 1,
          rows: [{ ...state.booking, contract_version: null }],
        };
      }
      if (compact.startsWith('SELECT evidence_kind, count(*)::integer AS count')) {
        const rows = [];
        if (state.presenterPhotos > 0) {
          rows.push({
            evidence_kind: 'presenter_photo',
            count: state.presenterPhotos,
            non_camera_used: false,
          });
        }
        if (state.deviationPhotos > 0) {
          rows.push({
            evidence_kind: 'counterparty_deviation',
            count: state.deviationPhotos,
            non_camera_used: false,
          });
        }
        return { rowCount: rows.length, rows };
      }
      if (compact.startsWith('SELECT verifier_role, verifier_user_id, decision')) {
        return state.confirmation
          ? { rowCount: 1, rows: [{ ...state.confirmation }] }
          : { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('SELECT id, booking_id, segment, verifier_role')) {
        return state.confirmation
          ? { rowCount: 1, rows: [{ ...state.confirmation }] }
          : { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('SELECT decision, verifier_user_id, deviation_photo_count')) {
        return state.confirmation
          ? { rowCount: 1, rows: [{ ...state.confirmation }] }
          : { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('INSERT INTO booking_condition_confirmations')) {
        state.confirmation = {
          id: '00000000-0000-4000-8000-000000000002',
          booking_id: values[0],
          segment: values[1],
          verifier_role: values[2],
          verifier_user_id: values[3],
          decision: values[4],
          presenter_photo_count: values[5],
          deviation_photo_count: values[6],
          created_at: new Date('2026-08-17T08:00:00.000Z'),
        };
        return { rowCount: 1, rows: [{ ...state.confirmation }] };
      }
      throw new Error(`unexpected query: ${compact}`);
    },
  };
}

test('pickup owner and return renter are the only presenter-photo roles', () => {
  const pickup = parseConditionEvidence({
    segment: 'pickup',
    kind: 'presenter_photo',
    source: 'camera',
  }, { booking: pickupBooking, actorId: 'owner-1' });
  assert.equal(pickup.requiredUploadPurpose, 'handover_evidence');

  const returnBooking = { ...pickupBooking, workflow_status: 'active' };
  const returned = parseConditionEvidence({
    segment: 'return',
    kind: 'presenter_photo',
    source: 'gallery',
  }, { booking: returnBooking, actorId: 'renter-1' });
  assert.equal(returned.requiredUploadPurpose, 'return_evidence');

  assert.throws(
    () => parseConditionEvidence({
      segment: 'pickup',
      kind: 'presenter_photo',
      source: 'camera',
    }, { booking: pickupBooking, actorId: 'renter-1' }),
    (error) => error.code === 'condition_evidence_role_mismatch',
  );
});

test('private photo evidence is atomically bound to exactly one upload and message', async () => {
  const client = memoryClient();
  const evidence = parseConditionEvidence({
    segment: 'pickup',
    kind: 'presenter_photo',
    source: 'browser_picker',
  }, { booking: pickupBooking, actorId: 'owner-1' });
  await recordConditionEvidenceForMessage(client, {
    bookingId: 'booking-1',
    actorId: 'owner-1',
    messageId: 'message-1',
    attachments: [{ id: 'upload-1' }],
    evidence,
  });
  assert.deepEqual(client.state.evidenceInserts[0], [
    'booking-1',
    'pickup',
    'presenter_photo',
    'owner',
    'owner-1',
    'upload-1',
    'message-1',
    'browser_picker',
  ]);
  await assert.rejects(
    recordConditionEvidenceForMessage(client, {
      bookingId: 'booking-1',
      actorId: 'owner-1',
      messageId: 'message-2',
      attachments: [],
      evidence,
    }),
    (error) => error.code === 'condition_evidence_requires_one_photo',
  );
});

test('pickup renter can confirm only after four owner photos', async () => {
  const incomplete = memoryClient({ presenterPhotos: 3 });
  await assert.rejects(
    recordConditionConfirmation(incomplete, {
      actor: { id: 'renter-1' },
      bookingId: 'booking-1',
      raw: { segment: 'pickup', decision: 'confirmed' },
    }),
    (error) => error.code === 'presenter_photo_set_incomplete',
  );

  const ready = memoryClient();
  const result = await recordConditionConfirmation(ready, {
    actor: { id: 'renter-1' },
    bookingId: 'booking-1',
    raw: { segment: 'pickup', decision: 'confirmed' },
  });
  assert.equal(result.replayed, false);
  assert.equal(result.confirmation.verifier_role, 'renter');
  assert.deepEqual(result.participantUserIds, ['owner-1', 'renter-1']);
});

test('a documented deviation requires at least one counterparty photo', async () => {
  const client = memoryClient();
  await assert.rejects(
    recordConditionConfirmation(client, {
      actor: { id: 'renter-1' },
      bookingId: 'booking-1',
      raw: { segment: 'pickup', decision: 'deviation_recorded' },
    }),
    (error) => error.code === 'deviation_photo_required',
  );
  client.state.deviationPhotos = 1;
  const result = await recordConditionConfirmation(client, {
    actor: { id: 'renter-1' },
    bookingId: 'booking-1',
    raw: { segment: 'pickup', decision: 'deviation_recorded' },
  });
  assert.equal(result.confirmation.deviation_photo_count, 1);
});

test('QR verification guard requires the same counterparty confirmation', async () => {
  const client = memoryClient({
    confirmation: {
      decision: 'confirmed',
      verifier_user_id: 'renter-1',
      deviation_photo_count: 0,
    },
  });
  assert.equal(await assertConditionEvidenceReadyForVerification(client, {
    bookingId: 'booking-1',
    selectedSegment: 'pickup',
    verifierUserId: 'renter-1',
  }), true);
  await assert.rejects(
    assertConditionEvidenceReadyForVerification(client, {
      bookingId: 'booking-1',
      selectedSegment: 'pickup',
      verifierUserId: 'owner-1',
    }),
    (error) => error.code === 'condition_confirmation_required',
  );
});

test('summary discloses counts and non-camera origin without exposing image bytes', async () => {
  const client = memoryClient({
    confirmation: {
      verifier_role: 'renter',
      verifier_user_id: 'renter-1',
      decision: 'confirmed',
      presenter_photo_count: 4,
      deviation_photo_count: 0,
      created_at: new Date('2026-08-17T08:00:00.000Z'),
    },
  });
  const summary = await getConditionEvidenceSummary(client, {
    actor: { id: 'owner-1' },
    bookingId: 'booking-1',
    rawSegment: 'pickup',
  });
  assert.equal(summary.presenterPhotos, 4);
  assert.equal(summary.counterpartyConfirmation.verifierUserId, 'renter-1');
  assert.equal('bytes' in summary, false);
});
