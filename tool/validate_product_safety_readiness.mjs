#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readProductSafetyConfiguration } from
  '../backend/src/product_safety_config.js';

const requiredEnvironment = Object.freeze([
  'SIT_PRODUCT_SAFETY_APPROVED',
  'SIT_PRODUCT_SAFETY_CONFIGURATION_VERSION',
  'SIT_PRODUCT_SAFETY_CONSUMER_CONTACT_EMAIL',
  'SIT_PRODUCT_SAFETY_AUTHORITY_CONTACT_REGISTERED',
  'SIT_PRODUCT_SAFETY_SAFETY_GATE_REGISTERED',
  'SIT_PRODUCT_SAFETY_INTERNAL_PROCESS_APPROVED',
]);

function fail(message) {
  throw new Error(message);
}

function source(root, path, overrides) {
  return Object.hasOwn(overrides, path)
    ? overrides[path]
    : readFileSync(resolve(root, path), 'utf8');
}

function requireMarkers(content, markers, label) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`${label} is missing: ${marker}`);
  }
}

function assertWiring(root, overrides) {
  const domain = source(root, 'backend/src/support_case_domain.js', overrides);
  const workflow = source(root, 'backend/src/support_case_workflow.js', overrides);
  const migration = source(
    root,
    'backend/sql/migrations/049_support_product_safety_intake.up.sql',
    overrides,
  );
  const flutter = source(root, 'lib/screens/support_flow_screen.dart', overrides);
  const backendConfig = source(root, 'backend/src/config.js', overrides);
  const productConfig = source(root, 'backend/src/product_safety_config.js', overrides);
  const publicPages = source(root, 'backend/src/account_actions.js', overrides);
  const app = source(root, 'backend/src/app.js', overrides);
  const preflight = source(root, 'scripts/release_candidate_preflight.sh', overrides);
  const technicalRegression = source(
    root,
    'scripts/technical_regression_check.sh',
    overrides,
  );

  requireMarkers(domain, [
    "supportProductSafetyIntakeVersion = 'sit_product_safety_intake_v1'",
    "'sit_product_safety_contact_point_v1'",
    "caseSubType === 'dangerous_item_or_injury'",
    'support_product_safety_notice_required',
    'support_product_safety_guidance_required',
    'else if (productSafetyCandidate) priority = \'p1\'',
  ], 'Product-safety domain');
  requireMarkers(workflow, [
    'newHumanReadableProductSafetyNoticeNumber',
    'product_safety_notice_number',
    'product_safety_evidence',
    'product_safety_triage_due_at',
    'productSafetyTriageDueAt.toISOString()',
  ], 'Product-safety workflow');
  requireMarkers(migration, [
    "'^SIT-P-[A-HJ-NP-Z2-9]{12}$'",
    "case_type = 'trust_safety'",
    "case_subtype = 'dangerous_item_or_injury'",
    "created_at + INTERVAL '60 minutes'",
    "approval_level = 'red_explicit_decision'",
    "product_safety_evidence ->> 'safetyGuidanceAcknowledged' = 'true'",
  ], 'Product-safety migration');
  requireMarkers(flutter, [
    'class SupportProductSafetyNotice',
    "'product_safety': _SupportCategory",
    "label: 'Produktsicherheit melden'",
    "SupportCaseRoute('trust_safety', 'dangerous_item_or_injury')",
    "key: const ValueKey('support_product_safety_fields')",
    "'productSafetyNotice': productSafetyNotice!.toMap()",
  ], 'Product-safety Flutter intake');
  for (const field of requiredEnvironment) {
    if (!productConfig.includes(field)) {
      fail(`Product-safety configuration field is missing: ${field}`);
    }
    for (const path of [
      'backend/.env.example',
      'backend/.env.staging.example',
      'backend/compose.prod.yml',
      'backend/compose.staging.yml',
    ]) {
      if (!source(root, path, overrides).includes(field)) {
        fail(`Product-safety configuration is not wired in ${path}: ${field}`);
      }
    }
  }
  requireMarkers(backendConfig, [
    'readProductSafetyConfiguration',
    'PUBLIC_COMPLIANCE_APPROVED requires a complete approved product-safety contact and process configuration',
    'productSafety,',
  ], 'Product-safety backend configuration');
  requireMarkers(publicPages, [
    'productSafety.isComplete',
    "productSafety: productSafety.isComplete ? 'approved' : 'draft'",
    'Produktsicherheit melden',
    'productSafety.consumerContactEmail',
  ], 'Product-safety public contact');
  requireMarkers(app, [
    'config.productSafety.isComplete',
  ], 'Product-safety public route');
  requireMarkers(preflight, [
    'node tool/validate_product_safety_readiness.mjs',
    'node tool/validate_product_safety_readiness.mjs --require-approved',
  ], 'Product-safety release preflight');
  requireMarkers(technicalRegression, [
    'node --check tool/validate_product_safety_readiness.mjs',
    'node --test test/tool/validate_product_safety_readiness.test.mjs',
    'node tool/validate_product_safety_readiness.mjs',
  ], 'Product-safety technical regression');
}

export function validateProductSafetyReadiness({
  root,
  sourceOverrides = {},
  environment = process.env,
  requireApproved = false,
} = {}) {
  const repositoryRoot = root
    ?? resolve(fileURLToPath(new URL('..', import.meta.url)));
  assertWiring(repositoryRoot, sourceOverrides);
  const configuration = readProductSafetyConfiguration(environment);
  if (requireApproved && !configuration.isComplete) {
    fail('Store/public release requires approved product-safety contacts, registrations and internal process.');
  }
  return Object.freeze({
    internalAuthenticatedIntakeReady: true,
    maximumCandidateTriageMinutes: 60,
    publicConfigurationReady: configuration.isComplete,
    authorityTransportEnabled: false,
    automaticListingActionEnabled: false,
    publicReleaseAllowed: requireApproved && configuration.isComplete,
  });
}

function main() {
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--require-approved');
  if (unknown.length) fail(`Unknown argument: ${unknown[0]}`);
  const result = validateProductSafetyReadiness({
    requireApproved: process.argv.includes('--require-approved'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
