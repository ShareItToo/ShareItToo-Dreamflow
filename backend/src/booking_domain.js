export const bookingStatuses = Object.freeze([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'running',
  'completed',
]);

export const bookingWorkflowStatuses = Object.freeze([
  'draft',
  'requested',
  'accepted',
  'payment_pending',
  'confirmed',
  'active',
  'withdrawalReturnRequired',
  'returned',
  'completed',
  'declined',
  'cancelled',
  'refunded',
  'disputed',
]);

const bookingStatusSet = new Set(bookingStatuses);
const bookingWorkflowStatusSet = new Set(bookingWorkflowStatuses);

const workflowTransitions = Object.freeze({
  draft: Object.freeze({ requested: ['renter'], cancelled: ['renter'] }),
  requested: Object.freeze({
    accepted: ['owner'],
    declined: ['owner'],
    cancelled: ['renter'],
  }),
  accepted: Object.freeze({
    payment_pending: ['owner', 'system'],
    confirmed: ['renter', 'system'],
    cancelled: ['owner', 'renter', 'system'],
    disputed: ['owner', 'renter'],
  }),
  payment_pending: Object.freeze({
    confirmed: ['system', 'admin'],
    cancelled: ['owner', 'renter', 'system'],
    disputed: ['owner', 'renter'],
  }),
  confirmed: Object.freeze({
    active: ['renter'],
    cancelled: ['owner', 'renter', 'system'],
    disputed: ['owner', 'renter'],
  }),
  active: Object.freeze({
    returned: ['owner'],
    disputed: ['owner', 'renter'],
  }),
  withdrawalReturnRequired: Object.freeze({
    returned: ['owner', 'system'],
    disputed: ['owner', 'renter'],
  }),
  returned: Object.freeze({
    completed: ['owner', 'system'],
    disputed: ['owner', 'renter'],
  }),
  completed: Object.freeze({ disputed: ['owner', 'renter'] }),
  declined: Object.freeze({}),
  cancelled: Object.freeze({ refunded: ['system', 'admin'] }),
  refunded: Object.freeze({}),
  disputed: Object.freeze({ completed: ['admin'], refunded: ['admin'] }),
});

export function normalizeBookingStatus(value, fallback = 'pending') {
  return bookingStatusSet.has(value) ? value : fallback;
}

export function normalizeBookingWorkflowStatus(value, fallback = 'requested') {
  return bookingWorkflowStatusSet.has(value) ? value : fallback;
}

export function legacyStatusForWorkflow(value) {
  switch (normalizeBookingWorkflowStatus(value)) {
    case 'accepted':
    case 'payment_pending':
    case 'confirmed':
      return 'accepted';
    case 'active':
    case 'withdrawalReturnRequired':
    case 'returned':
      return 'running';
    case 'completed':
    case 'refunded':
    case 'disputed':
      return 'completed';
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'draft':
    case 'requested':
    default:
      return 'pending';
  }
}

export function workflowStatusForLegacy(value) {
  switch (normalizeBookingStatus(value)) {
    case 'accepted': return 'accepted';
    case 'declined': return 'declined';
    case 'cancelled': return 'cancelled';
    case 'running': return 'active';
    case 'completed': return 'completed';
    case 'pending':
    default: return 'requested';
  }
}

export function parseBookingPeriod(startValue, endValue) {
  const startsAt = new Date(startValue);
  const endsAt = new Date(endValue);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  if (startsAt >= endsAt) return null;
  return { startsAt, endsAt };
}

const rentalDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function validRentalDate(value) {
  const match = typeof value === 'string' ? rentalDatePattern.exec(value) : null;
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { value, utc };
}

export function parseRentalDates(startValue, endValue, { maxDays = 365 } = {}) {
  const start = validRentalDate(startValue);
  const end = validRentalDate(endValue);
  if (!start || !end || start.utc >= end.utc) return null;
  const days = Math.round((end.utc.getTime() - start.utc.getTime()) / 86_400_000);
  if (!Number.isSafeInteger(days) || days < 1 || days > maxDays) return null;
  return { startDate: start.value, endDate: end.value, days };
}

export function datePart(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.slice(0, 10);
  return validRentalDate(candidate)?.value ?? null;
}

export function normalizeCurrency(value, fallback = 'EUR') {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

export function amountToMinor(value, { nullable = true } = {}) {
  if (value === null || value === undefined || value === '') return nullable ? null : 0;
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const minor = Math.round((amount + Number.EPSILON) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function platformFeeMinor(rentalSubtotalMinor) {
  if (!Number.isSafeInteger(rentalSubtotalMinor) || rentalSubtotalMinor <= 0) return 0;
  // Privat-Launch V5.1: exactly 10% of the discounted owner rental subtotal.
  // Keep the calculation in minor units and round half-up once at the end.
  return Math.floor((rentalSubtotalMinor * 1_000 + 5_000) / 10_000);
}

function normalizedDiscountTiers(value) {
  if (!Array.isArray(value)) return [];
  const byDays = new Map();
  for (const raw of value) {
    const days = Number.parseInt(raw?.days, 10);
    const percent = Number(raw?.discountPercent);
    if (!Number.isSafeInteger(days) || days < 2 || days > 365) continue;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 90) continue;
    const discountBasisPoints = Math.round(percent * 100);
    if (discountBasisPoints <= 0 || discountBasisPoints > 9_000) continue;
    const previous = byDays.get(days) ?? 0;
    if (discountBasisPoints > previous) byDays.set(days, discountBasisPoints);
  }
  return [...byDays.entries()]
    .map(([days, discountBasisPoints]) => ({ days, discountBasisPoints }))
    .sort((left, right) => left.days - right.days);
}

function formatDiscountPercent(discountBasisPoints) {
  const whole = Math.trunc(discountBasisPoints / 100);
  const fraction = discountBasisPoints % 100;
  if (fraction === 0) return String(whole);
  return `${whole},${String(fraction).padStart(2, '0').replace(/0+$/u, '')}`;
}

export function quoteRental({
  days,
  pricePerDayMinor,
  minimumDays = 1,
  maximumDays = 365,
  autoApplyDiscounts = false,
  discountTiers = [],
  deliveryFeeMinor = 0,
  pickupFeeMinor = 0,
  expressFeeMinor = 0,
  currency = 'EUR',
}) {
  if (!Number.isSafeInteger(days) || days < minimumDays || days > maximumDays) return null;
  if (!Number.isSafeInteger(pricePerDayMinor) || pricePerDayMinor < 0) return null;
  const baseRentalMinor = pricePerDayMinor * days;
  if (!Number.isSafeInteger(baseRentalMinor)) return null;
  let selectedDiscountTier = null;
  if (autoApplyDiscounts) {
    for (const tier of normalizedDiscountTiers(discountTiers)) {
      if (tier.days <= days && (
        selectedDiscountTier === null
        || tier.discountBasisPoints > selectedDiscountTier.discountBasisPoints
      )) {
        selectedDiscountTier = tier;
      }
    }
  }
  const discountBasisPoints = selectedDiscountTier?.discountBasisPoints ?? 0;
  const discountPercent = discountBasisPoints / 100;
  const discountMinor = Math.min(
    baseRentalMinor,
    Math.floor((baseRentalMinor * discountBasisPoints + 5_000) / 10_000),
  );
  const rentalSubtotalMinor = baseRentalMinor - discountMinor;
  const platformContributionMinor = platformFeeMinor(rentalSubtotalMinor);
  const safeExtra = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
  const delivery = safeExtra(deliveryFeeMinor);
  const pickup = safeExtra(pickupFeeMinor);
  const express = safeExtra(expressFeeMinor);
  const expressPlatformMinor = express > 0 ? Math.round(express * 0.1) : 0;
  const totalMinor = rentalSubtotalMinor + platformContributionMinor + delivery + pickup + express + expressPlatformMinor;
  const ownerPayoutMinor = rentalSubtotalMinor + delivery + pickup + express;
  const discountThresholdDays = selectedDiscountTier?.days ?? null;
  return Object.freeze({
    quoteVersion: 3,
    currency: normalizeCurrency(currency),
    days,
    pricePerDayMinor,
    baseRentalMinor,
    discountPercent,
    discountId: selectedDiscountTier
      ? `listing_long_rental_${discountThresholdDays}d_${discountBasisPoints}bp`
      : null,
    discountLabel: selectedDiscountTier
      ? `Rabatt ab ${discountThresholdDays} Tagen (${formatDiscountPercent(discountBasisPoints)} %)`
      : null,
    discountFundingSource: selectedDiscountTier ? 'owner' : null,
    discountThresholdDays,
    discountMinor,
    rentalSubtotalMinor,
    platformFeeMinor: platformContributionMinor,
    deliveryFeeMinor: delivery,
    pickupFeeMinor: pickup,
    expressFeeMinor: express,
    expressPlatformFeeMinor: expressPlatformMinor,
    totalMinor,
    ownerPayoutMinor,
    securityDepositMinor: 0,
  });
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [aLat, aLon, bLat, bLon] = values;
  if (Math.abs(aLat) > 90 || Math.abs(bLat) > 90 || Math.abs(aLon) > 180 || Math.abs(bLon) > 180) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(bLat - aLat);
  const deltaLon = radians(bLon - aLon);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(deltaLon / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function deliveryFeeForDistanceMinor(km) {
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.max(300, Math.round(km * 2 * 30));
}

export function actorRoleForBooking({ actorId, actorSystemRole = 'user', ownerId, renterId }) {
  if (actorSystemRole === 'admin') return 'admin';
  if (actorId === ownerId) return 'owner';
  if (actorId === renterId) return 'renter';
  return 'outsider';
}

export function canTransitionWorkflow({ current, next, actorRole, pilotWithoutPayment = false }) {
  const normalizedCurrent = normalizeBookingWorkflowStatus(current, null);
  const normalizedNext = normalizeBookingWorkflowStatus(next, null);
  if (!normalizedCurrent || !normalizedNext) return false;
  if (normalizedCurrent === normalizedNext) return true;
  if (pilotWithoutPayment && normalizedCurrent === 'accepted' && normalizedNext === 'confirmed') {
    return actorRole === 'renter' || actorRole === 'system';
  }
  return workflowTransitions[normalizedCurrent]?.[normalizedNext]?.includes(actorRole) === true;
}

export function canTransitionBooking({ current, next, actorId, ownerId, renterId }) {
  if (current === next) return true;
  if (current === 'pending' && (next === 'accepted' || next === 'declined')) return actorId === ownerId;
  if (current === 'pending' && next === 'cancelled') return actorId === renterId;
  if (current === 'accepted' && next === 'running') return actorId === renterId;
  if (current === 'accepted' && next === 'cancelled') return actorId === ownerId || actorId === renterId;
  if (current === 'running' && next === 'completed') return actorId === ownerId;
  return false;
}
