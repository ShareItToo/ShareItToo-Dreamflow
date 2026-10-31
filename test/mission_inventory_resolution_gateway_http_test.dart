import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/mission_inventory_resolution.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/mission_inventory_resolution_gateway.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/mission_inventory_resolution_builders.dart';

String _session(String owner) => jsonEncode(<String, dynamic>{
      'userId': owner,
      'email': '$owner@example.invalid',
      'sessionId': 'session-$owner',
      'createdAt': '2026-10-01T08:00:00.000Z',
      'accessToken': 'access-$owner',
      'refreshToken': 'refresh-$owner',
      'accessTokenExpiresAt': '2099-01-01T00:00:00.000Z',
    });

Future<AuthSessionOwner> _ownerA() async {
  final session = await AuthService.readSession();
  expect(session, isNotNull);
  return AuthService.captureSessionOwner(session!);
}

MissionInventoryDraft _draft({int? expectedRevision}) => MissionInventoryDraft(
      missionRevision: 1,
      missionPayloadDigest: testMissionInventoryDigest,
      startDate: DateTime.utc(2026, 11, 10),
      endDate: DateTime.utc(2026, 11, 12),
      latitudeE5: 4914000,
      longitudeE5: 922000,
      radiusKm: 25,
      locationSourceVersion: 'owner-maps-selection-test0001',
      expectedRevision: expectedRevision,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': _session('owner-a'),
    });
  });

  test(
    'uses exact private routes, initiating bearer and stable request bodies',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionInventoryResolutionGateway();
      final seen = <String>[];
      await http.runWithClient(() async {
        expect(
          await gateway.list(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
          ),
          hasLength(1),
        );
        expect(
          (await gateway.load(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
            resolutionId: testMissionInventoryResolutionId,
          ))
              .resolutionId,
          testMissionInventoryResolutionId,
        );
        expect(
          (await gateway.create(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
            draft: _draft(),
            idempotencyKey: 'inventory-create-0001',
          ))
              .replayed,
          isFalse,
        );
        expect(
          (await gateway.correct(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
            resolutionId: testMissionInventoryResolutionId,
            draft: _draft(expectedRevision: 1),
            idempotencyKey: 'inventory-correct-0001',
          ))
              .resolution
              .revision,
          2,
        );
      },
          () => MockClient((request) async {
                seen.add('${request.method} ${request.url.path}');
                expect(
                    request.headers['Authorization'], 'Bearer access-owner-a');
                final path = request.url.path;
                if (request.method == 'GET' &&
                    path ==
                        '/api/v1/mission-needs/$testMissionInventoryMissionId/inventory-resolutions') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'resolutions': <Map<String, dynamic>>[
                        testMissionInventoryResolutionJson(),
                      ],
                    }),
                    200,
                  );
                }
                if (request.method == 'GET' &&
                    path ==
                        '/api/v1/mission-inventory-resolutions/$testMissionInventoryResolutionId') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'resolution': testMissionInventoryResolutionJson(),
                    }),
                    200,
                  );
                }
                if (request.method == 'POST' &&
                    path ==
                        '/api/v1/mission-needs/$testMissionInventoryMissionId/inventory-resolutions') {
                  expect(
                    request.headers['Idempotency-Key'],
                    'inventory-create-0001',
                  );
                  expect(jsonDecode(request.body), _draft().toJson());
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'resolution': testMissionInventoryResolutionJson(),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                if (request.method == 'POST' &&
                    path ==
                        '/api/v1/mission-inventory-resolutions/$testMissionInventoryResolutionId/revisions') {
                  expect(
                    request.headers['Idempotency-Key'],
                    'inventory-correct-0001',
                  );
                  expect(jsonDecode(request.body),
                      _draft(expectedRevision: 1).toJson());
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'resolution':
                          testMissionInventoryResolutionJson(revision: 2),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                return http.Response('{"error":"unexpected"}', 500);
              }));

      expect(seen, <String>[
        'GET /api/v1/mission-needs/$testMissionInventoryMissionId/inventory-resolutions',
        'GET /api/v1/mission-inventory-resolutions/$testMissionInventoryResolutionId',
        'POST /api/v1/mission-needs/$testMissionInventoryMissionId/inventory-resolutions',
        'POST /api/v1/mission-inventory-resolutions/$testMissionInventoryResolutionId/revisions',
      ]);
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'preserves uniform foreign 404 and rejects malformed or foreign bindings',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionInventoryResolutionGateway();
      await http.runWithClient(
        () => expectLater(
          gateway.load(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
            resolutionId: testMissionInventoryResolutionId,
          ),
          throwsA(
            isA<BackendException>()
                .having((error) => error.statusCode, 'status', 404),
          ),
        ),
        () => MockClient(
          (_) async => http.Response(
            '{"error":"mission_inventory_resolution_not_found"}',
            404,
          ),
        ),
      );

      const foreignMission =
          'mission_need_55555555-5555-4555-8555-555555555555';
      await http.runWithClient(
        () => expectLater(
          gateway.list(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
          ),
          throwsFormatException,
        ),
        () => MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'resolutions': <Map<String, dynamic>>[
                testMissionInventoryResolutionJson(
                  missionNeedId: foreignMission,
                ),
              ],
            }),
            200,
          ),
        ),
      );
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'rejects foreign write responses and late account-A results',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionInventoryResolutionGateway();
      const foreignResolution =
          'mission_inventory_55555555-5555-4555-8555-555555555555';
      await http.runWithClient(
        () => expectLater(
          gateway.correct(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
            resolutionId: testMissionInventoryResolutionId,
            draft: _draft(expectedRevision: 1),
            idempotencyKey: 'inventory-foreign-0001',
          ),
          throwsFormatException,
        ),
        () => MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'resolution': testMissionInventoryResolutionJson(
                revision: 2,
                resolutionId: foreignResolution,
              ),
              'replayed': false,
            }),
            201,
          ),
        ),
      );

      await http.runWithClient(
        () => expectLater(
          gateway.list(
            owner: owner,
            missionNeedId: testMissionInventoryMissionId,
          ),
          throwsA(
            isA<BackendException>()
                .having((error) => error.code, 'code', 'principal_changed'),
          ),
        ),
        () => MockClient((_) async {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('auth_session_v1', _session('owner-b'));
          return http.Response(
            jsonEncode(<String, dynamic>{
              'resolutions': <Map<String, dynamic>>[
                testMissionInventoryResolutionJson(),
              ],
            }),
            200,
          );
        }),
      );
    },
    skip: !BackendConfig.enabled,
  );
}
