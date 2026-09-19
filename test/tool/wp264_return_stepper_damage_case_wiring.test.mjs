import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../lib/widgets/return_handover_stepper_sheet.dart', import.meta.url),
  'utf8',
);
const serviceSource = readFileSync(
  new URL('../../lib/services/safety_action_service.dart', import.meta.url),
  'utf8',
);
const submitReturnCaseSource = serviceSource.slice(
  serviceSource.indexOf('Future<SafetyReturnCaseIssueResult> submitReturnCaseIssue'),
  serviceSource.indexOf('Future<String?> uploadEvidence'),
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
  assert.match(source, /final random = Random\.secure\(\)/u);
  assert.match(source, /List<int>\.generate\(16/u);
  assert.match(source, /base64UrlEncode\(entropy\)/u);
  assert.doesNotMatch(source, /widget\.request\.id.*microsecondsSinceEpoch/u);
  assert.match(source, /idempotencyKey: _damageIdempotencyKey/u);
});

test('code/completion cannot advance until the server receipt is recorded', () => {
  assert.match(source, /if \(_steps\[_step\] == _StepKind\.damage && _hasDamage\)/u);
  assert.match(source, /final saved = await _saveDamageCaseStep\(\)/u);
  assert.match(source, /if \(!saved\) return;/u);
  assert.match(source, /if \(!result\.reportRecorded\) return false/u);
  assert.match(source, /_damageReceipt = result\.receipt \?\?/u);
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

test('all exits and toggle-off are guarded, and recorded cases lock the draft', () => {
  assert.match(source, /PopScope<ReturnHandoverStepResult>/u);
  assert.match(source, /onPopInvokedWithResult/u);
  assert.match(source, /if \(_step == 0\) \{\s*await _closeStepper\(\)/su);
  assert.match(source, /_confirmDamageAbandonment\(\)/u);
  assert.match(source, /onChanged: _damageReceipt != null \|\| _savingDamageCase/u);
  assert.match(source, /readOnly: _damageReceipt != null/u);
  assert.match(source, /allowAdd: _damageReceipt == null/u);
  assert.match(source, /serverseitig gespeichert/u);
});

test('screen principal invalidation owns only the stepper route', () => {
  assert.match(source, /didChangeDependencies\(\)/u);
  assert.match(source, /_safetyActions\.trackOwnedScreenRoute\(route\)/u);
  assert.match(source, /_releaseScreenRoute\?\.call\(\)/u);
});

test('remote return-case acceptance rechecks principal before receipt parsing', () => {
  assert.match(
    submitReturnCaseSource,
    /remoteAccepted = true;\s*\/\/ The remote write is the commit boundary\.[\s\S]*?await _requireCurrent\(\s*context,\s*remoteAcceptedOrConfirmed: true,[\s\S]*?if \(opensReview\)/su,
  );
  assert.match(
    source,
    /stillCurrent = await _safetyActions\.isCurrent\(_safetyService, owner\)/u,
  );
  assert.match(source, /if \(!stillCurrent\) \{\s*_safetyActions\.invalidate\(\)/su);
});

test('receipt provenance distinguishes validated server state from local QA fallback', () => {
  assert.match(source, /_damageReceiptServerConfirmed/u);
  assert.match(source, /result\.serverConfirmed && result\.receipt != null/u);
  assert.match(source, /'provenance': 'local_qa_synthetic'/u);
  assert.match(source, /kein Live-Servernachweis/u);
  assert.match(submitReturnCaseSource, /serverConfirmed: opensReview/u);
});
