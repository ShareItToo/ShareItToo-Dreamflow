import crypto from 'node:crypto';

import {
  BookingConfirmationError,
  assertConfirmationPresenter,
  assertConfirmationWorkflowState,
  bookingConfirmationChallengeTtlMinutes,
  confirmationActorRole,
  confirmationCode,
  confirmationDigest,
  confirmationDigestMatches,
  confirmationQrPayload,
  confirmationRole,
  confirmationSegment,
  counterpartRole,
  parseConfirmationQrPayload,
} from './booking_confirmation_domain.js';
import { assertConditionEvidenceReadyForVerification } from './booking_condition_evidence_workflow.js';
import { evaluateReturnTimeline } from './private_pilot_return_domain.js';
import {
  assertV52ChallengeEvidenceSet,
  bindV52ConfirmationChallenge,
  recordV52ConfirmationVerification,
} from './v52_handover_return_workflow.js';

async function lockedBooking(client, bookingId) {
  const result = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.workflow_status, booking.rental_timezone, request.payload
       FROM bookings AS booking
       JOIN rental_requests AS request ON request.id = booking.id
      WHERE booking.id = $1
      FOR UPDATE OF booking, request`,
    [bookingId],
  );
  if (!result.rowCount) throw new BookingConfirmationError(404, 'booking_not_found');
  return result.rows[0];
}

function challengeShape(row, { code = null } = {}) {
  return Object.freeze({
    id: row.id,
    bookingId: row.booking_id,
    segment: row.segment,
    presenterRole: row.presenter_role,
    ...(code == null ? {} : { code }),
    ...(code == null ? {} : {
      qrPayload: confirmationQrPayload({
        challengeId: row.id,
        bookingId: row.booking_id,
        segment: row.segment,
        presenterRole: row.presenter_role,
        code,
      }),
    }),
    issuedAt: new Date(row.issued_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : null,
    replayed: row.consumed_at != null,
  });
}

export async function issueBookingConfirmationChallenge(client, {
  actor,
  bookingId,
  raw,
  secret,
  now = new Date(),
}) {
  const booking = await lockedBooking(client, bookingId);
  const segment = confirmationSegment(raw?.segment);
  const presenterRole = confirmationActorRole({
    actorId: actor.id,
    ownerId: booking.owner_id,
    renterId: booking.renter_id,
  });
  assertConfirmationPresenter({ segment, presenterRole });
  assertConfirmationWorkflowState({ segment, workflowStatus: booking.workflow_status });

  const challengeId = crypto.randomUUID();
  const code = confirmationCode();
  const expiresAt = new Date(
    now.getTime() + bookingConfirmationChallengeTtlMinutes * 60_000,
  );
  const digest = confirmationDigest({
    secret,
    challengeId,
    bookingId,
    segment,
    presenterRole,
    code,
  });

  await client.query(
    `UPDATE booking_confirmation_challenges
        SET revoked_at = $4
      WHERE booking_id = $1
        AND segment = $2
        AND presenter_role = $3
        AND consumed_at IS NULL
        AND revoked_at IS NULL`,
    [bookingId, segment, presenterRole, now],
  );
  const inserted = await client.query(
    `INSERT INTO booking_confirmation_challenges (
       id, booking_id, segment, presenter_role, presenter_user_id,
       code_digest, issued_at, expires_at, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      challengeId,
      bookingId,
      segment,
      presenterRole,
      actor.id,
      digest,
      now,
      expiresAt,
      JSON.stringify({ version: 3 }),
    ],
  );
  await bindV52ConfirmationChallenge(client, {
    challengeId,
    bookingId,
    segment,
    presenterRole,
    presenterUserId: actor.id,
    issuedAt: now,
  });
  return challengeShape(inserted.rows[0], { code });
}

function verificationInput(raw, bookingId) {
  if (typeof raw?.qrPayload === 'string' && raw.qrPayload.trim()) {
    const parsed = parseConfirmationQrPayload(raw.qrPayload);
    if (parsed.bookingId !== bookingId) {
      throw new BookingConfirmationError(400, 'confirmation_booking_mismatch');
    }
    return parsed;
  }
  const challengeId = typeof raw?.challengeId === 'string' ? raw.challengeId.trim() : '';
  const code = typeof raw?.code === 'string' ? raw.code.trim() : '';
  if ((challengeId && !/^[0-9a-f-]{36}$/i.test(challengeId)) || !/^\d{6}$/.test(code)) {
    throw new BookingConfirmationError(400, 'invalid_confirmation_payload');
  }
  return {
    challengeId,
    bookingId,
    segment: confirmationSegment(raw?.segment),
    presenterRole: confirmationRole(raw?.presenterRole),
    code,
  };
}

function mergedConfirmation(payload, { segment, presenterRole, verifierRole, challengeId, now }) {
  const key = segment === 'pickup' ? 'handoverConfirmation' : 'returnConfirmation';
  const existing = payload?.[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])
    ? { ...payload[key] }
    : {};
  const instant = now.toISOString();
  return {
    ...existing,
    ownerConfirmedAt: instant,
    renterConfirmedAt: instant,
    confirmedAt: instant,
    confirmedByRole: verifierRole,
    presenterRole,
    method: 'server_challenge',
    verifiedChallengeId: challengeId,
    verificationVersion: 3,
  };
}

export async function verifyBookingConfirmationChallenge(client, {
  actor,
  bookingId,
  raw,
  secret,
  now = new Date(),
}) {
  const booking = await lockedBooking(client, bookingId);
  const verifierRole = confirmationActorRole({
    actorId: actor.id,
    ownerId: booking.owner_id,
    renterId: booking.renter_id,
  });
  const input = verificationInput(raw, bookingId);
  assertConfirmationPresenter({
    segment: input.segment,
    presenterRole: input.presenterRole,
  });
  assertConfirmationWorkflowState({
    segment: input.segment,
    workflowStatus: booking.workflow_status,
  });
  if (counterpartRole(input.presenterRole) !== verifierRole) {
    throw new BookingConfirmationError(403, 'confirmation_counterparty_required');
  }

  const selected = await client.query(
    input.challengeId
      ? `SELECT *
           FROM booking_confirmation_challenges
          WHERE id = $1 AND booking_id = $2
          FOR UPDATE`
      : `SELECT *
           FROM booking_confirmation_challenges
          WHERE booking_id = $1
            AND segment = $2
            AND presenter_role = $3
            AND consumed_at IS NULL
            AND revoked_at IS NULL
          ORDER BY issued_at DESC
          LIMIT 1
          FOR UPDATE`,
    input.challengeId
      ? [input.challengeId, bookingId]
      : [bookingId, input.segment, input.presenterRole],
  );
  if (!selected.rowCount) {
    return { rejected: true, code: 'confirmation_challenge_invalid' };
  }
  const challenge = selected.rows[0];
  if (challenge.segment !== input.segment
      || challenge.presenter_role !== input.presenterRole
      || challenge.presenter_user_id === actor.id
      || challenge.revoked_at
      || challenge.locked_at
      || new Date(challenge.expires_at) <= now) {
    return { rejected: true, code: 'confirmation_challenge_invalid' };
  }
  if (challenge.consumed_at) {
    if (challenge.verifier_user_id !== actor.id) {
      return { rejected: true, code: 'confirmation_challenge_invalid' };
    }
    await recordV52ConfirmationVerification(client, {
      challengeId: challenge.id,
      bookingId,
      segment: challenge.segment,
      verifierUserId: actor.id,
      verifierRole,
      verifiedAt: challenge.consumed_at,
    });
    return {
      challenge: challengeShape(challenge),
      participantUserIds: [booking.owner_id, booking.renter_id],
      replayed: true,
    };
  }
  const candidateDigest = confirmationDigest({
    secret,
    challengeId: challenge.id,
    bookingId,
    segment: challenge.segment,
    presenterRole: challenge.presenter_role,
    code: input.code,
  });
  if (!confirmationDigestMatches(challenge.code_digest, candidateDigest)) {
    const attempts = Math.min(5, Number(challenge.attempt_count ?? 0) + 1);
    await client.query(
      `UPDATE booking_confirmation_challenges
          SET attempt_count = $2,
              locked_at = CASE WHEN $2 >= 5 THEN $3 ELSE locked_at END
        WHERE id = $1`,
      [challenge.id, attempts, now],
    );
    return { rejected: true, code: 'confirmation_challenge_invalid', attemptsRemaining: 5 - attempts };
  }

  await assertV52ChallengeEvidenceSet(client, {
    challengeId: challenge.id,
    bookingId,
    segment: challenge.segment,
  });

  await assertConditionEvidenceReadyForVerification(client, {
    bookingId,
    selectedSegment: input.segment,
    verifierUserId: actor.id,
  });

  const consumed = await client.query(
    `UPDATE booking_confirmation_challenges
        SET verifier_user_id = $2, consumed_at = $3
      WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL
      RETURNING *`,
    [challenge.id, actor.id, now],
  );
  if (!consumed.rowCount) return { rejected: true, code: 'confirmation_challenge_invalid' };

  await recordV52ConfirmationVerification(client, {
    challengeId: challenge.id,
    bookingId,
    segment: challenge.segment,
    verifierUserId: actor.id,
    verifierRole,
    verifiedAt: now,
  });

  const payload = booking.payload && typeof booking.payload === 'object' ? { ...booking.payload } : {};
  const key = input.segment === 'pickup' ? 'handoverConfirmation' : 'returnConfirmation';
  payload[key] = mergedConfirmation(payload, {
    segment: input.segment,
    presenterRole: input.presenterRole,
    verifierRole,
    challengeId: challenge.id,
    now,
  });
  if (input.segment === 'return') {
    const timeline = evaluateReturnTimeline({
      scheduledReturnAt: payload.end,
      mutuallyConfirmedActualReturnAt: now,
      ownerConfirmed: true,
      renterConfirmed: true,
      substantiatedCaseOpenedAt: payload.needsReview === true ? payload.returnCaseOpenedAt : null,
      now,
      timezone: booking.rental_timezone,
    });
    payload.returnState = timeline.state;
    payload.returnT0 = timeline.t0;
    payload.returnReportDeadline = timeline.reportDeadline;
    payload.returnClarificationDeadline = timeline.clarificationDeadline;
    payload.payoutInstructionDueAt = timeline.payoutInstructionDueAt;
  }
  await client.query(
    `UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1`,
    [bookingId, JSON.stringify(payload)],
  );
  if (input.segment === 'return') {
    await client.query(
      `UPDATE bookings
          SET return_t0 = $2, return_state = $3,
              return_report_deadline = $4,
              return_clarification_deadline = $5,
              payout_instruction_due_at = $6,
              version = version + 1
        WHERE id = $1`,
      [
        bookingId,
        payload.returnT0,
        payload.returnState,
        payload.returnReportDeadline,
        payload.returnClarificationDeadline,
        payload.payoutInstructionDueAt,
      ],
    );
  }
  await client.query(
    `INSERT INTO booking_events (
       booking_id, actor_id, event_type, from_status, to_status, metadata
     ) VALUES ($1, $2, 'booking.counterparty_confirmation_verified', $3, $3, $4::jsonb)`,
    [
      bookingId,
      actor.id,
      booking.workflow_status,
      JSON.stringify({
        segment: input.segment,
        presenterRole: input.presenterRole,
        verifierRole,
        challengeId: challenge.id,
        version: 3,
      }),
    ],
  );
  return {
    challenge: challengeShape(consumed.rows[0]),
    confirmation: payload[key],
    participantUserIds: [booking.owner_id, booking.renter_id],
    replayed: false,
  };
}

export function hasVerifiedBookingConfirmation(payload, segment) {
  const key = confirmationSegment(segment) === 'pickup'
    ? 'handoverConfirmation'
    : 'returnConfirmation';
  const confirmation = payload?.[key];
  return Boolean(
    confirmation
      && confirmation.verificationVersion === 3
      && /^[0-9a-f-]{36}$/i.test(confirmation.verifiedChallengeId ?? '')
      && Number.isFinite(Date.parse(confirmation.ownerConfirmedAt))
      && Number.isFinite(Date.parse(confirmation.renterConfirmedAt)),
  );
}
