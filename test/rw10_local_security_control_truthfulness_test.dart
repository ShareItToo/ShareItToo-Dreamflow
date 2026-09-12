import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/account_security_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/screens/security_screen.dart';
import 'package:lendify/screens/two_factor_auth_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'offline security screen exposes no password or session simulation',
      (tester) async {
    const corruptSettings = '{corrupt-security-settings';
    const corruptDevices = '[corrupt-signed-in-devices';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'security_settings_v1': corruptSettings,
      'signed_in_devices_v1': corruptDevices,
    });

    await tester.pumpWidget(const MaterialApp(home: SecurityScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Kontosicherheit ist offline nicht verfügbar.'),
        findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Passwort ändern'), findsNothing);
    expect(find.text('2‑Faktor‑Authentifizierung aktivieren'), findsNothing);
    expect(find.text('Chrome Browser'), findsNothing);
    expect(find.text('iPhone'), findsNothing);
    expect(find.text('Alle Geräte abmelden'), findsNothing);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('security_settings_v1'), corruptSettings);
    expect(prefs.getString('signed_in_devices_v1'), corruptDevices);
  });

  testWidgets('retired two-factor preview cannot claim account protection',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});

    await tester.pumpWidget(
      const MaterialApp(home: TwoFactorAuthScreen()),
    );
    await tester.pumpAndSettle();

    expect(find.text('Zwei-Faktor-Schutz ist noch nicht verfügbar.'),
        findsOneWidget);
    expect(find.byType(Switch), findsNothing);
    expect(find.text('Aktiviert'), findsNothing);
    expect(find.text('SMS‑Code'), findsNothing);
    expect(find.text('Authenticator‑App'), findsNothing);
  });

  test('offline security service rejects every account-security mutation',
      () async {
    final service = _FakeSecurityService(available: false);

    await expectLater(service.getSessions(), throwsStateError);
    await expectLater(
      service.changePassword(
        currentPassword: _currentCredential,
        newPassword: _replacementCredential,
      ),
      throwsStateError,
    );
    await expectLater(
        service.revokeSession('remote-session'), throwsStateError);
    await expectLater(service.logoutAllSessions(), throwsStateError);

    expect(service.fetchCount, 0);
    expect(service.passwordChangeCount, 0);
    expect(service.revokeCount, 0);
    expect(service.logoutAllCount, 0);
    expect(service.clearCount, 0);
  });

  test('conditional local clear preserves a different or malformed session',
      () async {
    final exactRaw = jsonEncode(<String, Object?>{
      'userId': _sessionA.userId,
      'email': _sessionA.email,
      'sessionId': _sessionA.sessionId,
      'accessToken': _sessionA.accessToken,
      'refreshToken': _sessionA.refreshToken,
    });
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': exactRaw,
    });
    expect(
      await AuthService.clearSessionIfMatches(
        userId: _sessionB.userId!,
        sessionId: _sessionB.sessionId!,
        email: _sessionB.email,
      ),
      isFalse,
    );
    var prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('auth_session_v1'), exactRaw);

    expect(
      await AuthService.clearSessionIfMatches(
        userId: _sessionA.userId!,
        sessionId: _sessionA.sessionId!,
        email: _sessionA.email,
      ),
      isTrue,
    );
    prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('auth_session_v1'), isNull);

    const malformed = '{malformed-session';
    await prefs.setString('auth_session_v1', malformed);
    expect(
      await AuthService.clearSessionIfMatches(
        userId: _sessionA.userId!,
        sessionId: _sessionA.sessionId!,
        email: _sessionA.email,
      ),
      isFalse,
    );
    expect(prefs.getString('auth_session_v1'), malformed);
  });

  test('server sessions require one exact current session and strict fields',
      () async {
    final service = _FakeSecurityService(
      session: _sessionA,
      sessionPayload: _validSessionsA,
    );

    final devices = await service.getSessions();
    expect(devices.map((entry) => entry.id),
        <String>['session-a', 'remote-session']);
    expect(devices.singleWhere((entry) => entry.isThisDevice).id, 'session-a');

    for (final invalid in <List<Map<String, dynamic>>>[
      const <Map<String, dynamic>>[],
      <Map<String, dynamic>>[
        _validSessionsA.first,
        <String, dynamic>{..._validSessionsA.first},
      ],
      <Map<String, dynamic>>[
        <String, dynamic>{
          ..._validSessionsA.first,
          'isThisDevice': false,
        },
      ],
      <Map<String, dynamic>>[
        <String, dynamic>{
          ..._validSessionsA.first,
          'id': 'different-current-session',
        },
      ],
      <Map<String, dynamic>>[
        <String, dynamic>{
          ..._validSessionsA.first,
          'lastActive': 'not-a-timestamp',
        },
      ],
    ]) {
      service.sessionPayload = invalid;
      await expectLater(service.getSessions(), throwsFormatException);
    }
  });

  test('backend session envelope never drops malformed entries', () {
    expect(
      BackendRepository.strictAuthSessionsForTesting(<Object?>[
        <String, dynamic>{'id': 'session-a'},
      ]),
      <Map<String, dynamic>>[
        <String, dynamic>{'id': 'session-a'},
      ],
    );
    expect(
      () => BackendRepository.strictAuthSessionsForTesting(<Object?>[
        <String, dynamic>{'id': 'session-a'},
        'malformed-session',
      ]),
      throwsFormatException,
    );
    expect(
      () => BackendRepository.strictAuthSessionsForTesting(
        <String, dynamic>{'id': 'not-a-list'},
      ),
      throwsFormatException,
    );
  });

  test('session replacement rejects an in-flight session-list response',
      () async {
    final response = Completer<List<Map<String, dynamic>>>();
    final service = _FakeSecurityService(
      session: _sessionA,
      sessionPayload: _validSessionsA,
    )..fetchCompleter = response;

    final load = service.getSessions();
    service.session = _sessionB;
    response.complete(_validSessionsA);

    await expectLater(load, throwsStateError);
  });

  test('password and logout-all clear only the exact invoking session',
      () async {
    final passwordService = _FakeSecurityService(session: _sessionA);
    await passwordService.changePassword(
      currentPassword: _currentCredential,
      newPassword: _replacementCredential,
    );
    expect(passwordService.passwordChangeCount, 1);
    expect(passwordService.clearCount, 1);
    expect(passwordService.session, isNull);

    final stalePasswordService = _FakeSecurityService(session: _sessionA)
      ..replaceSessionDuringPasswordChange = true;
    await expectLater(
      stalePasswordService.changePassword(
        currentPassword: _currentCredential,
        newPassword: _replacementCredential,
      ),
      throwsA(
        isA<PasswordChangeFailure>().having(
          (failure) => failure.kind,
          'kind',
          PasswordChangeFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(stalePasswordService.clearCount, 0);
    expect(stalePasswordService.session, _sessionB);

    final replacementDuringPasswordClear = _FakeSecurityService(
      session: _sessionA,
    )..replaceSessionDuringClear = true;
    await expectLater(
      replacementDuringPasswordClear.changePassword(
        currentPassword: _currentCredential,
        newPassword: _replacementCredential,
      ),
      throwsA(
        isA<PasswordChangeFailure>().having(
          (failure) => failure.kind,
          'kind',
          PasswordChangeFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(replacementDuringPasswordClear.clearCount, 1);
    expect(replacementDuringPasswordClear.session, _sessionB);

    final logoutService = _FakeSecurityService(session: _sessionA);
    await logoutService.logoutAllSessions();
    expect(logoutService.logoutAllCount, 1);
    expect(logoutService.clearCount, 1);
    expect(logoutService.session, isNull);

    final staleLogoutService = _FakeSecurityService(session: _sessionA)
      ..replaceSessionDuringLogoutAll = true;
    await expectLater(
      staleLogoutService.logoutAllSessions(),
      throwsA(
        isA<LogoutAllFailure>().having(
          (failure) => failure.kind,
          'kind',
          LogoutAllFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(staleLogoutService.clearCount, 0);
    expect(staleLogoutService.session, _sessionB);

    final replacementDuringLogoutClear = _FakeSecurityService(
      session: _sessionA,
    )..replaceSessionDuringClear = true;
    await expectLater(
      replacementDuringLogoutClear.logoutAllSessions(),
      throwsA(
        isA<LogoutAllFailure>().having(
          (failure) => failure.kind,
          'kind',
          LogoutAllFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(replacementDuringLogoutClear.clearCount, 1);
    expect(replacementDuringLogoutClear.session, _sessionB);
  });

  test('remote-device revocation rejects current and stale-session actions',
      () async {
    final service = _FakeSecurityService(session: _sessionA);

    await expectLater(service.revokeSession('session-a'), throwsStateError);
    expect(service.revokeCount, 0);

    await service.revokeSession('remote-session');
    expect(service.revokedSessionId, 'remote-session');

    service
      ..session = _sessionA
      ..replaceSessionDuringRevoke = true;
    await expectLater(
      service.revokeSession('other-session'),
      throwsA(
        isA<SessionRevocationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              SessionRevocationFailureKind.confirmedLocalFinalizationFailed,
            )
            .having(
              (failure) => failure.targetSessionId,
              'targetSessionId',
              'other-session',
            )
            .having(
              (failure) => failure.invokingSessionDefinitelyCurrent,
              'invokingSessionDefinitelyCurrent',
              isFalse,
            ),
      ),
    );
    expect(service.session, _sessionB);
  });

  testWidgets('session event clears password fields and stale device UI',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final service = _FakeSecurityService(
      session: _sessionA,
      sessionPayload: _validSessionsA,
    );
    await tester.pumpWidget(
      MaterialApp(home: SecurityScreen(securityService: service)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Remote Browser'), findsOneWidget);

    final currentPassword =
        find.widgetWithText(TextField, 'Aktuelles Passwort');
    final newPassword = find.widgetWithText(TextField, 'Neues Passwort');
    await tester.enterText(currentPassword, 'Current-password-1');
    await tester.enterText(newPassword, 'Next-password-2');

    final nextLoad = Completer<List<Map<String, dynamic>>>();
    service
      ..session = _sessionB
      ..sessionPayload = _validSessionsB
      ..fetchCompleter = nextLoad;
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pump();

    expect(find.text('Remote Browser'), findsNothing);
    expect(
      tester.widget<TextField>(currentPassword).controller!.text,
      isEmpty,
    );
    expect(tester.widget<TextField>(newPassword).controller!.text, isEmpty);

    nextLoad.complete(_validSessionsB);
    await tester.pumpAndSettle();
    for (var index = 0;
        index < 8 && find.textContaining('Account B Phone').evaluate().isEmpty;
        index++) {
      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pump();
    }
    expect(find.textContaining('Account B Phone'), findsOneWidget);
    expect(find.text('Remote Browser'), findsNothing);
  });

  testWidgets('invalid server session list stays behind a persistent retry',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final service = _FakeSecurityService(
      session: _sessionA,
      sessionPayload: const <Map<String, dynamic>>[],
    );
    await tester.pumpWidget(
      MaterialApp(home: SecurityScreen(securityService: service)),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Die serverbestätigten Sicherheitsdaten konnten nicht geladen werden.',
      ),
      findsOneWidget,
    );
    expect(find.text('Erneut laden'), findsOneWidget);
    expect(find.text('Keine Geräte gefunden.'), findsNothing);

    service.sessionPayload = _validSessionsA;
    await tester.tap(find.text('Erneut laden'));
    await tester.pumpAndSettle();
    expect(find.text('Remote Browser'), findsOneWidget);
  });

  testWidgets('offline security truth remains scrollable at 200 percent text',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(2)),
          child: SecurityScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.dragUntilVisible(
      find.textContaining('Teile dein Passwort niemals'),
      find.byType(ListView),
      const Offset(0, -300),
    );
    expect(tester.takeException(), isNull);
    expect(
      find.textContaining('Teile dein Passwort niemals'),
      findsOneWidget,
    );
  });

  test('security wiring preserves only server routes and no local secret store',
      () async {
    final service =
        await File('lib/services/account_security_service.dart').readAsString();
    final dataService =
        await File('lib/services/data_service.dart').readAsString();
    final securityScreen =
        await File('lib/screens/security_screen.dart').readAsString();

    expect(service, contains('BackendRepository.getAuthSessions()'));
    expect(service, contains('BackendRepository.changePassword('));
    expect(service, contains('BackendRepository.revokeAuthSession(sessionId)'));
    expect(service, contains('BackendRepository.logoutAllSessions()'));
    expect(service, contains('AuthService.clearSessionIfMatches('));
    expect(service, isNot(contains('SharedPreferences')));
    expect(service, isNot(contains('debugPrint')));
    expect(dataService, isNot(contains('_seedSignedInDevices')));
    expect(dataService, isNot(contains('setSecuritySettings')));
    expect(securityScreen, isNot(contains('Future<void>.delayed')));
    expect(securityScreen, isNot(contains('security_settings_v1')));
    expect(securityScreen, isNot(contains('signed_in_devices_v1')));
  });
}

String get _currentCredential => <String>['current', 'fixture', '1'].join('-');

String get _replacementCredential =>
    <String>['replacement', 'fixture', '2'].join('-');

const _sessionA = AuthSession(
  userId: 'account-a',
  email: 'account-a@example.invalid',
  sessionId: 'session-a',
  accessToken: 'test-access-a',
  refreshToken: 'test-refresh-a',
);

const _sessionB = AuthSession(
  userId: 'account-b',
  email: 'account-b@example.invalid',
  sessionId: 'session-b',
  accessToken: 'test-access-b',
  refreshToken: 'test-refresh-b',
);

final _validSessionsA = <Map<String, dynamic>>[
  <String, dynamic>{
    'id': 'session-a',
    'name': 'Account A Phone',
    'location': 'Aktuelle Sitzung',
    'lastActive': '2026-08-25T12:00:00.000Z',
    'isThisDevice': true,
  },
  <String, dynamic>{
    'id': 'remote-session',
    'name': 'Remote Browser',
    'location': 'Letzte bekannte Sitzung',
    'lastActive': '2026-08-24T12:00:00.000Z',
    'isThisDevice': false,
  },
];

final _validSessionsB = <Map<String, dynamic>>[
  <String, dynamic>{
    'id': 'session-b',
    'name': 'Account B Phone',
    'location': 'Aktuelle Sitzung',
    'lastActive': '2026-08-25T13:00:00.000Z',
    'isThisDevice': true,
  },
];

class _FakeSecurityService extends AccountSecurityService {
  final bool available;
  AuthSession? session;
  List<Map<String, dynamic>> sessionPayload;
  Completer<List<Map<String, dynamic>>>? fetchCompleter;
  bool replaceSessionDuringPasswordChange = false;
  bool replaceSessionDuringLogoutAll = false;
  bool replaceSessionDuringRevoke = false;
  bool replaceSessionDuringClear = false;
  int fetchCount = 0;
  int passwordChangeCount = 0;
  int logoutAllCount = 0;
  int revokeCount = 0;
  int clearCount = 0;
  String? revokedSessionId;

  _FakeSecurityService({
    this.available = true,
    this.session,
    this.sessionPayload = const <Map<String, dynamic>>[],
  });

  @override
  bool get isAvailable => available;

  @override
  Future<AuthSession?> readSession() async => session;

  @override
  Future<List<Map<String, dynamic>>> fetchSessions() async {
    fetchCount += 1;
    final pending = fetchCompleter;
    fetchCompleter = null;
    return pending == null ? sessionPayload : pending.future;
  }

  @override
  Future<void> changeRemotePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    passwordChangeCount += 1;
    if (replaceSessionDuringPasswordChange) session = _sessionB;
  }

  @override
  Future<void> logoutAllRemoteSessions() async {
    logoutAllCount += 1;
    if (replaceSessionDuringLogoutAll) session = _sessionB;
  }

  @override
  Future<void> revokeRemoteSession(String sessionId) async {
    revokeCount += 1;
    revokedSessionId = sessionId;
    if (replaceSessionDuringRevoke) session = _sessionB;
  }

  @override
  Future<bool> clearCurrentSessionIfMatches({
    required String userId,
    required String sessionId,
    required String email,
  }) async {
    clearCount += 1;
    if (replaceSessionDuringClear) session = _sessionB;
    final current = session;
    if (current?.userId != userId ||
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
