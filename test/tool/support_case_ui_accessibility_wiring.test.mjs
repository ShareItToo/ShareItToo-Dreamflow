import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const supportCases = readFileSync('lib/screens/support_cases_screen.dart', 'utf8');
const supportTests = readFileSync('test/support_cases_screen_test.dart', 'utf8');
const messages = readFileSync('lib/screens/messages_screen.dart', 'utf8');

test('SUP-143 through SUP-145 keep user copy, due action and final decision explicit', () => {
  assert.match(supportCases, /'waiting_for_user': 'Antwort von dir nötig'/u);
  assert.match(supportCases, /title: 'Deine Antwort ist nötig'/u);
  assert.match(supportCases, /text: 'Antwort bis: \$\{supportCase\.userActionDueDisplay\}'/u);
  for (const label of [
    'Entscheidung',
    'Auswirkung',
    'Begründung',
    'Umsetzung',
    'Überprüfung',
  ]) {
    assert.match(supportCases, new RegExp(`label: '${label}'`, 'u'));
  }
  assert.match(supportTests, /internal_code_must_not_render/u);
  assert.match(supportTests, /find\.text\('waiting_for_user'\), findsNothing/u);
});

test('SUP-146 through SUP-150 bind semantics, large text, keyboard order and touch size', () => {
  assert.match(supportCases, /policy: WidgetOrderTraversalPolicy\(\)/u);
  assert.match(supportCases, /label: 'Status: \$\{supportCase\.statusLabel\}'/u);
  assert.match(supportCases, /header: true/u);
  assert.match(supportCases, /hint: 'Öffnet die Falldetails'/u);
  assert.match(supportTests, /textScaler: const TextScaler\.linear\(2\)/u);
  assert.match(supportTests, /greaterThanOrEqualTo\(48\)/u);
  assert.match(supportTests, /LogicalKeyboardKey\.tab/u);
  assert.match(supportTests, /LogicalKeyboardKey\.enter/u);
});

test('SUP-151 and SUP-152 retain appeal visibility and hide an empty blocked tab', () => {
  assert.match(supportTests, /closed reporter can submit one bounded appeal/u);
  assert.match(supportCases, /title: 'Überprüfung beantragen'/u);
  assert.match(
    messages,
    /_filter == _MessagesFilter\.blocked && blockedUserIds\.isEmpty[\s\S]*return _MessagesFilter\.active/u,
  );
  assert.match(
    messages,
    /if \(showBlocked\) \.\.\.\[[\s\S]*?_FilterPill\([\s\S]*?label: 'Blockiert'/u,
  );
  assert.match(messages, /showBlocked: _blockedUserIds\.isNotEmpty/u);
});
