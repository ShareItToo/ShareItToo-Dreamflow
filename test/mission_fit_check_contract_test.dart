import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_fit_check.dart';

const _fitId = 'mission_fit_11111111-1111-4111-8111-111111111111';
const _missionId = 'mission_need_22222222-2222-4222-8222-222222222222';
const _shelfId = 'shelf_item_33333333-3333-4333-8333-333333333333';
const _digest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

Map<String, dynamic> _evaluation(
  String status, {
  List<String>? reasons,
  String? orientation,
}) =>
    <String, dynamic>{
      'status': status,
      'releaseBlocked': status != 'fit',
      'reasonCodes': reasons ??
          (status == 'fit'
              ? <String>[]
              : <String>['footprint_exceeds_maximum']),
      'orientation': status == 'fit' ? (orientation ?? 'direct') : null,
      'scope': 'dimensional_capacity_only',
      'bindingStatus': 'non_binding',
      'safetyGuarantee': false,
    };

List<Map<String, dynamic>> _requirementFacts() => <Map<String, dynamic>>[
      <String, dynamic>{
        'key': 'minimumUsableVolumeMl',
        'value': 5000,
        'unit': 'ml',
      },
      <String, dynamic>{
        'key': 'maximumFootprintWidthMm',
        'value': 400,
        'unit': 'mm',
      },
      <String, dynamic>{
        'key': 'maximumFootprintDepthMm',
        'value': 300,
        'unit': 'mm',
      },
      <String, dynamic>{
        'key': 'maximumHeightMm',
        'value': 600,
        'unit': 'mm',
      },
    ];

List<Map<String, dynamic>> _itemFacts() => <Map<String, dynamic>>[
      for (final entry in const <String, (int, String)>{
        'usableVolumeMl': (6000, 'ml'),
        'footprintWidthMm': (300, 'mm'),
        'footprintDepthMm': (250, 'mm'),
        'heightMm': (500, 'mm'),
      }.entries)
        <String, dynamic>{
          'key': entry.key,
          'value': entry.value.$1,
          'unit': entry.value.$2,
          'provenance': <String, dynamic>{
            'sourceType': 'owner_confirmed_measurement',
            'sourceReference': 'shelf:$_shelfId:${entry.key}',
            'sourceVersion': 'owner-measurement-v1:fixture0001',
            'ownerConfirmed': true,
          },
        },
    ];

Map<String, dynamic> fitCheckJson({
  String storedStatus = 'fit',
  String applicability = 'current',
  String? currentStatus,
}) {
  final stored = _evaluation(storedStatus);
  final current = applicability == 'current'
      ? _evaluation(currentStatus ?? storedStatus)
      : _evaluation(
          'unknown',
          reasons: <String>['mission_snapshot_changed'],
        );
  return <String, dynamic>{
    'fitCheckId': _fitId,
    'domainVersion': missionFitCheckDomainVersion,
    'definitionId': plantContainerFitDefinitionId,
    'definitionVersion': plantContainerFitDefinitionVersion,
    'plannerCoreVersion': missionFitPlannerCoreVersion,
    'needKey': plantContainerNeedKey,
    'missionNeedId': _missionId,
    'missionRevision': 1,
    'missionPayloadDigest': _digest,
    'shelfItemId': _shelfId,
    'shelfSnapshot': <String, dynamic>{
      'shelfItemId': _shelfId,
      'domainVersion': 'P3-A-2026-10-01.1',
      'title': 'Pflanzkübel',
      'categoryKey': 'garden.container',
      'condition': 'good',
      'updatedAt': '2026-10-01T08:00:00.000Z',
    },
    'shelfSnapshotDigest': _digest,
    'revision': 1,
    'requirement': <String, dynamic>{
      'ownerConfirmed': true,
      'facts': _requirementFacts(),
    },
    'requirementDigest': _digest,
    'itemFacts': _itemFacts(),
    'itemFactsDigest': _digest,
    'storedEvaluation': stored,
    'currentApplicability': applicability,
    'currentEvaluation': current,
    'payloadDigest': _digest,
    'createdAt': '2026-10-01T08:00:00.000Z',
    'updatedAt': '2026-10-01T08:00:00.000Z',
    'revisionCreatedAt': '2026-10-01T08:00:00.000Z',
    'bindingStatus': 'non_binding',
    'safetyGuarantee': false,
    'reservationCreated': false,
    'bookingCreated': false,
    'contractCreated': false,
    'paymentCreated': false,
    'externalGenerativeAiUsed': false,
    'automaticPhotoAnalysisUsed': false,
    'publicListingCreated': false,
  };
}

void main() {
  test('accepts exact current and stale server-authoritative shapes', () {
    final current = MissionFitCheck.fromJson(fitCheckJson());
    expect(current.currentApplicability, MissionFitApplicability.current);
    expect(current.currentEvaluation.status, MissionFitStatus.fit);
    expect(current.currentEvaluation.releaseBlocked, isFalse);
    expect(current.itemFacts, hasLength(4));

    final stale = MissionFitCheck.fromJson(
      fitCheckJson(applicability: 'stale'),
    );
    expect(stale.storedEvaluation.status, MissionFitStatus.fit);
    expect(stale.currentEvaluation.status, MissionFitStatus.unknown);
    expect(stale.currentEvaluation.releaseBlocked, isTrue);
  });

  test('rejects missing, extra, forged and contradictory server truth', () {
    final extra = fitCheckJson()..['unexpected'] = true;
    expect(() => MissionFitCheck.fromJson(extra), throwsFormatException);

    final missing = fitCheckJson()..remove('publicListingCreated');
    expect(() => MissionFitCheck.fromJson(missing), throwsFormatException);

    for (final effect in const <String>[
      'reservationCreated',
      'bookingCreated',
      'contractCreated',
      'paymentCreated',
      'externalGenerativeAiUsed',
      'automaticPhotoAnalysisUsed',
      'publicListingCreated',
    ]) {
      final forged = fitCheckJson()..[effect] = true;
      expect(() => MissionFitCheck.fromJson(forged), throwsFormatException);
    }

    expect(
      () => MissionFitCheck.fromJson(
        fitCheckJson(currentStatus: 'unfit'),
      ),
      throwsFormatException,
    );
    final staleFit = fitCheckJson(applicability: 'stale')
      ..['currentEvaluation'] = _evaluation('fit');
    expect(() => MissionFitCheck.fromJson(staleFit), throwsFormatException);
  });

  test('rejects unit, provenance, duplicate and range drift', () {
    final wrongUnit = fitCheckJson();
    (wrongUnit['itemFacts'] as List).first['unit'] = 'cm';
    expect(() => MissionFitCheck.fromJson(wrongUnit), throwsFormatException);

    final unconfirmed = fitCheckJson();
    ((unconfirmed['itemFacts'] as List).first['provenance']
        as Map<String, dynamic>)['ownerConfirmed'] = 'true';
    expect(() => MissionFitCheck.fromJson(unconfirmed), throwsFormatException);

    final duplicate = fitCheckJson();
    (duplicate['requirement']['facts'] as List)[1]['key'] =
        'minimumUsableVolumeMl';
    expect(() => MissionFitCheck.fromJson(duplicate), throwsFormatException);

    final outOfRange = fitCheckJson();
    (outOfRange['requirement']['facts'] as List).first['value'] = 10000001;
    expect(() => MissionFitCheck.fromJson(outOfRange), throwsFormatException);

    final invalidCondition = fitCheckJson();
    (invalidCondition['shelfSnapshot'] as Map<String, dynamic>)['condition'] =
        'excellent';
    expect(
      () => MissionFitCheck.fromJson(invalidCondition),
      throwsFormatException,
    );
  });

  test('serializes the exact create snapshot and fixed definition', () {
    final draft = MissionFitCheckDraft(
      missionRevision: 2,
      missionPayloadDigest: _digest,
      shelfItemId: _shelfId,
      shelfUpdatedAt: DateTime.utc(2026, 10, 1, 9),
      requirement: MissionFitRequirement(
        ownerConfirmed: true,
        facts: _requirementFacts()
            .map(
              (fact) => MissionFitMeasurement.fromJson(
                fact,
                requiresProvenance: false,
                expectedUnits: missionFitRequirementUnits,
              ),
            )
            .toList(),
      ),
      itemFacts: _itemFacts()
          .map(
            (fact) => MissionFitMeasurement.fromJson(
              fact,
              requiresProvenance: true,
              expectedUnits: missionFitItemUnits,
            ),
          )
          .toList(),
    ).toJson();
    expect(draft.keys.toSet(), <String>{
      'definitionId',
      'missionRevision',
      'missionPayloadDigest',
      'shelfItemId',
      'shelfUpdatedAt',
      'requirement',
      'itemFacts',
    });
    expect(draft['definitionId'], plantContainerFitDefinitionId);
    expect(draft['missionRevision'], 2);
  });
}
