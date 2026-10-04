import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_supply_participation.dart';
import 'package:lendify/models/private_shelf_item.dart';
import 'package:lendify/screens/private_shelf_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/mission_supply_participation_gateway.dart';
import 'package:lendify/services/private_shelf_gateway.dart';
import 'package:lendify/services/session_transition_service.dart';

import 'support/test_builders.dart';

const _itemId = 'shelf_item_33333333-3333-4333-8333-333333333333';
const _participationId =
    'mission_supply_participation_44444444-4444-4444-8444-444444444444';

final _user = buildTestUser(
  'participation-owner',
  name: 'Participation Owner',
  email: 'participation-owner@example.invalid',
);

final _context = ListingMutationContext(
  user: _user,
  owner: SessionTransitionOwner(
    authOwner: AuthSessionOwner(
      userId: 'participation-owner',
      sessionId: 'participation-session',
      email: _user.email,
      createdAt: DateTime.utc(2026, 10, 1, 8),
      epoch: 1,
    ),
    profileUserId: 'participation-owner',
  ),
);

PrivateShelfItem _shelfItem() => PrivateShelfItem(
      shelfItemId: _itemId,
      domainVersion: privateShelfDomainVersion,
      title: 'Pflanzkiste',
      categoryKey: missionSupplyParticipationNeedKey,
      condition: PrivateShelfCondition.good,
      media: const <PrivateShelfMedia>[],
      createdAt: DateTime.utc(2026, 10, 1, 8),
      updatedAt: DateTime.utc(2026, 10, 1, 8),
    );

MissionSupplyParticipationSnapshot _snapshot({
  MissionSupplyParticipation? participation,
}) =>
    MissionSupplyParticipationSnapshot(
      participation: participation,
      visibility: 'private_owner_only',
      matchingActivated: false,
    );

MissionSupplyParticipation _participation({
  MissionSupplyParticipationStatus status =
      MissionSupplyParticipationStatus.active,
  int revision = 1,
  List<MissionSupplyParticipationItem> items = const [],
}) =>
    MissionSupplyParticipation(
      participationId: _participationId,
      domainVersion: missionSupplyParticipationDomainVersion,
      currentRevision: revision,
      status: status,
      createdAt: DateTime.utc(2026, 10, 1, 8),
      updatedAt: DateTime.utc(2026, 10, 1, 8),
      items: items,
    );

class _ContextService extends ListingMutationService {
  bool loggedOut = false;

  @override
  Future<ListingMutationContext?> loadCurrentContext() async =>
      loggedOut ? null : _context;

  @override
  Future<bool> isContextCurrent(ListingMutationContext context) async =>
      !loggedOut && identical(context, _context);
}

class _ShelfGateway implements PrivateShelfGateway {
  @override
  Future<List<PrivateShelfItem>> list(AuthSessionOwner owner) async =>
      <PrivateShelfItem>[_shelfItem()];

  @override
  Future<PrivateShelfItem> load({
    required AuthSessionOwner owner,
    required String shelfItemId,
  }) async =>
      _shelfItem();

  @override
  Future<PrivateShelfWriteResult> create({
    required AuthSessionOwner owner,
    required PrivateShelfItemPayload payload,
    required String idempotencyKey,
  }) async =>
      PrivateShelfWriteResult(shelfItem: _shelfItem(), replayed: false);

  @override
  Future<void> delete({
    required AuthSessionOwner owner,
    required String shelfItemId,
  }) async {}

  @override
  Future<PrivateShelfMedia> uploadMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required Uint8List bytes,
    required String filename,
  }) async =>
      throw UnimplementedError();

  @override
  Future<PrivateShelfMediaBytes> readMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required PrivateShelfMedia media,
    required bool thumbnail,
  }) async =>
      throw UnimplementedError();
}

class _ParticipationGateway implements MissionSupplyParticipationGateway {
  MissionSupplyParticipationSnapshot state = _snapshot();
  int rootWrites = 0;
  int itemWrites = 0;
  int loadCalls = 0;
  bool failFirstLoad = false;
  bool conflictRootWrite = false;
  bool conflictItemWrite = false;
  final Completer<MissionSupplyParticipationSnapshot>? loadBarrier;

  _ParticipationGateway({this.loadBarrier});

  @override
  Future<MissionSupplyParticipationSnapshot> load(
      AuthSessionOwner owner) async {
    loadCalls += 1;
    if (failFirstLoad && loadCalls == 1) {
      throw const BackendException(503, 'temporary_failure');
    }
    if (loadBarrier != null) return loadBarrier!.future;
    return state;
  }

  @override
  Future<MissionSupplyParticipationWriteResult> setParticipation({
    required AuthSessionOwner owner,
    required MissionSupplyParticipationStatus status,
    required int expectedRevision,
    required String idempotencyKey,
  }) async {
    rootWrites += 1;
    if (conflictRootWrite) {
      conflictRootWrite = false;
      throw const BackendException(409, 'revision_conflict');
    }
    final next = _participation(
      status: status,
      revision: expectedRevision + 1,
    );
    state = _snapshot(participation: next);
    return MissionSupplyParticipationWriteResult(
      snapshot: state,
      command: MissionSupplyParticipationCommandResult(
        participationId: _participationId,
        revision: next.currentRevision,
        status: status == MissionSupplyParticipationStatus.active
            ? 'active'
            : 'withdrawn',
      ),
      replayed: false,
    );
  }

  @override
  Future<MissionSupplyParticipationWriteResult> setItem({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required MissionSupplyParticipationAvailability availabilityStatus,
    required int expectedParticipationRevision,
    required int expectedRevision,
    required String idempotencyKey,
  }) async {
    itemWrites += 1;
    if (conflictItemWrite) {
      conflictItemWrite = false;
      throw const BackendException(409, 'revision_conflict');
    }
    final item = MissionSupplyParticipationItem(
      shelfItemId: shelfItemId,
      needKey: missionSupplyParticipationNeedKey,
      revision: expectedRevision + 1,
      availabilityStatus: availabilityStatus,
      createdAt: DateTime.utc(2026, 10, 1, 8),
    );
    final next = _participation(
      revision: expectedParticipationRevision + 1,
      items: <MissionSupplyParticipationItem>[item],
    );
    state = _snapshot(participation: next);
    return MissionSupplyParticipationWriteResult(
      snapshot: state,
      command: MissionSupplyParticipationCommandResult(
        participationId: _participationId,
        revision: item.revision,
        status: availabilityStatus ==
                MissionSupplyParticipationAvailability.confirmedAvailable
            ? 'confirmed_available'
            : 'withdrawn',
        shelfItemId: shelfItemId,
        needKey: missionSupplyParticipationNeedKey,
      ),
      replayed: false,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('activates participation and confirms exactly one private item',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final gateway = _ParticipationGateway();
    final contextService = _ContextService();
    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: _ShelfGateway(),
        participationGateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mission-supply-participation-card')),
        findsOneWidget);
    expect(find.textContaining('Keine öffentliche Anzeige'), findsOneWidget);
    expect(find.textContaining('Suche'), findsOneWidget);
    expect(find.textContaining('Buchung oder Zahlung'), findsOneWidget);
    await tester
        .tap(find.byKey(const Key('mission-supply-participation-toggle')));
    await tester.pumpAndSettle();
    expect(gateway.rootWrites, 1);
    await tester.ensureVisible(
      find.byKey(const Key('mission-supply-item-toggle-$_itemId')),
    );
    await tester
        .tap(find.byKey(const Key('mission-supply-item-toggle-$_itemId')));
    await tester.pumpAndSettle();
    expect(gateway.itemWrites, 1);
    expect(find.textContaining('vorgemerkt'), findsAtLeastNWidgets(1));
  });

  testWidgets('logout prevents a late participation snapshot from rendering',
      (tester) async {
    final barrier = Completer<MissionSupplyParticipationSnapshot>();
    final gateway = _ParticipationGateway(loadBarrier: barrier);
    final contextService = _ContextService();
    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: _ShelfGateway(),
        participationGateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pump();
    contextService.loggedOut = true;
    barrier.complete(_snapshot(participation: _participation()));
    await tester.pumpAndSettle();
    expect(find.text('Private Teilnahme'), findsNothing);
  });

  testWidgets('shows retry after the initial private participation load fails',
      (tester) async {
    final gateway = _ParticipationGateway()..failFirstLoad = true;
    final contextService = _ContextService();
    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: _ShelfGateway(),
        participationGateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Private Teilnahme konnte nicht geladen werden.'),
        findsOneWidget);
    expect(find.byKey(const Key('mission-supply-participation-retry')),
        findsOneWidget);
    await tester
        .tap(find.byKey(const Key('mission-supply-participation-retry')));
    await tester.pumpAndSettle();
    expect(gateway.loadCalls, 2);
    expect(find.byKey(const Key('mission-supply-participation-card')),
        findsOneWidget);
  });

  testWidgets(
      '409 root write refreshes current state without retrying mutation',
      (tester) async {
    final gateway = _ParticipationGateway()
      ..state = _snapshot(
          participation: _participation(
        status: MissionSupplyParticipationStatus.withdrawn,
        revision: 4,
      ))
      ..conflictRootWrite = true;
    final contextService = _ContextService();
    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: _ShelfGateway(),
        participationGateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester
        .tap(find.byKey(const Key('mission-supply-participation-toggle')));
    await tester.pumpAndSettle();
    expect(gateway.rootWrites, 1);
    expect(gateway.loadCalls, 2);
    expect(find.text('Stand aktualisiert – bitte erneut versuchen'),
        findsOneWidget);
  });

  testWidgets(
      '409 item write refreshes current state without retrying mutation',
      (tester) async {
    final gateway = _ParticipationGateway()
      ..state = _snapshot(participation: _participation())
      ..conflictItemWrite = true;
    final contextService = _ContextService();
    await tester.binding.setSurfaceSize(const Size(900, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: _ShelfGateway(),
        participationGateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
        find.byKey(const Key('mission-supply-item-toggle-$_itemId')));
    await tester
        .tap(find.byKey(const Key('mission-supply-item-toggle-$_itemId')));
    await tester.pumpAndSettle();
    expect(gateway.itemWrites, 1);
    expect(gateway.loadCalls, 2);
    expect(find.text('Stand aktualisiert – bitte erneut versuchen'),
        findsOneWidget);
  });
}
