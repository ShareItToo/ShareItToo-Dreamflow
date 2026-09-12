#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const operatorPath = 'assets/legal/de/operator_readiness_draft_20260909.json';
const exactOperator = Object.freeze({
  businessDesignation: 'ShareItToo – Inhaber Walid Chraibi',
  legalForm: 'sole-proprietor',
  proprietorName: 'Walid Chraibi',
  serviceAddress: 'Bernhaldenweg 47, 71579 Spiegelberg, Deutschland',
  businessRegistration: 'required-at-actual-start-not-yet-recorded',
  taxNumber: 'applied-for-not-issued-not-recorded',
  registerEntry: 'not-applicable-not-recorded',
  vatId: 'not-issued-not-recorded',
  economicId: 'not-issued-not-recorded',
});
const exactBaselineManifests = Object.freeze([
  Object.freeze([
    'assets/legal/de/legal_manifest_v5.json',
    '6cffec53a27f84b24a44aebad50afd6e7ce17a4c196c7946155fba743fdc161f',
  ]),
  Object.freeze([
    'assets/legal/de/legal_manifest_v52.json',
    '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b',
  ]),
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function read(root, path, sourceOverrides) {
  if (Object.hasOwn(sourceOverrides, path)) return Buffer.from(String(sourceOverrides[path]), 'utf8');
  return readFileSync(resolve(root, path));
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateOperatorReadinessDraft({
  root = fileURLToPath(new URL('../', import.meta.url)),
  sourceOverrides = {},
} = {}) {
  const raw = read(root, operatorPath, sourceOverrides);
  const draft = JSON.parse(raw);
  if (draft.schemaVersion !== 1
      || draft.kind !== 'sit-operator-readiness-draft'
      || draft.version !== 'OPERATOR-DRAFT-2026-09-09.1'
      || draft.status !== 'confirmed-facts-draft-only'
      || draft.preparedOn !== '2026-09-09'
      || !exact(draft.operator, exactOperator)) {
    fail('Operator draft identity or confirmed sole-proprietor facts are invalid.');
  }
  if (!exact(draft.currentDraftPrecedence, {
    supersedesOnly: [
      'hypothetical-ug-gmbh-form',
      'managing-director-representation',
      'commercial-register-court-and-number',
      'former-service-address',
    ],
    baselineDocumentsRemainHistoricalAndHashBound: true,
    authoritativeForCurrentDraft: [
      'imprint-operator-identity',
      'platform-terms-operator-definition',
      'privacy-controller-identity',
    ],
  })) {
    fail('Operator draft must supersede only the old hypothetical operator facts.');
  }
  if (!exact(draft.operationBoundary, {
    businessRegistrationRequiredAtActualStartAtLatest: true,
    publicCommercialOperationAllowed: false,
    realInvitationsAllowed: false,
    realMoneyAllowed: false,
    bindingContractAcceptanceAllowed: false,
    allowedPreparation: 'internal-synthetic-nonbinding-only',
  })) {
    fail('Operator draft operation boundary is not fail-closed.');
  }
  if (draft.legalReview?.professionallyReviewed !== false
      || draft.legalReview?.publicLegalApprovalClaimAllowed !== false
      || !exact(draft.legalReview?.openGates, [
        'professional-legal-review',
        'retention-and-deletion',
        'dpa-and-transfer',
        'consumer-and-marketplace',
        'dsa-contact-and-transparency',
      ])) {
    fail('Operator draft must retain all professional legal gates as open.');
  }
  if (!exact(draft.officialSources, [
    'https://www.gesetze-im-internet.de/ddg/__5.html',
    'https://verwaltung.bund.de/leistungsverzeichnis/de/leistung/99050012104000',
    'https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng',
  ])) {
    fail('Operator draft official source set is incomplete.');
  }
  const expectedBaseline = exactBaselineManifests.map(([path, hash]) => ({ path, sha256: hash }));
  if (!exact(draft.baselineLegalManifests, expectedBaseline)) {
    fail('Operator draft baseline legal manifest binding is invalid.');
  }
  for (const [path, expectedHash] of exactBaselineManifests) {
    if (sha256(read(root, path, sourceOverrides)) !== expectedHash) {
      fail(`Operator draft must preserve historical baseline evidence: ${path}`);
    }
  }
  if (!Object.values(draft.boundaries ?? {}).every((value) => value === false)) {
    fail('Operator draft boundary claims an external mutation.');
  }

  const legalReadiness = JSON.parse(read(root, 'store/legal-readiness.json', sourceOverrides));
  const linked = legalReadiness.operatorReadinessDraft;
  if (linked?.status !== 'confirmed-sole-proprietor-draft-only'
      || linked.sourceFile !== operatorPath
      || linked.currentContentSha256 !== sha256(raw)
      || linked.publicCommercialOperationAllowed !== false
      || linked.bindingContractAcceptanceAllowed !== false) {
    fail('Legal readiness is not bound to the current operator draft.');
  }
  for (const path of [
    'lib/config/draft_operator_config.dart',
    'lib/screens/legal_terms_screen.dart',
    'lib/screens/legal_privacy_screen.dart',
    'lib/screens/legal_imprint_screen.dart',
  ]) {
    const text = read(root, path, sourceOverrides).toString('utf8');
    if (!text.includes('DraftOperatorConfig')) {
      fail(`Current legal surface does not consume the draft operator source: ${path}`);
    }
  }
  return Object.freeze({
    status: draft.status,
    operatorModel: draft.operator.legalForm,
    publicCommercialOperationAllowed: draft.operationBoundary.publicCommercialOperationAllowed,
    bindingContractAcceptanceAllowed: draft.operationBoundary.bindingContractAcceptanceAllowed,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateOperatorReadinessDraft();
    process.stdout.write(
      `Operator draft valid: status=${result.status}, model=${result.operatorModel}, `
      + `publicCommercialOperationAllowed=${result.publicCommercialOperationAllowed}, `
      + `bindingContractAcceptanceAllowed=${result.bindingContractAcceptanceAllowed}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Operator draft validation failed.'}\n`);
    process.exitCode = 1;
  }
}
