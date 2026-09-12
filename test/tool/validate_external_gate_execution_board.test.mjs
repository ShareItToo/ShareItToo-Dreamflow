import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateExternalGateExecutionBoard } from '../../tool/validate_external_gate_execution_board.mjs';

const board = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/external-gate-execution-board.json',
    import.meta.url,
  ),
  'utf8',
));
const canonical = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/technical-setup-manifest.json',
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

test('accepts eleven prepared gates with exact tier classifications and zero release tokens', () => {
  assert.deepEqual(validateExternalGateExecutionBoard(), {
    status: 'pilot-freeze-external-evidence-required',
    gateCount: 11,
    technicallyPreparedGateCount: 11,
    externallyReadyGateCount: 0,
    stageABlockerCount: 7,
    stageBOnlyBlockerCount: 1,
    stageCOnlyBlockerCount: 1,
    stageADeferredCount: 2,
    issuedReleaseTokenCount: 0,
    releaseDecision: 'hold-no-go',
  });
});

test('strict Stage A mode lists every still-open Stage A gate', () => {
  assert.throws(
    () => validateExternalGateExecutionBoard({ requireStageAReady: true }),
    /stage_a_external_gates_not_ready:legal_and_operator_approval.*explicit_activation_decision/u,
  );
});

test('rejects canonical gate state drift', () => {
  const changed = copy(canonical);
  changed.gates[0].state = 'ready';
  assert.throws(
    () => validateExternalGateExecutionBoard({ canonicalOverride: changed }),
    /canonical_gate_state_drift:legal_and_operator_approval/u,
  );
});

test('rejects tier-classification drift', () => {
  const changed = copy(board);
  changed.gates[5].tierClassification = 'BLOCKIERT STUFE A';
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: changed }),
    /tier_classification_invalid:psp_contract_and_sandbox_e2e/u,
  );
});

test('requires both Stage A deferrals to remain fail closed', () => {
  const changedIos = copy(board);
  changedIos.gates[2].stageADeferralCondition = 'Defer for now.';
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: changedIos }),
    /ios_deferral_boundary_invalid/u,
  );

  const changedScanner = copy(board);
  changedScanner.gates[4].stageADeferralCondition = 'Scanner later.';
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: changedScanner }),
    /scanner_deferral_boundary_invalid/u,
  );
});

test('Firebase lane keeps PF20 historical and current owner evidence open', () => {
  const missing = copy(board);
  missing.gates[3].historicalPhysicalEvidenceRefs =
    missing.gates[3].historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('firebase-device-services-opt-in'),
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: missing }),
    /firebase_device_services_evidence_invalid/u,
  );

  const overclaim = copy(board);
  overclaim.gates[3].technicalEvidenceSummary = overclaim.gates[3]
    .technicalEvidenceSummary.replace(
      'Owner terms and console controls remain unconfirmed',
      'Owner gate passed',
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: overclaim }),
    /firebase_device_services_evidence_invalid/u,
  );
});

test('Store lane separates current RW20 truth from historical PF evidence', () => {
  const stale = copy(board);
  stale.gates[7].historicalPhysicalEvidenceRefs =
    stale.gates[7].historicalPhysicalEvidenceRefs.map(
    (reference) => (
      reference.includes('touch-target-remediation-2026082302')
        ? 'docs/evidence/external-gates/current-head-android-candidate-2026082301.json'
        : reference
    ),
  );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: stale }),
    /store_candidate_evidence_invalid/u,
  );

  const missingPf21 = copy(board);
  missingPf21.gates[7].historicalPhysicalEvidenceRefs = missingPf21.gates[7]
    .historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-talkback-settings-preflight'),
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: missingPf21 }),
    /store_candidate_evidence_invalid/u,
  );

  const missingPf16 = copy(board);
  missingPf16.gates[7].historicalPhysicalEvidenceRefs = missingPf16.gates[7]
    .historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-read-only-regression'),
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: missingPf16 }),
    /store_candidate_evidence_invalid/u,
  );

  const missingPf17 = copy(board);
  missingPf17.gates[7].historicalPhysicalEvidenceRefs = missingPf17.gates[7]
    .historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-authenticated-safe-links'),
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: missingPf17 }),
    /store_candidate_evidence_invalid/u,
  );

  const missingPf19 = copy(board);
  missingPf19.gates[7].historicalPhysicalEvidenceRefs = missingPf19.gates[7]
    .historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-talkback-preflight'),
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: missingPf19 }),
    /store_candidate_evidence_invalid/u,
  );

  const overclaim = copy(board);
  overclaim.gates[7].technicalEvidenceSummary = overclaim.gates[7]
    .technicalEvidenceSummary.replace('manual visual review', 'visual review passed');
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: overclaim }),
    /store_candidate_evidence_invalid/u,
  );

  const talkBackOverclaim = copy(board);
  talkBackOverclaim.gates[7].technicalEvidenceSummary = talkBackOverclaim.gates[7]
    .technicalEvidenceSummary.replace(
      'the Android runtime did not enable touch exploration',
      'runtime touch exploration passed',
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: talkBackOverclaim }),
    /store_candidate_evidence_invalid/u,
  );

  const missingCurrentTruth = copy(board);
  missingCurrentTruth.gates[7].technicalEvidenceRefs = missingCurrentTruth.gates[7]
    .technicalEvidenceRefs.filter(
      (reference) => !reference.includes('rw20d-play-draft-truth-reconciliation'),
    );
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: missingCurrentTruth }),
    /store_candidate_evidence_invalid/u,
  );

  const transferredEvidence = copy(board);
  transferredEvidence.gates[7].historicalPhysicalCandidateBoundary
    .evidenceTransfersToCurrentCandidate = true;
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: transferredEvidence }),
    /store_candidate_temporal_boundary_invalid/u,
  );
});

test('rejects cyclic gate dependencies', () => {
  const changed = copy(board);
  changed.gates[0].dependencies = ['explicit_activation_decision'];
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: changed }),
    /dependency_cycle:/u,
  );
});

test('rejects secret-shaped fields, issued tokens and external mutations', () => {
  const changedSecret = copy(board);
  changedSecret.password = 'forbidden';
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: changedSecret }),
    /sensitive_field_forbidden:password/u,
  );

  const changedToken = copy(board);
  changedToken.gates[0].releaseTokenState = 'issued';
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: changedToken }),
    /release_token_invalid:legal_and_operator_approval/u,
  );

  const changedBoundary = copy(board);
  changedBoundary.boundaries.storeChanged = true;
  assert.throws(
    () => validateExternalGateExecutionBoard({ boardOverride: changedBoundary }),
    /external_boundary_invalid/u,
  );
});

test('complete regression permanently executes the external gate board validator', () => {
  assert.match(
    regression,
    /node --check tool\/validate_external_gate_execution_board\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_external_gate_execution_board\.test\.mjs/u,
  );
  assert.match(
    regression,
    /node tool\/validate_external_gate_execution_board\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_pf20_current_candidate_device_services_opt_in\.test\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_pf21_current_candidate_talkback_settings_preflight\.test\.mjs/u,
  );
});
