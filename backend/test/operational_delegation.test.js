import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOperationalDelegationCockpit } from '../src/operational_delegation.js';

test('FI1 cockpit summary is role-based, fail-closed and separates founder reporting', () => {
  const summary = buildOperationalDelegationCockpit();
  assert.equal(summary.state, 'hold-external-role-assignments');
  assert.equal(summary.namedPersonDependencyAllowed, false);
  assert.equal(summary.assignmentEvidenceAvailable, false);
  assert.equal(summary.absenceTestsPassed, false);
  assert.deepEqual(summary.technicalRehearsal, {
    state: 'passed-synthetic-configuration-only',
    processesPassed: 4,
    realPeopleUsed: false,
    realUserDataUsed: false,
    productionMutationUsed: false,
  });
  assert.deepEqual(summary.humanGate, {
    state: 'not-started',
    assignedRoles: 0,
    requiredRoles: 6,
    absenceTestsPassed: 0,
    requiredAbsenceTests: 4,
    operationsReady: false,
  });
  assert.deepEqual(
    summary.processes.map((process) => process.processId),
    [
      'booking_group_operations',
      'project_planner_operations',
      'evidence_and_needs_review_operations',
      'support_escalation_operations',
    ],
  );
  assert.ok(summary.processes.every((process) => process.readiness === 'hold'));
  assert.ok(summary.processes.every(
    (process) => process.ownerRoleId !== process.delegateRoleId,
  ));
  assert.deepEqual(summary.reportingSeparation, {
    normalOperationsPath: 'projectFunnel',
    founderHoursPath: 'founderIndependence.hoursByCategory',
    founderEscalationsPath: 'founderIndependence.escalations',
    blended: false,
  });
  assert.doesNotMatch(JSON.stringify(summary), /(?:email|userId|device|Walid|Chraibi)/iu);
});

test('FI1 cockpit summaries are returned as independent values', () => {
  const first = buildOperationalDelegationCockpit();
  first.processes[0].readiness = 'ready';
  const second = buildOperationalDelegationCockpit();
  assert.equal(second.processes[0].readiness, 'hold');
});
