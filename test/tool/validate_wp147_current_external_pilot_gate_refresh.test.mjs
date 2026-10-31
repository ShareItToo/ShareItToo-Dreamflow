import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { validateWp147CurrentExternalPilotGateRefresh } from
  '../../tool/validate_wp147_current_external_pilot_gate_refresh.mjs';

const evidencePath = new URL(
  '../../docs/evidence/release-readiness/wp147-current-external-pilot-gate-refresh-20260914.json',
  import.meta.url,
);

function fixture() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('accepts the exact read-only external pilot-gate refresh', () => {
  const result = validateWp147CurrentExternalPilotGateRefresh({ evidence: fixture() });
  assert.equal(result.status, 'verified-external-gates-still-fail-closed');
  assert.deepEqual(result.portfolio, { pass: 22, partial: 5, open: 5 });
  assert.equal(result.stripeConnectedAccounts, 0);
  assert.equal(result.stripeWebhookDestinations, 0);
});

for (const mutate of [
  (value) => { value.driveReadback.v52.professionalApprovalPresent = true; },
  (value) => { value.driveReadback.currentFolder.newerP0bDecisionArtifactFound = true; },
  (value) => { value.stripeReadback.connectedAccountCount = 1; },
  (value) => { value.stripeReadback.webhookDestinationCount = 1; },
  (value) => { value.gateResults.invitedSyntheticPilot = 'READY'; },
  (value) => { value.boundaries.stripeObjectCreated = true; },
]) {
  test('rejects approval, provider, pilot or mutation overstatement', () => {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp147CurrentExternalPilotGateRefresh({ evidence: value }),
      /WP147/u,
    );
  });
}

test('rejects source-integrity drift', () => {
  const value = fixture();
  value.sourceInventory['assets/legal/de/legal_manifest_v52.json'] = '0'.repeat(64);
  assert.throws(
    () => validateWp147CurrentExternalPilotGateRefresh({ evidence: value }),
    /source inventory/u,
  );
});

test('rejects a different valid ancestor instead of silently rebinding history', () => {
  const value = fixture();
  value.repository.baselineHead = 'f2b6a32c387d43b93c137ce2217ba30dd6da4562';
  assert.throws(
    () => validateWp147CurrentExternalPilotGateRefresh({ evidence: value }),
    /repository is invalid/u,
  );
});

test('rejects a missing historical blob without a worktree fallback', () => {
  const value = fixture();
  const existing = 'docs/evidence/support/support-test-matrix-v1-traceability.json';
  delete value.sourceInventory[existing];
  value.sourceInventory['docs/evidence/support/missing-historical-source.json'] = '0'.repeat(64);
  assert.throws(
    () => validateWp147CurrentExternalPilotGateRefresh({ evidence: value }),
    /source inventory .* is unavailable at exact revision/u,
  );
});

test('ignores current worktree drift and hashes only the exact baseline blobs', (t) => {
  const value = fixture();
  const directory = mkdtempSync(join(tmpdir(), 'sit-wp147-exact-pin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const handoverPath = 'docs/operations/WP147_CURRENT_EXTERNAL_PILOT_GATE_REFRESH_2026-09-14.md';
  const handover = readFileSync(new URL('../../docs/operations/WP147_CURRENT_EXTERNAL_PILOT_GATE_REFRESH_2026-09-14.md', import.meta.url));
  mkdirSync(dirname(join(directory, handoverPath)), { recursive: true });
  writeFileSync(join(directory, handoverPath), handover);

  const baseline = value.repository.baselineHead;
  const blobs = new Map(Object.keys(value.sourceInventory).map((path) => [
    path,
    execFileSync('git', ['show', `${baseline}:${path}`]),
  ]));
  const driftedPath = Object.keys(value.sourceInventory)[0];
  mkdirSync(dirname(join(directory, driftedPath)), { recursive: true });
  writeFileSync(join(directory, driftedPath), 'current worktree drift must be ignored\n');

  const result = validateWp147CurrentExternalPilotGateRefresh({
    evidence: value,
    repositoryRoot: directory,
    gitShow: (_repositoryRoot, revision, path) => {
      assert.equal(revision, baseline);
      return blobs.get(path);
    },
  });
  assert.equal(result.status, 'verified-external-gates-still-fail-closed');
});
