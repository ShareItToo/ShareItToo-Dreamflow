#!/usr/bin/env node

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGreenEnrollmentCandidateInputs } from './build_green_enrollment_candidate_inputs.mjs';

const denialCode = 'green_enrollment_candidate_inputs_cli_denied';
const exactExecuteConfirmation = 'CREATE-GREEN-ENROLLMENT-CANDIDATE-INPUTS';
const pathArguments = Object.freeze({
  '--activation-output-file': 'activationOutputFile',
  '--allowlist-file': 'allowlistFile',
  '--current-environment-file': 'currentEnvironmentFile',
  '--pretransition-output-file': 'pretransitionOutputFile',
  '--registry-file': 'registryFile',
  '--request-file': 'requestFile',
  '--runtime-identity-file': 'runtimeIdentityFile',
  '--server-record-file': 'serverRecordFile',
});
const integerArguments = Object.freeze({
  '--target-gid': 'targetGid',
  '--target-uid': 'targetUid',
});
const allValueArguments = new Set([
  ...Object.keys(pathArguments), ...Object.keys(integerArguments), '--confirm-execute',
]);

export class GreenEnrollmentCandidateInputsCliError extends Error {
  constructor(state = 'denied') {
    super(denialCode);
    this.code = denialCode;
    this.state = state;
  }
}

const deny = (state = 'denied') => { throw new GreenEnrollmentCandidateInputsCliError(state); };

function absolutePath(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 4096
      || value.includes('\0') || !path.isAbsolute(value) || path.normalize(value) !== value) deny();
  return value;
}

function positiveInteger(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/u.test(value)) deny();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) deny();
  return parsed;
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) deny();
  const values = {};
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--execute') {
      if (execute) deny();
      execute = true;
      continue;
    }
    if (!allValueArguments.has(name) || Object.hasOwn(values, name)) deny();
    const value = argv[index += 1];
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) deny();
    values[name] = value;
  }
  for (const name of [...Object.keys(pathArguments), ...Object.keys(integerArguments)]) {
    if (!Object.hasOwn(values, name)) deny();
  }
  const confirmation = values['--confirm-execute'];
  if ((!execute && confirmation !== undefined)
      || (execute && confirmation !== exactExecuteConfirmation)) deny('confirmation-mismatch');
  return Object.freeze({ execute, values: Object.freeze(values) });
}

function generateSalt(randomBytesImpl) {
  let bytes;
  try { bytes = randomBytesImpl(32); } catch { deny(); }
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) deny();
  try { return bytes.toString('hex'); } finally { bytes.fill(0); }
}

export function runGreenEnrollmentCandidateInputsCli(argv, {
  randomBytesImpl = crypto.randomBytes,
  now = Date.now,
} = {}) {
  try {
    if (typeof randomBytesImpl !== 'function' || typeof now !== 'function') deny();
    const { execute, values } = parseArguments(argv);
    const pretransitionScryptSalt = generateSalt(randomBytesImpl);
    const activationScryptSalt = generateSalt(randomBytesImpl);
    if (pretransitionScryptSalt === activationScryptSalt) deny();
    const input = { execute, now, pretransitionScryptSalt, activationScryptSalt };
    for (const [argument, name] of Object.entries(pathArguments)) {
      input[name] = absolutePath(values[argument]);
    }
    for (const [argument, name] of Object.entries(integerArguments)) {
      input[name] = positiveInteger(values[argument]);
    }
    return buildGreenEnrollmentCandidateInputs(input);
  } catch (error) {
    if (error instanceof GreenEnrollmentCandidateInputsCliError) throw error;
    if (error?.state === 'rollback-unconfirmed') deny('rollback-unconfirmed');
    if (error?.state === 'green_enrollment_candidate_inputs_publication_unconfirmed') {
      deny('publication-unconfirmed');
    }
    deny();
  }
}

async function main() {
  try {
    const result = runGreenEnrollmentCandidateInputsCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const status = error instanceof GreenEnrollmentCandidateInputsCliError
      && ['publication-unconfirmed', 'rollback-unconfirmed'].includes(error.state)
      ? error.state : 'denied';
    process.stderr.write(`${JSON.stringify({ status })}\n`);
    process.exitCode = status === 'denied' ? 1 : 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export const GREEN_ENROLLMENT_CANDIDATE_INPUTS_EXECUTE_CONFIRMATION = exactExecuteConfirmation;
