import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/message_thread_screen.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('analyzer-confirmed dead message-thread helpers stay absent', () => {
  for (const name of [
    '_ensureTranslationEnabledFromChat',
    '_pickTranslationLanguageFromChat',
    '_roleLabel',
    '_savedLocationText',
    '_deriveResponseTimeLabel',
    '_formatDate',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(source, /ignore:\s*unused_element/u);
});

test('active translation and location controls remain wired', () => {
  assert.match(source, /Future<void> _updateTranslationSettings\(/u);
  assert.match(source, /Future<void> _showTranslationMenu\(/u);
  assert.match(source, /TranslationLanguageDialog\(/u);
  assert.match(source, /_messageSettings\.copyWith\(\s*autoTranslateChat:/u);
  assert.match(source, /_LocationIntent _locationIntentForCurrentContext\(\)/u);
  assert.match(source, /if \(req == null \|\| req\.needsReview\)/u);
  assert.match(source, /bool _hasSavedLocation\(bool isReturn\)/u);
  assert.match(source, /bool _savedLocationMatches\(/u);
});

test('active time coordination and support routes remain wired', () => {
  assert.match(source, /Future<void> _handleTimeProposal\(/u);
  assert.match(source, /Future<String\?> _showTimeRequestActionDialog\(/u);
  assert.match(source, /case _ChatState\.support:/u);
  assert.match(source, /Future<void> _contactSupport\(/u);
});

test('message-thread dead-helper ratchet is permanently registered', () => {
  assert.match(
    regression,
    /node --test test\/tool\/message_thread_dead_helper_ratchet_wiring\.test\.mjs/u,
  );
});
