import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateRw20eCurrentCandidateExternalGateReconciliation,
} from '../../tool/validate_rw20e_current_candidate_external_gate_reconciliation.mjs';

const root = new URL('../../', import.meta.url).pathname;
const paths = {
  reconciliation:
    '../../store/google-play/rw20e-current-candidate-external-gate-reconciliation.json',
  technicalSetup: '../../docs/evidence/external-gates/technical-setup-manifest.json',
  executionBoard: '../../docs/evidence/external-gates/external-gate-execution-board.json',
  humanExecutionBoard: '../../docs/operations/EXTERNAL_GATE_EXECUTION_BOARD.md',
  walidActionPack: '../../docs/operations/WALID_EXTERNAL_GATE_ACTION_PACK.md',
  candidateManifest: '../../store/google-play/rw20-current-internal-candidate-manifest.json',
  rw20dReconciliation: '../../store/google-play/rw20d-play-draft-truth-reconciliation.json',
  operation:
    '../../docs/operations/RW20E_CURRENT_PLAY_CANDIDATE_EXTERNAL_GATE_RECONCILIATION_2026-08-27.md',
};
const canonical = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => {
    const text = await readFile(new URL(path, import.meta.url), 'utf8');
    return [key, path.endsWith('.json') ? JSON.parse(text) : text];
  }),
));

function validate(mutate = () => {}) {
  const value = structuredClone(canonical);
  mutate(value);
  return validateRw20eCurrentCandidateExternalGateReconciliation({ root, ...value });
}

test('accepts the current draft and historical physical evidence boundary', () => {
  assert.deepEqual(validate(), {
    status: 'reconciled-current-draft-and-historical-device-evidence-release-gated',
    currentCandidateVersionCode: '2026082601',
    activeInternalVersionCode: '2026081509',
    currentCandidateDeviceResults: 'NOT_RUN',
    historicalPhysicalVersionCode: '2026082302',
    evidenceTransfersToCurrentCandidate: false,
    nextRequiredGate: 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    verificationState: 'verified-exact-sha',
  });
});

test('rejects release, installation or current device-result overclaims', () => {
  for (const mutate of [
    (value) => { value.reconciliation.currentCandidate.playState = 'active'; },
    (value) => {
      value.reconciliation.currentCandidate.candidateExpectedInstalledOnOnePlus = true;
    },
    (value) => { value.reconciliation.currentCandidate.candidateDeviceResults = 'PASSED'; },
    (value) => { value.reconciliation.assertions.currentLifecyclePassClaimed = true; },
  ]) assert.throws(() => validate(mutate), /drifted|must all remain false/u);
});

test('rejects transfer of historical Pixel evidence to the current candidate', () => {
  for (const mutate of [
    (value) => {
      value.reconciliation.historicalPhysicalCandidate
        .evidenceTransfersToCurrentCandidate = true;
    },
    (value) => {
      value.technicalSetup.gates[7].historicalPhysicalCandidateBoundary
        .evidenceTransfersToCurrentCandidate = true;
    },
    (value) => {
      value.executionBoard.gates[7].historicalPhysicalCandidateBoundary
        .evidenceTransfersToCurrentCandidate = true;
    },
  ]) assert.throws(() => validate(mutate), /drifted|temporal_boundary/u);
});

test('rejects missing or current-lane historical references', () => {
  assert.throws(() => validate((value) => {
    value.reconciliation.historicalPhysicalCandidate.evidenceRefs.pop();
  }), /historicalPhysicalCandidate.evidenceRefs has drifted/u);

  assert.throws(() => validate((value) => {
    const firebaseGate = value.executionBoard.gates.find(
      ({ id }) => id === 'firebase_owner_terms_and_controls',
    );
    const [historical] = firebaseGate.historicalPhysicalEvidenceRefs.splice(0, 1);
    firebaseGate.technicalEvidenceRefs.push(historical);
  }), /firebase_device_services_evidence_invalid|historical Firebase/u);
});

test('rejects external mutations and private material', () => {
  assert.throws(() => validate((value) => {
    value.reconciliation.boundaries.storeChanged = true;
  }), /boundaries must all remain false/u);
  assert.throws(() => validate((value) => {
    value.reconciliation.note = 'person@example.invalid';
  }), /email address/u);
  assert.throws(() => validate((value) => {
    value.reconciliation.note = 'https://example.invalid/private';
  }), /URL/u);
});

test('accepts only exact successful closure evidence', () => {
  const head = 'a'.repeat(40);
  const verified = (value) => {
    value.reconciliation.verification = {
      state: 'verified-exact-sha',
      implementationHead: head,
      localTechnicalRegression: 'passed-standard-parallelism-no-workaround',
      githubRegression: {
        runId: 1,
        headSha: head,
        conclusion: 'success',
        publishApiImage: 'skipped',
      },
      githubCodeql: {
        runId: 2,
        headSha: head,
        conclusion: 'success',
      },
      openCodeScanningAlerts: 0,
      workaroundIntroduced: false,
    };
  };
  assert.equal(validate(verified).verificationState, 'verified-exact-sha');
  for (const mutate of [
    (value) => { value.reconciliation.verification.githubRegression.headSha = 'b'.repeat(40); },
    (value) => { value.reconciliation.verification.githubCodeql.conclusion = 'failure'; },
    (value) => { value.reconciliation.verification.openCodeScanningAlerts = 1; },
    (value) => { value.reconciliation.verification.workaroundIntroduced = true; },
  ]) assert.throws(() => validate((value) => {
    verified(value);
    mutate(value);
  }), /drifted/u);
});
