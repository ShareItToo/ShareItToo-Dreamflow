import 'package:lendify/models/mission_fit_check.dart';

const testMissionFitId = 'mission_fit_11111111-1111-4111-8111-111111111111';
const testMissionFitMissionId =
    'mission_need_22222222-2222-4222-8222-222222222222';
const testMissionFitShelfId = 'shelf_item_33333333-3333-4333-8333-333333333333';
const testMissionFitDigest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

Map<String, dynamic> testMissionFitEvaluation(
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

List<Map<String, dynamic>> testMissionFitRequirementFacts() =>
    <Map<String, dynamic>>[
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

List<Map<String, dynamic>> testMissionFitItemFacts() => <Map<String, dynamic>>[
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
            'sourceReference': 'shelf:$testMissionFitShelfId:${entry.key}',
            'sourceVersion': 'owner-measurement-v1:fixture0001',
            'ownerConfirmed': true,
          },
        },
    ];

Map<String, dynamic> testMissionFitCheckJson({
  String storedStatus = 'fit',
  String applicability = 'current',
  String? currentStatus,
  int revision = 1,
  String missionNeedId = testMissionFitMissionId,
  String fitCheckId = testMissionFitId,
  String shelfItemId = testMissionFitShelfId,
}) {
  final stored = testMissionFitEvaluation(storedStatus);
  final current = applicability == 'current'
      ? testMissionFitEvaluation(currentStatus ?? storedStatus)
      : testMissionFitEvaluation(
          'unknown',
          reasons: <String>['mission_snapshot_changed'],
        );
  return <String, dynamic>{
    'fitCheckId': fitCheckId,
    'domainVersion': missionFitCheckDomainVersion,
    'definitionId': plantContainerFitDefinitionId,
    'definitionVersion': plantContainerFitDefinitionVersion,
    'plannerCoreVersion': missionFitPlannerCoreVersion,
    'needKey': plantContainerNeedKey,
    'missionNeedId': missionNeedId,
    'missionRevision': 1,
    'missionPayloadDigest': testMissionFitDigest,
    'shelfItemId': shelfItemId,
    'shelfSnapshot': <String, dynamic>{
      'shelfItemId': shelfItemId,
      'domainVersion': 'P3-A-2026-10-01.1',
      'title': 'Pflanzkübel',
      'categoryKey': 'garden.container',
      'condition': 'good',
      'updatedAt': '2026-10-01T08:00:00.000Z',
    },
    'shelfSnapshotDigest': testMissionFitDigest,
    'revision': revision,
    'requirement': <String, dynamic>{
      'ownerConfirmed': true,
      'facts': testMissionFitRequirementFacts(),
    },
    'requirementDigest': testMissionFitDigest,
    'itemFacts': testMissionFitItemFacts(),
    'itemFactsDigest': testMissionFitDigest,
    'storedEvaluation': stored,
    'currentApplicability': applicability,
    'currentEvaluation': current,
    'payloadDigest': testMissionFitDigest,
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

MissionFitCheck testMissionFitCheck({
  String storedStatus = 'fit',
  String applicability = 'current',
  int revision = 1,
}) =>
    MissionFitCheck.fromJson(
      testMissionFitCheckJson(
        storedStatus: storedStatus,
        applicability: applicability,
        revision: revision,
      ),
    );
