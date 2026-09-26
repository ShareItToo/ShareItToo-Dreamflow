import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateWp158PlayInternalArtifactAppContentProvenance } from '../../tool/validate_wp158_play_internal_artifact_app_content_provenance.mjs';

const evidencePath = new URL('../../docs/evidence/release-readiness/wp158-play-internal-artifact-app-content-provenance-20260915.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
function inventoryDigest(inventory) {
  return createHash('sha256').update(Object.entries(inventory)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, hash]) => `${path}\0${hash}\n`).join('')).digest('hex');
}

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

test('rejects a tampered stored inventory digest', () => {
  const mutated = structuredClone(evidence);
  mutated.sourceInventory['AGENTS.md'] = '0'.repeat(64);
  assert.throws(
    () => validateWp158PlayInternalArtifactAppContentProvenance({ evidence: mutated }),
    /source inventory digest is invalid/u,
  );
});

test('rejects a tampered historical source hash after digest recomputation', () => {
  const mutated = structuredClone(evidence);
  mutated.sourceInventory['tool/validate_wp158_play_internal_artifact_app_content_provenance.mjs'] = '0'.repeat(64);
  mutated.captureAttestation.sourceInventoryDigest = inventoryDigest(mutated.sourceInventory);
  assert.throws(
    () => validateWp158PlayInternalArtifactAppContentProvenance({ evidence: mutated }),
    /source inventory .* at /u,
  );
});

test('rejects any Play mutation boundary', () => {
  const mutated = structuredClone(evidence);
  mutated.boundaries.activationPerformed = true;
  assert.throws(() => validateWp158PlayInternalArtifactAppContentProvenance({ evidence: mutated }), /boundaries is invalid/u);
});

test('does not rebind historical inventory to a later working-tree source', () => {
  const result = validateWp158PlayInternalArtifactAppContentProvenance({
    evidence,
    sourceTexts: {
      'AGENTS.md': '# later working-tree policy\n',
    },
  });
  assert.equal(result.currentCandidate, '2026091312');
});
