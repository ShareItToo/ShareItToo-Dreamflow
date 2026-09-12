import 'dart:io';
import 'dart:convert';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/help_center_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lendify/screens/support_flow_screen.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

Map<String, dynamic> _canonicalCase() => {
      'id': 'case-help-center',
      'caseNumber': 'SIT-ABCDEFGHJKLM',
      'caseType': 'general_help',
      'caseSubType': 'app_error_or_display',
      'status': 'received',
      'nextUpdateAt': '2026-08-21T16:00:00.000Z',
      'nextUpdateDisplay': '21.08.2026, 18:00',
      'timezone': 'Europe/Berlin',
      'operatingMode': 'simulation',
    };

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({
        'auth_session_v1': jsonEncode({
          'userId': 'support-fixture-a',
          'sessionId': 'support-session-a',
          'email': 'support-a@example.invalid',
          'createdAt': '2026-09-04T00:00:00Z',
        }),
      }));
  testWidgets('help center creates a canonical case instead of local feedback',
      (tester) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    Map<String, dynamic>? capturedIntake;
    await tester.pumpWidget(MaterialApp(
      home: HelpCenterScreen(
        sessionCheck: () async => true,
        submitter: (intake, idempotencyKey) async {
          capturedIntake = intake;
          return _canonicalCase();
        },
      ),
    ));

    final openSupport = find.text('Support-Fall sicher melden');
    await tester.scrollUntilVisible(
      openSupport,
      600,
      scrollable: find.byType(Scrollable).first,
    );
    const description =
        'Die App bleibt nach dem Öffnen dauerhaft im Ladezustand.';
    await tester.enterText(find.byType(TextField).last, description);
    await tester.pump();
    expect(
      tester
          .widget<FilledButton>(
            find.ancestor(of: openSupport, matching: find.byType(FilledButton)),
          )
          .onPressed,
      isNotNull,
    );
    await tester.tap(openSupport);
    await tester.pumpAndSettle();

    expect(
        find.text('Bist du gerade in unmittelbarer Gefahr?'), findsOneWidget);
    await tester
        .tap(find.byKey(const ValueKey('support_safety_answer_no_danger')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Technisches Problem'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('App lädt nicht'));
    await tester.pumpAndSettle();

    final descriptionField = tester.widget<TextField>(find.byType(TextField));
    expect(descriptionField.controller?.text, description);
    await tester.tap(find.text('An Support schicken'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byKey(const ValueKey('support_case_receipt')), findsOneWidget);
    expect(capturedIntake?['caseType'], 'general_help');
    expect(capturedIntake?['summary'], contains(description));
    expect(capturedIntake?.containsKey('linkedBookingId'), isFalse);
    expect(capturedIntake?.containsKey('linkedListingId'), isFalse);

    await tester
        .tap(find.byKey(const ValueKey('support_case_receipt_continue')));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller?.text,
      isEmpty,
    );
  });

  testWidgets('help center keeps guest text and requires an account',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      home: HelpCenterScreen(sessionCheck: () async => false),
    ));
    final openSupport = find.text('Support-Fall sicher melden');
    await tester.scrollUntilVisible(
      openSupport,
      600,
      scrollable: find.byType(Scrollable).first,
    );
    const description =
        'Ich brauche Hilfe und möchte mein Anliegen nach der Anmeldung senden.';
    await tester.enterText(find.byType(TextField).last, description);
    await tester.pump();
    await tester.tap(openSupport);
    await tester.pumpAndSettle();

    expect(find.text('Support-Fall melden'), findsOneWidget);
    expect(find.textContaining('Serverbestätigte Case-ID'), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller?.text,
      description,
    );
  });

  testWidgets('help center opens the authenticated moderation decisions',
      (tester) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      home: HelpCenterScreen(
        sessionCheck: () async => true,
        moderationDecisionLoader: () async => const [],
      ),
    ));
    final openDecisions =
        find.byKey(const ValueKey('open-moderation-decisions'));
    await tester.scrollUntilVisible(
      openDecisions,
      600,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(openDecisions);
    await tester.pumpAndSettle();

    expect(find.text('Moderationsentscheidungen'), findsOneWidget);
    expect(find.text('Keine Moderationsentscheidungen'), findsOneWidget);
  });

  for (final switchWhileLoading in [true, false]) {
    testWidgets(
        'help intake preserves B route during ${switchWhileLoading ? 'session check' : 'A flow'}',
        (tester) async {
      final checking = Completer<bool>();
      final navigator = GlobalKey<NavigatorState>();
      tester.view.physicalSize = const Size(900, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(
          navigatorKey: navigator,
          home: HelpCenterScreen(sessionCheck: () => checking.future)));
      final button = find.text('Support-Fall sicher melden');
      await tester.scrollUntilVisible(button, 600,
          scrollable: find.byType(Scrollable).first);
      await tester.enterText(
          find.byType(TextField).last, 'Synthetic private A support draft.');
      await tester.pump();
      await tester.tap(button);
      await tester.pump();
      if (!switchWhileLoading) {
        checking.complete(true);
        await tester.pumpAndSettle();
        expect(find.byType(SupportFlowScreen), findsOneWidget);
      }
      unawaited(navigator.currentState!.push<void>(DialogRoute<void>(
        context: navigator.currentContext!,
        builder: (_) => const AlertDialog(title: Text('Unrelated B dialog')),
      )));
      await tester.pump(const Duration(milliseconds: 400));
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
          'auth_session_v1',
          jsonEncode({
            'userId': 'support-fixture-b',
            'sessionId': 'support-session-b',
            'email': 'support-b@example.invalid',
            'createdAt': '2026-09-04T00:00:00Z',
          }));
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      if (switchWhileLoading) checking.complete(true);
      await tester.pumpAndSettle();
      expect(find.byType(SupportFlowScreen, skipOffstage: false), findsNothing);
      expect(find.text('Unrelated B dialog'), findsOneWidget);
      navigator.currentState!.pop();
      await tester.pumpAndSettle();
      expect(
          tester
              .widget<TextField>(find.byType(TextField).last)
              .controller!
              .text,
          isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  test('profile help tile opens the real help center', () {
    final source = File('lib/screens/profile_screen.dart').readAsStringSync();
    expect(
      source,
      matches(
        RegExp(
          r"case '/help':\s+Navigator\.of\(context\)\s+\.push\(MaterialPageRoute\(builder: \(_\) => const HelpCenterScreen\(\)\)\);",
        ),
      ),
    );
  });
}
