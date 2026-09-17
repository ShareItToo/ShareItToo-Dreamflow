import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { validateEvidence } from '../../backend/ops/validate_staging_controlled_acceptance.mjs';
import {
  assertPublicCandidateNotServed,
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
    (error) => error?.message === 'controlled_acceptance_status_failed'
      && !error.message.includes('definitely/missing'),
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
  assert.match(compose, /127\.0\.0\.1:\$\{STAGING_ACCEPTANCE_PORT:-18081\}:8080/u);
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
  assert.match(runner, /pending !== true/u);
  assert.match(runner, /pending !== false/u);
  assert.match(runner, /mfa_probe_http_/u);
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
