import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/report_issue_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/safety_action_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/safety_action_interaction.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('return cases reject only exact structured server contracts', () {
    for (final error in const <BackendException>[
      BackendException(400, 'invalid_idempotency_key'),
      BackendException(400, 'v52_return_case_reason_code_invalid'),
      BackendException(400, 'v52_return_case_details_required'),
      BackendException(400, 'v52_return_case_evidence_required'),
      BackendException(400, 'v52_return_case_evidence_invalid'),
      BackendException(400, 'v52_return_case_contested_amount_invalid'),
      BackendException(400, 'v52_return_case_evidence_not_owned'),
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(401, 'account_not_active'),
      BackendException(403, 'action_blocked_by_moderation'),
      BackendException(403, 'v52_return_case_forbidden'),
      BackendException(404, 'booking_not_found'),
      BackendException(409, 'idempotency_key_reused'),
      BackendException(409, 'v52_handover_contract_binding_invalid'),
      BackendException(409, 'v52_return_case_contract_required'),
      BackendException(409, 'v52_return_case_wrong_booking_state'),
      BackendException(409, 'v52_return_report_window_not_open'),
      BackendException(409, 'v52_return_report_window_closed'),
      BackendException(409, 'v52_return_case_amount_exceeds_authorization'),
      BackendException(409, 'v52_active_return_case_exists'),
      BackendException(409, 'v52_return_case_already_recorded'),
      BackendException(409, 'v52_active_booking_report_exists'),
      BackendException(429, 'rate_limit_exceeded'),
    ]) {
      expect(
        SafetyActionService.classifyReturnCaseBackendFailure(error),
        SafetyActionFailureKind.rejected,
      );
    }
  });

  test('408 intermediary and unstructured return-case failures stay unknown',
      () {
    for (final error in const <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(404, 'not_found'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'request_failed'),
      BackendException(500, 'invalid_response'),
      BackendException(503, 'service_unavailable'),
    ]) {
      expect(
        SafetyActionService.classifyReturnCaseBackendFailure(error),
        SafetyActionFailureKind.outcomeUnknown,
      );
    }
  });

  test('Account A is checked before the return-case remote call', () async {
    final service = _ReturnCaseSafetyService()..activateAccountB();

    await expectLater(
      _submitHardIssue(service),
      throwsA(
        isA<SafetyActionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              SafetyActionFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAcceptedOrConfirmed,
              'remote accepted',
              false,
            ),
      ),
    );
    expect(service.returnCaseCalls, 0);
  });

  test('accepted Account A return case is never presented as Account B truth',
      () async {
    final remote = Completer<Map<String, dynamic>>();
    final service = _ReturnCaseSafetyService(returnCaseRemote: remote);
    final result = _submitHardIssue(service);

    await Future<void>.delayed(Duration.zero);
    expect(service.returnCaseCalls, 1);
    service.activateAccountB();
    remote.complete(<String, dynamic>{'returnCase': <String, dynamic>{}});

    await expectLater(
      result,
      throwsA(
        isA<SafetyActionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              SafetyActionFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAcceptedOrConfirmed,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('known rejection and unknown transport remain distinct', () async {
    final rejected = _ReturnCaseSafetyService(
      remoteFailure: const BackendException(
        409,
        'v52_return_report_window_closed',
      ),
    );
    await expectLater(
      _submitHardIssue(rejected),
      throwsA(
        isA<SafetyActionFailure>().having(
          (failure) => failure.kind,
          'kind',
          SafetyActionFailureKind.rejected,
        ),
      ),
    );

    final unknown = _ReturnCaseSafetyService(
      remoteFailure: const BackendException(408, 'request_timeout'),
    );
    await expectLater(
      _submitHardIssue(unknown),
      throwsA(
        isA<SafetyActionFailure>().having(
          (failure) => failure.kind,
          'kind',
          SafetyActionFailureKind.outcomeUnknown,
        ),
      ),
    );
  });

  testWidgets('invalidating A screen preserves a newer B dialog',
      (tester) async {
    final controller = SafetyActionInteractionController()
      ..replaceContext(_contextA);
    final navigatorKey = GlobalKey<NavigatorState>();
    final bHandle = TrackedDialogRouteHandle<void>();

    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        home: const Scaffold(body: Text('host')),
      ),
    );
    final aRoute = MaterialPageRoute<void>(
      builder: (_) => const Scaffold(body: Text('Account A issue screen')),
    );
    unawaited(navigatorKey.currentState!.push<void>(aRoute));
    await tester.pumpAndSettle();
    controller.trackOwnedScreenRoute(aRoute);
    unawaited(
      showTrackedDialog<void>(
        context: navigatorKey.currentContext!,
        handle: bHandle,
        barrierLabel: 'Account B dialog',
        builder: (_) => const AlertDialog(title: Text('Account B dialog')),
      ),
    );
    await tester.pumpAndSettle();

    controller.invalidate();
    await tester.pumpAndSettle();

    expect(
      find.text('Account A issue screen', skipOffstage: false),
      findsNothing,
    );
    expect(find.text('Account B dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
    controller.dispose();
  });

  testWidgets('late A issue response cannot show success under B',
      (tester) async {
    final remote = Completer<Map<String, dynamic>>();
    final service = _ReturnCaseSafetyService(bookingReportRemote: remote);
    final navigatorKey = GlobalKey<NavigatorState>();

    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        home: const Scaffold(body: Text('host')),
      ),
    );
    unawaited(
      navigatorKey.currentState!.push<void>(
        MaterialPageRoute<void>(
          builder: (_) => ReportIssueScreen(
            requestId: 'booking-a',
            itemTitle: 'Synthetischer Artikel',
            safetyActionService: service,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Verspätete Rückgabe'));
    await tester.pump();
    await tester.tap(find.text('Meldung senden'));
    await tester.pump();
    await tester.pump();
    expect(service.bookingReportCalls, 1);

    service.activateAccountB();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    remote.complete(<String, dynamic>{'id': 'accepted-a'});
    await tester.pumpAndSettle();

    expect(
        find.text('Deine Meldung wurde eindeutig gespeichert.'), findsNothing);
    expect(find.text('host'), findsOneWidget);
  });
}

Future<SafetyReturnCaseIssueResult> _submitHardIssue(
  SafetyActionService service,
) =>
    service.submitReturnCaseIssue(
      context: _contextA,
      requestId: 'booking-a',
      reasonCode: 'damage',
      idempotencyKey: 'return-case-account-a',
      details: 'Hard issue reported: damage - regression',
      evidenceNames: const <String>['evidence.jpg'],
      evidenceUploadIds: const <String>['00000000-0000-4000-8000-000000000001'],
      opensReview: true,
      contestedAuthorizedMinor: 500,
    );

final User _userA = buildTestUser(
  'account-a',
  name: 'Account A',
  email: 'account-a@example.invalid',
);
final User _userB = buildTestUser(
  'account-b',
  name: 'Account B',
  email: 'account-b@example.invalid',
);

SafetyActionContext _context(String id, User user, int epoch) =>
    SafetyActionContext(
      user: user,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: user.email,
          createdAt: DateTime.utc(2026, 9, 6, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
      localPrincipal: LocalPrincipalIdentity(
        token: 'principal-$id',
        authenticated: true,
      ),
    );

final SafetyActionContext _contextA = _context('account-a', _userA, 1);
final SafetyActionContext _contextB = _context('account-b', _userB, 2);

class _ReturnCaseSafetyService extends SafetyActionService {
  _ReturnCaseSafetyService({
    this.returnCaseRemote,
    this.bookingReportRemote,
    this.remoteFailure,
  });

  final Completer<Map<String, dynamic>>? returnCaseRemote;
  final Completer<Map<String, dynamic>>? bookingReportRemote;
  final BackendException? remoteFailure;
  SafetyActionContext activeContext = _contextA;
  int returnCaseCalls = 0;
  int bookingReportCalls = 0;

  void activateAccountB() => activeContext = _contextB;

  @override
  bool get backendEnabled => true;

  @override
  bool get qaRuntimeEnabled => false;

  @override
  Future<SafetyActionContext?> loadCurrentContext() async => activeContext;

  @override
  Future<bool> isContextCurrent(SafetyActionContext context) async =>
      identical(context, activeContext);

  @override
  Future<Map<String, dynamic>> openReturnCaseRemote({
    required SafetyActionContext context,
    required String requestId,
    required String reasonCode,
    required String details,
    required List<String> evidenceUploadIds,
    required int contestedAuthorizedMinor,
    required String idempotencyKey,
  }) async {
    returnCaseCalls += 1;
    final failure = remoteFailure;
    if (failure != null) throw failure;
    return returnCaseRemote?.future ??
        <String, dynamic>{'returnCase': <String, dynamic>{}};
  }

  @override
  Future<Map<String, dynamic>> createBookingIssueReportRemote({
    required SafetyActionContext context,
    required String requestId,
    required String reasonCode,
    required String details,
    required String idempotencyKey,
  }) async {
    bookingReportCalls += 1;
    final failure = remoteFailure;
    if (failure != null) throw failure;
    return bookingReportRemote?.future ?? <String, dynamic>{'id': 'report'};
  }
}
