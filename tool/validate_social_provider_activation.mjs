#!/usr/bin/env node

import { validateAndroidSocialAuthProviderReadiness } from
  './validate_android_social_auth_provider_readiness.mjs';

const allowedPlatforms = Object.freeze(['android', 'ios', 'all']);
const providerFlags = Object.freeze({
  google: 'SIT_SOCIAL_GOOGLE_ENABLED',
  apple: 'SIT_SOCIAL_APPLE_ENABLED',
  facebook: 'SIT_SOCIAL_FACEBOOK_ENABLED',
});

function fail(message) {
  throw new Error(`Social provider activation ${message}`);
}

function enabled(value) {
  if (value === undefined || value === '') return false;
  if (value === '1' || value === 'true' || value === true) return true;
  if (value === '0' || value === 'false' || value === false) return false;
  return null;
}

function readProviderFlags(environment) {
  const flags = {};
  for (const [provider, name] of Object.entries(providerFlags)) {
    const value = enabled(environment[name]);
    if (value === null) fail(`${name} must be 0, 1, false, or true.`);
    flags[provider] = value;
  }

  for (const [name, value] of Object.entries(environment)) {
    const match = /^SIT_SOCIAL_([A-Z0-9_]+)_ENABLED$/u.exec(name);
    if (!match || Object.values(providerFlags).includes(name)) continue;
    if (enabled(value) === true) fail(`provider flag is not allowed: ${name}.`);
  }
  return flags;
}

export function validateSocialProviderActivation({
  environment = process.env,
  platform = 'all',
} = {}) {
  if (!allowedPlatforms.includes(platform)) {
    fail(`platform is invalid: ${platform}.`);
  }
  const flags = readProviderFlags(environment);
  for (const provider of ['apple', 'facebook']) {
    if (flags[provider]) {
      validateAndroidSocialAuthProviderReadiness({ requireProvider: provider });
    }
  }
  return Object.freeze({
    platform,
    googleEnabled: flags.google,
    appleEnabled: flags.apple,
    facebookEnabled: flags.facebook,
    providerReadinessValidated: true,
  });
}

function runCli() {
  let platform = 'all';
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length > 0 && args[0] !== '--platform')) {
    fail('unknown argument.');
  }
  if (args.length === 2) {
    platform = args[1];
  }
  const result = validateSocialProviderActivation({
    environment: process.env,
    platform,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('validate_social_provider_activation.mjs')) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Social provider activation failed.'}\n`);
    process.exitCode = 1;
  }
}
