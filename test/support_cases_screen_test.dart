import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/help_center_screen.dart';
import 'package:lendify/screens/support_cases_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support_intake_backend_owner_test.dart' show useSession;

Map<String, dynamic> _supportCase({
  String status = 'waiting_for_user',
  String caseType = 'general_help',
  String caseSubType = 'app_error_or_display',
  String? dsaNoticeNumber,
  String dsaNoticeLocatorStatus = 'complete',
}) =>
    {
      'id': '11111111-1111-4111-8111-111111111111',
      'caseNumber': 'SIT-ABCDEFGHJKLM',
      'caseType': caseType,
      'caseSubType': caseSubType,
      if (dsaNoticeNumber != null) 'dsaNoticeNumber': dsaNoticeNumber,
      if (dsaNoticeNumber != null)
        'dsaNoticeLocatorStatus': dsaNoticeLocatorStatus,
      if (dsaNoticeNumber != null &&
          dsaNoticeLocatorStatus == 'needs_clarification')
        'dsaNoticeLocatorPrompt':
            'Bitte ergänze einen exakten Fundort: eine vollständige http(s)-URL oder eine passende Referenz.',
      'dsaNoticeLocatorMaySubmit': dsaNoticeNumber != null &&
          dsaNoticeLocatorStatus == 'needs_clarification',
      'status': status,
      'priority': 'p3',
      'sourceChannel': 'app',
      'operatingMode': 'simulation',
      'locale': 'de-DE',
      'waitingOn': status == 'waiting_for_user' ? 'reporter' : 'support_owner',
      'nextAction':
          'Bitte ergänze die genaue App-Version und den letzten Schritt.',
      'nextUpdateAt': '2026-08-22T10:00:00.000Z',
      'nextUpdateDisplay': '22.08.2026, 12:00',
      'userActionDueAt':
          status == 'waiting_for_user' ? '2026-08-23T18:00:00.000Z' : null,
      'userActionDueDisplay':
          status == 'waiting_for_user' ? '23.08.2026, 20:00' : null,
      'timezone': 'Europe/Berlin',
      'userFacingSummary': 'Wir benötigen noch eine konkrete Angabe von dir.',
      'finalDecisionAvailable': false,
      'appealConfigurationRecorded': false,
      'appealState': 'not_applicable',
      'appealAvailable': false,
      'appealDeadline': null,
      'appealDeadlineDisplay': null,
      'closureReason': null,
      'createdAt': '2026-08-21T10:00:00.000Z',
      'updatedAt': '2026-08-21T11:00:00.000Z',
      'version': 2,
    };

Map<String, dynamic> _detail() => {
      'supportCase': _supportCase(),
      'finalDecision': null,
      'messages': const [],
      'events': [
        {
          'id': 'event-created',
          'eventType': 'case.created',
          'fromStatus': null,
          'toStatus': 'received',
          'createdAt': '2026-08-21T10:00:00.000Z',
        },
        {
          'id': 'event-waiting',
          'eventType': 'case.transitioned',
          'fromStatus': 'acknowledged',
          'toStatus': 'waiting_for_user',
          'createdAt': '2026-08-21T11:00:00.000Z',
        },
      ],
    };

Map<String, dynamic> _publishedDecision() => {
      'decision': 'Die interne Prüfung ist abgeschlossen.',
      'effect': 'Dein Konto und deine Zahlung bleiben unverändert.',
      'reason': 'Der bestätigte technische Stand wurde geprüft.',
      'implementationResult':
          'Das bestätigte Ergebnis wurde im internen Testfall dokumentiert.',
      'redressRoute': 'Eine menschliche Überprüfung kann angefordert werden.',
      'implementedAt': '2026-08-21T14:30:00.000Z',
      'implementedDisplay': '21.08.2026, 16:30',
      'communicatedAt': '2026-08-21T14:35:00.000Z',
      'timezone': 'Europe/Berlin',
    };

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await useSession('a');
  });
  testWidgets('case list and detail show only simple user-facing status text',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [_supportCase()],
        detailLoader: (_) async => _detail(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('SIT-ABCDEFGHJKLM'), findsOneWidget);
    expect(find.text('Antwort von dir nötig'), findsOneWidget);
    expect(find.text('waiting_for_user'), findsNothing);
    expect(find.text('app_error_or_display'), findsNothing);
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('support_user_action')), findsOneWidget);
    expect(find.text('Antwort bis: 23.08.2026, 20:00'), findsOneWidget);
    expect(find.text('Nächstes Update: 22.08.2026, 12:00'), findsOneWidget);
    expect(
      find.text(
          'Bitte ergänze die genaue App-Version und den letzten Schritt.'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.text('Fall eingegangen'),
      400,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Fall eingegangen'), findsOneWidget);
    expect(find.text('Testmodus'), findsOneWidget);
    expect(find.text('case.transitioned'), findsNothing);
    expect(find.text('waiting_for_user'), findsNothing);
  });

  testWidgets(
      'DSA Notice ID is visible in list and detail without intake evidence',
      (tester) async {
    final noticeCase = _supportCase(
      caseType: 'moderation_content',
      caseSubType: 'illegal_content_notice',
      dsaNoticeNumber: 'SIT-N-ABCDEFGHJKLM',
    );
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [noticeCase],
        detailLoader: (_) async => {
          'supportCase': noticeCase,
          'finalDecision': null,
          'messages': const [],
          'events': const [],
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Notice-ID: SIT-N-ABCDEFGHJKLM'), findsOneWidget);
    expect(find.textContaining('reporterEmail'), findsNothing);
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('support_dsa_notice_receipt')),
      findsOneWidget,
    );
    expect(find.textContaining('noch nicht getroffen'), findsOneWidget);
  });

  testWidgets(
      'sent in-app support message is visible without internal metadata',
      (tester) async {
    final detail = {
      ..._detail(),
      'messages': [
        {
          'id': '22222222-2222-4222-8222-222222222222',
          'caseId': '11111111-1111-4111-8111-111111111111',
          'title': 'Fall eingegangen',
          'content':
              'Hallo Walid, wir haben deinen Fall erhalten. Deine Case ID lautet SIT-ABCDEFGHJKLM.',
          'sentAt': '2026-08-21T10:01:00.000Z',
          'createdAt': '2026-08-21T10:00:00.000Z',
          'correctedMessageId': null,
          'externalMessageSent': false,
        },
      ],
    };
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [_supportCase()],
        detailLoader: (_) async => detail,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Nachrichten'),
      400,
      scrollable: find.byType(Scrollable).last,
    );

    expect(find.text('Nachrichten'), findsOneWidget);
    expect(find.text('Fall eingegangen'), findsWidgets);
    expect(
      find.text(
          'Hallo Walid, wir haben deinen Fall erhalten. Deine Case ID lautet SIT-ABCDEFGHJKLM.'),
      findsOneWidget,
    );
    expect(find.text('renderedContentSha256'), findsNothing);
  });

  testWidgets('reporter can append an exact DSA locator once', (tester) async {
    var completed = false;
    final incomplete = _supportCase(
      status: 'received',
      caseType: 'moderation_content',
      caseSubType: 'illegal_content_notice',
      dsaNoticeNumber: 'SIT-N-ABCDEFGHJKLM',
      dsaNoticeLocatorStatus: 'needs_clarification',
    );
    Map<String, dynamic> currentCase() => completed
        ? {
            ...incomplete,
            'dsaNoticeLocatorStatus': 'complete',
            'dsaNoticeLocatorPrompt': null,
            'dsaNoticeLocatorMaySubmit': false,
            'version': 3,
          }
        : incomplete;

    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [incomplete],
        detailLoader: (_) async => {
          'supportCase': currentCase(),
          'finalDecision': null,
          'messages': const [],
          'events': const [],
        },
        dsaLocatorSubmitter: (caseId, locator, version, key) async {
          expect(caseId, incomplete['id']);
          expect(locator, 'message:message-9');
          expect(version, 2);
          expect(key, startsWith('support_dsa_locator_'));
          completed = true;
          return currentCase();
        },
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Exakten Fundort ergänzen'), findsOneWidget);
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('support_dsa_locator_follow_up')),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.enterText(
      find.byKey(const ValueKey('support_dsa_locator_input')),
      'message:message-9',
    );
    await tester.pump();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('support_dsa_locator_submit')),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.byKey(const ValueKey('support_dsa_locator_submit')));
    await tester.pumpAndSettle();

    expect(completed, true);
    expect(
      find.byKey(const ValueKey('support_dsa_locator_follow_up')),
      findsNothing,
    );
    expect(find.textContaining('reporterEmail'), findsNothing);
  });

  test('support message projection fails closed on unresolved placeholders',
      () {
    final detail = {
      ..._detail(),
      'messages': [
        {
          'id': '22222222-2222-4222-8222-222222222222',
          'title': 'Fall eingegangen',
          'content': 'Hallo {{first_name}}',
          'sentAt': '2026-08-21T10:01:00.000Z',
          'createdAt': '2026-08-21T10:00:00.000Z',
          'correctedMessageId': null,
          'externalMessageSent': false,
        },
      ],
    };
    expect(
      () => SupportCaseDetailViewData.fromMap(detail),
      throwsA(isA<FormatException>()),
    );
  });

  testWidgets(
      'published final decision shows the five approved user fields only',
      (tester) async {
    final resolved = {
      ..._supportCase(status: 'resolved'),
      'waitingOn': 'none',
      'nextAction': null,
      'nextUpdateAt': null,
      'nextUpdateDisplay': null,
      'finalDecisionAvailable': true,
      'userFacingSummary': 'Die interne Prüfung wurde abgeschlossen.',
    };
    final finalDecision = {
      ..._publishedDecision(),
      'decisionCode': 'support.internal_code_must_not_render',
      'implementationReference': 'internal-ledger-reference',
    };
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [resolved],
        detailLoader: (_) async => {
          'supportCase': resolved,
          'finalDecision': finalDecision,
          'messages': const [],
          'events': const [],
        },
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();

    expect(
        find.byKey(const ValueKey('support_final_decision')), findsOneWidget);
    for (final text in [
      'Die interne Prüfung ist abgeschlossen.',
      'Dein Konto und deine Zahlung bleiben unverändert.',
      'Der bestätigte technische Stand wurde geprüft.',
      'Das bestätigte Ergebnis wurde im internen Testfall dokumentiert.',
      'Eine menschliche Überprüfung kann angefordert werden.',
    ]) {
      await tester.scrollUntilVisible(
        find.text(text),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text(text), findsWidgets);
    }
    expect(find.text('support.internal_code_must_not_render'), findsNothing);
    expect(find.text('internal-ledger-reference'), findsNothing);
  });

  testWidgets('incomplete published final decision fails closed',
      (tester) async {
    final resolved = {
      ..._supportCase(status: 'resolved'),
      'waitingOn': 'none',
      'nextAction': null,
      'nextUpdateAt': null,
      'nextUpdateDisplay': null,
      'finalDecisionAvailable': true,
    };
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [resolved],
        detailLoader: (_) async => {
          'supportCase': resolved,
          'finalDecision': {
            'decision': 'Die interne Prüfung ist abgeschlossen.',
            'reason': 'Der bestätigte technische Stand wurde geprüft.',
            'implementationResult': 'Das Ergebnis wurde dokumentiert.',
            'redressRoute': 'Menschliche Überprüfung ist möglich.',
            'implementedAt': '2026-08-21T14:30:00.000Z',
            'implementedDisplay': '21.08.2026, 16:30',
            'communicatedAt': '2026-08-21T14:35:00.000Z',
            'timezone': 'Europe/Berlin',
          },
          'messages': const [],
          'events': const [],
        },
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();

    expect(
      find.text('Support-Fälle konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
  });

  testWidgets(
      'closed reporter can submit one bounded appeal and sees confirmed receipt',
      (tester) async {
    var submitted = false;
    final closed = {
      ..._supportCase(status: 'closed'),
      'waitingOn': 'none',
      'nextAction': null,
      'nextUpdateAt': null,
      'nextUpdateDisplay': null,
      'finalDecisionAvailable': true,
      'appealConfigurationRecorded': true,
      'appealState': 'available',
      'appealAvailable': true,
      'appealDeadline': '2026-09-15T18:00:00.000Z',
      'appealDeadlineDisplay': '15.09.2026, 20:00',
      'closureReason': 'resolved_action_completed',
    };
    Map<String, dynamic> detail() => {
          'supportCase': submitted
              ? {
                  ...closed,
                  'appealState': 'submitted',
                  'appealAvailable': false,
                  'version': 3,
                }
              : closed,
          'finalDecision': _publishedDecision(),
          'appeal': submitted
              ? {
                  'id': '33333333-3333-4333-8333-333333333333',
                  'reviewNumber': 'SIT-R-ABCDEFGHJKLM',
                  'originalCaseNumber': 'SIT-ABCDEFGHJKLM',
                  'status': 'submitted',
                  'submittedAt': '2026-08-21T15:00:00.000Z',
                  'submittedDisplay': '21.08.2026, 17:00',
                  'nextUpdateAt': '2026-08-21T16:00:00.000Z',
                  'nextUpdateDisplay': '21.08.2026, 18:00',
                  'materialSummary':
                      'Deine Begründung wurde vollständig und sicher aufgenommen.',
                  'interimEffect':
                      'Der Antrag selbst löst keine automatische Änderung oder externe Maßnahme aus.',
                  'externalMessageSent': false,
                  'timezone': 'Europe/Berlin',
                }
              : null,
          'messages': const [],
          'events': const [],
        };
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [closed],
        detailLoader: (_) async => detail(),
        appealSubmitter: (caseId, grounds, version, key) async {
          expect(caseId, '11111111-1111-4111-8111-111111111111');
          expect(grounds, 'Bitte die bestätigten Tatsachen erneut prüfen.');
          expect(version, 2);
          expect(key, startsWith('support_appeal_'));
          submitted = true;
          return {
            'id': '33333333-3333-4333-8333-333333333333',
          };
        },
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('support_appeal_grounds')),
      500,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.enterText(
      find.byKey(const ValueKey('support_appeal_grounds')),
      'Bitte die bestätigten Tatsachen erneut prüfen.',
    );
    await tester.pump();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('support_appeal_submit')),
      250,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.byKey(const ValueKey('support_appeal_submit')));
    await tester.pumpAndSettle();

    expect(submitted, true);
    expect(
      () => SupportCaseDetailViewData.fromMap(detail()),
      returnsNormally,
    );
    expect(find.byKey(const ValueKey('support_appeal_form')), findsNothing);
    await tester.drag(
      find.byType(Scrollable).last,
      const Offset(0, -1200),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Support-Fälle konnten nicht sicher geladen werden.'),
      findsNothing,
    );
    expect(
        find.byKey(const ValueKey('support_appeal_receipt')), findsOneWidget);
    expect(find.text('Eingegangen: SIT-R-ABCDEFGHJKLM'), findsOneWidget);
    expect(find.text('Nächstes Update: 21.08.2026, 18:00'), findsOneWidget);
    expect(find.textContaining('automatische Änderung'), findsOneWidget);
  });

  testWidgets('closed case without explicit appeal configuration fails closed',
      (tester) async {
    final unsafeClosed = {
      ..._supportCase(status: 'closed'),
      'waitingOn': 'none',
      'nextAction': null,
      'nextUpdateAt': null,
      'nextUpdateDisplay': null,
      'appealState': 'unconfigured',
      'closureReason': 'information_provided',
    };
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(listLoader: () async => [unsafeClosed]),
    ));
    await tester.pumpAndSettle();

    expect(
      find.text('Support-Fälle konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
    expect(find.text('unconfigured'), findsNothing);
  });

  testWidgets('unknown server status fails closed without exposing its code',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [_supportCase(status: 'paused_internal')],
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.text('Support-Fälle konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
    expect(find.text('paused_internal'), findsNothing);
  });

  testWidgets('detail identity mismatch fails closed', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [_supportCase()],
        detailLoader: (_) async => {
          ..._detail(),
          'supportCase': {
            ..._supportCase(),
            'id': '22222222-2222-4222-8222-222222222222',
          },
        },
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();

    expect(
      find.text('Support-Fälle konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
  });

  testWidgets('active case without next update fails closed', (tester) async {
    final incomplete = _supportCase()..remove('nextUpdateDisplay');
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [incomplete],
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.text('Support-Fälle konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
  });

  testWidgets('waiting case without a confirmed user deadline fails closed',
      (tester) async {
    final incomplete = _supportCase()..remove('userActionDueDisplay');
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [incomplete],
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.text('Support-Fälle konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
    expect(find.textContaining('Antwort bis:'), findsNothing);
  });

  testWidgets('support cases remain usable at 200 percent text size',
      (tester) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: const TextScaler.linear(2),
        ),
        child: child!,
      ),
      home: SupportCasesScreen(
        listLoader: () async => [_supportCase()],
        detailLoader: (_) async => _detail(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('SIT-ABCDEFGHJKLM'), findsOneWidget);
    await tester.tap(find.text('SIT-ABCDEFGHJKLM'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Testmodus'),
      500,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Testmodus'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('support detail exposes named status and ordered headings',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [_supportCase()],
        detailLoader: (_) async => _detail(),
      ),
    ));
    await tester.pumpAndSettle();

    final card = find.byKey(const ValueKey(
      'support_case_card_11111111-1111-4111-8111-111111111111',
    ));
    expect(card, findsOneWidget);
    expect(tester.getSize(card).height, greaterThanOrEqualTo(48));
    expect(
      find.bySemanticsLabel(
        RegExp(
          r'^Support-Fall SIT-ABCDEFGHJKLM, Status Antwort von dir nötig',
        ),
      ),
      findsOneWidget,
    );

    await tester.tap(card);
    await tester.pumpAndSettle();

    expect(
      find.bySemanticsLabel('Status: Antwort von dir nötig'),
      findsOneWidget,
    );
    expect(
      tester
          .getSemantics(find.text('Allgemeine Hilfe'))
          .flagsCollection
          .isHeader,
      isTrue,
    );
    expect(
      tester
          .getSemantics(find.text('Aktueller Stand'))
          .flagsCollection
          .isHeader,
      isTrue,
    );
    expect(find.text('Antwort von dir nötig'), findsOneWidget);
    expect(find.text('waiting_for_user'), findsNothing);
    semantics.dispose();
  });

  testWidgets('keyboard activation opens the support case in widget order',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: SupportCasesScreen(
        listLoader: () async => [_supportCase()],
        detailLoader: (_) async => _detail(),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(FocusManager.instance.primaryFocus, isNotNull);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();

    expect(find.text('Allgemeine Hilfe'), findsOneWidget);
    expect(find.byKey(const ValueKey('support_user_action')), findsOneWidget);
  });

  testWidgets(
      'support notification destination reloads the authorized case from the backend',
      (tester) async {
    String? requestedCaseId;
    await tester.pumpWidget(MaterialApp(
      home: SupportCaseNotificationDestinationScreen(
        caseId: '11111111-1111-4111-8111-111111111111',
        detailLoader: (caseId) async {
          requestedCaseId = caseId;
          return _detail();
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(requestedCaseId, '11111111-1111-4111-8111-111111111111');
    expect(find.text('Allgemeine Hilfe'), findsOneWidget);
    expect(find.text('Antwort von dir nötig'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('support_notification_unavailable')),
      findsNothing,
    );
  });

  testWidgets(
      'support notification destination exposes no data after authorization loss',
      (tester) async {
    const caseId = '11111111-1111-4111-8111-111111111111';
    await tester.pumpWidget(MaterialApp(
      home: SupportCaseNotificationDestinationScreen(
        caseId: caseId,
        detailLoader: (_) async =>
            throw Exception('forbidden private support summary'),
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('support_notification_unavailable')),
      findsOneWidget,
    );
    expect(find.text('Support-Fall nicht verfügbar'), findsOneWidget);
    expect(find.textContaining(caseId), findsNothing);
    expect(find.textContaining('private support summary'), findsNothing);
    expect(find.text('Meine Support-Fälle'), findsOneWidget);
  });

  testWidgets('help center opens the authenticated case list', (tester) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      home: HelpCenterScreen(
        sessionCheck: () async => true,
        caseListLoader: () async => [],
      ),
    ));
    final openCases = find.byKey(const ValueKey('support_cases_open'));
    await tester.scrollUntilVisible(
      openCases,
      600,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(openCases);
    await tester.pumpAndSettle();

    expect(find.text('Meine Support-Fälle'), findsOneWidget);
    expect(find.text('Noch keine Support-Fälle'), findsOneWidget);
  });
}
