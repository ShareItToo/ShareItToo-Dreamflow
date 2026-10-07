#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeSpecialCategoryHandling,
  specialCategoryDetectionVersion,
  specialCategoryHandlingVersion,
} from '../backend/src/special_category_data_guard.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const wp162Article9SourcePaths = Object.freeze([
  'backend/src/special_category_data_guard.js',
  'backend/src/support_case_domain.js',
  'backend/src/support_evidence_workflow.js',
]);

const sensitiveHandling = Object.freeze({
  version: specialCategoryHandlingVersion,
  necessityAcknowledged: true,
  warningShown: true,
  ownerRole: 'trust_safety_owner',
  scope: 'case_bound',
  replicationPolicy: 'no_unrestricted_replication',
});

const sensitiveDetection = Object.freeze({
  classification: 'possible_special_category',
  detectionVersion: specialCategoryDetectionVersion,
  fields: Object.freeze(['summary']),
});

function fail(message) {
  throw new Error(`WP162 ${message}.`);
}

function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function requireMarker(value, marker, label) {
  if (!value.includes(marker)) fail(`${label} marker missing: ${marker}`);
}

function assertNoAuthorizationFromReadiness(backendReadyStatus) {
  if (backendReadyStatus !== 200) fail('the readiness fixture must be HTTP 200');
  try {
    normalizeSpecialCategoryHandling(sensitiveHandling, {
      detection: sensitiveDetection,
    });
  } catch (error) {
    if (error?.message === 'article9_server_authorization_required') {
      return Object.freeze({
        backendReadyStatus,
        sensitiveFlow: 'denied',
        denialCode: error.message,
      });
    }
    fail(`sensitive flow returned an unexpected denial: ${error?.message ?? 'unknown'}`);
  }
  fail('sensitive flow was authorized without server Article 9 authorization');
}

export function validateWp162Article9DefaultDenyInvariant({
  repositoryRoot = root,
  sourceTexts = {},
  backendReadyStatus = 200,
} = {}) {
  const guard = source(repositoryRoot, wp162Article9SourcePaths[0], sourceTexts);
  const caseDomain = source(repositoryRoot, wp162Article9SourcePaths[1], sourceTexts);
  const evidenceWorkflow = source(repositoryRoot, wp162Article9SourcePaths[2], sourceTexts);

  requireMarker(guard, 'isTrustedServerArticle9Authorization(serverSideArticle9Authorization)', 'Article 9 guard');
  requireMarker(guard, "fail('article9_server_authorization_required'", 'Article 9 denial');
  requireMarker(caseDomain, 'serverSideArticle9Authorization,', 'support-case authorization input');
  requireMarker(caseDomain, 'normalizeSpecialCategoryHandling(', 'support-case Article 9 normalization');
  requireMarker(evidenceWorkflow, "const isArticle9ProductSafetyCase = supportCase.case_type === 'trust_safety'", 'evidence product-safety classification');
  requireMarker(evidenceWorkflow, "'support_evidence_article9_server_authorization_required'", 'evidence Article 9 denial');

  const denialIndex = evidenceWorkflow.indexOf(
    "'support_evidence_article9_server_authorization_required'",
  );
  const persistIndex = evidenceWorkflow.indexOf('if (persistFiles !== null)');
  if (denialIndex < 0 || persistIndex < 0 || denialIndex > persistIndex) {
    fail('Article 9 denial must precede file persistence');
  }

  const readinessResult = assertNoAuthorizationFromReadiness(backendReadyStatus);
  return Object.freeze({
    status: 'passed-default-deny-independent-of-readiness',
    sourcePaths: wp162Article9SourcePaths,
    ...readinessResult,
  });
}

function main() {
  const result = validateWp162Article9DefaultDenyInvariant();
  console.log(
    `WP162 valid: status=${result.status}, readiness=${result.backendReadyStatus}, denial=${result.denialCode}.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
