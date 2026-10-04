import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/screens/booking_detail_screen.dart';
import 'package:lendify/utils/booking_date_range.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/test_builders.dart';

Map<String, dynamic> booking({String status = 'Abgeschlossen'}) => {
      'requestId': 'synthetic-date-request',
      'itemId': '',
      'status': status,
      'rawStatus': status == 'Laufend' ? 'running' : 'completed',
      'title': 'Synthetic date regression',
      'images': <String>[],
      'listerName': 'Synthetic owner',
      'dates': '28. Mär – 30. Mär',
      'startIso': DateTime(2026, 3, 28).toIso8601String(),
      'endIso': DateTime(2026, 3, 30).toIso8601String(),
      'pricePaid': '22,00 €',
      'basePerDay': 99.0,
      'quotedRentalSubtotalMinor': 2000,
      'quotedPlatformFeeMinor': 200,
      'quotedTotalMinor': 2200,
      'quotedOwnerPayoutMinor': 2000,
      'quotedBaseRentalMinor': 2000,
      'quotedDiscountMinor': 0,
      'quotedDays': 2,
      'quotedPricePerDayMinor': 1000,
    };

void main() {
  test('ISO resolver ignores localized or conflicting dates and keeps instants',
      () {
    for (final text in ['31. Dez – 02. Jan', 'Dec 31 – Jan 2', 'unparseable']) {
      final result = resolveBookingDateRange({
        'dates': text,
        'startIso': '2025-12-31T10:15:30.123456+01:00',
        'endIso': '2026-01-02T17:45:00.000000+01:00',
      });
      expect(result?.$1, DateTime.utc(2025, 12, 31, 9, 15, 30, 123, 456));
      expect(result?.$2, DateTime.utc(2026, 1, 2, 16, 45));
    }
  });

  test('nonexistent local DST times are not silently repaired', () {
    final result = resolveBookingDateRange({
      'startIso': '2026-03-29T02:30:00',
      'endIso': '2026-03-30T00:00:00',
    });
    if (DateTime(2026, 3, 29, 2, 30).hour != 2) {
      expect(result, isNull);
    } else {
      expect(result?.$1, DateTime(2026, 3, 29, 2, 30));
    }
  });

  for (final invalid in [
    <String, dynamic>{'startIso': null},
    <String, dynamic>{'endIso': null},
    <String, dynamic>{'startIso': 'not-an-iso-date'},
    <String, dynamic>{'endIso': '2026-02-30T00:00:00'},
    <String, dynamic>{'endIso': '2026-03-30T24:00:00'},
    <String, dynamic>{'endIso': '2026-03-30T00:60:00'},
    <String, dynamic>{'endIso': '2026-03-30T00:00:00+24:00'},
    <String, dynamic>{'endIso': '2026-03-28T00:00:00'},
    <String, dynamic>{'endIso': '2026-03-27T00:00:00'},
    <String, dynamic>{'endIso': 20260330},
  ]) {
    test('invalid ISO range is never repaired from display text: $invalid', () {
      expect(resolveBookingDateRange({...booking(), ...invalid}), isNull);
    });
  }

  for (final text in [
    '28. Mär – 30. Mär',
    '28 Mar – 30 Mar',
    '31. Dez – 02. Jan'
  ]) {
    testWidgets('DST duration and bound price ignore display text: $text',
        (tester) async {
      final input = booking()..['dates'] = text;
      await withDetails(tester, input, () async {
        expect(find.text('2 Tage'), findsOneWidget);
        expect(find.text('1 Tag'), findsNothing);
        expect(find.text('Abgeschlossene Buchung'), findsOneWidget);
        await tester.scrollUntilVisible(find.text('22,00 €').first, 300,
            scrollable: find.byType(Scrollable).first);
        expect(find.text('22,00 €'), findsWidgets);
        expect(input['quotedTotalMinor'], 2200);
        expect(input['quotedDays'], 2);
        await tester.scrollUntilVisible(find.text('Geplantes Mietende'), 300,
            scrollable: find.byType(Scrollable).first);
        expect(find.text('30. Mär'), findsOneWidget);
      });
    });
  }

  for (final simulation in [false, true]) {
    testWidgets(
        'year-crossing overdue booking stays overdue; simulation=$simulation',
        (tester) async {
      final input = booking(status: 'Laufend')
        ..addAll({
          'startIso': '2025-12-31T00:00:00',
          'endIso': '2026-01-02T00:00:00',
          'dates': '31. Dez – 02. Jan',
          'simulationOnly': simulation,
          'images': ['synthetic-placeholder'],
        });
      await withDetails(tester, input, () async {
        expect(find.textContaining('Überfällig seit'), findsOneWidget);
        expect(find.textContaining(RegExp(r'^Rückgabe in \d+ Tagen$')),
            findsNothing);
        expect(
            find.text(simulation
                ? 'Pilot-Simulation · Laufende Buchung'
                : 'Laufende Buchung'),
            findsOneWidget);
      });
    });
  }

  for (final status in ['Akzeptiert', 'Laufend']) {
    for (final invalidEnd in [null, 'invalid', '2026-03-28T00:00:00']) {
      testWidgets('$status blocks mutations with invalid end=$invalidEnd',
          (tester) async {
        final input = booking(status: status)..['endIso'] = invalidEnd;
        if (invalidEnd == 'invalid') {
          for (final key in [
            'quotedDays',
            'quotedPricePerDayMinor',
            'quotedBaseRentalMinor',
            'quotedDiscountMinor'
          ]) {
            input.remove(key);
          }
        }
        await withDetails(tester, input, () async {
          expect(find.byKey(const ValueKey('booking-dates-unavailable')),
              findsOneWidget);
          expect(find.text('2 Tage'), findsNothing);
          expect(find.textContaining('99,00 €'), findsNothing);
          final prefs = await SharedPreferences.getInstance();
          final before = jsonEncode(
              {for (final key in prefs.getKeys()) key: prefs.get(key)});
          final action = find.widgetWithText(FilledButton,
              status == 'Laufend' ? 'Rückgabe starten' : 'Übergabe starten');
          await tester.scrollUntilVisible(action, 350,
              scrollable: find.byType(Scrollable).first);
          await tester.tap(action.hitTestable());
          await tester.pumpAndSettle();
          expect(find.byType(BookingDetailScreen), findsOneWidget);
          expect(find.textContaining('Übergabe und Rückgabe bleiben gesperrt.'),
              findsWidgets);
          expect(
              jsonEncode(
                  {for (final key in prefs.getKeys()) key: prefs.get(key)}),
              before);
          expect(input['quotedTotalMinor'], 2200);
        });
      });
    }
  }
}

Future<void> withDetails(WidgetTester tester, Map<String, dynamic> input,
    Future<void> Function() assertions) async {
  final owner = buildTestUser('date-owner', name: 'Synthetic Owner');
  final renter = buildTestUser('date-renter', name: 'Synthetic Renter');
  final item = buildTestItem(id: 'date-item', ownerId: owner.id);
  await seedCoreBookingState(
      owner: owner,
      renter: renter,
      item: item,
      currentUser: renter,
      requests: [
        buildTestRequest(
          id: 'synthetic-date-request',
          itemId: item.id,
          ownerId: owner.id,
          renterId: renter.id,
        )
      ]);
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': renter.id,
        'email': renter.email,
        'sessionId': 'synthetic-date-session',
        'createdAt': '2026-10-04T00:00:00Z',
      }));
  tester.view.physicalSize = const Size(1000, 1500);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  var requests = 0;
  await http.runWithClient(() async {
    await tester.pumpWidget(MaterialApp(
        theme: ThemeData.dark(), home: BookingDetailScreen(booking: input)));
    await tester.pumpAndSettle();
    await assertions();
    expect(requests, 0,
        reason: 'No external read or mutation is allowed in this fixture.');
    expect(tester.takeException(), isNull);
    // Complete the existing two-second toast lifecycle before disposal.
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  },
      () => MockClient((request) async {
            requests++;
            throw StateError('Unexpected external request in local regression');
          }));
}
