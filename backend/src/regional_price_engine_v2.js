import { quoteRental } from './booking_domain.js';

export const regionalPriceEngineAuthority = 'SIT_REGIONAL_PRICE_ENGINE_V2';
export const regionalPriceEngineVersion = 'R6-2026-08-24.1';
export const regionalMarketObservationVersion = 'regional-market-observation-v2';
export const regionalPriceRoundingRule = 'EUR_FULL_UNIT_HALF_UP_V1';
export const regionalPriceUserPrinciple = 'Unverbindliche SIT-Preisempfehlung. Du entscheidest über deinen Mietpreis.';

const weightScale = 1_000_000;
const basisPointScale = 10_000;
const dayMs = 86_400_000;
const weakerEvidenceAggregateCapBasisPoints = 9_000;

export const regionalPriceCategoryRules = Object.freeze({
  power_tools: Object.freeze({
    fixedMinor: 400,
    replacementRateBasisPoints: 400,
    minimumMinor: 800,
    maximumMinor: 3_500,
  }),
  cleaning_machines: Object.freeze({
    fixedMinor: 600,
    replacementRateBasisPoints: 450,
    minimumMinor: 1_200,
    maximumMinor: 4_500,
  }),
  garden_machines: Object.freeze({
    fixedMinor: 600,
    replacementRateBasisPoints: 400,
    minimumMinor: 1_000,
    maximumMinor: 5_000,
  }),
  ladders_hand_tools: Object.freeze({
    fixedMinor: 300,
    replacementRateBasisPoints: 300,
    minimumMinor: 500,
    maximumMinor: 2_500,
  }),
  event_camping: Object.freeze({
    fixedMinor: 300,
    replacementRateBasisPoints: 300,
    minimumMinor: 500,
    maximumMinor: 4_000,
  }),
  accessories: Object.freeze({
    fixedMinor: 100,
    replacementRateBasisPoints: 500,
    minimumMinor: 200,
    maximumMinor: 1_500,
  }),
});

export const regionalPriceReplacementValueBands = Object.freeze({
  under_100: 7_500,
  eur_100_250: 17_500,
  eur_250_500: 37_500,
  eur_500_1000: 75_000,
  over_1000: null,
});

export const regionalPriceConditionFactorsBasisPoints = Object.freeze({
  like_new: 10_000,
  good: 9_000,
  visibly_used_but_functional: 8_000,
});

export const regionalPriceSourceQualityBasisPoints = Object.freeze({
  completed_sit_rental: 10_000,
  accepted_sit_request: 9_000,
  active_sit_listing: 5_500,
  reviewed_external_c2c_asking_price: 4_000,
  professional_commercial_reference: 2_500,
  synthetic_fixture: 0,
});

export const regionalPriceGeographyHierarchy = Object.freeze([
  'within_20_km',
  'within_50_km',
  'within_100_km',
  'baden_wuerttemberg',
  'germany',
]);

export const regionalPriceDurationDiscounts = Object.freeze([
  Object.freeze({ minimumDays: 1, maximumDays: 1, discountBasisPoints: 0 }),
  Object.freeze({ minimumDays: 2, maximumDays: 2, discountBasisPoints: 1_000 }),
  Object.freeze({ minimumDays: 3, maximumDays: 6, discountBasisPoints: 1_500 }),
  Object.freeze({ minimumDays: 7, maximumDays: 13, discountBasisPoints: 3_000 }),
  Object.freeze({ minimumDays: 14, maximumDays: 30, discountBasisPoints: 4_000 }),
]);

export const regionalPriceManualImportColumns = Object.freeze([
  'observation_id',
  'category_key',
  'subcategory',
  'brand_model_family',
  'condition',
  'daily_equivalent_rent_minor',
  'currency',
  'market_actor_type',
  'geography_bucket',
  'state_code',
  'country_code',
  'distance_km',
  'captured_at',
  'source_type',
  'status',
  'provenance_reference',
  'reviewed',
  'amount_includes_only_rent',
  'synthetic',
]);

const sourceStatuses = Object.freeze({
  completed_sit_rental: 'completed',
  accepted_sit_request: 'accepted',
  active_sit_listing: 'active',
  reviewed_external_c2c_asking_price: 'reviewed',
  professional_commercial_reference: 'reviewed',
  synthetic_fixture: 'synthetic',
});
const marketActorTypes = new Set(['private', 'commercial']);
const confidenceValues = new Set(['HIGH', 'MEDIUM', 'LOW']);

export class RegionalPriceEngineError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code) {
  throw new RegionalPriceEngineError(status, code);
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, code);
  return value;
}

function exactKeys(value, expected, code) {
  object(value, code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    fail(400, code);
  }
}

function allowedKeys(value, allowed, code) {
  object(value, code);
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) fail(400, code);
}

function text(value, { minimum = 1, maximum = 160, code } = {}) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate.length < minimum || candidate.length > maximum) fail(400, code);
  return candidate;
}

function optionalText(value, { maximum = 160, code } = {}) {
  if (value == null || value === '') return null;
  return text(value, { maximum, code });
}

function opaqueIdentifier(value, code) {
  const candidate = text(value, { maximum: 160, code });
  if (!/^[A-Za-z0-9_.:-]{8,160}$/u.test(candidate)
      || /[/\\]|https?:|file:|@/iu.test(candidate)) {
    fail(400, code);
  }
  return candidate;
}

function safeInteger(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, code }) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(400, code);
  return value;
}

function finiteNumber(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, code }) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) fail(400, code);
  return value;
}

function instant(value, code) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) fail(400, code);
  return parsed;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function roundHalfUpInteger(numerator, denominator) {
  const top = BigInt(numerator);
  const bottom = BigInt(denominator);
  if (top < 0n || bottom <= 0n) fail(500, 'regional_price_internal_fraction_invalid');
  return Number((top + (bottom / 2n)) / bottom);
}

function applyBasisPoints(valueMinor, factorBasisPoints) {
  return roundHalfUpInteger(
    BigInt(valueMinor) * BigInt(factorBasisPoints),
    BigInt(basisPointScale),
  );
}

function roundFullEuro(valueMinor) {
  return Math.floor((valueMinor + 50) / 100) * 100;
}

function replacementValueForBand({
  replacementValueBand,
  replacementValueBandConfidence,
  ownerConfirmedReplacementValueBand,
  ownerConfirmedReplacementValueMinor,
}) {
  if (!(replacementValueBand in regionalPriceReplacementValueBands)) {
    fail(400, 'regional_price_replacement_value_band_invalid');
  }
  if (!confidenceValues.has(replacementValueBandConfidence)) {
    fail(400, 'regional_price_replacement_value_confidence_invalid');
  }
  if (replacementValueBandConfidence !== 'HIGH' && ownerConfirmedReplacementValueBand !== true) {
    fail(409, 'regional_price_replacement_value_confirmation_required');
  }
  if (replacementValueBand === 'over_1000') {
    return safeInteger(ownerConfirmedReplacementValueMinor, {
      minimum: 100_001,
      maximum: 100_000_000,
      code: 'regional_price_owner_replacement_value_required',
    });
  }
  if (ownerConfirmedReplacementValueMinor != null) {
    return safeInteger(ownerConfirmedReplacementValueMinor, {
      minimum: 1,
      maximum: 100_000_000,
      code: 'regional_price_owner_replacement_value_invalid',
    });
  }
  return regionalPriceReplacementValueBands[replacementValueBand];
}

export function calculateRegionalFallbackAnchor({
  categoryKey,
  condition,
  replacementValueBand,
  replacementValueBandConfidence = 'LOW',
  ownerConfirmedReplacementValueBand = false,
  ownerConfirmedReplacementValueMinor = null,
}) {
  const rule = regionalPriceCategoryRules[categoryKey];
  if (!rule) fail(400, 'regional_price_category_rule_missing');
  if (condition === 'function_not_confirmed') {
    fail(409, 'regional_price_functionality_confirmation_required');
  }
  if (condition === 'defective') {
    fail(422, 'regional_price_defective_outside_stage_a_scope');
  }
  const conditionFactor = regionalPriceConditionFactorsBasisPoints[condition];
  if (!conditionFactor) fail(400, 'regional_price_condition_invalid');
  const replacementValueMinor = replacementValueForBand({
    replacementValueBand,
    replacementValueBandConfidence,
    ownerConfirmedReplacementValueBand,
    ownerConfirmedReplacementValueMinor,
  });
  const variableMinor = applyBasisPoints(replacementValueMinor, rule.replacementRateBasisPoints);
  const conditionedMinor = applyBasisPoints(rule.fixedMinor + variableMinor, conditionFactor);
  const boundedMinor = clamp(conditionedMinor, rule.minimumMinor, rule.maximumMinor);
  return deepFreeze({
    engineAuthority: regionalPriceEngineAuthority,
    engineVersion: regionalPriceEngineVersion,
    categoryKey,
    condition,
    replacementValueBand,
    replacementValueMinor,
    fallbackAnchorMinor: clamp(
      roundFullEuro(boundedMinor),
      rule.minimumMinor,
      rule.maximumMinor,
    ),
    categoryMinimumMinor: rule.minimumMinor,
    categoryMaximumMinor: rule.maximumMinor,
    currency: 'EUR',
    roundingRule: regionalPriceRoundingRule,
  });
}

export function normalizeRegionalPriceObservationV2(raw) {
  exactKeys(raw, [
    'observationId',
    'categoryKey',
    'subcategory',
    'brandModelFamily',
    'condition',
    'dailyEquivalentRentMinor',
    'currency',
    'marketActorType',
    'geographyBucket',
    'stateCode',
    'countryCode',
    'distanceKm',
    'capturedAt',
    'sourceType',
    'status',
    'provenanceReference',
    'reviewed',
    'amountIncludesOnlyRent',
    'synthetic',
  ], 'regional_price_observation_schema_invalid');
  const sourceQualityBasisPoints = regionalPriceSourceQualityBasisPoints[raw.sourceType];
  if (sourceQualityBasisPoints == null || raw.status !== sourceStatuses[raw.sourceType]) {
    fail(400, 'regional_price_observation_source_invalid');
  }
  const synthetic = raw.synthetic === true;
  if (synthetic !== (raw.sourceType === 'synthetic_fixture')) {
    fail(400, 'regional_price_observation_synthetic_truth_invalid');
  }
  if ((raw.sourceType === 'reviewed_external_c2c_asking_price'
      || raw.sourceType === 'professional_commercial_reference')
      && raw.reviewed !== true) {
    fail(400, 'regional_price_external_observation_review_required');
  }
  if (!marketActorTypes.has(raw.marketActorType)) {
    fail(400, 'regional_price_market_actor_invalid');
  }
  if (!(raw.condition in regionalPriceConditionFactorsBasisPoints)) {
    fail(400, 'regional_price_observation_condition_invalid');
  }
  const geographyBucket = text(raw.geographyBucket, {
    maximum: 80,
    code: 'regional_price_geography_bucket_invalid',
  });
  if (!/^[a-z][a-z0-9_-]{2,79}$/u.test(geographyBucket)
      || /street|strasse|straße|@|\d{4,}/iu.test(geographyBucket)) {
    fail(400, 'regional_price_geography_must_be_coarse');
  }
  const countryCode = raw.countryCode === 'DE'
    ? 'DE'
    : fail(400, 'regional_price_country_invalid');
  const stateCode = /^[A-Z]{2}-[A-Z]{2}$/u.test(raw.stateCode ?? '')
    ? raw.stateCode
    : fail(400, 'regional_price_state_invalid');
  return deepFreeze({
    observationVersion: regionalMarketObservationVersion,
    observationId: opaqueIdentifier(raw.observationId, 'regional_price_observation_id_invalid'),
    categoryKey: text(raw.categoryKey, { maximum: 80, code: 'regional_price_category_invalid' }),
    subcategory: text(raw.subcategory, { maximum: 120, code: 'regional_price_subcategory_invalid' }),
    brandModelFamily: optionalText(raw.brandModelFamily, {
      maximum: 160,
      code: 'regional_price_brand_model_invalid',
    }),
    condition: raw.condition,
    dailyEquivalentRentMinor: safeInteger(raw.dailyEquivalentRentMinor, {
      minimum: 1,
      maximum: 100_000_000,
      code: 'regional_price_daily_rent_invalid',
    }),
    currency: raw.currency === 'EUR' ? 'EUR' : fail(400, 'regional_price_currency_invalid'),
    marketActorType: raw.marketActorType,
    geographyBucket,
    stateCode,
    countryCode,
    distanceKm: finiteNumber(raw.distanceKm, {
      minimum: 0,
      maximum: 1_000,
      code: 'regional_price_distance_invalid',
    }),
    capturedAt: instant(raw.capturedAt, 'regional_price_captured_at_invalid').toISOString(),
    sourceType: raw.sourceType,
    sourceQualityBasisPoints,
    status: raw.status,
    provenanceReference: opaqueIdentifier(
      raw.provenanceReference,
      'regional_price_provenance_reference_invalid',
    ),
    reviewed: raw.reviewed === true,
    amountIncludesOnlyRent: raw.amountIncludesOnlyRent === true,
    authenticSitActivity: [
      'completed_sit_rental',
      'accepted_sit_request',
      'active_sit_listing',
    ].includes(raw.sourceType),
    synthetic,
    exactAddressStored: false,
    personalIdentityStored: false,
  });
}

function similarityBasisPoints(target, observation) {
  if (observation.categoryKey !== target.categoryKey) return 0;
  let similarity = observation.subcategory.toLocaleLowerCase('de-DE')
    === target.subcategory.toLocaleLowerCase('de-DE') ? 10_000 : 6_500;
  if (target.brandModelFamily && observation.brandModelFamily) {
    similarity = applyBasisPoints(
      similarity,
      target.brandModelFamily.toLocaleLowerCase('de-DE')
        === observation.brandModelFamily.toLocaleLowerCase('de-DE') ? 10_000 : 7_500,
    );
  } else {
    similarity = applyBasisPoints(similarity, 9_000);
  }
  const conditionOrder = ['visibly_used_but_functional', 'good', 'like_new'];
  const distance = Math.abs(
    conditionOrder.indexOf(target.condition) - conditionOrder.indexOf(observation.condition),
  );
  return applyBasisPoints(similarity, distance === 0 ? 10_000 : (distance === 1 ? 9_000 : 8_000));
}

function geographyIncludes(scope, observation) {
  if (scope === 'within_20_km') return observation.distanceKm <= 20;
  if (scope === 'within_50_km') return observation.distanceKm <= 50;
  if (scope === 'within_100_km') return observation.distanceKm <= 100;
  if (scope === 'baden_wuerttemberg') return observation.stateCode === 'DE-BW';
  return observation.countryCode === 'DE';
}

function weightedPercentile(rows, percentile) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((left, right) => (
    left.observation.dailyEquivalentRentMinor - right.observation.dailyEquivalentRentMinor
      || left.observation.observationId.localeCompare(right.observation.observationId)
  ));
  const total = sorted.reduce((sum, row) => sum + BigInt(row.weightMicro), 0n);
  let cumulative = 0n;
  for (const row of sorted) {
    cumulative += BigInt(row.weightMicro);
    if (cumulative * 100n >= total * BigInt(percentile)) {
      return row.observation.dailyEquivalentRentMinor;
    }
  }
  return sorted.at(-1).observation.dailyEquivalentRentMinor;
}

function robustOutlierScreen(rows) {
  if (rows.length < 3) return { included: rows, excluded: [] };
  const median = weightedPercentile(rows, 50);
  const deviations = rows.map((row) => ({
    ...row,
    observation: {
      ...row.observation,
      dailyEquivalentRentMinor: Math.abs(row.observation.dailyEquivalentRentMinor - median),
    },
  }));
  const mad = weightedPercentile(deviations, 50);
  const threshold = mad === 0
    ? Math.max(500, Math.floor(median / 2))
    : Math.max(500, mad * 3);
  const included = [];
  const excluded = [];
  for (const row of rows) {
    if (Math.abs(row.observation.dailyEquivalentRentMinor - median) > threshold) {
      excluded.push({
        observationId: row.observation.observationId,
        reasonCode: 'robust_mad_outlier',
      });
    } else {
      included.push(row);
    }
  }
  return { included, excluded };
}

function effectiveObservationRational(rows) {
  const weights = rows.map((row) => BigInt(row.weightMicro));
  const sum = weights.reduce((total, value) => total + value, 0n);
  const sumSquares = weights.reduce((total, value) => total + (value * value), 0n);
  return {
    sum,
    sumSquared: sum * sum,
    sumSquares,
  };
}

function atLeastEffective(rational, threshold) {
  return rational.sumSquares > 0n
    && rational.sumSquared >= BigInt(threshold) * rational.sumSquares;
}

function effectiveObservationCountMilli(rational) {
  if (rational.sumSquares === 0n) return 0;
  return Number(
    ((rational.sumSquared * 1_000n) + (rational.sumSquares / 2n))
      / rational.sumSquares,
  );
}

const sourceInfluenceTier = Object.freeze({
  completed_sit_rental: 0,
  accepted_sit_request: 0,
  active_sit_listing: 1,
  reviewed_external_c2c_asking_price: 2,
  professional_commercial_reference: 3,
});

function geographyInfluenceTier(observation) {
  if (observation.distanceKm <= 20) return 0;
  if (observation.distanceKm <= 50) return 1;
  if (observation.distanceKm <= 100) return 2;
  if (observation.stateCode === 'DE-BW') return 3;
  return 4;
}

function similarityInfluenceTier(row) {
  if (row.similarityBasisPoints >= 9_500) return 0;
  if (row.similarityBasisPoints >= 8_500) return 1;
  return 2;
}

function freshnessInfluenceTier(row) {
  if (row.ageDays <= 30) return 0;
  if (row.ageDays <= 90) return 1;
  if (row.ageDays <= 365) return 2;
  return 3;
}

function influenceVector(row) {
  return [
    sourceInfluenceTier[row.observation.sourceType],
    geographyInfluenceTier(row.observation),
    similarityInfluenceTier(row),
    freshnessInfluenceTier(row),
  ];
}

function dominates(left, right) {
  return left.every((value, index) => value <= right[index])
    && left.some((value, index) => value < right[index]);
}

function boundWeakerEvidenceInfluence(rows) {
  if (rows.length < 2) return { rows, excluded: [], applied: false };
  const groups = new Map();
  for (const row of rows) {
    const vector = influenceVector(row);
    const key = vector.join(':');
    const group = groups.get(key) ?? { vector, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const values = [...groups.values()];
  const frontierKeys = new Set(values
    .filter((candidate) => !values.some((other) => (
      other !== candidate && dominates(other.vector, candidate.vector)
    )))
    .map((entry) => entry.vector.join(':')));
  const strongerTotal = rows
    .filter((row) => frontierKeys.has(influenceVector(row).join(':')))
    .reduce((sum, row) => sum + row.weightMicro, 0);
  const weaker = rows.filter((row) => !frontierKeys.has(influenceVector(row).join(':')));
  const weakerTotal = weaker.reduce((sum, row) => sum + row.weightMicro, 0);
  const cap = Math.floor(
    (strongerTotal * weakerEvidenceAggregateCapBasisPoints) / basisPointScale,
  );
  if (weakerTotal === 0 || weakerTotal <= cap) {
    return { rows, excluded: [], applied: false };
  }
  const excluded = [];
  const adjusted = [];
  for (const row of rows) {
    if (frontierKeys.has(influenceVector(row).join(':'))) {
      adjusted.push(row);
      continue;
    }
    const boundedWeight = Math.floor((row.weightMicro * cap) / weakerTotal);
    if (boundedWeight < 1) {
      excluded.push({
        observationId: row.observation.observationId,
        reasonCode: 'weaker_evidence_bounded_below_weight_floor',
      });
      continue;
    }
    adjusted.push({ ...row, weightMicro: boundedWeight });
  }
  return { rows: adjusted, excluded, applied: true };
}

function evaluateObservations({ observations, target, asOf }) {
  const excluded = [];
  const comparable = [];
  const seenIds = new Set();
  for (const raw of observations) {
    const observation = normalizeRegionalPriceObservationV2(raw);
    if (seenIds.has(observation.observationId)) {
      fail(400, 'regional_price_observation_duplicate');
    }
    seenIds.add(observation.observationId);
    let reasonCode = null;
    if (observation.synthetic || observation.sourceQualityBasisPoints === 0) {
      reasonCode = 'synthetic_zero_weight';
    } else if (!observation.amountIncludesOnlyRent) {
      reasonCode = 'non_rent_components_excluded';
    } else if (observation.categoryKey !== target.categoryKey) {
      reasonCode = 'category_not_comparable';
    }
    const ageDays = (asOf.getTime() - new Date(observation.capturedAt).getTime()) / dayMs;
    if (!reasonCode && ageDays < -0.01) reasonCode = 'future_observation';
    if (!reasonCode && ageDays > 730) reasonCode = 'stale_observation';
    if (reasonCode) {
      excluded.push({ observationId: observation.observationId, reasonCode });
      continue;
    }
    const similarity = similarityBasisPoints(target, observation);
    if (similarity === 0) {
      excluded.push({
        observationId: observation.observationId,
        reasonCode: 'category_not_comparable',
      });
      continue;
    }
    const rawWeight = (observation.sourceQualityBasisPoints / basisPointScale)
      * (similarity / basisPointScale)
      * Math.exp(-observation.distanceKm / 40)
      * Math.exp(-Math.max(0, ageDays) / 60);
    const weightMicro = Math.round(rawWeight * weightScale);
    if (weightMicro < 1) {
      excluded.push({ observationId: observation.observationId, reasonCode: 'weight_below_floor' });
      continue;
    }
    comparable.push({
      observation,
      similarityBasisPoints: similarity,
      weightMicro,
      ageDays: Math.max(0, ageDays),
    });
  }

  const influenceBoundary = boundWeakerEvidenceInfluence(comparable);
  const boundedComparable = influenceBoundary.rows;
  excluded.push(...influenceBoundary.excluded);

  let selected = null;
  for (const scope of regionalPriceGeographyHierarchy) {
    const screened = robustOutlierScreen(
      boundedComparable.filter((row) => geographyIncludes(scope, row.observation)),
    );
    const rational = effectiveObservationRational(screened.included);
    if (screened.included.length >= 3 && atLeastEffective(rational, 3)) {
      selected = { scope, ...screened, rational };
      break;
    }
  }
  if (!selected) {
    for (const scope of [...regionalPriceGeographyHierarchy].reverse()) {
      const screened = robustOutlierScreen(
        boundedComparable.filter((row) => geographyIncludes(scope, row.observation)),
      );
      if (screened.included.length > 0) {
        selected = {
          scope,
          ...screened,
          rational: effectiveObservationRational(screened.included),
        };
        break;
      }
    }
  }
  return {
    selected,
    excluded: [
      ...excluded,
      ...(selected?.excluded ?? []),
    ].sort((left, right) => left.observationId.localeCompare(right.observationId)),
    weakerEvidenceInfluenceBounded: influenceBoundary.applied,
  };
}

export function calculateAuthenticDemandFactor(raw = {}) {
  exactKeys(raw, [
    'authenticRequestCount',
    'authenticActiveListingCount',
    'serverObserved',
    'synthetic',
    'observationWindowVersion',
  ], 'regional_price_demand_schema_invalid');
  const requests = safeInteger(raw.authenticRequestCount, {
    maximum: 10_000_000,
    code: 'regional_price_demand_request_count_invalid',
  });
  const listings = safeInteger(raw.authenticActiveListingCount, {
    maximum: 10_000_000,
    code: 'regional_price_demand_listing_count_invalid',
  });
  const eligible = raw.serverObserved === true
    && raw.synthetic === false
    && requests >= 20
    && listings >= 10;
  if (!eligible) {
    return deepFreeze({
      factorBasisPoints: 10_000,
      thresholdMet: false,
      authenticRequestCount: requests,
      authenticActiveListingCount: listings,
      reasonCode: 'authentic_demand_threshold_not_met',
    });
  }
  text(raw.observationWindowVersion, {
    maximum: 80,
    code: 'regional_price_demand_window_invalid',
  });
  const factorBasisPoints = clamp(
    10_000 + Math.round(((requests - (2 * listings)) * 500) / listings),
    9_000,
    11_000,
  );
  return deepFreeze({
    factorBasisPoints,
    thresholdMet: true,
    authenticRequestCount: requests,
    authenticActiveListingCount: listings,
    reasonCode: 'authentic_server_demand_applied',
  });
}

function blendMarketWithFallback(fallbackAnchorMinor, marketMedianMinor, rational) {
  if (marketMedianMinor == null || rational.sumSquares === 0n) {
    return {
      marketBlendedMinor: fallbackAnchorMinor,
      fallbackShareBasisPoints: 10_000,
    };
  }
  const marketShareNumerator = rational.sumSquared;
  const fallbackShareNumerator = 8n * rational.sumSquares;
  const denominator = marketShareNumerator + fallbackShareNumerator;
  const blended = roundHalfUpInteger(
    (BigInt(fallbackAnchorMinor) * fallbackShareNumerator)
      + (BigInt(marketMedianMinor) * marketShareNumerator),
    denominator,
  );
  return {
    marketBlendedMinor: blended,
    fallbackShareBasisPoints: roundHalfUpInteger(
      fallbackShareNumerator * 10_000n,
      denominator,
    ),
  };
}

function classifyConfidence({ rational, included, geographyScope }) {
  const effectiveHigh = atLeastEffective(rational, 8);
  const effectiveMedium = atLeastEffective(rational, 3);
  const goodMatch = included.length > 0
    && included.reduce((sum, row) => sum + row.similarityBasisPoints, 0) / included.length >= 8_500;
  if (effectiveHigh
      && included.length >= 3
      && goodMatch
      && ['within_20_km', 'within_50_km'].includes(geographyScope)) {
    return 'HIGH';
  }
  if (effectiveMedium
      && !['baden_wuerttemberg', 'germany'].includes(geographyScope)) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function buildExplanation({ geographyScope, includedCount, confidence }) {
  if (confidence === 'LOW') {
    return 'In deiner Region gibt es noch zu wenige Vergleichsdaten. Die Empfehlung basiert hauptsächlich auf Gerätewert, Kategorie und Zustand.';
  }
  const radius = {
    within_20_km: 20,
    within_50_km: 50,
    within_100_km: 100,
  }[geographyScope];
  if (radius) {
    return `Basierend auf ${includedCount} vergleichbaren Beobachtungen im Umkreis von ${radius} km sowie Gerätewert und Zustand.`;
  }
  return geographyScope === 'baden_wuerttemberg'
    ? `Basierend auf ${includedCount} vergleichbaren Beobachtungen aus Baden-Württemberg sowie Gerätewert und Zustand.`
    : `Basierend auf ${includedCount} vergleichbaren Beobachtungen aus Deutschland sowie Gerätewert und Zustand.`;
}

function sourceComposition(rows) {
  const result = {};
  for (const row of rows) {
    result[row.observation.sourceType] = (result[row.observation.sourceType] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function boundedRoundedPrice(valueMinor, rule) {
  return clamp(
    roundFullEuro(clamp(valueMinor, rule.minimumMinor, rule.maximumMinor)),
    rule.minimumMinor,
    rule.maximumMinor,
  );
}

export function recommendRegionalPriceV2(raw = {}) {
  allowedKeys(raw, [
    'categoryKey',
    'subcategory',
    'brandModelFamily',
    'condition',
    'replacementValueBand',
    'replacementValueBandConfidence',
    'ownerConfirmedReplacementValueBand',
    'ownerConfirmedReplacementValueMinor',
    'observations',
    'demand',
    'asOf',
  ], 'regional_price_request_schema_invalid');
  const {
    categoryKey,
    subcategory,
    brandModelFamily = null,
    condition,
    replacementValueBand,
    replacementValueBandConfidence = 'LOW',
    ownerConfirmedReplacementValueBand = false,
    ownerConfirmedReplacementValueMinor = null,
    observations = [],
    demand = {
      authenticRequestCount: 0,
      authenticActiveListingCount: 0,
      serverObserved: false,
      synthetic: false,
      observationWindowVersion: 'not-active',
    },
    asOf = new Date(),
  } = raw;
  if (!Array.isArray(observations) || observations.length > 5_000) {
    fail(400, 'regional_price_observations_invalid');
  }
  const target = {
    categoryKey,
    subcategory: text(subcategory, { maximum: 120, code: 'regional_price_subcategory_invalid' }),
    brandModelFamily: optionalText(brandModelFamily, {
      maximum: 160,
      code: 'regional_price_brand_model_invalid',
    }),
    condition,
  };
  const fallback = calculateRegionalFallbackAnchor({
    categoryKey,
    condition,
    replacementValueBand,
    replacementValueBandConfidence,
    ownerConfirmedReplacementValueBand,
    ownerConfirmedReplacementValueMinor,
  });
  const evaluated = evaluateObservations({
    observations,
    target,
    asOf: instant(asOf, 'regional_price_as_of_invalid'),
  });
  const included = evaluated.selected?.included ?? [];
  const rational = evaluated.selected?.rational ?? effectiveObservationRational([]);
  const geographyScope = evaluated.selected?.scope ?? 'germany';
  const marketMedianMinor = weightedPercentile(included, 50);
  const lowerPercentileMinor = weightedPercentile(included, 35);
  const upperPercentileMinor = weightedPercentile(included, 65);
  const blended = blendMarketWithFallback(
    fallback.fallbackAnchorMinor,
    marketMedianMinor,
    rational,
  );
  const demandResult = calculateAuthenticDemandFactor(demand);
  const rule = regionalPriceCategoryRules[categoryKey];
  const demandAdjustedMinor = applyBasisPoints(
    blended.marketBlendedMinor,
    demandResult.factorBasisPoints,
  );
  const recommendedDailyMinor = boundedRoundedPrice(demandAdjustedMinor, rule);
  const effectiveCountMilli = effectiveObservationCountMilli(rational);
  const confidence = classifyConfidence({ rational, included, geographyScope });
  const sufficientPercentiles = included.length >= 3 && atLeastEffective(rational, 3);
  const fastBase = sufficientPercentiles
    ? Math.min(lowerPercentileMinor, recommendedDailyMinor)
    : applyBasisPoints(recommendedDailyMinor, 9_000);
  const higherBase = sufficientPercentiles
    ? Math.max(upperPercentileMinor, recommendedDailyMinor)
    : applyBasisPoints(recommendedDailyMinor, 11_000);

  return deepFreeze({
    engineAuthority: regionalPriceEngineAuthority,
    engineVersion: regionalPriceEngineVersion,
    observationVersion: regionalMarketObservationVersion,
    roundingRule: regionalPriceRoundingRule,
    currency: 'EUR',
    fallbackAnchorMinor: fallback.fallbackAnchorMinor,
    regionalWeightedMedianMinor: marketMedianMinor,
    lowerReferencePercentileMinor: lowerPercentileMinor,
    upperReferencePercentileMinor: upperPercentileMinor,
    marketBlendedMinor: blended.marketBlendedMinor,
    recommendedDailyMinor,
    categoryMinimumMinor: rule.minimumMinor,
    categoryMaximumMinor: rule.maximumMinor,
    effectiveObservationCountMilli: effectiveCountMilli,
    includedObservationCount: included.length,
    geographyScope,
    confidence,
    sourceComposition: sourceComposition(included),
    fallbackShareBasisPoints: blended.fallbackShareBasisPoints,
    demandFactorBasisPoints: demandResult.factorBasisPoints,
    demandThresholdMet: demandResult.thresholdMet,
    reasonCodes: Object.freeze([
      confidence === 'LOW' ? 'regional_evidence_low_fallback_primary' : 'regional_evidence_applied',
      demandResult.reasonCode,
      sufficientPercentiles ? 'weighted_percentile_options' : 'fallback_percentage_options',
      ...(evaluated.weakerEvidenceInfluenceBounded
        ? ['weaker_evidence_influence_bounded']
        : []),
    ]),
    excludedObservations: Object.freeze(evaluated.excluded),
    ownerOptions: Object.freeze([
      Object.freeze({
        id: 'rent_fast',
        label: 'Schnell vermieten',
        dailyPriceMinor: boundedRoundedPrice(fastBase, rule),
        editable: true,
      }),
      Object.freeze({
        id: 'sit_recommendation',
        label: 'SIT-Empfehlung',
        dailyPriceMinor: recommendedDailyMinor,
        editable: true,
      }),
      Object.freeze({
        id: 'set_higher',
        label: 'Höher ansetzen',
        dailyPriceMinor: boundedRoundedPrice(higherBase, rule),
        editable: true,
      }),
    ]),
    explanation: buildExplanation({
      geographyScope,
      includedCount: included.length,
      confidence,
    }),
    userPrinciple: regionalPriceUserPrinciple,
    authoritativeProviderPriceUsed: false,
    ownerPriceAuthority: true,
    demandOrIncomeGuaranteed: false,
    syntheticLearningApplied: false,
  });
}

export function buildRegionalDurationPriceSchedule({
  ownerDailyPriceMinor,
  enabled = true,
}) {
  const daily = safeInteger(ownerDailyPriceMinor, {
    minimum: 1,
    maximum: 100_000_000,
    code: 'regional_price_owner_daily_price_invalid',
  });
  if (!enabled) {
    return deepFreeze({
      enabled: false,
      ownerDailyPriceMinor: daily,
      ownerEditable: true,
      marketDerived: false,
      tiers: [],
    });
  }
  return deepFreeze({
    enabled: true,
    ownerDailyPriceMinor: daily,
    ownerEditable: true,
    marketDerived: false,
    tiers: regionalPriceDurationDiscounts.map((tier) => ({
      ...tier,
      discountPercent: tier.discountBasisPoints / 100,
    })),
  });
}

export function previewRegionalPriceWithV52Fee({
  ownerDailyPriceMinor,
  days,
  durationPricingEnabled = true,
}) {
  const schedule = buildRegionalDurationPriceSchedule({
    ownerDailyPriceMinor,
    enabled: durationPricingEnabled,
  });
  const quote = quoteRental({
    days,
    pricePerDayMinor: schedule.ownerDailyPriceMinor,
    minimumDays: 1,
    maximumDays: 30,
    autoApplyDiscounts: schedule.enabled,
    discountTiers: schedule.tiers
      .filter((tier) => tier.minimumDays > 1)
      .map((tier) => ({
        days: tier.minimumDays,
        discountPercent: tier.discountPercent,
      })),
    currency: 'EUR',
  });
  if (!quote) fail(400, 'regional_price_quote_preview_invalid');
  return deepFreeze({
    simulation: true,
    noRealMoney: true,
    quoteAuthority: 'V5.2_QUOTE_ENGINE',
    ownerRentMinor: quote.rentalSubtotalMinor,
    sitPlatformContributionMinor: quote.platformFeeMinor,
    renterTotalMinor: quote.totalMinor,
    discountMinor: quote.discountMinor,
    securityDepositMinor: quote.securityDepositMinor,
    currency: quote.currency,
    quote,
  });
}

export function selectOwnerRegionalDailyPrice({
  recommendation,
  ownerDailyPriceMinor,
  ownerConfirmed,
}) {
  object(recommendation, 'regional_price_recommendation_required');
  if (recommendation.engineAuthority !== regionalPriceEngineAuthority) {
    fail(400, 'regional_price_recommendation_authority_invalid');
  }
  const selected = safeInteger(ownerDailyPriceMinor, {
    minimum: 1,
    maximum: 100_000_000,
    code: 'regional_price_owner_daily_price_invalid',
  });
  return deepFreeze({
    engineRecommendationMinor: recommendation.recommendedDailyMinor,
    ownerSelectedDailyMinor: selected,
    ownerOverrideApplied: selected !== recommendation.recommendedDailyMinor,
    ownerConfirmed: ownerConfirmed === true,
    publicationPriceReady: ownerConfirmed === true,
    automaticPublicationAllowed: false,
  });
}
