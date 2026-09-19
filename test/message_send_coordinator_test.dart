import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/message_send_coordinator.dart';

void main() {
  test('clears the submitted draft only after persistence succeeds', () async {
    final coordinator = MessageSendCoordinator();
    var draft = '  hello  ';
    final persisted = <String>[];

    final sent = await coordinator.send(
      submittedDraft: draft,
      persist: (text) async => persisted.add(text),
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );

    expect(sent, isTrue);
    expect(persisted, ['hello']);
    expect(draft, isEmpty);
    expect(coordinator.inFlight, isFalse);
  });

  test('keeps the draft when persistence fails', () async {
    final coordinator = MessageSendCoordinator();
    var draft = 'keep me';

    await expectLater(
      coordinator.send(
        submittedDraft: draft,
        persist: (_) async => throw StateError('offline'),
        readDraft: () => draft,
        clearDraft: () => draft = '',
      ),
      throwsStateError,
    );

    expect(draft, 'keep me');
    expect(coordinator.inFlight, isFalse);
  });

  test('ignores a second tap while the first persistence is pending', () async {
    final coordinator = MessageSendCoordinator();
    final gate = Completer<void>();
    var calls = 0;
    var draft = 'once';

    final first = coordinator.send(
      submittedDraft: draft,
      persist: (_) async {
        calls++;
        await gate.future;
      },
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );
    await Future<void>.delayed(Duration.zero);
    final second = await coordinator.send(
      submittedDraft: draft,
      persist: (_) async => calls++,
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );

    expect(second, isFalse);
    expect(calls, 1);
    gate.complete();
    expect(await first, isTrue);
    expect(calls, 1);
  });

  test('preserves newer text entered while persistence is pending', () async {
    final coordinator = MessageSendCoordinator();
    final gate = Completer<void>();
    var draft = 'first';

    final first = coordinator.send(
      submittedDraft: draft,
      persist: (_) => gate.future,
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );
    await Future<void>.delayed(Duration.zero);
    draft = 'newer draft';
    gate.complete();

    expect(await first, isTrue);
    expect(draft, 'newer draft');
  });

  test('confirmed persistence stays sent when refresh fails', () async {
    final coordinator = MessageSendCoordinator();
    var draft = 'already persisted';
    var persistCalls = 0;

    final sent = await coordinator.send(
      submittedDraft: draft,
      persist: (_) async => persistCalls++,
      readDraft: () => draft,
      clearDraft: () => draft = '',
    );

    expect(sent, isTrue);
    expect(persistCalls, 1);
    expect(draft, isEmpty);

    final outcome = classifyMessageSendRefreshOutcome(
      persistenceConfirmed: sent,
      refreshSucceeded: false,
    );
    expect(outcome, MessageSendRefreshOutcome.persistedRefreshFailed);
    // A failed view refresh must not restore the old draft or trigger a
    // second persistence attempt.
    expect(draft, isEmpty);
    expect(persistCalls, 1);
  });

  test('stale persistence failure cannot show an account B toast', () {
    expect(
      shouldShowMessageSendOutcomeToast(mounted: true, contextCurrent: false),
      isFalse,
    );
  });

  test('stale persisted-refresh failure cannot show an account B toast', () {
    expect(
      shouldShowMessageSendOutcomeToast(mounted: true, contextCurrent: false),
      isFalse,
    );
  });
}
