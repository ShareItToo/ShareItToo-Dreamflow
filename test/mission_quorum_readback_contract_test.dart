import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/mission_quorum_readback.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/mission_quorum_readback_gateway.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _missionId = 'mission_need_00000000-0000-4000-8000-000000000001';
const _resolutionId = 'mission_inventory_00000000-0000-4000-8000-000000000001';
const _digest =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

Map<String, dynamic> _readback() => <String, dynamic>{
      'version': missionQuorumReadbackVersion,
      'missionNeedId': _missionId,
      'resolutionId': _resolutionId,
      'missionRevision': 2,
      'resolutionRevision': 3,
      'missionPayloadDigest': _digest,
      'resolutionDigest': _digest,
      'observedAt': '2026-10-05T08:00:00.000Z',
      'status': 'incomplete',
      'bindingStatus': 'non_binding',
      'persisted': false,
      'paymentStatus': 'not_determined',
      'components': <Map<String, dynamic>>[
        <String, dynamic>{
          'slotKey': 'required:drill:1',
          'needKey': 'drill',
          'necessity': 'required',
          'ordinal': 1,
          'state': 'stale_or_unknown',
        },
      ],
    };

void main() {
  test('strict parser accepts only non-binding safe quorum fields', () {
    final parsed = MissionQuorumReadback.fromJson(_readback());
    expect(
        parsed.components.single.state, MissionQuorumSlotState.staleOrUnknown);
    expect(parsed.persisted, isFalse);
    expect(jsonEncode(_readback()).contains('owner'), isFalse);
    final extra = _readback()..['recipientId'] = 'private-recipient';
    expect(() => MissionQuorumReadback.fromJson(extra), throwsFormatException);
    final nonCanonical = _readback()..['observedAt'] = '2026-10-05T08:00:00Z';
    expect(
      () => MissionQuorumReadback.fromJson(nonCanonical),
      throwsFormatException,
    );
  });

  test('gateway fails closed when principal changes before the read', () async {
    final owner = const AuthSessionOwner(
      userId: 'owner-a',
      sessionId: 'session-a',
      email: 'owner-a@example.invalid',
      createdAt: null,
      epoch: 1,
    );
    const gateway = BackendMissionQuorumReadbackGateway(
      ownerCheck: _changedPrincipal,
    );
    await expectLater(
      gateway.load(
        owner: owner,
        missionNeedId: _missionId,
        resolutionId: _resolutionId,
        missionRevision: 2,
        resolutionRevision: 3,
        missionPayloadDigest: _digest,
        resolutionDigest: _digest,
      ),
      throwsA(isA<BackendException>()),
    );
  });

  test('gateway rejects post-response principal drift and digest mismatch',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': jsonEncode(<String, dynamic>{
        'userId': 'owner-a',
        'email': 'owner-a@example.invalid',
        'sessionId': 'session-a',
        'createdAt': '2026-10-01T08:00:00.000Z',
        'accessToken': 'access-owner-a',
        'refreshToken': 'refresh-owner-a',
        'accessTokenExpiresAt': '2099-01-01T00:00:00.000Z',
      }),
    });
    final session = await AuthService.readSession();
    final owner = AuthService.captureSessionOwner(session!);
    final response = http.Response(
      jsonEncode(<String, dynamic>{'quorum': _readback()}),
      200,
    );
    var checks = 0;
    final drifting = BackendMissionQuorumReadbackGateway(
      ownerCheck: (_) async {
        checks += 1;
        return checks == 1;
      },
    );
    await http.runWithClient(
      () async => expectLater(
        drifting.load(
          owner: owner,
          missionNeedId: _missionId,
          resolutionId: _resolutionId,
          missionRevision: 2,
          resolutionRevision: 3,
          missionPayloadDigest: _digest,
          resolutionDigest: _digest,
        ),
        throwsA(isA<BackendException>()),
      ),
      () => MockClient((_) async => response),
    );
    expect(checks, 2);

    final mismatch = BackendMissionQuorumReadbackGateway(
      ownerCheck: (_) async => true,
    );
    await http.runWithClient(
      () async => expectLater(
        mismatch.load(
          owner: owner,
          missionNeedId: _missionId,
          resolutionId: _resolutionId,
          missionRevision: 2,
          resolutionRevision: 3,
          missionPayloadDigest: 'f' * 64,
          resolutionDigest: _digest,
        ),
        throwsA(isA<FormatException>()),
      ),
      () => MockClient((_) async => response),
    );
  });
}

Future<bool> _changedPrincipal(AuthSessionOwner owner) async => false;
