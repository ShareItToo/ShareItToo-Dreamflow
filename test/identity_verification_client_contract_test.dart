import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/identity_verification.dart';
import 'package:lendify/screens/verification_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/identity_verification_service.dart';

class _FakeIdentityService extends IdentityVerificationService {
  IdentityVerificationState state;
  int startCalls = 0;
  int refreshCalls = 0;
  bool failLoad = false;

  _FakeIdentityService(this.state);

  @override
  Future<IdentityVerificationState> getStatus(AuthSessionOwner owner) async {
    if (failLoad) throw const IdentityVerificationException(503, 'offline');
    return state;
  }

  @override
  Future<IdentityVerificationSession> start({
    required AuthSessionOwner owner,
    required String idempotencyKey,
  }) async {
    startCalls += 1;
    return IdentityVerificationSession(
      sessionId: 'local-session',
      status: IdentityVerificationStatus.requiresInput,
      livemode: false,
      updatedAt: DateTime.utc(2026, 1, 1),
      url: 'https://verify.stripe.com/test/session',
    );
  }

  @override
  Future<IdentityVerificationState> refresh(AuthSessionOwner owner) async {
    refreshCalls += 1;
    return state;
  }
}

const _identityTestSession = AuthSession(
  userId: 'identity-test-user',
  email: 'identity-test@example.invalid',
  sessionId: 'identity-test-session',
);

Widget _screen(_FakeIdentityService service,
    {Future<bool> Function(Uri)? launcher, Future<bool> Function(AuthSessionOwner)? ownerChecker}) {
  return MaterialApp(
    home: VerificationScreen(
      key: UniqueKey(),
      service: service,
      sessionReader: () async => _identityTestSession,
      ownerChecker: ownerChecker ?? (_) async => true,
      urlLauncher: launcher,
    ),
  );
}

void main() {
  test('identity client has explicit server states and no client secret surface', () {
    expect(IdentityVerificationStatus.values, contains(IdentityVerificationStatus.notStarted));
    expect(IdentityVerificationStatus.values, contains(IdentityVerificationStatus.verified));
    final service = File('lib/services/identity_verification_service.dart').readAsStringSync();
    final screen = File('lib/screens/verification_screen.dart').readAsStringSync();
    expect(service, contains("'/identity-verification/status'"));
    expect(service, contains("'/identity-verification/session'"));
    expect(service, contains("'/identity-verification/refresh'"));
    expect(service, isNot(contains('clientSecret')));
    expect(screen, contains('principal_changed'));
    expect(screen, contains('Technischer Test erfolgreich'));
    expect(screen, isNot(contains('Verifiziert ✅')));
  });

  test('runtime parser rejects live mode, unknown states and unsafe entrypoints', () {
    const service = IdentityVerificationService();
    final response = <String, dynamic>{
      'sessionId': 'local-session',
      'status': 'processing',
      'livemode': false,
      'updatedAt': '2026-01-01T00:00:00Z',
      'redactionStatus': 'queued',
    };
    expect(service.parseResponse(response).redactionStatus, 'queued');
    expect(() => service.parseResponse({...response, 'livemode': true}), throwsA(isA<IdentityVerificationException>()));
    expect(() => service.parseResponse({...response, 'status': 'unknown'}), throwsA(isA<IdentityVerificationException>()));
    expect(() => service.parseResponse({...response, 'redactionStatus': 'mystery'}), throwsA(isA<IdentityVerificationException>()));
    expect(IdentityVerificationService.isSafeEntrypoint('https://verify.stripe.com/test/session'), isTrue);
    for (final url in [
      'http://verify.stripe.com/test/session',
      'https://evil.example/test',
      'https://verify.stripe.com.evil.example/test',
      'https://user:pass@verify.stripe.com/test/session',
    ]) {
      expect(IdentityVerificationService.isSafeEntrypoint(url), isFalse, reason: url);
    }
  });

  test('start parser accepts only the explicit local fixture without a URL', () {
    const service = IdentityVerificationService();
    final base = <String, dynamic>{
      'sessionId': 'local-session',
      'status': 'requires_input',
      'livemode': false,
      'updatedAt': '2026-01-01T00:00:00Z',
    };
    expect(
      service.parseStartResponse({...base, 'testFixture': true}).url,
      isNull,
    );
    for (final response in [
      base,
      {...base, 'testFixture': false},
    ]) {
      expect(
        () => service.parseStartResponse(response),
        throwsA(
          isA<IdentityVerificationException>().having(
            (error) => error.code,
            'code',
            'identity_verification_entrypoint_missing',
          ),
        ),
      );
    }
    expect(
      () => service.parseStartResponse({
        ...base,
        'testFixture': true,
        'url': 'https://evil.example/test/session',
      }),
      throwsA(
        isA<IdentityVerificationException>().having(
          (error) => error.code,
          'code',
          'invalid_identity_verification_url',
        ),
      ),
    );
  });

  testWidgets('requires_input offers separate resume and status actions', (tester) async {
    final service = _FakeIdentityService(IdentityVerificationState(
      sessionId: 'local-session',
      status: IdentityVerificationStatus.requiresInput,
      livemode: false,
      updatedAt: DateTime.utc(2026, 1, 1),
    ));
    var launched = 0;
    await tester.pumpWidget(_screen(service, launcher: (_) async {
      launched += 1;
      return true;
    }));
    await tester.pumpAndSettle();
    expect(find.text('Prüfung fortsetzen'), findsOneWidget);
    expect(find.text('Status aktualisieren'), findsOneWidget);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Prüfung fortsetzen'));
    await tester.pumpAndSettle();
    expect(service.startCalls, 1);
    expect(launched, 1);
    await tester.tap(find.text('Status aktualisieren'));
    await tester.pumpAndSettle();
    expect(service.refreshCalls, 1);
  });

  testWidgets('privacy notice names the concrete internal pilot operator before consent', (tester) async {
    final service = _FakeIdentityService(const IdentityVerificationState(
      sessionId: null,
      status: IdentityVerificationStatus.notStarted,
      livemode: false,
      updatedAt: null,
    ));
    await tester.pumpWidget(_screen(service));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Datenschutzhinweise zum Test'));
    await tester.pumpAndSettle();
    expect(find.textContaining('ShareItToo – Inhaber Walid Chraibi'), findsOneWidget);
    expect(find.textContaining('Bernhaldenweg 47, 71579 Spiegelberg'), findsOneWidget);
    expect(find.textContaining('contact@shareittoo.com'), findsOneWidget);
    expect(find.text('Prüfung starten'), findsOneWidget);
  });

  testWidgets('blocked launch is truthful and retry remains available', (tester) async {
    final service = _FakeIdentityService(const IdentityVerificationState(
      sessionId: 'local-session',
      status: IdentityVerificationStatus.notStarted,
      livemode: false,
      updatedAt: null,
    ));
    await tester.pumpWidget(_screen(service, launcher: (_) async => false));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Prüfung starten'));
    await tester.pumpAndSettle();
    expect(find.text('Der sichere Prüf-Link konnte nicht geöffnet werden.'), findsOneWidget);
    expect(find.text('Prüfung fortsetzen'), findsOneWidget);
  });

  testWidgets('stale owner cannot start and load failure offers reload', (tester) async {
    final service = _FakeIdentityService(const IdentityVerificationState(
      sessionId: null,
      status: IdentityVerificationStatus.notStarted,
      livemode: false,
      updatedAt: null,
    ));
    var current = true;
    await tester.pumpWidget(_screen(service, ownerChecker: (_) async => current));
    await tester.pumpAndSettle();
    current = false;
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Prüfung starten'));
    await tester.pumpAndSettle();
    expect(service.startCalls, 0);
    expect(find.text('Melde dich erneut an.'), findsOneWidget);

    final failed = _FakeIdentityService(const IdentityVerificationState(
      sessionId: null,
      status: IdentityVerificationStatus.notStarted,
      livemode: false,
      updatedAt: null,
    ))..failLoad = true;
    await tester.pumpWidget(_screen(failed));
    await tester.pumpAndSettle();
    expect(find.text('Erneut laden'), findsOneWidget);
  });

  testWidgets('resume refreshes and redacted session can restart', (tester) async {
    final service = _FakeIdentityService(IdentityVerificationState(
      sessionId: 'local-session',
      status: IdentityVerificationStatus.processing,
      livemode: false,
      updatedAt: DateTime.utc(2026, 1, 1),
    ));
    await tester.pumpWidget(_screen(service, launcher: (_) async => true));
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(service.refreshCalls, 1);

    final redacted = _FakeIdentityService(IdentityVerificationState(
      sessionId: 'local-session',
      status: IdentityVerificationStatus.redacted,
      livemode: false,
      updatedAt: DateTime.utc(2026, 1, 1),
      redactionStatus: 'redacted',
    ));
    await tester.pumpWidget(_screen(redacted, launcher: (_) async => true));
    await tester.pumpAndSettle();
    expect(find.text('Erneut versuchen'), findsOneWidget);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Erneut versuchen'));
    await tester.pumpAndSettle();
    expect(redacted.startCalls, 1);
  });
}
