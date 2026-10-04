import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_inventory_resolution.dart';
import 'package:lendify/models/mission_need.dart';
import 'package:lendify/models/mission_quorum_readback.dart';
import 'package:lendify/models/mission_supply_demand.dart';
import 'package:lendify/screens/mission_inventory_resolution_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/maps_service.dart';
import 'package:lendify/services/mission_inventory_resolution_gateway.dart';
import 'package:lendify/services/mission_need_gateway.dart';
import 'package:lendify/services/mission_quorum_readback_gateway.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

import 'support/mission_inventory_resolution_builders.dart';
import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'shows quantities, honest gaps/stale truth and preserves a 409 retry request',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(1000, 1800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = _ContextService();
    final initialResolution = _resolution(stale: true);
    final quorumGateway = _QuorumGateway();
    final gateway = _InventoryGateway(
      initial: <MissionInventoryResolution>[
        initialResolution,
      ],
    )..correctionError = const BackendException(
        409,
        'mission_inventory_revision_conflict',
        details: <String, dynamic>{'actualRevision': 2},
      );

    await tester.pumpWidget(MaterialApp(
      home: MissionInventoryResolutionScreen(
        missionNeedId: testMissionInventoryMissionId,
        missionGateway: _MissionGateway(),
        inventoryGateway: gateway,
        quorumGateway: quorumGateway,
        listingMutationService: service,
        autocomplete: (_) async => const <MapsAddressSuggestion>[
          MapsAddressSuggestion(
            description: 'Heilbronn, Deutschland',
            placeId: 'place-hn',
          ),
        ],
        placeLookup: (_) async => const PlaceDetails(
          formattedAddress: 'Heilbronn, Deutschland',
          lat: 49.14,
          lng: 9.22,
        ),
        tokenFactory: () => 'stabletoken000001',
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Aktuell unbekannt / veraltet'), findsOneWidget);
    expect(find.textContaining('1/2 zugeordnet'), findsOneWidget);
    expect(find.textContaining('Bedarfstyp nicht unterstützt'), findsWidgets);
    expect(find.text('Suche war begrenzt'), findsOneWidget);
    expect(find.textContaining('keine Reservierung, Buchung'), findsOneWidget);
    expect(find.byKey(const Key('mission-quorum-card')), findsOneWidget);
    expect(find.textContaining('keine Eignungs- oder Buchungsbestätigung'),
        findsOneWidget);
    expect(find.text('plant_container_equipment'), findsWidgets);
    await tester.tap(find.byKey(const Key('mission-quorum-refresh')));
    await tester.pumpAndSettle();
    expect(quorumGateway.calls, 1);
    expect(find.byKey(const Key('mission-quorum-error')), findsNothing);
    expect(find.byKey(const Key('mission-quorum-slot-required:plant_container_equipment:1')), findsOneWidget);
    expect(find.textContaining('veraltet oder unbekannt'), findsOneWidget);
    expect(
      find.byKey(const ValueKey(
        'mission-inventory-demand-required:plant_container_equipment:2',
      )),
      findsNothing,
    );

    await tester.tap(find.byKey(const Key('mission-inventory-correct')));
    await tester.pump();
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('mission-inventory-location-query')),
          )
          .controller!
          .text,
      'Heilbronn aus Profil',
    );
    expect(find.text('Ort ausdrücklich ausgewählt'), findsNothing);

    await tester.enterText(
      find.byKey(const Key('mission-inventory-location-query')),
      'Hei',
    );
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Heilbronn, Deutschland'));
    await tester.pumpAndSettle();
    expect(find.text('Ort ausdrücklich ausgewählt'), findsOneWidget);

    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('mission-inventory-save')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-inventory-save')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Revision 2'), findsOneWidget);
    expect(find.text('Heilbronn, Deutschland'), findsOneWidget);
    await tester.tap(find.byKey(const Key('mission-inventory-save')));
    await tester.pumpAndSettle();

    expect(gateway.corrections, hasLength(2));
    expect(
      gateway.corrections.map((entry) => entry.key).toSet(),
      <String>{'mission-inventory-stabletoken000001'},
    );
    expect(
      gateway.corrections
          .map((entry) => jsonEncode(entry.draft.toJson()))
          .toSet()
          .length,
      1,
    );
    quorumGateway.delay = Completer<void>();
    await tester.tap(find.byKey(const Key('mission-quorum-refresh')));
    await tester.pump();
    service.activateAccountB();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pump();
    quorumGateway.activeDelay!.complete();
    await tester.pumpAndSettle();
    expect(find.textContaining('veraltet oder unbekannt'), findsNothing);
  });

  testWidgets('past correction dates open a safely clamped picker',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(1000, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final value = testMissionInventoryResolutionJson();
    value['startDate'] = '2026-09-01';
    value['endDate'] = '2026-09-03';
    final snapshot = value['storedResolution'] as Map<String, dynamic>;
    snapshot['startDate'] = '2026-09-01';
    snapshot['endDate'] = '2026-09-03';

    await tester.pumpWidget(MaterialApp(
      home: MissionInventoryResolutionScreen(
        missionNeedId: testMissionInventoryMissionId,
        missionGateway: _MissionGateway(),
        inventoryGateway: _InventoryGateway(
          initial: <MissionInventoryResolution>[
            MissionInventoryResolution.fromJson(value),
          ],
        ),
        listingMutationService: _ContextService(),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-inventory-correct')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('mission-inventory-start-date')));
    await tester.pumpAndSettle();
    expect(find.byType(DatePickerDialog), findsOneWidget);
  });

  testWidgets(
      'a delayed context check cannot inject account-A suggestions after switch',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(1000, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = _ContextService();

    await tester.pumpWidget(MaterialApp(
      home: MissionInventoryResolutionScreen(
        missionNeedId: testMissionInventoryMissionId,
        missionGateway: _MissionGateway(),
        inventoryGateway: _InventoryGateway(
          initial: <MissionInventoryResolution>[_resolution()],
        ),
        listingMutationService: service,
        autocomplete: (_) async => const <MapsAddressSuggestion>[
          MapsAddressSuggestion(description: 'Privater Ort A', placeId: 'a'),
        ],
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-inventory-correct')));
    await tester.pump();

    final delayed = Completer<bool>();
    service.delayNextCheck = delayed;
    await tester.enterText(
      find.byKey(const Key('mission-inventory-location-query')),
      'Alt',
    );
    await tester.pump(const Duration(milliseconds: 350));
    service.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pump();
    delayed.complete(true);
    await tester.pumpAndSettle();

    expect(find.text('Privater Ort A'), findsNothing);
    expect(find.text('Mission B'), findsOneWidget);
    expect(find.byKey(const Key('mission-inventory-location-query')),
        findsNothing);
  });

  testWidgets(
      'exact current gap opens one owned demand route and switch removes only it',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(1000, 1700));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final navigatorKey = GlobalKey<NavigatorState>();
    final service = _ContextService();
    var builds = 0;
    MissionSupplyDemandCreateContext? captured;
    await tester.pumpWidget(MaterialApp(
      navigatorKey: navigatorKey,
      home: MissionInventoryResolutionScreen(
        missionNeedId: testMissionInventoryMissionId,
        missionGateway: _MissionGateway(),
        inventoryGateway: _InventoryGateway(
          initial: <MissionInventoryResolution>[_resolution()],
        ),
        listingMutationService: service,
        supplyDemandScreenBuilder: (createContext) {
          builds += 1;
          captured = createContext;
          return const Scaffold(body: Text('Private Gap-Anfrage A'));
        },
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    final finder = find.byKey(
      const ValueKey(
        'mission-inventory-demand-required:plant_container_equipment:2',
      ),
    );
    final ordinalTwoCard = find.ancestor(
      of: finder,
      matching: find.byType(Card),
    );
    expect(ordinalTwoCard, findsOneWidget);
    expect(
      find.descendant(
        of: ordinalTwoCard,
        matching: find.text(
          'Erforderlich · plant_container_equipment · Menge 1',
        ),
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'Erforderlich · plant_container_equipment · Menge 2',
      ),
      findsNothing,
    );
    await tester.ensureVisible(finder);
    final button = tester.widget<OutlinedButton>(finder);
    button.onPressed!();
    button.onPressed!();
    await tester.pumpAndSettle();
    expect(builds, 1);
    expect(captured?.resolutionId, testMissionInventoryResolutionId);
    expect(captured?.resolutionRevision, 1);
    expect(captured?.slotKey, 'required:plant_container_equipment:2');
    expect(find.text('Private Gap-Anfrage A'), findsOneWidget);

    navigatorKey.currentState!.push<void>(MaterialPageRoute<void>(
      builder: (_) => const Scaffold(body: Text('Fremde Gap-Overlay-Route')),
    ));
    await tester.pumpAndSettle();
    service.activateAccountB();
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
    await tester.pumpAndSettle();
    expect(find.text('Fremde Gap-Overlay-Route'), findsOneWidget);
    navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.text('Private Gap-Anfrage A'), findsNothing);
    expect(find.text('Mission B'), findsOneWidget);
  });
}

final _userA = buildTestUser(
  'account-a',
  name: 'Account A',
  email: 'a@example.invalid',
).copyWith(homeLocation: 'Heilbronn aus Profil');
final _userB = buildTestUser(
  'account-b',
  name: 'Account B',
  email: 'b@example.invalid',
).copyWith(homeLocation: 'Stuttgart aus Profil');

ListingMutationContext _context(String id, int epoch) => ListingMutationContext(
      user: id == 'account-a' ? _userA : _userB,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: id == 'account-a' ? _userA.email : _userB.email,
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
  Completer<bool>? delayNextCheck;

  void activateAccountB() => accountB = true;

  @override
  Future<ListingMutationContext?> loadCurrentContext() async =>
      accountB ? contextB : contextA;

  @override
  Future<bool> isContextCurrent(ListingMutationContext context) async {
    if (delayNextCheck case final pending?) {
      delayNextCheck = null;
      return pending.future;
    }
    return accountB
        ? identical(context, contextB)
        : identical(context, contextA);
  }
}

MissionNeed _mission(String title) => MissionNeed(
      missionNeedId: testMissionInventoryMissionId,
      domainVersion: missionNeedDomainVersion,
      revision: 1,
      status: MissionNeedStatus.planned,
      payload: MissionNeedPayload(
        title: title,
        status: MissionNeedStatus.planned,
        needs: const <MissionNeedItem>[
          MissionNeedItem(
            needKey: 'plant_container_equipment',
            necessity: MissionNeedNecessity.required,
            quantity: 2,
          ),
        ],
      ),
      payloadDigest: testMissionInventoryDigest,
      createdAt: DateTime.utc(2026, 10, 1, 8),
      updatedAt: DateTime.utc(2026, 10, 1, 8),
      revisions: const <MissionNeedRevision>[],
    );

class _MissionGateway implements MissionNeedGateway {
  @override
  Future<List<MissionNeed>> list(AuthSessionOwner owner) async => <MissionNeed>[
        _mission(owner.userId == 'account-a' ? 'Mission A' : 'Mission B')
      ];

  @override
  Future<MissionNeed> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
  }) async =>
      _mission(owner.userId == 'account-a' ? 'Mission A' : 'Mission B');

  @override
  Future<MissionNeedWriteResult> create({
    required AuthSessionOwner owner,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  }) =>
      throw UnimplementedError();

  @override
  Future<MissionNeedWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required int expectedRevision,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  }) =>
      throw UnimplementedError();
}

MissionInventoryResolution _resolution({bool stale = false}) =>
    MissionInventoryResolution.fromJson(
      testMissionInventoryResolutionJson(stale: stale),
    );

class _QuorumGateway implements MissionQuorumReadbackGateway {
  int calls = 0;
  Completer<void>? delay;
  Completer<void>? activeDelay;

  @override
  Future<MissionQuorumReadback> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
    required int missionRevision,
    required int resolutionRevision,
    required String missionPayloadDigest,
    required String resolutionDigest,
  }) async {
    calls += 1;
    final pending = delay;
    if (pending != null) {
      delay = null;
      activeDelay = pending;
      await pending.future;
      activeDelay = null;
    }
    return MissionQuorumReadback.fromJson(<String, dynamic>{
      'version': missionQuorumReadbackVersion,
      'missionNeedId': missionNeedId,
      'resolutionId': resolutionId,
      'missionRevision': missionRevision,
      'resolutionRevision': resolutionRevision,
      'missionPayloadDigest': missionPayloadDigest,
      'resolutionDigest': resolutionDigest,
      'observedAt': '2026-10-05T08:00:00.000Z',
      'status': 'incomplete',
      'bindingStatus': 'non_binding',
      'persisted': false,
      'paymentStatus': 'not_determined',
      'components': <Map<String, dynamic>>[
        <String, dynamic>{
          'slotKey': 'required:plant_container_equipment:1',
          'needKey': 'plant_container_equipment',
          'necessity': 'required',
          'ordinal': 1,
          'state': 'stale_or_unknown',
        },
      ],
    });
  }
}

class _CorrectionCall {
  const _CorrectionCall(this.draft, this.key);
  final MissionInventoryDraft draft;
  final String key;
}

class _InventoryGateway implements MissionInventoryResolutionGateway {
  _InventoryGateway({required this.initial});

  final List<MissionInventoryResolution> initial;
  final List<_CorrectionCall> corrections = <_CorrectionCall>[];
  BackendException? correctionError;

  @override
  Future<List<MissionInventoryResolution>> list({
    required AuthSessionOwner owner,
    required String missionNeedId,
  }) async =>
      owner.userId == 'account-a'
          ? initial
          : const <MissionInventoryResolution>[];

  @override
  Future<MissionInventoryResolution> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
  }) async =>
      initial.singleWhere((entry) => entry.resolutionId == resolutionId);

  @override
  Future<MissionInventoryWriteResult> create({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required MissionInventoryDraft draft,
    required String idempotencyKey,
  }) async =>
      MissionInventoryWriteResult(resolution: _resolution(), replayed: false);

  @override
  Future<MissionInventoryWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required String resolutionId,
    required MissionInventoryDraft draft,
    required String idempotencyKey,
  }) async {
    corrections.add(_CorrectionCall(draft, idempotencyKey));
    if (correctionError case final error?) throw error;
    return MissionInventoryWriteResult(
      resolution: MissionInventoryResolution.fromJson(
        testMissionInventoryResolutionJson(
            revision: draft.expectedRevision! + 1),
      ),
      replayed: false,
    );
  }
}
