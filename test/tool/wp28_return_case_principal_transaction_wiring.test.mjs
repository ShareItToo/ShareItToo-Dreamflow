import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync('lib/screens/report_issue_screen.dart', 'utf8');
const safety = readFileSync('lib/services/safety_action_service.dart', 'utf8');
const backend = readFileSync('lib/services/backend_repository.dart', 'utf8');
const data = readFileSync('lib/services/data_service.dart', 'utf8');
const interaction = readFileSync(
  'lib/widgets/safety_action_interaction.dart',
  'utf8',
);

function methodBody(source, start, next) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = source.indexOf(next, from + start.length);
  assert.notEqual(to, -1, `missing ${next}`);
  return source.slice(from, to);
}

test('return-case remote call resolves only the captured session owner', () => {
  const ownerMethod = methodBody(
    backend,
    'static Future<Map<String, dynamic>> openV52ReturnCaseForOwner(',
    'static Future<Map<String, dynamic>> uploadReportEvidence(',
  );
  assert.match(ownerMethod, /_authorizedForOwner\(\s*owner: owner,/u);
  assert.doesNotMatch(ownerMethod, /_authorized\(/u);
  assert.match(
    safety,
    /BackendRepository\.openV52ReturnCaseForOwner\(\s*owner: context\.owner\.authOwner,/u,
  );
});

test('soft booking issues are server-persisted with the captured owner', () => {
  assert.match(
    safety,
    /BackendRepository\.createReportForOwner\([\s\S]*?owner: context\.owner\.authOwner,[\s\S]*?targetType: 'booking',[\s\S]*?targetId: requestId,/u,
  );
  assert.match(
    safety,
    /if \(opensReview\) \{[\s\S]*?openReturnCaseRemote\([\s\S]*?\} else \{[\s\S]*?createBookingIssueReportRemote\(/u,
  );
});

test('local return truth is bound to the exact owner before persistence', () => {
  for (const marker of [
    'markRentalRequestNeedsReviewForOwner(',
    'addTimelineEventForOwner({',
    'addNotificationForOwner({',
  ]) {
    assert.ok(data.includes(marker), `missing exact owner-bound marker: ${marker}`);
  }
  assert.match(
    data,
    /_assertSessionOwnerOperationalUser\(owner, expectedUserId\);[\s\S]*?_writePreferenceString\(/u,
  );
  assert.match(
    data,
    /expectedSessionOwner: owner,[\s\S]*?_assertSessionOwnerOperationalUser\(/u,
  );
  assert.match(
    data,
    /requestedAt\.isBefore\(returnT0\)[\s\S]*?requestedAt\.isAfter\(reportDeadline\)/u,
  );
});

test('screen captures owner before every action await and rechecks results', () => {
  const addEvidence = methodBody(
    screen,
    'Future<void> _addEvidence() async',
    'Future<void> _submit() async',
  );
  const submit = methodBody(
    screen,
    'Future<void> _submit() async',
    'Future<void> _showOwnedNotice(',
  );
  for (const body of [addEvidence, submit]) {
    const capture = body.indexOf('_safetyActions.capture()');
    const firstAwait = body.indexOf('await ');
    assert.ok(capture >= 0 && firstAwait > capture);
    assert.match(body, /_safetyActions\.isCurrent\(_safetyService, owner\)/u);
  }
  assert.match(submit, /submitReturnCaseIssue\(\s*context: owner\.context,/u);
  assert.match(submit, /completeOwnedScreenRoute\(owner, true\)/u);
});

test('typed return-case results cannot be collapsed by the generic catch', () => {
  const submit = methodBody(
    screen,
    'Future<void> _submit() async',
    'Future<void> _showOwnedNotice(',
  );
  assert.ok(
    submit.indexOf('on SafetyActionFailure catch') <
      submit.indexOf('catch (error)'),
  );
  assert.match(submit, /'Meldung abgelehnt'/u);
  assert.match(submit, /'Prüffall serverseitig eröffnet'/u);
  assert.match(submit, /'Sendestatus unklar'/u);
  assert.doesNotMatch(submit, /'Meldung fehlgeschlagen'/u);
});

test('legacy global credential and navigator paths are absent', () => {
  assert.doesNotMatch(
    screen,
    /BackendRepository\.uploadReportEvidence\(|DataService\.markRentalRequestNeedsReview\(/u,
  );
  assert.doesNotMatch(screen, /Navigator\.of\(context\)\.maybePop\(\)/u);
  assert.doesNotMatch(screen, /AppPopup/u);
});

test('A screen invalidation removes only its exact route', () => {
  assert.match(interaction, /Route<dynamic>\? _ownedScreenRoute/u);
  assert.match(interaction, /navigator\.removeRoute\(screenRoute\)/u);
  assert.match(interaction, /navigator\.removeRoute\(route, result\)/u);
  assert.doesNotMatch(interaction, /popUntil|maybePop/u);
  assert.match(
    screen,
    /SharedPersistenceSync\.accountSecurityStateKey[\s\S]*?_safetyActions\.invalidate\(\)/u,
  );
});

test('408 and unstructured errors are outside the rejection allowlist', () => {
  const classifier = methodBody(
    safety,
    'static SafetyActionFailureKind classifyReturnCaseBackendFailure(',
    '@protected\n  Future<List<String>> fetchBlockedUsersRemote(',
  );
  assert.doesNotMatch(classifier, /408:/u);
  assert.doesNotMatch(classifier, /'request_failed'/u);
  assert.match(
    classifier,
    /\? SafetyActionFailureKind\.rejected\s*: SafetyActionFailureKind\.outcomeUnknown/u,
  );
});
