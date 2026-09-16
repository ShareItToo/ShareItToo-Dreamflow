import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(
  new URL('../../scripts/test_flutter_parallel_stability.sh', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL('../../.github/workflows/regression.yml', import.meta.url),
  'utf8',
);

test('parallel stability proof repeats the complete suite without timing accommodations', () => {
  assert.match(script, /^STRESS_RUNS=5$/mu);
  assert.match(script, /git status --porcelain/u);
  assert.match(script, /for stress_run in \$\(seq 1 "\$STRESS_RUNS"\)/u);
  assert.match(script, /flutter test --reporter expanded/u);
  assert.match(script, /"parallelism":"flutter-default"/u);
  assert.doesNotMatch(script, /--concurrency|sleep|retry/u);
});

test('parallel stability proof rejects diagnostic concurrency overrides', () => {
  assert.match(script, /SIT_FLUTTER_TEST_CONCURRENCY:-/u);
  assert.match(script, /stability proof must use Flutter's standard parallelism/u);
});

test('CI exposes the stress proof only through an explicit cost-bounded manual input', () => {
  assert.match(
    workflow,
    /run_flutter_parallel_stress:[\s\S]+?default: false[\s\S]+?type: boolean/u,
  );
  assert.match(
    workflow,
    /name: Run explicit Flutter parallel stability proof[\s\S]+?if: github\.event_name == 'workflow_dispatch' && inputs\.run_flutter_parallel_stress[\s\S]+?bash scripts\/test_flutter_parallel_stability\.sh/u,
  );
});
