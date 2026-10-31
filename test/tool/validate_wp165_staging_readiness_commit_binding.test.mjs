import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  requiredSourceBindings,
  validateWp165StagingReadinessCommitBinding,
} from '../../tool/validate_wp165_staging_readiness_commit_binding.mjs';

const repositoryRoot = new URL('../..', import.meta.url).pathname;
const evidence = JSON.parse(readFileSync(
  new URL('../../docs/evidence/release-readiness/wp165-staging-readiness-drift-20260916.json', import.meta.url),
));

test('WP165 binds the readiness observation to the exact recorded backend commit and sources', () => {
  assert.deepEqual(validateWp165StagingReadinessCommitBinding({ repositoryRoot, evidence }), {
    status: 'blocked-by-one-noncritical-support-followup',
    backendCommit: 'df39a14b7a19afe467842461a28f1e77fec8445e',
    sourceFilesVerified: Object.keys(requiredSourceBindings).length,
    localEvaluationOnly: true,
    stagingEvidenceCreated: false,
  });
});

test('an old backend stand is rejected instead of falling back to HEAD', () => {
  const oldStand = structuredClone(evidence);
  oldStand.runtime.commit = '46e4e886e9f2679f57b4307c545a3a87a3c12a70';
  assert.throws(
    () => validateWp165StagingReadinessCommitBinding({ repositoryRoot, evidence: oldStand }),
    /recorded backend commit is not the recorded WP165 value/u,
  );
});

test('an unknown backend commit is rejected before any source is inspected', () => {
  const unknown = structuredClone(evidence);
  unknown.runtime.commit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.throws(
    () => validateWp165StagingReadinessCommitBinding({ repositoryRoot, evidence: unknown }),
    /recorded backend commit is not the recorded WP165 value/u,
  );
});

test('a missing required source file is a hard failure', () => {
  const missing = { ...requiredSourceBindings };
  delete missing['backend/src/app.js'];
  assert.throws(
    () => validateWp165StagingReadinessCommitBinding({ repositoryRoot, evidence, sourceBindings: missing }),
    /required source inventory is not the recorded WP165 value/u,
  );
});
