import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_need.dart';

const _id = 'mission_need_11111111-1111-4111-8111-111111111111';
const _digest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

Map<String, dynamic> _payload({String status = 'draft'}) => <String, dynamic>{
      'title': 'Wohnung renovieren',
      'status': status,
      'needs': <Map<String, dynamic>>[
        <String, dynamic>{
          'needKey': 'paint_roller',
          'necessity': 'required',
          'quantity': 2,
        },
        <String, dynamic>{
          'needKey': 'laser_level',
          'necessity': 'optional',
          'quantity': 1,
        },
      ],
    };

Map<String, dynamic> _mission({bool revisions = false}) => <String, dynamic>{
      'missionNeedId': _id,
      'domainVersion': missionNeedDomainVersion,
      'revision': 1,
      'status': 'draft',
      'payload': _payload(),
      'payloadDigest': _digest,
      'createdAt': '2026-10-01T08:00:00.000Z',
      'updatedAt': '2026-10-01T08:00:00.000Z',
      'bindingStatus': 'non_binding',
      'reservationCreated': false,
      'bookingCreated': false,
      'contractCreated': false,
      'paymentCreated': false,
      'externalGenerativeAiUsed': false,
      'automaticPhotoAnalysisUsed': false,
      if (revisions)
        'revisions': <Map<String, dynamic>>[
          <String, dynamic>{
            'revision': 1,
            'status': 'draft',
            'payload': _payload(),
            'payloadDigest': _digest,
            'createdAt': '2026-10-01T08:00:00.000Z',
          },
        ],
    };

void main() {
  test('accepts exact non-binding mission and revision contracts', () {
    final mission = MissionNeed.fromJson(_mission(revisions: true));

    expect(mission.missionNeedId, _id);
    expect(mission.revision, 1);
    expect(mission.payload.needs, hasLength(2));
    expect(
      mission.payload.needs.last.necessity,
      MissionNeedNecessity.optional,
    );
    expect(mission.revisions.single.payloadDigest, _digest);
  });

  test('rejects binding effects, malformed items and mismatched server truth',
      () {
    final booking = _mission()..['bookingCreated'] = true;
    expect(() => MissionNeed.fromJson(booking), throwsFormatException);

    final malformed = _mission();
    final payload = Map<String, dynamic>.from(malformed['payload'] as Map);
    payload['needs'] = <Map<String, dynamic>>[
      <String, dynamic>{
        'needKey': 'not a server key',
        'necessity': 'required',
        'quantity': 0,
      },
    ];
    malformed['payload'] = payload;
    expect(() => MissionNeed.fromJson(malformed), throwsFormatException);

    final statusMismatch = _mission();
    statusMismatch['status'] = 'planned';
    expect(() => MissionNeed.fromJson(statusMismatch), throwsFormatException);
  });

  test('request payload contains only the P2-A manual fields', () {
    final payload = MissionNeedPayload(
      title: 'Gartenprojekt',
      status: MissionNeedStatus.planned,
      needs: const <MissionNeedItem>[
        MissionNeedItem(
          needKey: 'hedge_trimmer',
          necessity: MissionNeedNecessity.required,
          quantity: 1,
        ),
      ],
    );

    expect(payload.toJson(), <String, dynamic>{
      'title': 'Gartenprojekt',
      'status': 'planned',
      'needs': <Map<String, dynamic>>[
        <String, dynamic>{
          'needKey': 'hedge_trimmer',
          'necessity': 'required',
          'quantity': 1,
        },
      ],
    });
  });
}
