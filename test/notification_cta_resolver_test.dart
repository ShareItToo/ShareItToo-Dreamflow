import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/notification_cta_resolver.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

RentalRequest buildRequest({
  required String id,
  required String ownerId,
  required String renterId,
  required String status,
  bool needsReview = false,
}) =>
    RentalRequest(
      id: id,
      itemId: 'item-$id',
      ownerId: ownerId,
      renterId: renterId,
      start: DateTime(2026, 7, 26),
      end: DateTime(2026, 7, 29),
      status: status,
      needsReview: needsReview,
      message: 'Test request',
      createdAt: DateTime(2026, 7, 20),
    );

Map<String, dynamic> bookingNotification({
  String? requestId,
  String? entityId,
  String title = 'Buchungs-Update',
  String body = 'Öffne die Buchung für Details.',
  String ctaLabel = 'Zur Buchung',
  String category = 'bookings',
  String entityType = 'booking',
}) =>
    {
      'category': category,
      'title': title,
      'body': body,
      'entityType': entityType,
      if (entityId != null) 'entityId': entityId,
      if (requestId != null) 'requestId': requestId,
      'ctaLabel': ctaLabel,
    };

Map<String, dynamic> ownerRequestNotification({
  String? requestId,
  String? entityId,
}) =>
    {
      'category': 'bookings',
      'title': 'Neue Mietanfrage eingegangen',
      'body': 'Julia Wagner möchte „QNAP NAS“ mieten.',
      'entityType': 'booking',
      if (entityId != null) 'entityId': entityId,
      if (requestId != null) 'requestId': requestId,
      'ctaLabel': 'Anfrage prüfen',
    };

Future<void> seedRequests(List<RentalRequest> requests) async {
  SharedPreferences.setMockInitialValues({
    'rental_requests': jsonEncode(requests.map((r) => r.toJson()).toList()),
  });
}

Future<NotificationCtaResolution> resolveWithSession({
  required Map<String, dynamic> notification,
  required String currentUserId,
}) async {
  final prefs = await SharedPreferences.getInstance();
  final currentUser = buildTestUser(currentUserId, name: currentUserId);
  await prefs.setString(
    'currentUser',
    jsonEncode(currentUser.toJson()),
  );
  await prefs.setString(
    'auth_session_v1',
    jsonEncode(<String, Object>{
      'userId': currentUser.id,
      'email': currentUser.email,
      'createdAt': '2026-08-25T04:00:00.000Z',
    }),
  );
  return NotificationCtaResolver.resolve(
    notification: notification,
    currentUserId: currentUserId,
  );
}

void expectNone(
  NotificationCtaResolution result, {
  required String sitCategory,
}) {
  expect(result.target, NotificationTargetKind.none);
  expect(result.ctaLabel, anyOf(isNull, isEmpty));
  expect(result.requestId, anyOf(isNull, isEmpty));
  expect(result.sitCategory, sitCategory);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const ownerId = 'owner-1';
  const renterId = 'renter-1';
  const outsiderId = 'outsider-1';

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('booking status routing', () {
    Future<void> expectRouting({
      required RentalRequest request,
      required String currentUserId,
      required NotificationTargetKind target,
      required String ctaLabel,
    }) async {
      await seedRequests([request]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: request.id,
          entityId: request.id,
          ctaLabel: request.ownerId == currentUserId
              ? 'Zur Vermietung'
              : 'Zur Buchung',
        ),
        currentUserId: currentUserId,
      );
      expect(result.target, target);
      expect(result.ctaLabel, ctaLabel);
      expect(result.requestId, request.id);
    }

    test('pending owner -> ownerRequestDetail', () async {
      final request = buildRequest(
        id: 'req-pending',
        ownerId: ownerId,
        renterId: renterId,
        status: 'pending',
      );
      await seedRequests([request]);
      final result = await resolveWithSession(
        notification: ownerRequestNotification(
          requestId: request.id,
          entityId: request.id,
        ),
        currentUserId: ownerId,
      );
      expect(result.target, NotificationTargetKind.ownerRequestDetail);
      expect(result.ctaLabel, 'Anfrage prüfen');
      expect(result.requestId, request.id);
      expect(result.sitCategory, 'rentals');
    });

    test('pending renter -> none', () async {
      final request = buildRequest(
        id: 'req-pending',
        ownerId: ownerId,
        renterId: renterId,
        status: 'pending',
      );
      await seedRequests([request]);
      final result = await resolveWithSession(
        notification: ownerRequestNotification(
          requestId: request.id,
          entityId: request.id,
        ),
        currentUserId: renterId,
      );
      expectNone(result, sitCategory: 'rentals');
    });

    test('accepted owner -> ownerBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-accepted',
          ownerId: ownerId,
          renterId: renterId,
          status: 'accepted',
        ),
        currentUserId: ownerId,
        target: NotificationTargetKind.ownerBookingDetail,
        ctaLabel: 'Zur Vermietung',
      );
    });

    test('accepted renter -> renterBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-accepted',
          ownerId: ownerId,
          renterId: renterId,
          status: 'accepted',
        ),
        currentUserId: renterId,
        target: NotificationTargetKind.renterBookingDetail,
        ctaLabel: 'Zur Buchung',
      );
    });

    test('running owner -> ownerBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-running-owner',
          ownerId: ownerId,
          renterId: renterId,
          status: 'running',
        ),
        currentUserId: ownerId,
        target: NotificationTargetKind.ownerBookingDetail,
        ctaLabel: 'Zur Vermietung',
      );
    });

    test('running renter -> renterBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-running-renter',
          ownerId: ownerId,
          renterId: renterId,
          status: 'running',
        ),
        currentUserId: renterId,
        target: NotificationTargetKind.renterBookingDetail,
        ctaLabel: 'Zur Buchung',
      );
    });

    test('completed owner -> ownerBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-completed-owner',
          ownerId: ownerId,
          renterId: renterId,
          status: 'completed',
        ),
        currentUserId: ownerId,
        target: NotificationTargetKind.ownerBookingDetail,
        ctaLabel: 'Zur Vermietung',
      );
    });

    test('completed renter -> renterBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-completed-renter',
          ownerId: ownerId,
          renterId: renterId,
          status: 'completed',
        ),
        currentUserId: renterId,
        target: NotificationTargetKind.renterBookingDetail,
        ctaLabel: 'Zur Buchung',
      );
    });

    test('completed + needsReview owner -> ownerBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-review-owner',
          ownerId: ownerId,
          renterId: renterId,
          status: 'completed',
          needsReview: true,
        ),
        currentUserId: ownerId,
        target: NotificationTargetKind.ownerBookingDetail,
        ctaLabel: 'Zur Vermietung',
      );
    });

    test('completed + needsReview renter -> renterBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-review-renter',
          ownerId: ownerId,
          renterId: renterId,
          status: 'completed',
          needsReview: true,
        ),
        currentUserId: renterId,
        target: NotificationTargetKind.renterBookingDetail,
        ctaLabel: 'Zur Buchung',
      );
    });

    test('declined owner -> ownerBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-declined-owner',
          ownerId: ownerId,
          renterId: renterId,
          status: 'declined',
        ),
        currentUserId: ownerId,
        target: NotificationTargetKind.ownerBookingDetail,
        ctaLabel: 'Zur Vermietung',
      );
    });

    test('declined renter -> renterBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-declined-renter',
          ownerId: ownerId,
          renterId: renterId,
          status: 'declined',
        ),
        currentUserId: renterId,
        target: NotificationTargetKind.renterBookingDetail,
        ctaLabel: 'Zur Buchung',
      );
    });

    test('cancelled owner -> ownerBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-cancelled-owner',
          ownerId: ownerId,
          renterId: renterId,
          status: 'cancelled',
        ),
        currentUserId: ownerId,
        target: NotificationTargetKind.ownerBookingDetail,
        ctaLabel: 'Zur Vermietung',
      );
    });

    test('cancelled renter -> renterBookingDetail', () async {
      await expectRouting(
        request: buildRequest(
          id: 'req-cancelled-renter',
          ownerId: ownerId,
          renterId: renterId,
          status: 'cancelled',
        ),
        currentUserId: renterId,
        target: NotificationTargetKind.renterBookingDetail,
        ctaLabel: 'Zur Buchung',
      );
    });
  });

  group('fallbacks and safety', () {
    test(
      'missing request with owner-request heuristic -> ownerRequestsOverview',
      () async {
        await seedRequests([]);
        final result = await resolveWithSession(
          notification: ownerRequestNotification(),
          currentUserId: ownerId,
        );
        expect(result.target, NotificationTargetKind.ownerRequestsOverview);
        expect(result.ctaLabel, 'Zu Vermietungen');
        expect(result.requestId, anyOf(isNull, isEmpty));
        expect(result.sitCategory, 'rentals');
      },
    );

    test('missing request without heuristic -> none', () async {
      await seedRequests([]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          entityType: 'booking',
          ctaLabel: 'Zur Buchung',
        ),
        currentUserId: renterId,
      );
      expectNone(result, sitCategory: 'bookings');
    });

    test('entityId fallback resolves booking request when requestId is empty',
        () async {
      final request = buildRequest(
        id: 'req-entity-fallback',
        ownerId: ownerId,
        renterId: renterId,
        status: 'accepted',
      );
      await seedRequests([request]);
      final ownerResult = await resolveWithSession(
        notification: bookingNotification(
          requestId: '',
          entityId: request.id,
          ctaLabel: 'Zur Vermietung',
        ),
        currentUserId: ownerId,
      );
      expect(ownerResult.target, NotificationTargetKind.ownerBookingDetail);
      expect(ownerResult.ctaLabel, 'Zur Vermietung');
      expect(ownerResult.requestId, request.id);
      expect(ownerResult.sitCategory, 'rentals');

      final renterResult = await resolveWithSession(
        notification: bookingNotification(
          requestId: '',
          entityId: request.id,
          ctaLabel: 'Zur Buchung',
        ),
        currentUserId: renterId,
      );
      expect(renterResult.target, NotificationTargetKind.renterBookingDetail);
      expect(renterResult.ctaLabel, 'Zur Buchung');
      expect(renterResult.requestId, request.id);
      expect(renterResult.sitCategory, 'bookings');
    });

    test('requestId takes priority over differing entityId', () async {
      final preferred = buildRequest(
        id: 'req-preferred-requestid',
        ownerId: ownerId,
        renterId: renterId,
        status: 'accepted',
      );
      final other = buildRequest(
        id: 'req-ignored-entityid',
        ownerId: ownerId,
        renterId: renterId,
        status: 'cancelled',
      );
      await seedRequests([preferred, other]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: preferred.id,
          entityId: other.id,
          ctaLabel: 'Zur Vermietung',
        ),
        currentUserId: ownerId,
      );
      expect(result.target, NotificationTargetKind.ownerBookingDetail);
      expect(result.ctaLabel, 'Zur Vermietung');
      expect(result.requestId, preferred.id);
      expect(result.sitCategory, 'rentals');
    });

    test(
        'unknown status for involved owner falls through to final none fallback',
        () async {
      final request = buildRequest(
        id: 'req-unknown-owner',
        ownerId: ownerId,
        renterId: renterId,
        status: 'archived',
      );
      await seedRequests([request]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: request.id,
          entityId: request.id,
          ctaLabel: 'Zur Vermietung',
        ),
        currentUserId: ownerId,
      );
      expectNone(result, sitCategory: 'bookings');
    });

    test(
        'unknown status for involved renter falls through to final none fallback',
        () async {
      final request = buildRequest(
        id: 'req-unknown-renter',
        ownerId: ownerId,
        renterId: renterId,
        status: 'archived',
      );
      await seedRequests([request]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: request.id,
          entityId: request.id,
          ctaLabel: 'Zur Buchung',
        ),
        currentUserId: renterId,
      );
      expectNone(result, sitCategory: 'bookings');
    });

    test('invalid id -> none', () async {
      await seedRequests([]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: 'missing-id',
          entityId: 'missing-id',
        ),
        currentUserId: renterId,
      );
      expectNone(result, sitCategory: 'bookings');
    });

    test('outsider with valid request -> none', () async {
      final request = buildRequest(
        id: 'req-outsider',
        ownerId: ownerId,
        renterId: renterId,
        status: 'accepted',
      );
      await seedRequests([request]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: request.id,
          entityId: request.id,
        ),
        currentUserId: outsiderId,
      );
      expectNone(result, sitCategory: 'bookings');
    });
  });

  group('special notifications stay on legacy paths', () {
    test('handover -> none', () async {
      await seedRequests([
        buildRequest(
          id: 'req-handover',
          ownerId: ownerId,
          renterId: renterId,
          status: 'accepted',
        ),
      ]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: 'req-handover',
          entityId: 'req-handover',
          title: 'Übergabe-Erinnerung',
          body: 'Die bestätigte Übergabe startet heute Abend.',
          ctaLabel: 'Details ansehen',
        ),
        currentUserId: renterId,
      );
      expectNone(result, sitCategory: 'handover');
    });

    test('return -> none', () async {
      await seedRequests([
        buildRequest(
          id: 'req-return',
          ownerId: ownerId,
          renterId: renterId,
          status: 'running',
        ),
      ]);
      final result = await resolveWithSession(
        notification: bookingNotification(
          requestId: 'req-return',
          entityId: 'req-return',
          title: 'Rückgabe im Blick behalten',
          body: 'Prüfe die geplante Rückgabezeit im Detail.',
          ctaLabel: 'Rückgabe prüfen',
        ),
        currentUserId: renterId,
      );
      expectNone(result, sitCategory: 'handover');
    });

    test('support -> none', () async {
      await seedRequests([]);
      final result = await resolveWithSession(
        notification: {
          'category': 'support',
          'title': 'Support-Status aktualisiert',
          'body': 'Der Supportfall hat neue Informationen.',
          'entityType': 'support',
          'entityId': 'support-1',
          'ctaLabel': 'Support öffnen',
        },
        currentUserId: ownerId,
      );
      expectNone(result, sitCategory: 'support');
    });

    test('payment -> none', () async {
      await seedRequests([]);
      final result = await resolveWithSession(
        notification: {
          'category': 'payments',
          'title': 'Zahlungsmethode hinzufügen',
          'body': 'Hinterlege eine Zahlungsmethode.',
          'entityType': 'payment',
          'entityId': 'payment_methods',
          'ctaLabel': 'Öffnen',
        },
        currentUserId: ownerId,
      );
      expectNone(result, sitCategory: 'payments');
    });

    test('invoice -> none', () async {
      await seedRequests([]);
      final result = await resolveWithSession(
        notification: {
          'category': 'bookings',
          'title': 'Rechnung verfügbar',
          'body': 'Deine Rechnung ist jetzt verfügbar.',
          'entityType': 'booking',
          'entityId': 'invoice-booking',
          'ctaLabel': 'Rechnung öffnen',
        },
        currentUserId: ownerId,
      );
      expectNone(result, sitCategory: 'payments');
    });

    test('thread or message -> none', () async {
      await seedRequests([]);
      final result = await resolveWithSession(
        notification: {
          'category': 'messages',
          'title': 'Neue Nachricht erhalten',
          'body': 'Mila hat dir geschrieben.',
          'entityType': 'thread',
          'entityId': 'thread-1',
          'ctaLabel': 'Chat öffnen',
        },
        currentUserId: ownerId,
      );
      expectNone(result, sitCategory: 'messages');
    });

    test('review or system hint -> none', () async {
      await seedRequests([]);
      final reviewResult = await resolveWithSession(
        notification: {
          'category': 'reviews',
          'title': 'Bewertungen sammeln',
          'body':
              'Nach jeder abgeschlossenen Miete kannst du eine Bewertung abgeben.',
          'entityType': 'system',
          'entityId': 'review-tip',
          'ctaLabel': '',
        },
        currentUserId: ownerId,
      );
      expectNone(reviewResult, sitCategory: 'reviews');

      final systemResult = await resolveWithSession(
        notification: {
          'category': 'system',
          'title': 'Hinweis',
          'body': 'Nur ein Systemhinweis.',
          'entityType': 'system',
          'entityId': 'system-tip',
          'ctaLabel': '',
        },
        currentUserId: ownerId,
      );
      expectNone(systemResult, sitCategory: 'system');
    });
  });
}
