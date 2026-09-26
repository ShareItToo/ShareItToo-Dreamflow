import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/widgets/return_handover_stepper_sheet.dart', import.meta.url),
  'utf8',
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('obsolete stepper date formatter cannot return', () => {
  assert.doesNotMatch(source, /\b_fmtDateTime\b/);
});

test('step order still requires evidence before confirmation codes', () => {
  const steps = between(
    'List<_StepKind> _buildSteps() {',
    'void _openImagePreview(',
  );
  assert.match(steps, /base\.add\(_StepKind\.photos\)/);
  assert.match(steps, /base\.add\(_StepKind\.codes\)/);
  assert.ok(
    steps.indexOf('base.add(_StepKind.photos)') <
      steps.indexOf('base.add(_StepKind.codes)'),
  );
});

test('photo step remains a hard continuation gate', () => {
  const canContinue = between('bool get _canContinue {', 'Future<void> _next() async');
  assert.match(canContinue, /case _StepKind\.photos:/);
  assert.match(canContinue, /if \(_savingEvidence\) return false/);
  assert.match(canContinue, /_presenterEvidenceCount \+ _checkoutPhotos\.length >= 4/);
  assert.match(canContinue, /_presenterEvidenceCount < 4/);
  assert.match(canContinue, /_deviationEvidenceCount \+ _checkoutPhotos\.length >= 1/);
});

test('QR and manual code still delegate to the bound verifier', () => {
  const confirmation = between(
    'Future<void> _scanCounterpartyQr() async',
    'void _showQrOverlay(',
  );
  assert.match(confirmation, /widget\.confirmationVerifier != null/);
  assert.match(
    confirmation,
    /widget\.confirmationVerifier!\(qrPayload: raw\)/,
  );
  assert.match(confirmation, /widget\.confirmationVerifier!\(code: code\)/);
});

test('completion callback remains intact after obsolete formatters are removed', () => {
  assert.doesNotMatch(source, /String _fmtEuro\(double v\)/);
  assert.match(
    source,
    /Navigator\.of\(context\)\.pop\(ReturnHandoverStepResult\(/,
  );
  assert.match(source, /confirmed: true/);
});
