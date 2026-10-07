import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const entries = [
  ['help_center_screen.dart', '_sendSupportMessage()', '_openSupportCases()'],
  ['booking_detail_screen.dart', '_openSupportFlow({', '_manageBookingTime({'],
  ['ongoing_owner_detail_screen.dart', '_openSupportFlow({', '_manageBookingTime({'],
  ['public_profile_screen.dart', '_openProfileSupportFlow(', '\n  @override\n  Widget build'],
  ['message_thread_screen.dart', '_contactSupport()', '\n}\n\nclass _ThreadHeader'],
];

test('every support intake entry captures ownership before awaiting and binds all navigation', () => {
  for (const [file, start, end] of entries) {
    const source = read(`lib/screens/${file}`);
    const from = source.indexOf(`Future<void> ${start}`);
    assert.ok(from >= 0, file);
    const to = source.indexOf(end, from + start.length);
    assert.ok(to > from, file);
    const body = source.slice(from, to);
    assert.ok(body.indexOf('final owner = _supportPrincipal.capture()') < body.indexOf('await '), file);
    assert.match(body, /SupportFlowScreen\([\s\S]*?owner: owner/u);
    assert.match(body, /_supportPrincipal\.pushOwnedRoute/u);
    assert.match(body, /_supportPrincipal\.isCurrent\(owner\)/u);
    assert.doesNotMatch(body, /Navigator\.of\([^)]*\)\.push/u);
    assert.match(source, /_supportPrincipal\.dispose\(\)/u);
  }
});

test('a newly added direct intake caller cannot escape the audited inventory', () => {
  const callers = readdirSync(new URL('../../lib/screens/', import.meta.url))
    .filter((file) => file.endsWith('.dart') && file !== 'support_flow_screen.dart')
    .filter((file) => /SupportFlowScreen\(/u.test(read(`lib/screens/${file}`)));
  assert.deepEqual(callers.sort(), entries.map(([file]) => file).sort());
});

test('support screen and dialogs stay tied to their exact route identity', () => {
  const screen = read('lib/screens/support_flow_screen.dart');
  const controller = read('lib/widgets/support_principal_controller.dart');
  const body = screen.slice(screen.indexOf('Future<void> _submitSupportCase()'), screen.indexOf('class _SupportSafetyPanel'));
  assert.match(body, /final owner = _principal\.capture\(\)/u);
  assert.match(body, /_principal\.showOwnedDialog/u);
  assert.match(body, /_principal\.completeOwnedRoute\(_screenRoute, owner, result\)/u);
  assert.doesNotMatch(body, /Navigator\.of|AppPopup|showDialog</u);
  assert.match(controller, /accountSecurityStateKey/u);
  assert.match(controller, /navigator\.removeRoute\(route/u);
  assert.doesNotMatch(controller, /\.pop\(|popUntil|Future.*delayed/u);
  assert.match(controller, /isSessionOwnerDefinitelyCurrent\(owner\)/u);
});

test('both support endpoints require the captured principal and keep idempotency', () => {
  const source = read('lib/services/backend_repository.dart');
  for (const [method, next] of [['createSupportCase', 'reportHandoverException'], ['reportHandoverException', 'previewLegacySupportMigration']]) {
    const from = source.indexOf(`${method}({`);
    const body = source.slice(from, source.indexOf(next, from));
    assert.match(body, /required AuthSessionOwner owner/u);
    assert.match(body, /_authorizedForOwner\([\s\S]*?owner: owner/u);
    assert.match(body, /additionalHeaders: \{'Idempotency-Key': idempotencyKey\}/u);
    assert.doesNotMatch(body, /await _authorized\(/u);
  }
  assert.match(read('scripts/technical_regression_check.sh'), /--dart-define=SIT_BACKEND_ENABLED=true \\\n\s*--dart-define=SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1 \\\n\s*test\/support_intake_backend_owner_test\.dart/u);
});
