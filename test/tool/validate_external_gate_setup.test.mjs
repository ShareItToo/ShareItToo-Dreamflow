import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateExternalGateSetup } from '../../tool/validate_external_gate_setup.mjs';

const manifest = JSON.parse(readFileSync(
  new URL('../../docs/evidence/external-gates/technical-setup-manifest.json', import.meta.url),
  'utf8',
));
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const storeReadme = readFileSync(
  new URL('../../store/README.md', import.meta.url),
  'utf8',
);
const supportTraceability = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/support/support-test-matrix-v1-traceability.json',
    import.meta.url,
  ),
  'utf8',
));
const supportEvidenceReadiness = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/support-evidence-scanner-readiness.json',
    import.meta.url,
  ),
  'utf8',
));
const activeProviderReadiness = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
    import.meta.url,
  ),
  'utf8',
));
const pf14bEvidence = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json',
    import.meta.url,
  ),
  'utf8',
));
const pf16Evidence = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json',
    import.meta.url,
  ),
  'utf8',
));
const pf19Evidence = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/current-candidate-talkback-preflight-2026082302.json',
    import.meta.url,
  ),
  'utf8',
));
const pf20Evidence = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/current-candidate-firebase-device-services-opt-in-2026082302.json',
    import.meta.url,
  ),
  'utf8',
));
const pf21Evidence = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/external-gates/current-candidate-talkback-settings-preflight-2026082302.json',
    import.meta.url,
  ),
  'utf8',
));

function copy(value) {
  return structuredClone(value);
}

test('accepts exactly eleven technically prepared and externally open gates', () => {
  assert.deepEqual(validateExternalGateSetup(), {
    status: 'prepared-hold',
    requiredGateCount: 11,
    technicallyPreparedGateCount: 11,
    externallyReadyGateCount: 0,
    supportScenarioCount: 167,
    supportExternalEvidenceRequiredCount: 47,
    supportExternalEvidencePresentCount: 0,
    supportEvidenceRequiredDecisionCount: 8,
    supportEvidenceCompletedDecisionCount: 0,
    classifiedActiveProcessorCount: 5,
    newlyExplicitActiveProcessorCount: 2,
    activeProviderRequiredDecisionCount: 10,
    activeProviderCompletedDecisionCount: 0,
    releaseDecision: 'hold-no-go',
  });
});

test('strict mode fails closed with every unresolved external gate', () => {
  assert.throws(
    () => validateExternalGateSetup({ requireReady: true }),
    /external_gates_not_ready:legal_and_operator_approval/u,
  );
});

test('cannot mark a gate ready without changing its canonical source truth', () => {
  const changed = copy(manifest);
  changed.gates[2].ready = true;
  changed.gates[2].externalEvidenceRef = 'docs/evidence/example.json';
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: changed }),
    /manifest_ready_without_current_source:ios_apple_signing_and_device/u,
  );
});

test('rejects credential-shaped or personal fields anywhere in the manifest', () => {
  const changed = copy(manifest);
  changed.gates[0].password = 'not-allowed';
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: changed }),
    /credential_shaped_field:gates.0.password/u,
  );
});

test('external setup is bound to the exact support matrix hold', () => {
  const changed = copy(supportTraceability);
  changed.summary.externalEvidenceRequiredCount = 46;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/support/support-test-matrix-v1-traceability.json': changed,
      },
    }),
    /summary_invalid/u,
  );
});

test('every support-matrix consumer retains the common evidence reference', () => {
  const changed = copy(manifest);
  const pspGate = changed.gates.find(({ id }) => id === 'psp_contract_and_sandbox_e2e');
  pspGate.currentEvidenceRefs = pspGate.currentEvidenceRefs.filter(
    (reference) => !reference.includes('support-test-matrix-v1-traceability'),
  );
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: changed }),
    /support_traceability_ref_invalid:psp_contract_and_sandbox_e2e/u,
  );
});

test('aggregate setup is bound to the disabled scanner readiness gate', () => {
  const changed = copy(supportEvidenceReadiness);
  changed.evaluation.requiredDecisionCount = 7;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/external-gates/support-evidence-scanner-readiness.json': changed,
      },
    }),
    /evaluation_invalid/u,
  );
});

test('aggregate setup is bound to the active hosting and mail provider hold', () => {
  const changed = copy(activeProviderReadiness);
  changed.evaluation.requiredDecisionCount = 9;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json':
          changed,
      },
    }),
    /evaluation_invalid/u,
  );
});

test('Firebase setup keeps PF20 as historical evidence and no consent change', () => {
  const missing = copy(manifest);
  const firebaseGate = missing.gates.find(
    ({ id }) => id === 'firebase_owner_terms_and_controls',
  );
  firebaseGate.historicalPhysicalEvidenceRefs =
    firebaseGate.historicalPhysicalEvidenceRefs.filter(
    (reference) => !reference.includes('firebase-device-services-opt-in'),
  );
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: missing }),
    /firebase_device_services_ref_invalid/u,
  );

  const overclaim = copy(pf20Evidence);
  overclaim.boundaries.firebaseOwnerGateSatisfied = true;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/external-gates/current-candidate-firebase-device-services-opt-in-2026082302.json':
          overclaim,
      },
    }),
    /boundaries are incomplete or overstate/u,
  );
});

test('Store setup separates current RW20 truth from historical PF evidence', () => {
  const changedRef = copy(manifest);
  const storeGate = changedRef.gates.find(
    ({ id }) => id === 'store_submission_and_closed_testing',
  );
  storeGate.historicalPhysicalEvidenceRefs =
    storeGate.historicalPhysicalEvidenceRefs.map((reference) => (
    reference.includes('touch-target-remediation-2026082302')
      ? 'docs/evidence/external-gates/current-head-android-candidate-2026082301.json'
      : reference
  ));
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: changedRef }),
    /store_candidate_ref_invalid/u,
  );

  const missingPf21 = copy(manifest);
  const missingPf21StoreGate = missingPf21.gates.find(
    ({ id }) => id === 'store_submission_and_closed_testing',
  );
  missingPf21StoreGate.historicalPhysicalEvidenceRefs =
    missingPf21StoreGate.historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-talkback-settings-preflight'),
    );
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: missingPf21 }),
    /store_candidate_ref_invalid/u,
  );

  const missingPf17 = copy(manifest);
  const missingPf17StoreGate = missingPf17.gates.find(
    ({ id }) => id === 'store_submission_and_closed_testing',
  );
  missingPf17StoreGate.historicalPhysicalEvidenceRefs =
    missingPf17StoreGate.historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-authenticated-safe-links'),
    );
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: missingPf17 }),
    /store_candidate_ref_invalid/u,
  );

  const missingPf19 = copy(manifest);
  const missingPf19StoreGate = missingPf19.gates.find(
    ({ id }) => id === 'store_submission_and_closed_testing',
  );
  missingPf19StoreGate.historicalPhysicalEvidenceRefs =
    missingPf19StoreGate.historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-talkback-preflight'),
    );
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: missingPf19 }),
    /store_candidate_ref_invalid/u,
  );

  const overclaim = copy(pf14bEvidence);
  overclaim.releaseGate.manualVisualReview = true;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json':
          overclaim,
      },
    }),
    /release gate/u,
  );

  const missingPf16 = copy(manifest);
  const missingPf16Store = missingPf16.gates.find(
    ({ id }) => id === 'store_submission_and_closed_testing',
  );
  missingPf16Store.historicalPhysicalEvidenceRefs =
    missingPf16Store.historicalPhysicalEvidenceRefs.filter(
      (reference) => !reference.includes('current-candidate-read-only-regression'),
    );
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: missingPf16 }),
    /store_candidate_ref_invalid/u,
  );

  const pf16Overclaim = copy(pf16Evidence);
  pf16Overclaim.releaseGate.manualTalkBackTraversal = true;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json':
          pf16Overclaim,
      },
    }),
    /release gate/u,
  );

  const pf19Overclaim = copy(pf19Evidence);
  pf19Overclaim.activation.runtimeTouchExplorationEnabled = true;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/external-gates/current-candidate-talkback-preflight-2026082302.json':
          pf19Overclaim,
      },
    }),
    /exact blocked runtime/u,
  );

  const pf21Overclaim = copy(pf21Evidence);
  pf21Overclaim.boundaries.automatedTalkBackMainNavigationPassed = true;
  assert.throws(
    () => validateExternalGateSetup({
      sourceOverrides: {
        'docs/evidence/external-gates/current-candidate-talkback-settings-preflight-2026082302.json':
          pf21Overclaim,
      },
    }),
    /must not claim/iu,
  );

  const missingCurrentTruth = copy(manifest);
  const missingCurrentTruthStore = missingCurrentTruth.gates.find(
    ({ id }) => id === 'store_submission_and_closed_testing',
  );
  missingCurrentTruthStore.currentEvidenceRefs =
    missingCurrentTruthStore.currentEvidenceRefs.filter(
      (reference) => !reference.includes('rw20d-play-draft-truth-reconciliation'),
    );
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: missingCurrentTruth }),
    /store_candidate_ref_invalid/u,
  );

  const transferredEvidence = copy(manifest);
  const transferredEvidenceStore = transferredEvidence.gates.find(
    ({ id }) => id === 'store_submission_and_closed_testing',
  );
  transferredEvidenceStore.historicalPhysicalCandidateBoundary
    .evidenceTransfersToCurrentCandidate = true;
  assert.throws(
    () => validateExternalGateSetup({ manifestOverride: transferredEvidence }),
    /store_candidate_temporal_boundary_invalid/u,
  );
});

test('current Store documentation reflects the machine-readable Google state', () => {
  assert.match(storeReadme, /Google-Play-Konto ist aktuell `ready`/u);
  assert.doesNotMatch(
    storeReadme,
    /Offen bleiben\s+die persönliche Identitätsprüfung, Geräte- und Telefonnummernbestätigung sowie\s+der erste App-Datensatz/u,
  );
});

test('complete regression permanently retains draft and strict validators', () => {
  assert.match(
    regression,
    /node --test test\/tool\/validate_external_gate_setup\.test\.mjs/u,
  );
  assert.match(regression, /node tool\/validate_external_gate_setup\.mjs/u);
  assert.match(
    regression,
    /node tool\/validate_pf20_current_candidate_device_services_opt_in\.mjs/u,
  );
  assert.match(
    regression,
    /node tool\/validate_pf21_current_candidate_talkback_settings_preflight\.mjs/u,
  );
});
