import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('P5-B is additive, private, server-authoritative and account bound', () => {
  const mission = read('lib/screens/mission_needs_screen.dart');
  const screen = read('lib/screens/mission_inventory_resolution_screen.dart');
  const model = read('lib/models/mission_inventory_resolution.dart');
  const gateway = read('lib/services/mission_inventory_resolution_gateway.dart');
  const repository = read('lib/services/backend_repository.dart');

  assert.match(mission, /_inventoryRouteOpening/u);
  assert.match(mission, /_ownedRoutes\.capture\(\)/u);
  assert.match(mission, /_ownedRoutes\.pushOwnedRoute/u);
  assert.match(mission, /_ownedRoutes\.invalidate\(\)/u);
  assert.match(screen, /PlannerTechnicalConfig\.available/u);
  assert.match(screen, /SharedPersistenceSync\.accountSecurityStateKey/u);
  assert.match(screen, /_accountGeneration/u);
  assert.match(screen, /await widget\.listingMutationService\.isContextCurrent/u);
  assert.match(screen, /owner-maps-selection-/u);
  assert.match(screen, /exakte Koordinaten nicht gespeichert/u);
  assert.match(screen, /Keine Reservierung, Buchung oder Zahlung/u);
  assert.match(model, /MissionInventoryApplicability\.stale/u);
  assert.match(model, /value\[key\] != false/u);
  assert.match(gateway, /await _requireCurrent\(owner\);[\s\S]*?await BackendRepository/u);
  assert.match(gateway, /await BackendRepository[\s\S]*?await _requireCurrent\(owner\);/u);
  assert.match(gateway, /resolution\.missionNeedId != missionNeedId/u);

  for (const route of [
    '/mission-needs/',
    '/inventory-resolutions',
    '/mission-inventory-resolutions/',
  ]) {
    assert.match(repository, new RegExp(route, 'u'));
  }
  for (const forbidden of [
    "'/listings'",
    "'/search'",
    "'/bookings'",
    "'/payments'",
    'image_picker',
    'listing-ai',
    'latitudeText',
    'longitudeText',
  ]) {
    assert.doesNotMatch(
      `${screen}\n${gateway}`,
      new RegExp(forbidden, 'u'),
      `P5-B must not gain ${forbidden}`,
    );
  }
});

test('P5-B owner HTTP proof is mandatory in the standard regression runner', () => {
  const runner = read('scripts/technical_regression_check.sh');
  const command = [
    'flutter test --no-pub --test-randomize-ordering-seed=7 \\',
    '  --dart-define=SIT_BACKEND_ENABLED=true \\',
    '  --dart-define=SIT_API_BASE_URL=http://127.0.0.1:1/api/v1 \\',
    '  test/mission_inventory_resolution_gateway_http_test.dart',
  ].join('\n');
  assert.equal(runner.split(command).length - 1, 1);
});
