import crypto from 'node:crypto';

import {
  actorRoleForBooking,
  canTransitionWorkflow,
  datePart,
  legacyStatusForWorkflow,
  normalizeBookingWorkflowStatus,
  normalizeCurrency,
  parseBookingPeriod,
  parseRentalDates,
  quoteRental,
  workflowStatusForLegacy,
} from './booking_domain.js';
import { enqueueBookingNotifications } from './notifications.js';
import { releaseMetadata } from './release.js';
import {
  evaluateCancellation,
} from './private_pilot_return_domain.js';
import { v51CancellationAmounts } from './v51_termination_domain.js';
import { settleV51WithdrawalRefundAtReturn } from './v51_withdrawal_workflow.js';
import { openV52ActualLossCase } from './v52_actual_loss_workflow.js';
import { hasVerifiedBookingConfirmation } from './booking_confirmation_workflow.js';
import { postgresDateText } from './postgres_date.js';
import { shapePublicListing } from './listing_catalog.js';
import {
  assertPrivatePilotAccountState,
  assertPrivatePilotBooking,
  assertPrivatePilotOwnerAcceptance,
  assertPrivatePilotStoredListing,
  privatePilotCheckoutDocument,
  privatePilotDeclarations,
  privatePilotDocument,
  privatePilotRequiredCheckoutDeclarations,
  PrivatePilotValidationError,
} from './private_pilot_domain.js';
import {
  persistV52PlatformContract,
  V52ContractWorkflowError,
} from './v52_contract_workflow.js';
import {
  v51DisabledTransportCode,
  v51ZeroTransportQuote,
} from './v51_transport_domain.js';

const blockingWorkflowStatuses = Object.freeze([
  'accepted',
  'payment_pending',
  'confirmed',
  'active',
  'withdrawalReturnRequired',
  'returned',
]);

export class BookingWorkflowError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code = 'invalid_booking_payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookingWorkflowError(400, code);
  }
  return { ...value };
}

function text(value, max = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function bookingIdentifier(value) {
  const candidate = text(value, 120);
  return candidate && /^[A-Za-z0-9_.:-]+$/.test(candidate)
    ? candidate
    : `booking_${crypto.randomUUID()}`;
}

function idempotencyKey(value) {
  const candidate = text(value, 160);
  if (!candidate || !/^[A-Za-z0-9_.:-]{8,160}$/.test(candidate)) {
    throw new BookingWorkflowError(400, 'invalid_idempotency_key');
  }
  return candidate;
}

function requiredPrivatePilotOwnerAcceptance(candidate) {
  try {
    return assertPrivatePilotOwnerAcceptance(candidate);
  } catch (error) {
    if (error instanceof PrivatePilotValidationError) {
      throw new BookingWorkflowError(400, error.code);
    }
    throw error;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hashCommand(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function workflowStatus(value) {
  if (typeof value !== 'string') return null;
  if (['pending', 'running'].includes(value)) return workflowStatusForLegacy(value);
  if (value === 'paid' || value === 'paid_confirmed') return 'confirmed';
  if (value === 'handed_over') return 'active';
  const normalized = normalizeBookingWorkflowStatus(value, null);
  return normalized;
}

function rentalDatesFromCandidate(candidate, { maxDays = 365 } = {}) {
  const startDate = text(candidate.startDate, 10) || datePart(candidate.start);
  const endDate = text(candidate.endDate, 10) || datePart(candidate.end);
  const parsed = parseRentalDates(startDate, endDate, { maxDays });
  if (!parsed) throw new BookingWorkflowError(400, 'invalid_rental_dates');
  return parsed;
}

function money(value) {
  return Number(value) / 100;
}

function quoteSnapshotPayload(quote) {
  return {
    quotedQuoteVersion: quote.quoteVersion,
    quotedDays: quote.days,
    quotedPricePerDayMinor: quote.pricePerDayMinor,
    quotedBaseRentalMinor: quote.baseRentalMinor,
    quotedDiscountPercent: quote.discountPercent,
    quotedDiscountId: quote.discountId,
    quotedDiscountLabel: quote.discountLabel,
    quotedDiscountFundingSource: quote.discountFundingSource,
    quotedDiscountThresholdDays: quote.discountThresholdDays,
    quotedDiscountMinor: quote.discountMinor,
    quotedRentalSubtotalMinor: quote.rentalSubtotalMinor,
    quotedPlatformFeeMinor: quote.platformFeeMinor,
    quotedTotalMinor: quote.totalMinor,
    quotedOwnerPayoutMinor: quote.ownerPayoutMinor,
    quotedCurrency: quote.currency,
  };
}

function databaseDate(value) {
  return postgresDateText(value);
}

function bookingPayload(row, viewerUserId = null) {
  const stored = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? { ...row.payload }
    : {};
  if (viewerUserId && viewerUserId !== row.renter_id) {
    delete stored.platformContract;
  }
  const breakdown = row.quote_breakdown && typeof row.quote_breakdown === 'object'
    ? row.quote_breakdown
    : {};
  return {
    ...stored,
    id: row.id,
    itemId: row.listing_id,
    ownerId: row.owner_id,
    renterId: row.renter_id,
    status: row.status,
    workflowStatus: row.workflow_status,
    workflowVersion: Number(row.workflow_version),
    workflowRevision: Number(row.workflow_revision),
    simulationOnly: row.simulation_only === true,
    startDate: databaseDate(row.rental_start_date),
    endDate: databaseDate(row.rental_end_date),
    timezone: row.rental_timezone,
    start: new Date(row.starts_at).toISOString(),
    end: new Date(row.ends_at).toISOString(),
    holdExpiresAt: row.hold_expires_at ? new Date(row.hold_expires_at).toISOString() : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    quotedTotalRenter: money(row.quoted_total_minor),
    quote: {
      ...breakdown,
      quoteVersion: Number(row.quote_version),
      currency: row.currency,
      days: Number(row.quoted_days),
      pricePerDayMinor: Number(row.price_per_day_minor),
      baseRentalMinor: Number(row.base_rental_minor),
      discountMinor: Number(row.discount_minor),
      rentalSubtotalMinor: Number(row.rental_subtotal_minor),
      platformFeeMinor: Number(row.platform_fee_minor),
      deliveryFeeMinor: Number(row.delivery_fee_minor),
      pickupFeeMinor: Number(row.pickup_fee_minor),
      expressFeeMinor: Number(row.express_fee_minor),
      totalMinor: Number(row.quoted_total_minor),
      ownerPayoutMinor: Number(row.owner_payout_minor),
      securityDepositMinor: 0,
    },
    // A participant must be able to render the durable booking record after
    // the listing leaves the public catalog. Keep this snapshot limited to
    // public listing fields, strip media defensively, and bind current status
    // plus revision from relational columns instead of trusting JSON payload.
    listingSnapshot: {
      ...shapePublicListing({
        ...(row.listing_payload ?? {}),
        photos: [],
      }),
      id: row.listing_id,
      ownerId: row.owner_id,
      status: row.listing_status,
      isActive: row.listing_is_active === true,
      catalogRevision: Number(row.listing_catalog_revision),
    },
  };
}

const bookingProjection = `
  request.payload,
  booking.id, booking.listing_id, booking.owner_id, booking.renter_id,
  booking.status, booking.workflow_status, booking.workflow_version,
  booking.workflow_revision, booking.rental_start_date, booking.rental_end_date,
  booking.rental_timezone, booking.starts_at, booking.ends_at, booking.currency,
  booking.quoted_total_minor, booking.security_deposit_minor, booking.quoted_days,
  booking.price_per_day_minor, booking.base_rental_minor, booking.discount_minor,
  booking.rental_subtotal_minor, booking.platform_fee_minor,
  booking.delivery_fee_minor, booking.pickup_fee_minor, booking.express_fee_minor,
  booking.owner_payout_minor, booking.quote_version, booking.quote_breakdown,
  booking.hold_expires_at, booking.created_at, booking.updated_at
  , booking.accepted_at, booking.simulation_only
  , listing.payload AS listing_payload, listing.status AS listing_status
  , listing.is_active AS listing_is_active
  , listing.catalog_revision AS listing_catalog_revision
`;

async function writeAudit(client, {
  actor = null,
  action,
  resourceType = 'booking',
  resourceId,
  bookingId,
  metadata = {},
}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor?.id ?? null, actor?.role ?? 'system', action, resourceType, resourceId ?? bookingId, JSON.stringify(metadata)],
  );
}

async function periodInstants(client, dates, timezone) {
  const validTimezone = await client.query(
    'SELECT name FROM pg_timezone_names WHERE name = $1 LIMIT 1',
    [timezone],
  );
  if (!validTimezone.rowCount) throw new BookingWorkflowError(400, 'invalid_availability_timezone');
  const result = await client.query(
    `SELECT
       ($1::date::timestamp AT TIME ZONE $3) AS starts_at,
       ($2::date::timestamp AT TIME ZONE $3) AS ends_at`,
    [dates.startDate, dates.endDate, timezone],
  );
  return result.rows[0];
}

async function listingForBooking(client, listingId, { lock = false, includeInactive = false } = {}) {
  const result = await client.query(
    `SELECT listing.id, listing.owner_id, listing.payload, listing.status,
            listing.is_active, listing.catalog_version, listing.catalog_revision,
            listing.currency, listing.price_per_day_minor,
            listing.security_deposit_minor, listing.min_days, listing.max_days,
            listing.latitude, listing.longitude, listing.availability_timezone,
            listing.availability_revision, listing.booking_notice_hours,
            listing.acceptance_window_minutes, listing.category_id,
            listing.subcategory, listing.city, listing.country,
            listing.private_status_confirmed_at,
            listing.private_pilot_region_code,
            owner.private_use_confirmed_at AS owner_private_use_confirmed_at,
            owner.private_marketplace_review_status AS owner_private_marketplace_review_status
       FROM listings AS listing
       JOIN users AS owner ON owner.id = listing.owner_id
      WHERE listing.id = $1
        AND listing.catalog_version = 1
        AND listing.moderation_status = 'active'
        ${includeInactive ? '' : "AND listing.is_active = true AND listing.status = 'active'"}
      ${lock ? 'FOR UPDATE OF listing, owner' : ''}`,
    [listingId],
  );
  if (!result.rowCount) throw new BookingWorkflowError(404, 'listing_not_found');
  return result.rows[0];
}

async function assertPrivatePilotBookingEligibility(client, {
  actorId,
  listing,
  allowedRegions = [],
}) {
  try {
    assertPrivatePilotStoredListing({
      categoryId: listing.category_id,
      subcategory: listing.subcategory,
      city: listing.city,
      country: listing.country,
      privateStatusConfirmedAt: listing.private_status_confirmed_at,
      pilotRegionCode: listing.private_pilot_region_code,
      ownerPrivateUseConfirmedAt: listing.owner_private_use_confirmed_at,
      ownerPrivateMarketplaceReviewStatus: listing.owner_private_marketplace_review_status,
    }, { allowedRegions });
  } catch (error) {
    if (error instanceof PrivatePilotValidationError) {
      throw new BookingWorkflowError(409, error.code);
    }
    throw error;
  }
  const renter = await client.query(
    `SELECT private_use_confirmed_at, private_marketplace_review_status
       FROM users
      WHERE id = $1 AND deactivated_at IS NULL AND account_status = 'active'
      FOR UPDATE`,
    [actorId],
  );
  if (!renter.rowCount) throw new BookingWorkflowError(404, 'user_not_found');
  try {
    assertPrivatePilotAccountState({
      privateUseConfirmedAt: renter.rows[0].private_use_confirmed_at,
      privateMarketplaceReviewStatus: renter.rows[0].private_marketplace_review_status,
    });
  } catch (error) {
    if (error instanceof PrivatePilotValidationError) {
      throw new BookingWorkflowError(409, error.code);
    }
    throw error;
  }
}

async function assertNewBookingAllowed(client, renterId, ownerId) {
  const block = await client.query(
    `SELECT 1 FROM user_blocks
     WHERE unblocked_at IS NULL
       AND ((blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1))
     LIMIT 1`,
    [renterId, ownerId],
  );
  if (block.rowCount) throw new BookingWorkflowError(409, 'booking_blocked_by_user_block');
  const suspension = await client.query(
    `SELECT scope FROM user_suspensions
     WHERE lifted_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
       AND (
         (user_id = $1 AND scope IN ('account', 'booking'))
         OR (user_id = $2 AND scope IN ('account', 'booking', 'listing'))
       )
     LIMIT 1`,
    [renterId, ownerId],
  );
  if (suspension.rowCount) {
    throw new BookingWorkflowError(409, 'booking_blocked_by_moderation', { scope: suspension.rows[0].scope });
  }
}

function v51DisabledTransportQuote(candidate) {
  const disabledCode = v51DisabledTransportCode(candidate);
  if (disabledCode) throw new BookingWorkflowError(409, disabledCode);
  return v51ZeroTransportQuote();
}

function quoteForListing(candidate, dates, listing) {
  const payload = listing.payload && typeof listing.payload === 'object' ? listing.payload : {};
  const minimumDays = Math.max(1, Number(listing.min_days ?? payload.minDays ?? 1));
  const maximumDays = Math.min(365, Math.max(minimumDays, Number(listing.max_days ?? payload.maxDays ?? 365)));
  const extras = v51DisabledTransportQuote(candidate);
  const quote = quoteRental({
    days: dates.days,
    pricePerDayMinor: Number(listing.price_per_day_minor),
    securityDepositMinor: 0,
    minimumDays,
    maximumDays,
    autoApplyDiscounts: payload.autoApplyDiscounts === true,
    discountTiers: payload.longRentalDiscounts,
    deliveryFeeMinor: extras.deliveryFeeMinor,
    pickupFeeMinor: extras.pickupFeeMinor,
    currency: listing.currency,
  });
  if (!quote) {
    throw new BookingWorkflowError(409, 'rental_duration_not_allowed', { minimumDays, maximumDays });
  }
  return quote;
}

function quoteBindingPayload({ actorId, listing, dates, period, quote }) {
  return {
    renterId: actorId,
    listingId: listing.id,
    startDate: dates.startDate,
    endDate: dates.endDate,
    timezone: listing.availability_timezone,
    start: new Date(period.starts_at).toISOString(),
    end: new Date(period.ends_at).toISOString(),
    catalogRevision: Number(listing.catalog_revision),
    availabilityRevision: Number(listing.availability_revision),
    quote,
  };
}

async function requireFreshBookingQuote(client, {
  actorId,
  candidate,
  listing,
  dates,
  period,
  quote,
}) {
  const quoteId = text(candidate.quoteId, 120);
  const quoteHash = text(candidate.quoteHash, 64);
  if (!quoteId || !quoteHash) {
    throw new BookingWorkflowError(409, 'fresh_booking_quote_required');
  }
  const result = await client.query(
    `SELECT renter_id, listing_id, rental_start_date, rental_end_date,
            rental_timezone, starts_at, ends_at, catalog_revision,
            availability_revision, quote_payload, quote_hash, issued_at, expires_at
       FROM booking_quotes
      WHERE id = $1 AND quote_hash = $2`,
    [quoteId, quoteHash],
  );
  if (!result.rowCount) {
    throw new BookingWorkflowError(409, 'booking_quote_not_found');
  }
  const stored = result.rows[0];
  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    throw new BookingWorkflowError(409, 'booking_quote_expired');
  }
  const currentBinding = quoteBindingPayload({
    actorId,
    listing,
    dates,
    period,
    quote,
  });
  const bindingMatches = stored.renter_id === actorId
    && stored.listing_id === listing.id
    && databaseDate(stored.rental_start_date) === dates.startDate
    && databaseDate(stored.rental_end_date) === dates.endDate
    && stored.rental_timezone === listing.availability_timezone
    && new Date(stored.starts_at).toISOString() === currentBinding.start
    && new Date(stored.ends_at).toISOString() === currentBinding.end
    && Number(stored.catalog_revision) === Number(listing.catalog_revision)
    && Number(stored.availability_revision) === Number(listing.availability_revision)
    && hashCommand(stored.quote_payload) === hashCommand(quote)
    && hashCommand(currentBinding) === quoteHash;
  if (!bindingMatches) {
    throw new BookingWorkflowError(409, 'booking_quote_changed');
  }
  return {
    quoteId,
    quoteHash,
    issuedAt: new Date(stored.issued_at).toISOString(),
    expiresAt: new Date(stored.expires_at).toISOString(),
  };
}

async function checkPeriodAvailability(client, { listing, dates, startsAt, endsAt, excludeBookingId = null }) {
  const startsAtTime = new Date(startsAt).getTime();
  const endsAtTime = new Date(endsAt).getTime();
  if (!Number.isFinite(startsAtTime) || !Number.isFinite(endsAtTime) || startsAtTime >= endsAtTime) {
    throw new BookingWorkflowError(500, 'invalid_availability_period');
  }
  const noticeHours = Number(listing.booking_notice_hours ?? 0);
  if (startsAtTime < Date.now() + noticeHours * 3_600_000) {
    throw new BookingWorkflowError(409, 'booking_notice_too_short', { noticeHours });
  }

  const block = await client.query(
    `SELECT id, kind
     FROM listing_availability_blocks
     WHERE listing_id = $1
       AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
     LIMIT 1`,
    [listing.id, startsAt, endsAt],
  );
  if (block.rowCount) throw new BookingWorkflowError(409, 'listing_period_blocked');

  const occupied = await client.query(
    `SELECT id
     FROM bookings
     WHERE listing_id = $1
       AND workflow_version = 1
       AND simulation_only = false
       AND workflow_status = ANY($4::text[])
       AND ($5::text IS NULL OR id <> $5)
       AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
     LIMIT 1`,
    [listing.id, startsAt, endsAt, blockingWorkflowStatuses, excludeBookingId],
  );
  if (occupied.rowCount) throw new BookingWorkflowError(409, 'booking_period_unavailable');

  const ruleCount = await client.query(
    'SELECT count(*)::int AS count FROM listing_availability_rules WHERE listing_id = $1',
    [listing.id],
  );
  if (ruleCount.rows[0].count > 0) {
    const invalidDays = await client.query(
      `WITH rental_days AS (
         SELECT day::date AS day
         FROM generate_series($2::date, $3::date - 1, interval '1 day') AS day
       )
       SELECT day
       FROM rental_days
       WHERE NOT EXISTS (
         SELECT 1
         FROM listing_availability_rules AS rule
         WHERE rule.listing_id = $1
           AND rule.weekday = extract(dow FROM rental_days.day)::smallint
           AND (rule.valid_from IS NULL OR rule.valid_from <= rental_days.day)
           AND (rule.valid_until IS NULL OR rule.valid_until >= rental_days.day)
           AND rule.is_available = true
       )
       OR EXISTS (
         SELECT 1
         FROM listing_availability_rules AS rule
         WHERE rule.listing_id = $1
           AND rule.weekday = extract(dow FROM rental_days.day)::smallint
           AND (rule.valid_from IS NULL OR rule.valid_from <= rental_days.day)
           AND (rule.valid_until IS NULL OR rule.valid_until >= rental_days.day)
           AND rule.is_available = false
       )
       LIMIT 1`,
      [listing.id, dates.startDate, dates.endDate],
    );
    if (invalidDays.rowCount) {
      throw new BookingWorkflowError(409, 'listing_day_unavailable', { date: databaseDate(invalidDays.rows[0].day) });
    }
  }
}

async function completeCommand(client, key, bookingId, response) {
  await client.query(
    `UPDATE booking_commands
     SET booking_id = $2, response_payload = $3::jsonb, completed_at = now()
     WHERE idempotency_key = $1`,
    [key, bookingId, JSON.stringify(response)],
  );
}

async function startCommand(client, { key, actorId, type, request }) {
  const requestHash = hashCommand(request);
  const inserted = await client.query(
    `INSERT INTO booking_commands (idempotency_key, actor_id, command_type, request_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [key, actorId, type, requestHash],
  );
  if (inserted.rowCount) return null;
  const existing = await client.query(
    `SELECT actor_id, command_type, request_hash, response_payload, completed_at
     FROM booking_commands WHERE idempotency_key = $1 FOR UPDATE`,
    [key],
  );
  const command = existing.rows[0];
  if (!command || command.actor_id !== actorId || command.command_type !== type || command.request_hash !== requestHash) {
    throw new BookingWorkflowError(409, 'idempotency_key_reused');
  }
  if (!command.completed_at || !command.response_payload) {
    throw new BookingWorkflowError(409, 'booking_command_in_progress');
  }
  return { ...command.response_payload, replayed: true };
}

export function assertBookingPilot(config) {
  if (!config.bookingPilotEnabled) {
    throw new BookingWorkflowError(503, 'booking_pilot_not_enabled');
  }
}

export async function expireBookingHolds(client) {
  const expired = await client.query(
    `SELECT booking.id, booking.workflow_status, booking.renter_id, request.payload
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     WHERE booking.workflow_version = 1
       AND booking.simulation_only = false
       AND booking.workflow_status IN ('accepted', 'payment_pending')
       AND booking.hold_expires_at IS NOT NULL
       AND booking.hold_expires_at <= now()
     FOR UPDATE OF booking, request SKIP LOCKED`,
  );
  for (const row of expired.rows) {
    const nextPayload = {
      ...(row.payload ?? {}),
      status: 'cancelled',
      workflowStatus: 'cancelled',
      cancelledBy: 'system',
      cancellationReason: 'payment_window_expired',
    };
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled', workflow_status = 'cancelled', hold_expires_at = NULL,
           cancelled_at = now(), workflow_revision = workflow_revision + 1,
           version = version + 1
       WHERE id = $1`,
      [row.id],
    );
    await client.query(
      `UPDATE rental_requests SET status = 'cancelled', payload = $2::jsonb WHERE id = $1`,
      [row.id, JSON.stringify(nextPayload)],
    );
    await client.query(
      `INSERT INTO booking_events (booking_id, event_type, from_status, to_status, metadata)
       VALUES ($1, 'booking.hold_expired', $2, 'cancelled', '{"reason":"payment_window_expired"}'::jsonb)`,
      [row.id, row.workflow_status],
    );
    await writeAudit(client, {
      action: 'booking.hold_expired',
      bookingId: row.id,
      metadata: { fromStatus: row.workflow_status },
    });
    await enqueueBookingNotifications(client, {
      bookingId: row.id,
      eventKey: `booking:${row.id}:hold_expired:${row.workflow_status}`,
      workflowStatus: 'cancelled',
    });
  }
  return expired.rowCount;
}

export async function listBookings(client, userId) {
  await expireBookingHolds(client);
  const result = await client.query(
    `SELECT ${bookingProjection}
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     JOIN listings AS listing ON listing.id = booking.listing_id
     WHERE booking.workflow_version = 1
       AND (booking.owner_id = $1 OR booking.renter_id = $1)
     ORDER BY booking.created_at DESC`,
    [userId],
  );
  return result.rows.map((row) => bookingPayload(row, userId));
}

export async function quoteBooking(client, {
  actorId,
  raw,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  persist = true,
}) {
  await expireBookingHolds(client);
  const candidate = object(raw);
  if (privatePilot) {
    try {
      assertPrivatePilotBooking(candidate, { requireDeclaration: false });
    } catch (error) {
      if (error instanceof PrivatePilotValidationError) {
        throw new BookingWorkflowError(400, error.code);
      }
      throw error;
    }
  }
  const listingId = text(candidate.itemId ?? candidate.listingId, 120);
  const listing = await listingForBooking(client, listingId);
  if (listing.owner_id === actorId) throw new BookingWorkflowError(409, 'cannot_rent_own_listing');
  if (privatePilot) {
    await assertPrivatePilotBookingEligibility(client, {
      actorId,
      listing,
      allowedRegions: privatePilotAllowedRegions,
    });
  }
  await assertNewBookingAllowed(client, actorId, listing.owner_id);
  const dates = rentalDatesFromCandidate(candidate);
  const period = await periodInstants(client, dates, listing.availability_timezone);
  await checkPeriodAvailability(client, {
    listing,
    dates,
    startsAt: period.starts_at,
    endsAt: period.ends_at,
  });
  const quote = quoteForListing(candidate, dates, listing);
  const binding = quoteBindingPayload({ actorId, listing, dates, period, quote });
  const quoteId = `quote_${crypto.randomUUID()}`;
  const quoteHash = hashCommand(binding);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + (10 * 60 * 1000));
  if (persist) {
    await client.query(
      `INSERT INTO booking_quotes (
         id, renter_id, listing_id, rental_start_date, rental_end_date,
         rental_timezone, starts_at, ends_at, catalog_revision,
         availability_revision, quote_version, currency, total_minor,
         quote_payload, quote_hash, issued_at, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14::jsonb, $15, $16, $17
       )`,
      [
        quoteId, actorId, listing.id, dates.startDate, dates.endDate,
        listing.availability_timezone, period.starts_at, period.ends_at,
        listing.catalog_revision, listing.availability_revision,
        quote.quoteVersion, quote.currency, quote.totalMinor,
        JSON.stringify(quote), quoteHash, issuedAt, expiresAt,
      ],
    );
  }
  return {
    quoteId: persist ? quoteId : null,
    quoteHash,
    quotedAt: issuedAt.toISOString(),
    expiresAt: persist ? expiresAt.toISOString() : null,
    preview: !persist,
    listingId,
    startDate: dates.startDate,
    endDate: dates.endDate,
    timezone: listing.availability_timezone,
    start: new Date(period.starts_at).toISOString(),
    end: new Date(period.ends_at).toISOString(),
    availabilityRevision: Number(listing.availability_revision),
    quote,
  };
}

export async function createBooking(client, {
  actor,
  raw,
  key,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  allowNonBindingSimulation = false,
}) {
  const candidate = object(raw);
  const simulationOnly = candidate.simulationOnly === true;
  if (simulationOnly && !allowNonBindingSimulation) {
    throw new BookingWorkflowError(503, 'pilot_simulation_unavailable');
  }
  if (simulationOnly && candidate.simulationAcknowledged !== true) {
    throw new BookingWorkflowError(400, 'pilot_simulation_acknowledgement_required');
  }
  const clientBuild = text(candidate.clientBuild, 120);
  if (privatePilot && !clientBuild) {
    throw new BookingWorkflowError(400, 'v52_contract_build_required');
  }
  if (privatePilot) {
    try {
      assertPrivatePilotBooking(candidate, { requireDeclaration: !simulationOnly });
    } catch (error) {
      if (error instanceof PrivatePilotValidationError) {
        throw new BookingWorkflowError(400, error.code);
      }
      throw error;
    }
  }
  const commandKey = idempotencyKey(key ?? candidate.idempotencyKey);
  const replay = await startCommand(client, {
    key: commandKey,
    actorId: actor.id,
    type: 'booking.create',
    request: candidate,
  });
  if (replay) return replay;

  await expireBookingHolds(client);

  const listingId = text(candidate.itemId ?? candidate.listingId, 120);
  const listing = await listingForBooking(client, listingId, { lock: true });
  if (listing.owner_id === actor.id) throw new BookingWorkflowError(409, 'cannot_rent_own_listing');
  if (privatePilot) {
    await assertPrivatePilotBookingEligibility(client, {
      actorId: actor.id,
      listing,
      allowedRegions: privatePilotAllowedRegions,
    });
  }
  await assertNewBookingAllowed(client, actor.id, listing.owner_id);
  const dates = rentalDatesFromCandidate(candidate);
  const period = await periodInstants(client, dates, listing.availability_timezone);
  await checkPeriodAvailability(client, {
    listing,
    dates,
    startsAt: period.starts_at,
    endsAt: period.ends_at,
  });
  const duplicate = await client.query(
    `SELECT id FROM bookings
     WHERE listing_id = $1 AND renter_id = $2 AND workflow_version = 1
       AND rental_start_date = $3 AND rental_end_date = $4
       AND simulation_only = $5
       AND workflow_status NOT IN ('declined', 'cancelled', 'refunded', 'completed')
     LIMIT 1`,
    [listing.id, actor.id, dates.startDate, dates.endDate, simulationOnly],
  );
  if (duplicate.rowCount) {
    throw new BookingWorkflowError(409, 'duplicate_booking_request', {
      bookingId: duplicate.rows[0].id,
    });
  }
  const quote = quoteForListing(candidate, dates, listing);
  const quoteBinding = privatePilot && !simulationOnly
    ? await requireFreshBookingQuote(client, {
        actorId: actor.id,
        candidate,
        listing,
        dates,
        period,
        quote,
      })
    : null;
  const id = bookingIdentifier(candidate.id);
  const createdAt = new Date();
  const bindingExpiresAt = new Date(Math.min(
    createdAt.getTime() + (30 * 60 * 1000),
    new Date(period.starts_at).getTime(),
  ));
  const payload = {
    ...candidate,
    idempotencyKey: undefined,
    id,
    itemId: listing.id,
    ownerId: listing.owner_id,
    renterId: actor.id,
    status: 'pending',
    workflowStatus: 'requested',
    workflowVersion: 1,
    workflowRevision: 1,
    startDate: dates.startDate,
    endDate: dates.endDate,
    timezone: listing.availability_timezone,
    start: new Date(period.starts_at).toISOString(),
    end: new Date(period.ends_at).toISOString(),
    createdAt: createdAt.toISOString(),
    bindingExpiresAt: simulationOnly ? null : bindingExpiresAt.toISOString(),
    simulationOnly,
    ...(simulationOnly ? {
      simulationAcknowledged: true,
      contractCreated: false,
      paymentCreated: false,
      reservationCreated: false,
      monetaryEffectMinor: 0,
      simulationNotice: 'Unverbindliche Stage-A-Pilot-Simulation ohne Vertrag, Reservierung oder Geldbewegung.',
    } : {}),
    quotedTotalRenter: money(quote.totalMinor),
    ...quoteSnapshotPayload(quote),
    quote,
    ...(quoteBinding ?? {}),
  };
  delete payload.idempotencyKey;
  await client.query(
    `INSERT INTO rental_requests (id, item_id, owner_id, renter_id, status, payload, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5::jsonb, $6)`,
    [id, listing.id, listing.owner_id, actor.id, JSON.stringify(payload), createdAt],
  );
  await client.query(
    `INSERT INTO bookings (
       id, listing_id, owner_id, renter_id, status, workflow_status,
       workflow_version, workflow_revision, starts_at, ends_at,
       rental_start_date, rental_end_date, rental_timezone, currency,
       quoted_total_minor, security_deposit_minor, quoted_days,
       price_per_day_minor, base_rental_minor, discount_minor,
       rental_subtotal_minor, platform_fee_minor, delivery_fee_minor,
       pickup_fee_minor, express_fee_minor, owner_payout_minor,
       quote_version, quote_breakdown, requested_at, created_at,
       private_status_confirmed_at, simulation_only
     ) VALUES (
       $1, $2, $3, $4, 'pending', 'requested', 1, 1, $5, $6,
       $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22, $23, $24::jsonb,
       $25::timestamptz, $25::timestamptz,
       CASE WHEN $26::boolean THEN $25::timestamptz ELSE NULL::timestamptz END,
       $27::boolean
     )`,
    [
      id, listing.id, listing.owner_id, actor.id, period.starts_at, period.ends_at,
      dates.startDate, dates.endDate, listing.availability_timezone, quote.currency,
      quote.totalMinor, quote.securityDepositMinor, quote.days, quote.pricePerDayMinor,
      quote.baseRentalMinor, quote.discountMinor, quote.rentalSubtotalMinor,
      quote.platformFeeMinor, quote.deliveryFeeMinor, quote.pickupFeeMinor,
      quote.expressFeeMinor, quote.ownerPayoutMinor, quote.quoteVersion,
      JSON.stringify(quote), createdAt, privatePilot, simulationOnly,
    ],
  );
  if (privatePilot && !simulationOnly) {
    try {
      payload.platformContract = await persistV52PlatformContract(client, {
        userId: actor.id,
        bookingId: id,
        quoteId: quoteBinding.quoteId,
        quoteHash: quoteBinding.quoteHash,
        quoteIssuedAt: quoteBinding.issuedAt,
        quoteExpiresAt: quoteBinding.expiresAt,
        clientBuild,
        declarations: candidate.legalDeclarations,
        idempotencyKey: `${commandKey}:platform-contract`,
        acceptedAt: createdAt,
      });
    } catch (error) {
      if (error instanceof V52ContractWorkflowError) {
        const status = error.code === 'v52_contract_documents_unavailable'
          ? 409
          : 400;
        throw new BookingWorkflowError(status, error.code);
      }
      throw error;
    }
    await client.query(
      'UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1',
      [id, JSON.stringify(payload)],
    );
    await client.query(
      `INSERT INTO booking_events (
         booking_id, actor_id, event_type, idempotency_key, metadata
       ) VALUES ($1, $2, 'platform_contract.accepted', $3, $4::jsonb)`,
      [
        id,
        actor.id,
        `${commandKey}:platform-contract-accepted`,
        JSON.stringify({
          state: payload.platformContract.state,
          platformContractId: payload.platformContract.id,
          contractVersion: payload.platformContract.contractVersion,
          acceptedAt: payload.platformContract.acceptedAt,
          receiptSha256: payload.platformContract.receipt.artifactSha256,
        }),
      ],
    );
  }
  if (privatePilot && !simulationOnly) {
    const acceptedByType = new Map(
      candidate.legalDeclarations.map((entry) => [entry.type, entry]),
    );
    for (const declaration of privatePilotRequiredCheckoutDeclarations) {
      const accepted = acceptedByType.get(declaration.type);
      await client.query(
        `INSERT INTO legal_declarations (
           user_id, booking_id, declaration_type, exact_wording, document_name,
           document_version, app_version, language, accepted, declared_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
        [
          actor.id,
          id,
          declaration.type,
          declaration.wording,
          privatePilotCheckoutDocument.name,
          privatePilotCheckoutDocument.version,
          clientBuild,
          privatePilotCheckoutDocument.locale,
          new Date(accepted.acceptedAt),
        ],
      );
    }
  }
  await client.query(
    `INSERT INTO booking_events (
       booking_id, actor_id, event_type, to_status, idempotency_key, metadata
     ) VALUES ($1, $2, $3, 'requested', $4, $5::jsonb)`,
    [id, actor.id, simulationOnly ? 'pilot_simulation.requested' : 'booking.requested', `${commandKey}:event`, JSON.stringify({
      availabilityRevision: listing.availability_revision,
      quote,
      simulationOnly,
      ...(quoteBinding ?? {}),
    })],
  );
  await writeAudit(client, {
    actor,
    action: simulationOnly ? 'pilot_simulation.requested' : 'booking.requested',
    bookingId: id,
    metadata: { listingId: listing.id, quoteVersion: quote.quoteVersion, simulationOnly },
  });
  await enqueueBookingNotifications(client, {
    bookingId: id,
    eventKey: `booking:${id}:requested:${commandKey}`,
    workflowStatus: 'requested',
  });
  const response = { booking: payload, replayed: false };
  await completeCommand(client, commandKey, id, response);
  return response;
}

async function lockedBooking(client, id, { allowQuarantined = false } = {}) {
  const result = await client.query(
    `SELECT ${bookingProjection}, listing.acceptance_window_minutes
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     JOIN listings AS listing ON listing.id = booking.listing_id
     WHERE booking.id = $1
     FOR UPDATE OF booking, request`,
    [id],
  );
  if (!result.rowCount) throw new BookingWorkflowError(404, 'booking_not_found');
  if (!allowQuarantined && Number(result.rows[0].workflow_version) !== 1) {
    throw new BookingWorkflowError(409, 'booking_requires_b6_revalidation');
  }
  return result.rows[0];
}

export async function amendBooking(client, { actor, bookingId, raw, key }) {
  const candidate = object(raw, 'invalid_booking_amendment');
  const commandKey = idempotencyKey(key ?? candidate.idempotencyKey);
  const commandRequest = { bookingId, candidate };
  const replay = await startCommand(client, {
    key: commandKey,
    actorId: actor.id,
    type: 'booking.amend',
    request: commandRequest,
  });
  if (replay) return replay;

  const row = await lockedBooking(client, bookingId, { allowQuarantined: true });
  if (row.renter_id !== actor.id) throw new BookingWorkflowError(403, 'booking_forbidden');
  if (row.payload?.platformContract) {
    throw new BookingWorkflowError(409, 'platform_contract_reconsent_required');
  }
  const revalidatingRollback = Number(row.workflow_version) === 0;
  if (revalidatingRollback && row.status !== 'pending') {
    throw new BookingWorkflowError(409, 'booking_requires_manual_revalidation', { status: row.status });
  }
  if (revalidatingRollback) row.workflow_status = 'requested';
  if (!['draft', 'requested'].includes(row.workflow_status)) {
    throw new BookingWorkflowError(409, 'booking_period_locked', { status: row.workflow_status });
  }
  const listing = await listingForBooking(client, row.listing_id);
  const merged = { ...(row.payload ?? {}), ...candidate };
  const dates = rentalDatesFromCandidate(merged);
  const period = await periodInstants(client, dates, listing.availability_timezone);
  await checkPeriodAvailability(client, {
    listing,
    dates,
    startsAt: period.starts_at,
    endsAt: period.ends_at,
    excludeBookingId: bookingId,
  });
  const quote = quoteForListing(merged, dates, listing);
  const nextPayload = {
    ...(row.payload ?? {}),
    ...candidate,
    id: row.id,
    itemId: row.listing_id,
    ownerId: row.owner_id,
    renterId: row.renter_id,
    status: row.status,
    workflowStatus: row.workflow_status,
    workflowVersion: 1,
    workflowRevision: Number(row.workflow_revision) + 1,
    startDate: dates.startDate,
    endDate: dates.endDate,
    timezone: listing.availability_timezone,
    start: new Date(period.starts_at).toISOString(),
    end: new Date(period.ends_at).toISOString(),
    quotedTotalRenter: money(quote.totalMinor),
    ...quoteSnapshotPayload(quote),
    quote,
  };
  delete nextPayload.idempotencyKey;
  await client.query(
    `UPDATE bookings
     SET starts_at = $2, ends_at = $3,
         status = 'pending', workflow_status = 'requested', workflow_version = 1,
         rental_start_date = $4, rental_end_date = $5,
         rental_timezone = $6, currency = $7,
         quoted_total_minor = $8, security_deposit_minor = $9,
         quoted_days = $10, price_per_day_minor = $11,
         base_rental_minor = $12, discount_minor = $13,
         rental_subtotal_minor = $14, platform_fee_minor = $15,
         delivery_fee_minor = $16, pickup_fee_minor = $17,
         express_fee_minor = $18, owner_payout_minor = $19,
         quote_version = $20, quote_breakdown = $21::jsonb,
         workflow_revision = workflow_revision + 1, version = version + 1
     WHERE id = $1`,
    [
      bookingId, period.starts_at, period.ends_at, dates.startDate, dates.endDate,
      listing.availability_timezone, quote.currency, quote.totalMinor,
      quote.securityDepositMinor, quote.days, quote.pricePerDayMinor,
      quote.baseRentalMinor, quote.discountMinor, quote.rentalSubtotalMinor,
      quote.platformFeeMinor, quote.deliveryFeeMinor, quote.pickupFeeMinor,
      quote.expressFeeMinor, quote.ownerPayoutMinor, quote.quoteVersion,
      JSON.stringify(quote),
    ],
  );
  await client.query(
    'UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1',
    [bookingId, JSON.stringify(nextPayload)],
  );
  await client.query(
    `INSERT INTO booking_events (
       booking_id, actor_id, event_type, from_status, to_status,
       idempotency_key, metadata
     ) VALUES ($1, $2, 'booking.amended', $3, $3, $4, $5::jsonb)`,
    [
      bookingId,
      actor.id,
      row.workflow_status,
      `${commandKey}:event`,
      JSON.stringify({ startDate: dates.startDate, endDate: dates.endDate, quote }),
    ],
  );
  await writeAudit(client, {
    actor,
    action: revalidatingRollback ? 'booking.revalidated' : 'booking.amended',
    bookingId,
    metadata: { startDate: dates.startDate, endDate: dates.endDate },
  });
  const updated = await lockedBooking(client, bookingId);
  const response = { booking: bookingPayload(updated, actor.id), replayed: false };
  await completeCommand(client, commandKey, bookingId, response);
  return response;
}

function transitionPath(current, requested, { pilotWithoutPayment = false } = {}) {
  if (pilotWithoutPayment && current === 'accepted' && requested === 'active') {
    return ['confirmed', 'active'];
  }
  if (current === 'active' && requested === 'completed') return ['returned', 'completed'];
  return [requested];
}

export async function transitionBooking(client, { actor, bookingId, raw, key, config }) {
  const candidate = object(raw, 'invalid_booking_transition');
  const commandKey = idempotencyKey(key ?? candidate.idempotencyKey);
  const requested = workflowStatus(candidate.workflowStatus ?? candidate.status);
  if (!requested) throw new BookingWorkflowError(400, 'invalid_booking_status');
  const cancellationType = candidate.cancellationType == null
    ? 'standard'
    : text(candidate.cancellationType, 40);
  if (!['standard', 'renter_no_show'].includes(cancellationType)) {
    throw new BookingWorkflowError(400, 'invalid_cancellation_type');
  }
  if (requested !== 'cancelled' && cancellationType !== 'standard') {
    throw new BookingWorkflowError(400, 'cancellation_type_without_cancellation');
  }
  const commandRequest = {
    bookingId,
    requested,
    cancellationType,
    expectedRevision: candidate.expectedRevision ?? null,
  };
  const replay = await startCommand(client, {
    key: commandKey,
    actorId: actor.id,
    type: 'booking.transition',
    request: commandRequest,
  });
  if (replay) return replay;

  await expireBookingHolds(client);
  const row = await lockedBooking(client, bookingId);
  const simulationOnly = row.simulation_only === true;
  if (row.owner_id !== actor.id && row.renter_id !== actor.id && actor.role !== 'admin') {
    throw new BookingWorkflowError(403, 'booking_forbidden');
  }
  if (simulationOnly && !['accepted', 'declined', 'cancelled'].includes(requested)) {
    throw new BookingWorkflowError(409, 'pilot_simulation_transition_forbidden', {
      requestedStatus: requested,
      allowedStatuses: ['accepted', 'declined', 'cancelled'],
    });
  }
  const expectedRevision = Number(candidate.expectedRevision);
  if (Number.isSafeInteger(expectedRevision) && expectedRevision !== Number(row.workflow_revision)) {
    throw new BookingWorkflowError(409, 'booking_revision_conflict', {
      expectedRevision,
      currentRevision: Number(row.workflow_revision),
    });
  }
  const actorRole = actorRoleForBooking({
    actorId: actor.id,
    actorSystemRole: actor.role,
    ownerId: row.owner_id,
    renterId: row.renter_id,
  });
  const transitionedAt = new Date();
  if (requested === 'cancelled' && actorRole === 'renter' && !simulationOnly) {
    const contract = await client.query(
      `SELECT contract_version, accepted_at
         FROM platform_contracts WHERE booking_id = $1`,
      [bookingId],
    );
    const acceptedAt = contract.rows[0]?.accepted_at
      ? new Date(contract.rows[0].accepted_at)
      : null;
    const rightExpiresAt = acceptedAt
      ? new Date(acceptedAt.getTime() + (14 * 24 * 60 * 60 * 1000))
      : null;
    if (String(contract.rows[0]?.contract_version ?? '').startsWith('V5.2-')
        && rightExpiresAt
        && transitionedAt <= rightExpiresAt) {
      throw new BookingWorkflowError(409, 'v52_withdrawal_precedes_cancellation', {
        bookingId,
        rightExpiresAt: rightExpiresAt.toISOString(),
        withdrawalPath: `/v1/bookings/${encodeURIComponent(bookingId)}/withdrawal`,
      });
    }
  }
  if (requested === 'cancelled' && cancellationType === 'renter_no_show') {
    if (simulationOnly) {
      throw new BookingWorkflowError(409, 'pilot_simulation_no_show_not_applicable');
    }
    if (actorRole !== 'owner') {
      throw new BookingWorkflowError(403, 'renter_no_show_owner_required');
    }
    if (transitionedAt < new Date(row.starts_at)) {
      throw new BookingWorkflowError(409, 'renter_no_show_before_start');
    }
  }
  let current = row.workflow_status;
  if (current === requested) {
    const response = { booking: bookingPayload(row, actor.id), replayed: false };
    await completeCommand(client, commandKey, bookingId, response);
    return response;
  }
  const steps = transitionPath(current, requested, {
    pilotWithoutPayment: config.bookingPilotWithoutPayment,
  });
  if (config.privatePilotV4Enabled
      && !simulationOnly
      && steps.includes('active')
      && !hasVerifiedBookingConfirmation(row.payload, 'pickup')) {
    throw new BookingWorkflowError(409, 'verified_pickup_confirmation_required');
  }
  if (config.privatePilotV4Enabled
      && !simulationOnly
      && steps.includes('completed')
      && !hasVerifiedBookingConfirmation(row.payload, 'return')) {
    throw new BookingWorkflowError(409, 'verified_return_confirmation_required');
  }
  if (current === 'requested' && steps[0] === 'accepted') {
    const bindingExpiresAt = row.payload?.bindingExpiresAt
      ? new Date(row.payload.bindingExpiresAt)
      : new Date(Math.min(
          new Date(row.created_at).getTime() + (30 * 60 * 1000),
          new Date(row.starts_at).getTime(),
        ));
    if (!simulationOnly && (!Number.isFinite(bindingExpiresAt.getTime())
        || Date.now() >= bindingExpiresAt.getTime())) {
      throw new BookingWorkflowError(409, 'booking_request_expired');
    }
    if (config.privatePilotV4Enabled && !simulationOnly) {
      requiredPrivatePilotOwnerAcceptance(candidate);
    }
    const listing = await listingForBooking(client, row.listing_id, { lock: true });
    if (config.privatePilotV4Enabled) {
      await assertPrivatePilotBookingEligibility(client, {
        actorId: row.renter_id,
        listing,
        allowedRegions: config.privatePilot?.allowedRegions ?? [],
      });
    }
    const dates = parseRentalDates(
      databaseDate(row.rental_start_date),
      databaseDate(row.rental_end_date),
    );
    if (!dates) throw new BookingWorkflowError(500, 'invalid_stored_rental_dates');
    await checkPeriodAvailability(client, {
      listing,
      dates,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      excludeBookingId: row.id,
    });
  }
  for (let index = 0; index < steps.length; index += 1) {
    const next = steps[index];
    if (!canTransitionWorkflow({
      current,
      next,
      actorRole,
      pilotWithoutPayment: config.bookingPilotWithoutPayment,
    })) {
      throw new BookingWorkflowError(409, 'invalid_status_transition', { current, next, actorRole });
    }
    const legacyStatus = legacyStatusForWorkflow(next);
    const holdMinutes = Number(row.acceptance_window_minutes ?? 30);
    const holdExpiresAt = simulationOnly
      ? null
      : next === 'accepted'
      ? new Date(Date.now() + holdMinutes * 60_000)
      : (next === 'payment_pending' ? row.hold_expires_at : null);
    const timestampColumn = {
      accepted: 'accepted_at',
      payment_pending: 'payment_due_at',
      confirmed: 'confirmed_at',
      active: 'active_at',
      returned: 'returned_at',
      completed: 'completed_at',
      declined: 'declined_at',
      cancelled: 'cancelled_at',
      refunded: 'refunded_at',
      disputed: 'disputed_at',
    }[next];
    const timestampSql = timestampColumn ? `, ${timestampColumn} = COALESCE(${timestampColumn}, now())` : '';
    await client.query(
      `UPDATE bookings
       SET status = $2, workflow_status = $3, hold_expires_at = $4,
           workflow_revision = workflow_revision + 1, version = version + 1
           ${timestampSql}
       WHERE id = $1`,
      [bookingId, legacyStatus, next, holdExpiresAt],
    );
    if (next === 'accepted' && config.privatePilotV4Enabled && !simulationOnly) {
      const declaration = requiredPrivatePilotOwnerAcceptance(candidate);
      await client.query(
        `INSERT INTO legal_declarations (
           user_id, booking_id, declaration_type, exact_wording, document_name,
           document_version, app_version, language, accepted, declared_at
         ) VALUES ($1, $2, 'owner_booking_acceptance', $3, $4, $5, $6, $7, true, $8)`,
        [
          actor.id,
          bookingId,
          privatePilotDeclarations.ownerAcceptance,
          privatePilotDocument.name,
          privatePilotDocument.version,
          releaseMetadata.version,
          privatePilotDocument.language,
          new Date(declaration.acceptedAt),
        ],
      );
    }
    const nextPayload = {
      ...(row.payload ?? {}),
      status: legacyStatus,
      workflowStatus: next,
      workflowVersion: 1,
      workflowRevision: Number(row.workflow_revision) + index + 1,
      holdExpiresAt: holdExpiresAt?.toISOString() ?? null,
      ...(next === 'cancelled' ? { cancelledBy: actorRole } : {}),
      simulationOnly,
      ...(simulationOnly ? {
        contractCreated: false,
        paymentCreated: false,
        reservationCreated: false,
        monetaryEffectMinor: 0,
      } : {}),
    };
    if (next === 'cancelled' && config.privatePilotV4Enabled && simulationOnly) {
      nextPayload.cancellationOutcome = {
        simulationOnly: true,
        reasonCode: 'stage_a_non_binding_simulation',
        refundMinor: 0,
        retainedMinor: 0,
        monetaryEffectMinor: 0,
        calculatedAt: new Date().toISOString(),
      };
    }
    if (next === 'cancelled' && config.privatePilotV4Enabled && !simulationOnly) {
      const outcome = evaluateCancellation({
        rentalStartAt: row.starts_at,
        cancelAt: transitionedAt,
        contractConfirmedAt: row.accepted_at,
        actor: cancellationType === 'renter_no_show' ? 'renter' : actorRole,
        noShow: cancellationType === 'renter_no_show',
      });
      const calculated = outcome.calculationStatus === 'final'
        ? v51CancellationAmounts({
            rentalSubtotalMinor: Number(row.rental_subtotal_minor),
            platformFeeMinor: Number(row.platform_fee_minor),
            rentRefundBasisPoints: outcome.refundBasisPoints,
          })
        : null;
      nextPayload.cancellationOutcome = {
        ...outcome,
        ...(calculated == null ? {} : {
          rentRefund: {
            type: 'rent_refund',
            debtorRole: 'owner',
            amountMinor: calculated.rentRefundMinor,
          },
          sitFeeRefund: {
            type: 'sit_fee_refund',
            debtorRole: 'sit',
            amountMinor: calculated.sitFeeRefundMinor,
          },
          refundMinor: calculated.rentRefundMinor + calculated.sitFeeRefundMinor,
          retainedMinor: calculated.rentRetainedMinor + calculated.sitFeeRetainedMinor,
        }),
        calculatedAt: new Date().toISOString(),
        modelVersion: 'V5.1-2026-08-16',
      };
      const cancellationObligations = {};
      for (const [refundType, debtorRole, maximumMinor, amountMinor] of [
        [
          'rent_refund',
          'owner',
          Number(row.rental_subtotal_minor),
          calculated?.rentRefundMinor ?? null,
        ],
        [
          'sit_fee_refund',
          'sit',
          Number(row.platform_fee_minor),
          calculated?.sitFeeRefundMinor ?? null,
        ],
      ]) {
        const obligation = await client.query(
          `WITH inserted AS (
             INSERT INTO v51_cancellation_refund_obligations (
               booking_id, refund_type, debtor_role, currency, status,
               amount_due_minor, maximum_minor, calculation_basis,
               idempotency_key
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
             ON CONFLICT (idempotency_key) DO NOTHING
             RETURNING id
           )
           SELECT id FROM inserted
           UNION ALL
           SELECT id FROM v51_cancellation_refund_obligations
            WHERE idempotency_key = $9
           LIMIT 1`,
          [
            bookingId,
            refundType,
            debtorRole,
            row.currency,
            calculated == null ? 'pending_actual_loss_assessment' : 'required',
            amountMinor,
            maximumMinor,
            JSON.stringify({
              reasonCode: outcome.reasonCode,
              calculationStatus: outcome.calculationStatus,
              rentRefundBasisPoints: outcome.refundBasisPoints,
              modelVersion: 'V5.1-2026-08-16',
            }),
            `${commandKey}:cancellation:${refundType}`,
          ],
        );
        cancellationObligations[refundType] = obligation.rows[0]?.id;
      }
      if (calculated == null) {
        const actualLossCase = await openV52ActualLossCase(client, {
          actor,
          bookingId,
          cause: cancellationType === 'renter_no_show'
            ? 'renter_no_show'
            : 'after_start',
          rentRefundObligationId: cancellationObligations.rent_refund,
          sitFeeRefundObligationId: cancellationObligations.sit_fee_refund,
          idempotencyKey: `${commandKey}:actual-loss`,
          now: transitionedAt,
        });
        if (actualLossCase) {
          nextPayload.cancellationOutcome.actualLossCase = actualLossCase;
        }
      }
    }
    row.payload = nextPayload;
    await client.query(
      `UPDATE rental_requests SET status = $2, payload = $3::jsonb WHERE id = $1`,
      [bookingId, legacyStatus, JSON.stringify(nextPayload)],
    );
    await client.query(
      `INSERT INTO booking_events (
         booking_id, actor_id, event_type, from_status, to_status,
         idempotency_key, metadata
       ) VALUES ($1, $2, 'booking.status_changed', $3, $4, $5, $6::jsonb)`,
      [
        bookingId,
        actor.id,
        current,
        next,
        `${commandKey}:event:${index}`,
        JSON.stringify({
          actorRole,
          pilotWithoutPayment: config.bookingPilotWithoutPayment,
          simulationOnly,
        }),
      ],
    );
    await writeAudit(client, {
      actor,
      action: 'booking.status_changed',
      bookingId,
      metadata: { fromStatus: current, toStatus: next, actorRole, simulationOnly },
    });
    await enqueueBookingNotifications(client, {
      bookingId,
      eventKey: `booking:${bookingId}:${next}:${commandKey}:${index}`,
      workflowStatus: next,
    });
    if (next === 'returned' && !simulationOnly) {
      await settleV51WithdrawalRefundAtReturn(client, {
        bookingId,
        confirmedReturnAt: new Date(),
        idempotencyKey: `${commandKey}:return-settlement`,
      });
    }
    current = next;
  }
  const updated = await lockedBooking(client, bookingId);
  const response = { booking: bookingPayload(updated, actor.id), replayed: false };
  await completeCommand(client, commandKey, bookingId, response);
  return response;
}

export async function getListingAvailability(client, { listingId, fromDate, toDate }) {
  const listing = await listingForBooking(client, listingId);
  const dates = parseRentalDates(fromDate, toDate, { maxDays: 366 });
  if (!dates) throw new BookingWorkflowError(400, 'invalid_availability_range');
  await expireBookingHolds(client);
  const period = await periodInstants(client, dates, listing.availability_timezone);
  const blocks = await client.query(
    `SELECT id, kind, starts_at, ends_at
     FROM listing_availability_blocks
     WHERE listing_id = $1
       AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
     ORDER BY starts_at`,
    [listing.id, period.starts_at, period.ends_at],
  );
  const bookings = await client.query(
    `SELECT id, starts_at, ends_at
     FROM bookings
     WHERE listing_id = $1 AND workflow_version = 1
       AND simulation_only = false
       AND workflow_status = ANY($4::text[])
       AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
     ORDER BY starts_at`,
    [listing.id, period.starts_at, period.ends_at, blockingWorkflowStatuses],
  );
  const rules = await client.query(
    `SELECT id, weekday, local_start, local_end, valid_from, valid_until, is_available
     FROM listing_availability_rules WHERE listing_id = $1
     ORDER BY weekday, local_start`,
    [listing.id],
  );
  return {
    listingId: listing.id,
    timezone: listing.availability_timezone,
    revision: Number(listing.availability_revision),
    minimumDays: Number(listing.min_days ?? 1),
    maximumDays: Number(listing.max_days ?? 365),
    noticeHours: Number(listing.booking_notice_hours),
    acceptanceWindowMinutes: Number(listing.acceptance_window_minutes),
    rules: rules.rows.map((rule) => ({
      id: rule.id,
      weekday: Number(rule.weekday),
      localStart: String(rule.local_start).slice(0, 5),
      localEnd: String(rule.local_end).slice(0, 5),
      validFrom: rule.valid_from ? databaseDate(rule.valid_from) : null,
      validUntil: rule.valid_until ? databaseDate(rule.valid_until) : null,
      isAvailable: rule.is_available,
    })),
    unavailable: [
      ...blocks.rows.map((block) => ({
        type: 'block',
        kind: block.kind,
        start: new Date(block.starts_at).toISOString(),
        end: new Date(block.ends_at).toISOString(),
      })),
      ...bookings.rows.map((booking) => ({
        type: 'booking',
        start: new Date(booking.starts_at).toISOString(),
        end: new Date(booking.ends_at).toISOString(),
      })),
    ].sort((left, right) => left.start.localeCompare(right.start)),
  };
}

function validTime(value) {
  const candidate = text(value, 5);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : null;
}

export async function replaceListingAvailability(client, { actor, listingId, raw }) {
  const candidate = object(raw, 'invalid_availability_payload');
  const listing = await listingForBooking(client, listingId, { lock: true, includeInactive: true });
  if (listing.owner_id !== actor.id && actor.role !== 'admin') {
    throw new BookingWorkflowError(403, 'listing_forbidden');
  }
  const timezone = text(candidate.timezone, 80) || listing.availability_timezone;
  await periodInstants(client, { startDate: '2026-01-01', endDate: '2026-01-02' }, timezone);
  const minimumDays = Number.parseInt(candidate.minimumDays ?? listing.min_days ?? 1, 10);
  const maximumDays = Number.parseInt(candidate.maximumDays ?? listing.max_days ?? 365, 10);
  const noticeHours = Number.parseInt(candidate.noticeHours ?? listing.booking_notice_hours ?? 0, 10);
  const acceptanceWindowMinutes = Number.parseInt(
    candidate.acceptanceWindowMinutes ?? listing.acceptance_window_minutes ?? 30,
    10,
  );
  if (!Number.isSafeInteger(minimumDays) || !Number.isSafeInteger(maximumDays)
      || minimumDays < 1 || maximumDays < minimumDays || maximumDays > 365) {
    throw new BookingWorkflowError(400, 'invalid_rental_duration_rules');
  }
  if (!Number.isSafeInteger(noticeHours) || noticeHours < 0 || noticeHours > 8760) {
    throw new BookingWorkflowError(400, 'invalid_booking_notice');
  }
  if (!Number.isSafeInteger(acceptanceWindowMinutes)
      || acceptanceWindowMinutes < 5 || acceptanceWindowMinutes > 1440) {
    throw new BookingWorkflowError(400, 'invalid_acceptance_window');
  }
  const rules = Array.isArray(candidate.rules) ? candidate.rules : [];
  const blocks = Array.isArray(candidate.blocks) ? candidate.blocks : [];
  if (rules.length > 100 || blocks.length > 500) throw new BookingWorkflowError(400, 'availability_payload_too_large');
  const normalizedRules = rules.map((rawRule) => {
    const rule = object(rawRule, 'invalid_availability_rule');
    const weekday = Number.parseInt(rule.weekday, 10);
    const localStart = validTime(rule.localStart);
    const localEnd = validTime(rule.localEnd);
    if (!Number.isSafeInteger(weekday) || weekday < 0 || weekday > 6
        || !localStart || !localEnd || localStart >= localEnd) {
      throw new BookingWorkflowError(400, 'invalid_availability_rule');
    }
    const validFrom = rule.validFrom ? datePart(String(rule.validFrom)) : null;
    const validUntil = rule.validUntil ? datePart(String(rule.validUntil)) : null;
    if ((rule.validFrom && !validFrom) || (rule.validUntil && !validUntil)
        || (validFrom && validUntil && validFrom > validUntil)) {
      throw new BookingWorkflowError(400, 'invalid_availability_rule_dates');
    }
    return { weekday, localStart, localEnd, validFrom, validUntil, isAvailable: rule.isAvailable !== false };
  });
  const normalizedBlocks = [];
  for (const rawBlock of blocks) {
    const block = object(rawBlock, 'invalid_availability_block');
    const blockDates = rentalDatesFromCandidate(block, { maxDays: 365 });
    const blockPeriod = await periodInstants(client, blockDates, timezone);
    normalizedBlocks.push({
      ...blockDates,
      ...blockPeriod,
      kind: ['owner_block', 'maintenance', 'safety_hold'].includes(block.kind) ? block.kind : 'owner_block',
      reason: text(block.reason, 500) || null,
    });
  }
  for (const block of normalizedBlocks) {
    const occupied = await client.query(
      `SELECT id FROM bookings
       WHERE listing_id = $1 AND workflow_version = 1
         AND simulation_only = false
         AND workflow_status = ANY($4::text[])
         AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
       LIMIT 1`,
      [listing.id, block.starts_at, block.ends_at, blockingWorkflowStatuses],
    );
    if (occupied.rowCount) throw new BookingWorkflowError(409, 'availability_block_overlaps_booking');
  }
  await client.query('DELETE FROM listing_availability_rules WHERE listing_id = $1', [listing.id]);
  await client.query('DELETE FROM listing_availability_blocks WHERE listing_id = $1', [listing.id]);
  for (const rule of normalizedRules) {
    await client.query(
      `INSERT INTO listing_availability_rules (
         listing_id, timezone, weekday, local_start, local_end,
         valid_from, valid_until, is_available
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [listing.id, timezone, rule.weekday, rule.localStart, rule.localEnd, rule.validFrom, rule.validUntil, rule.isAvailable],
    );
  }
  for (const block of normalizedBlocks) {
    await client.query(
      `INSERT INTO listing_availability_blocks (
         listing_id, created_by, kind, starts_at, ends_at, reason
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [listing.id, actor.id, block.kind, block.starts_at, block.ends_at, block.reason],
    );
  }
  const updated = await client.query(
    `UPDATE listings
     SET availability_timezone = $2, availability_revision = availability_revision + 1,
         min_days = $3, max_days = $4, booking_notice_hours = $5,
         acceptance_window_minutes = $6,
         catalog_revision = catalog_revision + 1,
         payload = jsonb_set(
           jsonb_set(
             jsonb_set(payload, '{minDays}', to_jsonb($3::int), true),
             '{maxDays}', to_jsonb($4::int), true
           ),
           '{availabilityTimezone}', to_jsonb($2::text), true
         )
     WHERE id = $1
     RETURNING availability_revision`,
    [listing.id, timezone, minimumDays, maximumDays, noticeHours, acceptanceWindowMinutes],
  );
  await writeAudit(client, {
    actor,
    action: 'listing.availability_replaced',
    resourceType: 'listing',
    resourceId: listing.id,
    metadata: { ruleCount: normalizedRules.length, blockCount: normalizedBlocks.length },
  });
  return { revision: Number(updated.rows[0].availability_revision) };
}

export async function checkListingAvailability(client, { listingId, raw }) {
  await expireBookingHolds(client);
  const candidate = object(raw, 'invalid_availability_check');
  const listing = await listingForBooking(client, listingId);
  const dates = rentalDatesFromCandidate(candidate);
  const period = await periodInstants(client, dates, listing.availability_timezone);
  try {
    await checkPeriodAvailability(client, {
      listing,
      dates,
      startsAt: period.starts_at,
      endsAt: period.ends_at,
    });
    return {
      available: true,
      startDate: dates.startDate,
      endDate: dates.endDate,
      timezone: listing.availability_timezone,
      revision: Number(listing.availability_revision),
    };
  } catch (error) {
    if (!(error instanceof BookingWorkflowError) || error.status !== 409) throw error;
    return {
      available: false,
      reason: error.code,
      details: error.details,
      startDate: dates.startDate,
      endDate: dates.endDate,
      timezone: listing.availability_timezone,
      revision: Number(listing.availability_revision),
    };
  }
}
