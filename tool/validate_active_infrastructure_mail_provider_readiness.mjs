#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath =
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json';
const classificationPath =
  'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json';
const privacyPath = 'store/privacy-disclosures.json';
const retentionPath = 'store/retention-deletion-readiness.json';
const decisionKeys = Object.freeze([
  'hosterAccountContractAndDpa',
  'hosterServiceSeatAndRegion',
  'hosterTransferMechanism',
  'hosterRetentionDeletionAndBackupRestore',
  'hosterIncidentSubprocessorAndExitProcedure',
  'smtpAccountContractAndDpa',
  'smtpServiceSeatAndSendingRegion',
  'smtpTransferMechanism',
  'smtpRetentionDeletionAndSuppression',
  'smtpTransactionalPayloadAndOperatorProcedure',
]);
const repositorySources = Object.freeze([
  Object.freeze([
    classificationPath,
    'ed73b938981e4d55c42f2b3faa555c3c44990de0a2c5685de9380d67f2460909',
  ]),
  Object.freeze([
    'assets/legal/de/legal_manifest_v52.json',
    '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b',
  ]),
  Object.freeze([
    privacyPath,
    '35c3a08e20e4f55183649af934e9415ea8cfd0c2d3327483a518cf477daee449',
  ]),
  Object.freeze([
    retentionPath,
    '955a901bbaec6511d119558b953274c3e5059a97c657fdcf93f2a939523315c8',
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

function readJson(relativePath, overrides) {
  return JSON.parse(readSource(relativePath, overrides).toString('utf8'));
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

export function validateActiveInfrastructureMailProviderReadiness({
  requireReady = false,
  manifestOverride,
  sourceOverrides,
} = {}) {
  const manifest = manifestOverride ?? readJson(manifestPath, sourceOverrides);
  inspectSensitiveKeys(manifest);
  assertCondition(
    !/(?:\/Users\/|BEGIN PRIVATE KEY|api[_-]?key|bearer\s+[A-Za-z0-9._-]+)/iu
      .test(JSON.stringify(manifest)),
    'sensitive_content_detected',
  );

  assertCondition(manifest.schemaVersion === 1, 'schema_version_invalid');
  assertCondition(
    manifest.kind === 'sit-active-infrastructure-and-mail-provider-readiness',
    'kind_invalid',
  );
  assertCondition(manifest.version === 'S4BX-2026-08-23.1', 'version_invalid');
  assertCondition(
    manifest.state === 'prepared-active-provider-facts-and-approvals-required',
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

  const classification = readJson(classificationPath, sourceOverrides);
  const privacy = readJson(privacyPath, sourceOverrides);
  const retention = readJson(retentionPath, sourceOverrides);
  const classified = new Map(
    (classification.services ?? []).map((service) => [service?.id, service]),
  );
  const hoster = privacy.externalServices?.hostingerVps;
  const smtp = privacy.externalServices?.googleWorkspaceSmtpRelay;
  assertCondition(
    classification.technicalConclusion?.activeProcessorServices?.length === 5
      && classification.technicalConclusion.consoleAnswerAllowed === false
      && classification.blockingGates?.currentAccountContractAcceptanceConfirmed === false
      && classification.blockingGates?.retentionAndDeletionScheduleApproved === false,
    'classification_state_invalid',
  );
  assertCondition(
    classified.get('hostingerVps')?.candidateState ===
        'active-first-party-backend-and-database-hosting'
      && classified.get('hostingerVps')?.technicalRole === 'processor'
      && classified.get('googleWorkspaceSmtpRelay')?.candidateState ===
        'active-staging-transactional-mail'
      && classified.get('googleWorkspaceSmtpRelay')?.technicalRole === 'processor',
    'active_processor_classification_invalid',
  );
  assertCondition(
    Object.keys(privacy.externalServices ?? {}).length === 11
      && hoster?.enabled === true
      && hoster.role === 'processor'
      && hoster.contractAndDpaApproved === false
      && hoster.providerSeatAndRegionApproved === false
      && hoster.transferMechanismApproved === false
      && hoster.retentionAndDeletionApproved === false
      && smtp?.enabled === true
      && smtp.role === 'processor'
      && smtp.contractAndDpaApproved === false
      && smtp.providerSeatAndSendingRegionApproved === false
      && smtp.transferMechanismApproved === false
      && smtp.retentionAndDeletionApproved === false
      && privacy.approvalAllowed === false,
    'privacy_inventory_invalid',
  );
  for (const processorId of ['hostingerVps', 'googleWorkspaceSmtpRelay']) {
    const processor = retention.externalProcessors?.[processorId];
    assertCondition(
      processor?.retentionOwnerVerified === false
        && processor.deletionProcedureVerified === false
        && processor.officialDocumentationReviewed === false
        && processor.officialEvidenceRef === null
        && processor.serviceReadinessRef === null
        && processor.ownerEvidenceRef === null,
      `retention_processor_state_invalid:${processorId}`,
    );
  }
  assertCondition(
    Object.keys(retention.externalProcessors ?? {}).length === 6
      && retention.approvalAllowed === false,
    'retention_inventory_invalid',
  );

  assertCondition(exact(manifest.technicalBaseline, {
    classifiedActiveProcessorCount: 5,
    newlyExplicitActiveProcessorCount: 2,
    privacyExternalServiceCount: 11,
    retentionExternalProcessorCount: 6,
    hosterCandidateState: 'active-first-party-backend-and-database-hosting',
    smtpCandidateState: 'active-staging-transactional-mail',
    hosterOfficialRetentionReviewComplete: false,
    smtpOfficialRetentionReviewComplete: false,
    privacyApprovalAllowed: false,
    retentionApprovalAllowed: false,
    storeSubmissionAllowed: false,
  }), 'technical_baseline_invalid');
  assertCondition(
    exact(Object.keys(manifest.requiredExternalDecisions ?? {}), decisionKeys),
    'decision_keys_invalid',
  );
  for (const key of decisionKeys) {
    assertCondition(exact(manifest.requiredExternalDecisions[key], {
      status: 'open',
      value: null,
      evidenceRef: null,
    }), `decision_must_remain_open:${key}`);
  }
  assertCondition(exact(manifest.evaluation, {
    requiredDecisionCount: decisionKeys.length,
    completedDecisionCount: 0,
    openDecisionKeys: decisionKeys,
    externalReadiness: false,
    privacyAndRetentionClosureAllowed: false,
  }), 'evaluation_invalid');
  assertCondition(allFalse(manifest.boundaries ?? {}), 'boundary_invalid');

  if (requireReady) {
    throw new Error(`active_provider_external_decisions_open:${decisionKeys.join(',')}`);
  }

  return Object.freeze({
    status: 'prepared-hold',
    classifiedActiveProcessorCount: 5,
    newlyExplicitActiveProcessorCount: 2,
    requiredDecisionCount: decisionKeys.length,
    completedDecisionCount: 0,
    externalReadiness: false,
  });
}

function runCli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--require-ready']);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown !== undefined) throw new Error(`unknown_argument:${unknown}`);
  process.stdout.write(`${JSON.stringify(validateActiveInfrastructureMailProviderReadiness({
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
