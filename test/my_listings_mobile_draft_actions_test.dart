import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/screens/my_listings_screen.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('draft actions work at 320px mobile width and 2x text',
      (tester) async {
    await _pumpMobileDraft(tester);

    final action = find.byTooltip('Status ändern');
    expect(find.text('Synthetic mobile draft'), findsOneWidget);
    expect(action, findsOneWidget);
    expect(tester.getSize(action).height, greaterThanOrEqualTo(48));
    expect(action.hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('Veröffentlichen'), findsOneWidget);
    expect(find.text('Bearbeiten'), findsOneWidget);
    expect(find.text('Löschen'), findsOneWidget);
    await tester.tap(find.text('Veröffentlichen'));
    await tester.pumpAndSettle();
    final stored = (jsonDecode(
      (await SharedPreferences.getInstance()).getString('items')!,
    ) as List)
        .cast<Map>();
    expect(stored.single['status'], 'active');
    expect(stored.single['isActive'], isTrue);
    expect(find.text('Synthetic mobile draft'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mobile draft edit action opens the real editor', (tester) async {
    await _pumpMobileDraft(tester);

    await tester.tap(find.byTooltip('Status ändern'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bearbeiten'));
    await tester.pumpAndSettle();

    expect(find.byType(CreateListingScreen), findsOneWidget);
    expect(find.text('Synthetic mobile draft'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mobile draft delete action removes the persisted listing',
      (tester) async {
    await _pumpMobileDraft(tester);

    await tester.tap(find.byTooltip('Status ändern'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Löschen'));
    await tester.pumpAndSettle();

    final stored = jsonDecode(
      (await SharedPreferences.getInstance()).getString('items')!,
    ) as List;
    expect(stored, isEmpty);
    expect(find.text('Synthetic mobile draft'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

Future<void> _pumpMobileDraft(WidgetTester tester) async {
  tester.view.physicalSize = const Size(320, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final owner = buildTestUser(
    'mobile-draft-owner',
    name: 'Synthetic Mobile Owner',
    email: 'mobile-draft-owner@example.invalid',
  ).copyWith(emailVerified: true);
  final draft = Item.fromJson({
    ...buildTestItem(
      id: 'mobile-draft-action',
      ownerId: owner.id,
      title: 'Synthetic mobile draft',
    ).toJson(),
    'status': 'draft',
    'isActive': false,
    'photos': <String>[],
    'privateStatusConfirmed': false,
  });
  SharedPreferences.setMockInitialValues(<String, Object>{
    'users': jsonEncode(<Object>[owner.toJson()]),
    'currentUser': jsonEncode(owner.toJson()),
    'auth_session_v1': jsonEncode(<String, Object>{
      'userId': owner.id,
      'email': owner.email,
      'sessionId': 'mobile-draft-session',
      'createdAt': '2026-10-31T12:00:00.000Z',
    }),
    'items': jsonEncode(<Object>[draft.toJson()]),
  });

  await tester.pumpWidget(
    ChangeNotifierProvider(
      create: (_) => LocalizationController(),
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
          ),
          child: child!,
        ),
        home: const MyListingsScreen(initialTabIndex: 1),
      ),
    ),
  );
  await tester.pumpAndSettle();
}
