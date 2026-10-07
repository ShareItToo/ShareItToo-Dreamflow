import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/booking_confirmation_challenge.dart';
import 'package:lendify/widgets/return_handover_stepper_sheet.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

const challengeId = '123e4567-e89b-42d3-a456-426614174000';
const bookingId = 'synthetic-handover-request';

Map<String, dynamic> challenge(String segment) {
  final role = segment == 'return' ? 'renter' : 'owner';
  return {
    'id': challengeId,
    'bookingId': bookingId,
    'segment': segment,
    'presenterRole': role,
    'code': '123456',
    'qrPayload': 'shareittoo:v3:$segment:$role:$challengeId:123456:$bookingId',
    'issuedAt': DateTime.now().toUtc().toIso8601String(),
    'expiresAt': DateTime.now()
        .toUtc()
        .add(const Duration(minutes: 5))
        .toIso8601String(),
  };
}

Future<void> mountStepper(
  WidgetTester tester, {
  required String segment,
  required ConfirmationChallengeLoader loader,
  int photos = 4,
}) async {
  await tester.binding.setSurfaceSize(const Size(1200, 1000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  // Synthetic persisted counts exercise navigation only. No fixture image is
  // uploaded or represented as authentic condition/product evidence.
  final owner = buildTestUser('synthetic-owner', name: 'Synthetic Owner');
  final renter = buildTestUser('synthetic-renter', name: 'Synthetic Renter');
  final current = segment == 'return' ? renter : owner;
  final item = buildTestItem(id: 'synthetic-item', ownerId: owner.id);
  final request = buildTestRequest(
      id: bookingId,
      itemId: item.id,
      ownerId: owner.id,
      renterId: renter.id,
      status: segment == 'return' ? 'running' : 'accepted');
  await seedCoreBookingState(
      owner: owner,
      renter: renter,
      item: item,
      requests: [request],
      currentUser: current);
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': current.id,
        'sessionId': 'synthetic-session',
        'email': current.email,
        'createdAt': '2026-10-04T00:00:00Z',
      }));
  await prefs.setString(
      'handover_return_state_v1',
      jsonEncode({
        bookingId: {'${segment}PresenterPhotos': photos},
      }));
  await tester.pumpWidget(MaterialApp(
      home: ReturnHandoverStepperPage(
    item: item,
    request: request,
    renterName: renter.displayName,
    ownerName: owner.displayName,
    handoverCode: '',
    confirmationChallengeLoader: loader,
    viewerIsOwner: segment == 'pickup',
    mode: segment == 'return'
        ? ReturnFlowMode.returnFlow
        : ReturnFlowMode.pickupFlow,
  )));
  await tester.pumpAndSettle();
}

void main() {
  test('challenge shape binds phase role booking QR code and expiry', () {
    final valid = challenge('return');
    for (final changes in <Map<String, dynamic>>[
      {'bookingId': 'foreign'},
      {'segment': 'pickup'},
      {'presenterRole': 'owner'},
      {'code': ''},
      {'code': '12345'},
      {'qrPayload': 'shareittoo:v2:return:renter:123456:$bookingId'},
      {'expiresAt': '2020-01-01T00:00:00Z'},
      {'expiresAt': 'bad'},
      {'consumedAt': valid['issuedAt']},
      {'replayed': true},
    ]) {
      expect(
          BookingConfirmationChallenge.parse({...valid, ...changes},
              bookingId: bookingId, segment: 'return', now: DateTime.now()),
          isNull);
    }
    expect(
        BookingConfirmationChallenge.parse(valid,
            bookingId: bookingId, segment: 'return', now: DateTime.now()),
        isNotNull);
  });
  for (final segment in ['pickup', 'return']) {
    testWidgets('$segment loads its server challenge on actual QR-step entry',
        (tester) async {
      var calls = 0;
      await mountStepper(tester, segment: segment, loader: () async {
        calls++;
        return challenge(segment);
      });
      await tester.tap(find.text('Weiter'));
      await tester.pumpAndSettle();
      if (segment == 'return') {
        expect(calls, 0);
        expect(find.text('Schaden vorhanden'), findsOneWidget);
        await tester.tap(find.text('Weiter'));
        await tester.pumpAndSettle();
      }
      expect(calls, 1);
      expect(find.text('123456'), findsOneWidget);
      expect(find.byType(QrImageView), findsOneWidget);
      await tester.tap(find.text('Zurück'));
      await tester.pumpAndSettle();
      expect(find.byType(QrImageView), findsNothing);
      await tester.tap(find.text('Weiter'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.text('123456'), findsOneWidget);
    });

    testWidgets('$segment requires four persisted presenter photos',
        (tester) async {
      var calls = 0;
      await mountStepper(tester, segment: segment, photos: 3, loader: () async {
        calls++;
        return challenge(segment);
      });
      final button = tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Weiter'));
      expect(button.onPressed, isNull);
      expect(calls, 0);
      expect(find.byType(QrImageView), findsNothing);
    });
  }

  for (final failure in ['null', 'throw', 'booking', 'phase', 'role', 'code']) {
    testWidgets(
        'invalid $failure return challenge stays blocked and permits retry',
        (tester) async {
      var calls = 0;
      await mountStepper(tester, segment: 'return', loader: () async {
        calls++;
        if (calls > 1) return challenge('return');
        if (failure == 'null') return null;
        if (failure == 'throw') throw StateError('synthetic failure');
        return {
          ...challenge('return'),
          if (failure == 'booking') 'bookingId': 'foreign',
          if (failure == 'phase') 'segment': 'pickup',
          if (failure == 'role') 'presenterRole': 'owner',
          if (failure == 'code') 'code': '',
        };
      });
      await tester.tap(find.text('Weiter'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Weiter'));
      await tester.pumpAndSettle();
      expect(calls, 1);
      expect(find.byType(QrImageView), findsNothing);
      expect(find.textContaining('Bitte erneut versuchen'), findsOneWidget);
      await tester.tap(find.text('Weiter'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.text('123456'), findsOneWidget);
    });
  }

  for (final transition in ['back', 'foreign-owner', 'same-owner-new-epoch']) {
    testWidgets(
        'double entry and late response after $transition cannot expose QR',
        (tester) async {
      var calls = 0;
      final pending = Completer<Map<String, dynamic>?>();
      await mountStepper(tester, segment: 'return', loader: () {
        calls++;
        return pending.future;
      });
      await tester.tap(find.text('Weiter'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Weiter'));
      await tester.tap(find.text('Weiter'));
      await tester.pump();
      expect(calls, 1);
      final prefs = await SharedPreferences.getInstance();
      if (transition == 'back') {
        await tester.tap(find.text('Zurück'));
      } else if (transition == 'foreign-owner') {
        await prefs.setString(
            'auth_session_v1',
            jsonEncode({
              'userId': 'foreign',
              'email': 'foreign@example.invalid',
              'sessionId': 'foreign-session',
            }));
      } else {
        final stored = prefs.getString('auth_session_v1')!;
        final owner =
            AuthService.captureSessionOwner((await AuthService.readSession())!);
        expect(
            await AuthService.clearSessionOwnerIfMatches(owner,
                runLogoutCleanup: false),
            isNotNull);
        await prefs.setString('auth_session_v1', stored);
        expect(AuthService.sessionEpoch, greaterThan(owner.epoch));
      }
      pending.complete(challenge('return'));
      await tester.pumpAndSettle();
      expect(find.byType(QrImageView), findsNothing);
      expect(find.text('123456'), findsNothing);
      expect(calls, 1);
    });
  }
}
