import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('PG-only login probe stays outside automatic test discovery and remains integration-bound', () => {
  const probe = new URL('../test_support/google_post_enrollment_login_probe.mjs', import.meta.url);
  assert.equal(existsSync(probe), true);
  assert.equal(existsSync(new URL('./fixtures/google_post_enrollment_login_probe.mjs', import.meta.url)), false);
  assert.ok(!probe.pathname.includes('/test/'));
  const integration = readFileSync(new URL('./staging_google_registration.integration.test.js', import.meta.url), 'utf8');
  assert.ok(integration.includes("new URL('../test_support/google_post_enrollment_login_probe.mjs', import.meta.url)"));
  assert.match(integration, /SIT_TEST_POST_ENROLLMENT_IDENTITY: JSON\.stringify\(\{ identity, userId \}\)/u);
  const source = readFileSync(probe, 'utf8');
  assert.match(source, /JSON\.parse\(process\.env\.SIT_TEST_POST_ENROLLMENT_IDENTITY\)/u);
  assert.match(source, /assert\.equal\(existing\.status, 200\)/u);
  assert.match(source, /assert\.equal\(unknown\.status, 403\)/u);
  assert.match(source, /assert\.deepEqual\(after\.rows, before\.rows\)/u);
});
