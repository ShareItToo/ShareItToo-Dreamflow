import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSyntheticCloneBookingLane } from '../../backend/src/synthetic_clone_booking_lane.js';
import { runSyntheticPaymentUiFlow, validatePaymentUiReadback, paymentNotice } from '../../tool/synthetic_payment_ui_flow.mjs';

const runId = 'wp255-20260929120000-aabbccdd';
const ownerId = '00000000-0000-4000-8000-000000000011';
const renterId = '00000000-0000-4000-8000-000000000012';

const paymentProfileDefines = [
  '--dart-define=SIT_BACKEND_ENABLED=true',
  '--dart-define=SIT_API_BASE_URL=http://127.0.0.1:18080/api/v1',
  '--dart-define=SIT_RELEASE_CHANNEL=internal',
  '--dart-define=SIT_BUNDLE_ID=com.shareittoo.app.qa',
  '--dart-define=SIT_SYNTHETIC_CLONE_BOOKING_LANE=true',
  '--dart-define=SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE=true',
];

function assertMandatoryPaymentProfile(script) {
  const commands = script.replace(/\\\r?\n[ \t]*/gu, ' ').split(/\r?\n/u)
    .filter((line) => /^flutter test\b/u.test(line) && line.includes('test/synthetic_payment_test.dart'));
  assert.equal(commands.length, 1, 'exactly one standalone enabled payment-profile invocation is mandatory');
  assert.deepEqual(commands[0].trim().split(/\s+/u), [
    'flutter', 'test', '--reporter', 'expanded', ...paymentProfileDefines,
    'test/synthetic_payment_test.dart',
  ], 'payment UI regression must execute the exact complete local-QA envelope');
}

test('technical regression permanently executes the complete enabled payment profile', () => {
  const script = readFileSync('scripts/technical_regression_check.sh', 'utf8');
  assertMandatoryPaymentProfile(script);
  for (const define of paymentProfileDefines) {
    // Restrict mutations to this invocation: other regression lanes may share a define.
    const start = script.indexOf('# Exercise the active local-QA payment UI');
    const end = script.indexOf('test/synthetic_payment_test.dart', start);
    const mutate = (replacement) => script.slice(0, start)
      + script.slice(start, end).replace(define, replacement) + script.slice(end);
    assert.throws(() => assertMandatoryPaymentProfile(mutate('')), undefined, `missing ${define}`);
    assert.throws(() => assertMandatoryPaymentProfile(mutate(`${define}-wrong`)), undefined, `changed ${define}`);
    assert.throws(() => assertMandatoryPaymentProfile(mutate(`${define} ${define}`)), undefined, `duplicate ${define}`);
  }
  assert.throws(() => assertMandatoryPaymentProfile(script.replace('test/synthetic_payment_test.dart', 'test/other_test.dart')));
});

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
