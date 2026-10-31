#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACEBOOK_V2_SOURCE_CLOSURE, facebookV2Hash, facebookV2Digest, validateFacebookV2Source,
  collectFacebookWebV2, composeFacebookWebV2 } from './staging_facebook_web_readiness_v2.mjs';
import { readProtectedFacebookInput, reserveFacebookWebOutputs } from './staging_facebook_web_readiness_writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const check = (ok, code) => { if (!ok) throw new Error(`facebook_v2_${code}`); };
export function currentFacebookV2Source() {
  const git = (args, input) => execFileSync('git', args, { cwd: root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  try {
    check(git(['rev-parse', '--show-toplevel']) === root, 'source');
    const sourceCommit = git(['rev-parse', 'HEAD']);
    const files = FACEBOOK_V2_SOURCE_CLOSURE.map((relativePath) => {
      const bytes = fs.readFileSync(path.join(root, relativePath));
      const gitBlob = git(['hash-object', '--stdin'], bytes);
      check(gitBlob === git(['rev-parse', `HEAD:${relativePath}`])
        && git(['status', '--porcelain=v1', '--untracked-files=all', '--', relativePath]) === '', 'source');
      return { relativePath, gitBlob, currentByteSha256: facebookV2Hash(bytes) };
    });
    const source = { sourceCommit, files, inventorySha256: facebookV2Digest(files) };
    validateFacebookV2Source(source); return source;
  } catch { throw new Error('facebook_v2_source'); }
}
function argsFor(argv) {
  check(Array.isArray(argv) && ['collect', 'compose'].includes(argv[0]) && argv.length % 2 === 1, 'arguments');
  const args = {};
  for (let i = 1; i < argv.length; i += 2) {
    check(/^--[a-z][a-z0-9-]*$/u.test(argv[i]) && typeof argv[i + 1] === 'string' && argv[i + 1].length > 0
      && !Object.hasOwn(args, argv[i].slice(2)), 'arguments');
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const required = argv[0] === 'collect'
    ? ['google-token-file', 'meta-token-file', 'dashboard', 'dashboard-sha256', 'output-dir', 'run-id']
    : ['candidate', 'candidate-sha256', 'journal', 'journal-sha256', 'decision', 'decision-sha256', 'output-dir', 'run-id'];
  check(Object.keys(args).sort().join('|') === required.sort().join('|'), 'arguments');
  check(/^[a-z0-9][a-z0-9-]{0,63}$/u.test(args['run-id']), 'arguments');
  for (const key of Object.keys(args).filter((k) => k.endsWith('sha256'))) check(/^[a-f0-9]{64}$/u.test(args[key]), 'arguments');
  return { mode: argv[0], args };
}

/** No production CLI option enables synthetic fixtures or injectable network/source state. */
export async function runFacebookV2Cli(argv, syntheticTest = null) {
  const buffers = []; let outputs;
  const isTest = syntheticTest !== null;
  const read = (file) => { const bytes = readProtectedFacebookInput(file, root); buffers.push(bytes); return bytes; };
  const json = (file, expected) => {
    const bytes = read(file); check(facebookV2Hash(bytes) === expected, 'input_digest');
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(raw); check(JSON.stringify(value) === raw, 'input_canonical'); return value;
  };
  try {
    if (isTest) check(Object.keys(syntheticTest).sort().join('|') === 'fetchImpl|now|sourceSnapshot'
      && typeof syntheticTest.fetchImpl === 'function' && typeof syntheticTest.now === 'function'
      && typeof syntheticTest.sourceSnapshot === 'function', 'test_seam');
    const { mode, args } = argsFor(argv);
    const now = isTest ? syntheticTest.now : Date.now;
    // Validate external evidence and fixture class before source, credentials or network.
    let dashboard; let candidate; let journal; let decision;
    if (mode === 'collect') {
      dashboard = json(args.dashboard, args['dashboard-sha256']);
      check(dashboard.syntheticFixture === isTest, 'fixture_class');
    } else {
      candidate = json(args.candidate, args['candidate-sha256']);
      journal = json(args.journal, args['journal-sha256']);
      decision = json(args.decision, args['decision-sha256']);
      check([candidate, journal, decision].every((v) => v.syntheticFixture === isTest), 'fixture_class');
    }
    const source = isTest ? syntheticTest.sourceSnapshot() : currentFacebookV2Source();
    validateFacebookV2Source(source);
    let result;
    if (mode === 'collect') {
      const token = (file) => new TextDecoder('utf-8', { fatal: true }).decode(read(file)).trim();
      result = await collectFacebookWebV2({ dashboard, dashboardSha256: args['dashboard-sha256'], source,
        googleAccessToken: token(args['google-token-file']), metaAppAccessToken: token(args['meta-token-file']),
        ...(isTest ? { fetchImpl: syntheticTest.fetchImpl } : {}), now });
    } else {
      check(JSON.stringify(candidate.source) === JSON.stringify(source), 'source');
      result = composeFacebookWebV2({ candidate, journal, decision, now: now() });
    }
    outputs = reserveFacebookWebOutputs({ directory: args['output-dir'], runId: args['run-id'],
      kinds: mode === 'collect' ? ['candidate', 'journal'] : ['readiness'], repositoryRoot: root });
    const files = outputs.write(mode === 'collect'
      ? { candidate: JSON.stringify(result.candidate), journal: JSON.stringify(result.journal) }
      : { readiness: JSON.stringify(result.envelope) });
    return { status: isTest ? 'synthetic-only-not-activation-evidence'
      : mode === 'collect' ? 'pending-independent-review' : 'readiness-composed-not-activated', files };
  } catch (error) {
    const code = /^facebook_v2_[a-z_]+$/u.test(error?.message ?? '') ? error.message : 'facebook_v2_input_or_write';
    throw new Error(code);
  } finally { for (const bytes of buffers) bytes.fill(0); outputs?.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runFacebookV2Cli(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
