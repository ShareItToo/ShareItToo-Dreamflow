#!/usr/bin/env node

// Assemble already-collected direct readbacks into the protected V3 envelope.
// This CLI has no provider transport and performs no provider/runtime mutation.
// Every input must be a canonical owner-0600 JSON file outside the repository;
// the output directory must already be an owner-0700 directory.
// node backend/ops/staging_google_web_current_readback_v3_cli.mjs \
//   --output-dir /protected/owner-0700 --run-id <new-run> \
//   --source-commit <exact-40-hex-source> --build-version <pubspec-version> \
//   --configuration-file /protected/configuration.json \
//   --service-readback-file /protected/service-readback.json \
//   --service-usage-binding-file /protected/service-usage-binding.json \
//   --console-readback-file /protected/console-readback.json \
//   --decision-file /protected/sol-decision.json
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bindGoogleWebCurrentReadback } from '../../tool/staging_google_web_current_readback.mjs';
import { readPrivateInput } from './staging_google_web_live_adapter.mjs';
import { reserveGoogleWebArtifacts } from './staging_google_web_reattestation_writer.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePattern = /^[a-f0-9]{40}$/u;
const versionPattern = /^\d+\.\d+\.\d+\+\d+$/u;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const deny = () => { throw new Error('google_web_current_v3_cli_denied'); };

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) deny();
  const allowed = new Set([
    '--output-dir', '--run-id', '--source-commit', '--build-version',
    '--configuration-file', '--service-readback-file', '--console-readback-file',
    '--service-usage-binding-file', '--decision-file',
  ]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1];
    if (!allowed.has(flag) || Object.hasOwn(values, flag.slice(2))
      || typeof value !== 'string' || value.length === 0) deny();
    values[flag.slice(2)] = value;
  }
  const expected = [...allowed].map(value => value.slice(2)).sort().join('|');
  if (Object.keys(values).sort().join('|') !== expected) deny();
  return values;
}

function readCanonicalRecord(file) {
  try {
    const text = readPrivateInput({ file, maxBytes: 131072,
      code: 'google_web_current_v3_input_invalid' });
    const value = JSON.parse(text);
    if (!plain(value) || JSON.stringify(value) !== text) deny();
    return value;
  } catch { deny(); }
}

function copyCanonicalRecord(value) {
  try {
    const text = JSON.stringify(value);
    const copy = JSON.parse(text);
    if (!plain(copy) || JSON.stringify(copy) !== text) deny();
    return copy;
  } catch { deny(); }
}

export function collectGoogleWebCurrentReadbackV3({
  sourceCommit,
  buildVersion,
  configuration,
  serviceAccountReadback,
  serviceUsageBinding,
  cloudConsoleReadback,
  decision,
  now = new Date(),
} = {}) {
  try {
    if (!sourcePattern.test(sourceCommit ?? '') || !versionPattern.test(buildVersion ?? '')
      || !plain(configuration) || !plain(serviceAccountReadback)
      || !plain(serviceUsageBinding) || !plain(cloudConsoleReadback) || !plain(decision)) deny();
    configuration = copyCanonicalRecord(configuration);
    serviceAccountReadback = copyCanonicalRecord(serviceAccountReadback);
    serviceUsageBinding = copyCanonicalRecord(serviceUsageBinding);
    cloudConsoleReadback = copyCanonicalRecord(cloudConsoleReadback);
    decision = copyCanonicalRecord(decision);
    const configurationSha256 = sha256(JSON.stringify(configuration));
    const serviceAccountReadbackSha256 = sha256(JSON.stringify(serviceAccountReadback));
    const cloudConsoleReadbackSha256 = sha256(JSON.stringify(cloudConsoleReadback));
    const decisionSha256 = sha256(JSON.stringify(decision));
    const envelope = {
      schemaVersion: 2,
      kind: 'sit-google-web-current-readback',
      evidenceClass: 'direct-authoritative-provider-runtime-and-console-readback',
      syntheticFixture: false,
      sourceCommit,
      buildVersion,
      configuration,
      configurationSha256,
      serviceAccountReadback,
      serviceAccountReadbackSha256,
      serviceUsageBinding,
      serviceUsageBindingSha256: sha256(JSON.stringify(serviceUsageBinding)),
      cloudConsoleReadback,
      cloudConsoleReadbackSha256,
      decision,
      decisionSha256,
    };
    const bytes = Buffer.from(JSON.stringify(envelope), 'utf8');
    const digest = sha256(bytes);
    bindGoogleWebCurrentReadback(envelope, digest, {
      now,
      expectedSource: sourceCommit,
      expectedVersion: buildVersion,
    });
    return Object.freeze({ envelope, bytes, sha256: digest });
  } catch { deny(); }
}

export function runGoogleWebCurrentReadbackV3Cli(argv, dependencies = {}) {
  let output;
  try {
    if (!plain(dependencies)
      || Object.keys(dependencies).some(key => !['repositoryRoot', 'now'].includes(key))) deny();
    const args = parseArgs(argv);
    const root = dependencies.repositoryRoot ?? repositoryRoot;
    output = reserveGoogleWebArtifacts({
      directory: args['output-dir'],
      runId: args['run-id'],
      kinds: ['readiness'],
      repositoryRoot: root,
    });
    const collected = collectGoogleWebCurrentReadbackV3({
      sourceCommit: args['source-commit'],
      buildVersion: args['build-version'],
      configuration: readCanonicalRecord(args['configuration-file']),
      serviceAccountReadback: readCanonicalRecord(args['service-readback-file']),
      serviceUsageBinding: readCanonicalRecord(args['service-usage-binding-file']),
      cloudConsoleReadback: readCanonicalRecord(args['console-readback-file']),
      decision: readCanonicalRecord(args['decision-file']),
      now: dependencies.now ?? new Date(),
    });
    const [written] = output.write({ readiness: collected.bytes.toString('utf8') });
    if (!written || written.kind !== 'readiness' || written.sha256 !== collected.sha256) deny();
    return Object.freeze({
      status: 'current-readback-v3-created',
      path: written.path,
      sha256: written.sha256,
      bytes: written.bytes,
      mode: '0600',
    });
  } catch { deny(); }
  finally { output?.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(runGoogleWebCurrentReadbackV3Cli(process.argv.slice(2)))}\n`);
  } catch {
    process.stderr.write('google_web_current_v3_cli_denied\n');
    process.exitCode = 1;
  }
}
