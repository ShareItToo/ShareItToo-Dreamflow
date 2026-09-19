import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('all support read states share the immutable owner and exact route lifecycle', () => {
  const source = read('lib/screens/support_cases_screen.dart');
  for (const type of ['SupportCasesScreen', 'SupportCaseDetailScreen', 'SupportCaseNotificationDestinationScreen']) {
    assert.match(source, new RegExp(`extends _SupportOwnedState<${type}>`, 'u'));
  }
  assert.match(source, /SupportPrincipalController\(expectedOwner: expectedSupportOwner\)/u);
  assert.match(source, /_principal\.trackScreenRoute\(route\)/u);
  assert.match(source, /_principal\.dispose\(\)/u);
  assert.match(source, /final captured = _principal\.capture\(\)/u);
  assert.match(source, /final epoch = AuthService\.sessionEpoch/u);
  assert.match(source, /final result = await load\(owner\);\s*if \(!await _principal\.isCurrent\(owner\)\)/u);
  assert.match(source, /await _principal\.isCurrent\(owner\);\s*rethrow/u);
  assert.match(source, /support_session_unavailable/u);
  assert.doesNotMatch(source, /Navigator\.of|popUntil|pushReplacement/u);
});

test('support load failures remain errors, never synthetic empty server truth', () => {
  const source = read('lib/screens/support_cases_screen.dart');
  assert.doesNotMatch(source, /snapshot\.data \?\?/u);
  assert.match(source, /pending\.ignore\(\);\s*return pending/u);
  assert.match(source, /if \(cases == null\)/u);
  const backend = read('lib/services/backend_repository.dart');
  assert.match(backend, /return _strictMaps\(response\['supportCases'\]\)/u);
  assert.match(backend, /'messages': _strictMaps\(messages\)/u);
  assert.match(source, /rawMessages is! List/u);
});

test('appeal and DSA cards bind submission and reload to the shared principal', () => {
  const source = read('lib/screens/support_cases_screen.dart');
  for (const [type, next] of [['_SupportDsaLocatorCardState', '_SupportAppealCard'], ['_SupportAppealCardState', '_SupportMetaLine']]) {
    const from = source.indexOf(`class ${type} `);
    const to = source.indexOf(`class ${next} `, from);
    assert.ok(from >= 0 && to > from);
    const body = source.slice(from, to);
    assert.ok(body.indexOf('widget.principal.capture()') < body.indexOf('await '));
    assert.match(body, /owner: owner/u);
    assert.equal((body.match(/await widget\.principal\.isCurrent\(owner\)/gu) ?? []).length, 3);
  }
});

test('all four read and follow-up endpoints require owner-only transport', () => {
  const source = read('lib/services/backend_repository.dart');
  const methods = ['getMySupportCases', 'getSupportCase', 'completeSupportDsaNoticeLocator', 'submitSupportAppeal', 'createBookingReview'];
  for (let i = 0; i < methods.length - 1; i++) {
    const start = source.indexOf(`${methods[i]}(`);
    const body = source.slice(start, source.indexOf(methods[i + 1], start));
    assert.match(body, /required AuthSessionOwner owner/u);
    assert.match(body, /_authorizedForOwner\(\s*owner: owner/u);
    assert.doesNotMatch(body, /await _authorized\(/u);
  }
  assert.match(read('scripts/technical_regression_check.sh'), /--dart-define=SIT_BACKEND_ENABLED=true \\\n\s*--dart-define=SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1 \\\n\s*test\/support_case_backend_owner_test\.dart/u);
});

test('help and notification entries capture owner before awaiting and pass it into owned routes', () => {
  for (const [file, method, end, owner] of [
    ['help_center_screen.dart', '_openSupportCases()', '_openModerationDecisions()', 'owner'],
    ['notifications_screen.dart', '_handleNotificationCta(', '_archive(', 'supportOwner'],
  ]) {
    const source = read(`lib/screens/${file}`);
    const start = source.indexOf(`Future<void> ${method}`);
    const body = source.slice(start, source.indexOf(`Future<void> ${end}`, start));
    assert.ok(start >= 0);
    assert.ok(body.indexOf(`final ${owner} = _supportPrincipal.capture()`) < body.indexOf('await '));
    assert.match(body, new RegExp(`SupportCasesScreen\\(\\s*owner: ${owner}`, 'u'));
    assert.match(body, /_supportPrincipal\.pushOwnedRoute/u);
  }
  const callers = readdirSync(new URL('../../lib/screens', import.meta.url))
    .filter((file) => file.endsWith('.dart') && file !== 'support_cases_screen.dart')
    .filter((file) => /SupportCasesScreen\(|SupportCaseDetailScreen\(|SupportCaseNotificationDestinationScreen\(/u.test(read(`lib/screens/${file}`)));
  assert.deepEqual(callers.sort(), ['help_center_screen.dart', 'notifications_screen.dart']);
});
