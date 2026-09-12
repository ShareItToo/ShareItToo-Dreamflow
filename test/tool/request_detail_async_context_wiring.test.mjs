import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/request_detail_screen.dart', import.meta.url),
  'utf8',
);
const actionBlock = source.match(
  /onAccept:[\s\S]*?const SizedBox\(height: 12\),\s+_RenterCard/u,
)?.[0];

assert.ok(actionBlock, 'expected request-detail acceptance and decline actions');

test('owner acceptance rechecks exact context before and after its commit', () => {
  assert.match(
    actionBlock,
    /if \(declarations == null\) return;\s+if \(!context\.mounted\) return;\s+final accepted =[\s\S]*?await commitPrivatePilotOwnerAcceptance\(\s+context,[\s\S]*?if \(!accepted\) return;\s+if \(!context\.mounted\) return;\s+Navigator\.of\(context\)\.pop\(true\);/u,
  );
});

test('owner decline cannot navigate after its screen context is disposed', () => {
  assert.match(
    actionBlock,
    /await DataService\.updateRentalRequestStatus\([\s\S]*?status: 'declined'\);\s+if \(!context\.mounted\) return;\s+Navigator\.of\(context\)\.pop\(true\);/u,
  );
});

test('request-detail lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(actionBlock, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(actionBlock, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});
