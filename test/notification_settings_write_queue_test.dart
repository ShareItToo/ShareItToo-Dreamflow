import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/notification_settings_screen.dart';

void main() {
  test('notification preference writes are serialized in enqueue order',
      () async {
    final queue = NotificationPreferencesWriteQueue();
    final events = <String>[];
    final firstRelease = Completer<void>();

    final first = queue.add(() async {
      events.add('first-start');
      await firstRelease.future;
      events.add('first-end');
    });
    final second = queue.add(() async {
      events.add('second');
    });

    await Future<void>.delayed(Duration.zero);
    expect(events, ['first-start']);
    firstRelease.complete();
    await Future.wait([first, second]);

    expect(events, ['first-start', 'first-end', 'second']);
  });
}
