import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/blocked_users_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/profile_ecosystem_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    final viewer = _viewer();
    SharedPreferences.setMockInitialValues({
      'items': jsonEncode([
        _item(id: 'blocked-item', ownerId: 'blocked-owner').toJson(),
        _item(id: 'visible-item', ownerId: 'visible-owner').toJson(),
      ]),
      'users': jsonEncode([
        viewer.toJson(),
        _profile(id: 'blocked-owner', displayName: 'Julia').toJson(),
        _profile(id: 'visible-owner', displayName: 'Mika').toJson(),
      ]),
      'rental_requests': '[]',
      'wishlist_assign_v1': '{}',
      'blocked_user_ids_v1': jsonEncode(['blocked-owner']),
      'qa_messages_notifs_seeded_v3_for_viewer': true,
      'qa_messages_notifs_seeded_v3_for_blocked-owner': true,
      'qa_messages_notifs_seeded_v3_for_visible-owner': true,
    });
    await DataService.setCurrentUser(viewer);
  });

  test('guest discovery never requires the authenticated block-list API', () {
    expect(
      BlockedUsersService.shouldUseRemoteStore(
        backendEnabled: true,
        qaRuntimeEnabled: false,
        hasAuthenticatedSession: false,
      ),
      isFalse,
    );
    expect(
      BlockedUsersService.shouldUseRemoteStore(
        backendEnabled: true,
        qaRuntimeEnabled: false,
        hasAuthenticatedSession: true,
      ),
      isTrue,
    );
    expect(
      BlockedUsersService.shouldUseRemoteStore(
        backendEnabled: true,
        qaRuntimeEnabled: true,
        hasAuthenticatedSession: true,
      ),
      isFalse,
    );
  });

  test(
      'Blockieren -> Liste -> Entblockieren entfernt Eintrag und stellt Sichtbarkeit wieder her',
      () async {
    expect(await BlockedUsersService.isBlocked('blocked-owner'), isTrue);

    final blockedGuardBefore =
        await ProfileEcosystemService.canViewPublicProfile(
      profileUserId: 'blocked-owner',
      currentUserId: 'viewer',
    );
    expect(blockedGuardBefore.allowed, isFalse);

    final publicItemsBefore = await DataService.getPublicItems();
    expect(
      publicItemsBefore.map((item) => item.ownerId),
      isNot(contains('blocked-owner')),
    );

    await BlockedUsersService.unblockUser('blocked-owner');

    expect(await BlockedUsersService.isBlocked('blocked-owner'), isFalse);

    final blockedGuardAfter =
        await ProfileEcosystemService.canViewPublicProfile(
      profileUserId: 'blocked-owner',
      currentUserId: 'viewer',
    );
    expect(blockedGuardAfter.allowed, isTrue);

    final publicItemsAfter = await DataService.getPublicItems();
    expect(
      publicItemsAfter.map((item) => item.ownerId),
      contains('blocked-owner'),
    );
  });
}

User _viewer() => User(
      id: 'viewer',
      displayName: 'Viewer',
      email: 'viewer@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 4.8,
      reviewCount: 12,
      createdAt: DateTime(2025, 1, 1),
    );

User _profile({required String id, required String displayName}) => User(
      id: id,
      displayName: displayName,
      email: '$id@example.com',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 4.6,
      reviewCount: 8,
      createdAt: DateTime(2025, 1, 1),
    );

Item _item({required String id, required String ownerId}) => Item.fromJson({
      'id': id,
      'ownerId': ownerId,
      'title': 'Artikel $id',
      'description': 'Beschreibung',
      'categoryId': 'tools',
      'subcategory': 'Werkzeuge',
      'tags': <String>[],
      'pricePerDay': 12,
      'currency': 'EUR',
      'priceUnit': 'day',
      'priceRaw': 12,
      'autoApplyDiscounts': false,
      'longRentalDiscounts': <Map<String, dynamic>>[],
      'photos': <String>[],
      'locationText': 'Berlin',
      'lat': 52.52,
      'lng': 13.4,
      'geohash': 'u33dc1',
      'condition': 'gut',
      'minDays': 1,
      'maxDays': 7,
      'createdAt': DateTime(2026, 1, 1).toIso8601String(),
      'isActive': true,
      'status': 'active',
      'city': 'Berlin',
      'country': 'Deutschland',
    });
