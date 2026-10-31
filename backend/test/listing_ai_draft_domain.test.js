import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assessListingAiDraftReadiness,
  createListingAiDraftRevision,
  listingAiConditionValues,
  listingAiDraftFieldKeys,
  listingAiOwnerConfirmationIds,
  listingAiPriceEngineAuthority,
  ListingAiDraftError,
  normalizeListingAiBudgetAggregate,
  normalizeListingAiDraftField,
  normalizeRegionalMarketObservation,
  normalizeRegionalPriceEngineSnapshot,
  transitionListingAiDerivative,
} from '../src/listing_ai_draft_domain.js';

const imageReferences = ['image_ref_00000001', 'image_ref_00000002'];
const hash = 'a'.repeat(64);

function field(value, overrides = {}) {
  return {
    value,
    confidence: 'HIGH',
    source: { type: 'image_analysis', imageReference: imageReferences[0] },
    confirmationRequired: false,
    reasonCode: 'visible_object_match',
    ownerConfirmed: false,
    ...overrides,
  };
}

function revision(overrides = {}) {
  return createListingAiDraftRevision({
    draftId: 'listing_ai_draft_12345678-1234-4123-8123-123456789abc',
    ownerId: 'owner_12345678',
    imageReferences,
    fields: {
      title: field('Akku-Bohrschrauber'),
      condition: field('good', {
        confirmationRequired: true,
        ownerConfirmed: true,
      }),
    },
    clarificationQuestions: [],
    ownerConfirmations: Object.fromEntries(
      listingAiOwnerConfirmationIds.map((id) => [id, true]),
    ),
    generatedAt: new Date('2026-08-23T21:00:00.000Z'),
    ...overrides,
  });
}

test('N2 revision is isolated, versioned, immutable and never publish-authoritative', () => {
  const result = revision();
  assert.equal(result.domainVersion, 'N2-2026-08-23.1');
  assert.equal(result.schemaVersion, 'listing-ai-draft-v1');
  assert.equal(result.promptVersion, 'listing-ai-prompt-v1');
  assert.equal(result.autoPublishAllowed, false);
  assert.equal(result.historicalListingRewriteAllowed, false);
  assert.equal(result.publicationAction, 'explicit_owner_action_required');
  assert.match(result.payloadSha256, /^[a-f0-9]{64}$/u);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.fields.title));
});

test('every generated field carries confidence, provenance, reason and version', () => {
  for (const key of listingAiDraftFieldKeys) {
    const value = key === 'replacementValueMinor'
      ? 25000
      : ['projectTags', 'useCases', 'accessories'].includes(key)
        ? ['renovation']
        : key === 'condition'
          ? 'good'
          : 'sichtbarer Wert';
    const result = normalizeListingAiDraftField(key, field(value), { imageReferences });
    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.source.type, 'image_analysis');
    assert.equal(result.source.imageReference, imageReferences[0]);
    assert.equal(result.reasonCode, 'visible_object_match');
    assert.equal(result.promptVersion, 'listing-ai-prompt-v1');
    assert.equal(result.schemaVersion, 'listing-ai-draft-v1');
    if (['condition', 'accessories', 'replacementValueMinor'].includes(key)) {
      assert.equal(result.confirmationRequired, true);
    }
  }
});

test('medium values require review and low confidence stays blank', () => {
  const medium = normalizeListingAiDraftField('brand', field('Bosch', {
    confidence: 'MEDIUM',
  }), { imageReferences });
  assert.equal(medium.confirmationRequired, true);

  const low = normalizeListingAiDraftField('model', field(null, {
    confidence: 'LOW',
    reasonCode: 'model_not_legible',
  }), { imageReferences });
  assert.equal(low.value, null);
  assert.equal(low.confirmationRequired, true);

  assert.throws(
    () => normalizeListingAiDraftField('model', field('invented-model', {
      confidence: 'LOW',
    }), { imageReferences }),
    (error) => error instanceof ListingAiDraftError
      && error.code === 'listing_ai_low_confidence_value_must_be_blank',
  );
});

test('condition values are restricted to the exact Android editor contract', () => {
  assert.deepEqual(listingAiConditionValues, [
    'new',
    'like-new',
    'good',
    'acceptable',
    'worn',
  ]);
  for (const value of listingAiConditionValues) {
    assert.equal(
      normalizeListingAiDraftField('condition', field(value), { imageReferences }).value,
      value,
    );
  }
  assert.throws(
    () => normalizeListingAiDraftField(
      'condition',
      field('Optisch gepflegt, Funktion ungeprueft'),
      { imageReferences },
    ),
    (error) => error instanceof ListingAiDraftError
      && error.code === 'invalid_listing_ai_condition',
  );
});

test('first draft is bounded to four opaque images and three clarifications', () => {
  assert.throws(
    () => revision({ imageReferences: [...imageReferences, 'image_ref_3', 'image_ref_4', 'image_ref_5'] }),
    /listing_ai_image_count_out_of_range/u,
  );
  assert.throws(
    () => revision({ imageReferences: ['https://example.invalid/private.jpg'] }),
    /invalid_listing_ai_image_reference|unsafe_listing_ai_image_reference/u,
  );
  assert.throws(
    () => revision({
      clarificationQuestions: [0, 1, 2, 3].map((index) => ({
        id: `question_${index}0000000`,
        field: 'model',
        question: `Welche Modellnummer ist sichtbar ${index}?`,
      })),
    }),
    /listing_ai_clarification_limit_exceeded/u,
  );
});

test('readiness requires all eleven owner confirmations and reviewed fields', () => {
  const ready = assessListingAiDraftReadiness(revision());
  assert.equal(ready.readyToPublish, true);
  assert.equal(ready.autoPublishAllowed, false);

  const confirmations = Object.fromEntries(
    listingAiOwnerConfirmationIds.map((id) => [id, true]),
  );
  confirmations.functionality = false;
  const blocked = assessListingAiDraftReadiness(revision({ ownerConfirmations: confirmations }));
  assert.equal(blocked.readyToPublish, false);
  assert.equal(blocked.functionalityConfirmed, false);
  assert.deepEqual(blocked.missingConfirmations, ['functionality']);

  const review = assessListingAiDraftReadiness(revision({
    fields: { brand: field('Bosch', { confidence: 'MEDIUM' }) },
  }));
  assert.deepEqual(review.fieldsNeedingReview, ['brand']);
});

test('analysis derivatives only progress forward to a purge terminal state', () => {
  const derivative = {
    id: 'derivative_12345678',
    state: 'prepared',
    imageReference: imageReferences[0],
  };
  const ready = transitionListingAiDerivative(derivative, 'analysis_ready', {
    now: new Date('2026-08-23T21:01:00.000Z'),
  });
  const consumed = transitionListingAiDerivative(ready, 'consumed', {
    now: new Date('2026-08-23T21:02:00.000Z'),
  });
  const purged = transitionListingAiDerivative(consumed, 'purged', {
    now: new Date('2026-08-23T21:03:00.000Z'),
  });
  assert.equal(purged.state, 'purged');
  assert.equal(purged.purgedAt, '2026-08-23T21:03:00.000Z');
  assert.throws(
    () => transitionListingAiDerivative(purged, 'prepared'),
    /invalid_listing_ai_derivative_transition/u,
  );
});

test('market observations stay coarse and price snapshots use only Engine V2 minor units', () => {
  const observation = normalizeRegionalMarketObservation({
    observationId: 'observation_12345678',
    draftId: 'listing_ai_draft_12345678-1234-4123-8123-123456789abc',
    coarseRegionKey: 'heilbronn_wave0',
    categoryId: 'cat8',
    subcategory: 'Bohrmaschinen',
    dailyPriceMinor: 1200,
    currency: 'EUR',
    sourceType: 'synthetic_test',
    observedAt: '2026-08-23T21:00:00.000Z',
  });
  assert.equal(observation.exactAddressStored, false);
  assert.throws(
    () => normalizeRegionalMarketObservation({
      ...observation,
      coarseRegionKey: 'musterstrasse_74072',
    }),
    /must_be_coarse/u,
  );

  const snapshot = normalizeRegionalPriceEngineSnapshot({
    snapshotId: 'price_snapshot_12345678',
    draftId: 'listing_ai_draft_12345678-1234-4123-8123-123456789abc',
    draftVersionId: 'draft_version_12345678',
    engineAuthority: listingAiPriceEngineAuthority,
    engineVersion: 'v2-test-fixture',
    currency: 'EUR',
    rangeLowMinor: 900,
    recommendedDailyMinor: 1200,
    rangeHighMinor: 1500,
    explanation: 'Deterministic synthetic fixture for N2.',
    inputSha256: hash,
    createdAt: '2026-08-23T21:00:00.000Z',
  });
  assert.equal(snapshot.authoritativeProviderPriceUsed, false);
  assert.throws(
    () => normalizeRegionalPriceEngineSnapshot({
      ...snapshot,
      engineAuthority: 'LEGACY_AI_PRICE',
    }),
    /invalid_regional_price_engine_authority/u,
  );
});

test('budget aggregate is fail closed and cannot overspend', () => {
  const disabled = normalizeListingAiBudgetAggregate({
    periodKey: '2026-08',
    budgetCents: 0,
    spentCents: 0,
    reservedCents: 0,
    providerCallAllowed: true,
  });
  assert.equal(disabled.providerCallAllowed, false);
  assert.equal(disabled.paidCallPerformed, false);
  assert.throws(
    () => normalizeListingAiBudgetAggregate({
      periodKey: '2026-08',
      budgetCents: 10,
      spentCents: 8,
      reservedCents: 3,
    }),
    /invalid_listing_ai_reserved_cents/u,
  );
});

test('N2 SQL is additive, rollback guarded and leaves listings untouched', () => {
  const up = readFileSync(new URL(
    '../sql/migrations/066_blue_ocean_listing_ai_foundation.up.sql',
    import.meta.url,
  ), 'utf8');
  const down = readFileSync(new URL(
    '../sql/migrations/066_blue_ocean_listing_ai_foundation.down.sql',
    import.meta.url,
  ), 'utf8');
  for (const table of [
    'listing_ai_drafts',
    'listing_ai_draft_versions',
    'listing_ai_analysis_derivatives',
    'regional_market_observations',
    'regional_price_engine_snapshots',
    'listing_ai_cost_ledger',
    'listing_ai_budget_aggregates',
  ]) {
    assert.match(up, new RegExp(`CREATE TABLE ${table}\\b`, 'u'));
  }
  assert.doesNotMatch(up, /ALTER TABLE listings|UPDATE listings|INSERT INTO listings|DELETE FROM listings/iu);
  assert.match(up, /SIT_REGIONAL_PRICE_ENGINE_V2/u);
  assert.match(down, /rollback blocked: listing AI foundation data exists/u);
  assert.doesNotMatch(down, /DROP TABLE listings|ALTER TABLE listings|DELETE FROM listings/iu);
});
