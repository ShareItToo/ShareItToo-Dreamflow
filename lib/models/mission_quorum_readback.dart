const String missionQuorumReadbackVersion = 'P6-C4-2026-10-05.1';

enum MissionQuorumReadbackStatus {
  incomplete,
  readbackRequired,
  needsClarification,
}

enum MissionQuorumSlotState {
  covered,
  open,
  staleOrUnknown,
  clarificationRequired,
}

class MissionQuorumSlotReadback {
  const MissionQuorumSlotReadback({
    required this.slotKey,
    required this.needKey,
    required this.necessity,
    required this.ordinal,
    required this.state,
  });

  final String slotKey;
  final String needKey;
  final String necessity;
  final int ordinal;
  final MissionQuorumSlotState state;

  factory MissionQuorumSlotReadback.fromJson(Object? raw) {
    final value = _object(raw, 'mission_quorum_slot_invalid');
    _exactKeys(
        value,
        const <String>{
          'slotKey',
          'needKey',
          'necessity',
          'ordinal',
          'state',
        },
        'mission_quorum_slot_invalid');
    final slotKey = value['slotKey'];
    final needKey = value['needKey'];
    final necessity = value['necessity'];
    final ordinal = value['ordinal'];
    if (slotKey is! String ||
        !RegExp(r'^(required|optional):[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}:[1-9][0-9]{0,2}$')
            .hasMatch(slotKey) ||
        needKey is! String ||
        !RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$').hasMatch(needKey) ||
        necessity is! String ||
        !const <String>{'required', 'optional'}.contains(necessity) ||
        !slotKey.startsWith('$necessity:') ||
        ordinal is! int ||
        ordinal < 1 ||
        ordinal > 100 ||
        !slotKey.endsWith(':$ordinal')) {
      throw const FormatException('mission_quorum_slot_invalid');
    }
    final state = switch (value['state']) {
      'covered' => MissionQuorumSlotState.covered,
      'open' => MissionQuorumSlotState.open,
      'stale_or_unknown' => MissionQuorumSlotState.staleOrUnknown,
      'clarification_required' => MissionQuorumSlotState.clarificationRequired,
      _ => throw const FormatException('mission_quorum_slot_invalid'),
    };
    return MissionQuorumSlotReadback(
      slotKey: slotKey,
      needKey: needKey,
      necessity: necessity,
      ordinal: ordinal,
      state: state,
    );
  }
}

class MissionQuorumReadback {
  const MissionQuorumReadback({
    required this.version,
    required this.missionNeedId,
    required this.resolutionId,
    required this.missionRevision,
    required this.resolutionRevision,
    required this.missionPayloadDigest,
    required this.resolutionDigest,
    required this.observedAt,
    required this.status,
    required this.bindingStatus,
    required this.persisted,
    required this.paymentStatus,
    required this.components,
  });

  final String version;
  final String missionNeedId;
  final String resolutionId;
  final int missionRevision;
  final int resolutionRevision;
  final String missionPayloadDigest;
  final String resolutionDigest;
  final DateTime observedAt;
  final MissionQuorumReadbackStatus status;
  final String bindingStatus;
  final bool persisted;
  final String paymentStatus;
  final List<MissionQuorumSlotReadback> components;

  factory MissionQuorumReadback.fromJson(Object? raw) {
    final value = _object(raw, 'mission_quorum_readback_invalid');
    _exactKeys(
        value,
        const <String>{
          'version',
          'missionNeedId',
          'resolutionId',
          'missionRevision',
          'resolutionRevision',
          'missionPayloadDigest',
          'resolutionDigest',
          'observedAt',
          'status',
          'bindingStatus',
          'persisted',
          'paymentStatus',
          'components',
        },
        'mission_quorum_readback_invalid');
    if (value['version'] != missionQuorumReadbackVersion ||
        value['bindingStatus'] != 'non_binding' ||
        value['persisted'] != false ||
        value['paymentStatus'] != 'not_determined') {
      throw const FormatException('mission_quorum_readback_invalid');
    }
    final missionId = value['missionNeedId'];
    final resolutionId = value['resolutionId'];
    final missionRevision = value['missionRevision'];
    final resolutionRevision = value['resolutionRevision'];
    final missionDigest = value['missionPayloadDigest'];
    final resolutionDigest = value['resolutionDigest'];
    if (missionId is! String ||
        !_missionId.hasMatch(missionId) ||
        resolutionId is! String ||
        !_resolutionId.hasMatch(resolutionId) ||
        missionRevision is! int ||
        missionRevision < 1 ||
        resolutionRevision is! int ||
        resolutionRevision < 1 ||
        missionDigest is! String ||
        !_digest.hasMatch(missionDigest) ||
        resolutionDigest is! String ||
        !_digest.hasMatch(resolutionDigest) ||
        missionRevision > 2147483647 ||
        resolutionRevision > 2147483647) {
      throw const FormatException('mission_quorum_readback_invalid');
    }
    final observedAt = _timestamp(value['observedAt']);
    final status = switch (value['status']) {
      'incomplete' => MissionQuorumReadbackStatus.incomplete,
      'readback_required' => MissionQuorumReadbackStatus.readbackRequired,
      'needs_clarification' => MissionQuorumReadbackStatus.needsClarification,
      _ => throw const FormatException('mission_quorum_readback_invalid'),
    };
    final rawComponents = value['components'];
    if (rawComponents is! List || rawComponents.isEmpty) {
      throw const FormatException('mission_quorum_readback_invalid');
    }
    final components = rawComponents
        .map(MissionQuorumSlotReadback.fromJson)
        .toList(growable: false);
    final slotKeys = components.map((entry) => entry.slotKey).toSet();
    if (slotKeys.length != components.length ||
        components.any((entry) => entry.needKey.isEmpty)) {
      throw const FormatException('mission_quorum_readback_invalid');
    }
    return MissionQuorumReadback(
      version: missionQuorumReadbackVersion,
      missionNeedId: missionId,
      resolutionId: resolutionId,
      missionRevision: missionRevision,
      resolutionRevision: resolutionRevision,
      missionPayloadDigest: missionDigest,
      resolutionDigest: resolutionDigest,
      observedAt: observedAt,
      status: status,
      bindingStatus: 'non_binding',
      persisted: false,
      paymentStatus: 'not_determined',
      components: components,
    );
  }
}

final RegExp _missionId = RegExp(
  r'^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);
final RegExp _resolutionId = RegExp(
  r'^mission_inventory_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);
final RegExp _digest = RegExp(r'^[0-9a-f]{64}$');

Map<String, dynamic> _object(Object? raw, String code) {
  if (raw is! Map) throw FormatException(code);
  return Map<String, dynamic>.from(raw);
}

void _exactKeys(Map<String, dynamic> value, Set<String> expected, String code) {
  if (value.length != expected.length ||
      !value.keys.every((key) => expected.contains(key))) {
    throw FormatException(code);
  }
}

DateTime _timestamp(Object? raw) {
  if (raw is! String) {
    throw const FormatException('mission_quorum_timestamp_invalid');
  }
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$').hasMatch(raw)) {
    throw const FormatException('mission_quorum_timestamp_invalid');
  }
  final value = DateTime.tryParse(raw);
  if (value == null || !value.isUtc || value.toIso8601String() != raw) {
    throw const FormatException('mission_quorum_timestamp_invalid');
  }
  return value.toUtc();
}
