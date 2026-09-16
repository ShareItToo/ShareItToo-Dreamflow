import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateWp158PlayInternalArtifactAppContentProvenance } from '../../tool/validate_wp158_play_internal_artifact_app_content_provenance.mjs';

const evidencePath = new URL('../../docs/evidence/release-readiness/wp158-play-internal-artifact-app-content-provenance-20260915.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));

test('accepts the fail-closed WP158 provenance reconciliation', () => {
  const result = validateWp158PlayInternalArtifactAppContentProvenance({ evidence });
  assert.equal(result.ownerGate, 'OWNER_GATE_REQUIRED:PLAY_INTERNAL_CURRENT_RELEASE_READBACK');
});

test('rejects a claimed current Play readback', () => {
  const mutated = structuredClone(evidence);
  mutated.playState.currentTrackProven = true;
  assert.throws(() => validateWp158PlayInternalArtifactAppContentProvenance({ evidence: mutated }), /Play state is invalid/u);
});

test('rejects candidate/archive drift', () => {
  const mutated = structuredClone(evidence);
  mutated.currentCandidate.artifactArchive.aabSha256 = '0'.repeat(64);
  assert.throws(() => validateWp158PlayInternalArtifactAppContentProvenance({ evidence: mutated }), /artifact archive is invalid/u);
});

test('rejects any Play mutation boundary', () => {
  const mutated = structuredClone(evidence);
  mutated.boundaries.activationPerformed = true;
  assert.throws(() => validateWp158PlayInternalArtifactAppContentProvenance({ evidence: mutated }), /boundaries is invalid/u);
});
