import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/profile_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('exact Account A session clear preserves a successor Account B',
      () async {
    final sessionA = _session('account-a', 'session-a');
    final sessionB = _session('account-b', 'session-b');
    SharedPreferences.setMockInitialValues({
      'auth_session_v1': _encodedSession(sessionA),
    });

    final ownerA = AuthService.captureSessionOwner(
      (await AuthService.readSession())!,
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_session_v1', _encodedSession(sessionB));

    final receipt = await AuthService.clearSessionOwnerIfMatches(
      ownerA,
      runLogoutCleanup: false,
    );

    expect(receipt, isNull);
    final preserved = await AuthService.readSession();
    expect(preserved?.userId, 'account-b');
    expect(preserved?.sessionId, 'session-b');
  });

  test('exact legacy owner with user id and no session id can be cleared',
      () async {
    final legacy = AuthSession(
      userId: 'legacy-account-a',
      email: 'legacy-a@example.invalid',
      createdAt: DateTime.utc(2026, 8, 26, 8),
    );
    SharedPreferences.setMockInitialValues({
      'auth_session_v1': _encodedSession(legacy),
    });

    final owner = AuthService.captureSessionOwner(
      (await AuthService.readSession())!,
    );
    final receipt = await AuthService.clearSessionOwnerIfMatches(
      owner,
      runLogoutCleanup: false,
    );

    expect(receipt, isNotNull);
    expect(await AuthService.readSession(), isNull);
  });

  test('completion epoch stops being current when a successor signs in',
      () async {
    final sessionA = _session('account-a', 'session-a');
    final sessionB = _session('account-b', 'session-b');
    SharedPreferences.setMockInitialValues({
      'auth_session_v1': _encodedSession(sessionA),
    });

    final ownerA = AuthService.captureSessionOwner(
      (await AuthService.readSession())!,
    );
    final receipt = await AuthService.clearSessionOwnerIfMatches(
      ownerA,
      runLogoutCleanup: false,
    );
    expect(receipt, isNotNull);
    expect(await AuthService.isSessionClearReceiptCurrent(receipt!), isTrue);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_session_v1', _encodedSession(sessionB));

    expect(await AuthService.isSessionClearReceiptCurrent(receipt), isFalse);
  });

  test('app-owned successor sign-in is serialized after Account A cleanup',
      () async {
    final sessionA = _session('account-a', 'session-a');
    final password = <String>['Synthetic', 'account', 'password'].join('-');
    SharedPreferences.setMockInitialValues({
      'auth_session_v1': _encodedSession(sessionA),
      'auth_seeded_v1': true,
      'auth_accounts_v1': jsonEncode([
        {
          'email': 'account-b@example.invalid',
          'password': password,
          'createdAt': DateTime.utc(2026, 8, 26).toIso8601String(),
        },
      ]),
    });
    final ownerA = AuthService.captureSessionOwner(
      (await AuthService.readSession())!,
    );

    final clear = AuthService.clearSessionOwnerIfMatches(
      ownerA,
      runLogoutCleanup: false,
    );
    final signIn = AuthService.signInWithEmailPassword(
      email: 'account-b@example.invalid',
      password: password,
    );
    final results = await Future.wait<Object?>([clear, signIn]);

    expect(results.first, isA<AuthSessionClearReceipt>());
    expect((results.last as AuthResult).ok, isTrue);
    expect(
        (await AuthService.readSession())?.email, 'account-b@example.invalid');
    expect(
      await AuthService.isSessionClearReceiptCurrent(
        results.first! as AuthSessionClearReceipt,
      ),
      isFalse,
    );
  });

  test('conditional Account A profile clear preserves Account B profile',
      () async {
    final accountA = buildTestUser(
      'account-a',
      name: 'Account A',
      email: 'account-a@example.invalid',
    );
    final accountB = buildTestUser(
      'account-b',
      name: 'Account B',
      email: 'account-b@example.invalid',
    );
    SharedPreferences.setMockInitialValues({
      'currentUser': jsonEncode(accountA.toJson()),
      'users': jsonEncode([accountA.toJson(), accountB.toJson()]),
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUser', jsonEncode(accountB.toJson()));

    final cleared = await DataService.clearCurrentUserIfMatches(
      userId: accountA.id,
      email: accountA.email,
    );

    expect(cleared, isFalse);
    expect((await DataService.getCurrentUser())?.id, accountB.id);
  });

  testWidgets(
      'Account A profile logout prompt closes without closing newer B dialog',
      (tester) async {
    final service = _FakeSessionTransitionService.withAccountA();
    await _pumpProfile(tester, service);

    final logout = find.text('Abmelden');
    await tester.ensureVisible(logout);
    await tester.pumpAndSettle();
    await tester.tap(logout);
    await tester.pumpAndSettle();
    expect(find.text('Abmelden?'), findsOneWidget);

    service.activateAccountB(notify: false);
    final bHandle = TrackedDialogRouteHandle<void>();
    unawaited(
      showTrackedDialog<void>(
        context: tester.element(find.byType(ProfileScreen)),
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

    expect(find.text('Abmelden?'), findsNothing);
    expect(find.text('Account B eigener Dialog'), findsOneWidget);
    expect(service.signOutCalls, 0);
    expect(service.activeUser.id, 'account-b');
    expect(find.text('Account B'), findsWidgets);
    bHandle.dismiss();
    await tester.pumpAndSettle();
  });

  testWidgets('Account A logout completion cannot navigate after B appears',
      (tester) async {
    final service = _FakeSessionTransitionService.withAccountA(
      holdSignOut: true,
    );
    await _pumpProfile(tester, service);

    final logout = find.text('Abmelden');
    await tester.ensureVisible(logout);
    await tester.pumpAndSettle();
    await tester.tap(logout);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Abmelden'));
    await tester.pump();
    expect(service.signOutCalls, 1);

    service.activateAccountB(notify: false);
    service.completeSignOut(
      const SessionTransitionCompletion(completionEpoch: 1),
    );
    await tester.pumpAndSettle();

    expect(service.activeUser.id, 'account-b');
    expect(find.byType(ProfileScreen), findsOneWidget);
  });

  testWidgets('stale Account A login bootstrap cannot clear Account B',
      (tester) async {
    final service = _FakeSessionTransitionService.withAccountA(
      holdAccountAResolution: true,
    );
    await _pumpLogin(tester, service, settle: false);
    await tester.pump();
    expect(find.text('Session prüfen…'), findsOneWidget);

    service.activateAccountB(notify: false);
    service.completeAccountAResolution(null);
    await tester.pumpAndSettle();

    expect(service.clearStaleSessionCalls, 0);
    expect(service.activeUser.id, 'account-b');
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('guest continuation cannot navigate after Account B appears',
      (tester) async {
    final service = _FakeSessionTransitionService.withoutSession(
      holdGuestTransition: true,
    );
    await _pumpLogin(tester, service);

    await tester.tap(find.text('Erst mal umschauen'));
    await tester.pump();
    expect(service.continueAsGuestCalls, 1);

    service.activateAccountB(notify: false);
    service.completeGuestTransition(null);
    await tester.pumpAndSettle();

    expect(service.activeUser.id, 'account-b');
    expect(find.byType(LoginScreen), findsOneWidget);
  });
}

AuthSession _session(String userId, String sessionId) => AuthSession(
      userId: userId,
      email: '$userId@example.invalid',
      createdAt: DateTime.utc(2026, 8, 26, 8),
      accessToken: <String>['synthetic', userId, 'access'].join('-'),
      refreshToken: <String>['synthetic', userId, 'refresh'].join('-'),
      sessionId: sessionId,
      accessTokenExpiresAt: DateTime.utc(2026, 8, 26, 9),
    );

String _encodedSession(AuthSession session) => jsonEncode({
      'userId': session.userId,
      'email': session.email,
      'createdAt': session.createdAt?.toIso8601String(),
      'accessToken': session.accessToken,
      'refreshToken': session.refreshToken,
      'sessionId': session.sessionId,
      'accessTokenExpiresAt': session.accessTokenExpiresAt?.toIso8601String(),
    });

Future<void> _pumpProfile(
  WidgetTester tester,
  SessionTransitionService service,
) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({});

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => MainNavController()),
        ChangeNotifierProvider(create: (_) => LocalizationController()),
        ChangeNotifierProvider(
          create: (_) => DeveloperPreviewController(
            initialState: DeveloperUserState.loggedIn,
          ),
        ),
      ],
      child: MaterialApp(
        home: ProfileScreen(sessionTransitionService: service),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpLogin(
  WidgetTester tester,
  SessionTransitionService service, {
  bool settle = true,
}) async {
  tester.view.physicalSize = const Size(800, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({});

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
        home: LoginScreen(sessionTransitionService: service),
      ),
    ),
  );
  if (settle) await tester.pumpAndSettle();
}

class _FakeSessionTransitionService extends SessionTransitionService {
  AuthSession? _activeSession;
  late User activeUser;
  int _epoch = 1;
  int signOutCalls = 0;
  int clearStaleSessionCalls = 0;
  int continueAsGuestCalls = 0;
  final Completer<User?>? _accountAResolution;
  final Completer<SessionTransitionCompletion?>? _guestTransition;
  final Completer<SessionTransitionCompletion?>? _signOutTransition;

  _FakeSessionTransitionService._({
    required AuthSession? session,
    required User user,
    required bool holdAccountAResolution,
    required bool holdGuestTransition,
    required bool holdSignOut,
  })  : _activeSession = session,
        activeUser = user,
        _accountAResolution =
            holdAccountAResolution ? Completer<User?>() : null,
        _guestTransition = holdGuestTransition
            ? Completer<SessionTransitionCompletion?>()
            : null,
        _signOutTransition =
            holdSignOut ? Completer<SessionTransitionCompletion?>() : null;

  factory _FakeSessionTransitionService.withAccountA({
    bool holdAccountAResolution = false,
    bool holdSignOut = false,
  }) =>
      _FakeSessionTransitionService._(
        session: _session('account-a', 'session-a'),
        user: buildTestUser(
          'account-a',
          name: 'Account A',
          email: 'account-a@example.invalid',
        ),
        holdAccountAResolution: holdAccountAResolution,
        holdGuestTransition: false,
        holdSignOut: holdSignOut,
      );

  factory _FakeSessionTransitionService.withoutSession({
    bool holdGuestTransition = false,
  }) =>
      _FakeSessionTransitionService._(
        session: null,
        user: buildTestUser(
          'stale-user',
          name: 'Stale User',
          email: 'stale-user@example.invalid',
        ),
        holdAccountAResolution: false,
        holdGuestTransition: holdGuestTransition,
        holdSignOut: false,
      );

  @override
  int get sessionEpoch => _epoch;

  @override
  Future<AuthSession?> readSession() async => _activeSession;

  @override
  SessionTransitionOwner captureOwner(
    AuthSession session, {
    String? profileUserId,
  }) =>
      SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: session.userId,
          sessionId: session.sessionId,
          email: session.email,
          createdAt: session.createdAt,
          epoch: _epoch,
        ),
        profileUserId: profileUserId,
      );

  @override
  Future<bool> isOwnerCurrent(SessionTransitionOwner owner) async =>
      owner.authOwner.epoch == _epoch &&
      owner.authOwner.email == _activeSession?.email;

  @override
  Future<User?> currentUserForOwner(
    SessionTransitionOwner owner, {
    bool synchronize = false,
  }) async {
    if (owner.authOwner.email == 'account-a@example.invalid' &&
        _accountAResolution != null) {
      return _accountAResolution.future;
    }
    return await isOwnerCurrent(owner) ? activeUser : null;
  }

  @override
  Future<User?> cachedCurrentUserForOwner(
    SessionTransitionOwner owner,
  ) async =>
      await isOwnerCurrent(owner) ? activeUser : null;

  @override
  Future<SessionTransitionCompletion?> signOut(
    SessionTransitionOwner owner,
  ) async {
    signOutCalls += 1;
    if (_signOutTransition != null) return _signOutTransition.future;
    if (!await isOwnerCurrent(owner)) return null;
    _activeSession = null;
    _epoch += 1;
    return SessionTransitionCompletion(completionEpoch: _epoch);
  }

  @override
  Future<SessionTransitionCompletion?> clearStaleSession(
    SessionTransitionOwner owner,
  ) async {
    clearStaleSessionCalls += 1;
    if (!await isOwnerCurrent(owner)) return null;
    _activeSession = null;
    _epoch += 1;
    return SessionTransitionCompletion(completionEpoch: _epoch);
  }

  @override
  Future<SessionTransitionCompletion?> continueAsGuest(
    int expectedEpoch,
  ) async {
    continueAsGuestCalls += 1;
    if (_guestTransition != null) return _guestTransition.future;
    if (expectedEpoch != _epoch || _activeSession != null) return null;
    return SessionTransitionCompletion(completionEpoch: _epoch);
  }

  @override
  Future<bool> isCompletionCurrent(
    SessionTransitionCompletion completion,
  ) async =>
      completion.completionEpoch == _epoch && _activeSession == null;

  void activateAccountB({bool notify = true}) {
    _epoch += 1;
    _activeSession = _session('account-b', 'session-b');
    activeUser = buildTestUser(
      'account-b',
      name: 'Account B',
      email: 'account-b@example.invalid',
    );
    if (notify) notifyAccountChange();
  }

  void completeAccountAResolution(User? user) {
    _accountAResolution?.complete(user);
  }

  void completeGuestTransition(SessionTransitionCompletion? completion) {
    _guestTransition?.complete(completion);
  }

  void completeSignOut(SessionTransitionCompletion? completion) {
    _signOutTransition?.complete(completion);
  }

  void notifyAccountChange() {
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
  }
}
