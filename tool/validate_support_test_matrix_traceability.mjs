#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath =
  'docs/evidence/support/support-test-matrix-v1-traceability.json';

const expectedAreaIds = Object.freeze([
  'case_status',
  'intake_rbac',
  'messages',
  'booking_handover',
  'return',
  'money',
  'trust_security',
  'privacy_dsa',
  'ui_notification',
  'migration_ops',
]);
const expectedGateCounts = Object.freeze({
  PILOT_BLOCKER: 112,
  PUBLIC_LAUNCH_BLOCKER: 20,
  QUALITY: 8,
  REAL_MONEY_BLOCKER: 27,
});
const externalGateNames = new Set([
  'PUBLIC_LAUNCH_BLOCKER',
  'REAL_MONEY_BLOCKER',
]);

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function loadManifest(override) {
  if (override !== undefined) return override;
  return JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'));
}

function expandSpan(span, label) {
  assertCondition(Number.isInteger(span?.first), `span_first_invalid:${label}`);
  assertCondition(Number.isInteger(span?.last), `span_last_invalid:${label}`);
  assertCondition(span.first >= 1 && span.last <= 167, `span_bounds_invalid:${label}`);
  assertCondition(span.first <= span.last, `span_order_invalid:${label}`);
  return Array.from(
    { length: span.last - span.first + 1 },
    (_, index) => span.first + index,
  );
}

function allFalse(value) {
  return Object.values(value).every((entry) => entry === false);
}

export function validateSupportTestMatrixTraceability({
  manifestOverride,
  requireReleaseReady = false,
} = {}) {
  const manifest = loadManifest(manifestOverride);
  assertCondition(manifest.schemaVersion === 1, 'schema_version_invalid');
  assertCondition(
    manifest.kind === 'sit-support-test-matrix-v1-traceability',
    'kind_invalid',
  );
  assertCondition(
    manifest.state === 'technical-coverage-mapped-external-gates-closed',
    'state_invalid',
  );
  assertCondition(
    manifest.source?.packetVersion === 'SIT_SUPPORT_PACKET_V1_2026-08-20',
    'source_packet_version_invalid',
  );
  assertCondition(
    manifest.source?.fileName === '13_SIT_SUPPORT_TEST_MATRIX_V1.md',
    'source_file_name_invalid',
  );
  assertCondition(
    manifest.source?.driveFileId === '1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le',
    'source_drive_file_invalid',
  );
  assertCondition(
    manifest.source?.sha256
      === '83cc25371f24b3486230f3ac4e2b7e9c26c49a48bd5aca22a5449636c9ffc6d3',
    'source_hash_invalid',
  );
  assertCondition(manifest.source?.declaredScenarioCount === 167, 'source_count_invalid');
  assertCondition(
    manifest.source?.sourceReverification === 'drive-read-required-on-source-change',
    'source_reverification_invalid',
  );
  assertCondition(Array.isArray(manifest.areas), 'areas_missing');
  assertCondition(manifest.areas.length === expectedAreaIds.length, 'area_count_invalid');
  assertCondition(
    JSON.stringify(manifest.areas.map(({ id }) => id)) === JSON.stringify(expectedAreaIds),
    'area_order_invalid',
  );

  const scenarios = new Map();
  const externalOpen = new Set();
  for (const area of manifest.areas) {
    assertCondition(
      area.technicalCoverage === 'automated-non-live',
      `technical_coverage_invalid:${area.id}`,
    );
    assertCondition(
      Array.isArray(area.limitations) && area.limitations.length >= 1
        && area.limitations.every((entry) => typeof entry === 'string' && entry.length >= 20),
      `limitations_missing:${area.id}`,
    );
    assertCondition(
      Array.isArray(area.evidence) && area.evidence.length >= 2,
      `evidence_missing:${area.id}`,
    );
    for (const evidence of area.evidence) {
      assertCondition(
        typeof evidence.path === 'string'
          && !path.isAbsolute(evidence.path)
          && !evidence.path.includes('..')
          && /^(?:backend\/test|test)\/.+(?:_test\.dart|\.test\.(?:js|mjs))$/u
            .test(evidence.path),
        `evidence_path_invalid:${area.id}`,
      );
      const absolutePath = path.join(root, evidence.path);
      assertCondition(existsSync(absolutePath), `evidence_path_missing:${evidence.path}`);
      assertCondition(
        typeof evidence.anchor === 'string' && evidence.anchor.length >= 12,
        `evidence_anchor_invalid:${evidence.path}`,
      );
      assertCondition(
        readFileSync(absolutePath, 'utf8').includes(evidence.anchor),
        `evidence_anchor_missing:${evidence.path}`,
      );
    }
    assertCondition(
      Array.isArray(area.scenarioSpans) && area.scenarioSpans.length >= 1,
      `scenario_spans_missing:${area.id}`,
    );
    const areaScenarios = new Set();
    for (const [index, span] of area.scenarioSpans.entries()) {
      assertCondition(
        Object.hasOwn(expectedGateCounts, span.gate),
        `gate_invalid:${area.id}:${index}`,
      );
      for (const number of expandSpan(span, `${area.id}:${index}`)) {
        assertCondition(!areaScenarios.has(number), `area_scenario_duplicate:SUP-${number}`);
        assertCondition(!scenarios.has(number), `scenario_duplicate:SUP-${number}`);
        areaScenarios.add(number);
        scenarios.set(number, { areaId: area.id, gate: span.gate });
      }
    }
    assertCondition(Array.isArray(area.externalOpenSpans), `external_spans_missing:${area.id}`);
    for (const [index, span] of area.externalOpenSpans.entries()) {
      for (const number of expandSpan(span, `${area.id}:external:${index}`)) {
        assertCondition(areaScenarios.has(number), `external_scenario_outside_area:SUP-${number}`);
        assertCondition(!externalOpen.has(number), `external_scenario_duplicate:SUP-${number}`);
        externalOpen.add(number);
      }
    }
  }

  assertCondition(scenarios.size === 167, 'scenario_count_invalid');
  for (let number = 1; number <= 167; number += 1) {
    assertCondition(scenarios.has(number), `scenario_missing:SUP-${String(number).padStart(3, '0')}`);
  }
  const actualGateCounts = Object.fromEntries(
    Object.keys(expectedGateCounts).map((gate) => [
      gate,
      [...scenarios.values()].filter((entry) => entry.gate === gate).length,
    ]),
  );
  assertCondition(
    JSON.stringify(actualGateCounts) === JSON.stringify(expectedGateCounts),
    'gate_counts_invalid',
  );
  assertCondition(
    JSON.stringify(manifest.summary?.gateCounts) === JSON.stringify(expectedGateCounts),
    'summary_gate_counts_invalid',
  );
  for (const [number, scenario] of scenarios) {
    assertCondition(
      externalOpen.has(number) === externalGateNames.has(scenario.gate),
      `external_gate_mapping_invalid:SUP-${String(number).padStart(3, '0')}`,
    );
  }
  assertCondition(
    JSON.stringify(manifest.summary) === JSON.stringify({
      scenarioCount: 167,
      areaCount: 10,
      gateCounts: expectedGateCounts,
      technicalCoverageCount: 167,
      externalEvidenceRequiredCount: 47,
      externalEvidencePresentCount: 0,
      strictReleaseReady: false,
    }),
    'summary_invalid',
  );
  assertCondition(externalOpen.size === 47, 'external_evidence_count_invalid');
  assertCondition(allFalse(manifest.boundaries ?? {}), 'boundary_invalid');

  if (requireReleaseReady) {
    throw new Error('support_matrix_external_evidence_open:47');
  }

  return Object.freeze({
    status: 'technical-map-valid-hold',
    scenarioCount: scenarios.size,
    technicalCoverageCount: scenarios.size,
    gateCounts: actualGateCounts,
    externalEvidenceRequiredCount: externalOpen.size,
    externalEvidencePresentCount: 0,
    strictReleaseReady: false,
  });
}

function runCli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--require-release-ready']);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown !== undefined) throw new Error(`unknown_argument:${unknown}`);
  process.stdout.write(`${JSON.stringify(validateSupportTestMatrixTraceability({
    requireReleaseReady: args.includes('--require-release-ready'),
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
