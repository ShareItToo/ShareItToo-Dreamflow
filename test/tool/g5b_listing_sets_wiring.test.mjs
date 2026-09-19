import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('G5B routes, client methods and disabled non-release gates stay wired', async () => {
  const [app, config, composeProd, composeStaging, repository, clientConfig,
    ownerScreen, discoveryScreen, myListings, rentalCart] =
      await Promise.all([
    source('backend/src/app.js'),
    source('backend/src/config.js'),
    source('backend/compose.prod.yml'),
    source('backend/compose.staging.yml'),
    source('lib/services/backend_repository.dart'),
    source('lib/config/listing_sets_technical_config.dart'),
    source('lib/screens/closed_pilot_listing_sets_screen.dart'),
    source('lib/screens/closed_pilot_listing_set_discovery_screen.dart'),
    source('lib/screens/my_listings_screen.dart'),
    source('lib/screens/wishlists_screen.dart'),
  ]);

  for (const route of [
    "app.get('/v1/listing-sets/mine'",
    "app.post('/v1/listing-sets'",
    "app.put('/v1/listing-sets/:id'",
    "app.post('/v1/listing-sets/discover'",
    "app.post('/v1/listing-sets/:id/resolve'",
  ]) {
    assert.ok(app.includes(route), `missing route ${route}`);
  }
  assert.match(config, /LISTING_SETS_ENABLED/u);
  assert.match(config, /listing sets cannot be enabled in production/u);
  assert.match(config, /publicReleaseAllowed: false/u);
  assert.match(config, /businessStatusRankingAllowed: false/u);
  assert.match(config, /hiddenPriceManipulationAllowed: false/u);
  assert.match(composeProd, /LISTING_SETS_ENABLED: \$\{LISTING_SETS_ENABLED:-false\}/u);
  assert.match(composeStaging, /LISTING_SETS_ENABLED: \$\{LISTING_SETS_ENABLED:-false\}/u);
  for (const method of [
    'getMyListingSets',
    'createListingSet',
    'reviseListingSet',
    'resolveListingSet',
    'discoverListingSets',
  ]) {
    assert.ok(repository.includes(method), `missing repository method ${method}`);
  }
  for (const ownerMethod of [
    'getMyListingSetsForOwner',
    'createListingSetForOwner',
    'reviseListingSetForOwner',
    'discoverListingSetsForOwner',
  ]) {
    assert.ok(repository.includes(ownerMethod), `missing owner-bound method ${ownerMethod}`);
  }
  assert.match(clientConfig, /defaultValue: false/u);
  assert.match(clientConfig, /signedStageAInternalEnvelope/u);
  assert.match(clientConfig, /technicalSurfaceAvailableFor/u);
  assert.match(clientConfig, /businessStatusRankingAllowed = false/u);
  assert.match(clientConfig, /hiddenPriceManipulationAllowed = false/u);
  assert.match(ownerScreen, /isContextCurrent/u);
  assert.match(ownerScreen, /ListingSetKind\.sitSet/u);
  assert.match(ownerScreen, /nicht sicher best.tigt/u);
  assert.match(discoveryScreen, /isContextCurrent/u);
  assert.match(discoveryScreen, /nicht als leeres Ergebnis behandelt/u);
  assert.match(myListings, /ClosedPilotListingSetsScreen/u);
  assert.match(rentalCart, /ClosedPilotListingSetDiscoveryScreen/u);
});
