const String missionFitCheckDomainVersion = 'P4-A-2026-10-01.1';
const String plantContainerFitDefinitionId =
    'plant_container_dimensional_fit_v1';
const String plantContainerFitDefinitionVersion =
    'P4-A-PLANT-CONTAINER-DIMENSIONAL-2026-10-01.1';
const String missionFitPlannerCoreVersion = 'G4A-2026-08-21.1';
const String plantContainerNeedKey = 'plant_container_equipment';

enum MissionFitStatus { fit, unfit, unknown }

enum MissionFitApplicability { current, stale }

class MissionFitMeasurement {
  const MissionFitMeasurement({
    required this.key,
    required this.value,
    required this.unit,
    this.provenance,
  });

  final String key;
  final int value;
  final String unit;
  final MissionFitProvenance? provenance;

  factory MissionFitMeasurement.fromJson(
    Object? raw, {
    required bool requiresProvenance,
    required Map<String, String> expectedUnits,
  }) {
    final value = _object(raw, 'mission_fit_measurement_invalid');
    _exactKeys(
      value,
      requiresProvenance
          ? const <String>{'key', 'value', 'unit', 'provenance'}
          : const <String>{'key', 'value', 'unit'},
      'mission_fit_measurement_invalid',
    );
    final key = _text(value['key'], 'mission_fit_measurement_invalid');
    final expectedUnit = expectedUnits[key];
    final measurement = value['value'];
    if (expectedUnit == null ||
        value['unit'] != expectedUnit ||
        measurement is! int ||
        measurement < 1 ||
        measurement > (expectedUnit == 'ml' ? 10000000 : 10000)) {
      throw const FormatException('mission_fit_measurement_invalid');
    }
    return MissionFitMeasurement(
      key: key,
      value: measurement,
      unit: expectedUnit,
      provenance: requiresProvenance
          ? MissionFitProvenance.fromJson(value['provenance'])
          : null,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'key': key,
        'value': value,
        'unit': unit,
        if (provenance != null) 'provenance': provenance!.toJson(),
      };
}

class MissionFitProvenance {
  const MissionFitProvenance({
    required this.sourceType,
    required this.sourceReference,
    required this.sourceVersion,
    required this.ownerConfirmed,
  });

  final String sourceType;
  final String sourceReference;
  final String sourceVersion;
  final bool ownerConfirmed;

  factory MissionFitProvenance.fromJson(Object? raw) {
    final value = _object(raw, 'mission_fit_provenance_invalid');
    _exactKeys(
        value,
        const <String>{
          'sourceType',
          'sourceReference',
          'sourceVersion',
          'ownerConfirmed',
        },
        'mission_fit_provenance_invalid');
    final sourceType = value['sourceType'];
    final sourceReference = _opaque(
      value['sourceReference'],
      'mission_fit_provenance_invalid',
    );
    final sourceVersion = _opaque(
      value['sourceVersion'],
      'mission_fit_provenance_invalid',
    );
    if (!const <String>{
          'owner_confirmed_measurement',
          'manufacturer_documentation',
        }.contains(sourceType) ||
        value['ownerConfirmed'] is! bool) {
      throw const FormatException('mission_fit_provenance_invalid');
    }
    return MissionFitProvenance(
      sourceType: sourceType as String,
      sourceReference: sourceReference,
      sourceVersion: sourceVersion,
      ownerConfirmed: value['ownerConfirmed'] as bool,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'sourceType': sourceType,
        'sourceReference': sourceReference,
        'sourceVersion': sourceVersion,
        'ownerConfirmed': ownerConfirmed,
      };
}

class MissionFitRequirement {
  const MissionFitRequirement({
    required this.ownerConfirmed,
    required this.facts,
  });

  final bool ownerConfirmed;
  final List<MissionFitMeasurement> facts;

  factory MissionFitRequirement.fromJson(Object? raw) {
    final value = _object(raw, 'mission_fit_requirement_invalid');
    _exactKeys(
      value,
      const <String>{'ownerConfirmed', 'facts'},
      'mission_fit_requirement_invalid',
    );
    final rawFacts = value['facts'];
    if (value['ownerConfirmed'] is! bool ||
        rawFacts is! List ||
        rawFacts.length > missionFitRequirementUnits.length) {
      throw const FormatException('mission_fit_requirement_invalid');
    }
    final facts = rawFacts
        .map(
          (fact) => MissionFitMeasurement.fromJson(
            fact,
            requiresProvenance: false,
            expectedUnits: missionFitRequirementUnits,
          ),
        )
        .toList(growable: false);
    _uniqueFacts(facts);
    return MissionFitRequirement(
      ownerConfirmed: value['ownerConfirmed'] as bool,
      facts: facts,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'ownerConfirmed': ownerConfirmed,
        'facts': facts.map((fact) => fact.toJson()).toList(growable: false),
      };
}

class MissionFitEvaluation {
  const MissionFitEvaluation({
    required this.status,
    required this.releaseBlocked,
    required this.reasonCodes,
    required this.orientation,
  });

  final MissionFitStatus status;
  final bool releaseBlocked;
  final List<String> reasonCodes;
  final String? orientation;

  factory MissionFitEvaluation.fromJson(Object? raw) {
    final value = _object(raw, 'mission_fit_evaluation_invalid');
    _exactKeys(
        value,
        const <String>{
          'status',
          'releaseBlocked',
          'reasonCodes',
          'orientation',
          'scope',
          'bindingStatus',
          'safetyGuarantee',
        },
        'mission_fit_evaluation_invalid');
    final status = switch (value['status']) {
      'fit' => MissionFitStatus.fit,
      'unfit' => MissionFitStatus.unfit,
      'unknown' => MissionFitStatus.unknown,
      _ => throw const FormatException('mission_fit_evaluation_invalid'),
    };
    final rawReasons = value['reasonCodes'];
    if (value['releaseBlocked'] is! bool ||
        rawReasons is! List ||
        rawReasons.any((reason) => reason is! String || reason.isEmpty) ||
        rawReasons.toSet().length != rawReasons.length ||
        value['scope'] != 'dimensional_capacity_only' ||
        value['bindingStatus'] != 'non_binding' ||
        value['safetyGuarantee'] != false) {
      throw const FormatException('mission_fit_evaluation_invalid');
    }
    final releaseBlocked = value['releaseBlocked'] as bool;
    final orientation = value['orientation'];
    if ((status == MissionFitStatus.fit &&
            (releaseBlocked ||
                rawReasons.isNotEmpty ||
                !const <String>{'direct', 'rotated'}.contains(orientation))) ||
        (status != MissionFitStatus.fit &&
            (!releaseBlocked || rawReasons.isEmpty || orientation != null))) {
      throw const FormatException('mission_fit_evaluation_invalid');
    }
    return MissionFitEvaluation(
      status: status,
      releaseBlocked: releaseBlocked,
      reasonCodes: rawReasons.cast<String>().toList(growable: false),
      orientation: orientation as String?,
    );
  }

  bool sameAs(MissionFitEvaluation other) =>
      status == other.status &&
      releaseBlocked == other.releaseBlocked &&
      orientation == other.orientation &&
      reasonCodes.length == other.reasonCodes.length &&
      List.generate(reasonCodes.length, (index) => index)
          .every((index) => reasonCodes[index] == other.reasonCodes[index]);
}

class MissionFitShelfSnapshot {
  const MissionFitShelfSnapshot({
    required this.shelfItemId,
    required this.domainVersion,
    required this.title,
    required this.categoryKey,
    required this.condition,
    required this.updatedAt,
  });

  final String shelfItemId;
  final String domainVersion;
  final String title;
  final String categoryKey;
  final String condition;
  final DateTime updatedAt;

  factory MissionFitShelfSnapshot.fromJson(Object? raw) {
    final value = _object(raw, 'mission_fit_shelf_snapshot_invalid');
    _exactKeys(
        value,
        const <String>{
          'shelfItemId',
          'domainVersion',
          'title',
          'categoryKey',
          'condition',
          'updatedAt',
        },
        'mission_fit_shelf_snapshot_invalid');
    if (value['domainVersion'] != 'P3-A-2026-10-01.1') {
      throw const FormatException('mission_fit_shelf_snapshot_invalid');
    }
    return MissionFitShelfSnapshot(
      shelfItemId: _id(
        value['shelfItemId'],
        r'^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        'mission_fit_shelf_snapshot_invalid',
      ),
      domainVersion: value['domainVersion'] as String,
      title: _boundedText(
        value['title'],
        160,
        'mission_fit_shelf_snapshot_invalid',
      ),
      categoryKey: _categoryKey(
        value['categoryKey'],
        'mission_fit_shelf_snapshot_invalid',
      ),
      condition: _condition(value['condition']),
      updatedAt: _date(value['updatedAt']),
    );
  }
}

class MissionFitCheckDraft {
  const MissionFitCheckDraft({
    required this.missionRevision,
    required this.missionPayloadDigest,
    required this.shelfItemId,
    required this.shelfUpdatedAt,
    required this.requirement,
    required this.itemFacts,
  });

  final int missionRevision;
  final String missionPayloadDigest;
  final String shelfItemId;
  final DateTime shelfUpdatedAt;
  final MissionFitRequirement requirement;
  final List<MissionFitMeasurement> itemFacts;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'definitionId': plantContainerFitDefinitionId,
        'missionRevision': missionRevision,
        'missionPayloadDigest': missionPayloadDigest,
        'shelfItemId': shelfItemId,
        'shelfUpdatedAt': shelfUpdatedAt.toUtc().toIso8601String(),
        'requirement': requirement.toJson(),
        'itemFacts':
            itemFacts.map((fact) => fact.toJson()).toList(growable: false),
      };
}

class MissionFitCheck {
  const MissionFitCheck({
    required this.fitCheckId,
    required this.missionNeedId,
    required this.missionRevision,
    required this.missionPayloadDigest,
    required this.shelfItemId,
    required this.shelfSnapshot,
    required this.revision,
    required this.requirement,
    required this.itemFacts,
    required this.storedEvaluation,
    required this.currentApplicability,
    required this.currentEvaluation,
    required this.payloadDigest,
    required this.createdAt,
    required this.updatedAt,
    required this.revisionCreatedAt,
  });

  final String fitCheckId;
  final String missionNeedId;
  final int missionRevision;
  final String missionPayloadDigest;
  final String shelfItemId;
  final MissionFitShelfSnapshot shelfSnapshot;
  final int revision;
  final MissionFitRequirement requirement;
  final List<MissionFitMeasurement> itemFacts;
  final MissionFitEvaluation storedEvaluation;
  final MissionFitApplicability currentApplicability;
  final MissionFitEvaluation currentEvaluation;
  final String payloadDigest;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime revisionCreatedAt;

  factory MissionFitCheck.fromJson(Object? raw) {
    final value = _object(raw, 'mission_fit_check_invalid');
    _exactKeys(
        value,
        const <String>{
          'fitCheckId',
          'domainVersion',
          'definitionId',
          'definitionVersion',
          'plannerCoreVersion',
          'needKey',
          'missionNeedId',
          'missionRevision',
          'missionPayloadDigest',
          'shelfItemId',
          'shelfSnapshot',
          'shelfSnapshotDigest',
          'revision',
          'requirement',
          'requirementDigest',
          'itemFacts',
          'itemFactsDigest',
          'storedEvaluation',
          'currentApplicability',
          'currentEvaluation',
          'payloadDigest',
          'createdAt',
          'updatedAt',
          'revisionCreatedAt',
          'bindingStatus',
          'safetyGuarantee',
          'reservationCreated',
          'bookingCreated',
          'contractCreated',
          'paymentCreated',
          'externalGenerativeAiUsed',
          'automaticPhotoAnalysisUsed',
          'publicListingCreated',
        },
        'mission_fit_check_invalid');
    if (value['domainVersion'] != missionFitCheckDomainVersion ||
        value['definitionId'] != plantContainerFitDefinitionId ||
        value['definitionVersion'] != plantContainerFitDefinitionVersion ||
        value['plannerCoreVersion'] != missionFitPlannerCoreVersion ||
        value['needKey'] != plantContainerNeedKey ||
        value['bindingStatus'] != 'non_binding' ||
        value['safetyGuarantee'] != false) {
      throw const FormatException('mission_fit_check_invalid');
    }
    for (final key in const <String>[
      'reservationCreated',
      'bookingCreated',
      'contractCreated',
      'paymentCreated',
      'externalGenerativeAiUsed',
      'automaticPhotoAnalysisUsed',
      'publicListingCreated',
    ]) {
      if (value[key] != false) {
        throw const FormatException('mission_fit_check_effect_invalid');
      }
    }
    final requirement = MissionFitRequirement.fromJson(value['requirement']);
    final rawItemFacts = value['itemFacts'];
    if (rawItemFacts is! List ||
        rawItemFacts.length > missionFitItemUnits.length) {
      throw const FormatException('mission_fit_check_invalid');
    }
    final itemFacts = rawItemFacts
        .map(
          (fact) => MissionFitMeasurement.fromJson(
            fact,
            requiresProvenance: true,
            expectedUnits: missionFitItemUnits,
          ),
        )
        .toList(growable: false);
    _uniqueFacts(itemFacts);
    final stored = MissionFitEvaluation.fromJson(value['storedEvaluation']);
    final current = MissionFitEvaluation.fromJson(value['currentEvaluation']);
    final applicability = switch (value['currentApplicability']) {
      'current' => MissionFitApplicability.current,
      'stale' => MissionFitApplicability.stale,
      _ => throw const FormatException('mission_fit_check_invalid'),
    };
    if ((applicability == MissionFitApplicability.current &&
            !current.sameAs(stored)) ||
        (applicability == MissionFitApplicability.stale &&
            (current.status != MissionFitStatus.unknown ||
                !current.releaseBlocked))) {
      throw const FormatException('mission_fit_check_invalid');
    }
    final shelf = MissionFitShelfSnapshot.fromJson(value['shelfSnapshot']);
    if (shelf.shelfItemId != value['shelfItemId']) {
      throw const FormatException('mission_fit_check_invalid');
    }
    for (final key in const <String>[
      'missionPayloadDigest',
      'shelfSnapshotDigest',
      'requirementDigest',
      'itemFactsDigest',
      'payloadDigest',
    ]) {
      _digest(value[key]);
    }
    return MissionFitCheck(
      fitCheckId: _id(
        value['fitCheckId'],
        r'^mission_fit_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        'mission_fit_check_invalid',
      ),
      missionNeedId: _id(
        value['missionNeedId'],
        r'^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        'mission_fit_check_invalid',
      ),
      missionRevision: _positiveRevision(value['missionRevision']),
      missionPayloadDigest: value['missionPayloadDigest'] as String,
      shelfItemId: value['shelfItemId'] as String,
      shelfSnapshot: shelf,
      revision: _positiveRevision(value['revision']),
      requirement: requirement,
      itemFacts: itemFacts,
      storedEvaluation: stored,
      currentApplicability: applicability,
      currentEvaluation: current,
      payloadDigest: value['payloadDigest'] as String,
      createdAt: _date(value['createdAt']),
      updatedAt: _date(value['updatedAt']),
      revisionCreatedAt: _date(value['revisionCreatedAt']),
    );
  }
}

const Map<String, String> missionFitRequirementUnits = <String, String>{
  'minimumUsableVolumeMl': 'ml',
  'maximumFootprintWidthMm': 'mm',
  'maximumFootprintDepthMm': 'mm',
  'maximumHeightMm': 'mm',
};

const Map<String, String> missionFitItemUnits = <String, String>{
  'usableVolumeMl': 'ml',
  'footprintWidthMm': 'mm',
  'footprintDepthMm': 'mm',
  'heightMm': 'mm',
};

void _uniqueFacts(List<MissionFitMeasurement> facts) {
  if (facts.map((fact) => fact.key).toSet().length != facts.length) {
    throw const FormatException('mission_fit_measurement_duplicate');
  }
}

Map<String, dynamic> _object(Object? raw, String code) {
  if (raw is! Map) throw FormatException(code);
  return Map<String, dynamic>.from(raw);
}

void _exactKeys(Map<String, dynamic> raw, Set<String> expected, String code) {
  if (raw.length != expected.length ||
      !raw.keys.toSet().containsAll(expected)) {
    throw FormatException(code);
  }
}

String _text(Object? raw, String code) {
  if (raw is! String || raw.trim().isEmpty) throw FormatException(code);
  return raw.trim();
}

String _boundedText(Object? raw, int maximum, String code) {
  final value = _text(raw, code);
  if (value.length > maximum) throw FormatException(code);
  return value;
}

String _opaque(Object? raw, String code) {
  final value = _boundedText(raw, 160, code);
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$').hasMatch(value)) {
    throw FormatException(code);
  }
  return value;
}

String _categoryKey(Object? raw, String code) {
  final value = _boundedText(raw, 80, code);
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$').hasMatch(value)) {
    throw FormatException(code);
  }
  return value;
}

String _condition(Object? raw) {
  if (raw is! String ||
      !const <String>{
        'new',
        'like-new',
        'good',
        'acceptable',
        'worn',
        'used',
      }.contains(raw)) {
    throw const FormatException('mission_fit_shelf_snapshot_invalid');
  }
  return raw;
}

String _id(Object? raw, String pattern, String code) {
  if (raw is! String || !RegExp(pattern).hasMatch(raw)) {
    throw FormatException(code);
  }
  return raw;
}

String _digest(Object? raw) {
  if (raw is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(raw)) {
    throw const FormatException('mission_fit_digest_invalid');
  }
  return raw;
}

int _positiveRevision(Object? raw) {
  if (raw is! int || raw < 1) {
    throw const FormatException('mission_fit_revision_invalid');
  }
  return raw;
}

DateTime _date(Object? raw) {
  final parsed = raw is String ? DateTime.tryParse(raw) : null;
  if (parsed == null || !parsed.isUtc) {
    throw const FormatException('mission_fit_date_invalid');
  }
  return parsed;
}
