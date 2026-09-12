#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateSupportTestMatrixTraceability,
} from './validate_support_test_matrix_traceability.mjs';
import {
  validateSupportEvidenceExternalReadiness,
} from './validate_support_evidence_external_readiness.mjs';
import {
  validateActiveInfrastructureMailProviderReadiness,
} from './validate_active_infrastructure_mail_provider_readiness.mjs';
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
const manifestPath = 'docs/evidence/external-gates/technical-setup-manifest.json';
const supportTraceabilityPath =
  'docs/evidence/support/support-test-matrix-v1-traceability.json';
const supportEvidenceReadinessPath =
  'docs/evidence/external-gates/support-evidence-scanner-readiness.json';
const activeProviderReadinessPath =
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json';
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

const expectedGates = Object.freeze([
  ['legal_and_operator_approval', 'prepared-external-review-required'],
  ['operations_roles_and_absence', 'prepared-external-assignments-required'],
  ['ios_apple_signing_and_device', 'android-ready-ios-external-setup-required'],
  ['firebase_owner_terms_and_controls', 'owner-console-confirmation-required'],
  [
    'support_evidence_scanner_and_upload_policy',
    'intake-disabled-external-scanner-and-policy-required',
  ],
  ['psp_contract_and_sandbox_e2e', 'provider-contract-and-sandbox-required'],
  ['privacy_retention_and_legal_hold', 'prepared-owner-and-legal-decisions-required'],
  [
    'store_submission_and_closed_testing',
    'exact-internal-draft-uploaded-release-and-device-evidence-open',
  ],
  ['economics_and_cost_inputs', 'external-cost-inputs-required'],
  ['pilot_region_roster_and_scope', 'prepared-prerequisites-open'],
  ['explicit_activation_decision', 'hold-explicit-decision-required'],
]);
const supportTraceabilityConsumers = new Set([
  'legal_and_operator_approval',
  'psp_contract_and_sandbox_e2e',
  'privacy_retention_and_legal_hold',
  'store_submission_and_closed_testing',
  'explicit_activation_decision',
]);

function readJson(relativePath, overrides) {
  if (overrides?.[relativePath] !== undefined) return overrides[relativePath];
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function inspectSensitiveKeys(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSensitiveKeys(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assertCondition(
      !/^(password|secret|token|email|accountid|credential|personname|principalref)$/iu.test(key),
      `credential_shaped_field:${[...trail, key].join('.')}`,
    );
    inspectSensitiveKeys(entry, [...trail, key]);
  }
}

function allFalse(object) {
  return Object.values(object).every((value) => value === false);
}

export function validateExternalGateSetup({
  requireReady = false,
  manifestOverride,
  sourceOverrides,
} = {}) {
  const manifest = manifestOverride ?? readJson(manifestPath, sourceOverrides);
  inspectSensitiveKeys(manifest);

  assertCondition(manifest.schemaVersion === 1, 'schema_version_invalid');
  assertCondition(manifest.kind === 'sit-external-gate-technical-setup', 'kind_invalid');
  assertCondition(manifest.reconciledThrough === '2026-08-27', 'reconciliation_date_invalid');
  assertCondition(
    manifest.state === 'technically-prepared-external-inputs-required',
    'state_invalid',
  );
  assertCondition(manifest.releaseDecision === 'hold-no-go', 'release_decision_invalid');
  assertCondition(Array.isArray(manifest.gates), 'gates_missing');
  assertCondition(manifest.gates.length === expectedGates.length, 'gate_count_invalid');
  assertCondition(
    JSON.stringify(manifest.setupOrder) === JSON.stringify(expectedGates.map(([id]) => id)),
    'setup_order_invalid',
  );

  const supportTraceability = readJson(supportTraceabilityPath, sourceOverrides);
  const supportTraceabilityResult = validateSupportTestMatrixTraceability({
    manifestOverride: supportTraceability,
  });
  assertCondition(
    JSON.stringify(manifest.supportMatrixTraceability) === JSON.stringify({
      ref: supportTraceabilityPath,
      scenarioCount: 167,
      externalEvidenceRequiredCount: 47,
      externalEvidencePresentCount: 0,
      strictReleaseReady: false,
    }),
    'support_traceability_summary_invalid',
  );
  assertCondition(
    supportTraceabilityResult.scenarioCount === 167
      && supportTraceabilityResult.externalEvidenceRequiredCount === 47
      && supportTraceabilityResult.externalEvidencePresentCount === 0
      && supportTraceabilityResult.strictReleaseReady === false,
    'support_traceability_state_invalid',
  );

  const supportEvidenceReadiness = readJson(
    supportEvidenceReadinessPath,
    sourceOverrides,
  );
  const supportEvidenceReadinessResult = validateSupportEvidenceExternalReadiness({
    manifestOverride: supportEvidenceReadiness,
    sourceOverrides,
  });
  assertCondition(
    supportEvidenceReadinessResult.requiredDecisionCount === 8
      && supportEvidenceReadinessResult.completedDecisionCount === 0
      && supportEvidenceReadinessResult.intakeEnabled === false
      && supportEvidenceReadinessResult.scannerTransport === 'none'
      && supportEvidenceReadinessResult.externalReadiness === false,
    'support_evidence_readiness_state_invalid',
  );

  const activeProviderReadiness = readJson(
    activeProviderReadinessPath,
    sourceOverrides,
  );
  const activeProviderReadinessResult =
    validateActiveInfrastructureMailProviderReadiness({
      manifestOverride: activeProviderReadiness,
      sourceOverrides,
    });
  assertCondition(
    JSON.stringify(manifest.activeProviderReadiness) === JSON.stringify({
      ref: activeProviderReadinessPath,
      classifiedActiveProcessorCount: 5,
      newlyExplicitActiveProcessorCount: 2,
      requiredDecisionCount: 10,
      completedDecisionCount: 0,
      strictReady: false,
    }),
    'active_provider_readiness_summary_invalid',
  );
  assertCondition(
    activeProviderReadinessResult.classifiedActiveProcessorCount === 5
      && activeProviderReadinessResult.newlyExplicitActiveProcessorCount === 2
      && activeProviderReadinessResult.requiredDecisionCount === 10
      && activeProviderReadinessResult.completedDecisionCount === 0
      && activeProviderReadinessResult.externalReadiness === false,
    'active_provider_readiness_state_invalid',
  );

  const pf14bEvidence = readJson(pf14bEvidencePath, sourceOverrides);
  const pf14bResult = validatePf14bCurrentHeadAndroidTouchTarget({
    root,
    evidence: pf14bEvidence,
    checkGitCommit: false,
  });
  assertCondition(
    pf14bResult.buildNumber === '2026082302'
      && pf14bResult.exactCiPassed === true
      && pf14bResult.privateArchiveVerified === true
      && pf14bResult.dataPreservingDirectUpdate === true
      && pf14bResult.targetCount === 5
      && pf14bResult.minimumWidthDp >= 48
      && pf14bResult.minimumHeightDp >= 48
      && pf14bResult.manualVisualReview === false
      && pf14bResult.manualTalkBackTraversal === false
      && pf14bResult.stageAReady === false
      && pf14bResult.decision === 'hold-no-go',
    'pf14b_store_candidate_state_invalid',
  );
  const pf16Evidence = readJson(pf16EvidencePath, sourceOverrides);
  const pf16Result = validatePf16CurrentCandidateReadOnly({
    root,
    evidence: pf16Evidence,
    pf14bEvidence,
    checkGitCommit: false,
  });
  assertCondition(
    pf16Result.buildNumber === '2026082302'
      && pf16Result.privateArchiveVerified === true
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
    'pf16_store_candidate_state_invalid',
  );
  const pf17Evidence = readJson(pf17EvidencePath, sourceOverrides);
  const pf17Result = validatePf17CurrentCandidateAuthenticatedSafeLinks({
    root,
    evidence: pf17Evidence,
    pf16Evidence,
    pf14bEvidence,
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
    'pf17_store_candidate_safe_link_state_invalid',
  );
  const pf19Evidence = readJson(pf19EvidencePath, sourceOverrides);
  const pf19Result = validatePf19CurrentCandidateTalkBackPreflight({
    repositoryRoot: root,
    evidence: pf19Evidence,
    pf17Evidence,
    pf16Evidence,
    pf14bEvidence,
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
    'pf19_store_candidate_talkback_state_invalid',
  );
  const pf20Evidence = readJson(pf20EvidencePath, sourceOverrides);
  const pf20Result = validatePf20CurrentCandidateDeviceServicesOptIn({
    repositoryRoot: root,
    evidence: pf20Evidence,
    pf19Evidence,
    pf17Evidence,
    pf16Evidence,
    pf14bEvidence,
    checkGitCommit: false,
  });
  assertCondition(
    pf20Result.buildNumber === '2026082302'
      && pf20Result.exactInstalledApkVerified === true
      && pf20Result.independentSwitchCount === 2
      && pf20Result.pushControlPresent === true
      && pf20Result.pushEnabled === false
      && pf20Result.crashDiagnosticsControlPresent === true
      && pf20Result.crashDiagnosticsEnabled === false
      && pf20Result.consentChanged === false
      && pf20Result.controlledCrashDiagnosticTriggered === false
      && pf20Result.optInDependentRegistrationOrReportRequested === false
      && pf20Result.exploreSurfaceRestored === true
      && pf20Result.firebaseOwnerGateSatisfied === false
      && pf20Result.stageAReady === false
      && pf20Result.decision === 'hold-no-go',
    'pf20_firebase_device_services_state_invalid',
  );
  const pf21Evidence = readJson(pf21EvidencePath, sourceOverrides);
  const pf21Result = validatePf21CurrentCandidateTalkBackSettingsPreflight({
    repositoryRoot: root,
    evidence: pf21Evidence,
    pf20Evidence,
    pf19Evidence,
    pf17Evidence,
    pf16Evidence,
    pf14bEvidence,
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
    'pf21_store_candidate_talkback_settings_state_invalid',
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

  for (let index = 0; index < expectedGates.length; index += 1) {
    const gate = manifest.gates[index];
    const [expectedId, expectedState] = expectedGates[index];
    assertCondition(gate.id === expectedId, `gate_id_invalid:${expectedId}`);
    assertCondition(gate.state === expectedState, `gate_state_invalid:${expectedId}`);
    assertCondition(
      gate.technicalPreparation === 'complete',
      `technical_preparation_incomplete:${expectedId}`,
    );
    assertCondition(gate.ready === false, `manifest_ready_without_current_source:${expectedId}`);
    assertCondition(gate.externalEvidenceRef === null, `external_evidence_must_be_absent:${expectedId}`);
    assertCondition(
      Array.isArray(gate.currentEvidenceRefs) && gate.currentEvidenceRefs.length >= 2,
      `current_evidence_refs_missing:${expectedId}`,
    );
    for (const reference of gate.currentEvidenceRefs) {
      assertCondition(typeof reference === 'string', `evidence_ref_invalid:${expectedId}`);
      assertCondition(
        !path.isAbsolute(reference) && !reference.includes('..'),
        `evidence_ref_unsafe:${expectedId}`,
      );
      assertCondition(existsSync(path.join(root, reference)), `evidence_ref_missing:${reference}`);
    }
    for (const reference of gate.historicalPhysicalEvidenceRefs ?? []) {
      assertCondition(
        typeof reference === 'string'
          && !path.isAbsolute(reference)
          && !reference.includes('..')
          && existsSync(path.join(root, reference)),
        `historical_evidence_ref_invalid:${expectedId}:${reference}`,
      );
    }
    assertCondition(
      gate.currentEvidenceRefs.includes(supportTraceabilityPath)
        === supportTraceabilityConsumers.has(expectedId),
      `support_traceability_ref_invalid:${expectedId}`,
    );
    assertCondition(
      gate.currentEvidenceRefs.includes(supportEvidenceReadinessPath)
        === (expectedId === 'support_evidence_scanner_and_upload_policy'),
      `support_evidence_readiness_ref_invalid:${expectedId}`,
    );
    assertCondition(
      gate.currentEvidenceRefs.includes(activeProviderReadinessPath)
        === ['legal_and_operator_approval', 'privacy_retention_and_legal_hold']
          .includes(expectedId),
      `active_provider_readiness_ref_invalid:${expectedId}`,
    );
    if (expectedId === 'store_submission_and_closed_testing') {
      assertCondition(
        gate.currentEvidenceRefs.includes(rw20CandidateManifestPath)
          && gate.currentEvidenceRefs.includes(rw20UploadHandoffPath)
          && gate.currentEvidenceRefs.includes(rw20bPlanPath)
          && gate.currentEvidenceRefs.includes(rw20cReadinessPath)
          && gate.currentEvidenceRefs.includes(rw20dReconciliationPath)
          && gate.historicalPhysicalEvidenceRefs?.includes(pf14bEvidencePath)
          && gate.historicalPhysicalEvidenceRefs?.includes(pf16EvidencePath)
          && gate.historicalPhysicalEvidenceRefs?.includes(pf17EvidencePath)
          && gate.historicalPhysicalEvidenceRefs?.includes(pf19EvidencePath)
          && gate.historicalPhysicalEvidenceRefs?.includes(pf21EvidencePath)
          && !gate.currentEvidenceRefs.includes(supersededAndroidCandidatePath),
        'store_candidate_ref_invalid:store_submission_and_closed_testing',
      );
      assertCondition(
        JSON.stringify(gate.currentCandidateTruth) === JSON.stringify({
          versionCode: '2026082601',
          playState: 'uploaded-inactive-internal-draft',
          activeInternalVersionCode: '2026081509',
          candidateExpectedInstalledOnOnePlus: false,
          candidateDeviceResults: 'NOT_RUN',
          nextRequiredGate: 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
        })
          && gate.historicalPhysicalCandidateBoundary?.versionCode === '2026082302'
          && gate.historicalPhysicalCandidateBoundary?.evidenceTransfersToCurrentCandidate
            === false,
        'store_candidate_temporal_boundary_invalid',
      );
    }
    if (expectedId === 'firebase_owner_terms_and_controls') {
      assertCondition(
        gate.currentEvidenceRefs.includes(rw20CandidateManifestPath)
          && gate.currentEvidenceRefs.includes(rw20dReconciliationPath)
          && gate.historicalPhysicalEvidenceRefs?.includes(pf20EvidencePath)
          && !gate.currentEvidenceRefs.includes(pf20EvidencePath),
        'firebase_device_services_ref_invalid:firebase_owner_terms_and_controls',
      );
    }
  }

  assertCondition(
    JSON.stringify(manifest.summary) === JSON.stringify({
      requiredGateCount: 11,
      technicallyPreparedGateCount: 11,
      externallyReadyGateCount: 0,
      openGateCount: 11,
      supportScenarioCount: 167,
      supportExternalEvidenceRequiredCount: 47,
      supportExternalEvidencePresentCount: 0,
      supportEvidenceRequiredDecisionCount: 8,
      supportEvidenceCompletedDecisionCount: 0,
      classifiedActiveProcessorCount: 5,
      newlyExplicitActiveProcessorCount: 2,
      activeProviderRequiredDecisionCount: 10,
      activeProviderCompletedDecisionCount: 0,
      strictReady: false,
    }),
    'summary_invalid',
  );
  assertCondition(allFalse(manifest.boundaries), 'external_mutation_boundary_invalid');

  const legal = readJson(
    'assets/legal/de/legal_review_intake_p0b_20260821.json',
    sourceOverrides,
  );
  assertCondition(
    legal.status === 'prepared-awaiting-independent-professional-review',
    'legal_state_drift',
  );
  assertCondition(legal.professionallyReviewed === false, 'legal_approval_drift');
  assertCondition(legal.openDecisionKeys?.length === 18, 'legal_decision_count_drift');

  const operations = readJson(
    'docs/operations/p0b-ops-role-delegate-absence-gate.json',
    sourceOverrides,
  );
  assertCondition(operations.evaluation?.requiredRoleCount === 6, 'operations_role_count_drift');
  assertCondition(operations.evaluation?.assignedRoleCount === 0, 'operations_assignment_drift');
  assertCondition(operations.evaluation?.technicalRehearsalsPassed === 4, 'operations_rehearsal_drift');
  assertCondition(operations.evaluation?.humanAbsenceTestsPassed === 0, 'operations_absence_drift');
  assertCondition(operations.evaluation?.operationsReady === false, 'operations_ready_drift');

  const devices = readJson(
    'docs/evidence/p0b-next/signed-device-evidence.json',
    sourceOverrides,
  );
  assertCondition(devices.releaseGate?.androidCurrentSourceSignedCandidate === true, 'android_candidate_drift');
  assertCondition(devices.releaseGate?.androidCurrentSourcePhysicalEvidence === true, 'android_device_drift');
  assertCondition(devices.releaseGate?.iosCurrentSourceSignedCandidate === false, 'ios_candidate_drift');
  assertCondition(devices.releaseGate?.iosCurrentSourcePhysicalEvidence === false, 'ios_device_drift');

  const accounts = readJson('store/platform-account-readiness.json', sourceOverrides);
  assertCondition(accounts.googlePlay?.status === 'ready', 'google_play_account_drift');
  assertCondition(accounts.apple?.membershipActive === false, 'apple_membership_drift');
  assertCondition(accounts.firebase?.ownerTermsAccepted === false, 'firebase_terms_drift');

  const psp = readJson(
    'docs/evidence/p0b-next/psp-sandbox-e2e-evidence.json',
    sourceOverrides,
  );
  assertCondition(psp.scenarios?.length === 8, 'psp_scenario_count_drift');
  assertCondition(psp.evaluation?.passedScenarioCount === 0, 'psp_scenario_state_drift');
  assertCondition(psp.evaluation?.sandboxE2ePassed === false, 'psp_ready_drift');
  assertCondition(allFalse(psp.boundaries), 'psp_external_mutation_drift');

  const privacy = readJson('store/privacy-disclosures.json', sourceOverrides);
  const retention = readJson('store/retention-deletion-readiness.json', sourceOverrides);
  assertCondition(privacy.approvalAllowed === false, 'privacy_approval_drift');
  assertCondition(
    Object.values(privacy.requiredDecisions ?? {}).every(({ status }) => status === 'open'),
    'privacy_decision_drift',
  );
  assertCondition(retention.approvalAllowed === false, 'retention_approval_drift');
  assertCondition(
    Object.keys(retention.requiredDecisions ?? {}).length === 10,
    'retention_decision_count_drift',
  );
  assertCondition(
    Object.values(retention.requiredDecisions ?? {}).every(({ status }) => status === 'open'),
    'retention_decision_drift',
  );

  const submission = readJson('store/submission.json', sourceOverrides);
  assertCondition(submission.submissionAllowed === false, 'store_submission_drift');
  assertCondition(
    submission.blockingGates?.googlePlayAccountAndFee === 'closed',
    'google_play_gate_drift',
  );
  assertCondition(
    submission.blockingGates?.googlePlayClosedTestingRequirement === 'open',
    'closed_testing_drift',
  );
  assertCondition(
    submission.blockingGates?.appleAccountXcodeAndSigning === 'open',
    'apple_store_gate_drift',
  );

  const dossier = readJson(
    'docs/evidence/p0b/pilot-go-no-go-dossier.json',
    sourceOverrides,
  );
  assertCondition(
    dossier.economicsAndFounderIndependence?.state === 'unavailable',
    'economics_state_drift',
  );
  assertCondition(
    dossier.economicsAndFounderIndependence?.profitability === 'undetermined',
    'profitability_drift',
  );
  assertCondition(dossier.finalGate?.goNow === false, 'p0b_go_drift');
  assertCondition(dossier.finalGate?.autoContinue === false, 'p0b_autocontinue_drift');

  const pilot = readJson(
    'docs/evidence/p0b-next/invited-synthetic-pilot-spiegelberg-cat8-readiness.json',
    sourceOverrides,
  );
  assertCondition(pilot.evaluation?.passedPrerequisiteCount === 0, 'pilot_prerequisite_drift');
  assertCondition(pilot.evaluation?.controlledPilotEligible === false, 'pilot_eligibility_drift');
  assertCondition(pilot.boundaries?.regionOrCatalogConfigured === false, 'pilot_region_drift');
  assertCondition(allFalse(pilot.boundaries), 'pilot_external_mutation_drift');

  if (requireReady) {
    throw new Error(`external_gates_not_ready:${expectedGates.map(([id]) => id).join(',')}`);
  }

  return Object.freeze({
    status: 'prepared-hold',
    requiredGateCount: expectedGates.length,
    technicallyPreparedGateCount: expectedGates.length,
    externallyReadyGateCount: 0,
    supportScenarioCount: 167,
    supportExternalEvidenceRequiredCount: 47,
    supportExternalEvidencePresentCount: 0,
    supportEvidenceRequiredDecisionCount: 8,
    supportEvidenceCompletedDecisionCount: 0,
    classifiedActiveProcessorCount:
      activeProviderReadinessResult.classifiedActiveProcessorCount,
    newlyExplicitActiveProcessorCount:
      activeProviderReadinessResult.newlyExplicitActiveProcessorCount,
    activeProviderRequiredDecisionCount:
      activeProviderReadinessResult.requiredDecisionCount,
    activeProviderCompletedDecisionCount:
      activeProviderReadinessResult.completedDecisionCount,
    releaseDecision: 'hold-no-go',
  });
}

function runCli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--require-ready']);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown !== undefined) throw new Error(`unknown_argument:${unknown}`);
  const result = validateExternalGateSetup({
    requireReady: args.includes('--require-ready'),
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
