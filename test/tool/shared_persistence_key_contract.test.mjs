import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const contract = read('lib/services/shared_persistence_keys.dart');

test('every declared shared key belongs to the one platform-independent allowlist', () => {
  const constants = [...contract.matchAll(/static const (\w+Key) = '([^']+)';/gu)];
  const inventory = contract.match(/sharedKeys = <String>\{([^}]+)\}/u)?.[1];
  assert.ok(inventory);
  const entries = inventory.split(',').map((entry) => entry.trim()).filter(Boolean);
  assert.deepEqual(entries.sort(), constants.map((entry) => entry[1]).sort());
  assert.equal(new Set(constants.map((entry) => entry[2])).size, constants.length);
  assert.doesNotMatch(contract, /^import /mu);
});

test('shared API and Web adapter consume one contract without circular imports', () => {
  for (const path of ['lib/services/shared_persistence_sync.dart', 'lib/services/shared_persistence_sync_web.dart']) {
    const source = read(path);
    assert.match(source, /import 'shared_persistence_keys\.dart'/u);
    assert.match(source, /SharedPersistenceKeys\.sharedKeys/u);
    assert.match(source, /SharedPersistenceKeys\.canonicalKey/u);
  }
  assert.doesNotMatch(read('lib/services/shared_persistence_sync_web.dart'), /import 'shared_persistence_sync\.dart'/u);
  assert.match(contract, /legacyWishlistStateKey => wishlistStateKey/u);
  assert.match(contract, /legacyRentalCartKey => rentalCartKey/u);
});

test('Web-only avatar regression is executed in Chrome, not silently VM-skipped', () => {
  const commands = read('scripts/technical_regression_check.sh')
    .replace(/\\\r?\n[ \t]*/gu, ' ').split(/\r?\n/u);
  const command = commands.filter((line) => /^flutter test\b/u.test(line)
    && line.includes('test/web_avatar_persistence_test.dart'));
  assert.equal(command.length, 1);
  assert.match(command[0], /--platform chrome/u);
  assert.match(command[0], /--dart-define=SIT_BACKEND_ENABLED=true/u);
  assert.match(command[0], /--dart-define=SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1/u);
});
