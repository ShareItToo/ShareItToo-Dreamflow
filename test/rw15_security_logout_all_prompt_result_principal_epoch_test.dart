import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/security.dart';
import 'package:lendify/screens/security_screen.dart';
import 'package:lendify/services/account_security_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Account A logout-all confirmation cannot execute under B',
      (tester) async {
    final service = _SwitchableLogoutAllService();
    await _pumpSecurity(tester, service);
    await _openLogoutAllPrompt(tester);

    service.activateAccountB();
    await tester.pumpAndSettle();

    expect(service.logoutAllCalls, 0);
    expect(find.widgetWithText(FilledButton, 'Alle abmelden'), findsNothing);
    expect(find.text('Account B Phone (Dieses Gerät)'), findsOneWidget);
    expect(find.text('Geräte nicht abgemeldet'), findsNothing);
  });

  testWidgets('an open Account A logout-all outcome is dismissed under B',
      (tester) async {
    final service = _SwitchableLogoutAllService();
    await _pumpSecurity(tester, service);
    await _openLogoutAllPrompt(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Alle abmelden'));
    await tester.pumpAndSettle();

    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsOneWidget);

    service.activateAccountB();
    await tester.pumpAndSettle();

    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsNothing);
    expect(find.text('Account B Phone (Dieses Gerät)'), findsOneWidget);
  });

  testWidgets('dismissing A outcome never closes a newer B-owned dialog',
      (tester) async {
    final service = _SwitchableLogoutAllService();
    await _pumpSecurity(tester, service);
    await _openLogoutAllPrompt(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Alle abmelden'));
    await tester.pumpAndSettle();
    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsOneWidget);

    service.activateAccountB(notify: false);
    final bHandle = TrackedDialogRouteHandle<void>();
    unawaited(
      showTrackedDialog<void>(
        context: tester.element(find.byType(SecurityScreen)),
        handle: bHandle,
        barrierLabel: 'Account B eigener Dialog',
        builder: (_) => const AlertDialog(
          title: Text('Account B eigener Dialog'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    service.notifyAccountChange();
    await tester.pumpAndSettle();

    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsNothing);
    expect(find.text('Account B eigener Dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
  });

  test('only exact operation error contracts are definite rejections',
      () async {
    const commonAuthRejections = <BackendException>[
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(401, 'account_not_active'),
      BackendException(429, 'rate_limit_exceeded'),
    ];
    const passwordRejections = <BackendException>[
      ...commonAuthRejections,
      BackendException(400, 'password_too_short'),
      BackendException(400, 'password_too_long'),
      BackendException(400, 'password_too_weak'),
      BackendException(401, 'invalid_credentials'),
    ];
    const revocationRejections = <BackendException>[
      ...commonAuthRejections,
      BackendException(404, 'session_not_found'),
    ];

    for (final error in passwordRejections) {
      await _expectPasswordFailure(error, PasswordChangeFailureKind.rejected);
    }
    for (final error in commonAuthRejections) {
      await _expectLogoutFailure(error, LogoutAllFailureKind.rejected);
    }
    for (final error in revocationRejections) {
      await _expectRevocationFailure(
        error,
        SessionRevocationFailureKind.rejected,
      );
    }
  });

  test('408 intermediary and unstructured 4xx outcomes stay unknown', () async {
    const unsafeToClassify = <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(404, 'not_found'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'request_failed'),
      BackendException(400, 'invalid_server_response'),
      BackendException(503, 'service_unavailable'),
    ];

    for (final error in unsafeToClassify) {
      await _expectPasswordFailure(
        error,
        PasswordChangeFailureKind.outcomeUnknown,
      );
      await _expectLogoutFailure(error, LogoutAllFailureKind.outcomeUnknown);
      await _expectRevocationFailure(
        error,
        SessionRevocationFailureKind.outcomeUnknown,
      );
    }
  });
}

Future<void> _expectPasswordFailure(
  BackendException error,
  PasswordChangeFailureKind kind,
) async {
  final service = _ClassifyingSecurityService(error);
  await expectLater(
    service.changePassword(
      currentPassword: <String>['Current', 'password', '1'].join('-'),
      newPassword: <String>['Replacement', 'password', '2'].join('-'),
    ),
    throwsA(
      isA<PasswordChangeFailure>().having(
        (failure) => failure.kind,
        'kind',
        kind,
      ),
    ),
  );
}

Future<void> _expectLogoutFailure(
  BackendException error,
  LogoutAllFailureKind kind,
) async {
  final service = _ClassifyingSecurityService(error);
  await expectLater(
    service.logoutAllSessions(),
    throwsA(
      isA<LogoutAllFailure>().having(
        (failure) => failure.kind,
        'kind',
        kind,
      ),
    ),
  );
}

Future<void> _expectRevocationFailure(
  BackendException error,
  SessionRevocationFailureKind kind,
) async {
  final service = _ClassifyingSecurityService(error);
  await expectLater(
    service.revokeSession('remote-session'),
    throwsA(
      isA<SessionRevocationFailure>().having(
        (failure) => failure.kind,
        'kind',
        kind,
      ),
    ),
  );
}

Future<void> _pumpSecurity(
  WidgetTester tester,
  AccountSecurityService service,
) async {
  tester.view.physicalSize = const Size(800, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ChangeNotifierProvider(
      create: (_) => DeveloperPreviewController(
        initialState: DeveloperUserState.loggedOut,
      ),
      child: MaterialApp(home: SecurityScreen(securityService: service)),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openLogoutAllPrompt(WidgetTester tester) async {
  final logoutAll = find.text('Alle Geräte abmelden');
  await tester.ensureVisible(logoutAll);
  await tester.pumpAndSettle();
  await tester.tap(logoutAll);
  await tester.pumpAndSettle();
}

class _SwitchableLogoutAllService extends AccountSecurityService {
  bool accountBActive = false;
  int logoutAllCalls = 0;

  @override
  bool get isAvailable => true;

  @override
  Future<List<SecurityDevice>> getSessions() async => <SecurityDevice>[
        SecurityDevice(
          id: accountBActive ? 'session-b' : 'session-a',
          name: accountBActive ? 'Account B Phone' : 'Account A Phone',
          location: 'Aktuelle Sitzung',
          lastActive: DateTime.utc(2026, 8, 25, 18),
          isThisDevice: true,
        ),
      ];

  @override
  Future<void> logoutAllSessions() async {
    logoutAllCalls += 1;
    if (accountBActive) throw const LogoutAllFailure.rejected();
    throw const LogoutAllFailure.outcomeUnknown(
      localSessionDefinitelyCleared: false,
    );
  }

  void activateAccountB({bool notify = true}) {
    accountBActive = true;
    if (notify) notifyAccountChange();
  }

  void notifyAccountChange() {
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
  }
}

final _sessionA = AuthSession(
  userId: 'account-a',
  email: 'account-a@example.invalid',
  sessionId: 'session-a',
  accessToken: <String>['synthetic', 'a', 'access'].join('-'),
  refreshToken: <String>['synthetic', 'a', 'refresh'].join('-'),
);

class _ClassifyingSecurityService extends AccountSecurityService {
  final BackendException remoteError;

  _ClassifyingSecurityService(this.remoteError);

  @override
  bool get isAvailable => true;

  @override
  Future<AuthSession?> readSession() async => _sessionA;

  @override
  Future<void> changeRemotePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    throw remoteError;
  }

  @override
  Future<void> logoutAllRemoteSessions() async {
    throw remoteError;
  }

  @override
  Future<void> revokeRemoteSession(String sessionId) async {
    throw remoteError;
  }

  @override
  Future<bool> clearCurrentSessionIfMatches({
    required String userId,
    required String sessionId,
    required String email,
  }) async =>
      false;

  @override
  Future<bool> isLocalSessionDefinitelyAbsent() async => false;
}
