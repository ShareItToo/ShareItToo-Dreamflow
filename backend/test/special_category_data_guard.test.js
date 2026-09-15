import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectPossibleSpecialCategoryFields,
  detectPossibleSpecialCategoryText,
  normalizeSpecialCategoryHandling,
  specialCategoryDetectionVersion,
  specialCategoryHandlingVersion,
} from '../src/special_category_data_guard.js';

const handling = {
  version: specialCategoryHandlingVersion,
  necessityAcknowledged: true,
  warningShown: true,
  ownerRole: 'trust_safety_owner',
  scope: 'case_bound',
  replicationPolicy: 'no_unrestricted_replication',
};

test('detects possible special-category text without retaining its value', () => {
  const detection = detectPossibleSpecialCategoryFields({
    summary: 'Bitte nur notwendige medizinische Angaben prüfen.',
    ordinary: 'Das Gerät ist laut.',
  });
  assert.deepEqual(detection, {
    classification: 'possible_special_category',
    detectionVersion: specialCategoryDetectionVersion,
    fields: ['summary'],
  });
  assert.equal(detectPossibleSpecialCategoryText('Das Gerät ist laut.'), null);
  assert.doesNotMatch(JSON.stringify(detection), /medizinische/u);
});
test('requires explicit technical warning, necessity and owner binding', () => {
  const detection = detectPossibleSpecialCategoryFields({
    summary: 'Diagnose nur für die konkrete Sicherheitsprüfung.',
  });
  assert.throws(
    () => normalizeSpecialCategoryHandling(null, {
      detection,
      errorFactory: (code, details) => Object.assign(new Error(code), { details }),
    }),
    /special_category_handling_required/u,
  );
  const normalized = normalizeSpecialCategoryHandling(handling, {
    detection,
    errorFactory: (code, details) => Object.assign(new Error(code), { details }),
  });
  assert.deepEqual(normalized, {
    version: specialCategoryHandlingVersion,
    classification: 'possible_special_category',
    necessityAcknowledged: true,
    warningShown: true,
    ownerRole: 'trust_safety_owner',
    scope: 'case_bound',
    replicationPolicy: 'no_unrestricted_replication',
    detectionVersion: specialCategoryDetectionVersion,
    detectedFields: ['summary'],
  });
  assert.doesNotMatch(JSON.stringify(normalized), /Diagnose/u);
});

test('detects structured injury state and Unicode-letter words', () => {
  assert.deepEqual(detectPossibleSpecialCategoryFields({
    productSafetyInjuryOccurred: true,
  }), {
    classification: 'possible_special_category',
    detectionVersion: specialCategoryDetectionVersion,
    fields: ['productSafetyInjuryOccurred'],
  });
  assert.deepEqual(detectPossibleSpecialCategoryFields({
    summary: 'Ärztin bestätigt die Meldung.',
  }), {
    classification: 'possible_special_category',
    detectionVersion: specialCategoryDetectionVersion,
    fields: ['summary'],
  });
  assert.equal(
    detectPossibleSpecialCategoryText('Dieser Inhalt verletzt meine Rechte.'),
    null,
  );
  assert.ok(
    detectPossibleSpecialCategoryText('Eine Person wurde körperlich verletzt.'),
  );
  assert.ok(detectPossibleSpecialCategoryText('The person was injured.'));
});

test('rejects a handling object when no possible special-category data was detected', () => {
  assert.throws(
    () => normalizeSpecialCategoryHandling(handling, {
      detection: null,
      errorFactory: (code) => new Error(code),
    }),
    /special_category_handling_not_applicable/u,
  );
});
