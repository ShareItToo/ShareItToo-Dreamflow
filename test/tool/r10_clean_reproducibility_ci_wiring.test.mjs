import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/regression.yml', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function r10Job() {
  const start = workflow.indexOf('  r10-clean-reproducibility:\n');
  const end = workflow.indexOf('  flutter-regression:\n', start + 1);
  assert.ok(start >= 0, 'R10 CI job is missing');
  assert.ok(end > start, 'R10 CI job has no bounded end');
  return workflow.slice(start, end);
}

test('CI runs R10 from the exact PR head with the pinned toolchain', () => {
  const job = r10Job();
  assert.match(job, /runs-on: ubuntu-24\.04/u);
  assert.match(job, /fetch-depth: 0/u);
  assert.match(job, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u);
  assert.match(job, /java-version: '17'/u);
  assert.match(job, /node-version: '22'/u);
  assert.match(job, /flutter-version: 3\.41\.7/u);
  assert.match(job, /node tool\/run_r10_clean_reproducibility\.mjs/u);
  assert.match(job, /--source-branch "\$\{GITHUB_HEAD_REF:-\$GITHUB_REF_NAME\}"/u);
  assert.match(job, /node tool\/validate_r10_clean_reproducibility\.mjs[\s\\]+\n\s+--input/u);
  assert.match(job, /--execution-only/u);
});

test('R10 CI has no live action, private input or cache workaround', () => {
  const job = r10Job();
  assert.doesNotMatch(
    job,
    /services:|secrets\.|google-services|key\.properties|storepass|deploy|publish|upload|docker|sudo|apt(?:-get)?|sleep|retry|SIT_FLUTTER_TEST_CONCURRENCY/u,
  );
  assert.doesNotMatch(job, /setup-gradle|cache-dependency-path|pnpm install|flutter pub get/u);
});

test('the complete local gate retains the R10 CI wiring contract', () => {
  assert.match(
    regression,
    /node --test test\/tool\/r10_clean_reproducibility_ci_wiring\.test\.mjs/u,
  );
});
