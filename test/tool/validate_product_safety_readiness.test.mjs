import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateProductSafetyReadiness } from
  '../../tool/validate_product_safety_readiness.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const approvedEnvironment = Object.freeze({
  SIT_PRODUCT_SAFETY_APPROVED: 'true',
  SIT_PRODUCT_SAFETY_CONFIGURATION_VERSION: 'GPSR-REVIEW-1',
  SIT_PRODUCT_SAFETY_CONSUMER_CONTACT_EMAIL: 'produktsicherheit@example.test',
  SIT_PRODUCT_SAFETY_AUTHORITY_CONTACT_REGISTERED: 'true',
  SIT_PRODUCT_SAFETY_SAFETY_GATE_REGISTERED: 'true',
  SIT_PRODUCT_SAFETY_INTERNAL_PROCESS_APPROVED: 'true',
});

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('default candidate keeps public product-safety launch closed', () => {
  assert.deepEqual(validateProductSafetyReadiness({ root, environment: {} }), {
    internalAuthenticatedIntakeReady: true,
    maximumCandidateTriageMinutes: 60,
    publicConfigurationReady: false,
    authorityTransportEnabled: false,
    automaticListingActionEnabled: false,
    publicReleaseAllowed: false,
  });
});

test('Store gate accepts only the complete explicit configuration fixture', () => {
  assert.equal(validateProductSafetyReadiness({
    root,
    environment: approvedEnvironment,
    requireApproved: true,
  }).publicReleaseAllowed, true);
  assert.throws(
    () => validateProductSafetyReadiness({
      root,
      environment: {
        ...approvedEnvironment,
        SIT_PRODUCT_SAFETY_SAFETY_GATE_REGISTERED: 'false',
      },
      requireApproved: true,
    }),
    /requires approved product-safety contacts/u,
  );
});

test('static gate rejects removal of the rapid red triage constraint', () => {
  const path = 'backend/sql/migrations/049_support_product_safety_intake.up.sql';
  const changed = read(path).replace(
    "approval_level = 'red_explicit_decision'",
    "approval_level = 'yellow_human_review'",
  );
  assert.throws(
    () => validateProductSafetyReadiness({
      root,
      sourceOverrides: { [path]: changed },
      environment: {},
    }),
    /Product-safety migration is missing/u,
  );
});

test('static gate rejects removal of the dedicated Flutter contact point', () => {
  const path = 'lib/screens/support_flow_screen.dart';
  const changed = read(path).replace(
    "label: 'Produktsicherheit melden'",
    "label: 'Allgemeine Hilfe'",
  );
  assert.throws(
    () => validateProductSafetyReadiness({
      root,
      sourceOverrides: { [path]: changed },
      environment: {},
    }),
    /Product-safety Flutter intake is missing/u,
  );
});
