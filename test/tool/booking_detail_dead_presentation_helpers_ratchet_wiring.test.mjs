import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('booking detail cannot regain dead call calendar code or format helpers', () => {
  for (const name of ['_call', '_addToCalendar', '_handoverCode', '_formatDeadline']) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(source, /Text line\(/u);
  assert.doesNotMatch(source, /dart:convert/u);
  assert.doesNotMatch(source, /ignore:\s*unused_(?:element|element_parameter|field)/u);
});

test('active map navigation and secure server challenge paths remain intact', () => {
  const maps = between('Future<void> _openMaps(', 'String _computeBookingId()');
  assert.equal(maps.includes('google.com/maps/search'), true);
  assert.equal(maps.includes('google.com/maps/dir'), true);
  assert.match(maps, /launchUrl\(uri, mode: LaunchMode\.platformDefault\)/u);

  const challenge = between(
    'String _confirmationCode({',
    'double _parseEuro(',
  );
  assert.match(challenge, /DataService\.issueBookingConfirmationChallenge\(/u);
  assert.match(challenge, /DataService\.verifyBookingConfirmationChallenge\(/u);
  assert.match(challenge, /HandoverCodeService\.codeForTitleAndStart\(/u);
});

test('active cancellation policy and completion facts remain central and visible', () => {
  const cancellation = between(
    'class _CancellationPolicyCard extends StatefulWidget',
    'class _BoundBookingPriceSnapshot',
  );
  assert.match(cancellation, /CancellationPolicyText\.header/u);
  assert.match(cancellation, /CancellationPolicyText\.body\(\)/u);

  const completion = between(
    'class _CompletionSummaryCard extends StatelessWidget',
    'class _FactRow',
  );
  assert.match(completion, /_FactRow\(/u);
  assert.match(completion, /needsReview \? 'Wird geprüft' : 'Abgeschlossen'/u);
  assert.match(completion, /'Erstattung gem\. Richtlinien'/u);
});

test('booking presentation-helper ratchet is permanently registered', () => {
  assert.match(
    regression,
    /node --test test\/tool\/booking_detail_dead_presentation_helpers_ratchet_wiring\.test\.mjs/u,
  );
});
