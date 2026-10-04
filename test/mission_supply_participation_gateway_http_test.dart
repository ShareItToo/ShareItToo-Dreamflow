import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/mission_supply_participation.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/mission_supply_participation_gateway.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _participationId =
    'mission_supply_participation_11111111-1111-4111-8111-111111111111';
const _itemId = 'shelf_item_22222222-2222-4222-8222-222222222222';
const _foreignItemId = 'shelf_item_55555555-5555-4555-8555-555555555555';

String _session() => jsonEncode(<String, dynamic>{
      'userId': 'owner-a',
      'email': 'owner-a@example.invalid',
      'sessionId': 'session-owner-a',
      'createdAt': '2026-10-01T08:00:00.000Z',
      'accessToken': 'access-owner-a',
      'refreshToken': 'refresh-owner-a',
      'accessTokenExpiresAt': '2099-01-01T00:00:00.000Z',
    });

Map<String, dynamic> _item({
  String status = 'confirmed_available',
  int revision = 1,
}) =>
    <String, dynamic>{
      'shelfItemId': _itemId,
      'needKey': missionSupplyParticipationNeedKey,
      'revision': revision,
      'availabilityStatus': status,
      'createdAt': '2026-10-01T08:00:00.000Z',
    };

Map<String, dynamic> _root({
  String status = 'active',
  int revision = 1,
  int itemRevision = 1,
}) =>
    <String, dynamic>{
      'participationId': _participationId,
      'domainVersion': missionSupplyParticipationDomainVersion,
      'currentRevision': revision,
      'status': status,
      'createdAt': '2026-10-01T08:00:00.000Z',
      'updatedAt': '2026-10-01T08:00:00.000Z',
      'items': <Map<String, dynamic>>[_item(revision: itemRevision)],
    };

Map<String, dynamic> _snapshot({int rootRevision = 1, int itemRevision = 1}) =>
    <String, dynamic>{
      'participation': _root(
        revision: rootRevision,
        itemRevision: itemRevision,
      ),
      'visibility': 'private_owner_only',
      'matchingActivated': false,
    };

Map<String, dynamic> _write({
  required bool itemCommand,
  bool replayed = false,
  int rootRevision = 1,
  int itemRevision = 1,
}) =>
    <String, dynamic>{
      ..._snapshot(rootRevision: rootRevision, itemRevision: itemRevision),
      'commandResult': <String, dynamic>{
        'participationId': _participationId,
        'revision': itemCommand ? itemRevision : rootRevision,
        'status': itemCommand ? 'confirmed_available' : 'active',
        if (itemCommand) ...<String, dynamic>{
          'shelfItemId': _itemId,
          'needKey': missionSupplyParticipationNeedKey,
        },
      },
      'replayed': replayed,
    };

Future<AuthSessionOwner> _owner() async {
  final session = await AuthService.readSession();
  expect(session, isNotNull);
  return AuthService.captureSessionOwner(session!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': _session(),
    });
  });

  test('binds all participation calls to the initiating owner and exact routes',
      () async {
    final owner = await _owner();
    final seen = <String>[];
    final gateway = BackendMissionSupplyParticipationGateway();
    await http.runWithClient(() async {
      final snapshot = await gateway.load(owner);
      expect(snapshot.participation?.participationId, _participationId);
      final root = await gateway.setParticipation(
        owner: owner,
        status: MissionSupplyParticipationStatus.active,
        expectedRevision: 1,
        idempotencyKey: 'participation-root-0001',
      );
      expect(root.command.status, 'active');
      final item = await gateway.setItem(
        owner: owner,
        shelfItemId: _itemId,
        availabilityStatus:
            MissionSupplyParticipationAvailability.confirmedAvailable,
        expectedParticipationRevision: 1,
        expectedRevision: 1,
        idempotencyKey: 'participation-item-0001',
      );
      expect(item.command.shelfItemId, _itemId);
    },
        () => MockClient((request) async {
              seen.add('${request.method} ${request.url.path}');
              expect(request.headers['authorization'], 'Bearer access-owner-a');
              if (request.method == 'GET') {
                return http.Response(jsonEncode(_snapshot()), 200);
              }
              final body = jsonDecode(request.body) as Map<String, dynamic>;
              expect(body['needKey'] ?? missionSupplyParticipationNeedKey,
                  missionSupplyParticipationNeedKey);
              expect(request.headers['idempotency-key'], isNotEmpty);
              final itemCommand = request.url.path.contains('/items/');
              return http.Response(
                jsonEncode(_write(
                  itemCommand: itemCommand,
                  rootRevision: itemCommand ? 1 : 2,
                  itemRevision: itemCommand ? 2 : 1,
                )),
                201,
              );
            }));
    expect(seen, <String>[
      'GET /api/v1/mission-supply-participation',
      'POST /api/v1/mission-supply-participation',
      'POST /api/v1/mission-supply-participation/items/$_itemId',
    ]);
  }, skip: !BackendConfig.enabled);

  test('stale, foreign and principal-changed results fail closed', () async {
    final owner = await _owner();
    final stale =
        BackendException(409, 'mission_supply_participation_revision_conflict');
    await expectLater(
      http.runWithClient(
        () => BackendMissionSupplyParticipationGateway().setParticipation(
          owner: owner,
          status: MissionSupplyParticipationStatus.active,
          expectedRevision: 0,
          idempotencyKey: 'participation-stale-0001',
        ),
        () => MockClient((_) async => http.Response(
              jsonEncode(<String, dynamic>{'error': stale.code}),
              stale.statusCode,
            )),
      ),
      throwsA(isA<BackendException>()),
    );

    var checks = 0;
    final changing = BackendMissionSupplyParticipationGateway(
      ownerCheck: (_) async => ++checks <= 1,
    );
    await expectLater(
      http.runWithClient(
        () => changing.load(owner),
        () => MockClient((request) async {
          expect(request.method, 'GET');
          return http.Response(jsonEncode(_snapshot()), 200);
        }),
      ),
      throwsA(isA<BackendException>()),
    );
    expect(checks, 2);
  }, skip: !BackendConfig.enabled);

  test('rejects a response whose command does not match its snapshot', () {
    final invalid = _write(itemCommand: false);
    (invalid['commandResult'] as Map<String, dynamic>)['revision'] = 9;
    expect(
      () => MissionSupplyParticipationWriteResult.fromJson(invalid),
      throwsFormatException,
    );
    final replay = MissionSupplyParticipationWriteResult.fromJson(
      _write(itemCommand: true, replayed: true),
    );
    expect(replay.replayed, isTrue);
  });

  test('rejects a foreign shelf item response at the gateway boundary',
      () async {
    final owner = await _owner();
    await expectLater(
      http.runWithClient(
        () => BackendMissionSupplyParticipationGateway().setItem(
          owner: owner,
          shelfItemId: _itemId,
          availabilityStatus:
              MissionSupplyParticipationAvailability.confirmedAvailable,
          expectedParticipationRevision: 1,
          expectedRevision: 0,
          idempotencyKey: 'participation-foreign-0001',
        ),
        () => MockClient((_) async => http.Response(
              '{"error":"mission_supply_participation_item_not_found"}',
              404,
            )),
      ),
      throwsA(isA<BackendException>()),
    );
  }, skip: !BackendConfig.enabled);

  test('rejects a coherent but request-foreign item response', () async {
    final owner = await _owner();
    final foreign = _write(
      itemCommand: true,
      rootRevision: 1,
      itemRevision: 2,
    );
    final participation = foreign['participation'] as Map<String, dynamic>;
    final items = participation['items'] as List<dynamic>;
    (items.single as Map<String, dynamic>)['shelfItemId'] = _foreignItemId;
    final command = foreign['commandResult'] as Map<String, dynamic>;
    command['shelfItemId'] = _foreignItemId;
    await expectLater(
      http.runWithClient(
        () => BackendMissionSupplyParticipationGateway().setItem(
          owner: owner,
          shelfItemId: _itemId,
          availabilityStatus:
              MissionSupplyParticipationAvailability.confirmedAvailable,
          expectedParticipationRevision: 1,
          expectedRevision: 1,
          idempotencyKey: 'participation-coherent-foreign-0001',
        ),
        () => MockClient((_) async => http.Response(jsonEncode(foreign), 201)),
      ),
      throwsA(isA<FormatException>()),
    );
  }, skip: !BackendConfig.enabled);
}
