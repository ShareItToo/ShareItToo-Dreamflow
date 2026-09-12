import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createTestTempTracker } from './test_temp_fixtures.mjs';

test('removes every tracked fixture deterministically', async () => {
  const tracker = createTestTempTracker({ registerAfter: false });
  const first = tracker.makeSync('sit-temp-tracker-first-');
  const second = tracker.makeSync('sit-temp-tracker-second-');
  writeFileSync(resolve(first, 'fixture.txt'), 'first');
  writeFileSync(resolve(second, 'fixture.txt'), 'second');

  await tracker.cleanup();

  assert.equal(existsSync(first), false);
  assert.equal(existsSync(second), false);
  await tracker.cleanup();
});

test('rejects prefixes and roots outside the bounded test namespace', () => {
  const tracker = createTestTempTracker({ registerAfter: false });
  assert.throws(() => tracker.makeSync('unsafe-'), /prefix is unsafe/);
  assert.throws(
    () => tracker.track(resolve(process.cwd(), 'sit-unsafe-fixture')),
    /direct sit-\* child/,
  );
});
