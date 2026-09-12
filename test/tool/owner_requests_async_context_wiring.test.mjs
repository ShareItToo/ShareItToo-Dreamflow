import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/owner_requests_screen.dart', import.meta.url),
  'utf8',
);
const inlineAction = source.match(
  /Widget\? _buildInlineAction[\s\S]*?\n  String _formatGermanDateTime/u,
)?.[0];

assert.ok(inlineAction, 'expected owner request inline actions');

test('owner decline rechecks lifecycle after both mutation and refresh', () => {
  assert.match(
    inlineAction,
    /await DataService\.updateRentalRequestStatus\([\s\S]*?status: 'declined'\);\s+if \(!mounted\) return;\s+await _load\(\);\s+if \(!mounted\) return;[\s\S]*?AppPopup\.show\(\s+context,/u,
  );
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
