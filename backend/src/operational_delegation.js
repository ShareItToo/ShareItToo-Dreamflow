const PROCESS_SUMMARIES = Object.freeze([
  Object.freeze({
    processId: 'booking_group_operations',
    ownerRoleId: 'operations_general_manager',
    delegateRoleId: 'trust_safety_support',
    readiness: 'hold',
  }),
  Object.freeze({
    processId: 'project_planner_operations',
    ownerRoleId: 'operations_general_manager',
    delegateRoleId: 'technical_owner_on_call',
    readiness: 'hold',
  }),
  Object.freeze({
    processId: 'evidence_and_needs_review_operations',
    ownerRoleId: 'trust_safety_support',
    delegateRoleId: 'operations_general_manager',
    readiness: 'hold',
  }),
  Object.freeze({
    processId: 'support_escalation_operations',
    ownerRoleId: 'trust_safety_support',
    delegateRoleId: 'operations_general_manager',
    readiness: 'hold',
  }),
]);

export function buildOperationalDelegationCockpit() {
  return {
    schemaVersion: 1,
    kind: 'sit-operational-delegation',
    state: 'hold-external-role-assignments',
    namedPersonDependencyAllowed: false,
    assignmentEvidenceAvailable: false,
    absenceTestsPassed: false,
    technicalRehearsal: {
      state: 'passed-synthetic-configuration-only',
      processesPassed: 4,
      realPeopleUsed: false,
      realUserDataUsed: false,
      productionMutationUsed: false,
    },
    humanGate: {
      state: 'not-started',
      assignedRoles: 0,
      requiredRoles: 6,
      absenceTestsPassed: 0,
      requiredAbsenceTests: 4,
      operationsReady: false,
    },
    processes: PROCESS_SUMMARIES.map((process) => ({ ...process })),
    reportingSeparation: {
      normalOperationsPath: 'projectFunnel',
      founderHoursPath: 'founderIndependence.hoursByCategory',
      founderEscalationsPath: 'founderIndependence.escalations',
      blended: false,
    },
  };
}
