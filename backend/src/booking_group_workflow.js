import crypto from 'node:crypto';

import {
  buildBookingGroupFoundation,
  buildBookingGroupQuote,
  BookingGroupDomainError,
  maximumBookingGroupPositions,
} from './booking_group_domain.js';
import {
  assertTechnicalBookingGroupLegalDocumentSet,
  bookingGroupLegalDocumentSet,
} from './booking_group_legal_document.js';
import { parseRentalDates } from './booking_domain.js';
import { BookingWorkflowError, quoteBooking } from './booking_workflow.js';

const technicalGroupLegalDocumentSet = assertTechnicalBookingGroupLegalDocumentSet(
  bookingGroupLegalDocumentSet.version,
);

const groupPolicy = Object.freeze({
  marketplaceContext: 'private_c2c',
  handoverPolicyVersion: 'private_owner_pickup_v1',
  legalDocumentSetVersion: technicalGroupLegalDocumentSet.version,
  cancellationPolicyVersion: 'v52_private_cancellation',
  paymentConfigurationKey: 'disabled_test_only',
});

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookingWorkflowError(400, code);
  }
  return { ...value };
}

function text(value, maximum = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function identifier(value, code) {
  const candidate = text(value, 160);
  if (!candidate || !/^[A-Za-z0-9_.:-]+$/u.test(candidate)) {
    throw new BookingWorkflowError(400, code);
  }
  return candidate;
}

function idempotencyKey(value) {
  const candidate = text(value, 160);
  if (!/^[A-Za-z0-9_.:-]{8,160}$/u.test(candidate)) {
    throw new BookingWorkflowError(400, 'invalid_idempotency_key');
  }
  return candidate;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function childIdempotency(key, suffix) {
  return `booking_group_${hashJson({ key, suffix })}`;
}

function locationKey(listing) {
  return hashJson({
    ownerId: listing.owner_id,
    country: text(listing.country, 40).toLowerCase(),
    city: text(listing.city, 120).toLowerCase(),
    pilotRegionCode: text(listing.private_pilot_region_code, 120).toLowerCase(),
    locationText: text(listing.location_text, 240).toLowerCase(),
    latitude: Number(listing.latitude),
    longitude: Number(listing.longitude),
    timezone: text(listing.availability_timezone, 120),
  });
}

function uniqueListingIds(value, { minimum = 1 } = {}) {
  if (!Array.isArray(value)
    || value.length < minimum
    || value.length > maximumBookingGroupPositions) {
    throw new BookingWorkflowError(400, 'invalid_booking_group_item_count');
  }
  const ids = value.map((entry) => identifier(entry, 'invalid_booking_group_listing'));
  if (new Set(ids).size !== ids.length) {
    throw new BookingWorkflowError(400, 'duplicate_booking_group_listing');
  }
  return ids;
}

function translateDomainError(error) {
  if (error instanceof BookingGroupDomainError) {
    throw new BookingWorkflowError(400, error.code);
  }
  throw error;
}

async function startCommand(client, { key, actorId, type, request }) {
  const requestHash = hashJson(request);
  const inserted = await client.query(
    `INSERT INTO booking_group_commands (
       idempotency_key, actor_id, command_type, request_hash
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [key, actorId, type, requestHash],
  );
  if (inserted.rowCount) return null;
  const existing = await client.query(
    `SELECT actor_id, command_type, request_hash, response_payload, completed_at
       FROM booking_group_commands
      WHERE idempotency_key = $1
      FOR UPDATE`,
    [key],
  );
  const command = existing.rows[0];
  if (!command || command.actor_id !== actorId || command.command_type !== type
    || command.request_hash !== requestHash) {
    throw new BookingWorkflowError(409, 'idempotency_key_reused');
  }
  if (!command.completed_at || !command.response_payload) {
    throw new BookingWorkflowError(409, 'booking_group_command_in_progress');
  }
  return { ...command.response_payload, replayed: true };
}

async function completeCommand(client, key, bookingGroupId, response) {
  await client.query(
    `UPDATE booking_group_commands
        SET booking_group_id = $2, response_payload = $3::jsonb, completed_at = now()
      WHERE idempotency_key = $1`,
    [key, bookingGroupId, JSON.stringify(response)],
  );
}

async function writeAudit(client, { actor, action, groupId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'booking_group', $4, $5::jsonb)`,
    [actor.id, actor.role ?? 'user', action, groupId, JSON.stringify(metadata)],
  );
}

async function groupListings(client, listingIds) {
  const result = await client.query(
    `SELECT id, owner_id, currency, country, city, private_pilot_region_code,
            location_text, latitude, longitude, availability_timezone
       FROM listings
      WHERE id = ANY($1::text[])
      ORDER BY id
      FOR KEY SHARE`,
    [listingIds],
  );
  if (result.rowCount !== listingIds.length) {
    throw new BookingWorkflowError(404, 'booking_group_listing_not_found');
  }
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  return listingIds.map((id) => byId.get(id));
}

function assertCompatibleListings(listings, renterId) {
  const first = listings[0];
  if (first.owner_id === renterId) {
    throw new BookingWorkflowError(409, 'cannot_rent_own_booking_group');
  }
  const expectedLocation = locationKey(first);
  for (const listing of listings) {
    const normalizedCountry = text(listing.country, 40).toLowerCase();
    if (listing.owner_id !== first.owner_id) {
      throw new BookingWorkflowError(409, 'booking_group_item_owner_mismatch');
    }
    if (listing.currency !== first.currency) {
      throw new BookingWorkflowError(409, 'booking_group_item_currency_mismatch');
    }
    if (!['de', 'deutschland', 'germany'].includes(normalizedCountry)) {
      throw new BookingWorkflowError(409, 'booking_group_country_not_allowed');
    }
    if (!listing.city || !listing.private_pilot_region_code || !listing.location_text
      || !Number.isFinite(Number(listing.latitude))
      || !Number.isFinite(Number(listing.longitude))
      || !listing.availability_timezone || locationKey(listing) !== expectedLocation) {
      throw new BookingWorkflowError(409, 'booking_group_handover_context_mismatch');
    }
  }
  return { first, handoverLocationKey: expectedLocation };
}

async function quoteItems(client, {
  actorId,
  group,
  positions,
  listingIds,
  allowedRegions,
}) {
  const positionByListing = new Map(positions.map((position) => [position.listingId, position]));
  const results = [];
  for (const listingId of listingIds) {
    const single = await quoteBooking(client, {
      actorId,
      raw: {
        listingId,
        startDate: group.startDate,
        endDate: group.endDate,
      },
      privatePilot: true,
      privatePilotAllowedRegions: allowedRegions,
      persist: true,
    });
    const position = positionByListing.get(listingId);
    if (!position) throw new BookingWorkflowError(409, 'booking_group_position_not_found');
    results.push({
      groupPositionId: position.id,
      listingId,
      bookingQuoteId: single.quoteId,
      bookingQuoteHash: single.quoteHash,
      currency: single.quote.currency,
      rentalSubtotalMinor: single.quote.rentalSubtotalMinor,
      platformFeeMinor: single.quote.platformFeeMinor,
      totalMinor: single.quote.totalMinor,
      ownerPayoutMinor: single.quote.ownerPayoutMinor,
      securityDepositMinor: single.quote.securityDepositMinor,
      expiresAt: single.expiresAt,
    });
  }
  return results;
}

async function persistGroupQuote(client, quote, expiresAt) {
  const payload = { ...quote };
  delete payload.id;
  delete payload.quoteHash;
  await client.query(
    `INSERT INTO booking_group_quotes (
       id, booking_group_id, quote_revision, predecessor_quote_id,
       proposal_kind, proposed_by_id, proposed_by_role, compatibility_hash,
       item_count, currency, rental_subtotal_minor, platform_fee_minor,
       total_minor, owner_payout_minor, security_deposit_minor,
       quote_payload, quote_hash, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16::jsonb, $17, $18
     )`,
    [
      quote.id, quote.bookingGroupId, quote.quoteRevision, quote.predecessorQuoteId,
      quote.proposalKind, quote.proposedById, quote.proposedByRole,
      quote.compatibilityHash, quote.itemCount, quote.currency,
      quote.rentalSubtotalMinor, quote.platformFeeMinor, quote.totalMinor,
      quote.ownerPayoutMinor, quote.securityDepositMinor,
      JSON.stringify(payload), quote.quoteHash, expiresAt,
    ],
  );
  for (const item of quote.items) {
    await client.query(
      `INSERT INTO booking_group_quote_positions (
         group_quote_id, booking_group_id, group_position_id, listing_id,
         booking_quote_id, booking_quote_hash, currency,
         rental_subtotal_minor, platform_fee_minor, total_minor,
         owner_payout_minor, security_deposit_minor, sort_order
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        quote.id, quote.bookingGroupId, item.groupPositionId, item.listingId,
        item.bookingQuoteId, item.bookingQuoteHash, item.currency,
        item.rentalSubtotalMinor, item.platformFeeMinor, item.totalMinor,
        item.ownerPayoutMinor, item.securityDepositMinor, item.sortOrder,
      ],
    );
  }
}

async function appendEvent(client, {
  groupId,
  sequence,
  actor,
  actorGroupRole,
  eventType,
  fromState,
  toState,
  quote,
  commandKey,
}) {
  const id = `booking_group_event_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO booking_group_state_events (
       id, booking_group_id, event_sequence, actor_id, actor_group_role,
       event_type, from_state, to_state, group_quote_id, group_quote_hash,
       idempotency_key, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      id, groupId, sequence, actor.id, actorGroupRole, eventType,
      fromState, toState, quote.id, quote.quoteHash,
      childIdempotency(commandKey, eventType),
      JSON.stringify({
        quoteRevision: quote.quoteRevision,
        itemCount: quote.itemCount,
        totalMinor: quote.totalMinor,
        currency: quote.currency,
      }),
    ],
  );
  return Object.freeze({
    id,
    sequence,
    type: eventType,
    fromState,
    state: toState,
    quoteId: quote.id,
    quoteHash: quote.quoteHash,
  });
}

function publicQuote(quote, expiresAt) {
  return Object.freeze({
    id: quote.id,
    revision: quote.quoteRevision,
    predecessorQuoteId: quote.predecessorQuoteId,
    proposalKind: quote.proposalKind,
    itemCount: quote.itemCount,
    currency: quote.currency,
    rentalSubtotalMinor: quote.rentalSubtotalMinor,
    platformFeeMinor: quote.platformFeeMinor,
    totalMinor: quote.totalMinor,
    ownerPayoutMinor: quote.ownerPayoutMinor,
    securityDepositMinor: quote.securityDepositMinor,
    quoteHash: quote.quoteHash,
    expiresAt: new Date(expiresAt).toISOString(),
    items: quote.items,
  });
}

async function lockedGroupState(client, groupId) {
  const groupResult = await client.query(
    `SELECT booking_groups.*,
            rental_start_date::text AS rental_start_date_text,
            rental_end_date::text AS rental_end_date_text
       FROM booking_groups
      WHERE id = $1
      FOR UPDATE`,
    [groupId],
  );
  if (!groupResult.rowCount) throw new BookingWorkflowError(404, 'booking_group_not_found');
  const eventResult = await client.query(
    `SELECT event_sequence, to_state, group_quote_id, group_quote_hash
       FROM booking_group_state_events
      WHERE booking_group_id = $1
      ORDER BY event_sequence DESC
      LIMIT 1`,
    [groupId],
  );
  if (!eventResult.rowCount) {
    throw new BookingWorkflowError(409, 'booking_group_state_not_initialized');
  }
  const event = eventResult.rows[0];
  const quoteResult = await client.query(
    `SELECT id, booking_group_id, quote_revision, predecessor_quote_id,
            proposal_kind, proposed_by_id, proposed_by_role,
            compatibility_hash, item_count, currency, rental_subtotal_minor,
            platform_fee_minor, total_minor, owner_payout_minor,
            security_deposit_minor, quote_payload, quote_hash, issued_at, expires_at
       FROM booking_group_quotes
      WHERE id = $1 AND quote_hash = $2`,
    [event.group_quote_id, event.group_quote_hash],
  );
  return { group: groupResult.rows[0], event, quote: quoteResult.rows[0] };
}

function storedQuote(row) {
  return {
    id: row.id,
    bookingGroupId: row.booking_group_id,
    quoteRevision: Number(row.quote_revision),
    predecessorQuoteId: row.predecessor_quote_id,
    proposalKind: row.proposal_kind,
    proposedById: row.proposed_by_id,
    proposedByRole: row.proposed_by_role,
    compatibilityHash: row.compatibility_hash,
    itemCount: Number(row.item_count),
    currency: row.currency,
    rentalSubtotalMinor: Number(row.rental_subtotal_minor),
    platformFeeMinor: Number(row.platform_fee_minor),
    totalMinor: Number(row.total_minor),
    ownerPayoutMinor: Number(row.owner_payout_minor),
    securityDepositMinor: Number(row.security_deposit_minor),
    quoteHash: row.quote_hash,
    items: row.quote_payload?.items ?? [],
  };
}

function assertCurrentQuote(candidate, quote) {
  if (identifier(candidate.quoteId, 'booking_group_quote_required') !== quote.id
    || text(candidate.quoteHash, 64) !== quote.quote_hash) {
    throw new BookingWorkflowError(409, 'booking_group_quote_changed');
  }
}

export function assertBookingGroupsEnabled(config) {
  if (config?.bookingGroups?.enabled !== true || config?.bookingGroups?.publicReleaseAllowed !== false) {
    throw new BookingWorkflowError(503, 'booking_groups_not_enabled');
  }
}

export async function requestBookingGroup(client, {
  actor,
  raw,
  idempotencyKey: rawKey,
  privatePilotAllowedRegions = [],
}) {
  const candidate = object(raw, 'invalid_booking_group_request');
  const key = idempotencyKey(rawKey ?? candidate.idempotencyKey);
  const listingIds = uniqueListingIds(candidate.listingIds, { minimum: 2 });
  const replay = await startCommand(client, {
    key,
    actorId: actor.id,
    type: 'booking_group.request',
    request: { ...candidate, listingIds },
  });
  if (replay) return replay;
  const listings = await groupListings(client, listingIds);
  const { first, handoverLocationKey } = assertCompatibleListings(listings, actor.id);
  const dates = parseRentalDates(candidate.startDate, candidate.endDate);
  if (!dates) throw new BookingWorkflowError(400, 'invalid_booking_group_rental_dates');
  const periodResult = await client.query(
    `SELECT ($1::date::timestamp AT TIME ZONE $3) AS starts_at,
            ($2::date::timestamp AT TIME ZONE $3) AS ends_at`,
    [dates.startDate, dates.endDate, first.availability_timezone],
  );
  const period = periodResult.rows[0];
  let group;
  try {
    group = buildBookingGroupFoundation({
      ownerId: first.owner_id,
      renterId: actor.id,
      marketplaceContext: groupPolicy.marketplaceContext,
      countryCode: first.country,
      currency: first.currency,
      startDate: dates.startDate,
      endDate: dates.endDate,
      timezone: first.availability_timezone,
      startsAt: period.starts_at,
      endsAt: period.ends_at,
      handoverLocationKey,
      handoverPolicyVersion: groupPolicy.handoverPolicyVersion,
      legalDocumentSetVersion: groupPolicy.legalDocumentSetVersion,
      cancellationPolicyVersion: groupPolicy.cancellationPolicyVersion,
      paymentConfigurationKey: groupPolicy.paymentConfigurationKey,
      items: listings.map((listing) => ({
        listingId: listing.id,
        ownerId: listing.owner_id,
        countryCode: listing.country,
        currency: listing.currency,
      })),
    });
  } catch (error) {
    translateDomainError(error);
  }
  await client.query(
    `INSERT INTO booking_groups (
       id, aggregate_version, owner_id, renter_id, marketplace_context,
       country_code, currency, rental_start_date, rental_end_date,
       rental_timezone, starts_at, ends_at, handover_location_key,
       handover_policy_version, legal_document_set_version,
       cancellation_policy_version, payment_configuration_key,
       compatibility_hash
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18
     )`,
    [
      group.id, group.aggregateVersion, group.ownerId, group.renterId,
      group.marketplaceContext, group.countryCode, group.currency,
      group.startDate, group.endDate, group.timezone, group.startsAt, group.endsAt,
      group.handoverLocationKey, group.handoverPolicyVersion,
      group.legalDocumentSetVersion, group.cancellationPolicyVersion,
      group.paymentConfigurationKey, group.compatibilityHash,
    ],
  );
  for (const position of group.positions) {
    await client.query(
      `INSERT INTO booking_group_positions (
         id, position_version, booking_group_id, listing_id, sort_order
       ) VALUES ($1, $2, $3, $4, $5)`,
      [position.id, position.positionVersion, group.id, position.listingId, position.sortOrder],
    );
  }
  const singleItems = await quoteItems(client, {
    actorId: actor.id,
    group,
    positions: group.positions,
    listingIds,
    allowedRegions: privatePilotAllowedRegions,
  });
  let quote;
  try {
    quote = buildBookingGroupQuote({
      bookingGroupId: group.id,
      quoteRevision: 1,
      proposalKind: 'initial',
      predecessorQuoteId: null,
      proposedById: actor.id,
      proposedByRole: 'renter',
      compatibilityHash: group.compatibilityHash,
      currency: group.currency,
      items: singleItems,
    });
  } catch (error) {
    translateDomainError(error);
  }
  const expiresAt = singleItems.reduce(
    (minimum, item) => Math.min(minimum, Date.parse(item.expiresAt)),
    Number.POSITIVE_INFINITY,
  );
  await persistGroupQuote(client, quote, new Date(expiresAt));
  const event = await appendEvent(client, {
    groupId: group.id,
    sequence: 1,
    actor,
    actorGroupRole: 'renter',
    eventType: 'booking_group.requested',
    fromState: null,
    toState: 'requested',
    quote,
    commandKey: key,
  });
  await writeAudit(client, {
    actor,
    action: 'booking_group.requested',
    groupId: group.id,
    metadata: { quoteHash: quote.quoteHash, itemCount: quote.itemCount },
  });
  const response = {
    group: { ...group, state: event.state },
    quote: publicQuote(quote, expiresAt),
    event,
    replayed: false,
  };
  await completeCommand(client, key, group.id, response);
  return response;
}

export async function decideBookingGroup(client, {
  actor,
  bookingGroupId,
  raw,
  idempotencyKey: rawKey,
  privatePilotAllowedRegions = [],
}) {
  const candidate = object(raw, 'invalid_booking_group_owner_decision');
  const key = idempotencyKey(rawKey ?? candidate.idempotencyKey);
  const groupId = identifier(bookingGroupId, 'invalid_booking_group_identifier');
  const current = await lockedGroupState(client, groupId);
  if (current.group.owner_id !== actor.id) {
    throw new BookingWorkflowError(403, 'booking_group_owner_forbidden');
  }
  const replay = await startCommand(client, {
    key,
    actorId: actor.id,
    type: 'booking_group.owner_decision',
    request: { bookingGroupId: groupId, candidate },
  });
  if (replay) return replay;
  if (current.event.to_state !== 'requested') {
    throw new BookingWorkflowError(409, 'booking_group_owner_decision_not_allowed');
  }
  assertCurrentQuote(candidate, current.quote);
  const action = text(candidate.action, 40);
  let quote = storedQuote(current.quote);
  let expiresAt = new Date(current.quote.expires_at);
  let eventType;
  let toState;
  if (action === 'accept_all') {
    const positionCount = await client.query(
      `SELECT count(*)::int AS count FROM booking_group_positions
        WHERE booking_group_id = $1`,
      [groupId],
    );
    if (quote.itemCount !== positionCount.rows[0].count) {
      throw new BookingWorkflowError(409, 'silent_partial_booking_group_acceptance_forbidden');
    }
    if (expiresAt.getTime() <= Date.now()) {
      throw new BookingWorkflowError(409, 'booking_group_quote_expired');
    }
    eventType = 'booking_group.owner_accepted_all';
    toState = 'owner_accepted';
  } else if (action === 'decline_all') {
    eventType = 'booking_group.owner_declined_all';
    toState = 'declined';
  } else if (action === 'counteroffer') {
    if (expiresAt.getTime() <= Date.now()) {
      throw new BookingWorkflowError(409, 'booking_group_quote_expired');
    }
    const selectedIds = uniqueListingIds(candidate.listingIds);
    const positionsResult = await client.query(
      `SELECT id, listing_id, sort_order
         FROM booking_group_positions
        WHERE booking_group_id = $1
        ORDER BY sort_order`,
      [groupId],
    );
    const availableIds = new Set(positionsResult.rows.map((row) => row.listing_id));
    if (selectedIds.some((id) => !availableIds.has(id))) {
      throw new BookingWorkflowError(409, 'booking_group_counteroffer_item_not_found');
    }
    const priorIds = new Set((current.quote.quote_payload?.items ?? []).map((item) => item.listingId));
    if (selectedIds.length === priorIds.size && selectedIds.every((id) => priorIds.has(id))) {
      throw new BookingWorkflowError(409, 'booking_group_counteroffer_item_set_unchanged');
    }
    const group = {
      startDate: current.group.rental_start_date_text,
      endDate: current.group.rental_end_date_text,
    };
    const positions = positionsResult.rows.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      sortOrder: Number(row.sort_order),
    }));
    const singleItems = await quoteItems(client, {
      actorId: current.group.renter_id,
      group,
      positions,
      listingIds: selectedIds,
      allowedRegions: privatePilotAllowedRegions,
    });
    try {
      quote = buildBookingGroupQuote({
        bookingGroupId: groupId,
        quoteRevision: Number(current.quote.quote_revision) + 1,
        proposalKind: 'owner_counteroffer',
        predecessorQuoteId: current.quote.id,
        proposedById: actor.id,
        proposedByRole: 'owner',
        compatibilityHash: current.group.compatibility_hash,
        currency: current.group.currency,
        items: singleItems,
      });
    } catch (error) {
      translateDomainError(error);
    }
    expiresAt = new Date(singleItems.reduce(
      (minimum, item) => Math.min(minimum, Date.parse(item.expiresAt)),
      Number.POSITIVE_INFINITY,
    ));
    await persistGroupQuote(client, quote, expiresAt);
    eventType = 'booking_group.owner_counteroffered';
    toState = 'counteroffered';
  } else {
    throw new BookingWorkflowError(400, 'invalid_booking_group_owner_decision');
  }
  const event = await appendEvent(client, {
    groupId,
    sequence: Number(current.event.event_sequence) + 1,
    actor,
    actorGroupRole: 'owner',
    eventType,
    fromState: 'requested',
    toState,
    quote,
    commandKey: key,
  });
  await writeAudit(client, {
    actor,
    action: eventType,
    groupId,
    metadata: { quoteHash: quote.quoteHash, itemCount: quote.itemCount },
  });
  const response = {
    bookingGroupId: groupId,
    state: toState,
    quote: publicQuote(quote, expiresAt),
    event,
    replayed: false,
  };
  await completeCommand(client, key, groupId, response);
  return response;
}

export async function acceptBookingGroupCounteroffer(client, {
  actor,
  bookingGroupId,
  raw,
  idempotencyKey: rawKey,
}) {
  const candidate = object(raw, 'invalid_booking_group_counteroffer_consent');
  const key = idempotencyKey(rawKey ?? candidate.idempotencyKey);
  const groupId = identifier(bookingGroupId, 'invalid_booking_group_identifier');
  const current = await lockedGroupState(client, groupId);
  if (current.group.renter_id !== actor.id) {
    throw new BookingWorkflowError(403, 'booking_group_renter_forbidden');
  }
  const replay = await startCommand(client, {
    key,
    actorId: actor.id,
    type: 'booking_group.renter_consent',
    request: { bookingGroupId: groupId, candidate },
  });
  if (replay) return replay;
  if (current.event.to_state !== 'counteroffered') {
    throw new BookingWorkflowError(409, 'booking_group_counteroffer_consent_not_allowed');
  }
  if (candidate.accepted !== true) {
    throw new BookingWorkflowError(400, 'explicit_booking_group_counteroffer_consent_required');
  }
  assertCurrentQuote(candidate, current.quote);
  if (new Date(current.quote.expires_at).getTime() <= Date.now()) {
    throw new BookingWorkflowError(409, 'booking_group_quote_expired');
  }
  const quote = storedQuote(current.quote);
  const event = await appendEvent(client, {
    groupId,
    sequence: Number(current.event.event_sequence) + 1,
    actor,
    actorGroupRole: 'renter',
    eventType: 'booking_group.renter_accepted_counteroffer',
    fromState: 'counteroffered',
    toState: 'counteroffer_accepted',
    quote,
    commandKey: key,
  });
  await writeAudit(client, {
    actor,
    action: 'booking_group.renter_accepted_counteroffer',
    groupId,
    metadata: { quoteHash: quote.quoteHash, itemCount: quote.itemCount },
  });
  const response = {
    bookingGroupId: groupId,
    state: event.state,
    quote: publicQuote(quote, current.quote.expires_at),
    event,
    replayed: false,
  };
  await completeCommand(client, key, groupId, response);
  return response;
}

export async function getBookingGroup(client, { actorId, bookingGroupId }) {
  const groupId = identifier(bookingGroupId, 'invalid_booking_group_identifier');
  const current = await lockedGroupState(client, groupId);
  if (![current.group.owner_id, current.group.renter_id].includes(actorId)) {
    throw new BookingWorkflowError(403, 'booking_group_forbidden');
  }
  let previousQuote = null;
  if (current.quote.predecessor_quote_id) {
    const previousResult = await client.query(
      `SELECT id, booking_group_id, quote_revision, predecessor_quote_id,
              proposal_kind, proposed_by_id, proposed_by_role,
              compatibility_hash, item_count, currency, rental_subtotal_minor,
              platform_fee_minor, total_minor, owner_payout_minor,
              security_deposit_minor, quote_payload, quote_hash, issued_at, expires_at
         FROM booking_group_quotes
        WHERE id = $1 AND booking_group_id = $2`,
      [current.quote.predecessor_quote_id, groupId],
    );
    if (!previousResult.rowCount) {
      throw new BookingWorkflowError(409, 'booking_group_predecessor_quote_not_found');
    }
    const previous = previousResult.rows[0];
    previousQuote = publicQuote(storedQuote(previous), previous.expires_at);
  }
  return {
    bookingGroupId: groupId,
    ownerId: current.group.owner_id,
    renterId: current.group.renter_id,
    state: current.event.to_state,
    quote: publicQuote(storedQuote(current.quote), current.quote.expires_at),
    previousQuote,
  };
}
