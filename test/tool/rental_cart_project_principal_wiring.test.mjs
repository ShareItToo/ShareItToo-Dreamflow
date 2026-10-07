import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const section = (source, start, end) => {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin);
  return source.slice(begin, finish);
};

test('project draft captures immutable snapshot owner before any await', () => {
  const source = read('lib/screens/wishlists_screen.dart');
  const body = section(source, 'Future<void> _addProject()', 'Future<void> _recheckCart()');
  assert.ok(body.indexOf('final owner = _snapshotOwner') < body.indexOf('await '));
  assert.match(body, /expectedOwner: owner/u);
  assert.match(body, /routeHandle: draft/u);
  assert.match(body, /onComplete: draft\.dismiss/u);
  assert.match(body, /routeHandle: notice/u);
  assert.doesNotMatch(body, /Navigator\.of|popUntil|maybePop/u);
  assert.match(source, /_projectDraft\?\.dismiss\(\)/u);
  assert.match(source, /_projectNotice\?\.dismiss\(\)/u);
  assert.match(source, /accountSecurityStateKey/u);
});

test('local project action uses principal plus exact auth epoch and definite guest absence', () => {
  const body = section(read('lib/services/local_principal_scope.dart'), 'class LocalPrincipalActionOwner', '\n}\n');
  assert.ok(body.indexOf('final epoch = AuthService.sessionEpoch') < body.indexOf('await '));
  assert.match(body, /isStoredSessionDefinitelyAbsent\(\)/u);
  assert.match(body, /isSessionOwnerDefinitelyCurrent\(session\)/u);
  assert.match(body, /current && isCurrentEpoch/u);
  assert.doesNotMatch(body, /accessToken|refreshToken/u);
});

test('project creation and guest sync keep the same owner through every upsert', () => {
  const source = read('lib/services/data_service.dart');
  const body = section(source, 'static Future<RentalCartProject> addRentalCartProject', 'static Future<RentalCart> removeRentalCartProject');
  assert.match(body, /LocalPrincipalActionOwner\? expectedOwner/u);
  assert.match(body, /syncGuestRentalCartAfterAuthentication\(expectedOwner: owner\)/u);
  assert.match(body, /putRentalCartProjectForOwner\([\s\S]*?owner: owner\.sessionOwner!/u);
  assert.match(body, /await owner\.assertCurrent\(\);[\s\S]*?await _writeLocalRentalCart/u);
  assert.doesNotMatch(body, /_syncCompatibleGuestCartForCurrentSession|_hasBackendSession/u);
  const sync = section(source, 'static Future<bool> _syncGuestRentalCartAfterAuthenticationUnlocked', 'static Future<RentalCart> getRentalCart');
  assert.match(sync, /putRentalCartProjectForOwner/u);
  assert.match(sync, /putRentalCartItemForOwner/u);
  assert.doesNotMatch(sync, /BackendRepository\.putRentalCart(?:Project|Item)\(/u);
});

for (const [method, next] of [['putRentalCartProjectForOwner', 'putRentalCartItemForOwner'], ['putRentalCartItemForOwner', 'putRentalCartItem']]) {
  test(`${method} requires exact owner without global credential fallback`, () => {
    const body = section(read('lib/services/backend_repository.dart'), `${method}({`, `${next}({`);
    assert.match(body, /required AuthSessionOwner owner/u);
    assert.match(body, /_authorizedForOwner\([\s\S]*?owner: owner/u);
    assert.doesNotMatch(body, /await _authorized\(/u);
  });
}

test('enabled HTTP ownership profile remains mandatory in full regression', () => {
  assert.match(read('scripts/technical_regression_check.sh'), /--dart-define=SIT_BACKEND_ENABLED=true \\\n\s*--dart-define=SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1 \\\n\s*test\/rental_cart_project_backend_owner_test\.dart/u);
  const tests = read('test/rental_cart_project_principal_test.dart');
  for (const text of ['stable A project creation', 'without closing B dialog', 'under B', 'silent B replacement', 'confirmed guest', 'actual logout', 'malformed stored session']) {
    assert.ok(tests.includes(text), text);
  }
});
