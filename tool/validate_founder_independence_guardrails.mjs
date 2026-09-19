#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestRelativePath = 'docs/operations/founder-independence-guardrails.json';

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
  if (!Array.isArray(value) || value.length !== expected.length ||
      value.some((entry, index) => entry !== expected[index])) {
    fail(`${label} must match the approved FI0 contract.`);
  }
}

function source(root, relativePath, overrides) {
  if (Object.hasOwn(overrides, relativePath)) return String(overrides[relativePath]);
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function requireIncludes(contents, expected, label) {
  if (!contents.includes(expected)) fail(`${label} is missing ${expected}.`);
}

export function validateFounderIndependenceGuardrails({
  root = defaultRoot,
  manifest = undefined,
  sourceOverrides = {},
} = {}) {
  const guardrails = object(
    manifest ?? JSON.parse(source(root, manifestRelativePath, sourceOverrides)),
    'FI0 guardrails',
  );
  if (guardrails.schemaVersion !== 1 ||
      guardrails.kind !== 'founder-independence-fi0-guardrails' ||
      guardrails.state !== 'foundation-hold-external-assignments') {
    fail('FI0 guardrail identity or fail-closed state is invalid.');
  }

  const sourceBinding = object(guardrails.source, 'source');
  if (sourceBinding.driveDocument !== '03_SIT_FOUNDER_INDEPENDENCE_UND_DELEGATION.pdf' ||
      sourceBinding.documentDate !== '2026-08-18') {
    fail('FI0 is not bound to the approved founder-independence source.');
  }
  exactArray(
    sourceBinding.requirements,
    ['FI-001', 'FI-002', 'FI-003', 'FI-004', 'FI-005', 'FI-006'],
    'source.requirements',
  );

  const roleModel = object(guardrails.roleModel, 'roleModel');
  exactArray(roleModel.applicationRoles, ['user', 'support', 'admin', 'system'],
    'roleModel.applicationRoles');
  const expectedFunctionalRoles = [
    'software_automation',
    'operations_general_manager',
    'trust_safety_support',
    'technical_owner_on_call',
    'finance_compliance',
    'country_lead_launch_partner',
  ];
  if (!Array.isArray(roleModel.functionalRoles) ||
      roleModel.functionalRoles.length !== expectedFunctionalRoles.length) {
    fail('FI0 functional role model is incomplete.');
  }
  exactArray(
    roleModel.functionalRoles.map((role) => role?.id),
    expectedFunctionalRoles,
    'roleModel.functionalRoles',
  );
  for (const role of roleModel.functionalRoles) {
    if (typeof role.scope !== 'string' || role.scope.trim() === '' ||
        role.currentAssignee !== null || role.delegateAssignee !== null ||
        role.assignmentState !== 'open') {
      fail(`Functional role ${role.id} must remain unassigned and fail-closed.`);
    }
  }
  if (roleModel.namedPersonAuthorizationAllowed !== false ||
      roleModel.assignmentAuthority !== 'owner-approved-company-system' ||
      roleModel.minimumBusFactor !== 2 ||
      roleModel.unknownAssignmentFailsClosed !== true) {
    fail('FI0 role assignment or bus-factor safeguards are unsafe.');
  }

  const processTemplate = object(guardrails.criticalProcessTemplate, 'criticalProcessTemplate');
  exactArray(processTemplate.requiredFields, [
    'processId',
    'ownerRoleId',
    'delegateRoleId',
    'runbookRef',
    'monitoringRef',
    'escalationThreshold',
    'fallback',
    'approvalPolicy',
    'readiness',
  ], 'criticalProcessTemplate.requiredFields');
  exactArray(processTemplate.fourEyesPolicyValues,
    ['not-required-with-reason', 'required', 'external-gate'],
    'criticalProcessTemplate.fourEyesPolicyValues');
  exactArray(processTemplate.readinessValues, ['ready', 'hold', 'not-applicable'],
    'criticalProcessTemplate.readinessValues');
  if (processTemplate.assignmentUnknownFailsClosed !== true) {
    fail('Unknown critical-process assignments must fail closed.');
  }

  const audit = object(guardrails.auditSchema, 'auditSchema');
  if (audit.storage !== 'backend.audit_log' ||
      audit.foundationMigration !== 'backend/sql/migrations/001_b3_foundation.up.sql' ||
      audit.appendOnly !== true ||
      audit.appendOnlyTrigger !== 'sit_reject_append_only_mutation' ||
      audit.criticalActionApprovalPolicyRequired !== true ||
      audit.existingCoverageState !==
        'append-only-foundation-present-role-capability-expansion-open') {
    fail('FI0 audit schema is not bound to the append-only backend foundation.');
  }
  exactArray(audit.requiredFields, [
    'actor_id',
    'actor_role',
    'action',
    'resource_type',
    'resource_id',
    'request_id',
    'before_hash',
    'after_hash',
    'metadata',
    'created_at',
  ], 'auditSchema.requiredFields');
  exactArray(audit.actorRoles, ['user', 'support', 'admin', 'system'],
    'auditSchema.actorRoles');
  exactArray(audit.sensitiveMetadataForbidden, [
    'passwords',
    'tokens',
    'signing_material',
    'raw_device_identifiers',
    'recovery_codes',
    'message_content_unless_case_required',
  ], 'auditSchema.sensitiveMetadataForbidden');

  const founderHours = object(guardrails.founderHoursEvents, 'founderHoursEvents');
  if (founderHours.eventType !== 'founder_hours_aggregate_recorded' ||
      founderHours.collectionMode !== 'manual-monthly-aggregate-only' ||
      founderHours.automaticCollectionAllowed !== false ||
      founderHours.cashAndNormalizedResultSeparated !== true ||
      founderHours.normalizedResultIncludesFounderReplacementCompensation !== true) {
    fail('Founder-hours collection must remain manual, aggregate-only and finance-separated.');
  }
  exactArray(founderHours.categories,
    ['strategy', 'operations', 'support', 'technical', 'emergency'],
    'founderHoursEvents.categories');
  exactArray(founderHours.requiredFields,
    ['periodMonth', 'category', 'minutes', 'recordedByRole', 'recordedAt'],
    'founderHoursEvents.requiredFields');
  exactArray(founderHours.recordingRoles, ['admin', 'system'],
    'founderHoursEvents.recordingRoles');
  exactArray(founderHours.forbiddenCollection, [
    'exact_activity_timestamps',
    'keystrokes',
    'screenshots',
    'urls',
    'app_usage',
    'message_content',
    'gps',
    'biometrics',
    'continuous_monitoring',
  ], 'founderHoursEvents.forbiddenCollection');

  const founderEscalations = object(
    guardrails.founderEscalationEvents,
    'founderEscalationEvents',
  );
  if (founderEscalations.eventType !== 'founder_escalation_aggregate_recorded' ||
      founderEscalations.collectionMode !== 'manual-monthly-aggregate-only' ||
      founderEscalations.routingQualityRule !==
        'roleRoutedCount + founderOnlyCount + unroutedCount = totalCount' ||
      founderEscalations.caseDetailsAllowed !== false ||
      founderEscalations.automaticCollectionAllowed !== false) {
    fail('Founder-escalation evidence must remain manual, aggregate-only and privacy-minimal.');
  }
  exactArray(founderEscalations.requiredFields, [
    'periodMonth',
    'totalCount',
    'roleRoutedCount',
    'founderOnlyCount',
    'unroutedCount',
    'recordedByRole',
    'recordedAt',
  ], 'founderEscalationEvents.requiredFields');
  exactArray(founderEscalations.recordingRoles, ['admin', 'system'],
    'founderEscalationEvents.recordingRoles');

  const externalGates = object(guardrails.externalGates, 'externalGates');
  if (externalGates.companySystemOwnership !== 'open' ||
      externalGates.functionalRoleAssignees !== 'open' ||
      externalGates.functionalRoleDelegates !== 'open' ||
      externalGates.accountRbacChanges !== 'open' ||
      externalGates.absenceTests !== 'not-started' ||
      externalGates.founderReplacementCompensationAmount !==
        'open-finance-owner-decision') {
    fail('FI0 external assignments, account changes and absence tests must remain open.');
  }
  const boundaries = object(guardrails.boundaries, 'boundaries');
  for (const field of [
    'invasiveTimeTracking',
    'personalActivityCollection',
    'accountPermissionsChanged',
    'secretsMoved',
    'productionChanged',
    'storeChanged',
    'providerChanged',
    'signedCandidateCreated',
  ]) {
    if (boundaries[field] !== false) fail(`FI0 boundary must remain false: ${field}`);
  }

  if (guardrails.runbookTemplate !==
      'docs/operations/FOUNDER_INDEPENDENCE_RUNBOOK_TEMPLATE.md') {
    fail('FI0 runbook template reference is invalid.');
  }
  const runbook = source(root, guardrails.runbookTemplate, sourceOverrides);
  for (const heading of [
    '## 1. Process identity',
    '## 2. Role ownership and least privilege',
    '## 4. Monitoring and escalation',
    '## 5. Fallback, recovery and rollback',
    '## 6. Audit contract',
    '## 7. Absence and delegate test',
    '## 8. Founder-hours aggregate',
    '## 9. Founder-escalation aggregate',
  ]) requireIncludes(runbook, heading, 'FI0 runbook template');

  const criticalPaths = [
    '.github/workflows/regression.yml',
    'backend/Dockerfile',
    'backend/ops/preflight_public_store_backend.sh',
    'backend/ops/alert.sh',
    'backend/src/authorization.js',
    'backend/src/config.js',
  ];
  const personalHardcode = /\b(?:Walid|Chraibi)\b|walidchraibi/iu;
  for (const relativePath of criticalPaths) {
    if (personalHardcode.test(source(root, relativePath, sourceOverrides))) {
      fail(`Critical runtime source contains a named-person hardcode: ${relativePath}`);
    }
  }

  const workflow = source(root, '.github/workflows/regression.yml', sourceOverrides);
  requireIncludes(workflow,
    'REGISTRY_IMAGE="ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/shareittoo-api"',
    'GitHub workflow');
  requireIncludes(workflow,
    'APP_SOURCE_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}"',
    'GitHub workflow');
  const dockerfile = source(root, 'backend/Dockerfile', sourceOverrides);
  requireIncludes(dockerfile, 'ARG APP_SOURCE_URL=unknown', 'backend Dockerfile');
  requireIncludes(dockerfile,
    'org.opencontainers.image.source="${APP_SOURCE_URL}"',
    'backend Dockerfile');
  const preflight = source(root, 'backend/ops/preflight_public_store_backend.sh', sourceOverrides);
  requireIncludes(preflight, 'task_image_repository="${IMAGE_REPOSITORY:-}"',
    'public Store backend preflight');
  requireIncludes(preflight,
    'IMAGE_REPOSITORY must be an explicit role-approved GHCR repository.',
    'public Store backend preflight');

  const authorization = source(root, 'backend/src/authorization.js', sourceOverrides);
  requireIncludes(authorization,
    "actorRoles = Object.freeze(['user', 'support', 'admin'])",
    'backend authorization');
  const auditMigration = source(
    root,
    'backend/sql/migrations/001_b3_foundation.up.sql',
    sourceOverrides,
  );
  requireIncludes(auditMigration, 'CREATE TABLE audit_log', 'audit migration');
  requireIncludes(auditMigration, 'CREATE TRIGGER audit_log_append_only', 'audit migration');
  requireIncludes(auditMigration, 'sit_reject_append_only_mutation()', 'audit migration');

  return {
    state: guardrails.state,
    requirements: sourceBinding.requirements.length,
    functionalRoles: roleModel.functionalRoles.length,
    founderHoursCategories: founderHours.categories.length,
    currentAssignmentsReady: false,
    invasiveTrackingEnabled: false,
  };
}

function run() {
  const result = validateFounderIndependenceGuardrails();
  console.log(
    `Founder-independence guardrails: PASS (state=${result.state}, ` +
      `requirements=${result.requirements}, roles=${result.functionalRoles}, ` +
      `hoursCategories=${result.founderHoursCategories}, assignmentsReady=false)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error?.message ?? 'FI0 guardrail validation failed.'}`);
    process.exitCode = 1;
  }
}
