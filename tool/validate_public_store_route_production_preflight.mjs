#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const evidencePath = path.join(
  root,
  'docs',
  'evidence',
  'b11',
  'public-store-route-production-preflight-20260813.json',
);

function fail(message) {
  throw new Error(message);
}

export function validateProductionRoutePreflight(evidence) {
  if (evidence?.schemaVersion !== 1 ||
      evidence?.kind !== 'public-store-route-production-preflight') {
    fail('Unexpected production route preflight schema.');
  }
  if (evidence.status !== 'rolled-back-production-backend-incompatible') {
    fail('The preflight must remain explicitly rolled back.');
  }
  if (evidence.candidate?.applicationId !== 'com.shareittoo.app' ||
      evidence.candidate?.buildNumber !== '2026081202') {
    fail('The preflight is not bound to the exact Android candidate.');
  }
  if (evidence.preflight?.candidateConfigurationValidatedInContainer !== true ||
      evidence.preflight?.ownerOnlyBackupCreated !== true ||
      evidence.preflight?.routeReloadAttempted !== true) {
    fail('The configuration validation and backup preconditions are incomplete.');
  }
  const staging = evidence.preflight?.stagingRouteContract;
  if (staging?.support !== '503-draft' ||
      staging?.privacy !== '503-draft' ||
      staging?.accountDeletion !== '200-operational') {
    fail('The staging route contract is not preserved.');
  }
  const production = evidence.preflight?.productionRouteContract;
  if (production?.support !== '404-upstream-route-missing' ||
      production?.privacy !== '404-upstream-route-missing' ||
      production?.accountDeletion !== '404-upstream-route-missing') {
    fail('The production incompatibility is not recorded fail-closed.');
  }
  const rollback = evidence.rollback;
  for (const field of [
    'performedImmediately',
    'deployedCaddyRestoredExactly',
    'productionAppShellRestored',
    'productionApiHealthy',
    'stagingApiHealthy',
    'webContainerHealthy',
  ]) {
    if (rollback?.[field] !== true) fail(`Rollback proof is missing: ${field}`);
  }
  for (const field of [
    'publicSupportUrlReady',
    'publicPrivacyUrlReady',
    'publicAccountDeletionUrlReady',
    'legalContentApproved',
    'productionBackendDeploymentApproved',
    'productionRouteActivationApproved',
    'storeSubmissionAllowed',
  ]) {
    if (evidence.gates?.[field] !== false) fail(`Gate must remain closed: ${field}`);
  }
  for (const field of [
    'currentProductionChanged',
    'currentStagingChanged',
    'paymentsChanged',
    'dnsChanged',
    'mailChanged',
    'cronChanged',
    'containsSecrets',
    'containsPersonalAccountData',
    'containsRawDeviceIdentifiers',
  ]) {
    if (evidence.boundaries?.[field] !== false) fail(`Boundary must be false: ${field}`);
  }
  if (!Array.isArray(evidence.nextRequired) || evidence.nextRequired.length < 5) {
    fail('The safe follow-up sequence is incomplete.');
  }
  return {
    status: evidence.status,
    candidate: evidence.candidate.buildNumber,
    rollbackVerified: true,
    storeSubmissionAllowed: false,
  };
}

function run() {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  console.log(JSON.stringify(validateProductionRoutePreflight(evidence), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
