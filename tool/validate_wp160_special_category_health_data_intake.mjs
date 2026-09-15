#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  currentWp160EvidencePath,
  deriveChangedSourcePaths,
  precommitTargetRevision,
  reverseIndexEvidencePath,
} from './validate_wp160_source_binding_reverse_index.mjs';
import {
  boundDigest,
  materializeBoundSourceTexts,
  resolveBoundSnapshot,
} from './read_bound_source.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp160-special-category-health-data-intake-minimization-safety-20260915.json';
const handoverPath = 'docs/operations/WP160_SPECIAL_CATEGORY_HEALTH_DATA_INTAKE_MINIMIZATION_SAFETY_2026-09-15.md';

export const wp160SelfReferentialEvidencePaths = Object.freeze([
  currentWp160EvidencePath,
  reverseIndexEvidencePath,
]);
export function deriveWp160SourcePaths({ repositoryRoot = root, targetRevision } = {}) {
  return deriveChangedSourcePaths({ repositoryRoot, targetRevision })
    .filter((path) => !wp160SelfReferentialEvidencePaths.includes(path));
}

function fail(message) { throw new Error(`WP160 ${message}.`); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid`);
}
function text(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}
function digest(repositoryRoot, path, sourceTexts, revision, expectedDigest) {
  if (revision !== undefined) {
    return boundDigest({ repositoryRoot, path, sourceTexts, revision, expectedDigest });
  }
  return createHash('sha256').update(text(repositoryRoot, path, sourceTexts)).digest('hex');
}
function inventoryDigest(inventory) {
  return createHash('sha256').update(Object.entries(inventory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, hash]) => `${path}\0${hash}\n`).join('')).digest('hex');
}
function hasAll(value, markers, label) {
  for (const marker of markers) if (!value.includes(marker)) fail(`${label} marker missing: ${marker}`);
}

export function validateWp160SpecialCategoryHealthDataIntake({ repositoryRoot = root, evidence, sourceTexts = {} } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const targetRevision = value.repository?.targetRevision;
  if (!/^[a-f0-9]{40}$/u.test(targetRevision ?? '')
      && targetRevision !== precommitTargetRevision) {
    fail('target revision is missing or invalid');
  }
  const isPrecommit = value.captureAttestation?.mode === 'precommit';
  const expectedSourcePaths = deriveWp160SourcePaths({ repositoryRoot, targetRevision });
  if (!isPrecommit) {
    let boundSnapshot;
    try {
      boundSnapshot = resolveBoundSnapshot({
        repositoryRoot,
        baselineHead: value.repository?.baselineHead,
        inventory: value.sourceInventory,
        anchorPath: evidencePath,
        finalHead: targetRevision,
      });
      sourceTexts = {
        ...materializeBoundSourceTexts({ repositoryRoot, snapshot: boundSnapshot }),
        ...sourceTexts,
      };
    } catch (error) {
      fail(error?.message ?? 'bound source snapshot unavailable');
    }
  }
  exact(value.schemaVersion, 1, 'schemaVersion');
  exact(value.package, 'WP160-SPECIAL-CATEGORY-HEALTH-DATA-INTAKE-MINIMIZATION-SAFETY-20260915', 'package');
  exact(value.status, 'technical-closure-article9-gate-open', 'status');
  exact(value.repository?.branch, 'codex/master-workflow-20260808', 'repository branch');
  exact(value.repository?.baselineHead, 'c092cfe84965251f36a8f70525a49082f0959d63', 'repository baseline');
  exact(value.repository?.targetRevision, targetRevision, 'repository target revision');
  exact(value.technicalBoundary, {
    technicalOnly: true,
    article9BasisSelected: false,
    legalRoleDetermined: false,
    publicRuntimeEnabled: false,
    externalProviderEnabled: false,
  }, 'technical boundary');
  exact(value.accidentInjurySeparation, {
    accidentCanBeReportedWithoutInjury: true,
    injuryChoiceIsExplicit: true,
    genericAccidentOrInjuryWordingDoesNotInferHealth: true,
    injuryStateStoredOnlyWhenExplicitlySelected: true,
  }, 'accident/injury separation');
  exact(value.handlingControls, {
    intakeDetection: 'possible-special-category-only',
    handlingVersion: 'sit_special_category_handling_v1',
    detectionVersion: 'sit_special_category_detection_v1',
    warningAndNecessityRequired: true,
    ownerBindingRequired: true,
    caseBoundScopeRequired: true,
    unrestrictedReplicationBlocked: true,
    strictEvidenceClassificationRequired: true,
    missingEvidenceClassificationFailsClosed: true,
    staffProjectionOnly: true,
    exportClassificationOnly: true,
    erasurePolicyUnchangedAndLegallyOpen: true,
  }, 'handling controls');
  exact(value.boundaries, {
    article9BasisChosen: false,
    providerRoleOrDpaChanged: false,
    productionChanged: false,
    paymentChanged: false,
    storeChanged: false,
    cloudOrVpsChanged: false,
    deviceChanged: false,
    credentialsReadOrRecorded: false,
    pullRequestMerged: false,
  }, 'boundaries');
  exact(value.blockers, [
    'ASTRA_GATE_REQUIRED:SPECIAL_CATEGORY_ARTICLE9_BASIS',
    'OWNER_OR_PROFESSIONAL_REVIEW_REQUIRED:SPECIAL_CATEGORY_PROCESSING_PURPOSE_BASIS_ROLE',
  ], 'blockers');

  exact(
    Object.keys(value.sourceInventory).sort(),
    [...expectedSourcePaths].sort(),
    'source inventory paths',
  );
  exact(value.captureAttestation.inventoryDigestAlgorithm, 'sha256-path-nul-digest-newline-v1', 'inventory digest algorithm');
  exact(value.captureAttestation.sourceInventoryDigest, inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of expectedSourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) fail(`source inventory ${path} is not SHA-256`);
    exact(
      digest(repositoryRoot, path, sourceTexts, isPrecommit ? undefined : targetRevision, value.sourceInventory[path]),
      value.sourceInventory[path],
      `source inventory ${path}`,
    );
  }

  const handover = text(repositoryRoot, handoverPath, sourceTexts);
  hasAll(handover, [
    'WP160',
    'accident',
    'injury',
    'special-category',
    'Article 9',
    'No provider, payment, Store, production or device state changed',
    'ASTRA_GATE_REQUIRED:SPECIAL_CATEGORY_ARTICLE9_BASIS',
  ], 'handover');
  const currentPackage = text(repositoryRoot, 'docs/current_work_package.md', sourceTexts);
  hasAll(currentPackage, [
    'empty `items`',
    'latestAssistantMessageId',
    'exact task-completion event',
    'no-silent-turn rule remains unchanged',
  ], 'coordination ratchet');

  const serialized = JSON.stringify(value);
  if (/(?:password|secret|api[_-]?key|private[_-]?key|service[_-]?account|@)/iu.test(serialized)) {
    fail('evidence contains a secret-shaped or personal identifier');
  }
  return {
    status: value.status,
    sourceCount: expectedSourcePaths.length,
    article9Gate: value.blockers[0],
  };
}

function main() {
  const result = validateWp160SpecialCategoryHealthDataIntake();
  console.log(`WP160 valid: sources=${result.sourceCount}, blocker=${result.article9Gate}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
