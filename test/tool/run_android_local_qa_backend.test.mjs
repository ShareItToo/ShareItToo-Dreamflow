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
    "SIT_SYNTHETIC_CLONE_BOOKING_LANE: '1'",
    'SIT_SYNTHETIC_CLONE_OWNER_ID',
    'SIT_SYNTHETIC_CLONE_RENTER_ID',
    'SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET',
    'syntheticAccounts: 2',
    'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
    'Synthetic local QA clone cleanup verification failed.',
    'if (sessionPath) rmSync(sessionPath, { force: true });',
    'rmSync(runRoot, { recursive: true, force: true });',
  ]) {
    assert.ok(harness.includes(marker), `missing harness marker: ${marker}`);
  }
  assert.match(
    harness,
    /writeFileSync\(descriptor,[\s\S]*accounts,\s*transientCredentialsOwnerOnly: true,\s*syntheticClone: \{ \.\.\.cloneManifest, enabled: true \}/u,
  );
});

test('backend child is isolated so terminal shutdown leaves clone cleanup reachable', () => {
  assert.match(
    harness,
    /const startBackend = \(environment\) => spawn\(process\.execPath,[\s\S]*?detached: true,[\s\S]*?stdio: \['ignore', logDescriptor, logDescriptor\]/u,
  );
  const finallyBlock = harness.slice(harness.lastIndexOf('  } finally {'));
  const cloneCleanup = finallyBlock.indexOf("/v1/synthetic-clone/bookings");
  const reverseCleanup = finallyBlock.indexOf("'--remove'");
  const proxyCleanup = finallyBlock.indexOf('await closeServer(proxy)');
  const backendCleanup = finallyBlock.indexOf('await terminateChild(backendChild)');
  assert.ok(cloneCleanup >= 0, 'clone cleanup must run during finalization');
  assert.ok(cloneCleanup < reverseCleanup, 'clone cleanup must precede ADB cleanup');
  assert.ok(reverseCleanup < proxyCleanup, 'ADB cleanup must precede proxy shutdown');
  assert.ok(proxyCleanup < backendCleanup, 'proxy shutdown must precede backend termination');
});
