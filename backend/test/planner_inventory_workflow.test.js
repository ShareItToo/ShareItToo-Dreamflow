import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  addPlannerProjectToCart,
  assertPlannerInventoryTechnicalAccess,
  plannerFunnelEvent,
  PlannerInventoryError,
  plannerInventoryVersion,
  resolvePlannerInventory,
} from '../src/planner_inventory_workflow.js';
import { plannerTemplateCatalog } from '../src/planner_core.js';

const rawPlan = Object.freeze({
  templateId: 'move',
  answers: Object.freeze({
    load_size: 'medium',
    stairs: 'some',
    disassembly: 'no',
    fragile_items: 'yes',
    transport_arranged: 'yes',
  }),
  startDate: '2026-09-10',
  endDate: '2026-09-12',
});

const rowsByItem = Object.freeze([
  Object.freeze([
    row('listing-a1', 'owner-a', 10, 4.8),
    row('listing-b1', 'owner-b', 5, 4.9),
  ]),
  Object.freeze([
    row('listing-a2', 'owner-a', 10, 4.8),
    row('listing-b2', 'owner-b', 5, 4.9),
  ]),
  Object.freeze([
    row('listing-a3', 'owner-a', 10, 4.8),
    row('listing-c3', 'owner-c', 20, 5),
  ]),
]);

const amounts = Object.freeze({
  'listing-a1': 1000,
  'listing-b1': 900,
  'listing-a2': 500,
  'listing-b2': 600,
  'listing-a3': 300,
  'listing-c3': 100,
});

function row(id, ownerId, reviewCount, averageRating) {
  return Object.freeze({
    id,
    owner_id: ownerId,
    title: `Artikel ${id}`,
    category_id: 'cat20',
    subcategory: 'Zubehör',
    condition: 'good',
    city: 'Berlin',
    country: 'Deutschland',
    owner_review_count: reviewCount,
    average_rating: reviewCount > 0 ? averageRating : null,
  });
}

function queryClient(rows = rowsByItem) {
  let index = 0;
  return {
    async query(statement, values) {
      assert.match(statement, /FROM listings AS listing/u);
      assert.equal(values[0], 'renter-1');
      assert.ok(Array.isArray(values[1]) && values[1].length > 0);
      assert.equal(values[2], false);
      assert.deepEqual(values[3], []);
      assert.equal(values[4], 24);
      const selected = rows[index] ?? [];
      index += 1;
      return { rowCount: selected.length, rows: selected };
    },
  };
}

function quoteCandidateWith(overrides = {}) {
  return async (_client, { raw, persist }) => {
    assert.equal(persist, false);
    const totalMinor = overrides[raw.listingId] ?? amounts[raw.listingId];
    assert.ok(Number.isSafeInteger(totalMinor));
    const quoteHash = crypto.createHash('sha256')
      .update(`${raw.listingId}:${totalMinor}:1`)
      .digest('hex');
    return {
      quoteId: null,
      quoteHash,
      quotedAt: '2026-08-21T00:00:00.000Z',
      expiresAt: null,
      preview: true,
      listingId: raw.listingId,
      startDate: raw.startDate,
      endDate: raw.endDate,
      availabilityRevision: 1,
      quote: {
        currency: 'EUR',
        rentalSubtotalMinor: totalMinor - 100,
        platformFeeMinor: 100,
        totalMinor,
        ownerPayoutMinor: totalMinor - 100,
      },
    };
  };
}

async function resolution(raw = rawPlan, rows = rowsByItem, quoteOverrides = {}) {
  return resolvePlannerInventory(queryClient(rows), {
    actorId: 'renter-1',
    raw,
    quoteCandidate: quoteCandidateWith(quoteOverrides),
  });
}

function listingIds(variant) {
  return variant.selections.map((selection) => selection.listing.id);
}

test('G4B resolves three truthful deterministic variants from current server quote previews', async () => {
  const result = await resolution();
  assert.equal(result.plannerInventoryVersion, plannerInventoryVersion);
  assert.equal(result.templateId, 'move');
  assert.equal(result.candidateSummary.length, 3);
  assert.equal(result.cartEligible, true);
  assert.deepEqual(result.variants.map((variant) => variant.id), [
    'one_stop',
    'price_efficient',
    'top_rated',
  ]);
  assert.deepEqual(listingIds(result.variants[0]), [
    'listing-a1',
    'listing-a2',
    'listing-a3',
  ]);
  assert.deepEqual(listingIds(result.variants[1]), [
    'listing-b1',
    'listing-a2',
    'listing-c3',
  ]);
  assert.deepEqual(listingIds(result.variants[2]), [
    'listing-b1',
    'listing-b2',
    'listing-c3',
  ]);
  assert.equal(result.variants[0].totals.totalMinor, 1800);
  assert.equal(result.variants[1].totals.currency, 'EUR');
  assert.equal(result.serverTruth.currentAvailabilityChecked, true);
  assert.equal(result.serverTruth.currentQuotePreviewChecked, true);
  assert.equal(result.serverTruth.quotePersisted, false);
  assert.equal(result.serverTruth.reservationCreated, false);
  assert.equal(result.serverTruth.bookingCreated, false);
  assert.equal(result.externalGenerativeAiUsed, false);
  assert.match(result.inventorySnapshotHash, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(result).includes('ownerId'), false);
});

test('closed-pilot question catalog exposes only deterministic client inputs', () => {
  const catalog = plannerTemplateCatalog();
  assert.equal(catalog.plannerVersion, 'G4A-2026-08-21.1');
  assert.equal(catalog.templates.length, 5);
  assert.equal(catalog.externalGenerativeAiUsed, false);
  assert.equal(catalog.serverResolutionRequired, true);
  for (const template of catalog.templates) {
    assert.match(template.id, /^[a-z][a-z0-9_]{2,39}$/u);
    assert.ok(template.title.length >= 3);
    assert.ok(template.questions.length >= 3);
    for (const question of template.questions) {
      assert.equal(question.type, 'single_choice');
      assert.ok(question.options.length >= 2);
    }
  }
  assert.equal(JSON.stringify(catalog).includes('catalogTargets'), false);
  assert.equal(JSON.stringify(catalog).includes('ownerId'), false);
});

test('1-Stop and top-rated labels fail closed when their exact factual basis is absent', async () => {
  const noCommonOrRated = [
    [row('listing-a1', 'owner-a', 0, null)],
    [row('listing-b2', 'owner-b', 0, null)],
    [row('listing-c3', 'owner-c', 0, null)],
  ];
  const result = await resolution(rawPlan, noCommonOrRated);
  assert.equal(result.variants[0].status, 'unavailable');
  assert.equal(result.variants[0].unavailableReason, 'no_single_owner_complete_set');
  assert.equal(result.variants[1].status, 'current');
  assert.equal(result.variants[2].status, 'unavailable');
  assert.equal(result.variants[2].unavailableReason, 'rated_complete_set_unavailable');
});

test('bounded item and listing edits are explicit and missing required items block cart eligibility', async () => {
  const edited = await resolution({
    ...rawPlan,
    preferredListings: {
      moving_support_accessories: 'listing-b2',
    },
  });
  assert.equal(edited.editedSelection.status, 'current');
  assert.deepEqual(listingIds(edited.editedSelection), [
    'listing-b1',
    'listing-b2',
    'listing-c3',
  ]);

  const selectedItemTypes = [
    'moving_support_accessories',
    'additional_moving_accessory',
  ];
  const incomplete = await resolution(
    { ...rawPlan, selectedItemTypes },
    rowsByItem.slice(1),
  );
  assert.equal(incomplete.cartEligible, false);
  assert.deepEqual(incomplete.missingRequiredItemTypes, ['carrying_and_storage_equipment']);
  assert.deepEqual(
    incomplete.editableItemTypes.filter((item) => !item.selected).map((item) => item.itemType),
    ['carrying_and_storage_equipment'],
  );
});

test('cart sync re-resolves the snapshot, removes stale planner lines, and revalidates every selected listing', async () => {
  const first = await resolution();
  const projectId = 'project_move_1234';
  const prefix = `planner:${crypto.createHash('sha256').update(JSON.stringify(projectId)).digest('hex').slice(0, 12)}:`;
  const projects = [];
  let items = [{
    id: `${prefix}obsolete0000`,
    projectId,
    listingId: 'old-listing',
    quoteStatus: 'current',
    quote: { quoteHash: '0'.repeat(64) },
  }];
  const deleted = [];
  const written = [];
  const projectWriter = async (_client, request) => {
    projects.splice(0, projects.length, {
      id: request.clientProjectId,
      title: request.raw.title,
      answers: request.raw.answers,
    });
    return { reservationCreated: false, projects, items };
  };
  const itemDeleter = async (_client, request) => {
    deleted.push(request.clientItemId);
    items = items.filter((item) => item.id !== request.clientItemId);
    return { reservationCreated: false, projects, items };
  };
  const itemWriter = async (_client, request) => {
    written.push(request);
    const totalMinor = amounts[request.raw.listingId];
    const quoteHash = crypto.createHash('sha256')
      .update(`${request.raw.listingId}:${totalMinor}:1`)
      .digest('hex');
    items = items.filter((item) => item.id !== request.clientItemId);
    items.push({
      id: request.clientItemId,
      projectId,
      listingId: request.raw.listingId,
      quoteStatus: 'current',
      quote: { quoteHash },
    });
    return { reservationCreated: false, projects, items };
  };
  const result = await addPlannerProjectToCart(queryClient(), {
    actorId: 'renter-1',
    clientProjectId: projectId,
    raw: {
      ...rawPlan,
      variantId: 'price_efficient',
      inventorySnapshotHash: first.inventorySnapshotHash,
    },
    quoteCandidate: quoteCandidateWith(),
    cartProjectWriter: projectWriter,
    cartItemWriter: itemWriter,
    cartItemDeleter: itemDeleter,
  });
  assert.equal(result.revalidated, true);
  assert.equal(result.reservationCreated, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.addedItemCount, 3);
  assert.equal(written.length, 3);
  assert.deepEqual(deleted, [`${prefix}obsolete0000`]);
  assert.equal(projects[0].answers.source, 'planner_g4b');
  assert.equal(items.every((item) => item.quoteStatus === 'current'), true);
});

test('a changed inventory snapshot aborts before any cart mutation', async () => {
  const first = await resolution();
  let writes = 0;
  await assert.rejects(
    addPlannerProjectToCart(queryClient(), {
      actorId: 'renter-1',
      clientProjectId: 'project_move_1234',
      raw: {
        ...rawPlan,
        variantId: 'price_efficient',
        inventorySnapshotHash: first.inventorySnapshotHash,
      },
      quoteCandidate: quoteCandidateWith({ 'listing-b1': 901 }),
      cartProjectWriter: async () => { writes += 1; },
    }),
    (error) => error instanceof PlannerInventoryError
      && error.code === 'planner_inventory_snapshot_changed',
  );
  assert.equal(writes, 0);
});

test('technical access and data-minimized funnel events stay fail-closed', () => {
  const allowed = {
    planner: {
      enabled: true,
      inventoryResolutionEnabled: true,
      publicReleaseAllowed: false,
      externalGenerativeAiAllowed: false,
      inventoryResolutionAllowed: false,
    },
  };
  assert.equal(assertPlannerInventoryTechnicalAccess(allowed), true);
  for (const mutation of [
    { enabled: false },
    { inventoryResolutionEnabled: false },
    { publicReleaseAllowed: true },
    { externalGenerativeAiAllowed: true },
    { inventoryResolutionAllowed: true },
  ]) {
    assert.throws(
      () => assertPlannerInventoryTechnicalAccess({
        planner: { ...allowed.planner, ...mutation },
      }),
      (error) => error.code === 'planner_inventory_not_enabled',
    );
  }
  const event = plannerFunnelEvent('inventory_resolved', {
    templateId: 'move',
    selectedItemTypes: ['one', 'two'],
    variants: [{ status: 'current' }, { status: 'unavailable' }],
    cartEligible: true,
    answers: { private: 'must-not-appear' },
  }, { now: new Date('2026-08-21T00:00:00Z') });
  assert.equal(event.dataMinimized, true);
  assert.equal(event.availableVariantCount, 1);
  assert.equal(JSON.stringify(event).includes('must-not-appear'), false);
  for (const omitted of ['actor', 'listingIds', 'ownerIds', 'quoteHashes', 'prices']) {
    assert.ok(event.omitted.includes(omitted));
  }
});

test('deployment and route wiring keep G4B disabled, internal, and non-reserving', () => {
  const config = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../src/planner_inventory_workflow.js', import.meta.url), 'utf8');
  for (const composePath of ['../compose.prod.yml', '../compose.staging.yml']) {
    const compose = readFileSync(new URL(composePath, import.meta.url), 'utf8');
    assert.match(compose, /PLANNER_INVENTORY_ENABLED: \$\{PLANNER_INVENTORY_ENABLED:-false\}/u);
  }
  assert.match(config, /process\.env\.PLANNER_INVENTORY_ENABLED \?\? 'false'/u);
  assert.match(config, /planner inventory cannot be enabled in production before the release gate/u);
  assert.match(config, /planner inventory requires the planner core/u);
  assert.match(app, /assertPlannerInventoryTechnicalAccess\(config\)/u);
  assert.match(app, /\/v1\/planner\/resolve/u);
  assert.match(app, /\/v1\/planner\/projects\/:id\/cart/u);
  assert.match(app, /\/v1\/planner\/templates/u);
  assert.match(workflow, /quoteCandidate/u);
  assert.match(workflow, /persist: false/u);
  assert.doesNotMatch(workflow, /createBooking/u);
  assert.doesNotMatch(workflow, /INSERT INTO bookings/u);
  assert.doesNotMatch(workflow, /hold_expires_at/u);
});
