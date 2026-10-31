import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/request_detail_screen.dart', import.meta.url),
  'utf8',
);
const method = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} method bounds`);
  return source.slice(from, to);
};
const accept = method('Future<void> _acceptRequest(', 'Future<void> _declineRequest(');
const decline = method('Future<void> _declineRequest(', 'Future<void> _showDecisionFailure(');

test('owner acceptance binds epoch before dialog, remote call and navigation', () => {
  assert.match(accept, /final owner = _decisionActions\.capture\(\);[\s\S]*?await _decisionActions[\s\S]*?showOwnedDialog/u);
  assert.match(accept, /_decisionActions\.isCurrent\(_decisionService, owner\)[\s\S]*?_decisionService\.execute/u);
  assert.match(accept, /_decisionService\.execute[\s\S]*?_decisionActions\.isCurrent\(_decisionService, owner\)/u);
  assert.match(accept, /_decisionActions\.completeOwnedScreenRoute\(owner, true\)/u);
});

test('owner decline owns the exact dialog and exact screen route', () => {
  assert.match(decline, /final owner = _decisionActions\.capture\(\)/u);
  assert.match(decline, /_decisionActions\.showOwnedPopup<bool>/u);
  assert.match(decline, /confirmed != true[\s\S]*?_decisionActions\.isCurrent/u);
  assert.match(decline, /_decisionService\.execute\([\s\S]*?status: 'declined'/u);
  assert.match(decline, /_decisionActions\.completeOwnedScreenRoute\(owner, true\)/u);
  assert.doesNotMatch(decline, /maybePop\(|Navigator\.of\([^)]*\)\.pop/u);
});

test('request-detail lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(accept, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(decline, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(`${accept}\n${decline}`, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
