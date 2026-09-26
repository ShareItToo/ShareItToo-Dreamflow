import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const renter = readFileSync('lib/screens/booking_detail_screen.dart', 'utf8');
const owner = readFileSync('lib/screens/ongoing_owner_detail_screen.dart', 'utf8');
const bookings = readFileSync('lib/screens/bookings_screen.dart', 'utf8');
const policy = readFileSync(
  'lib/services/return_case_entry_point_policy.dart',
  'utf8',
);

function methodBody(source, start, next) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = source.indexOf(next, from + start.length);
  assert.notEqual(to, -1, `missing ${next}`);
  return source.slice(from, to);
}

test('both booking roles expose a distinct return-case action and retain Support', () => {
  for (const screen of [renter, owner]) {
    assert.match(screen, /label: 'Problem melden',[\s\S]*?value: 'issue'/u);
    assert.match(
      screen,
      /if \(_returnCaseEntryPointEligible(?:\(req\))?\)[\s\S]*?label: 'Rückgabe-Prüffall eröffnen',[\s\S]*?value: 'return_case'/u,
    );
    assert.match(screen, /case 'return_case':[\s\S]*?_openReturnCase\(/u);
    assert.match(screen, /ReportIssueScreen\(/u);
  }
});

test('return-case navigation captures principal before await and owns exact route', () => {
  const renterMethod = methodBody(
    renter,
    'Future<void> _openReturnCase({',
    'Future<void> _manageBookingTime(',
  );
  const ownerMethod = methodBody(
    owner,
    'Future<void> _openReturnCase({',
    'Future<void> _manageBookingTime(',
  );
  for (const body of [renterMethod, ownerMethod]) {
    const capture = body.indexOf('_supportPrincipal.capture()');
    const firstAwait = body.indexOf('await ');
    assert.ok(capture >= 0 && firstAwait > capture);
    assert.match(body, /_supportPrincipal\.isCurrent\(owner\)/u);
    assert.match(body, /_supportPrincipal\.pushOwnedRoute<bool\?>\(/u);
    assert.match(body, /owner: owner,[\s\S]*?ReportIssueScreen\(/u);
    assert.doesNotMatch(body, /Navigator\.of|maybePop|popUntil/u);
  }
  assert.match(renterMethod, /await _reloadFromSharedPersistence\(\)/u);
  assert.match(ownerMethod, /await _load\(\)/u);
});

test('renter projection carries server return-window truth into the detail screen', () => {
  for (const field of [
    'returnT0',
    'returnReportDeadline',
    'returnCaseOpenedAt',
  ]) {
    assert.match(
      bookings,
      new RegExp(`'${field}': r\\.${field}\\?\\.toIso8601String\\(\\)`, 'u'),
    );
    assert.match(
      renter,
      new RegExp(`widget\\.booking\\['${field}'\\]`, 'u'),
    );
  }
});

test('entry point is fail-closed to exact V5.2 completed report window', () => {
  assert.match(policy, /bookingStatus\.trim\(\)\.toLowerCase\(\) != 'completed'/u);
  assert.match(policy, /simulationOnly \|\| needsReview \|\| returnCaseOpenedAt != null/u);
  assert.match(policy, /contractVersion\.startsWith\('V5\.2-'\)/u);
  assert.match(policy, /platformContract\?\['state'\] != 'platformContractAccepted'/u);
  assert.match(policy, /!current\.isBefore\(returnT0\) && !current\.isAfter\(reportDeadline\)/u);
});
