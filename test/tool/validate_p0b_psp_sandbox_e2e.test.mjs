import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateP0BPspSandboxE2e } from '../../tool/validate_p0b_psp_sandbox_e2e.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifest = JSON.parse(readFileSync(
  resolve(root, 'docs/evidence/p0b-next/psp-sandbox-e2e-evidence.json'),
  'utf8',
));

test('accepts the source-bound provider-sandbox hold without claiming an E2E run', () => {
  assert.deepEqual(validateP0BPspSandboxE2e({ root, manifest }), {
    version: 'P0B-PSP-2026-08-21.1',
    state: 'hold-provider-contract-credentials-and-sandbox-e2e',
    repositorySources: 9,
    driveSources: 5,
    focusedLocalTestsPassed: 37,
    requiredScenarios: 8,
    providerScenariosPassed: 0,
    contractAndProviderFactsReady: false,
    sandboxE2ePassed: false,
    realMoneyReady: false,
  });
});

test('rejects inventing a provider contract or sandbox pass', () => {
  const changed = structuredClone(manifest);
  changed.provider.providerSelected = true;
  changed.provider.contractEvidenceRef = 'evidence://invented/contract';
  changed.scenarios[0].status = 'passed';
  changed.scenarios[0].evidenceRef = 'evidence://invented/scenario';
  assert.throws(
    () => validateP0BPspSandboxE2e({ root, manifest: changed }),
    /provider facts must remain explicitly unverified|recorded evaluation does not match/u,
  );
});

test('rejects source drift in the payment adapter or runbook', () => {
  assert.throws(
    () => validateP0BPspSandboxE2e({
      root,
      manifest,
      sourceOverrides: { 'backend/src/stripe_provider.js': '// changed' },
    }),
    /repository source drift/u,
  );
});

test('rejects secret-like content or a private filesystem path', () => {
  const changed = structuredClone(manifest);
  changed.privateNote = '/Users/example/provider-secret';
  assert.throws(
    () => validateP0BPspSandboxE2e({ root, manifest: changed }),
    /credential or private filesystem path/u,
  );
});

test('rejects any external, production, Store or real-money mutation claim', () => {
  const changed = structuredClone(manifest);
  changed.boundaries.externalProviderRequestPerformed = true;
  changed.boundaries.productionChanged = true;
  changed.boundaries.realMoneyUsed = true;
  assert.throws(
    () => validateP0BPspSandboxE2e({ root, manifest: changed }),
    /boundary must remain false/u,
  );
});
