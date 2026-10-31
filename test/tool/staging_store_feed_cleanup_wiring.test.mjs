import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8');

test('technical regression covers reversible Staging feed cleanup and screenshot evidence', () => {
  for (const command of [
    'node --check tool/clean_staging_store_feed.mjs',
    'node --test test/tool/clean_staging_store_feed.test.mjs',
    'node --check tool/validate_google_play_screenshot_readiness.mjs',
    'node --test test/tool/validate_google_play_screenshot_readiness.test.mjs',
    'node --check tool/validate_google_play_screenshot_candidate.mjs',
    'node --test test/tool/validate_google_play_screenshot_candidate.test.mjs',
  ]) {
    assert.ok(script.includes(command), `technical regression is missing: ${command}`);
  }
});
