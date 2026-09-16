import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('release preflight validates closed testing and requires production access for Store mode', () => {
  const source = read('scripts/release_candidate_preflight.sh');
  assert.match(source, /node --check tool\/validate_google_play_closed_testing\.mjs/);
  assert.match(source, /node tool\/validate_google_play_closed_testing\.mjs\n/);
  assert.match(
    source,
    /if \[\[ "\$\{SIT_REQUIRE_STORE_SUBMISSION:-0\}" == "1" \]\]; then[\s\S]*node tool\/validate_google_play_closed_testing\.mjs --require-production-access/,
  );
  assert.ok(
    source.indexOf('node tool/validate_google_play_closed_testing.mjs --require-production-access')
      < source.indexOf('dart run tool/validate_store_metadata.dart --require-submittable'),
  );
});

test('technical regression checks the closed-testing contract and its tests', () => {
  const source = read('scripts/technical_regression_check.sh');
  for (const command of [
    'node --check tool/validate_google_play_closed_testing.mjs',
    'node --test test/tool/validate_google_play_closed_testing.test.mjs',
    'node --check tool/prepare_google_play_closed_testing_observation.mjs',
    'node --test test/tool/prepare_google_play_closed_testing_observation.test.mjs',
    'node tool/validate_google_play_closed_testing.mjs',
    'node --check tool/validate_google_play_closed_testing_feedback.mjs',
    'node --test test/tool/validate_google_play_closed_testing_feedback.test.mjs',
    'node tool/validate_google_play_closed_testing_feedback.mjs',
    'node --check tool/validate_google_play_production_access_application.mjs',
    'node --test test/tool/validate_google_play_production_access_application.test.mjs',
    'node tool/validate_google_play_production_access_application.mjs',
  ]) {
    assert.ok(source.includes(command), `technical regression is missing: ${command}`);
  }
});

test('release preflight syntax-checks the observation preparer', () => {
  assert.match(
    read('scripts/release_candidate_preflight.sh'),
    /node --check tool\/prepare_google_play_closed_testing_observation\.mjs/,
  );
});

test('release preflight requires an approved production-access application in Store mode', () => {
  const source = read('scripts/release_candidate_preflight.sh');
  assert.match(source, /node --check tool\/validate_google_play_production_access_application\.mjs/);
  assert.match(source, /node tool\/validate_google_play_production_access_application\.mjs\n/);
  assert.match(
    source,
    /if \[\[ "\$\{SIT_REQUIRE_STORE_SUBMISSION:-0\}" == "1" \]\]; then[\s\S]*node tool\/validate_google_play_production_access_application\.mjs --require-approved/,
  );
});

test('Store metadata binds the dedicated closed-testing readiness document', () => {
  const manifest = JSON.parse(read('store/submission.json'));
  assert.equal(
    manifest.metadataFiles.googlePlay.closedTestingReadiness,
    'store/google-play/closed-testing-readiness.json',
  );
  assert.equal(manifest.blockingGates.googlePlayClosedTestingRequirement, 'open');
  assert.equal(
    manifest.metadataFiles.googlePlay.productionAccessApplication,
    'store/google-play/production-access-application.json',
  );
  assert.equal(
    manifest.metadataFiles.googlePlay.closedTestingFeedbackPlan,
    'store/google-play/closed-testing-feedback-plan.json',
  );
});

test('closed-test evidence cannot follow a linked file outside the evidence directory', () => {
  const source = read('tool/validate_google_play_closed_testing.mjs');
  assert.match(source, /metadata\.isSymbolicLink\(\)/);
  assert.match(source, /real\.startsWith\(`\$\{evidenceRoot\}\/`\)/);
});
