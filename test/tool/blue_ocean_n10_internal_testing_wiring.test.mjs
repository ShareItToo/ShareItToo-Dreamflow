import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

const plan = JSON.parse(read('store/google-play/blue-ocean-internal-testing-plan.json'));

test('N10 plan is Internal-only and explicitly unexecuted', () => {
  assert.equal(plan.track, 'internal');
  assert.equal(plan.status, 'prepared-not-executed');
  assert.ok(Object.values(plan.boundaries).every((entry) => entry === false));
});

test('N10 historical plan remains monotonic after later candidate cuts', () => {
  const pubspec = read('pubspec.yaml');
  const currentVersion = /^version:\s+([^+\s]+)\+(\d+)$/mu.exec(pubspec);
  assert.notEqual(currentVersion, null);
  assert.equal(currentVersion[1], plan.candidatePlan.versionName);
  assert.equal(plan.candidatePlan.currentRepositoryBuildNumber, '2026082302');
  assert.equal(plan.candidatePlan.plannedBuildNumber, '2026082401');
  assert.ok(BigInt(plan.candidatePlan.plannedBuildNumber)
    > BigInt(plan.candidatePlan.currentRepositoryBuildNumber));
  assert.ok(BigInt(currentVersion[2]) >= BigInt(plan.candidatePlan.plannedBuildNumber));
});

test('N10 release notes state the internal non-binding no-money boundary', () => {
  const notes = read(plan.candidatePlan.releaseNotesPath);
  assert.match(notes, /Interner ShareItToo-Test:/u);
  assert.match(notes, /nicht bindender/u);
  assert.match(notes, /keine echten Zahlungen/u);
});

test('N10 runbook separates both owner tokens and prohibits public routes', () => {
  const runbook = read(plan.rollbackAndPreservation.runbookPath);
  assert.match(runbook, /GOOGLE_PLAY_INTERNAL_UPLOAD_GO/u);
  assert.match(runbook, /GOOGLE_PLAY_INTERNAL_RELEASE_GO/u);
  assert.match(runbook, /Do not enter Closed,\n   Open or Production testing/u);
});

test('N10 tester template defers the exact Play build to the later R15 handoff', () => {
  const instructions = read(plan.testerDistribution.instructionsPath);
  assert.match(instructions, /Install or update only from Google Play/u);
  assert.match(instructions, /future R15 candidate handoff/u);
  assert.match(instructions, /A placeholder or different build is a stop/u);
  assert.doesNotMatch(instructions, /2026082401/u);
  assert.match(instructions, /Remove faces, documents, addresses/u);
});

test('N10 feedback template stays bounded and flags stop conditions', () => {
  const feedback = read(plan.testerDistribution.feedbackPath);
  assert.match(feedback, /NO OBSERVED HUMAN RESULT/u);
  assert.match(feedback, /wrong-build-stop/u);
  assert.match(feedback, /yes-stop/u);
  assert.doesNotMatch(feedback, /free-form personal narrative/iu);
});

test('N10 machine artifacts contain no email address, secret or local home path', () => {
  const machine = `${JSON.stringify(plan)}\n${read('docs/evidence/blue-ocean/n10-google-play-internal-testing-preparation-20260824.json')}`;
  assert.doesNotMatch(machine, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u);
  assert.doesNotMatch(machine, /\bsk-[A-Za-z0-9]/u);
  assert.doesNotMatch(machine, /\/Users\//u);
});

test('N10 validator is registered in the permanent regression script', () => {
  const regression = read('scripts/technical_regression_check.sh');
  assert.match(regression, /validate_blue_ocean_n10_internal_testing\.test\.mjs/u);
  assert.match(regression, /validate_blue_ocean_n10_internal_testing\.mjs/u);
});
