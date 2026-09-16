#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePilotLaunchTiers } from './validate_pilot_launch_tiers.mjs';
import {
  validatePf14bCurrentHeadAndroidTouchTarget,
} from './validate_pf14b_current_head_android_touch_target.mjs';
import {
  validatePf16CurrentCandidateReadOnly,
} from './validate_pf16_current_candidate_read_only.mjs';
import {
  validatePf17CurrentCandidateAuthenticatedSafeLinks,
} from './validate_pf17_current_candidate_authenticated_safe_links.mjs';
import {
  validatePf19CurrentCandidateTalkBackPreflight,
} from './validate_pf19_current_candidate_talkback_preflight.mjs';
import {
  validatePf20CurrentCandidateDeviceServicesOptIn,
} from './validate_pf20_current_candidate_device_services_opt_in.mjs';
import {
  validatePf21CurrentCandidateTalkBackSettingsPreflight,
} from './validate_pf21_current_candidate_talkback_settings_preflight.mjs';
import {
  validateRw20bOnePlusRemoteTestPlan,
} from './validate_rw20b_oneplus_remote_test_plan.mjs';
import {
  validateRw20cOnePlusOwnerSmokeReadiness,
} from './validate_rw20c_oneplus_owner_smoke_readiness.mjs';
import {
  validateRw20dPlayDraftTruthReconciliation,
} from './validate_rw20d_play_draft_truth_reconciliation.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const boardPath =
  'docs/evidence/external-gates/external-gate-execution-board.json';
const runbookPath = 'docs/operations/EXTERNAL_GATE_EXECUTION_BOARD.md';
const canonicalPath =
  'docs/evidence/external-gates/technical-setup-manifest.json';
const pf14bEvidencePath =
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json';
const pf16EvidencePath =
  'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json';
const pf17EvidencePath =
  'docs/evidence/external-gates/current-candidate-authenticated-safe-links-2026082302.json';
const pf19EvidencePath =
  'docs/evidence/external-gates/current-candidate-talkback-preflight-2026082302.json';
const pf20EvidencePath =
  'docs/evidence/external-gates/current-candidate-firebase-device-services-opt-in-2026082302.json';
const pf21EvidencePath =
  'docs/evidence/external-gates/current-candidate-talkback-settings-preflight-2026082302.json';
const supersededAndroidCandidatePath =
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json';
const rw20CandidateManifestPath =
  'store/google-play/rw20-current-internal-candidate-manifest.json';
const rw20UploadHandoffPath =
  'store/google-play/rw20-current-internal-upload-handoff.json';
const rw20bPlanPath = 'store/google-play/rw20b-oneplus-remote-test-plan.json';
const rw20cReadinessPath =
  'store/google-play/rw20c-oneplus-owner-smoke-readiness.json';
const rw20dReconciliationPath =
  'store/google-play/rw20d-play-draft-truth-reconciliation.json';

const stageABlockers = Object.freeze([
  'legal_and_operator_approval',
  'operations_roles_and_absence',
  'firebase_owner_terms_and_controls',
  'privacy_retention_and_legal_hold',
  'store_submission_and_closed_testing',
  'pilot_region_roster_and_scope',
  'explicit_activation_decision',
]);

const expectedGates = Object.freeze([
  ['legal_and_operator_approval', 'BLOCKIERT STUFE A', ['stage_a', 'stage_b', 'stage_c'], 'prepared-external-review-required'],
  ['operations_roles_and_absence', 'BLOCKIERT STUFE A', ['stage_a', 'stage_b', 'stage_c'], 'prepared-external-assignments-required'],
  ['ios_apple_signing_and_device', 'KANN FÜR STUFE A ZURÜCKGESTELLT WERDEN', [], 'android-ready-ios-external-setup-required'],
  ['firebase_owner_terms_and_controls', 'BLOCKIERT STUFE A', ['stage_a', 'stage_b', 'stage_c'], 'owner-console-confirmation-required'],
  ['support_evidence_scanner_and_upload_policy', 'KANN FÜR STUFE A ZURÜCKGESTELLT WERDEN', ['stage_b', 'stage_c'], 'intake-disabled-external-scanner-and-policy-required'],
  ['psp_contract_and_sandbox_e2e', 'BLOCKIERT NUR STUFE B', ['stage_b', 'stage_c'], 'provider-contract-and-sandbox-required'],
  ['privacy_retention_and_legal_hold', 'BLOCKIERT STUFE A', ['stage_a', 'stage_b', 'stage_c'], 'prepared-owner-and-legal-decisions-required'],
  [
    'store_submission_and_closed_testing',
    'BLOCKIERT STUFE A',
    ['stage_a', 'stage_b', 'stage_c'],
    'exact-internal-draft-uploaded-release-and-device-evidence-open',
  ],
  ['economics_and_cost_inputs', 'BLOCKIERT NUR STUFE C', ['stage_c'], 'external-cost-inputs-required'],
  ['pilot_region_roster_and_scope', 'BLOCKIERT STUFE A', ['stage_a', 'stage_b', 'stage_c'], 'prepared-prerequisites-open'],
  ['explicit_activation_decision', 'BLOCKIERT STUFE A', ['stage_a', 'stage_b', 'stage_c'], 'hold-explicit-decision-required'],
]);

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function same(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function inspectSensitiveKeys(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSensitiveKeys(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assertCondition(
      !/^(password|secret|email|accountid|credential|personname|deviceid)$/iu.test(key),
      `sensitive_field_forbidden:${[...trail, key].join('.')}`,
    );
    inspectSensitiveKeys(entry, [...trail, key]);
  }
}

function validateDependencies(gates) {
  const ids = new Set(gates.map((gate) => gate.id));
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 'active') throw new Error(`dependency_cycle:${id}`);
    if (state.get(id) === 'done') return;
    state.set(id, 'active');
    const gate = gates.find((entry) => entry.id === id);
    for (const dependency of gate.dependencies) {
      assertCondition(ids.has(dependency), `dependency_unknown:${id}:${dependency}`);
      assertCondition(dependency !== id, `dependency_self:${id}`);
      visit(dependency);
    }
    state.set(id, 'done');
  };
  gates.forEach((gate) => visit(gate.id));
}

export function validateExternalGateExecutionBoard({
  boardOverride,
  canonicalOverride,
  requireStageAReady = false,
} = {}) {
  validatePilotLaunchTiers();
  const board = boardOverride ?? readJson(boardPath);
  const canonical = canonicalOverride ?? readJson(canonicalPath);
  inspectSensitiveKeys(board);

  assertCondition(board.schemaVersion === 1, 'schema_version_invalid');
  assertCondition(board.kind === 'sit-external-gate-execution-board', 'kind_invalid');
  assertCondition(board.assessedOn === '2026-08-27', 'assessment_date_invalid');
  assertCondition(
    board.state === 'pilot-freeze-external-evidence-required',
    'state_invalid',
  );
  assertCondition(board.releaseDecision === 'hold-no-go', 'release_decision_invalid');
  assertCondition(
    board.tierMatrixRef === 'docs/evidence/external-gates/pilot-launch-tier-matrix.json',
    'tier_matrix_ref_invalid',
  );
  assertCondition(board.canonicalGateManifestRef === canonicalPath, 'canonical_ref_invalid');
  assertCondition(
    Object.keys(board.classificationMeaning ?? {}).length === 5,
    'classification_meaning_invalid',
  );
  assertCondition(
    Array.isArray(board.gates) && board.gates.length === expectedGates.length,
    'gate_count_invalid',
  );

  const releaseTokens = new Set();
  board.gates.forEach((gate, index) => {
    const [id, classification, blocksTiers, currentStatus] = expectedGates[index];
    assertCondition(gate.ordinal === index + 1 && gate.id === id, `gate_identity_invalid:${id}`);
    assertCondition(gate.tierClassification === classification, `tier_classification_invalid:${id}`);
    assertCondition(
      gate.readinessClassification === 'TECHNISCH BEREIT, EXTERNE EVIDENZ FEHLT',
      `readiness_classification_invalid:${id}`,
    );
    assertCondition(same(gate.blocksTiers, blocksTiers), `blocks_tiers_invalid:${id}`);
    assertCondition(gate.currentStatus === currentStatus, `gate_status_invalid:${id}`);
    assertCondition(typeof gate.goal === 'string' && gate.goal.length >= 25, `goal_missing:${id}`);
    assertCondition(
      Array.isArray(gate.technicalEvidenceRefs) && gate.technicalEvidenceRefs.length >= 2,
      `technical_evidence_missing:${id}`,
    );
    for (const reference of gate.technicalEvidenceRefs) {
      assertCondition(
        typeof reference === 'string'
          && !path.isAbsolute(reference)
          && !reference.includes('..')
          && existsSync(path.join(root, reference)),
        `technical_evidence_ref_invalid:${id}:${reference}`,
      );
    }
    for (const reference of gate.historicalPhysicalEvidenceRefs ?? []) {
      assertCondition(
        typeof reference === 'string'
          && !path.isAbsolute(reference)
          && !reference.includes('..')
          && existsSync(path.join(root, reference)),
        `historical_evidence_ref_invalid:${id}:${reference}`,
      );
    }
    assertCondition(
      typeof gate.technicalEvidenceSummary === 'string'
        && gate.technicalEvidenceSummary.length >= 40,
      `technical_evidence_summary_missing:${id}`,
    );
    assertCondition(
      Array.isArray(gate.missingExternalEvidence)
        && gate.missingExternalEvidence.length >= 3,
      `missing_external_evidence_invalid:${id}`,
    );
    assertCondition(
      typeof gate.requiredResponsibleRole === 'string'
        && gate.requiredResponsibleRole.length >= 10,
      `responsible_role_missing:${id}`,
    );
    assertCondition(
      typeof gate.cost?.state === 'string'
        && gate.cost.estimatedAmountEur === null
        && gate.cost.approvalRequiredBeforeCost === true,
      `cost_boundary_invalid:${id}`,
    );
    assertCondition(
      typeof gate.contractRequirement === 'string'
        && gate.contractRequirement.length >= 10,
      `contract_requirement_missing:${id}`,
    );
    assertCondition(gate.walidPresenceRequired === true, `walid_presence_invalid:${id}`);
    assertCondition(
      typeof gate.exactNextAction === 'string' && gate.exactNextAction.length >= 50,
      `next_action_missing:${id}`,
    );
    assertCondition(Array.isArray(gate.dependencies), `dependencies_invalid:${id}`);
    assertCondition(
      typeof gate.stopCondition === 'string' && gate.stopCondition.length >= 40,
      `stop_condition_missing:${id}`,
    );
    assertCondition(
      /^[A-Z0-9_]+$/u.test(gate.releaseToken ?? '')
        && gate.releaseTokenState === 'not-issued'
        && !releaseTokens.has(gate.releaseToken),
      `release_token_invalid:${id}`,
    );
    releaseTokens.add(gate.releaseToken);
    assertCondition(
      gate.codexCanContinueIndependentLane === true,
      `independent_lane_invalid:${id}`,
    );
  });

  const ios = board.gates[2];
  assertCondition(
    /android-only/iu.test(ios.stageADeferralCondition ?? '')
      && /no ios\/testflight claim/iu.test(ios.stageADeferralCondition ?? '')
      && same(ios.blocksCapabilities, ['ios-testflight', 'ios-public-distribution']),
    'ios_deferral_boundary_invalid',
  );
  const scanner = board.gates[4];
  assertCondition(
    /upload remains disabled/iu.test(scanner.stageADeferralCondition ?? '')
      && /text/iu.test(scanner.stageADeferralCondition ?? ''),
    'scanner_deferral_boundary_invalid',
  );
  const firebaseGate = board.gates[3];
  assertCondition(
    firebaseGate.technicalEvidenceRefs.includes(rw20CandidateManifestPath)
      && firebaseGate.technicalEvidenceRefs.includes(rw20dReconciliationPath)
      && firebaseGate.historicalPhysicalEvidenceRefs?.includes(pf20EvidencePath)
      && !firebaseGate.technicalEvidenceRefs.includes(pf20EvidencePath)
      && /2026082302/u.test(firebaseGate.technicalEvidenceSummary)
      && /separate Push and voluntary Crash-diagnostics switches/iu.test(
        firebaseGate.technicalEvidenceSummary,
      )
      && /both off/iu.test(firebaseGate.technicalEvidenceSummary)
      && /no consent dialog/iu.test(firebaseGate.technicalEvidenceSummary)
      && /requested no opt-in-dependent registration or report/iu.test(
        firebaseGate.technicalEvidenceSummary,
      )
      && /Owner terms and console controls remain unconfirmed/iu.test(
        firebaseGate.technicalEvidenceSummary,
      ),
    'firebase_device_services_evidence_invalid',
  );
  const storeGate = board.gates[7];
  assertCondition(
    storeGate.technicalEvidenceRefs.includes(rw20CandidateManifestPath)
      && storeGate.technicalEvidenceRefs.includes(rw20UploadHandoffPath)
      && storeGate.technicalEvidenceRefs.includes(rw20bPlanPath)
      && storeGate.technicalEvidenceRefs.includes(rw20cReadinessPath)
      && storeGate.technicalEvidenceRefs.includes(rw20dReconciliationPath)
      && storeGate.historicalPhysicalEvidenceRefs?.includes(pf14bEvidencePath)
      && storeGate.historicalPhysicalEvidenceRefs?.includes(pf16EvidencePath)
      && storeGate.historicalPhysicalEvidenceRefs?.includes(pf17EvidencePath)
      && storeGate.historicalPhysicalEvidenceRefs?.includes(pf19EvidencePath)
      && storeGate.historicalPhysicalEvidenceRefs?.includes(pf21EvidencePath)
      && !storeGate.technicalEvidenceRefs.includes(supersededAndroidCandidatePath)
      && /2026082601/u.test(storeGate.technicalEvidenceSummary)
      && /2026082302/u.test(storeGate.technicalEvidenceSummary)
      && /two authenticated cold starts/iu.test(storeGate.technicalEvidenceSummary)
      && /offline recovery/iu.test(storeGate.technicalEvidenceSummary)
      && /authenticated safe-link/iu.test(storeGate.technicalEvidenceSummary)
      && /manual visual review/iu.test(storeGate.technicalEvidenceSummary)
      && /TalkBack/iu.test(storeGate.technicalEvidenceSummary)
      && /runtime did not enable touch exploration/iu.test(storeGate.technicalEvidenceSummary)
      && /keyboard shortcut and user-visible Settings/iu.test(
        storeGate.technicalEvidenceSummary,
      )
      && /restored every setting exactly/iu.test(storeGate.technicalEvidenceSummary)
      && /do not transfer|does not transfer|none of those physical passes transfers/iu.test(
        storeGate.technicalEvidenceSummary,
      )
      && /NOT_RUN/u.test(storeGate.technicalEvidenceSummary),
    'store_candidate_evidence_invalid',
  );
  assertCondition(
    JSON.stringify(storeGate.currentCandidateTruth) === JSON.stringify({
      versionCode: '2026082601',
      playState: 'uploaded-inactive-internal-draft',
      activeInternalVersionCode: '2026081509',
      candidateExpectedInstalledOnOnePlus: false,
      candidateDeviceResults: 'NOT_RUN',
      nextRequiredGate: 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    })
      && storeGate.historicalPhysicalCandidateBoundary?.versionCode === '2026082302'
      && storeGate.historicalPhysicalCandidateBoundary?.evidenceTransfersToCurrentCandidate
        === false,
    'store_candidate_temporal_boundary_invalid',
  );
  const pf14bResult = validatePf14bCurrentHeadAndroidTouchTarget({
    root,
    evidence: readJson(pf14bEvidencePath),
    checkGitCommit: false,
  });
  assertCondition(
    pf14bResult.buildNumber === '2026082302'
      && pf14bResult.dataPreservingDirectUpdate === true
      && pf14bResult.minimumWidthDp >= 48
      && pf14bResult.minimumHeightDp >= 48
      && pf14bResult.manualVisualReview === false
      && pf14bResult.manualTalkBackTraversal === false
      && pf14bResult.stageAReady === false
      && pf14bResult.decision === 'hold-no-go',
    'store_candidate_gate_state_invalid',
  );
  const pf16Result = validatePf16CurrentCandidateReadOnly({
    root,
    evidence: readJson(pf16EvidencePath),
    pf14bEvidence: readJson(pf14bEvidencePath),
    checkGitCommit: false,
  });
  assertCondition(
    pf16Result.buildNumber === '2026082302'
      && pf16Result.exactInstalledApkVerified === true
      && pf16Result.processRestartPassed === true
      && pf16Result.authenticatedColdStartCycleCount === 2
      && pf16Result.offlineRecoveryPassed === true
      && pf16Result.mainNavigationDestinationCount === 5
      && pf16Result.legalRouteCount === 7
      && pf16Result.largeTextDestinationCount === 5
      && pf16Result.exactPreviousFontScaleRestored === true
      && pf16Result.manualVisualReview === false
      && pf16Result.manualTalkBackTraversal === false
      && pf16Result.completeDeviceMatrix === false
      && pf16Result.stageAReady === false
      && pf16Result.decision === 'hold-no-go',
    'store_candidate_read_only_gate_state_invalid',
  );
  const pf17Result = validatePf17CurrentCandidateAuthenticatedSafeLinks({
    root,
    evidence: readJson(pf17EvidencePath),
    pf16Evidence: readJson(pf16EvidencePath),
    pf14bEvidence: readJson(pf14bEvidencePath),
    checkGitCommit: false,
  });
  assertCondition(
    pf17Result.buildNumber === '2026082302'
      && pf17Result.exactInstalledApkVerified === true
      && pf17Result.authenticatedSafeLinksPassed === true
      && pf17Result.authenticatedSessionPreserved === true
      && pf17Result.authenticatedFixtureLinksPassed === false
      && pf17Result.bookingFlowPassed === false
      && pf17Result.realPushPassed === false
      && pf17Result.fullDeviceMatrixPassed === false
      && pf17Result.stageAReady === false
      && pf17Result.decision === 'hold-no-go',
    'store_candidate_safe_link_gate_state_invalid',
  );
  const pf19Result = validatePf19CurrentCandidateTalkBackPreflight({
    repositoryRoot: root,
    evidence: readJson(pf19EvidencePath),
    pf17Evidence: readJson(pf17EvidencePath),
    pf16Evidence: readJson(pf16EvidencePath),
    pf14bEvidence: readJson(pf14bEvidencePath),
    checkGitCommit: false,
  });
  assertCondition(
    pf19Result.buildNumber === '2026082302'
      && pf19Result.exactInstalledApkVerified === true
      && pf19Result.officialAuthorizationCompleted === true
      && pf19Result.serviceBound === true
      && pf19Result.runtimeTouchExplorationEnabled === false
      && pf19Result.traversalAttempted === false
      && pf19Result.exactConfigurationRestored === true
      && pf19Result.automatedTalkBackMainNavigationPassed === false
      && pf19Result.manualTalkBackTraversalPassed === false
      && pf19Result.stageAReady === false
      && pf19Result.decision === 'hold-no-go',
    'store_candidate_talkback_preflight_state_invalid',
  );
  const pf20Result = validatePf20CurrentCandidateDeviceServicesOptIn({
    repositoryRoot: root,
    evidence: readJson(pf20EvidencePath),
    pf19Evidence: readJson(pf19EvidencePath),
    pf17Evidence: readJson(pf17EvidencePath),
    pf16Evidence: readJson(pf16EvidencePath),
    pf14bEvidence: readJson(pf14bEvidencePath),
    checkGitCommit: false,
  });
  assertCondition(
    pf20Result.buildNumber === '2026082302'
      && pf20Result.exactInstalledApkVerified === true
      && pf20Result.independentSwitchCount === 2
      && pf20Result.pushEnabled === false
      && pf20Result.crashDiagnosticsEnabled === false
      && pf20Result.consentChanged === false
      && pf20Result.controlledCrashDiagnosticTriggered === false
      && pf20Result.optInDependentRegistrationOrReportRequested === false
      && pf20Result.exploreSurfaceRestored === true
      && pf20Result.firebaseOwnerGateSatisfied === false
      && pf20Result.stageAReady === false
      && pf20Result.decision === 'hold-no-go',
    'firebase_device_services_preflight_state_invalid',
  );
  const pf21Result = validatePf21CurrentCandidateTalkBackSettingsPreflight({
    repositoryRoot: root,
    evidence: readJson(pf21EvidencePath),
    pf20Evidence: readJson(pf20EvidencePath),
    pf19Evidence: readJson(pf19EvidencePath),
    pf17Evidence: readJson(pf17EvidencePath),
    pf16Evidence: readJson(pf16EvidencePath),
    pf14bEvidence: readJson(pf14bEvidencePath),
    checkGitCommit: false,
  });
  assertCondition(
    pf21Result.buildNumber === '2026082302'
      && pf21Result.exactInstalledApkVerified === true
      && pf21Result.settingsSurfaceOpened === true
      && pf21Result.settingsTogglePresent === true
      && pf21Result.confirmationAccepted === true
      && pf21Result.serviceBound === true
      && pf21Result.runtimeTouchExplorationEnabled === false
      && pf21Result.traversalAttempted === false
      && pf21Result.exactConfigurationRestored === true
      && pf21Result.exploreSurfaceRestored === true
      && pf21Result.automatedTalkBackMainNavigationPassed === false
      && pf21Result.manualTalkBackTraversalPassed === false
      && pf21Result.stageAReady === false
      && pf21Result.decision === 'hold-no-go',
    'store_candidate_talkback_settings_preflight_state_invalid',
  );
  const rw20bResult = validateRw20bOnePlusRemoteTestPlan({ root });
  const rw20cResult = validateRw20cOnePlusOwnerSmokeReadiness({ root });
  const rw20dResult = validateRw20dPlayDraftTruthReconciliation({ root });
  assertCondition(
    rw20bResult.candidateVersionCode === '2026082601'
      && rw20bResult.nextRequired === 'GOOGLE_PLAY_INTERNAL_RELEASE_GO'
      && rw20cResult.candidateVersionCode === '2026082601'
      && rw20cResult.executionResult === 'NOT_RUN'
      && rw20dResult.currentExactDraftUploaded === true
      && rw20dResult.activeInternalVersionCode === '2026081509'
      && rw20dResult.releaseActivated === false
      && rw20dResult.verificationState === 'verified-exact-sha',
    'rw20_current_candidate_state_invalid',
  );
  validateDependencies(board.gates);

  assertCondition(
    same(board.summary, {
      requiredGateCount: 11,
      technicallyPreparedGateCount: 11,
      externallyReadyGateCount: 0,
      stageABlockerCount: 7,
      stageBOnlyBlockerCount: 1,
      stageCOnlyBlockerCount: 1,
      stageADeferredCount: 2,
      issuedReleaseTokenCount: 0,
      releaseDecision: 'hold-no-go',
    }),
    'summary_invalid',
  );
  assertCondition(allFalse(board.boundaries), 'external_boundary_invalid');

  assertCondition(canonical.summary?.requiredGateCount === 11, 'canonical_gate_count_drift');
  assertCondition(canonical.summary?.technicallyPreparedGateCount === 11, 'canonical_preparation_drift');
  assertCondition(canonical.summary?.externallyReadyGateCount === 0, 'canonical_readiness_drift');
  assertCondition(canonical.releaseDecision === 'hold-no-go', 'canonical_decision_drift');
  assertCondition(Array.isArray(canonical.gates) && canonical.gates.length === 11, 'canonical_gates_invalid');
  board.gates.forEach((gate, index) => {
    const source = canonical.gates[index];
    assertCondition(source.id === gate.id, `canonical_gate_identity_drift:${gate.id}`);
    assertCondition(source.state === gate.currentStatus, `canonical_gate_state_drift:${gate.id}`);
    assertCondition(source.technicalPreparation === 'complete', `canonical_gate_preparation_drift:${gate.id}`);
    assertCondition(source.ready === false, `canonical_gate_ready_drift:${gate.id}`);
  });

  const legal = readJson('assets/legal/de/legal_review_intake_p0b_20260821.json');
  assertCondition(
    legal.professionallyReviewed === false && legal.openDecisionKeys?.length === 18,
    'legal_external_state_drift',
  );
  const operations = readJson('docs/operations/p0b-ops-role-delegate-absence-gate.json');
  assertCondition(
    operations.evaluation?.assignedRoleCount === 0
      && operations.evaluation?.humanAbsenceTestsPassed === 0,
    'operations_external_state_drift',
  );
  const signing = readJson('docs/evidence/p0b-next/signed-device-evidence.json');
  assertCondition(
    signing.releaseGate?.androidCurrentSourceSignedCandidate === true
      && signing.releaseGate?.androidCurrentSourcePhysicalEvidence === true
      && signing.releaseGate?.iosCurrentSourceSignedCandidate === false
      && signing.releaseGate?.iosCurrentSourcePhysicalEvidence === false,
    'signed_device_state_drift',
  );
  const scannerState = readJson('docs/evidence/external-gates/support-evidence-scanner-readiness.json');
  assertCondition(
    scannerState.evaluation?.requiredDecisionCount === 8
      && scannerState.evaluation?.completedDecisionCount === 0
      && scannerState.evaluation?.intakeActivationAllowed === false,
    'scanner_external_state_drift',
  );
  const psp = readJson('docs/evidence/p0b-next/psp-sandbox-e2e-evidence.json');
  assertCondition(
    psp.evaluation?.requiredScenarioCount === 8
      && psp.evaluation?.passedScenarioCount === 0
      && psp.evaluation?.realMoneyReady === false,
    'psp_external_state_drift',
  );
  const privacy = readJson('store/privacy-disclosures.json');
  const retention = readJson('store/retention-deletion-readiness.json');
  assertCondition(
    privacy.approvalAllowed === false
      && Object.keys(privacy.requiredDecisions ?? {}).length === 6
      && retention.approvalAllowed === false
      && Object.keys(retention.requiredDecisions ?? {}).length === 10,
    'privacy_retention_state_drift',
  );
  const store = readJson('store/submission.json');
  assertCondition(
    store.submissionAllowed === false
      && store.blockingGates?.googlePlayAccountAndFee === 'closed'
      && Object.values(store.blockingGates ?? {}).filter((value) => value === 'open').length === 11,
    'store_external_state_drift',
  );
  const dossier = readJson('docs/evidence/p0b/pilot-go-no-go-dossier.json');
  assertCondition(
    dossier.economicsAndFounderIndependence?.state === 'unavailable'
      && dossier.economicsAndFounderIndependence?.profitability === 'undetermined'
      && dossier.finalGate?.goNow === false,
    'economics_or_activation_state_drift',
  );
  const pilot = readJson('docs/evidence/p0b-next/invited-synthetic-pilot-spiegelberg-cat8-readiness.json');
  assertCondition(
    pilot.evaluation?.requiredPrerequisiteCount === 4
      && pilot.evaluation?.passedPrerequisiteCount === 0
      && pilot.evaluation?.controlledPilotEligible === false
      && allFalse(pilot.boundaries),
    'pilot_external_state_drift',
  );

  const runbook = readFileSync(path.join(root, runbookPath), 'utf8');
  for (const gate of board.gates) {
    assertCondition(runbook.includes(`\`${gate.id}\``), `runbook_gate_missing:${gate.id}`);
    assertCondition(runbook.includes(`\`${gate.releaseToken}\``), `runbook_token_missing:${gate.id}`);
  }
  for (const marker of [
    'BLOCKIERT STUFE A',
    'BLOCKIERT NUR STUFE B',
    'BLOCKIERT NUR STUFE C',
    'KANN FÜR STUFE A ZURÜCKGESTELLT WERDEN',
    'TECHNISCH BEREIT, EXTERNE EVIDENZ FEHLT',
  ]) {
    assertCondition(runbook.includes(marker), `runbook_classification_missing:${marker}`);
  }

  if (requireStageAReady) {
    throw new Error(`stage_a_external_gates_not_ready:${stageABlockers.join(',')}`);
  }

  return Object.freeze({
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
}

function runCli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--require-stage-a-ready']);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown !== undefined) throw new Error(`unknown_argument:${unknown}`);
  const result = validateExternalGateExecutionBoard({
    requireStageAReady: args.includes('--require-stage-a-ready'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
