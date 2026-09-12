import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> expectStoredValues(Map<String, String> expected) async {
    final prefs = await SharedPreferences.getInstance();
    for (final entry in expected.entries) {
      expect(prefs.getString(entry.key), entry.value, reason: entry.key);
    }
  }

  test('missing category cache never rewrites local account or listing data',
      () async {
    final user = buildTestUser(
      'catalog-owner',
      name: 'Catalog Owner',
      email: 'catalog-owner@example.invalid',
    );
    final listing = buildTestItem(
      id: 'catalog-listing',
      ownerId: user.id,
      title: 'Persisted owner listing',
    );
    final usersJson = jsonEncode(<Object>[user.toJson()]);
    final currentUserJson = jsonEncode(user.toJson());
    final itemsJson = jsonEncode(<Object>[listing.toJson()]);
    SharedPreferences.setMockInitialValues(<String, Object>{
      'users': usersJson,
      'currentUser': currentUserJson,
      'items': itemsJson,
      'reviews': '[]',
    });

    final categories = await DataService.getCategories();

    expect(categories, isNotEmpty);
    expect(categories.any((category) => category.id == 'cat8'), isTrue);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('users'), usersJson);
    expect(prefs.getString('currentUser'), currentUserJson);
    expect(prefs.getString('items'), itemsJson);
    expect(prefs.getString('reviews'), '[]');
  });

  test('missing listing cache is empty and never initializes demo data',
      () async {
    const preserved = <String, String>{
      'users': '[{"id":"preserved-user"}]',
      'currentUser': '{"id":"preserved-user"}',
      'reviews': '[{"id":"preserved-review"}]',
    };
    SharedPreferences.setMockInitialValues(<String, Object>{...preserved});

    expect(await DataService.getItems(), isEmpty);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey('items'), isFalse);
    await expectStoredValues(preserved);
  });

  test('an intentionally empty listing cache remains empty', () async {
    const preserved = <String, String>{
      'items': '[]',
      'users': '[{"id":"preserved-user"}]',
      'currentUser': '{"id":"preserved-user"}',
    };
    SharedPreferences.setMockInitialValues(<String, Object>{...preserved});

    expect(await DataService.getItems(), isEmpty);

    await expectStoredValues(preserved);
  });

  test('malformed listing cache fails closed without rewriting local data',
      () async {
    const preserved = <String, String>{
      'items': '{not-a-list}',
      'users': '[{"id":"preserved-user"}]',
      'currentUser': '{"id":"preserved-user"}',
      'reviews': '[{"id":"preserved-review"}]',
    };
    SharedPreferences.setMockInitialValues(<String, Object>{...preserved});

    await expectLater(DataService.getItems(), throwsFormatException);

    await expectStoredValues(preserved);
  });

  test('missing user cache is empty and never rewrites other stores', () async {
    const preserved = <String, String>{
      'items': '[]',
      'currentUser': '{"id":"preserved-user"}',
      'reviews': '[{"id":"preserved-review"}]',
    };
    SharedPreferences.setMockInitialValues(<String, Object>{...preserved});

    expect(await DataService.getUsers(), isEmpty);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey('users'), isFalse);
    await expectStoredValues(preserved);
  });
}
