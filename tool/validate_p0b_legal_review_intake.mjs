#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = 'assets/legal/de/legal_review_intake_p0b_20260821.json';
const expectedVersion = 'P0B-L1-LEGAL-REVIEW-2026-08-21.1';

const expectedRepoSources = Object.freeze([
  Object.freeze(['assets/legal/de/legal_manifest_v52.json', '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b']),
  Object.freeze(['assets/legal/de/legal_manifest_g3l_draft.json', 'd3bc9b74cf70324b448df4e9d10662ab3a03485028dfc9e2d7c81535b8f9a02a']),
  Object.freeze(['docs/architecture/g3a-same-owner-multi-item-decision-2026-08-20.md', '39db40f9b4d16dc11bca4cae5b09c87c657fcb36611ab744ed5a21710ce9af7b']),
  Object.freeze(['docs/compliance/g3l-multi-item-legal-document-draft-2026-08-20.md', 'f7a941766d616cfce6ef04abd260bd6b6a0530b9399918df1c0a072d50dc450a']),
  Object.freeze(['docs/evidence/p0b/pilot-go-no-go-dossier.json', '3566a46c018b7685adfe0f9df296c2060294f811deb5b61dd79ec818c25f27dd']),
]);

const expectedDriveSources = Object.freeze([
  Object.freeze(['1d3JJLq-X36u9IwfhyhtNm1QYH38urVEq', '02_CODEX_WORK_PACKAGES_SIT_V2.4.md', '2026-08-20T19:13:40.661Z']),
  Object.freeze(['1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx', '01_V5.2_CORE_SPECIFICATION.md', '2026-08-18T17:51:27.257Z']),
  Object.freeze(['1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2', '02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf', '2026-08-18T17:51:36.056Z']),
  Object.freeze(['159xMd9qoMqp_5x0x0evYG511auKgk4Nu', '02_SIT_GROWTH_PRODUCT_PROJEKTKORB_UND_PLANER.pdf', '2026-08-18T17:52:31.409Z']),
]);

const expectedDocuments = Object.freeze([
  Object.freeze({
    type: 'review_instruction_and_scope',
    path: 'assets/legal/de/p0b-legal-review-2026-08-21.1/01_pruefauftrag_und_scope.md',
    sha256: 'b69253e56aaca28c3ba2c8c15a93499c49da8a935fcaaacb1e72b848e01181d4',
    status: 'prepared',
    markers: Object.freeze(['unabhängige professionelle Prüfung', 'Erwartete Liefergegenstände', 'keine Aktivierung', 'professionalLegalApproval=false']),
  }),
  Object.freeze({
    type: 'decision_workbook',
    path: 'assets/legal/de/p0b-legal-review-2026-08-21.1/02_entscheidungsarbeitsblatt.md',
    sha256: '8bbe267d072479c50390e4ecfd023f31e85cbce497b732b22303f35d07f73e97',
    status: 'all-open',
    markers: Object.freeze(['Alle Entscheidungen stehen auf `open`', '`operatorIdentityAndImprint`', '`withdrawalAndFixedPeriodRental`', '`marketplaceTransparencyDsaAndModeration`']),
  }),
  Object.freeze({
    type: 'primary_source_register',
    path: 'assets/legal/de/p0b-legal-review-2026-08-21.1/03_primaerquellenregister.md',
    sha256: '71504a58ec3630305ea577f90a77a17ee27e381f71f9ea70faf56fde54412e79',
    status: 'research-baseline-not-legal-advice',
    markers: Object.freeze(['Abrufstand: `2026-08-21`', '§ 5 DDG', '§ 312j BGB', 'Verordnung (EU) 2024/3228', 'DSA, Verordnung (EU) 2022/2065']),
  }),
  Object.freeze({
    type: 'professional_approval_evidence_schema',
    path: 'assets/legal/de/p0b-legal-review-2026-08-21.1/04_freigabeevidenz_schema.md',
    sha256: '12426fdb0cf7ad81fd6d9329a0e27dcd66bdd07103e69719976080b75b73d484',
    status: 'prepared',
    markers: Object.freeze(['Dieses Dokument beschreibt', 'reviewStatus', 'approved_with_changes', 'Annahmeprüfung', 'Zustandsübergänge']),
  }),
  Object.freeze({
    type: 'release_gate',
    path: 'assets/legal/de/p0b-legal-review-2026-08-21.1/05_release_gate.md',
    sha256: '7006a3c8a5c2d5eea3591d0478b4899554e61a770396b412eeb97abf83d51afc',
    status: 'hard-stop',
    markers: Object.freeze(['HARD STOP', 'Professionelle Prüfung fehlt', 'realMoneyAllowed=false', 'Ein CI-Erfolg beweist']),
  }),
]);

const expectedDecisionKeys = Object.freeze([
  'operatorIdentityAndImprint',
  'groupPrivateRentalContractModel',
  'groupPlatformContractScope',
  'completeOfferAndCounterOfferSemantics',
  'checkoutAndDurableConfirmation',
  'withdrawalAndFixedPeriodRental',
  'partialPerformanceAndDivisibilityConsequences',
  'groupAndPositionCancellationRefundRules',
  'sharedAppointmentAndPositionEvidenceEffect',
  'positionNeedsReviewAndUnrelatedRelease',
  'groupPaymentAuthorizationAndProviderContract',
  'positionLedgerRefundAndChargebackAllocation',
  'groupConfirmationAndReceiptIssuerContent',
  'privacyPurposesLegalBasesAndRecipients',
  'accountExportCompletenessAndCounterpartyProtection',
  'retentionDeletionLegalHoldPeriodsAndTriggers',
  'marketplaceTransparencyDsaAndModeration',
  'businessGlobalConsumerAndTraderVariants',
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function content(root, path, overrides) {
  if (Object.hasOwn(overrides, path)) return Buffer.from(String(overrides[path]), 'utf8');
  return readFileSync(resolve(root, path));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentity(manifest) {
  if (manifest.schemaVersion !== 1
      || manifest.packageVersion !== expectedVersion
      || manifest.authorizationToken !== 'P0B_NEXT_LEGAL_V52_REVIEW_ONLY'
      || manifest.preparedOn !== '2026-08-21'
      || manifest.jurisdiction !== 'DE'
      || manifest.locale !== 'de'
      || manifest.status !== 'prepared-awaiting-independent-professional-review') {
    fail('P0B-L1 identity or preparation status is invalid.');
  }
}

function assertFailClosed(manifest) {
  if (manifest.notLegalAdvice !== true
      || manifest.professionallyReviewed !== false
      || manifest.professionalApprovalClaimAllowed !== false
      || manifest.publicActivationAllowed !== false
      || manifest.productionProvisioningAllowed !== false
      || manifest.storeSubmissionAllowed !== false
      || manifest.realMoneyAllowed !== false
      || manifest.externalReviewer !== null
      || manifest.externalReviewReceivedAt !== null
      || manifest.externalAuthenticationEvidence !== null) {
    fail('P0B-L1 must remain prepared, externally unreviewed and fail-closed.');
  }
}

function assertSourceBindings(root, manifest, overrides) {
  const repo = manifest.sourceBindings?.repository;
  if (!Array.isArray(repo) || repo.length !== expectedRepoSources.length) {
    fail('P0B-L1 repository source set is incomplete.');
  }
  expectedRepoSources.forEach(([path, hash], index) => {
    if (!exact(repo[index], { path, sha256: hash })
        || sha256(content(root, path, overrides)) !== hash) {
      fail(`P0B-L1 repository source drift: ${path}`);
    }
  });
  const drive = manifest.sourceBindings?.drive;
  if (!Array.isArray(drive) || drive.length !== expectedDriveSources.length) {
    fail('P0B-L1 Drive source set is incomplete.');
  }
  expectedDriveSources.forEach(([fileId, title, modifiedTime], index) => {
    if (!exact(drive[index], { fileId, title, modifiedTime })) {
      fail(`P0B-L1 Drive source binding drift: ${title}`);
    }
  });
}

function assertOfficialSources(manifest) {
  const sources = manifest.officialSourceRegister;
  if (sources?.retrievedOn !== '2026-08-21'
      || sources.documentPath !== expectedDocuments[2].path
      || !exact(sources.authorityDomains, [
        'gesetze-im-internet.de',
        'eur-lex.europa.eu',
        'bafin.de',
      ])
      || !exact(sources.currentLawDriftNoted, [
        'DDG changed in 2026',
        'ZAG changed on 2026-03-25',
        'EU ODR platform discontinued on 2025-07-20',
      ])) {
    fail('P0B-L1 current official-law baseline is incomplete or stale.');
  }
}

function assertReviewDocuments(root, manifest, overrides) {
  if (!Array.isArray(manifest.reviewDocuments)
      || manifest.reviewDocuments.length !== expectedDocuments.length) {
    fail('P0B-L1 review document set must contain exactly five artifacts.');
  }
  expectedDocuments.forEach((expected, index) => {
    const { markers, ...entry } = expected;
    if (!exact(manifest.reviewDocuments[index], entry)) {
      fail(`P0B-L1 review document binding drift: ${expected.type}`);
    }
    const document = content(root, expected.path, overrides);
    const text = document.toString('utf8');
    if (sha256(document) !== expected.sha256) {
      fail(`P0B-L1 review document hash drift: ${expected.path}`);
    }
    markers.forEach((marker) => {
      if (!text.includes(marker)) fail(`P0B-L1 required marker missing: ${marker}`);
    });
    if (/<(?:script|iframe|object|embed)\b|javascript:/iu.test(text)) {
      fail(`P0B-L1 review document contains executable content: ${expected.type}`);
    }
  });
  const workbook = content(root, expectedDocuments[1].path, overrides).toString('utf8');
  if ((workbook.match(/\| `open` \|/gu) ?? []).length !== expectedDecisionKeys.length
      || /\| `(?:approved|rejected)` \|/u.test(workbook)) {
    fail('P0B-L1 decision workbook must keep exactly eighteen decisions open.');
  }
}

function assertDecisionsAndGates(manifest) {
  if (!exact(manifest.openDecisionKeys, expectedDecisionKeys)) {
    fail('P0B-L1 open decision set is incomplete or reordered.');
  }
  if (!exact(manifest.intakePreparation, {
    sourceBindingsComplete: true,
    reviewInstructionPrepared: true,
    decisionWorkbookPrepared: true,
    officialSourceBaselinePrepared: true,
    evidenceSchemaPrepared: true,
    professionalReviewCompleted: false,
  })) {
    fail('P0B-L1 intake preparation status is invalid.');
  }
  if (!exact(manifest.releaseGate, {
    professionalLegalApproval: false,
    approvedFinalContentHashesAvailable: false,
    operatorFactsComplete: false,
    pspContractAndZagFlowApproved: false,
    privacyTransferAndRetentionApproved: false,
    operationsGateApproved: false,
    signedDeviceGateApproved: false,
    explicitPilotActivationDecision: false,
    hardStopBeforePublicProductionStoreOrRealMoney: true,
  })) {
    fail('P0B-L1 release gate must remain a complete hard stop.');
  }
}

export function validateP0BLegalReviewIntake({
  root = defaultRoot,
  manifest = undefined,
  sourceOverrides = {},
} = {}) {
  const value = manifest ?? JSON.parse(content(root, manifestPath, sourceOverrides));
  assertIdentity(value);
  assertFailClosed(value);
  assertSourceBindings(root, value, sourceOverrides);
  assertOfficialSources(value);
  assertReviewDocuments(root, value, sourceOverrides);
  assertDecisionsAndGates(value);
  return Object.freeze({
    packageVersion: value.packageVersion,
    status: value.status,
    sourceCount: value.sourceBindings.repository.length + value.sourceBindings.drive.length,
    reviewDocumentCount: value.reviewDocuments.length,
    openDecisionCount: value.openDecisionKeys.length,
    professionallyReviewed: value.professionallyReviewed,
    hardStop: value.releaseGate.hardStopBeforePublicProductionStoreOrRealMoney,
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const result = validateP0BLegalReviewIntake();
    process.stdout.write(
      `P0B-L1 legal review intake valid: version=${result.packageVersion}, status=${result.status}, sources=${result.sourceCount}, documents=${result.reviewDocumentCount}, openDecisions=${result.openDecisionCount}, professionallyReviewed=${result.professionallyReviewed}, hardStop=${result.hardStop}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'P0B-L1 legal review intake validation failed.'}\n`);
    process.exitCode = 1;
  }
}
