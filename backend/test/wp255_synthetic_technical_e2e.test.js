import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCloneCleanupTarget,
  assertCloneFixtureMarker,
  assertSyntheticCloneTarget,
  assertSyntheticLegalSeedEnvironment,
  syntheticLegalContent,
  assertSyntheticSnapshotRejected,
  assertSyntheticEffectiveAt,
  sha256Text,
} from '../ops/wp255_synthetic_technical_e2e.mjs';

const runId = 'wp255-20260918013000-abcdef12';
const source = '338c7bc066f10b72b05f89a5485cb5f5204a8e25';
const schema = sha256Text('canonical-schema.sql@338c7bc');

test('clone target accepts exact source/schema binding', () => {
  const result = assertSyntheticCloneTarget({
    targetKind: 'clone',
    targetName: `sit-synthetic-clone-${runId}`,
    expectedRunId: runId,
    expectedSourceCommit: source,
    actualSourceCommit: source,
    expectedSchemaDigest: schema,
    actualSchemaDigest: schema,
  });
  assert.equal(result.sourceCommit, source);
});

test('wrong target fails closed before any seed or write', () => {
  assert.throws(() => assertSyntheticCloneTarget({
    targetKind: 'green',
    targetName: `sit-green-${runId}`,
    expectedRunId: runId,
    expectedSourceCommit: source,
    actualSourceCommit: source,
    expectedSchemaDigest: schema,
    actualSchemaDigest: schema,
  }), (error) => error.code === 'target_kind_not_clone');
});

test('runtime and schema drift fail closed', () => {
  assert.throws(() => assertSyntheticCloneTarget({
    targetKind: 'clone', targetName: `sit-synthetic-clone-${runId}`, expectedRunId: runId,
    expectedSourceCommit: source, actualSourceCommit: 'a'.repeat(40),
    expectedSchemaDigest: schema, actualSchemaDigest: schema,
  }), (error) => error.code === 'runtime_source_drift');
  assert.throws(() => assertSyntheticCloneTarget({
    targetKind: 'clone', targetName: `sit-synthetic-clone-${runId}`, expectedRunId: runId,
    expectedSourceCommit: source, actualSourceCommit: source,
    expectedSchemaDigest: schema, actualSchemaDigest: 'b'.repeat(64),
  }), (error) => error.code === 'schema_drift');
});

test('cleanup accepts only run-scoped clone resources', () => {
  assert.equal(assertCloneCleanupTarget({
    resourceKind: 'container', resourceName: `sit-synthetic-clone-${runId}-api`, runId,
    protectedNames: ['sit-green-api-20260918011528-wp254', 'shareittoo-staging-api'],
  }), true);
});

test('cleanup refuses Alt, Green, staging and production resources', () => {
  for (const [resourceName, expected] of [
    ['sit-green-api-20260918011528-wp254', 'cleanup_target_not_clone'],
    ['shareittoo-staging-postgres', 'cleanup_target_not_clone'],
    ['shareittoo-prod-postgres', 'cleanup_target_not_clone'],
  ]) {
    assert.throws(() => assertCloneCleanupTarget({ resourceKind: 'container', resourceName, runId }),
      (error) => error.code === expected);
  }
  assert.throws(() => assertCloneCleanupTarget({
    resourceKind: 'volume', resourceName: `sit-synthetic-clone-${runId}-db`, runId,
    protectedNames: [`sit-synthetic-clone-${runId}-db`],
  }), (error) => error.code === 'cleanup_protected_resource');
});

test('fixtures require explicit synthetic and non-release markers', () => {
  assert.equal(assertCloneFixtureMarker({
    datasetId: 'wp255-green-clone-001', syntheticTestOnly: true, releaseEligible: false, contractEligible: false,
  }), true);
  assert.throws(() => assertCloneFixtureMarker({
    datasetId: 'wp255-green-clone-001', syntheticTestOnly: true, releaseEligible: true, contractEligible: false,
  }), (error) => error.code === 'fixture_marker_invalid');
});

test('synthetic legal seed requires test-only clone environment', () => {
  assert.equal(assertSyntheticLegalSeedEnvironment({ env: {
    SIT_SYNTHETIC_LEGAL_SEED: '1', DEPLOYMENT_ENVIRONMENT: 'test',
    SIT_SYNTHETIC_DATASET_ID: 'wp255-green-clone-001', SIT_SYNTHETIC_CLONE_RUN_ID: runId,
  } }), true);
  assert.throws(() => assertSyntheticLegalSeedEnvironment({ env: {
    SIT_SYNTHETIC_LEGAL_SEED: '1', DEPLOYMENT_ENVIRONMENT: 'staging',
    SIT_SYNTHETIC_DATASET_ID: 'wp255-green-clone-001', SIT_SYNTHETIC_CLONE_RUN_ID: runId,
  } }), (error) => error.code === 'synthetic_legal_seed_test_environment_required');
});

test('synthetic legal content is visibly non-contractual and hashable', () => {
  const content = syntheticLegalContent({ content: '<html>fixture</html>', datasetId: 'wp255-green-clone-001', runId, part: 'A' });
  assert.match(content, /SYNTHETIC_TEST_ONLY \/ NOT_FOR_CONTRACT_OR_RELEASE/u);
  assert.match(content, /dataset=wp255-green-clone-001/u);
  assert.equal(sha256Text(content).length, 64);
});

test('missing, wrong-hash and future snapshots are each rejected distinctly', () => {
  assert.throws(() => assertSyntheticSnapshotRejected({ row: null }), (error) => error.code === 'synthetic_snapshot_missing');
  assert.throws(() => assertSyntheticSnapshotRejected({
    row: { content_text: 'x', content_sha256: '0'.repeat(64), effective_at: '2020-01-01T00:00:00Z' },
  }), (error) => error.code === 'synthetic_snapshot_hash_invalid');
  const content = '<html>synthetic</html>';
  assert.throws(() => assertSyntheticSnapshotRejected({
    row: { content_text: content, content_sha256: sha256Text(content), effective_at: '2099-01-01T00:00:00Z' },
  }), (error) => error.code === 'synthetic_snapshot_future_effective_at');
});

test('positive legal fixture time is bound just before the documented runtime', () => {
  const binding = assertSyntheticEffectiveAt({
    effectiveAt: '2026-09-18T01:49:00.000Z',
    runtimeAt: '2026-09-18T01:50:00.000Z',
  });
  assert.equal(binding.effectiveAt, '2026-09-18T01:49:00.000Z');
  assert.throws(() => assertSyntheticEffectiveAt({
    effectiveAt: '2026-09-18T01:51:00.000Z',
    runtimeAt: '2026-09-18T01:50:00.000Z',
  }), (error) => error.code === 'synthetic_legal_seed_effective_at_after_runtime');
});
