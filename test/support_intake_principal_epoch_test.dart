import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/support_flow_screen.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/widgets/support_principal_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, Object> session(String account) => {
      'userId': 'synthetic-support-$account',
      'sessionId': 'synthetic-support-session-$account',
      'email': 'support-$account@example.invalid',
      'createdAt': DateTime.utc(2026, 9, 4).toIso8601String(),
    };

const flowContext = SupportFlowContext(
  itemTitle: '',
  itemId: '',
  requestId: '',
  bookingStatus: 'general',
  source: SupportFlowSource.helpCenter,
  role: SupportFlowRole.renter,
);

Map<String, dynamic> receipt() => {
      'id': 'synthetic-support-case-a',
      'caseNumber': 'SIT-ABCDEFGHJKLM',
      'caseType': 'general_help',
      'caseSubType': 'app_error_or_display',
      'status': 'received',
      'nextUpdateAt': '2026-09-04T16:00:00.000Z',
      'nextUpdateDisplay': '04.09.2026, 18:00',
      'timezone': 'Europe/Berlin',
      'operatingMode': 'simulation',
    };

Future<void> switchToB({bool notify = true}) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('auth_session_v1', jsonEncode(session('b')));
  if (notify) {
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
  }
}

Future<GlobalKey<NavigatorState>> pumpDraft(
    WidgetTester tester, SupportCaseSubmitter submitter) async {
  final navigator = GlobalKey<NavigatorState>();
  tester.view.physicalSize = const Size(900, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
      navigatorKey: navigator,
      home: SupportFlowScreen(context: flowContext, submitter: submitter)));
  await tester.pumpAndSettle();
  await tester
      .tap(find.byKey(const ValueKey('support_safety_answer_no_danger')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('support_issue_scope_single')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Technisches Problem'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('App lädt nicht'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField), 'Synthetic private A draft.');
  return navigator;
}

void openBDialog(GlobalKey<NavigatorState> navigator) {
  unawaited(navigator.currentState!.push<void>(DialogRoute<void>(
    context: navigator.currentContext!,
    builder: (_) => const AlertDialog(title: Text('B owned dialog')),
  )));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({
        'auth_session_v1': jsonEncode(session('a')),
      }));

  testWidgets('switch before submit clears A draft and cannot dispatch under B',
      (tester) async {
    var calls = 0;
    await pumpDraft(tester, (_, __) async {
      calls++;
      return receipt();
    });
    await switchToB();
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNothing);
    expect(find.text('An Support schicken'), findsNothing);
    expect(find.byKey(const ValueKey('support_principal_changed')),
        findsOneWidget);
    expect(calls, 0);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final notify in [false, true]) {
    testWidgets('late A failure after B switch notify=$notify shows no B error',
        (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      final navigator = await pumpDraft(tester, (_, __) => pending.future);
      await tester.tap(find.text('An Support schicken'));
      await tester.pump();
      await switchToB(notify: notify);
      openBDialog(navigator);
      await tester.pump(const Duration(milliseconds: 400));
      pending.completeError(StateError('Synthetic A transport failure'));
      await tester.pumpAndSettle();
      expect(find.text('Support-Fall wurde nicht bestätigt'), findsNothing);
      expect(find.text('B owned dialog'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  for (final success in [true, false]) {
    testWidgets(
        'existing A ${success ? 'receipt' : 'failure'} dialog closes without closing B',
        (tester) async {
      final navigator = await pumpDraft(tester, (_, __) async {
        if (!success) throw StateError('Synthetic failure');
        return receipt();
      });
      await tester.tap(find.text('An Support schicken'));
      await tester.pump(const Duration(milliseconds: 500));
      expect(
          success
              ? find.byKey(const ValueKey('support_case_receipt'))
              : find.text('Support-Fall wurde nicht bestätigt'),
          findsOneWidget);
      openBDialog(navigator);
      await tester.pump(const Duration(milliseconds: 400));
      await switchToB();
      await tester.pumpAndSettle();
      expect(
          find.byKey(const ValueKey('support_case_receipt'),
              skipOffstage: false),
          findsNothing);
      expect(
          find.text('Support-Fall wurde nicht bestätigt', skipOffstage: false),
          findsNothing);
      expect(find.text('B owned dialog'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  test('principal controller never adopts B after initial invalidation',
      () async {
    final controller = SupportPrincipalController();
    await controller.ready;
    final owner = controller.capture()!;
    await switchToB();
    expect(controller.capture(), isNull);
    expect(await controller.isCurrent(owner), isFalse);
    expect(controller.invalidated, isTrue);
    controller.dispose();
  });

  test('expected A owner cannot bootstrap a B flow', () async {
    final owner =
        AuthService.captureSessionOwner((await AuthService.readSession())!);
    await switchToB(notify: false);
    final controller = SupportPrincipalController(expectedOwner: owner);
    await controller.ready;
    expect(controller.capture(), isNull);
    expect(controller.invalidated, isTrue);
    controller.dispose();
  });

  test('missing session cannot authorize a support action', () async {
    SharedPreferences.setMockInitialValues({});
    final controller = SupportPrincipalController();
    await controller.ready;
    expect(controller.capture(), isNull);
    controller.dispose();
  });
  for (final switchAccount in [false, true]) {
    testWidgets(
        switchAccount
            ? 'late A support receipt is not displayed in a successor B session'
            : 'stable A support receipt control succeeds', (tester) async {
      SharedPreferences.setMockInitialValues({
        'auth_session_v1': jsonEncode(session('a')),
      });
      final pending = Completer<Map<String, dynamic>>();
      final started = Completer<void>();
      final navigator = GlobalKey<NavigatorState>();
      tester.view.physicalSize = const Size(900, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(
        navigatorKey: navigator,
        home: SupportFlowScreen(
          context: const SupportFlowContext(
            itemTitle: '',
            itemId: '',
            requestId: '',
            bookingStatus: 'general',
            source: SupportFlowSource.helpCenter,
            role: SupportFlowRole.renter,
          ),
          submitter: (_, __) {
            started.complete();
            return pending.future;
          },
        ),
      ));
      await tester.pumpAndSettle();
      await tester
          .tap(find.byKey(const ValueKey('support_safety_answer_no_danger')));
      await tester.pumpAndSettle();
      await tester
          .tap(find.byKey(const ValueKey('support_issue_scope_single')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Technisches Problem'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('App lädt nicht'));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byType(TextField), 'Synthetic support regression only.');
      await tester.tap(find.text('An Support schicken'));
      await tester.pump();
      expect(started.isCompleted, isTrue);

      if (switchAccount) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_session_v1', jsonEncode(session('b')));
        SharedPersistenceSync.notify(
            SharedPersistenceSync.accountSecurityStateKey);
        await tester.pump();
        unawaited(navigator.currentState!.push<void>(DialogRoute<void>(
          context: navigator.currentContext!,
          builder: (_) => const AlertDialog(title: Text('B owned dialog')),
        )));
        await tester.pump(const Duration(milliseconds: 400));
      }
      pending.complete({
        'id': 'synthetic-support-case-a',
        'caseNumber': 'SIT-ABCDEFGHJKLM',
        'caseType': 'general_help',
        'caseSubType': 'app_error_or_display',
        'status': 'received',
        'nextUpdateAt': '2026-09-04T16:00:00.000Z',
        'nextUpdateDisplay': '04.09.2026, 18:00',
        'timezone': 'Europe/Berlin',
        'operatingMode': 'simulation',
      });
      await tester.pump(const Duration(milliseconds: 500));
      if (switchAccount) {
        expect(find.byKey(const ValueKey('support_case_receipt')), findsNothing,
            reason:
                'An A-owned server response must not be displayed under B.');
        expect(find.text('B owned dialog'), findsOneWidget,
            reason: 'Cancelling A must preserve the B-owned route.');
      } else {
        expect(
            find.byKey(const ValueKey('support_case_receipt')), findsOneWidget);
      }
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
