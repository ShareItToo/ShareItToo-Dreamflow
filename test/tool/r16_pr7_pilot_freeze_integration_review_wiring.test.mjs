import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

const report = read('docs/operations/48H_R16_PR7_PILOT_FREEZE_INTEGRATION_REVIEW_2026-08-24.md');
const evidence = JSON.parse(read('docs/evidence/48h-remote/r16-pr7-pilot-freeze-integration-review-20260824.json'));

test('R16 preserves exact Draft and unmerged PR truth', () => {
  assert.equal(evidence.pullRequestSnapshot.number, 7);
  assert.equal(evidence.pullRequestSnapshot.draft, true);
  assert.equal(evidence.boundaries.pullRequestMerged, false);
  assert.match(report, /HOLD_PR7_DRAFT_UNMERGED/u);
});

test('R16 binds the current 72-up 45-down migration inventory', () => {
  assert.equal(evidence.migrationInventory.orderedUpScripts, 72);
  assert.equal(evidence.migrationInventory.pairedDownScripts, 45);
  assert.equal(evidence.migrationInventory.forwardOnlyRange, '001-027');
  assert.equal(evidence.migrationInventory.pairedRange, '028-072');
});

test('R16 keeps snapshot or forward fix as the data rollback default', () => {
  assert.equal(
    evidence.migrationInventory.defaultRollback,
    'verified-pre-migration-snapshot-or-reviewed-forward-fix',
  );
  assert.deepEqual(evidence.migrationInventory.destructiveRollbackGuards, [
    '032_support_case_foundation',
    '066_blue_ocean_listing_ai_foundation',
    '069_regional_price_engine_r6_hardening',
    '070_stage_a_non_binding_simulation_guard',
    '071_stripe_connect_accounts_v2',
    '072_dispute_transfer_recovery',
  ]);
});

test('R16 covers every required high-risk domain', () => {
  assert.deepEqual(Object.keys(evidence.domainAudit), [
    'authSecurity', 'legalEvidence', 'listingAiImage', 'priceEngine', 'g3',
    'g4', 'g5', 'support', 'privacy', 'buildRelease', 'deviceQa',
  ]);
});

test('R16 recommends six bounded reviewer groups', () => {
  assert.equal(evidence.reviewGroups.length, 6);
  assert.equal(new Set(evidence.reviewGroups).size, 6);
  assert.match(report, /Each group must record the exact proposed merge head/u);
});

test('R16 records actual release feature truth', () => {
  assert.equal(evidence.featureTruth.externalListingAi, 'disabled-manual-fallback');
  assert.equal(evidence.featureTruth.g3BookingGroups, 'off-release-mode-lock');
  assert.equal(evidence.featureTruth.realPayments, 'off');
  assert.equal(evidence.featureTruth.publicRegistrationAndStore, 'off');
});

test('R16 admits only the three direct findings to R17', () => {
  assert.deepEqual(evidence.findings.map(({ id }) => id), [
    'R16-P0-SEC-HISTORY-001',
    'R16-P1-STAGE-A-BINDING-001',
    'R16-P1-WAVE0-SURFACE-001',
  ]);
  assert.ok(evidence.findings.every(({ r17Eligible }) => r17Eligible));
});

test('R16 future merge uses a normal merge commit and invalidates stale review', () => {
  assert.equal(evidence.futureMergeProcedure.stepCount, 12);
  assert.equal(evidence.futureMergeProcedure.method, 'normal-merge-commit');
  assert.equal(evidence.futureMergeProcedure.newCommitInvalidatesReview, true);
  assert.equal(evidence.futureMergeProcedure.mergeAuthorizesDeployment, false);
});

test('R16 machine evidence contains no credential, identity or local path', () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /\/Users\//u);
  assert.doesNotMatch(serialized, /\bsk-[A-Za-z0-9]/u);
  assert.doesNotMatch(serialized, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u);
  assert.ok(Object.values(evidence.boundaries).every((state) => state === false));
});
