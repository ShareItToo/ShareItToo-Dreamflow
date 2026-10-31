import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const handoff = JSON.parse(read(
  'store/google-play/on-device-listing-ai-data-safety-handoff.json',
));
const gradle = read('android/app/build.gradle');
const pipeline = read('backend/src/listing_ai_image_pipeline.js');

test('on-device Listing-AI handoff binds bundled models and truthful transmission', () => {
  assert.equal(handoff.kind, 'sit-on-device-listing-ai-data-safety-handoff');
  assert.equal(handoff.status, 'prepared-console-unchanged');
  assert.equal(handoff.provider.executionLocation, 'android_on_device');
  assert.equal(handoff.provider.modelDelivery, 'bundled');
  assert.equal(handoff.provider.inputOrOutputSentToGoogle, false);
  assert.equal(handoff.provider.externalImageAiProviderEnabled, false);
  assert.equal(handoff.provider.apiBillingRequired, false);
  assert.equal(handoff.sitTransmission.selectedListingPhotosSentToSit, true);
  assert.equal(handoff.sitTransmission.normalizedLabelsAndRecognizedTextSentToSit, true);
  assert.equal(handoff.sitTransmission.automaticPublicationAllowed, false);
  assert.equal(handoff.sitTransmission.ownerReviewRequired, true);
  assert.equal(handoff.playConsole.changed, false);
  assert.equal(
    handoff.playConsole.requiredBeforeAnyCandidateContainingMlKitIsUploaded,
    true,
  );
});

test('declared libraries and exact feature disclosure cannot drift silently', () => {
  for (const library of handoff.provider.libraries) {
    assert.ok(gradle.includes(library), library);
  }
  for (const marker of [
    'Erkannte Objektbegriffe und Texte sowie die ausgewählten Anzeigenfotos werden an SIT übertragen',
    'ML Kit sendet Bildinhalte und Erkennungsergebnisse nicht an Google',
    'Es wird nichts automatisch veröffentlicht',
  ]) assert.ok(pipeline.includes(marker), marker);
  assert.deepEqual(handoff.googleSdkTechnicalData.purposes, [
    'diagnostics',
    'usage_analytics',
  ]);
  assert.equal(handoff.googleSdkTechnicalData.types.length, 9);
  assert.ok(handoff.sources.every((source) => source.startsWith(
    'https://developers.google.com/ml-kit/',
  )));
});
