#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expectedVersion = 'G3L-DRAFT-2026-08-20.1';
const expectedParentVersion = 'V5.2-2026-08-16';
const expectedParentManifest = Object.freeze({
  path: 'assets/legal/de/legal_manifest_v52.json',
  sha256: '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b',
});
const expectedSources = Object.freeze({
  architectureDecision: Object.freeze({
    path: 'docs/architecture/g3a-same-owner-multi-item-decision-2026-08-20.md',
    sha256: '39db40f9b4d16dc11bca4cae5b09c87c657fcb36611ab744ed5a21710ce9af7b',
  }),
  g3eEvidence: Object.freeze({
    path: 'docs/compliance/g3e-disabled-multi-item-ux-2026-08-20.md',
    sha256: 'ecc83fffbbfaa34dff84d3375df642c2792cf9587c710c6058046f65699c916b',
  }),
});
const expectedParentDocuments = Object.freeze([
  ['A', 'assets/legal/de/v52/part_a_platform_terms.html', '58fc3bcd3422081e157a941e1851fb31c0442df8d55f4fde84e693e2d6f3009a'],
  ['B', 'assets/legal/de/v52/part_b_private_rental_terms.html', 'b71af619bf2db2172dfdb95cf2c2f6f113533939dc2c702ab3b00897d86e3483'],
  ['C', 'assets/legal/de/v52/part_c_cancellation_refund.html', 'dcfa17dfd8e2fec5ecb17a2a30f5cce4af1d5a62233a2208289d826d89b82349'],
  ['D', 'assets/legal/de/v52/part_d_handover_return_damage.html', '5a73e7b92c73810c8cb3eb9532a88bc7a73aa817afe017bc29595709ddfd3a91'],
  ['E', 'assets/legal/de/v52/part_e_payment_payout.html', '145258409f65e555d139fd2d808e060734a75e6304a202481005f5fc61ef9a2e'],
  ['F', 'assets/legal/de/v52/part_f_community_safety.html', 'd40168ccea475696b8384f2806dccd77ac54934d4499368fee7cf21fe7b46e59'],
  ['G', 'assets/legal/de/v52/part_g_reporting_moderation_review.html', '3e74628b6835cbfe4893eed8569648373364a344e3414abc500a35ae9b2625b1'],
  ['H', 'assets/legal/de/v52/part_h_privacy.html', '632a5a58f7aa8ab0e91c30f722228593ea3ce40db4672139ce47fdea666d304c'],
  ['I', 'assets/legal/de/v52/part_i_imprint_withdrawal_shorttexts.html', '0b1bc9913d8c56088796497014946da32d7ec881f340a4765397ea53a505a460'],
]);
const expectedAffectedScopes = Object.freeze([
  'platformTerms',
  'privateRentalTerms',
  'cancellationRefund',
  'paymentPayout',
  'handoverReturnDamage',
  'needsReviewAudit',
  'privacy',
  'accountExport',
  'retentionDeletion',
  'receipts',
  'evidence',
]);
const expectedDraftDocuments = Object.freeze([
  Object.freeze({
    type: 'multi_item_change_matrix',
    path: 'assets/legal/de/g3l-draft-2026-08-20.1/01_multi_item_change_matrix.md',
    sha256: '5bebba6f5dafbca9bd3745d769c567d9a7e8fc5a55a1d50167f7b115c879f4f2',
    status: 'draft-blocked',
    markers: Object.freeze([
      'Teil A: Plattformbedingungen und Checkout',
      'Teil B: Privat-Mietbedingungen',
      'Datenschutz',
      'Export',
      'Aufbewahrung/Löschung',
      'Dokumente und Audit',
      'Rechtsfreigabe',
    ]),
  }),
  Object.freeze({
    type: 'document_binding_spec',
    path: 'assets/legal/de/g3l-draft-2026-08-20.1/02_document_binding_spec.md',
    sha256: '623b87af89c1923ec13aca18d6d595cae791e9b5cfa33f1e73e3ab4ee0df4e5e',
    status: 'draft-blocked',
    markers: Object.freeze([
      'Sämtliche neun V5.2-Dateien A bis I',
      'Gruppen-Quote-ID',
      'Bestätigung und Belege',
      'Übergabe-, Rückgabe- und Schadensnachweise',
      'Datenschutz, Export und Aufbewahrung',
      'darf nicht als freigegebene Dokumentversion',
    ]),
  }),
  Object.freeze({
    type: 'professional_review_checklist',
    path: 'assets/legal/de/g3l-draft-2026-08-20.1/03_professional_review_checklist.md',
    sha256: 'e00909326660fb433d424cbfb7b8b62c58d663757c44a5177a33bbaf11af24c7',
    status: 'all-open',
    markers: Object.freeze([
      'Vertrag und Erklärungen',
      'Teilweise Leistungsstörung',
      'Payment, Auszahlung und Dokumente',
      'Datenschutz, Export und Aufbewahrung',
      'Alle Punkte sind offen',
    ]),
  }),
  Object.freeze({
    type: 'release_gate',
    path: 'assets/legal/de/g3l-draft-2026-08-20.1/04_release_gate.md',
    sha256: '4ea209c54e9f2dff3a3bc974745fd69962f1c11fbb9e988394b511de5e5b9d2d',
    status: 'hard-stop',
    markers: Object.freeze([
      'HARD STOP',
      'professionell geprüfte',
      'Real-Money',
      'ausdrückliche Aktivierungsentscheidung',
      'erfüllt diese Bedingungen nicht',
    ]),
  }),
]);
const expectedReviewDecisions = Object.freeze([
  'groupPrivateRentalContractModel',
  'groupPlatformContractScope',
  'completeOfferAndCounterOfferSemantics',
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
  'businessGlobalConsumerAndTraderVariants',
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function read(root, path) {
  return readFileSync(resolve(root, path));
}

function verifyHash(root, path, expected, label) {
  if (sha256(read(root, path)) !== expected) fail(`${label} hash drift: ${path}`);
}

function assertFailClosedManifest(manifest) {
  if (manifest.schemaVersion !== 1
      || manifest.version !== expectedVersion
      || manifest.status !== 'draft-blocked'
      || manifest.approvalAllowed !== false
      || manifest.professionalApprovalClaimAllowed !== false
      || manifest.activationAllowed !== false
      || manifest.productionProvisioningAllowed !== false
      || manifest.realMoneyAllowed !== false
      || manifest.effectiveDate !== null
      || manifest.locale !== 'de') {
    fail('G3L manifest must remain an inactive, unapproved technical draft.');
  }
}

function assertSourceBindings(root, manifest) {
  for (const [key, expected] of Object.entries(expectedSources)) {
    const actual = manifest.source?.[key];
    if (!exact(actual, expected)) fail(`G3L source binding drift: ${key}`);
    verifyHash(root, expected.path, expected.sha256, `G3L source ${key}`);
  }
  const legal = manifest.source?.legalSource;
  if (manifest.source?.coreSpecification?.driveFileId !== '1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx'
      || legal?.driveFileId !== '1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2'
      || legal?.sha256 !== 'aa6f631457c9b73fdae3c5d4415ba6681b86f63b51df3fd5937c50f80a27b8a8'
      || manifest.source?.growthMaster?.driveFileId !== '159xMd9qoMqp_5x0x0evYG511auKgk4Nu') {
    fail('G3L Drive source binding drift.');
  }
}

function assertHistoricalV52Preserved(root, manifest) {
  const parent = manifest.parentDocumentSet;
  if (parent?.version !== expectedParentVersion
      || parent.manifestPath !== expectedParentManifest.path
      || parent.manifestSha256 !== expectedParentManifest.sha256
      || parent.historicalMutationAllowed !== false) {
    fail('G3L must preserve the exact V5.2 parent manifest.');
  }
  verifyHash(
    root,
    expectedParentManifest.path,
    expectedParentManifest.sha256,
    'V5.2 parent manifest',
  );
  if (!Array.isArray(parent.documents)
      || parent.documents.length !== expectedParentDocuments.length) {
    fail('G3L must bind exactly the nine historical V5.2 documents.');
  }
  for (const [index, [part, path, hash]] of expectedParentDocuments.entries()) {
    if (!exact(parent.documents[index], { part, path, sha256: hash })) {
      fail(`G3L V5.2 document binding drift: part ${part}`);
    }
    verifyHash(root, path, hash, `historical V5.2 part ${part}`);
  }
}

function assertDraftDocuments(root, manifest) {
  if (!exact(manifest.affectedScopes, expectedAffectedScopes)) {
    fail('G3L affected-scope matrix is incomplete or reordered.');
  }
  if (!Array.isArray(manifest.draftDocuments)
      || manifest.draftDocuments.length !== expectedDraftDocuments.length) {
    fail('G3L must bind exactly four technical draft documents.');
  }
  for (const [index, expected] of expectedDraftDocuments.entries()) {
    const actual = manifest.draftDocuments[index];
    const expectedEntry = {
      type: expected.type,
      path: expected.path,
      sha256: expected.sha256,
      status: expected.status,
    };
    if (!exact(actual, expectedEntry)) fail(`G3L draft document entry drift: ${expected.type}`);
    const content = read(root, expected.path).toString('utf8');
    if (sha256(Buffer.from(content, 'utf8')) !== expected.sha256) {
      fail(`G3L draft document hash drift: ${expected.path}`);
    }
    for (const marker of expected.markers) {
      if (!content.includes(marker)) fail(`G3L draft document marker missing: ${expected.type}`);
    }
    if (/<(?:script|iframe|object|embed)\b|javascript:/iu.test(content)) {
      fail(`G3L draft document contains executable content: ${expected.type}`);
    }
    if (expected.type === 'professional_review_checklist'
        && (/\[[xX]\]/u.test(content) || (content.match(/- \[ \]/gu) ?? []).length < 15)) {
      fail('G3L professional review checklist must remain completely open and substantive.');
    }
  }
}

function assertTechnicalBinding(root, manifest) {
  const binding = manifest.technicalBinding;
  if (binding?.backendModulePath !== 'backend/src/booking_group_legal_document.js'
      || binding.backendModuleSha256 !== '1cc7b6d0bcf0a4edb7c69fba605322736d353a0ea6f589e2170ae98bfe547966'
      || binding.bookingGroupLegalDocumentSetVersion !== expectedVersion
      || binding.historicalV52SnapshotsUntouched !== true
      || binding.groupContractProvisioned !== false
      || binding.groupReceiptGenerated !== false
      || binding.publicCheckoutAvailable !== false) {
    fail('G3L technical binding is not fail-closed.');
  }
  verifyHash(
    root,
    binding.backendModulePath,
    binding.backendModuleSha256,
    'G3L backend legal module',
  );
  const moduleSource = read(root, binding.backendModulePath).toString('utf8');
  for (const marker of [
    `version: '${expectedVersion}'`,
    `parentVersion: '${expectedParentVersion}'`,
    "status: 'draft-blocked'",
    'professionalApprovalClaimAllowed: false',
    'publicActivationAllowed: false',
    'productionProvisioningAllowed: false',
    'realMoneyAllowed: false',
    'historicalV52MutationAllowed: false',
  ]) {
    if (!moduleSource.includes(marker)) fail(`G3L backend legal binding marker missing: ${marker}`);
  }
  const workflow = read(root, 'backend/src/booking_group_workflow.js').toString('utf8');
  if (!workflow.includes('assertTechnicalBookingGroupLegalDocumentSet,')
      || !workflow.includes('bookingGroupLegalDocumentSet,')
      || !workflow.includes("} from './booking_group_legal_document.js';")
      || !workflow.includes('const technicalGroupLegalDocumentSet = assertTechnicalBookingGroupLegalDocumentSet(')
      || !workflow.includes('legalDocumentSetVersion: technicalGroupLegalDocumentSet.version')
      || workflow.includes('g3_multi_item_draft_v1')) {
    fail('Booking-group workflow is not bound to the immutable G3L draft identifier.');
  }
  const backendConfig = read(root, 'backend/src/config.js').toString('utf8');
  const flutterConfig = read(root, 'lib/config/booking_group_technical_config.dart').toString('utf8');
  if (!backendConfig.includes("process.env.BOOKING_GROUPS_ENABLED ?? 'false'")
      || !backendConfig.includes('booking groups cannot be enabled in production before the release gate')
      || !flutterConfig.includes("'SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED'")
      || !flutterConfig.includes('defaultValue: false')
      || !flutterConfig.includes('signedStageAInternalEnvelope')
      || !flutterConfig.includes('PrivatePilotConfig.technicalSurfaceAvailableFor')) {
    fail('G3L public/live feature controls are not fail-closed.');
  }
}

function assertReviewAndReleaseGate(manifest) {
  if (!exact(manifest.openReviewDecisions, expectedReviewDecisions)) {
    fail('G3L professional review decisions must remain complete and open.');
  }
  const gate = manifest.releaseGate;
  const closed = [
    'professionalLegalApproval',
    'finalDocumentHashesApproved',
    'checkoutAndDeclarationWordingApproved',
    'partialPerformanceRulesApproved',
    'privacyExportRetentionApproved',
    'paymentProviderAndRealMoneyApproved',
    'closedPilotEvidenceApproved',
    'explicitPublicActivationDecision',
  ];
  if (!gate || closed.some((key) => gate[key] !== false)
      || gate.hardStopBeforePublicActivation !== true
      || Object.keys(gate).length !== closed.length + 1) {
    fail('G3L release gate must remain a complete hard stop.');
  }
}

export function validateG3LLegalDraft({ repositoryRoot }) {
  const manifestPath = resolve(
    repositoryRoot,
    'assets/legal/de/legal_manifest_g3l_draft.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertFailClosedManifest(manifest);
  assertSourceBindings(repositoryRoot, manifest);
  assertHistoricalV52Preserved(repositoryRoot, manifest);
  assertDraftDocuments(repositoryRoot, manifest);
  assertTechnicalBinding(repositoryRoot, manifest);
  assertReviewAndReleaseGate(manifest);
  return Object.freeze({
    version: manifest.version,
    status: manifest.status,
    parentVersion: manifest.parentDocumentSet.version,
    draftDocumentCount: manifest.draftDocuments.length,
    openReviewDecisionCount: manifest.openReviewDecisions.length,
    hardStopBeforePublicActivation: manifest.releaseGate.hardStopBeforePublicActivation,
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const result = validateG3LLegalDraft({ repositoryRoot });
    process.stdout.write(
      `G3L legal draft valid: version=${result.version}, status=${result.status}, documents=${result.draftDocumentCount}, openReviewDecisions=${result.openReviewDecisionCount}, publicActivationHardStop=${result.hardStopBeforePublicActivation}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'G3L legal draft validation failed.'}\n`);
    process.exitCode = 1;
  }
}
