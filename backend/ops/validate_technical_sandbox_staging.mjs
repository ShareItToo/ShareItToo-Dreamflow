#!/usr/bin/env node

import { readTechnicalSandboxConfiguration, syntheticUserPattern } from '../src/technical_sandbox_config.js';
import { closeStablePrivateFile, openStablePrivateFile } from './stable_private_file.mjs';

export const technicalSandboxApiUid = 100;
export const technicalSandboxApiGid = 101;

function fail(code) {
  const error = new Error('Technical Sandbox Staging gate failed.');
  error.code = code;
  throw error;
}

function inspectSecretFile(filePath, name, { expectedUid, expectedGid } = {}) {
  if (typeof filePath !== 'string' || !filePath.startsWith('/')) {
    fail(`${name}_path_invalid`);
  }
  let descriptor;
  try {
    const opened = openStablePrivateFile(filePath, {
      expectedMode: 0o600,
      expectedUid,
      expectedGid,
      code: `${name}_must_be_0600_api_owned_file`,
    });
    descriptor = opened.descriptor;
    return `${opened.metadata.dev}:${opened.metadata.ino}`;
  } catch (error) {
    if (String(error?.code ?? '').startsWith(`${name}_`)) throw error;
    if (error?.code === 'ELOOP') fail(`${name}_symlink_forbidden`);
    fail(`${name}_unreadable`);
  } finally {
    if (descriptor !== undefined) closeStablePrivateFile({ descriptor });
  }
}

export function validateTechnicalSandboxStaging({
  env = process.env,
  deploymentEnvironment = env.SIT_DEPLOYMENT_ENVIRONMENT ?? 'staging',
  now = new Date(),
  expectedUid = technicalSandboxApiUid,
  expectedGid = technicalSandboxApiGid,
} = {}) {
  if (!['staging', 'test'].includes(String(deploymentEnvironment).trim().toLowerCase())) {
    fail('technical_sandbox_environment_forbidden');
  }
  if (String(env.SIT_STAGING_PILOT_ID ?? '').trim() !== 'heilbronn_wave0') {
    fail('technical_sandbox_pilot_required');
  }
  if (String(env.ENABLE_STAGING_STRIPE ?? '0').trim() === '1'
      || String(env.PAYMENT_TRANSPORT ?? 'memory').trim().toLowerCase() !== 'memory'
      || ['true', '1'].includes(String(env.STRIPE_LIVEMODE ?? 'false').trim().toLowerCase())
      || [
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_CONNECT_WEBHOOK_SECRET',
        'STRIPE_SECRET_KEY_FILE',
        'STRIPE_WEBHOOK_SECRET_FILE',
        'STRIPE_CONNECT_WEBHOOK_SECRET_FILE',
      ].some((name) => String(env[name] ?? '').trim() !== '')) {
    fail('technical_sandbox_main_payment_boundary_invalid');
  }
  const keyFile = String(env.TECHNICAL_SANDBOX_SECRET_KEY_HOST_FILE ?? '').trim();
  const webhookFile = String(env.TECHNICAL_SANDBOX_WEBHOOK_SECRET_HOST_FILE ?? '').trim();
  if (!keyFile || !webhookFile || keyFile === webhookFile) {
    fail('technical_sandbox_secret_files_invalid');
  }
  const identities = [
    inspectSecretFile(keyFile, 'technical_sandbox_secret_key', { expectedUid, expectedGid }),
    inspectSecretFile(webhookFile, 'technical_sandbox_webhook_secret', { expectedUid, expectedGid }),
  ];
  if (new Set(identities).size !== identities.length) {
    fail('technical_sandbox_secret_files_not_distinct');
  }

  const configuration = readTechnicalSandboxConfiguration({
    ...env,
    TECHNICAL_SANDBOX_SECRET_KEY_FILE: keyFile,
    TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: webhookFile,
  }, { deploymentEnvironment, now });
  if (configuration.available !== true || configuration.mode !== 'test'
      || configuration.provider !== 'stripe'
      || configuration.amountMinor !== 100 || configuration.currency !== 'EUR'
      || configuration.maxRunsPerUser24h !== 3
      || configuration.professionalReview !== false
      || configuration.allowlistedUserIds.length === 0
      || configuration.allowlistedUserIds.length > 24
      || configuration.allowlistedUserIds.some((id) => !syntheticUserPattern.test(id))) {
    fail('technical_sandbox_configuration_invalid');
  }
  return Object.freeze({
    available: true,
    provider: configuration.provider,
    mode: configuration.mode,
    amountMinor: configuration.amountMinor,
    currency: configuration.currency,
    maxRunsPerUser24h: configuration.maxRunsPerUser24h,
    professionalReview: configuration.professionalReview,
    syntheticOnly: true,
    credentialSource: 'private_0600_file',
  });
}

function runCli() {
  validateTechnicalSandboxStaging();
  process.stdout.write('Technical Sandbox Staging gate: PASS\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Technical Sandbox Staging gate failed.'}\n`);
    process.exitCode = 1;
  }
}
