import 'package:flutter/foundation.dart' show visibleForTesting;

import 'auth_service.dart';
import 'backend_http.dart';
import '../config/synthetic_clone_config.dart';

const List<String> syntheticClonePhotoSlots = <String>[
  'overview',
  'detail',
  'accessories',
  'critical',
];

const List<String> syntheticCloneSegments = <String>['pickup', 'return'];
const Set<String> syntheticCloneStatuses = <String>{
  'requested',
  'accepted',
  'active',
  'returned',
};

class SyntheticCloneBooking {
  final String id;
  final String listingId;
  final String ownerId;
  final String renterId;
  final String status;
  final Map<String, Set<String>> photoSlots;
  final Map<String, dynamic> confirmations;
  final Map<String, dynamic> marker;
  final Map<String, dynamic> listing;

  const SyntheticCloneBooking({
    required this.id,
    required this.listingId,
    required this.ownerId,
    required this.renterId,
    required this.status,
    required this.photoSlots,
    required this.confirmations,
    required this.marker,
    required this.listing,
  });

  bool hasCompletePhotos(String segment) =>
      photoSlots[segment]?.length == syntheticClonePhotoSlots.length &&
      syntheticClonePhotoSlots.every(photoSlots[segment]!.contains);

  bool get isComplete =>
      hasCompletePhotos('pickup') && hasCompletePhotos('return');

  factory SyntheticCloneBooking.fromJson(Map<String, dynamic> raw) {
    final id = _requiredText(raw['id'], 'booking_id');
    final listingId = _requiredText(raw['listingId'], 'listing_id');
    final ownerId = _requiredText(raw['ownerId'], 'owner_id');
    final renterId = _requiredText(raw['renterId'], 'renter_id');
    final status = _requiredText(raw['status'], 'status');
    if (!syntheticCloneStatuses.contains(status)) {
      throw const FormatException('synthetic_clone_status_invalid');
    }
    final marker = _requiredMap(raw['marker'], 'marker');
    _assertMarker(marker);
    final listing = _requiredMap(raw['listing'], 'listing');
    final photos = _requiredMap(raw['photos'], 'photos');
    final confirmations = raw['confirmations'] is Map
        ? Map<String, dynamic>.from(raw['confirmations'] as Map)
        : <String, dynamic>{};
    final pickupSlots = _parsePhotoSlots(photos['pickup']);
    final returnSlots = _parsePhotoSlots(photos['return']);
    if ((status == 'active' || status == 'returned') &&
        !_hasCompleteSlotSet(pickupSlots)) {
      throw const FormatException('synthetic_clone_pickup_photo_set_incomplete');
    }
    if (status == 'returned' && !_hasCompleteSlotSet(returnSlots)) {
      throw const FormatException('synthetic_clone_return_photo_set_incomplete');
    }
    return SyntheticCloneBooking(
      id: id,
      listingId: listingId,
      ownerId: ownerId,
      renterId: renterId,
      status: status,
      photoSlots: <String, Set<String>>{
        'pickup': pickupSlots,
        'return': returnSlots,
      },
      confirmations: confirmations,
      marker: marker,
      listing: listing,
    );
  }
}

class SyntheticCloneChallenge {
  final String id;
  final String bookingId;
  final String segment;
  final String presenterRole;
  final String qrPayload;
  final String fallbackCode;

  const SyntheticCloneChallenge({
    required this.id,
    required this.bookingId,
    required this.segment,
    required this.presenterRole,
    required this.qrPayload,
    required this.fallbackCode,
  });

  factory SyntheticCloneChallenge.fromJson(Map<String, dynamic> raw) {
    if (raw['version'] != 3) {
      throw const FormatException('synthetic_clone_qr_version_invalid');
    }
    final id = _requiredText(raw['id'], 'challenge_id');
    final bookingId = _requiredText(raw['bookingId'], 'challenge_booking_id');
    final segment = _requiredText(raw['segment'], 'challenge_segment');
    final presenterRole =
        _requiredText(raw['presenterRole'], 'challenge_presenter_role');
    final qrPayload = _requiredText(raw['qrPayload'], 'challenge_qr_payload');
    final fallbackCode =
        _requiredText(raw['fallbackCode'], 'challenge_fallback_code');
    if (!syntheticCloneSegments.contains(segment) ||
        !const {'owner', 'renter'}.contains(presenterRole) ||
        !RegExp(r'^\d{6}$').hasMatch(fallbackCode) ||
        !_isV3QrPayload(qrPayload, bookingId: bookingId, challengeId: id)) {
      throw const FormatException('synthetic_clone_challenge_invalid');
    }
    return SyntheticCloneChallenge(
      id: id,
      bookingId: bookingId,
      segment: segment,
      presenterRole: presenterRole,
      qrPayload: qrPayload,
      fallbackCode: fallbackCode,
    );
  }
}

class SyntheticCloneStatus {
  final String datasetId;
  final String runId;
  final String ownerId;
  final String renterId;
  final String listingId;
  final int bookings;
  final int auditEventCount;
  final bool cleaned;
  final Map<String, dynamic> sideEffects;

  const SyntheticCloneStatus({
    required this.datasetId,
    required this.runId,
    required this.ownerId,
    required this.renterId,
    required this.listingId,
    required this.bookings,
    required this.auditEventCount,
    required this.cleaned,
    required this.sideEffects,
  });

  factory SyntheticCloneStatus.fromJson(Map<String, dynamic> raw) {
    final marker = _requiredMap(raw['marker'], 'status_marker');
    _assertMarker(marker);
    final principals = _requiredMap(raw['principals'], 'principals');
    final sideEffects = _requiredMap(raw['sideEffects'], 'side_effects');
    const forbiddenEffects = <String>[
      'platformContract',
      'c2cContract',
      'payment',
      'payout',
      'stripe',
      'review',
      'ranking',
      'notification',
    ];
    if (forbiddenEffects.any((key) => sideEffects[key] != false)) {
      throw const FormatException('synthetic_clone_side_effects_invalid');
    }
    return SyntheticCloneStatus(
      datasetId: _requiredText(raw['datasetId'], 'dataset_id'),
      runId: _requiredText(raw['runId'], 'run_id'),
      ownerId: _requiredText(principals['ownerId'], 'owner_id'),
      renterId: _requiredText(principals['renterId'], 'renter_id'),
      listingId: _requiredText(principals['listingId'], 'listing_id'),
      bookings: _requiredInt(raw['bookings'], 'bookings'),
      auditEventCount: _requiredInt(raw['auditEventCount'], 'audit_event_count'),
      cleaned: raw['cleaned'] == true,
      sideEffects: sideEffects,
    );
  }
}

class SyntheticCloneBookingService {
  static void _requireEnabled() {
    if (!SyntheticCloneConfig.isSyntheticCloneNonBinding) {
      throw StateError('synthetic_clone_lane_disabled');
    }
    SyntheticCloneConfig.validateCurrentBuild();
  }

  static Future<Map<String, dynamic>> _authorized({
    required String method,
    required String path,
    Object? body,
  }) async {
    _requireEnabled();
    var token = await AuthService.accessToken();
    if (token == null || token.isEmpty) {
      throw const BackendException(401, 'authentication_required');
    }
    try {
      return await BackendHttp.requestJson(
        method: method,
        path: path,
        accessToken: token,
        body: body,
      );
    } on BackendException catch (error) {
      if (error.statusCode != 401) rethrow;
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isEmpty) rethrow;
      return BackendHttp.requestJson(
        method: method,
        path: path,
        accessToken: token,
        body: body,
      );
    }
  }

  static Future<SyntheticCloneStatus> status() async =>
      SyntheticCloneStatus.fromJson(await _authorized(
        method: 'GET',
        path: '/synthetic-clone/status',
      ));

  static Future<Map<String, dynamic>> listing() async =>
      await _authorized(
        method: 'GET',
        path: '/synthetic-clone/listings/synthetic_clone_listing_wp255',
      );

  static Future<SyntheticCloneBooking> createBooking() async =>
      SyntheticCloneBooking.fromJson(await _authorized(
        method: 'POST',
        path: '/synthetic-clone/bookings',
        body: const <String, dynamic>{
          'listingId': 'synthetic_clone_listing_wp255',
        },
      ));

  static Future<SyntheticCloneBooking> getBooking(String bookingId) async =>
      SyntheticCloneBooking.fromJson(await _authorized(
        method: 'GET',
        path: '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}',
      ));

  static Future<SyntheticCloneBooking> acceptBooking(String bookingId) async =>
      SyntheticCloneBooking.fromJson(await _authorized(
        method: 'POST',
        path:
            '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}/accept',
      ));

  static Future<SyntheticCloneBooking> addPhoto({
    required String bookingId,
    required String segment,
    required String slot,
    required String source,
  }) async {
    _assertPhotoInput(segment, slot, source);
    return SyntheticCloneBooking.fromJson(await _authorized(
      method: 'POST',
      path: '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}/photos',
      body: <String, dynamic>{
        'segment': segment,
        'slot': slot,
        'source': source,
      },
    ));
  }

  static Future<SyntheticCloneChallenge> issueChallenge({
    required String bookingId,
    required String segment,
  }) async {
    if (!syntheticCloneSegments.contains(segment)) {
      throw const FormatException('synthetic_clone_segment_invalid');
    }
    final booking = await getBooking(bookingId);
    if (!booking.hasCompletePhotos(segment)) {
      throw const FormatException('synthetic_clone_photo_set_incomplete');
    }
    return SyntheticCloneChallenge.fromJson(await _authorized(
      method: 'POST',
      path:
          '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}/challenges',
      body: <String, dynamic>{'segment': segment},
    ));
  }

  static Future<SyntheticCloneBooking> verifyQr({
    required String bookingId,
    required String qrPayload,
  }) async {
    final parsed = _parseV3QrPayload(qrPayload);
    if (parsed == null || parsed['bookingId'] != bookingId) {
      throw const FormatException('synthetic_clone_qr_payload_invalid');
    }
    return _verifiedBooking(await _authorized(
      method: 'POST',
      path:
          '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}/challenges/verify',
      body: <String, dynamic>{'qrPayload': qrPayload.trim()},
    ));
  }

  static Future<SyntheticCloneBooking> verifyFallback({
    required String bookingId,
    required String challengeId,
    required String segment,
    required String presenterRole,
    required String code,
  }) async {
    if (!RegExp(r'^\d{6}$').hasMatch(code) ||
        !syntheticCloneSegments.contains(segment) ||
        !const {'owner', 'renter'}.contains(presenterRole)) {
      throw const FormatException('synthetic_clone_fallback_invalid');
    }
    return _verifiedBooking(await _authorized(
      method: 'POST',
      path:
          '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}/challenges/verify',
      body: <String, dynamic>{
        'challengeId': challengeId,
        'segment': segment,
        'presenterRole': presenterRole,
        'code': code,
      },
    ));
  }

  static Future<List<Map<String, dynamic>>> audit(String bookingId) async {
    final raw = await _authorized(
      method: 'GET',
      path: '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}/audit',
    );
    return _strictMaps(raw['audit']);
  }

  static Future<Map<String, dynamic>> cleanup() => _authorized(
        method: 'DELETE',
        path: '/synthetic-clone/bookings',
      );

  static SyntheticCloneBooking _verifiedBooking(Map<String, dynamic> raw) {
    final booking = _requiredMap(raw['booking'], 'verified_booking');
    return SyntheticCloneBooking.fromJson(booking);
  }

  @visibleForTesting
  static bool isValidV3QrPayload(
    String value, {
    String? bookingId,
    String? challengeId,
  }) =>
      _isV3QrPayload(value, bookingId: bookingId, challengeId: challengeId);
}

void _assertPhotoInput(String segment, String slot, String source) {
  if (!syntheticCloneSegments.contains(segment)) {
    throw const FormatException('synthetic_clone_segment_invalid');
  }
  if (!syntheticClonePhotoSlots.contains(slot)) {
    throw const FormatException('synthetic_clone_photo_slot_invalid');
  }
  if (!const {'camera', 'gallery'}.contains(source)) {
    throw const FormatException('synthetic_clone_photo_source_invalid');
  }
}

Map<String, dynamic> _requiredMap(Object? value, String name) {
  if (value is! Map) throw FormatException('synthetic_clone_${name}_invalid');
  return Map<String, dynamic>.from(value);
}

String _requiredText(Object? value, String name) {
  final text = value is String ? value.trim() : '';
  if (text.isEmpty) throw FormatException('synthetic_clone_${name}_invalid');
  return text;
}

int _requiredInt(Object? value, String name) {
  if (value is! int || value < 0) {
    throw FormatException('synthetic_clone_${name}_invalid');
  }
  return value;
}

Set<String> _parsePhotoSlots(Object? raw) {
  if (raw is! List) {
    throw const FormatException('synthetic_clone_photos_invalid');
  }
  final slots = <String>{};
  for (final entry in raw) {
    final photo = _requiredMap(entry, 'photo');
    final slot = _requiredText(photo['slot'], 'photo_slot');
    if (!syntheticClonePhotoSlots.contains(slot) || !slots.add(slot)) {
      throw const FormatException('synthetic_clone_photo_slots_invalid');
    }
  }
  return slots;
}

bool _hasCompleteSlotSet(Set<String> slots) =>
    slots.length == syntheticClonePhotoSlots.length &&
    syntheticClonePhotoSlots.every(slots.contains);

void _assertMarker(Map<String, dynamic> marker) {
  if (marker['syntheticTestOnly'] != true ||
      marker['binding'] != 'non-binding' ||
      marker['contractEligible'] != false ||
      marker['monetaryEffectMinor'] != 0 ||
      marker['externalSideEffects'] != false) {
    throw const FormatException('synthetic_clone_marker_invalid');
  }
}

Map<String, String>? _parseV3QrPayload(String value) {
  final parts = value.trim().split(':');
  if (parts.length != 7 || parts[0] != 'shareittoo' || parts[1] != 'v3') {
    return null;
  }
  if (!RegExp(r'^[0-9a-f-]{36}$', caseSensitive: false).hasMatch(parts[4]) ||
      !RegExp(r'^\d{6}$').hasMatch(parts[5]) ||
      !syntheticCloneSegments.contains(parts[2]) ||
      !const {'owner', 'renter'}.contains(parts[3]) ||
      parts[6].isEmpty) {
    return null;
  }
  return <String, String>{
    'segment': parts[2],
    'presenterRole': parts[3],
    'challengeId': parts[4],
    'code': parts[5],
    'bookingId': parts[6],
  };
}

bool _isV3QrPayload(
  String value, {
  String? bookingId,
  String? challengeId,
}) {
  final parsed = _parseV3QrPayload(value);
  return parsed != null &&
      (bookingId == null || parsed['bookingId'] == bookingId) &&
      (challengeId == null || parsed['challengeId'] == challengeId);
}

List<Map<String, dynamic>> _strictMaps(Object? value) {
  if (value is! List) {
    throw const FormatException('synthetic_clone_audit_invalid');
  }
  return value.map((entry) => _requiredMap(entry, 'audit_entry')).toList();
}
