import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/security.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/security_screen.dart';
import 'package:lendify/services/account_security_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'account A logout-all completion never navigates after account B activates',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final service = _PostLogoutSwitchSecurityService();
    await _startLogoutAll(tester, service);
    expect(service.logoutAllStarted, isTrue);

    service.completeLogoutAll();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(service.accountBActive, isTrue);
    expect(find.byType(LoginScreen), findsNothing);
    expect(find.byType(SecurityScreen), findsOneWidget);
  });

  testWidgets('same-session confirmed logout-all navigates to login',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final service = _PostLogoutSwitchSecurityService(
      activateAccountBOnCompletion: false,
    );
    await _startLogoutAll(tester, service);

    service.completeLogoutAll();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(service.definiteAbsenceChecks, 1);
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  test('explicit backend rejection is distinct and preserves account A',
      () async {
    final service = _ClassifyingLogoutSecurityService(
      remoteError: const BackendException(401, 'authentication_required'),
    );

    await expectLater(
      service.logoutAllSessions(),
      throwsA(_logoutFailure(LogoutAllFailureKind.rejected)),
    );
    expect(service.session, _sessionA);
    expect(service.clearCalls, 0);
  });

  test('unknown remote logout outcome clears only account A', () async {
    for (final remoteError in <Object>[
      TimeoutException('response lost'),
      const BackendException(503, 'service_unavailable'),
      const BackendException(204, 'invalid_server_response'),
    ]) {
      final service = _ClassifyingLogoutSecurityService(
        remoteError: remoteError,
      );

      await expectLater(
        service.logoutAllSessions(),
        throwsA(
          _logoutFailure(LogoutAllFailureKind.outcomeUnknown).having(
            (failure) => failure.localSessionDefinitelyCleared,
            'localSessionDefinitelyCleared',
            isTrue,
          ),
        ),
      );
      expect(service.session, isNull);
      expect(service.clearCalls, 1);
    }
  });

  test('confirmed remote logout reports local finalization failure', () async {
    final service = _ClassifyingLogoutSecurityService(clearResult: false);

    await expectLater(
      service.logoutAllSessions(),
      throwsA(
        _logoutFailure(
          LogoutAllFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(service.session, _sessionA);
    expect(service.clearCalls, 1);
  });

  test('confirmed account A logout never clears successor account B', () async {
    final service = _ClassifyingLogoutSecurityService(
      activateAccountBOnRemoteCompletion: true,
    );

    await expectLater(
      service.logoutAllSessions(),
      throwsA(
        _logoutFailure(
          LogoutAllFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(service.session, _sessionB);
    expect(service.clearCalls, 0);
  });

  test('unknown account A logout never clears successor account B', () async {
    final service = _ClassifyingLogoutSecurityService(
      remoteError: TimeoutException('response lost'),
      activateAccountBOnRemoteCompletion: true,
    );

    await expectLater(
      service.logoutAllSessions(),
      throwsA(
        _logoutFailure(LogoutAllFailureKind.outcomeUnknown).having(
          (failure) => failure.localSessionDefinitelyCleared,
          'localSessionDefinitelyCleared',
          isFalse,
        ),
      ),
    );
    expect(service.session, _sessionB);
    expect(service.clearCalls, 1);
  });

  for (final outcome in <(LogoutAllFailure, String)>[
    (
      const LogoutAllFailure.rejected(),
      'Geräte nicht abgemeldet',
    ),
    (
      const LogoutAllFailure.confirmedLocalFinalizationFailed(),
      'Geräte serverseitig abgemeldet',
    ),
    (
      const LogoutAllFailure.outcomeUnknown(
        localSessionDefinitelyCleared: false,
      ),
      'Ergebnis der Geräteabmeldung unklar',
    ),
  ]) {
    testWidgets('renders the distinct ${outcome.$1.kind.name} logout outcome',
        (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await _startLogoutAll(
        tester,
        _ImmediateLogoutFailureService(outcome.$1),
      );
      await tester.pump();

      expect(find.text(outcome.$2), findsOneWidget);
    });
  }

  testWidgets('unknown outcome remains visible after exact account A clear',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _startLogoutAll(
      tester,
      const _ImmediateLogoutFailureService(
        LogoutAllFailure.outcomeUnknown(
          localSessionDefinitelyCleared: true,
        ),
        emitSecurityEvent: true,
        localSessionDefinitelyAbsent: true,
      ),
    );
    await tester.pump();

    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsOneWidget);
  });

  testWidgets('unknown account A logout stays hidden after account B activates',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _startLogoutAll(
      tester,
      const _ImmediateLogoutFailureService(
        LogoutAllFailure.outcomeUnknown(
          localSessionDefinitelyCleared: false,
        ),
        emitSecurityEvent: true,
      ),
    );
    await tester.pump();

    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsNothing);
    expect(find.byType(SecurityScreen), findsOneWidget);
  });
}

TypeMatcher<LogoutAllFailure> _logoutFailure(LogoutAllFailureKind kind) =>
    isA<LogoutAllFailure>().having(
      (failure) => failure.kind,
      'kind',
      kind,
    );

Future<void> _startLogoutAll(
  WidgetTester tester,
  AccountSecurityService service,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider(
      create: (_) => DeveloperPreviewController(
        initialState: DeveloperUserState.loggedOut,
      ),
      child: MaterialApp(home: SecurityScreen(securityService: service)),
    ),
  );
  await tester.pumpAndSettle();

  final logoutAll = find.text('Alle Geräte abmelden');
  await tester.ensureVisible(logoutAll);
  await tester.pumpAndSettle();
  await tester.tap(logoutAll);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Alle abmelden'));
  await tester.pump();
}

class _PostLogoutSwitchSecurityService extends AccountSecurityService {
  final Completer<void> _logoutResponse = Completer<void>();
  final bool activateAccountBOnCompletion;
  bool accountBActive = false;
  bool logoutAllStarted = false;
  int definiteAbsenceChecks = 0;

  _PostLogoutSwitchSecurityService({
    this.activateAccountBOnCompletion = true,
  });

  @override
  bool get isAvailable => true;

  @override
  Future<List<SecurityDevice>> getSessions() async => <SecurityDevice>[
        SecurityDevice(
          id: accountBActive ? 'session-b' : 'session-a',
          name: accountBActive ? 'Account B Phone' : 'Account A Phone',
          location: 'Aktuelle Sitzung',
          lastActive: DateTime.utc(2026, 8, 25, 14),
          isThisDevice: true,
        ),
      ];

  @override
  Future<void> logoutAllSessions() async {
    logoutAllStarted = true;
    await _logoutResponse.future;
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    if (!activateAccountBOnCompletion) return;
    scheduleMicrotask(() {
      accountBActive = true;
      SharedPersistenceSync.notify(
        SharedPersistenceSync.accountSecurityStateKey,
      );
    });
  }

  @override
  Future<bool> isLocalSessionDefinitelyAbsent() async {
    definiteAbsenceChecks += 1;
    return !accountBActive;
  }

  void completeLogoutAll() {
    _logoutResponse.complete();
  }
}

final _sessionA = AuthSession(
  userId: 'account-a',
  email: 'account-a@example.invalid',
  sessionId: 'session-a',
  accessToken: <String>['synthetic', 'a', 'access'].join('-'),
  refreshToken: <String>['synthetic', 'a', 'refresh'].join('-'),
);

final _sessionB = AuthSession(
  userId: 'account-b',
  email: 'account-b@example.invalid',
  sessionId: 'session-b',
  accessToken: <String>['synthetic', 'b', 'access'].join('-'),
  refreshToken: <String>['synthetic', 'b', 'refresh'].join('-'),
);

class _ClassifyingLogoutSecurityService extends AccountSecurityService {
  final Object? remoteError;
  final bool clearResult;
  final bool activateAccountBOnRemoteCompletion;
  AuthSession? session = _sessionA;
  int clearCalls = 0;

  _ClassifyingLogoutSecurityService({
    this.remoteError,
    this.clearResult = true,
    this.activateAccountBOnRemoteCompletion = false,
  });

  @override
  bool get isAvailable => true;

  @override
  Future<AuthSession?> readSession() async => session;

  @override
  Future<void> logoutAllRemoteSessions() async {
    if (activateAccountBOnRemoteCompletion) session = _sessionB;
    final error = remoteError;
    if (error != null) throw error;
  }

  @override
  Future<bool> clearCurrentSessionIfMatches({
    required String userId,
    required String sessionId,
    required String email,
  }) async {
    clearCalls += 1;
    final current = session;
    if (!clearResult ||
        current?.userId != userId ||
        current?.sessionId != sessionId ||
        current?.email != email) {
      return false;
    }
    session = null;
    return true;
  }

  @override
  Future<bool> isLocalSessionDefinitelyAbsent() async => session == null;
}

class _ImmediateLogoutFailureService extends AccountSecurityService {
  final LogoutAllFailure failure;
  final bool emitSecurityEvent;
  final bool localSessionDefinitelyAbsent;

  const _ImmediateLogoutFailureService(
    this.failure, {
    this.emitSecurityEvent = false,
    this.localSessionDefinitelyAbsent = false,
  });

  @override
  bool get isAvailable => true;

  @override
  Future<List<SecurityDevice>> getSessions() async => <SecurityDevice>[
        SecurityDevice(
          id: 'session-a',
          name: 'Account A Phone',
          location: 'Aktuelle Sitzung',
          lastActive: DateTime.utc(2026, 8, 25, 14),
          isThisDevice: true,
        ),
      ];

  @override
  Future<void> logoutAllSessions() async {
    if (emitSecurityEvent) {
      SharedPersistenceSync.notify(
        SharedPersistenceSync.accountSecurityStateKey,
      );
    }
    throw failure;
  }

  @override
  Future<bool> isLocalSessionDefinitelyAbsent() async =>
      localSessionDefinitelyAbsent;
}
