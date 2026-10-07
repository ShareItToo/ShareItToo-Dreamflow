import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/owner_requests_screen.dart', import.meta.url),
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
const inlineAction = method('Widget? _buildInlineAction(', 'String _formatGermanDateTime');

test('owner decision actions recheck exact principal before results and refresh', () => {
  for (const body of [accept, decline]) {
    assert.match(body, /final owner = _decisionActions\.capture\(\)/u);
    assert.match(body, /_decisionService\.execute/u);
    assert.match(body, /_decisionActions\.isCurrent\(_decisionService, owner\)/u);
    assert.match(body, /await _load\(\)/u);
    assert.doesNotMatch(body, /maybePop\(|Future\.delayed/u);
  }
});

test('owner inline review stops after user lookup when its State is disposed', () => {
  assert.match(
    inlineAction,
    /final owner = await DataService\.getCurrentUser\(\);\s+if \(owner == null\) return;\s+if \(!mounted\) return;\s+final ok = await ReviewPromptSheet\.show\(\s+context,/u,
  );
});

test('owner-request lifecycle fix contains no lint accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*use_build_context_synchronously/u);
});
