const REQUIRED_ROLE_IDS = Object.freeze([
  'software_automation',
  'operations_general_manager',
  'trust_safety_support',
  'technical_owner_on_call',
  'finance_compliance',
  'country_lead_launch_partner',
]);

const REQUIRED_PROCESSES = Object.freeze([
  Object.freeze({
    processId: 'booking_group_operations',
    ownerRoleId: 'operations_general_manager',
    delegateRoleId: 'trust_safety_support',
  }),
  Object.freeze({
    processId: 'project_planner_operations',
    ownerRoleId: 'operations_general_manager',
    delegateRoleId: 'technical_owner_on_call',
  }),
  Object.freeze({
    processId: 'evidence_and_needs_review_operations',
    ownerRoleId: 'trust_safety_support',
    delegateRoleId: 'operations_general_manager',
  }),
  Object.freeze({
    processId: 'support_escalation_operations',
    ownerRoleId: 'trust_safety_support',
    delegateRoleId: 'operations_general_manager',
  }),
]);

export class OperationalReadinessGateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OperationalReadinessGateError';
    this.code = code;
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function exactIds(entries, expected, field, errorCode) {
  if (!Array.isArray(entries) || entries.length !== expected.length) {
    throw new OperationalReadinessGateError(errorCode);
  }
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    if (entry?.[field] !== expected[index] || seen.has(entry[field])) {
      throw new OperationalReadinessGateError(errorCode);
    }
    seen.add(entry[field]);
  }
}

function roleAssignmentReady(assignment) {
  const principalRefsPresent = nonEmpty(assignment.primaryPrincipalRef)
    && nonEmpty(assignment.delegatePrincipalRef)
    && assignment.primaryPrincipalRef !== assignment.delegatePrincipalRef;
  return principalRefsPresent
    && nonEmpty(assignment.companySystemRef)
    && nonEmpty(assignment.primaryRbacEvidenceRef)
    && nonEmpty(assignment.delegateRbacEvidenceRef)
    && assignment.primaryMfaVerified === true
    && assignment.delegateMfaVerified === true
    && assignment.ownerApproved === true;
}

function humanAbsenceTestReady(test) {
  return test.humanAbsenceTestPassed === true
    && test.absenceWindowHours >= 72
    && nonEmpty(test.startedAt)
    && nonEmpty(test.endedAt)
    && Number.isFinite(Date.parse(test.startedAt))
    && Number.isFinite(Date.parse(test.endedAt))
    && Date.parse(test.endedAt) > Date.parse(test.startedAt)
    && nonEmpty(test.auditEvidenceRef)
    && test.founderOperationalActionObserved === false
    && test.realUserDataUsed === false
    && test.realMoneyUsed === false
    && test.productionMutationUsed === false;
}

export function evaluateOperationalReadinessGate({
  roleAssignments,
  processAbsenceTests,
  soleFounderPrimaryPrincipalRef = null,
}) {
  exactIds(
    roleAssignments,
    REQUIRED_ROLE_IDS,
    'roleId',
    'operational_role_assignment_set_invalid',
  );
  exactIds(
    processAbsenceTests,
    REQUIRED_PROCESSES.map((process) => process.processId),
    'processId',
    'operational_absence_test_set_invalid',
  );

  let assignedRoleCount = 0;
  for (const assignment of roleAssignments) {
    if (roleAssignmentReady(assignment)) assignedRoleCount += 1;
  }
  const soleFounderPrimaryRoleMappings = nonEmpty(soleFounderPrimaryPrincipalRef)
    ? roleAssignments.filter((assignment) => (
      assignment.primaryPrincipalRef === soleFounderPrimaryPrincipalRef
        && assignment.ownerApproved === true
    )).length
    : 0;

  let technicalRehearsalsPassed = 0;
  let humanAbsenceTestsPassed = 0;
  for (const [index, test] of processAbsenceTests.entries()) {
    const expected = REQUIRED_PROCESSES[index];
    if (test.ownerRoleId !== expected.ownerRoleId
        || test.delegateRoleId !== expected.delegateRoleId
        || test.ownerRoleId === test.delegateRoleId) {
      throw new OperationalReadinessGateError('operational_process_role_binding_invalid');
    }
    if (test.technicalRehearsalPassed === true
        && test.syntheticOnly === true
        && test.namedPersonDependencyObserved === false) {
      technicalRehearsalsPassed += 1;
    }
    if (humanAbsenceTestReady(test)) humanAbsenceTestsPassed += 1;
  }

  const assignmentsReady = assignedRoleCount === REQUIRED_ROLE_IDS.length;
  const technicalRehearsalReady = technicalRehearsalsPassed === REQUIRED_PROCESSES.length;
  const humanAbsenceReady = humanAbsenceTestsPassed === REQUIRED_PROCESSES.length;
  const busFactorEvidenced = assignmentsReady && roleAssignments.every(
    (assignment) => assignment.primaryPrincipalRef !== assignment.delegatePrincipalRef,
  );
  const operationsReady = assignmentsReady
    && technicalRehearsalReady
    && humanAbsenceReady
    && busFactorEvidenced;

  return Object.freeze({
    state: operationsReady
      ? 'ready-for-separate-pilot-decision'
      : 'hold-external-assignments-and-human-absence-tests',
    requiredRoleCount: REQUIRED_ROLE_IDS.length,
    assignedRoleCount,
    soleFounderPrimaryRoleMappings,
    requiredProcessCount: REQUIRED_PROCESSES.length,
    technicalRehearsalsPassed,
    humanAbsenceTestsPassed,
    assignmentsReady,
    technicalRehearsalReady,
    humanAbsenceReady,
    busFactorEvidenced,
    operationsReady,
  });
}

export const operationalReadinessRequirements = Object.freeze({
  roleIds: REQUIRED_ROLE_IDS,
  processes: REQUIRED_PROCESSES,
  minimumAbsenceWindowHours: 72,
});
