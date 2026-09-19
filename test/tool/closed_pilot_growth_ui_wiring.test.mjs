import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('closed-pilot G4 client is server-canonical, owner-bound and non-reserving', async () => {
  const [app, core, repository, gateway, screen, rentalCart] = await Promise.all([
    source('backend/src/app.js'),
    source('backend/src/planner_core.js'),
    source('lib/services/backend_repository.dart'),
    source('lib/services/planner_gateway.dart'),
    source('lib/screens/closed_pilot_planner_screen.dart'),
    source('lib/screens/wishlists_screen.dart'),
  ]);

  assert.match(app, /app\.get\('\/v1\/planner\/templates'/u);
  assert.match(app, /assertPlannerInventoryTechnicalAccess\(config\)/u);
  assert.match(core, /plannerTemplateCatalog/u);
  for (const method of [
    'getPlannerTemplateCatalogForOwner',
    'resolvePlannerForOwner',
    'addPlannerProjectToCartForOwner',
  ]) {
    assert.ok(repository.includes(method), `missing ${method}`);
  }
  assert.match(gateway, /PlannerResolution\.fromJson/u);
  assert.match(gateway, /PlannerCartReceipt\.fromJson/u);
  assert.match(screen, /isContextCurrent/u);
  assert.match(screen, /inventorySnapshotHash/u);
  assert.match(screen, /Ergebnis der Mietkorb-.bernahme ist nicht sicher best.tigt/u);
  assert.match(screen, /keine Reservierung/u);
  assert.match(rentalCart, /ClosedPilotPlannerScreen/u);
});
