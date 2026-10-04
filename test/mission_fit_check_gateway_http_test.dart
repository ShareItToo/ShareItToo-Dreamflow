import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/mission_fit_check.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/mission_fit_check_gateway.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/mission_fit_check_builders.dart';

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

MissionFitCheckDraft _draft() => MissionFitCheckDraft(
      missionRevision: 1,
      missionPayloadDigest: testMissionFitDigest,
      shelfItemId: testMissionFitShelfId,
      shelfUpdatedAt: DateTime.utc(2026, 10, 1, 8),
      requirement: MissionFitRequirement(
        ownerConfirmed: true,
        facts: testMissionFitRequirementFacts()
            .map(
              (fact) => MissionFitMeasurement.fromJson(
                fact,
                requiresProvenance: false,
                expectedUnits: missionFitRequirementUnits,
              ),
            )
            .toList(growable: false),
      ),
      itemFacts: testMissionFitItemFacts()
          .map(
            (fact) => MissionFitMeasurement.fromJson(
              fact,
              requiresProvenance: true,
              expectedUnits: missionFitItemUnits,
            ),
          )
          .toList(growable: false),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': _session('owner-a'),
    });
  });

  test(
    'uses exact private routes, initiating bearer and idempotent bodies',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionFitCheckGateway();
      final seen = <String>[];

      await http.runWithClient(() async {
        final listed = await gateway.list(
          owner: owner,
          missionNeedId: testMissionFitMissionId,
        );
        expect(listed.single.fitCheckId, testMissionFitId);

        final loaded = await gateway.load(
          owner: owner,
          missionNeedId: testMissionFitMissionId,
          fitCheckId: testMissionFitId,
        );
        expect(loaded.currentEvaluation.status, MissionFitStatus.fit);

        final created = await gateway.create(
          owner: owner,
          missionNeedId: testMissionFitMissionId,
          draft: _draft(),
          idempotencyKey: 'fit-http-create-0001',
        );
        expect(created.replayed, isFalse);

        final corrected = await gateway.correct(
          owner: owner,
          missionNeedId: testMissionFitMissionId,
          fitCheckId: testMissionFitId,
          expectedRevision: 1,
          draft: _draft(),
          idempotencyKey: 'fit-http-correct-0001',
        );
        expect(corrected.fitCheck.revision, 2);
      },
          () => MockClient((request) async {
                seen.add('${request.method} ${request.url.path}');
                expect(
                    request.headers['Authorization'], 'Bearer access-owner-a');
                final path = request.url.path;
                if (request.method == 'GET' &&
                    path ==
                        '/api/v1/mission-needs/$testMissionFitMissionId/fit-checks') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'fitChecks': <Map<String, dynamic>>[
                        testMissionFitCheckJson(),
                      ],
                    }),
                    200,
                  );
                }
                if (request.method == 'GET' &&
                    path == '/api/v1/mission-fit-checks/$testMissionFitId') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'fitCheck': testMissionFitCheckJson(),
                    }),
                    200,
                  );
                }
                if (request.method == 'POST' &&
                    path ==
                        '/api/v1/mission-needs/$testMissionFitMissionId/fit-checks') {
                  expect(
                    request.headers['Idempotency-Key'],
                    'fit-http-create-0001',
                  );
                  final body = jsonDecode(request.body) as Map<String, dynamic>;
                  expect(body.keys.toSet(), _draft().toJson().keys.toSet());
                  expect(body['definitionId'], plantContainerFitDefinitionId);
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'fitCheck': testMissionFitCheckJson(),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                if (request.method == 'POST' &&
                    path ==
                        '/api/v1/mission-fit-checks/$testMissionFitId/revisions') {
                  expect(
                    request.headers['Idempotency-Key'],
                    'fit-http-correct-0001',
                  );
                  final body = jsonDecode(request.body) as Map<String, dynamic>;
                  expect(body['expectedRevision'], 1);
                  expect(body['definitionId'], plantContainerFitDefinitionId);
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'fitCheck': testMissionFitCheckJson(revision: 2),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                return http.Response('{"error":"unexpected"}', 500);
              }));

      expect(seen, <String>[
        'GET /api/v1/mission-needs/$testMissionFitMissionId/fit-checks',
        'GET /api/v1/mission-fit-checks/$testMissionFitId',
        'POST /api/v1/mission-needs/$testMissionFitMissionId/fit-checks',
        'POST /api/v1/mission-fit-checks/$testMissionFitId/revisions',
      ]);
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'preserves uniform foreign 404 and rejects malformed server shapes',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionFitCheckGateway();
      await http.runWithClient(
        () => expectLater(
          gateway.load(
            owner: owner,
            missionNeedId: testMissionFitMissionId,
            fitCheckId: testMissionFitId,
          ),
          throwsA(
            isA<BackendException>()
                .having((error) => error.statusCode, 'status', 404)
                .having(
                  (error) => error.code,
                  'code',
                  'mission_fit_check_not_found',
                ),
          ),
        ),
        () => MockClient(
          (_) async => http.Response(
            '{"error":"mission_fit_check_not_found"}',
            404,
          ),
        ),
      );

      await http.runWithClient(
        () => expectLater(
          gateway.list(
            owner: owner,
            missionNeedId: testMissionFitMissionId,
          ),
          throwsFormatException,
        ),
        () => MockClient(
          (_) async => http.Response('{"fitChecks":{}}', 200),
        ),
      );
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'rejects a late account-A result after account B becomes current',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionFitCheckGateway();
      await http.runWithClient(
        () => expectLater(
          gateway.list(
            owner: owner,
            missionNeedId: testMissionFitMissionId,
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
              'fitChecks': <Map<String, dynamic>>[
                testMissionFitCheckJson(),
              ],
            }),
            200,
          );
        }),
      );
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'rejects list and load rows bound to a different mission',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionFitCheckGateway();
      const foreignMission =
          'mission_need_55555555-5555-4555-8555-555555555555';
      await http.runWithClient(
        () => expectLater(
          gateway.list(
            owner: owner,
            missionNeedId: testMissionFitMissionId,
          ),
          throwsFormatException,
        ),
        () => MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'fitChecks': <Map<String, dynamic>>[
                testMissionFitCheckJson(missionNeedId: foreignMission),
              ],
            }),
            200,
          ),
        ),
      );
      await http.runWithClient(
        () => expectLater(
          gateway.load(
            owner: owner,
            missionNeedId: testMissionFitMissionId,
            fitCheckId: testMissionFitId,
          ),
          throwsFormatException,
        ),
        () => MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'fitCheck':
                  testMissionFitCheckJson(missionNeedId: foreignMission),
            }),
            200,
          ),
        ),
      );
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'rejects create and correction responses with foreign binding ids',
    () async {
      final owner = await _ownerA();
      const gateway = BackendMissionFitCheckGateway();
      const foreignMission =
          'mission_need_55555555-5555-4555-8555-555555555555';
      const foreignShelf = 'shelf_item_66666666-6666-4666-8666-666666666666';
      const foreignFit = 'mission_fit_77777777-7777-4777-8777-777777777777';

      await http.runWithClient(
        () => expectLater(
          gateway.create(
            owner: owner,
            missionNeedId: testMissionFitMissionId,
            draft: _draft(),
            idempotencyKey: 'fit-binding-create-0001',
          ),
          throwsFormatException,
        ),
        () => MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'fitCheck': testMissionFitCheckJson(shelfItemId: foreignShelf),
              'replayed': false,
            }),
            201,
          ),
        ),
      );

      for (final response in <Map<String, dynamic>>[
        testMissionFitCheckJson(fitCheckId: foreignFit),
        testMissionFitCheckJson(missionNeedId: foreignMission),
      ]) {
        await http.runWithClient(
          () => expectLater(
            gateway.correct(
              owner: owner,
              missionNeedId: testMissionFitMissionId,
              fitCheckId: testMissionFitId,
              expectedRevision: 1,
              draft: _draft(),
              idempotencyKey: 'fit-binding-correct-0001',
            ),
            throwsFormatException,
          ),
          () => MockClient(
            (_) async => http.Response(
              jsonEncode(<String, dynamic>{
                'fitCheck': response,
                'replayed': false,
              }),
              201,
            ),
          ),
        );
      }
    },
    skip: !BackendConfig.enabled,
  );
}
