#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProtectedJson } from './green_staging_98_106_contract.mjs';
import { privateDirectory } from './green_staging_98_106_evidence.mjs';
import { runTechnicalSandbox106Activation } from './technical_sandbox_106_executor.mjs';
import { validateTechnicalSandbox106Evidence } from './technical_sandbox_106_activation.mjs';
import { createTechnicalSandbox106Dependencies, inspectTechnicalSandboxTarget,
  readTechnicalSandboxSessionProof, validateTechnicalSandboxSecretMetadata } from './technical_sandbox_106_runtime_adapter.mjs';

const deny = code => { const e = new Error(code); e.code = code; e.exitCode = 2; throw e; };
const hash = value => /^[a-f0-9]{64}$/u.test(String(value ?? ''));
const allowed = new Set(['mode','evidence','evidence-sha256','promotion-receipt','promotion-receipt-sha256',
  'session-proof','session-proof-sha256','evidence-directory','run-id','confirm','rehearsal','rehearsal-sha256']);

export function parseTechnicalSandboxActivationArgs(args) {
  const result = {}; const seen = new Set();
  if (args.length % 2 !== 0) deny('sandbox106_arguments');
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]; const key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.has(key) || seen.has(key) || typeof args[i + 1] !== 'string' || args[i + 1].startsWith('--')) deny('sandbox106_arguments');
    seen.add(key); result[key] = args[i + 1];
  }
  if (!['preflight','rehearse','promote'].includes(result.mode)
      || !['evidence','promotion-receipt','session-proof','evidence-directory'].every(k => result[k])
      || !['evidence-sha256','promotion-receipt-sha256','session-proof-sha256'].every(k => hash(result[k]))) deny('sandbox106_arguments');
  if (result.mode !== 'preflight' && (!result['run-id'] || !result.confirm)) deny('sandbox106_arguments');
  if (result.mode === 'promote' && (!result.rehearsal || !hash(result['rehearsal-sha256']))) deny('sandbox106_arguments');
  if (result.mode !== 'promote' && (result.rehearsal || result['rehearsal-sha256'])) deny('sandbox106_arguments');
  return Object.freeze(result);
}

export async function runTechnicalSandboxActivationCli(args, { stdout = process.stdout, stderr = process.stderr, now = Date.now } = {}) {
  let mode = 'arguments';
  try {
    const options = parseTechnicalSandboxActivationArgs(args); mode = options.mode;
    const evidence = readProtectedJson(options.evidence, options['evidence-sha256']);
    const evidenceBinding = validateTechnicalSandbox106Evidence(evidence, { now: now() });
    const promotionReceipt = readProtectedJson(options['promotion-receipt'], options['promotion-receipt-sha256']);
    const proof = readTechnicalSandboxSessionProof(options['session-proof'], options['session-proof-sha256'], {
      userIds: evidence.ownerAuthorization?.userIds, now: now() });
    if (proof.principalId !== evidence.ownerAuthorization?.userIds?.find(id => id === proof.principalId)) deny('sandbox106_session_principal');
    validateTechnicalSandboxSecretMetadata(evidence);
    const directory = privateDirectory(options['evidence-directory']);
    const dependencies = createTechnicalSandbox106Dependencies({ token: proof.token, evidenceDirectory: directory.directory, now });
    const { canonical, image } = await inspectTechnicalSandboxTarget(evidence, dependencies);
    let rehearsalReceipt = null;
    if (mode === 'promote') {
      const expectedPath = path.join(directory.directory, `${options['run-id']}.technical-sandbox.rehearsal.json`);
      if (path.normalize(options.rehearsal) !== expectedPath) deny('sandbox106_rehearsal_path');
      rehearsalReceipt = readProtectedJson(options.rehearsal, options['rehearsal-sha256']);
    }
    const result = await runTechnicalSandbox106Activation({ evidence, promotionReceipt,
      promotionReceiptSha256: options['promotion-receipt-sha256'], canonical, image, rehearsalReceipt,
      options: { execute: mode !== 'preflight', phase: mode, evidenceSha256: evidenceBinding.evidenceSha256,
        promotionReceiptSha256: options['promotion-receipt-sha256'], rehearsalSha256: options['rehearsal-sha256'],
        confirmation: options.confirm, runId: options['run-id'] }, dependencies });
    stdout.write(`${JSON.stringify(result)}\n`);
    return result.exitCode ?? (result.status === 'recovery_required' ? 3 : result.status === 'activation_rolled_back' ? 2 : 0);
  } catch {
    const code = mode === 'arguments' ? 2 : 2;
    stderr.write(`technical_sandbox_106_${mode}_rejected\n`); return code;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTechnicalSandboxActivationCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
