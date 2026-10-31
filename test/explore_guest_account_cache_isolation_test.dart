import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/explore_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/auth_service.dart';
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

  testWidgets(
    'public catalog failure keeps the catalog error before any commit',
    (tester) async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        'items': '[{"invalid":"synthetic"}]',
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
          attempt < 20 &&
              find
                  .text('Anzeigen konnten nicht geladen werden.')
                  .evaluate()
                  .isEmpty;
          attempt += 1) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      expect(
          find.text('Anzeigen konnten nicht geladen werden.'), findsOneWidget);
    },
  );

  testWidgets(
    'public catalog stays visible when optional account enrichment fails',
    (tester) async {
      final listing = buildTestItem(
        id: 'public-before-enrichment-failure',
        ownerId: 'synthetic-public-owner',
        title: 'Public before enrichment failure',
      );
      final user = buildTestUser(
        'enrichment-failure-owner',
        name: 'Synthetic enrichment owner',
        email: 'enrichment-failure@example.invalid',
      );
      SharedPreferences.setMockInitialValues(<String, Object>{
        'items': jsonEncode(<Object>[listing.toJson()]),
        'users': jsonEncode(<Object>[user.toJson()]),
        'currentUser': jsonEncode(user.toJson()),
        'auth_session_v1': jsonEncode(<String, Object>{
          'userId': user.id,
          'sessionId': 'synthetic-enrichment-failure-session',
          'email': user.email,
          'createdAt': DateTime.utc(2026, 9, 2).toIso8601String(),
          'accessToken': 'synthetic-enrichment-failure-access',
          'refreshToken': 'synthetic-enrichment-failure-refresh',
          'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
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
              profileMutationService: _FailingProfileService(),
              listingMutationService: const ListingMutationService(),
            ),
          ),
        ),
      );
      for (var attempt = 0;
          attempt < 30 &&
              find.text('Public before enrichment failure').evaluate().isEmpty;
          attempt += 1) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Public before enrichment failure'), findsWidgets);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Anzeigen konnten nicht geladen werden.'), findsNothing);
    },
  );

  testWidgets(
    'A-to-guest enrichment failure keeps public snapshot and drops A context',
    (tester) async {
      final listing = buildTestItem(
        id: 'public-through-owner-clear',
        ownerId: 'synthetic-public-owner',
        title: 'Public through owner clear',
      );
      final user = buildTestUser(
        'owner-cleared-during-enrichment',
        name: 'Synthetic owner cleared during enrichment',
        email: 'owner-cleared-during-enrichment@example.invalid',
      );
      SharedPreferences.setMockInitialValues(<String, Object>{
        'items': jsonEncode(<Object>[listing.toJson()]),
        'users': jsonEncode(<Object>[user.toJson()]),
        'currentUser': jsonEncode(user.toJson()),
        'auth_session_v1': jsonEncode(<String, Object>{
          'userId': user.id,
          'sessionId': 'synthetic-owner-cleared-session',
          'email': user.email,
          'createdAt': DateTime.utc(2026, 9, 2).toIso8601String(),
          'accessToken': 'synthetic-owner-cleared-access',
          'refreshToken': 'synthetic-owner-cleared-refresh',
          'accessTokenExpiresAt': '2099-01-01T00:00:00Z',
        }),
      });
      final profileService = _BlockingFailureProfileService();

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
              profileMutationService: profileService,
              listingMutationService: const ListingMutationService(),
            ),
          ),
        ),
      );
      for (var attempt = 0;
          attempt < 30 &&
              find.text('Public through owner clear').evaluate().isEmpty;
          attempt += 1) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await profileService.started.future;
      final session = await AuthService.readSession();
      expect(session, isNotNull);
      final clear = await AuthService.clearSessionOwnerIfMatches(
        AuthService.captureSessionOwner(session!),
        runLogoutCleanup: false,
      );
      expect(clear, isNotNull);
      profileService.release.complete();

      for (var attempt = 0;
          attempt < 20 &&
              find.text('Public through owner clear').evaluate().isEmpty;
          attempt += 1) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Public through owner clear'), findsWidgets);
      expect(find.text('Anzeigen konnten nicht geladen werden.'), findsNothing);
      expect(
          find.text('Synthetic owner cleared during enrichment'), findsNothing);
      expect(await AuthService.readSession(), isNull);
    },
  );
}

class _NeverCompletingProfileService extends ProfileMutationService {
  final Completer<ProfileMutationContext?> _completer =
      Completer<ProfileMutationContext?>();

  @override
  Future<ProfileMutationContext?> loadCurrentContext() => _completer.future;
}

class _FailingProfileService extends ProfileMutationService {
  @override
  Future<ProfileMutationContext?> loadCurrentContext() async {
    throw StateError('Synthetic optional profile enrichment failure.');
  }
}

class _BlockingFailureProfileService extends ProfileMutationService {
  final Completer<void> started = Completer<void>();
  final Completer<void> release = Completer<void>();

  @override
  Future<ProfileMutationContext?> loadCurrentContext() async {
    started.complete();
    await release.future;
    throw StateError('Synthetic stale account enrichment failure.');
  }
}
