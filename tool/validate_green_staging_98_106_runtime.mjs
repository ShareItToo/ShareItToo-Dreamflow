#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert, readProtectedJson, safeError } from '../backend/ops/green_staging_98_106_contract.mjs';
import { buildPlan, runReadOnlyPreflight, validateGitBinding } from '../backend/ops/green_staging_98_106_promotion.mjs';

export function parseArguments(args) {
  const allowed = new Set(['mode', 'binding', 'binding-sha256', 'publication', 'publication-sha256',
    'target', 'target-sha256', 'config', 'config-sha256']);
  const result = { mode: 'plan' };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/u, '');
    assert(args[index]?.startsWith('--') && allowed.has(key) && !seen.has(key)
      && typeof args[index + 1] === 'string' && !args[index + 1].startsWith('--'), 'green_98_106_arguments');
    seen.add(key); result[key] = args[index + 1];
  }
  assert(['plan', 'validate', 'preflight'].includes(result.mode), 'green_98_106_mutation_adapter_not_implemented');
  for (const name of ['binding', 'publication', 'target', 'config']) {
    assert(result[name] && /^[a-f0-9]{64}$/u.test(result[`${name}-sha256`] ?? ''), 'green_98_106_missing_external_binding');
  }
  return result;
}
export async function main(args) {
  const options = parseArguments(args);
  const inputs = {};
  for (const name of ['binding', 'publication', 'target', 'config']) {
    inputs[name] = readProtectedJson(options[name], options[`${name}-sha256`]);
  }
  inputs.publicationSha256 = options['publication-sha256'];
  const actualOpsCommit = validateGitBinding(inputs.binding);
  // Raw file hashes and canonical content hashes have deliberately different names/roles.
  const plan = buildPlan({ ...inputs, actualOpsCommit });
  if (options.mode === 'preflight') return runReadOnlyPreflight(inputs);
  return options.mode === 'validate'
    ? { kind: plan.kind, status: 'binding_validated', mutationAdapterImplemented: false } : plan;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
    .catch((error) => { process.stderr.write(`${safeError(error)}\n`); process.exitCode = 1; });
}
