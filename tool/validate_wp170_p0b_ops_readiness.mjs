#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateOperationalReadinessGate } from '../backend/src/operational_readiness_gate.js';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const successorPath = 'docs/operations/p0b-ops-role-delegate-absence-gate-wp170.json';
const historicalPath = 'docs/operations/p0b-ops-role-delegate-absence-gate.json';
const historicalSha = 'eb5cd54c3894f74534d21d04c079c942b276aa553324cd581b0d6519ae8800ff';
const expectedSources = Object.freeze([
  Object.freeze(['backend/src/operational_readiness_gate.js', '2590c52a5d492f9058d0f024b28aa31b3cc570447da3d7fd034dba39fcb5a9aa']),
  Object.freeze(['backend/test/operational_readiness_gate.test.js', '046cebd3ee2bdbff697dcbe3d32f0c72895d27095d9787aab7f3ab41e2c5a9ed']),
  Object.freeze(['docs/operations/P0B_OPS_ASSIGNMENT_AND_ABSENCE_RUNBOOK.md', '8567575eca28749cc90833c83addee87e9979613a0d9015da0c895f8e193e6d4']),
]);
const expectedDrive = Object.freeze([
  Object.freeze({ fileId: '12m4kxl5hoJyoGpH0on1fu5v3S9c5rdnf', title: '03_SIT_FOUNDER_INDEPENDENCE_UND_DELEGATION.pdf', modifiedTime: '2026-08-18T17:53:10.162Z' }),
  Object.freeze({ fileId: '1Vt-yIAjgqMOV8TcRrX5E8X74odRx3gEA', title: '08_SIT_SUPPORT_TESTKATALOG_PILOT_GATES_V1.pdf', modifiedTime: '2026-08-20T22:26:56.186Z' }),
  Object.freeze({ fileId: '1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le', title: '13_SIT_SUPPORT_TEST_MATRIX_V1.md', modifiedTime: '2026-08-20T22:29:02.738Z' }),
]);
const expectedEvaluation = Object.freeze({
  requiredRoleCount: 6,
  assignedRoleCount: 0,
  soleFounderPrimaryRoleMappings: 6,
  requiredProcessCount: 4,
  technicalRehearsalsPassed: 4,
  humanAbsenceTestsPassed: 0,
  assignmentsReady: false,
  technicalRehearsalReady: true,
  humanAbsenceReady: false,
  busFactorEvidenced: false,
  operationsReady: false,
});
const expectedSyntheticFixtureProvenance = Object.freeze({
  namespace: 'synthetic:wp170:',
  realEvidence: false,
  sourceTest: 'backend/test/operational_readiness_gate.test.js',
  factories: [
    { name: 'openRoleAssignments', purpose: 'Create six unassigned role records as the fail-closed baseline.', syntheticValues: ['primaryPrincipalRef=null', 'delegatePrincipalRef=null', 'companySystemRef=null', 'ownerApproved=false'] },
    { name: 'technicalOnlyTests', purpose: 'Create four passed technical rehearsals without human absence evidence.', syntheticValues: ['technicalRehearsalId=P0B-OPS-TR-01..04', 'syntheticOnly=true', 'humanAbsenceTestPassed=false', 'realUserDataUsed=false', 'realMoneyUsed=false', 'productionMutationUsed=false'] },
    { name: 'completeSyntheticRoleAssignments', purpose: 'Exercise the positive role/RBAC shape without representing real people or access.', syntheticValues: ['primaryPrincipalRef=synthetic:wp170:primary:0..5', 'delegatePrincipalRef=synthetic:wp170:delegate:0..5', 'companySystemRef=synthetic:wp170:company-system', 'primaryRbacEvidenceRef=synthetic:wp170:rbac:primary:0..5', 'delegateRbacEvidenceRef=synthetic:wp170:rbac:delegate:0..5', 'primaryMfaVerified=true', 'delegateMfaVerified=true', 'ownerApproved=true'] },
    { name: 'completeSyntheticAbsenceTests', purpose: 'Apply synthetic absence-window fixtures to all four technical processes.', syntheticValues: ['auditEvidenceRef=synthetic:wp170:absence-audit', 'founderOperationalActionObserved=false'] },
  ],
  scenarios: [
    { id: 'declared72_one_hour_rejected', startedAt: '2026-08-21T00:00:00Z', endedAt: '2026-08-21T01:00:00Z', declaredAbsenceWindowHours: 72, expectedHumanAbsenceTestsPassed: 0, expectedOperationsReady: false },
    { id: 'exact72_measured_accepted', startedAt: '2026-08-21T00:00:00Z', endedAt: '2026-08-24T00:00:00Z', declaredAbsenceWindowHours: 72, expectedHumanAbsenceTestsPassed: 4, expectedOperationsReady: true },
    { id: 'malformed_negative_string_mismatch_rejected', fixtures: ['startedAt=not-a-date', 'end-before-start', 'declaredAbsenceWindowHours=72 as string', 'declaredAbsenceWindowHours=73 for measured72'], expectedHumanAbsenceTestsPassed: 0, expectedOperationsReady: false },
  ],
  assertions: ['WP170 synthetic fixture rejects declared 72 hours when timestamps span only one hour', 'WP170 synthetic fixture accepts exactly measured 72-hour timestamps', 'WP170 synthetic fixture rejects malformed, negative and mismatched windows'],
});

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function bytes(root, path, overrides) {
  if (Object.hasOwn(overrides, path)) return Buffer.from(String(overrides[path]), 'utf8');
  return readFileSync(resolve(root, path));
}
function exact(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }

function validateIdentity(value) {
  if (value.schemaVersion !== 1
      || value.kind !== 'p0b-operations-role-delegate-absence-gate-successor'
      || value.version !== 'P0B-OPS-2026-09-16.170'
      || value.state !== 'hold-external-assignments-and-human-absence-tests') {
    fail('WP170 successor identity or hold state is invalid.');
  }
  if (!exact(value.successorOf, { path: historicalPath, sha256: historicalSha })) {
    fail('WP170 successor historical binding is invalid.');
  }
  if (!exact(value.invariant, {
    id: 'WP170-HUMAN-ABSENCE-MEASURED-WINDOW',
    description: 'A human absence test is valid only when declared and measured timestamps are finite, end is after start, both are at least 72 hours, and declared hours exactly match the measured window.',
    minimumWindowHours: 72,
    declaredMeasuredWindowMustMatch: true,
    syntheticFixtureNamespace: 'synthetic:wp170:',
  })) fail('WP170 measured-window invariant is missing or weakened.');
  if (!exact(value.syntheticFixtureProvenance, expectedSyntheticFixtureProvenance)) {
    fail('WP170 synthetic fixture provenance is missing, overstated or drifted.');
  }
}

function validateSources(root, value, overrides) {
  const historical = bytes(root, historicalPath, overrides);
  if (sha256(historical) !== historicalSha) fail('Historical P0B manifest changed.');
  const bindings = value.sourceBindings?.repository;
  if (!Array.isArray(bindings) || bindings.length !== expectedSources.length) fail('WP170 successor source set is incomplete.');
  expectedSources.forEach(([path, hash], index) => {
    if (!exact(bindings[index], { path, sha256: hash }) || sha256(bytes(root, path, overrides)) !== hash) {
      fail(`WP170 successor source drift: ${path}`);
    }
  });
  if (!exact(value.sourceBindings?.drive, expectedDrive)) fail('WP170 successor Drive binding drift.');
}

function validateDerivedEvaluation(root, value, overrides) {
  const historical = JSON.parse(bytes(root, historicalPath, overrides));
  if (!exact(value.derivation, {
    roleAssignmentsSource: `${historicalPath}#roleAssignments`,
    processAbsenceTestsSource: `${historicalPath}#processAbsenceTests`,
    historicalSourceIsImmutable: true,
    realAssignmentsPresent: false,
    realHumanAbsenceTestsPresent: false,
    syntheticTechnicalEvidenceOnly: true,
  })) fail('WP170 derivation provenance is invalid.');
  const evaluated = evaluateOperationalReadinessGate({
    roleAssignments: historical.roleAssignments,
    processAbsenceTests: historical.processAbsenceTests,
    soleFounderPrimaryPrincipalRef: historical.assignmentPrivacy?.soleFounderPrimaryPrincipalRef,
  });
  const { state: _state, ...actual } = evaluated;
  if (!exact(actual, expectedEvaluation) || !exact(value.evaluation, expectedEvaluation)) {
    fail('WP170 successor evaluation does not match the executable gate.');
  }
  if (evaluated.state !== value.state) fail('WP170 successor state is overstated.');
}

export function validateWP170P0BOpsReadiness({ root = defaultRoot, manifest = undefined, sourceOverrides = {} } = {}) {
  const value = manifest ?? JSON.parse(bytes(root, successorPath, sourceOverrides));
  validateIdentity(value);
  validateSources(root, value, sourceOverrides);
  validateDerivedEvaluation(root, value, sourceOverrides);
  if (!exact(value.externalGates, {
    companySystemOwnership: 'open',
    functionalRoleAssignees: 'open',
    functionalRoleDelegates: 'open',
    companyAccountRbacAndMfa: 'open',
    humanSeventyTwoHourAbsenceTests: 'not-started',
  })) fail('WP170 external assignments/RBAC/absence gates must remain open.');
  for (const field of ['realPeopleInvented', 'accountPermissionsChanged', 'personalDataStoredInRepository', 'productionChanged', 'paymentChanged', 'providerChanged', 'storeChanged', 'publicActivationChanged']) {
    if (value.boundaries?.[field] !== false) fail(`WP170 boundary must remain false: ${field}`);
  }
  return Object.freeze({ version: value.version, state: value.state, requiredRoles: 6, assignedRoles: 0, technicalRehearsalsPassed: 4, humanAbsenceTestsPassed: 0, operationsReady: false });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const result = validateWP170P0BOpsReadiness();
    process.stdout.write(`WP170 P0B successor valid: version=${result.version}, state=${result.state}, requiredRoles=${result.requiredRoles}, assignedRoles=${result.assignedRoles}, technicalRehearsalsPassed=${result.technicalRehearsalsPassed}, humanAbsenceTestsPassed=${result.humanAbsenceTestsPassed}, operationsReady=${result.operationsReady}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP170 P0B successor validation failed.'}\n`);
    process.exitCode = 1;
  }
}
