import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const explore = read('lib/screens/explore_screen.dart');
const createListing = read('lib/screens/create_listing_screen.dart');
const repository = read('lib/services/backend_repository.dart');
const dataService = read('lib/services/data_service.dart');
const config = read('lib/config/supply_enrichment_technical_config.dart');

test('optional G5A UI runs only after the success popup and fails open', () => {
  const popup = explore.indexOf('Future<void> _showCreatedPopup');
  const enrichment = explore.indexOf('Future<void> _showSupplyEnrichment');
  assert.ok(popup >= 0 && enrichment > popup);
  assert.match(
    explore,
    /if \(!draft &&[\s\S]*_listingActions\.isCurrent\(_listingMutationService, owner\)[\s\S]*_showSupplyEnrichment\(owner, item\)/u,
  );
  assert.match(explore, /SupplyEnrichmentTechnicalConfig\.available/u);
  assert.match(explore, /catch \(error\)[\s\S]*already-created listing stays/u);
  assert.match(config, /defaultValue: false/u);
  assert.match(config, /signedStageAInternalEnvelope/u);
  assert.match(config, /technicalSurfaceAvailableFor/u);
  assert.match(config, /externalGenerativeAiAllowed = false/u);
});

test('follow-up creation links server-side and prefills no price, description or photos', () => {
  assert.match(repository, /generateListingSupplyEnrichment/u);
  assert.match(repository, /recordListingSupplyEnrichmentOutcome/u);
  assert.match(repository, /'supplyEnrichmentLink': supplyEnrichmentLink/u);
  assert.match(dataService, /supplyEnrichmentLink: supplyEnrichmentLink/u);
  assert.match(createListing, /CreateListingScreen\([\s\S]*this\.supplyPrefill/u);
  assert.match(createListing, /_titleCtrl\.text = prefill\.title/u);
  assert.match(createListing, /_addressCtrl\.text = prefill\.locationText/u);
  assert.doesNotMatch(
    createListing,
    /_priceCtrl\.text = prefill\.|_descCtrl\.text = prefill\.|_pickedImages.*prefill/u,
  );
  assert.match(createListing, /widget\.supplyPrefill\?\.link\.toJson\(\)/u);
});
