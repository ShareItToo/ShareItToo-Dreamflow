#!/usr/bin/env node

import { createHash } from 'node:crypto';

function fail(code) {
  const error = new Error(`WP255 synthetic technical E2E failed: ${code}`);
  error.code = code;
  throw error;
}

function fullSha(value, name) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(`${name}_must_be_full_sha`);
  return value;
}

export function assertSyntheticCloneTarget({
  targetKind,
  targetName,
  expectedRunId,
  expectedSourceCommit,
  actualSourceCommit,
  expectedSchemaDigest,
  actualSchemaDigest,
} = {}) {
  if (targetKind !== 'clone') fail('target_kind_not_clone');
  if (typeof expectedRunId !== 'string' || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(expectedRunId)) {
    fail('run_id_invalid');
  }
  if (targetName !== `sit-synthetic-clone-${expectedRunId}`) fail('target_name_mismatch');
  fullSha(expectedSourceCommit, 'expected_source_commit');
  fullSha(actualSourceCommit, 'actual_source_commit');
  if (expectedSourceCommit !== actualSourceCommit) fail('runtime_source_drift');
  if (typeof expectedSchemaDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedSchemaDigest)) {
    fail('expected_schema_digest_invalid');
  }
  if (typeof actualSchemaDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(actualSchemaDigest)) {
    fail('actual_schema_digest_invalid');
  }
  if (expectedSchemaDigest !== actualSchemaDigest) fail('schema_drift');
  return Object.freeze({ targetKind, targetName, runId: expectedRunId, sourceCommit: actualSourceCommit, schemaDigest: actualSchemaDigest });
}

export function assertCloneCleanupTarget({ resourceKind, resourceName, runId, protectedNames = [] } = {}) {
  if (!['container', 'network', 'volume', 'secret', 'job'].includes(resourceKind)) fail('cleanup_resource_kind_invalid');
  if (typeof runId !== 'string' || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(runId)) fail('cleanup_run_id_invalid');
  if (typeof resourceName !== 'string' || resourceName.length === 0) fail('cleanup_resource_name_invalid');
  const expectedPrefix = `sit-synthetic-clone-${runId}-`;
  if (!resourceName.startsWith(expectedPrefix)) fail('cleanup_target_not_clone');
  if (protectedNames.some((name) => name === resourceName || resourceName.startsWith(`${name}-`))) {
    fail('cleanup_protected_resource');
  }
  if (/(?:prod|production|staging|green|shareittoo[-_](?:staging|postgres|api))/iu.test(resourceName)) {
    fail('cleanup_target_name_unsafe');
  }
  return true;
}

export function assertCloneFixtureMarker(fixture) {
  if (!fixture || fixture.syntheticTestOnly !== true || fixture.releaseEligible !== false
      || fixture.contractEligible !== false || typeof fixture.datasetId !== 'string'
      || !/^wp255-green-clone-[a-z0-9-]+$/u.test(fixture.datasetId)) {
    fail('fixture_marker_invalid');
  }
  return true;
}

export function sha256Text(value) {
  if (typeof value !== 'string') fail('hash_input_invalid');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

