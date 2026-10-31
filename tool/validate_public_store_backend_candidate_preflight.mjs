#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const evidencePath = path.join(root, 'docs', 'evidence', 'b11',
  'public-store-backend-candidate-preflight-20260813.json');

function fail(message) {
  throw new Error(message);
}

export function validatePublicStoreBackendCandidatePreflight(evidence) {
  if (evidence?.schemaVersion !== 1 ||
      evidence?.kind !== 'public-store-backend-candidate-preflight') {
    fail('Unexpected public-store backend preflight schema.');
  }
  if (evidence.status !== 'passed-production-mode-isolated-awaiting-production-approval') {
    fail('The candidate must remain an isolated preflight awaiting production approval.');
  }
  if (!/^[0-9a-f]{40}$/u.test(evidence.candidate?.commit ?? '') ||
      evidence.candidate?.deploymentEnvironment !== 'production') {
    fail('The candidate is not bound to an exact production-mode commit.');
  }
  const commit = evidence.candidate.commit;
  const expectedImage = `ghcr.io/walidwalidchraibi-dot/shareittoo-api:${commit}`;
  const expectedVersion = `0.1.0-${commit.slice(0, 12)}`;
  const imageId = evidence.candidate?.imageId ?? '';
  const expectedDigest = `ghcr.io/walidwalidchraibi-dot/shareittoo-api@${imageId}`;
  if (evidence.candidate?.image !== expectedImage ||
      evidence.candidate?.version !== expectedVersion ||
      !/^sha256:[0-9a-f]{64}$/u.test(imageId) ||
      evidence.candidate?.repositoryDigest !== expectedDigest) {
    fail('The image tag, immutable digest, or version is not bound to the exact commit.');
  }
  const runtime = evidence.isolatedRuntime;
  for (const field of [
    'freshEphemeralPostgres',
    'temporaryResourcesRemoved',
  ]) {
    if (runtime?.[field] !== true) fail(`Isolated runtime proof is missing: ${field}`);
  }
  for (const field of ['productionDataMounted', 'stagingDataMounted']) {
    if (runtime?.[field] !== false) fail(`Data isolation must remain false: ${field}`);
  }
  if (!Number.isInteger(runtime?.schemaMigrationsApplied) ||
      runtime.schemaMigrationsApplied < 1 ||
      runtime.readiness !== 'passed' ||
      runtime.versionIdentity !== 'passed-exact-commit') {
    fail('Runtime migration, readiness, or identity proof is incomplete.');
  }
  if (runtime.routes?.support !== '503-draft' ||
      runtime.routes?.privacy !== '503-draft' ||
      runtime.routes?.accountDeletion !== '200-operational') {
    fail('The fail-closed public route contract is not proven.');
  }
  if (runtime.mailTransport !== 'memory' ||
      runtime.pushTransport !== 'disabled' ||
      runtime.paymentTransport !== 'disabled' ||
      runtime.stripeLivemode !== false) {
    fail('The isolated preflight used an unsafe external transport.');
  }
  if (evidence.liveStateAfterPreflight?.productionApi !== 'healthy-unchanged' ||
      evidence.liveStateAfterPreflight?.stagingApi !== 'healthy-unchanged') {
    fail('The live environments were not proven healthy and unchanged.');
  }
  if (evidence.liveStateAfterPreflight?.temporaryContainersRemaining !== 0 ||
      evidence.liveStateAfterPreflight?.temporaryNetworksRemaining !== 0 ||
      !/^[0-9a-f]{64}$/u.test(
        evidence.liveStateAfterPreflight?.deployedCaddySha256 ?? '',
      )) {
    fail('Temporary-resource cleanup or unchanged Caddy evidence is incomplete.');
  }
  if (evidence.gates?.compatibleProductionBackendCandidateReady !== true) {
    fail('The compatible candidate result is missing.');
  }
  for (const field of [
    'productionBackendDeploymentApproved',
    'productionRouteActivationApproved',
    'publicSupportUrlReady',
    'publicPrivacyUrlReady',
    'publicAccountDeletionUrlReady',
    'legalContentApproved',
    'storeSubmissionAllowed',
  ]) {
    if (evidence.gates?.[field] !== false) fail(`Gate must remain closed: ${field}`);
  }
  for (const field of [
    'productionChanged',
    'stagingChanged',
    'caddyChanged',
    'dnsChanged',
    'mailChanged',
    'cronChanged',
    'paymentsChanged',
    'containsSecrets',
    'containsPersonalAccountData',
    'containsRawDeviceIdentifiers',
  ]) {
    if (evidence.boundaries?.[field] !== false) fail(`Boundary must remain false: ${field}`);
  }
  return {
    status: evidence.status,
    commit,
    imageDigest: evidence.candidate.repositoryDigest,
    routesVerified: true,
    liveEnvironmentsUnchanged: true,
    productionDeploymentApproved: false,
  };
}

function run() {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  console.log(JSON.stringify(validatePublicStoreBackendCandidatePreflight(evidence), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
