import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateWp159ProcessorControllerRegionTransferTruth } from '../../tool/validate_wp159_processor_controller_region_transfer_truth.mjs';

const evidencePath = new URL('../../docs/evidence/release-readiness/wp159-processor-controller-region-transfer-truth-20260915.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));

test('accepts public technical facts while keeping account gates open', () => {
  const result = validateWp159ProcessorControllerRegionTransferTruth({ evidence });
  assert.equal(result.ownerGate, 'OWNER_GATE_REQUIRED:PROCESSOR_CONTRACT_REGION_TRANSFER_READBACK');
  assert.equal(result.providers, 7);
});

test('rejects invented active region or DPA acceptance', () => {
  const mutated = structuredClone(evidence);
  mutated.providerFindings.hostingerVps.actualActiveVpsRegionProven = true;
  assert.throws(() => validateWp159ProcessorControllerRegionTransferTruth({ evidence: mutated }), /Hostinger findings is invalid/u);
});

test('rejects a legal-role promotion from technical role', () => {
  const mutated = structuredClone(evidence);
  mutated.technicalControllerBoundary.legalControllerDeterminationCompleted = true;
  assert.throws(() => validateWp159ProcessorControllerRegionTransferTruth({ evidence: mutated }), /technical controller boundary is invalid/u);
});

test('rejects provider activation or transfer mutation', () => {
  const mutated = structuredClone(evidence);
  mutated.boundaries.mapsActivated = true;
  assert.throws(() => validateWp159ProcessorControllerRegionTransferTruth({ evidence: mutated }), /boundaries is invalid/u);
});
