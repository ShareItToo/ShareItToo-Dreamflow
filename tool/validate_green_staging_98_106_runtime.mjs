#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert, readProtectedJson, safeError, validateRuntimeManifest } from '../backend/ops/green_staging_98_106_contract.mjs';
import { buildPlan, runReadOnlyPreflight, validateCollectorCommit, validateGitBinding } from '../backend/ops/green_staging_98_106_promotion.mjs';
import { collectTarget } from '../backend/ops/green_staging_98_106_collector.mjs';
import { runPromotion, runRehearsal } from '../backend/ops/green_staging_98_106_execution.mjs';

export function parseArguments(args) {
  const allowed = new Set(['mode', 'binding', 'binding-sha256', 'publication', 'publication-sha256',
    'target', 'target-sha256', 'config', 'config-sha256', 'private-runtime', 'private-runtime-sha256',
    'rehearsal', 'rehearsal-sha256', 'evidence-directory', 'backup', 'confirm', 'ops-commit', 'acceptance-mfa-file']);
  const result = { mode: 'plan' };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/u, '');
    assert(args[index]?.startsWith('--') && allowed.has(key) && !seen.has(key)
      && typeof args[index + 1] === 'string' && !args[index + 1].startsWith('--'), 'green_98_106_arguments');
    seen.add(key); result[key] = args[index + 1];
  }
  assert(['plan', 'validate', 'preflight', 'collect', 'rehearse', 'promote'].includes(result.mode), 'green_98_106_mode_invalid');
  const required = result.mode === 'collect' ? ['publication'] : ['binding', 'publication', 'target', 'config'];
  for (const name of required) {
    assert(result[name] && /^[a-f0-9]{64}$/u.test(result[`${name}-sha256`] ?? ''), 'green_98_106_missing_external_binding');
  }
  if (result.mode === 'collect') assert(result['evidence-directory'] && result['acceptance-mfa-file']
    && /^[a-f0-9]{40}$/u.test(result['ops-commit'] ?? ''), 'green_98_106_collector_inputs');
  if (['rehearse', 'promote'].includes(result.mode)) {
    assert(result['private-runtime'] && /^[a-f0-9]{64}$/u.test(result['private-runtime-sha256'] ?? '')
      && result['evidence-directory'] && result.confirm, 'green_98_106_execution_inputs');
  }
  if (result.mode === 'promote') assert(result.rehearsal && /^[a-f0-9]{64}$/u.test(result['rehearsal-sha256'] ?? '')
    && result.backup, 'green_98_106_promotion_inputs');
  return result;
}
export async function main(args) {
  const options = parseArguments(args);
  const inputs = { publication: readProtectedJson(options.publication, options['publication-sha256']),
    publicationSha256: options['publication-sha256'] };
  validateRuntimeManifest(inputs);
  if (options.mode === 'collect') {
    validateCollectorCommit(options['ops-commit']);
    return collectTarget({ directory: options['evidence-directory'], acceptanceMfaFile: options['acceptance-mfa-file'] });
  }
  for (const name of ['binding', 'target', 'config']) {
    inputs[name] = readProtectedJson(options[name], options[`${name}-sha256`]);
  }
  const actualOpsCommit = validateGitBinding(inputs.binding);
  // Raw file hashes and canonical content hashes have deliberately different names/roles.
  const plan = buildPlan({ ...inputs, actualOpsCommit });
  if (options.mode === 'preflight') return runReadOnlyPreflight(inputs);
  if (['rehearse', 'promote'].includes(options.mode)) {
    inputs.privateRuntime = readProtectedJson(options['private-runtime'], options['private-runtime-sha256']);
    const execution = { evidenceDirectory: options['evidence-directory'], confirmation: options.confirm };
    if (options.mode === 'rehearse') return runRehearsal(inputs, execution);
    inputs.rehearsal = readProtectedJson(options.rehearsal, options['rehearsal-sha256']);
    inputs.rehearsalSha256 = options['rehearsal-sha256']; execution.backupFile = options.backup;
    return runPromotion(inputs, execution);
  }
  return options.mode === 'validate'
    ? { kind: plan.kind, status: 'binding_validated', mutationAdapterImplemented: true } : plan;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
    .catch((error) => { process.stderr.write(`${safeError(error)}\n`); process.exitCode = 1; });
}
