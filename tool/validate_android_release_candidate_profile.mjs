#!/usr/bin/env node

import { validateAndroidReleaseSocialProfile } from './validate_android_release_social_profile.mjs';

const STAGING_API_BASE_URL = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(`Android release candidate profile ${message}`);
}

function explicitBoolean(environment, name) {
  if (!Object.prototype.hasOwnProperty.call(environment, name) ||
      environment[name] === '') {
    fail(`${name} must be explicitly set to 0, 1, false, or true.`);
  }
  const value = environment[name];
  if (value === '1' || value === 'true' || value === true) return true;
  if (value === '0' || value === 'false' || value === false) return false;
  fail(`${name} must be 0, 1, false, or true.`);
}

function explicitString(environment, name) {
  if (!Object.prototype.hasOwnProperty.call(environment, name) ||
      typeof environment[name] !== 'string' || environment[name] === '') {
    fail(`${name} must be explicitly set.`);
  }
  return environment[name];
}

function rolloverEnabled(environment) {
  return environment.SIT_ALLOW_CANDIDATE_ROLLOVER === '1' ||
    environment.SIT_ALLOW_CANDIDATE_ROLLOVER === 'true' ||
    environment.SIT_ALLOW_CANDIDATE_ROLLOVER === true;
}

export function validateAndroidReleaseCandidateProfile({
  environment = process.env,
  candidateRollover = rolloverEnabled(environment),
} = {}) {
  if (!candidateRollover) {
    return Object.freeze({ candidateRollover: false, fullPilotEnvelope: false });
  }

  const blueOcean = explicitBoolean(environment, 'SIT_BLUE_OCEAN_LISTING_ASSISTANT');
  const closedEnvelope = explicitBoolean(environment, 'SIT_CLOSED_PILOT_ENVELOPE');
  const stagePilotId = explicitString(environment, 'SIT_STAGE_A_PILOT_ID');
  const releaseChannel = explicitString(environment, 'SIT_RELEASE_CHANNEL');
  const apiBaseUrl = explicitString(environment, 'SIT_API_BASE_URL');
  const storeSubmission = explicitBoolean(environment, 'SIT_REQUIRE_STORE_SUBMISSION');
  const canonicalSigning = explicitBoolean(environment, 'SIT_REQUIRE_CANONICAL_SIGNING');
  const firebaseRequired = explicitBoolean(environment, 'SIT_REQUIRE_FIREBASE');

  validateAndroidReleaseSocialProfile({
    environment,
    releaseChannel,
    apiBaseUrl,
    candidateRollover: true,
  });

  if (blueOcean !== true ||
      closedEnvelope !== true ||
      stagePilotId !== 'heilbronn_wave0' ||
      releaseChannel !== 'internal' ||
      apiBaseUrl !== STAGING_API_BASE_URL ||
      storeSubmission !== false ||
      canonicalSigning !== true ||
      firebaseRequired !== true) {
    fail(
      'candidate rollover requires the complete heilbronn_wave0 private-pilot profile: ' +
      'Blue Ocean=true, closed envelope=true, Internal/Staging, no Store submission, ' +
      'SIT_STAGE_A_PILOT_ID=heilbronn_wave0, canonical signing=true, and Firebase=true.',
    );
  }

  return Object.freeze({
    candidateRollover: true,
    fullPilotEnvelope: true,
    blueOcean,
    closedEnvelope,
    stagePilotId,
    releaseChannel,
    apiBaseUrl,
    storeSubmission,
    canonicalSigning,
    firebaseRequired,
  });
}

function runCli() {
  process.stdout.write(`${JSON.stringify(validateAndroidReleaseCandidateProfile())}\n`);
}

if (process.argv[1]?.endsWith('validate_android_release_candidate_profile.mjs')) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Android release candidate profile validation failed.'}\n`);
    process.exitCode = 1;
  }
}
