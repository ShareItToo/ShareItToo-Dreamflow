import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/widgets/item_details_overlay.dart', import.meta.url),
  'utf8',
);
const fallback = source.match(
  /class _ExpressFallbackSheet[\s\S]*?\nextension on /u,
  )?.[0];

assert.ok(fallback, 'expected express fallback implementation');

test('express fallback is bound to the exact request and mutates it remotely', () => {
  assert.match(fallback, /final String requestId;/u);
  assert.match(fallback, /_ExpressFallbackSheet\(\{required this\.requestId\}\)/u);
  assert.match(
    source,
    /builder: \(_\) => _ExpressFallbackSheet\(requestId: widget\.requestId\)/u,
  );
  assert.match(fallback, /DataService\.getRentalRequestById\(widget\.requestId\)/u);
  assert.match(fallback, /DataService\.updateRentalRequestTimes\([\s\S]*?expressRequested: false/u);
  assert.match(
    fallback,
    /DataService\.updateRentalRequestStatusWithActor\([\s\S]*?requestId: current\.id,[\s\S]*?status: 'cancelled',[\s\S]*?cancelledBy: 'renter'/u,
  );
});

test('success feedback requires principal and server-state verification', () => {
  const mutation = fallback.match(
    /Future<void> _confirmAuthoritativeMutation\(\) async \{[\s\S]*?\n  \}\n\n  @override/u,
  )?.[0];
  assert.ok(mutation, 'expected authoritative mutation handler');
  assert.match(mutation, /final userBefore = await DataService\.getCurrentUser\(\);/u);
  assert.match(mutation, /final userAfter = await DataService\.getCurrentUser\(\);/u);
  assert.match(mutation, /final verified = await DataService\.getRentalRequestById\(widget\.requestId\);/u);
  assert.match(mutation, /if \(!mutationVerified\) \{[\s\S]*?throw StateError\('Die Serverbestätigung/u);
  const successOffset = mutation.indexOf("title: _rebook");
  assert.ok(successOffset > 0, 'expected success title');
  assert.ok(
    mutation.indexOf('final verified =', 0) < successOffset,
    'success feedback must follow read-back verification',
  );
  assert.match(mutation, /_error = _rebook[\s\S]*?Sie bleibt offen\./u);
  assert.doesNotMatch(fallback, /Mark as declined locally|demo\)|demo$/u);
});

test('failed mutation keeps the sheet open and confirmation is not re-entrant', () => {
  assert.match(fallback, /if \(_busy\) return;/u);
  assert.match(fallback, /onPressed: _busy \? null : _confirmAuthoritativeMutation/u);
  assert.match(
    fallback,
    /catch \(error\) \{[\s\S]*?_busy = false;[\s\S]*?_error = _rebook/u,
  );
  const failure = fallback.match(/catch \(error\) \{[\s\S]*?\n    \}\n  \}/u)?.[0];
  assert.ok(failure, 'expected failure branch');
  assert.doesNotMatch(failure, /maybePop\(\)/u);
});
