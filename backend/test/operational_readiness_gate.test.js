import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OperationalReadinessGateError,
  evaluateOperationalReadinessGate,
  operationalReadinessRequirements,
} from '../src/operational_readiness_gate.js';

function openRoleAssignments() {
  return operationalReadinessRequirements.roleIds.map((roleId) => ({
    roleId,
    primaryPrincipalRef: null,
    delegatePrincipalRef: null,
    companySystemRef: null,
    primaryRbacEvidenceRef: null,
    delegateRbacEvidenceRef: null,
    primaryMfaVerified: false,
    delegateMfaVerified: false,
    ownerApproved: false,
  }));
}

function technicalOnlyTests() {
  return operationalReadinessRequirements.processes.map((process, index) => ({
    ...process,
    technicalRehearsalId: `P0B-OPS-TR-0${index + 1}`,
    technicalRehearsalPassed: true,
    syntheticOnly: true,
    namedPersonDependencyObserved: false,
    humanAbsenceTestPassed: false,
    absenceWindowHours: null,
    startedAt: null,
    endedAt: null,
    auditEvidenceRef: null,
    founderOperationalActionObserved: null,
    realUserDataUsed: false,
    realMoneyUsed: false,
    productionMutationUsed: false,
  }));
}

test('reports technical rehearsal separately from missing people and absence evidence', () => {
  assert.deepEqual(evaluateOperationalReadinessGate({
    roleAssignments: openRoleAssignments(),
    processAbsenceTests: technicalOnlyTests(),
  }), {
    state: 'hold-external-assignments-and-human-absence-tests',
    requiredRoleCount: 6,
    assignedRoleCount: 0,
    soleFounderPrimaryRoleMappings: 0,
    requiredProcessCount: 4,
    technicalRehearsalsPassed: 4,
    humanAbsenceTestsPassed: 0,
    assignmentsReady: false,
    technicalRehearsalReady: true,
    humanAbsenceReady: false,
    busFactorEvidenced: false,
    operationsReady: false,
  });
});

test('accepts only complete distinct company-system assignments and 72-hour evidence', () => {
  const roleAssignments = openRoleAssignments().map((assignment, index) => ({
    ...assignment,
    primaryPrincipalRef: `company:person:primary-${index}`,
    delegatePrincipalRef: `company:person:delegate-${index}`,
    companySystemRef: 'company-system:iam',
    primaryRbacEvidenceRef: `evidence:primary-${index}`,
    delegateRbacEvidenceRef: `evidence:delegate-${index}`,
    primaryMfaVerified: true,
    delegateMfaVerified: true,
    ownerApproved: true,
  }));
  const processAbsenceTests = technicalOnlyTests().map((entry, index) => ({
    ...entry,
    humanAbsenceTestPassed: true,
    absenceWindowHours: 72,
    startedAt: '2026-08-21T00:00:00Z',
    endedAt: '2026-08-24T00:00:00Z',
    auditEvidenceRef: `company-audit:absence-${index}`,
    founderOperationalActionObserved: false,
  }));
  const result = evaluateOperationalReadinessGate({ roleAssignments, processAbsenceTests });
  assert.equal(result.operationsReady, true);
  assert.equal(result.assignedRoleCount, 6);
  assert.equal(result.soleFounderPrimaryRoleMappings, 0);
  assert.equal(result.humanAbsenceTestsPassed, 4);
  assert.equal(result.busFactorEvidenced, true);
});

test('records a founder primary map without treating it as independent delegation', () => {
  const soleFounderPrimaryPrincipalRef = 'principal-ref:sole-founder-primary';
  const roleAssignments = openRoleAssignments().map((assignment) => ({
    ...assignment,
    primaryPrincipalRef: soleFounderPrimaryPrincipalRef,
    ownerApproved: true,
  }));
  const result = evaluateOperationalReadinessGate({
    roleAssignments,
    processAbsenceTests: technicalOnlyTests(),
    soleFounderPrimaryPrincipalRef,
  });
  assert.equal(result.soleFounderPrimaryRoleMappings, 6);
  assert.equal(result.assignedRoleCount, 0);
  assert.equal(result.operationsReady, false);
});

test('same primary and delegate principal never satisfies the role gate', () => {
  const roleAssignments = openRoleAssignments();
  roleAssignments[0] = {
    ...roleAssignments[0],
    primaryPrincipalRef: 'company:person:one',
    delegatePrincipalRef: 'company:person:one',
    companySystemRef: 'company-system:iam',
    primaryRbacEvidenceRef: 'evidence:one-primary',
    delegateRbacEvidenceRef: 'evidence:one-delegate',
    primaryMfaVerified: true,
    delegateMfaVerified: true,
    ownerApproved: true,
  };
  const result = evaluateOperationalReadinessGate({
    roleAssignments,
    processAbsenceTests: technicalOnlyTests(),
  });
  assert.equal(result.assignedRoleCount, 0);
  assert.equal(result.busFactorEvidenced, false);
  assert.equal(result.operationsReady, false);
});

test('rejects missing roles and owner/delegate binding drift', () => {
  assert.throws(
    () => evaluateOperationalReadinessGate({
      roleAssignments: openRoleAssignments().slice(1),
      processAbsenceTests: technicalOnlyTests(),
    }),
    (error) => error instanceof OperationalReadinessGateError
      && error.code === 'operational_role_assignment_set_invalid',
  );

  const tests = technicalOnlyTests();
  tests[0].delegateRoleId = tests[0].ownerRoleId;
  assert.throws(
    () => evaluateOperationalReadinessGate({
      roleAssignments: openRoleAssignments(),
      processAbsenceTests: tests,
    }),
    (error) => error instanceof OperationalReadinessGateError
      && error.code === 'operational_process_role_binding_invalid',
  );
});
