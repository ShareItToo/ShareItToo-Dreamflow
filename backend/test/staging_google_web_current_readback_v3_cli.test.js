import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectGoogleWebCurrentReadbackV3,
  runGoogleWebCurrentReadbackV3Cli,
} from '../ops/staging_google_web_current_readback_v3_cli.mjs';
import { syntheticGoogleCurrentEvidence } from '../../test/tool/staging_google_web_current_readback_fixture.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(repo, 'backend/ops/staging_google_web_current_readback_v3_cli.mjs');
const source = 'f'.repeat(40);
const version = '1.0.0+2026092905';

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-v3-cli-')));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function protectedInputs(t) {
  const root = temporary(t);
  const evidence = syntheticGoogleCurrentEvidence(source, version);
  const values = {
    configuration: evidence.config,
    service: evidence.service,
    'service-usage-binding': evidence.serviceUsageBinding,
    console: evidence.consoleRead,
    decision: evidence.decision,
  };
  const files = Object.fromEntries(Object.entries(values).map(([name, value]) => {
    const file = path.join(root, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    return [name, file];
  }));
  return { root, evidence, files };
}

function args(fixture, runId = 'v3-direct-readback') {
  return [
    '--output-dir', fixture.root,
    '--run-id', runId,
    '--source-commit', source,
    '--build-version', version,
    '--configuration-file', fixture.files.configuration,
    '--service-readback-file', fixture.files.service,
    '--service-usage-binding-file', fixture.files['service-usage-binding'],
    '--console-readback-file', fixture.files.console,
    '--decision-file', fixture.files.decision,
  ];
}

test('collector binds service-usage proof and service-readback hashes into canonical V3 schema 2', () => {
  const evidence = syntheticGoogleCurrentEvidence(source, version);
  const collected = collectGoogleWebCurrentReadbackV3({
    sourceCommit: source,
    buildVersion: version,
    configuration: evidence.config,
    serviceAccountReadback: evidence.service,
    serviceUsageBinding: evidence.serviceUsageBinding,
    cloudConsoleReadback: evidence.consoleRead,
    decision: evidence.decision,
    now: evidence.now,
  });
  assert.equal(collected.sha256, evidence.digest);
  assert.deepEqual(collected.bytes, evidence.bytes);
  assert.equal(collected.envelope.sourceCommit, source);
  assert.equal(collected.envelope.schemaVersion, 2);
  assert.equal(collected.envelope.serviceUsageBindingSha256,
    evidence.envelope.serviceUsageBindingSha256);
  assert.equal(collected.envelope.serviceUsageBinding.serviceReadbackSha256,
    collected.envelope.serviceAccountReadbackSha256);
  evidence.config.projectId = 'mutated-after-collection';
  assert.equal(collected.envelope.configuration.projectId, 'staging-shareittoo');
});

test('CLI writes only canonical owner-0600 output and returns a secret-free receipt', (t) => {
  const fixture = protectedInputs(t);
  const result = runGoogleWebCurrentReadbackV3Cli(args(fixture), {
    repositoryRoot: repo,
    now: fixture.evidence.now,
  });
  assert.deepEqual(Object.keys(result), ['status', 'path', 'sha256', 'bytes', 'mode']);
  assert.equal(result.status, 'current-readback-v3-created');
  assert.equal(result.sha256, fixture.evidence.digest);
  assert.deepEqual(fs.readFileSync(result.path), fixture.evidence.bytes);
  assert.equal(fs.statSync(result.path).mode & 0o777, 0o600);
  assert.equal(fs.statSync(fixture.root).mode & 0o777, 0o700);
  assert.equal(JSON.stringify(result).includes(fixture.evidence.config.apiKey), false);
  assert.throws(() => runGoogleWebCurrentReadbackV3Cli(args(fixture), {
    repositoryRoot: repo,
    now: fixture.evidence.now,
  }), { message: 'google_web_current_v3_cli_denied' });
});

test('production CLI stdout is receipt-only and never exposes direct input values', (t) => {
  const fixture = protectedInputs(t);
  const result = spawnSync(process.execPath, [cli, ...args(fixture, 'v3-production-cli')], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.sha256, fixture.evidence.digest);
  assert.equal(`${result.stdout}${result.stderr}`.includes(fixture.evidence.config.apiKey), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes(fixture.evidence.config.projectId), false);
});

test('CLI rejects noncanonical, unprotected, drifted and extra inputs without provider action', (t) => {
  const fixture = protectedInputs(t);
  fs.writeFileSync(fixture.files.configuration,
    `${JSON.stringify(fixture.evidence.config)}\n`, { mode: 0o600 });
  assert.throws(() => runGoogleWebCurrentReadbackV3Cli(args(fixture), {
    repositoryRoot: repo,
    now: fixture.evidence.now,
  }), { message: 'google_web_current_v3_cli_denied' });

  const unprotected = protectedInputs(t);
  fs.chmodSync(unprotected.files.console, 0o644);
  assert.throws(() => runGoogleWebCurrentReadbackV3Cli(args(unprotected), {
    repositoryRoot: repo,
    now: unprotected.evidence.now,
  }), { message: 'google_web_current_v3_cli_denied' });

  const drifted = protectedInputs(t);
  const consoleReadback = { ...drifted.evidence.consoleRead, apiRestrictions: [] };
  fs.writeFileSync(drifted.files.console, JSON.stringify(consoleReadback), { mode: 0o600 });
  assert.throws(() => runGoogleWebCurrentReadbackV3Cli(args(drifted), {
    repositoryRoot: repo,
    now: drifted.evidence.now,
  }), { message: 'google_web_current_v3_cli_denied' });

  const extra = protectedInputs(t);
  assert.throws(() => runGoogleWebCurrentReadbackV3Cli([...args(extra), '--unexpected', 'value'], {
    repositoryRoot: repo,
    now: extra.evidence.now,
  }), { message: 'google_web_current_v3_cli_denied' });

  const wrongBinding = protectedInputs(t);
  const binding = { ...wrongBinding.evidence.serviceUsageBinding,
    serviceReadbackSha256: '0'.repeat(64) };
  fs.writeFileSync(wrongBinding.files['service-usage-binding'], JSON.stringify(binding), { mode: 0o600 });
  assert.throws(() => runGoogleWebCurrentReadbackV3Cli(args(wrongBinding), {
    repositoryRoot: repo,
    now: wrongBinding.evidence.now,
  }), { message: 'google_web_current_v3_cli_denied' });

  const missingBinding = protectedInputs(t);
  const missingArgs = args(missingBinding).filter((value, index, all) =>
    all[index - 1] !== '--service-usage-binding-file' && value !== '--service-usage-binding-file');
  assert.throws(() => runGoogleWebCurrentReadbackV3Cli(missingArgs, {
    repositoryRoot: repo,
    now: missingBinding.evidence.now,
  }), { message: 'google_web_current_v3_cli_denied' });

  const sourceText = fs.readFileSync(cli, 'utf8');
  assert.doesNotMatch(sourceText, /\bfetch\s*\(|child_process|execFile|spawn|https:\/\//u);
});
