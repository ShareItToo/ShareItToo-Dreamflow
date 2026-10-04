import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('legacy password route delegates to the canonical backend security flow', () => {
  const source = read('lib/screens/change_password_screen.dart');
  assert.match(source, /import 'security_screen\.dart';/u);
  assert.match(source, /const SecurityScreen\(\)/u);
  assert.doesNotMatch(source, /Future<void>\.delayed/u);
  assert.doesNotMatch(source, /AppPopup\.success/u);
});

test('legacy email route delegates to persisted contact verification', () => {
  const source = read('lib/screens/change_email_screen.dart');
  assert.match(source, /import 'contact_data_screen\.dart';/u);
  assert.match(source, /const ContactDataScreen\(\)/u);
  assert.doesNotMatch(source, /FilledButton\(onPressed:\s*null/u);
});
