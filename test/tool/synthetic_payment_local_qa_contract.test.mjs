import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { validateSyntheticPaymentReadback } from '../../tool/run_android_local_qa_backend.mjs';

const runId = 'wp255-20260929120000-aabbccdd';
const capability = {
  enabled: true, runId,
  marker: { persistentNotice: 'Synthetischer Zahlungstest – kein echtes Geld/kein Vertrag/keine Auszahlung', syntheticTestOnly: true, monetaryEffectMinor: 0, contractEligible: false, payoutEligible: false },
  methods: ['synthetic'], scenarios: ['challenge_then_capture', 'decline'], states: 0, commands: 0, auditEvents: 0,
};

test('runner capability and cleanup bind exact run, no-money marker and zero resources', () => {
  validateSyntheticPaymentReadback(undefined, { enabled: false, runId });
  validateSyntheticPaymentReadback(capability, { enabled: true, runId });
  validateSyntheticPaymentReadback({ ...capability, enabled: false }, { enabled: true, runId, cleaned: true });
  assert.throws(() => validateSyntheticPaymentReadback(capability, { enabled: false, runId }));
  for (const patch of [{ enabled: false }, { runId: 'other' }, { marker: { ...capability.marker, monetaryEffectMinor: 1 } }, { methods: ['card'] }, { scenarios: ['capture'] }, { states: 1 }, { commands: 1 }, { auditEvents: 1 }]) {
    assert.throws(() => validateSyntheticPaymentReadback({ ...capability, ...patch }, { enabled: true, runId }));
  }
  assert.throws(() => validateSyntheticPaymentReadback(capability, { enabled: true, runId, cleaned: true }));
});

test('release builder rejects synthetic payment flag before any build or tooling', () => {
  for (const flag of ['1', 'true', 'invalid']) {
    const result = spawnSync('bash', ['scripts/build_android_release_candidate.sh'], { encoding: 'utf8', env: { ...process.env, SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: flag } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Synthetic payment tests are local-QA-only/u);
  }
});

test('server safety gate precedes DB; harness bootstrap disables, successor explicitly opts in and validates cleanup', () => {
  const server = readFileSync('backend/src/server.js', 'utf8');
  assert.ok(server.indexOf('assertSyntheticPaymentTestEnvelope(paymentTestEnvelope)') < server.indexOf('await initializeDatabase()'));
  assert.match(server, /SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE \?\? '0'/u);
  const harness = readFileSync('tool/run_android_local_qa_backend.mjs', 'utf8');
  assert.match(harness, /SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: '0'/u);
  assert.match(harness, /SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: syntheticPaymentFlag/u);
  assert.match(harness, /validateSyntheticPaymentReadback\(cloneStatus\.paymentTest/u);
  assert.match(harness, /validateSyntheticPaymentReadback\(cleanup\.paymentTest,[^\n]+cleaned: true/u);
  assert.ok(harness.indexOf('const cloneRunId =') < harness.indexOf('await run(pg(\'initdb\')'));
  assert.ok(harness.indexOf('cloneCleanupToken = ownerAccount.accessToken') < harness.indexOf('validateSyntheticPaymentReadback(cloneStatus.paymentTest'));
  assert.match(readFileSync('scripts/technical_regression_check.sh', 'utf8'), /node --test test\/tool\/synthetic_payment_local_qa_contract\.test\.mjs/u);
});
