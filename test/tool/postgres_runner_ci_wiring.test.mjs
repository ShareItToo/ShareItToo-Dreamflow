import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/regression.yml', import.meta.url),
  'utf8',
);
const runner = readFileSync(
  new URL('../../tool/run_local_postgres_integration.mjs', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function job(name, nextName) {
  const start = workflow.indexOf(`  ${name}:\n`);
  const end = workflow.indexOf(`  ${nextName}:\n`, start + 1);
  assert.ok(start >= 0, `${name} job is missing`);
  assert.ok(end > start, `${name} job has no bounded end`);
  return workflow.slice(start, end);
}

test('CI executes the repository-owned runner on a PostgreSQL-16 host', () => {
  const proof = job('postgres-runner-proof', 'flutter-regression');
  assert.match(proof, /runs-on: ubuntu-24\.04/u);
  assert.match(proof, /node-version: '22'/u);
  assert.match(proof, /pnpm install --frozen-lockfile/u);
  assert.match(
    proof,
    /name: Run repository-owned PostgreSQL 16 fresh-cluster proof\n\s+run: pnpm run test:postgres:local/u,
  );
  assert.equal(
    proof.match(/pnpm run test:postgres:local/gu)?.length,
    1,
  );
  assert.match(
    proof,
    /name: Run repository-owned PostgreSQL 16 R9 recovery proof\n\s+run: node \.\.\/tool\/run_r9_database_recovery\.mjs/u,
  );
  assert.equal(
    proof.match(/node \.\.\/tool\/run_r9_database_recovery\.mjs/gu)?.length,
    1,
  );
});

test('fresh-cluster CI supplies no database or lifecycle workaround', () => {
  const proof = job('postgres-runner-proof', 'flutter-regression');
  assert.doesNotMatch(
    proof,
    /services:|DATABASE_URL|TEST_DATABASE_URL|SIT_POSTGRES_BIN_DIR|initdb|pg_ctl|pg_isready|createdb|sudo|apt(?:-get)?|docker|sleep|retry|--port|5432/u,
  );
  assert.match(runner, /requiredPostgresMajor = 16/u);
  assert.match(runner, /'\/usr\/lib\/postgresql\/16\/bin'/u);
  assert.match(runner, /findAvailableLoopbackPort\(\)/u);
  assert.match(runner, /-c unix_socket_directories=/u);
  assert.match(runner, /await cleanupRunRoot\(runRoot, resolvedTemporaryBase\)/u);
  assert.match(
    proof,
    /Run repository-owned PostgreSQL 16 R9 recovery proof/u,
  );
});

test('publication and the complete local gate retain the runner proof', () => {
  const publish = workflow.slice(workflow.indexOf('  publish-api-image:\n'));
  assert.match(
    publish,
    /needs:\n\s+- backend-regression\n\s+- postgres-runner-proof\n\s+- r10-clean-reproducibility\n\s+- flutter-regression/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/postgres_runner_ci_wiring\.test\.mjs/u,
  );
});
