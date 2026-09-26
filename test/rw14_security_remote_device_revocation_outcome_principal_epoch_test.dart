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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('explicit backend rejection is distinct and remains Account A scoped',
      () async {
    final service = _ClassifyingRevocationService(
      remoteError: const BackendException(404, 'session_not_found'),
    );

    await expectLater(
      service.revokeSession('remote-session'),
      throwsA(
        _revocationFailure(SessionRevocationFailureKind.rejected)
            .having(
              (failure) => failure.targetSessionId,
              'targetSessionId',
              'remote-session',
            )
            .having(
              (failure) => failure.invokingSessionDefinitelyCurrent,
              'invokingSessionDefinitelyCurrent',
              isTrue,
            ),
      ),
    );
    expect(service.session, _sessionA);
  });

  test('timeout 5xx and invalid response remain outcome unknown', () async {
    for (final remoteError in <Object>[
      TimeoutException('response lost'),
      const BackendException(503, 'service_unavailable'),
      const BackendException(204, 'invalid_server_response'),
    ]) {
      final service = _ClassifyingRevocationService(remoteError: remoteError);

      await expectLater(
        service.revokeSession('remote-session'),
        throwsA(
          _revocationFailure(SessionRevocationFailureKind.outcomeUnknown)
              .having(
            (failure) => failure.invokingSessionDefinitelyCurrent,
            'invokingSessionDefinitelyCurrent',
            isTrue,
          ),
        ),
      );
      expect(service.session, _sessionA);
    }
  });

  test(
      'confirmed Account A revocation reports unsafe local finalization under B',
      () async {
    final service = _ClassifyingRevocationService(
      activateAccountBOnRemoteCompletion: true,
    );

    await expectLater(
      service.revokeSession('remote-session'),
      throwsA(
        _revocationFailure(
          SessionRevocationFailureKind.confirmedLocalFinalizationFailed,
        ).having(
          (failure) => failure.invokingSessionDefinitelyCurrent,
          'invokingSessionDefinitelyCurrent',
          isFalse,
        ),
      ),
    );
    expect(service.session, _sessionB);
  });

  test('unknown Account A revocation never becomes safe to present under B',
      () async {
    final service = _ClassifyingRevocationService(
      remoteError: TimeoutException('response lost'),
      activateAccountBOnRemoteCompletion: true,
    );

    await expectLater(
      service.revokeSession('remote-session'),
      throwsA(
        _revocationFailure(SessionRevocationFailureKind.outcomeUnknown).having(
          (failure) => failure.invokingSessionDefinitelyCurrent,
          'invokingSessionDefinitelyCurrent',
          isFalse,
        ),
      ),
    );
    expect(service.session, _sessionB);
  });

  test('current-session target remains a preflight rejection', () async {
    final service = _ClassifyingRevocationService();

    await expectLater(service.revokeSession('session-a'), throwsStateError);
    expect(service.remoteCalls, 0);
  });

  for (final outcome in <(SessionRevocationFailure, String)>[
    (
      const SessionRevocationFailure.rejected(
        targetSessionId: 'remote-session',
        invokingSessionDefinitelyCurrent: true,
      ),
      'Geräteabmeldung abgelehnt',
    ),
    (
      const SessionRevocationFailure.confirmedLocalFinalizationFailed(
        targetSessionId: 'remote-session',
        invokingSessionDefinitelyCurrent: true,
      ),
      'Gerät serverseitig abgemeldet',
    ),
    (
      const SessionRevocationFailure.outcomeUnknown(
        targetSessionId: 'remote-session',
        invokingSessionDefinitelyCurrent: true,
      ),
      'Ergebnis der Geräteabmeldung unklar',
    ),
  ]) {
    testWidgets('renders ${outcome.$1.kind.name} without a false empty list',
        (tester) async {
      final service = _ImmediateRevocationFailureService(outcome.$1);
      await _startRevocation(tester, service);

      expect(find.text(outcome.$2), findsOneWidget);
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      expect(find.text('Remote Browser'), findsNothing);
      expect(
        find.text(
          'Die Sitzungsliste ist nach der Geräteaktion nicht mehr sicher '
          'aktuell.',
        ),
        findsOneWidget,
      );
      expect(find.text('Erneut laden'), findsOneWidget);
    });
  }

  testWidgets('unsafe Account A outcome is hidden even without an epoch event',
      (tester) async {
    await _startRevocation(
      tester,
      const _ImmediateRevocationFailureService(
        SessionRevocationFailure.outcomeUnknown(
          targetSessionId: 'remote-session',
          invokingSessionDefinitelyCurrent: false,
        ),
      ),
    );

    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsNothing);
    expect(find.text('Remote Browser'), findsOneWidget);
  });

  testWidgets('Account A confirmation cannot revoke its stale target under B',
      (tester) async {
    final service = _PromptSwitchRevocationService();
    await _pumpSecurity(tester, service);
    await _openRevocationPrompt(tester);

    service.activateAccountB();
    await tester.pumpAndSettle();

    expect(service.revokeCalls, 0);
    expect(find.widgetWithText(FilledButton, 'Abmelden'), findsNothing);
    expect(find.text('Account B Phone (Dieses Gerät)'), findsOneWidget);
    expect(find.text('Remote Browser'), findsNothing);
  });

  testWidgets('an already open Account A outcome is dismissed when B activates',
      (tester) async {
    final service = _PopupSwitchRevocationService();
    await _startRevocation(tester, service);
    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsOneWidget);

    service.activateAccountB();
    await tester.pumpAndSettle();

    expect(find.text('Ergebnis der Geräteabmeldung unklar'), findsNothing);
    expect(find.text('Account B Phone (Dieses Gerät)'), findsOneWidget);
  });
}

TypeMatcher<SessionRevocationFailure> _revocationFailure(
  SessionRevocationFailureKind kind,
) =>
    isA<SessionRevocationFailure>().having(
      (failure) => failure.kind,
      'kind',
      kind,
    );

Future<void> _startRevocation(
  WidgetTester tester,
  AccountSecurityService service,
) async {
  await _pumpSecurity(tester, service);
  await _openRevocationPrompt(tester);
  await tester.tap(find.widgetWithText(FilledButton, 'Abmelden'));
  await tester.pumpAndSettle();
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

Future<void> _openRevocationPrompt(WidgetTester tester) async {
  final remoteDevice = find.text('Remote Browser');
  await tester.ensureVisible(remoteDevice);
  await tester.pumpAndSettle();
  final signOut = find.widgetWithText(TextButton, 'Abmelden');
  await tester.tap(signOut);
  await tester.pumpAndSettle();
}

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

final _devicesA = <SecurityDevice>[
  SecurityDevice(
    id: 'session-a',
    name: 'Account A Phone',
    location: 'Aktuelle Sitzung',
    lastActive: DateTime.utc(2026, 8, 25, 14),
    isThisDevice: true,
  ),
  SecurityDevice(
    id: 'remote-session',
    name: 'Remote Browser',
    location: 'Letzte bekannte Sitzung',
    lastActive: DateTime.utc(2026, 8, 25, 13),
    isThisDevice: false,
  ),
];

final _devicesB = <SecurityDevice>[
  SecurityDevice(
    id: 'session-b',
    name: 'Account B Phone',
    location: 'Aktuelle Sitzung',
    lastActive: DateTime.utc(2026, 8, 25, 15),
    isThisDevice: true,
  ),
];

class _ClassifyingRevocationService extends AccountSecurityService {
  final Object? remoteError;
  final bool activateAccountBOnRemoteCompletion;
  AuthSession? session = _sessionA;
  int remoteCalls = 0;

  _ClassifyingRevocationService({
    this.remoteError,
    this.activateAccountBOnRemoteCompletion = false,
  });

  @override
  bool get isAvailable => true;

  @override
  Future<AuthSession?> readSession() async => session;

  @override
  Future<void> revokeRemoteSession(String sessionId) async {
    remoteCalls += 1;
    if (activateAccountBOnRemoteCompletion) session = _sessionB;
    final error = remoteError;
    if (error != null) throw error;
  }
}

class _ImmediateRevocationFailureService extends AccountSecurityService {
  final SessionRevocationFailure failure;

  const _ImmediateRevocationFailureService(this.failure);

  @override
  bool get isAvailable => true;

  @override
  Future<List<SecurityDevice>> getSessions() async => _devicesA;

  @override
  Future<void> revokeSession(String sessionId) async => throw failure;
}

class _PromptSwitchRevocationService extends AccountSecurityService {
  bool accountBActive = false;
  int revokeCalls = 0;

  @override
  bool get isAvailable => true;

  @override
  Future<List<SecurityDevice>> getSessions() async =>
      accountBActive ? _devicesB : _devicesA;

  @override
  Future<void> revokeSession(String sessionId) async {
    revokeCalls += 1;
  }

  void activateAccountB() {
    accountBActive = true;
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
  }
}

class _PopupSwitchRevocationService extends AccountSecurityService {
  bool accountBActive = false;

  @override
  bool get isAvailable => true;

  @override
  Future<List<SecurityDevice>> getSessions() async =>
      accountBActive ? _devicesB : _devicesA;

  @override
  Future<void> revokeSession(String sessionId) async {
    throw const SessionRevocationFailure.outcomeUnknown(
      targetSessionId: 'remote-session',
      invokingSessionDefinitelyCurrent: true,
    );
  }

  void activateAccountB() {
    accountBActive = true;
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
  }
}
