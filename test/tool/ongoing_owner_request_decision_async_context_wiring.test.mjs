import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
  'utf8',
);
const requestActionsStart = source.indexOf(
  "        if (category == 'requests') ...[",
);
const requestActionsEnd = source.indexOf(
  '        if (!req.simulationOnly &&',
  requestActionsStart,
);

assert.notEqual(requestActionsStart, -1, 'expected owner request actions start');
assert.notEqual(requestActionsEnd, -1, 'expected owner request actions end');
const requestActions = source.slice(requestActionsStart, requestActionsEnd);

test('decline result UI requires the exact body context after refresh', () => {
  assert.match(
    requestActions,
    /status: 'declined',[\s\S]*?await _load\(\);\s+if \(!context\.mounted\) return;\s+\/\/ Auto-close after 3 seconds/u,
  );
  assert.match(
    requestActions,
    /Future\.delayed\(const Duration\(seconds: 3\), \(\) \{\s+if \(context\.mounted\) \{\s+Navigator\.of\(\s+context,[\s\S]*?AppPopup\.show\(\s+context,\s+icon: Icons\.cancel_outlined/u,
  );
});

test('accept result UI requires the exact body context after refresh', () => {
  assert.match(
    requestActions,
    /type: 'accepted',[\s\S]*?await _load\(\);\s+if \(!context\.mounted\) return;\s+\/\/ Auto-close after 3 seconds/u,
  );
  assert.match(
    requestActions,
    /Future\.delayed\(const Duration\(seconds: 3\), \(\) \{\s+if \(context\.mounted\) \{\s+Navigator\.of\(context, rootNavigator: true\)[\s\S]*?AppPopup\.show\(\s+context,\s+icon: Icons\.check_circle_outline/u,
  );
});

test('request decision fix keeps the existing product timers exact', () => {
  const timers = requestActions.match(
    /Future\.delayed\(const Duration\(seconds: 3\)/gu,
  ) ?? [];
  assert.equal(timers.length, 2);
  assert.doesNotMatch(
    requestActions,
    /ignore:\s*use_build_context_synchronously/u,
  );
});
