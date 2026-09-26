import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const harnessPath = 'tool/run_android_local_qa_backend.mjs';
const harness = readFileSync(new URL(`../../${harnessPath}`, import.meta.url), 'utf8');

test('local Android QA harness remains loopback-only, synthetic and cleanup-safe', () => {
  for (const marker of [
    "BIND_HOST: '127.0.0.1'",
    "SIT_LISTING_AI_PROVIDER: 'mock'",
    "SIT_LISTING_AI_BUDGET_CENTS: '0'",
    "PAYMENT_TRANSPORT: 'memory'",
    "SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'true'",
    "status: 'ready-local-qa-only'",
    'apiBinding: \'loopback-adb-reverse-only\'',
    'production: false',
    'cloud: false',
    "payment: 'memory-no-real-money'",
    'store: false',
    'if (sessionPath) rmSync(sessionPath, { force: true });',
    'rmSync(runRoot, { recursive: true, force: true });',
  ]) {
    assert.ok(harness.includes(marker), `missing harness marker: ${marker}`);
  }
});
