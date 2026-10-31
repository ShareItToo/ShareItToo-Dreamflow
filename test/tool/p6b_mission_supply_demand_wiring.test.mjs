import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('P6-B remains private, additive, principal-bound and nested', () => {
  const mission = read('lib/screens/mission_needs_screen.dart');
  const inventory = read('lib/screens/mission_inventory_resolution_screen.dart');
  const screen = read('lib/screens/mission_supply_demand_screen.dart');
  const model = read('lib/models/mission_supply_demand.dart');
  const gateway = read('lib/services/mission_supply_demand_gateway.dart');
  const repository = read('lib/services/backend_repository.dart');
  const config = read('lib/config/planner_technical_config.dart');

  assert.match(mission, /mission-open-supply-demands/u);
  assert.match(mission, /PlannerTechnicalConfig\.demandAvailable/u);
  assert.match(mission, /_ownedRoutes\.pushOwnedRoute/u);
  assert.match(inventory, /mission-inventory-demand-/u);
  assert.match(inventory, /MissionInventoryApplicability\.current/u);
  assert.match(inventory, /PlannerTechnicalConfig\.demandAvailable/u);
  assert.match(inventory, /_ownedRoutes\.pushOwnedRoute/u);
  assert.match(screen, /SharedPersistenceSync\.accountSecurityStateKey/u);
  assert.match(screen, /await _mayUpdate\(context, generation\)/u);
  assert.match(screen, /PlannerTechnicalConfig\.demandAvailable/u);
  assert.match(screen, /Map<String, String> _pendingKeys/u);
  assert.match(screen, /_pendingKeys\.remove\(fingerprint\)/u);
  assert.match(screen, /Ablauf ausdrücklich wählen/u);
  assert.match(model, /MissionSupplyDemandRole\.recipient/u);
  assert.match(model, /_effectKeys\.any\(\(key\) => value\[key\] != false\)/u);
  assert.match(gateway, /await _requireCurrent\(owner\);[\s\S]*?await BackendRepository/u);
  assert.match(gateway, /await BackendRepository[\s\S]*?await _requireCurrent\(owner\);/u);
  assert.match(config, /SIT_PLANNER_DEMAND_UI_ENABLED/u);
  assert.match(config, /defaultValue: false/u);

  for (const buildScript of [
    'scripts/build_android_local_qa_candidate.sh',
    'scripts/build_android_remote_qa_candidate.sh',
    'scripts/build_android_release_candidate.sh',
  ]) {
    assert.doesNotMatch(
      read(buildScript),
      /SIT_PLANNER_DEMAND_UI_ENABLED=true/u,
      `${buildScript} must not activate P6-B`,
    );
  }

  for (const route of [
    '/mission-supply-demands',
    '/mission-inventory-resolutions/',
    '/supply-demands',
    '/respond',
    '/revoke',
  ]) assert.match(repository, new RegExp(route, 'u'));

  for (const forbidden of [
    "'/listings'", "'/search'", "'/bookings'", "'/payments'",
    'image_picker', 'notification', 'analytics', 'SharedPreferences',
  ]) {
    assert.doesNotMatch(
      `${screen}\n${gateway}`,
      new RegExp(forbidden, 'u'),
      `P6-B must not gain ${forbidden}`,
    );
  }
});

test('P6-B enabled owner HTTP proof is mandatory in the standard runner', () => {
  const runner = read('scripts/technical_regression_check.sh');
  const command = [
    'flutter test --no-pub --test-randomize-ordering-seed=7 \\',
    '  --dart-define=SIT_BACKEND_ENABLED=true \\',
    '  --dart-define=SIT_API_BASE_URL=http://127.0.0.1:1/api/v1 \\',
    '  test/mission_supply_demand_gateway_http_test.dart',
  ].join('\n');
  assert.equal(runner.split(command).length - 1, 1);
});
