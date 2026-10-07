import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> useAccount(String email) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'email': email,
        'createdAt': '2026-08-25T00:00:00.000Z',
      }),
    );
  }

  Future<void> useGuest() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_session_v1');
  }

  test('account A, guest and account B retain isolated saved state', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{'items': '[]'});

    await useAccount('account-a@example.invalid');
    await DataService.setItemWishlist('item-a', DataService.wlSoonId);
    await DataService.toggleSavedItem('legacy-a');
    await DataService.addCustomWishlist('Nur Konto A');

    await useGuest();
    expect(await DataService.getSavedItemIds(), isEmpty);
    expect(
      (await DataService.getWishlists()).map((entry) => entry['name']),
      isNot(contains('Nur Konto A')),
    );
    await DataService.setItemWishlist('item-guest', DataService.wlLaterId);

    await useAccount('account-b@example.invalid');
    expect(await DataService.getSavedItemIds(), isEmpty);
    await DataService.setItemWishlist('item-b', DataService.wlAgainId);

    await useAccount('account-a@example.invalid');
    expect(
      await DataService.getSavedItemIds(),
      containsAll(<String>['item-a', 'legacy-a']),
    );
    expect(await DataService.getSavedItemIds(), isNot(contains('item-b')));
    expect(await DataService.getSavedItemIds(), isNot(contains('item-guest')));
    expect(
      (await DataService.getWishlists()).map((entry) => entry['name']),
      contains('Nur Konto A'),
    );

    await useGuest();
    expect(await DataService.getSavedItemIds(), <String>{'item-guest'});
  });

  test('account A, guest and account B retain isolated local carts', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});

    await useAccount('account-a@example.invalid');
    await DataService.addRentalCartProject(title: 'Projekt A');

    await useGuest();
    expect((await DataService.getRentalCart()).projects, isEmpty);
    await DataService.addRentalCartProject(title: 'Gastprojekt');

    await useAccount('account-b@example.invalid');
    expect((await DataService.getRentalCart()).projects, isEmpty);
    await DataService.addRentalCartProject(title: 'Projekt B');

    await useAccount('account-a@example.invalid');
    expect(
      (await DataService.getRentalCart()).projects.map((entry) => entry.title),
      <String>['Projekt A'],
    );

    await useGuest();
    expect(
      (await DataService.getRentalCart()).projects.map((entry) => entry.title),
      <String>['Gastprojekt'],
    );
  });

  test('unscoped legacy data migrates to guest, never the signed-in account',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': '[]',
      'wishlist_state_v2': jsonEncode(<String, Object>{
        'schemaVersion': 1,
        'revision': 4,
        'lists': <Map<String, Object>>[
          <String, Object>{
            'id': DataService.wlSoonId,
            'name': 'Demnächst benötigt',
            'system': true,
          },
        ],
        'assignments': <String, String>{
          'legacy-guest-item': DataService.wlSoonId,
        },
      }),
      'rental_cart_v1': jsonEncode(<String, Object>{
        'schemaVersion': 1,
        'revision': 3,
        'reservationCreated': false,
        'projects': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'legacy-guest-project',
            'title': 'Legacy Gast',
            'answers': <String, Object>{},
            'sortOrder': 0,
          },
        ],
        'items': <Object>[],
      }),
    });

    await useAccount('new-account@example.invalid');
    expect(await DataService.getSavedItemIds(), isEmpty);
    expect((await DataService.getRentalCart()).projects, isEmpty);

    await useGuest();
    expect(
      await DataService.getSavedItemIds(),
      contains('legacy-guest-item'),
    );
    expect(
      (await DataService.getRentalCart()).projects.single.title,
      'Legacy Gast',
    );
  });

  test('privacy export and deletion affect only the active account', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{'items': '[]'});

    await useAccount('account-a@example.invalid');
    await DataService.setItemWishlist('private-a', DataService.wlSoonId);
    await DataService.addRentalCartProject(title: 'Privat A');

    await useAccount('account-b@example.invalid');
    await DataService.setItemWishlist('private-b', DataService.wlLaterId);
    await DataService.addRentalCartProject(title: 'Privat B');

    final exportB = await DataService.exportSavedItemsForPrivacy();
    expect(exportB['principalScope'], 'authenticated-account');
    expect(exportB['itemAssignments'],
        containsPair('private-b', DataService.wlLaterId));
    expect(exportB['itemAssignments'], isNot(contains('private-a')));
    expect(
      ((exportB['rentalCart'] as Map)['projects'] as List)
          .map((entry) => (entry as Map)['title']),
      <String>['Privat B'],
    );

    await DataService.clearSavedItemsForAccountDeletion();
    expect(await DataService.getSavedItemIds(), isEmpty);
    expect((await DataService.getRentalCart()).projects, isEmpty);

    await useAccount('account-a@example.invalid');
    expect(await DataService.getSavedItemIds(), contains('private-a'));
    expect(
      (await DataService.getRentalCart()).projects.single.title,
      'Privat A',
    );
  });

  test('opaque principal documents survive process-style recreation', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{'items': '[]'});
    await useAccount('recreate-a@example.invalid');
    await DataService.setItemWishlist('recreate-a', DataService.wlSoonId);
    await DataService.addRentalCartProject(title: 'Neustart A');
    await useAccount('recreate-b@example.invalid');
    await DataService.setItemWishlist('recreate-b', DataService.wlLaterId);
    await DataService.addRentalCartProject(title: 'Neustart B');

    final before = await SharedPreferences.getInstance();
    final savedDocument = before.getString('wishlist_state_v3')!;
    final cartDocument = before.getString('rental_cart_v2')!;
    expect(savedDocument, isNot(contains('recreate-a@example.invalid')));
    expect(savedDocument, isNot(contains('recreate-b@example.invalid')));
    expect(cartDocument, isNot(contains('recreate-a@example.invalid')));
    expect(cartDocument, isNot(contains('recreate-b@example.invalid')));

    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': '[]',
      'wishlist_state_v3': savedDocument,
      'rental_cart_v2': cartDocument,
    });
    await useAccount('recreate-a@example.invalid');
    expect(await DataService.getSavedItemIds(), <String>{'recreate-a'});
    expect(
      (await DataService.getRentalCart()).projects.single.title,
      'Neustart A',
    );
    await useAccount('recreate-b@example.invalid');
    expect(await DataService.getSavedItemIds(), <String>{'recreate-b'});
    expect(
      (await DataService.getRentalCart()).projects.single.title,
      'Neustart B',
    );
  });

  test('corrupt unattributed legacy is quarantined away from accounts',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': '[]',
      'wishlist_state_v2': '{corrupt-legacy-saved',
      'rental_cart_v1': '{corrupt-legacy-cart',
    });
    await useAccount('safe-account@example.invalid');

    await DataService.setItemWishlist('safe-item', DataService.wlAgainId);
    await DataService.addRentalCartProject(title: 'Sicheres Konto');
    expect(await DataService.getSavedItemIds(), contains('safe-item'));
    expect(
      (await DataService.getRentalCart()).projects.single.title,
      'Sicheres Konto',
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wishlist_state_v2'), '{corrupt-legacy-saved');
    expect(prefs.getString('rental_cart_v1'), '{corrupt-legacy-cart');
    expect(
      (jsonDecode(prefs.getString('wishlist_state_v3')!)
          as Map)['legacyGuestQuarantined'],
      isTrue,
    );
    expect(
      (jsonDecode(prefs.getString('rental_cart_v2')!)
          as Map)['legacyGuestQuarantined'],
      isTrue,
    );

    await useGuest();
    await expectLater(
      DataService.getSavedItemIds(),
      throwsA(isA<FormatException>()),
    );
    await expectLater(
      DataService.getRentalCart(),
      throwsA(isA<FormatException>()),
    );
  });

  test('principal tokens are stable opaque values without identifiers', () {
    final emailSession = AuthSession(
      email: 'owner@example.invalid',
      createdAt: DateTime.utc(2026, 8, 25),
    );
    final userIdSession = AuthSession(
      userId: 'synthetic-user-a',
      email: 'owner@example.invalid',
      createdAt: DateTime.utc(2026, 8, 25),
    );
    final emailToken = DataService.localPrincipalTokenForSession(emailSession);
    final repeated = DataService.localPrincipalTokenForSession(emailSession);
    final userIdToken =
        DataService.localPrincipalTokenForSession(userIdSession);

    expect(emailToken, matches(RegExp(r'^p_[a-f0-9]{64}$')));
    expect(emailToken, repeated);
    expect(emailToken, isNot(contains('owner')));
    expect(userIdToken, isNot(emailToken));
    expect(DataService.localPrincipalTokenForSession(null), 'guest');
  });

  test('login and logout announce every principal-scoped surface', () async {
    final fixturePassword = <String>['local', 'fixture', 'only'].join('-');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_seeded_v1': true,
      'auth_accounts_v1': jsonEncode(<Map<String, Object>>[
        <String, Object>{
          'email': 'events@example.invalid',
          'password': fixturePassword,
          'createdAt': '2026-08-25T00:00:00.000Z',
        },
      ]),
    });
    final events = <String>[];
    final subscription = SharedPersistenceSync.changes.listen(events.add);
    addTearDown(subscription.cancel);

    final result = await AuthService.signInWithEmailPassword(
      email: 'events@example.invalid',
      password: fixturePassword,
    );
    expect(result.ok, isTrue);
    expect(events, contains(SharedPersistenceSync.wishlistStateKey));
    expect(events, contains(SharedPersistenceSync.savedItemsKey));
    expect(events, contains(SharedPersistenceSync.rentalCartKey));

    events.clear();
    await AuthService.clearSession();
    expect(events, contains(SharedPersistenceSync.wishlistStateKey));
    expect(events, contains(SharedPersistenceSync.savedItemsKey));
    expect(events, contains(SharedPersistenceSync.rentalCartKey));
  });

  test('invoked mutations cannot cross an immediate session replacement',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{'items': '[]'});
    await useAccount('switch-a@example.invalid');

    final savedForA = DataService.setItemWishlist(
      'switch-a-item',
      DataService.wlSoonId,
    );
    final cartForA = DataService.addRentalCartProject(title: 'Wechsel A');
    // Project dispatch now explicitly cancels when its initiating session
    // changes. Neither A nor B receives an unconfirmed project mutation.
    final cartCancelled = expectLater(cartForA, throwsStateError);
    await useAccount('switch-b@example.invalid');
    await savedForA;
    await cartCancelled;

    expect(await DataService.getSavedItemIds(), isEmpty);
    expect((await DataService.getRentalCart()).projects, isEmpty);
    await useAccount('switch-a@example.invalid');
    expect(await DataService.getSavedItemIds(), <String>{'switch-a-item'});
    expect((await DataService.getRentalCart()).projects, isEmpty);
  });

  test('principal registry is bounded without evicting earlier state',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{'items': '[]'});
    for (var index = 0; index < 11; index += 1) {
      await useAccount('bounded-$index@example.invalid');
      await DataService.setItemWishlist(
        'bounded-item-$index',
        DataService.wlSoonId,
      );
    }
    await useAccount('bounded-overflow@example.invalid');
    await expectLater(
      DataService.setItemWishlist('overflow-item', DataService.wlSoonId),
      throwsStateError,
    );

    await useAccount('bounded-0@example.invalid');
    expect(await DataService.getSavedItemIds(), contains('bounded-item-0'));
  });

  test('one corrupt saved bucket is quarantined without blocking another',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{'items': '[]'});
    const accountA = 'bucket-saved-a@example.invalid';
    const accountB = 'bucket-saved-b@example.invalid';
    await useAccount(accountA);
    await DataService.setItemWishlist('safe-a', DataService.wlSoonId);
    await useAccount(accountB);
    await DataService.setItemWishlist('corrupt-b', DataService.wlLaterId);

    final tokenB = DataService.localPrincipalTokenForSession(
      AuthSession(
        email: accountB,
        createdAt: DateTime.utc(2026, 8, 25),
      ),
    );
    final prefs = await SharedPreferences.getInstance();
    final document = jsonDecode(prefs.getString('wishlist_state_v3')!) as Map;
    final principals = document['principals'] as Map;
    final corruptBucket = Map<String, dynamic>.from(principals[tokenB] as Map)
      ..['assignments'] = 'corrupt-bucket';
    principals[tokenB] = corruptBucket;
    await prefs.setString('wishlist_state_v3', jsonEncode(document));

    await useAccount(accountA);
    expect(await DataService.getSavedItemIds(), <String>{'safe-a'});
    await DataService.setItemWishlist('safe-a-2', DataService.wlAgainId);
    final rewritten = jsonDecode(prefs.getString('wishlist_state_v3')!) as Map;
    expect((rewritten['principals'] as Map)[tokenB], corruptBucket);

    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': '[]',
      'wishlist_state_v3': prefs.getString('wishlist_state_v3')!,
    });
    await useAccount(accountA);
    expect(
      await DataService.getSavedItemIds(),
      containsAll(<String>['safe-a', 'safe-a-2']),
    );
    await useAccount(accountB);
    await expectLater(
      DataService.getSavedItemIds(),
      throwsA(isA<FormatException>()),
    );
  });

  test('one corrupt cart bucket is quarantined without blocking another',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    const accountA = 'bucket-cart-a@example.invalid';
    const accountB = 'bucket-cart-b@example.invalid';
    await useAccount(accountA);
    await DataService.addRentalCartProject(title: 'Sicher A');
    await useAccount(accountB);
    await DataService.addRentalCartProject(title: 'Defekt B');

    final tokenB = DataService.localPrincipalTokenForSession(
      AuthSession(
        email: accountB,
        createdAt: DateTime.utc(2026, 8, 25),
      ),
    );
    final prefs = await SharedPreferences.getInstance();
    final document = jsonDecode(prefs.getString('rental_cart_v2')!) as Map;
    final principals = document['principals'] as Map;
    final corruptBucket = Map<String, dynamic>.from(principals[tokenB] as Map);
    final corruptCart = Map<String, dynamic>.from(corruptBucket['cart'] as Map)
      ..['items'] = 'corrupt-bucket';
    corruptBucket['cart'] = corruptCart;
    principals[tokenB] = corruptBucket;
    await prefs.setString('rental_cart_v2', jsonEncode(document));

    await useAccount(accountA);
    expect(
        (await DataService.getRentalCart()).projects.single.title, 'Sicher A');
    await DataService.addRentalCartProject(title: 'Sicher A2');
    final rewritten = jsonDecode(prefs.getString('rental_cart_v2')!) as Map;
    expect((rewritten['principals'] as Map)[tokenB], corruptBucket);

    SharedPreferences.setMockInitialValues(<String, Object>{
      'rental_cart_v2': prefs.getString('rental_cart_v2')!,
    });
    await useAccount(accountA);
    expect(
      (await DataService.getRentalCart()).projects.map((entry) => entry.title),
      <String>['Sicher A', 'Sicher A2'],
    );
    await useAccount(accountB);
    await expectLater(
      DataService.getRentalCart(),
      throwsA(isA<FormatException>()),
    );
  });

  testWidgets('compact open search follows account switches and corruption',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final item = buildTestItem(id: 'principal-ui-item', ownerId: 'owner');
    SharedPreferences.setMockInitialValues(<String, Object>{
      'items': jsonEncode(<Object>[item.toJson()]),
    });
    await useAccount('ui-a@example.invalid');
    await DataService.setItemWishlist(item.id, DataService.wlSoonId);

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>(
        create: (_) => LocalizationController(),
        child: MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 568),
              textScaler: TextScaler.linear(2),
            ),
            child: SearchResultsScreen(
              queryText: 'Principalwechsel',
              results: [item],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.favorite), findsOneWidget);

    await useAccount('ui-b@example.invalid');
    SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);

    final prefs = await SharedPreferences.getInstance();
    final lastKnownGood = prefs.getString('wishlist_state_v3')!;
    await prefs.setString('wishlist_state_v3', '{corrupt-principal-state');
    SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
    await tester.pumpAndSettle();
    expect(
      find.text('Gemerkt-Status konnte nicht geladen werden'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.favorite), findsNothing);

    await prefs.setString('wishlist_state_v3', lastKnownGood);
    SharedPersistenceSync.notify(SharedPersistenceSync.wishlistStateKey);
    await tester.pumpAndSettle();
    expect(
      find.text('Gemerkt-Status konnte nicht geladen werden'),
      findsNothing,
    );
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);
  });
}
