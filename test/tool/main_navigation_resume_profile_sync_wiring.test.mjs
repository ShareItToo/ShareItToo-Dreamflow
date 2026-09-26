import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/navigation/main_navigation.dart', import.meta.url),
  'utf8',
);

test('native resume refresh stays on the profile channel', () => {
  const method = /Future<void> _refreshUserAfterResume\(\) async \{([\s\S]*?)\n  \}/u
    .exec(source)?.[1];
  assert.ok(method, 'resume refresh method is present');
  assert.match(
    method,
    /syncCurrentUserForSessionOwner\(\s*owner,\s*notificationKey:\s*SharedPersistenceSync\.profileStateKey/u,
  );
  assert.doesNotMatch(method, /accountSecurityStateKey/u);
});
