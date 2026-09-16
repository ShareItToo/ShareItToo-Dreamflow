import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);

function section(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `expected section start: ${start}`);
  assert.notEqual(endIndex, -1, `expected section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const ownerReturn = section(
  '  Future<void> _startOwnerReturnFlow()',
  '  Future<void> _startPickupFlow()',
);
const pickup = section(
  '  Future<void> _startPickupFlow()',
  '  Future<void> _downloadReceiptPdf()',
);
const returnQr = section(
  '  Future<void> _startScanRenterQrForReturn()',
  '  Future<void> _confirmManualReturnByCode()',
);
const manualReturn = section(
  '  Future<void> _confirmManualReturnByCode()',
  '  Future<bool> _acknowledgeGalleryEvidenceIfNeeded',
);

test('both steppers stop after challenge lookup when their State is gone', () => {
  for (const value of [ownerReturn, pickup]) {
    assert.match(
      value,
      /challenge = await _issueSecureChallenge\([\s\S]*?if \(challenge == null\) return;\s+\}\s+if \(!mounted\) return;\s+final ok = await ReturnHandoverStepperSheet\.push\(\s+context,/u,
    );
  }
});

test('owner return proves lifecycle after identity and transition work', () => {
  assert.match(
    ownerReturn,
    /getCurrentUser\(\);\s+if \(!mounted\) return;[\s\S]*?Diese Best\u00e4tigung ist nur f\u00fcr den Vermieter m\u00f6glich/u,
  );
  assert.match(
    ownerReturn,
    /_syncBookingLifecycleFromRequest\(requestId\);\s+\}\s+if \(!mounted\) return;[\s\S]*?AppPopup\.show\(\s+context,/u,
  );
});

test('stepper pickup feedback requires a current State', () => {
  assert.match(
    pickup,
    /setHandoverBanner\([\s\S]*?\);\s+if \(!mounted\) return;\s+AppPopup\.toast\(\s+context,/u,
  );
});

test('QR and manual return prove identity and result-feedback lifecycle', () => {
  for (const value of [returnQr, manualReturn]) {
    assert.match(
      value,
      /getCurrentUser\(\);\s+if \(!mounted\) return;[\s\S]*?Diese Best\u00e4tigung ist nur f\u00fcr den Vermieter m\u00f6glich/u,
    );
    assert.match(
      value,
      /addNotification\([\s\S]*?\);\s+if \(!mounted\) return;\s+AppPopup\.toast\(\s+context,/u,
    );
  }
  assert.match(
    manualReturn,
    /R\u00fcckgabe per Code best\u00e4tigt'[\s\S]*?\);\s+if \(!mounted\) return;\s+setState\(/u,
  );
});

test('handover and return context fixes add no timing or lint accommodation', () => {
  for (const value of [
    ownerReturn,
    pickup,
    returnQr,
    manualReturn,
  ]) {
    assert.doesNotMatch(value, /ignore:\s*use_build_context_synchronously/u);
    assert.doesNotMatch(value, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
  }
});
