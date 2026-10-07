import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/rental_request_decision_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/widgets/rental_request_decision_interaction.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('request decision rejects only exact structured backend contracts', () {
    for (final error in const <BackendException>[
      BackendException(400, 'invalid_booking_transition'),
      BackendException(400, 'invalid_booking_status'),
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(403, 'booking_forbidden'),
      BackendException(404, 'booking_not_found'),
      BackendException(409, 'booking_revision_conflict'),
      BackendException(409, 'booking_request_expired'),
      BackendException(409, 'invalid_status_transition'),
      BackendException(429, 'rate_limit_exceeded'),
    ]) {
      expect(
        RentalRequestDecisionService.classifyBackendFailure(error),
        RentalRequestDecisionFailureKind.rejected,
      );
    }
  });

  test('408 intermediary and unstructured request failures stay unknown', () {
    for (final error in const <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(404, 'not_found'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'request_failed'),
      BackendException(503, 'service_unavailable'),
    ]) {
      expect(
        RentalRequestDecisionService.classifyBackendFailure(error),
        RentalRequestDecisionFailureKind.outcomeUnknown,
      );
    }
  });

  test('Account A is checked immediately before request decision', () async {
    final service = _SwitchableDecisionService()..activateAccountB();

    await expectLater(
      service.execute(
        context: _contextA,
        request: _requestA,
        status: 'declined',
      ),
      throwsA(
        isA<RentalRequestDecisionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              RentalRequestDecisionFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              false,
            ),
      ),
    );
    expect(service.mutationCalls, 0);
  });

  test('accepted Account A decision remains accepted truth after switch to B',
      () async {
    final remote = Completer<AccountRentalRequestMutationResult>();
    final service = _SwitchableDecisionService(mutation: remote);
    final result = service.execute(
      context: _contextA,
      request: _requestA,
      status: 'accepted',
    );

    await Future<void>.delayed(Duration.zero);
    expect(service.mutationCalls, 1);
    service.activateAccountB();
    remote.complete(AccountRentalRequestMutationResult(
      request: RentalRequest.fromJson(<String, dynamic>{
        ..._requestA.toJson(),
        'status': 'accepted',
      }),
      remoteAccepted: true,
    ));

    await expectLater(
      result,
      throwsA(
        isA<RentalRequestDecisionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              RentalRequestDecisionFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('post-acceptance local failure remains server-confirmed truth',
      () async {
    final service = _SwitchableDecisionService(
      failure: const AccountRentalRequestMutationFailure.localUnavailable(
        'local_request_decision_persistence_failed',
        remoteAccepted: true,
      ),
    );

    await expectLater(
      service.execute(
        context: _contextA,
        request: _requestA,
        status: 'accepted',
      ),
      throwsA(
        isA<RentalRequestDecisionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              RentalRequestDecisionFailureKind.localUnavailable,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('owner-bound local decision rolls back on mid-write account change',
      () async {
    final rawRequests = jsonEncode(<Object>[_requestA.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[_userA.toJson()]),
      'currentUser': jsonEncode(_userA.toJson()),
      'rental_requests': rawRequests,
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': _userA.id,
        'sessionId': 'persisted-session-a',
        'email': _userA.email,
        'createdAt': '2026-09-13T07:00:00.000Z',
      }),
    });
    final session = await AuthService.readSession();
    expect(session, isNotNull);
    final owner = AuthService.captureSessionOwner(session!);
    DataService
        .simulatePrincipalChangeDuringNextRentalRequestPersistenceForTesting();

    await expectLater(
      DataService.updateRentalRequestStatusForOwner(
        owner: owner,
        expectedOwnerId: _userA.id,
        requestId: _requestA.id,
        status: 'declined',
      ),
      throwsA(
        isA<AccountRentalRequestMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              AccountRentalRequestMutationFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              false,
            ),
      ),
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('rental_requests'), rawRequests);
  });

  testWidgets('dismissing A decision dialog preserves a newer B dialog',
      (tester) async {
    final contextA = _decisionContext(
      'account-a',
      _userA,
      AuthService.sessionEpoch,
    );
    final controller = RentalRequestDecisionInteractionController()
      ..replaceContext(contextA);
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
        builder: (_, __) =>
            const AlertDialog(title: Text('Account A decision')),
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

    expect(find.text('Account A decision'), findsNothing);
    expect(find.text('Account B dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
    controller.dispose();
  });
}

final _userA = buildTestUser(
  'account-a',
  name: 'Account A',
  email: 'account-a@example.invalid',
);
final _userB = buildTestUser(
  'account-b',
  name: 'Account B',
  email: 'account-b@example.invalid',
);

RentalRequestDecisionContext _decisionContext(
  String id,
  User user,
  int epoch,
) =>
    RentalRequestDecisionContext(
      user: user,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: user.email,
          createdAt: DateTime.utc(2026, 9, 13, 7, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
    );

final _contextA = _decisionContext('account-a', _userA, 1);
final _contextB = _decisionContext('account-b', _userB, 2);
final _requestA = buildTestRequest(
  id: 'request-a',
  itemId: 'listing-a',
  ownerId: _userA.id,
  renterId: 'renter-a',
  status: 'pending',
);

class _SwitchableDecisionService extends RentalRequestDecisionService {
  final Completer<AccountRentalRequestMutationResult>? mutation;
  final AccountRentalRequestMutationFailure? failure;
  bool accountBActive = false;
  int mutationCalls = 0;

  _SwitchableDecisionService({this.mutation, this.failure});

  @override
  Future<RentalRequestDecisionContext?> loadCurrentContext() async =>
      accountBActive ? _contextB : _contextA;

  @override
  Future<bool> isContextCurrent(RentalRequestDecisionContext context) async =>
      accountBActive
          ? identical(context, _contextB)
          : identical(context, _contextA);

  @override
  Future<AccountRentalRequestMutationResult> performDecision({
    required RentalRequestDecisionContext context,
    required RentalRequest request,
    required String status,
    List<Map<String, dynamic>>? legalDeclarations,
  }) {
    mutationCalls += 1;
    if (failure case final failure?) {
      return Future<AccountRentalRequestMutationResult>.error(failure);
    }
    return mutation?.future ??
        Future<AccountRentalRequestMutationResult>.value(
          AccountRentalRequestMutationResult(
            request: RentalRequest.fromJson(<String, dynamic>{
              ...request.toJson(),
              'status': status,
            }),
            remoteAccepted: false,
          ),
        );
  }

  void activateAccountB() => accountBActive = true;
}
