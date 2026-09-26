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
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'account A password success is never rendered after account B activates',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final service = _PostServiceSwitchSecurityService();
    await _startPasswordChange(tester, service);
    expect(service.passwordChangeStarted, isTrue);

    service.completePasswordChange();
    await tester.pump();
    await tester.pump();

    expect(service.accountBActive, isTrue);
    expect(service.definiteAbsenceChecks, 1);
    expect(find.text('Passwort geändert'), findsNothing);
    expect(find.text('Bitte melde dich erneut an.'), findsNothing);
    expect(find.byType(SecurityScreen), findsOneWidget);
  });

  testWidgets('same-session confirmed clear retains password success UI',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final service = _PostServiceSwitchSecurityService(
      activateAccountBOnCompletion: false,
    );
    await _startPasswordChange(tester, service);

    service.completePasswordChange();
    await tester.pump();
    await tester.pump();

    expect(service.accountBActive, isFalse);
    expect(service.definiteAbsenceChecks, 1);
    expect(find.text('Passwort geändert'), findsOneWidget);
    expect(find.text('Bitte melde dich erneut an.'), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(milliseconds: 250));
  });

  test('definite session absence distinguishes missing from stored bytes',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    expect(await AuthService.isStoredSessionDefinitelyAbsent(), isTrue);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_session_v1', '{malformed-session');
    expect(await AuthService.isStoredSessionDefinitelyAbsent(), isFalse);

    await prefs.setString('auth_session_v1', 'opaque-active-session');
    expect(await AuthService.isStoredSessionDefinitelyAbsent(), isFalse);
  });

  test('explicit backend rejection is distinct and preserves account A',
      () async {
    final service = _ClassifyingSecurityService(
      remoteError: const BackendException(401, 'invalid_credentials'),
    );

    await expectLater(
      service.changePassword(
        currentPassword: _currentCredential,
        newPassword: _replacementCredential,
      ),
      throwsA(_passwordFailure(PasswordChangeFailureKind.rejected)),
    );
    expect(service.session, _sessionA);
    expect(service.clearCalls, 0);
  });

  test('unknown remote outcome clears only account A and is not rejection',
      () async {
    for (final remoteError in <Object>[
      TimeoutException('response lost'),
      const BackendException(503, 'service_unavailable'),
    ]) {
      final service = _ClassifyingSecurityService(remoteError: remoteError);

      await expectLater(
        service.changePassword(
          currentPassword: _currentCredential,
          newPassword: _replacementCredential,
        ),
        throwsA(
          _passwordFailure(PasswordChangeFailureKind.outcomeUnknown).having(
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

  test('confirmed remote change reports local finalization failure', () async {
    final service = _ClassifyingSecurityService(clearResult: false);

    await expectLater(
      service.changePassword(
        currentPassword: _currentCredential,
        newPassword: _replacementCredential,
      ),
      throwsA(
        _passwordFailure(
          PasswordChangeFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(service.session, _sessionA);
    expect(service.clearCalls, 1);
  });

  test('confirmed account A change never clears successor account B', () async {
    final service = _ClassifyingSecurityService(
      activateAccountBOnRemoteCompletion: true,
    );

    await expectLater(
      service.changePassword(
        currentPassword: _currentCredential,
        newPassword: _replacementCredential,
      ),
      throwsA(
        _passwordFailure(
          PasswordChangeFailureKind.confirmedLocalFinalizationFailed,
        ),
      ),
    );
    expect(service.session, _sessionB);
    expect(service.clearCalls, 0);
  });

  for (final outcome in <(PasswordChangeFailure, String)>[
    (
      const PasswordChangeFailure.rejected(),
      'Passwort nicht geändert',
    ),
    (
      const PasswordChangeFailure.confirmedLocalFinalizationFailed(),
      'Passwort serverseitig geändert',
    ),
    (
      const PasswordChangeFailure.outcomeUnknown(
        localSessionDefinitelyCleared: false,
      ),
      'Ergebnis der Passwortänderung unklar',
    ),
  ]) {
    testWidgets('renders the distinct ${outcome.$1.kind.name} outcome',
        (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await _startPasswordChange(
        tester,
        _ImmediateFailureSecurityService(outcome.$1),
      );
      await tester.pump();

      expect(find.text(outcome.$2), findsOneWidget);
    });
  }

  testWidgets('unknown outcome remains visible after the exact A clear event',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _startPasswordChange(
      tester,
      const _ImmediateFailureSecurityService(
        PasswordChangeFailure.outcomeUnknown(
          localSessionDefinitelyCleared: true,
        ),
        emitSecurityEvent: true,
        localSessionDefinitelyAbsent: true,
      ),
    );
    await tester.pump();

    expect(find.text('Ergebnis der Passwortänderung unklar'), findsOneWidget);
  });

  testWidgets(
      'unknown account A outcome stays hidden after account B activates',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _startPasswordChange(
      tester,
      const _ImmediateFailureSecurityService(
        PasswordChangeFailure.outcomeUnknown(
          localSessionDefinitelyCleared: false,
        ),
        emitSecurityEvent: true,
        localSessionDefinitelyAbsent: false,
      ),
    );
    await tester.pump();

    expect(find.text('Ergebnis der Passwortänderung unklar'), findsNothing);
    expect(find.byType(SecurityScreen), findsOneWidget);
  });
}

TypeMatcher<PasswordChangeFailure> _passwordFailure(
  PasswordChangeFailureKind kind,
) =>
    isA<PasswordChangeFailure>().having(
      (failure) => failure.kind,
      'kind',
      kind,
    );

Future<void> _startPasswordChange(
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

  await tester.enterText(
    find.widgetWithText(TextField, 'Aktuelles Passwort'),
    _currentCredential,
  );
  await tester.enterText(
    find.widgetWithText(TextField, 'Neues Passwort'),
    _replacementCredential,
  );
  await tester.enterText(
    find.widgetWithText(TextField, 'Neues Passwort bestätigen'),
    _replacementCredential,
  );
  final submit = find.text('Passwort ändern');
  await tester.ensureVisible(submit);
  await tester.pumpAndSettle();
  await tester.tap(submit);
  await tester.pump();
}

final _currentCredential = <String>['Current', 'password', '1'].join('-');
final _replacementCredential =
    <String>['Replacement', 'password', '2'].join('-');

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

class _ClassifyingSecurityService extends AccountSecurityService {
  final Object? remoteError;
  final bool clearResult;
  final bool activateAccountBOnRemoteCompletion;
  AuthSession? session = _sessionA;
  int clearCalls = 0;

  _ClassifyingSecurityService({
    this.remoteError,
    this.clearResult = true,
    this.activateAccountBOnRemoteCompletion = false,
  });

  @override
  bool get isAvailable => true;

  @override
  Future<AuthSession?> readSession() async => session;

  @override
  Future<void> changeRemotePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final error = remoteError;
    if (error != null) throw error;
    if (activateAccountBOnRemoteCompletion) session = _sessionB;
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

class _ImmediateFailureSecurityService extends AccountSecurityService {
  final PasswordChangeFailure failure;
  final bool emitSecurityEvent;
  final bool localSessionDefinitelyAbsent;

  const _ImmediateFailureSecurityService(
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
          lastActive: DateTime.utc(2026, 8, 25, 13),
          isThisDevice: true,
        ),
      ];

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
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

class _PostServiceSwitchSecurityService extends AccountSecurityService {
  final Completer<void> _passwordResponse = Completer<void>();
  final bool activateAccountBOnCompletion;
  bool accountBActive = false;
  bool passwordChangeStarted = false;
  int definiteAbsenceChecks = 0;

  _PostServiceSwitchSecurityService({
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
          lastActive: DateTime.utc(2026, 8, 25, 13),
          isThisDevice: true,
        ),
      ];

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    passwordChangeStarted = true;
    await _passwordResponse.future;
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

  void completePasswordChange() {
    _passwordResponse.complete();
  }
}
