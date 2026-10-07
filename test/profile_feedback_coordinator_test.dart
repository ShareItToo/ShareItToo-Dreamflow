import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/profile_feedback_coordinator.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/screens/profile_screen.dart';

void main() {
  const owner = AuthSessionOwner(
    userId: 'profile-owner',
    email: 'profile-owner@example.invalid',
    sessionId: 'session-a',
    createdAt: null,
    epoch: 1,
  );

  test('clears only after server receipt and keeps idempotency key', () async {
    final coordinator = ProfileFeedbackCoordinator();
    var draft = '  useful feedback  ';
    final keys = <String>[];

    final result = await coordinator.submit(
      owner: owner,
      submittedDraft: draft,
      idempotencyKey: 'feedback-a',
      persist: (key) async {
        keys.add(key);
        return <String, dynamic>{'caseNumber': 'SIT-CASE-1'};
      },
      isCurrent: () async => true,
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );

    expect(result?.contextCurrent, isTrue);
    expect(draft, isEmpty);
    expect(keys, ['feedback-a']);
  });

  test('failed persistence keeps the draft and allows a retry', () async {
    final coordinator = ProfileFeedbackCoordinator();
    var draft = 'keep this feedback';
    var calls = 0;

    Future<void> fail(String _) async {
      calls++;
      throw StateError('offline');
    }

    await expectLater(
      coordinator.submit(
        owner: owner,
        submittedDraft: draft,
        idempotencyKey: 'feedback-retry',
        persist: (key) => fail(key).then<Map<String, dynamic>>((_) => {}),
        isCurrent: () async => true,
        readDraft: () => draft,
        clearDraft: () => draft = '',
      ),
      throwsStateError,
    );
    expect(draft, 'keep this feedback');
    expect(calls, 1);
    expect(coordinator.inFlight, isFalse);
  });

  test('double tap is one server submission', () async {
    final coordinator = ProfileFeedbackCoordinator();
    final gate = Completer<void>();
    var calls = 0;
    var draft = 'send once';

    final first = coordinator.submit(
      owner: owner,
      submittedDraft: draft,
      idempotencyKey: 'feedback-once',
      persist: (_) async {
        calls++;
        await gate.future;
        return <String, dynamic>{};
      },
      isCurrent: () async => true,
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );
    await Future<void>.delayed(Duration.zero);
    final second = await coordinator.submit(
      owner: owner,
      submittedDraft: draft,
      idempotencyKey: 'feedback-once',
      persist: (_) async {
        calls++;
        return <String, dynamic>{};
      },
      isCurrent: () async => true,
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );
    expect(second, isNull);
    gate.complete();
    await first;
    expect(calls, 1);
  });

  test('session switch never clears the successor draft or claims receipt',
      () async {
    final coordinator = ProfileFeedbackCoordinator();
    var current = true;
    var draft = 'account A feedback';
    final gate = Completer<void>();

    final pending = coordinator.submit(
      owner: owner,
      submittedDraft: draft,
      idempotencyKey: 'feedback-switch',
      persist: (_) async {
        await gate.future;
        return <String, dynamic>{'caseNumber': 'A-1'};
      },
      isCurrent: () async => current,
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );
    await Future<void>.delayed(Duration.zero);
    current = false;
    draft = 'account B feedback';
    gate.complete();

    final result = await pending;
    expect(result?.contextCurrent, isFalse);
    expect(draft, 'account B feedback');
  });

  test('feedback summary fits the server limit at both boundaries', () {
    final valid = buildProfileFeedbackIntake(
      List<String>.filled(profileFeedbackMaxLength, 'x').join(),
    );
    final tooLong = buildProfileFeedbackIntake(
      List<String>.filled(profileFeedbackMaxLength + 1, 'x').join(),
    );
    expect((valid['summary'] as String).length, 2000);
    expect((tooLong['summary'] as String).length, 2001);
  });

  test('feedback intake attestations match the visible non-urgent scope copy',
      () {
    final intake = buildProfileFeedbackIntake('One useful app improvement');
    final triage = intake['safetyTriage'] as Map<String, dynamic>;
    final scope = intake['issueScope'] as Map<String, dynamic>;
    final feedback = intake['feedbackContext'] as Map<String, dynamic>;
    expect(triage['immediateDanger'], isFalse);
    expect(triage['guidanceShown'], isFalse);
    expect(scope['singleIssueConfirmed'], isTrue);
    expect(scope['separationGuidanceShown'], isTrue);
    expect(feedback['nonUrgentConfirmed'], isTrue);
  });

  test('generated idempotency keys are opaque, bounded and unique', () {
    final first = newProfileFeedbackIdempotencyKey();
    final second = newProfileFeedbackIdempotencyKey();
    final shape = RegExp(r'^feedback-[0-9a-f]{32}$');
    expect(shape.hasMatch(first), isTrue);
    expect(shape.hasMatch(second), isTrue);
    expect(first, isNot(second));
    for (final fixture in <String>[
      'profile-owner',
      'session-a',
      'profile-owner@example.invalid',
    ]) {
      expect(first, isNot(contains(fixture)));
      expect(second, isNot(contains(fixture)));
    }
  });

  test(
      'same-principal refresh preserves feedback owner, but epoch drift does not',
      () {
    const first = SessionTransitionOwner(
      authOwner: owner,
      profileUserId: 'profile-owner',
    );
    final same = SessionTransitionOwner(
      authOwner: AuthSessionOwner(
        userId: 'profile-owner',
        email: 'profile-owner@example.invalid',
        sessionId: 'session-a',
        createdAt: null,
        epoch: 1,
      ),
      profileUserId: 'profile-owner',
    );
    const changed = SessionTransitionOwner(
      authOwner: AuthSessionOwner(
        userId: 'profile-owner',
        email: 'profile-owner@example.invalid',
        sessionId: 'session-b',
        createdAt: null,
        epoch: 2,
      ),
      profileUserId: 'profile-owner',
    );
    expect(identical(first, same), isFalse);
    expect(sameProfileFeedbackOwner(first, same), isTrue);
    expect(sameProfileFeedbackOwner(first, changed), isFalse);
  });
}
