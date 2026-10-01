import 'dart:convert';

import 'package:crypto/crypto.dart';

const String missionInventoryResolutionDomainVersion = 'P5-A-2026-10-01.1';
const String missionInventoryPlannerCoreVersion = 'G4A-2026-08-21.1';
const String missionInventoryPlannerVersion = 'G4B-2026-08-21.1';

enum MissionInventoryApplicability { current, stale }

class MissionInventoryLocationSnapshot {
  const MissionInventoryLocationSnapshot({
    required this.sourceVersion,
    required this.radiusKm,
    required this.coordinateDigest,
  });

  final String sourceVersion;
  final int radiusKm;
  final String coordinateDigest;

  factory MissionInventoryLocationSnapshot.fromJson(Object? raw) {
    final value = _object(raw, 'mission_inventory_location_snapshot_invalid');
    _exactKeys(
      value,
      const <String>{
        'sourceType',
        'sourceVersion',
        'ownerConfirmed',
        'radiusKm',
        'coordinateDigest',
        'exactCoordinatesStored',
      },
      'mission_inventory_location_snapshot_invalid',
    );
    if (value['sourceType'] != 'owner_confirmed_search_origin' ||
        value['ownerConfirmed'] != true ||
        value['exactCoordinatesStored'] != false) {
      throw const FormatException(
        'mission_inventory_location_snapshot_invalid',
      );
    }
    return MissionInventoryLocationSnapshot(
      sourceVersion: _token(
        value['sourceVersion'],
        'mission_inventory_location_snapshot_invalid',
      ),
      radiusKm: _integer(
        value['radiusKm'],
        1,
        500,
        'mission_inventory_location_snapshot_invalid',
      ),
      coordinateDigest: _digest(
        value['coordinateDigest'],
        'mission_inventory_location_snapshot_invalid',
      ),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'sourceType': 'owner_confirmed_search_origin',
        'sourceVersion': sourceVersion,
        'ownerConfirmed': true,
        'radiusKm': radiusKm,
        'coordinateDigest': coordinateDigest,
        'exactCoordinatesStored': false,
      };
}

class MissionInventoryQuoteSnapshot {
  const MissionInventoryQuoteSnapshot({
    required this.quoteHash,
    required this.quotedAt,
    required this.availabilityRevision,
    required this.rentalSubtotalMinor,
    required this.platformFeeMinor,
    required this.totalMinor,
    required this.ownerPayoutMinor,
  });

  final String quoteHash;
  final DateTime quotedAt;
  final int availabilityRevision;
  final int rentalSubtotalMinor;
  final int platformFeeMinor;
  final int totalMinor;
  final int ownerPayoutMinor;

  factory MissionInventoryQuoteSnapshot.fromJson(Object? raw) {
    final value = _object(raw, 'mission_inventory_quote_invalid');
    _exactKeys(
      value,
      const <String>{
        'quoteHash',
        'quotedAt',
        'availabilityRevision',
        'currency',
        'rentalSubtotalMinor',
        'platformFeeMinor',
        'totalMinor',
        'ownerPayoutMinor',
        'preview',
        'persisted',
      },
      'mission_inventory_quote_invalid',
    );
    if (value['currency'] != 'EUR' ||
        value['preview'] != true ||
        value['persisted'] != false) {
      throw const FormatException('mission_inventory_quote_invalid');
    }
    return MissionInventoryQuoteSnapshot(
      quoteHash: _digest(value['quoteHash'], 'mission_inventory_quote_invalid'),
      quotedAt:
          _timestamp(value['quotedAt'], 'mission_inventory_quote_invalid'),
      availabilityRevision: _integer(
        value['availabilityRevision'],
        0,
        1 << 53,
        'mission_inventory_quote_invalid',
      ),
      rentalSubtotalMinor: _integer(
        value['rentalSubtotalMinor'],
        0,
        1 << 53,
        'mission_inventory_quote_invalid',
      ),
      platformFeeMinor: _integer(
        value['platformFeeMinor'],
        0,
        1 << 53,
        'mission_inventory_quote_invalid',
      ),
      totalMinor: _integer(
        value['totalMinor'],
        0,
        1 << 53,
        'mission_inventory_quote_invalid',
      ),
      ownerPayoutMinor: _integer(
        value['ownerPayoutMinor'],
        0,
        1 << 53,
        'mission_inventory_quote_invalid',
      ),
    );
  }
}

class MissionInventoryAssignment {
  const MissionInventoryAssignment({
    required this.listingId,
    required this.title,
    required this.categoryId,
    required this.subcategory,
    required this.condition,
    required this.city,
    required this.country,
    required this.distanceKm,
    required this.catalogRevision,
    required this.availabilityRevision,
    required this.quote,
  });

  final String listingId;
  final String title;
  final String categoryId;
  final String subcategory;
  final String condition;
  final String? city;
  final String? country;
  final double distanceKm;
  final int catalogRevision;
  final int availabilityRevision;
  final MissionInventoryQuoteSnapshot quote;

  factory MissionInventoryAssignment.fromJson(Object? raw) {
    final value = _object(raw, 'mission_inventory_assignment_invalid');
    _exactKeys(
      value,
      const <String>{
        'listingId',
        'title',
        'categoryId',
        'subcategory',
        'condition',
        'city',
        'country',
        'distanceKm',
        'catalogRevision',
        'availabilityRevision',
        'quote',
      },
      'mission_inventory_assignment_invalid',
    );
    final distance = value['distanceKm'];
    if (distance is! num ||
        !distance.toDouble().isFinite ||
        distance < 0 ||
        distance > 20040) {
      throw const FormatException('mission_inventory_assignment_invalid');
    }
    final quote = MissionInventoryQuoteSnapshot.fromJson(value['quote']);
    final availabilityRevision = _integer(
      value['availabilityRevision'],
      0,
      1 << 53,
      'mission_inventory_assignment_invalid',
    );
    if (quote.availabilityRevision != availabilityRevision) {
      throw const FormatException('mission_inventory_assignment_invalid');
    }
    return MissionInventoryAssignment(
      listingId: _token(
        value['listingId'],
        'mission_inventory_assignment_invalid',
      ),
      title: _boundedText(
        value['title'],
        160,
        'mission_inventory_assignment_invalid',
      ),
      categoryId: _token(
        value['categoryId'],
        'mission_inventory_assignment_invalid',
      ),
      subcategory: _boundedText(
        value['subcategory'],
        160,
        'mission_inventory_assignment_invalid',
      ),
      condition: _boundedText(
        value['condition'],
        40,
        'mission_inventory_assignment_invalid',
      ),
      city: _nullableText(
        value['city'],
        120,
        'mission_inventory_assignment_invalid',
      ),
      country: _nullableText(
        value['country'],
        120,
        'mission_inventory_assignment_invalid',
      ),
      distanceKm: distance.toDouble(),
      catalogRevision: _integer(
        value['catalogRevision'],
        0,
        1 << 53,
        'mission_inventory_assignment_invalid',
      ),
      availabilityRevision: availabilityRevision,
      quote: quote,
    );
  }
}

class MissionInventorySlot {
  const MissionInventorySlot({
    required this.slotKey,
    required this.needKey,
    required this.necessity,
    required this.ordinal,
    required this.status,
    required this.gapReason,
    required this.assignment,
  });

  final String slotKey;
  final String needKey;
  final String necessity;
  final int ordinal;
  final String status;
  final String? gapReason;
  final MissionInventoryAssignment? assignment;

  factory MissionInventorySlot.fromJson(Object? raw) {
    final value = _object(raw, 'mission_inventory_slot_invalid');
    _exactKeys(
      value,
      const <String>{
        'slotKey',
        'needKey',
        'necessity',
        'ordinal',
        'status',
        'gapReason',
        'assignment',
      },
      'mission_inventory_slot_invalid',
    );
    final necessity = value['necessity'];
    final status = value['status'];
    if (!const <String>{'required', 'optional'}.contains(necessity) ||
        !const <String>{'assigned', 'gap'}.contains(status)) {
      throw const FormatException('mission_inventory_slot_invalid');
    }
    final assignment = value['assignment'] == null
        ? null
        : MissionInventoryAssignment.fromJson(value['assignment']);
    final gapReason = value['gapReason'];
    if ((status == 'assigned' && (assignment == null || gapReason != null)) ||
        (status == 'gap' &&
            (assignment != null ||
                !const <String>{
                  'unsupported_need_key',
                  'no_current_unique_candidate',
                }.contains(gapReason)))) {
      throw const FormatException('mission_inventory_slot_invalid');
    }
    return MissionInventorySlot(
      slotKey: _token(value['slotKey'], 'mission_inventory_slot_invalid'),
      needKey: _token(value['needKey'], 'mission_inventory_slot_invalid'),
      necessity: necessity as String,
      ordinal: _integer(
        value['ordinal'],
        1,
        100,
        'mission_inventory_slot_invalid',
      ),
      status: status as String,
      gapReason: gapReason as String?,
      assignment: assignment,
    );
  }
}

class MissionInventoryCoverage {
  const MissionInventoryCoverage({
    required this.needKey,
    required this.necessity,
    required this.requestedQuantity,
    required this.coveredQuantity,
    required this.gapQuantity,
    required this.supported,
    required this.inspectedCount,
    required this.rejectedByServerTruth,
    required this.searchLimited,
  });

  final String needKey;
  final String necessity;
  final int requestedQuantity;
  final int coveredQuantity;
  final int gapQuantity;
  final bool supported;
  final int inspectedCount;
  final int rejectedByServerTruth;
  final bool searchLimited;

  factory MissionInventoryCoverage.fromJson(Object? raw) {
    final value = _object(raw, 'mission_inventory_coverage_invalid');
    _exactKeys(
      value,
      const <String>{
        'needKey',
        'necessity',
        'requestedQuantity',
        'coveredQuantity',
        'gapQuantity',
        'supported',
        'inspectedCount',
        'rejectedByServerTruth',
        'searchLimited',
      },
      'mission_inventory_coverage_invalid',
    );
    if (!const <String>{'required', 'optional'}.contains(value['necessity']) ||
        value['supported'] is! bool ||
        value['searchLimited'] is! bool) {
      throw const FormatException('mission_inventory_coverage_invalid');
    }
    final requested = _integer(
      value['requestedQuantity'],
      1,
      100,
      'mission_inventory_coverage_invalid',
    );
    final covered = _integer(
      value['coveredQuantity'],
      0,
      requested,
      'mission_inventory_coverage_invalid',
    );
    final gap = _integer(
      value['gapQuantity'],
      0,
      requested,
      'mission_inventory_coverage_invalid',
    );
    if (covered + gap != requested) {
      throw const FormatException('mission_inventory_coverage_invalid');
    }
    return MissionInventoryCoverage(
      needKey: _token(value['needKey'], 'mission_inventory_coverage_invalid'),
      necessity: value['necessity'] as String,
      requestedQuantity: requested,
      coveredQuantity: covered,
      gapQuantity: gap,
      supported: value['supported'] as bool,
      inspectedCount: _integer(
        value['inspectedCount'],
        0,
        25,
        'mission_inventory_coverage_invalid',
      ),
      rejectedByServerTruth: _integer(
        value['rejectedByServerTruth'],
        0,
        25,
        'mission_inventory_coverage_invalid',
      ),
      searchLimited: value['searchLimited'] as bool,
    );
  }
}

class MissionInventorySnapshot {
  const MissionInventorySnapshot({
    required this.missionNeedId,
    required this.missionRevision,
    required this.missionPayloadDigest,
    required this.startDate,
    required this.endDate,
    required this.locationSnapshot,
    required this.coverage,
    required this.slots,
    required this.requiredCoverageComplete,
    required this.searchLimited,
  });

  final String missionNeedId;
  final int missionRevision;
  final String missionPayloadDigest;
  final DateTime startDate;
  final DateTime endDate;
  final MissionInventoryLocationSnapshot locationSnapshot;
  final List<MissionInventoryCoverage> coverage;
  final List<MissionInventorySlot> slots;
  final bool requiredCoverageComplete;
  final bool searchLimited;

  factory MissionInventorySnapshot.fromJson(Object? raw) {
    final value = _object(raw, 'mission_inventory_snapshot_invalid');
    _exactKeys(
      value,
      const <String>{
        'domainVersion',
        'plannerCoreVersion',
        'missionNeedId',
        'missionRevision',
        'missionPayloadDigest',
        'startDate',
        'endDate',
        'locationSnapshot',
        'locationSnapshotDigest',
        'candidatePolicy',
        'coverage',
        'slots',
        'requiredCoverageComplete',
        'searchLimited',
        'status',
        'quotePersisted',
        'revalidationRequiredBeforeRequest',
        'bindingStatus',
        'reservationCreated',
        'bookingCreated',
        'contractCreated',
        'paymentCreated',
        'publicShelfCreated',
        'publicListingCreated',
        'automaticPublicationPerformed',
        'externalGenerativeAiUsed',
      },
      'mission_inventory_snapshot_invalid',
    );
    if (value['domainVersion'] != missionInventoryResolutionDomainVersion ||
        value['plannerCoreVersion'] != missionInventoryPlannerCoreVersion ||
        value['status'] != 'resolved_at_request_time' ||
        value['quotePersisted'] != false ||
        value['revalidationRequiredBeforeRequest'] != true ||
        value['bindingStatus'] != 'non_binding') {
      throw const FormatException('mission_inventory_snapshot_invalid');
    }
    _falseEffects(value, 'mission_inventory_snapshot_invalid');
    final policy = _object(
      value['candidatePolicy'],
      'mission_inventory_candidate_policy_invalid',
    );
    _exactKeys(
      policy,
      const <String>{
        'candidateLimitPerNeed',
        'ordering',
        'completeness',
        'pilotRegionUsedAsDistance',
      },
      'mission_inventory_candidate_policy_invalid',
    );
    if (policy['candidateLimitPerNeed'] != 24 ||
        policy['ordering'] != 'distance_then_listing_id' ||
        policy['completeness'] != 'bounded_not_complete_or_optimal' ||
        policy['pilotRegionUsedAsDistance'] != false) {
      throw const FormatException('mission_inventory_candidate_policy_invalid');
    }
    final location = MissionInventoryLocationSnapshot.fromJson(
      value['locationSnapshot'],
    );
    if (_digest(
          value['locationSnapshotDigest'],
          'mission_inventory_snapshot_invalid',
        ) !=
        missionInventoryDigest(location.toJson())) {
      throw const FormatException('mission_inventory_snapshot_invalid');
    }
    final coverage = _strictList(
      value['coverage'],
      MissionInventoryCoverage.fromJson,
      'mission_inventory_coverage_invalid',
    );
    final slots = _strictList(
      value['slots'],
      MissionInventorySlot.fromJson,
      'mission_inventory_slots_invalid',
    );
    if (coverage.isEmpty ||
        slots.isEmpty ||
        coverage.map((entry) => entry.needKey).toSet().length !=
            coverage.length ||
        slots.map((entry) => entry.slotKey).toSet().length != slots.length ||
        slots
                .where((entry) => entry.assignment != null)
                .map((entry) => entry.assignment!.listingId)
                .toSet()
                .length !=
            slots.where((entry) => entry.assignment != null).length) {
      throw const FormatException('mission_inventory_snapshot_invalid');
    }
    for (final entry in coverage) {
      final matching = slots.where(
        (slot) =>
            slot.needKey == entry.needKey && slot.necessity == entry.necessity,
      );
      if (matching.length != entry.requestedQuantity ||
          matching.where((slot) => slot.assignment != null).length !=
              entry.coveredQuantity) {
        throw const FormatException('mission_inventory_snapshot_invalid');
      }
    }
    final requiredComplete = value['requiredCoverageComplete'];
    final searchLimited = value['searchLimited'];
    if (requiredComplete is! bool ||
        searchLimited is! bool ||
        requiredComplete !=
            coverage
                .where((entry) => entry.necessity == 'required')
                .every((entry) => entry.gapQuantity == 0) ||
        searchLimited != coverage.any((entry) => entry.searchLimited)) {
      throw const FormatException('mission_inventory_snapshot_invalid');
    }
    final start =
        _date(value['startDate'], 'mission_inventory_snapshot_invalid');
    final end = _date(value['endDate'], 'mission_inventory_snapshot_invalid');
    if (!end.isAfter(start) || end.difference(start).inDays > 365) {
      throw const FormatException('mission_inventory_snapshot_invalid');
    }
    return MissionInventorySnapshot(
      missionNeedId: _missionId(
        value['missionNeedId'],
        'mission_inventory_snapshot_invalid',
      ),
      missionRevision: _integer(
        value['missionRevision'],
        1,
        1 << 53,
        'mission_inventory_snapshot_invalid',
      ),
      missionPayloadDigest: _digest(
        value['missionPayloadDigest'],
        'mission_inventory_snapshot_invalid',
      ),
      startDate: start,
      endDate: end,
      locationSnapshot: location,
      coverage: coverage,
      slots: slots,
      requiredCoverageComplete: requiredComplete,
      searchLimited: searchLimited,
    );
  }
}

class MissionInventoryResolution {
  const MissionInventoryResolution({
    required this.resolutionId,
    required this.missionNeedId,
    required this.missionRevision,
    required this.missionPayloadDigest,
    required this.revision,
    required this.startDate,
    required this.endDate,
    required this.locationSnapshot,
    required this.storedResolution,
    required this.currentApplicability,
    required this.driftReasons,
    required this.createdAt,
    required this.updatedAt,
    required this.revisionCreatedAt,
  });

  final String resolutionId;
  final String missionNeedId;
  final int missionRevision;
  final String missionPayloadDigest;
  final int revision;
  final DateTime startDate;
  final DateTime endDate;
  final MissionInventoryLocationSnapshot locationSnapshot;
  final MissionInventorySnapshot storedResolution;
  final MissionInventoryApplicability currentApplicability;
  final List<String> driftReasons;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime revisionCreatedAt;

  factory MissionInventoryResolution.fromJson(Object? raw) {
    final value = _object(raw, 'mission_inventory_resolution_invalid');
    _exactKeys(
      value,
      const <String>{
        'resolutionId',
        'domainVersion',
        'plannerCoreVersion',
        'plannerInventoryVersion',
        'missionNeedId',
        'missionRevision',
        'missionPayloadDigest',
        'revision',
        'startDate',
        'endDate',
        'locationSnapshot',
        'locationSnapshotDigest',
        'storedResolution',
        'currentApplicability',
        'currentStatus',
        'driftReasons',
        'quoteRevalidationRequired',
        'createdAt',
        'updatedAt',
        'revisionCreatedAt',
        'bindingStatus',
        'reservationCreated',
        'bookingCreated',
        'contractCreated',
        'paymentCreated',
        'publicShelfCreated',
        'publicListingCreated',
        'automaticPublicationPerformed',
        'externalGenerativeAiUsed',
      },
      'mission_inventory_resolution_invalid',
    );
    if (value['domainVersion'] != missionInventoryResolutionDomainVersion ||
        value['plannerCoreVersion'] != missionInventoryPlannerCoreVersion ||
        value['plannerInventoryVersion'] != missionInventoryPlannerVersion ||
        value['quoteRevalidationRequired'] != false ||
        value['bindingStatus'] != 'non_binding') {
      throw const FormatException('mission_inventory_resolution_invalid');
    }
    _falseEffects(value, 'mission_inventory_resolution_invalid');
    final applicability = switch (value['currentApplicability']) {
      'current_snapshot_inputs' => MissionInventoryApplicability.current,
      'stale' => MissionInventoryApplicability.stale,
      _ => throw const FormatException('mission_inventory_resolution_invalid'),
    };
    final rawReasons = value['driftReasons'];
    if (rawReasons is! List ||
        rawReasons.any(
          (reason) => reason is! String || !_knownDriftReasons.contains(reason),
        ) ||
        rawReasons.toSet().length != rawReasons.length ||
        (applicability == MissionInventoryApplicability.current &&
            (value['currentStatus'] != 'current_non_binding_preview' ||
                rawReasons.isNotEmpty)) ||
        (applicability == MissionInventoryApplicability.stale &&
            (value['currentStatus'] != 'unknown' || rawReasons.isEmpty))) {
      throw const FormatException('mission_inventory_resolution_invalid');
    }
    final location = MissionInventoryLocationSnapshot.fromJson(
      value['locationSnapshot'],
    );
    final locationDigest = _digest(
      value['locationSnapshotDigest'],
      'mission_inventory_resolution_invalid',
    );
    if (locationDigest != missionInventoryDigest(location.toJson())) {
      throw const FormatException('mission_inventory_resolution_invalid');
    }
    final snapshot = MissionInventorySnapshot.fromJson(
      value['storedResolution'],
    );
    final missionId = _missionId(
      value['missionNeedId'],
      'mission_inventory_resolution_invalid',
    );
    final missionRevision = _integer(
      value['missionRevision'],
      1,
      1 << 53,
      'mission_inventory_resolution_invalid',
    );
    final missionDigest = _digest(
      value['missionPayloadDigest'],
      'mission_inventory_resolution_invalid',
    );
    final start =
        _date(value['startDate'], 'mission_inventory_resolution_invalid');
    final end = _date(value['endDate'], 'mission_inventory_resolution_invalid');
    if (!end.isAfter(start) ||
        end.difference(start).inDays > 365 ||
        snapshot.missionNeedId != missionId ||
        snapshot.missionRevision != missionRevision ||
        snapshot.missionPayloadDigest != missionDigest ||
        snapshot.startDate != start ||
        snapshot.endDate != end ||
        snapshot.locationSnapshot.toJson().toString() !=
            location.toJson().toString()) {
      throw const FormatException('mission_inventory_resolution_invalid');
    }
    return MissionInventoryResolution(
      resolutionId: _resolutionId(
        value['resolutionId'],
        'mission_inventory_resolution_invalid',
      ),
      missionNeedId: missionId,
      missionRevision: missionRevision,
      missionPayloadDigest: missionDigest,
      revision: _integer(
        value['revision'],
        1,
        1 << 53,
        'mission_inventory_resolution_invalid',
      ),
      startDate: start,
      endDate: end,
      locationSnapshot: location,
      storedResolution: snapshot,
      currentApplicability: applicability,
      driftReasons: rawReasons.cast<String>().toList(growable: false),
      createdAt: _timestamp(
        value['createdAt'],
        'mission_inventory_resolution_invalid',
      ),
      updatedAt: _timestamp(
        value['updatedAt'],
        'mission_inventory_resolution_invalid',
      ),
      revisionCreatedAt: _timestamp(
        value['revisionCreatedAt'],
        'mission_inventory_resolution_invalid',
      ),
    );
  }
}

class MissionInventoryDraft {
  const MissionInventoryDraft({
    required this.missionRevision,
    required this.missionPayloadDigest,
    required this.startDate,
    required this.endDate,
    required this.latitudeE5,
    required this.longitudeE5,
    required this.radiusKm,
    required this.locationSourceVersion,
    this.expectedRevision,
  });

  final int missionRevision;
  final String missionPayloadDigest;
  final DateTime startDate;
  final DateTime endDate;
  final int latitudeE5;
  final int longitudeE5;
  final int radiusKm;
  final String locationSourceVersion;
  final int? expectedRevision;

  Map<String, dynamic> toJson() => <String, dynamic>{
        if (expectedRevision != null) 'expectedRevision': expectedRevision,
        'missionRevision': missionRevision,
        'missionPayloadDigest': missionPayloadDigest,
        'startDate': _dateText(startDate),
        'endDate': _dateText(endDate),
        'location': <String, dynamic>{
          'latitudeE5': latitudeE5,
          'longitudeE5': longitudeE5,
          'radiusKm': radiusKm,
          'sourceVersion': locationSourceVersion,
          'ownerConfirmed': true,
        },
      };
}

String missionInventoryDigest(Object? value) =>
    sha256.convert(utf8.encode(jsonEncode(_stable(value)))).toString();

const Set<String> _knownDriftReasons = <String>{
  'listing_missing',
  'listing_catalog_changed',
  'quote_binding_inputs_changed',
  'listing_availability_changed',
  'listing_location_changed',
  'listing_no_longer_candidate',
  'quote_snapshot_changed',
  'listing_unavailable_or_quote_rejected',
  'mission_snapshot_changed',
};

const Set<String> _effectKeys = <String>{
  'reservationCreated',
  'bookingCreated',
  'contractCreated',
  'paymentCreated',
  'publicShelfCreated',
  'publicListingCreated',
  'automaticPublicationPerformed',
  'externalGenerativeAiUsed',
};

void _falseEffects(Map<String, dynamic> value, String code) {
  if (_effectKeys.any((key) => value[key] != false)) {
    throw FormatException(code);
  }
}

Map<String, dynamic> _object(Object? raw, String code) {
  if (raw is! Map) throw FormatException(code);
  return Map<String, dynamic>.from(raw);
}

void _exactKeys(Map<String, dynamic> value, Set<String> expected, String code) {
  if (value.keys.toSet().length != expected.length ||
      !value.keys.toSet().containsAll(expected)) {
    throw FormatException(code);
  }
}

String _boundedText(Object? raw, int maximum, String code) {
  final value = raw is String ? raw.trim() : '';
  if (value.isEmpty || value.length > maximum) throw FormatException(code);
  return value;
}

String? _nullableText(Object? raw, int maximum, String code) {
  if (raw == null) return null;
  return _boundedText(raw, maximum, code);
}

String _token(Object? raw, String code) {
  final value = _boundedText(raw, 160, code);
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{1,159}$').hasMatch(value)) {
    throw FormatException(code);
  }
  return value;
}

String _digest(Object? raw, String code) {
  final value = raw is String ? raw : '';
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(value)) throw FormatException(code);
  return value;
}

String _missionId(Object? raw, String code) {
  final value = raw is String ? raw : '';
  if (!RegExp(
    r'^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  ).hasMatch(value)) {
    throw FormatException(code);
  }
  return value;
}

String _resolutionId(Object? raw, String code) {
  final value = raw is String ? raw : '';
  if (!RegExp(
    r'^mission_inventory_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  ).hasMatch(value)) {
    throw FormatException(code);
  }
  return value;
}

int _integer(Object? raw, int minimum, int maximum, String code) {
  if (raw is! int || raw < minimum || raw > maximum) {
    throw FormatException(code);
  }
  return raw;
}

DateTime _date(Object? raw, String code) {
  if (raw is! String || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(raw)) {
    throw FormatException(code);
  }
  final value = DateTime.tryParse('${raw}T00:00:00.000Z');
  if (value == null || _dateText(value) != raw) throw FormatException(code);
  return value;
}

DateTime _timestamp(Object? raw, String code) {
  if (raw is! String) throw FormatException(code);
  final value = DateTime.tryParse(raw);
  if (value == null || !value.isUtc) throw FormatException(code);
  return value;
}

String _dateText(DateTime value) =>
    '${value.toUtc().year.toString().padLeft(4, '0')}-'
    '${value.toUtc().month.toString().padLeft(2, '0')}-'
    '${value.toUtc().day.toString().padLeft(2, '0')}';

List<T> _strictList<T>(
  Object? raw,
  T Function(Object?) parser,
  String code,
) {
  if (raw is! List) throw FormatException(code);
  return raw.map(parser).toList(growable: false);
}

Object? _stable(Object? value) {
  if (value is List) return value.map(_stable).toList(growable: false);
  if (value is Map) {
    final map = Map<String, dynamic>.from(value);
    final keys = map.keys.toList()..sort();
    return <String, dynamic>{for (final key in keys) key: _stable(map[key])};
  }
  return value;
}
