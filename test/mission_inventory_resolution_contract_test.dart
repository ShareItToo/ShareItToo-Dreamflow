import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_inventory_resolution.dart';

import 'support/mission_inventory_resolution_builders.dart';

void main() {
  test('strict P5-A model accepts honest current and stale server truth', () {
    final current = MissionInventoryResolution.fromJson(
      testMissionInventoryResolutionJson(),
    );
    expect(current.currentApplicability, MissionInventoryApplicability.current);
    expect(current.storedResolution.coverage, hasLength(2));
    expect(current.storedResolution.slots, hasLength(3));
    expect(current.storedResolution.searchLimited, isTrue);
    expect(current.storedResolution.requiredCoverageComplete, isFalse);

    final stale = MissionInventoryResolution.fromJson(
      testMissionInventoryResolutionJson(stale: true),
    );
    expect(stale.currentApplicability, MissionInventoryApplicability.stale);
    expect(stale.driftReasons, <String>['listing_availability_changed']);
    expect(jsonEncode(stale.toString()).contains('latitudeE5'), isFalse);
  });

  test('strict model rejects effects, private keys and inconsistent slots', () {
    final effect = testMissionInventoryResolutionJson()
      ..['bookingCreated'] = true;
    expect(
      () => MissionInventoryResolution.fromJson(effect),
      throwsFormatException,
    );

    final privateKey = testMissionInventoryResolutionJson();
    final snapshot = privateKey['storedResolution'] as Map<String, dynamic>;
    final slots = snapshot['slots'] as List<Map<String, dynamic>>;
    final assignment = slots.first['assignment'] as Map<String, dynamic>;
    assignment['handoverLocationKey'] = 'd' * 64;
    expect(
      () => MissionInventoryResolution.fromJson(privateKey),
      throwsFormatException,
    );

    final inconsistent = testMissionInventoryResolutionJson();
    final inconsistentSnapshot =
        inconsistent['storedResolution'] as Map<String, dynamic>;
    final coverage =
        inconsistentSnapshot['coverage'] as List<Map<String, dynamic>>;
    coverage.first['coveredQuantity'] = 2;
    coverage.first['gapQuantity'] = 0;
    expect(
      () => MissionInventoryResolution.fromJson(inconsistent),
      throwsFormatException,
    );
  });

  test('strict model rejects equal, reversed and overlong rental dates', () {
    Map<String, dynamic> withDates(String start, String end) {
      final value = testMissionInventoryResolutionJson();
      value['startDate'] = start;
      value['endDate'] = end;
      final snapshot = value['storedResolution'] as Map<String, dynamic>;
      snapshot['startDate'] = start;
      snapshot['endDate'] = end;
      return value;
    }

    for (final value in <Map<String, dynamic>>[
      withDates('2026-11-10', '2026-11-10'),
      withDates('2026-11-11', '2026-11-10'),
      withDates('2026-01-01', '2027-01-02'),
    ]) {
      expect(
        () => MissionInventoryResolution.fromJson(value),
        throwsFormatException,
      );
    }
  });

  test('request contains exact ephemeral coordinates but no display label', () {
    final draft = MissionInventoryDraft(
      missionRevision: 1,
      missionPayloadDigest: testMissionInventoryDigest,
      startDate: DateTime.utc(2026, 11, 10),
      endDate: DateTime.utc(2026, 11, 12),
      latitudeE5: 4914000,
      longitudeE5: 922000,
      radiusKm: 25,
      locationSourceVersion: 'owner-maps-selection-test0001',
    );
    final json = draft.toJson();
    expect(json.keys, <String>{
      'missionRevision',
      'missionPayloadDigest',
      'startDate',
      'endDate',
      'location',
    });
    expect((json['location'] as Map)['ownerConfirmed'], isTrue);
    expect(jsonEncode(json).contains('formattedAddress'), isFalse);
  });
}
