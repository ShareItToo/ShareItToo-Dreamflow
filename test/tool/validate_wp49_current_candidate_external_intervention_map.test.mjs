import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp49CurrentCandidateExternalInterventionMap,
} from '../../tool/validate_wp49_current_candidate_external_intervention_map.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp49-current-candidate-external-intervention-map-20260907.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp49CurrentCandidateExternalInterventionMap({
    repositoryRoot: root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact current-candidate external intervention map', () => {
  assert.deepEqual(validate(), {
    status: 'prepared-hold-external-interventions-required',
    candidateBuild: '2026090610',
    doneCount: 16,
    partialCount: 2,
    openCount: 6,
    runwayLaneCount: 9,
    externallyReadyLaneCount: 0,
    nextLane: 'staging-backend-parity',
    releaseDecision: 'hold-no-go',
  });
});

test('rejects candidate, source hash and predecessor closure drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.buildNumber = '2026090611';
  assert.throws(() => validate(candidate), /exact candidate/u);

  const hash = structuredClone(evidence);
  hash.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(hash), /source hash drift/u);
});

test('rejects promotion or dilution of the 24-area portfolio', () => {
  const promotion = structuredClone(evidence);
  promotion.portfolio.done.push(promotion.portfolio.open.pop());
  promotion.portfolio.doneCount += 1;
  promotion.portfolio.openCount -= 1;
  assert.throws(() => validate(promotion), /acceptance portfolio/u);

  const dilution = structuredClone(evidence);
  dilution.portfolio.totalCount = 25;
  assert.throws(() => validate(dilution), /acceptance portfolio/u);
});

test('rejects missing, reordered or prematurely ready lanes', () => {
  const reordered = structuredClone(evidence);
  [reordered.externalRunway[0], reordered.externalRunway[1]] =
    [reordered.externalRunway[1], reordered.externalRunway[0]];
  assert.throws(() => validate(reordered), /runway order/u);

  const ready = structuredClone(evidence);
  ready.externalRunway[0].externalReady = true;
  assert.throws(() => validate(ready), /runway lane/u);
});

test('rejects dependency cycles and uncovered acceptance areas', () => {
  const cycle = structuredClone(evidence);
  cycle.externalRunway[0].dependencies = ['support-staff-deadline'];
  assert.throws(() => validate(cycle), /dependency/u);

  const uncovered = structuredClone(evidence);
  uncovered.externalRunway[1].covers = ['support-deadline-owner-action'];
  assert.throws(() => validate(uncovered), /no runway lane/u);
});

test('rejects an external mutation or release overclaim', () => {
  const mutation = structuredClone(evidence);
  mutation.boundaries.backendDeploymentChanged = true;
  assert.throws(() => validate(mutation), /external mutation/u);

  const release = structuredClone(evidence);
  release.aggregate.releaseDecision = 'go';
  assert.throws(() => validate(release), /aggregate gate state/u);
});

test('rejects private or secret-shaped additions', () => {
  const privateField = structuredClone(evidence);
  privateField.deviceId = 'forbidden';
  assert.throws(() => validate(privateField), /private field/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});
