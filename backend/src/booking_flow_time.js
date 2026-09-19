import crypto from 'node:crypto';

import {
  bookingLocalDate,
  evaluateBookingAddressReveal,
} from './booking_address_reveal_domain.js';
import { resolveZonedCalendarInstant } from './return_calendar_policy.js';

const allowedWorkflowStatuses = Object.freeze([
  'accepted',
  'payment_pending',
  'confirmed',
  'active',
  'running',
  'returned',
  'completed',
  'withdrawalReturnRequired',
]);

export class BookingFlowTimeError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function safeText(value, maxLength = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= maxLength ? text : '';
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((entry) => stableJson(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

function requestFingerprint(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stableJson(value ?? null)))
    .digest('hex');
}

function prefixForSegment(segment) {
  if (segment === 'pickup') return 'handover';
  if (segment === 'return') return 'return';
  throw new BookingFlowTimeError(400, 'invalid_flow_time_segment');
}

function assertParticipant({ actorId, ownerId, renterId }) {
  if (actorId !== ownerId && actorId !== renterId) {
    throw new BookingFlowTimeError(403, 'booking_flow_time_forbidden');
  }
}

function assertWorkflowStatus(status) {
  if (!allowedWorkflowStatuses.includes(status)) {
    throw new BookingFlowTimeError(409, 'booking_flow_time_unavailable', { status });
  }
}

export function normalizeBookingFlowTimeState(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  return {
    handoverTimeRequested: safeText(source.handoverTimeRequested, 120),
    returnTimeRequested: safeText(source.returnTimeRequested, 120),
    handoverTimeIso: safeText(source.handoverTimeIso, 80),
    returnTimeIso: safeText(source.returnTimeIso, 80),
    handoverTimeRequestedByUserId: safeText(source.handoverTimeRequestedByUserId, 120),
    returnTimeRequestedByUserId: safeText(source.returnTimeRequestedByUserId, 120),
    handoverTimeConfirmed: source.handoverTimeConfirmed === true,
    returnTimeConfirmed: source.returnTimeConfirmed === true,
    handoverTimeConfirmedByUserId: safeText(source.handoverTimeConfirmedByUserId, 120),
    returnTimeConfirmedByUserId: safeText(source.returnTimeConfirmedByUserId, 120),
    handoverTimeConfirmedAt: safeText(source.handoverTimeConfirmedAt, 80),
    returnTimeConfirmedAt: safeText(source.returnTimeConfirmedAt, 80),
    handoverActive: source.handoverActive === true,
    returnActive: source.returnActive === true,
    handoverPhotos: Number.isSafeInteger(Number(source.handoverPhotos))
      ? Number(source.handoverPhotos) : 0,
    returnPhotos: Number.isSafeInteger(Number(source.returnPhotos))
      ? Number(source.returnPhotos) : 0,
    pickupPresenterPhotos: Number.isSafeInteger(Number(source.pickupPresenterPhotos))
      ? Number(source.pickupPresenterPhotos) : 0,
    pickupDeviationPhotos: Number.isSafeInteger(Number(source.pickupDeviationPhotos))
      ? Number(source.pickupDeviationPhotos) : 0,
    returnPresenterPhotos: Number.isSafeInteger(Number(source.returnPresenterPhotos))
      ? Number(source.returnPresenterPhotos) : 0,
    returnDeviationPhotos: Number.isSafeInteger(Number(source.returnDeviationPhotos))
      ? Number(source.returnDeviationPhotos) : 0,
    pickupPresenterNonCameraUsed: source.pickupPresenterNonCameraUsed === true,
    returnPresenterNonCameraUsed: source.returnPresenterNonCameraUsed === true,
    handoverLocation: source.handoverLocation && typeof source.handoverLocation === 'object'
      ? source.handoverLocation : null,
    returnLocation: source.returnLocation && typeof source.returnLocation === 'object'
      ? source.returnLocation : null,
    returnLocationReusePromptDismissed: source.returnLocationReusePromptDismissed === true,
    handoverLocationLat: safeText(source.handoverLocationLat, 64),
    handoverLocationLng: safeText(source.handoverLocationLng, 64),
    handoverLocationLabel: safeText(source.handoverLocationLabel, 240),
    handoverLocationMapsUrl: safeText(source.handoverLocationMapsUrl, 500),
    handoverLocationSharedByUserId: safeText(source.handoverLocationSharedByUserId, 120),
    handoverLocationSharedByName: safeText(source.handoverLocationSharedByName, 160),
    handoverLocationSharedByRole: safeText(source.handoverLocationSharedByRole, 32),
    handoverLocationAcceptedAs: safeText(source.handoverLocationAcceptedAs, 32),
    returnLocationLat: safeText(source.returnLocationLat, 64),
    returnLocationLng: safeText(source.returnLocationLng, 64),
    returnLocationLabel: safeText(source.returnLocationLabel, 240),
    returnLocationMapsUrl: safeText(source.returnLocationMapsUrl, 500),
    returnLocationSharedByUserId: safeText(source.returnLocationSharedByUserId, 120),
    returnLocationSharedByName: safeText(source.returnLocationSharedByName, 160),
    returnLocationSharedByRole: safeText(source.returnLocationSharedByRole, 32),
    returnLocationAcceptedAs: safeText(source.returnLocationAcceptedAs, 32),
    pickupGalleryUsed: source.pickupGalleryUsed === true,
    returnGalleryUsed: source.returnGalleryUsed === true,
    pickupCounterpartyConfirmation: source.pickupCounterpartyConfirmation ?? null,
    returnCounterpartyConfirmation: source.returnCounterpartyConfirmation ?? null,
    flowStateRevision: Number.isSafeInteger(Number(source.flowStateRevision))
      ? Number(source.flowStateRevision) : 0,
    flowTimeRevision: Number.isSafeInteger(Number(source.flowTimeRevision))
      ? Number(source.flowTimeRevision)
      : 0,
  };
}

export function bookingFlowTimeSystemMessage({
  action,
  segment,
  state,
  changed = false,
}) {
  const prefix = prefixForSegment(segment);
  const label = safeText(state?.[`${prefix}TimeRequested`], 120);
  if (!label) throw new BookingFlowTimeError(409, 'flow_time_proposal_missing');
  const flowLabel = segment === 'return' ? 'Rückgabezeit' : 'Übergabezeit';
  const icon = segment === 'return' ? '🔄' : '📦';
  if (action === 'propose') {
    return `${icon} ${flowLabel} ${changed ? 'geändert' : 'angefragt'}: ${label} Uhr`;
  }
  if (action === 'confirm') {
    return `${icon} ${flowLabel} bestätigt: ${label} Uhr`;
  }
  throw new BookingFlowTimeError(400, 'invalid_flow_time_action');
}

export function normalizeBookingFlowTimeProposal({
  raw,
  rentalStartDate,
  rentalEndDate,
  rentalTimezone = 'Europe/Berlin',
}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (safeText(input.action, 32) !== 'propose') return input;
  const hasLocalDate = Object.hasOwn(input, 'localDate');
  const hasLocalTime = Object.hasOwn(input, 'localTime');
  if (!hasLocalDate && !hasLocalTime) return input;
  const segment = safeText(input.segment, 16);
  prefixForSegment(segment);
  const localDate = safeText(input.localDate, 10);
  const localTime = safeText(input.localTime, 5);
  const expectedDate = segment === 'pickup' ? rentalStartDate : rentalEndDate;
  if (localDate !== expectedDate || !/^\d{4}-\d{2}-\d{2}$/u.test(localDate)
      || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(localTime)) {
    throw new BookingFlowTimeError(400, 'flow_time_outside_booking_date');
  }
  let instant;
  try {
    instant = resolveZonedCalendarInstant({
      date: localDate,
      time: localTime,
      timezone: rentalTimezone,
    });
  } catch {
    throw new BookingFlowTimeError(400, 'invalid_flow_time_proposal');
  }
  if (bookingLocalDate(instant, rentalTimezone) !== expectedDate) {
    throw new BookingFlowTimeError(400, 'flow_time_outside_booking_date');
  }
  const dateProbe = new Date(`${localDate}T00:00:00.000Z`);
  const weekdays = Object.freeze([
    'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag',
  ]);
  return {
    ...input,
    label: `${weekdays[dateProbe.getUTCDay()]}, ${localTime}`,
    timeIso: instant.toISOString(),
  };
}

export function applyBookingFlowTimeAction({
  payload,
  actorId,
  ownerId,
  renterId,
  workflowStatus,
  rentalStartDate,
  rentalEndDate,
  rentalTimezone = 'Europe/Berlin',
  raw,
  now = new Date(),
}) {
  assertParticipant({ actorId, ownerId, renterId });
  assertWorkflowStatus(workflowStatus);
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const action = safeText(input.action, 32);
  const segment = safeText(input.segment, 16);
  const prefix = prefixForSegment(segment);
  const state = normalizeBookingFlowTimeState(payload);
  const previousRequested = safeText(state[`${prefix}TimeRequested`], 120);
  const expectedRevision = Number(input.expectedRevision);
  const revisionKey = action === 'propose' || action === 'confirm'
    ? 'flowTimeRevision'
    : 'flowStateRevision';
  if (Object.hasOwn(input, 'expectedRevision')
      && (!Number.isSafeInteger(expectedRevision) || expectedRevision !== state[revisionKey])) {
    throw new BookingFlowTimeError(409, 'flow_time_revision_stale', {
      expectedRevision: Number.isSafeInteger(expectedRevision) ? expectedRevision : null,
      actualRevision: state[revisionKey],
      revisionKey,
    });
  }

  if (action === 'propose') {
    const label = safeText(input.label, 120);
    const timeIso = safeText(input.timeIso, 80);
    const parsed = Date.parse(timeIso);
    if (!label || !Number.isFinite(parsed)) {
      throw new BookingFlowTimeError(400, 'invalid_flow_time_proposal');
    }
    const expectedDate = segment === 'pickup' ? rentalStartDate : rentalEndDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate ?? '')
        || bookingLocalDate(new Date(parsed), rentalTimezone) !== expectedDate) {
      throw new BookingFlowTimeError(400, 'flow_time_outside_booking_date');
    }
    state[`${prefix}TimeRequested`] = label;
    state[`${prefix}TimeIso`] = new Date(parsed).toISOString();
    state[`${prefix}TimeRequestedByUserId`] = actorId;
    state[`${prefix}TimeConfirmed`] = false;
    state[`${prefix}TimeConfirmedByUserId`] = '';
    state[`${prefix}TimeConfirmedAt`] = '';
  } else if (action === 'confirm') {
    const requested = safeText(state[`${prefix}TimeRequested`], 120);
    const requestedBy = safeText(state[`${prefix}TimeRequestedByUserId`], 120);
    if (!requested || !requestedBy) {
      throw new BookingFlowTimeError(409, 'flow_time_proposal_missing');
    }
    if (requestedBy === actorId) {
      throw new BookingFlowTimeError(409, 'flow_time_counterparty_confirmation_required');
    }
    state[`${prefix}TimeConfirmed`] = true;
    state[`${prefix}TimeConfirmedByUserId`] = actorId;
    state[`${prefix}TimeConfirmedAt`] = now.toISOString();
  } else if (action === 'start' || action === 'clear') {
    const activeKey = `${prefix}Active`;
    const active = state[activeKey] === true;
    const starting = action === 'start';
    const ownerStartsPickup = segment === 'pickup' && actorId === ownerId;
    const renterStartsReturn = segment === 'return' && actorId === renterId;
    if (starting && !(ownerStartsPickup || renterStartsReturn)) {
      throw new BookingFlowTimeError(403, 'flow_state_role_forbidden');
    }
    if (!starting) {
      const counterpartyClearsPickup = segment === 'pickup' && actorId === renterId;
      const ownerClearsReturn = segment === 'return' && actorId === ownerId;
      if (!(counterpartyClearsPickup || ownerClearsReturn)) {
        throw new BookingFlowTimeError(403, 'flow_state_clear_role_forbidden');
      }
    }
    if (starting && active) {
      throw new BookingFlowTimeError(409, 'flow_state_already_active');
    }
    if (!starting && !active) {
      throw new BookingFlowTimeError(409, 'flow_state_not_active');
    }
    if (starting && state[`${prefix}TimeConfirmed`] !== true) {
      throw new BookingFlowTimeError(409, 'flow_state_time_unconfirmed');
    }
    if (starting && payload?.needsReview === true) {
      throw new BookingFlowTimeError(409, 'flow_state_needs_review');
    }
    const expectedStatuses = segment === 'pickup' ? ['accepted'] : ['active', 'running'];
    if (starting && !expectedStatuses.includes(workflowStatus)) {
      throw new BookingFlowTimeError(409, 'flow_state_wrong_booking_status', {
        status: workflowStatus,
      });
    }
    state[activeKey] = starting;
  } else if (action === 'set_location') {
    const location = input.serverLocation;
    if (!location || typeof location !== 'object') {
      throw new BookingFlowTimeError(400, 'flow_location_message_required');
    }
    const locationKey = segment === 'return' ? 'returnLocation' : 'handoverLocation';
    state[locationKey] = {
      ...location,
      acceptedAs: locationKey,
      sharedByUserId: safeText(location.sharedByUserId, 120),
    };
    const locationPrefix = segment === 'return' ? 'return' : 'handover';
    state[`${locationPrefix}LocationLat`] = safeText(location.latitude, 64);
    state[`${locationPrefix}LocationLng`] = safeText(location.longitude, 64);
    state[`${locationPrefix}LocationLabel`] = safeText(location.label, 240);
    state[`${locationPrefix}LocationMapsUrl`] = safeText(location.mapsUrl, 500);
    state[`${locationPrefix}LocationSharedByUserId`] =
      safeText(location.sharedByUserId, 120);
    state[`${locationPrefix}LocationSharedByName`] =
      safeText(location.sharedByName, 160);
    state[`${locationPrefix}LocationSharedByRole`] =
      location.sharedByUserId === ownerId ? 'owner' : 'renter';
    state[`${locationPrefix}LocationAcceptedAs`] = locationKey;
    if (segment === 'return') state.returnLocationReusePromptDismissed = false;
  } else if (action === 'copy_location') {
    if (!state.handoverLocation) {
      throw new BookingFlowTimeError(409, 'flow_location_missing');
    }
    state.returnLocation = {
      ...state.handoverLocation,
      acceptedAs: 'returnLocation',
    };
    for (const suffix of [
      'Lat', 'Lng', 'Label', 'MapsUrl', 'SharedByUserId', 'SharedByName', 'SharedByRole',
    ]) {
      state[`returnLocation${suffix}`] = state[`handoverLocation${suffix}`] ?? '';
    }
    state.returnLocationAcceptedAs = 'returnLocation';
    state.returnLocationReusePromptDismissed = false;
  } else if (action === 'dismiss_location') {
    state.returnLocationReusePromptDismissed = true;
  } else {
    throw new BookingFlowTimeError(400, 'invalid_flow_time_action');
  }

  if (action === 'propose' || action === 'confirm') {
    state.flowTimeRevision += 1;
  } else {
    state.flowStateRevision += 1;
  }
  const systemMessage = action === 'start'
    ? `${segment === 'return' ? '🔄 Rückgabe' : '📦 Übergabe'} gestartet`
    : action === 'clear'
      ? `${segment === 'return' ? '🔄 Rückgabe' : '📦 Übergabe'} beendet`
      : action === 'set_location'
        ? `${segment === 'return' ? '📍 Rückgabeort' : '📍 Übergabeort'} bestätigt`
        : action === 'copy_location'
          ? '📍 Rückgabeort wie Übergabe übernommen'
          : action === 'dismiss_location'
            ? '📍 Rückgabeort nicht übernommen'
            : bookingFlowTimeSystemMessage({
              action,
              segment,
              state,
              changed: action === 'propose' && previousRequested.length > 0,
            });
  return {
    payload: { ...(payload ?? {}), ...state },
    state,
    eventType: `booking.flow_time.${action}`,
    eventMetadata: {
      segment,
      action,
      flowTimeRevision: state.flowTimeRevision,
      flowStateRevision: state.flowStateRevision,
    },
    systemMessage,
  };
}

async function lockedBooking(client, bookingId) {
  const result = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.workflow_status, booking.workflow_version, booking.listing_id,
            booking.rental_start_date::text AS rental_start_date_text,
            booking.rental_end_date::text AS rental_end_date_text,
            booking.rental_timezone, request.payload
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     WHERE booking.id = $1
     FOR UPDATE OF booking, request`,
    [bookingId],
  );
  if (!result.rowCount) throw new BookingFlowTimeError(404, 'booking_not_found');
  const row = result.rows[0];
  if (Number(row.workflow_version) !== 1) {
    throw new BookingFlowTimeError(409, 'booking_requires_b6_revalidation');
  }
  return row;
}

async function assertLocationRevealEligible(client, row, segment) {
  const safety = await client.query(
    `SELECT (
       EXISTS (
         SELECT 1 FROM support_cases AS support_case
          WHERE support_case.status NOT IN ('resolved', 'closed')
            AND support_case.safety_flag
            AND (support_case.linked_booking_id = $1 OR support_case.linked_listing_id = $2)
       ) OR EXISTS (
         SELECT 1 FROM user_suspensions AS suspension
          WHERE suspension.user_id = ANY($3::text[]) AND suspension.scope = 'account'
            AND suspension.lifted_at IS NULL AND suspension.starts_at <= now()
            AND (suspension.ends_at IS NULL OR suspension.ends_at > now())
       )
     ) AS held`,
    [row.id, row.listing_id, [row.owner_id, row.renter_id]],
  );
  const visibility = evaluateBookingAddressReveal({
    ownerId: row.owner_id,
    renterId: row.renter_id,
    workflowStatus: row.workflow_status,
    rentalStartDate: row.rental_start_date_text,
    rentalEndDate: row.rental_end_date_text,
    rentalTimezone: row.rental_timezone,
    flowTimePayload: row.payload,
    segment,
    safetyHold: safety.rows[0]?.held === true,
    exactAddress: 'server-authorized-location',
  });
  if (visibility.result !== 'revealed') {
    throw new BookingFlowTimeError(409, 'flow_location_reveal_unavailable', {
      reason: visibility.reason,
    });
  }
}

export async function getBookingFlowTime(client, { actorId, bookingId }) {
  const result = await client.query(
    `SELECT booking.owner_id, booking.renter_id, booking.workflow_status,
            booking.workflow_version, request.payload
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     WHERE booking.id = $1`,
    [bookingId],
  );
  if (!result.rowCount) throw new BookingFlowTimeError(404, 'booking_not_found');
  const row = result.rows[0];
  assertParticipant({ actorId, ownerId: row.owner_id, renterId: row.renter_id });
  if (Number(row.workflow_version) !== 1) {
    throw new BookingFlowTimeError(409, 'booking_requires_b6_revalidation');
  }
  assertWorkflowStatus(row.workflow_status);
  const state = normalizeBookingFlowTimeState(row.payload);
  const evidence = await client.query(
    `SELECT segment, evidence_kind, count(*)::integer AS count,
            bool_or(source <> 'camera') AS non_camera_used
       FROM booking_condition_evidence
      WHERE booking_id = $1
      GROUP BY segment, evidence_kind`,
    [bookingId],
  );
  for (const entry of evidence.rows) {
    const prefix = entry.segment === 'return' ? 'return' : 'pickup';
    if (entry.evidence_kind === 'presenter_photo') {
      state[`${prefix}PresenterPhotos`] = Number(entry.count);
      state[`${prefix}PresenterNonCameraUsed`] = entry.non_camera_used === true;
      state[`${prefix}GalleryUsed`] = entry.non_camera_used === true;
      state[prefix === 'pickup' ? 'handoverPhotos' : 'returnPhotos'] = Number(entry.count);
    } else if (entry.evidence_kind === 'counterparty_deviation') {
      state[`${prefix}DeviationPhotos`] = Number(entry.count);
    }
  }
  const confirmations = await client.query(
    `SELECT segment, verifier_role, verifier_user_id, decision,
            presenter_photo_count, deviation_photo_count, created_at
       FROM booking_condition_confirmations
      WHERE booking_id = $1`,
    [bookingId],
  );
  for (const entry of confirmations.rows) {
    const prefix = entry.segment === 'return' ? 'return' : 'pickup';
    state[`${prefix}CounterpartyConfirmation`] = {
      verifierRole: entry.verifier_role,
      verifierUserId: entry.verifier_user_id,
      decision: entry.decision,
      presenterPhotoCount: Number(entry.presenter_photo_count),
      deviationPhotoCount: Number(entry.deviation_photo_count),
      createdAt: new Date(entry.created_at).toISOString(),
    };
  }
  state.galleryUsed = {
    pickup: state.pickupGalleryUsed === true,
    return: state.returnGalleryUsed === true,
  };
  state.confirmations = {
    pickup: state.pickupCounterpartyConfirmation,
    return: state.returnCounterpartyConfirmation,
  };
  return state;
}

export async function updateBookingFlowTime(client, {
  actor,
  bookingId,
  raw,
  idempotencyKey,
}) {
  const eventKey = safeText(idempotencyKey, 160);
  if (!eventKey || !/^[A-Za-z0-9_.:-]{8,160}$/.test(eventKey)) {
    throw new BookingFlowTimeError(400, 'invalid_idempotency_key');
  }
  const row = await lockedBooking(client, bookingId);
  assertParticipant({ actorId: actor.id, ownerId: row.owner_id, renterId: row.renter_id });

  const existingEvent = await client.query(
    'SELECT booking_id, actor_id, metadata FROM booking_events WHERE idempotency_key = $1',
    [eventKey],
  );
  if (existingEvent.rowCount) {
    const event = existingEvent.rows[0];
    if (event.booking_id !== bookingId || event.actor_id !== actor.id) {
      throw new BookingFlowTimeError(409, 'idempotency_key_reused');
    }
    const incomingFingerprint = requestFingerprint(raw);
    if (event.metadata?.requestFingerprint
        && event.metadata.requestFingerprint !== incomingFingerprint) {
      throw new BookingFlowTimeError(409, 'idempotency_key_conflict');
    }
    return {
      state: normalizeBookingFlowTimeState(event.metadata?.stateAfter ?? row.payload),
      replayed: true,
      participantUserIds: [row.owner_id, row.renter_id],
    };
  }

  const threadResult = await client.query(
    `SELECT id
     FROM message_threads
     WHERE booking_id = $1 OR request_id = $1
     ORDER BY CASE WHEN booking_id = $1 THEN 0 ELSE 1 END
     LIMIT 1
     FOR UPDATE`,
    [bookingId],
  );
  if (!threadResult.rowCount) {
    throw new BookingFlowTimeError(409, 'booking_chat_unavailable');
  }

  let actionRaw = raw;
  if (safeText(raw?.action, 32) === 'set_location') {
    const sourceMessageId = safeText(raw?.sourceMessageId, 160);
    if (!sourceMessageId) {
      throw new BookingFlowTimeError(400, 'flow_location_message_required');
    }
    const source = await client.query(
      `SELECT message.sender_id, message.body
         FROM messages AS message
         JOIN message_threads AS thread ON thread.id = message.thread_id
        WHERE message.id = $1
          AND (thread.booking_id = $2 OR thread.request_id = $2)
        FOR SHARE`,
      [sourceMessageId, bookingId],
    );
    if (!source.rowCount || ![row.owner_id, row.renter_id].includes(source.rows[0].sender_id)
        || source.rows[0].sender_id === 'system') {
      throw new BookingFlowTimeError(403, 'flow_location_message_forbidden');
    }
    await assertLocationRevealEligible(client, row, safeText(raw?.segment, 16));
    const marker = String(source.rows[0].body ?? '').indexOf('LOCATION_SHARE|');
    if (marker < 0) throw new BookingFlowTimeError(400, 'flow_location_message_invalid');
    const parts = String(source.rows[0].body ?? '').slice(marker).split('|');
    if (parts.length !== 8 || parts[0] !== 'LOCATION_SHARE') {
      throw new BookingFlowTimeError(400, 'flow_location_message_invalid');
    }
    const sourceSenderId = source.rows[0].sender_id;
    const latitude = Number(parts[2]);
    const longitude = Number(parts[3]);
    const mapsUrl = safeText(parts[4], 500);
    const shareKind = safeText(parts[5], 32).toLowerCase();
    const addressText = safeText(parts[6], 500);
    const hasLatitude = safeText(parts[2], 64).length > 0;
    const hasLongitude = safeText(parts[3], 64).length > 0;
    const hasCoordinates = hasLatitude && hasLongitude;
    const validCoordinates = hasCoordinates
      && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    const addressOnly = !hasLatitude && !hasLongitude && shareKind === 'address'
      && addressText.length > 0;
    if ((!validCoordinates && !addressOnly)
        || (hasLatitude !== hasLongitude)
        || !/^https:\/\//iu.test(mapsUrl)
        || !['address', 'location'].includes(shareKind)) {
      throw new BookingFlowTimeError(400, 'flow_location_message_invalid');
    }
    actionRaw = {
      ...(raw ?? {}),
      serverLocation: {
        label: safeText(parts[1], 240),
        latitude: hasCoordinates ? String(latitude) : '',
        longitude: hasCoordinates ? String(longitude) : '',
        mapsUrl,
        shareKind,
        addressText,
        sharedByName: safeText(parts[7], 160),
        sharedByUserId: sourceSenderId,
        sourceMessageId,
      },
    };
  }
  const normalizedRaw = normalizeBookingFlowTimeProposal({
    raw: actionRaw,
    rentalStartDate: row.rental_start_date_text,
    rentalEndDate: row.rental_end_date_text,
    rentalTimezone: row.rental_timezone,
  });
  const applied = applyBookingFlowTimeAction({
    payload: row.payload,
    actorId: actor.id,
    ownerId: row.owner_id,
    renterId: row.renter_id,
    workflowStatus: row.workflow_status,
    rentalStartDate: row.rental_start_date_text,
    rentalEndDate: row.rental_end_date_text,
    rentalTimezone: row.rental_timezone,
    raw: normalizedRaw,
  });
  applied.eventMetadata.requestFingerprint = requestFingerprint(raw);
  applied.eventMetadata.stateAfter = applied.state;
  await client.query(
    'UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1',
    [bookingId, JSON.stringify(applied.payload)],
  );
  await client.query(
    `INSERT INTO booking_events (
       booking_id, actor_id, event_type, idempotency_key, metadata
     ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [bookingId, actor.id, applied.eventType, eventKey, JSON.stringify(applied.eventMetadata)],
  );
  const messageId = `message_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO messages (
       id, thread_id, sender_id, sender_type, body, is_read,
       client_message_id, message_version, created_at
     ) VALUES ($1, $2, NULL, 'system', $3, true, $4, 1, now())`,
    [
      messageId,
      threadResult.rows[0].id,
      applied.systemMessage,
      `system:flow-time:${eventKey}`,
    ],
  );
  await client.query(
    'UPDATE message_threads SET last_message_at = now() WHERE id = $1',
    [threadResult.rows[0].id],
  );
  return {
    state: applied.state,
    replayed: false,
    participantUserIds: [row.owner_id, row.renter_id],
  };
}
