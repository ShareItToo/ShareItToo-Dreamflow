import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);
const start = source.indexOf('  Future<void> _acceptPendingRequest(');
const end = source.indexOf('  @override\n  Widget build(', start);
assert.ok(start >= 0 && end > start, 'expected owner decision method range');
const requestActions = source.slice(start, end);

test('accept captures the exact principal before the first await', () => {
  assert.match(
    requestActions,
    /_acceptPendingRequest\(RentalRequest request\) async \{\s+final owner = _decisionActions\.capture\(\);\s+if \(owner == null\) return;\s+try \{\s+final declarations =\s+await/u,
  );
  assert.match(
    requestActions,
    /showOwnedDialog<List<Map<String, dynamic>>>\([\s\S]*?buildPrivatePilotOwnerAcceptanceDialog\([\s\S]*?dismiss: dismiss/u,
  );
  assert.match(
    requestActions,
    /_decisionActions\.isCurrent\(_decisionService, owner\)[\s\S]*?_decisionService\.execute\([\s\S]*?status: 'accepted',[\s\S]*?legalDeclarations: declarations[\s\S]*?_decisionActions\.isCurrent\(_decisionService, owner\)/u,
  );
});

test('decline captures and rechecks the exact principal around its decision', () => {
  assert.match(
    requestActions,
    /_declinePendingRequest\(RentalRequest request\) async \{\s+final owner = _decisionActions\.capture\(\);\s+if \(owner == null\) return;\s+final confirmed = await _decisionActions\.showOwnedPopup<bool>/u,
  );
  assert.match(
    requestActions,
    /confirmed != true \|\|[\s\S]*?_decisionActions\.isCurrent\(_decisionService, owner\)[\s\S]*?_decisionService\.execute\([\s\S]*?status: 'declined',[\s\S]*?_decisionActions\.isCurrent\(_decisionService, owner\)/u,
  );
});

test('typed results retain exact route ownership without timing closure', () => {
  assert.match(requestActions, /on RentalRequestDecisionFailure catch \(failure\)/u);
  assert.match(
    requestActions,
    /replaceOwnedScreenRoute\(\s*owner,\s*MaterialPageRoute<void>\(/u,
  );
  assert.match(requestActions, /showOwnedPopup<bool>/u);
  assert.doesNotMatch(requestActions, /Future\.delayed/u);
  assert.doesNotMatch(requestActions, /Navigator\.of\(/u);
  assert.doesNotMatch(requestActions, /AppPopup\.show\(/u);
  assert.doesNotMatch(requestActions, /DataService\.updateRentalRequestStatus\(/u);
});
