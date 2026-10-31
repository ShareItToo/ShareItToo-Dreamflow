import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const section = (source, start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
};

test('assignment captures snapshot owner and reserves its exact sheet before await', () => {
  const source = read('lib/screens/wishlists_screen.dart');
  const body = section(source, 'Future<void> _assignCartItem', 'Future<void> _openCartItem');
  for (const marker of ['final owner = _snapshotOwner', 'final generation = _principalGeneration', '_assignmentSheet = sheet']) {
    assert.ok(body.indexOf(marker) >= 0 && body.indexOf(marker) < body.indexOf('await '));
  }
  assert.match(body, /showTrackedModalBottomSheet<String>/u);
  assert.match(body, /handle: sheet/u);
  assert.match(body, /sheet\.dismiss\(unassigned\)/u);
  assert.match(body, /sheet\.dismiss\(project\.id\)/u);
  assert.match(body, /expectedOwner: owner/u);
  assert.match(body, /identical\(_assignmentSheet, sheet\)/u);
  assert.doesNotMatch(body, /Navigator\.of|popUntil|maybePop|showModalBottomSheet</u);
  assert.ok((body.match(/await owner\.isCurrent\(\)/gu) ?? []).length >= 4);
});

test('assignment notices are independently owned and cannot erase a newer owner route', () => {
  const source = read('lib/screens/wishlists_screen.dart');
  assert.match(source, /Set<TrackedDialogRouteHandle<void>> _assignmentNotices/u);
  assert.match(source, /_assignmentNotices\.add\(notice\)/u);
  assert.match(source, /_assignmentNotices\.remove\(notice\)/u);
  assert.match(source, /final assignment = _assignmentSheet;\s*_assignmentSheet = null;\s*assignment\?\.dismiss\(\)/u);
  const body = section(source, 'Future<void> _assignCartItem', 'Future<void> _openCartItem');
  assert.match(body, /routeHandle: notice/u);
  assert.match(body, /Projektzuordnung konnte nicht bestätigt werden/u);
  assert.doesNotMatch(body, /konnte nicht gespeichert werden/u);
});

test('cart read and assignment keep one owner through guest sync and HTTP dispatch', () => {
  const source = read('lib/services/data_service.dart');
  const readCart = section(source, 'static Future<RentalCart> getRentalCart', 'static Future<RentalCart> addRentalCartItem');
  assert.match(readCart, /LocalPrincipalActionOwner\? expectedOwner/u);
  assert.match(readCart, /syncGuestRentalCartAfterAuthentication\(expectedOwner: owner\)/u);
  assert.match(readCart, /getRentalCartForOwner\(session\)/u);
  assert.doesNotMatch(readCart, /BackendRepository\.getRentalCart\(\)/u);
  const assignment = section(source, 'static Future<RentalCart> assignRentalCartItemToProject', 'static Future<RentalCartProject> addRentalCartProject');
  assert.match(assignment, /getRentalCart\(expectedOwner: owner\)/u);
  assert.match(assignment, /putRentalCartItemForOwner\([\s\S]*?owner: owner\.sessionOwner!/u);
  assert.doesNotMatch(assignment, /BackendRepository\.putRentalCartItem\(/u);
  assert.match(assignment, /await _writeLocalRentalCart\(principal, next\);\s*await owner\.assertCurrent\(\)/u);
  assert.match(read('lib/screens/wishlists_screen.dart'), /DataService\.getRentalCart\(expectedOwner: owner\)/u);
});

test('owner-bound cart read never invokes global credential fallback', () => {
  const body = section(read('lib/services/backend_repository.dart'), 'getRentalCartForOwner(', 'putRentalCartProject({');
  assert.match(body, /AuthSessionOwner owner/u);
  assert.match(body, /_authorizedForOwner\(/u);
  assert.doesNotMatch(body, /await _authorized\(/u);
});

test('both assignment profiles and virtual timer isolation remain regression requirements', () => {
  assert.match(read('scripts/technical_regression_check.sh'), /--dart-define=SIT_BACKEND_ENABLED=true \\\n\s*--dart-define=SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1 \\\n\s*test\/rental_cart_assignment_principal_test\.dart/u);
  const tests = read('test/rental_cart_assignment_principal_test.dart');
  for (const marker of ['switchDuringRead', 'silent B switch', 'late A assignment', 'confirmed guest', 'actual logout and relogin', 'newer B assignment handle', 'malformed auth', 'read-401', 'write-401', 'write-success']) assert.ok(tests.includes(marker));
  assert.match(tests, /tester\.pump\(const Duration\(seconds: 2\)\)/u);
  assert.match(read('lib/widgets/app_popup.dart'), /Duration duration = const Duration\(seconds: 2\)/u);
});
