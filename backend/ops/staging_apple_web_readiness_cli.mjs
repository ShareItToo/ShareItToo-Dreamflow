#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindAppleWebReadiness } from '../../tool/staging_apple_web_readiness.mjs';
import {
  APPLE_WEB_REPOSITORY_ROOT, APPLE_WEB_SOURCE_CLOSURE, appleWebDigest, appleWebSha256,
  composeAppleWebCandidate, composeAppleWebDecision, currentAppleWebSourceSnapshot,
  readProtectedAppleWebInput, writeAppleWebOutput,
} from './staging_apple_web_readiness_producer.mjs';
import { appleWebFields, appleWebReadinessKeys, appleWebBackendKeys } from '../../tool/staging_apple_web_readiness.mjs';

const root = APPLE_WEB_REPOSITORY_ROOT;
const check = (condition, code = 'apple_web_producer_cli_denied') => { if (!condition) throw new Error(code); };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
function parse(argv) {
  check(Array.isArray(argv) && ['collect', 'compose'].includes(argv[0]) && argv.length % 2 === 1);
  const mode = argv[0]; const args = {};
  for (let i = 1; i < argv.length; i += 2) {
    check(/^--[a-z][a-z0-9-]*$/u.test(argv[i]) && typeof argv[i + 1] === 'string'
      && argv[i + 1].length && !Object.hasOwn(args, argv[i].slice(2)));
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const expected = mode === 'collect' ? ['readbacks', 'readbacks-sha256', 'output-dir', 'run-id']
    : ['candidate', 'candidate-sha256', 'decision', 'decision-sha256', 'output-dir', 'run-id'];
  check(Object.keys(args).sort().join('|') === expected.sort().join('|')
    && /^[a-f0-9]{64}$/u.test(args[mode === 'collect' ? 'readbacks-sha256' : 'candidate-sha256'])
    && (mode === 'collect' || /^[a-f0-9]{64}$/u.test(args['decision-sha256']))
    && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(args['run-id']));
  return { mode, args };
}
function readJson(file, expectedSha256) {
  const bytes = readProtectedAppleWebInput(file, root);
  try {
    check(appleWebSha256(bytes) === expectedSha256, 'apple_web_input_digest');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(text); check(JSON.stringify(value) === text, 'apple_web_input_canonical'); return value;
  } finally { bytes.fill(0); }
}
function verifyCandidate(candidate, source) {
  const candidateKeys = ['schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'activationEligible',
    'sourceCommit', 'sourceInventory', 'sourceInventorySha256', 'collectorIdentitySha256', 'configuration',
    'configurationSha256', 'readiness', 'readinessSha256', 'backend', 'backendSha256', 'sourceRegister',
    'sourceRegisterSha256', 'observedAtUtc', 'validUntilUtc', 'candidateSha256'];
  const inventoryKeys = ['relativePath', 'gitBlob', 'currentByteSha256'];
  const registerKeys = ['id', 'sourceUrl', 'method', 'status', 'evidenceSha256', 'observedAtUtc'];
  const registerIds = ['apple-console', 'firebase-web-doc', 'firebase-web-app', 'firebase-apple-provider',
    'backend-runtime', 'protected-secret-metadata'];
  const hash = /^[a-f0-9]{64}$/u;
  const commit = /^[a-f0-9]{40}$/u;
  const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
  check(exactKeys(candidate, candidateKeys) && candidate.schemaVersion === 1 && candidate.kind === 'sit-apple-web-readiness-candidate'
    && candidate.evidenceClass === 'sanitized-provider-and-runtime-readbacks'
    && candidate.syntheticFixture === false && candidate.activationEligible === false
    && commit.test(candidate.sourceCommit) && candidate.sourceCommit === source.sourceCommit
    && Array.isArray(candidate.sourceInventory) && candidate.sourceInventory.length === APPLE_WEB_SOURCE_CLOSURE.length
    && candidate.sourceInventory.every((entry, index) => exactKeys(entry, inventoryKeys)
      && entry.relativePath === APPLE_WEB_SOURCE_CLOSURE[index] && /^[a-f0-9]{40}$/u.test(entry.gitBlob)
      && hash.test(entry.currentByteSha256))
    && candidate.sourceInventorySha256 === source.inventorySha256
    && JSON.stringify(candidate.sourceInventory) === JSON.stringify(source.files)
    && hash.test(candidate.sourceInventorySha256) && hash.test(candidate.collectorIdentitySha256)
    && exactKeys(candidate.configuration, Object.keys(appleWebFields))
    && exactKeys(candidate.readiness, appleWebReadinessKeys)
    && exactKeys(candidate.backend, appleWebBackendKeys)
    && Array.isArray(candidate.sourceRegister) && candidate.sourceRegister.length === 6
    && candidate.sourceRegister.every((entry, index) => exactKeys(entry, registerKeys)
      && entry.id === registerIds[index] && (typeof entry.sourceUrl === 'string'
        || (entry.id === 'protected-secret-metadata' && entry.sourceUrl === null))
      && typeof entry.method === 'string' && (typeof entry.status === 'number' || typeof entry.status === 'string')
      && hash.test(entry.evidenceSha256) && typeof entry.observedAtUtc === 'string')
    && hash.test(candidate.configurationSha256) && appleWebDigest(candidate.configuration) === candidate.configurationSha256
    && hash.test(candidate.readinessSha256) && appleWebDigest(candidate.readiness) === candidate.readinessSha256
    && hash.test(candidate.backendSha256) && appleWebDigest(candidate.backend) === candidate.backendSha256
    && hash.test(candidate.sourceRegisterSha256) && appleWebDigest(candidate.sourceRegister) === candidate.sourceRegisterSha256
    && hash.test(candidate.candidateSha256)
    && candidate.candidateSha256 === appleWebDigest(Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== 'candidateSha256'))),
  'apple_web_candidate_invalid');
}
export async function runAppleWebReadinessCli(argv, dependencies = {}) {
  let stage = 'arguments';
  try {
    check(plain(dependencies) && Object.keys(dependencies).every((key) => ['now', 'repositoryRoot', 'sourceSnapshot'].includes(key)));
    const repositoryRoot = dependencies.repositoryRoot ?? root;
    check(repositoryRoot === root, 'apple_web_source_root');
    const now = dependencies.now ?? Date.now;
    const { mode, args } = parse(argv);
    stage = 'source_inventory';
    const source = (dependencies.sourceSnapshot ?? currentAppleWebSourceSnapshot)(repositoryRoot);
    check(plain(source), 'apple_web_source_inventory');
    check(/^[a-f0-9]{40}$/u.test(source.sourceCommit ?? ''), 'apple_web_source_inventory');
    check(Array.isArray(source.files), 'apple_web_source_inventory');
    check(source.inventorySha256 === appleWebDigest(source.files), 'apple_web_source_inventory_digest');
    check(JSON.stringify(source.files.map((entry) => entry.relativePath)) === JSON.stringify([
      'backend/ops/staging_apple_web_readiness_cli.mjs',
      'backend/ops/staging_apple_web_readiness_producer.mjs',
      'tool/staging_apple_web_readiness.mjs',
    ]), 'apple_web_source_inventory_paths');
    let output; let envelopeSha256;
    if (mode === 'collect') {
      stage = 'readback_read';
      const bytes = readProtectedAppleWebInput(args.readbacks, repositoryRoot);
      let readbacks;
      try {
        check(appleWebSha256(bytes) === args['readbacks-sha256'], 'apple_web_input_digest');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        readbacks = JSON.parse(text); check(JSON.stringify(readbacks) === text, 'apple_web_input_canonical');
      } finally { bytes.fill(0); }
      check(readbacks?.syntheticFixture === false, 'apple_web_synthetic_denied');
      stage = 'candidate_compose';
      const candidate = composeAppleWebCandidate(readbacks, { now: now(), expectedSource: source.sourceCommit,
        sourceInventory: source.files, sourceInventorySha256: source.inventorySha256 });
      stage = 'candidate_write';
      output = writeAppleWebOutput({ directory: args['output-dir'], runId: args['run-id'], kind: 'candidate',
        bytes: JSON.stringify(candidate), repositoryRoot });
    } else {
      stage = 'candidate_decision_read';
      const candidate = readJson(args.candidate, args['candidate-sha256']);
      const decision = readJson(args.decision, args['decision-sha256']);
      verifyCandidate(candidate, source);
      check(decision.syntheticFixture === false, 'apple_web_synthetic_denied');
      stage = 'independent_decision_compose';
      const composed = composeAppleWebDecision(candidate, decision, { now: now(), expectedSource: source.sourceCommit });
      envelopeSha256 = composed.evidenceSha256;
      bindAppleWebReadiness(composed.envelope, composed.evidenceSha256,
        { now: new Date(now()), expectedSource: source.sourceCommit });
      stage = 'readiness_write';
      output = writeAppleWebOutput({ directory: args['output-dir'], runId: args['run-id'], kind: 'readiness',
        bytes: JSON.stringify(composed.envelope), repositoryRoot });
    }
    return { status: mode === 'collect' ? 'candidate-awaiting-independent-review' : 'readiness-composed-not-activated',
      file: output, ...(envelopeSha256 ? { evidenceSha256: envelopeSha256 } : {}) };
  } catch (error) {
    const safeError = typeof error?.message === 'string' ? error.message.replace(/[^a-z0-9_]/gu, '_') : '';
    const code = /^[a-z][a-z0-9_]{0,120}$/u.test(safeError) ? safeError : 'apple_web_producer_cli_denied';
    throw new Error(`apple_web_producer_cli_denied:${stage}:${code}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runAppleWebReadinessCli(process.argv.slice(2)))}\n`); }
  catch { process.stderr.write('apple_web_producer_cli_denied\n'); process.exitCode = 1; }
}
