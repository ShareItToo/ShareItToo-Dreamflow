import {
  bookingAddressAuditMetadata,
  bookingAddressRevealVersion,
  evaluateBookingAddressReveal,
} from './booking_address_reveal_domain.js';

function safeIdentifier(value) {
  const candidate = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  return /^[A-Za-z0-9_.:-]+$/.test(candidate) ? candidate : 'invalid-booking-reference';
}

async function writeAudit(client, {
  actor,
  action,
  bookingId,
  requestId,
  metadata,
}) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id,
       request_id, metadata
     ) VALUES ($1, $2, $3, 'booking', $4, $5, $6::jsonb)`,
    [
      actor.id,
      actor.role ?? 'user',
      action,
      bookingId,
      requestId ?? null,
      JSON.stringify(metadata),
    ],
  );
}

export async function getBookingAddressReveal(client, {
  actor,
  bookingId: rawBookingId,
  segment,
  requestId,
  now = new Date(),
}) {
  const bookingId = safeIdentifier(rawBookingId);
  const result = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.workflow_status, booking.workflow_version,
            booking.rental_start_date::text AS rental_start_date_text,
            booking.rental_end_date::text AS rental_end_date_text,
            booking.rental_timezone, request.payload,
            listing.id AS listing_id, listing.location_text
       FROM bookings AS booking
       JOIN rental_requests AS request ON request.id = booking.id
       JOIN listings AS listing ON listing.id = booking.listing_id
      WHERE booking.id = $1`,
    [bookingId],
  );
  const row = result.rows[0];
  if (!row || (actor.id !== row.owner_id && actor.id !== row.renter_id)) {
    const visibility = Object.freeze({
      version: bookingAddressRevealVersion,
      segment,
      result: 'denied',
      reason: 'not_found_or_not_participant',
      exactAddressReturned: false,
    });
    await writeAudit(client, {
      actor,
      action: 'booking.exact_address_access_denied',
      bookingId,
      requestId,
      metadata: visibility,
    });
    return Object.freeze({ denied: true, visibility });
  }

  const safety = await client.query(
    `SELECT (
       EXISTS (
         SELECT 1
           FROM support_cases AS support_case
          WHERE support_case.status NOT IN ('resolved', 'closed')
            AND support_case.safety_flag
            AND (
              support_case.linked_booking_id = $1
              OR support_case.linked_listing_id = $2
            )
       )
       OR EXISTS (
         SELECT 1
           FROM user_suspensions AS suspension
          WHERE suspension.user_id = ANY($3::text[])
            AND suspension.scope = 'account'
            AND suspension.lifted_at IS NULL
            AND suspension.starts_at <= now()
            AND (suspension.ends_at IS NULL OR suspension.ends_at > now())
       )
     ) AS held`,
    [bookingId, row.listing_id, [row.owner_id, row.renter_id]],
  );
  const safetyHold = safety.rows[0]?.held === true;
  const visibility = Number(row.workflow_version) === 1
    ? evaluateBookingAddressReveal({
        ownerId: row.owner_id,
        renterId: row.renter_id,
        workflowStatus: row.workflow_status,
        rentalStartDate: row.rental_start_date_text,
        rentalEndDate: row.rental_end_date_text,
        rentalTimezone: row.rental_timezone,
        flowTimePayload: row.payload,
        segment,
        safetyHold,
        exactAddress: row.location_text,
        now,
      })
    : Object.freeze({
        version: bookingAddressRevealVersion,
        segment,
        result: 'hidden',
        reason: 'booking_state_ineligible',
        exactAddressReturned: false,
      });
  const action = visibility.result === 'revealed'
    ? 'booking.exact_address_revealed'
    : 'booking.exact_address_access_hidden';
  await writeAudit(client, {
    actor,
    action,
    bookingId,
    requestId,
    metadata: bookingAddressAuditMetadata({
      visibility,
      workflowStatus: row.workflow_status,
      safetyHold,
    }),
  });
  return Object.freeze({ denied: false, visibility });
}
