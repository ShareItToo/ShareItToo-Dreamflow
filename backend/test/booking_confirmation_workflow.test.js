import assert from 'node:assert/strict';
import test from 'node:test';

import {
  issueBookingConfirmationChallenge,
  verifyBookingConfirmationChallenge,
} from '../src/booking_confirmation_workflow.js';

const secret = 'workflow-confirmation-secret-that-is-long-enough';

function memoryClient({ workflowStatus = 'accepted', evidenceReady = true } = {}) {
  const state = {
    booking: {
      id: 'booking-1',
      owner_id: 'owner-1',
      renter_id: 'renter-1',
      workflow_status: workflowStatus,
      rental_timezone: 'Europe/Berlin',
      payload: {
        id: 'booking-1',
        start: '2026-09-01T10:00:00.000Z',
        end: '2026-09-02T10:00:00.000Z',
      },
    },
    challenges: new Map(),
    events: [],
    conditionEvidence: evidenceReady ? [
      { evidence_kind: 'presenter_photo', count: 4, non_camera_used: false },
    ] : [],
    conditionConfirmation: evidenceReady ? {
      decision: 'confirmed',
      verifier_user_id: workflowStatus === 'active' ? 'owner-1' : 'renter-1',
      deviation_photo_count: 0,
    } : null,
  };
  return {
    state,
    async query(sql, values) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.startsWith('SELECT booking.id, booking.owner_id, booking.renter_id, booking.workflow_status, booking.rental_timezone, request.payload FROM bookings AS booking JOIN rental_requests AS request ON request.id = booking.id')) {
        return { rowCount: 1, rows: [{ ...state.booking }] };
      }
      if (compact.includes('LEFT JOIN platform_contracts AS contract')) {
        return {
          rowCount: 1,
          rows: [{ ...state.booking, contract_version: null }],
        };
      }
      if (compact.startsWith('SELECT presenter_evidence_set_sha256 FROM v52_confirmation_challenge_bindings')) {
        return { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('UPDATE booking_confirmation_challenges SET revoked_at')) {
        for (const challenge of state.challenges.values()) {
          if (challenge.booking_id === values[0]
              && challenge.segment === values[1]
              && challenge.presenter_role === values[2]
              && !challenge.consumed_at
              && !challenge.revoked_at) {
            challenge.revoked_at = values[3];
          }
        }
        return { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('INSERT INTO booking_confirmation_challenges')) {
        const row = {
          id: values[0],
          booking_id: values[1],
          segment: values[2],
          presenter_role: values[3],
          presenter_user_id: values[4],
          verifier_user_id: null,
          code_digest: values[5],
          issued_at: values[6],
          expires_at: values[7],
          consumed_at: null,
          revoked_at: null,
          attempt_count: 0,
          locked_at: null,
          metadata: JSON.parse(values[8]),
        };
        state.challenges.set(row.id, row);
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (compact.startsWith('SELECT * FROM booking_confirmation_challenges') && compact.includes('WHERE id =')) {
        const row = state.challenges.get(values[0]);
        return row && row.booking_id === values[1]
          ? { rowCount: 1, rows: [{ ...row }] }
          : { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('SELECT * FROM booking_confirmation_challenges')) {
        const row = [...state.challenges.values()].reverse().find((entry) => (
          entry.booking_id === values[0]
          && entry.segment === values[1]
          && entry.presenter_role === values[2]
          && !entry.consumed_at
          && !entry.revoked_at
        ));
        return row ? { rowCount: 1, rows: [{ ...row }] } : { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('UPDATE booking_confirmation_challenges SET attempt_count')) {
        const row = state.challenges.get(values[0]);
        row.attempt_count = values[1];
        if (values[1] >= 5) row.locked_at = values[2];
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (compact.startsWith('SELECT evidence_kind, count(*)::integer AS count')) {
        return {
          rowCount: state.conditionEvidence.length,
          rows: state.conditionEvidence.map((entry) => ({ ...entry })),
        };
      }
      if (compact.startsWith('SELECT decision, verifier_user_id, deviation_photo_count FROM booking_condition_confirmations')) {
        return state.conditionConfirmation
          ? { rowCount: 1, rows: [{ ...state.conditionConfirmation }] }
          : { rowCount: 0, rows: [] };
      }
      if (compact.startsWith('UPDATE booking_confirmation_challenges SET verifier_user_id')) {
        const row = state.challenges.get(values[0]);
        if (!row || row.consumed_at || row.revoked_at) return { rowCount: 0, rows: [] };
        row.verifier_user_id = values[1];
        row.consumed_at = values[2];
        return { rowCount: 1, rows: [{ ...row }] };
      }
      if (compact.startsWith('UPDATE rental_requests SET payload')) {
        state.booking.payload = JSON.parse(values[1]);
        return { rowCount: 1, rows: [] };
      }
      if (compact.startsWith('UPDATE bookings SET return_t0')) {
        return { rowCount: 1, rows: [] };
      }
      if (compact.startsWith('INSERT INTO booking_events')) {
        state.events.push(JSON.parse(values[3]));
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query: ${compact}`);
    },
  };
}

test('owner challenge is consumed once by the renter and records both-party pickup evidence', async () => {
  const client = memoryClient();
  const challenge = await issueBookingConfirmationChallenge(client, {
    actor: { id: 'owner-1' },
    bookingId: 'booking-1',
    raw: { segment: 'pickup' },
    secret,
    now: new Date('2026-08-14T20:00:00.000Z'),
  });
  assert.match(challenge.code, /^\d{6}$/);
  assert.match(challenge.qrPayload, /^shareittoo:v3:pickup:owner:/);

  const verified = await verifyBookingConfirmationChallenge(client, {
    actor: { id: 'renter-1' },
    bookingId: 'booking-1',
    raw: { qrPayload: challenge.qrPayload },
    secret,
    now: new Date('2026-08-14T20:01:00.000Z'),
  });
  assert.equal(verified.rejected, undefined);
  assert.equal(verified.confirmation.verificationVersion, 3);
  assert.equal(verified.confirmation.presenterRole, 'owner');
  assert.equal(verified.confirmation.confirmedByRole, 'renter');
  assert.deepEqual(verified.participantUserIds, ['owner-1', 'renter-1']);
  assert.equal(client.state.booking.payload.handoverConfirmation.ownerConfirmedAt, '2026-08-14T20:01:00.000Z');
  assert.equal(client.state.booking.payload.handoverConfirmation.renterConfirmedAt, '2026-08-14T20:01:00.000Z');
  assert.equal(client.state.events.length, 1);

  const replay = await verifyBookingConfirmationChallenge(client, {
    actor: { id: 'renter-1' },
    bookingId: 'booking-1',
    raw: { qrPayload: challenge.qrPayload },
    secret,
    now: new Date('2026-08-14T20:02:00.000Z'),
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.participantUserIds, ['owner-1', 'renter-1']);
  assert.equal(client.state.events.length, 1);
});

test('presenter cannot verify their own challenge', async () => {
  const client = memoryClient();
  const challenge = await issueBookingConfirmationChallenge(client, {
    actor: { id: 'owner-1' },
    bookingId: 'booking-1',
    raw: { segment: 'pickup' },
    secret,
  });
  await assert.rejects(
    verifyBookingConfirmationChallenge(client, {
      actor: { id: 'owner-1' },
      bookingId: 'booking-1',
      raw: { qrPayload: challenge.qrPayload },
      secret,
    }),
    (error) => error.code === 'confirmation_counterparty_required',
  );
});

test('correct pickup code stays reusable until four presenter photos and renter confirmation exist', async () => {
  const client = memoryClient({ evidenceReady: false });
  const challenge = await issueBookingConfirmationChallenge(client, {
    actor: { id: 'owner-1' },
    bookingId: 'booking-1',
    raw: { segment: 'pickup' },
    secret,
  });
  await assert.rejects(
    verifyBookingConfirmationChallenge(client, {
      actor: { id: 'renter-1' },
      bookingId: 'booking-1',
      raw: { qrPayload: challenge.qrPayload },
      secret,
    }),
    (error) => error.code === 'presenter_photo_set_incomplete',
  );
  assert.equal(client.state.challenges.get(challenge.id).consumed_at, null);

  client.state.conditionEvidence = [
    { evidence_kind: 'presenter_photo', count: 4, non_camera_used: false },
  ];
  client.state.conditionConfirmation = {
    decision: 'confirmed',
    verifier_user_id: 'renter-1',
    deviation_photo_count: 0,
  };
  const verified = await verifyBookingConfirmationChallenge(client, {
    actor: { id: 'renter-1' },
    bookingId: 'booking-1',
    raw: { qrPayload: challenge.qrPayload },
    secret,
  });
  assert.equal(verified.replayed, false);
});

test('participant cannot issue the counterparty presentation role', async () => {
  const client = memoryClient({ workflowStatus: 'active' });
  await assert.rejects(
    issueBookingConfirmationChallenge(client, {
      actor: { id: 'owner-1' },
      bookingId: 'booking-1',
      raw: { segment: 'return' },
      secret,
    }),
    (error) => error.code === 'confirmation_presenter_role_invalid',
  );
});

test('five wrong manual codes lock the one-time challenge without changing booking evidence', async () => {
  const client = memoryClient();
  const challenge = await issueBookingConfirmationChallenge(client, {
    actor: { id: 'owner-1' },
    bookingId: 'booking-1',
    raw: { segment: 'pickup' },
    secret,
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const rejected = await verifyBookingConfirmationChallenge(client, {
      actor: { id: 'renter-1' },
      bookingId: 'booking-1',
      raw: {
        segment: 'pickup',
        presenterRole: 'owner',
        code: '000000',
      },
      secret,
    });
    assert.equal(rejected.rejected, true);
    assert.equal(rejected.attemptsRemaining, 5 - attempt);
  }
  assert.ok(client.state.challenges.get(challenge.id).locked_at);
  assert.equal(client.state.booking.payload.handoverConfirmation, undefined);
});
