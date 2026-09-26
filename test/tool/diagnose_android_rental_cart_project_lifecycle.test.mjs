import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  calendarMonthLabel,
  cartAcknowledgementProbe,
  cartServerReceiptProbe,
  firstServerEligibleRentalDate,
  nextCalendarMonthActionNode,
  rentalCartItemActionVisible,
  rentalCartItemProjectVisible,
  runAndroidRentalCartProjectLifecycle,
  selectedIntentDetailSettled,
  selectedIntentSurfaceState,
  selectedIntentRemoteSettle,
  selectableCalendarDayNode,
  waitForExactCartServerReceipt,
} from '../../tool/diagnose_android_rental_cart_project_lifecycle.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090507',
  commit: '1'.repeat(40),
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  android: { apkSha256: '2'.repeat(64) },
});

test('selects only one enabled clickable current calendar day', () => {
  const selectable = '<node class="android.view.View" text="5" content-desc="" '
    + 'enabled="true" clickable="true" bounds="[100,400][200,500]"/>';
  const disabled = '<node class="android.view.View" text="5" content-desc="" '
    + 'enabled="false" clickable="true" bounds="[300,400][400,500]"/>';
  assert.equal(selectableCalendarDayNode(selectable + disabled, 5), selectable);
  assert.equal(selectableCalendarDayNode(selectable + selectable, 5), null);
  assert.equal(selectableCalendarDayNode(selectable, 6), null);
});

test('chooses the first future local rental date across month boundaries', () => {
  const ordinary = firstServerEligibleRentalDate(new Date(2026, 8, 6, 0, 5));
  assert.equal(calendarMonthLabel(ordinary), 'September 2026');
  assert.equal(ordinary.getDate(), 7);
  const rollover = firstServerEligibleRentalDate(new Date(2026, 8, 30, 23, 55));
  assert.equal(calendarMonthLabel(rollover), 'Oktober 2026');
  assert.equal(rollover.getDate(), 1);
});

test('finds only the enabled clickable next-month control beside the month label', () => {
  const hierarchy = [
    '<node text="September 2026" bounds="[300,200][700,260]"/>',
    '<node clickable="true" enabled="true" bounds="[220,190][280,270]"/>',
    '<node clickable="true" enabled="true" bounds="[720,190][780,270]"/>',
    '<node clickable="true" enabled="true" bounds="[720,500][780,580]"/>',
  ].join('');
  assert.equal(
    nextCalendarMonthActionNode(hierarchy, 'September 2026'),
    '<node clickable="true" enabled="true" bounds="[720,190][780,270]"/>',
  );
  assert.equal(nextCalendarMonthActionNode(hierarchy, 'August 2026'), null);
});

test('binds project confirmation to the exact rental-cart item row', () => {
  const hierarchy = [
    '<node text="Other listing" bounds="[80,300][500,350]"/>',
    '<node text="Exact project" bounds="[80,370][500,420]"/>',
    '<node text="Exact listing" bounds="[80,900][500,950]"/>',
    '<node text="07.09.2026 - Exact project - Aktuell geprüft" '
      + 'bounds="[80,960][500,1040]"/>',
  ].join('');
  assert.equal(
    rentalCartItemProjectVisible(hierarchy, 'Exact listing', 'Exact project'),
    true,
  );
  assert.equal(
    rentalCartItemProjectVisible(hierarchy, 'Missing listing', 'Exact project'),
    false,
  );
  assert.equal(
    rentalCartItemProjectVisible(
      '<node text="Exact listing" bounds="[80,900][500,950]"/>'
        + '<node text="Exact project" bounds="[80,300][500,350]"/>',
      'Exact listing',
      'Exact project',
    ),
    false,
  );
});

test('binds a repeated cart action to the exact listing row', () => {
  const hierarchy = [
    '<node text="Other listing" bounds="[80,300][500,350]"/>',
    '<node content-desc="Aus Mietkorb entfernen" bounds="[900,290][1000,390]"/>',
    '<node text="Exact listing" bounds="[80,900][500,950]"/>',
    '<node content-desc="Aus Mietkorb entfernen" bounds="[900,890][1000,990]"/>',
  ].join('');
  assert.equal(
    rentalCartItemActionVisible(hierarchy, 'Exact listing', 'Aus Mietkorb entfernen'),
    true,
  );
  assert.equal(
    rentalCartItemActionVisible(hierarchy, 'Missing listing', 'Aus Mietkorb entfernen'),
    false,
  );
});

test('remote availability settling outlives the 20-second transport contract', () => {
  const backendRepository = readFileSync(
    new URL('../../lib/services/backend_repository.dart', import.meta.url),
    'utf8',
  );
  assert.match(
    backendRepository,
    /Duration timeout = const Duration\(seconds: 20\)/u,
  );
  assert.equal(selectedIntentRemoteSettle.intervalMs, 650);
  assert.equal(selectedIntentRemoteSettle.attempts, 40);
  assert.ok(
    selectedIntentRemoteSettle.intervalMs * selectedIntentRemoteSettle.attempts
      >= 26000,
  );
});

test('starts the short-lived cart acknowledgement probe before a cold dump can miss it', () => {
  assert.equal(cartAcknowledgementProbe.intervalMs, 75);
  assert.equal(cartAcknowledgementProbe.attempts, 24);
  assert.ok(cartAcknowledgementProbe.intervalMs < 200);
});

test('physical cart acceptance settles on exact server truth without retrying the mutation', async () => {
  let inspections = 0;
  const waits = [];
  const receipt = await waitForExactCartServerReceipt({
    inspect: async () => {
      inspections += 1;
      if (inspections === 1) throw new Error('not settled');
      return {
        status: 'isolated-rental-cart-single-intent-server-confirmed',
        exactIntentCount: 1,
        reservationCreated: false,
        fixtureRentalRequests: 0,
      };
    },
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(receipt.exactIntentCount, 1);
  assert.equal(inspections, 2);
  assert.deepEqual(waits, [cartServerReceiptProbe.intervalMs]);
  assert.ok(
    cartServerReceiptProbe.intervalMs * cartServerReceiptProbe.attempts >= 26000,
  );
});

test('physical cart acceptance rejects a structurally incomplete server receipt', async () => {
  await assert.rejects(
    () => waitForExactCartServerReceipt({
      inspect: async () => ({
        status: 'isolated-rental-cart-single-intent-server-confirmed',
        exactIntentCount: 1,
        reservationCreated: true,
        fixtureRentalRequests: 0,
      }),
      wait: async () => {},
      attempts: 1,
    }),
    /exact non-reserving cart server receipt did not settle/u,
  );
});

test('classifies selected-intent failure states without private values', () => {
  const title = 'Private fixture title';
  const detail = `<node text="${title}"/><node text="Heilbronn, Deutschland"/>`
    + '<node text="Verfügbarkeit prüfen"/>';
  const selectedDetail = `<node text="${title}"/>`
    + '<node text="Heilbronn, Deutschland"/><node text="07.09.2026"/>';
  assert.equal(
    selectedIntentSurfaceState(`${selectedDetail}<node text="In den Mietkorb"/>`, title),
    'ready',
  );
  assert.equal(
    selectedIntentSurfaceState('<node text="Zeitraum nicht verfügbar"/>', title),
    'server-reported-unavailable',
  );
  assert.equal(
    selectedIntentSurfaceState(
      '<node text="Verfügbarkeit prüfen"/><node text="Zeitraum"/>'
        + '<node text="Weiter"/><node class="android.widget.ProgressBar"/>',
      title,
    ),
    'availability-check-running',
  );
  assert.equal(
    selectedIntentSurfaceState(`${detail}`, title),
    'exact-detail-without-cart-action',
  );
  assert.equal(selectedIntentSurfaceState('<node text="other"/>', title), 'unknown');
  const ready = `${selectedDetail}<node text="In den Mietkorb"/>`;
  assert.equal(selectedIntentDetailSettled(ready, title), true);
  assert.equal(
    selectedIntentDetailSettled(
      `${ready}<node text="Im Mietkorb – noch nicht reserviert"/>`,
      title,
    ),
    false,
  );
});

function passingOperations(calls) {
  return {
    prepare: async () => {
      calls.push('prepare');
      return { vaultFile: '/private/accounts.json' };
    },
    activate: async () => {
      calls.push('activate');
      return { status: 'isolated-product-journey-fixture-active' };
    },
    captureBaseline: async () => {
      calls.push('capture-baseline');
      return { status: 'isolated-rental-cart-baseline-captured' };
    },
    addTwice: async () => {
      calls.push('add-twice');
      return { status: 'pixel-renter-identical-cart-intent-submitted-twice' };
    },
    inspectSingleIntent: async () => {
      calls.push('inspect-single');
      return { status: 'isolated-rental-cart-single-intent-server-confirmed' };
    },
    verifyCart: async () => {
      calls.push('verify-cart');
      return { status: 'pixel-renter-cart-intent-present-stably' };
    },
    createAndAssignProject: async () => {
      calls.push('create-assign');
      return { status: 'pixel-renter-project-created-and-assigned' };
    },
    inspectProjectAssignment: async () => {
      calls.push('inspect-assignment');
      return { status: 'isolated-rental-cart-project-server-confirmed' };
    },
    verifyRestartPersistence: async () => {
      calls.push('restart');
      return { status: 'pixel-renter-cart-intent-project-assigned-present-stably' };
    },
    verifyOtherPrincipalIsolation: async () => {
      calls.push('owner-isolation');
      return { status: 'pixel-owner-cart-intent-absent-stably' };
    },
    verifyRenterRestored: async () => {
      calls.push('renter-restored');
      return { status: 'pixel-renter-cart-intent-project-assigned-present-stably' };
    },
    removeIntent: async () => {
      calls.push('remove-intent');
      return { status: 'pixel-renter-exact-cart-intent-removed' };
    },
    verifyRemoved: async () => {
      calls.push('verify-removed');
      return { status: 'pixel-renter-cart-intent-absent-stably' };
    },
    cleanupCart: async () => {
      calls.push('cleanup-cart');
      return { status: 'isolated-rental-cart-baseline-restored' };
    },
    retire: async () => {
      calls.push('retire');
      return { status: 'email-verified-two-role-product-journey-retired' };
    },
    restoreOwner: async () => {
      calls.push('restore-owner');
      return true;
    },
  };
}

test('closes duplicate intent, project, persistence, isolation, and cleanup', async () => {
  const calls = [];
  const result = await runAndroidRentalCartProjectLifecycle({
    candidate,
    deviceSummary: { model: 'Pixel 7 Pro', physical: true },
    operations: passingOperations(calls),
    capturedAt: '2026-09-05T22:00:00.000Z',
  });
  assert.equal(result.status, 'passed-pixel-rental-cart-project-lifecycle');
  assert.equal(
    result.tests.exactIntentSubmittedTwice,
    'passed-two-physical-submissions-two-exact-server-confirmations',
  );
  assert.equal(
    result.tests.transientAcknowledgementContract,
    'passed-widget-regression-device-proof-independent-of-toast-timing',
  );
  assert.equal(result.tests.exactServerIntentCount, 1);
  assert.equal(result.tests.unrelatedCartBaselineRestored, true);
  assert.equal(result.boundaries.rentalRequestCreated, false);
  assert.equal(result.boundaries.reservationCreated, false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
  assert.deepEqual(calls, [
    'prepare',
    'activate',
    'capture-baseline',
    'add-twice',
    'inspect-single',
    'verify-cart',
    'create-assign',
    'inspect-assignment',
    'restart',
    'owner-isolation',
    'renter-restored',
    'remove-intent',
    'verify-removed',
    'cleanup-cart',
    'retire',
    'restore-owner',
  ]);
});

test('restores cart, retires listing, and restores owner after a physical failure', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.verifyOtherPrincipalIsolation = async () => {
    calls.push('owner-isolation');
    throw new Error('Owner cart isolation did not settle safely.');
  };
  await assert.rejects(
    () => runAndroidRentalCartProjectLifecycle({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations,
    }),
    /did not settle safely/u,
  );
  assert.deepEqual(calls.slice(-3), ['cleanup-cart', 'retire', 'restore-owner']);
});
