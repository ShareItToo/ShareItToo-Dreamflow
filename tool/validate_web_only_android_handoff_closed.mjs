import { validateCandidateRolloverAndroidCompatibilityFiles } from './validate_google_play_internal_handoff.mjs';

// Current Web successor is NOT an Android compatibility approval. Keep the
// historical handoff pin untouched and require its exact fail-closed outcome.
export const webOnlyChangedAndroidSource = 'backend/src/app.js';
export function validateWebOnlyAndroidHandoffClosed({ repositoryRoot,
  validate = validateCandidateRolloverAndroidCompatibilityFiles } = {}) {
  const expected = `Android compatibility file bytes changed: ${webOnlyChangedAndroidSource}.`;
  try {
    validate({ repositoryRoot });
  } catch (error) {
    if (error.message !== expected) throw error;
    return { status: 'web-only-android-handoff-blocked', androidCompatible: false,
      expectedFailure: expected };
  }
  throw Error('web_only_android_handoff_unexpected_pass');
}
