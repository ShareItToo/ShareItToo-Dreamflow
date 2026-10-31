import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/invoice.dart';
import 'package:lendify/screens/select_rental_duration_screen.dart';
import 'package:lendify/screens/private_pilot_checkout_screen.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/utils/rental_calendar.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  test('calendar arithmetic is independent of elapsed DST hours', () {
    final fall = DateTime(2026, 10, 25);
    final spring = DateTime(2027, 3, 27);
    expect(addRentalCalendarDays(fall, 1), DateTime(2026, 10, 26));
    expect(addRentalCalendarDays(DateTime(2026, 10, 26), -1), fall);
    expect(rentalCalendarDays(spring, DateTime(2027, 3, 29)), 2);
    expect(rentalCalendarDays(fall, addRentalCalendarDays(fall, 7)), 7);
    if (Platform.environment['TZ'] == 'Europe/Berlin') {
      expect(DateTime(2026, 10, 26).difference(fall).inHours, 25);
      expect(DateTime(2027, 3, 29).difference(spring).inHours, 47);
    } else if (Platform.environment['TZ'] == 'UTC') {
      expect(DateTime(2026, 10, 26).difference(fall).inHours, 24);
      expect(DateTime(2027, 3, 29).difference(spring).inHours, 48);
    }
  });

  for (final range in [
    (start: DateTime(2026, 10, 25), end: DateTime(2026, 10, 26), days: 1),
    (start: DateTime(2027, 3, 27), end: DateTime(2027, 3, 29), days: 2),
  ]) {
    test(
        'request and invoice use ${range.days} calendar days without changing money',
        () {
      final item = buildTestItem(
          id: 'calendar-request', ownerId: 'owner', pricePerDay: 10);
      final request = buildTestRequest(
          id: 'calendar-request',
          itemId: item.id,
          ownerId: item.ownerId,
          renterId: 'renter',
          start: range.start,
          end: range.end);
      final breakdown =
          DataService.priceBreakdownForRequest(item: item, req: request);
      expect(breakdown.days, range.days);
      expect(breakdown.baseTotal, range.days * 10);
      expect(breakdown.totalRenter, range.days * 11);
      final invoice = InvoiceBookingDetails(
          itemTitle: 'Synthetic',
          renterName: 'Renter',
          ownerName: 'Owner',
          startsAt: range.start,
          endsAt: range.end,
          quoteId: null,
          quoteHash: null,
          contractVersion: null);
      expect(invoice.rentalDays, range.days);
      expect(invoice.startsAt, range.start);
      expect(invoice.endsAt, range.end);
    });
  }

  for (final weekly in [false, true]) {
    testWidgets(
        'fall selection checks and returns ${weekly ? 7 : 1} calendar days',
        (tester) async {
      await _withCalendar(tester, weekly: weekly, run: (harness) async {
        await harness.open(DateTimeRange(
            start: DateTime(2026, 10, 24), end: DateTime(2026, 10, 25)));
        await tester.tap(find.text('25').hitTestable());
        await tester.pumpAndSettle();
        expect(find.text(weekly ? '7 Miettage' : '1 Miettag'), findsOneWidget);
        final selected = await harness.confirm();
        expect(selected.start, DateTime(2026, 10, 25));
        expect(selected.end, DateTime(2026, weekly ? 11 : 10, weekly ? 1 : 26));
        expect(
            rentalCalendarDays(selected.start, selected.end), weekly ? 7 : 1);
        if (BackendConfig.enabled) {
          expect(harness.payloads.single, {
            'startDate': '2026-10-25',
            'endDate': weekly ? '2026-11-01' : '2026-10-26',
          });
        }
      });
    });
  }

  testWidgets('spring range survives save/reopen with two days and same price',
      (tester) async {
    await _withCalendar(tester, run: (harness) async {
      final range = DateTimeRange(
          start: DateTime(2027, 3, 27), end: DateTime(2027, 3, 29));
      await harness.open(range);
      await tester.tap(find.text('27').hitTestable());
      await tester.pumpAndSettle();
      await tester.tap(find.text('28').hitTestable());
      await tester.pumpAndSettle();
      expect(find.text('2 Miettage'), findsOneWidget);
      if (!BackendConfig.enabled) expect(find.text('22.00 €'), findsWidgets);
      final selected = await harness.confirm();
      await DataService.setSavedDateRange(harness.item.id,
          start: selected.start, end: selected.end);
      final saved = await DataService.getSavedDateRange(harness.item.id);
      await harness.open(DateTimeRange(start: saved.$1!, end: saved.$2!));
      expect(find.text('2 Miettage'), findsOneWidget);
      if (!BackendConfig.enabled) expect(find.text('22.00 €'), findsWidgets);
      expect(await harness.confirm(), range);
      if (BackendConfig.enabled) {
        expect(
            harness.payloads,
            List.filled(2, {
              'startDate': '2027-03-27',
              'endDate': '2027-03-29',
            }));
      } else {
        unawaited(harness.navigator.currentState!.push(MaterialPageRoute<void>(
          builder: (_) =>
              PrivatePilotCheckoutScreen(item: harness.item, range: range),
        )));
        await tester.pumpAndSettle();
        expect(find.text('22,00 €'), findsWidgets);
      }
    });
  });
}

class _CalendarHarness {
  final WidgetTester tester;
  final Item item;
  final navigator = GlobalKey<NavigatorState>();
  final payloads = <Map<String, dynamic>>[];
  Future<DateTimeRange?>? result;
  _CalendarHarness(this.tester, this.item);

  Future<void> open(DateTimeRange range) async {
    result = navigator.currentState!.push<DateTimeRange>(MaterialPageRoute(
      builder: (_) => SelectRentalDurationScreen(
          item: item, initialRange: range, currentDate: DateTime(2026, 10, 4)),
    ));
    await tester.pumpAndSettle();
  }

  Future<DateTimeRange> confirm() async {
    final next = find.widgetWithText(FilledButton, 'Weiter');
    await tester.ensureVisible(next);
    await tester.pumpAndSettle();
    expect(next.hitTestable(), findsOneWidget);
    await tester.tap(next.hitTestable());
    await tester.pumpAndSettle();
    expect(find.text('Calendar test home'), findsOneWidget);
    return (await result)!;
  }
}

Future<void> _withCalendar(WidgetTester tester,
    {bool weekly = false,
    required Future<void> Function(_CalendarHarness) run}) async {
  SharedPreferences.setMockInitialValues(
      {'items': '[]', 'rental_requests': '[]'});
  tester.view.physicalSize = const Size(1000, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final item = Item.fromJson({
    ...buildTestItem(id: 'calendar-test', ownerId: 'owner', pricePerDay: 10)
        .toJson(),
    'priceUnit': weekly ? 'week' : 'day',
    'priceRaw': weekly ? 70 : 10,
    'photos': <String>[],
  });
  final harness = _CalendarHarness(tester, item);
  await http.runWithClient(() async {
    await tester.pumpWidget(MaterialApp(
        navigatorKey: harness.navigator,
        home: const Scaffold(body: Text('Calendar test home'))));
    await run(harness);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  },
      () => MockClient((request) async {
            if (request.method == 'GET' &&
                request.url.path.endsWith('/availability')) {
              return http.Response('{"availability":{"unavailable":[]}}', 200);
            }
            if (request.method == 'POST' &&
                request.url.path.endsWith('/availability/check')) {
              harness.payloads
                  .add(jsonDecode(request.body) as Map<String, dynamic>);
              return http.Response('{"available":true}', 200);
            }
            throw StateError(
                'Unexpected synthetic request: ${request.method} ${request.url.path}');
          }));
}
