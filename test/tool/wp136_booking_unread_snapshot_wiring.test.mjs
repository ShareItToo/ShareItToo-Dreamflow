import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('lib/services/data_service.dart', 'utf8');

function unreadCategoryMethod() {
  const start = source.indexOf(
    'static Future<int> getUnreadCountForCategory({',
  );
  const end = source.indexOf(
    'static Future<RentalRequest?> getRentalRequestById(',
    start,
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test('unread category count consumes its authoritative snapshot without N+1 reloads', () => {
  const method = unreadCategoryMethod();
  assert.match(method, /_requireCurrentOperationalUser\(/u);
  assert.match(method, /_isRequestParticipant\(req, current\.id\)/u);
  assert.match(method, /_decodeReadRequestsStrict\(raw\)/u);
  assert.match(method, /_assertCurrentOperationalUserId\(/u);
  assert.doesNotMatch(method, /isRequestRead\(/u);
  assert.doesNotMatch(method, /_requireCurrentRequestParticipant\(/u);
  assert.doesNotMatch(method, /_getAllRentalRequests\(/u);
});
