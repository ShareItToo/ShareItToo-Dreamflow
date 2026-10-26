import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/private_pilot_checkout_screen.dart', import.meta.url),
  'utf8',
);
const submit = source.match(
  /Future<void> _submitRequest\(\) async \{([\s\S]*?)\n  String _quoteLoadMessage/u,
)?.[1];

assert.ok(submit, 'expected checkout submission method');

test('checkout locks submission before account lookup and always unlocks', () => {
  const lock = submit.indexOf('setState(() => _submitting = true);');
  const accountLookup = submit.indexOf('await DataService.getCurrentUser();');
  const unlock = submit.lastIndexOf('if (mounted) setState(() => _submitting = false);');

  assert.ok(lock >= 0, 'submission must set its single-flight lock');
  assert.ok(accountLookup > lock, 'lock must precede the first async gap');
  assert.match(submit, /finally \{\s+if \(mounted\) setState\(\(\) => _submitting = false\);\s+\}/u);
  assert.ok(unlock > accountLookup, 'lock must be released after submission settles');
});
