import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validatePilotLaunchTiers } from '../../tool/validate_pilot_launch_tiers.mjs';

const matrix = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/pilot-launch-tier-matrix.json',
    import.meta.url,
  ),
  'utf8',
));
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function copy(value) {
  return structuredClone(value);
}

test('accepts exactly three cumulative tiers while all activation stays off', () => {
  assert.deepEqual(validatePilotLaunchTiers(), {
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
});

test('strict Stage A mode fails closed on missing external decision evidence', () => {
  assert.throws(
    () => validatePilotLaunchTiers({ requireStageAReady: true }),
    /stage_a_not_ready:external-evidence-and-explicit-decision-required/u,
  );
});

test('rejects public registration, real money or a live PSP in Stage A', () => {
  const changed = copy(matrix);
  changed.tiers[0].payment.realMoney = true;
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changed }),
    /stage_a_payment_boundary_invalid/u,
  );

  const changedRegistration = copy(matrix);
  changedRegistration.tiers[0].audience.publicRegistration = true;
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changedRegistration }),
    /stage_a_audience_invalid/u,
  );
});

test('binds the invited Stage A region, catalog and planning ceilings', () => {
  const changed = copy(matrix);
  changed.tiers[0].plannedFlows.maximum = 51;
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changed }),
    /stage_a_flow_plan_invalid/u,
  );

  const changedCatalog = copy(matrix);
  changedCatalog.tiers[0].catalog.categoryCodes.pop();
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changedCatalog }),
    /stage_a_catalog_invalid/u,
  );
});

test('cannot admit G3-G5 without all three separate entry requirements', () => {
  const changed = copy(matrix);
  changed.tiers[0].productScope.conditionalEntryRequirements.pop();
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changed }),
    /g3_g5_entry_gate_invalid/u,
  );
});

test('keeps Stage B cumulative and disabled with eight authentic sandbox proofs open', () => {
  const changed = copy(matrix);
  changed.tiers[1].inherits = null;
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changed }),
    /stage_b_identity_invalid/u,
  );

  const changedPayment = copy(matrix);
  changedPayment.tiers[1].payment.sandboxScenarioPassedCount = 8;
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changedPayment }),
    /stage_b_payment_boundary_invalid/u,
  );
});

test('keeps Stage C public distribution and every external mutation disabled', () => {
  const changed = copy(matrix);
  changed.tiers[2].distribution.publicStoreLaunch = true;
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changed }),
    /stage_c_distribution_boundary_invalid/u,
  );

  const changedBoundary = copy(matrix);
  changedBoundary.boundaries.pilotActivated = true;
  assert.throws(
    () => validatePilotLaunchTiers({ matrixOverride: changedBoundary }),
    /external_boundary_invalid/u,
  );
});

test('complete regression permanently executes the tier validator', () => {
  assert.match(
    regression,
    /node --check tool\/validate_pilot_launch_tiers\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_pilot_launch_tiers\.test\.mjs/u,
  );
  assert.match(regression, /node tool\/validate_pilot_launch_tiers\.mjs/u);
});
