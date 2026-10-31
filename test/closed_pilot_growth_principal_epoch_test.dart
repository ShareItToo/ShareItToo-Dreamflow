import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/listing_set.dart';
import 'package:lendify/models/planner.dart';
import 'package:lendify/screens/closed_pilot_listing_sets_screen.dart';
import 'package:lendify/screens/closed_pilot_planner_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/listing_sets_gateway.dart';
import 'package:lendify/services/planner_gateway.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('late Account-A planner result is never rendered under B',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(1000, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = _SwitchableContextService();
    final gateway = _PlannerGateway();

    await tester.pumpWidget(MaterialApp(
      home: ClosedPilotPlannerScreen(
        gateway: gateway,
        listingMutationService: service,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Bestand und Preis prüfen'));
    await tester.pump();
    expect(gateway.resolveOwners.single.userId, 'account-a');

    service.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pump();
    gateway.resolveCompleter.complete(_plannerResolution);
    await tester.pumpAndSettle();

    expect(
      find.text('Serverbestand und Preisvorschauen sind aktuell geprüft.'),
      findsNothing,
    );
    expect(find.text('Als Projekt in den Mietkorb'), findsNothing);
  });

  testWidgets('late Account-A listing-set creation is never shown under B',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = _SwitchableContextService();
    final gateway = _ListingSetsGateway();
    final listings = <Item>[
      buildTestItem(id: 'listing-a1', ownerId: 'account-a', title: 'Bohrer'),
      buildTestItem(id: 'listing-a2', ownerId: 'account-a', title: 'Schleifer'),
    ];

    await tester.pumpWidget(MaterialApp(
      home: ClosedPilotListingSetsScreen(
        initialContext: service.contextA,
        ownerListings: listings,
        gateway: gateway,
        listingMutationService: service,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Werkstatt Set');
    await tester.tap(find.text('Bohrer'));
    await tester.tap(find.text('Schleifer'));
    await tester.pump();
    await tester.tap(find.text('Set serverseitig erstellen'));
    await tester.pump();
    expect(gateway.createOwners.single.userId, 'account-a');

    service.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pump();
    gateway.createCompleter.complete(_ownerSet);
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Artikel-Set serverbestätigt erstellt'),
      findsNothing,
    );
    expect(find.textContaining('alte Kontokontext'), findsOneWidget);
  });
}

final _userA = buildTestUser(
  'account-a',
  name: 'Account A',
  email: 'a@example.invalid',
);
final _userB = buildTestUser(
  'account-b',
  name: 'Account B',
  email: 'b@example.invalid',
);

ListingMutationContext _context(String id, int epoch) => ListingMutationContext(
      user: id == 'account-a' ? _userA : _userB,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: id == 'account-a' ? _userA.email : _userB.email,
          createdAt: DateTime.utc(2026, 8, 30, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
    );

class _SwitchableContextService extends ListingMutationService {
  final ListingMutationContext contextA = _context('account-a', 1);
  final ListingMutationContext contextB = _context('account-b', 2);
  bool accountBActive = false;

  void activateAccountB() => accountBActive = true;

  @override
  Future<ListingMutationContext?> loadCurrentContext() async =>
      accountBActive ? contextB : contextA;

  @override
  Future<bool> isContextCurrent(ListingMutationContext context) async =>
      accountBActive
          ? identical(context, contextB)
          : identical(context, contextA);
}

final _catalog = PlannerCatalog(templates: <PlannerTemplate>[
  PlannerTemplate(
    id: 'move',
    title: 'Umzug vorbereiten',
    questions: const <PlannerQuestion>[
      PlannerQuestion(
        id: 'load_size',
        prompt: 'Wie groß ist die zu bewegende Menge?',
        options: <String>['small', 'medium'],
      ),
      PlannerQuestion(
        id: 'stairs',
        prompt: 'Sind Treppen im Weg?',
        options: <String>['none', 'some'],
      ),
      PlannerQuestion(
        id: 'transport_arranged',
        prompt: 'Ist der Transport organisiert?',
        options: <String>['yes', 'no'],
      ),
    ],
  ),
]);

final _plannerResolution = PlannerResolution(
  templateId: 'move',
  templateTitle: 'Umzug vorbereiten',
  startDate: '2026-09-01',
  endDate: '2026-09-03',
  selectedItemTypes: const <String>['moving_tool'],
  cartEligible: true,
  variants: const <PlannerVariant>[
    PlannerVariant(
      id: 'one_stop',
      label: '1-Stop',
      available: true,
      rankingBasis: 'server truth',
      selections: <PlannerSelection>[],
      totalMinor: 1000,
    ),
    PlannerVariant(
      id: 'price_efficient',
      label: 'Preis-effizient',
      available: false,
      rankingBasis: 'server truth',
      selections: <PlannerSelection>[],
      totalMinor: null,
    ),
    PlannerVariant(
      id: 'top_rated',
      label: 'Top-bewertet',
      available: false,
      rankingBasis: 'server truth',
      selections: <PlannerSelection>[],
      totalMinor: null,
    ),
  ],
  inventorySnapshotHash: List<String>.filled(64, 'a').join(),
);

class _PlannerGateway implements PlannerGateway {
  final Completer<PlannerResolution> resolveCompleter =
      Completer<PlannerResolution>();
  final List<AuthSessionOwner> resolveOwners = <AuthSessionOwner>[];

  @override
  Future<PlannerCatalog> loadCatalog(AuthSessionOwner owner) async => _catalog;

  @override
  Future<PlannerResolution> resolve({
    required AuthSessionOwner owner,
    required Map<String, dynamic> request,
  }) {
    resolveOwners.add(owner);
    return resolveCompleter.future;
  }

  @override
  Future<PlannerCartReceipt> addToCart({
    required AuthSessionOwner owner,
    required String projectId,
    required Map<String, dynamic> request,
    required PlannerResolution resolution,
    required String variantId,
  }) =>
      throw UnimplementedError();
}

final _ownerSet = ListingSetOwnerView(
  id: 'listing_set_11111111-1111-4111-8111-111111111111',
  revision: 1,
  kind: ListingSetKind.sitSet,
  title: 'Werkstatt Set',
  status: 'active',
  currency: 'EUR',
  members: const <ListingSetOwnerMember>[
    ListingSetOwnerMember(
      listingId: 'listing-a1',
      role: ListingSetMemberRole.required,
      sortOrder: 0,
      title: 'Bohrer',
    ),
    ListingSetOwnerMember(
      listingId: 'listing-a2',
      role: ListingSetMemberRole.required,
      sortOrder: 1,
      title: 'Schleifer',
    ),
  ],
);

class _ListingSetsGateway implements ListingSetsGateway {
  final Completer<ListingSetOwnerView> createCompleter =
      Completer<ListingSetOwnerView>();
  final List<AuthSessionOwner> createOwners = <AuthSessionOwner>[];

  @override
  Future<List<ListingSetOwnerView>> loadOwnerSets(
    AuthSessionOwner owner,
  ) async =>
      const <ListingSetOwnerView>[];

  @override
  Future<ListingSetOwnerView> create({
    required AuthSessionOwner owner,
    required String title,
    required ListingSetKind kind,
    required List<String> listingIds,
  }) {
    createOwners.add(owner);
    return createCompleter.future;
  }

  @override
  Future<ListingSetOwnerView> end({
    required AuthSessionOwner owner,
    required ListingSetOwnerView set,
  }) =>
      throw UnimplementedError();

  @override
  Future<ListingSetDiscovery> discover({
    required AuthSessionOwner owner,
    required String listingId,
    required DateTime startDate,
    required DateTime endDate,
  }) =>
      throw UnimplementedError();
}
