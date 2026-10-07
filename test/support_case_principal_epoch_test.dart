import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/support_cases_screen.dart';
import 'package:lendify/screens/help_center_screen.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> useSession(String suffix) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': 'fixture-$suffix',
        'sessionId': 'fixture-session-$suffix',
        'email': 'fixture-$suffix@example.invalid',
        'createdAt': '2026-09-04T00:00:00Z',
        'accessToken': 'fixture-access-$suffix',
        'refreshToken': 'fixture-refresh-$suffix',
        'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
      }));
}

Map<String, dynamic> supportCase() => {
      'id': '11111111-1111-4111-8111-111111111111',
      'caseNumber': 'SIT-ABCDEFGHJKLM',
      'caseType': 'general_help',
      'caseSubType': 'app_error_or_display',
      'dsaNoticeLocatorMaySubmit': false,
      'status': 'waiting_for_user',
      'priority': 'p3',
      'sourceChannel': 'app',
      'operatingMode': 'simulation',
      'locale': 'de-DE',
      'waitingOn': 'reporter',
      'nextAction': 'Synthetischer Test: Bitte ergänze die App-Version.',
      'nextUpdateAt': '2026-09-05T10:00:00.000Z',
      'nextUpdateDisplay': '05.09.2026, 12:00',
      'userActionDueAt': '2026-09-06T18:00:00.000Z',
      'userActionDueDisplay': '06.09.2026, 20:00',
      'timezone': 'Europe/Berlin',
      'userFacingSummary': 'Synthetische Angabe ausschließlich für Konto A.',
      'finalDecisionAvailable': false,
      'appealConfigurationRecorded': false,
      'appealState': 'not_applicable',
      'appealAvailable': false,
      'appealDeadline': null,
      'appealDeadlineDisplay': null,
      'closureReason': null,
      'createdAt': '2026-09-04T10:00:00.000Z',
      'updatedAt': '2026-09-04T11:00:00.000Z',
      'version': 2,
    };

Map<String, dynamic> followUpCase(bool appeal) => appeal
    ? {
        ...supportCase(),
        'status': 'closed',
        'nextAction': null,
        'nextUpdateDisplay': null,
        'userActionDueAt': null,
        'userActionDueDisplay': null,
        'appealConfigurationRecorded': true,
        'appealState': 'available',
        'appealAvailable': true,
        'appealDeadline': '2026-09-15T18:00:00.000Z',
        'appealDeadlineDisplay': '15.09.2026, 20:00',
        'closureReason': 'resolved_action_completed',
      }
    : {
        ...supportCase(),
        'caseType': 'moderation_content',
        'caseSubType': 'illegal_content_notice',
        'dsaNoticeNumber': 'SIT-N-ABCDEFGHJKLM',
        'dsaNoticeLocatorStatus': 'needs_clarification',
        'dsaNoticeLocatorPrompt': 'Bitte ergänze die konkrete Referenz.',
        'dsaNoticeLocatorMaySubmit': true,
      };

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await useSession('a');
  });
  testWidgets(
      'Help Center case-list entry cannot adopt B across session-check await',
      (tester) async {
    final check = Completer<bool>();
    var loads = 0;
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(MaterialApp(
        navigatorKey: navigator,
        home: HelpCenterScreen(
          sessionCheck: () => check.future,
          caseListLoader: () async {
            loads++;
            return [supportCase()];
          },
        )));
    await tester.pumpAndSettle();
    final open = find.text('Meine Support-Fälle');
    await tester.scrollUntilVisible(open, 500,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(open);
    await tester.pump();
    await useSession('b');
    unawaited(showDialog<void>(
        context: navigator.currentContext!,
        builder: (_) => const AlertDialog(title: Text('B-owned dialog'))));
    check.complete(true);
    await tester.pumpAndSettle();
    expect(loads, 0);
    expect(find.byType(SupportCasesScreen), findsNothing);
    expect(find.text('B-owned dialog'), findsOneWidget);
  });
  for (final appeal in [false, true]) {
    for (final phase in ['before-submit', 'late-success', 'late-failure']) {
      testWidgets('follow-up appeal=$appeal phase=$phase cannot cross to B',
          (tester) async {
        tester.view.physicalSize = const Size(1000, 2000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final navigator = GlobalKey<NavigatorState>();
        final reply = Completer<Map<String, dynamic>>();
        final model = followUpCase(appeal);
        var writes = 0;
        var reads = 0;
        Future<Map<String, dynamic>> submit(
            String id, String value, int version, String key) {
          writes++;
          expect(id, model['id']);
          expect(version, 2);
          return reply.future;
        }

        await tester.pumpWidget(MaterialApp(
            navigatorKey: navigator,
            home: SupportCaseDetailScreen(
              initialCase: SupportCaseViewData.fromMap(model),
              detailLoader: (_) async {
                reads++;
                return {
                  'supportCase': model,
                  'finalDecision': null,
                  'messages': [],
                  'events': []
                };
              },
              appealSubmitter: submit,
              dsaLocatorSubmitter: submit,
            )));
        await tester.pumpAndSettle();
        final input = find.byKey(ValueKey(
            appeal ? 'support_appeal_grounds' : 'support_dsa_locator_input'));
        final button = find.byKey(ValueKey(
            appeal ? 'support_appeal_submit' : 'support_dsa_locator_submit'));
        await tester.scrollUntilVisible(input, 350,
            scrollable: find.byType(Scrollable).first);
        await tester.enterText(input, 'https://example.invalid/fixture');
        await tester.pump();
        await tester.ensureVisible(button);
        expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
        if (phase == 'before-submit') await useSession('b');
        await tester.tap(button);
        await tester.pump();
        if (phase == 'before-submit') {
          expect(writes, 0);
        } else {
          expect(writes, 1);
          await useSession('b');
          unawaited(showDialog<void>(
              context: navigator.currentContext!,
              builder: (_) =>
                  const AlertDialog(title: Text('B-owned dialog'))));
          if (phase == 'late-success') {
            reply.complete({'id': 'fixture-result'});
          } else {
            reply.completeError(StateError('synthetic offline'));
          }
        }
        await tester.pumpAndSettle();
        expect(reads, 1);
        expect(find.byKey(const ValueKey('support_session_unavailable')),
            findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        if (phase != 'before-submit') {
          expect(find.text('B-owned dialog'), findsOneWidget);
        }
      });
    }
  }
  testWidgets('initial loading and load error are never confirmed empty',
      (tester) async {
    final reply = Completer<List<Map<String, dynamic>>>();
    await tester.pumpWidget(
        MaterialApp(home: SupportCasesScreen(listLoader: () => reply.future)));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Noch keine Support-Fälle'), findsNothing);
    reply.completeError(StateError('synthetic offline'));
    await tester.pumpAndSettle();
    expect(find.text('Support-Fälle konnten nicht sicher geladen werden.'),
        findsOneWidget);
    expect(find.text('Noch keine Support-Fälle'), findsNothing);
  });
  testWidgets('missing owner never calls loader and is not server-empty',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    var calls = 0;
    await tester
        .pumpWidget(MaterialApp(home: SupportCasesScreen(listLoader: () async {
      calls++;
      return [];
    })));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.byKey(const ValueKey('support_session_unavailable')),
        findsOneWidget);
    expect(find.text('Noch keine Support-Fälle'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('A to B to A never revives a pending old list', (tester) async {
    final reply = Completer<List<Map<String, dynamic>>>();
    await tester.pumpWidget(
        MaterialApp(home: SupportCasesScreen(listLoader: () => reply.future)));
    await tester.pump();
    await useSession('b');
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pump();
    await useSession('a');
    reply.complete([supportCase()]);
    await tester.pumpAndSettle();
    expect(find.text('SIT-ABCDEFGHJKLM'), findsNothing);
    expect(find.byKey(const ValueKey('support_session_unavailable')),
        findsOneWidget);
  });
  for (final kind in ['list', 'detail', 'notification']) {
    testWidgets('$kind removes its exact A route without removing B dialog',
        (tester) async {
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(
          navigatorKey: navigator, home: const Scaffold(body: Text('Home'))));
      final data = {
        'supportCase': supportCase(),
        'finalDecision': null,
        'messages': [],
        'events': []
      };
      final Widget screen = kind == 'list'
          ? SupportCasesScreen(listLoader: () async => [supportCase()])
          : kind == 'detail'
              ? SupportCaseDetailScreen(
                  initialCase: SupportCaseViewData.fromMap(supportCase()),
                  detailLoader: (_) async => data)
              : SupportCaseNotificationDestinationScreen(
                  caseId: supportCase()['id'], detailLoader: (_) async => data);
      final route = MaterialPageRoute<void>(builder: (_) => screen);
      unawaited(navigator.currentState!.push(route));
      await tester.pumpAndSettle();
      expect(route.isActive, isTrue);
      await useSession('b');
      unawaited(showDialog<void>(
          context: navigator.currentContext!,
          builder: (_) => const AlertDialog(title: Text('B-owned dialog'))));
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pumpAndSettle();
      expect(route.isActive, isFalse);
      expect(find.text('B-owned dialog'), findsOneWidget);
      expect(find.text('SIT-ABCDEFGHJKLM'), findsNothing);
    });
  }
  for (final detail in [false, true]) {
    testWidgets(
        'late read error detail=$detail checks stored owner without an event',
        (tester) async {
      final reply = Completer<Map<String, dynamic>>();
      final list = Completer<List<Map<String, dynamic>>>();
      await tester.pumpWidget(MaterialApp(
          home: detail
              ? SupportCaseNotificationDestinationScreen(
                  caseId: supportCase()['id'],
                  detailLoader: (_) => reply.future)
              : SupportCasesScreen(listLoader: () => list.future)));
      await tester.pump();
      await useSession('b');
      if (detail) {
        reply.completeError(StateError('synthetic offline'));
      } else {
        list.completeError(StateError('synthetic offline'));
      }
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('support_session_unavailable')),
          findsOneWidget);
      expect(find.text('Noch keine Support-Fälle'), findsNothing);
    });
  }
  for (final notification in [false, true]) {
    for (final switched in [false, true]) {
      testWidgets(
          'detail notification=$notification switch=$switched preserves principal',
          (tester) async {
        final reply = Completer<Map<String, dynamic>>();
        final navigator = GlobalKey<NavigatorState>();
        await tester.pumpWidget(MaterialApp(
            navigatorKey: navigator,
            home: notification
                ? SupportCaseNotificationDestinationScreen(
                    caseId: supportCase()['id'],
                    detailLoader: (_) => reply.future)
                : SupportCaseDetailScreen(
                    initialCase: SupportCaseViewData.fromMap(supportCase()),
                    detailLoader: (_) => reply.future)));
        await tester.pump();
        if (switched) {
          await useSession('b');
          SharedPersistenceSync.notify(
              SharedPersistenceSync.accountSecurityStateKey);
          await tester.pump();
          unawaited(showDialog<void>(
              context: navigator.currentContext!,
              builder: (_) =>
                  const AlertDialog(title: Text('B-owned dialog'))));
        }
        reply.complete({
          'supportCase': supportCase(),
          'finalDecision': null,
          'messages': [],
          'events': []
        });
        await tester.pumpAndSettle();
        if (switched) expect(find.text('B-owned dialog'), findsOneWidget);
        expect(find.text('Synthetische Angabe ausschließlich für Konto A.'),
            switched ? findsNothing : findsOneWidget);
      });
    }
  }
  for (final empty in [false, true]) {
    testWidgets('same-A support list control empty=$empty', (tester) async {
      await tester.pumpWidget(MaterialApp(
          home: SupportCasesScreen(
        listLoader: () async => empty ? [] : [supportCase()],
      )));
      await tester.pumpAndSettle();
      expect(find.text(empty ? 'Noch keine Support-Fälle' : 'SIT-ABCDEFGHJKLM'),
          findsOneWidget);
    });
    testWidgets('late A list empty=$empty must not become B truth',
        (tester) async {
      final reply = Completer<List<Map<String, dynamic>>>();
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(
          navigatorKey: navigator,
          home: SupportCasesScreen(
            listLoader: () => reply.future,
          )));
      await tester.pump();
      await useSession('b');
      SharedPersistenceSync.notify(
          SharedPersistenceSync.accountSecurityStateKey);
      await tester.pump();
      unawaited(showDialog<void>(
          context: navigator.currentContext!,
          builder: (_) => const AlertDialog(
                title: Text('B-owned dialog'),
              )));
      reply.complete(empty ? [] : [supportCase()]);
      await tester.pumpAndSettle();
      expect(find.text('B-owned dialog'), findsOneWidget);
      expect(find.text(empty ? 'Noch keine Support-Fälle' : 'SIT-ABCDEFGHJKLM'),
          findsNothing);
    });
  }
}
