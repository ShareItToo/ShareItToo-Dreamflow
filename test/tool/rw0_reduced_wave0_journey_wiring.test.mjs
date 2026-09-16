import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('reduced Wave-0 journey is retained under the exact non-binding profile', () => {
  const regression = read('scripts/technical_regression_check.sh');
  assert.match(regression, /SIT_STAGE_A_NON_BINDING_PILOT=true[\s\\]*\n[\s\S]*SIT_BLUE_OCEAN_LISTING_ASSISTANT=true[\s\\]*\n[\s\S]*reduced_wave0_product_journey_test\.dart/u);
  assert.match(regression, /rw0_reduced_wave0_journey_wiring\.test\.mjs/u);
  assert.match(regression, /validate_rw0_reduced_wave0_product_journey\.mjs/u);

  const journey = read('test/reduced_wave0_product_journey_test.dart');
  assert.doesNotMatch(
    journey,
    /\bpassword\s*:\s*(['"])[^'"\r\n]{8,}\1/iu,
  );
  for (const marker of [
    'Anzeige veröffentlichen',
    'Unter Gemerkt speichern',
    'Projekt anlegen',
    'Im Mietkorb – noch nicht reserviert',
    'Test-Mietanfrage senden',
    'too_expensive',
    "prefs.containsKey('payment_intents')",
    "prefs.containsKey('refunds')",
    "prefs.containsKey('payouts')",
    'handover_return_state_v1',
    'review_reminders_v1',
    'multi_reviews_v1',
  ]) assert.match(journey, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(journey, /pumpWidget\(const SizedBox\.shrink\(\)\)[\s\S]*_JourneyHostController\(const RentalCartScreen\(\)\)/u);
});

test('synthetic auth fixture leaves no current secret-shaped property', () => {
  const baseline = JSON.parse(read('backend/ops/secret_scan_history_baseline.json'));
  assert.ok(baseline.reviewedFindings.some((entry) =>
    entry.rule === 'static_password_property'
      && entry.source === 'c4e4814501a8a8bf541caa8c3c28c71a209de6ba'
      && entry.file === 'test/reduced_wave0_product_journey_test.dart'));
});

test('search save action is named, stateful and at least 48dp', () => {
  const search = read('lib/screens/search_results_screen.dart');
  assert.match(search, /Unter Gemerkt speichern:/u);
  assert.match(search, /Aus Gemerkt entfernen:/u);
  assert.match(search, /toggled: widget\.isFavorite/u);
  assert.match(search, /minWidth: kMinInteractiveDimension/u);
  assert.match(search, /minHeight: kMinInteractiveDimension/u);
});

test('catalog reads cannot replace local account data with demo fixtures', () => {
  const service = read('lib/services/data_service.dart');
  assert.match(service, /Categories are application reference data\. Recreate only that cache/u);
  assert.match(service, /if \(!_allowDemoSeedDataInRuntime\) return const <Item>\[\];/u);
  assert.match(service, /throw const FormatException\('Invalid local listings document'\)/u);
  assert.match(service, /if \(!_allowDemoSeedDataInRuntime\) return const <User>\[\];/u);

  const tests = read('test/data_service_non_destructive_catalog_bootstrap_test.dart');
  assert.match(tests, /missing category cache never rewrites/u);
  assert.match(tests, /intentionally empty listing cache remains empty/u);
  assert.match(tests, /malformed listing cache fails closed/u);
  assert.match(tests, /missing user cache is empty/u);
});

test('local cart has one atomic canonical snapshot and rejects torn legacy state', () => {
  const service = read('lib/services/data_service.dart');
  assert.match(service, /final canonicalProjects = itemDocument\['projects'\]/u);
  assert.match(service, /Mismatched legacy local rental cart revisions/u);
  assert.match(service, /'projects': cart\.projects\.map\(\(project\) => project\.toJson\(\)\)\.toList\(\)/u);

  const tests = read('test/g2b_rental_cart_persistence_test.dart');
  assert.match(tests, /process stop after the atomic canonical write/u);
  assert.match(tests, /legacy split cart revisions fail closed/u);
  assert.match(read('test/g2a_rental_cart_screen_test.dart'), /retryable load error/u);
});

test('project-name controller is owned until its dialog route is disposed', () => {
  const screen = read('lib/screens/wishlists_screen.dart');
  assert.match(screen, /class _CreateWishlistPopupBody extends StatefulWidget/u);
  assert.match(screen, /class _CreateWishlistPopupBodyState extends State<_CreateWishlistPopupBody>/u);
  assert.match(screen, /void dispose\(\) \{\s*_controller\.dispose\(\);\s*super\.dispose\(\);/u);
  assert.doesNotMatch(screen, /final title = await AppPopup\.showCustom<String>[\s\S]{0,500}?controller\.dispose\(\)/u);
});

test('binding stays closed while Stage-A exposes only the acknowledged simulation', () => {
  const checkout = read('lib/screens/private_pilot_checkout_screen.dart');
  const renterBookings = read('lib/screens/bookings_screen.dart');
  const bookingDetail = read('lib/screens/booking_detail_screen.dart');
  const ownerRequests = read('lib/screens/owner_requests_screen.dart');
  const ownerDetail = read('lib/screens/ongoing_owner_detail_screen.dart');
  const bookingStatusCopy = read('lib/utils/booking_status_copy.dart');
  const workflow = read('backend/src/booking_workflow.js');
  assert.match(checkout, /Test-Mietanfrage senden/u);
  assert.match(checkout, /_simulationAcknowledged/u);
  assert.match(checkout, /simulationOnly: simulationOnly/u);
  assert.match(
    workflow,
    /simulationOnly && !\['accepted', 'declined', 'cancelled'\]\.includes\(requested\)[\s\S]*pilot_simulation_transition_forbidden/u,
  );
  assert.match(
    bookingDetail,
    /isUpcoming &&[\s\S]*!_simulationOnly &&[\s\S]*widget\.booking\['needsReview'\]/u,
  );
  assert.match(
    bookingDetail,
    /Übergabe, Rückgabe, Vertrag, Reservierung und Zahlung bleiben in dieser Simulation gesperrt/u,
  );
  assert.match(renterBookings, /'simulationOnly': r\.simulationOnly/u);
  assert.match(
    bookingStatusCopy,
    /booking\?\['simulationOnly'\] == true[\s\S]*return 'Pilot-Simulation'/u,
  );
  assert.match(
    ownerRequests,
    /if \(e\.r\.simulationOnly\)[\s\S]*label = 'Pilot-Simulation'/u,
  );
  assert.match(
    ownerDetail,
    /!req\.simulationOnly &&[\s\S]*category == 'upcoming' \|\| category == 'ongoing'/u,
  );
  for (const path of [
    'lib/config/booking_group_technical_config.dart',
    'lib/config/planner_technical_config.dart',
    'lib/config/supply_enrichment_technical_config.dart',
    'lib/config/listing_sets_technical_config.dart',
  ]) {
    assert.match(read(path), /signedStageAInternalEnvelope/u);
    assert.match(read(path), /technicalSurfaceAvailableFor/u);
    assert.match(read(path), /publicReleaseAllowed/u);
  }
});
