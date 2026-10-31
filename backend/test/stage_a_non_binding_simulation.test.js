import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canTransitionWorkflow,
  nonBindingPilotLifecycleEnabled,
  nonBindingSimulationTransitionAllowed,
  nonBindingTestLifecycleEnabled,
} from '../src/booking_domain.js';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const workflow = read('../src/booking_workflow.js');
const payment = read('../src/payment_workflow.js');
const notifications = read('../src/notifications.js');
const config = read('../src/config.js');
const app = read('../src/app.js');
const up = read('../sql/migrations/070_stage_a_non_binding_simulation_guard.up.sql');
const down = read('../sql/migrations/070_stage_a_non_binding_simulation_guard.down.sql');

test('simulation activation is derived only from test or staging pilot configuration', () => {
  assert.match(
    config,
    /deploymentEnvironment === 'staging' \|\| deploymentEnvironment === 'test'[\s\S]*bookingPilotMode === 'pilot'[\s\S]*privatePilotV4Enabled/u,
  );
  assert.match(app, /allowNonBindingSimulation: config\.nonBindingSimulationEnabled/u);
  assert.doesNotMatch(config, /NON_BINDING_SIMULATION_ENABLED/u);
});

test('simulation creation is explicit and skips binding contract declarations', () => {
  assert.match(workflow, /candidate\.simulationOnly === true/u);
  assert.match(workflow, /candidate\.simulationAcknowledged !== true/u);
  assert.match(workflow, /requireDeclaration: !simulationOnly/u);
  assert.match(workflow, /privatePilot && !simulationOnly[\s\S]*requireFreshBookingQuote/u);
  assert.match(workflow, /if \(privatePilot && !simulationOnly\)[\s\S]*persistV52PlatformContract/u);
  assert.match(workflow, /contractCreated: false/u);
  assert.match(workflow, /reservationCreated: false/u);
  assert.match(workflow, /monetaryEffectMinor: 0/u);
  assert.match(workflow, /nonBindingPilotLifecycleEnabled\(config\)/u);
  assert.match(workflow, /nonBindingSimulationTransitionAllowed\(/u);
  assert.match(workflow, /\(!simulationOnly \|\| pilotSimulationLifecycle\)/u);
  assert.match(workflow, /pilot_simulation_transition_forbidden/u);
  assert.match(workflow, /contractCreated: false/u);
  assert.match(workflow, /paymentCreated: false/u);
  assert.match(workflow, /reservationCreated: false/u);
  assert.match(workflow, /monetaryEffectMinor: 0/u);
});

test('full non-binding lifecycle requires staging or test and the existing pilot gate', () => {
  assert.equal(nonBindingPilotLifecycleEnabled({
    deploymentEnvironment: 'test', nonBindingSimulationEnabled: true,
  }), true);
  assert.equal(nonBindingPilotLifecycleEnabled({
    deploymentEnvironment: 'staging', nonBindingSimulationEnabled: true,
  }), true);
  assert.equal(nonBindingPilotLifecycleEnabled({
    deploymentEnvironment: 'production', nonBindingSimulationEnabled: true,
  }), false);
  assert.equal(nonBindingPilotLifecycleEnabled({
    deploymentEnvironment: 'test', nonBindingSimulationEnabled: false,
  }), false);
  for (const deploymentEnvironment of ['staging', 'test']) {
    const gatedConfig = { deploymentEnvironment, nonBindingSimulationEnabled: true };
    assert.equal(nonBindingSimulationTransitionAllowed({
      simulationOnly: true, requested: 'accepted', config: gatedConfig,
    }), true);
    assert.equal(nonBindingSimulationTransitionAllowed({
      simulationOnly: true, requested: 'active', config: gatedConfig,
    }), true);
    assert.equal(nonBindingSimulationTransitionAllowed({
      simulationOnly: true, requested: 'completed', config: gatedConfig,
    }), true);
    assert.equal(nonBindingSimulationTransitionAllowed({
      simulationOnly: true, requested: 'confirmed', config: gatedConfig,
    }), false);
  }
  assert.equal(nonBindingSimulationTransitionAllowed({
    simulationOnly: true, requested: 'active',
    config: { deploymentEnvironment: 'production', nonBindingSimulationEnabled: true },
  }), false);
  assert.equal(nonBindingSimulationTransitionAllowed({
    simulationOnly: true, requested: 'completed',
    config: { deploymentEnvironment: 'test', nonBindingSimulationEnabled: false },
  }), false);
  assert.equal(nonBindingTestLifecycleEnabled({
    deploymentEnvironment: 'staging', nonBindingSimulationEnabled: true,
  }), false);
  assert.equal(canTransitionWorkflow({
    current: 'requested', next: 'active', actorRole: 'renter', pilotWithoutPayment: true,
  }), false);
  assert.equal(canTransitionWorkflow({
    current: 'requested', next: 'completed', actorRole: 'owner', pilotWithoutPayment: true,
  }), false);
  assert.equal(canTransitionWorkflow({
    current: 'accepted', next: 'confirmed', actorRole: 'renter', pilotWithoutPayment: true,
  }), true);
  assert.equal(canTransitionWorkflow({
    current: 'confirmed', next: 'active', actorRole: 'renter', pilotWithoutPayment: true,
  }), true);
  assert.equal(canTransitionWorkflow({
    current: 'active', next: 'returned', actorRole: 'owner', pilotWithoutPayment: true,
  }), true);
  assert.equal(canTransitionWorkflow({
    current: 'returned', next: 'completed', actorRole: 'owner', pilotWithoutPayment: true,
  }), true);
  assert.match(app, /allowNonBindingSimulation: config\.nonBindingSimulationEnabled/u);
  assert.match(app, /createBookingReview\(client,[\s\S]*config,[\s\S]*idempotencyKey: req\.get\('Idempotency-Key'\)/u);
  assert.match(read('../src/moderation_workflow.js'), /pilot_simulation_review_forbidden/u);
});

test('simulation never blocks availability or creates financial effects', () => {
  assert.ok((workflow.match(/simulation_only = false/gu) ?? []).length >= 4);
  assert.match(payment, /pilot_simulation_payment_forbidden/u);
  assert.match(up, /ADD COLUMN IF NOT EXISTS simulation_only BOOLEAN NOT NULL DEFAULT false/u);
  for (const table of [
    'payments',
    'payouts',
    'disputes',
    'payment_commands',
    'platform_contracts',
    'deposit_mandates',
    'deposit_charges',
    'v51_refund_obligations',
    'v51_cancellation_refund_obligations',
    'v52_actual_loss_cases',
    'financial_documents',
  ]) {
    assert.match(up, new RegExp(`ON ${table}`, 'u'));
  }
  assert.match(up, /stage_a_simulation_side_effect_forbidden/u);
  assert.match(down, /DROP FUNCTION IF EXISTS sit_reject_simulation_booking_side_effect/u);
});

test('simulation notifications are labelled and never fan out by email', () => {
  assert.match(notifications, /Pilot-Simulation/u);
  assert.match(
    notifications,
    /channels: simulationOnly \? \['in_app', 'push'\] : \['in_app', 'email', 'push'\]/u,
  );
  assert.match(notifications, /payload: \{ role, workflowStatus, simulationOnly \}/u);
});
