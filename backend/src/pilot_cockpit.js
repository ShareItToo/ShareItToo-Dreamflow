import { buildOperationalDelegationCockpit } from './operational_delegation.js';

const EVIDENCE_CLASSES = new Set(['actual', 'configured', 'estimated', 'unavailable']);
const COST_CATEGORIES = Object.freeze(['kyc', 'fraud', 'cloud', 'ai', 'marketing']);
const FOUNDER_HOUR_CATEGORIES = Object.freeze([
  'strategy',
  'operations',
  'support',
  'technical',
  'emergency',
]);
const AGGREGATE_RECORDING_ROLES = new Set(['admin', 'system']);
const MAX_AUDIT_AGGREGATES = 5_000;
const MAX_PERIOD_DAYS = 366;

export const defaultPilotCockpitAssumptions = Object.freeze({
  costClasses: Object.freeze([
    Object.freeze({
      category: 'kyc',
      state: 'disabled',
      evidenceClass: 'configured',
      sourceRef: 'docs/current_work_package.md#not-allowed-in-u0',
      amounts: Object.freeze([]),
    }),
    Object.freeze({
      category: 'fraud',
      state: 'disabled',
      evidenceClass: 'configured',
      sourceRef: 'docs/current_work_package.md#not-allowed-in-u0',
      amounts: Object.freeze([]),
    }),
    Object.freeze({
      category: 'cloud',
      state: 'unavailable',
      evidenceClass: 'unavailable',
      sourceRef: 'no-bounded-cloud-billing-source',
      amounts: Object.freeze([]),
    }),
    Object.freeze({
      category: 'ai',
      state: 'disabled',
      evidenceClass: 'configured',
      sourceRef: 'docs/current_work_package.md#not-allowed-in-u0',
      amounts: Object.freeze([]),
    }),
    Object.freeze({
      category: 'marketing',
      state: 'disabled',
      evidenceClass: 'configured',
      sourceRef: 'docs/current_work_package.md#not-allowed-in-u0',
      amounts: Object.freeze([]),
    }),
  ]),
  founderReplacementRates: Object.freeze([]),
});

export class PilotCockpitError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day) return null;
  return date;
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function includedMonthKeys(fromDate, toDate) {
  const months = [];
  for (let cursor = new Date(fromDate); cursor < toDate;) {
    months.push(monthKey(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

export function parsePilotCockpitPeriod(from, to) {
  const fromDate = dateOnly(from);
  const toDate = dateOnly(to);
  if (!fromDate || !toDate || fromDate >= toDate) {
    throw new PilotCockpitError(400, 'invalid_pilot_cockpit_period');
  }
  const days = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (!Number.isInteger(days) || days > MAX_PERIOD_DAYS) {
    throw new PilotCockpitError(400, 'pilot_cockpit_period_too_large', {
      maximumDays: MAX_PERIOD_DAYS,
    });
  }
  const calendarMonthAligned = fromDate.getUTCDate() === 1 && toDate.getUTCDate() === 1;
  return Object.freeze({
    fromInclusive: fromDate.toISOString(),
    toExclusive: toDate.toISOString(),
    days,
    calendarMonthAligned,
    monthKeys: Object.freeze(calendarMonthAligned ? includedMonthKeys(fromDate, toDate) : []),
  });
}

function safeCount(value, field) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_source', { field });
  }
  return parsed;
}

function safeMinor(value, field, { signed = false } = {}) {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || (!signed && parsed < 0)) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_source', { field });
  }
  return parsed;
}

function addMinor(left, right, field) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_source', { field });
  }
  return result;
}

function currency(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/u.test(normalized)) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_source', { field: 'currency' });
  }
  return normalized;
}

function iso(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_source', { field });
  }
  return date.toISOString();
}

function moneyMetric({
  currency: currencyCode,
  amountMinor,
  knownAmountMinor = undefined,
  evidenceClass,
  completeness,
  source,
  reason = undefined,
}) {
  if (!EVIDENCE_CLASSES.has(evidenceClass)) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_evidence_class');
  }
  const shaped = {
    currency: currency(currencyCode),
    amountMinor: amountMinor === null ? null : safeMinor(amountMinor, 'amountMinor', { signed: true }),
    evidenceClass,
    completeness,
    source: Array.isArray(source) ? [...source] : [String(source)],
  };
  if (knownAmountMinor !== undefined) {
    shaped.knownAmountMinor = safeMinor(knownAmountMinor, 'knownAmountMinor', { signed: true });
  }
  if (reason) shaped.reason = reason;
  return shaped;
}

function countMetric(value, source, { completeness = 'complete', reason = undefined } = {}) {
  const shaped = {
    value: value === null ? null : safeCount(value, 'countMetric'),
    evidenceClass: value === null ? 'unavailable' : 'actual',
    completeness,
    source: Array.isArray(source) ? [...source] : [String(source)],
  };
  if (reason) shaped.reason = reason;
  return shaped;
}

function evidenceFor(classes) {
  if (classes.includes('unavailable')) return 'unavailable';
  if (classes.includes('estimated')) return 'estimated';
  if (classes.includes('configured')) return 'configured';
  return 'actual';
}

function dividedMinor(amount, divisor) {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(divisor) || divisor <= 0) return null;
  const sign = amount < 0 ? -1n : 1n;
  const absolute = BigInt(Math.abs(amount));
  const denominator = BigInt(divisor);
  return Number(sign * ((absolute + denominator / 2n) / denominator));
}

function normalizeAssumptions(raw) {
  const assumptions = raw ?? defaultPilotCockpitAssumptions;
  if (!Array.isArray(assumptions.costClasses)
      || !Array.isArray(assumptions.founderReplacementRates)) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
  }
  const costClasses = new Map();
  for (const entry of assumptions.costClasses) {
    const category = String(entry?.category ?? '');
    const state = String(entry?.state ?? '');
    const evidenceClass = String(entry?.evidenceClass ?? '');
    const sourceRef = String(entry?.sourceRef ?? '').trim();
    if (!COST_CATEGORIES.includes(category) || costClasses.has(category)
        || !['disabled', 'configured', 'estimated', 'unavailable'].includes(state)
        || !EVIDENCE_CLASSES.has(evidenceClass) || !sourceRef
        || (state === 'disabled' && evidenceClass !== 'configured')
        || (state === 'configured' && evidenceClass !== 'configured')
        || (state === 'estimated' && evidenceClass !== 'estimated')
        || (state === 'unavailable' && evidenceClass !== 'unavailable')
        || !Array.isArray(entry.amounts)) {
      throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
    }
    const amounts = new Map();
    for (const amount of entry.amounts) {
      const code = currency(amount?.currency);
      if (amounts.has(code)) throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
      if (amount?.amountMinor === null || amount?.amountMinor === undefined) {
        throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
      }
      amounts.set(code, safeMinor(amount?.amountMinor, 'costClass.amountMinor'));
    }
    if ((state === 'disabled' || state === 'unavailable') && amounts.size > 0) {
      throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
    }
    costClasses.set(category, { category, state, evidenceClass, sourceRef, amounts });
  }
  if (costClasses.size !== COST_CATEGORIES.length) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
  }
  const founderRates = new Map();
  for (const rate of assumptions.founderReplacementRates) {
    const code = currency(rate?.currency);
    const evidenceClass = String(rate?.evidenceClass ?? '');
    const sourceRef = String(rate?.sourceRef ?? '').trim();
    if (founderRates.has(code) || !['configured', 'estimated'].includes(evidenceClass)
        || !sourceRef || rate?.hourlyRateMinor === null || rate?.hourlyRateMinor === undefined) {
      throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
    }
    const hourlyRateMinor = safeMinor(
      rate.hourlyRateMinor,
      'founderReplacement.hourlyRateMinor',
    );
    if (hourlyRateMinor === 0) {
      throw new PilotCockpitError(500, 'invalid_pilot_cockpit_assumptions');
    }
    founderRates.set(code, {
      currency: code,
      hourlyRateMinor,
      evidenceClass,
      sourceRef,
    });
  }
  return { costClasses, founderRates };
}

function manualAggregateUnavailable(source, reason) {
  return {
    value: null,
    knownValue: 0,
    evidenceClass: 'unavailable',
    completeness: 'unavailable',
    source: [source],
    reason,
  };
}

function validRecordedAt(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function buildFounderIndependence(period, rows, { truncated = false } = {}) {
  const source = 'backend.audit_log:manual-monthly-aggregate-only';
  const hourMetrics = Object.fromEntries(
    FOUNDER_HOUR_CATEGORIES.map((category) => [
      category,
      manualAggregateUnavailable(source, period.calendarMonthAligned
        ? 'monthly_aggregate_missing_or_invalid'
        : 'period_not_calendar_month_aligned'),
    ]),
  );
  const unavailableEscalations = {
    total: manualAggregateUnavailable(source, period.calendarMonthAligned
      ? 'monthly_aggregate_missing_or_invalid'
      : 'period_not_calendar_month_aligned'),
    roleRouted: manualAggregateUnavailable(source, 'monthly_aggregate_missing_or_invalid'),
    founderOnly: manualAggregateUnavailable(source, 'monthly_aggregate_missing_or_invalid'),
    unrouted: manualAggregateUnavailable(source, 'monthly_aggregate_missing_or_invalid'),
    roleRoutingRateBasisPoints: manualAggregateUnavailable(
      source,
      'monthly_aggregate_missing_or_invalid',
    ),
  };
  if (!period.calendarMonthAligned || truncated) {
    return {
      collectionMode: 'manual-monthly-aggregate-only',
      automaticCollectionAllowed: false,
      hoursByCategory: hourMetrics,
      totalMinutes: manualAggregateUnavailable(source, truncated
        ? 'aggregate_query_limit_exceeded'
        : 'period_not_calendar_month_aligned'),
      escalations: unavailableEscalations,
    };
  }

  const expectedMonths = new Set(period.monthKeys);
  const hourRecords = new Map();
  const escalationRecords = new Map();
  let invalidHours = false;
  let invalidEscalations = false;
  for (const row of rows) {
    const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
    if (row.action === 'founder_hours_aggregate_recorded') {
      const key = `${metadata.periodMonth}:${metadata.category}`;
      const valid = row.resource_type === 'founder_hours_aggregate'
        && expectedMonths.has(metadata.periodMonth)
        && FOUNDER_HOUR_CATEGORIES.includes(metadata.category)
        && Number.isSafeInteger(metadata.minutes)
        && metadata.minutes >= 0 && metadata.minutes <= 44_640
        && AGGREGATE_RECORDING_ROLES.has(row.actor_role)
        && metadata.recordedByRole === row.actor_role
        && validRecordedAt(metadata.recordedAt)
        && !hourRecords.has(key);
      if (!valid) {
        invalidHours = true;
      } else {
        hourRecords.set(key, metadata.minutes);
      }
    }
    if (row.action === 'founder_escalation_aggregate_recorded') {
      const key = metadata.periodMonth;
      const values = [
        metadata.totalCount,
        metadata.roleRoutedCount,
        metadata.founderOnlyCount,
        metadata.unroutedCount,
      ];
      const valid = row.resource_type === 'founder_escalation_aggregate'
        && expectedMonths.has(key)
        && values.every((value) => Number.isSafeInteger(value)
          && value >= 0 && value <= 1_000_000_000)
        && metadata.roleRoutedCount + metadata.founderOnlyCount + metadata.unroutedCount
          === metadata.totalCount
        && AGGREGATE_RECORDING_ROLES.has(row.actor_role)
        && metadata.recordedByRole === row.actor_role
        && validRecordedAt(metadata.recordedAt)
        && !escalationRecords.has(key);
      if (!valid) {
        invalidEscalations = true;
      } else {
        escalationRecords.set(key, {
          total: metadata.totalCount,
          roleRouted: metadata.roleRoutedCount,
          founderOnly: metadata.founderOnlyCount,
          unrouted: metadata.unroutedCount,
        });
      }
    }
  }

  for (const category of FOUNDER_HOUR_CATEGORIES) {
    const values = period.monthKeys.map((month) => hourRecords.get(`${month}:${category}`));
    if (!invalidHours && values.every(Number.isSafeInteger)) {
      hourMetrics[category] = {
        value: values.reduce((sum, value) => sum + value, 0),
        evidenceClass: 'actual',
        completeness: 'complete',
        source: [source],
      };
    }
  }
  const hourValues = Object.values(hourMetrics);
  const hoursComplete = hourValues.every((entry) => entry.completeness === 'complete');
  const totalMinutes = hoursComplete
    ? {
      value: hourValues.reduce((sum, entry) => sum + entry.value, 0),
      evidenceClass: 'actual',
      completeness: 'complete',
      source: [source],
    }
    : manualAggregateUnavailable(source, invalidHours
      ? 'invalid_or_duplicate_monthly_aggregate'
      : 'monthly_aggregate_missing_or_invalid');

  let escalations = unavailableEscalations;
  if (!invalidEscalations && period.monthKeys.every((month) => escalationRecords.has(month))) {
    const totals = [...escalationRecords.values()].reduce((sum, entry) => ({
      total: sum.total + entry.total,
      roleRouted: sum.roleRouted + entry.roleRouted,
      founderOnly: sum.founderOnly + entry.founderOnly,
      unrouted: sum.unrouted + entry.unrouted,
    }), { total: 0, roleRouted: 0, founderOnly: 0, unrouted: 0 });
    const metric = (value) => ({
      value,
      evidenceClass: 'actual',
      completeness: 'complete',
      source: [source],
    });
    escalations = {
      total: metric(totals.total),
      roleRouted: metric(totals.roleRouted),
      founderOnly: metric(totals.founderOnly),
      unrouted: metric(totals.unrouted),
      roleRoutingRateBasisPoints: totals.total === 0
        ? {
          value: null,
          evidenceClass: 'actual',
          completeness: 'not-applicable',
          source: [source],
          reason: 'no_escalations_in_period',
        }
        : {
          value: Number(
            (BigInt(totals.roleRouted) * 10_000n + BigInt(totals.total) / 2n)
              / BigInt(totals.total),
          ),
          evidenceClass: 'actual',
          completeness: 'complete',
          source: [source],
        },
    };
  }
  return {
    collectionMode: 'manual-monthly-aggregate-only',
    automaticCollectionAllowed: false,
    hoursByCategory: hourMetrics,
    totalMinutes,
    escalations,
  };
}

function rowByCurrency(rows) {
  const result = new Map();
  for (const row of rows ?? []) {
    const code = currency(row.currency);
    if (result.has(code)) throw new PilotCockpitError(500, 'duplicate_pilot_cockpit_currency');
    result.set(code, row);
  }
  return result;
}

function actualMetric(code, amountMinor, source) {
  return moneyMetric({
    currency: code,
    amountMinor,
    evidenceClass: 'actual',
    completeness: 'complete',
    source,
  });
}

function unavailableMetric(code, knownAmountMinor, source, reason) {
  return moneyMetric({
    currency: code,
    amountMinor: null,
    knownAmountMinor,
    evidenceClass: 'unavailable',
    completeness: knownAmountMinor === 0 ? 'unavailable' : 'partial',
    source,
    reason,
  });
}

function buildCurrencyBucket({
  code,
  paymentRow = {},
  providerRow = {},
  vatRow = {},
  assumptions,
  founderIndependence,
}) {
  const paymentSource = ['backend.payments', 'backend.refunds'];
  const capturedBookingCount = safeCount(paymentRow.captured_booking_count, 'captured_booking_count');
  const completedHandoverCount = safeCount(paymentRow.completed_handover_count, 'completed_handover_count');
  const incompleteCaptureCount = safeCount(paymentRow.incomplete_capture_count, 'incomplete_capture_count');
  const grossGmvKnown = safeMinor(paymentRow.gross_gmv_minor, 'gross_gmv_minor');
  const capturedCash = safeMinor(paymentRow.captured_cash_minor, 'captured_cash_minor');
  const refundedCash = safeMinor(paymentRow.refunded_cash_minor, 'refunded_cash_minor');
  const rentRefunded = safeMinor(paymentRow.rent_refunded_minor, 'rent_refunded_minor');
  const platformRevenueGrossKnown = safeMinor(
    paymentRow.platform_revenue_gross_minor,
    'platform_revenue_gross_minor',
  );
  const platformRevenueRefunded = safeMinor(
    paymentRow.platform_revenue_refunded_minor,
    'platform_revenue_refunded_minor',
  );
  const breakdownComplete = incompleteCaptureCount === 0;
  const grossGmv = breakdownComplete
    ? actualMetric(code, grossGmvKnown, paymentSource)
    : unavailableMetric(code, grossGmvKnown, paymentSource, 'partial_capture_breakdown_unavailable');
  const netGmvKnown = addMinor(grossGmvKnown, -rentRefunded, 'net_gmv_minor');
  const netGmv = breakdownComplete
    ? actualMetric(code, netGmvKnown, paymentSource)
    : unavailableMetric(code, netGmvKnown, paymentSource, 'partial_capture_breakdown_unavailable');
  const platformRevenueNetKnown = addMinor(
    platformRevenueGrossKnown,
    -platformRevenueRefunded,
    'platform_revenue_net_minor',
  );
  const platformRevenueNet = breakdownComplete
    ? actualMetric(code, platformRevenueNetKnown, paymentSource)
    : unavailableMetric(
      code,
      platformRevenueNetKnown,
      paymentSource,
      'partial_capture_breakdown_unavailable',
    );

  const providerCaptureEvents = safeCount(providerRow.capture_event_count, 'provider.capture_event_count');
  const providerCaptureEvidence = safeCount(providerRow.capture_evidenced_count, 'provider.capture_evidenced_count');
  const providerRefundEvents = safeCount(providerRow.refund_event_count, 'provider.refund_event_count');
  const providerRefundEvidence = safeCount(providerRow.refund_evidenced_count, 'provider.refund_evidenced_count');
  const providerFeeGrossKnown = safeMinor(providerRow.provider_fee_gross_minor, 'provider_fee_gross_minor');
  const providerFeeRefundedKnown = safeMinor(providerRow.provider_fee_refunded_minor, 'provider_fee_refunded_minor');
  const providerComplete = providerCaptureEvents === providerCaptureEvidence
    && providerRefundEvents === providerRefundEvidence;
  const providerFeeNetKnown = addMinor(
    providerFeeGrossKnown,
    -providerFeeRefundedKnown,
    'provider_fee_net_minor',
  );
  const providerSource = ['backend.ledger_transactions.metadata:explicit-provider-fee-only'];
  const providerFees = {
    gross: providerComplete
      ? actualMetric(code, providerFeeGrossKnown, providerSource)
      : unavailableMetric(code, providerFeeGrossKnown, providerSource, 'provider_fee_evidence_missing'),
    refunded: providerComplete
      ? actualMetric(code, providerFeeRefundedKnown, providerSource)
      : unavailableMetric(code, providerFeeRefundedKnown, providerSource, 'provider_fee_evidence_missing'),
    net: providerComplete
      ? actualMetric(code, providerFeeNetKnown, providerSource)
      : unavailableMetric(code, providerFeeNetKnown, providerSource, 'provider_fee_evidence_missing'),
  };

  const vatCaptureEvents = safeCount(vatRow.capture_event_count, 'vat.capture_event_count');
  const vatCaptureEvidence = safeCount(vatRow.capture_evidenced_count, 'vat.capture_evidenced_count');
  const vatRefundEvents = safeCount(vatRow.refund_event_count, 'vat.refund_event_count');
  const vatRefundEvidence = safeCount(vatRow.refund_evidenced_count, 'vat.refund_evidenced_count');
  const vatCapturedKnown = safeMinor(vatRow.vat_captured_minor, 'vat_captured_minor');
  const vatRefundedKnown = safeMinor(vatRow.vat_refunded_minor, 'vat_refunded_minor');
  const vatComplete = vatCaptureEvents === vatCaptureEvidence
    && vatRefundEvents === vatRefundEvidence;
  const vatNetKnown = addMinor(vatCapturedKnown, -vatRefundedKnown, 'vat_net_minor');
  const vatSource = ['backend.financial_documents.snapshot:explicit-vat-component-only'];
  const vatComponent = {
    captured: vatComplete
      ? actualMetric(code, vatCapturedKnown, vatSource)
      : unavailableMetric(code, vatCapturedKnown, vatSource, 'vat_component_evidence_missing'),
    refunded: vatComplete
      ? actualMetric(code, vatRefundedKnown, vatSource)
      : unavailableMetric(code, vatRefundedKnown, vatSource, 'vat_component_evidence_missing'),
    net: vatComplete
      ? actualMetric(code, vatNetKnown, vatSource)
      : unavailableMetric(code, vatNetKnown, vatSource, 'vat_component_evidence_missing'),
  };

  const costClasses = COST_CATEGORIES.map((category) => {
    const entry = assumptions.costClasses.get(category);
    if (entry.state === 'disabled') {
      return {
        category,
        state: 'disabled',
        metric: moneyMetric({
          currency: code,
          amountMinor: 0,
          evidenceClass: 'configured',
          completeness: 'complete',
          source: [entry.sourceRef],
        }),
      };
    }
    const amount = entry.amounts.get(code);
    if (entry.state === 'unavailable' || amount === undefined) {
      return {
        category,
        state: entry.state,
        metric: unavailableMetric(code, 0, [entry.sourceRef], 'cost_input_unavailable'),
      };
    }
    return {
      category,
      state: entry.state,
      metric: moneyMetric({
        currency: code,
        amountMinor: amount,
        evidenceClass: entry.evidenceClass,
        completeness: 'complete',
        source: [entry.sourceRef],
      }),
    };
  });

  const founderMinutes = founderIndependence.totalMinutes;
  const founderRate = assumptions.founderRates.get(code);
  let founderReplacementCost;
  if (founderMinutes.completeness === 'complete' && founderMinutes.value === 0) {
    founderReplacementCost = actualMetric(
      code,
      0,
      ['backend.audit_log:founder-hours-zero-aggregate'],
    );
  } else if (founderMinutes.completeness === 'complete' && founderRate) {
    const replacementMinor = Number(
      (BigInt(founderMinutes.value) * BigInt(founderRate.hourlyRateMinor) + 30n) / 60n,
    );
    if (!Number.isSafeInteger(replacementMinor)) {
      throw new PilotCockpitError(500, 'invalid_pilot_cockpit_source', {
        field: 'founderReplacementCost',
      });
    }
    founderReplacementCost = moneyMetric({
      currency: code,
      amountMinor: replacementMinor,
      evidenceClass: founderRate.evidenceClass,
      completeness: 'complete',
      source: [
        'backend.audit_log:founder_hours_aggregate_recorded',
        founderRate.sourceRef,
      ],
    });
  } else {
    founderReplacementCost = unavailableMetric(
      code,
      0,
      [
        'backend.audit_log:founder_hours_aggregate_recorded',
        founderRate?.sourceRef ?? 'founder-replacement-rate-open-finance-owner-decision',
      ],
      founderMinutes.completeness === 'complete'
        ? 'founder_replacement_rate_unavailable'
        : 'founder_hours_unavailable',
    );
  }

  const cashInputs = [platformRevenueNet, providerFees.net];
  const cashBlockingCosts = costClasses.filter((entry) => entry.state !== 'disabled');
  const cashComplete = cashInputs.every((entry) => entry.completeness === 'complete')
    && cashBlockingCosts.every((entry) => entry.metric.evidenceClass === 'actual'
      && entry.metric.completeness === 'complete');
  const knownCashCosts = cashBlockingCosts
    .filter((entry) => entry.metric.amountMinor !== null && entry.metric.evidenceClass === 'actual')
    .reduce(
      (sum, entry) => addMinor(sum, entry.metric.amountMinor, 'known_cash_costs_minor'),
      0,
    );
  const knownCashResult = addMinor(
    addMinor(platformRevenueNetKnown, -providerFeeNetKnown, 'known_cash_result_minor'),
    -knownCashCosts,
    'known_cash_result_minor',
  );
  const cashResult = cashComplete
    ? moneyMetric({
      currency: code,
      amountMinor: knownCashResult,
      evidenceClass: evidenceFor([
        platformRevenueNet.evidenceClass,
        providerFees.net.evidenceClass,
        ...cashBlockingCosts.map((entry) => entry.metric.evidenceClass),
      ]),
      completeness: 'complete',
      source: [paymentSource, providerSource].flat(),
    })
    : unavailableMetric(
      code,
      knownCashResult,
      [paymentSource, providerSource, 'explicit-external-cash-cost-inputs'].flat(),
      'cash_cost_inputs_unavailable_or_non_actual',
    );

  const normalizedInputs = [platformRevenueNet, providerFees.net, vatComponent.net,
    ...costClasses.map((entry) => entry.metric), founderReplacementCost];
  const normalizedComplete = normalizedInputs.every((entry) => entry.completeness === 'complete');
  const knownNormalizedCosts = costClasses
    .filter((entry) => entry.metric.amountMinor !== null)
    .reduce(
      (sum, entry) => addMinor(sum, entry.metric.amountMinor, 'normalized_costs_minor'),
      0,
    );
  const knownNormalizedResult = [
    -providerFeeNetKnown,
    -vatNetKnown,
    -knownNormalizedCosts,
    -(founderReplacementCost.amountMinor ?? 0),
  ].reduce(
    (sum, value) => addMinor(sum, value, 'known_normalized_result_minor'),
    platformRevenueNetKnown,
  );
  const normalizedEvidence = evidenceFor(normalizedInputs.map((entry) => entry.evidenceClass));
  const normalizedResult = normalizedComplete
    ? moneyMetric({
      currency: code,
      amountMinor: knownNormalizedResult,
      evidenceClass: normalizedEvidence,
      completeness: 'complete',
      source: [...new Set(normalizedInputs.flatMap((entry) => entry.source))],
    })
    : unavailableMetric(
      code,
      knownNormalizedResult,
      [...new Set(normalizedInputs.flatMap((entry) => entry.source))],
      'normalized_input_unavailable',
    );

  const perUnit = (divisor, label) => normalizedComplete && divisor > 0
    ? moneyMetric({
      currency: code,
      amountMinor: dividedMinor(knownNormalizedResult, divisor),
      evidenceClass: normalizedEvidence,
      completeness: 'complete',
      source: [`normalized-period-result/${label}`],
    })
    : unavailableMetric(
      code,
      0,
      [`normalized-period-result/${label}`],
      normalizedComplete ? `${label}_count_zero` : 'normalized_input_unavailable',
    );

  return {
    currency: code,
    activity: {
      capturedBookingCount: countMetric(capturedBookingCount, paymentSource),
      completedHandoverCount: countMetric(
        completedHandoverCount,
        ['backend.bookings.completed_at'],
      ),
    },
    actualFlows: {
      grossMerchandiseValue: grossGmv,
      rentRefunded: actualMetric(code, rentRefunded, paymentSource),
      netMerchandiseValue: netGmv,
      capturedCash: actualMetric(code, capturedCash, ['backend.payments.captured_minor']),
      refundedCash: actualMetric(code, refundedCash, ['backend.refunds.amount_minor']),
      platformRevenueGross: breakdownComplete
        ? actualMetric(code, platformRevenueGrossKnown, paymentSource)
        : unavailableMetric(
          code,
          platformRevenueGrossKnown,
          paymentSource,
          'partial_capture_breakdown_unavailable',
        ),
      platformRevenueRefunded: actualMetric(code, platformRevenueRefunded, paymentSource),
      platformRevenueNet,
      vatComponent,
      providerFees,
    },
    costClasses,
    cashView: {
      result: cashResult,
      excludesFounderReplacementCost: true,
      assumptionsDoNotRewriteActuals: true,
    },
    normalizedView: {
      founderReplacementCost,
      result: normalizedResult,
      profitability: normalizedComplete
        ? (knownNormalizedResult > 0 ? 'positive' : 'non_positive')
        : 'undetermined',
      contributionPerCapturedBooking: perUnit(capturedBookingCount, 'captured_booking'),
      contributionPerCompletedHandover: perUnit(completedHandoverCount, 'completed_handover'),
    },
  };
}

function buildFunnel(row = {}) {
  const source = ['backend.rental_carts', 'backend.rental_cart_projects',
    'backend.rental_cart_items', 'backend.booking_quotes', 'backend.bookings'];
  const metric = (field) => countMetric(safeCount(row[field], field), source);
  return {
    cartsCreated: metric('carts_created'),
    projectsCreated: metric('projects_created'),
    itemsAdded: metric('items_added'),
    itemsRechecked: metric('items_rechecked'),
    quoteCurrentAfterRecheck: metric('quote_current'),
    quoteChangedAfterRecheck: metric('quote_changed'),
    quoteUnavailableAfterRecheck: metric('quote_unavailable'),
    quotesIssuedForCartItems: metric('quotes_issued'),
    bookingsRequested: metric('bookings_requested'),
    bookingsConfirmed: metric('bookings_confirmed'),
    bookingsCompleted: metric('bookings_completed'),
    cartToBookingAttribution: {
      value: null,
      evidenceClass: 'unavailable',
      completeness: 'unavailable',
      source: ['no-cart-item-to-booking-attribution-key'],
      reason: 'causal_conversion_not_inferred_from_unlinked_counts',
    },
    reservationOrHoldCreatedByCart: false,
  };
}

export function buildPilotCockpitSnapshot({
  actor,
  period,
  generatedAt = new Date(),
  paymentRows = [],
  providerRows = [],
  vatRows = [],
  funnelRow = {},
  aggregateRows = [],
  aggregatesTruncated = false,
  assumptions = defaultPilotCockpitAssumptions,
  reportingCurrencies = [],
}) {
  if (actor?.role !== 'admin') {
    throw new PilotCockpitError(403, 'admin_role_required');
  }
  if (!period?.fromInclusive || !period?.toExclusive) {
    throw new PilotCockpitError(500, 'invalid_pilot_cockpit_period');
  }
  const normalizedAssumptions = normalizeAssumptions(assumptions);
  const payments = rowByCurrency(paymentRows);
  const providers = rowByCurrency(providerRows);
  const vats = rowByCurrency(vatRows);
  const currencies = new Set(reportingCurrencies.map(currency));
  for (const code of payments.keys()) currencies.add(code);
  for (const code of providers.keys()) currencies.add(code);
  for (const code of vats.keys()) currencies.add(code);
  for (const entry of normalizedAssumptions.costClasses.values()) {
    for (const code of entry.amounts.keys()) currencies.add(code);
  }
  for (const code of normalizedAssumptions.founderRates.keys()) currencies.add(code);
  const founderIndependence = buildFounderIndependence(period, aggregateRows, {
    truncated: aggregatesTruncated,
  });
  const currencyBuckets = [...currencies].sort().map((code) => buildCurrencyBucket({
    code,
    paymentRow: payments.get(code),
    providerRow: providers.get(code),
    vatRow: vats.get(code),
    assumptions: normalizedAssumptions,
    founderIndependence,
  }));
  const profitability = currencyBuckets.length > 0
    && currencyBuckets.every((bucket) => bucket.normalizedView.profitability === 'positive')
    ? 'positive'
    : (currencyBuckets.some((bucket) => bucket.normalizedView.profitability === 'undetermined')
        || currencyBuckets.length === 0
      ? 'undetermined'
      : 'non_positive');
  const projectFunnel = buildFunnel(funnelRow);
  return {
    schemaVersion: 1,
    kind: 'sit-pilot-cockpit',
    access: {
      role: 'admin',
      stepUpRequired: true,
      readOnly: true,
    },
    period: {
      fromInclusive: period.fromInclusive,
      toExclusive: period.toExclusive,
      days: period.days,
      calendarMonthAligned: period.calendarMonthAligned,
    },
    generatedAt: iso(generatedAt, 'generatedAt'),
    evidenceClasses: ['actual', 'configured', 'estimated', 'unavailable'],
    currencyAggregation: 'separate-no-fx',
    profitability,
    currencyBuckets,
    projectFunnel,
    founderIndependence,
    operationalDelegation: buildOperationalDelegationCockpit(),
    privacy: {
      aggregateOnly: true,
      containsUserIdentity: false,
      containsChatText: false,
      containsPreciseLocation: false,
      containsPaymentCredentials: false,
      containsEvidenceMedia: false,
      automaticFounderMonitoring: false,
    },
  };
}

async function collectPilotCockpitRows(client, period) {
  const values = [period.fromInclusive, period.toExclusive];
  const payments = await client.query(
    `WITH captured AS (
       SELECT currency,
              count(DISTINCT booking_id)::bigint AS captured_booking_count,
              count(*) FILTER (WHERE captured_minor <> amount_minor)::bigint AS incomplete_capture_count,
              COALESCE(sum(CASE WHEN captured_minor = amount_minor THEN rental_subtotal_minor ELSE 0 END), 0)::bigint AS gross_gmv_minor,
              COALESCE(sum(captured_minor), 0)::bigint AS captured_cash_minor,
              COALESCE(sum(CASE WHEN captured_minor = amount_minor THEN platform_fee_minor ELSE 0 END), 0)::bigint AS platform_revenue_gross_minor
         FROM payments
        WHERE captured_at >= $1::timestamptz AND captured_at < $2::timestamptz
          AND captured_minor > 0
          AND status IN ('captured', 'partially_refunded', 'refunded')
        GROUP BY currency
     ), refunded AS (
       SELECT refund.currency,
              COALESCE(sum(refund.amount_minor), 0)::bigint AS refunded_cash_minor,
              COALESCE(sum(refund.owner_share_minor), 0)::bigint AS rent_refunded_minor,
              COALESCE(sum(refund.platform_share_minor), 0)::bigint AS platform_revenue_refunded_minor
         FROM refunds AS refund
        WHERE refund.status = 'succeeded'
          AND COALESCE(refund.succeeded_at, refund.updated_at) >= $1::timestamptz
          AND COALESCE(refund.succeeded_at, refund.updated_at) < $2::timestamptz
        GROUP BY refund.currency
     ), completed AS (
       SELECT currency, count(*)::bigint AS completed_handover_count
         FROM bookings
        WHERE completed_at >= $1::timestamptz AND completed_at < $2::timestamptz
        GROUP BY currency
     ), currencies AS (
       SELECT currency FROM captured UNION SELECT currency FROM refunded UNION SELECT currency FROM completed
     )
     SELECT currencies.currency,
            COALESCE(captured.captured_booking_count, 0)::bigint AS captured_booking_count,
            COALESCE(completed.completed_handover_count, 0)::bigint AS completed_handover_count,
            COALESCE(captured.incomplete_capture_count, 0)::bigint AS incomplete_capture_count,
            COALESCE(captured.gross_gmv_minor, 0)::bigint AS gross_gmv_minor,
            COALESCE(captured.captured_cash_minor, 0)::bigint AS captured_cash_minor,
            COALESCE(refunded.refunded_cash_minor, 0)::bigint AS refunded_cash_minor,
            COALESCE(refunded.rent_refunded_minor, 0)::bigint AS rent_refunded_minor,
            COALESCE(captured.platform_revenue_gross_minor, 0)::bigint AS platform_revenue_gross_minor,
            COALESCE(refunded.platform_revenue_refunded_minor, 0)::bigint AS platform_revenue_refunded_minor
       FROM currencies
       LEFT JOIN captured USING (currency)
       LEFT JOIN refunded USING (currency)
       LEFT JOIN completed USING (currency)
      ORDER BY currencies.currency`,
    values,
  );
  const provider = await client.query(
    `WITH provider_events AS (
       SELECT currency, transaction_type,
              CASE WHEN metadata->>'providerFeeMinor' ~ '^[0-9]{1,15}$'
                THEN (metadata->>'providerFeeMinor')::bigint END AS provider_fee_minor,
              CASE WHEN metadata->>'providerFeeRefundMinor' ~ '^[0-9]{1,15}$'
                THEN (metadata->>'providerFeeRefundMinor')::bigint END AS provider_fee_refund_minor,
              nullif(metadata->>'providerFeeEvidenceRef', '') AS provider_fee_evidence_ref
         FROM ledger_transactions
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
          AND transaction_type IN ('payment_captured', 'payment_refunded')
     )
     SELECT currency,
            count(*) FILTER (WHERE transaction_type = 'payment_captured')::bigint AS capture_event_count,
            count(*) FILTER (
              WHERE transaction_type = 'payment_captured'
                AND provider_fee_minor IS NOT NULL
                AND provider_fee_evidence_ref IS NOT NULL
            )::bigint AS capture_evidenced_count,
            count(*) FILTER (WHERE transaction_type = 'payment_refunded')::bigint AS refund_event_count,
            count(*) FILTER (
              WHERE transaction_type = 'payment_refunded'
                AND provider_fee_refund_minor IS NOT NULL
                AND provider_fee_evidence_ref IS NOT NULL
            )::bigint AS refund_evidenced_count,
            COALESCE(sum(CASE
              WHEN transaction_type = 'payment_captured'
                AND provider_fee_minor IS NOT NULL
                AND provider_fee_evidence_ref IS NOT NULL
              THEN provider_fee_minor ELSE 0 END), 0)::bigint AS provider_fee_gross_minor,
            COALESCE(sum(CASE
              WHEN transaction_type = 'payment_refunded'
                AND provider_fee_refund_minor IS NOT NULL
                AND provider_fee_evidence_ref IS NOT NULL
              THEN provider_fee_refund_minor ELSE 0 END), 0)::bigint AS provider_fee_refunded_minor
       FROM provider_events
      GROUP BY currency
      ORDER BY currency`,
    values,
  );
  const vat = await client.query(
    `WITH captured_source AS (
       SELECT payment.currency, payment.platform_fee_minor,
              CASE WHEN document.snapshot->>'vatComponentMinor' ~ '^[0-9]{1,15}$'
                THEN (document.snapshot->>'vatComponentMinor')::bigint END AS vat_component_minor,
              nullif(document.snapshot->>'vatEvidenceRef', '') AS vat_evidence_ref
         FROM payments AS payment
         LEFT JOIN LATERAL (
           SELECT snapshot FROM financial_documents
            WHERE payment_id = payment.id AND document_type = 'sit_fee_receipt'
            ORDER BY issued_at DESC LIMIT 1
         ) AS document ON true
        WHERE payment.captured_at >= $1::timestamptz AND payment.captured_at < $2::timestamptz
          AND payment.captured_minor = payment.amount_minor
          AND payment.status IN ('captured', 'partially_refunded', 'refunded')
     ), captured AS (
       SELECT currency,
              count(*)::bigint AS capture_event_count,
              count(*) FILTER (
                WHERE platform_fee_minor = 0 OR (
                  vat_component_minor IS NOT NULL
                  AND vat_component_minor <= platform_fee_minor
                  AND vat_evidence_ref IS NOT NULL
                )
              )::bigint AS capture_evidenced_count,
              COALESCE(sum(CASE
                WHEN vat_component_minor IS NOT NULL
                  AND vat_component_minor <= platform_fee_minor
                  AND vat_evidence_ref IS NOT NULL
                THEN vat_component_minor ELSE 0 END), 0)::bigint AS vat_captured_minor
         FROM captured_source
        GROUP BY currency
     ), refunded_source AS (
       SELECT refund.currency, refund.platform_share_minor,
              CASE WHEN document.snapshot->>'sitFeeVatRefundMinor' ~ '^[0-9]{1,15}$'
                THEN (document.snapshot->>'sitFeeVatRefundMinor')::bigint END AS vat_refund_minor,
              nullif(document.snapshot->>'vatEvidenceRef', '') AS vat_evidence_ref
         FROM refunds AS refund
         LEFT JOIN LATERAL (
           SELECT snapshot FROM financial_documents
            WHERE refund_id = refund.id AND document_type = 'refund_receipt'
            ORDER BY issued_at DESC LIMIT 1
         ) AS document ON true
        WHERE refund.status = 'succeeded'
          AND COALESCE(refund.succeeded_at, refund.updated_at) >= $1::timestamptz
          AND COALESCE(refund.succeeded_at, refund.updated_at) < $2::timestamptz
     ), refunded AS (
       SELECT currency,
              count(*)::bigint AS refund_event_count,
              count(*) FILTER (
                WHERE platform_share_minor = 0 OR (
                  vat_refund_minor IS NOT NULL
                  AND vat_refund_minor <= platform_share_minor
                  AND vat_evidence_ref IS NOT NULL
                )
              )::bigint AS refund_evidenced_count,
              COALESCE(sum(CASE
                WHEN vat_refund_minor IS NOT NULL
                  AND vat_refund_minor <= platform_share_minor
                  AND vat_evidence_ref IS NOT NULL
                THEN vat_refund_minor ELSE 0 END), 0)::bigint AS vat_refunded_minor
         FROM refunded_source
        GROUP BY currency
     ), currencies AS (
       SELECT currency FROM captured UNION SELECT currency FROM refunded
     )
     SELECT currencies.currency,
            COALESCE(captured.capture_event_count, 0)::bigint AS capture_event_count,
            COALESCE(captured.capture_evidenced_count, 0)::bigint AS capture_evidenced_count,
            COALESCE(refunded.refund_event_count, 0)::bigint AS refund_event_count,
            COALESCE(refunded.refund_evidenced_count, 0)::bigint AS refund_evidenced_count,
            COALESCE(captured.vat_captured_minor, 0)::bigint AS vat_captured_minor,
            COALESCE(refunded.vat_refunded_minor, 0)::bigint AS vat_refunded_minor
       FROM currencies
       LEFT JOIN captured USING (currency)
       LEFT JOIN refunded USING (currency)
      ORDER BY currencies.currency`,
    values,
  );
  const funnel = await client.query(
    `SELECT
       (SELECT count(*)::bigint FROM rental_carts WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz) AS carts_created,
       (SELECT count(*)::bigint FROM rental_cart_projects WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz) AS projects_created,
       (SELECT count(*)::bigint FROM rental_cart_items WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz) AS items_added,
       (SELECT count(*)::bigint FROM rental_cart_items WHERE quote_rechecked_at >= $1::timestamptz AND quote_rechecked_at < $2::timestamptz) AS items_rechecked,
       (SELECT count(*)::bigint FROM rental_cart_items WHERE quote_rechecked_at >= $1::timestamptz AND quote_rechecked_at < $2::timestamptz AND quote_status = 'current') AS quote_current,
       (SELECT count(*)::bigint FROM rental_cart_items WHERE quote_rechecked_at >= $1::timestamptz AND quote_rechecked_at < $2::timestamptz AND quote_status = 'changed') AS quote_changed,
       (SELECT count(*)::bigint FROM rental_cart_items WHERE quote_rechecked_at >= $1::timestamptz AND quote_rechecked_at < $2::timestamptz AND quote_status = 'unavailable') AS quote_unavailable,
       (SELECT count(DISTINCT item.quote_id)::bigint
          FROM rental_cart_items AS item
          JOIN booking_quotes AS quote ON quote.id = item.quote_id
         WHERE quote.issued_at >= $1::timestamptz AND quote.issued_at < $2::timestamptz) AS quotes_issued,
       (SELECT count(*)::bigint FROM bookings WHERE requested_at >= $1::timestamptz AND requested_at < $2::timestamptz) AS bookings_requested,
       (SELECT count(*)::bigint FROM bookings WHERE confirmed_at >= $1::timestamptz AND confirmed_at < $2::timestamptz) AS bookings_confirmed,
       (SELECT count(*)::bigint FROM bookings WHERE completed_at >= $1::timestamptz AND completed_at < $2::timestamptz) AS bookings_completed`,
    values,
  );
  const aggregates = period.calendarMonthAligned
    ? await client.query(
      `SELECT actor_role, action, resource_type, resource_id, metadata, created_at
         FROM audit_log
        WHERE action = ANY($1::text[])
          AND metadata->>'periodMonth' >= $2
          AND metadata->>'periodMonth' < $3
        ORDER BY metadata->>'periodMonth', action, resource_id, created_at
        LIMIT $4`,
      [
        ['founder_hours_aggregate_recorded', 'founder_escalation_aggregate_recorded'],
        period.monthKeys[0],
        monthKey(new Date(period.toExclusive)),
        MAX_AUDIT_AGGREGATES + 1,
      ],
    )
    : { rows: [] };
  return {
    paymentRows: payments.rows,
    providerRows: provider.rows,
    vatRows: vat.rows,
    funnelRow: funnel.rows[0] ?? {},
    aggregateRows: aggregates.rows.slice(0, MAX_AUDIT_AGGREGATES),
    aggregatesTruncated: aggregates.rows.length > MAX_AUDIT_AGGREGATES,
  };
}

export async function getPilotCockpitSnapshot(client, {
  actor,
  from,
  to,
  now = new Date(),
  assumptions = defaultPilotCockpitAssumptions,
  reportingCurrencies = [],
}) {
  if (actor?.role !== 'admin') {
    throw new PilotCockpitError(403, 'admin_role_required');
  }
  const period = parsePilotCockpitPeriod(from, to);
  const rows = await collectPilotCockpitRows(client, period);
  return buildPilotCockpitSnapshot({
    actor,
    period,
    generatedAt: now,
    assumptions,
    reportingCurrencies,
    ...rows,
  });
}
