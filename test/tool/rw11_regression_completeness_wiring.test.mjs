import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('supported regression executes the complete repository-owned tool-test inventory', () => {
  assert.match(
    regression,
    /^node --test test\/tool\/\*\.test\.mjs$/mu,
    'the supported regression must execute every current and future test/tool/*.test.mjs file',
  );
});
