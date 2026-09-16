import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { privatePilotAllowedCatalogKeys } from '../src/private_pilot_domain.js';
import {
  assertListingSupplyEnrichmentTechnicalAccess,
  generateListingSupplyEnrichment,
  linkListingSupplyEnrichmentFollowUp,
  ListingSupplyEnrichmentError,
  listingSupplyHeuristicTemplates,
  recordListingSupplyEnrichmentOutcome,
} from '../src/listing_supply_enrichment.js';

const now = new Date('2026-08-21T12:00:00.000Z');

function listing(overrides = {}) {
  return {
    id: 'listing-source-1',
    owner_id: 'owner-1',
    payload: {},
    catalog_version: 1,
    catalog_revision: 7,
    status: 'active',
    is_active: true,
    category_id: 'cat8',
    subcategory: 'Bohrmaschinen',
    location_text: 'Musterstraße 1, Berlin',
    city: 'Berlin',
    country: 'Deutschland',
    latitude: '52.5201',
    longitude: '13.4051',
    ...overrides,
  };
}

function clientWith(source, target = null) {
  const rows = new Map([[source.id, structuredClone(source)]]);
  if (target) rows.set(target.id, structuredClone(target));
  return {
    rows,
    async query(statement, values) {
      if (/SELECT id, owner_id, payload,[\s\S]*FOR UPDATE/u.test(statement)) {
        const row = rows.get(values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
      }
      if (/UPDATE listings[\s\S]*catalog_revision = catalog_revision \+ 1/u.test(statement)) {
        const row = rows.get(values[0]);
        if (!row || row.owner_id !== values[1]
            || Number(row.catalog_revision) !== Number(values[3])) {
          return { rowCount: 0, rows: [] };
        }
        row.payload = JSON.parse(values[2]);
        row.catalog_revision += 1;
        return { rowCount: 1, rows: [] };
      }
      if (/SELECT id, owner_id, catalog_version, category_id, subcategory[\s\S]*FOR KEY SHARE/u.test(statement)) {
        const row = rows.get(values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
      }
      throw new Error(`unexpected query: ${statement}`);
    },
  };
}

async function generated(source = listing()) {
  const client = clientWith(source);
  const session = await generateListingSupplyEnrichment(client, {
    actorId: source.owner_id,
    listingId: source.id,
    now,
  });
  return { client, session };
}

test('G5A templates are exact allowlisted deterministic questions bounded to three', async () => {
  const allowed = new Set(privatePilotAllowedCatalogKeys);
  const templates = listingSupplyHeuristicTemplates();
  assert.ok(templates.length > 0);
  for (const template of templates) {
    assert.ok(template.suggestions.length <= 3);
    for (const suggestion of template.suggestions) {
      assert.ok(allowed.has(`${suggestion.categoryId}\u001f${suggestion.subcategory}`));
    }
  }
  const { client, session } = await generated();
  assert.equal(session.suggestions.length, 3);
  assert.equal(session.detectionBasis.kind, 'exact_category_template_question');
  assert.equal(session.detectionBasis.titleAnalysisUsed, false);
  assert.equal(session.detectionBasis.photoAnalysisUsed, false);
  assert.equal(session.detectionBasis.suggestionIsDetectionTruth, false);
  assert.equal(session.externalGenerativeAiUsed, false);
  for (const suggestion of session.suggestions) assert.match(suggestion.prompt, /\?$/u);

  const repeat = await generateListingSupplyEnrichment(client, {
    actorId: 'owner-1',
    listingId: 'listing-source-1',
    now: new Date('2026-08-21T13:00:00.000Z'),
  });
  assert.deepEqual(repeat, session);
});

test('unknown source categories produce no suggestions and never block the primary listing', async () => {
  const { session } = await generated(listing({
    category_id: 'cat1',
    subcategory: 'Smartphones',
  }));
  assert.deepEqual(session.suggestions, []);
  assert.equal(session.primaryListingCreated, true);
  assert.equal(session.primaryListingBlocked, false);
});

test('all five owner outcomes are explicit and only follow-up outcomes create safe prefill', async () => {
  const outcomes = [
    'included_accessory',
    'separate_rental',
    'standalone_listing',
    'not_part',
    'wrong_detection',
  ];
  for (const outcome of outcomes) {
    const { client, session } = await generated();
    const result = await recordListingSupplyEnrichmentOutcome(client, {
      actorId: 'owner-1',
      listingId: 'listing-source-1',
      suggestionId: session.suggestions[0].id,
      outcome,
      now,
    });
    assert.equal(result.suggestion.outcome, outcome);
    assert.equal(result.primaryListingBlocked, false);
    assert.equal(result.externalGenerativeAiUsed, false);
    if (outcome === 'separate_rental' || outcome === 'standalone_listing') {
      assert.equal(result.prefill.title, session.suggestions[0].label);
      assert.equal(result.prefill.pricePrefilled, false);
      assert.equal(result.prefill.descriptionPrefilled, false);
      assert.equal(result.prefill.photoPrefilled, false);
      assert.deepEqual(result.prefill.link, {
        sourceListingId: 'listing-source-1',
        suggestionId: session.suggestions[0].id,
        outcome,
      });
    } else {
      assert.equal(result.prefill, null);
    }
    if (outcome === 'included_accessory') {
      assert.equal(result.suggestion.documentation.ownerConfirmed, true);
      assert.equal(result.suggestion.documentation.handoverEvidenceSlot, 'accessories');
    }
    if (outcome === 'not_part') {
      assert.deepEqual(result.suggestion.documentation.fields, ['photos', 'description']);
    }
    if (outcome === 'wrong_detection') {
      assert.equal(result.suggestion.documentation.acceptedAsListingTruth, false);
    }
  }
});

test('recording is idempotent, conflicting truth is rejected, and owner scope is enforced', async () => {
  const { client, session } = await generated();
  const request = {
    actorId: 'owner-1',
    listingId: 'listing-source-1',
    suggestionId: session.suggestions[0].id,
    outcome: 'not_part',
    now,
  };
  const first = await recordListingSupplyEnrichmentOutcome(client, request);
  const repeat = await recordListingSupplyEnrichmentOutcome(client, request);
  assert.deepEqual(repeat, first);
  await assert.rejects(
    recordListingSupplyEnrichmentOutcome(client, {
      ...request,
      outcome: 'included_accessory',
    }),
    (error) => error instanceof ListingSupplyEnrichmentError
      && error.code === 'listing_supply_enrichment_outcome_already_recorded',
  );
  await assert.rejects(
    generateListingSupplyEnrichment(client, {
      actorId: 'different-owner',
      listingId: 'listing-source-1',
      now,
    }),
    (error) => error.status === 403,
  );
});

test('follow-up link validates owner, target classification and completes once', async () => {
  const { client, session } = await generated();
  const suggestion = session.suggestions[0];
  await recordListingSupplyEnrichmentOutcome(client, {
    actorId: 'owner-1',
    listingId: 'listing-source-1',
    suggestionId: suggestion.id,
    outcome: 'separate_rental',
    now,
  });
  client.rows.set('listing-target-1', listing({
    id: 'listing-target-1',
    category_id: suggestion.target.categoryId,
    subcategory: suggestion.target.subcategory,
  }));
  const raw = {
    sourceListingId: 'listing-source-1',
    suggestionId: suggestion.id,
    outcome: 'separate_rental',
  };
  const linked = await linkListingSupplyEnrichmentFollowUp(client, {
    actorId: 'owner-1',
    targetListingId: 'listing-target-1',
    raw,
    now,
  });
  assert.equal(linked.linked, true);
  assert.equal(linked.linkedListingId, 'listing-target-1');
  assert.deepEqual(await linkListingSupplyEnrichmentFollowUp(client, {
    actorId: 'owner-1',
    targetListingId: 'listing-target-1',
    raw,
    now,
  }), linked);
});

test('technical access is disabled unless every non-public gate is exact', () => {
  assert.throws(
    () => assertListingSupplyEnrichmentTechnicalAccess({}),
    (error) => error.status === 404,
  );
  assert.equal(assertListingSupplyEnrichmentTechnicalAccess({
    listingSupplyEnrichment: {
      enabled: true,
      publicReleaseAllowed: false,
      externalGenerativeAiAllowed: false,
    },
  }), true);
});

test('G5A routing is fail-open for the primary listing and covered by export, erasure, retention and disabled compose flags', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const exportSource = readFileSync(new URL('../src/privacy_export.js', import.meta.url), 'utf8');
  const retention = readFileSync(new URL('../src/retention_inventory.js', import.meta.url), 'utf8');
  const production = readFileSync(new URL('../compose.prod.yml', import.meta.url), 'utf8');
  const staging = readFileSync(new URL('../compose.staging.yml', import.meta.url), 'utf8');

  const createRoute = app.indexOf("app.post('/v1/listings'");
  const generateRoute = app.indexOf("app.post('/v1/listings/:id/supply-enrichment'");
  assert.ok(createRoute >= 0 && generateRoute > createRoute);
  assert.match(config, /listing supply enrichment cannot be enabled in production/u);
  assert.match(config, /publicReleaseAllowed: false,[\s\S]*externalGenerativeAiAllowed: false/u);
  assert.match(exportSource, /SELECT id, payload,[\s\S]*FROM listings WHERE owner_id/u);
  assert.match(app, /UPDATE listings[\s\S]*payload = jsonb_build_object\([\s\S]*WHERE owner_id/u);
  assert.match(retention, /'listing_supply_enrichment'[\s\S]*payload \? 'supplyEnrichment'/u);
  assert.match(production, /LISTING_SUPPLY_ENRICHMENT_ENABLED: \$\{LISTING_SUPPLY_ENRICHMENT_ENABLED:-false\}/u);
  assert.match(staging, /LISTING_SUPPLY_ENRICHMENT_ENABLED: \$\{LISTING_SUPPLY_ENRICHMENT_ENABLED:-false\}/u);
});
