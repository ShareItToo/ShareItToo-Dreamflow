import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/notification_settings_screen.dart';
import 'package:lendify/services/notification_preferences_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

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

  testWidgets(
      'locked notification categories are status information, selectable filters remain interactive',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(home: NotificationSettingsScreen()),
    );
    await tester.pumpAndSettle();

    expect(find.text('Wichtig'), findsOneWidget);
    expect(find.text('Sicherheit & Verifizierung'), findsOneWidget);
    expect(
      find.text('Im Benachrichtigungsfeed immer angezeigt.'),
      findsNWidgets(2),
    );

    for (final label in ['Wichtig', 'Sicherheit & Verifizierung']) {
      final node = tester.getSemantics(find.text(label));
      final data = node.getSemanticsData();
      expect(data.hasAction(SemanticsAction.tap), isFalse, reason: label);
      expect(node.flagsCollection.isButton, isNot(isTrue), reason: label);
      expect(
        node.flagsCollection.isToggled,
        ui.Tristate.none,
        reason: label,
      );
    }

    final switches = find.byType(Switch, skipOffstage: false);
    expect(switches, findsNWidgets(7));
    await tester.tap(switches.first);
    await tester.pumpAndSettle();
    final persisted = await NotificationPreferencesService.get();
    expect(persisted.showBookings, isFalse);
    expect(persisted.showImportant, isTrue);
    expect(persisted.showSecurity, isTrue);
    semantics.dispose();
  });
}
