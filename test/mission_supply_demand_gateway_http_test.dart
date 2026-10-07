import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/mission_supply_demand.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/mission_supply_demand_gateway.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/mission_supply_demand_builders.dart';

String _session(String owner) => jsonEncode(<String, dynamic>{
      'userId': owner,
      'email': '$owner@example.invalid',
      'sessionId': 'session-$owner',
      'createdAt': '2026-10-01T08:00:00.000Z',
      'accessToken': 'access-$owner',
      'refreshToken': 'refresh-$owner',
      'accessTokenExpiresAt': '2099-01-01T00:00:00.000Z',
    });

Future<AuthSessionOwner> _owner() async {
  final session = await AuthService.readSession();
  expect(session, isNotNull);
  return AuthService.captureSessionOwner(session!);
}

final _createContext = MissionSupplyDemandCreateContext(
  resolutionId: testMissionSupplyResolutionId,
  resolutionRevision: 1,
  slotKey: testMissionSupplySlotKey,
  needKey: 'plant_container_equipment',
  necessity: 'required',
  ordinal: 1,
  periodEnd: DateTime.utc(2026, 11, 12),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': _session('owner-a'),
    });
  });

  test(
    'uses exact five private routes, bearer, bodies and idempotency keys',
    () async {
      final owner = await _owner();
      const gateway = BackendMissionSupplyDemandGateway();
      final seen = <String>[];
      final recipientPending = MissionSupplyDemand.fromJson(
        testMissionSupplyDemandJson(role: MissionSupplyDemandRole.recipient),
      );
      final recipientReleased = MissionSupplyDemand.fromJson(
        testMissionSupplyDemandJson(
          role: MissionSupplyDemandRole.recipient,
          status: MissionSupplyDemandStatus.released,
          revision: 2,
        ),
      );
      await http.runWithClient(() async {
        expect(await gateway.list(owner), hasLength(1));
        expect(
          (await gateway.load(
                  owner: owner, demandId: testMissionSupplyDemandId))
              .demandId,
          testMissionSupplyDemandId,
        );
        expect(
          (await gateway.create(
            owner: owner,
            context: _createContext,
            expiresAt: DateTime.utc(2026, 11, 9, 12),
            idempotencyKey: 'demand-create-0001',
          ))
              .demand
              .role,
          MissionSupplyDemandRole.requester,
        );
        expect(
          (await gateway.respond(
            owner: owner,
            demand: recipientPending,
            decision: MissionSupplyDemandDecision.release,
            idempotencyKey: 'demand-release-0001',
          ))
              .demand
              .status,
          MissionSupplyDemandStatus.released,
        );
        expect(
          (await gateway.revoke(
            owner: owner,
            demand: recipientReleased,
            idempotencyKey: 'demand-revoke-0001',
          ))
              .demand
              .status,
          MissionSupplyDemandStatus.revoked,
        );
      },
          () => MockClient((request) async {
                seen.add('${request.method} ${request.url.path}');
                expect(
                    request.headers['Authorization'], 'Bearer access-owner-a');
                final path = request.url.path;
                if (request.method == 'GET' &&
                    path == '/api/v1/mission-supply-demands') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'demands': <Map<String, dynamic>>[
                        testMissionSupplyDemandJson(
                          role: MissionSupplyDemandRole.recipient,
                        ),
                      ],
                    }),
                    200,
                  );
                }
                if (request.method == 'GET' &&
                    path ==
                        '/api/v1/mission-supply-demands/$testMissionSupplyDemandId') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'demand': testMissionSupplyDemandJson(
                        role: MissionSupplyDemandRole.recipient,
                      ),
                    }),
                    200,
                  );
                }
                if (request.method == 'POST' &&
                    path ==
                        '/api/v1/mission-inventory-resolutions/$testMissionSupplyResolutionId/supply-demands') {
                  expect(
                      request.headers['Idempotency-Key'], 'demand-create-0001');
                  expect(jsonDecode(request.body), <String, dynamic>{
                    'resolutionRevision': 1,
                    'slotKey': testMissionSupplySlotKey,
                    'purpose': missionSupplyDemandPurpose,
                    'expiresAt': '2026-11-09T12:00:00.000Z',
                  });
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'demand': testMissionSupplyDemandJson(),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                if (request.method == 'POST' && path.endsWith('/respond')) {
                  expect(request.headers['Idempotency-Key'],
                      'demand-release-0001');
                  expect(jsonDecode(request.body), <String, dynamic>{
                    'expectedRevision': 1,
                    'decision': 'release',
                  });
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'demand': testMissionSupplyDemandJson(
                        role: MissionSupplyDemandRole.recipient,
                        status: MissionSupplyDemandStatus.released,
                        revision: 2,
                      ),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                if (request.method == 'POST' && path.endsWith('/revoke')) {
                  expect(
                      request.headers['Idempotency-Key'], 'demand-revoke-0001');
                  expect(jsonDecode(request.body), <String, dynamic>{
                    'expectedRevision': 2,
                  });
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'demand': testMissionSupplyDemandJson(
                        role: MissionSupplyDemandRole.recipient,
                        status: MissionSupplyDemandStatus.revoked,
                        revision: 3,
                      ),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                return http.Response('{"error":"unexpected"}', 500);
              }));

      expect(seen, <String>[
        'GET /api/v1/mission-supply-demands',
        'GET /api/v1/mission-supply-demands/$testMissionSupplyDemandId',
        'POST /api/v1/mission-inventory-resolutions/$testMissionSupplyResolutionId/supply-demands',
        'POST /api/v1/mission-supply-demands/$testMissionSupplyDemandId/respond',
        'POST /api/v1/mission-supply-demands/$testMissionSupplyDemandId/revoke',
      ]);
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'preserves uniform 404 and rejects foreign response bindings',
    () async {
      final owner = await _owner();
      const gateway = BackendMissionSupplyDemandGateway();
      await http.runWithClient(
        () => expectLater(
          gateway.load(owner: owner, demandId: testMissionSupplyDemandId),
          throwsA(isA<BackendException>().having(
            (error) => error.statusCode,
            'status',
            404,
          )),
        ),
        () => MockClient((_) async => http.Response(
              '{"error":"mission_supply_demand_not_found"}',
              404,
            )),
      );

      final pending = MissionSupplyDemand.fromJson(
        testMissionSupplyDemandJson(role: MissionSupplyDemandRole.recipient),
      );
      await http.runWithClient(
        () => expectLater(
          gateway.respond(
            owner: owner,
            demand: pending,
            decision: MissionSupplyDemandDecision.reject,
            idempotencyKey: 'demand-foreign-0001',
          ),
          throwsFormatException,
        ),
        () => MockClient((_) async => http.Response(
              jsonEncode(<String, dynamic>{
                'demand': testMissionSupplyDemandJson(
                  demandId:
                      'mission_demand_99999999-9999-4999-8999-999999999999',
                  role: MissionSupplyDemandRole.recipient,
                  status: MissionSupplyDemandStatus.rejected,
                  revision: 2,
                ),
                'replayed': false,
              }),
              201,
            )),
      );
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'discards a late account-A result after session changes',
    () async {
      final owner = await _owner();
      const gateway = BackendMissionSupplyDemandGateway();
      await http.runWithClient(
        () => expectLater(
          gateway.list(owner),
          throwsA(isA<BackendException>().having(
            (error) => error.code,
            'code',
            'principal_changed',
          )),
        ),
        () => MockClient((_) async {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('auth_session_v1', _session('owner-b'));
          return http.Response(
            jsonEncode(<String, dynamic>{'demands': <Object>[]}),
            200,
          );
        }),
      );
    },
    skip: !BackendConfig.enabled,
  );
}
