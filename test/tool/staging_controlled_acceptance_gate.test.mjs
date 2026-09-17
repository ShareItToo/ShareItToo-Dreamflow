import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import test from 'node:test';

import { validateEvidence } from '../../backend/ops/validate_staging_controlled_acceptance.mjs';
import {
  assertPublicCandidateNotServed,
  assertLoopbackPortAvailable,
  cleanupAcceptance,
  pollAcceptanceEndpoint,
  sanitizeErrorCode,
  validateAcceptanceInventory,
  runCommand,
  runCommandStatus,
  runCommandWithInput,
} from '../../backend/ops/staging_controlled_acceptance.mjs';

const runtimeCommit = '8'.repeat(40);
const opsCommit = '9'.repeat(40);

async function evidenceFile(t, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sit-controlled-acceptance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'acceptance.json');
  await writeFile(file, JSON.stringify({
    kind: 'sit-staging-controlled-acceptance',
    status: 'passed',
    runtimeCommit,
    opsCommit,
    acceptanceTarget: 'loopback',
    acceptancePort: 18081,
    publicProxyReachable: false,
    publicCandidateServed: false,
    publicReleaseComplete: false,
    servicesRemainQuiesced: true,
    providerTraffic: false,
    ...extra,
  }));
  await chmod(file, 0o600);
  return file;
}

test('controlled acceptance evidence is bound to loopback and exact commits', async (t) => {
  const file = await evidenceFile(t);
  assert.equal(validateEvidence({ evidenceFile: file, runtimeCommit, opsCommit }).status, 'passed');

  const publicCandidate = await evidenceFile(t, { publicCandidateServed: true });
  assert.throws(
    () => validateEvidence({ evidenceFile: publicCandidate, runtimeCommit, opsCommit }),
    (error) => error?.code === 'controlled_acceptance_evidence_binding_invalid',
  );
  const wrongOps = await evidenceFile(t);
  assert.throws(
    () => validateEvidence({ evidenceFile: wrongOps, runtimeCommit, opsCommit: 'a'.repeat(40) }),
    (error) => error?.code === 'controlled_acceptance_evidence_binding_invalid',
  );
});

test('public candidate exposure is a hard failure, not a transport fallback', () => {
  assert.throws(
    () => assertPublicCandidateNotServed({ commit: runtimeCommit }, runtimeCommit),
    (error) => error?.code === 'public_proxy_serves_candidate',
  );
  assert.equal(assertPublicCandidateNotServed({ commit: 'a'.repeat(40) }, runtimeCommit), true);
});

test('status runner preserves exit status and sanitizes spawn errors', async () => {
  const ok = await runCommandStatus(process.execPath, ['-e', 'process.stdout.write("ok")']);
  assert.deepEqual(ok, { code: 0, stdout: 'ok' });
  const failed = await runCommandStatus(process.execPath, ['-e', 'process.stdout.write("failed"); process.exit(1)']);
  assert.deepEqual(failed, { code: 1, stdout: 'failed' });
  await assert.rejects(
    runCommandStatus('/definitely/missing/sit-command', []),
    (error) => error?.code === 'controlled_acceptance_status_failed'
      && !error.message.includes('definitely/missing'),
  );
  await assert.rejects(
    runCommand('/definitely/missing/sit-command', [], { phase: 'spawn' }),
    (error) => error?.code === 'controlled_acceptance_spawn_failed',
  );
});

test('acceptance command stdin is ignored when empty and safely handles input close races', async () => {
  const noInput = await runCommand(process.execPath, [
    '-e', 'process.stdin.destroy(); process.stdout.write("ok")',
  ], { phase: 'no_input_close' });
  assert.equal(noInput, 'ok');

  const echoed = await runCommandWithInput(process.execPath, [
    '-e', 'let value=""; process.stdin.on("data", chunk => { value += chunk; }); process.stdin.on("end", () => process.stdout.write(value));',
  ], 'payload', { phase: 'input_consumer' });
  assert.equal(echoed, 'payload');

  await assert.rejects(
    () => runCommandWithInput(process.execPath, [
      '-e', 'process.stdin.destroy(); setTimeout(() => process.exit(0), 50)',
    ], 'payload'.repeat(2_000_000), { phase: 'early_close' }),
    (error) => error?.message === 'controlled_acceptance_early_close_input_failed',
  );
});

test('controlled acceptance compose is loopback-only and provider-neutral', async () => {
  const compose = await readFile(new URL('../../backend/compose.staging.acceptance.yml', import.meta.url), 'utf8');
  assert.match(compose, /127\.0\.0\.1:\$\{STAGING_ACCEPTANCE_PORT:-18082\}:8080/u);
  assert.match(compose, /healthcheck:/u);
  assert.match(compose, /health\/ready/u);
  assert.match(compose, /start_period: 5s/u);
  assert.match(compose, /MFA_ENCRYPTION_KEY_FILE: \/run\/secrets\/mfa-encryption-key/u);
  assert.doesNotMatch(compose, /env_file:/u);
  assert.match(compose, /PAYMENT_TRANSPORT: memory/u);
  assert.match(compose, /STRIPE_LIVEMODE: "false"/u);
  assert.match(compose, /IDENTITY_VERIFICATION_TRANSPORT: disabled/u);
  assert.match(compose, /SIT_LISTING_AI_PROVIDER: mock/u);
});

test('acceptance runner binds the Ops checkout and keeps the public service stopped', async () => {
  const runner = await readFile(new URL('../../backend/ops/staging_controlled_acceptance.mjs', import.meta.url), 'utf8');
  assert.match(runner, /git', \['rev-parse', 'HEAD'\]/u);
  assert.match(runner, /ops_checkout_commit_mismatch/u);
  assert.match(runner, /shareittoo-staging-api/u);
  assert.match(runner, /public_staging_service_running/u);
  assert.match(runner, /validate_mfa_staging_secret\.mjs/u);
  assert.match(runner, /MFA_ENCRYPTION_KEY_RUNTIME_READABLE: '1'/u);
  assert.match(runner, /acceptance_port_occupied/u);
  assert.match(runner, /acceptance_cleanup_identity_failed/u);
  assert.match(runner, /mode === 'run'/u);
  assert.match(runner, /pollAcceptanceEndpoint\('\/version'/u);
  assert.match(runner, /writeFailureEvidence/u);
  assert.match(runner, /phase: 'acceptance_readiness'/u);
  assert.match(runner, /preCleanupState/u);
  assert.match(runner, /cleanupErrorCode/u);
  assert.match(runner, /pending !== true/u);
  assert.match(runner, /pending !== false/u);
  assert.match(runner, /mfa_probe_http_/u);
});

test('loopback port preflight rejects an occupied listener and accepts a free one', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve));
  const occupied = server.address().port;
  await assert.rejects(
    assertLoopbackPortAvailable(occupied),
    (error) => error?.code === 'acceptance_port_occupied',
  );
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await assertLoopbackPortAvailable(occupied), true);
});

test('application readiness polling tolerates bounded startup delay', async () => {
  let attempts = 0;
  const response = await pollAcceptanceEndpoint('/health/ready', {
    port: 18082,
    phase: 'acceptance_readiness',
    timeoutMs: 100,
    intervalMs: 1,
    fetchImpl: async () => ({ ok: ++attempts >= 3 }),
    sleepImpl: async () => {},
  });
  assert.equal(response.ok, true);
  assert.equal(attempts, 3);
});

test('application readiness polling times out with a stable code and hides raw errors', async () => {
  let now = 0;
  await assert.rejects(
    pollAcceptanceEndpoint('/version', {
      port: 18082,
      phase: 'acceptance_version',
      timeoutMs: 10,
      intervalMs: 5,
      fetchImpl: async () => { now += 6; throw new Error('secret transport detail'); },
      sleepImpl: async () => { now += 5; },
      nowImpl: () => now,
    }),
    (error) => error?.code === 'acceptance_version_timeout'
      && !error.message.includes('secret transport detail'),
  );
  assert.equal(sanitizeErrorCode(new Error('raw system path')), 'controlled_acceptance_internal_failed');
  assert.equal(sanitizeErrorCode({ code: 'acceptance_version_timeout' }), 'acceptance_version_timeout');
  await assert.rejects(
    pollAcceptanceEndpoint('/version', { port: 18082, phase: 'unsafe-phase!' }),
    (error) => error?.code === 'acceptance_poll_arguments_invalid',
  );
});

test('hung readiness fetch is aborted by the per-attempt deadline', async () => {
  const started = Date.now();
  await assert.rejects(
    pollAcceptanceEndpoint('/version', {
      port: 18082,
      phase: 'acceptance_version',
      timeoutMs: 20,
      intervalMs: 1,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('hung fetch aborted')), { once: true });
      }),
    }),
    (error) => error?.code === 'acceptance_version_timeout',
  );
  assert.ok(Date.now() - started < 500);
});

test('cleanup is identity-bound and never requires Compose secret interpolation', async () => {
  const runner = await readFile(new URL('../../backend/ops/staging_controlled_acceptance.mjs', import.meta.url), 'utf8');
  assert.match(runner, /'ps', '-aq', '--filter', 'label=com\.shareittoo\.staging\.controlled_acceptance=true'/u);
  assert.match(runner, /command\('docker', \['rm', '-f', entry\.id\]/u);
  assert.match(runner, /return writeAcceptanceEvidence\(evidenceFile, evidence\)/u);
});

test('cleanup validates the complete inventory before any removal', async () => {
  const removed = [];
  let ids = ['one', 'two'];
  const statusCommand = async () => ({ code: 0, stdout: ids.join('\n') });
  const command = async (_binary, args) => {
    if (args[0] === 'inspect') {
      return args[1] === 'one'
        ? '/shareittoo-staging-acceptance-api|true|' + runtimeCommit
        : '/other|true|' + runtimeCommit;
    }
    if (args[0] === 'rm') { removed.push(args[2]); ids = []; return ''; }
    throw new Error('unexpected_fake_docker_command');
  };
  await assert.rejects(
    cleanupAcceptance({ runtimeCommit, command, statusCommand }),
    (error) => error?.code === 'acceptance_cleanup_duplicate',
  );
  assert.deepEqual(removed, []);

  ids = ['one'];
  await assert.rejects(
    cleanupAcceptance({ runtimeCommit, command: async (_binary, args) => {
      if (args[0] === 'inspect') return '/other|true|' + runtimeCommit;
      if (args[0] === 'rm') { removed.push(args[2]); ids = []; return ''; }
      throw new Error('unexpected_fake_docker_command');
    }, statusCommand }),
    (error) => error?.code === 'acceptance_cleanup_identity_failed',
  );
  assert.deepEqual(removed, []);

  ids = ['one'];
  const valid = await cleanupAcceptance({ runtimeCommit, command, statusCommand });
  assert.deepEqual(valid, { removed: 1 });
  assert.deepEqual(removed, ['one']);
  assert.deepEqual(validateAcceptanceInventory([], runtimeCommit), []);
});

test('ordinary staging deployment cannot bypass controlled acceptance', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-controlled-deploy-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const backend = join(root, 'backend');
  const ops = join(backend, 'ops');
  await mkdir(ops, { recursive: true });
  const source = new URL('../../backend/ops/deploy_release.sh', import.meta.url);
  const target = join(ops, 'deploy_release.sh');
  await cp(source, target);
  await chmod(target, 0o755);
  const result = spawnSync(target, ['staging', runtimeCommit], { encoding: 'utf8', env: { ...process.env } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /loopback controlled acceptance passes/u);
});
