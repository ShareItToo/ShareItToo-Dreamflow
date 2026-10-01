import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_fit_check.dart';
import 'package:lendify/models/mission_need.dart';
import 'package:lendify/screens/mission_needs_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/mission_need_gateway.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

import 'support/test_builders.dart';

const _digest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const _idA = 'mission_need_11111111-1111-4111-8111-111111111111';
const _idB = 'mission_need_22222222-2222-4222-8222-222222222222';
const _idServer = 'mission_need_33333333-3333-4333-8333-333333333333';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'lists, creates and corrects using authoritative server id and revision',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final semantics = tester.ensureSemantics();
    final service = _SwitchableContextService();
    final gateway = _MissionGateway(
      accountA: <MissionNeed>[_mission(_idA, 'Bestehende Mission')],
      accountB: <MissionNeed>[_mission(_idB, 'Mission B')],
    );
    var key = 0;

    await tester.pumpWidget(MaterialApp(
      home: MissionNeedsScreen(
        gateway: gateway,
        listingMutationService: service,
        idempotencyKeyFactory: () => 'mission-test-${++key}'.padRight(18, '0'),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Bestehende Mission'), findsOneWidget);
    expect(find.textContaining('keine Reservierung, Buchung'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        'Unverbindlich. Keine Reservierung, Buchung oder Zahlung.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.text('Neue Mission anlegen'));
    await tester.pump();
    await tester.enterText(
      find.byKey(const Key('mission-title')),
      'Renovierung planen',
    );
    await tester.tap(find.byType(DropdownButtonFormField<MissionNeedStatus>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Geplant').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('mission-need-key-0')),
      'paint_roller',
    );
    await tester.enterText(
      find.byKey(const ValueKey('mission-need-quantity-0')),
      '2',
    );
    expect(
      tester.getSize(find.byTooltip('Bedarf 1 entfernen')).shortestSide,
      greaterThanOrEqualTo(48),
    );
    await tester.ensureVisible(find.text('Bedarfspunkt hinzufügen'));
    await tester.tap(find.text('Bedarfspunkt hinzufügen'));
    await tester.pump();
    await tester.enterText(
      find.byKey(const ValueKey('mission-need-key-1')),
      'laser_level',
    );
    await tester.tap(
      find.byKey(const ValueKey('mission-need-necessity-1')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Optional').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('mission-need-quantity-1')),
      '1',
    );
    await tester.drag(find.byType(ListView), const Offset(0, -800));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-save')));
    await tester.pumpAndSettle();

    expect(gateway.creates, hasLength(1));
    expect(gateway.creates.single.payload.status, MissionNeedStatus.planned);
    expect(gateway.creates.single.payload.needs, hasLength(2));
    expect(
      gateway.creates.single.payload.needs.last.necessity,
      MissionNeedNecessity.optional,
    );
    expect(find.textContaining('Revision 1 angelegt'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('mission-title')),
      'Renovierung aktualisiert',
    );
    await tester.drag(find.byType(ListView), const Offset(0, -800));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mission-save')));
    await tester.pumpAndSettle();

    expect(gateway.corrections, hasLength(1));
    expect(gateway.corrections.single.missionNeedId, _idServer);
    expect(gateway.corrections.single.expectedRevision, 1);
    expect(find.textContaining('Revision 2 gespeichert'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets(
      '409 keeps every correction input and reports the server conflict',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = _SwitchableContextService();
    final mission = _mission(_idA, 'Ausgangsmission');
    final gateway = _MissionGateway(
      accountA: <MissionNeed>[mission],
      accountB: <MissionNeed>[],
    )..correctionError = const BackendException(
        409,
        'mission_need_revision_conflict',
        details: <String, dynamic>{'expectedRevision': 1, 'actualRevision': 2},
      );

    await tester.pumpWidget(MaterialApp(
      home: MissionNeedsScreen(
        gateway: gateway,
        listingMutationService: service,
        idempotencyKeyFactory: () => 'mission-conflict-0001',
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ausgangsmission'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('mission-title')),
      'Nicht verlorener Konfliktentwurf',
    );
    await tester.ensureVisible(find.byKey(const Key('mission-save')));
    await tester.tap(find.byKey(const Key('mission-save')));
    await tester.pumpAndSettle();

    expect(
      find.text('Nicht verlorener Konfliktentwurf'),
      findsOneWidget,
    );
    expect(find.textContaining('Revision 2'), findsOneWidget);
    expect(find.textContaining('Eingaben bleiben erhalten'), findsOneWidget);
    expect(gateway.corrections, hasLength(1));
  });

  testWidgets('account switch and restart never reveal late or cached missions',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = _SwitchableContextService();
    final lateA = Completer<List<MissionNeed>>();
    final gateway = _MissionGateway(
      accountA: <MissionNeed>[_mission(_idA, 'Fremde Mission A')],
      accountB: <MissionNeed>[_mission(_idB, 'Eigene Mission B')],
      firstAccountAList: lateA,
    );

    Widget screen() => MaterialApp(
          home: MissionNeedsScreen(
            gateway: gateway,
            listingMutationService: service,
            enableForTesting: true,
          ),
        );

    await tester.pumpWidget(screen());
    await tester.pump();
    service.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();

    expect(find.text('Eigene Mission B'), findsOneWidget);
    expect(find.text('Fremde Mission A'), findsNothing);
    lateA.complete(<MissionNeed>[_mission(_idA, 'Fremde Mission A')]);
    await tester.pumpAndSettle();
    expect(find.text('Fremde Mission A'), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(find.text('Eigene Mission B'), findsOneWidget);
    expect(find.text('Fremde Mission A'), findsNothing);

    service.logout();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    expect(find.text('Eigene Mission B'), findsNothing);
    expect(
      find.textContaining('aktuell angemeldete Konto'),
      findsOneWidget,
    );
  });

  testWidgets('FitCheck nested route opens single-flight from the exact need',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1300));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = _SwitchableContextService();
    final plantMission = _mission(
      _idA,
      'Pflanzmission',
      needs: const <MissionNeedItem>[
        MissionNeedItem(
          needKey: plantContainerNeedKey,
          necessity: MissionNeedNecessity.required,
          quantity: 1,
        ),
      ],
    );
    final gateway = _MissionGateway(
      accountA: <MissionNeed>[plantMission],
      accountB: const <MissionNeed>[],
    );
    var builds = 0;

    await tester.pumpWidget(MaterialApp(
      home: MissionNeedsScreen(
        gateway: gateway,
        listingMutationService: service,
        fitCheckScreenBuilder: (_) {
          builds += 1;
          return const Scaffold(body: Text('Privater FitCheck A'));
        },
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pflanzmission'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('mission-open-fit-check')),
    );
    final open = tester.widget<OutlinedButton>(
      find.byKey(const Key('mission-open-fit-check')),
    );
    open.onPressed!();
    open.onPressed!();
    await tester.pumpAndSettle();

    expect(builds, 1);
    expect(find.text('Privater FitCheck A'), findsOneWidget);
  });

  testWidgets(
      'account switch and logout remove only the exact owned FitCheck route',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1300));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final navigatorKey = GlobalKey<NavigatorState>();
    final service = _SwitchableContextService();
    MissionNeed plant(String id, String title) => _mission(
          id,
          title,
          needs: const <MissionNeedItem>[
            MissionNeedItem(
              needKey: plantContainerNeedKey,
              necessity: MissionNeedNecessity.required,
              quantity: 1,
            ),
          ],
        );
    final gateway = _MissionGateway(
      accountA: <MissionNeed>[plant(_idA, 'Pflanzmission A')],
      accountB: <MissionNeed>[plant(_idB, 'Pflanzmission B')],
    );

    await tester.pumpWidget(MaterialApp(
      navigatorKey: navigatorKey,
      home: MissionNeedsScreen(
        gateway: gateway,
        listingMutationService: service,
        fitCheckScreenBuilder: (_) =>
            const Scaffold(body: Text('Privater FitCheck Route')),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pflanzmission A'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('mission-open-fit-check')),
    );
    await tester.tap(find.byKey(const Key('mission-open-fit-check')));
    await tester.pumpAndSettle();
    expect(find.text('Privater FitCheck Route'), findsOneWidget);

    navigatorKey.currentState!.push<void>(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('Fremde B Route')),
      ),
    );
    await tester.pumpAndSettle();
    service.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();

    expect(find.text('Fremde B Route'), findsOneWidget);
    navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.text('Privater FitCheck Route'), findsNothing);
    expect(find.text('Pflanzmission B'), findsOneWidget);

    await tester.tap(find.text('Pflanzmission B'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('mission-open-fit-check')),
    );
    await tester.tap(find.byKey(const Key('mission-open-fit-check')));
    await tester.pumpAndSettle();
    expect(find.text('Privater FitCheck Route'), findsOneWidget);
    service.logout();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    expect(find.text('Privater FitCheck Route'), findsNothing);
    expect(find.textContaining('aktuell angemeldete Konto'), findsOneWidget);
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
          createdAt: DateTime.utc(2026, 10, 1, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
    );

class _SwitchableContextService extends ListingMutationService {
  final ListingMutationContext contextA = _context('account-a', 1);
  final ListingMutationContext contextB = _context('account-b', 2);
  bool accountBActive = false;
  bool loggedOut = false;

  void activateAccountB() => accountBActive = true;
  void logout() => loggedOut = true;

  @override
  Future<ListingMutationContext?> loadCurrentContext() async => loggedOut
      ? null
      : accountBActive
          ? contextB
          : contextA;

  @override
  Future<bool> isContextCurrent(ListingMutationContext context) async =>
      loggedOut
          ? false
          : accountBActive
              ? identical(context, contextB)
              : identical(context, contextA);
}

MissionNeed _mission(
  String id,
  String title, {
  int revision = 1,
  MissionNeedStatus status = MissionNeedStatus.draft,
  List<MissionNeedItem>? needs,
}) =>
    MissionNeed(
      missionNeedId: id,
      domainVersion: missionNeedDomainVersion,
      revision: revision,
      status: status,
      payload: MissionNeedPayload(
        title: title,
        status: status,
        needs: needs ??
            const <MissionNeedItem>[
              MissionNeedItem(
                needKey: 'paint_roller',
                necessity: MissionNeedNecessity.required,
                quantity: 1,
              ),
            ],
      ),
      payloadDigest: _digest,
      createdAt: DateTime.utc(2026, 10, 1, 8),
      updatedAt: DateTime.utc(2026, 10, 1, 8, revision),
      revisions: const <MissionNeedRevision>[],
    );

class _CreateCall {
  const _CreateCall(this.payload, this.idempotencyKey);
  final MissionNeedPayload payload;
  final String idempotencyKey;
}

class _CorrectionCall {
  const _CorrectionCall(
    this.missionNeedId,
    this.expectedRevision,
    this.payload,
    this.idempotencyKey,
  );
  final String missionNeedId;
  final int expectedRevision;
  final MissionNeedPayload payload;
  final String idempotencyKey;
}

class _MissionGateway implements MissionNeedGateway {
  _MissionGateway({
    required this.accountA,
    required this.accountB,
    this.firstAccountAList,
  });

  final List<MissionNeed> accountA;
  final List<MissionNeed> accountB;
  final Completer<List<MissionNeed>>? firstAccountAList;
  final List<_CreateCall> creates = <_CreateCall>[];
  final List<_CorrectionCall> corrections = <_CorrectionCall>[];
  BackendException? correctionError;
  bool _usedDelayedA = false;

  @override
  Future<List<MissionNeed>> list(AuthSessionOwner owner) {
    if (owner.userId == 'account-a' &&
        firstAccountAList != null &&
        !_usedDelayedA) {
      _usedDelayedA = true;
      return firstAccountAList!.future;
    }
    return Future<List<MissionNeed>>.value(
      owner.userId == 'account-a' ? accountA : accountB,
    );
  }

  @override
  Future<MissionNeed> load({
    required AuthSessionOwner owner,
    required String missionNeedId,
  }) async {
    final source = owner.userId == 'account-a' ? accountA : accountB;
    return source.singleWhere(
      (mission) => mission.missionNeedId == missionNeedId,
    );
  }

  @override
  Future<MissionNeedWriteResult> create({
    required AuthSessionOwner owner,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  }) async {
    creates.add(_CreateCall(payload, idempotencyKey));
    return MissionNeedWriteResult(
      missionNeed: _mission(
        _idServer,
        payload.title,
        status: payload.status,
        needs: payload.needs,
      ),
      replayed: false,
    );
  }

  @override
  Future<MissionNeedWriteResult> correct({
    required AuthSessionOwner owner,
    required String missionNeedId,
    required int expectedRevision,
    required MissionNeedPayload payload,
    required String idempotencyKey,
  }) async {
    corrections.add(_CorrectionCall(
      missionNeedId,
      expectedRevision,
      payload,
      idempotencyKey,
    ));
    if (correctionError case final error?) throw error;
    return MissionNeedWriteResult(
      missionNeed: _mission(
        missionNeedId,
        payload.title,
        revision: expectedRevision + 1,
        status: payload.status,
        needs: payload.needs,
      ),
      replayed: false,
    );
  }
}
