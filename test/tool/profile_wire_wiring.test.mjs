import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('profile wire repository path stays in the backend-enabled regression', () => {
  const commands = regression
    .replace(/\\\r?\n[ \t]*/gu, ' ')
    .split(/\r?\n/u)
    .filter(
      (line) =>
        /^flutter test\b/u.test(line) &&
        line.includes('test/profile_wire_test.dart'),
    );
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].trim().split(/\s+/u), [
    'flutter',
    'test',
    '--reporter',
    'expanded',
    '--dart-define=SIT_BACKEND_ENABLED=true',
    '--dart-define=SIT_API_BASE_URL=http://127.0.0.1:1/api/v1',
    'test/profile_wire_test.dart',
  ]);
});
