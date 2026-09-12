import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync('lib/screens/create_listing_screen.dart', 'utf8');
const config = readFileSync('lib/config/private_pilot_config.dart', 'utf8');
const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const dataService = readFileSync('lib/services/data_service.dart', 'utf8');
const mutationService = readFileSync(
  'lib/services/listing_mutation_service.dart',
  'utf8',
);
const app = readFileSync('backend/src/app.js', 'utf8');
const store = readFileSync('backend/src/blue_ocean_listing_store.js', 'utf8');

test('Flutter gate is default-off while the complete manual editor remains present', () => {
  assert.match(config, /SIT_BLUE_OCEAN_LISTING_ASSISTANT/u);
  assert.match(config, /defaultValue:\s*false/u);
  assert.match(screen, /PrivatePilotConfig\.blueOceanListingAssistantEnabled/u);
  assert.match(screen, /Für später speichern/u);
  assert.match(screen, /Der manuelle Editor bleibt vollständig verfügbar/u);
});

test('UI requires exact disclosure, opt-in, explicit initiation and never promises auto-publication', () => {
  assert.match(screen, /listing-ai-on-device-disclosure-v1/u);
  assert.match(screen, /SIT wertet deine ausgewählten Bilder direkt/u);
  assert.match(screen, /Android-Gerät/u);
  assert.match(screen, /ML Kit sendet Bildinhalte und Erkennungsergebnisse nicht/u);
  assert.match(screen, /_blueOceanConsentAccepted/u);
  assert.match(screen, /Ausgewählte Fotos analysieren/u);
  assert.match(screen, /Es wird nichts automatisch veröffentlicht/u);
});

test('UI exposes progress, editable fields, confidence text and at most three clarifications', () => {
  assert.match(screen, /LinearProgressIndicator/u);
  assert.match(screen, /liveRegion:\s*true/u);
  assert.match(screen, /Bearbeitbarer KI-Entwurf/u);
  assert.match(screen, /hoch – bearbeitbar/u);
  assert.match(screen, /bitte prüfen/u);
  assert.match(screen, /Angabe fehlt/u);
  assert.match(screen, /Rückfragen \(höchstens drei\)/u);
  for (const label of [
    'Marke', 'Modell', 'Zubehör', 'Projekt-Tags', 'Einsatzmöglichkeiten',
    'Sicherheits- und Nutzungshinweise', 'Grobe Abholregion',
  ]) {
    assert.match(screen, new RegExp(label, 'u'));
  }
});

test('all eleven owner confirmations and hard functionality/final gates are visible', () => {
  for (const id of [
    'ownership', 'item_identity', 'allowed_category', 'functionality',
    'condition', 'accessories', 'owner_price', 'duration_discounts',
    'availability', 'pickup_region', 'final_publication',
  ]) {
    assert.match(screen, new RegExp(`'${id}': false`, 'u'));
  }
  assert.match(screen, /Funktionalität.*abschließende Publikationsprüfung/su);
  assert.match(screen, /READY_TO_PUBLISH/u);
  assert.match(screen, /NEEDS_REVIEW/u);
});

test('regional price, duration and V5.2 fee preview stay editable and simulation-only', () => {
  assert.match(screen, /Unverbindliche SIT-Preisempfehlung/u);
  assert.match(screen, /Du entscheidest über deinen Mietpreis/u);
  assert.match(screen, /Mietdauer- und V5\.2-Gebührenvorschau/u);
  assert.match(screen, /Vermieter-Miete/u);
  assert.match(screen, /SIT-Beitrag/u);
  assert.match(screen, /Mieter gesamt/u);
  assert.match(screen, /Reine Simulation ohne Zahlung/u);
});

test('missing exact price rules use an explicit owner-only price path', () => {
  assert.match(screen, /owner_manual_no_recommendation/u);
  assert.match(screen, /Tagespreis selbst festlegen/u);
  assert.match(screen, /keine SIT-Preisempfehlung/u);
  assert.match(
    store,
    /if \(review\.recommendation != null\) \{[\s\S]*INSERT INTO regional_price_engine_snapshots/u,
  );
  assert.match(store, /priceInputSha256: review\.priceInputSha256/u);
});

test('every automatic or manual daily-price change invalidates owner confirmation and final review', () => {
  const invalidations = screen.match(
    /confirmations:\s*const <String>\['owner_price'\]/gu,
  ) ?? [];
  assert.ok(invalidations.length >= 4);
  assert.match(
    screen,
    /recommendedDailyMinor[\s\S]*_priceCtrl\.text =[\s\S]*_invalidateBlueOceanReviewState\([\s\S]*'owner_price'/u,
  );
  assert.match(
    screen,
    /_PricePerDayInput\([\s\S]*onChanged:[\s\S]*_invalidateBlueOceanReviewState\([\s\S]*'owner_price'/u,
  );
});

test('dependent edits invalidate stale confirmations, clarifications and READY state', () => {
  assert.match(
    screen,
    /void _invalidateBlueOceanReviewState\([\s\S]*_blueOceanConfirmations\['final_publication'\] = false;[\s\S]*_blueOceanReadyFingerprint = null;/u,
  );
  assert.match(screen, /if \(clearClarifications\) _blueOceanAnsweredQuestions\.clear\(\);/u);
  assert.match(screen, /if \(resetReplacementBand\)[\s\S]*_blueOceanReplacementBandConfirmed = false;/u);

  for (const id of [
    'item_identity', 'allowed_category', 'condition', 'accessories',
    'owner_price', 'duration_discounts', 'pickup_region',
  ]) {
    const uses = screen.match(new RegExp(`confirmations:[\\s\\S]{0,100}'${id}'`, 'gu')) ?? [];
    assert.ok(uses.length >= 1, `${id} must be invalidated by a dependent edit`);
  }

  assert.match(
    screen,
    /if \(entry\.key != 'final_publication'\)[\s\S]*_blueOceanConfirmations\['final_publication'\] = false;/u,
  );
});

test('publication is bound to the exact fully reviewed editable snapshot', () => {
  assert.match(screen, /String _blueOceanEditableFingerprint\(\)/u);
  for (const field of [
    'title', 'description', 'category', 'subcategory', 'brand', 'model',
    'condition', 'accessories', 'replacementValueBand', 'pickupRegion',
    'handoverAddress', 'ownerDailyPrice', 'durationPricing',
    'answeredClarifications', 'ownerConfirmations', 'photoUrls',
  ]) {
    assert.match(screen, new RegExp(`'${field}'`, 'u'));
  }
  assert.match(
    screen,
    /readiness is Map && readiness\['readyToPublish'\] == true[\s\S]*_blueOceanReadyFingerprint = _blueOceanEditableFingerprint\(\)/u,
  );
  assert.match(
    screen,
    /_blueOceanReadyFingerprint == null \|\|[\s\S]*_blueOceanReadyFingerprint != _blueOceanEditableFingerprint\(\)/u,
  );
  assert.match(
    screen,
    /final exactCurrentStateIsReady = readiness is Map &&[\s\S]*_blueOceanReadyFingerprint == _blueOceanEditableFingerprint\(\)/u,
  );
  assert.match(screen, /color: exactCurrentStateIsReady/u);
  assert.match(screen, /Icon\(exactCurrentStateIsReady/u);
  assert.match(screen, /Der Anzeigeninhalt wurde nach der letzten vollständigen/u);
});

test('client and server use separate authenticated review and exact publication actions', () => {
  assert.match(repository, /\/blue-ocean\/listing-drafts\/analyze/u);
  assert.match(repository, /\/blue-ocean\/listing-drafts\/\$\{Uri\.encodeComponent\(draftId\)\}\/review/u);
  assert.match(repository, /explicitAction': 'Anzeige veröffentlichen'/u);
  assert.match(dataService, /blueOceanDraftId != null && blueOceanReview != null/u);
  assert.match(dataService, /BackendRepository\.createListingForOwner/u);
  assert.match(app, /assertBlueOceanListingTechnicalAccess\(\)/u);
  assert.match(app, /requireAuth, requireActiveAccount, requireUnsuspendedScope\('listing'\)/u);
  assert.match(app, /req\.body\?\.explicitAction !== 'Anzeige veröffentlichen'/u);
  assert.match(app, /blue_ocean\.listing\.published_by_owner/u);
  assert.match(app, /autoPublishAllowed: false/u);
  assert.match(
    screen,
    /reviewBlueOceanDraft\([\s\S]*_blueOceanReviewPayload\(finalPublication: true\)/u,
  );
  assert.doesNotMatch(
    screen,
    /reviewBlueOceanDraft\([\s\S]*_blueOceanReviewPayload\(finalPublication: false\)/u,
  );
  assert.match(
    mutationService,
    /reviewBlueOceanListingDraftForOwner\([\s\S]*owner: context\.owner\.authOwner/u,
  );
});

test('accessibility and recovery do not rely on color alone', () => {
  assert.match(screen, /Semantics\(/u);
  assert.match(screen, /selected: selected/u);
  assert.match(screen, /Icons\.check_circle_outline/u);
  assert.match(screen, /Icons\.rate_review_outlined/u);
  assert.match(screen, /Icons\.help_outline/u);
  assert.match(screen, /Scrollable\.ensureVisible/u);
  assert.match(screen, /_blueOceanErrorFocus\.requestFocus/u);
});
