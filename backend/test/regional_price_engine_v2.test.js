import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRegionalDurationPriceSchedule,
  calculateAuthenticDemandFactor,
  calculateRegionalFallbackAnchor,
  normalizeRegionalPriceObservationV2,
  previewRegionalPriceWithV52Fee,
  recommendRegionalPriceV2,
  regionalMarketObservationVersion,
  regionalPriceCategoryRules,
  regionalPriceEngineAuthority,
  regionalPriceEngineVersion,
  regionalPriceManualImportColumns,
  regionalPriceUserPrinciple,
  RegionalPriceEngineError,
  selectOwnerRegionalDailyPrice,
} from '../src/regional_price_engine_v2.js';

const asOf = new Date('2026-08-24T00:00:00.000Z');

function observation(index, overrides = {}) {
  const sourceType = overrides.sourceType ?? 'completed_sit_rental';
  const statuses = {
    completed_sit_rental: 'completed',
    accepted_sit_request: 'accepted',
    active_sit_listing: 'active',
    reviewed_external_c2c_asking_price: 'reviewed',
    professional_commercial_reference: 'reviewed',
    synthetic_fixture: 'synthetic',
  };
  return {
    observationId: `regional_observation_${String(index).padStart(8, '0')}`,
    categoryKey: 'power_tools',
    subcategory: 'Bohrmaschinen',
    brandModelFamily: 'Bosch Professional',
    condition: 'good',
    dailyEquivalentRentMinor: 1_500 + index,
    currency: 'EUR',
    marketActorType: sourceType === 'professional_commercial_reference'
      ? 'commercial'
      : 'private',
    geographyBucket: 'heilbronn_wave0',
    stateCode: 'DE-BW',
    countryCode: 'DE',
    distanceKm: 5,
    capturedAt: '2026-08-23T00:00:00.000Z',
    sourceType,
    status: statuses[sourceType],
    provenanceReference: `provenance_reference_${String(index).padStart(8, '0')}`,
    reviewed: sourceType.includes('external') || sourceType.includes('professional'),
    amountIncludesOnlyRent: true,
    synthetic: sourceType === 'synthetic_fixture',
    ...overrides,
  };
}

function recommendation(overrides = {}) {
  return recommendRegionalPriceV2({
    categoryKey: 'power_tools',
    subcategory: 'Bohrmaschinen',
    brandModelFamily: 'Bosch Professional',
    condition: 'good',
    replacementValueBand: 'eur_250_500',
    replacementValueBandConfidence: 'HIGH',
    ownerConfirmedReplacementValueBand: false,
    observations: [],
    asOf,
    ...overrides,
  });
}

test('all six versioned category anchors use deterministic full-EUR bounds', () => {
  for (const [categoryKey, rule] of Object.entries(regionalPriceCategoryRules)) {
    const result = calculateRegionalFallbackAnchor({
      categoryKey,
      condition: 'like_new',
      replacementValueBand: 'eur_250_500',
      replacementValueBandConfidence: 'HIGH',
    });
    assert.equal(result.engineAuthority, regionalPriceEngineAuthority);
    assert.equal(result.engineVersion, regionalPriceEngineVersion);
    assert.equal(result.fallbackAnchorMinor % 100, 0);
    assert.ok(result.fallbackAnchorMinor >= rule.minimumMinor);
    assert.ok(result.fallbackAnchorMinor <= rule.maximumMinor);
  }
});

test('replacement bands, condition factors and Stage-A exclusions fail closed', () => {
  assert.equal(calculateRegionalFallbackAnchor({
    categoryKey: 'power_tools',
    condition: 'good',
    replacementValueBand: 'eur_250_500',
    replacementValueBandConfidence: 'HIGH',
  }).fallbackAnchorMinor, 1_700);
  assert.equal(calculateRegionalFallbackAnchor({
    categoryKey: 'power_tools',
    condition: 'visibly_used_but_functional',
    replacementValueBand: 'eur_250_500',
    replacementValueBandConfidence: 'HIGH',
  }).fallbackAnchorMinor, 1_500);
  assert.throws(
    () => calculateRegionalFallbackAnchor({
      categoryKey: 'power_tools',
      condition: 'good',
      replacementValueBand: 'eur_100_250',
      replacementValueBandConfidence: 'MEDIUM',
    }),
    /regional_price_replacement_value_confirmation_required/u,
  );
  assert.throws(
    () => calculateRegionalFallbackAnchor({
      categoryKey: 'power_tools',
      condition: 'good',
      replacementValueBand: 'over_1000',
      replacementValueBandConfidence: 'HIGH',
    }),
    /regional_price_owner_replacement_value_required/u,
  );
  assert.throws(
    () => calculateRegionalFallbackAnchor({
      categoryKey: 'power_tools',
      condition: 'function_not_confirmed',
      replacementValueBand: 'under_100',
      replacementValueBandConfidence: 'HIGH',
    }),
    /regional_price_functionality_confirmation_required/u,
  );
  assert.throws(
    () => calculateRegionalFallbackAnchor({
      categoryKey: 'power_tools',
      condition: 'defective',
      replacementValueBand: 'under_100',
      replacementValueBandConfidence: 'HIGH',
    }),
    /regional_price_defective_outside_stage_a_scope/u,
  );
});

test('observation schema is closed, coarse, EUR-only and provenance-safe', () => {
  const result = normalizeRegionalPriceObservationV2(observation(1));
  assert.equal(result.observationVersion, regionalMarketObservationVersion);
  assert.equal(result.sourceQualityBasisPoints, 10_000);
  assert.equal(result.exactAddressStored, false);
  assert.equal(result.personalIdentityStored, false);

  assert.throws(
    () => normalizeRegionalPriceObservationV2({ ...observation(2), unknown: true }),
    /regional_price_observation_schema_invalid/u,
  );
  assert.throws(
    () => normalizeRegionalPriceObservationV2({
      ...observation(3),
      geographyBucket: 'musterstrasse_74072',
    }),
    /regional_price_geography_must_be_coarse/u,
  );
  assert.throws(
    () => normalizeRegionalPriceObservationV2({ ...observation(4), currency: 'USD' }),
    /regional_price_currency_invalid/u,
  );
  assert.throws(
    () => normalizeRegionalPriceObservationV2({
      ...observation(5),
      provenanceReference: 'https://market.invalid/item/5',
    }),
    /regional_price_provenance_reference_invalid/u,
  );
});

test('external observations require review and synthetic truth cannot be relabeled', () => {
  assert.throws(
    () => normalizeRegionalPriceObservationV2(observation(6, {
      sourceType: 'reviewed_external_c2c_asking_price',
      status: 'reviewed',
      reviewed: false,
    })),
    /regional_price_external_observation_review_required/u,
  );
  assert.throws(
    () => normalizeRegionalPriceObservationV2(observation(7, {
      sourceType: 'synthetic_fixture',
      status: 'synthetic',
      synthetic: false,
    })),
    /regional_price_observation_synthetic_truth_invalid/u,
  );
});

test('cold start is honest, fallback-led and offers editable 90/100/110 choices', () => {
  const result = recommendation();
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.fallbackShareBasisPoints, 10_000);
  assert.equal(result.regionalWeightedMedianMinor, null);
  assert.deepEqual(result.ownerOptions.map((option) => option.dailyPriceMinor), [1_500, 1_700, 1_900]);
  assert.equal(result.userPrinciple, regionalPriceUserPrinciple);
  assert.match(result.explanation, /zu wenige Vergleichsdaten/u);
  assert.equal(result.authoritativeProviderPriceUsed, false);
  assert.equal(result.syntheticLearningApplied, false);
});

test('geographic hierarchy selects the narrowest scope with sufficient effective evidence', () => {
  const observations = [
    observation(10, { distanceKm: 8, dailyEquivalentRentMinor: 1_300 }),
    observation(11, { distanceKm: 12, dailyEquivalentRentMinor: 1_400 }),
    observation(12, { distanceKm: 35, dailyEquivalentRentMinor: 1_500 }),
    observation(13, { distanceKm: 42, dailyEquivalentRentMinor: 1_600 }),
  ];
  const result = recommendation({ observations });
  assert.equal(result.geographyScope, 'within_50_km');
  assert.equal(result.includedObservationCount, 4);
  assert.equal(result.confidence, 'MEDIUM');
  assert.match(result.explanation, /50 km/u);
});

test('strong local distinct evidence can reach HIGH confidence', () => {
  const observations = Array.from({ length: 10 }, (_, index) => observation(100 + index, {
    distanceKm: 2 + index,
    dailyEquivalentRentMinor: 1_400 + (index * 25),
  }));
  const result = recommendation({ observations });
  assert.equal(result.geographyScope, 'within_20_km');
  assert.equal(result.confidence, 'HIGH');
  assert.ok(result.effectiveObservationCountMilli >= 8_000);
  assert.ok(result.fallbackShareBasisPoints < 5_000);
});

test('broad state or national evidence is never mislabeled as a Heilbronn market price', () => {
  const observations = Array.from({ length: 4 }, (_, index) => observation(200 + index, {
    distanceKm: 150 + index,
    geographyBucket: 'baden_wuerttemberg_reviewed',
  }));
  const result = recommendation({ observations });
  assert.equal(result.geographyScope, 'baden_wuerttemberg');
  assert.equal(result.confidence, 'LOW');
  assert.doesNotMatch(result.explanation, /Heilbronn market price|Marktpreis Heilbronn/iu);
});

test('weighted median and MAD screening reject a robust high outlier', () => {
  const observations = [
    ...Array.from({ length: 5 }, (_, index) => observation(300 + index, {
      dailyEquivalentRentMinor: 1_400 + (index * 30),
    })),
    observation(399, { dailyEquivalentRentMinor: 3_500 }),
  ];
  const result = recommendation({ observations });
  assert.ok(result.regionalWeightedMedianMinor >= 1_400);
  assert.ok(result.regionalWeightedMedianMinor <= 1_520);
  assert.deepEqual(result.excludedObservations, [{
    observationId: 'regional_observation_00000399',
    reasonCode: 'robust_mad_outlier',
  }]);
});

test('few weak commercial references are strongly shrunk toward the fallback', () => {
  const result = recommendation({
    observations: [observation(400, {
      sourceType: 'professional_commercial_reference',
      status: 'reviewed',
      reviewed: true,
      marketActorType: 'commercial',
      distanceKm: 90,
      dailyEquivalentRentMinor: 3_000,
    })],
  });
  assert.equal(result.confidence, 'LOW');
  assert.ok(result.fallbackShareBasisPoints > 8_000);
  assert.ok(result.recommendedDailyMinor < 2_000);
  assert.deepEqual(result.sourceComposition, { professional_commercial_reference: 1 });
});

test('synthetic, stale, future, category-mismatch and non-rent rows never learn', () => {
  const result = recommendation({
    observations: [
      observation(500, {
        sourceType: 'synthetic_fixture',
        status: 'synthetic',
        synthetic: true,
      }),
      observation(501, { capturedAt: '2023-01-01T00:00:00.000Z' }),
      observation(502, { capturedAt: '2026-08-25T00:00:00.000Z' }),
      observation(503, { categoryKey: 'garden_machines' }),
      observation(504, { amountIncludesOnlyRent: false }),
    ],
  });
  assert.equal(result.includedObservationCount, 0);
  assert.equal(result.syntheticLearningApplied, false);
  assert.deepEqual(result.excludedObservations.map((entry) => entry.reasonCode).sort(), [
    'category_not_comparable',
    'future_observation',
    'non_rent_components_excluded',
    'stale_observation',
    'synthetic_zero_weight',
  ]);
});

test('authentic demand stays neutral until threshold and is bounded after threshold', () => {
  assert.equal(calculateAuthenticDemandFactor({
    authenticRequestCount: 19,
    authenticActiveListingCount: 10,
    serverObserved: true,
    synthetic: false,
    observationWindowVersion: 'stage-a-v1',
  }).factorBasisPoints, 10_000);
  assert.equal(calculateAuthenticDemandFactor({
    authenticRequestCount: 100,
    authenticActiveListingCount: 10,
    serverObserved: true,
    synthetic: false,
    observationWindowVersion: 'stage-a-v1',
  }).factorBasisPoints, 11_000);
  assert.equal(calculateAuthenticDemandFactor({
    authenticRequestCount: 20,
    authenticActiveListingCount: 100,
    serverObserved: true,
    synthetic: false,
    observationWindowVersion: 'stage-a-v1',
  }).factorBasisPoints, 9_100);
  assert.equal(calculateAuthenticDemandFactor({
    authenticRequestCount: 100,
    authenticActiveListingCount: 10,
    serverObserved: true,
    synthetic: true,
    observationWindowVersion: 'stage-a-v1',
  }).factorBasisPoints, 10_000);
});

test('owner options use weighted percentiles when evidence is sufficient and remain ordered', () => {
  const result = recommendation({
    observations: [
      observation(600, { dailyEquivalentRentMinor: 1_000 }),
      observation(601, { dailyEquivalentRentMinor: 1_400 }),
      observation(602, { dailyEquivalentRentMinor: 1_800 }),
      observation(603, { dailyEquivalentRentMinor: 2_200 }),
    ],
  });
  const values = result.ownerOptions.map((option) => option.dailyPriceMinor);
  assert.ok(values[0] <= values[1]);
  assert.ok(values[1] <= values[2]);
  assert.ok(result.reasonCodes.includes('weighted_percentile_options'));
  assert.ok(result.ownerOptions.every((option) => option.editable));
});

test('duration pricing is owner-editable, disableable and not claimed as market-derived', () => {
  const enabled = buildRegionalDurationPriceSchedule({ ownerDailyPriceMinor: 1_000 });
  assert.deepEqual(enabled.tiers.map((tier) => [
    tier.minimumDays,
    tier.maximumDays,
    tier.discountBasisPoints,
  ]), [
    [1, 1, 0],
    [2, 2, 1_000],
    [3, 6, 1_500],
    [7, 13, 3_000],
    [14, 30, 4_000],
  ]);
  assert.equal(enabled.marketDerived, false);
  assert.deepEqual(buildRegionalDurationPriceSchedule({
    ownerDailyPriceMinor: 1_000,
    enabled: false,
  }).tiers, []);
});

test('V5.2 preview discounts owner rent first and adds exactly ten percent afterward', () => {
  const preview = previewRegionalPriceWithV52Fee({
    ownerDailyPriceMinor: 1_000,
    days: 2,
  });
  assert.equal(preview.ownerRentMinor, 1_800);
  assert.equal(preview.discountMinor, 200);
  assert.equal(preview.sitPlatformContributionMinor, 180);
  assert.equal(preview.renterTotalMinor, 1_980);
  assert.equal(preview.securityDepositMinor, 0);
  assert.equal(preview.simulation, true);
  assert.equal(preview.noRealMoney, true);
  assert.equal(preview.quoteAuthority, 'V5.2_QUOTE_ENGINE');
});

test('owner override remains authoritative but cannot publish without confirmation', () => {
  const engineResult = recommendation();
  const pending = selectOwnerRegionalDailyPrice({
    recommendation: engineResult,
    ownerDailyPriceMinor: 2_100,
    ownerConfirmed: false,
  });
  assert.equal(pending.ownerOverrideApplied, true);
  assert.equal(pending.publicationPriceReady, false);
  assert.equal(pending.automaticPublicationAllowed, false);
  const confirmed = selectOwnerRegionalDailyPrice({
    recommendation: engineResult,
    ownerDailyPriceMinor: 2_100,
    ownerConfirmed: true,
  });
  assert.equal(confirmed.publicationPriceReady, true);
});

test('manual import boundary is complete and implementation has no provider or publication path', () => {
  assert.equal(regionalPriceManualImportColumns.length, 19);
  assert.deepEqual(new Set(regionalPriceManualImportColumns).size, 19);
  const template = readFileSync(new URL(
    '../../docs/templates/regional-price-observations-manual-import-v1.csv',
    import.meta.url,
  ), 'utf8').trim();
  assert.equal(template, regionalPriceManualImportColumns.join(','));
  const source = readFileSync(new URL('../src/regional_price_engine_v2.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|OPENAI_API_KEY|process\.env|publishListing|INSERT\s+INTO/iu);
});

test('N5 SQL is additive, fail-closed and rollback-safe once V2 data exists', () => {
  const up = readFileSync(new URL(
    '../sql/migrations/067_blue_ocean_regional_price_engine_v2.up.sql',
    import.meta.url,
  ), 'utf8');
  const down = readFileSync(new URL(
    '../sql/migrations/067_blue_ocean_regional_price_engine_v2.down.sql',
    import.meta.url,
  ), 'utf8');
  for (const marker of [
    'regional-market-observation-v2',
    'N5-2026-08-24.1',
    'source_quality_basis_points',
    'engine_eligible',
    'synthetic_learning_applied',
  ]) {
    assert.match(up, new RegExp(marker, 'u'));
  }
  assert.doesNotMatch(up, /UPDATE\s+(?:listings|bookings)\b|DELETE\s+FROM\s+(?:listings|bookings)\b/iu);
  assert.match(down, /N5 rollback blocked: regional price V2 data exists/u);
});

test('malformed inputs use safe domain errors instead of silent coercion', () => {
  assert.throws(
    () => recommendation({ observations: 'not-an-array' }),
    (error) => error instanceof RegionalPriceEngineError
      && error.code === 'regional_price_observations_invalid',
  );
  assert.throws(
    () => previewRegionalPriceWithV52Fee({ ownerDailyPriceMinor: 1_000, days: 31 }),
    /regional_price_quote_preview_invalid/u,
  );
  assert.throws(
    () => recommendation({
      observations: [observation(700), observation(700)],
    }),
    /regional_price_observation_duplicate/u,
  );
});
