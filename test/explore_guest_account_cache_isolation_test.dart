import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/explore_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    QaRuntimeService.reset();
  });

  test('authenticated backend explore uses the dedicated public catalog', () {
    expect(
      DataService.shouldUseDedicatedPublicRemoteCatalog(
        backendEnabled: true,
        qaRuntimeEnabled: false,
      ),
      isTrue,
    );
    expect(
      DataService.shouldUseDedicatedPublicRemoteCatalog(
        backendEnabled: true,
        qaRuntimeEnabled: true,
      ),
      isFalse,
    );
  });

  testWidgets(
    'guest catalog ignores and preserves a corrupt local account cache',
    (tester) async {
      const corruptUsers = '[{"id":"broken-local-account"}]';
      final listing = Item.fromJson(<String, dynamic>{
        ...buildTestItem(
          id: 'guest-visible-listing',
          ownerId: 'remote-owner',
          title: 'Guest visible listing',
        ).toJson(),
        'photos': const <String>[],
      });
      SharedPreferences.setMockInitialValues(<String, Object>{
        'items': jsonEncode(<Object>[listing.toJson()]),
        'users': corruptUsers,
      });

      await tester.pumpWidget(
        MultiProvider(
          providers: <SingleChildWidget>[
            ChangeNotifierProvider<LocalizationController>(
              create: (_) => LocalizationController(),
            ),
            ChangeNotifierProvider<MainNavController>(
              create: (_) => MainNavController(),
            ),
          ],
          child: const MaterialApp(home: ExploreScreen()),
        ),
      );
      for (var attempt = 0;
          attempt < 20 && find.text('Guest visible listing').evaluate().isEmpty;
          attempt += 1) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      expect(find.text('Guest visible listing'), findsWidgets);
      expect(find.text('Anzeigen konnten nicht geladen werden.'), findsNothing);
      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getString('users'), corruptUsers);
    },
  );

  testWidgets(
    'authenticated catalog renders before account enrichment completes',
    (tester) async {
      final listing = Item.fromJson(<String, dynamic>{
        ...buildTestItem(
          id: 'authenticated-visible-listing',
          ownerId: 'remote-owner',
          title: 'Authenticated visible listing',
        ).toJson(),
        'photos': const <String>[],
      });
      final user = buildTestUser(
        'authenticated-renter',
        name: 'Authenticated renter',
        email: 'authenticated-renter@example.invalid',
      );
      SharedPreferences.setMockInitialValues(<String, Object>{
        'items': jsonEncode(<Object>[listing.toJson()]),
        'users': jsonEncode(<Object>[user.toJson()]),
        'currentUser': jsonEncode(user.toJson()),
        'auth_session_v1': jsonEncode(<String, Object>{
          'email': user.email,
          'createdAt': DateTime.utc(2026, 9, 2).toIso8601String(),
        }),
      });

      await tester.pumpWidget(
        MultiProvider(
          providers: <SingleChildWidget>[
            ChangeNotifierProvider<LocalizationController>(
              create: (_) => LocalizationController(),
            ),
            ChangeNotifierProvider<MainNavController>(
              create: (_) => MainNavController(),
            ),
          ],
          child: MaterialApp(
            home: ExploreScreen(
              profileMutationService: _NeverCompletingProfileService(),
              listingMutationService: const ListingMutationService(),
            ),
          ),
        ),
      );
      for (var attempt = 0;
          attempt < 30 &&
              find.text('Authenticated visible listing').evaluate().isEmpty;
          attempt += 1) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      expect(find.text('Authenticated visible listing'), findsWidgets);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Anzeigen konnten nicht geladen werden.'), findsNothing);
    },
  );
}

class _NeverCompletingProfileService extends ProfileMutationService {
  final Completer<ProfileMutationContext?> _completer =
      Completer<ProfileMutationContext?>();

  @override
  Future<ProfileMutationContext?> loadCurrentContext() => _completer.future;
}
