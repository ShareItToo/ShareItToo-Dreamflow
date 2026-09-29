import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSyntheticCloneBookingLane } from '../../backend/src/synthetic_clone_booking_lane.js';
import { runSyntheticPaymentUiFlow, validatePaymentUiReadback, paymentNotice } from '../../tool/synthetic_payment_ui_flow.mjs';

const runId = 'wp255-20260929120000-aabbccdd';
const ownerId = '00000000-0000-4000-8000-000000000011';
const renterId = '00000000-0000-4000-8000-000000000012';
test('runner drives actual adapter contract through UI steps and proves replay, unchanged booking and cleanup', async () => {
  const lane = createSyntheticCloneBookingLane({ enabled: true, deploymentEnvironment: 'test', datasetId: 'wp255-green-clone-ui-test', runId, ownerId, renterId, secret: 'synthetic-only-test-secret-long-enough', paymentTestEnvelope: { requested: '1', cloneEnabled: true, localQa: true, deploymentEnvironment: 'test', bindHost: '127.0.0.1', transport: 'memory', livemode: false } });
  const booking = lane.createBooking({ actorId: renterId, listingId: 'synthetic_clone_listing_wp255' });
  const readBooking = () => lane.getBooking({ actorId: ownerId, bookingId: booking.id });
  const readPayment = () => lane.paymentTest.read({ actorId: ownerId, bookingId: booking.id, requestedRunId: runId });
  let scenario; let last; let counter = 0;
  const phases = new Set();
  const driver = {
    async tapVisibleLabel(label, phase) {
      if (label === 'Lokalen Zahlungstest öffnen') return;
      assert.ok(!phases.has(phase)); phases.add(phase);
      if (label.endsWith('wählen')) { scenario = label.startsWith('Sichere') ? 'decline' : 'challenge_then_capture'; return; }
      const action = { 'Testauswahl speichern': 'select', 'Testzahlung absenden': 'submit', 'Zusätzliche Testbestätigung': 'confirm', 'Testerstattung auslösen': 'refund' }[label];
      const body = action ? { runId, key: `synthetic-ui-contract-${++counter}`, action, ...(action === 'select' ? { method: 'synthetic', scenario } : {}) } : last;
      lane.paymentTest.execute({ actorId: renterId, bookingId: booking.id, body }); last = body;
    },
    async waitForPattern(pattern) {
      assert.ok(pattern.test(paymentNotice) || pattern.test(`Server-Teststatus: ${readPayment().payment.status}`));
    },
    async shell(args) { assert.deepEqual(args, ['input', 'keyevent', 'KEYCODE_BACK']); },
  };
  const result = await runSyntheticPaymentUiFlow({ driver, readBooking, readPayment, runId, bookingId: booking.id });
  assert.equal(result.cloneBookingUnchanged, true);
  assert.equal(result.replayAddedEvents, 0);
  for (const patch of [{ runId: 'wrong' }, { payout: {} }, { audit: [] }, { audit: readPayment().audit.map((entry) => ({ ...entry, monetaryEffectMinor: 1 })) }, { payment: { ...readPayment().payment, livemode: true } }]) {
    assert.throws(() => validatePaymentUiReadback({ before: readBooking(), after: readBooking(), snapshot: { ...readPayment(), ...patch }, runId, bookingId: booking.id }));
  }
  const cleanup = lane.cleanup({ actorId: ownerId });
  assert.equal(cleanup.paymentTest.states, 0); assert.equal(cleanup.paymentTest.commands, 0); assert.equal(cleanup.paymentTest.auditEvents, 0);
});

test('Flutter entry, session ownership, builder and runner contracts remain isolated', () => {
  const read = (path) => readFileSync(path, 'utf8');
  const service = read('lib/services/synthetic_payment_service.dart');
  assert.match(service, /AuthService\.captureSessionOwner\(session\)/u);
  assert.match(service, /isSessionOwnerDefinitelyCurrent\(owner\)/u);
  assert.match(service, /followRedirects = false/u);
  assert.doesNotMatch(service, /refreshAccessToken\(|BackendHttp\.request/u);
  assert.doesNotMatch(service, /accessToken\(\)|createBookingCheckout|url_launcher|stripe/iu);
  assert.match(service, /'\/synthetic-clone\/status'/u);
  const screen = read('lib/screens/synthetic_payment_test_screen.dart');
  assert.doesNotMatch(screen, /TextField|TextFormField|Stripe|BackendRepository/u);
  assert.match(screen, /await _api!\.command\(body\);\s*await _read\(\)/u);
  assert.match(read('lib/screens/synthetic_clone_diagnostic_screen.dart'), /if \(SyntheticPaymentConfig\.enabled/u);
  assert.doesNotMatch(read('lib/screens/payment_checkout_screen.dart'), /SyntheticPayment/u);
  assert.match(read('lib/config/synthetic_payment_config.dart'), /release: kReleaseMode/u);
  assert.match(read('lib/main.dart'), /SyntheticPaymentConfig\.validateCurrentBuild/u);
  assert.match(read('scripts/build_android_local_qa_candidate.sh'), /--dart-define=SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE=true/u);
  assert.match(read('scripts/build_android_release_candidate.sh'), /--dart-define=SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE=false/u);
  const runner = read('tool/run_android_local_qa_synthetic_clone_booking.mjs');
  assert.match(runner, /paymentTest\.ownerReadback = true/u);
  assert.match(runner, /state\.states !== 0 \|\| state\.commands !== 0 \|\| state\.auditEvents !== 0/u);
});
