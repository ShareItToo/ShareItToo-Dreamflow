import crypto from 'node:crypto';

import { parseBookingPeriod, parseRentalDates } from './booking_domain.js';

export const bookingGroupSchemaVersion = 1;
export const bookingGroupPositionVersion = 1;
export const bookingGroupQuoteSchemaVersion = 1;
export const maximumBookingGroupPositions = 20;

export class BookingGroupDomainError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function text(value, code, maximum = 120) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || candidate.length > maximum) throw new BookingGroupDomainError(code);
  return candidate;
}

function token(value, code) {
  const candidate = text(value, code);
  if (!/^[A-Za-z0-9_.:-]+$/u.test(candidate)) throw new BookingGroupDomainError(code);
  return candidate;
}

function currency(value) {
  const candidate = text(value, 'invalid_booking_group_currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(candidate)) {
    throw new BookingGroupDomainError('invalid_booking_group_currency');
  }
  return candidate;
}

function country(value) {
  const candidate = text(value, 'invalid_booking_group_country', 40).toLowerCase();
  if (!['de', 'deutschland', 'germany'].includes(candidate)) {
    throw new BookingGroupDomainError('booking_group_country_not_allowed');
  }
  return 'DE';
}

function hash(value, code) {
  const candidate = text(value, code, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(candidate)) throw new BookingGroupDomainError(code);
  return candidate;
}

function uuid(value, code) {
  const candidate = value();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    .test(candidate)) {
    throw new BookingGroupDomainError(code);
  }
  return candidate;
}

function compatibilityHash(parts) {
  return crypto.createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function safeMinor(value, code) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new BookingGroupDomainError(code);
  }
  return candidate;
}

function freezeQuoteItem(raw, index, expectedCurrency) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BookingGroupDomainError('invalid_booking_group_quote_item');
  }
  const groupPositionId = token(
    raw.groupPositionId,
    'invalid_booking_group_quote_position',
  );
  const listingId = token(raw.listingId, 'invalid_booking_group_quote_listing');
  const bookingQuoteId = token(
    raw.bookingQuoteId,
    'invalid_booking_group_single_quote',
  );
  const bookingQuoteHash = hash(
    raw.bookingQuoteHash,
    'invalid_booking_group_single_quote_hash',
  );
  const itemCurrency = currency(raw.currency);
  if (itemCurrency !== expectedCurrency) {
    throw new BookingGroupDomainError('booking_group_quote_currency_mismatch');
  }
  const rentalSubtotalMinor = safeMinor(
    raw.rentalSubtotalMinor,
    'invalid_booking_group_rental_subtotal',
  );
  const platformFeeMinor = safeMinor(
    raw.platformFeeMinor,
    'invalid_booking_group_platform_fee',
  );
  const totalMinor = safeMinor(raw.totalMinor, 'invalid_booking_group_total');
  const ownerPayoutMinor = safeMinor(
    raw.ownerPayoutMinor,
    'invalid_booking_group_owner_payout',
  );
  const securityDepositMinor = safeMinor(
    raw.securityDepositMinor,
    'invalid_booking_group_security_deposit',
  );
  if (securityDepositMinor !== 0
    || rentalSubtotalMinor > ownerPayoutMinor
    || ownerPayoutMinor + platformFeeMinor !== totalMinor) {
    throw new BookingGroupDomainError('invalid_booking_group_item_allocation');
  }
  return Object.freeze({
    groupPositionId,
    listingId,
    bookingQuoteId,
    bookingQuoteHash,
    currency: itemCurrency,
    rentalSubtotalMinor,
    platformFeeMinor,
    totalMinor,
    ownerPayoutMinor,
    securityDepositMinor,
    sortOrder: index,
  });
}

export function buildBookingGroupFoundation(raw, { idFactory = crypto.randomUUID } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BookingGroupDomainError('invalid_booking_group_payload');
  }
  const ownerId = token(raw.ownerId, 'invalid_booking_group_owner');
  const renterId = token(raw.renterId, 'invalid_booking_group_renter');
  if (ownerId === renterId) throw new BookingGroupDomainError('cannot_rent_own_booking_group');
  const marketplaceContext = token(
    raw.marketplaceContext ?? 'private_c2c',
    'invalid_booking_group_marketplace_context',
  );
  if (marketplaceContext !== 'private_c2c') {
    throw new BookingGroupDomainError('booking_group_marketplace_context_not_allowed');
  }
  const countryCode = country(raw.countryCode);
  const currencyCode = currency(raw.currency);
  const period = parseRentalDates(raw.startDate, raw.endDate);
  if (!period) throw new BookingGroupDomainError('invalid_booking_group_rental_dates');
  const instants = parseBookingPeriod(raw.startsAt, raw.endsAt);
  if (!instants) throw new BookingGroupDomainError('invalid_booking_group_period');
  const timezone = text(raw.timezone, 'invalid_booking_group_timezone');
  const handoverLocationKey = hash(
    raw.handoverLocationKey,
    'invalid_booking_group_handover_location_key',
  );
  const handoverPolicyVersion = token(
    raw.handoverPolicyVersion,
    'invalid_booking_group_handover_policy',
  );
  const legalDocumentSetVersion = token(
    raw.legalDocumentSetVersion,
    'invalid_booking_group_legal_document_set',
  );
  const cancellationPolicyVersion = token(
    raw.cancellationPolicyVersion,
    'invalid_booking_group_cancellation_policy',
  );
  const paymentConfigurationKey = token(
    raw.paymentConfigurationKey,
    'invalid_booking_group_payment_configuration',
  );
  if (!Array.isArray(raw.items)
    || raw.items.length < 2
    || raw.items.length > maximumBookingGroupPositions) {
    throw new BookingGroupDomainError('invalid_booking_group_item_count');
  }

  const seenListings = new Set();
  const positions = raw.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BookingGroupDomainError('invalid_booking_group_item');
    }
    const listingId = token(item.listingId, 'invalid_booking_group_listing');
    if (seenListings.has(listingId)) {
      throw new BookingGroupDomainError('duplicate_booking_group_listing');
    }
    seenListings.add(listingId);
    if (token(item.ownerId, 'invalid_booking_group_item_owner') !== ownerId) {
      throw new BookingGroupDomainError('booking_group_item_owner_mismatch');
    }
    if (country(item.countryCode) !== countryCode) {
      throw new BookingGroupDomainError('booking_group_item_country_mismatch');
    }
    if (currency(item.currency) !== currencyCode) {
      throw new BookingGroupDomainError('booking_group_item_currency_mismatch');
    }
    return Object.freeze({
      id: `booking_group_position_${uuid(
        idFactory,
        'invalid_booking_group_position_identifier',
      )}`,
      positionVersion: bookingGroupPositionVersion,
      listingId,
      sortOrder: index,
    });
  });

  const group = Object.freeze({
    id: `booking_group_${uuid(idFactory, 'invalid_booking_group_identifier')}`,
    aggregateVersion: bookingGroupSchemaVersion,
    ownerId,
    renterId,
    marketplaceContext,
    countryCode,
    currency: currencyCode,
    startDate: period.startDate,
    endDate: period.endDate,
    timezone,
    startsAt: instants.startsAt.toISOString(),
    endsAt: instants.endsAt.toISOString(),
    handoverLocationKey,
    handoverPolicyVersion,
    legalDocumentSetVersion,
    cancellationPolicyVersion,
    paymentConfigurationKey,
    compatibilityHash: compatibilityHash([
      ownerId,
      renterId,
      marketplaceContext,
      countryCode,
      currencyCode,
      period.startDate,
      period.endDate,
      timezone,
      handoverLocationKey,
      handoverPolicyVersion,
      legalDocumentSetVersion,
      cancellationPolicyVersion,
      paymentConfigurationKey,
    ]),
    positions: Object.freeze(positions),
  });
  return group;
}

export function buildBookingGroupQuote(raw, { idFactory = crypto.randomUUID } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BookingGroupDomainError('invalid_booking_group_quote_payload');
  }
  const bookingGroupId = token(raw.bookingGroupId, 'invalid_booking_group_identifier');
  const quoteRevision = Number(raw.quoteRevision);
  if (!Number.isSafeInteger(quoteRevision) || quoteRevision < 1) {
    throw new BookingGroupDomainError('invalid_booking_group_quote_revision');
  }
  const proposalKind = token(raw.proposalKind, 'invalid_booking_group_proposal_kind');
  if (!['initial', 'owner_counteroffer'].includes(proposalKind)) {
    throw new BookingGroupDomainError('invalid_booking_group_proposal_kind');
  }
  const proposedById = token(raw.proposedById, 'invalid_booking_group_quote_actor');
  const proposedByRole = token(raw.proposedByRole, 'invalid_booking_group_quote_actor_role');
  if ((proposalKind === 'initial' && proposedByRole !== 'renter')
    || (proposalKind === 'owner_counteroffer' && proposedByRole !== 'owner')) {
    throw new BookingGroupDomainError('booking_group_quote_actor_mismatch');
  }
  const predecessorQuoteId = raw.predecessorQuoteId == null
    ? null
    : token(raw.predecessorQuoteId, 'invalid_booking_group_predecessor_quote');
  if ((quoteRevision === 1 || proposalKind === 'initial') && predecessorQuoteId !== null) {
    throw new BookingGroupDomainError('invalid_booking_group_predecessor_quote');
  }
  if ((quoteRevision > 1 || proposalKind === 'owner_counteroffer')
    && predecessorQuoteId === null) {
    throw new BookingGroupDomainError('booking_group_predecessor_quote_required');
  }
  const compatibility = hash(
    raw.compatibilityHash,
    'invalid_booking_group_compatibility_hash',
  );
  const quoteCurrency = currency(raw.currency);
  if (!Array.isArray(raw.items)
    || raw.items.length < 1
    || raw.items.length > maximumBookingGroupPositions) {
    throw new BookingGroupDomainError('invalid_booking_group_quote_item_count');
  }
  const seenPositions = new Set();
  const seenListings = new Set();
  const seenQuotes = new Set();
  const items = raw.items.map((item, index) => {
    const normalized = freezeQuoteItem(item, index, quoteCurrency);
    if (seenPositions.has(normalized.groupPositionId)
      || seenListings.has(normalized.listingId)
      || seenQuotes.has(normalized.bookingQuoteId)) {
      throw new BookingGroupDomainError('duplicate_booking_group_quote_item');
    }
    seenPositions.add(normalized.groupPositionId);
    seenListings.add(normalized.listingId);
    seenQuotes.add(normalized.bookingQuoteId);
    return normalized;
  });
  const totals = items.reduce((result, item) => ({
    rentalSubtotalMinor: result.rentalSubtotalMinor + item.rentalSubtotalMinor,
    platformFeeMinor: result.platformFeeMinor + item.platformFeeMinor,
    totalMinor: result.totalMinor + item.totalMinor,
    ownerPayoutMinor: result.ownerPayoutMinor + item.ownerPayoutMinor,
    securityDepositMinor: result.securityDepositMinor + item.securityDepositMinor,
  }), {
    rentalSubtotalMinor: 0,
    platformFeeMinor: 0,
    totalMinor: 0,
    ownerPayoutMinor: 0,
    securityDepositMinor: 0,
  });
  if (!Object.values(totals).every(Number.isSafeInteger)) {
    throw new BookingGroupDomainError('booking_group_quote_total_overflow');
  }
  const quotePayload = Object.freeze({
    schemaVersion: bookingGroupQuoteSchemaVersion,
    bookingGroupId,
    quoteRevision,
    proposalKind,
    predecessorQuoteId,
    proposedById,
    proposedByRole,
    compatibilityHash: compatibility,
    currency: quoteCurrency,
    itemCount: items.length,
    ...totals,
    items: Object.freeze(items),
  });
  return Object.freeze({
    id: `booking_group_quote_${uuid(idFactory, 'invalid_booking_group_quote_identifier')}`,
    ...quotePayload,
    quoteHash: crypto
      .createHash('sha256')
      .update(JSON.stringify(stable(quotePayload)), 'utf8')
      .digest('hex'),
  });
}
