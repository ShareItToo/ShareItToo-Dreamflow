#!/usr/bin/env node

const SOCIAL_FLAGS = Object.freeze({
  google: 'SIT_SOCIAL_GOOGLE_ENABLED',
  apple: 'SIT_SOCIAL_APPLE_ENABLED',
  facebook: 'SIT_SOCIAL_FACEBOOK_ENABLED',
});

const STAGING_API_BASE_URL = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(`Android release social profile ${message}`);
}

function parseExplicitBoolean(environment, name) {
  if (!Object.prototype.hasOwnProperty.call(environment, name) ||
      environment[name] === '') {
    fail(`${name} must be explicitly set to 0, 1, false, or true.`);
  }
  const value = environment[name];
  if (value === '1' || value === 'true' || value === true) return true;
  if (value === '0' || value === 'false' || value === false) return false;
  fail(`${name} must be 0, 1, false, or true.`);
}

function parseRollover(environment) {
  const value = environment.SIT_ALLOW_CANDIDATE_ROLLOVER;
  return value === '1' || value === 'true' || value === true;
}

export function validateAndroidReleaseSocialProfile({
  environment = process.env,
  releaseChannel = environment.SIT_RELEASE_CHANNEL ?? 'internal',
  apiBaseUrl = environment.SIT_API_BASE_URL ?? STAGING_API_BASE_URL,
  candidateRollover = parseRollover(environment),
} = {}) {
  const flags = Object.fromEntries(
    Object.entries(SOCIAL_FLAGS).map(([provider, name]) => [
      provider,
      parseExplicitBoolean(environment, name),
    ]),
  );
  const internalStaging = releaseChannel === 'internal' &&
    apiBaseUrl === STAGING_API_BASE_URL;

  if (candidateRollover && !internalStaging) {
    fail('candidate rollover is restricted to the internal Staging profile.');
  }
  if (candidateRollover &&
      (flags.google !== true || flags.apple !== false || flags.facebook !== false)) {
    fail(
      'candidate rollover requires Google=true, Apple=false, and Facebook=false.',
    );
  }

  return Object.freeze({
    ...flags,
    releaseChannel,
    apiBaseUrl,
    candidateRollover,
    internalStaging,
  });
}

function runCli() {
  const result = validateAndroidReleaseSocialProfile({ environment: process.env });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith('validate_android_release_social_profile.mjs')) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Android release social profile validation failed.'}\n`);
    process.exitCode = 1;
  }
}
