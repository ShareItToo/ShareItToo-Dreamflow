import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync('lib/screens/create_listing_screen.dart', 'utf8');
const analysisService = readFileSync(
  'lib/services/on_device_listing_analysis_service.dart',
  'utf8',
);
const config = readFileSync('lib/config/private_pilot_config.dart', 'utf8');
const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const dataService = readFileSync('lib/services/data_service.dart', 'utf8');
const mutationService = readFileSync(
  'lib/services/listing_mutation_service.dart',
  'utf8',
);
const item = readFileSync('lib/models/item.dart', 'utf8');
const app = readFileSync('backend/src/app.js', 'utf8');
const store = readFileSync('backend/src/blue_ocean_listing_store.js', 'utf8');

test('Flutter gate is default-off while the complete manual editor remains present', () => {
  assert.match(config, /SIT_BLUE_OCEAN_LISTING_ASSISTANT/u);
  assert.match(config, /defaultValue:\s*false/u);
  assert.match(screen, /PrivatePilotConfig\.blueOceanListingAssistantEnabled/u);
  assert.match(screen, /Entwurf speichern/u);
  assert.match(screen, /Der manuelle Editor bleibt vollständig verfügbar/u);
});

test('UI requires exact disclosure, opt-in, explicit initiation and never promises auto-publication', () => {
  assert.match(screen, /loadBlueOceanListingCapability/u);
  assert.match(screen, /capability\.disclosureVersion/u);
  assert.match(screen, /capability\.disclosureText/u);
  assert.match(screen, /capability\.handshake/u);
  assert.match(screen, /_blueOceanConsentAccepted/u);
  assert.match(screen, /Ausgewählte Fotos analysieren/u);
  assert.match(screen, /capability\?\.disclosureText/u);
});

test('on-device suggestions require an explicit takeover before publication', () => {
  const assistantStart = screen.indexOf('Future<void> _startBlueOceanAssistant()');
  const readyStart = screen.indexOf(
    "if (assistant['status'] == 'draft_ready')",
    assistantStart,
  );
  const readyBranch = screen.slice(readyStart, screen.indexOf('} else {', readyStart));
  assert.match(assistantStart >= 0 ? screen.slice(assistantStart) : '', /_onDeviceListingAnalysis\.analyzeImagePaths/u);
  assert.match(assistantStart >= 0 ? screen.slice(assistantStart) : '', /onDeviceAnalysis: onDeviceAnalysis/u);
  assert.match(readyBranch, /_setBlueOceanSuggestionsAccepted\(false\)/u);
  assert.doesNotMatch(readyBranch, /_applyBlueOceanDraft\(assistant\)/u);
  assert.match(screen, /void _acceptBlueOceanSuggestions\(\)/u);
  assert.match(
    screen,
    /_applyBlueOceanDraft\(assistant\);[\s\S]*_blueOceanTakeover =\s*_blueOceanTakeover\.accept/u,
  );
  assert.match(screen, /label: const Text\('Vorschläge übernehmen'\)/u);
  assert.match(
    screen,
    /if \(!_blueOceanSuggestionsAccepted\)[\s\S]*Die KI-Vorschläge werden erst/u,
  );
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

test('one-image timeout fails closed into a manual fallback without losing inputs', () => {
  assert.match(
    analysisService,
    /timeoutForImageCount\(int imageCount\)[\s\S]*?Duration\(seconds: imageCount \* 30 \+ 10\)/u,
  );
  assert.match(
    analysisService,
    /onTimeout:\s*\(\) => throw const OnDeviceListingAnalysisException\([\s\S]*?on_device_listing_analysis_timeout/u,
  );
  const assistantStart = screen.slice(
    screen.indexOf('Future<void> _startBlueOceanAssistant()'),
    screen.indexOf('List<String> _commaSeparated', screen.indexOf('Future<void> _startBlueOceanAssistant()')),
  );
  assert.match(assistantStart, /on OnDeviceListingAnalysisException catch \(failure\)/u);
  const timeoutCatch = assistantStart.slice(
    assistantStart.indexOf('on OnDeviceListingAnalysisException catch (failure)'),
    assistantStart.indexOf('on ListingMutationFailure catch (failure)'),
  );
  assert.doesNotMatch(timeoutCatch, /uploadImage|analyzeBlueOceanDraft|_startBlueOceanAssistant|_submit/u);
  assert.doesNotMatch(timeoutCatch, /_pickedImages\s*=|_blueOceanPhotoUrls\s*=|_blueOceanAssistant\s*=/u);
  assert.match(assistantStart, /Fotos und Eingaben bleiben erhalten; arbeite manuell weiter/u);
  assert.match(assistantStart, /_blueOceanProgress = 'Manueller Fallback aktiv\.'/u);
  assert.match(assistantStart, /finally \{[\s\S]*_blueOceanBusy = false\);/u);
  assert.doesNotMatch(assistantStart, /_submit\s*\(/u);
  assert.doesNotMatch(assistantStart, /OpenAI/u);
  assert.match(screen, /_submitBusy \|\| _blueOceanBusy \? null : _submit/u);
});

test('one visible owner confirmation maps to the ten factual IDs while final publication stays internal', () => {
  for (const id of [
    'ownership', 'item_identity', 'allowed_category', 'functionality',
    'condition', 'accessories', 'owner_price', 'duration_discounts',
    'availability', 'pickup_region',
  ]) {
    assert.match(screen, new RegExp(`'${id}': false`, 'u'));
  }
  assert.match(screen, /_blueOceanFactualConfirmationIds/u);
  assert.match(
    screen,
    /Ich habe alle generierten Inseratsdaten \(Artikel, Zustand, Preis, Verfügbarkeit etc\.\) geprüft und bestätige deren Richtigkeit sowie meine Berechtigung zur Vermietung\./u,
  );
  assert.match(screen, /_blueOceanOwnerTruthConfirmed/u);
  assert.match(screen, /_setBlueOceanOwnerTruthConfirmed/u);
  assert.match(screen, /'final_publication': false/u);
  assert.doesNotMatch(
    screen,
    /title: Text\([^\n]*vollständige Vorschau geprüft und möchte veröffentlichen/u,
  );
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
    /for \(final id in _blueOceanFactualConfirmationIds\)[\s\S]*_blueOceanConfirmations\[id\] = confirmed;/u,
  );
  assert.match(
    screen,
    /_blueOceanConfirmations\['final_publication'\] = false;/u,
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
    /readiness is Map && readiness\['previewReady'\] == true[\s\S]*_blueOceanReadyFingerprint = _blueOceanEditableFingerprint\(\)/u,
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
    /reviewBlueOceanDraft\([\s\S]*_blueOceanReviewPayload\(finalPublication: false\)/u,
  );
  assert.match(
    screen,
    /blueOceanReview: blueOceanPublication[\s\S]*_blueOceanReviewPayload\(finalPublication: true\)/u,
  );
  assert.match(screen, /final_publication.*finalPublication/u);
  assert.match(
    app,
    /app\.post\('\/v1\/blue-ocean\/listing-drafts\/:id\/review'[\s\S]*final_publication === true[\s\S]*blue_ocean_explicit_publication_required/u,
  );
  assert.match(
    mutationService,
    /reviewBlueOceanListingDraftForOwner\([\s\S]*owner: context\.owner\.authOwner/u,
  );
});

test('publish action carries the versioned image-truth policy without a new checkbox', () => {
  assert.match(config, /listingPhotoTruthPolicyVersion/u);
  assert.match(config, /listingPhotoTruthPolicyAttestation/u);
  assert.match(screen, /listingPhotoTruthPolicyAttestation/u);
  assert.match(screen, /Bei Zweifeln kann die Anzeige geprüft oder entfernt werden/u);
  assert.match(item, /PrivatePilotConfig\.listingPhotoTruthPolicyVersion/u);
  assert.match(item, /PrivatePilotConfig\.listingPhotoTruthPolicyAttestation/u);
  assert.match(item, /photoTruthClassifications[\s\S]*unknown/u);
  assert.match(app, /assertListingPhotoTruthPolicy\([\s\S]*requireAttestation: true/u);
  assert.doesNotMatch(screen, /KI-generierte oder materiell veränderte Bilder.*Checkbox/u);
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
