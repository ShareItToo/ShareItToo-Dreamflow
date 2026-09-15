import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateWp152V54ContractDraft } from '../../tool/validate_wp152_v54_contract_draft.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const evidence = JSON.parse(readFileSync(
  resolve(
    repositoryRoot,
    'docs/evidence/release-readiness/wp152-v54-contract-draft-20260915.json',
  ),
  'utf8',
));

test('accepts the source-bound inactive V5.4 correction package', () => {
  const result = validateWp152V54ContractDraft({ repositoryRoot });
  assert.equal(result.successorVersion, 'V5.4-2026-09-15');
  assert.equal(result.bindingV54Allowed, false);
  assert.equal(result.realMoneyAllowed, false);
});

test('rejects a closure claim that activates V5.4 or hides legal approval', () => {
  const value = structuredClone(evidence);
  value.decision.successorActivationAllowed = true;
  value.gates.professionalLegalApproval = true;
  assert.throws(
    () => validateWp152V54ContractDraft({ repositoryRoot, evidence: value }),
    /decision is invalid/u,
  );
});

test('rejects dropping an Astra correction or external-evidence hold', () => {
  const value = structuredClone(evidence);
  value.corrections.addressed.pop();
  value.corrections.insufficientExternalEvidence = [];
  assert.throws(
    () => validateWp152V54ContractDraft({ repositoryRoot, evidence: value }),
    /addressed corrections is invalid/u,
  );
});

test('rejects source drift and a V5.4 runtime selection', () => {
  const value = structuredClone(evidence);
  value.sourceInventory['assets/legal/de/legal_manifest_v54.json'] = '0'.repeat(64);
  assert.throws(
    () => validateWp152V54ContractDraft({ repositoryRoot, evidence: value }),
    /source inventory digest|source inventory assets/u,
  );

  const path = 'backend/src/legal_contract_version_registry.js';
  const source = readFileSync(resolve(repositoryRoot, path), 'utf8').replace(
    "activeBindingContractVersion = 'V5.2-2026-08-16'",
    "activeBindingContractVersion = 'V5.4-2026-09-15'",
  );
  assert.throws(
    () => validateWp152V54ContractDraft({
      repositoryRoot,
      sourceTexts: { [path]: source },
    }),
    /runtime registry is missing activeBindingContractVersion/u,
  );
});

test('rejects anything except the exact passed full-regression evidence state', () => {
  const value = structuredClone(evidence);
  value.verification.fullTechnicalRegression = 'claimed-green';
  assert.throws(
    () => validateWp152V54ContractDraft({ repositoryRoot, evidence: value }),
    /full technical regression is invalid/u,
  );
});
