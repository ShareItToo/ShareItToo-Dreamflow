#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateOperationalReadinessGate } from '../backend/src/operational_readiness_gate.js';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = 'docs/operations/p0b-ops-role-delegate-absence-gate.json';

const expectedRepoSources = Object.freeze([
  Object.freeze(['docs/operations/founder-independence-guardrails.json', '5eea114535745f4d62befc536ed7c1e3706c8f0bf06782d20a8184f44c48cd87']),
  Object.freeze(['docs/operations/fi1-operational-delegation.json', '19618947751ef13b61cefbf6835fb10b7a25ab77c8422f86bf10bd91944a04d1']),
  Object.freeze(['docs/evidence/p0b/pilot-go-no-go-dossier.json', '3566a46c018b7685adfe0f9df296c2060294f811deb5b61dd79ec818c25f27dd']),
  Object.freeze(['backend/src/operational_readiness_gate.js', 'ab7036fb3d76b8114a1dc2d65972fe8240f2390615d8c6c8fe2f3969a60e9ecb']),
  Object.freeze(['backend/test/operational_readiness_gate.test.js', '42db9efbb55a8841657e374f2ed77529c518bd04e4a665c95b5f7c585623de6e']),
  Object.freeze(['docs/operations/P0B_OPS_ASSIGNMENT_AND_ABSENCE_RUNBOOK.md', '8567575eca28749cc90833c83addee87e9979613a0d9015da0c895f8e193e6d4']),
]);

const expectedDriveSources = Object.freeze([
  Object.freeze(['12m4kxl5hoJyoGpH0on1fu5v3S9c5rdnf', '03_SIT_FOUNDER_INDEPENDENCE_UND_DELEGATION.pdf', '2026-08-18T17:53:10.162Z']),
  Object.freeze(['1Vt-yIAjgqMOV8TcRrX5E8X74odRx3gEA', '08_SIT_SUPPORT_TESTKATALOG_PILOT_GATES_V1.pdf', '2026-08-20T22:26:56.186Z']),
  Object.freeze(['1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le', '13_SIT_SUPPORT_TEST_MATRIX_V1.md', '2026-08-20T22:29:02.738Z']),
]);

const expectedProbes = Object.freeze([
  'SUP-007',
  'SUP-020',
  'SUP-024',
  'SUP-025',
  'SUP-158',
  'SUP-159',
  'SUP-160',
  'SUP-161',
  'SUP-162',
  'SUP-163',
  'SUP-164',
]);

const expectedDelegationTargets = Object.freeze([
  Object.freeze({
    targetId: 'technical-admin-backup',
    status: 'open',
    principalRef: null,
    coveredRoleIds: ['software_automation', 'technical_owner_on_call', 'finance_compliance'],
    differentPersonFromSoleFounderRequired: true,
    ownEnterpriseAccountRequired: true,
    mfaRequired: true,
    leastPrivilegeRequired: true,
    testedHandoverRequired: true,
  }),
  Object.freeze({
    targetId: 'operations-trust-safety-backup',
    status: 'open',
    principalRef: null,
    coveredRoleIds: ['operations_general_manager', 'trust_safety_support', 'country_lead_launch_partner'],
    differentPersonFromSoleFounderRequired: true,
    ownEnterpriseAccountRequired: true,
    mfaRequired: true,
    leastPrivilegeRequired: true,
    testedHandoverRequired: true,
  }),
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(root, path, overrides) {
  if (Object.hasOwn(overrides, path)) return Buffer.from(String(overrides[path]), 'utf8');
  return readFileSync(resolve(root, path));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentity(value) {
  if (value.schemaVersion !== 1
      || value.kind !== 'p0b-operations-role-delegate-absence-gate'
      || value.version !== 'P0B-OPS-2026-08-21.1'
      || value.authorizationToken !== 'P0B_NEXT_OPS_ROLES_BACKUP_ABSENCE_ONLY'
      || value.preparedOn !== '2026-08-21'
      || value.state !== 'hold-external-assignments-and-human-absence-tests') {
    fail('P0B operations gate identity or fail-closed state is invalid.');
  }
}

function assertSourceBindings(root, value, overrides) {
  const repo = value.sourceBindings?.repository;
  if (!Array.isArray(repo) || repo.length !== expectedRepoSources.length) {
    fail('P0B operations repository source set is incomplete.');
  }
  expectedRepoSources.forEach(([path, hash], index) => {
    if (!exact(repo[index], { path, sha256: hash })
        || sha256(source(root, path, overrides)) !== hash) {
      fail(`P0B operations repository source drift: ${path}`);
    }
  });
  const drive = value.sourceBindings?.drive;
  if (!Array.isArray(drive) || drive.length !== expectedDriveSources.length) {
    fail('P0B operations Drive source set is incomplete.');
  }
  expectedDriveSources.forEach(([fileId, title, modifiedTime], index) => {
    if (!exact(drive[index], { fileId, title, modifiedTime })) {
      fail(`P0B operations Drive source binding drift: ${title}`);
    }
  });
}

function assertPrivacyAndBoundaries(value) {
  if (!exact(value.assignmentPrivacy, {
    repositoryStoresNames: false,
    repositoryStoresEmails: false,
    repositoryStoresCredentials: false,
    repositoryStoresOpaqueEvidenceRefsOnly: true,
    soleFounderPrimaryPrincipalRef: 'principal-ref:sole-founder-primary',
    soleFounderPrimaryRolesConfirmed: true,
    authoritativeSystem: null,
    companySystemOwnershipVerified: false,
  })) {
    fail('P0B operations assignment privacy is unsafe or overstated.');
  }
  if (!exact(value.delegationTargets, expectedDelegationTargets)) {
    fail('P0B operations two-person delegate target is incomplete or overstated.');
  }
  const boundaries = value.boundaries;
  for (const field of [
    'realPeopleInvented',
    'accountPermissionsChanged',
    'personalDataStoredInRepository',
    'productionChanged',
    'paymentChanged',
    'providerChanged',
    'storeChanged',
    'publicActivationChanged',
  ]) {
    if (boundaries?.[field] !== false) fail(`P0B operations boundary must remain false: ${field}`);
  }
}

function assertExternalGate(value) {
  if (!exact(value.externalGates, {
    companySystemOwnership: 'open',
    functionalRoleAssignees: 'open',
    functionalRoleDelegates: 'open',
    companyAccountRbacAndMfa: 'open',
    humanSeventyTwoHourAbsenceTests: 'not-started',
  })) {
    fail('P0B operations external people/RBAC/absence gates must remain open.');
  }
  if (!exact(value.supportOperationalProbeRefs, expectedProbes)) {
    fail('P0B operations Support Packet probe binding is incomplete.');
  }
}

function assertEvaluation(value) {
  const evaluated = evaluateOperationalReadinessGate({
    roleAssignments: value.roleAssignments,
    processAbsenceTests: value.processAbsenceTests,
    soleFounderPrimaryPrincipalRef: value.assignmentPrivacy?.soleFounderPrimaryPrincipalRef,
  });
  const { state: _state, ...expected } = evaluated;
  if (!exact(value.evaluation, expected)) {
    fail('P0B operations recorded evaluation does not match the executable gate.');
  }
  if (evaluated.state !== value.state
      || evaluated.assignedRoleCount !== 0
      || evaluated.soleFounderPrimaryRoleMappings !== 6
      || evaluated.technicalRehearsalsPassed !== 4
      || evaluated.humanAbsenceTestsPassed !== 0
      || evaluated.operationsReady !== false) {
    fail('P0B operations readiness is overstated.');
  }
  return evaluated;
}

export function validateP0BOpsReadiness({
  root = defaultRoot,
  manifest = undefined,
  sourceOverrides = {},
} = {}) {
  const value = manifest ?? JSON.parse(source(root, manifestPath, sourceOverrides));
  assertIdentity(value);
  assertSourceBindings(root, value, sourceOverrides);
  assertPrivacyAndBoundaries(value);
  assertExternalGate(value);
  const evaluation = assertEvaluation(value);
  return Object.freeze({
    version: value.version,
    state: value.state,
    requiredRoles: evaluation.requiredRoleCount,
    assignedRoles: evaluation.assignedRoleCount,
    soleFounderPrimaryRoleMappings: evaluation.soleFounderPrimaryRoleMappings,
    technicalRehearsalsPassed: evaluation.technicalRehearsalsPassed,
    humanAbsenceTestsPassed: evaluation.humanAbsenceTestsPassed,
    operationsReady: evaluation.operationsReady,
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const result = validateP0BOpsReadiness();
    process.stdout.write(
      `P0B operations gate valid: version=${result.version}, state=${result.state}, requiredRoles=${result.requiredRoles}, assignedRoles=${result.assignedRoles}, technicalRehearsalsPassed=${result.technicalRehearsalsPassed}, humanAbsenceTestsPassed=${result.humanAbsenceTestsPassed}, operationsReady=${result.operationsReady}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'P0B operations gate validation failed.'}\n`);
    process.exitCode = 1;
  }
}
