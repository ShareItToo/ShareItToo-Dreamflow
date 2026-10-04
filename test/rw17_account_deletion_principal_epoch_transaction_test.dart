import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/account_deleted_screen.dart';
import 'package:lendify/screens/account_settings_screen.dart';
import 'package:lendify/services/account_deletion_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/blocked_users_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('only exact account-deletion contracts are definite rejections',
      () async {
    const rejected = <BackendException>[
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(401, 'account_not_active'),
      BackendException(401, 'invalid_credentials'),
      BackendException(409, 'account_deletion_blocked'),
      BackendException(429, 'rate_limit_exceeded'),
    ];

    for (final error in rejected) {
      await _expectDeletionFailure(error, AccountDeletionFailureKind.rejected);
    }
  });

  test('408 intermediary and unstructured deletion failures stay unknown',
      () async {
    const unknown = <BackendException>[
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

    for (final error in unknown) {
      await _expectDeletionFailure(
        error,
        AccountDeletionFailureKind.outcomeUnknown,
      );
    }
  });

  test('server success and local cleanup failure remain explicitly distinct',
      () async {
    final service = _ClassifyingDeletionService(
      localFailure: StateError('synthetic local finalization failure'),
    );

    await expectLater(
      service.deleteAccount(
        context: _contextA,
        currentPassword: _syntheticAccountProof,
      ),
      throwsA(
        isA<AccountDeletionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              AccountDeletionFailureKind.confirmedLocalFinalizationFailed,
            )
            .having(
              (failure) => failure.serverDeletionConfirmed,
              'serverDeletionConfirmed',
              true,
            ),
      ),
    );
  });

  test('remote deletion is dispatched only for the captured auth owner',
      () async {
    final service = _ClassifyingDeletionService();

    await service.deleteAccount(
      context: _contextA,
      currentPassword: _syntheticAccountProof,
    );

    expect(service.deletedOwner, same(_contextA.owner.authOwner));
  });

  test('local-only partial failure never claims server confirmation', () async {
    final service = _LocalFailureDeletionService();

    await expectLater(
      service.deleteAccount(
        context: _contextA,
        currentPassword: _syntheticAccountProof,
      ),
      throwsA(
        isA<AccountDeletionFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              AccountDeletionFailureKind.localFinalizationFailed,
            )
            .having(
              (failure) => failure.serverDeletionConfirmed,
              'serverDeletionConfirmed',
              false,
            ),
      ),
    );
  });

  test('preflight transport failure is unavailable, never a blocker', () async {
    final service = _ClassifyingDeletionService(
      preflightError: const BackendException(503, 'service_unavailable'),
    );

    await expectLater(
      service.preflightCheck(_contextA),
      throwsA(
        isA<AccountDeletionPreflightFailure>().having(
          (failure) => failure.kind,
          'kind',
          AccountDeletionPreflightFailureKind.unavailable,
        ),
      ),
    );
  });

  test('confirmed Account A bucket cleanup preserves active Account B',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{'items': '[]'});
    await _useStoredSession('account-a', _userA.email);
    await DataService.setItemWishlist('saved-a', DataService.wlSoonId);
    await DataService.setSavedDateRange(
      'listing-a',
      start: DateTime.utc(2026, 9, 1),
      end: DateTime.utc(2026, 9, 2),
    );
    await BlockedUsersService.blockUser('blocked-by-a');

    await _useStoredSession('account-b', _userB.email);
    await DataService.setItemWishlist('saved-b', DataService.wlLaterId);
    await DataService.setSavedDateRange(
      'listing-b',
      start: DateTime.utc(2026, 10, 1),
      end: DateTime.utc(2026, 10, 2),
    );
    await BlockedUsersService.blockUser('blocked-by-b');

    await DataService.clearOperationalRecordsForConfirmedAccountDeletion(
      _userA.id,
    );
    await DataService.clearSavedItemsForConfirmedAccountDeletion(_userA.id);
    await LocalSafetyPrivacyService.clearPrincipalForConfirmedAccountDeletion(
      _userA.id,
    );

    expect(await DataService.getSavedItemIds(), <String>{'saved-b'});
    expect(
      await DataService.getSavedDateRange('listing-b'),
      (DateTime.utc(2026, 10, 1), DateTime.utc(2026, 10, 2)),
    );
    expect(await BlockedUsersService.isBlocked('blocked-by-b'), isTrue);

    await _useStoredSession('account-a', _userA.email);
    expect(await DataService.getSavedItemIds(), isEmpty);
    expect(await DataService.getSavedDateRange('listing-a'), (null, null));
    expect(await BlockedUsersService.isBlocked('blocked-by-a'), isFalse);
  });

  test('confirmed A profile finalization anonymizes A and preserves B',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[_userA.toJson(), _userB.toJson()]),
      'currentUser': jsonEncode(_userB.toJson()),
      'account_deleted_v1': false,
    });

    await DataService.finalizeProfileForConfirmedAccountDeletion(
      userId: _userA.id,
      email: _userA.email,
    );

    final prefs = await SharedPreferences.getInstance();
    final current = User.fromJson(
      jsonDecode(prefs.getString('currentUser')!) as Map<String, dynamic>,
    );
    final users = (jsonDecode(prefs.getString('users')!) as List)
        .whereType<Map>()
        .map((entry) => User.fromJson(Map<String, dynamic>.from(entry)))
        .toList();
    final deletedA = users.singleWhere((entry) => entry.id == _userA.id);

    expect(current.id, _userB.id);
    expect(current.email, _userB.email);
    expect(deletedA.isDeactivated, isTrue);
    expect(deletedA.email, 'deleted+${_userA.id}@shareittoo.invalid');
    expect(prefs.getBool('account_deleted_v1'), isFalse);
  });

  test('confirmed A finalization treats a stable B as preserved success',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[_userA.toJson(), _userB.toJson()]),
      'currentUser': jsonEncode(_userB.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': _userB.id,
        'sessionId': 'session-${_userB.id}',
        'email': _userB.email,
        'createdAt': DateTime.utc(2026, 8, 26).toIso8601String(),
      }),
    });
    final service = _ConfirmedFinalizationService();

    final completion = await service.finalize(_contextA);

    expect(completion.localSessionDefinitelyCleared, isFalse);
    expect(await service.isCompletionCurrent(completion), isFalse);
    final prefs = await SharedPreferences.getInstance();
    expect(
      User.fromJson(
        jsonDecode(prefs.getString('currentUser')!) as Map<String, dynamic>,
      ).id,
      _userB.id,
    );
    expect(
      (jsonDecode(prefs.getString('auth_session_v1')!)
          as Map<String, dynamic>)['userId'],
      _userB.id,
    );
  });

  test('a later authenticated B profile clears the A-only deletion marker',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[_userA.toJson(), _userB.toJson()]),
      'currentUser': jsonEncode(_userA.toJson()),
    });
    await DataService.finalizeProfileForConfirmedAccountDeletion(
      userId: _userA.id,
      email: _userA.email,
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('account_deleted_v1'), isTrue);
    expect(prefs.getString('currentUser'), isNull);

    await DataService.setCurrentUser(_userB);

    expect(prefs.containsKey('account_deleted_v1'), isFalse);
    expect(
      User.fromJson(
        jsonDecode(prefs.getString('currentUser')!) as Map<String, dynamic>,
      ).id,
      _userB.id,
    );
  });

  testWidgets('Account A confirmation is dismissed before it can run under B',
      (tester) async {
    final service = _SwitchableDeletionService();
    await _pumpAccountSettings(tester, service);
    await _openDeletionStep2(tester);

    service.activateAccountB();
    await tester.pumpAndSettle();

    expect(find.text('Bist du sicher?'), findsNothing);
    expect(service.preflightCalls, 0);
    expect(service.deleteCalls, 0);
  });

  testWidgets('delayed Account A preflight cannot render blockers under B',
      (tester) async {
    final preflight = Completer<AccountDeletionPreflightResult>();
    final service = _SwitchableDeletionService(preflight: preflight);
    await _pumpAccountSettings(tester, service);
    await _confirmDeletion(tester);

    expect(service.preflightCalls, 1);
    service.activateAccountB();
    await tester.pump();
    preflight.complete(
      const AccountDeletionPreflightResult(
        canDelete: false,
        blockers: <AccountDeletionBlocker>[
          AccountDeletionBlocker(
            id: 'active_bookings',
            label: 'Account A Blocker',
            count: 1,
          ),
        ],
        retainedRecords: <AccountDeletionRetainedRecord>[],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Account A Blocker'), findsNothing);
    expect(service.deleteCalls, 0);
  });

  testWidgets('delayed Account A deletion success never navigates Account B',
      (tester) async {
    final deletion = Completer<AccountDeletionCompletion>();
    final service = _SwitchableDeletionService(deletion: deletion);
    await _pumpAccountSettings(tester, service);
    await _confirmDeletion(tester);

    expect(service.deleteCalls, 1);
    service.activateAccountB();
    await tester.pump();
    deletion.complete(
      const AccountDeletionCompletion(
        completionEpoch: 2,
        localSessionDefinitelyCleared: true,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(AccountDeletedScreen), findsNothing);
    expect(service.accountBActive, isTrue);
  });

  testWidgets('dismissing A deletion dialog preserves a newer B-owned dialog',
      (tester) async {
    final service = _SwitchableDeletionService();
    await _pumpAccountSettings(tester, service);
    await _openDeletionStep2(tester);

    service.activateAccountB(notify: false);
    final bHandle = TrackedDialogRouteHandle<void>();
    unawaited(
      showTrackedDialog<void>(
        context: tester.element(find.byType(AccountSettingsScreen)),
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

    expect(find.text('Bist du sicher?'), findsNothing);
    expect(find.text('Account B eigener Dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
  });
}

const _syntheticAccountProof = 'synthetic-current-password';

Future<void> _useStoredSession(String userId, String email) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    'auth_session_v1',
    jsonEncode(<String, Object>{
      'userId': userId,
      'sessionId': 'session-$userId',
      'email': email,
      'createdAt': DateTime.utc(2026, 8, 26).toIso8601String(),
    }),
  );
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

AccountDeletionContext _context(String id, User user, int epoch) =>
    AccountDeletionContext(
      user: user,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: user.email,
          createdAt: DateTime.utc(2026, 8, 26, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
    );

final _contextA = _context('account-a', _userA, 1);
final _contextB = _context('account-b', _userB, 2);

Future<void> _expectDeletionFailure(
  BackendException error,
  AccountDeletionFailureKind kind,
) async {
  final service = _ClassifyingDeletionService(deleteError: error);
  await expectLater(
    service.deleteAccount(
      context: _contextA,
      currentPassword: _syntheticAccountProof,
    ),
    throwsA(
      isA<AccountDeletionFailure>().having(
        (failure) => failure.kind,
        'kind',
        kind,
      ),
    ),
  );
}

Future<void> _pumpAccountSettings(
  WidgetTester tester,
  AccountDeletionService service,
) async {
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => LocalizationController()),
        ChangeNotifierProvider(create: (_) => MainNavController()),
      ],
      child: MaterialApp(
        home: AccountSettingsScreen(accountDeletionService: service),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openDeletionStep2(WidgetTester tester) async {
  final tile = find.text('Konto löschen');
  await tester.ensureVisible(tile);
  await tester.pumpAndSettle();
  await tester.tap(tile);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Konto endgültig löschen'));
  await tester.pumpAndSettle();
}

Future<void> _confirmDeletion(WidgetTester tester) async {
  await _openDeletionStep2(tester);
  await tester.enterText(
    find.widgetWithText(TextField, 'Zum Bestätigen „LÖSCHEN“ eingeben'),
    'LÖSCHEN',
  );
  await tester.enterText(
    find.widgetWithText(TextField, 'Aktuelles Passwort'),
    _syntheticAccountProof,
  );
  await tester.pump();
  await tester.tap(find.text('Ja, Konto endgültig löschen'));
  await tester.pump();
}

class _SwitchableDeletionService extends AccountDeletionService {
  final Completer<AccountDeletionPreflightResult>? preflight;
  final Completer<AccountDeletionCompletion>? deletion;
  bool accountBActive = false;
  int loadCalls = 0;
  int preflightCalls = 0;
  int deleteCalls = 0;

  _SwitchableDeletionService({this.preflight, this.deletion});

  @override
  Future<AccountDeletionContext?> loadCurrentContext() async {
    loadCalls += 1;
    return accountBActive ? _contextB : _contextA;
  }

  @override
  Future<bool> isContextCurrent(AccountDeletionContext context) async =>
      accountBActive
          ? identical(context, _contextB)
          : identical(context, _contextA);

  @override
  Future<AccountDeletionPreflightResult> preflightCheck(
    AccountDeletionContext context,
  ) async {
    preflightCalls += 1;
    if (!await isContextCurrent(context)) {
      throw StateError('stale principal');
    }
    return preflight?.future ??
        const AccountDeletionPreflightResult(
          canDelete: true,
          blockers: <AccountDeletionBlocker>[],
          retainedRecords: <AccountDeletionRetainedRecord>[],
        );
  }

  @override
  Future<AccountDeletionCompletion> deleteAccount({
    required AccountDeletionContext context,
    required String currentPassword,
  }) async {
    deleteCalls += 1;
    if (!await isContextCurrent(context)) {
      throw StateError('stale principal');
    }
    return deletion?.future ??
        const AccountDeletionCompletion(
          completionEpoch: 2,
          localSessionDefinitelyCleared: true,
        );
  }

  @override
  Future<bool> isCompletionCurrent(
    AccountDeletionCompletion completion,
  ) async =>
      !accountBActive && completion.localSessionDefinitelyCleared;

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

class _ClassifyingDeletionService extends AccountDeletionService {
  final Object? preflightError;
  final Object? deleteError;
  final Object? localFailure;
  AuthSessionOwner? deletedOwner;

  _ClassifyingDeletionService({
    this.preflightError,
    this.deleteError,
    this.localFailure,
  });

  @override
  bool get backendEnabled => true;

  @override
  Future<bool> isContextCurrent(AccountDeletionContext context) async => true;

  @override
  Future<Map<String, dynamic>> fetchRemotePreflight() async {
    if (preflightError case final Object error) throw error;
    return const <String, dynamic>{
      'canDelete': true,
      'blockers': <Object>[],
      'retainedRecords': <Object>[],
    };
  }

  @override
  Future<void> deleteRemoteAccount({
    required AuthSessionOwner owner,
    required String currentPassword,
  }) async {
    deletedOwner = owner;
    if (deleteError case final Object error) throw error;
  }

  @override
  Future<AccountDeletionCompletion> finalizeConfirmedDeletion(
    AccountDeletionContext context,
  ) async {
    if (localFailure case final Object error) throw error;
    return const AccountDeletionCompletion(
      completionEpoch: 2,
      localSessionDefinitelyCleared: true,
    );
  }

  @override
  Future<AccountDeletionCompletion?> clearExactSessionAfterUnknown(
    AccountDeletionContext context,
  ) async =>
      null;

  @override
  Future<AccountDeletionCompletion?> currentLocalCompletionOrNull() async =>
      null;
}

class _LocalFailureDeletionService extends AccountDeletionService {
  @override
  bool get backendEnabled => false;

  @override
  Future<bool> isContextCurrent(AccountDeletionContext context) async => true;

  @override
  Future<AccountDeletionCompletion> deleteLocalAccount(
    AccountDeletionContext context,
  ) async {
    throw StateError('synthetic local finalization failure');
  }

  @override
  Future<AccountDeletionCompletion?> currentLocalCompletionOrNull() async =>
      null;
}

class _ConfirmedFinalizationService extends AccountDeletionService {
  @override
  Future<bool> isContextCurrent(AccountDeletionContext context) async => false;

  Future<AccountDeletionCompletion> finalize(
    AccountDeletionContext context,
  ) =>
      finalizeConfirmedDeletion(context);
}
