#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProtectedJson } from '../backend/ops/green_staging_98_106_contract.mjs';
import { openArtifact, verifyArtifact, closeArtifact, privateDirectory } from '../backend/ops/green_staging_98_106_evidence.mjs';
import { collectSuccessor } from '../backend/ops/green_staging_106_106_collector.mjs';
import { requireBinding } from '../backend/ops/green_staging_106_106_binding.mjs';
import { executionPreflight } from '../backend/ops/green_staging_106_106_preflight.mjs';
import { runSuccessorRehearsal } from '../backend/ops/green_staging_106_106_rehearsal.mjs';
import { runSuccessorPromotion } from '../backend/ops/green_staging_106_106_promotion.mjs';
import { objectDigest } from '../backend/ops/green_staging_98_106_contract.mjs';

export function parseArguments(args) {
  const result = { mode: 'plan' }, seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2);
    requireBinding(args[i]?.startsWith('--') && ['mode', 'binding', 'binding-sha256', 'publication', 'publication-sha256',
      'target', 'target-sha256', 'execution-config', 'execution-config-sha256', 'runtime-manifest', 'runtime-manifest-sha256',
      'preflight', 'preflight-sha256', 'rehearsal', 'rehearsal-sha256', 'evidence-directory', 'confirm'].includes(key)
      && !seen.has(key) && typeof args[i + 1] === 'string' && !args[i + 1].startsWith('--'), 'arguments');
    seen.add(key); result[key] = args[i + 1];
  }
  requireBinding(['plan', 'collect', 'preflight', 'rehearse', 'promote'].includes(result.mode) && result.binding && result.publication
    && ['binding-sha256', 'publication-sha256'].every(k => /^[a-f0-9]{64}$/u.test(result[k])), 'arguments');
  if (['preflight', 'rehearse', 'promote'].includes(result.mode)) for (const key of ['target', 'execution-config', 'runtime-manifest']) {
    requireBinding(result[key] && /^[a-f0-9]{64}$/u.test(result[`${key}-sha256`]), 'arguments');
  }
  if (result.mode === 'rehearse') requireBinding(result.preflight && /^[a-f0-9]{64}$/u.test(result['preflight-sha256'])
    && result['evidence-directory'] && result.confirm, 'arguments');
  if (result.mode === 'promote') requireBinding(result.rehearsal && /^[a-f0-9]{64}$/u.test(result['rehearsal-sha256'])
    && result['evidence-directory'] && result.confirm, 'arguments');
  return result;
}
const promotionFailures = Object.freeze({ preflight_rejected: 2, forward_recovery_required: 3 });
export class PromotionCliFailure extends Error {
  constructor(result) {
    super('green_106_106_promote_non_success');
    requireBinding(Object.hasOwn(promotionFailures, result?.status), 'promotion_status');
    this.exitCode = promotionFailures[result.status];
    const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value) ? value : null;
    const stages = ['preflight', 'create', 'attach', 'start', 'readiness', 'rename', 'gateway'];
    // Do not serialize rejected input values, even if preflight stopped before
    // validating the target. Keep only the adapter's fixed, operator-safe facts.
    this.result = { status: result.status, stage: stages.includes(result.stage) ? result.stage : 'unknown',
      candidateId: id(result.candidateId), sourceId: id(result.sourceId), canonicalStarted: result.canonicalStarted === true,
      successorIsolationVerified: result.successorIsolationVerified === true, oldImageRestarted: false,
      automaticRestoreAttempted: false, lockRetained: result.lockRetained === true, publicReleaseComplete: false };
  }
}
export async function main(args, dependencies) {
  const options = parseArguments(args);
  const binding = readProtectedJson(options.binding, options['binding-sha256']);
  requireBinding(binding.publicationSha256 === options['publication-sha256'], 'publication_binding');
  const handle = openArtifact(options.publication); let bytes;
  try {
    bytes = verifyArtifact(handle, { expectedDigest: options['publication-sha256'], maxBytes: 1048576 }).bytes;
    if (['preflight', 'rehearse', 'promote'].includes(options.mode)) {
      const inputs = { binding, publicationBytes: bytes,
      target: readProtectedJson(options.target, options['target-sha256']),
      config: readProtectedJson(options['execution-config'], options['execution-config-sha256']),
      manifest: readProtectedJson(options['runtime-manifest'], options['runtime-manifest-sha256']) };
      if (options.mode === 'preflight') return await executionPreflight(inputs, dependencies);
      if (options.mode === 'promote') {
        const directory = privateDirectory(options['evidence-directory']);
        requireBinding(/^[a-z0-9][a-z0-9-]{7,47}$/u.test(inputs.config.runId)
          && options.rehearsal === path.join(directory.directory, `${inputs.config.runId}.rehearsal.json`), 'promotion_rehearsal_path');
        readProtectedJson(options.rehearsal, options['rehearsal-sha256']);
        const result = await runSuccessorPromotion(inputs, { execute: true, rehearsalSha256: options['rehearsal-sha256'],
          evidenceDirectory: directory.directory, confirmation: options.confirm }, dependencies);
        if (Object.hasOwn(promotionFailures, result?.status)) throw new PromotionCliFailure(result);
        requireBinding(result?.status === 'promoted_owner_smoke_pending', 'promotion_status');
        return result;
      }
      const preflight = readProtectedJson(options.preflight, options['preflight-sha256']);
      return await runSuccessorRehearsal(inputs, { preflight, preflightSha256: objectDigest(preflight),
        evidenceDirectory: options['evidence-directory'], confirmation: options.confirm }, dependencies);
    }
    return await collectSuccessor({ binding, publicationBytes: bytes, mode: options.mode }, dependencies);
  } finally { bytes?.fill(0); closeArtifact(handle); }
}
export async function runCli(args, { dependencies, stdout = process.stdout, stderr = process.stderr } = {}) {
  let mode = 'arguments';
  try {
    mode = parseArguments(args).mode;
    const result = await main(args, dependencies);
    stdout.write(`${JSON.stringify(result)}\n`); return 0;
  } catch (error) {
    if (mode === 'promote' && error instanceof PromotionCliFailure) {
      stdout.write(`${JSON.stringify(error.result)}\n`);
      stderr.write(`green_106_106_promote_${error.result.status}\n`); return error.exitCode;
    }
    // Only fixed, parser-approved mode names. Never error text, inputs,
    // rejected rows, environment values or Docker stderr.
    const labels = { arguments: 'green_106_106_arguments_failed', plan: 'green_106_106_plan_failed',
      collect: 'green_106_106_collect_failed', preflight: 'green_106_106_preflight_failed', rehearse: 'green_106_106_rehearse_failed',
      promote: 'green_106_106_promote_failed' };
    stderr.write(`${labels[mode]}\n`); return 1;
  }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
