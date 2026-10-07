import crypto from 'node:crypto';

import { parseRentalDates } from './booking_domain.js';
import { BookingWorkflowError, quoteBooking } from './booking_workflow.js';

export const listingSetVersion = 'G5B-2026-08-21.1';
export const maximumListingSetMembers = 12;

const setKinds = new Set(['sit_set', 'one_stop_set']);
const setStatuses = new Set(['active', 'paused', 'ended']);
const memberRoles = new Set(['required', 'optional']);

export class ListingSetError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code = 'invalid_listing_set_payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ListingSetError(400, code);
  }
  return { ...value };
}

function text(value, maximum = 120) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function identifier(value, code) {
  const candidate = text(value, 120);
  if (!/^[A-Za-z0-9_.:-]{8,120}$/u.test(candidate)) {
    throw new ListingSetError(400, code);
  }
  return candidate;
}

function uuid(value, code) {
  const candidate = value();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    .test(candidate)) {
    throw new ListingSetError(500, code);
  }
  return candidate;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function safeInteger(value, code) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new ListingSetError(500, code);
  }
  return candidate;
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function countryCode(value) {
  const normalized = text(value, 40).toLowerCase();
  return ['de', 'deutschland', 'germany'].includes(normalized) ? 'DE' : '';
}

function normalizeMemberInput(value, index) {
  const candidate = object(value, 'invalid_listing_set_member');
  const role = text(candidate.role, 20);
  if (!memberRoles.has(role)) throw new ListingSetError(400, 'invalid_listing_set_member_role');
  return {
    listingId: identifier(candidate.listingId, 'invalid_listing_set_listing_id'),
    role,
    sortOrder: index,
  };
}

function normalizeMembers(value) {
  if (!Array.isArray(value)
      || value.length < 2
      || value.length > maximumListingSetMembers) {
    throw new ListingSetError(400, 'invalid_listing_set_member_count');
  }
  const members = value.map(normalizeMemberInput);
  if (new Set(members.map((member) => member.listingId)).size !== members.length) {
    throw new ListingSetError(400, 'duplicate_listing_set_member');
  }
  if (members.filter((member) => member.role === 'required').length < 2) {
    throw new ListingSetError(400, 'listing_set_requires_two_required_members');
  }
  return members;
}

function normalizeSetInput(raw, { previous = null } = {}) {
  const candidate = object(raw);
  const title = candidate.title == null && previous
    ? previous.title
    : text(candidate.title, 120);
  if (title.length < 3) throw new ListingSetError(400, 'listing_set_title_required');
  const setKind = candidate.setKind == null && previous
    ? previous.setKind
    : text(candidate.setKind, 30);
  if (!setKinds.has(setKind)) throw new ListingSetError(400, 'invalid_listing_set_kind');
  if (previous && previous.setKind !== setKind) {
    throw new ListingSetError(409, 'listing_set_kind_is_immutable');
  }
  const status = candidate.status == null
    ? (previous?.status ?? 'active')
    : text(candidate.status, 20);
  if (!setStatuses.has(status)) throw new ListingSetError(400, 'invalid_listing_set_status');
  const sourceMembers = candidate.members == null && previous
    ? previous.members.map((member) => ({ listingId: member.listingId, role: member.role }))
    : candidate.members;
  return { title, setKind, status, members: normalizeMembers(sourceMembers) };
}

function expectedRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new ListingSetError(400, 'listing_set_expected_revision_required');
  }
  return revision;
}

function listingRowsQuery({ lock = false } = {}) {
  return `SELECT listing.id, listing.owner_id, listing.title,
                 listing.payload, listing.category_id, listing.subcategory,
                 listing.currency, listing.country, listing.catalog_version,
                 listing.status, listing.is_active, listing.moderation_status,
                 encode(digest(concat_ws(E'\\n',
                   COALESCE(listing.location_text, ''),
                   COALESCE(listing.latitude::text, ''),
                   COALESCE(listing.longitude::text, ''),
                   COALESCE(listing.handover_radius_km::text, '')
                 ), 'sha256'), 'hex') AS handover_location_key,
                 EXISTS (
                   SELECT 1 FROM uploads AS upload
                    WHERE upload.listing_id = listing.id
                      AND upload.purpose = 'listing_image'
                      AND upload.visibility = 'public'
                      AND upload.content_scan_status = 'passed'
                 ) AS has_public_image
            FROM listings AS listing
           WHERE listing.id = ANY($1::text[])
           ${lock ? 'FOR KEY SHARE' : ''}`;
}

async function listingRowsForMembers(client, members, actorId, { requireActive }) {
  const ids = members.map((member) => member.listingId);
  const result = await client.query(listingRowsQuery({ lock: true }), [ids]);
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  const normalized = members.map((member) => {
    const row = byId.get(member.listingId);
    if (!row) throw new ListingSetError(404, 'listing_set_member_not_found');
    if (row.owner_id !== actorId) throw new ListingSetError(403, 'listing_set_member_owner_mismatch');
    if (row.catalog_version !== 1) throw new ListingSetError(409, 'listing_set_member_catalog_unsupported');
    if (requireActive && (row.status !== 'active'
        || row.is_active !== true
        || row.moderation_status !== 'active'
        || row.has_public_image !== true)) {
      throw new ListingSetError(409, 'listing_set_member_not_active');
    }
    const categoryId = text(row.category_id, 80);
    const subcategory = text(row.subcategory, 120);
    const currency = text(row.currency, 3).toUpperCase();
    const country = countryCode(row.country);
    const handoverLocationKey = text(row.handover_location_key, 64).toLowerCase();
    if (!categoryId || !subcategory || !/^[A-Z]{3}$/u.test(currency)
        || country !== 'DE' || !/^[0-9a-f]{64}$/u.test(handoverLocationKey)) {
      throw new ListingSetError(409, 'listing_set_member_context_invalid');
    }
    return {
      ...member,
      title: text(row.title, 160) || 'Mietartikel',
      categoryId,
      subcategory,
      currency,
      countryCode: country,
      handoverLocationKey,
    };
  });
  const currencies = new Set(normalized.map((member) => member.currency));
  if (currencies.size !== 1) throw new ListingSetError(409, 'listing_set_currency_mismatch');
  return normalized;
}

function membershipHash(setKind, members) {
  return hash({
    version: listingSetVersion,
    setKind,
    members: members.map((member) => ({
      listingId: member.listingId,
      role: member.role,
      sortOrder: member.sortOrder,
      categoryId: member.categoryId,
      subcategory: member.subcategory,
      currency: member.currency,
      countryCode: member.countryCode,
      handoverLocationKey: member.handoverLocationKey,
    })),
  });
}

function validateOneStop(setKind, members, status) {
  if (status === 'active' && setKind === 'one_stop_set'
      && new Set(members.map((member) => member.handoverLocationKey)).size !== 1) {
    throw new ListingSetError(409, 'one_stop_set_handover_mismatch');
  }
}

async function insertVersion(client, {
  listingSetId,
  actorId,
  revision,
  input,
  members,
}) {
  const membership = membershipHash(input.setKind, members);
  const versionResult = await client.query(
    `INSERT INTO listing_set_versions (
       listing_set_id, revision, set_kind, title, status, currency,
       country_code, member_count, required_member_count, membership_hash,
       created_by_id
     ) VALUES ($1, $2, $3, $4, $5, $6, 'DE', $7, $8, $9, $10)
     RETURNING id, created_at`,
    [
      listingSetId,
      revision,
      input.setKind,
      input.title,
      input.status,
      members[0].currency,
      members.length,
      members.filter((member) => member.role === 'required').length,
      membership,
      actorId,
    ],
  );
  const version = versionResult.rows[0];
  for (const member of members) {
    await client.query(
      `INSERT INTO listing_set_version_members (
         listing_set_id, listing_set_version_id, listing_id, member_role,
         sort_order, category_id, subcategory, currency, country_code,
         handover_location_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        listingSetId,
        version.id,
        member.listingId,
        member.role,
        member.sortOrder,
        member.categoryId,
        member.subcategory,
        member.currency,
        member.countryCode,
        member.handoverLocationKey,
      ],
    );
  }
  return Object.freeze({
    listingSetVersion,
    id: listingSetId,
    revision,
    setKind: input.setKind,
    title: input.title,
    status: input.status,
    currency: members[0].currency,
    countryCode: 'DE',
    membershipHash: membership,
    members: Object.freeze(members.map((member) => Object.freeze({
      listingId: member.listingId,
      role: member.role,
      sortOrder: member.sortOrder,
      title: member.title,
      categoryId: member.categoryId,
      subcategory: member.subcategory,
    }))),
    createdAt: timestamp(version.created_at),
    individualBookabilityPreserved: true,
    reservationCreated: false,
    bookingCreated: false,
    paymentCreated: false,
  });
}

export function assertListingSetsTechnicalAccess(configuration) {
  const boundary = configuration?.listingSets;
  if (boundary?.enabled !== true
      || boundary.publicReleaseAllowed !== false
      || boundary.fewerHandoversRankingAllowed !== true
      || boundary.businessStatusRankingAllowed !== false
      || boundary.hiddenPriceManipulationAllowed !== false) {
    throw new ListingSetError(404, 'listing_sets_not_enabled');
  }
  return true;
}

export async function createListingSet(client, {
  actorId,
  raw,
  idFactory = crypto.randomUUID,
}) {
  const input = normalizeSetInput(raw);
  const members = await listingRowsForMembers(client, input.members, actorId, {
    requireActive: input.status === 'active',
  });
  validateOneStop(input.setKind, members, input.status);
  const listingSetId = `listing_set_${uuid(idFactory, 'invalid_listing_set_identifier')}`;
  await client.query(
    'INSERT INTO listing_sets (id, owner_id) VALUES ($1, $2)',
    [listingSetId, actorId],
  );
  return insertVersion(client, {
    listingSetId,
    actorId,
    revision: 1,
    input,
    members,
  });
}

function currentSetQuery({ ownerOnly = false } = {}) {
  return `WITH current_version AS (
            SELECT version.*
              FROM listing_set_versions AS version
             WHERE version.listing_set_id = $1
             ORDER BY version.revision DESC
             LIMIT 1
          )
          SELECT listing_set.id AS listing_set_id, listing_set.owner_id,
                 listing_set.created_at AS set_created_at,
                 version.id AS version_id, version.revision, version.set_kind,
                 version.title, version.status, version.currency,
                 version.country_code, version.member_count,
                 version.required_member_count, version.membership_hash,
                 version.created_at AS version_created_at,
                 member.listing_id, member.member_role, member.sort_order,
                 member.category_id AS snapshot_category_id,
                 member.subcategory AS snapshot_subcategory,
                 member.currency AS snapshot_currency,
                 member.country_code AS snapshot_country_code,
                 member.handover_location_key AS snapshot_handover_location_key,
                 listing.title AS listing_title, listing.payload AS listing_payload,
                 listing.category_id, listing.subcategory, listing.currency AS listing_currency,
                 listing.country AS listing_country, listing.catalog_version,
                 listing.status AS listing_status, listing.is_active AS listing_is_active,
                 listing.moderation_status AS listing_moderation_status,
                 encode(digest(concat_ws(E'\\n',
                   COALESCE(listing.location_text, ''),
                   COALESCE(listing.latitude::text, ''),
                   COALESCE(listing.longitude::text, ''),
                   COALESCE(listing.handover_radius_km::text, '')
                 ), 'sha256'), 'hex') AS listing_handover_location_key,
                 EXISTS (
                   SELECT 1 FROM uploads AS upload
                    WHERE upload.listing_id = listing.id
                      AND upload.purpose = 'listing_image'
                      AND upload.visibility = 'public'
                      AND upload.content_scan_status = 'passed'
                 ) AS has_public_image
            FROM listing_sets AS listing_set
            JOIN current_version AS version ON true
            JOIN listing_set_version_members AS member
              ON member.listing_set_version_id = version.id
            JOIN listings AS listing ON listing.id = member.listing_id
           WHERE listing_set.id = $1
             ${ownerOnly ? 'AND listing_set.owner_id = $2' : ''}
           ORDER BY member.sort_order, member.id`;
}

function setFromRows(rows) {
  if (!rows.length) return null;
  const first = rows[0];
  return {
    id: first.listing_set_id,
    ownerId: first.owner_id,
    revision: Number(first.revision),
    setKind: first.set_kind,
    title: first.title,
    status: first.status,
    currency: first.currency,
    countryCode: first.country_code,
    membershipHash: first.membership_hash,
    createdAt: timestamp(first.set_created_at),
    updatedAt: timestamp(first.version_created_at),
    members: rows.map((row) => ({
      listingId: row.listing_id,
      role: row.member_role,
      sortOrder: Number(row.sort_order),
      title: text(row.listing_title, 160) || 'Mietartikel',
      categoryId: row.snapshot_category_id,
      subcategory: row.snapshot_subcategory,
      currency: row.snapshot_currency,
      countryCode: row.snapshot_country_code,
      handoverLocationKey: row.snapshot_handover_location_key,
      listing: row,
    })),
  };
}

async function loadCurrentSet(client, listingSetId, { ownerId = null, lock = false } = {}) {
  const id = identifier(listingSetId, 'invalid_listing_set_id');
  if (lock) {
    const locked = await client.query(
      `SELECT id, owner_id FROM listing_sets
        WHERE id = $1 ${ownerId ? 'AND owner_id = $2' : ''}
        FOR UPDATE`,
      ownerId ? [id, ownerId] : [id],
    );
    if (!locked.rowCount) throw new ListingSetError(404, 'listing_set_not_found');
  }
  const result = await client.query(
    currentSetQuery({ ownerOnly: ownerId !== null }),
    ownerId === null ? [id] : [id, ownerId],
  );
  const current = setFromRows(result.rows);
  if (!current) throw new ListingSetError(404, 'listing_set_not_found');
  return current;
}

export async function reviseListingSet(client, {
  actorId,
  listingSetId,
  raw,
}) {
  const candidate = object(raw);
  const current = await loadCurrentSet(client, listingSetId, {
    ownerId: actorId,
    lock: true,
  });
  if (current.status === 'ended') throw new ListingSetError(409, 'listing_set_already_ended');
  if (expectedRevision(candidate.expectedRevision) !== current.revision) {
    throw new ListingSetError(409, 'listing_set_revision_changed', {
      currentRevision: current.revision,
    });
  }
  const input = normalizeSetInput(candidate, { previous: current });
  const members = await listingRowsForMembers(client, input.members, actorId, {
    requireActive: input.status === 'active',
  });
  validateOneStop(input.setKind, members, input.status);
  return insertVersion(client, {
    listingSetId: current.id,
    actorId,
    revision: current.revision + 1,
    input,
    members,
  });
}

function publicListingShape(row) {
  const payload = row.listing_payload && typeof row.listing_payload === 'object'
    && !Array.isArray(row.listing_payload)
    ? row.listing_payload
    : {};
  return Object.freeze({
    id: row.listing_id,
    title: text(row.listing_title, 160) || 'Mietartikel',
    categoryId: text(row.category_id, 80),
    subcategory: text(row.subcategory, 120),
    city: text(payload.city, 120) || null,
    country: text(payload.country, 120) || null,
    photos: Array.isArray(payload.photos)
      ? payload.photos.slice(0, 12).map((photo) => text(photo, 4000)).filter(Boolean)
      : [],
  });
}

function currentMemberContext(member) {
  const row = member.listing;
  return row.catalog_version === 1
    && row.listing_status === 'active'
    && row.listing_is_active === true
    && row.listing_moderation_status === 'active'
    && row.has_public_image === true
    && row.category_id === member.categoryId
    && (row.subcategory ?? '') === member.subcategory
    && row.listing_currency === member.currency
    && countryCode(row.listing_country) === member.countryCode
    && row.listing_handover_location_key === member.handoverLocationKey;
}

function expectedQuoteFailure(error) {
  return error instanceof BookingWorkflowError && error.status < 500;
}

function itemAllocation(member, quoteResult) {
  const quote = quoteResult?.quote;
  const rentalSubtotalMinor = safeInteger(
    quote?.rentalSubtotalMinor,
    'listing_set_quote_allocation_invalid',
  );
  const platformFeeMinor = safeInteger(
    quote?.platformFeeMinor,
    'listing_set_quote_allocation_invalid',
  );
  const totalMinor = safeInteger(quote?.totalMinor, 'listing_set_quote_allocation_invalid');
  const ownerPayoutMinor = safeInteger(
    quote?.ownerPayoutMinor,
    'listing_set_quote_allocation_invalid',
  );
  const securityDepositMinor = safeInteger(
    quote?.securityDepositMinor ?? 0,
    'listing_set_quote_allocation_invalid',
  );
  if (quoteResult.preview !== true
      || quoteResult.quoteId !== null
      || quoteResult.listingId !== member.listingId
      || quote?.currency !== member.currency
      || !/^[0-9a-f]{64}$/u.test(quoteResult.quoteHash ?? '')
      || securityDepositMinor !== 0
      || rentalSubtotalMinor > ownerPayoutMinor
      || ownerPayoutMinor + platformFeeMinor !== totalMinor) {
    throw new ListingSetError(500, 'listing_set_server_quote_contract_invalid');
  }
  return Object.freeze({
    role: member.role,
    sortOrder: member.sortOrder,
    listing: publicListingShape(member.listing),
    quote: Object.freeze({
      quoteHash: quoteResult.quoteHash,
      quotedAt: quoteResult.quotedAt,
      availabilityRevision: safeInteger(
        quoteResult.availabilityRevision,
        'listing_set_availability_revision_invalid',
      ),
      currency: member.currency,
      rentalSubtotalMinor,
      platformFeeMinor,
      totalMinor,
      ownerPayoutMinor,
      securityDepositMinor,
      preview: true,
      persisted: false,
    }),
    itemBoundary: Object.freeze({
      priceAllocation: 'item_quote',
      handoverReturnEvidence: 'v52_item_booking_evidence',
      damageAndNeedsReview: 'v52_item_booking_case',
      refund: 'v51_v52_item_booking_obligation',
      auditReference: 'item_booking_and_quote_ids',
    }),
  });
}

export async function resolveListingSet(client, {
  actorId,
  listingSetId,
  raw,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
}) {
  const candidate = object(raw, 'invalid_listing_set_resolution_payload');
  const dates = parseRentalDates(text(candidate.startDate, 10), text(candidate.endDate, 10), {
    maxDays: 365,
  });
  if (!dates) throw new ListingSetError(400, 'invalid_listing_set_rental_dates');
  const current = await loadCurrentSet(client, listingSetId);
  if (current.status !== 'active' || current.ownerId === actorId) {
    throw new ListingSetError(404, 'listing_set_not_available');
  }
  const available = [];
  const unavailableOptional = [];
  const unavailableRequired = [];
  for (const member of current.members) {
    if (!currentMemberContext(member)) {
      (member.role === 'required' ? unavailableRequired : unavailableOptional).push(member.listingId);
      continue;
    }
    try {
      const quote = await quoteCandidate(client, {
        actorId,
        raw: {
          listingId: member.listingId,
          startDate: dates.startDate,
          endDate: dates.endDate,
        },
        privatePilot,
        privatePilotAllowedRegions,
        persist: false,
      });
      available.push(itemAllocation(member, quote));
    } catch (error) {
      if (!expectedQuoteFailure(error)) throw error;
      (member.role === 'required' ? unavailableRequired : unavailableOptional).push(member.listingId);
    }
  }
  if (unavailableRequired.length > 0
      || available.filter((item) => item.role === 'required').length < 2) {
    throw new ListingSetError(409, 'listing_set_required_member_unavailable');
  }
  const totals = available.reduce((sum, item) => ({
    rentalSubtotalMinor: sum.rentalSubtotalMinor + item.quote.rentalSubtotalMinor,
    platformFeeMinor: sum.platformFeeMinor + item.quote.platformFeeMinor,
    totalMinor: sum.totalMinor + item.quote.totalMinor,
    ownerPayoutMinor: sum.ownerPayoutMinor + item.quote.ownerPayoutMinor,
    securityDepositMinor: sum.securityDepositMinor + item.quote.securityDepositMinor,
  }), {
    rentalSubtotalMinor: 0,
    platformFeeMinor: 0,
    totalMinor: 0,
    ownerPayoutMinor: 0,
    securityDepositMinor: 0,
  });
  const handoverCount = new Set(available.map((item) => {
    const member = current.members.find((entry) => entry.listingId === item.listing.id);
    return member.handoverLocationKey;
  })).size;
  if (current.setKind === 'one_stop_set' && handoverCount !== 1) {
    throw new ListingSetError(409, 'one_stop_set_handover_changed');
  }
  return Object.freeze({
    listingSetVersion,
    id: current.id,
    revision: current.revision,
    setKind: current.setKind,
    title: current.title,
    membershipHash: current.membershipHash,
    startDate: dates.startDate,
    endDate: dates.endDate,
    currency: current.currency,
    items: Object.freeze(available),
    unavailableOptionalCount: unavailableOptional.length,
    totals: Object.freeze({ currency: current.currency, ...totals }),
    rankingBasis: Object.freeze({
      approvedSignal: 'fewer_handovers',
      handoverCount,
      businessStatusUsed: false,
      priceUsedForRanking: false,
      hiddenPriceManipulationUsed: false,
    }),
    serverTruth: Object.freeze({
      allRequiredItemsAvailable: true,
      itemAvailabilityChecked: true,
      itemQuotePreviewChecked: true,
      individualBookabilityPreserved: true,
      setDiscountApplied: false,
      quotePersisted: false,
      reservationCreated: false,
      bookingCreated: false,
      contractCreated: false,
      paymentCreated: false,
      revalidationRequiredBeforeRequest: true,
    }),
  });
}

export async function discoverListingSets(client, {
  actorId,
  raw,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
}) {
  const candidate = object(raw, 'invalid_listing_set_discovery_payload');
  const sourceListingId = identifier(candidate.listingId, 'invalid_listing_set_listing_id');
  const result = await client.query(
    `WITH current_versions AS (
       SELECT DISTINCT ON (version.listing_set_id)
              version.id, version.listing_set_id, version.status
         FROM listing_set_versions AS version
        ORDER BY version.listing_set_id, version.revision DESC
     )
     SELECT current_version.listing_set_id
       FROM current_versions AS current_version
       JOIN listing_set_version_members AS member
         ON member.listing_set_version_id = current_version.id
      WHERE current_version.status = 'active' AND member.listing_id = $1
      ORDER BY current_version.listing_set_id
      LIMIT 25`,
    [sourceListingId],
  );
  const sets = [];
  for (const row of result.rows) {
    try {
      const resolved = await resolveListingSet(client, {
        actorId,
        listingSetId: row.listing_set_id,
        raw: candidate,
        privatePilot,
        privatePilotAllowedRegions,
        quoteCandidate,
      });
      if (resolved.items.some((item) => item.listing.id === sourceListingId)) {
        sets.push(resolved);
      }
    } catch (error) {
      if (error instanceof ListingSetError
          && ['listing_set_not_available', 'listing_set_required_member_unavailable',
            'one_stop_set_handover_changed'].includes(error.code)) {
        continue;
      }
      throw error;
    }
  }
  sets.sort((left, right) => (
    left.rankingBasis.handoverCount - right.rankingBasis.handoverCount
    || left.id.localeCompare(right.id)
  ));
  return Object.freeze({
    listingSetVersion,
    sourceListingId,
    sets: Object.freeze(sets.map((set, index) => Object.freeze({
      ...set,
      ranking: Object.freeze({
        position: index + 1,
        approvedSignals: Object.freeze(['fewer_handovers']),
        businessStatusUsed: false,
        priceUsedForRanking: false,
        hiddenPriceManipulationUsed: false,
      }),
    }))),
    unavailableSetsOmitted: true,
    externalProviderTraffic: false,
  });
}

export async function getOwnerListingSets(client, actorId) {
  const result = await client.query(
    `WITH current_versions AS (
       SELECT DISTINCT ON (version.listing_set_id) version.*
         FROM listing_set_versions AS version
         JOIN listing_sets AS listing_set ON listing_set.id = version.listing_set_id
        WHERE listing_set.owner_id = $1
        ORDER BY version.listing_set_id, version.revision DESC
     )
     SELECT listing_set.id AS listing_set_id, listing_set.owner_id,
            listing_set.created_at AS set_created_at,
            version.id AS version_id, version.revision, version.set_kind,
            version.title, version.status, version.currency,
            version.country_code, version.membership_hash,
            version.created_at AS version_created_at,
            member.listing_id, member.member_role, member.sort_order,
            member.category_id AS snapshot_category_id,
            member.subcategory AS snapshot_subcategory,
            member.currency AS snapshot_currency,
            member.country_code AS snapshot_country_code,
            member.handover_location_key AS snapshot_handover_location_key,
            listing.title AS listing_title
       FROM listing_sets AS listing_set
       JOIN current_versions AS version ON version.listing_set_id = listing_set.id
       JOIN listing_set_version_members AS member
         ON member.listing_set_version_id = version.id
       JOIN listings AS listing ON listing.id = member.listing_id
      WHERE listing_set.owner_id = $1
      ORDER BY listing_set.created_at DESC, listing_set.id, member.sort_order`,
    [actorId],
  );
  const grouped = new Map();
  for (const row of result.rows) {
    const existing = grouped.get(row.listing_set_id) ?? [];
    existing.push(row);
    grouped.set(row.listing_set_id, existing);
  }
  return Object.freeze([...grouped.values()].map((rows) => {
    const set = setFromRows(rows);
    return Object.freeze({
      listingSetVersion,
      id: set.id,
      revision: set.revision,
      setKind: set.setKind,
      title: set.title,
      status: set.status,
      currency: set.currency,
      countryCode: set.countryCode,
      membershipHash: set.membershipHash,
      members: Object.freeze(set.members.map((member) => Object.freeze({
        listingId: member.listingId,
        role: member.role,
        sortOrder: member.sortOrder,
        title: member.title,
        categoryId: member.categoryId,
        subcategory: member.subcategory,
      }))),
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
      individualBookabilityPreserved: true,
    });
  }));
}
