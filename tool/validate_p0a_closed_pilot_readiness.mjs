#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const matrixPath = 'docs/evidence/p0a/closed-pilot-readiness-matrix.json';

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length
      || value.some((entry, index) => entry !== expected[index])) {
    fail(`${label} does not match the approved P0A contract.`);
  }
}

function source(root, relativePath, overrides) {
  if (Object.hasOwn(overrides, relativePath)) return String(overrides[relativePath]);
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function requireIncludes(contents, expected, label) {
  if (!contents.includes(expected)) fail(`${label} is missing ${expected}.`);
}

export function validateP0AClosedPilotReadiness({
  root = defaultRoot,
  matrix = undefined,
  sourceOverrides = {},
  pathExists = existsSync,
} = {}) {
  const readiness = object(
    matrix ?? JSON.parse(source(root, matrixPath, sourceOverrides)),
    'P0A readiness matrix',
  );
  if (readiness.schemaVersion !== 1
      || readiness.kind !== 'p0a-closed-pilot-technical-readiness'
      || readiness.state !== 'hold-current-source-physical-device-and-external-gates') {
    fail('P0A identity or fail-closed state is invalid.');
  }

  const binding = object(readiness.source, 'source');
  if (binding.drivePackage !== '02_CODEX_WORK_PACKAGES_SIT_V2.4.md'
      || binding.baselineFi1Commit !== 'a732ebaa257462fe2292232c779906d4331b0321'
      || binding.baselineFi1CiRun !== '32431950081') {
    fail('P0A is not bound to the exact FI1 and V2.4 baseline.');
  }
  exactArray(binding.requirements, [
    'P0A-001-three-path-e2e-matrix',
    'P0A-002-synthetic-payment-only',
    'P0A-003-cross-cutting-regression',
    'P0A-004-current-device-and-web-evidence',
    'P0A-005-no-unauthorized-provider-traffic',
  ], 'source.requirements');

  const constraints = object(readiness.constraints, 'constraints');
  for (const field of [
    'publicRolloutAllowed',
    'realMoneyAllowed',
    'liveExternalProviderTrafficAllowed',
    'storeSubmissionAllowed',
    'signedCandidateAllowed',
    'productionMutationAllowed',
    'destructiveDeviceActionAllowed',
  ]) {
    if (constraints[field] !== false) fail(`P0A boundary must remain false: ${field}`);
  }

  const payment = object(readiness.paymentBoundary, 'paymentBoundary');
  if (payment.mode !== 'synthetic-test-provider-only'
      || payment.stripeLivemode !== false
      || payment.realPaymentExecutionAllowed !== false
      || payment.liveProviderTrafficExecuted !== false
      || payment.productionDefault !== 'disabled'
      || payment.stagingDefault !== 'memory') {
    fail('P0A payment boundary permits real money or live provider traffic.');
  }

  const expectedCells = [
    ['single_item_path', 'passed'],
    ['same_owner_multi_item_path', 'passed'],
    ['project_cart_planner_path', 'passed'],
    ['account_lifecycle', 'passed'],
    ['cancellation', 'passed'],
    ['withdrawal', 'passed'],
    ['handover_return', 'passed'],
    ['needs_review', 'passed'],
    ['export_deletion', 'passed'],
    ['recovery_tooling', 'passed'],
    ['synthetic_payment_boundary', 'passed'],
    ['web_current_source', 'passed'],
    ['android_debug_build', 'passed'],
    ['pixel_current_source', 'blocked'],
    ['pixel_historical_evidence', 'historical'],
    ['signed_current_candidate', 'not_applicable'],
  ];
  const allowedStatuses = new Set(['passed', 'blocked', 'historical', 'not_applicable']);
  if (!Array.isArray(readiness.matrix) || readiness.matrix.length !== expectedCells.length) {
    fail('P0A must define exactly sixteen readiness cells.');
  }
  const counts = { passed: 0, blocked: 0, historical: 0, not_applicable: 0 };
  for (const [index, cell] of readiness.matrix.entries()) {
    const [expectedId, expectedStatus] = expectedCells[index];
    if (cell?.id !== expectedId || cell.status !== expectedStatus
        || !allowedStatuses.has(cell.status)
        || typeof cell.area !== 'string' || cell.area.trim() === ''
        || typeof cell.featureState !== 'string' || cell.featureState.trim() === ''
        || typeof cell.scope !== 'string' || cell.scope.trim() === '') {
      fail(`P0A matrix cell ${expectedId} has an invalid identity, status or scope.`);
    }
    if (!Array.isArray(cell.evidenceRefs) || cell.evidenceRefs.length === 0) {
      fail(`P0A matrix cell ${expectedId} has no evidence.`);
    }
    for (const evidenceRef of cell.evidenceRefs) {
      if (typeof evidenceRef !== 'string' || evidenceRef.trim() === '') {
        fail(`P0A matrix cell ${expectedId} has an invalid evidence reference.`);
      }
      if (!evidenceRef.startsWith('runtime:')
          && !Object.hasOwn(sourceOverrides, evidenceRef)
          && !pathExists(resolve(root, evidenceRef))) {
        fail(`P0A evidence reference does not exist: ${evidenceRef}`);
      }
    }
    counts[cell.status] += 1;
  }
  const declaredCounts = object(readiness.statusCounts, 'statusCounts');
  for (const [status, count] of Object.entries(counts)) {
    if (declaredCounts[status] !== count) fail(`P0A status count is invalid: ${status}`);
  }

  const currentDevice = readiness.matrix.find((cell) => cell.id === 'pixel_current_source');
  if (currentDevice.status !== 'blocked' || currentDevice.currentSourceBound !== false
      || currentDevice.deviceIdentifiersRecorded !== false
      || !currentDevice.blocker.includes('different signature')
      || !currentDevice.blocker.includes('preserving installed data')) {
    fail('P0A current-source Pixel evidence must remain honestly blocked.');
  }
  const candidate = readiness.matrix.find((cell) => cell.id === 'signed_current_candidate');
  if (candidate.status !== 'not_applicable'
      || candidate.featureState !== 'outside-p0a-authorization') {
    fail('P0A cannot claim a signed current candidate.');
  }

  const policy = object(readiness.evidencePolicy, 'evidencePolicy');
  for (const field of [
    'historicalEvidenceSatisfiesCurrentSource',
    'missingEvidenceCountsAsPass',
    'blockedCellMayBeHidden',
    'deviceIdentifiersAllowed',
  ]) {
    if (policy[field] !== false) fail(`P0A evidence policy must remain false: ${field}`);
  }
  const gates = object(readiness.externalGates, 'externalGates');
  const expectedGates = {
    currentSourcePhysicalDevice: 'open-signature-preservation',
    signedCandidate: 'not-authorized',
    legalApproval: 'open',
    realPaymentAndProvider: 'open-not-authorized',
    operationalStaffingAndAbsenceTests: 'open',
    publicPilotActivation: 'not-authorized',
  };
  for (const [gate, state] of Object.entries(expectedGates)) {
    if (gates[gate] !== state) fail(`P0A external gate is invalid: ${gate}`);
  }

  const jsonKeys = [];
  JSON.stringify(readiness, (key, value) => {
    if (key) jsonKeys.push(key);
    return value;
  });
  const forbiddenDeviceKeys = new Set(['serial', 'serialNumber', 'androidId', 'deviceId']);
  if (jsonKeys.some((key) => forbiddenDeviceKeys.has(key))) {
    fail('P0A evidence contains a forbidden raw device identifier field.');
  }

  const privatePilot = source(root, 'lib/config/private_pilot_config.dart', sourceOverrides);
  const productionCompose = source(root, 'backend/compose.prod.yml', sourceOverrides);
  const stagingCompose = source(root, 'backend/compose.staging.yml', sourceOverrides);
  const deviceValidation = JSON.parse(
    source(root, 'store/device-validation.json', sourceOverrides),
  );
  requireIncludes(privatePilot, 'realPaymentsEnabled = false', 'private pilot config');
  requireIncludes(productionCompose, 'PAYMENT_TRANSPORT: ${PAYMENT_TRANSPORT:-disabled}',
    'production compose');
  requireIncludes(productionCompose, 'STRIPE_LIVEMODE: ${STRIPE_LIVEMODE:-false}',
    'production compose');
  requireIncludes(stagingCompose, 'PAYMENT_TRANSPORT: ${PAYMENT_TRANSPORT:-memory}',
    'staging compose');
  requireIncludes(stagingCompose, 'STRIPE_LIVEMODE: ${STRIPE_LIVEMODE:-false}',
    'staging compose');
  if (deviceValidation.candidate?.paymentMode !== 'memory'
      || deviceValidation.candidate?.stripeLivemode !== false) {
    fail('Device-validation payment boundary is not synthetic and fail-closed.');
  }

  const regression = source(root, 'scripts/technical_regression_check.sh', sourceOverrides);
  requireIncludes(regression, 'node tool/validate_p0a_closed_pilot_readiness.mjs',
    'technical regression');
  requireIncludes(regression, 'bash scripts/p0a_web_smoke.sh', 'technical regression');

  return {
    state: readiness.state,
    cells: readiness.matrix.length,
    passed: counts.passed,
    blocked: counts.blocked,
    historical: counts.historical,
    notApplicable: counts.not_applicable,
    realMoneyAllowed: false,
    liveProviderTrafficExecuted: false,
  };
}

function run() {
  const result = validateP0AClosedPilotReadiness();
  console.log(
    `P0A closed-pilot readiness: PASS (state=${result.state}, cells=${result.cells}, `
      + `passed=${result.passed}, blocked=${result.blocked}, historical=${result.historical}, `
      + `notApplicable=${result.notApplicable}, realMoney=false, liveProviderTraffic=false)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error?.message ?? 'P0A validation failed.'}`);
    process.exitCode = 1;
  }
}
