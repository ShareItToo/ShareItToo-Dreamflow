import 'package:lendify/models/mission_inventory_resolution.dart';

const String testMissionInventoryMissionId =
    'mission_need_11111111-1111-4111-8111-111111111111';
const String testMissionInventoryResolutionId =
    'mission_inventory_22222222-2222-4222-8222-222222222222';
const String testMissionInventoryDigest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

Map<String, dynamic> testMissionInventoryLocation() {
  final value = <String, dynamic>{
    'sourceType': 'owner_confirmed_search_origin',
    'sourceVersion': 'owner-maps-selection-test0001',
    'ownerConfirmed': true,
    'radiusKm': 25,
    'coordinateDigest':
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'exactCoordinatesStored': false,
  };
  return value;
}

Map<String, dynamic> testMissionInventoryQuote() => <String, dynamic>{
      'quoteHash':
          'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'quotedAt': '2026-10-01T08:00:00.000Z',
      'availabilityRevision': 3,
      'currency': 'EUR',
      'rentalSubtotalMinor': 900,
      'platformFeeMinor': 100,
      'totalMinor': 1000,
      'ownerPayoutMinor': 900,
      'preview': true,
      'persisted': false,
    };

Map<String, dynamic> testMissionInventorySnapshot({
  bool searchLimited = true,
}) {
  final location = testMissionInventoryLocation();
  return <String, dynamic>{
    'domainVersion': missionInventoryResolutionDomainVersion,
    'plannerCoreVersion': missionInventoryPlannerCoreVersion,
    'missionNeedId': testMissionInventoryMissionId,
    'missionRevision': 1,
    'missionPayloadDigest': testMissionInventoryDigest,
    'startDate': '2026-11-10',
    'endDate': '2026-11-12',
    'locationSnapshot': location,
    'locationSnapshotDigest': missionInventoryDigest(location),
    'candidatePolicy': <String, dynamic>{
      'candidateLimitPerNeed': 24,
      'ordering': 'distance_then_listing_id',
      'completeness': 'bounded_not_complete_or_optimal',
      'pilotRegionUsedAsDistance': false,
    },
    'coverage': <Map<String, dynamic>>[
      <String, dynamic>{
        'needKey': 'plant_container_equipment',
        'necessity': 'required',
        'requestedQuantity': 2,
        'coveredQuantity': 1,
        'gapQuantity': 1,
        'supported': true,
        'inspectedCount': 25,
        'rejectedByServerTruth': 0,
        'searchLimited': searchLimited,
      },
      <String, dynamic>{
        'needKey': 'unsupported_custom_need',
        'necessity': 'optional',
        'requestedQuantity': 1,
        'coveredQuantity': 0,
        'gapQuantity': 1,
        'supported': false,
        'inspectedCount': 0,
        'rejectedByServerTruth': 0,
        'searchLimited': false,
      },
    ],
    'slots': <Map<String, dynamic>>[
      <String, dynamic>{
        'slotKey': 'required:plant_container_equipment:1',
        'needKey': 'plant_container_equipment',
        'necessity': 'required',
        'ordinal': 1,
        'status': 'assigned',
        'gapReason': null,
        'assignment': <String, dynamic>{
          'listingId': 'listing-p5-candidate-0001',
          'title': 'Pflanzkübel 50 Liter',
          'categoryId': 'cat7',
          'subcategory': 'Gartengeräte',
          'condition': 'good',
          'city': 'Heilbronn',
          'country': 'Deutschland',
          'distanceKm': 1.2,
          'catalogRevision': 2,
          'availabilityRevision': 3,
          'quote': testMissionInventoryQuote(),
        },
      },
      <String, dynamic>{
        'slotKey': 'required:plant_container_equipment:2',
        'needKey': 'plant_container_equipment',
        'necessity': 'required',
        'ordinal': 2,
        'status': 'gap',
        'gapReason': 'no_current_unique_candidate',
        'assignment': null,
      },
      <String, dynamic>{
        'slotKey': 'optional:unsupported_custom_need:1',
        'needKey': 'unsupported_custom_need',
        'necessity': 'optional',
        'ordinal': 1,
        'status': 'gap',
        'gapReason': 'unsupported_need_key',
        'assignment': null,
      },
    ],
    'requiredCoverageComplete': false,
    'searchLimited': searchLimited,
    'status': 'resolved_at_request_time',
    'quotePersisted': false,
    'revalidationRequiredBeforeRequest': true,
    'bindingStatus': 'non_binding',
    'reservationCreated': false,
    'bookingCreated': false,
    'contractCreated': false,
    'paymentCreated': false,
    'publicShelfCreated': false,
    'publicListingCreated': false,
    'automaticPublicationPerformed': false,
    'externalGenerativeAiUsed': false,
  };
}

Map<String, dynamic> testMissionInventoryResolutionJson({
  int revision = 1,
  bool stale = false,
  bool searchLimited = true,
  String resolutionId = testMissionInventoryResolutionId,
  String missionNeedId = testMissionInventoryMissionId,
}) {
  final location = testMissionInventoryLocation();
  final snapshot = testMissionInventorySnapshot(searchLimited: searchLimited)
    ..['missionNeedId'] = missionNeedId;
  return <String, dynamic>{
    'resolutionId': resolutionId,
    'domainVersion': missionInventoryResolutionDomainVersion,
    'plannerCoreVersion': missionInventoryPlannerCoreVersion,
    'plannerInventoryVersion': missionInventoryPlannerVersion,
    'missionNeedId': missionNeedId,
    'missionRevision': 1,
    'missionPayloadDigest': testMissionInventoryDigest,
    'revision': revision,
    'startDate': '2026-11-10',
    'endDate': '2026-11-12',
    'locationSnapshot': location,
    'locationSnapshotDigest': missionInventoryDigest(location),
    'storedResolution': snapshot,
    'currentApplicability': stale ? 'stale' : 'current_snapshot_inputs',
    'currentStatus': stale ? 'unknown' : 'current_non_binding_preview',
    'driftReasons':
        stale ? <String>['listing_availability_changed'] : <String>[],
    'quoteRevalidationRequired': false,
    'createdAt': '2026-10-01T08:00:00.000Z',
    'updatedAt': '2026-10-01T08:01:00.000Z',
    'revisionCreatedAt': '2026-10-01T08:01:00.000Z',
    'bindingStatus': 'non_binding',
    'reservationCreated': false,
    'bookingCreated': false,
    'contractCreated': false,
    'paymentCreated': false,
    'publicShelfCreated': false,
    'publicListingCreated': false,
    'automaticPublicationPerformed': false,
    'externalGenerativeAiUsed': false,
  };
}
