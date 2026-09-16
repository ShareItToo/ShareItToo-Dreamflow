import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateSupportTestMatrixTraceability,
} from '../../tool/validate_support_test_matrix_traceability.mjs';

const manifest = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/support/support-test-matrix-v1-traceability.json',
    import.meta.url,
  ),
  'utf8',
));
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function copy(value) {
  return structuredClone(value);
}

test('maps all 167 Drive scenarios once with exact blocker counts', () => {
  assert.deepEqual(validateSupportTestMatrixTraceability(), {
    status: 'technical-map-valid-hold',
    scenarioCount: 167,
    technicalCoverageCount: 167,
    gateCounts: {
      PILOT_BLOCKER: 112,
      PUBLIC_LAUNCH_BLOCKER: 20,
      QUALITY: 8,
      REAL_MONEY_BLOCKER: 27,
    },
    externalEvidenceRequiredCount: 47,
    externalEvidencePresentCount: 0,
    strictReleaseReady: false,
  });
});

test('release-ready mode fails closed on all external blocker scenarios', () => {
  assert.throws(
    () => validateSupportTestMatrixTraceability({ requireReleaseReady: true }),
    /support_matrix_external_evidence_open:47/u,
  );
});

test('a duplicate or missing scenario fails before a coverage claim', () => {
  const changed = copy(manifest);
  changed.areas[0].scenarioSpans[0].last = 15;
  assert.throws(
    () => validateSupportTestMatrixTraceability({ manifestOverride: changed }),
    /area_scenario_duplicate:SUP-15/u,
  );
});

test('public and real-money blockers cannot lose their external hold', () => {
  const changed = copy(manifest);
  changed.areas[5].externalOpenSpans[0].first = 67;
  assert.throws(
    () => validateSupportTestMatrixTraceability({ manifestOverride: changed }),
    /external_gate_mapping_invalid:SUP-066/u,
  );
});

test('evidence must remain executable and anchored to the mapped behavior', () => {
  const changed = copy(manifest);
  changed.areas[8].evidence[0].anchor = 'missing notification behavior';
  assert.throws(
    () => validateSupportTestMatrixTraceability({ manifestOverride: changed }),
    /evidence_anchor_missing:test\/tool\/support_notification_wiring\.test\.mjs/u,
  );
});

test('complete regression permanently runs traceability validation', () => {
  assert.match(
    regression,
    /node --check tool\/validate_support_test_matrix_traceability\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_support_test_matrix_traceability\.test\.mjs/u,
  );
  assert.match(
    regression,
    /node tool\/validate_support_test_matrix_traceability\.mjs/u,
  );
});
