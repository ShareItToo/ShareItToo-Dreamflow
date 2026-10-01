import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_supply_demand.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/mission_supply_demand_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/mission_supply_demand_gateway.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

import 'support/mission_supply_demand_builders.dart';

final _createContext = MissionSupplyDemandCreateContext(
  resolutionId: testMissionSupplyResolutionId,
  resolutionRevision: 1,
  slotKey: testMissionSupplySlotKey,
  needKey: 'plant_container_equipment',
  necessity: 'required',
  ordinal: 2,
  periodEnd: DateTime.utc(2026, 11, 12),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('explicit expiry and unknown outcome reuse exact create command',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final gateway = _DemandGateway()..createErrorCount = 1;
    await tester.pumpWidget(MaterialApp(
      home: MissionSupplyDemandScreen(
        createContext: _createContext,
        gateway: gateway,
        listingMutationService: _ContextService(),
        idempotencyKeyFactory: () => 'stable-demand-key-0001',
        clock: () => DateTime.utc(2026, 10, 1, 12),
        expiryPicker: (_, __, ___) async => DateTime.utc(2026, 11, 9, 12),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Ablauf ausdrücklich wählen'), findsOneWidget);
    expect(find.textContaining('Menge 1'), findsOneWidget);
    expect(find.textContaining('Menge 2'), findsNothing);
    await tester.tap(find.byKey(const Key('mission-demand-expiry')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-demand-create')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Ausgang unklar'), findsOneWidget);
    await tester.tap(find.byKey(const Key('mission-demand-create')));
    await tester.pumpAndSettle();

    expect(gateway.createKeys, <String>[
      'stable-demand-key-0001',
      'stable-demand-key-0001',
    ]);
    expect(gateway.createExpiries.toSet(),
        <DateTime>{DateTime.utc(2026, 11, 9, 12)});
    expect(find.text('Von dir angefragt'), findsOneWidget);
  });

  testWidgets('409 preserves explicit expiry and exact idempotency key',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final gateway = _DemandGateway()..createConflictCount = 2;
    await tester.pumpWidget(MaterialApp(
      home: MissionSupplyDemandScreen(
        createContext: _createContext,
        gateway: gateway,
        listingMutationService: _ContextService(),
        idempotencyKeyFactory: () => 'stable-conflict-key-0001',
        clock: () => DateTime.utc(2026, 10, 1, 12),
        expiryPicker: (_, __, ___) async => DateTime.utc(2026, 11, 9, 12),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mission-demand-expiry')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-demand-create')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Konflikt'), findsOneWidget);
    expect(find.textContaining('09.11.2026'), findsOneWidget);

    await tester.tap(find.byKey(const Key('mission-demand-create')));
    await tester.pumpAndSettle();
    expect(gateway.createKeys, <String>[
      'stable-conflict-key-0001',
      'stable-conflict-key-0001',
    ]);
    expect(gateway.createExpiries.toSet(),
        <DateTime>{DateTime.utc(2026, 11, 9, 12)});
  });

  testWidgets('interleaved actions retain each exact request key',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var sequence = 0;
    final gateway = _DemandGateway()
      ..createErrorCount = 1
      ..demands = <MissionSupplyDemand>[
        MissionSupplyDemand.fromJson(testMissionSupplyDemandJson(
          role: MissionSupplyDemandRole.recipient,
        )),
      ];
    await tester.pumpWidget(MaterialApp(
      home: MissionSupplyDemandScreen(
        createContext: _createContext,
        gateway: gateway,
        listingMutationService: _ContextService(),
        idempotencyKeyFactory: () => 'interleaved-key-${++sequence}',
        clock: () => DateTime.utc(2026, 10, 1, 12),
        expiryPicker: (_, __, ___) async => DateTime.utc(2026, 11, 9, 12),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mission-demand-expiry')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-demand-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(
      const ValueKey('mission-demand-reject-$testMissionSupplyDemandId'),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-demand-create')));
    await tester.pumpAndSettle();

    expect(
        gateway.createKeys, <String>['interleaved-key-1', 'interleaved-key-1']);
    expect(gateway.respondKeys, <String>['interleaved-key-2']);
  });

  testWidgets('recipient can release and revoke without public side effects',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final gateway = _DemandGateway()
      ..demands = <MissionSupplyDemand>[
        MissionSupplyDemand.fromJson(testMissionSupplyDemandJson(
          role: MissionSupplyDemandRole.recipient,
        )),
      ];
    await tester.pumpWidget(MaterialApp(
      home: MissionSupplyDemandScreen(
        gateway: gateway,
        listingMutationService: _ContextService(),
        idempotencyKeyFactory: () => 'stable-lifecycle-key-0001',
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('An dich gerichtet'), findsOneWidget);
    expect(find.textContaining('Keine öffentliche Anzeige'), findsOneWidget);
    await tester.tap(find.byKey(
      const ValueKey('mission-demand-release-$testMissionSupplyDemandId'),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('Privat freigegeben'), findsWidgets);
    await tester.tap(find.byKey(
      const ValueKey('mission-demand-revoke-$testMissionSupplyDemandId'),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('Widerrufen'), findsOneWidget);
    expect(gateway.respondKeys, <String>['stable-lifecycle-key-0001']);
    expect(gateway.revokeKeys, <String>['stable-lifecycle-key-0001']);
  });

  testWidgets(
      'account switch discards late account-A list and clears private state',
      (tester) async {
    final gateway = _DemandGateway();
    final lateA = Completer<List<MissionSupplyDemand>>();
    gateway.lateAccountA = lateA;
    final service = _ContextService();
    await tester.pumpWidget(MaterialApp(
      home: MissionSupplyDemandScreen(
        gateway: gateway,
        listingMutationService: service,
        enableForTesting: true,
      ),
    ));
    await tester.pump();
    service.accountB = true;
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    expect(
        find.text('Keine privaten Bedarfsanfragen vorhanden.'), findsOneWidget);

    lateA.complete(<MissionSupplyDemand>[
      MissionSupplyDemand.fromJson(testMissionSupplyDemandJson()),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('Von dir angefragt'), findsNothing);
  });

  testWidgets('account switch discards late account-A expiry selection',
      (tester) async {
    final expiry = Completer<DateTime?>();
    final service = _ContextService();
    await tester.pumpWidget(MaterialApp(
      home: MissionSupplyDemandScreen(
        createContext: _createContext,
        gateway: _DemandGateway(),
        listingMutationService: service,
        clock: () => DateTime.utc(2026, 10, 1, 12),
        expiryPicker: (_, __, ___) => expiry.future,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mission-demand-expiry')));
    await tester.pump();
    service.accountB = true;
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    expiry.complete(DateTime.utc(2026, 11, 9, 12));
    await tester.pumpAndSettle();

    expect(find.text('Ablauf ausdrücklich wählen'), findsOneWidget);
    expect(find.textContaining('09.11.2026'), findsNothing);
  });

  testWidgets('account switch after write prevents account-A follow-up read',
      (tester) async {
    final create = Completer<MissionSupplyDemandWriteResult>();
    final gateway = _DemandGateway()..lateCreate = create;
    final service = _ContextService();
    await tester.pumpWidget(MaterialApp(
      home: MissionSupplyDemandScreen(
        createContext: _createContext,
        gateway: gateway,
        listingMutationService: service,
        clock: () => DateTime.utc(2026, 10, 1, 12),
        expiryPicker: (_, __, ___) async => DateTime.utc(2026, 11, 9, 12),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mission-demand-expiry')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-demand-create')));
    await tester.pump();
    service.accountB = true;
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    create.complete(MissionSupplyDemandWriteResult(
      demand: MissionSupplyDemand.fromJson(testMissionSupplyDemandJson()),
      replayed: false,
    ));
    await tester.pumpAndSettle();

    expect(gateway.listOwners.where((id) => id == 'account-a').length, 1);
    expect(find.text('Von dir angefragt'), findsNothing);
  });
}

ListingMutationContext _context(String id, int epoch) => ListingMutationContext(
      user: User(
        id: id,
        displayName: id,
        email: '$id@example.invalid',
        city: 'Heilbronn',
        preferredLanguage: 'de',
        isVerified: true,
        isBanned: false,
        role: 'user',
        avgRating: 0,
        reviewCount: 0,
        createdAt: DateTime.utc(2026, 1, 1),
      ),
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: '$id@example.invalid',
          createdAt: DateTime.utc(2026, 10, 1, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
    );

class _ContextService extends ListingMutationService {
  final contextA = _context('account-a', 1);
  final contextB = _context('account-b', 2);
  bool accountB = false;

  @override
  Future<ListingMutationContext?> loadCurrentContext() async =>
      accountB ? contextB : contextA;

  @override
  Future<bool> isContextCurrent(ListingMutationContext context) async =>
      accountB ? identical(context, contextB) : identical(context, contextA);
}

class _DemandGateway implements MissionSupplyDemandGateway {
  List<MissionSupplyDemand> demands = <MissionSupplyDemand>[];
  int createErrorCount = 0;
  int createConflictCount = 0;
  Completer<MissionSupplyDemandWriteResult>? lateCreate;
  Completer<List<MissionSupplyDemand>>? lateAccountA;
  final List<String> listOwners = <String>[];
  final List<String> createKeys = <String>[];
  final List<DateTime> createExpiries = <DateTime>[];
  final List<String> respondKeys = <String>[];
  final List<String> revokeKeys = <String>[];

  @override
  Future<List<MissionSupplyDemand>> list(AuthSessionOwner owner) async {
    listOwners.add(owner.userId ?? '<anonymous>');
    final pending = lateAccountA;
    if (owner.userId == 'account-a' && pending != null) {
      lateAccountA = null;
      return pending.future;
    }
    return owner.userId == 'account-a'
        ? List<MissionSupplyDemand>.from(demands)
        : <MissionSupplyDemand>[];
  }

  @override
  Future<MissionSupplyDemand> load({
    required AuthSessionOwner owner,
    required String demandId,
  }) async =>
      demands.singleWhere((entry) => entry.demandId == demandId);

  @override
  Future<MissionSupplyDemandWriteResult> create({
    required AuthSessionOwner owner,
    required MissionSupplyDemandCreateContext context,
    required DateTime expiresAt,
    required String idempotencyKey,
  }) async {
    createKeys.add(idempotencyKey);
    createExpiries.add(expiresAt);
    if (createErrorCount > 0) {
      createErrorCount -= 1;
      throw const BackendException(503, 'outcome_unknown');
    }
    if (createConflictCount > 0) {
      createConflictCount -= 1;
      throw const BackendException(409, 'mission_supply_gap_demand_exists');
    }
    final pending = lateCreate;
    if (pending != null) {
      lateCreate = null;
      return pending.future;
    }
    final demand = MissionSupplyDemand.fromJson(testMissionSupplyDemandJson());
    demands = <MissionSupplyDemand>[demand];
    return MissionSupplyDemandWriteResult(demand: demand, replayed: false);
  }

  @override
  Future<MissionSupplyDemandWriteResult> respond({
    required AuthSessionOwner owner,
    required MissionSupplyDemand demand,
    required MissionSupplyDemandDecision decision,
    required String idempotencyKey,
  }) async {
    respondKeys.add(idempotencyKey);
    final value = MissionSupplyDemand.fromJson(testMissionSupplyDemandJson(
      role: MissionSupplyDemandRole.recipient,
      status: decision == MissionSupplyDemandDecision.release
          ? MissionSupplyDemandStatus.released
          : MissionSupplyDemandStatus.rejected,
      revision: 2,
    ));
    demands = <MissionSupplyDemand>[value];
    return MissionSupplyDemandWriteResult(demand: value, replayed: false);
  }

  @override
  Future<MissionSupplyDemandWriteResult> revoke({
    required AuthSessionOwner owner,
    required MissionSupplyDemand demand,
    required String idempotencyKey,
  }) async {
    revokeKeys.add(idempotencyKey);
    final value = MissionSupplyDemand.fromJson(testMissionSupplyDemandJson(
      role: MissionSupplyDemandRole.recipient,
      status: MissionSupplyDemandStatus.revoked,
      revision: 3,
    ));
    demands = <MissionSupplyDemand>[value];
    return MissionSupplyDemandWriteResult(demand: value, replayed: false);
  }
}
