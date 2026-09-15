import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  deriveChangedSourcePaths,
  deriveWp160ReverseIndex,
  validateWp160ReverseIndex,
} from '../../tool/validate_wp160_source_binding_reverse_index.mjs';
import { validateWp160SpecialCategoryHealthDataIntake } from
  '../../tool/validate_wp160_special_category_health_data_intake.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const evidencePath = resolve(
  repositoryRoot,
  'docs/evidence/release-readiness/wp160-source-binding-reverse-index-20260915.json',
);
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts the machine-derived WP160 reverse source-binding index', () => {
  const result = validateWp160ReverseIndex({ repositoryRoot });
  assert.equal(result.changedSources, 54);
  assert.ok(result.historicalBindings > 0);
});

test('rejects omitted mutable bindings and rewritten historical evidence', () => {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const omitted = structuredClone(evidence);
  omitted.mutableBindings.pop();
  assert.throws(() => validateWp160ReverseIndex({ repositoryRoot, evidence: omitted }), /machine-derived closure/u);
  const omittedChangedTest = structuredClone(evidence);
  omittedChangedTest.changedSourcePaths = omittedChangedTest.changedSourcePaths
    .filter((path) => path !== 'backend/test/postgres_foundation.integration.test.js');
  assert.throws(
    () => validateWp160ReverseIndex({ repositoryRoot, evidence: omittedChangedTest }),
    /machine-derived closure/u,
  );
  const omittedChangedDoc = structuredClone(evidence);
  omittedChangedDoc.changedSourcePaths = omittedChangedDoc.changedSourcePaths
    .filter((path) => path !== 'docs/current_work_package.md');
  assert.throws(
    () => validateWp160ReverseIndex({ repositoryRoot, evidence: omittedChangedDoc }),
    /machine-derived closure/u,
  );
  const rewritten = structuredClone(evidence);
  rewritten.boundaries.historicalEvidenceRewritten = true;
  assert.throws(() => validateWp160ReverseIndex({ repositoryRoot, evidence: rewritten }), /machine-derived closure/u);
});

test('derivation reports one immutable entry per historical evidence file', () => {
  const derived = deriveWp160ReverseIndex({
    repositoryRoot,
    baselineRevision: evidence.repository.baselineHead,
    targetRevision: evidence.repository.targetRevision,
  });
  assert.ok(derived.changedSourcePaths.includes('backend/test/postgres_foundation.integration.test.js'));
  assert.ok(derived.changedSourcePaths.includes('docs/current_work_package.md'));
  assert.equal(
    derived.immutableHistoricalBindings.some(({ evidence }) =>
      evidence.endsWith('wp160-special-category-health-data-intake-minimization-safety-20260915.json')),
    false,
  );
  assert.deepEqual(
    derived.immutableHistoricalBindings.map(({ evidence }) => evidence),
    [...new Set(derived.immutableHistoricalBindings.map(({ evidence }) => evidence))],
  );
  for (const entry of derived.immutableHistoricalBindings) assert.ok(entry.paths.length > 0);
});

test('pinned closure revision stays stable after an unrelated successor commit', () => {
  const repository = mkdtempSync(join(tmpdir(), 'sit-wp160-closure-'));
  const git = (args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  try {
    git(['init', '-q']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    git(['config', 'user.name', 'fixture']);
    writeFileSync(join(repository, 'baseline.txt'), 'baseline\n');
    git(['add', '.']);
    git(['commit', '-qm', 'baseline']);
    const baseline = git(['rev-parse', 'HEAD']);
    writeFileSync(join(repository, 'bound-test.md'), 'closure\n');
    git(['add', '.']);
    git(['commit', '-qm', 'wp160 closure']);
    const closure = git(['rev-parse', 'HEAD']);
    const pinned = deriveChangedSourcePaths({
      repositoryRoot: repository,
      baselineRevision: baseline,
      targetRevision: closure,
    });
    writeFileSync(join(repository, 'unrelated-successor.txt'), 'later\n');
    git(['add', '.']);
    git(['commit', '-qm', 'unrelated successor']);
    assert.deepEqual(
      deriveChangedSourcePaths({
        repositoryRoot: repository,
        baselineRevision: baseline,
        targetRevision: closure,
      }),
      pinned,
    );
    assert.deepEqual(pinned, ['bound-test.md']);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('the full WP160 gate stays bound to the closure commit after a successor', () => {
  const closureEvidence = structuredClone(
    JSON.parse(readFileSync(resolve(
      repositoryRoot,
      'docs/evidence/release-readiness/wp160-special-category-health-data-intake-minimization-safety-20260915.json',
    ), 'utf8')),
  );
  const closureCommit = closureEvidence.repository.targetRevision;
  closureEvidence.captureAttestation.mode = 'closure';
  const clone = mkdtempSync(join(tmpdir(), 'sit-wp160-successor-'));
  const git = (args) => execFileSync('git', ['-C', clone, ...args], { encoding: 'utf8' }).trim();
  try {
    execFileSync('git', ['clone', '--no-hardlinks', repositoryRoot, clone], { stdio: 'ignore' });
    const before = validateWp160SpecialCategoryHealthDataIntake({
      repositoryRoot: clone,
      evidence: closureEvidence,
    });
    writeFileSync(join(clone, 'unrelated-wp160-successor.txt'), 'successor\n');
    git(['add', 'unrelated-wp160-successor.txt']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    git(['config', 'user.name', 'fixture']);
    git(['commit', '-qm', 'unrelated successor']);
    const after = validateWp160SpecialCategoryHealthDataIntake({
      repositoryRoot: clone,
      evidence: closureEvidence,
    });
    assert.deepEqual(after, before);
    rmSync(resolve(clone, 'unrelated-wp160-successor.txt'));
    git(['add', '-u']);
    git(['commit', '-qm', 'remove successor fixture']);
    writeFileSync(resolve(clone, 'docs/current_work_package.md'), 'bound source mutation\n');
    git(['add', 'docs/current_work_package.md']);
    git(['commit', '-qm', 'mutate bound source']);
    const incorrectTarget = structuredClone(closureEvidence);
    incorrectTarget.repository.targetRevision = git(['rev-parse', 'HEAD']);
    assert.throws(
      () => validateWp160SpecialCategoryHealthDataIntake({
        repositoryRoot: clone,
        evidence: incorrectTarget,
      }),
      /expected exact closure/u,
    );
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
});
