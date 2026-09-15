#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp159-processor-controller-region-transfer-truth-20260915.json';
const handoverPath = 'docs/operations/WP159_PROCESSOR_CONTROLLER_REGION_TRANSFER_TRUTH_2026-09-15.md';
export const wp159SourcePaths = Object.freeze([
  'store/privacy-disclosures.json',
  'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json',
  'docs/evidence/b11/firebase-cloud-messaging-retention-deletion-readiness-20260817.json',
  'docs/evidence/b11/firebase-crashlytics-retention-deletion-readiness-20260817.json',
  'docs/evidence/b11/firebase-authentication-retention-deletion-readiness-20260817.json',
  'docs/evidence/b11/google-maps-platform-retention-deletion-readiness-20260817.json',
  handoverPath,
  'tool/validate_wp159_processor_controller_region_transfer_truth.mjs',
  'test/tool/validate_wp159_processor_controller_region_transfer_truth.test.mjs',
]);

function fail(message) { throw new Error(`WP159 ${message}.`); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid`);
}
function digest(repositoryRoot, path) {
  return createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex');
}
function inventoryDigest(inventory) {
  return createHash('sha256').update(Object.entries(inventory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, hash]) => `${path}\0${hash}\n`).join('')).digest('hex');
}
function hasAll(text, markers, label) {
  for (const marker of markers) if (!text.includes(marker)) fail(`${label} marker missing: ${marker}`);
}
function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

export function validateWp159ProcessorControllerRegionTransferTruth({ repositoryRoot = root, evidence, sourceTexts = {} } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value.schemaVersion, 1, 'schemaVersion');
  exact(value.package, 'WP159-PROCESSOR-CONTROLLER-REGION-TRANSFER-TRUTH-20260915', 'package');
  exact(value.status, 'technical-recognized-account-gates-open', 'status');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead: '9d4b252234af8ea200d73485f35f9ff0823f617e',
    finalHead: '9d4b252234af8ea200d73485f35f9ff0823f617e',
    workingTreeCleanAtCapture: true,
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository');
  exact(value.technicalControllerBoundary, {
    sitFirstPartyBackend: { technicalRole: 'controller-service', enabledInCandidate: true },
    legalControllerDeterminationCompleted: false,
    technicalRoleIsNotLegalAdvice: true,
  }, 'technical controller boundary');

  const hostinger = object(value.providerFindings.hostingerVps, 'Hostinger findings');
  exact(hostinger, {
    enabledInCandidate: true, technicalRole: 'processor', dataFlow: 'first-party-backend-and-database-hosting',
    publicProcessorTermsLocated: true, publicRegionOptionsLocated: true,
    publicVpsLocationRule: 'location-fixed-after-setup', actualActiveVpsRegionProven: false,
    customerDpaAcceptanceProven: false, activeSubprocessorSetProven: false,
    sitTransferMechanismApproved: false, sitRetentionDeletionApproval: false,
  }, 'Hostinger findings');
  const smtp = object(value.providerFindings.googleWorkspaceSmtpRelay, 'Workspace findings');
  exact(smtp, {
    enabledInCandidate: true, technicalRole: 'processor', dataFlow: 'transactional-email-relay',
    smtpRelayMechanismDocumented: true, publicWorkspaceProcessorFrameworkLocated: true,
    actualWorkspaceEditionProven: false, relayAdminPolicyProven: false, configuredDataRegionProven: false,
    customerDpaAcceptanceProven: false, activeSubprocessorSetProven: false,
    sitTransferMechanismApproved: false, sitRetentionDeletionApproval: false,
  }, 'Workspace findings');
  for (const serviceId of ['firebaseAuthentication', 'firebaseCloudMessaging', 'firebaseCrashlytics']) {
    const service = object(value.providerFindings[serviceId], `${serviceId} findings`);
    if (service.enabledInCandidate !== true
        || service.technicalRole !== 'processor-under-public-firebase-terms'
        || service.accountSpecificConfigurationProven !== false && service.accountSpecificDataLocationProven !== false
        || service.customerDpaAcceptanceProven !== false
        || service.transferMechanismApproved !== false
        || service.retentionDeletionApproval !== false) {
      fail(`${serviceId} must retain public fact and open account gates`);
    }
  }
  exact(value.providerFindings.googleMapsPlatform, {
    enabledInCandidate: true, providerActivation: 'provider-gated-default-off',
    technicalDataPath: 'authenticated-SIT-server-proxy', directSdkTransferImplemented: false,
    publicControllerControllerTermsLocated: true,
    publicUseAndRetentionFact: 'Google receives search terms, IP addresses and latitude/longitude coordinates when providing Maps services and may use or retain them under its privacy terms.',
    actualBillingAddressAndEeaTermsProven: false, enabledApisAndLoggingProven: false,
    credentialRestrictionProven: false, activationApproved: false, sitLegalRoleDetermined: false,
  }, 'Maps findings');
  exact(value.providerFindings.stripe, {
    enabledInCandidate: false, technicalRole: 'inactive-future-review-only', providerTrafficPerformed: false,
    accountContractReviewedForThisPackage: false, regionTransferDecisionMade: false,
  }, 'Stripe findings');

  const sources = value.officialSources;
  if (!Array.isArray(sources) || sources.length !== 8) fail('official source inventory is incomplete');
  const urls = sources.map((entry) => entry?.url);
  for (const url of [
    'https://www.hostinger.com/legal/dpa',
    'https://support.hostinger.com/en/articles/1583267-where-are-hostinger-servers-located',
    'https://firebase.google.com/support/privacy',
    'https://firebase.google.com/terms/data-processing-terms',
    'https://support.google.com/a/answer/2956491?hl=en-to',
    'https://workspace.google.com/terms/service-terms/',
    'https://cloud.google.com/maps-platform/terms?hl=en-EN',
    'https://business.safety.google/controllerterms/',
  ]) if (!urls.includes(url)) fail(`official source missing: ${url}`);

  exact(value.accountGates, {
    ownerGate: 'OWNER_GATE_REQUIRED:PROCESSOR_CONTRACT_REGION_TRANSFER_READBACK',
    requiredReadback: [
      'Hostinger active contracting entity, accepted DPA, VPS region and current subprocessor/transfer schedule',
      'Google Workspace edition, accepted DPA, SMTP relay Admin policy, sender domain and configured data-region setting',
      'Firebase project terms/account acceptance, Authentication US-only acknowledgement, FCM/Crashlytics location controls and active project settings',
      'Google Maps billing address/EEA terms, enabled APIs, logging/credential restrictions and current account terms',
    ],
    legalRoleAndControllerFactsRemainOpen: true,
  }, 'account gates');
  exact(value.boundaries, {
    providerConsoleAccessed: false, accountSignedIn: false, credentialsReadOrRecorded: false,
    contractAccepted: false, dpaChanged: false, regionChanged: false, transferMechanismChanged: false,
    providerTrafficPerformed: false, paymentOrStripeTrafficPerformed: false, firebaseChanged: false,
    mapsActivated: false, productionChanged: false, storeChanged: false, deviceChanged: false,
    pullRequestMerged: false,
  }, 'boundaries');

  exact(Object.keys(value.sourceInventory).sort(), [...wp159SourcePaths].sort(), 'source inventory paths');
  exact(value.captureAttestation.inventoryDigestAlgorithm, 'sha256-path-nul-digest-newline-v1', 'inventory digest algorithm');
  exact(value.captureAttestation.sourceInventoryDigest, inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp159SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) fail(`source inventory ${path} is not SHA-256`);
    exact(digest(repositoryRoot, path), value.sourceInventory[path], `source inventory ${path}`);
  }
  const handover = sourceTexts[handoverPath] ?? readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  hasAll(handover, ['WP159', 'technical recipient facts', 'OWNER_GATE_REQUIRED:PROCESSOR_CONTRACT_REGION_TRANSFER_READBACK', 'No contract, DPA'], 'handover');
  const privacy = sourceTexts['store/privacy-disclosures.json'] ?? readFileSync(resolve(repositoryRoot, 'store/privacy-disclosures.json'), 'utf8');
  hasAll(privacy, ['"hostingerVps"', '"googleWorkspaceSmtpRelay"', '"firebaseAuthentication"', '"googleMapsPlatform"', '"contractAndDpaApproved": false'], 'privacy disclosure bindings');
  const classification = sourceTexts['docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json'] ?? readFileSync(resolve(repositoryRoot, 'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json'), 'utf8');
  hasAll(classification, ['hostingerVps', 'googleWorkspaceSmtpRelay', 'processor'], 'provider classification');
  const serialized = JSON.stringify(value);
  if (/(?:password|secret|api[_-]?key|private[_-]?key|service[_-]?account|@)/iu.test(serialized)) fail('evidence contains a secret-shaped or personal identifier');
  return { status: value.status, ownerGate: value.accountGates.ownerGate, providers: Object.keys(value.providerFindings).length };
}

function source(repositoryRoot, path, sourceTexts) { return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8'); }
function main() {
  const result = validateWp159ProcessorControllerRegionTransferTruth();
  console.log(`WP159 valid: providers=${result.providers}, ownerGate=${result.ownerGate}.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
