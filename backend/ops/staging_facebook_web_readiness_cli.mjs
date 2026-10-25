#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindFacebookWebReadiness } from '../../tool/staging_facebook_web_readiness.mjs';
import { createFacebookWebReadOnlyCollector, facebookWebReadSources } from './staging_facebook_web_readonly_collector.mjs';
import { readProtectedFacebookInput, reserveFacebookWebOutputs } from './staging_facebook_web_readiness_writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = (value) => hash(JSON.stringify(value));
const check = (value, code = 'facebook_web_readiness_cli_denied') => { if (!value) throw new Error(code); };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().replace('.000Z', 'Z') === value;
const SOURCE_CLOSURE = Object.freeze([
  'backend/ops/staging_facebook_web_readiness_cli.mjs',
  'backend/ops/staging_facebook_web_readiness_writer.mjs',
  'backend/ops/staging_facebook_web_readonly_collector.mjs',
  'tool/staging_facebook_web_readiness.mjs',
]);

export function currentFacebookWebSourceSnapshot(repositoryRoot) {
  const git = (args, input) => {
    try { return execFileSync('git', args, { cwd: repositoryRoot, input, encoding: input ? undefined : 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(); }
    catch { throw new Error('source_drift'); }
  };
  check(git(['rev-parse', '--show-toplevel']) === repositoryRoot, 'source_root_invalid');
  const sourceCommit = git(['rev-parse', 'HEAD']);
  const files = SOURCE_CLOSURE.map((relativePath) => {
    const bytes = fs.readFileSync(path.join(repositoryRoot, relativePath));
    try {
      const gitBlob = git(['hash-object', '--stdin'], bytes);
      const committedBlob = git(['rev-parse', `HEAD:${relativePath}`]);
      const dirty = git(['status', '--porcelain=v1', '--untracked-files=all', '--', relativePath]);
      check(gitBlob === committedBlob && dirty === '', 'source_drift');
      return { relativePath, gitBlob, currentByteSha256: hash(bytes) };
    } finally { bytes.fill(0); }
  });
  return { sourceCommit, files, inventorySha256: digest(files) };
}

function parseArgs(argv) {
  check(Array.isArray(argv) && ['collect', 'compose'].includes(argv[0]) && argv.length % 2 === 1);
  const mode = argv[0]; const args = {};
  for (let i = 1; i < argv.length; i += 2) {
    check(/^--[a-z][a-z0-9-]*$/u.test(argv[i]) && typeof argv[i + 1] === 'string'
      && argv[i + 1].length > 0 && !Object.hasOwn(args, argv[i].slice(2)));
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const required = mode === 'collect'
    ? ['google-token-file', 'meta-token-file', 'output-dir', 'run-id']
    : ['candidate', 'candidate-sha256', 'journal', 'journal-sha256', 'decision', 'decision-sha256', 'output-dir', 'run-id'];
  check(Object.keys(args).sort().join('|') === required.sort().join('|'));
  for (const key of Object.keys(args).filter((key) => key.endsWith('sha256'))) check(/^[a-f0-9]{64}$/u.test(args[key]));
  check(/^[a-z0-9][a-z0-9-]{0,63}$/u.test(args['run-id']));
  return { mode, args };
}

function readJson(file, expectedHash) {
  const bytes = readProtectedFacebookInput(file, root);
  try {
    check(hash(bytes) === expectedHash);
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(raw); check(JSON.stringify(value) === raw); return value;
  } finally { bytes.fill(0); }
}

function validateCandidate(candidate, journal, candidateSha, journalSha, now) {
  check(plain(candidate) && candidate.schemaVersion === 1
    && candidate.kind === 'sit-facebook-web-readiness-candidate'
    && candidate.status === 'pending-independent-review' && candidate.syntheticFixture === false
    && /^[1-9][0-9]{5,24}$/u.test(candidate.metaAppId ?? '')
    && /^[a-f0-9]{64}$/u.test(candidate.collectorIdentitySha256 ?? '')
    && /^[a-f0-9]{64}$/u.test(candidate.sourceRegisterSha256 ?? '')
    && candidate.sourceRegisterSha256 === digest(journal.sources)
    && /^[a-f0-9]{40}$/u.test(candidate.sourceCommit ?? '')
    && candidate.sourceCommit === journal.sourceCommit
    && Array.isArray(candidate.sourceInventory) && digest(candidate.sourceInventory) === candidate.sourceInventorySha256
    && candidate.sourceInventorySha256 === journal.sourceInventorySha256
    && JSON.stringify(candidate.sourceInventory.map((entry) => entry.relativePath)) === JSON.stringify(SOURCE_CLOSURE)
    && plain(candidate.configuration) && plain(candidate.readiness)
    && candidate.configurationSha256 === digest(candidate.configuration)
    && candidate.readiness.provider === 'facebook' && candidate.readiness.platform === 'web'
    && candidate.readiness.metaAppMode === 'development'
    && candidate.readiness.audience === 'app_roles_only'
    && candidate.readiness.audienceVerified === true
    && candidate.readiness.firebaseProviderEnabled === true
    && /^[a-f0-9]{64}$/u.test(candidate.readiness.providerReadbackSha256 ?? '')
    && candidateSha === hash(JSON.stringify(candidate))
    && journalSha === hash(JSON.stringify(journal))
    && plain(journal) && journal.kind === 'sit-facebook-web-read-register'
    && journal.metaAppId === candidate.metaAppId
    && journal.collectorIdentitySha256 === candidate.collectorIdentitySha256
    && Array.isArray(journal.sources) && journal.sources.length === facebookWebReadSources(candidate.metaAppId).length
    && JSON.stringify(journal.sources.map((entry) => entry.source).sort()) === JSON.stringify(facebookWebReadSources(candidate.metaAppId))
    && journal.sources.every((entry) => entry.method === 'GET' && entry.status === 200
      && /^[a-f0-9]{64}$/u.test(entry.responseSha256 ?? '') && iso(entry.startedAtUtc)
      && iso(entry.endedAtUtc) && Date.parse(entry.endedAtUtc) >= Date.parse(entry.startedAtUtc))
    && iso(candidate.collectedAtUtc) && iso(candidate.validUntilUtc)
    && candidate.validUntilUtc === new Date(Date.parse(candidate.collectedAtUtc) + 3600000).toISOString().replace('.000Z', 'Z')
    && candidate.validUntilUtc === journal.validUntilUtc
    && now >= Date.parse(candidate.collectedAtUtc) && now < Date.parse(candidate.validUntilUtc), 'candidate_invalid');
}

export function composeFacebookWebReadiness(candidate, journal, decision, candidateSha, journalSha, decisionSha, now) {
  validateCandidate(candidate, journal, candidateSha, journalSha, now);
  check(plain(decision) && decision.schemaVersion === 1
    && decision.kind === 'sit-facebook-web-independent-decision'
    && decision.decision === 'approved' && decision.syntheticFixture === false
    && decision.candidateSha256 === candidateSha && decision.journalSha256 === journalSha
    && decision.collectorIdentitySha256 === candidate.collectorIdentitySha256
    && /^[a-f0-9]{64}$/u.test(decision.reviewerIdentitySha256 ?? '')
    && decision.reviewerIdentitySha256 !== decision.collectorIdentitySha256
    && /^[a-f0-9]{64}$/u.test(decision.reviewEvidenceSha256 ?? '')
    && iso(decision.decidedAtUtc) && iso(decision.validUntilUtc)
    && Date.parse(decision.decidedAtUtc) >= Date.parse(candidate.collectedAtUtc)
    && Date.parse(decision.decidedAtUtc) <= now && now < Date.parse(decision.validUntilUtc)
    && Date.parse(decision.validUntilUtc) <= Math.min(Date.parse(candidate.validUntilUtc), Date.parse(decision.decidedAtUtc) + 3600000), 'decision_invalid');
  const readbackBinding = { candidateSha256: candidateSha, journalSha256: journalSha,
    decisionSha256: decisionSha,
    reviewerIdentitySha256: decision.reviewerIdentitySha256,
    reviewEvidenceSha256: decision.reviewEvidenceSha256,
    sourceRegisterSha256: candidate.sourceRegisterSha256,
    providerReadbackSha256: candidate.readiness.providerReadbackSha256 };
  const readiness = { schemaVersion: 1, provider: 'facebook', platform: 'web',
    origin: candidate.readiness.origin,
    backendFirebaseProjectId: candidate.readiness.backendFirebaseProjectId,
    webAppConfigSha256: candidate.configurationSha256,
    callbackUrl: candidate.readiness.callbackUrl,
    firebaseProviderEnabled: true, metaAppMode: 'development',
    audience: 'app_roles_only', audienceVerified: true,
    providerReadbackSha256: digest(readbackBinding),
    observedAtUtc: candidate.collectedAtUtc,
    validUntilUtc: new Date(Math.min(Date.parse(candidate.validUntilUtc), Date.parse(decision.validUntilUtc))).toISOString().replace('.000Z', 'Z') };
  const envelope = { schemaVersion: 1, kind: 'sit-facebook-web-release-readiness',
    evidenceClass: 'verified-external', syntheticFixture: false,
    configuration: candidate.configuration, configurationSha256: candidate.configurationSha256,
    readiness, readinessSha256: digest(readiness) };
  const evidenceSha256 = hash(JSON.stringify(envelope));
  bindFacebookWebReadiness(envelope, evidenceSha256, { now: new Date(now) });
  return { envelope, evidenceSha256 };
}

export async function runFacebookWebReadinessCli(argv, dependencies = {}) {
  let outputs; let stage = 'arguments'; const buffers = [];
  try {
    check(plain(dependencies) && Object.keys(dependencies).every((key) => ['fetchImpl', 'now', 'repositoryRoot', 'sourceSnapshot'].includes(key)));
    const repositoryRoot = dependencies.repositoryRoot ?? root;
    check(repositoryRoot === root);
    const now = dependencies.now ?? Date.now;
    const { mode, args } = parseArgs(argv);
    stage = 'source_inventory';
    const source = (dependencies.sourceSnapshot ?? currentFacebookWebSourceSnapshot)(repositoryRoot);
    check(plain(source) && /^[a-f0-9]{40}$/u.test(source.sourceCommit ?? '')
      && Array.isArray(source.files) && source.inventorySha256 === digest(source.files)
      && JSON.stringify(source.files.map((entry) => entry.relativePath)) === JSON.stringify(SOURCE_CLOSURE));
    stage = 'output_reservation';
    outputs = reserveFacebookWebOutputs({ directory: args['output-dir'], runId: args['run-id'],
      kinds: mode === 'collect' ? ['candidate', 'journal'] : ['readiness'], repositoryRoot });
    let written;
    if (mode === 'collect') {
      stage = 'credential_read';
      const readToken = (file) => {
        const bytes = readProtectedFacebookInput(file, repositoryRoot); buffers.push(bytes);
        const token = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
        check(/^[\x21-\x7e]{16,16384}$/u.test(token)); return token;
      };
      const collector = createFacebookWebReadOnlyCollector({ googleAccessToken: readToken(args['google-token-file']),
        metaAppAccessToken: readToken(args['meta-token-file']), fetchImpl: dependencies.fetchImpl, now, sourceSnapshot: source });
      stage = 'provider_readback';
      const result = await collector.collect();
      stage = 'protected_write';
      written = outputs.write({ candidate: JSON.stringify(result.candidate), journal: JSON.stringify(result.journal) });
    } else {
      stage = 'compose_input_read';
      const candidateBytes = readProtectedFacebookInput(args.candidate, repositoryRoot); buffers.push(candidateBytes);
      const journalBytes = readProtectedFacebookInput(args.journal, repositoryRoot); buffers.push(journalBytes);
      const decisionBytes = readProtectedFacebookInput(args.decision, repositoryRoot); buffers.push(decisionBytes);
      const decode = (bytes, expected) => { check(hash(bytes) === expected); const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); const value = JSON.parse(text); check(JSON.stringify(value) === text); return value; };
      const candidate = decode(candidateBytes, args['candidate-sha256']);
      const journal = decode(journalBytes, args['journal-sha256']);
      const decision = decode(decisionBytes, args['decision-sha256']);
      stage = 'decision_compose';
      const { envelope, evidenceSha256 } = composeFacebookWebReadiness(candidate, journal, decision,
        args['candidate-sha256'], args['journal-sha256'], args['decision-sha256'], now());
      check(candidate.sourceCommit === source.sourceCommit && candidate.sourceInventorySha256 === source.inventorySha256
        && JSON.stringify(candidate.sourceInventory) === JSON.stringify(source.files), 'source_drift');
      stage = 'protected_write';
      written = outputs.write({ readiness: JSON.stringify(envelope) });
      written.push({ kind: 'evidenceSha256', sha256: evidenceSha256 });
    }
    return { status: mode === 'collect' ? 'pending-independent-review' : 'readiness-composed-not-activated', files: written };
  } catch (error) {
    if (error?.message === 'facebook_web_collector_not_verified') {
      return { status: 'NOT_VERIFIED', reason: 'required_readback_unavailable',
        note: 'No output names were published; resolve the readback gap before retrying.' };
    }
    const code = typeof error?.message === 'string' && /^[a-z][a-z0-9_]{0,80}$/u.test(error.message)
      ? error.message : 'facebook_web_readiness_cli_denied';
    throw new Error(`facebook_web_readiness_cli_denied:${stage}:${code}`);
  }
  finally { for (const value of buffers) value.fill(0); outputs?.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runFacebookWebReadinessCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === 'NOT_VERIFIED') process.exitCode = 2;
  }
  catch { process.stderr.write('facebook_web_readiness_cli_denied\n'); process.exitCode = 1; }
}
