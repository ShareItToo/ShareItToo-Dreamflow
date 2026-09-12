#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath =
  'docs/evidence/external-gates/support-evidence-scanner-readiness.json';
const decisionKeys = Object.freeze([
  'scannerDeploymentMode',
  'scannerSecurityReview',
  'processorAndTransferAssessment',
  'uploadLimitApproval',
  'allowedMimePolicyApproval',
  'retentionAndLegalHoldBinding',
  'operatorProcedureApproval',
  'signedCandidateAndEnvironmentBinding',
]);
const repositorySources = Object.freeze([
  Object.freeze([
    'backend/src/config.js',
    '90922f999317f81e466f6d120a4655d775587552e52d2004372e36687ad73966',
  ]),
  Object.freeze([
    'backend/src/support_evidence_workflow.js',
    '6846344047ada6a2d0ad76a934bb3f12cc290e007e453751c0aa4ada3364b8c4',
  ]),
  Object.freeze([
    'docs/architecture/s4a-private-support-evidence-security-2026-08-22.md',
    '468c23b3adbfc87a65b08bd8dca76818f7ef6b01a0797d8761f1f1cdb6521632',
  ]),
]);

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function readSource(relativePath, overrides) {
  if (overrides?.[relativePath] !== undefined) {
    return Buffer.from(String(overrides[relativePath]), 'utf8');
  }
  return readFileSync(path.join(root, relativePath));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inspectSensitiveKeys(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSensitiveKeys(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assertCondition(
      !/^(password|secret|token|email|accountid|credential|personname|principalref)$/iu
        .test(key),
      `credential_shaped_field:${[...trail, key].join('.')}`,
    );
    inspectSensitiveKeys(entry, [...trail, key]);
  }
}

function allFalse(value) {
  return Object.values(value).every((entry) => entry === false);
}

export function validateSupportEvidenceExternalReadiness({
  requireReady = false,
  manifestOverride,
  sourceOverrides,
} = {}) {
  const manifest = manifestOverride ?? JSON.parse(
    readSource(manifestPath, sourceOverrides).toString('utf8'),
  );
  inspectSensitiveKeys(manifest);
  assertCondition(
    !/(?:\/Users\/|BEGIN PRIVATE KEY|api[_-]?key|bearer\s+[A-Za-z0-9._-]+)/iu
      .test(JSON.stringify(manifest)),
    'sensitive_content_detected',
  );

  assertCondition(manifest.schemaVersion === 1, 'schema_version_invalid');
  assertCondition(
    manifest.kind === 'sit-support-evidence-scanner-and-upload-policy-readiness',
    'kind_invalid',
  );
  assertCondition(manifest.version === 'S4BW-2026-08-23.1', 'version_invalid');
  assertCondition(
    manifest.state === 'prepared-external-scanner-and-policy-decisions-required',
    'state_invalid',
  );
  assertCondition(exact(manifest.sourceBindings?.drive, {
    fileId: '1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN',
    title: '09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md',
    modifiedTime: '2026-08-20T22:27:16.931Z',
    sha256: 'ae1ce047453b2efd6e0da80718da57de43a9efb8b93ef4ed6a0850c55abcc80b',
  }), 'drive_source_invalid');

  assertCondition(
    Array.isArray(manifest.sourceBindings?.repository)
      && manifest.sourceBindings.repository.length === repositorySources.length,
    'repository_sources_invalid',
  );
  repositorySources.forEach(([sourcePath, hash], index) => {
    assertCondition(
      exact(manifest.sourceBindings.repository[index], { path: sourcePath, sha256: hash })
        && sha256(readSource(sourcePath, sourceOverrides)) === hash,
      `repository_source_drift:${sourcePath}`,
    );
  });

  assertCondition(exact(manifest.technicalBaseline, {
    intakeEnabled: false,
    productionEnableAllowed: false,
    operatingMode: 'simulation',
    scannerTransport: 'none',
    maxFileBytes: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    accessGrantLifetimeSeconds: 120,
    externalAiAllowed: false,
    originalPublicAccessAllowed: false,
    deterministicFixtureOnly: true,
  }), 'technical_baseline_invalid');

  assertCondition(
    exact(Object.keys(manifest.requiredExternalDecisions ?? {}), decisionKeys),
    'decision_keys_invalid',
  );
  for (const key of decisionKeys) {
    assertCondition(
      exact(manifest.requiredExternalDecisions[key], {
        status: 'open',
        value: null,
        evidenceRef: null,
      }),
      `decision_must_remain_open:${key}`,
    );
  }
  assertCondition(exact(manifest.evaluation, {
    requiredDecisionCount: decisionKeys.length,
    completedDecisionCount: 0,
    openDecisionKeys: decisionKeys,
    externalReadiness: false,
    intakeActivationAllowed: false,
  }), 'evaluation_invalid');
  assertCondition(allFalse(manifest.boundaries ?? {}), 'boundary_invalid');

  if (requireReady) {
    throw new Error(`support_evidence_external_decisions_open:${decisionKeys.join(',')}`);
  }

  return Object.freeze({
    status: 'prepared-hold',
    requiredDecisionCount: decisionKeys.length,
    completedDecisionCount: 0,
    intakeEnabled: false,
    scannerTransport: 'none',
    externalReadiness: false,
  });
}

function runCli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--require-ready']);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown !== undefined) throw new Error(`unknown_argument:${unknown}`);
  process.stdout.write(`${JSON.stringify(validateSupportEvidenceExternalReadiness({
    requireReady: args.includes('--require-ready'),
  }))}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
