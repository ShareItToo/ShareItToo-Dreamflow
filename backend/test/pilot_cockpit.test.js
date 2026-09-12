import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPilotCockpitSnapshot,
  getPilotCockpitSnapshot,
  parsePilotCockpitPeriod,
  PilotCockpitError,
} from '../src/pilot_cockpit.js';

const admin = Object.freeze({ id: 'admin-id', role: 'admin' });
const period = parsePilotCockpitPeriod('2026-01-01', '2026-02-01');

function aggregateRows(minutes = [10, 20, 10, 10, 10]) {
  const categories = ['strategy', 'operations', 'support', 'technical', 'emergency'];
  return [
    ...categories.map((category, index) => ({
      actor_role: 'admin',
      action: 'founder_hours_aggregate_recorded',
      resource_type: 'founder_hours_aggregate',
      resource_id: `2026-01:${category}`,
      metadata: {
        periodMonth: '2026-01',
        category,
        minutes: minutes[index],
        recordedByRole: 'admin',
        recordedAt: '2026-02-01T08:00:00.000Z',
      },
    })),
    {
      actor_role: 'admin',
      action: 'founder_escalation_aggregate_recorded',
      resource_type: 'founder_escalation_aggregate',
      resource_id: '2026-01',
      metadata: {
        periodMonth: '2026-01',
        totalCount: 10,
        roleRoutedCount: 7,
        founderOnlyCount: 2,
        unroutedCount: 1,
        recordedByRole: 'admin',
        recordedAt: '2026-02-01T08:05:00.000Z',
      },
    },
  ];
}

function assumptions({ allDisabled = false } = {}) {
  return {
    costClasses: [
      { category: 'kyc', state: 'disabled', evidenceClass: 'configured', sourceRef: 'pilot-policy:kyc-disabled', amounts: [] },
      { category: 'fraud', state: 'disabled', evidenceClass: 'configured', sourceRef: 'pilot-policy:fraud-disabled', amounts: [] },
      ...(allDisabled
        ? [{ category: 'cloud', state: 'disabled', evidenceClass: 'configured', sourceRef: 'test-fixture:cloud-disabled', amounts: [] }]
        : [{ category: 'cloud', state: 'configured', evidenceClass: 'configured', sourceRef: 'test-fixture:cloud-budget', amounts: [{ currency: 'EUR', amountMinor: 200 }] }]),
      { category: 'ai', state: 'disabled', evidenceClass: 'configured', sourceRef: 'pilot-policy:ai-disabled', amounts: [] },
      ...(allDisabled
        ? [{ category: 'marketing', state: 'disabled', evidenceClass: 'configured', sourceRef: 'pilot-policy:marketing-disabled', amounts: [] }]
        : [{ category: 'marketing', state: 'estimated', evidenceClass: 'estimated', sourceRef: 'test-fixture:marketing-estimate', amounts: [{ currency: 'EUR', amountMinor: 50 }] }]),
    ],
    founderReplacementRates: allDisabled ? [] : [{
      currency: 'EUR',
      hourlyRateMinor: 3_000,
      evidenceClass: 'configured',
      sourceRef: 'test-fixture:finance-rate',
    }],
  };
}

function completeRows() {
  return {
    paymentRows: [{
      currency: 'EUR',
      captured_booking_count: 2,
      completed_handover_count: 1,
      incomplete_capture_count: 0,
      gross_gmv_minor: 3_000,
      captured_cash_minor: 3_300,
      refunded_cash_minor: 550,
      rent_refunded_minor: 500,
      platform_revenue_gross_minor: 300,
      platform_revenue_refunded_minor: 50,
    }],
    providerRows: [{
      currency: 'EUR',
      capture_event_count: 2,
      capture_evidenced_count: 2,
      refund_event_count: 1,
      refund_evidenced_count: 1,
      provider_fee_gross_minor: 90,
      provider_fee_refunded_minor: 10,
    }],
    vatRows: [{
      currency: 'EUR',
      capture_event_count: 2,
      capture_evidenced_count: 2,
      refund_event_count: 1,
      refund_evidenced_count: 1,
      vat_captured_minor: 48,
      vat_refunded_minor: 8,
    }],
    funnelRow: {
      carts_created: 3,
      projects_created: 2,
      items_added: 5,
      items_rechecked: 4,
      quote_current: 2,
      quote_changed: 1,
      quote_unavailable: 1,
      quotes_issued: 4,
      bookings_requested: 2,
      bookings_confirmed: 1,
      bookings_completed: 1,
    },
  };
}

test('periods are bounded and monthly aggregates require calendar-month alignment', () => {
  assert.deepEqual(
    parsePilotCockpitPeriod('2026-01-01', '2026-03-01').monthKeys,
    ['2026-01', '2026-02'],
  );
  assert.equal(
    parsePilotCockpitPeriod('2026-01-02', '2026-02-02').calendarMonthAligned,
    false,
  );
  assert.throws(
    () => parsePilotCockpitPeriod('2026-01-01', '2027-01-03'),
    (error) => error instanceof PilotCockpitError
      && error.code === 'pilot_cockpit_period_too_large',
  );
  assert.throws(
    () => parsePilotCockpitPeriod('2026-02-01', '2026-01-01'),
    (error) => error.code === 'invalid_pilot_cockpit_period',
  );
});

test('snapshot keeps cash and normalized P&L separate with exact cent arithmetic', () => {
  const snapshot = buildPilotCockpitSnapshot({
    actor: admin,
    period,
    generatedAt: '2026-02-02T00:00:00.000Z',
    ...completeRows(),
    aggregateRows: aggregateRows(),
    assumptions: assumptions(),
    reportingCurrencies: ['EUR'],
  });
  const bucket = snapshot.currencyBuckets[0];
  assert.equal(bucket.actualFlows.grossMerchandiseValue.amountMinor, 3_000);
  assert.equal(bucket.actualFlows.netMerchandiseValue.amountMinor, 2_500);
  assert.equal(bucket.actualFlows.platformRevenueNet.amountMinor, 250);
  assert.equal(bucket.actualFlows.providerFees.net.amountMinor, 80);
  assert.equal(bucket.actualFlows.vatComponent.net.amountMinor, 40);
  assert.equal(snapshot.founderIndependence.totalMinutes.value, 60);
  assert.equal(
    snapshot.founderIndependence.escalations.roleRoutingRateBasisPoints.value,
    7_000,
  );
  assert.equal(bucket.normalizedView.founderReplacementCost.amountMinor, 3_000);
  assert.equal(bucket.cashView.result.amountMinor, null);
  assert.equal(bucket.cashView.result.knownAmountMinor, 170);
  assert.equal(bucket.normalizedView.result.amountMinor, -3_120);
  assert.equal(bucket.normalizedView.result.evidenceClass, 'estimated');
  assert.equal(bucket.normalizedView.contributionPerCapturedBooking.amountMinor, -1_560);
  assert.equal(bucket.normalizedView.contributionPerCompletedHandover.amountMinor, -3_120);
  assert.equal(bucket.normalizedView.profitability, 'non_positive');
  assert.equal(snapshot.profitability, 'non_positive');
  assert.equal(snapshot.projectFunnel.cartToBookingAttribution.value, null);
  assert.equal(snapshot.projectFunnel.reservationOrHoldCreatedByCart, false);
  assert.equal(snapshot.operationalDelegation.state, 'hold-external-role-assignments');
  assert.equal(snapshot.operationalDelegation.processes.length, 4);
  assert.equal(snapshot.operationalDelegation.reportingSeparation.blended, false);
  assert.equal(
    snapshot.operationalDelegation.reportingSeparation.normalOperationsPath,
    'projectFunnel',
  );
  assert.equal(
    snapshot.operationalDelegation.reportingSeparation.founderHoursPath,
    'founderIndependence.hoursByCategory',
  );
  assert.equal(
    snapshot.operationalDelegation.reportingSeparation.founderEscalationsPath,
    'founderIndependence.escalations',
  );
  assert.doesNotMatch(JSON.stringify(snapshot), /admin-id|email|message|latitude|longitude/iu);
});

test('currency buckets never use implicit FX and complete zero-hour evidence needs no wage rate', () => {
  const eur = completeRows();
  const snapshot = buildPilotCockpitSnapshot({
    actor: admin,
    period,
    paymentRows: [
      { ...eur.paymentRows[0], captured_booking_count: 1, completed_handover_count: 1, gross_gmv_minor: 1_000, captured_cash_minor: 1_100, refunded_cash_minor: 0, rent_refunded_minor: 0, platform_revenue_gross_minor: 100, platform_revenue_refunded_minor: 0 },
      { ...eur.paymentRows[0], currency: 'USD', captured_booking_count: 1, completed_handover_count: 1, gross_gmv_minor: 2_000, captured_cash_minor: 2_200, refunded_cash_minor: 0, rent_refunded_minor: 0, platform_revenue_gross_minor: 200, platform_revenue_refunded_minor: 0 },
    ],
    providerRows: [
      { ...eur.providerRows[0], capture_event_count: 1, capture_evidenced_count: 1, refund_event_count: 0, refund_evidenced_count: 0, provider_fee_gross_minor: 20, provider_fee_refunded_minor: 0 },
      { ...eur.providerRows[0], currency: 'USD', capture_event_count: 1, capture_evidenced_count: 1, refund_event_count: 0, refund_evidenced_count: 0, provider_fee_gross_minor: 30, provider_fee_refunded_minor: 0 },
    ],
    vatRows: [
      { ...eur.vatRows[0], capture_event_count: 1, capture_evidenced_count: 1, refund_event_count: 0, refund_evidenced_count: 0, vat_captured_minor: 10, vat_refunded_minor: 0 },
      { ...eur.vatRows[0], currency: 'USD', capture_event_count: 1, capture_evidenced_count: 1, refund_event_count: 0, refund_evidenced_count: 0, vat_captured_minor: 20, vat_refunded_minor: 0 },
    ],
    aggregateRows: aggregateRows([0, 0, 0, 0, 0]),
    assumptions: assumptions({ allDisabled: true }),
    reportingCurrencies: ['EUR', 'USD'],
  });
  assert.equal(snapshot.currencyAggregation, 'separate-no-fx');
  assert.deepEqual(snapshot.currencyBuckets.map((bucket) => bucket.currency), ['EUR', 'USD']);
  assert.equal(snapshot.currencyBuckets[0].cashView.result.amountMinor, 80);
  assert.equal(snapshot.currencyBuckets[0].normalizedView.result.amountMinor, 70);
  assert.equal(snapshot.currencyBuckets[1].cashView.result.amountMinor, 170);
  assert.equal(snapshot.currencyBuckets[1].normalizedView.result.amountMinor, 150);
  assert.equal(snapshot.profitability, 'positive');
});

test('missing provider, VAT, founder or cost evidence cannot become zero or profit', () => {
  const rows = completeRows();
  rows.providerRows[0].capture_evidenced_count = 1;
  rows.vatRows[0].capture_evidenced_count = 1;
  const snapshot = buildPilotCockpitSnapshot({
    actor: admin,
    period,
    ...rows,
    aggregateRows: [],
    reportingCurrencies: ['EUR'],
  });
  const bucket = snapshot.currencyBuckets[0];
  assert.equal(bucket.actualFlows.providerFees.net.amountMinor, null);
  assert.equal(bucket.actualFlows.providerFees.net.completeness, 'partial');
  assert.equal(bucket.actualFlows.vatComponent.net.amountMinor, null);
  assert.equal(bucket.costClasses.find((entry) => entry.category === 'cloud').metric.amountMinor, null);
  assert.equal(snapshot.founderIndependence.totalMinutes.value, null);
  assert.equal(bucket.normalizedView.result.amountMinor, null);
  assert.equal(bucket.normalizedView.profitability, 'undetermined');
  assert.equal(snapshot.profitability, 'undetermined');
});

test('admin-only collector is bounded, aggregate-only and contains SELECT queries only', async () => {
  const calls = [];
  const results = [
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [{ carts_created: 0, projects_created: 0, items_added: 0, items_rechecked: 0, quote_current: 0, quote_changed: 0, quote_unavailable: 0, quotes_issued: 0, bookings_requested: 0, bookings_confirmed: 0, bookings_completed: 0 }] },
    { rows: [] },
  ];
  const client = {
    async query(statement, values) {
      calls.push({ statement, values });
      return results.shift();
    },
  };
  const snapshot = await getPilotCockpitSnapshot(client, {
    actor: admin,
    from: '2026-01-01',
    to: '2026-02-01',
    now: '2026-02-02T00:00:00.000Z',
    reportingCurrencies: ['EUR'],
  });
  assert.equal(snapshot.access.readOnly, true);
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.match(call.statement.trim(), /^(?:WITH|SELECT)\b/u);
    assert.doesNotMatch(call.statement, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/iu);
  }
  assert.equal(calls.at(-1).values.at(-1), 5_001);

  const deniedClient = { query: async () => assert.fail('support must not reach a query') };
  await assert.rejects(
    getPilotCockpitSnapshot(deniedClient, {
      actor: { id: 'support-id', role: 'support' },
      from: '2026-01-01',
      to: '2026-02-01',
    }),
    (error) => error.status === 403 && error.code === 'admin_role_required',
  );
});

test('HTTP wiring is GET-only, no-store, admin-gated before staff step-up', () => {
  const source = readFileSync(new URL('../src/pilot_cockpit.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b\s+(?:INTO|[a-z_])/iu);
  assert.match(
    app,
    /app\.get\('\/v1\/admin\/pilot-cockpit', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation/u,
  );
  assert.match(app, /pilot-cockpit[\s\S]*Cache-Control', 'private, no-store'/u);
  assert.doesNotMatch(app, /app\.(?:post|put|patch|delete)\('\/v1\/admin\/pilot-cockpit/u);
});
