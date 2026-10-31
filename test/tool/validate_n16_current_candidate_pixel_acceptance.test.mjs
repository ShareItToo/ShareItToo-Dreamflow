import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN16CurrentCandidatePixelAcceptance,
} from '../../tool/validate_n16_current_candidate_pixel_acceptance.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n16-current-candidate-pixel-acceptance-2026090304.json',
), 'utf8'));

test('accepts the sanitized N16 current-candidate Pixel evidence', () => {
  assert.equal(validateN16CurrentCandidatePixelAcceptance(evidence), evidence);
});

test('rejects candidate, implementation or GitHub provenance drift', () => {
  for (const [path, value, pattern] of [
    [['candidate', 'artifactSourceCommit'], '0000000000000000000000000000000000000000', /artifactSourceCommit/u],
    [['qa', 'diagnosticToolsCommit'], '0000000000000000000000000000000000000000', /diagnosticToolsCommit/u],
    [['qa', 'githubRegressionRun'], 1, /GitHub regression run/u],
    [['qa', 'githubCodeql'], 'pending', /GitHub CodeQL/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[path[0]][path[1]] = value;
    assert.throws(() => validateN16CurrentCandidatePixelAcceptance(changed), pattern);
  }
});

test('rejects false email, runtime-AI or owner social-login completion claims', () => {
  for (const [path, value, pattern] of [
    [['emailVerification', 'verificationLinksFollowed'], 2, /followed verification links/u],
    [['emailVerification', 'realAccountLoginCompleted'], true, /real account login/u],
    [['listingAi', 'runtimeImageAnalysisCompleted'], true, /runtime image analysis/u],
    [['socialAuth', 'googleOwnerFlowCompleted'], true, /Google owner flow/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[path[0]][path[1]] = value;
    assert.throws(() => validateN16CurrentCandidatePixelAcceptance(changed), pattern);
  }
});

test('rejects binding, paid, Production, Store and OnePlus claims', () => {
  for (const [group, key] of [
    ['roleFlow', 'contractCreatedDuringProbe'],
    ['roleFlow', 'paymentEndpointCalled'],
    ['boundaries', 'realMoneyUsed'],
    ['boundaries', 'productionChanged'],
    ['boundaries', 'googlePlayChanged'],
    ['boundaries', 'onePlusContacted'],
  ]) {
    const changed = structuredClone(evidence);
    changed[group][key] = true;
    assert.throws(() => validateN16CurrentCandidatePixelAcceptance(changed), new RegExp(key));
  }
});

test('rejects weakening exact dialog ownership or offline recovery evidence', () => {
  for (const [path, value, pattern] of [
    [['pixel', 'logoutLifecycle', 'dialogClosureScope'], 'global-current-dialog', /dialog closure scope/u],
    [['pixel', 'offlineRealtime', 'neutralPopupAbsentBeforeSend'], false, /pre-send popup absence/u],
    [['pixel', 'offlineRealtime', 'networkRestored'], false, /network restoration/u],
    [['pixel', 'controlledFcm', 'notificationIconVisual'], 'prior-candidate-only', /notification icon review/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[path[0]][path[1]][path[2]] = value;
    assert.throws(() => validateN16CurrentCandidatePixelAcceptance(changed), pattern);
  }
});
