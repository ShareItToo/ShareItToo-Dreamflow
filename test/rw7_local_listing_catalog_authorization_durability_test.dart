import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/my_listings_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final accountA = buildTestUser(
    'rw7-account-a',
    name: 'RW7 Account A',
    email: 'rw7-account-a@example.invalid',
  );
  final accountB = buildTestUser(
    'rw7-account-b',
    name: 'RW7 Account B',
    email: 'rw7-account-b@example.invalid',
  );

  setUp(QaRuntimeService.reset);

  Future<void> useAccount(User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUser', jsonEncode(user.toJson()));
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T12:00:00.000Z',
      }),
    );
  }

  Map<String, Object> catalogState(List<Item> items) => <String, Object>{
        'users': jsonEncode(<Object>[accountA.toJson(), accountB.toJson()]),
        'items': jsonEncode(items.map((item) => item.toJson()).toList()),
        'qa_messages_notifs_seeded_v3_for_${accountA.id}': true,
        'qa_messages_notifs_seeded_v3_for_${accountB.id}': true,
      };

  Item changed(
    Item source, {
    String? title,
    String? status,
    bool? isActive,
    int? catalogRevision,
  }) =>
      Item.fromJson(<String, dynamic>{
        ...source.toJson(),
        if (title != null) 'title': title,
        if (status != null) 'status': status,
        if (isActive != null) 'isActive': isActive,
        if (catalogRevision != null) 'catalogRevision': catalogRevision,
      });

  test('foreign owner identifiers and guest listing mutations fail closed',
      () async {
    final ownedByB = buildTestItem(id: 'rw7-b-item', ownerId: accountB.id);
    final raw = jsonEncode(<Object>[ownedByB.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{
      ...catalogState(<Item>[ownedByB]),
      'items': raw,
    });
    await useAccount(accountA);

    await expectLater(
      DataService.addItem(
        buildTestItem(id: 'client-id', ownerId: accountB.id),
      ),
      throwsStateError,
    );
    await expectLater(
      DataService.updateItem(changed(ownedByB, title: 'Foreign edit')),
      throwsStateError,
    );
    await expectLater(
      DataService.updateItemStatus(itemId: ownedByB.id, status: 'paused'),
      throwsStateError,
    );
    await expectLater(
      DataService.deleteItemById(ownedByB.id),
      throwsStateError,
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('items'), raw);
    await prefs.remove('currentUser');
    await prefs.remove('auth_session_v1');
    await expectLater(
      DataService.addItem(buildTestItem(id: 'guest', ownerId: accountA.id)),
      throwsStateError,
    );
    expect(prefs.getString('items'), raw);
  });

  test('legacy local email session remains exact-current-owner scoped',
      () async {
    final ownedByA = buildTestItem(id: 'rw7-local-a', ownerId: accountA.id);
    final ownedByB = buildTestItem(id: 'rw7-local-b', ownerId: accountB.id);
    SharedPreferences.setMockInitialValues(
      catalogState(<Item>[ownedByA, ownedByB]),
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUser', jsonEncode(accountA.toJson()));
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'email': accountA.email,
        'createdAt': '2026-08-25T12:00:00.000Z',
      }),
    );

    await DataService.updateItemStatus(
      itemId: ownedByA.id,
      status: 'paused',
    );
    await expectLater(
      DataService.updateItemStatus(itemId: ownedByB.id, status: 'paused'),
      throwsStateError,
    );

    final persisted = await DataService.getItems();
    expect(
      persisted.singleWhere((item) => item.id == ownedByA.id).status,
      'paused',
    );
    expect(
      persisted.singleWhere((item) => item.id == ownedByB.id).status,
      'active',
    );
  });

  test('stale cached profile cannot authorize a listing mutation', () async {
    final owned = buildTestItem(id: 'rw7-a-item', ownerId: accountA.id);
    final raw = jsonEncode(<Object>[owned.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{
      ...catalogState(<Item>[owned]),
      'currentUser': jsonEncode(accountA.toJson()),
      'items': raw,
    });

    await expectLater(
      DataService.updateItemStatus(itemId: owned.id, status: 'paused'),
      throwsStateError,
    );
    expect(
      (await SharedPreferences.getInstance()).getString('items'),
      raw,
    );
  });

  test('corrupt listing entry fails closed and preserves exact raw bytes',
      () async {
    final valid = buildTestItem(id: 'rw7-valid', ownerId: accountA.id);
    final raw = jsonEncode(<Object>[
      valid.toJson(),
      <String, Object>{'id': 'rw7-corrupt', 'ownerId': accountA.id},
    ]);
    SharedPreferences.setMockInitialValues(<String, Object>{'items': raw});

    await expectLater(DataService.getItems(), throwsFormatException);
    expect(
      (await SharedPreferences.getInstance()).getString('items'),
      raw,
    );
  });

  test('duplicate listing ids fail closed without partial sanitization',
      () async {
    final first = buildTestItem(id: 'rw7-duplicate', ownerId: accountA.id);
    final second = buildTestItem(id: 'rw7-duplicate', ownerId: accountB.id);
    final raw = jsonEncode(<Object>[first.toJson(), second.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{'items': raw});

    await expectLater(DataService.getItems(), throwsFormatException);
    expect(
      (await SharedPreferences.getInstance()).getString('items'),
      raw,
    );
  });

  test('ended listings are retained until an approved retention rule exists',
      () async {
    final oldEnded = Item.fromJson(<String, dynamic>{
      ...buildTestItem(id: 'rw7-ended', ownerId: accountA.id).toJson(),
      'status': 'ended',
      'isActive': false,
      'endedAt': '2025-01-01T00:00:00.000Z',
    });
    final raw = jsonEncode(<Object>[oldEnded.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{'items': raw});

    expect((await DataService.getItems()).map((item) => item.id),
        <String>[oldEnded.id]);
    expect(
      (await SharedPreferences.getInstance()).getString('items'),
      raw,
    );
  });

  test('concurrent creates retain every item with distinct generated ids',
      () async {
    SharedPreferences.setMockInitialValues(catalogState(const <Item>[]));
    await useAccount(accountA);

    final created = await Future.wait(<Future<Item>>[
      DataService.addItem(
        buildTestItem(id: 'client-a', ownerId: accountA.id, title: 'A'),
      ),
      DataService.addItem(
        buildTestItem(id: 'client-b', ownerId: accountA.id, title: 'B'),
      ),
      DataService.addItem(
        buildTestItem(id: 'client-c', ownerId: accountA.id, title: 'C'),
      ),
    ]);

    expect(created.map((item) => item.id).toSet(), hasLength(3));
    final persisted = await DataService.getItems();
    expect(persisted, hasLength(3));
    expect(persisted.map((item) => item.title),
        containsAll(<String>['A', 'B', 'C']));
  });

  test('stale edit revision is rejected and cannot overwrite a newer edit',
      () async {
    final original = buildTestItem(id: 'rw7-edit', ownerId: accountA.id);
    SharedPreferences.setMockInitialValues(catalogState(<Item>[original]));
    await useAccount(accountA);

    await DataService.updateItem(changed(original, title: 'First edit'));
    await expectLater(
      DataService.updateItem(changed(original, title: 'Stale edit')),
      throwsStateError,
    );

    final persisted = (await DataService.getItems()).single;
    expect(persisted.title, 'First edit');
    expect(persisted.catalogRevision, 2);
  });

  test('missing update and delete targets are rejected without upsert',
      () async {
    final existing = buildTestItem(id: 'rw7-existing', ownerId: accountA.id);
    final raw = jsonEncode(<Object>[existing.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{
      ...catalogState(<Item>[existing]),
      'items': raw,
    });
    await useAccount(accountA);

    await expectLater(
      DataService.updateItem(
        buildTestItem(id: 'rw7-missing', ownerId: accountA.id),
      ),
      throwsStateError,
    );
    await expectLater(
      DataService.deleteItemById('rw7-missing'),
      throwsStateError,
    );
    expect((await SharedPreferences.getInstance()).getString('items'), raw);
  });

  test('full listing catalog rejects create without pruning retained media',
      () async {
    final full = List<Item>.generate(
      1000,
      (index) => buildTestItem(
        id: '${index + 1}',
        ownerId: accountA.id,
        title: 'Retained $index',
      ),
    );
    final raw = jsonEncode(full.map((item) => item.toJson()).toList());
    SharedPreferences.setMockInitialValues(<String, Object>{
      ...catalogState(full),
      'items': raw,
    });
    await useAccount(accountA);

    await expectLater(
      DataService.addItem(
        buildTestItem(id: 'overflow', ownerId: accountA.id),
      ),
      throwsStateError,
    );
    expect((await SharedPreferences.getInstance()).getString('items'), raw);
  });

  test('storage failure preserves exact bytes and does not poison the queue',
      () async {
    final original = buildTestItem(id: 'rw7-failure', ownerId: accountA.id);
    final raw = jsonEncode(<Object>[original.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{
      ...catalogState(<Item>[original]),
      'items': raw,
    });
    await useAccount(accountA);

    DataService.failNextListingPersistenceForTesting();
    await expectLater(
      DataService.updateItemStatus(itemId: original.id, status: 'paused'),
      throwsStateError,
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('items'), raw);

    await DataService.updateItemStatus(itemId: original.id, status: 'paused');
    final recovered = (await DataService.getItems()).single;
    expect(recovered.status, 'paused');
    expect(recovered.catalogRevision, 2);
  });

  test('privacy export and deletion deactivation stay current-owner scoped',
      () async {
    final ownedA = buildTestItem(id: 'rw7-owned-a', ownerId: accountA.id);
    final ownedB = buildTestItem(id: 'rw7-owned-b', ownerId: accountB.id);
    SharedPreferences.setMockInitialValues(
      catalogState(<Item>[ownedA, ownedB]),
    );
    await useAccount(accountA);

    final exportA = await DataService.exportOwnedListingsForPrivacy();
    expect(exportA['accountId'], accountA.id);
    expect(
      (exportA['listings'] as List)
          .map((entry) => (entry as Map)['id'].toString()),
      <String>[ownedA.id],
    );

    await expectLater(
      DataService.deactivateAllListingsForUser(accountB.id),
      throwsStateError,
    );
    await DataService.deactivateAllListingsForUser(accountA.id);
    final retained = await DataService.getItems();
    expect(
      retained.singleWhere((item) => item.id == ownedA.id).status,
      'ended',
    );
    expect(
      retained.singleWhere((item) => item.id == ownedB.id).status,
      'active',
    );

    await useAccount(accountB);
    final exportB = await DataService.exportOwnedListingsForPrivacy();
    expect(exportB['accountId'], accountB.id);
    expect(
      (exportB['listings'] as List)
          .map((entry) => (entry as Map)['id'].toString()),
      <String>[ownedB.id],
    );
  });

  test('verified listing mutation survives process-style recreation', () async {
    final original = buildTestItem(id: 'rw7-restart', ownerId: accountA.id);
    SharedPreferences.setMockInitialValues(catalogState(<Item>[original]));
    await useAccount(accountA);
    await DataService.updateItemStatus(itemId: original.id, status: 'paused');

    final prefs = await SharedPreferences.getInstance();
    final persistedItems = prefs.getString('items')!;
    final persistedUser = prefs.getString('currentUser')!;
    final persistedSession = prefs.getString('auth_session_v1')!;
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': jsonEncode(<Object>[accountA.toJson(), accountB.toJson()]),
      'items': persistedItems,
      'currentUser': persistedUser,
      'auth_session_v1': persistedSession,
    });

    final restored = (await DataService.getItems()).single;
    expect(restored.status, 'paused');
    expect(restored.isActive, isFalse);
    expect(restored.catalogRevision, 2);
  });

  testWidgets('compact owner catalog preserves corruption behind retry',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    const corrupt = '[{"id":"broken"}]';
    SharedPreferences.setMockInitialValues(<String, Object>{
      ...catalogState(const <Item>[]),
      'items': corrupt,
    });
    await useAccount(accountA);

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: MyListingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Deine Anzeigen konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
    expect(find.text('Du hast noch keine Anzeige.'), findsNothing);
    final retry = find.widgetWithText(OutlinedButton, 'Erneut laden');
    expect(retry, findsOneWidget);
    expect(tester.getSize(retry).height, greaterThanOrEqualTo(48));
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('items'), corrupt);

    final recovered = buildTestItem(
      id: 'rw7-recovered-ui',
      ownerId: accountA.id,
      title: 'Recovered listing',
    );
    await prefs.setString('items', jsonEncode(<Object>[recovered.toJson()]));
    await tester.tap(retry);
    await tester.pumpAndSettle();
    expect(find.text('Recovered listing'), findsOneWidget);
    expect(
      find.text('Deine Anzeigen konnten nicht sicher geladen werden.'),
      findsNothing,
    );
  });

  testWidgets('open owner catalog replaces account A with account B only',
      (tester) async {
    final ownedA = buildTestItem(
      id: 'rw7-ui-a',
      ownerId: accountA.id,
      title: 'Account A listing',
    );
    final ownedB = buildTestItem(
      id: 'rw7-ui-b',
      ownerId: accountB.id,
      title: 'Account B listing',
    );
    SharedPreferences.setMockInitialValues(
      catalogState(<Item>[ownedA, ownedB]),
    );
    await useAccount(accountA);

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: const MaterialApp(home: MyListingsScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Account A listing'), findsOneWidget);
    expect(find.text('Account B listing'), findsNothing);

    await useAccount(accountB);
    SharedPersistenceSync.notify(SharedPersistenceSync.listingCatalogKey);
    await tester.pumpAndSettle();

    expect(find.text('Account A listing'), findsNothing);
    expect(find.text('Account B listing'), findsOneWidget);
  });
}
