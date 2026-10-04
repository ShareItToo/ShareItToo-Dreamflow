import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/my_listings_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/listing_mutation_interaction.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('listing mutation rejects only exact structured backend contracts', () {
    for (final error in const <BackendException>[
      BackendException(400, 'listing_title_required'),
      BackendException(400, 'listing_description_too_short'),
      BackendException(400, 'listing_category_required'),
      BackendException(400, 'invalid_listing_condition'),
      BackendException(400, 'listing_location_required'),
      BackendException(400, 'listing_photo_required'),
      BackendException(401, 'authentication_required'),
      BackendException(401, 'invalid_or_expired_session'),
      BackendException(401, 'account_not_active'),
      BackendException(403, 'listing_forbidden'),
      BackendException(403, 'action_blocked_by_moderation'),
      BackendException(404, 'listing_not_found'),
      BackendException(404, 'user_not_found'),
      BackendException(409, 'listing_revision_conflict'),
      BackendException(409, 'listing_locked_by_moderation'),
      BackendException(409, 'private_pilot_listing_region_unbound'),
      BackendException(429, 'rate_limit_exceeded'),
    ]) {
      expect(
        ListingMutationService.classifyBackendFailure(error),
        ListingMutationFailureKind.rejected,
      );
    }
  });

  test('408 intermediary and unstructured listing failures stay unknown', () {
    for (final error in const <BackendException>[
      BackendException(408, 'request_timeout'),
      BackendException(400, 'request_failed'),
      BackendException(401, 'request_failed'),
      BackendException(403, 'forbidden'),
      BackendException(409, 'conflict'),
      BackendException(422, 'unprocessable_content'),
      BackendException(429, 'request_failed'),
      BackendException(503, 'service_unavailable'),
    ]) {
      expect(
        ListingMutationService.classifyBackendFailure(error),
        ListingMutationFailureKind.outcomeUnknown,
      );
    }
  });

  test('Account A is checked immediately before listing mutation', () async {
    final service = _SwitchableListingMutationService()..activateAccountB();

    await expectLater(
      service.execute(
        context: _contextA,
        command: ListingMutationCommand.update(_itemA),
      ),
      throwsA(
        isA<ListingMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ListingMutationFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              false,
            ),
      ),
    );
    expect(service.mutationCalls, 0);
  });

  test('accepted Account A listing remains accepted truth after switch to B',
      () async {
    final remote = Completer<AccountListingMutationResult>();
    final service = _SwitchableListingMutationService(mutation: remote);
    final result = service.execute(
      context: _contextA,
      command: ListingMutationCommand.update(_itemA),
    );

    await Future<void>.delayed(Duration.zero);
    expect(service.mutationCalls, 1);
    service.activateAccountB();
    remote.complete(AccountListingMutationResult(
      item: _itemA,
      remoteAccepted: true,
    ));

    await expectLater(
      result,
      throwsA(
        isA<ListingMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ListingMutationFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('post-acceptance local failure never becomes listing unchanged',
      () async {
    final service = _SwitchableListingMutationService(
      failure: const AccountListingMutationFailure.localUnavailable(
        'local_listing_persistence_failed',
        remoteAccepted: true,
      ),
    );

    await expectLater(
      service.execute(
        context: _contextA,
        command: ListingMutationCommand.update(_itemA),
      ),
      throwsA(
        isA<ListingMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              ListingMutationFailureKind.localUnavailable,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              true,
            ),
      ),
    );
  });

  test('listing action owner binds exact context and action epoch', () {
    final owner = ListingMutationActionOwner(
      context: _contextA,
      actionEpoch: 7,
    );

    expect(
      owner.isSynchronouslyCurrent(context: _contextA, actionEpoch: 7),
      isTrue,
    );
    expect(
      owner.isSynchronouslyCurrent(context: _contextB, actionEpoch: 7),
      isFalse,
    );
    expect(
      owner.isSynchronouslyCurrent(context: _contextA, actionEpoch: 8),
      isFalse,
    );
  });

  testWidgets('dismissing A listing dialog preserves a newer B dialog',
      (tester) async {
    final controller = ListingMutationInteractionController()
      ..replaceContext(_contextA);
    final owner = controller.capture()!;
    final bHandle = TrackedDialogRouteHandle<void>();
    late BuildContext hostContext;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            hostContext = context;
            return const Scaffold(body: Text('host'));
          },
        ),
      ),
    );

    unawaited(
      controller.showOwnedDialog<void>(
        context: hostContext,
        owner: owner,
        builder: (_) => const AlertDialog(title: Text('Account A listing')),
      ),
    );
    await tester.pumpAndSettle();
    unawaited(
      showTrackedDialog<void>(
        context: hostContext,
        handle: bHandle,
        barrierLabel: 'Account B dialog',
        builder: (_) => const AlertDialog(title: Text('Account B dialog')),
      ),
    );
    await tester.pumpAndSettle();

    controller.invalidate();
    await tester.pumpAndSettle();

    expect(find.text('Bohrmaschine'), findsNothing);
    expect(find.text('Account B dialog'), findsOneWidget);
    bHandle.dismiss();
    await tester.pumpAndSettle();
    controller.dispose();
  });

  test('A create event is never consumed under Account B', () {
    DataService.setLastCreateEventForOwner(
      _contextA.owner.authOwner,
      _itemA,
      draft: false,
    );

    expect(
      DataService.takeLastCreateEventForOwner(_contextB.owner.authOwner),
      isNull,
    );
    expect(
      DataService.takeLastCreateEventForOwner(_contextA.owner.authOwner),
      isNull,
    );
  });

  test('owner-bound local listing commit rolls back on mid-write transition',
      () async {
    final rawItems = jsonEncode(<Object>[_itemA.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[_userA.toJson()]),
      'items': rawItems,
      'currentUser': jsonEncode(_userA.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': _userA.id,
        'sessionId': 'persisted-session-a',
        'email': _userA.email,
        'createdAt': '2026-08-26T12:00:00.000Z',
      }),
    });
    final session = await AuthService.readSession();
    expect(session, isNotNull);
    final owner = AuthService.captureSessionOwner(session!);
    DataService.clearSessionDuringNextListingPersistenceForTesting();

    await expectLater(
      DataService.updateItemStatusForOwner(
        owner: owner,
        expectedOwnerId: _userA.id,
        itemId: _itemA.id,
        status: 'paused',
      ),
      throwsA(
        isA<AccountListingMutationFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              AccountListingMutationFailureKind.principalChanged,
            )
            .having(
              (failure) => failure.remoteAccepted,
              'remote accepted',
              false,
            ),
      ),
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('items'), rawItems);
  });

  test('local owner without backend user id stays bound by exact email',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[_userA.toJson()]),
      'items': jsonEncode(<Object>[_itemA.toJson()]),
      'currentUser': jsonEncode(_userA.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'email': _userA.email,
        'createdAt': '2026-08-26T12:30:00.000Z',
      }),
    });
    final session = await AuthService.readSession();
    expect(session, isNotNull);
    expect(session!.userId, isNull);
    final owner = AuthService.captureSessionOwner(session);

    final result = await DataService.updateItemStatusForOwner(
      owner: owner,
      expectedOwnerId: _userA.id,
      itemId: _itemA.id,
      status: 'paused',
    );

    expect(result.item?.ownerId, _userA.id);
    expect(result.item?.status, 'paused');
    expect(result.remoteAccepted, isFalse);
  });

  testWidgets('delayed accepted A listing result stays invisible under B',
      (tester) async {
    final remote = Completer<AccountListingMutationResult>();
    final service = _SwitchableListingMutationService(mutation: remote);
    final itemB = Item.fromJson(<String, dynamic>{
      ..._itemA.toJson(),
      'id': 'listing-b',
      'ownerId': _userB.id,
      'title': 'Account B listing',
    });
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[_itemA.toJson(), itemB.toJson()]),
    });
    await _pumpMyListings(tester, service);

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pausieren'));
    await tester.pump();
    expect(service.mutationCalls, 1);

    service.activateAccountB(notify: true);
    remote.complete(AccountListingMutationResult(
      item: Item.fromJson(<String, dynamic>{
        ..._itemA.toJson(),
        'status': 'paused',
        'isActive': false,
      }),
      remoteAccepted: true,
    ));
    await tester.pumpAndSettle();

    expect(find.text('Account A listing'), findsNothing);
    expect(find.text('Account B listing'), findsOneWidget);
    expect(find.text('Serverseitig verarbeitet'), findsNothing);
    expect(find.text('Änderungsstatus unklar'), findsNothing);
  });

  testWidgets('Account A listing action dialog closes before any B mutation',
      (tester) async {
    final service = _SwitchableListingMutationService();
    final itemB = Item.fromJson(<String, dynamic>{
      ..._itemA.toJson(),
      'id': 'listing-b-dialog',
      'ownerId': _userB.id,
      'title': 'Account B dialog listing',
    });
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[_itemA.toJson(), itemB.toJson()]),
    });
    await _pumpMyListings(tester, service);

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('Pausieren'), findsOneWidget);

    service.activateAccountB(notify: true);
    await tester.pumpAndSettle();

    expect(find.text('Pausieren'), findsNothing);
    expect(find.text('Bohrmaschine'), findsNothing);
    expect(find.text('Account B dialog listing'), findsOneWidget);
    expect(service.mutationCalls, 0);
  });

  testWidgets('unknown listing outcome is never described as unchanged',
      (tester) async {
    final service = _SwitchableListingMutationService(
      failure: const AccountListingMutationFailure.outcomeUnknown(
        'request_timeout',
      ),
    );
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[_itemA.toJson()]),
    });
    await _pumpMyListings(tester, service);

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pausieren'));
    await tester.pumpAndSettle();

    expect(find.text('Änderungsstatus unklar'), findsOneWidget);
    expect(
        find.textContaining('könnte serverseitig verarbeitet'), findsOneWidget);
    expect(find.textContaining('blieb unverändert'), findsNothing);
  });
}

Future<void> _pumpMyListings(
  WidgetTester tester,
  ListingMutationService service,
) async {
  tester.view.physicalSize = const Size(800, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ChangeNotifierProvider<LocalizationController>(
      create: (_) => LocalizationController(),
      child: MaterialApp(
        home: MyListingsScreen(listingMutationService: service),
      ),
    ),
  );
  await tester.pumpAndSettle();
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

ListingMutationContext _context(String id, User user, int epoch) =>
    ListingMutationContext(
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

final _itemA = Item(
  id: 'listing-a',
  ownerId: _userA.id,
  title: 'Bohrmaschine',
  description: 'Synthetische Testanzeige',
  categoryId: 'cat8',
  subcategory: 'Bohrmaschinen',
  tags: const <String>[],
  pricePerDay: 10,
  currency: 'EUR',
  priceUnit: 'day',
  priceRaw: 10,
  photos: const <String>['fixture://listing-a'],
  locationText: 'A-Stadt',
  lat: 49,
  lng: 9,
  geohash: 'u0',
  condition: 'good',
  minDays: 1,
  maxDays: 30,
  createdAt: DateTime.utc(2026, 8, 26),
  isActive: true,
  verificationStatus: 'pending',
  city: 'A-Stadt',
  country: 'Deutschland',
  status: 'active',
  cancellationPolicy: 'unified',
  availabilityMode: 'calendar',
  privateStatusConfirmed: true,
);

class _SwitchableListingMutationService extends ListingMutationService {
  final Completer<AccountListingMutationResult>? mutation;
  final AccountListingMutationFailure? failure;
  bool accountBActive = false;
  int mutationCalls = 0;

  _SwitchableListingMutationService({this.mutation, this.failure});

  @override
  Future<ListingMutationContext?> loadCurrentContext() async =>
      accountBActive ? _contextB : _contextA;

  @override
  Future<bool> isContextCurrent(ListingMutationContext context) async =>
      accountBActive
          ? identical(context, _contextB)
          : identical(context, _contextA);

  @override
  Future<AccountListingMutationResult> performListingMutation({
    required ListingMutationContext context,
    required ListingMutationCommand command,
  }) {
    mutationCalls += 1;
    if (failure case final failure?) {
      return Future<AccountListingMutationResult>.error(failure);
    }
    return mutation?.future ??
        Future<AccountListingMutationResult>.value(
          AccountListingMutationResult(
            item: command.item,
            remoteAccepted: false,
          ),
        );
  }

  void activateAccountB({bool notify = false}) {
    accountBActive = true;
    if (notify) {
      SharedPersistenceSync.notify(
        SharedPersistenceSync.accountSecurityStateKey,
      );
    }
  }
}
