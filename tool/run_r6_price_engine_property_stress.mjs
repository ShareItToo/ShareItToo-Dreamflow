#!/usr/bin/env node

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  recommendRegionalPriceV2,
  regionalPriceCategoryRules,
  regionalPriceConditionFactorsBasisPoints,
  regionalPriceEngineAuthority,
  regionalPriceEngineVersion,
  regionalPriceReplacementValueBands,
} from '../backend/src/regional_price_engine_v2.js';

export const r6StressSeed = 0x5a17c9e3;
export const r6StressCaseCount = 2_000;
const asOf = new Date('2026-08-24T00:00:00.000Z');

function fail(message) {
  throw new Error(message);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function observation(index, overrides = {}) {
  return {
    observationId: `r6_stress_observation_${String(index).padStart(8, '0')}`,
    categoryKey: 'power_tools',
    subcategory: 'Bohrmaschinen',
    brandModelFamily: 'SyntheticBrand0',
    condition: 'good',
    dailyEquivalentRentMinor: 1_500,
    currency: 'EUR',
    marketActorType: 'private',
    geographyBucket: 'synthetic_heilbronn_wave0',
    stateCode: 'DE-BW',
    countryCode: 'DE',
    distanceKm: 5,
    capturedAt: '2026-08-23T00:00:00.000Z',
    sourceType: 'completed_sit_rental',
    status: 'completed',
    provenanceReference: `r6_stress_provenance_${String(index).padStart(8, '0')}`,
    reviewed: false,
    amountIncludesOnlyRent: true,
    synthetic: false,
    ...overrides,
  };
}

export function runR6PriceEnginePropertyStress() {
  let state = r6StressSeed;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const categories = Object.keys(regionalPriceCategoryRules);
  const conditions = Object.keys(regionalPriceConditionFactorsBasisPoints);
  const bands = Object.keys(regionalPriceReplacementValueBands);
  const outputs = [];
  const confidenceCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const geographyCounts = {
    within_20_km: 0,
    within_50_km: 0,
    within_100_km: 0,
    baden_wuerttemberg: 0,
    germany: 0,
  };
  let totalObservationInputs = 0;
  let minimumRecommendedMinor = Number.MAX_SAFE_INTEGER;
  let maximumRecommendedMinor = 0;

  for (let caseIndex = 0; caseIndex < r6StressCaseCount; caseIndex += 1) {
    const categoryKey = categories[next() % categories.length];
    const condition = conditions[next() % conditions.length];
    const replacementValueBand = bands[next() % bands.length];
    const count = next() % 18;
    totalObservationInputs += count;
    const rows = Array.from({ length: count }, (_, rowIndex) => observation(
      20_000 + caseIndex * 20 + rowIndex,
      {
        categoryKey,
        condition,
        subcategory: `SyntheticCategory${next() % 4}`,
        brandModelFamily: `SyntheticBrand${next() % 5}`,
        dailyEquivalentRentMinor: 200 + (next() % 4_500),
        distanceKm: next() % 180,
        capturedAt: new Date(asOf.getTime() - (next() % 720) * 86_400_000).toISOString(),
        stateCode: next() % 5 === 0 ? 'DE-BY' : 'DE-BW',
      },
    ));
    const result = recommendRegionalPriceV2({
      categoryKey,
      subcategory: `SyntheticCategory${next() % 4}`,
      brandModelFamily: `SyntheticBrand${next() % 5}`,
      condition,
      replacementValueBand,
      replacementValueBandConfidence: 'HIGH',
      ownerConfirmedReplacementValueBand: replacementValueBand === 'over_1000',
      ownerConfirmedReplacementValueMinor: replacementValueBand === 'over_1000'
        ? 100_001 + (next() % 900_000)
        : null,
      observations: rows,
      asOf,
    });
    if (result.engineAuthority !== regionalPriceEngineAuthority
        || result.engineVersion !== regionalPriceEngineVersion
        || result.recommendedDailyMinor < result.categoryMinimumMinor
        || result.recommendedDailyMinor > result.categoryMaximumMinor
        || result.ownerOptions[0].dailyPriceMinor > result.ownerOptions[1].dailyPriceMinor
        || result.ownerOptions[1].dailyPriceMinor > result.ownerOptions[2].dailyPriceMinor
        || result.authoritativeProviderPriceUsed !== false
        || result.syntheticLearningApplied !== false) {
      fail(`R6 seeded invariant failed at case ${caseIndex}.`);
    }
    confidenceCounts[result.confidence] += 1;
    geographyCounts[result.geographyScope] += 1;
    minimumRecommendedMinor = Math.min(minimumRecommendedMinor, result.recommendedDailyMinor);
    maximumRecommendedMinor = Math.max(maximumRecommendedMinor, result.recommendedDailyMinor);
    outputs.push({
      engineVersion: result.engineVersion,
      recommendedDailyMinor: result.recommendedDailyMinor,
      confidence: result.confidence,
      geographyScope: result.geographyScope,
      effectiveObservationCountMilli: result.effectiveObservationCountMilli,
      fallbackShareBasisPoints: result.fallbackShareBasisPoints,
      ownerOptions: result.ownerOptions.map((entry) => entry.dailyPriceMinor),
    });
  }

  return Object.freeze({
    classification: 'DETERMINISTIC_SYNTHETIC_PROPERTY_STRESS_NOT_PRODUCTION_CAPACITY_CLAIM',
    engineAuthority: regionalPriceEngineAuthority,
    engineVersion: regionalPriceEngineVersion,
    seed: `0x${r6StressSeed.toString(16)}`,
    caseCount: outputs.length,
    totalObservationInputs,
    categoryCount: categories.length,
    replacementValueBandCount: bands.length,
    conditionCount: conditions.length,
    confidenceCounts,
    geographyCounts,
    minimumRecommendedMinor,
    maximumRecommendedMinor,
    outputDigestSha256: digest(outputs),
    failures: 0,
    externalProviderCalls: 0,
    realMoneyOperations: 0,
    productionMutations: 0,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(`${JSON.stringify(runR6PriceEnginePropertyStress(), null, 2)}\n`);
}
