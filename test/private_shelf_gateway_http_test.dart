import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/private_shelf_item.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/private_shelf_gateway.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _itemId = 'shelf_item_11111111-1111-4111-8111-111111111111';
const _mediaId = '22222222-2222-4222-8222-222222222222';

String _session(String owner) => jsonEncode(<String, dynamic>{
      'userId': owner,
      'email': '$owner@example.invalid',
      'sessionId': 'session-$owner',
      'createdAt': '2026-10-01T08:00:00.000Z',
      'accessToken': 'access-$owner',
      'refreshToken': 'refresh-$owner',
      'accessTokenExpiresAt': '2099-01-01T00:00:00.000Z',
    });

Map<String, dynamic> _media() => <String, dynamic>{
      'mediaId': _mediaId,
      'mimeType': 'image/webp',
      'width': 800,
      'height': 600,
      'fullUrl': '/v1/private-shelf/$_itemId/media/$_mediaId/full',
      'thumbnailUrl': '/v1/private-shelf/$_itemId/media/$_mediaId/thumbnail',
      'createdAt': '2026-10-01T08:00:00.000Z',
    };

Map<String, dynamic> _item({bool withMedia = true}) => <String, dynamic>{
      'shelfItemId': _itemId,
      'domainVersion': privateShelfDomainVersion,
      'title': 'Bohrmaschine',
      'categoryKey': 'werkzeug',
      'condition': 'good',
      'media': withMedia ? <Map<String, dynamic>>[_media()] : <dynamic>[],
      'visibility': 'private_owner_only',
      'publicListingCreated': false,
      'reservationCreated': false,
      'bookingCreated': false,
      'paymentCreated': false,
      'externalGenerativeAiUsed': false,
      'createdAt': '2026-10-01T08:00:00.000Z',
      'updatedAt': '2026-10-01T08:00:00.000Z',
    };

Future<AuthSessionOwner> _ownerA() async {
  final session = await AuthService.readSession();
  expect(session, isNotNull);
  return AuthService.captureSessionOwner(session!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': _session('owner-a'),
    });
  });

  test(
    'uses only exact private routes and the initiating owner bearer',
    () async {
      final owner = await _ownerA();
      const gateway = BackendPrivateShelfGateway();
      final seen = <String>[];

      await http.runWithClient(() async {
        final listed = await gateway.list(owner);
        expect(listed.single.shelfItemId, _itemId);

        final loaded = await gateway.load(
          owner: owner,
          shelfItemId: _itemId,
        );
        expect(loaded.title, 'Bohrmaschine');

        final created = await gateway.create(
          owner: owner,
          payload: const PrivateShelfItemPayload(
            title: 'Bohrmaschine',
            categoryKey: 'werkzeug',
            condition: PrivateShelfCondition.good,
          ),
          idempotencyKey: 'shelf-http-fixture-0001',
        );
        expect(created.replayed, isFalse);

        final uploaded = await gateway.uploadMedia(
          owner: owner,
          shelfItemId: _itemId,
          bytes: Uint8List.fromList(<int>[1, 2, 3]),
          filename: 'private.webp',
        );
        expect(uploaded.mediaId, _mediaId);

        final bytes = await gateway.readMedia(
          owner: owner,
          shelfItemId: _itemId,
          media: uploaded,
          thumbnail: true,
        );
        expect(bytes.bytes, <int>[1, 2, 3]);

        await gateway.delete(owner: owner, shelfItemId: _itemId);
      },
          () => MockClient((request) async {
                seen.add('${request.method} ${request.url.path}');
                expect(
                    request.headers['Authorization'], 'Bearer access-owner-a');
                expect(request.url.path, isNot(contains('/uploads')));
                final path = request.url.path;
                if (request.method == 'GET' &&
                    path == '/api/v1/private-shelf') {
                  return http.Response(
                      jsonEncode(<String, dynamic>{
                        'shelfItems': <Map<String, dynamic>>[_item()],
                      }),
                      200);
                }
                if (request.method == 'GET' &&
                    path == '/api/v1/private-shelf/$_itemId') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{'shelfItem': _item()}),
                    200,
                  );
                }
                if (request.method == 'POST' &&
                    path == '/api/v1/private-shelf') {
                  expect(request.headers['Idempotency-Key'],
                      'shelf-http-fixture-0001');
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'shelfItem': _item(),
                      'replayed': false,
                    }),
                    201,
                  );
                }
                if (request.method == 'POST' &&
                    path == '/api/v1/private-shelf/$_itemId/media') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{'media': _media()}),
                    201,
                  );
                }
                if (request.method == 'GET' &&
                    path ==
                        '/api/v1/private-shelf/$_itemId/media/$_mediaId/thumbnail') {
                  return http.Response.bytes(<int>[1, 2, 3], 200,
                      headers: const {
                        'content-type': 'image/webp',
                        'content-length': '3',
                        'cache-control': 'private, no-store',
                      });
                }
                if (request.method == 'DELETE' &&
                    path == '/api/v1/private-shelf/$_itemId') {
                  return http.Response('', 204);
                }
                return http.Response('{"error":"unexpected"}', 500);
              }));

      expect(seen, <String>[
        'GET /api/v1/private-shelf',
        'GET /api/v1/private-shelf/$_itemId',
        'POST /api/v1/private-shelf',
        'POST /api/v1/private-shelf/$_itemId/media',
        'GET /api/v1/private-shelf/$_itemId/media/$_mediaId/thumbnail',
        'DELETE /api/v1/private-shelf/$_itemId',
      ]);
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'rejects foreign uniform 404 and malformed private media responses',
    () async {
      final owner = await _ownerA();
      const gateway = BackendPrivateShelfGateway();
      await http.runWithClient(
        () => expectLater(
          gateway.load(owner: owner, shelfItemId: _itemId),
          throwsA(
            isA<BackendException>()
                .having((error) => error.statusCode, 'status', 404)
                .having((error) => error.code, 'code',
                    'private_shelf_item_not_found'),
          ),
        ),
        () => MockClient((_) async => http.Response(
              '{"error":"private_shelf_item_not_found"}',
              404,
            )),
      );

      final media = PrivateShelfMedia.fromJson(_media(), shelfItemId: _itemId);
      await http.runWithClient(
        () => expectLater(
          gateway.readMedia(
            owner: owner,
            shelfItemId: _itemId,
            media: media,
            thumbnail: true,
          ),
          throwsFormatException,
        ),
        () => MockClient((_) async => http.Response.bytes(
              <int>[1, 2, 3],
              200,
              headers: const <String, String>{
                'content-type': 'text/plain',
                'content-length': '3',
                'cache-control': 'public',
              },
            )),
      );
    },
    skip: !BackendConfig.enabled,
  );

  test(
    'rejects a late account-A result after account B becomes current',
    () async {
      final owner = await _ownerA();
      const gateway = BackendPrivateShelfGateway();
      await http.runWithClient(
        () => expectLater(
          gateway.list(owner),
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
              'shelfItems': <Map<String, dynamic>>[_item()],
            }),
            200,
          );
        }),
      );
    },
    skip: !BackendConfig.enabled,
  );
}
