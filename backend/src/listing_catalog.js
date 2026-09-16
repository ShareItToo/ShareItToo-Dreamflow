import {
  assertPrivatePilotListing,
  privatePilotListingFields,
  PrivatePilotValidationError,
} from './private_pilot_domain.js';

const listingStatuses = new Set(['draft', 'active', 'paused', 'ended']);
const listingConditions = new Set([
  'new',
  'like-new',
  'good',
  'acceptable',
  'worn',
  'used',
]);

export class ListingValidationError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerInRange(value, minimum, maximum) {
  const number = finiteNumber(value);
  if (number === null || !Number.isInteger(number)) return null;
  return number >= minimum && number <= maximum ? number : null;
}

function currency(value) {
  const normalized = text(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'EUR';
}

function normalizedDiscounts(value) {
  if (!Array.isArray(value)) return [];
  const byDays = new Map();
  for (const raw of value.slice(0, 10)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const days = integerInRange(raw.days, 2, 3650);
    const discountPercent = finiteNumber(raw.discountPercent);
    if (days === null || discountPercent === null || discountPercent < 0 || discountPercent > 90) continue;
    byDays.set(days, { days, discountPercent: Math.round(discountPercent * 100) / 100 });
  }
  return [...byDays.values()].sort((left, right) => left.days - right.days);
}

export function normalizeListingPayload(raw, {
  id,
  ownerId,
  existing = null,
  now = new Date(),
  privatePilot = false,
  privatePilotAllowedRegions = [],
} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ListingValidationError('invalid_listing');
  }
  if (privatePilot) {
    try {
      assertPrivatePilotListing(raw, { allowedRegions: privatePilotAllowedRegions });
    } catch (error) {
      if (error instanceof PrivatePilotValidationError) {
        throw new ListingValidationError(error.code);
      }
      throw error;
    }
  }
  const title = text(raw.title, 160);
  const description = text(raw.description, 10_000);
  const categoryId = text(raw.categoryId, 80);
  const subcategory = text(raw.subcategory, 120);
  const condition = text(raw.condition, 30);
  const pricePerDay = finiteNumber(raw.pricePerDay);
  const priceUnit = ['day', 'week'].includes(raw.priceUnit) ? raw.priceUnit : 'day';
  const priceRaw = finiteNumber(raw.priceRaw) ?? pricePerDay;
  const locationText = text(raw.locationText, 500);
  const city = text(raw.city, 120);
  const country = text(raw.country, 120);
  const latitude = finiteNumber(raw.lat);
  const longitude = finiteNumber(raw.lng);
  const requestedStatus = text(raw.status, 30);
  const status = listingStatuses.has(requestedStatus)
    ? requestedStatus
    : (raw.isActive === false ? 'draft' : 'active');
  const minDays = integerInRange(raw.minDays, 1, 3650) ?? 1;
  const maxDays = integerInRange(raw.maxDays, 1, 3650) ?? 30;
  if (minDays > maxDays) throw new ListingValidationError('invalid_listing_duration');
  const maxDeliveryKmAtDropoff = finiteNumber(raw.maxDeliveryKmAtDropoff);
  const maxPickupKmAtReturn = finiteNumber(raw.maxPickupKmAtReturn);
  const handoverRadiusKm = finiteNumber(raw.handoverRadiusKm)
    ?? maxDeliveryKmAtDropoff
    ?? maxPickupKmAtReturn;
  if (handoverRadiusKm !== null && (handoverRadiusKm < 0 || handoverRadiusKm > 500)) {
    throw new ListingValidationError('invalid_handover_radius');
  }
  const photos = Array.isArray(raw.photos)
    ? [...new Set(raw.photos.slice(0, 12).map((photo) => text(photo, 4000)).filter(Boolean))]
    : [];
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.slice(0, 20).map((tag) => text(tag, 50)).filter(Boolean))]
    : [];

  if (title.length < 3) throw new ListingValidationError('listing_title_required');
  if (description.length < 10) throw new ListingValidationError('listing_description_too_short');
  if (!categoryId) throw new ListingValidationError('listing_category_required');
  if (!listingConditions.has(condition)) throw new ListingValidationError('invalid_listing_condition');
  if (pricePerDay === null || pricePerDay <= 0 || pricePerDay > 1_000_000) {
    throw new ListingValidationError('invalid_listing_price');
  }
  if (priceRaw === null || priceRaw <= 0 || priceRaw > 7_000_000) {
    throw new ListingValidationError('invalid_listing_price');
  }
  if (!locationText || !city || !country) throw new ListingValidationError('listing_location_required');
  if (latitude === null || latitude < -90 || latitude > 90
      || longitude === null || longitude < -180 || longitude > 180) {
    throw new ListingValidationError('invalid_listing_coordinates');
  }
  if (status === 'active' && photos.length === 0) {
    throw new ListingValidationError('listing_photo_required');
  }

  const createdAt = existing?.createdAt
    ?? (Number.isFinite(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : now.toISOString());
  const endedAt = status === 'ended'
    ? (Number.isFinite(Date.parse(raw.endedAt)) ? new Date(raw.endedAt).toISOString() : now.toISOString())
    : null;
  const isActive = status === 'active';

  const pilotFields = privatePilot
    ? privatePilotListingFields(raw, { allowedRegions: privatePilotAllowedRegions })
    : null;
  const existingSupplyEnrichment = existing?.supplyEnrichment;
  const preserveSupplyEnrichment = existingSupplyEnrichment != null
    && existingSupplyEnrichment?.detectionBasis?.categoryId === categoryId
    && existingSupplyEnrichment?.detectionBasis?.subcategory === subcategory;
  return {
    id,
    ownerId,
    title,
    description,
    categoryId,
    subcategory,
    tags,
    pricePerDay: Math.round(pricePerDay * 100) / 100,
    currency: currency(raw.currency),
    priceUnit,
    priceRaw: Math.round(priceRaw * 100) / 100,
    // Kept on the wire for old clients, but the launch product has no deposit.
    deposit: null,
    autoApplyDiscounts: raw.autoApplyDiscounts === true,
    longRentalDiscounts: normalizedDiscounts(raw.longRentalDiscounts),
    photos,
    locationText,
    lat: latitude,
    lng: longitude,
    geohash: text(raw.geohash, 30),
    condition,
    minDays,
    maxDays,
    createdAt,
    isActive,
    verificationStatus: existing?.verificationStatus ?? 'pending',
    city,
    country,
    status,
    endedAt,
    timesLent: existing?.timesLent ?? 0,
    offersDeliveryAtDropoff:
      pilotFields?.offersDeliveryAtDropoff ?? raw.offersDeliveryAtDropoff === true,
    offersPickupAtReturn:
      pilotFields?.offersPickupAtReturn ?? raw.offersPickupAtReturn === true,
    offersExpressAtDropoff: false,
    maxDeliveryKmAtDropoff:
      pilotFields?.maxDeliveryKmAtDropoff ?? maxDeliveryKmAtDropoff,
    maxPickupKmAtReturn:
      pilotFields?.maxPickupKmAtReturn ?? maxPickupKmAtReturn,
    handoverRadiusKm: pilotFields?.handoverRadiusKm ?? handoverRadiusKm,
    privateStatusConfirmed:
      pilotFields?.privateStatusConfirmed ?? raw.privateStatusConfirmed === true,
    pilotRegionCode: pilotFields?.pilotRegionCode ?? '',
    cancellationPolicy: ['flexible', 'moderate', 'strict', 'unified'].includes(raw.cancellationPolicy)
      ? raw.cancellationPolicy
      : 'unified',
    // Kept on the wire for old clients, but no protection product is offered.
    protectionModel: 'none',
    availabilityMode: 'calendar',
    // Server-owned G5A evidence is never accepted from the client. Preserve an
    // existing session across ordinary owner edits until its own route changes it.
    ...(preserveSupplyEnrichment
      ? { supplyEnrichment: existingSupplyEnrichment }
      : {}),
  };
}

export function listingProjection(payload) {
  return {
    status: payload.status,
    isActive: payload.status === 'active',
    title: payload.title,
    description: payload.description,
    categoryId: payload.categoryId,
    subcategory: payload.subcategory || null,
    condition: payload.condition,
    locationText: payload.locationText,
    city: payload.city,
    country: payload.country,
    latitude: payload.lat,
    longitude: payload.lng,
    minDays: payload.minDays,
    maxDays: payload.maxDays,
    handoverRadiusKm: payload.handoverRadiusKm,
    protectionModel: payload.protectionModel,
    pilotRegionCode: payload.pilotRegionCode || null,
    publishedAt: payload.status === 'active' ? new Date().toISOString() : null,
    endedAt: payload.endedAt,
  };
}

export function storageNameFromListingPhoto(photoUrl, publicBaseUrl) {
  let photo;
  let base;
  try {
    photo = new URL(photoUrl);
    base = new URL(publicBaseUrl);
  } catch {
    return null;
  }
  const prefix = `${base.pathname.replace(/\/$/, '')}/uploads/`;
  if (photo.origin !== base.origin || !photo.pathname.startsWith(prefix)) return null;
  const storageName = decodeURIComponent(photo.pathname.slice(prefix.length));
  return /^[0-9a-f-]{36}-full\.(?:webp|jpe?g|png)$/i.test(storageName)
    ? storageName
    : null;
}

export function shapePublicListing(payload, { distanceKm = null } = {}) {
  const { supplyEnrichment, ...publicPayload } = payload;
  const latitude = finiteNumber(payload.lat);
  const longitude = finiteNumber(payload.lng);
  const city = text(payload.city, 120);
  const country = text(payload.country, 120);
  const includedAccessories = Array.isArray(supplyEnrichment?.suggestions)
    ? supplyEnrichment.suggestions
      .filter((entry) => entry?.outcome === 'included_accessory'
        && entry?.documentation?.ownerConfirmed === true)
      .slice(0, 3)
      .map((entry) => text(entry?.documentation?.label, 120))
      .filter(Boolean)
    : [];
  return {
    ...publicPayload,
    includedAccessories,
    locationText: [city, country].filter(Boolean).join(', '),
    lat: latitude === null ? null : Math.round(latitude * 100) / 100,
    lng: longitude === null ? null : Math.round(longitude * 100) / 100,
    geohash: '',
    approximateLocation: true,
    ...(distanceKm === null ? {} : { distanceKm: Math.round(distanceKm * 10) / 10 }),
  };
}

export function parseCatalogQuery(query = {}) {
  const q = text(query.q, 120);
  const categories = text(query.categories ?? query.category, 1000)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 30);
  const conditions = text(query.conditions ?? query.condition, 300)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => listingConditions.has(entry))
    .slice(0, 10);
  const minPrice = finiteNumber(query.minPrice);
  const maxPrice = finiteNumber(query.maxPrice);
  const latitude = finiteNumber(query.lat);
  const longitude = finiteNumber(query.lng);
  const radiusKm = finiteNumber(query.radiusKm);
  const sort = ['newest', 'price_asc', 'price_desc', 'distance'].includes(query.sort)
    ? query.sort
    : 'newest';
  const limit = Math.min(Math.max(integerInRange(Number(query.limit ?? 50), 1, 100) ?? 50, 1), 100);
  const offset = Math.min(Math.max(integerInRange(Number(query.offset ?? 0), 0, 5000) ?? 0, 0), 5000);
  const hasLocation = latitude !== null && latitude >= -90 && latitude <= 90
    && longitude !== null && longitude >= -180 && longitude <= 180;
  return {
    q,
    categories,
    conditions,
    minPrice: minPrice !== null && minPrice >= 0 ? minPrice : null,
    maxPrice: maxPrice !== null && maxPrice >= 0 ? maxPrice : null,
    latitude: hasLocation ? latitude : null,
    longitude: hasLocation ? longitude : null,
    radiusKm: hasLocation && radiusKm !== null && radiusKm > 0 && radiusKm <= 500 ? radiusKm : null,
    sort: sort === 'distance' && !hasLocation ? 'newest' : sort,
    limit,
    offset,
  };
}
