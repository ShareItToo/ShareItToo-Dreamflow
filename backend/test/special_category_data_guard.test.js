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
    /article9_server_authorization_required/u,
  );
  const serverApproval = {
    version: 'sit_article9_server_authorization_v1',
    source: 'server',
    decision: 'approved',
    approvalReference: 'approval-1234',
    caseBinding: 'case-123',
    article9Basis: 'future-reviewed-basis',
    issuedAt: '2026-08-21T10:00:00.000Z',
  };
  const normalized = normalizeSpecialCategoryHandling(handling, {
    detection,
    serverSideArticle9Authorization: serverApproval,
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
    authorizationVersion: 'sit_article9_server_authorization_v1',
    authorizationReference: 'approval-1234',
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
  assert.equal(detectPossibleSpecialCategoryText('Keine Verletzung, nur ein defektes Gerät.'), null);
  assert.ok(
    detectPossibleSpecialCategoryText('Eine Person wurde körperlich verletzt.'),
  );
  assert.ok(detectPossibleSpecialCategoryText('The person was injured.'));
  assert.equal(
    detectPossibleSpecialCategoryFields(
      { summary: 'Dieser Hinweis ist körperlich verletzt relevant.' },
      { includeInjury: false },
    ),
    null,
  );
  assert.deepEqual(
    detectPossibleSpecialCategoryFields({
      summary: 'Eine Person wurde körperlich verletzt.',
    }),
    {
      classification: 'possible_special_category',
      detectionVersion: specialCategoryDetectionVersion,
      fields: ['summary'],
    },
  );
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
