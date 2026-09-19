import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const config = readFileSync('backend/src/listing_ai_gateway_config.js', 'utf8');
const attempt = readFileSync('backend/src/listing_ai_attempt_workflow.js', 'utf8');
const workflow = readFileSync('backend/src/blue_ocean_listing_workflow.js', 'utf8');
const provider = readFileSync('backend/src/openai_listing_ai_provider.js', 'utf8');
const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const mutation = readFileSync('lib/services/listing_mutation_service.dart', 'utf8');
const screen = readFileSync('lib/screens/create_listing_screen.dart', 'utf8');

test('capability endpoint is authenticated, private and exact server disclosure source', () => {
  assert.match(
    app,
    /app\.get\('\/v1\/blue-ocean\/listing-drafts\/capabilities', requireAuth, requireActiveAccount/u,
  );
  assert.match(app, /Cache-Control', 'private, no-store'\)\.json\(\s*listingAiCapability/u);
  assert.match(config, /disclosureVersion/u);
  assert.match(config, /disclosureText/u);
  assert.match(config, /disclosureHash/u);
  assert.match(config, /policyRevision/u);
  assert.match(config, /supportedClientVersion/u);
  assert.match(config, /listingAiImageLimit/u);
});

test('stale capability is rejected before image load, attempt reservation or provider egress', () => {
  const analyze = app.slice(
    app.indexOf("app.post('/v1/blue-ocean/listing-drafts/analyze'"),
    app.indexOf("app.post('/v1/blue-ocean/listing-drafts/:id/review'"),
  );
  assert.match(analyze, /assertBlueOceanListingCapabilityHandshake\(/u);
  assert.match(app, /listing_ai_capability_stale/u);
  assert.ok(
    analyze.indexOf('assertBlueOceanListingCapabilityHandshake')
      < analyze.indexOf('loadBlueOceanListingImages'),
  );
  assert.match(analyze, /capabilityHandshake: capability/u);
  assert.match(attempt, /capabilityHandshake/u);
  assert.match(provider, /store: false/u);
});

test('on-device execution is selected only by the server capability mode', () => {
  assert.match(workflow, /configuration\.provider !== 'on_device'/u);
  assert.match(screen, /capability\.mode == 'on_device'/u);
  assert.match(screen, /onDeviceAnalysis = capability\.mode == 'on_device'/u);
  assert.doesNotMatch(screen, /onDeviceAnalysis = await _onDeviceListingAnalysis/u);
});

test('client capability fetch and analyze use the captured principal and full handshake', () => {
  assert.match(repository, /getBlueOceanListingCapabilitiesForOwner/u);
  assert.match(repository, /capabilityHandshake/u);
  assert.match(mutation, /loadBlueOceanListingCapability/u);
  assert.match(mutation, /_runOwnedDraftAction/u);
  assert.match(mutation, /crypto\.sha256\.convert\(utf8\.encode\(disclosureText\)\)/u);
  assert.match(screen, /_blueOceanCapability = capability/u);
  assert.match(screen, /!await _listingMutationService\.isContextCurrent\(listingContext\)/u);
  assert.match(screen, /failure\.code == 'listing_ai_capability_stale'/u);
  assert.match(screen, /await _listingMutationService\.isContextCurrent\(owner\.context\)/u);
  assert.match(screen, /_listingActions\.invalidate\(\)/u);
  assert.match(screen, /Nur 1–\$\{capability!\.imageLimit\} ausgewählte Fotos/u);
  assert.doesNotMatch(screen, /_startBlueOceanAssistant\(\);[\s\S]*listing_ai_capability_stale/u);
});
