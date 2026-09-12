#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n1-listing-flow-audit-20260823.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function requireMarkers(repositoryRoot, path, markers) {
  const content = readRepositoryFile(repositoryRoot, path, { label: `N1 source ${path}` });
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N1 preserved source marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN1ListingFlowAudit({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(readRepositoryFile(repositoryRoot, evidencePath, {
    label: 'N1 evidence',
  }));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n1-listing-flow-audit'
      || value.status !== 'verified-ready-for-n2'
      || value.auditBaseHead !== 'd0866a38bd9384c9ac100018869f2805ee32df5f') {
    fail('N1 audit identity is invalid.');
  }

  const expectedAreas = [
    ['manual_listing_ui', 'DONE', null],
    ['photo_selection_storage', 'OPEN', 'N4'],
    ['category_allowlist', 'DONE', null],
    ['safety_moderation', 'OPEN', 'N2'],
    ['draft_model', 'CONFLICT', 'N2'],
    ['publish_transaction', 'CONFLICT', 'N6'],
    ['g5_enrichment', 'DONE', null],
    ['price_fields', 'CONFLICT', 'N5'],
    ['v52_fee_integration', 'DONE', null],
    ['privacy_retention', 'OPEN', 'N2'],
    ['feature_flags', 'OPEN', 'N3'],
  ];
  if (!Array.isArray(value.matrix) || value.matrix.length !== expectedAreas.length) {
    fail('N1 audit matrix must contain all eleven requested areas exactly once.');
  }
  for (let index = 0; index < expectedAreas.length; index += 1) {
    const entry = value.matrix[index];
    const [area, status, nextPackage] = expectedAreas[index];
    if (entry?.area !== area || entry?.status !== status || entry?.nextPackage !== nextPackage
        || typeof entry?.finding !== 'string' || entry.finding.length < 40
        || !Array.isArray(entry?.sources) || entry.sources.length === 0) {
      fail(`N1 audit matrix entry is invalid: ${area}`);
    }
  }
  if (!exact(value.counts, { DONE: 4, OPEN: 4, CONFLICT: 3, total: 11 })) {
    fail('N1 audit matrix counts are invalid.');
  }
  if (!exact(value.preservedInvariants, {
    manualListingCreationPreserved: true,
    historicalListingsUnchanged: true,
    existingPhotosUnchanged: true,
    explicitOwnerPublishRequired: true,
    listingAutoPublishAllowed: false,
    broadExternalAiAllowed: false,
    realMoneyAllowed: false,
    publicReleaseAllowed: false,
  })) {
    fail('N1 preservation boundary is invalid.');
  }
  if (!exact(value.implementationOrder, ['N2', 'N3', 'N4', 'N5', 'N6'])) {
    fail('N1 implementation order is invalid.');
  }
  if (!allFalse(value.boundaries)) fail('N1 records a forbidden mutation.');

  requireMarkers(repositoryRoot, 'lib/screens/create_listing_screen.dart', [
    'Future<void> _submit({bool forceInactive = false})',
    'if (_submitBusy) return;',
    '_submitBusy || _blueOceanBusy ? null : _submit,',
    ': () => _submit(forceInactive: true),',
    'await _listingMutationService.execute(',
    'final owner = _listingActions.capture();',
  ]);
  requireMarkers(repositoryRoot, 'lib/config/private_pilot_config.dart', [
    'static const bool aiFeaturesEnabled = false;',
    'static const bool realPaymentsEnabled = false;',
    'static bool categoryAllowed(',
    'static bool subcategoryAllowed(',
  ]);
  requireMarkers(repositoryRoot, 'backend/src/listing_supply_enrichment.js', [
    'externalGenerativeAiUsed: false',
    'primaryListingBlocked: false',
  ]);
  requireMarkers(repositoryRoot, 'backend/src/listing_catalog.js', [
    "status === 'active' && photos.length === 0",
    'status: payload.status',
  ]);

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|@/iu.test(serialized)) {
    fail('N1 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    done: value.counts.DONE,
    open: value.counts.OPEN,
    conflict: value.counts.CONFLICT,
    nextPackage: value.implementationOrder[0],
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateBlueOceanN1ListingFlowAudit();
    process.stdout.write(
      `Blue Ocean N1 listing audit valid: done=${result.done}, open=${result.open}, `
      + `conflict=${result.conflict}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Blue Ocean N1 listing audit validation failed.'}\n`);
    process.exitCode = 1;
  }
}
