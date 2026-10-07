import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mfa.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/mfa_auth_flow.dart';
import 'package:lendify/services/mfa_service.dart';
import 'package:lendify/screens/two_factor_auth_screen.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('MFA configuration failure stays retryable and explicit',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: TwoFactorAuthScreen()));
    await tester.pumpAndSettle();

    expect(
      find.text(
          'Server-Konfiguration für Zwei-Faktor-Schutz ist nicht erreichbar.'),
      findsOneWidget,
    );
    expect(find.text('Erneut prüfen'), findsOneWidget);
  });

  test('client keeps the server challenge and recovery flow ephemeral', () {
    final auth = File('lib/services/auth_service.dart').readAsStringSync();
    final mfa = File('lib/services/mfa_service.dart').readAsStringSync();
    final screen =
        File('lib/screens/two_factor_auth_screen.dart').readAsStringSync();
    final account =
        File('lib/screens/account_settings_screen.dart').readAsStringSync();
    final register =
        File('lib/screens/register_screen.dart').readAsStringSync();
    final main = File('lib/main.dart').readAsStringSync();

    expect(auth, contains("path: '/auth/mfa/challenge'"));
    expect(auth, contains('AuthResult.mfaRequired'));
    expect(mfa, contains("path: '/auth/mfa/status'"));
    expect(mfa, contains("path: '/auth/mfa/enroll'"));
    expect(mfa, contains("path: '/auth/mfa/confirm'"));
    expect(mfa, contains("path: '/auth/mfa/enroll/cancel'"));
    expect(mfa, contains("path: '/auth/mfa/disable'"));
    expect(mfa, isNot(contains('SharedPreferences')));
    expect(mfa, isNot(contains('debugPrint')));
    expect(screen, contains('PopScope'));
    expect(screen, contains('Clipboard.setData'));
    expect(screen, contains('isSessionOwnerDefinitelyCurrent(owner)'));
    expect(screen, contains('navigateToLogin: true'));
    expect(screen, contains('_routeReplacementPending'));
    expect(screen, contains('_recoveryCodes == null'));
    expect(account, contains('TwoFactorAuthScreen'));
    expect(account, contains('Zwei‑Faktor‑Authentifizierung'));
    expect(register, contains('_resolveMfaChallenge'));
    expect(main, contains('result.ok && result.session != null'));
  });

  test('MFA challenge resolver retries wrong codes and completes once',
      () async {
    final challenge = AuthMfaChallenge(
      challenge: 'challenge-value-without-persisted-credential',
      expiresAt: DateTime(2030),
    );
    final submitted = <String>[];
    var prompts = 0;
    final result = await resolveMfaChallenge(
      initial: AuthResult.mfaRequired(challenge),
      prompt: (_) async => ++prompts == 1 ? 'wrong' : 'right',
      submit: (received, code) async {
        submitted.add('${received.challenge}:$code');
        return code == 'right'
            ? const AuthResult.success(
                session: AuthSession(email: 'mfa@example.invalid'))
            : const AuthResult.failure(AuthFailure.mfaCodeRejected);
      },
      isCurrent: () => true,
    );
    expect(result?.session?.email, 'mfa@example.invalid');
    expect(submitted, hasLength(2));
    expect(prompts, 2);
  });

  test('MFA challenge resolver handles cancel, expiry, lock and stale owner',
      () async {
    AuthMfaChallenge challenge(DateTime expiresAt) => AuthMfaChallenge(
          challenge: 'challenge-value-without-persisted-credential',
          expiresAt: expiresAt,
        );

    var submitCalls = 0;
    final cancelled = await resolveMfaChallenge(
      initial: AuthResult.mfaRequired(challenge(DateTime(2030))),
      prompt: (_) async => null,
      submit: (_, __) async {
        submitCalls += 1;
        return const AuthResult.failure(AuthFailure.network);
      },
      isCurrent: () => true,
    );
    expect(cancelled, isNull);
    expect(submitCalls, 0);

    var expired = false;
    final expiredResult = await resolveMfaChallenge(
      initial: AuthResult.mfaRequired(challenge(DateTime(2020))),
      prompt: (_) async => fail('expired challenge must not prompt'),
      submit: (_, __) async => const AuthResult.failure(AuthFailure.network),
      isCurrent: () => true,
      onExpired: () async => expired = true,
    );
    expect(expiredResult, isNull);
    expect(expired, isTrue);

    var locked = false;
    final lockedResult = await resolveMfaChallenge(
      initial: AuthResult.mfaRequired(challenge(DateTime(2030))),
      prompt: (_) async => 'code',
      submit: (_, __) async => const AuthResult.failure(AuthFailure.mfaLocked),
      isCurrent: () => true,
      onLocked: () async => locked = true,
    );
    expect(lockedResult, isNull);
    expect(locked, isTrue);

    var terminalSubmitCalls = 0;
    final terminalResult = await resolveMfaChallenge(
      initial: AuthResult.mfaRequired(challenge(DateTime(2030))),
      prompt: (_) async => 'code',
      submit: (_, __) async {
        terminalSubmitCalls += 1;
        return const AuthResult.failure(AuthFailure.mfaChallengeExpired);
      },
      isCurrent: () => true,
      onExpired: () async {},
    );
    expect(terminalResult, isNull);
    expect(terminalSubmitCalls, 1);

    var current = true;
    final staleResult = await resolveMfaChallenge(
      initial: AuthResult.mfaRequired(challenge(DateTime(2030))),
      prompt: (_) async => 'code',
      submit: (_, __) async {
        current = false;
        return const AuthResult.success(
            session: AuthSession(email: 'stale@example.invalid'));
      },
      isCurrent: () => current,
    );
    expect(staleResult, isNull);
  });

  test('MFA-required auth is not a registration or preview success', () {
    final result = AuthResult.mfaRequired(
      AuthMfaChallenge(
        challenge: 'challenge-value-without-persisted-credential',
        expiresAt: DateTime(2030),
      ),
    );
    expect(result.ok, isFalse);
    expect(result.session, isNull);
    expect(result.failure, AuthFailure.mfaRequired);
  });

  testWidgets('pending restart recovers after cancel-success/begin-failure',
      (tester) async {
    final service = _FakeMfaService(
      status: const MfaStatus(
        enabled: false,
        pending: true,
        recoveryCodesRemaining: 0,
      ),
      failBeginAfterCancel: true,
    );
    final session = const AuthSession(
      userId: 'user-1',
      sessionId: 'session-1',
      email: 'user@example.invalid',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TwoFactorAuthScreen(
          mfaService: service,
          sessionReader: () async => session,
          ownerChecker: (_) async => true,
          reauthPrompt: (_) async => ('password', null),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Einrichtung offen'), findsOneWidget);
    await tester.tap(find.text('Einrichtung neu starten'));
    await tester.pumpAndSettle();
    expect(find.text('Nicht aktiviert'), findsOneWidget);
    expect(find.text('Zwei-Faktor-Schutz aktivieren'), findsOneWidget);
    expect(service.beginCalls, 1);
  });

  testWidgets('MFA enrollment reaches one-time recovery state', (tester) async {
    final service = _FakeMfaService(
      status: const MfaStatus(
        enabled: false,
        pending: false,
        recoveryCodesRemaining: 0,
      ),
    );
    final session = const AuthSession(
      userId: 'user-1',
      sessionId: 'session-1',
      email: 'user@example.invalid',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TwoFactorAuthScreen(
          mfaService: service,
          sessionReader: () async => session,
          ownerChecker: (_) async => true,
          reauthPrompt: (_) async => ('password', null),
          codePrompt: ({required title, required hint}) async => '123456',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Zwei-Faktor-Schutz aktivieren'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ersten Code bestätigen'));
    await tester.pumpAndSettle();
    expect(
        find.text('Wiederherstellungscodes einmalig sichern'), findsOneWidget);
    expect(find.text('Codes kopieren'), findsOneWidget);
    expect(service.confirmCalls, 1);
  });

  testWidgets('stale recovery owner cannot write clipboard and is replaced',
      (tester) async {
    final service = _FakeMfaService(
      status: const MfaStatus(
        enabled: false,
        pending: false,
        recoveryCodesRemaining: 0,
      ),
    );
    var current = true;
    final session = const AuthSession(
      userId: 'user-1',
      sessionId: 'session-1',
      email: 'user@example.invalid',
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => MainNavController()),
          ChangeNotifierProvider(
            create: (_) => DeveloperPreviewController(
              initialState: DeveloperUserState.loggedOut,
            ),
          ),
        ],
        child: MaterialApp(
          home: TwoFactorAuthScreen(
            mfaService: service,
            sessionReader: () async => session,
            ownerChecker: (_) async => current,
            reauthPrompt: (_) async => ('password', null),
            codePrompt: ({required title, required hint}) async => '123456',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Zwei-Faktor-Schutz aktivieren'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ersten Code bestätigen'));
    await tester.pumpAndSettle();
    current = false;
    await tester.tap(find.text('Codes kopieren'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1200));
    await tester.pump();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('Wiederherstellungscodes einmalig sichern'), findsNothing);
  });
}

class _FakeMfaService extends MfaService {
  MfaStatus status;
  bool failBeginAfterCancel;
  bool cancelled = false;
  int beginCalls = 0;
  int confirmCalls = 0;

  _FakeMfaService({required this.status, this.failBeginAfterCancel = false});

  @override
  bool get isAvailable => true;

  @override
  Future<MfaStatus> getStatus(AuthSessionOwner owner) async {
    if (cancelled) {
      status = const MfaStatus(
        enabled: false,
        pending: false,
        recoveryCodesRemaining: 0,
      );
    }
    return status;
  }

  @override
  Future<MfaEnrollment> beginEnrollment({
    required AuthSessionOwner owner,
    required String idempotencyKey,
    String? currentPassword,
    String? reauthSocialIdToken,
  }) async {
    beginCalls += 1;
    if (failBeginAfterCancel && cancelled) {
      throw const MfaException(503, 'transport_failed');
    }
    return const MfaEnrollment(
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://totp/ShareItToo:test?secret=JBSWY3DPEHPK3PXP',
    );
  }

  @override
  Future<List<String>> confirmEnrollment({
    required AuthSessionOwner owner,
    required String code,
    String? currentPassword,
    String? reauthSocialIdToken,
  }) async {
    confirmCalls += 1;
    status = const MfaStatus(
      enabled: true,
      pending: false,
      recoveryCodesRemaining: 10,
    );
    return List<String>.generate(10, (index) => 'recovery-$index');
  }

  @override
  Future<void> cancelEnrollment({
    required AuthSessionOwner owner,
    String? currentPassword,
    String? reauthSocialIdToken,
  }) async {
    cancelled = true;
  }
}
