import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCloneCleanupTarget,
  assertCloneFixtureMarker,
  assertSyntheticCloneTarget,
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
