import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../lib/widgets/return_handover_stepper_sheet.dart', import.meta.url),
  'utf8',
);

test('damage remains return-flow-only and no-damage keeps the existing path', () => {
  assert.match(source, /if \(isReturn\) base\.add\(_StepKind\.damage\)/u);
  assert.match(source, /if \(!_hasDamage \|\| _damageReceipt != null\) return true/u);
  assert.match(source, /if \(!_hasDamage \|\| _damageReceipt != null\) return true/u);
});

test('damage requires truthful description, photo and authorized contested amount', () => {
  assert.match(source, /_damageNotesCtrl\.text\.trim\(\)\.length >= 10/u);
  assert.match(source, /_damagePhotos\.isNotEmpty/u);
  assert.match(source, /_parseDamageAmountMinor\(\) != null/u);
  assert.match(source, /keine Zusatzbelastung/u);
});

test('damage uploads protected evidence and opens the existing return case path', () => {
  assert.match(source, /_safetyService\.uploadEvidence\(/u);
  assert.match(source, /_safetyService\.submitReturnCaseIssue\(/u);
  assert.match(source, /reasonCode: 'damage'/u);
  assert.match(source, /opensReview: true/u);
  assert.match(source, /evidenceUploadIds:/u);
});

test('damage retries retain upload ids and one opaque action idempotency key', () => {
  assert.match(source, /List<String\?> _damageEvidenceUploadIds/u);
  assert.match(source, /if \(_damageEvidenceUploadIds\[index\] != null\) continue/u);
  assert.match(source, /String _damageIdempotencyKey = ''/u);
  assert.match(source, /crypto\.sha256\.convert\(utf8\.encode\(seed\)\)/u);
  assert.match(source, /idempotencyKey: _damageIdempotencyKey/u);
});

test('code/completion cannot advance until the server receipt is recorded', () => {
  assert.match(source, /if \(_steps\[_step\] == _StepKind\.damage && _hasDamage\)/u);
  assert.match(source, /final saved = await _saveDamageCaseStep\(\)/u);
  assert.match(source, /if \(!saved\) return;/u);
  assert.match(source, /if \(!result\.reportRecorded\) return false/u);
  assert.match(source, /setState\(\(\) => _damageReceipt =/u);
});

test('damage action is bound to the captured principal and route state', () => {
  assert.match(source, /final owner = _safetyActions\.capture\(\)/u);
  assert.match(source, /_safetyActions\.isCurrent\(_safetyService, owner\)/u);
  assert.match(source, /_safetyActions\.isSynchronouslyCurrent\(owner\)/u);
  assert.match(source, /_safetyActions\.invalidate\(\)/u);
});

test('closing a nonempty damage draft requires explicit abandonment', () => {
  assert.match(source, /_hasAbandonableDamageDraft/u);
  assert.match(source, /Schadenentwurf verwerfen\?/u);
  assert.match(source, /Weiter bearbeiten/u);
  assert.match(source, /Verwerfen/u);
});
