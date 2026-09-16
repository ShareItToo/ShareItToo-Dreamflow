import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateSupportEvidenceExternalReadiness,
} from '../../tool/validate_support_evidence_external_readiness.mjs';

const manifest = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/support-evidence-scanner-readiness.json',
    import.meta.url,
  ),
  'utf8',
));
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('accepts the disabled scanner and upload-policy hold', () => {
  assert.deepEqual(validateSupportEvidenceExternalReadiness(), {
    status: 'prepared-hold',
    requiredDecisionCount: 8,
    completedDecisionCount: 0,
    intakeEnabled: false,
    scannerTransport: 'none',
    externalReadiness: false,
  });
});

test('strict mode names every unresolved external decision', () => {
  assert.throws(
    () => validateSupportEvidenceExternalReadiness({ requireReady: true }),
    /support_evidence_external_decisions_open:scannerDeploymentMode/u,
  );
});

test('cannot approve a default upload limit without canonical evidence', () => {
  const changed = structuredClone(manifest);
  changed.requiredExternalDecisions.uploadLimitApproval = {
    status: 'complete',
    value: 8388608,
    evidenceRef: 'docs/evidence/example.json',
  };
  assert.throws(
    () => validateSupportEvidenceExternalReadiness({ manifestOverride: changed }),
    /decision_must_remain_open:uploadLimitApproval/u,
  );
});

test('rejects drift in the disabled production boundary', () => {
  const changed = structuredClone(manifest);
  changed.technicalBaseline.productionEnableAllowed = true;
  assert.throws(
    () => validateSupportEvidenceExternalReadiness({ manifestOverride: changed }),
    /technical_baseline_invalid/u,
  );
});

test('rejects repository source drift', () => {
  assert.throws(
    () => validateSupportEvidenceExternalReadiness({
      sourceOverrides: { 'backend/src/support_evidence_workflow.js': '// changed' },
    }),
    /repository_source_drift:backend\/src\/support_evidence_workflow\.js/u,
  );
});

test('rejects sensitive fields and external mutation claims', () => {
  const sensitive = structuredClone(manifest);
  sensitive.password = 'not-allowed';
  assert.throws(
    () => validateSupportEvidenceExternalReadiness({ manifestOverride: sensitive }),
    /credential_shaped_field:password/u,
  );

  const changed = structuredClone(manifest);
  changed.boundaries.externalScannerCalled = true;
  assert.throws(
    () => validateSupportEvidenceExternalReadiness({ manifestOverride: changed }),
    /boundary_invalid/u,
  );
});

test('complete regression permanently retains the scanner readiness gate', () => {
  assert.match(
    regression,
    /node --check tool\/validate_support_evidence_external_readiness\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_support_evidence_external_readiness\.test\.mjs/u,
  );
  assert.match(
    regression,
    /node tool\/validate_support_evidence_external_readiness\.mjs/u,
  );
});
