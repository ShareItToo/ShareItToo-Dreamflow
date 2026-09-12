import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/widgets/foreground_push_host.dart';

void main() {
  testWidgets('shows a foreground notification and opens its safe action',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final messages = StreamController<ForegroundPushMessage>.broadcast();
    final messengerKey = GlobalKey<ScaffoldMessengerState>();
    ForegroundPushMessage? opened;
    addTearDown(messages.close);

    await tester.pumpWidget(
      MaterialApp(
        scaffoldMessengerKey: messengerKey,
        home: ForegroundPushHost(
          messengerKey: messengerKey,
          messages: messages.stream,
          onOpen: (message) => opened = message,
          child: const Scaffold(body: Text('Start')),
        ),
      ),
    );

    final message = ForegroundPushMessage(
      title: 'Neue Nachricht',
      body: 'Deine Buchung wurde aktualisiert.',
      actionUri: Uri.parse('shareittoo://booking/synthetic-booking'),
    );
    messages.add(message);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Neue Nachricht'), findsOneWidget);
    expect(find.text('Deine Buchung wurde aktualisiert.'), findsOneWidget);
    expect(find.text('Öffnen'), findsOneWidget);
    expect(find.bySemanticsLabel('Schließen'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);

    await tester.tap(find.text('Öffnen'));
    await tester.pump();
    expect(opened, same(message));
  });

  testWidgets('uses the root navigator when hosted by MaterialApp.builder',
      (tester) async {
    final messages = StreamController<ForegroundPushMessage>.broadcast();
    final navigatorKey = GlobalKey<NavigatorState>();
    addTearDown(messages.close);

    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        builder: (context, child) => ForegroundPushHost(
          navigatorKey: navigatorKey,
          messages: messages.stream,
          child: child ?? const SizedBox.shrink(),
        ),
        home: const Scaffold(body: Text('Start')),
      ),
    );

    messages.add(const ForegroundPushMessage(
      title: 'Neue Nachricht',
      body: 'Du hast eine neue Nachricht.',
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Neue Nachricht'), findsOneWidget);
    expect(find.text('Du hast eine neue Nachricht.'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'serializes authenticated-ready recovery and coalesces repeated signals',
      (tester) async {
    final messages = StreamController<ForegroundPushMessage>.broadcast();
    final recoverySignals = StreamController<void>.broadcast(sync: true);
    final first = Completer<bool>();
    final second = Completer<bool>();
    var calls = 0;
    addTearDown(messages.close);
    addTearDown(recoverySignals.close);

    await tester.pumpWidget(
      MaterialApp(
        home: ForegroundPushHost(
          messages: messages.stream,
          registrationRecoverySignals: recoverySignals.stream,
          recoverPushRegistration: () {
            calls += 1;
            return calls == 1 ? first.future : second.future;
          },
          child: const Scaffold(body: Text('Start')),
        ),
      ),
    );

    recoverySignals.add(null);
    recoverySignals.add(null);
    recoverySignals.add(null);
    await tester.pump();
    expect(calls, 1);

    first.complete(false);
    await tester.pump();
    expect(calls, 2);

    second.complete(true);
    await tester.pump();
    expect(calls, 2);
  });

  testWidgets('retries registration when the app resumes', (tester) async {
    final messages = StreamController<ForegroundPushMessage>.broadcast();
    final recoverySignals = StreamController<void>.broadcast(sync: true);
    var calls = 0;
    addTearDown(messages.close);
    addTearDown(recoverySignals.close);

    await tester.pumpWidget(
      MaterialApp(
        home: ForegroundPushHost(
          messages: messages.stream,
          registrationRecoverySignals: recoverySignals.stream,
          recoverPushRegistration: () async {
            calls += 1;
            return true;
          },
          child: const Scaffold(body: Text('Start')),
        ),
      ),
    );

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();

    expect(calls, 1);
  });

  testWidgets('a failed recovery does not block the next recovery signal',
      (tester) async {
    final messages = StreamController<ForegroundPushMessage>.broadcast();
    final recoverySignals = StreamController<void>.broadcast(sync: true);
    var calls = 0;
    addTearDown(messages.close);
    addTearDown(recoverySignals.close);

    await tester.pumpWidget(
      MaterialApp(
        home: ForegroundPushHost(
          messages: messages.stream,
          registrationRecoverySignals: recoverySignals.stream,
          recoverPushRegistration: () async {
            calls += 1;
            if (calls == 1) throw StateError('expected test failure');
            return true;
          },
          child: const Scaffold(body: Text('Start')),
        ),
      ),
    );

    recoverySignals.add(null);
    await tester.pump();
    recoverySignals.add(null);
    await tester.pump();

    expect(calls, 2);
  });
}
