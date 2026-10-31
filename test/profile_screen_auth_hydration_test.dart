import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/screens/profile_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/background_theme_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/profile_header_card.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPersistenceSync.cancelCatchUpRetries();
    SharedPreferences.setMockInitialValues(const <String, Object>{});
  });

  testWidgets(
      'authenticated startup stays neutral through session and profile hydration',
      (tester) async {
    final service = _HydrationService.pending();
    await _pumpProfile(tester, service);

    _expectNeutralHydration(tester);
    service.sessionGate!.complete(_session);
    await tester.pump();

    _expectNeutralHydration(tester);
    service.userGate!.complete(_user);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('profile_auth_hydration_loading')),
        findsNothing);
    expect(find.text('WP255 Synthetic Owner'), findsWidgets);
    expect(find.text('Noch kein Konto?'), findsNothing);
    expect(find.text('Anmelden'), findsNothing);
  });

  testWidgets(
      'confirmed guest enters guest profile immediately after hydration',
      (tester) async {
    await _pumpProfile(tester, _HydrationService.guest());
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('profile_auth_hydration_loading')),
        findsNothing);
    expect(find.text('Noch kein Konto?'), findsOneWidget);
    expect(find.text('Anmelden'), findsOneWidget);
  });

  testWidgets('logout enters guest profile after session absence is confirmed',
      (tester) async {
    final service = _HydrationService.authenticated();
    await _pumpProfile(tester, service);
    await tester.pumpAndSettle();
    expect(find.text('Noch kein Konto?'), findsNothing);

    service.session = null;
    service.user = null;
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();

    expect(find.text('Noch kein Konto?'), findsOneWidget);
    expect(find.text('Anmelden'), findsOneWidget);
  });

  testWidgets('session storage failure remains neutral and fails closed',
      (tester) async {
    await _pumpProfile(tester, _HydrationService.unavailable());
    await tester.pump(const Duration(milliseconds: 100));

    _expectNeutralHydrationFailure(tester);
    expect(find.text('Noch kein Konto?'), findsNothing);
    expect(find.text('Anmelden'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('profile read failure with a stored session is not guest state',
      (tester) async {
    await _pumpProfile(tester, _HydrationService.profileUnavailable());
    await tester.pump(const Duration(milliseconds: 100));

    _expectNeutralHydrationFailure(tester);
    expect(find.text('Noch kein Konto?'), findsNothing);
    expect(find.text('Anmelden'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('retry binds the profile read to the exact current owner',
      (tester) async {
    final service = _HydrationService.unavailable();
    await _pumpProfile(tester, service);
    await tester.pump(const Duration(milliseconds: 100));
    _expectNeutralHydrationFailure(tester);

    service.sessionAbsenceUnconfirmed = false;
    service.session = _sessionB;
    service.user = _userB;
    await tester.tap(find.text('Erneut versuchen'));
    await tester.pumpAndSettle();

    expect(service.observedOwnerIds, ['wp255-owner-b']);
    expect(find.text('WP255 Synthetic Owner B'), findsWidgets);
    expect(find.text('WP255 Synthetic Owner'), findsNothing);
    expect(find.text('Noch kein Konto?'), findsNothing);
  });

  testWidgets(
      'account switch removes A immediately and publishes B only after exact owner readback',
      (tester) async {
    final service = _PrincipalSwitchService();
    await _pumpMainNavigation(tester, service);
    await tester.pumpAndSettle();

    expect(find.byKey(_profileNavKey(_user, _avatarA)), findsOneWidget);
    expect(
      tester.widget<ProfileHeaderCard>(find.byType(ProfileHeaderCard)).user.id,
      _user.id,
    );
    expect(
      tester
          .widget<ProfileHeaderCard>(find.byType(ProfileHeaderCard))
          .user
          .photoURL,
      _avatarA,
    );

    service.holdOwnerARefresh();
    SharedPersistenceSync.notify(SharedPersistenceSync.profileStateKey);
    await tester.pump();

    service.switchToOwnerB();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pump();

    expect(_avatarUrls(tester), isNot(contains(_avatarA)));
    expect(_avatarUrls(tester), isNot(contains(_avatarB)));
    expect(find.byKey(_profileNavKey(_user, _avatarA)), findsNothing);
    expect(find.byKey(const ValueKey('profile_guest_active')), findsOneWidget);
    expect(find.byType(ProfileHeaderCard), findsNothing);
    expect(find.byKey(const ValueKey('profile_auth_hydration_loading')),
        findsOneWidget);

    service.completeStaleOwnerA();
    await tester.pump();
    expect(_avatarUrls(tester), isNot(contains(_avatarA)));
    expect(_avatarUrls(tester), isNot(contains(_avatarB)));
    expect(find.byType(ProfileHeaderCard), findsNothing);

    service.completeOwnerB();
    await tester.pumpAndSettle();

    expect(_avatarUrls(tester), isNot(contains(_avatarA)));
    expect(find.byKey(_profileNavKey(_userB, _avatarB)), findsOneWidget);
    expect(
      tester.widget<ProfileHeaderCard>(find.byType(ProfileHeaderCard)).user.id,
      _userB.id,
    );
    expect(
      tester
          .widget<ProfileHeaderCard>(find.byType(ProfileHeaderCard))
          .user
          .photoURL,
      _avatarB,
    );
    expect(find.text('WP255 Synthetic Owner B'), findsWidgets);
  });
}

Iterable<String?> _avatarUrls(WidgetTester tester) => tester
    .widgetList<SitUserAvatar>(find.byType(SitUserAvatar))
    .map((avatar) => avatar.url);

ValueKey<String> _profileNavKey(User user, String avatar) =>
    ValueKey<String>('profile_${user.id}_${avatar}_active');

void _expectNeutralHydration(WidgetTester tester) {
  expect(find.byKey(const ValueKey('profile_auth_hydration_loading')),
      findsOneWidget);
  expect(find.bySemanticsLabel('Konto wird geladen'), findsOneWidget);
  expect(find.text('Noch kein Konto?'), findsNothing);
  expect(find.text('Anmelden'), findsNothing);
}

void _expectNeutralHydrationFailure(WidgetTester tester) {
  expect(find.byKey(const ValueKey('profile_auth_hydration_error')),
      findsOneWidget);
  expect(find.text('Konto konnte nicht geladen werden.'), findsOneWidget);
  expect(find.text('Erneut versuchen'), findsOneWidget);
  expect(find.text('Noch kein Konto?'), findsNothing);
  expect(find.text('Anmelden'), findsNothing);
}

Future<void> _pumpProfile(
  WidgetTester tester,
  SessionTransitionService service,
) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => MainNavController()),
        ChangeNotifierProvider(create: (_) => LocalizationController()),
        ChangeNotifierProvider(
          create: (_) => DeveloperPreviewController(
            initialState: DeveloperUserState.loggedOut,
          ),
        ),
      ],
      child: MaterialApp(
        home: ProfileScreen(sessionTransitionService: service),
      ),
    ),
  );
}

Future<void> _pumpMainNavigation(
  WidgetTester tester,
  SessionTransitionService service,
) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => MainNavController()..setIndex(4)),
        ChangeNotifierProvider(create: (_) => LocalizationController()),
        ChangeNotifierProvider(
          create: (_) => DeveloperPreviewController(
            initialState: DeveloperUserState.loggedOut,
          ),
        ),
        ChangeNotifierProvider(create: (_) => BackgroundThemeController()),
      ],
      child: MaterialApp(
        home: MainNavigation(
          initialIndex: 4,
          sessionTransitionService: service,
        ),
      ),
    ),
  );
}

final AuthSession _session = AuthSession(
  userId: 'wp255-owner',
  email: 'wp255-owner@example.invalid',
  createdAt: DateTime.utc(2026, 10, 31),
  accessToken: 'synthetic-owner-access',
  refreshToken: 'synthetic-owner-refresh',
  sessionId: 'synthetic-owner-session',
  accessTokenExpiresAt: DateTime.utc(2099),
);

final User _user = User(
  id: 'wp255-owner',
  displayName: 'WP255 Synthetic Owner',
  email: 'wp255-owner@example.invalid',
  preferredLanguage: 'de',
  isVerified: false,
  isBanned: false,
  role: 'user',
  avgRating: 0,
  reviewCount: 0,
  createdAt: DateTime.utc(2026, 10, 31),
);

final AuthSession _sessionB = AuthSession(
  userId: 'wp255-owner-b',
  email: 'wp255-owner-b@example.invalid',
  createdAt: DateTime.utc(2026, 10, 31),
  accessToken: 'synthetic-owner-b-access',
  refreshToken: 'synthetic-owner-b-refresh',
  sessionId: 'synthetic-owner-b-session',
  accessTokenExpiresAt: DateTime.utc(2099),
);

final User _userB = User(
  id: 'wp255-owner-b',
  displayName: 'WP255 Synthetic Owner B',
  email: 'wp255-owner-b@example.invalid',
  preferredLanguage: 'de',
  isVerified: false,
  isBanned: false,
  role: 'user',
  avgRating: 0,
  reviewCount: 0,
  createdAt: DateTime.utc(2026, 10, 31),
);

const _avatarA = 'https://example.invalid/avatar-a.webp';
const _avatarB = 'https://example.invalid/avatar-b.webp';

class _PrincipalSwitchService extends SessionTransitionService {
  AuthSession _currentSession = _session;
  User _currentUser = _user.copyWith(photoURL: _avatarA);
  Completer<User?>? _ownerAGate;
  final Completer<User?> _ownerBGate = Completer<User?>();
  int _epoch = 1;

  @override
  int get sessionEpoch => _epoch;

  void holdOwnerARefresh() {
    _ownerAGate = Completer<User?>();
  }

  void switchToOwnerB() {
    _currentSession = _sessionB;
    _currentUser = _userB.copyWith(photoURL: _avatarB);
    _epoch += 1;
  }

  void completeStaleOwnerA() {
    _ownerAGate!.complete(_user.copyWith(photoURL: _avatarA));
  }

  void completeOwnerB() {
    _ownerBGate.complete(_currentUser);
  }

  @override
  Future<AuthSession?> readSession() async => _currentSession;

  @override
  Future<bool> isOwnerCurrent(SessionTransitionOwner owner) async {
    final authOwner = owner.authOwner;
    return authOwner.sessionId == _currentSession.sessionId &&
        authOwner.userId == _currentSession.userId &&
        (owner.profileUserId == null || owner.profileUserId == _currentUser.id);
  }

  @override
  Future<bool> isNoSessionEpochCurrent(int expectedEpoch) async => false;

  @override
  Future<User?> currentUserForOwner(
    SessionTransitionOwner owner, {
    bool synchronize = false,
  }) {
    if (owner.authOwner.userId == _session.userId) {
      return _ownerAGate?.future ??
          Future<User?>.value(_user.copyWith(photoURL: _avatarA));
    }
    if (owner.authOwner.userId == _sessionB.userId) {
      return _ownerBGate.future;
    }
    return Future<User?>.value(null);
  }
}

class _HydrationService extends SessionTransitionService {
  AuthSession? session;
  User? user;
  final Completer<AuthSession?>? sessionGate;
  final Completer<User?>? userGate;
  bool sessionAbsenceUnconfirmed;
  final bool failUserRead;
  final List<String?> observedOwnerIds = <String?>[];

  _HydrationService._({
    this.session,
    this.user,
    this.sessionGate,
    this.userGate,
    this.sessionAbsenceUnconfirmed = false,
    this.failUserRead = false,
  });

  factory _HydrationService.pending() => _HydrationService._(
        sessionGate: Completer<AuthSession?>(),
        userGate: Completer<User?>(),
      );

  factory _HydrationService.authenticated() =>
      _HydrationService._(session: _session, user: _user);

  factory _HydrationService.guest() => _HydrationService._();

  factory _HydrationService.unavailable() =>
      _HydrationService._(sessionAbsenceUnconfirmed: true);

  factory _HydrationService.profileUnavailable() => _HydrationService._(
        session: _session,
        failUserRead: true,
      );

  @override
  int get sessionEpoch => 7;

  @override
  Future<AuthSession?> readSession() async {
    final gate = sessionGate;
    session = gate == null ? session : await gate.future;
    return session;
  }

  @override
  Future<bool> isOwnerCurrent(SessionTransitionOwner owner) async =>
      session != null &&
      owner.authOwner.sessionId == session?.sessionId &&
      (owner.profileUserId == null || owner.profileUserId == user?.id);

  @override
  Future<bool> isNoSessionEpochCurrent(int expectedEpoch) async =>
      expectedEpoch == sessionEpoch &&
      session == null &&
      !sessionAbsenceUnconfirmed;

  @override
  Future<User?> currentUserForOwner(
    SessionTransitionOwner owner, {
    bool synchronize = false,
  }) async {
    observedOwnerIds.add(owner.authOwner.userId);
    if (owner.authOwner.sessionId != session?.sessionId) return null;
    if (failUserRead) throw StateError('synthetic profile unavailable');
    final gate = userGate;
    user = gate == null ? user : await gate.future;
    return user;
  }

  @override
  Future<User?> cachedCurrentUserForOwner(SessionTransitionOwner owner) async =>
      user;
}
