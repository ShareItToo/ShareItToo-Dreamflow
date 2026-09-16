import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
