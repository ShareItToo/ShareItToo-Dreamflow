import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

void main() {
  test('recognizes only booking-related persistence keys', () {
    expect(
      SharedPersistenceSync.affectsBookingSync(
        SharedPersistenceSync.rentalRequestsKey,
      ),
      isTrue,
    );
    expect(
      SharedPersistenceSync.affectsBookingSync(
        SharedPersistenceSync.messageThreadsKey,
      ),
      isTrue,
    );
    expect(
      SharedPersistenceSync.affectsBookingSync(
        SharedPersistenceSync.handoverReturnStateKey,
      ),
      isTrue,
    );
    expect(SharedPersistenceSync.affectsBookingSync('unrelated'), isFalse);
  });

  test('normalizes shared_preferences_web storage keys', () {
    expect(
      SharedPersistenceSync.logicalKeyFromStorageKey(
        'flutter.message_threads_v1',
      ),
      SharedPersistenceSync.messageThreadsKey,
    );
    expect(
      SharedPersistenceSync.logicalKeyFromStorageKey('rental_requests'),
      SharedPersistenceSync.rentalRequestsKey,
    );
    expect(
      SharedPersistenceSync.logicalKeyFromStorageKey('flutter.unrelated'),
      isNull,
    );
    expect(SharedPersistenceSync.logicalKeyFromStorageKey(null), isNull);
  });

  test('manual notifications are exposed by the platform stream', () async {
    final next = SharedPersistenceSync.changes.first;
    SharedPersistenceSync.notify(SharedPersistenceSync.messageThreadsKey);
    expect(await next, SharedPersistenceSync.messageThreadsKey);
  });

  test('catch-up notification emits one bounded delayed retry', () async {
    SharedPersistenceSync.cancelCatchUpRetries();
    final changes = <String>[];
    final subscription = SharedPersistenceSync.changes.listen(changes.add);

    SharedPersistenceSync.notifyWithCatchUpRetry(
      SharedPersistenceSync.messageThreadsKey,
      retryDelay: const Duration(milliseconds: 10),
    );
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(
      changes
          .where(
            (key) => key == SharedPersistenceSync.messageThreadsKey,
          )
          .length,
      2,
    );
    await subscription.cancel();
    SharedPersistenceSync.cancelCatchUpRetries();
  });

  test('refresh coordinator serializes and coalesces concurrent events',
      () async {
    final coordinator = SharedPersistenceRefreshCoordinator();
    final firstStarted = Completer<void>();
    final releaseFirst = Completer<void>();
    var calls = 0;
    var concurrent = 0;
    var maxConcurrent = 0;

    Future<void> refresh() async {
      calls++;
      concurrent++;
      if (concurrent > maxConcurrent) maxConcurrent = concurrent;
      if (calls == 1) {
        firstStarted.complete();
        await releaseFirst.future;
      }
      concurrent--;
    }

    final first = coordinator.schedule(refresh);
    await firstStarted.future;
    await coordinator.schedule(refresh);
    await coordinator.schedule(refresh);
    releaseFirst.complete();
    await first;

    expect(calls, 2);
    expect(maxConcurrent, 1);
  });

  test('disposed refresh coordinator ignores new work', () async {
    final coordinator = SharedPersistenceRefreshCoordinator()..dispose();
    var called = false;
    await coordinator.schedule(() async => called = true);
    expect(called, isFalse);
  });
}
