import crypto from 'node:crypto';

import { parseRentalDates } from './booking_domain.js';
import { BookingWorkflowError, quoteBooking } from './booking_workflow.js';
import {
  createDeterministicFirstPlan,
  plannerCoreVersion,
  PlannerCoreError,
} from './planner_core.js';
import {
  deleteRentalCartItem,
  putRentalCartItem,
  putRentalCartProject,
  RentalCartError,
} from './rental_cart_workflow.js';

export const plannerInventoryVersion = 'G4B-2026-08-21.1';

const MAX_CANDIDATES_PER_ITEM = 24;
const variantIds = Object.freeze(['one_stop', 'price_efficient', 'top_rated']);
const funnelStages = new Set(['inventory_resolved', 'project_added_to_cart']);

export class PlannerInventoryError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code = 'invalid_planner_inventory_payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlannerInventoryError(400, code);
  }
  return { ...value };
}

function text(value, maximum = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function clientIdentifier(value, code) {
  const candidate = text(value, 120);
  if (!/^[A-Za-z0-9_.:-]{8,120}$/u.test(candidate)) {
    throw new PlannerInventoryError(400, code);
  }
  return candidate;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
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
    throw new PlannerInventoryError(500, code);
  }
  return candidate;
}

function dateInput(raw) {
  const dates = parseRentalDates(text(raw.startDate, 10), text(raw.endDate, 10), { maxDays: 365 });
  if (!dates) throw new PlannerInventoryError(400, 'invalid_planner_rental_dates');
  return dates;
}

function planInput(raw) {
  const candidate = object(raw);
  let plan;
  try {
    plan = createDeterministicFirstPlan(candidate.templateId, candidate.answers);
  } catch (error) {
    if (error instanceof PlannerCoreError) {
      throw new PlannerInventoryError(400, error.code);
    }
    throw error;
  }
  const dates = dateInput(candidate);
  const planItemTypes = plan.items.map((item) => item.itemType);
  const selectedSource = candidate.selectedItemTypes == null
    ? planItemTypes
    : candidate.selectedItemTypes;
  if (!Array.isArray(selectedSource)
      || selectedSource.length === 0
      || selectedSource.length > planItemTypes.length) {
    throw new PlannerInventoryError(400, 'invalid_planner_selected_item_types');
  }
  const selectedItemTypes = selectedSource.map((entry) => text(entry, 60));
  if (new Set(selectedItemTypes).size !== selectedItemTypes.length
      || selectedItemTypes.some((entry) => !planItemTypes.includes(entry))) {
    throw new PlannerInventoryError(400, 'invalid_planner_selected_item_types');
  }
  const selected = new Set(selectedItemTypes);
  const selectedItems = plan.items.filter((item) => selected.has(item.itemType));
  const missingRequiredItemTypes = plan.items
    .filter((item) => item.priority === 'required' && !selected.has(item.itemType))
    .map((item) => item.itemType);
  const rawPreferredListings = candidate.preferredListings == null
    ? {}
    : object(candidate.preferredListings, 'invalid_planner_preferred_listings');
  if (Object.keys(rawPreferredListings).some((itemType) => !selected.has(itemType))) {
    throw new PlannerInventoryError(400, 'planner_preferred_item_not_selected');
  }
  const preferredListings = Object.fromEntries(
    Object.entries(rawPreferredListings).map(([itemType, listingId]) => [
      itemType,
      clientIdentifier(listingId, 'invalid_planner_preferred_listing_id'),
    ]),
  );
  return {
    candidate,
    plan,
    dates,
    selectedItems,
    selectedItemTypes,
    missingRequiredItemTypes,
    preferredListings,
  };
}

function candidateQuery(item, {
  actorId,
  privatePilot,
  privatePilotAllowedRegions,
  limit = MAX_CANDIDATES_PER_ITEM,
}) {
  const catalogKeys = item.catalogTargets.map((target) => target.catalogKey);
  return {
    text: `SELECT listing.id, listing.owner_id, listing.title,
                  listing.category_id, listing.subcategory, listing.condition,
                  listing.city, listing.country,
                  COALESCE(owner_rating.review_count, 0)::int AS owner_review_count,
                  owner_rating.average_rating
             FROM listings AS listing
             JOIN users AS owner ON owner.id = listing.owner_id
             JOIN LATERAL (
               SELECT count(*)::int AS image_count
                 FROM uploads AS upload
                WHERE upload.listing_id = listing.id
                  AND upload.purpose = 'listing_image'
                  AND upload.visibility = 'public'
                  AND upload.content_scan_status = 'passed'
             ) AS media ON media.image_count > 0
             LEFT JOIN LATERAL (
               SELECT count(*)::int AS review_count,
                      round(avg(review.rating)::numeric, 2) AS average_rating
                 FROM reviews AS review
                WHERE review.reviewee_id = listing.owner_id
                  AND review.direction = 'renter_to_owner'
                  AND review.moderation_status = 'published'
             ) AS owner_rating ON true
            WHERE listing.catalog_version = 1
              AND listing.is_active = true
              AND listing.status = 'active'
              AND listing.moderation_status = 'active'
              AND listing.owner_id <> $1
              AND owner.deactivated_at IS NULL
              AND owner.account_status = 'active'
              AND concat(listing.category_id, E'\\x1f', listing.subcategory) = ANY($2::text[])
              AND ($3::boolean = false OR (
                listing.private_status_confirmed_at IS NOT NULL
                AND listing.private_pilot_region_code = ANY($4::text[])
                AND owner.private_use_confirmed_at IS NOT NULL
                AND owner.private_marketplace_review_status = 'clear'
              ))
            ORDER BY listing.id
            LIMIT $5`,
    values: [
      actorId,
      catalogKeys,
      privatePilot,
      privatePilotAllowedRegions,
      limit,
    ],
  };
}

function expectedCandidateFailure(error) {
  return error instanceof BookingWorkflowError && error.status < 500;
}

function currentCandidate(row, quoteResult) {
  const quote = quoteResult?.quote;
  if (quoteResult?.preview !== true
      || quoteResult.quoteId !== null
      || quoteResult.listingId !== row.id
      || !/^[0-9a-f]{64}$/u.test(quoteResult.quoteHash ?? '')
      || quote?.currency !== 'EUR') {
    throw new PlannerInventoryError(500, 'planner_server_quote_contract_invalid');
  }
  const reviewCount = safeInteger(row.owner_review_count ?? 0, 'planner_review_count_invalid');
  const averageRating = reviewCount > 0 ? Number(row.average_rating) : null;
  if (averageRating !== null && (!Number.isFinite(averageRating)
      || averageRating < 1 || averageRating > 5)) {
    throw new PlannerInventoryError(500, 'planner_rating_invalid');
  }
  return {
    listingId: row.id,
    ownerId: row.owner_id,
    title: text(row.title, 160) || 'Mietartikel',
    categoryId: row.category_id,
    subcategory: row.subcategory,
    condition: row.condition,
    city: text(row.city, 120) || null,
    country: text(row.country, 120) || null,
    ownerRating: reviewCount > 0
      ? { average: Math.round(averageRating * 100) / 100, count: reviewCount }
      : null,
    quote: {
      quoteHash: quoteResult.quoteHash,
      quotedAt: quoteResult.quotedAt,
      availabilityRevision: safeInteger(
        quoteResult.availabilityRevision,
        'planner_availability_revision_invalid',
      ),
      currency: 'EUR',
      rentalSubtotalMinor: safeInteger(
        quote.rentalSubtotalMinor,
        'planner_quote_amount_invalid',
      ),
      platformFeeMinor: safeInteger(quote.platformFeeMinor, 'planner_quote_amount_invalid'),
      totalMinor: safeInteger(quote.totalMinor, 'planner_quote_amount_invalid'),
      ownerPayoutMinor: safeInteger(quote.ownerPayoutMinor, 'planner_quote_amount_invalid'),
      preview: true,
      persisted: false,
    },
  };
}

async function candidatesForItem(client, item, context) {
  const query = candidateQuery(item, context);
  const result = await client.query(query.text, query.values);
  const available = [];
  let rejectedByServerTruth = 0;
  for (const row of result.rows) {
    try {
      const quote = await context.quoteCandidate(client, {
        actorId: context.actorId,
        raw: {
          listingId: row.id,
          startDate: context.dates.startDate,
          endDate: context.dates.endDate,
        },
        privatePilot: context.privatePilot,
        privatePilotAllowedRegions: context.privatePilotAllowedRegions,
        persist: false,
      });
      available.push(currentCandidate(row, quote));
    } catch (error) {
      if (!expectedCandidateFailure(error)) throw error;
      rejectedByServerTruth += 1;
    }
  }
  return {
    item,
    candidates: available,
    inspectedCount: result.rows.length,
    rejectedByServerTruth,
  };
}

function priceOrder(left, right) {
  return left.quote.totalMinor - right.quote.totalMinor
    || (right.ownerRating?.average ?? -1) - (left.ownerRating?.average ?? -1)
    || (right.ownerRating?.count ?? 0) - (left.ownerRating?.count ?? 0)
    || left.listingId.localeCompare(right.listingId);
}

function ratingOrder(left, right) {
  return (right.ownerRating?.average ?? -1) - (left.ownerRating?.average ?? -1)
    || (right.ownerRating?.count ?? 0) - (left.ownerRating?.count ?? 0)
    || left.quote.totalMinor - right.quote.totalMinor
    || left.listingId.localeCompare(right.listingId);
}

function uniqueSelection(itemCandidates, order, { ownerId = null, ratedOnly = false } = {}) {
  const ranked = itemCandidates.map((entry) => entry.candidates
      .filter((candidate) => (ownerId === null || candidate.ownerId === ownerId)
        && (!ratedOnly || candidate.ownerRating !== null))
      .sort(order));
  const listingToItem = new Map();
  const itemToCandidate = new Map();
  const assign = (itemIndex, visitedListings) => {
    for (const candidate of ranked[itemIndex]) {
      if (visitedListings.has(candidate.listingId)) continue;
      visitedListings.add(candidate.listingId);
      const previousItem = listingToItem.get(candidate.listingId);
      if (previousItem === undefined || assign(previousItem, visitedListings)) {
        listingToItem.set(candidate.listingId, itemIndex);
        itemToCandidate.set(itemIndex, candidate);
        return true;
      }
    }
    return false;
  };
  for (let itemIndex = 0; itemIndex < itemCandidates.length; itemIndex += 1) {
    if (!assign(itemIndex, new Set())) return null;
  }
  return itemCandidates.map((entry, itemIndex) => ({
    item: entry.item,
    candidate: itemToCandidate.get(itemIndex),
  }));
}

function totals(selection) {
  return selection.reduce((sum, entry) => ({
    currency: 'EUR',
    rentalSubtotalMinor: sum.rentalSubtotalMinor + entry.candidate.quote.rentalSubtotalMinor,
    platformFeeMinor: sum.platformFeeMinor + entry.candidate.quote.platformFeeMinor,
    totalMinor: sum.totalMinor + entry.candidate.quote.totalMinor,
    ownerPayoutMinor: sum.ownerPayoutMinor + entry.candidate.quote.ownerPayoutMinor,
  }), {
    currency: 'EUR',
    rentalSubtotalMinor: 0,
    platformFeeMinor: 0,
    totalMinor: 0,
    ownerPayoutMinor: 0,
  });
}

function publicSelection(selection) {
  return selection.map(({ item, candidate }) => ({
    itemType: item.itemType,
    priority: item.priority,
    listing: {
      id: candidate.listingId,
      title: candidate.title,
      categoryId: candidate.categoryId,
      subcategory: candidate.subcategory,
      condition: candidate.condition,
      city: candidate.city,
      country: candidate.country,
    },
    ownerRating: candidate.ownerRating,
    quote: candidate.quote,
  }));
}

function unavailableVariant(id, label, rankingBasis, reason) {
  return {
    id,
    label,
    status: 'unavailable',
    rankingBasis,
    unavailableReason: reason,
    selections: [],
    totals: null,
    reservationCreated: false,
  };
}

function availableVariant(id, label, rankingBasis, selection) {
  return {
    id,
    label,
    status: 'current',
    rankingBasis,
    unavailableReason: null,
    selections: publicSelection(selection),
    totals: totals(selection),
    reservationCreated: false,
  };
}

function oneStopVariant(itemCandidates) {
  const owners = [...new Set(itemCandidates.flatMap((entry) => (
    entry.candidates.map((candidate) => candidate.ownerId)
  )))].sort();
  const complete = owners
    .map((ownerId) => uniqueSelection(itemCandidates, priceOrder, { ownerId }))
    .filter(Boolean)
    .sort((left, right) => totals(left).totalMinor - totals(right).totalMinor
      || left.map((entry) => entry.candidate.listingId).join('\u001f')
        .localeCompare(right.map((entry) => entry.candidate.listingId).join('\u001f')));
  return complete.length > 0
    ? availableVariant(
      'one_stop',
      '1-Stop',
      'one real owner covers every selected item type; lowest current EUR total breaks ties',
      complete[0],
    )
    : unavailableVariant(
      'one_stop',
      '1-Stop',
      'one real owner must cover every selected item type',
      'no_single_owner_complete_set',
    );
}

function priceEfficientVariant(itemCandidates) {
  const selection = uniqueSelection(itemCandidates, priceOrder);
  return selection
    ? availableVariant(
      'price_efficient',
      'Preis-effizient',
      'lowest current EUR item total, then published owner rating and listing ID; listings stay unique',
      selection,
    )
    : unavailableVariant(
      'price_efficient',
      'Preis-effizient',
      'every selected item type requires a unique current EUR candidate',
      'no_complete_unique_listing_set',
    );
}

function topRatedVariant(itemCandidates) {
  const selection = uniqueSelection(itemCandidates, ratingOrder, { ratedOnly: true });
  return selection
    ? availableVariant(
      'top_rated',
      'Top-bewertet',
      'highest published renter-to-owner average, then review count, current EUR total and listing ID',
      selection,
    )
    : unavailableVariant(
      'top_rated',
      'Top-bewertet',
      'every selected item type requires a unique candidate with a published owner rating',
      'rated_complete_set_unavailable',
    );
}

function editedSelection(itemCandidates, preferredListings) {
  if (Object.keys(preferredListings).length === 0) return null;
  const base = uniqueSelection(itemCandidates, priceOrder);
  if (!base) {
    throw new PlannerInventoryError(409, 'planner_edited_selection_incomplete');
  }
  const selected = base.map((entry) => ({ ...entry }));
  for (const [itemType, listingId] of Object.entries(preferredListings)) {
    const source = itemCandidates.find((entry) => entry.item.itemType === itemType);
    const replacement = source?.candidates.find((candidate) => candidate.listingId === listingId);
    if (!replacement) {
      throw new PlannerInventoryError(409, 'planner_preferred_listing_not_current_candidate', {
        itemType,
      });
    }
    selected[selected.findIndex((entry) => entry.item.itemType === itemType)] = {
      item: source.item,
      candidate: replacement,
    };
  }
  if (new Set(selected.map((entry) => entry.candidate.listingId)).size !== selected.length) {
    throw new PlannerInventoryError(409, 'planner_edited_selection_duplicate_listing');
  }
  return availableVariant(
    'edited',
    'Bearbeitete Auswahl',
    'explicit user-selected listings among the current server-validated candidates',
    selected,
  );
}

function snapshotHash({ plan, dates, selectedItemTypes, itemCandidates }) {
  return hash({
    plannerInventoryVersion,
    plannerCoreVersion,
    planHash: plan.planHash,
    startDate: dates.startDate,
    endDate: dates.endDate,
    selectedItemTypes,
    candidates: itemCandidates.map((entry) => ({
      itemType: entry.item.itemType,
      candidates: entry.candidates.map((candidate) => ({
        listingId: candidate.listingId,
        quoteHash: candidate.quote.quoteHash,
        availabilityRevision: candidate.quote.availabilityRevision,
        ownerRating: candidate.ownerRating,
      })),
    })),
  });
}

export function assertPlannerInventoryTechnicalAccess(configuration) {
  if (configuration?.planner?.enabled !== true
      || configuration.planner.inventoryResolutionEnabled !== true
      || configuration.planner.publicReleaseAllowed !== false
      || configuration.planner.externalGenerativeAiAllowed !== false
      || configuration.planner.inventoryResolutionAllowed !== false) {
    throw new PlannerInventoryError(404, 'planner_inventory_not_enabled');
  }
  return true;
}

export async function resolvePlannerInventory(client, {
  actorId,
  raw,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
}) {
  const input = planInput(raw);
  const itemCandidates = [];
  for (const item of input.selectedItems) {
    itemCandidates.push(await candidatesForItem(client, item, {
      actorId,
      dates: input.dates,
      privatePilot,
      privatePilotAllowedRegions,
      quoteCandidate,
    }));
  }
  const variants = [
    oneStopVariant(itemCandidates),
    priceEfficientVariant(itemCandidates),
    topRatedVariant(itemCandidates),
  ];
  const edited = editedSelection(itemCandidates, input.preferredListings);
  const result = {
    plannerInventoryVersion,
    plannerCoreVersion,
    templateId: input.plan.templateId,
    templateTitle: input.plan.templateTitle,
    planHash: input.plan.planHash,
    startDate: input.dates.startDate,
    endDate: input.dates.endDate,
    selectedItemTypes: input.selectedItemTypes,
    editableItemTypes: input.plan.items.map((item) => ({
      itemType: item.itemType,
      priority: item.priority,
      selected: input.selectedItemTypes.includes(item.itemType),
    })),
    missingRequiredItemTypes: input.missingRequiredItemTypes,
    cartEligible: input.missingRequiredItemTypes.length === 0,
    candidateSummary: itemCandidates.map((entry) => ({
      itemType: entry.item.itemType,
      priority: entry.item.priority,
      currentCandidateCount: entry.candidates.length,
      inspectedCount: entry.inspectedCount,
      rejectedByServerTruth: entry.rejectedByServerTruth,
    })),
    variants,
    editedSelection: edited,
    inventorySnapshotHash: snapshotHash({ ...input, itemCandidates }),
    serverTruth: {
      status: 'resolved_at_request_time',
      inventoryQueried: true,
      currentAvailabilityChecked: true,
      currentQuotePreviewChecked: true,
      quotePersisted: false,
      reservationCreated: false,
      bookingCreated: false,
      revalidationRequiredBeforeRequest: true,
    },
    externalGenerativeAiUsed: false,
  };
  return deepFreeze(result);
}

function selectedVariant(resolution, selectionId) {
  const id = text(selectionId, 40);
  if (id === 'edited') return resolution.editedSelection;
  if (!variantIds.includes(id)) {
    throw new PlannerInventoryError(400, 'invalid_planner_variant_id');
  }
  return resolution.variants.find((variant) => variant.id === id) ?? null;
}

function plannerCartItemPrefix(projectId) {
  return `planner:${hash(projectId).slice(0, 12)}:`;
}

function plannerCartItemId(projectId, itemType) {
  return `${plannerCartItemPrefix(projectId)}${hash(itemType).slice(0, 12)}`;
}

export async function addPlannerProjectToCart(client, {
  actorId,
  clientProjectId,
  raw,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
  cartProjectWriter = putRentalCartProject,
  cartItemWriter = putRentalCartItem,
  cartItemDeleter = deleteRentalCartItem,
}) {
  const projectId = clientIdentifier(clientProjectId, 'invalid_planner_project_id');
  const candidate = object(raw);
  const expectedSnapshotHash = text(candidate.inventorySnapshotHash, 64);
  if (!/^[0-9a-f]{64}$/u.test(expectedSnapshotHash)) {
    throw new PlannerInventoryError(400, 'planner_inventory_snapshot_required');
  }
  const resolution = await resolvePlannerInventory(client, {
    actorId,
    raw: candidate,
    privatePilot,
    privatePilotAllowedRegions,
    quoteCandidate,
  });
  if (resolution.inventorySnapshotHash !== expectedSnapshotHash) {
    throw new PlannerInventoryError(409, 'planner_inventory_snapshot_changed', {
      currentInventorySnapshotHash: resolution.inventorySnapshotHash,
    });
  }
  if (!resolution.cartEligible) {
    throw new PlannerInventoryError(409, 'planner_required_item_missing', {
      missingRequiredItemTypes: resolution.missingRequiredItemTypes,
    });
  }
  const variant = selectedVariant(resolution, candidate.variantId);
  if (!variant || variant.status !== 'current') {
    throw new PlannerInventoryError(409, 'planner_variant_not_current');
  }
  let cart;
  try {
    cart = await cartProjectWriter(client, {
      actorId,
      clientProjectId: projectId,
      raw: {
        title: resolution.templateTitle,
        answers: {
          source: 'planner_g4b',
          plannerCoreVersion,
          plannerInventoryVersion,
          templateId: resolution.templateId,
          answers: object(candidate.answers, 'invalid_planner_answers'),
          selectedItemTypes: resolution.selectedItemTypes,
          startDate: resolution.startDate,
          endDate: resolution.endDate,
          variantId: variant.id,
          inventorySnapshotHash: resolution.inventorySnapshotHash,
        },
        sortOrder: Number(candidate.sortOrder ?? 0),
      },
    });
    const desiredItemIds = new Set(variant.selections.map((selection) => (
      plannerCartItemId(projectId, selection.itemType)
    )));
    const prefix = plannerCartItemPrefix(projectId);
    for (const existing of cart.items.filter((item) => item.projectId === projectId
      && item.id.startsWith(prefix)
      && !desiredItemIds.has(item.id))) {
      cart = await cartItemDeleter(client, {
        actorId,
        clientItemId: existing.id,
      });
    }
    for (const [index, selection] of variant.selections.entries()) {
      const clientItemId = plannerCartItemId(projectId, selection.itemType);
      cart = await cartItemWriter(client, {
        actorId,
        clientItemId,
        raw: {
          listingId: selection.listing.id,
          projectId,
          startDate: resolution.startDate,
          endDate: resolution.endDate,
          sortOrder: index,
        },
        privatePilot,
        privatePilotAllowedRegions,
        quoteCandidate,
      });
      const current = cart.items.find((item) => item.id === clientItemId);
      if (!current
          || current.listingId !== selection.listing.id
          || current.quoteStatus !== 'current'
          || current.quote?.quoteHash !== selection.quote.quoteHash) {
        throw new PlannerInventoryError(409, 'planner_cart_revalidation_changed');
      }
    }
  } catch (error) {
    if (error instanceof RentalCartError) {
      throw new PlannerInventoryError(error.status, error.code, error.details);
    }
    throw error;
  }
  if (cart.reservationCreated !== false) {
    throw new PlannerInventoryError(500, 'planner_cart_reservation_boundary_violated');
  }
  return deepFreeze({
    plannerInventoryVersion,
    templateId: resolution.templateId,
    inventorySnapshotHash: resolution.inventorySnapshotHash,
    variantId: variant.id,
    addedItemCount: variant.selections.length,
    revalidated: true,
    reservationCreated: false,
    bookingCreated: false,
    cart,
  });
}

export function plannerFunnelEvent(stage, payload, { now = new Date() } = {}) {
  if (!funnelStages.has(stage)) {
    throw new PlannerInventoryError(500, 'invalid_planner_funnel_stage');
  }
  const templateId = text(payload?.templateId ?? payload?.cart?.projects?.find(
    (project) => project.answers?.source === 'planner_g4b',
  )?.answers?.templateId, 40);
  const itemCount = safeInteger(
    payload?.selectedItemTypes?.length ?? payload?.addedItemCount ?? 0,
    'invalid_planner_funnel_item_count',
  );
  return deepFreeze({
    type: 'planner_funnel',
    eventVersion: 1,
    stage,
    plannerInventoryVersion,
    templateId: /^[a-z][a-z0-9_]{2,39}$/u.test(templateId) ? templateId : 'unknown',
    itemCount,
    availableVariantCount: Array.isArray(payload?.variants)
      ? payload.variants.filter((variant) => variant.status === 'current').length
      : undefined,
    cartEligible: typeof payload?.cartEligible === 'boolean' ? payload.cartEligible : undefined,
    variantId: variantIds.includes(payload?.variantId) || payload?.variantId === 'edited'
      ? payload.variantId
      : undefined,
    occurredAt: now.toISOString(),
    dataMinimized: true,
    omitted: Object.freeze([
      'actor',
      'answers',
      'dates',
      'location',
      'listingIds',
      'ownerIds',
      'quoteHashes',
      'prices',
    ]),
  });
}
