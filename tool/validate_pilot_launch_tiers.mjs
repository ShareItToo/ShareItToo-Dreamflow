#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const matrixPath =
  'docs/evidence/external-gates/pilot-launch-tier-matrix.json';
const runbookPath = 'docs/operations/PILOT_AND_LAUNCH_TIERS.md';

const evidenceLevels = Object.freeze([
  'technically-implemented',
  'technically-tested',
  'externally-evidenced',
  'professionally-approved',
  'pilot-approved',
  'real-money-approved',
  'public-launch-approved',
]);
const stageACategories = Object.freeze([
  'cat8/Elektrowerkzeuge',
  'cat8/Bohrmaschinen',
  'cat8/Schleifer',
]);
const stageAIncluded = Object.freeze([
  'v5.2-single-item-rental',
  'discover',
  'non-reserving-rental-cart',
  'gemerkt',
  'existing-booking-handover-return-support',
]);
const conditionalEntryRequirements = Object.freeze([
  'professional-review-new-g3-legal-document-version',
  'required-privacy-and-contract-decisions',
  'separate-explicit-walid-expanded-pilot-approval',
]);
const stageBRequirements = Object.freeze([
  'selected-and-contractually-reviewed-marketplace-psp',
  'authentic-kyc-and-onboarding-facts',
  'dpa-region-transfer-and-contract-review',
  'eight-authentic-sandbox-e2e-scenarios',
  'refund-chargeback-payout-and-ledger-evidence',
  'confirmed-tax-and-accounting-logic',
  'separate-explicit-walid-real-money-approval',
]);
const stageCRequirements = Object.freeze([
  'store-approvals',
  'complete-operator-and-consumer-information',
  'authentic-operations-and-support-staffing',
  'roles-delegates-and-absence-tests',
  'complete-provider-privacy-and-retention-approvals',
  'authentic-unit-economics',
  'monitoring-and-incident-runbooks',
  'separate-explicit-public-activation-decision',
]);

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function same(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function inspectSensitiveKeys(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSensitiveKeys(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assertCondition(
      !/^(password|secret|token|email|accountid|credential|personname|deviceid)$/iu.test(key),
      `sensitive_field_forbidden:${[...trail, key].join('.')}`,
    );
    inspectSensitiveKeys(entry, [...trail, key]);
  }
}

export function validatePilotLaunchTiers({
  matrixOverride,
  requireStageAReady = false,
} = {}) {
  const matrix = matrixOverride ?? readJson(matrixPath);
  inspectSensitiveKeys(matrix);

  assertCondition(matrix.schemaVersion === 1, 'schema_version_invalid');
  assertCondition(matrix.kind === 'sit-pilot-launch-tier-matrix', 'kind_invalid');
  assertCondition(matrix.state === 'pilot-freeze-hold-no-go', 'state_invalid');
  assertCondition(
    matrix.freezeBaseline?.ref === 'docs/operations/PILOT_FREEZE_BASELINE.md',
    'freeze_baseline_ref_invalid',
  );
  assertCondition(
    /^[0-9a-f]{40}$/u.test(matrix.freezeBaseline?.controlCommit ?? ''),
    'freeze_control_commit_invalid',
  );
  assertCondition(
    Number.isInteger(matrix.freezeBaseline?.regressionRun)
      && Number.isInteger(matrix.freezeBaseline?.codeqlRun),
    'freeze_ci_runs_invalid',
  );
  assertCondition(same(matrix.evidenceLevels, evidenceLevels), 'evidence_levels_invalid');
  assertCondition(Array.isArray(matrix.tiers) && matrix.tiers.length === 3, 'tier_count_invalid');

  const [stageA, stageB, stageC] = matrix.tiers;
  assertCondition(
    stageA.id === 'stage_a' && stageA.order === 1 && stageA.inherits === null,
    'stage_a_identity_invalid',
  );
  assertCondition(
    stageA.state === 'hold-explicit-decision-required'
      && stageA.activationDecision === 'PILOT_STAGE_A_DECISION',
    'stage_a_hold_invalid',
  );
  assertCondition(
    stageA.audience?.invitationMode === 'private-invitation-only'
      && stageA.audience.maximumAdults === 30
      && stageA.audience.publicRegistration === false,
    'stage_a_audience_invalid',
  );
  assertCondition(
    stageA.geography?.recommendedRegion === 'spiegelberg'
      && stageA.geography.configured === false,
    'stage_a_geography_invalid',
  );
  assertCondition(same(stageA.catalog?.categoryCodes, stageACategories), 'stage_a_catalog_invalid');
  assertCondition(
    ['vehicles', 'delivery', 'shipping', 'express']
      .every((key) => stageA.catalog?.[key] === false),
    'stage_a_catalog_boundary_invalid',
  );
  assertCondition(
    stageA.plannedFlows?.minimum === 30
      && stageA.plannedFlows.maximum === 50
      && stageA.plannedFlows.observedCompleted === null,
    'stage_a_flow_plan_invalid',
  );
  assertCondition(
    stageA.payment?.mode === 'synthetic-or-test-based'
      && stageA.payment.realMoney === false
      && stageA.payment.livePsp === false
      && stageA.payment.multiLenderPayment === false,
    'stage_a_payment_boundary_invalid',
  );
  assertCondition(
    stageA.distribution?.platform === 'android'
      && stageA.distribution.publicStoreLaunch === false,
    'stage_a_distribution_invalid',
  );
  assertCondition(same(stageA.productScope?.included, stageAIncluded), 'stage_a_scope_invalid');
  assertCondition(
    same(stageA.productScope?.conditionallyExcluded, ['g3', 'g4', 'g5'])
      && same(stageA.productScope?.conditionalEntryRequirements, conditionalEntryRequirements),
    'g3_g5_entry_gate_invalid',
  );
  assertCondition(
    ['sit-business', 'global-expansion', 'production-external-ai',
      'multi-lender-payment', 'public-registration', 'vehicles', 'delivery',
      'shipping', 'express']
      .every((scope) => stageA.productScope?.excluded?.includes(scope)),
    'stage_a_exclusion_invalid',
  );

  assertCondition(
    stageB.id === 'stage_b' && stageB.order === 2 && stageB.inherits === 'stage_a',
    'stage_b_identity_invalid',
  );
  assertCondition(
    stageB.state === 'hold-additional-payment-gates-required'
      && stageB.activationDecision === 'PILOT_STAGE_B_REAL_MONEY_DECISION',
    'stage_b_hold_invalid',
  );
  assertCondition(same(stageB.additionalRequirements, stageBRequirements), 'stage_b_requirements_invalid');
  assertCondition(
    stageB.payment?.realMoney === false
      && stageB.payment.livePsp === false
      && stageB.payment.sandboxScenarioRequiredCount === 8
      && stageB.payment.sandboxScenarioPassedCount === 0,
    'stage_b_payment_boundary_invalid',
  );

  assertCondition(
    stageC.id === 'stage_c' && stageC.order === 3 && stageC.inherits === 'stage_b',
    'stage_c_identity_invalid',
  );
  assertCondition(
    stageC.state === 'hold-additional-public-launch-gates-required'
      && stageC.activationDecision === 'PILOT_STAGE_C_PUBLIC_LAUNCH_DECISION',
    'stage_c_hold_invalid',
  );
  assertCondition(same(stageC.additionalRequirements, stageCRequirements), 'stage_c_requirements_invalid');
  assertCondition(allFalse(stageC.distribution), 'stage_c_distribution_boundary_invalid');

  assertCondition(
    same(matrix.summary, {
      tierCount: 3,
      activatedTierCount: 0,
      externallyReadyGateCount: 0,
      requiredExternalGateCount: 11,
      currentHighestApprovedTier: null,
      releaseDecision: 'hold-no-go',
    }),
    'summary_invalid',
  );
  assertCondition(allFalse(matrix.boundaries), 'external_boundary_invalid');
  assertCondition(Array.isArray(matrix.sourceRefs) && matrix.sourceRefs.length >= 10, 'source_refs_missing');
  for (const reference of matrix.sourceRefs) {
    assertCondition(
      typeof reference === 'string'
        && !path.isAbsolute(reference)
        && !reference.includes('..')
        && existsSync(path.join(root, reference)),
      `source_ref_invalid:${reference}`,
    );
  }

  const external = readJson('docs/evidence/external-gates/technical-setup-manifest.json');
  assertCondition(external.summary?.requiredGateCount === 11, 'external_gate_count_drift');
  assertCondition(external.summary?.externallyReadyGateCount === 0, 'external_gate_readiness_drift');
  assertCondition(external.releaseDecision === 'hold-no-go', 'external_release_decision_drift');

  const dossier = readJson('docs/evidence/p0b/pilot-go-no-go-dossier.json');
  assertCondition(dossier.finalGate?.goNow === false, 'pilot_go_drift');
  assertCondition(dossier.finalGate?.autoContinue === false, 'pilot_autocontinue_drift');

  const pilot = readJson(
    'docs/evidence/p0b-next/invited-synthetic-pilot-spiegelberg-cat8-readiness.json',
  );
  assertCondition(pilot.evaluation?.controlledPilotEligible === false, 'pilot_eligibility_drift');
  assertCondition(allFalse(pilot.boundaries), 'pilot_boundary_drift');

  const psp = readJson('docs/evidence/p0b-next/psp-sandbox-e2e-evidence.json');
  assertCondition(psp.scenarios?.length === 8, 'psp_scenario_count_drift');
  assertCondition(psp.evaluation?.passedScenarioCount === 0, 'psp_scenario_state_drift');
  assertCondition(allFalse(psp.boundaries), 'psp_boundary_drift');

  const runbook = readFileSync(path.join(root, runbookPath), 'utf8');
  for (const marker of [
    'Stage A — closed Android pilot without real money',
    'Stage B — closed Echtgeldpilot',
    'Stage C — public regional launch',
    'PILOT_STAGE_A_DECISION',
    'PILOT_STAGE_B_REAL_MONEY_DECISION',
    'PILOT_STAGE_C_PUBLIC_LAUNCH_DECISION',
  ]) {
    assertCondition(runbook.includes(marker), `runbook_marker_missing:${marker}`);
  }

  if (requireStageAReady) throw new Error('stage_a_not_ready:external-evidence-and-explicit-decision-required');

  return Object.freeze({
    status: 'pilot-freeze-hold',
    tierCount: 3,
    activatedTierCount: 0,
    stageAAdultCeiling: 30,
    stageAPlannedFlowMinimum: 30,
    stageAPlannedFlowMaximum: 50,
    stageBSandboxScenarioRequiredCount: 8,
    externallyReadyGateCount: 0,
    releaseDecision: 'hold-no-go',
  });
}

function runCli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--require-stage-a-ready']);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown !== undefined) throw new Error(`unknown_argument:${unknown}`);
  const result = validatePilotLaunchTiers({
    requireStageAReady: args.includes('--require-stage-a-ready'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
