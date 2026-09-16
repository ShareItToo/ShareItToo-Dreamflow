import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/report_user_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/safety_action_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/safety_action_interaction.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('safety actions reject only exact structured backend contracts', () {
    for (final error in const <BackendException>[
      BackendException(400, 'invalid_block_target'),
      BackendException(400, 'invalid_report_target_type'),
      BackendException(400, 'invalid_report_target'),
      BackendException(400, 'invalid_report_reason'),
      BackendException(400, 'cannot_report_self'),
      BackendException(400, 'report_evidence_not_owned'),
      BackendException(400, 'invalid_harassment_block_report'),
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(401, 'account_not_active'),
      BackendException(403, 'report_target_forbidden'),
      BackendException(404, 'user_not_found'),
      BackendException(404, 'report_target_not_found'),
      BackendException(409, 'active_report_already_exists'),
      BackendException(409, 'harassment_block_report_idempotency_conflict'),
      BackendException(429, 'rate_limit_exceeded'),
    ]) {
      expect(
        SafetyActionService.classifyBackendFailure(error),
        SafetyActionFailureKind.rejected,
      );
    }
  });

  test('408 intermediary and unstructured safety failures stay unknown', () {
    for (final error in const <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(404, 'not_found'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'request_failed'),
      BackendException(500, 'invalid_upload_response'),
      BackendException(503, 'service_unavailable'),
    ]) {
      expect(
        SafetyActionService.classifyBackendFailure(error),
        SafetyActionFailureKind.outcomeUnknown,
      );
    }
  });

  test('Account A is checked immediately before remote block', () async {
    final service = _SwitchableSafetyActionService()..activateAccountB();

    await expectLater(
      service.blockUser(_contextA, 'target-user'),
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
    expect(service.blockCalls, 0);
    expect(service.localBlockCalls, 0);
  });

  test('accepted A block is never cached or shown as B truth', () async {
    final remote = Completer<void>();
    final service = _SwitchableSafetyActionService(blockRemote: remote);
    final result = service.blockUser(_contextA, 'target-user');

    await Future<void>.delayed(Duration.zero);
    expect(service.blockCalls, 1);
    service.activateAccountB();
    remote.complete();

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
    expect(service.localBlockCalls, 0);
  });

  test('accepted A report stays accepted truth after switch to B', () async {
    final remote = Completer<Map<String, dynamic>>();
    final service = _SwitchableSafetyActionService(reportRemote: remote);
    final result = service.submitReport(
      context: _contextA,
      reportedUserId: 'target-user',
      reasonCode: 'fraud_or_deception',
      idempotencyKey: 'report-account-a-1',
      details: 'Synthetischer Regressionstest',
      evidenceNames: const <String>[],
      evidenceUploadIds: const <String>[],
    );

    await Future<void>.delayed(Duration.zero);
    expect(service.reportCalls, 1);
    service.activateAccountB();
    remote.complete(<String, dynamic>{'id': 'report-a'});

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

  test('listing report preserves the exact listing target and owner', () async {
    final service = _SwitchableSafetyActionService();

    final result = await service.submitListingReport(
      context: _contextA,
      listingId: 'listing-a',
      listingOwnerUserId: 'listing-owner-a',
      reasonCode: 'fraud_or_deception',
      idempotencyKey: 'listing-report-account-a-1',
      details: 'Synthetischer Listing-Regressionstest',
      evidenceNames: const <String>[],
      evidenceUploadIds: const <String>[],
      reference: 'listing_options',
    );

    expect(result.directContactBlocked, isFalse);
    expect(service.listingReportCalls, 1);
    expect(service.lastListingId, 'listing-a');
  });

  test('accepted A listing report is never shown as B truth', () async {
    final remote = Completer<Map<String, dynamic>>();
    final service = _SwitchableSafetyActionService(
      listingReportRemote: remote,
    );
    final result = service.submitListingReport(
      context: _contextA,
      listingId: 'listing-a',
      listingOwnerUserId: 'listing-owner-a',
      reasonCode: 'inappropriate_behavior',
      idempotencyKey: 'listing-report-account-a-2',
      details: 'Synthetischer Listing-Regressionstest',
      evidenceNames: const <String>[],
      evidenceUploadIds: const <String>[],
    );

    await Future<void>.delayed(Duration.zero);
    expect(service.listingReportCalls, 1);
    service.activateAccountB();
    remote.complete(<String, dynamic>{'id': 'listing-report-a'});

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

  test('post-acceptance local block failure is not described as rejection',
      () async {
    final service = _SwitchableSafetyActionService(localBlockFails: true);

    await expectLater(
      service.blockUser(_contextA, 'target-user'),
      throwsA(
        isA<SafetyActionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              SafetyActionFailureKind.localUnavailable,
            )
            .having(
              (failure) => failure.remoteAcceptedOrConfirmed,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('safety action owner binds exact context and action epoch', () {
    final owner = SafetyActionOwner(context: _contextA, actionEpoch: 7);

    expect(
      owner.isSynchronouslyCurrent(context: _contextA, actionEpoch: 7),
      isTrue,
    );
    expect(
      owner.isSynchronouslyCurrent(context: _contextB, actionEpoch: 7),
      isFalse,
    );
    expect(
      owner.isSynchronouslyCurrent(context: _contextA, actionEpoch: 8),
      isFalse,
    );
  });

  testWidgets('dismissing A safety dialog preserves a newer B dialog',
      (tester) async {
    final controller = SafetyActionInteractionController()
      ..replaceContext(_contextA);
    final owner = controller.capture()!;
    final bHandle = TrackedDialogRouteHandle<void>();
    late BuildContext hostContext;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            hostContext = context;
            return const Scaffold(body: Text('host'));
          },
        ),
      ),
    );

    unawaited(
      controller.showOwnedDialog<void>(
        context: hostContext,
        owner: owner,
        builder: (_, dismiss) => AlertDialog(
          title: const Text('Account A safety dialog'),
          actions: [
            TextButton(onPressed: () => dismiss(null), child: const Text('OK')),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    unawaited(
      showTrackedDialog<void>(
        context: hostContext,
        handle: bHandle,
        barrierLabel: 'Account B dialog',
        builder: (_) => const AlertDialog(title: Text('Account B dialog')),
      ),
    );
    await tester.pumpAndSettle();

    controller.invalidate();
    await tester.pumpAndSettle();

    expect(find.text('Account A safety dialog'), findsNothing);
    expect(find.text('Account B dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
    controller.dispose();
  });

  testWidgets('delayed accepted A report result stays invisible under B',
      (tester) async {
    final target = buildTestUser(
      'target-user',
      name: 'Target User',
      email: 'target@example.invalid',
    );
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[
        _userA.toJson(),
        _userB.toJson(),
        target.toJson(),
      ]),
      'currentUser': jsonEncode(_userA.toJson()),
    });
    final remote = Completer<Map<String, dynamic>>();
    final service = _SwitchableSafetyActionService(reportRemote: remote);
    tester.view.physicalSize = const Size(800, 1500);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: ReportUserScreen(
          reportedUserId: target.id,
          safetyActionService: service,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Betrug / Täuschung'));
    await tester.pump();
    await tester.ensureVisible(find.text('Meldung senden'));
    await tester.tap(find.text('Meldung senden'));
    await tester.pump();
    await tester.pump();
    expect(service.reportCalls, 1);

    service.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    remote.complete(<String, dynamic>{'id': 'accepted-report-a'});
    await tester.pumpAndSettle();

    expect(find.text('Meldung gesendet'), findsNothing);
    expect(find.text('Meldung senden'), findsOneWidget);
    expect(find.text('Sendestatus unklar'), findsNothing);
  });

  testWidgets('listing report UI submits an exact listing target',
      (tester) async {
    final listingOwner = buildTestUser(
      'listing-owner',
      name: 'Listing Owner',
      email: 'listing-owner@example.invalid',
    );
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[
        _userA.toJson(),
        listingOwner.toJson(),
      ]),
      'currentUser': jsonEncode(_userA.toJson()),
    });
    final service = _SwitchableSafetyActionService();
    tester.view.physicalSize = const Size(800, 1500);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: ReportUserScreen(
          reportedUserId: listingOwner.id,
          reportedListingId: 'listing-target',
          reportedListingTitle: 'Synthetischer Akkuschrauber',
          reference: 'listing_options',
          safetyActionService: service,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Anzeige melden'), findsOneWidget);
    expect(find.text('Synthetischer Akkuschrauber'), findsOneWidget);
    expect(find.text('Beleidigung / Belästigung'), findsNothing);
    expect(find.text('Problem bei Übergabe'), findsNothing);
    await tester.tap(find.text('Betrug / Täuschung'));
    await tester.pump();
    await tester.ensureVisible(find.text('Meldung senden'));
    await tester.tap(find.text('Meldung senden'));
    await tester.pumpAndSettle();

    expect(service.listingReportCalls, 1);
    expect(service.lastListingId, 'listing-target');
    expect(find.text('Meldung gesendet'), findsOneWidget);
  });
}

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
        token: LocalPrincipalScope.tokenForUserId(id),
        authenticated: true,
      ),
    );

final SafetyActionContext _contextA = _context('account-a', _userA, 1);
final SafetyActionContext _contextB = _context('account-b', _userB, 2);

class _SwitchableSafetyActionService extends SafetyActionService {
  final Completer<void>? blockRemote;
  final Completer<Map<String, dynamic>>? reportRemote;
  final Completer<Map<String, dynamic>>? listingReportRemote;
  final bool localBlockFails;
  SafetyActionContext activeContext = _contextA;
  int blockCalls = 0;
  int reportCalls = 0;
  int listingReportCalls = 0;
  int localBlockCalls = 0;
  String? lastListingId;

  _SwitchableSafetyActionService({
    this.blockRemote,
    this.reportRemote,
    this.listingReportRemote,
    this.localBlockFails = false,
  });

  void activateAccountB() => activeContext = _contextB;

  @override
  Future<SafetyActionContext?> loadCurrentContext() async => activeContext;

  @override
  bool get backendEnabled => true;

  @override
  bool get qaRuntimeEnabled => false;

  @override
  Future<bool> isContextCurrent(SafetyActionContext context) async =>
      identical(context, activeContext);

  @override
  Future<void> blockUserRemote(
    SafetyActionContext context,
    String userId,
  ) async {
    blockCalls += 1;
    if (blockRemote != null) await blockRemote!.future;
  }

  @override
  Future<void> blockUserLocal(
    SafetyActionContext context,
    String userId,
  ) async {
    localBlockCalls += 1;
    if (localBlockFails) throw StateError('synthetic local failure');
  }

  @override
  Future<Map<String, dynamic>> createReportRemote({
    required SafetyActionContext context,
    required String reportedUserId,
    required String reasonCode,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceUploadIds,
    String? reference,
  }) async {
    reportCalls += 1;
    return reportRemote == null
        ? <String, dynamic>{'id': 'report-a'}
        : reportRemote!.future;
  }

  @override
  Future<Map<String, dynamic>> createListingReportRemote({
    required SafetyActionContext context,
    required String listingId,
    required String reasonCode,
    required String idempotencyKey,
    required String details,
    required List<String> evidenceUploadIds,
    String? reference,
  }) async {
    listingReportCalls += 1;
    lastListingId = listingId;
    return listingReportRemote == null
        ? <String, dynamic>{'id': 'listing-report-a'}
        : listingReportRemote!.future;
  }
}
