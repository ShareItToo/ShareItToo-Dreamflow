#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = 'docs/operations/fi1-operational-delegation.json';

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
    fail(`${label} does not match the approved FI1 contract.`);
  }
}

function source(root, relativePath, overrides) {
  if (Object.hasOwn(overrides, relativePath)) return String(overrides[relativePath]);
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function requireIncludes(contents, expected, label) {
  if (!contents.includes(expected)) fail(`${label} is missing ${expected}.`);
}

export function validateOperationalDelegation({
  root = defaultRoot,
  manifest = undefined,
  sourceOverrides = {},
} = {}) {
  const delegation = object(
    manifest ?? JSON.parse(source(root, manifestPath, sourceOverrides)),
    'FI1 operational delegation',
  );
  if (delegation.schemaVersion !== 1
      || delegation.kind !== 'operational-delegation-fi1'
      || delegation.state !== 'hold-external-role-assignments') {
    fail('FI1 identity or fail-closed state is invalid.');
  }
  const binding = object(delegation.source, 'source');
  if (binding.drivePackage !== '02_CODEX_WORK_PACKAGES_SIT_V2.4.md') {
    fail('FI1 is not bound to the V2.4 work package.');
  }
  exactArray(binding.requirements, [
    'FI1-001-role-owner-delegate-runbook',
    'FI1-002-audit-and-escalation-thresholds',
    'FI1-003-no-named-person-dependency',
    'FI1-004-cockpit-reporting-separation',
  ], 'source.requirements');
  if (delegation.roleRegistryRef !==
      'docs/operations/founder-independence-guardrails.json') {
    fail('FI1 role registry reference is invalid.');
  }
  const roleRegistry = JSON.parse(source(root, delegation.roleRegistryRef, sourceOverrides));
  const allowedRoles = new Set(roleRegistry.roleModel?.functionalRoles?.map((role) => role.id));

  const expected = [
    ['booking_group_operations', 'operations_general_manager', 'trust_safety_support',
      'docs/operations/FI1_BOOKING_GROUPS_RUNBOOK.md'],
    ['project_planner_operations', 'operations_general_manager', 'technical_owner_on_call',
      'docs/operations/FI1_PROJECT_PLANNER_RUNBOOK.md'],
    ['evidence_and_needs_review_operations', 'trust_safety_support',
      'operations_general_manager', 'docs/operations/FI1_EVIDENCE_REVIEW_RUNBOOK.md'],
    ['support_escalation_operations', 'trust_safety_support',
      'operations_general_manager', 'docs/operations/FI1_SUPPORT_ESCALATION_RUNBOOK.md'],
  ];
  if (!Array.isArray(delegation.processes) || delegation.processes.length !== expected.length) {
    fail('FI1 must define exactly four operational processes.');
  }
  let thresholdCount = 0;
  for (const [index, process] of delegation.processes.entries()) {
    const [processId, ownerRoleId, delegateRoleId, runbookRef] = expected[index];
    if (process?.processId !== processId || process.ownerRoleId !== ownerRoleId
        || process.delegateRoleId !== delegateRoleId || process.runbookRef !== runbookRef
        || process.ownerRoleId === process.delegateRoleId
        || !allowedRoles.has(process.ownerRoleId) || !allowedRoles.has(process.delegateRoleId)
        || typeof process.scope !== 'string' || process.scope.trim() === ''
        || process.readiness !== 'hold' || process.assignmentEvidenceAvailable !== false
        || process.absenceTestPassed !== false) {
      fail(`FI1 process ${processId} has unsafe role, readiness or runbook data.`);
    }
    if (!Array.isArray(process.auditSources) || process.auditSources.length < 2
        || process.auditSources.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
      fail(`FI1 process ${processId} has incomplete audit sources.`);
    }
    if (!Array.isArray(process.escalationThresholds)
        || process.escalationThresholds.length !== 2) {
      fail(`FI1 process ${processId} must define two bounded escalation thresholds.`);
    }
    const ids = new Set();
    for (const threshold of process.escalationThresholds) {
      if (typeof threshold?.thresholdId !== 'string' || threshold.thresholdId.trim() === ''
          || ids.has(threshold.thresholdId)
          || typeof threshold.condition !== 'string' || threshold.condition.trim() === ''
          || !allowedRoles.has(threshold.routeToRoleId)
          || threshold.founderEscalation !== false) {
        fail(`FI1 process ${processId} has an unsafe escalation threshold.`);
      }
      ids.add(threshold.thresholdId);
      thresholdCount += 1;
    }
    const runbook = source(root, runbookRef, sourceOverrides);
    for (const heading of [
      '## Owner and delegate',
      '## Normal operations',
      '## Audit evidence',
      '## Escalation thresholds',
      '## Fallback and recovery',
      '## Absence test gate',
    ]) requireIncludes(runbook, heading, `FI1 runbook ${processId}`);
    if (/\b(?:Walid|Chraibi)\b|walidchraibi/iu.test(runbook)) {
      fail(`FI1 runbook ${processId} contains a named-person dependency.`);
    }
  }

  const founder = object(delegation.founderEscalationPolicy, 'founderEscalationPolicy');
  if (founder.normalOperationsRouteToFounder !== false
      || founder.automaticFounderEscalation !== false
      || founder.namedPersonTarget !== null) {
    fail('FI1 normal operations must not route to a founder or named person.');
  }
  exactArray(founder.allowedGateClasses,
    ['strategy', 'existential', 'owner_authorization'],
    'founderEscalationPolicy.allowedGateClasses');

  const cockpit = object(delegation.cockpit, 'cockpit');
  if (cockpit.normalOperationsPath !== 'projectFunnel'
      || cockpit.founderHoursPath !== 'founderIndependence.hoursByCategory'
      || cockpit.founderEscalationsPath !== 'founderIndependence.escalations'
      || cockpit.operationalDelegationPath !== 'operationalDelegation'
      || cockpit.blended !== false) {
    fail('FI1 cockpit reporting separation is invalid.');
  }
  const external = object(delegation.externalGates, 'externalGates');
  if (external.roleAssignments !== 'open' || external.delegateAssignments !== 'open'
      || external.companyAccountRbac !== 'open'
      || external.absenceTests !== 'not-started') {
    fail('FI1 external assignments and absence tests must remain open.');
  }
  const boundaries = object(delegation.boundaries, 'boundaries');
  for (const field of [
    'personalDependencyIntroduced',
    'accountPermissionsChanged',
    'productionChanged',
    'paymentChanged',
    'providerChanged',
    'storeChanged',
    'publicActivationChanged',
  ]) {
    if (boundaries[field] !== false) fail(`FI1 boundary must remain false: ${field}`);
  }

  const runtime = source(root, 'backend/src/operational_delegation.js', sourceOverrides);
  const cockpitSource = source(root, 'backend/src/pilot_cockpit.js', sourceOverrides);
  for (const [processId] of expected) requireIncludes(runtime, processId, 'FI1 runtime summary');
  for (const value of [
    "state: 'hold-external-role-assignments'",
    'namedPersonDependencyAllowed: false',
    "normalOperationsPath: 'projectFunnel'",
    'blended: false',
  ]) requireIncludes(runtime, value, 'FI1 runtime summary');
  requireIncludes(cockpitSource, 'buildOperationalDelegationCockpit()', 'pilot cockpit');
  requireIncludes(cockpitSource, 'projectFunnel,', 'pilot cockpit');
  requireIncludes(cockpitSource, 'founderIndependence,', 'pilot cockpit');

  return {
    state: delegation.state,
    processes: delegation.processes.length,
    thresholds: thresholdCount,
    assignmentsReady: false,
    reportingBlended: false,
  };
}

function run() {
  const result = validateOperationalDelegation();
  console.log(
    `Operational delegation: PASS (state=${result.state}, processes=${result.processes}, `
      + `thresholds=${result.thresholds}, assignmentsReady=false, reportingBlended=false)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error?.message ?? 'FI1 validation failed.'}`);
    process.exitCode = 1;
  }
}
