import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRegionalDurationPriceSchedule,
  calculateAuthenticDemandFactor,
  calculateRegionalFallbackAnchor,
  previewRegionalPriceWithV52Fee,
  recommendRegionalPriceV2,
  regionalPriceCategoryRules,
  regionalPriceConditionFactorsBasisPoints,
  regionalPriceDurationDiscounts,
  regionalPriceEngineAuthority,
  regionalPriceEngineVersion,
  regionalPriceReplacementValueBands,
  selectOwnerRegionalDailyPrice,
} from '../src/regional_price_engine_v2.js';
import {
  r6StressCaseCount,
  runR6PriceEnginePropertyStress,
} from '../../tool/run_r6_price_engine_property_stress.mjs';

const asOf = new Date('2026-08-24T00:00:00.000Z');
const sourceStatuses = Object.freeze({
  completed_sit_rental: 'completed',
  accepted_sit_request: 'accepted',
  active_sit_listing: 'active',
  reviewed_external_c2c_asking_price: 'reviewed',
  professional_commercial_reference: 'reviewed',
  synthetic_fixture: 'synthetic',
});

function observation(index, overrides = {}) {
  const sourceType = overrides.sourceType ?? 'completed_sit_rental';
  return {
    observationId: `r6_observation_${String(index).padStart(8, '0')}`,
    categoryKey: 'power_tools',
    subcategory: 'Bohrmaschinen',
    brandModelFamily: 'Bosch Professional',
    condition: 'good',
    dailyEquivalentRentMinor: 1_500 + (index % 5) * 25,
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
    status: sourceStatuses[sourceType],
    provenanceReference: `r6_provenance_${String(index).padStart(8, '0')}`,
    reviewed: [
      'reviewed_external_c2c_asking_price',
      'professional_commercial_reference',
    ].includes(sourceType),
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

function halfUp(numerator, denominator) {
  return Number((BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator));
}

function expectedAnchor({ categoryKey, condition, replacementValueMinor }) {
  const rule = regionalPriceCategoryRules[categoryKey];
  const variable = halfUp(
    BigInt(replacementValueMinor) * BigInt(rule.replacementRateBasisPoints),
    10_000,
  );
  const conditioned = halfUp(
    BigInt(rule.fixedMinor + variable)
      * BigInt(regionalPriceConditionFactorsBasisPoints[condition]),
    10_000,
  );
  const bounded = Math.min(rule.maximumMinor, Math.max(rule.minimumMinor, conditioned));
  return Math.min(
    rule.maximumMinor,
    Math.max(rule.minimumMinor, Math.floor((bounded + 50) / 100) * 100),
  );
}

function learningProjection(value) {
  return {
    engineAuthority: value.engineAuthority,
    engineVersion: value.engineVersion,
    fallbackAnchorMinor: value.fallbackAnchorMinor,
    regionalWeightedMedianMinor: value.regionalWeightedMedianMinor,
    marketBlendedMinor: value.marketBlendedMinor,
    recommendedDailyMinor: value.recommendedDailyMinor,
    effectiveObservationCountMilli: value.effectiveObservationCountMilli,
    includedObservationCount: value.includedObservationCount,
    geographyScope: value.geographyScope,
    confidence: value.confidence,
    fallbackShareBasisPoints: value.fallbackShareBasisPoints,
    demandFactorBasisPoints: value.demandFactorBasisPoints,
    ownerOptions: value.ownerOptions,
    syntheticLearningApplied: value.syntheticLearningApplied,
  };
}

test('R6 covers every category, replacement band, condition, min/max and rounding boundary', () => {
  let matrixCases = 0;
  let roundingCases = 0;
  for (const [categoryKey, rule] of Object.entries(regionalPriceCategoryRules)) {
    for (const replacementValueBand of Object.keys(regionalPriceReplacementValueBands)) {
      for (const condition of Object.keys(regionalPriceConditionFactorsBasisPoints)) {
        const ownerConfirmedReplacementValueMinor = replacementValueBand === 'over_1000'
          ? 100_001
          : null;
        const result = calculateRegionalFallbackAnchor({
          categoryKey,
          condition,
          replacementValueBand,
          replacementValueBandConfidence: 'HIGH',
          ownerConfirmedReplacementValueBand: replacementValueBand === 'over_1000',
          ownerConfirmedReplacementValueMinor,
        });
        assert.equal(result.engineAuthority, regionalPriceEngineAuthority);
        assert.equal(result.engineVersion, regionalPriceEngineVersion);
        assert.ok(result.fallbackAnchorMinor >= rule.minimumMinor);
        assert.ok(result.fallbackAnchorMinor <= rule.maximumMinor);
        assert.equal(result.fallbackAnchorMinor % 100, 0);
        matrixCases += 1;
      }
    }

    const minimum = calculateRegionalFallbackAnchor({
      categoryKey,
      condition: 'like_new',
      replacementValueBand: 'under_100',
      replacementValueBandConfidence: 'HIGH',
      ownerConfirmedReplacementValueMinor: 1,
    });
    assert.equal(minimum.fallbackAnchorMinor, rule.minimumMinor);
    const maximum = calculateRegionalFallbackAnchor({
      categoryKey,
      condition: 'like_new',
      replacementValueBand: 'over_1000',
      replacementValueBandConfidence: 'HIGH',
      ownerConfirmedReplacementValueBand: true,
      ownerConfirmedReplacementValueMinor: 100_000_000,
    });
    assert.equal(maximum.fallbackAnchorMinor, rule.maximumMinor);

    for (const condition of Object.keys(regionalPriceConditionFactorsBasisPoints)) {
      for (let replacementValueMinor = 100_001;
        replacementValueMinor <= 100_401;
        replacementValueMinor += 4) {
        const result = calculateRegionalFallbackAnchor({
          categoryKey,
          condition,
          replacementValueBand: 'over_1000',
          replacementValueBandConfidence: 'HIGH',
          ownerConfirmedReplacementValueBand: true,
          ownerConfirmedReplacementValueMinor: replacementValueMinor,
        });
        assert.equal(result.fallbackAnchorMinor, expectedAnchor({
          categoryKey,
          condition,
          replacementValueMinor,
        }));
        roundingCases += 1;
      }
    }
  }
  assert.equal(matrixCases, 90);
  assert.equal(roundingCases, 1_818);
});

test('R6 covers zero, one, 20/50/100 km, Baden-Wuerttemberg and Germany evidence', () => {
  assert.equal(recommendation().confidence, 'LOW');
  assert.equal(recommendation({ observations: [observation(1)] }).includedObservationCount, 1);

  const cases = [
    {
      expected: 'within_20_km',
      rows: Array.from({ length: 4 }, (_, index) => observation(10 + index, {
        distanceKm: 20,
      })),
    },
    {
      expected: 'within_50_km',
      rows: [
        observation(20, { distanceKm: 20 }),
        observation(21, { distanceKm: 20 }),
        ...Array.from({ length: 4 }, (_, index) => observation(22 + index, {
          distanceKm: 50,
        })),
      ],
    },
    {
      expected: 'within_100_km',
      rows: [
        observation(30, { distanceKm: 50 }),
        observation(31, { distanceKm: 50 }),
        ...Array.from({ length: 4 }, (_, index) => observation(32 + index, {
          distanceKm: 100,
        })),
      ],
    },
    {
      expected: 'baden_wuerttemberg',
      rows: Array.from({ length: 4 }, (_, index) => observation(40 + index, {
        distanceKm: 150,
        stateCode: 'DE-BW',
      })),
    },
    {
      expected: 'germany',
      rows: Array.from({ length: 4 }, (_, index) => observation(50 + index, {
        distanceKm: 150,
        stateCode: 'DE-BY',
      })),
    },
  ];
  for (const entry of cases) {
    assert.equal(recommendation({ observations: entry.rows }).geographyScope, entry.expected);
  }
});

test('R6 robust center rejects an extreme outlier and bounds weaker cohort influence', () => {
  const stable = Array.from({ length: 9 }, (_, index) => observation(100 + index, {
    dailyEquivalentRentMinor: 1_450 + index * 10,
    distanceKm: 2 + index,
  }));
  const baseline = recommendation({ observations: stable });
  const withOutlier = recommendation({
    observations: [...stable, observation(199, { dailyEquivalentRentMinor: 100_000 })],
  });
  assert.ok(Math.abs(withOutlier.recommendedDailyMinor - baseline.recommendedDailyMinor) <= 100);
  assert.ok(withOutlier.excludedObservations.some((entry) => (
    entry.observationId === 'r6_observation_00000199'
      && entry.reasonCode === 'robust_mad_outlier'
  )));

  const strong = observation(200, {
    dailyEquivalentRentMinor: 1_500,
    distanceKm: 1,
  });
  const strongOnly = recommendation({ observations: [strong] });
  const weakFar = Array.from({ length: 4_999 }, (_, index) => observation(1_000 + index, {
    sourceType: 'professional_commercial_reference',
    status: 'reviewed',
    reviewed: true,
    marketActorType: 'commercial',
    distanceKm: 100,
    capturedAt: '2026-06-01T00:00:00.000Z',
    dailyEquivalentRentMinor: 1_900,
  }));
  const bounded = recommendation({ observations: [strong, ...weakFar] });
  assert.equal(bounded.regionalWeightedMedianMinor, 1_500);
  assert.ok(bounded.recommendedDailyMinor <= strongOnly.recommendedDailyMinor);
  assert.ok(bounded.reasonCodes.includes('weaker_evidence_influence_bounded'));
});

test('R6 covers source classes, similarity, staleness, malformed rows and synthetic zero weight', () => {
  const realRows = [
    observation(7_000, { sourceType: 'completed_sit_rental' }),
    observation(7_001, { sourceType: 'accepted_sit_request' }),
    observation(7_002, { sourceType: 'active_sit_listing' }),
    observation(7_003, {
      sourceType: 'reviewed_external_c2c_asking_price',
      status: 'reviewed',
      reviewed: true,
    }),
    observation(7_004, {
      sourceType: 'professional_commercial_reference',
      status: 'reviewed',
      reviewed: true,
      marketActorType: 'commercial',
    }),
  ];
  const baseline = recommendation({ observations: realRows });
  assert.deepEqual(Object.keys(baseline.sourceComposition).sort(), Object.keys(sourceStatuses)
    .filter((entry) => entry !== 'synthetic_fixture').sort());

  const synthetic = Array.from({ length: 300 }, (_, index) => observation(8_000 + index, {
    sourceType: 'synthetic_fixture',
    status: 'synthetic',
    synthetic: true,
    dailyEquivalentRentMinor: 100_000,
  }));
  assert.deepEqual(
    learningProjection(recommendation({ observations: [...realRows, ...synthetic] })),
    learningProjection(baseline),
  );

  const exact = observation(9_000, {
    dailyEquivalentRentMinor: 1_500,
    distanceKm: 1,
  });
  const mismatched = Array.from({ length: 200 }, (_, index) => observation(9_100 + index, {
    brandModelFamily: 'Unrelated Model Family',
    dailyEquivalentRentMinor: 1_900,
    distanceKm: 1,
  }));
  const boundedMismatch = recommendation({ observations: [exact, ...mismatched] });
  assert.equal(boundedMismatch.regionalWeightedMedianMinor, 1_500);
  assert.ok(boundedMismatch.reasonCodes.includes('weaker_evidence_influence_bounded'));

  const excluded = recommendation({ observations: [
    observation(9_500, { capturedAt: '2023-01-01T00:00:00.000Z' }),
    observation(9_501, { categoryKey: 'garden_machines' }),
  ] });
  assert.deepEqual(excluded.excludedObservations.map((entry) => entry.reasonCode).sort(), [
    'category_not_comparable',
    'stale_observation',
  ]);
  assert.throws(
    () => recommendation({ observations: [observation(9_502, { distanceKm: Number.NaN })] }),
    /regional_price_distance_invalid/u,
  );
});

test('R6 proves effective sample size, shrinkage and all confidence levels', () => {
  const one = recommendation({ observations: [observation(10_000)] });
  assert.equal(one.effectiveObservationCountMilli, 1_000);
  assert.equal(one.fallbackShareBasisPoints, 8_889);
  assert.equal(one.confidence, 'LOW');

  const medium = recommendation({
    observations: Array.from({ length: 4 }, (_, index) => observation(10_100 + index, {
      distanceKm: 25 + index,
    })),
  });
  assert.equal(medium.confidence, 'MEDIUM');
  assert.ok(medium.effectiveObservationCountMilli >= 3_000);
  assert.ok(medium.fallbackShareBasisPoints < one.fallbackShareBasisPoints);

  const high = recommendation({
    observations: Array.from({ length: 12 }, (_, index) => observation(10_200 + index, {
      distanceKm: 2,
      capturedAt: '2026-08-23T00:00:00.000Z',
    })),
  });
  assert.equal(high.confidence, 'HIGH');
  assert.ok(high.effectiveObservationCountMilli >= 8_000);

  const broad = recommendation({
    observations: Array.from({ length: 12 }, (_, index) => observation(10_300 + index, {
      distanceKm: 150,
      stateCode: 'DE-BY',
    })),
  });
  assert.equal(broad.confidence, 'LOW');
});

test('R6 covers authentic demand threshold and reachable 0.90/1.10 clamps', () => {
  const demand = (authenticRequestCount, authenticActiveListingCount, overrides = {}) => (
    calculateAuthenticDemandFactor({
      authenticRequestCount,
      authenticActiveListingCount,
      serverObserved: true,
      synthetic: false,
      observationWindowVersion: 'stage-a-v1',
      ...overrides,
    })
  );
  assert.deepEqual(
    [demand(19, 10).thresholdMet, demand(19, 10).factorBasisPoints],
    [false, 10_000],
  );
  assert.deepEqual(
    [demand(20, 10).thresholdMet, demand(20, 10).factorBasisPoints],
    [true, 10_000],
  );
  assert.equal(demand(20, 10_000_000).factorBasisPoints, 9_000);
  assert.equal(demand(100, 10).factorBasisPoints, 11_000);
  assert.equal(demand(100, 10, { synthetic: true }).factorBasisPoints, 10_000);
});

test('R6 covers all owner options, overrides, duration boundaries and canonical V5.2 truth', () => {
  const result = recommendation({
    observations: Array.from({ length: 8 }, (_, index) => observation(11_000 + index, {
      dailyEquivalentRentMinor: 1_200 + index * 100,
    })),
  });
  assert.deepEqual(result.ownerOptions.map((entry) => entry.id), [
    'rent_fast',
    'sit_recommendation',
    'set_higher',
  ]);
  const prices = result.ownerOptions.map((entry) => entry.dailyPriceMinor);
  assert.ok(prices[0] <= prices[1] && prices[1] <= prices[2]);
  assert.ok(result.ownerOptions.every((entry) => entry.editable));

  const pending = selectOwnerRegionalDailyPrice({
    recommendation: result,
    ownerDailyPriceMinor: result.recommendedDailyMinor + 200,
    ownerConfirmed: false,
  });
  assert.equal(pending.ownerOverrideApplied, true);
  assert.equal(pending.publicationPriceReady, false);
  assert.equal(pending.automaticPublicationAllowed, false);
  assert.equal(selectOwnerRegionalDailyPrice({
    recommendation: result,
    ownerDailyPriceMinor: result.recommendedDailyMinor + 200,
    ownerConfirmed: true,
  }).publicationPriceReady, true);

  const schedule = buildRegionalDurationPriceSchedule({ ownerDailyPriceMinor: 1_013 });
  assert.deepEqual(schedule.tiers.map((entry) => entry.discountBasisPoints),
    regionalPriceDurationDiscounts.map((entry) => entry.discountBasisPoints));
  const expectedByDays = new Map([
    [1, 0], [2, 1_000], [3, 1_500], [6, 1_500], [7, 3_000],
    [13, 3_000], [14, 4_000], [30, 4_000],
  ]);
  for (const [days, discountBasisPoints] of expectedByDays) {
    const preview = previewRegionalPriceWithV52Fee({
      ownerDailyPriceMinor: 1_013,
      days,
    });
    const base = 1_013 * days;
    const discount = Math.floor((base * discountBasisPoints + 5_000) / 10_000);
    const ownerRent = base - discount;
    const fee = Math.floor((ownerRent * 1_000 + 5_000) / 10_000);
    assert.equal(preview.discountMinor, discount);
    assert.equal(preview.ownerRentMinor, ownerRent);
    assert.equal(preview.sitPlatformContributionMinor, fee);
    assert.equal(preview.renterTotalMinor, ownerRent + fee);
    assert.equal(preview.quoteAuthority, 'V5.2_QUOTE_ENGINE');
    assert.equal(preview.noRealMoney, true);
  }
});

test('R6 rejects client authority injection and is reproducible across a seeded stress corpus', () => {
  assert.throws(
    () => recommendation({ authoritativePriceMinor: 1 }),
    /regional_price_request_schema_invalid/u,
  );

  const first = runR6PriceEnginePropertyStress();
  const second = runR6PriceEnginePropertyStress();
  assert.deepEqual(first, second);
  assert.equal(first.caseCount, r6StressCaseCount);
  assert.equal(first.failures, 0);
  assert.equal(first.externalProviderCalls, 0);
  assert.equal(first.realMoneyOperations, 0);
  assert.equal(first.productionMutations, 0);
  assert.match(first.outputDigestSha256, /^[a-f0-9]{64}$/u);
});

test('R6 migration keeps N5 snapshots valid and refuses destructive rollback', () => {
  const up = readFileSync(new URL(
    '../sql/migrations/069_regional_price_engine_r6_hardening.up.sql',
    import.meta.url,
  ), 'utf8');
  const down = readFileSync(new URL(
    '../sql/migrations/069_regional_price_engine_r6_hardening.down.sql',
    import.meta.url,
  ), 'utf8');
  assert.match(up, /engine_version IN \('N5-2026-08-24\.1', 'R6-2026-08-24\.1'\)/u);
  assert.match(down, /R6 rollback blocked: hardened price snapshot data exists/u);
  assert.match(down, /engine_version = 'N5-2026-08-24\.1'/u);
  assert.doesNotMatch(`${up}\n${down}`, /\b(?:DELETE|TRUNCATE)\b/iu);
});
