import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/models/rental_cart.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const privateTitle = 'Synthetic A project only';

Future<void> clearFixtureSession() async {
  final session = (await AuthService.readSession())!;
  // Exercise the actual serialized epoch transition, without unrelated native
  // push/realtime cleanup in this isolated project-ownership widget test.
  final receipt = await AuthService.clearSessionOwnerIfMatches(
      AuthService.captureSessionOwner(session),
      runLogoutCleanup: false);
  expect(receipt, isNotNull);
}

Future<void> useAccount(String role, {bool notify = true}) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': 'synthetic-cart-$role',
        'sessionId': 'synthetic-cart-session-$role',
        'email': 'cart-$role@example.invalid',
        'createdAt': '2026-09-04T00:00:00.000Z',
      }));
  if (!notify) return;
  for (final key in [
    SharedPersistenceSync.wishlistStateKey,
    SharedPersistenceSync.savedItemsKey,
    SharedPersistenceSync.rentalCartKey,
    SharedPersistenceSync.accountSecurityStateKey
  ]) {
    SharedPersistenceSync.notify(key);
  }
}

Future<GlobalKey<NavigatorState>> openProject(
  WidgetTester tester, {
  Future<RentalCartProject> Function(String, LocalPrincipalActionOwner)?
      creator,
}) async {
  tester.view.physicalSize = const Size(1000, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final navigator = GlobalKey<NavigatorState>();
  await tester.pumpWidget(ChangeNotifierProvider<LocalizationController>(
    create: (_) => LocalizationController(),
    child: MaterialApp(
        navigatorKey: navigator,
        home: RentalCartScreen(projectCreator: creator)),
  ));
  await tester.pumpAndSettle();
  expect(find.text('Projekt anlegen'), findsOneWidget);
  await tester.tap(find.text('Projekt anlegen'));
  await tester.pumpAndSettle();
  expect(find.text('Neues Projekt'), findsOneWidget);
  await tester.enterText(find.byType(TextField), privateTitle);
  return navigator;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({'items': '[]'});
    await useAccount('a');
  });

  testWidgets('stable A project creation control persists exactly in A',
      (tester) async {
    await openProject(tester);
    await tester.tap(find.text('Erstellen'));
    await tester.pumpAndSettle();
    expect((await DataService.getRentalCart()).projects.map((p) => p.title),
        [privateTitle]);
    await useAccount('b');
    expect((await DataService.getRentalCart()).projects, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets('A project draft must close on B switch without closing B dialog',
      (tester) async {
    final navigator = await openProject(tester);
    await useAccount('b');
    unawaited(navigator.currentState!.push<void>(DialogRoute<void>(
      context: navigator.currentContext!,
      builder: (_) => const AlertDialog(title: Text('B owned dialog')),
    )));
    await tester.pumpAndSettle();
    expect(find.text('B owned dialog'), findsOneWidget);
    expect(find.text('Neues Projekt', skipOffstage: false), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets('A project dialog result may never create a project under B',
      (tester) async {
    await openProject(tester);
    await useAccount('b');
    await tester.pumpAndSettle();
    // If invalidated properly there is nothing left to confirm. Otherwise
    // demonstrate the existing path using only isolated mock preferences.
    if (find.text('Erstellen').evaluate().isNotEmpty) {
      await tester.tap(find.text('Erstellen'));
      await tester.pumpAndSettle();
    }
    expect((await DataService.getRentalCart()).projects, isEmpty,
        reason:
            'A-owned text must not be persisted in B after a delayed dialog result.');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets('silent B replacement cannot receive a delayed A draft',
      (tester) async {
    await openProject(tester);
    await useAccount('b', notify: false);
    await tester.tap(find.text('Erstellen'));
    await tester.pumpAndSettle();
    expect((await DataService.getRentalCart()).projects, isEmpty);
    expect(find.text('Projekt konnte nicht bestätigt werden'), findsNothing);
  });

  for (final success in [true, false]) {
    testWidgets(
        'late A project ${success ? 'success' : 'failure'} never disturbs B',
        (tester) async {
      final reply = Completer<RentalCartProject>();
      var calls = 0;
      final navigator = await openProject(tester, creator: (title, owner) {
        calls++;
        expect(title, privateTitle);
        expect(owner.sessionOwner?.userId, 'synthetic-cart-a');
        return reply.future;
      });
      await tester.tap(find.text('Erstellen'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(calls, 1);
      await useAccount('b');
      unawaited(navigator.currentState!.push<void>(DialogRoute<void>(
        context: navigator.currentContext!,
        builder: (_) => const AlertDialog(title: Text('B owned dialog')),
      )));
      if (success) {
        reply.complete(
            const RentalCartProject(id: 'synthetic-a', title: privateTitle));
      } else {
        reply.completeError(StateError('Synthetic uncertain A outcome'));
      }
      await tester.pumpAndSettle();
      expect(find.text('B owned dialog'), findsOneWidget);
      expect(find.text(privateTitle), findsNothing);
      expect(find.text('Projekt konnte nicht bestätigt werden'), findsNothing);
      expect((await DataService.getRentalCart()).projects, isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }

  testWidgets('confirmed guest can still create a local project',
      (tester) async {
    await clearFixtureSession();
    await openProject(tester);
    await tester.tap(find.text('Erstellen'));
    await tester.pumpAndSettle();
    expect((await DataService.getRentalCart()).projects.single.title,
        privateTitle);
  });

  testWidgets('guest draft cannot adopt a newly signed-in account',
      (tester) async {
    await clearFixtureSession();
    await openProject(tester);
    await useAccount('b');
    await tester.pumpAndSettle();
    expect(find.text('Neues Projekt'), findsNothing);
    expect((await DataService.getRentalCart()).projects, isEmpty);
  });

  test('same A identity after an actual logout does not revive an old epoch',
      () async {
    final owner = await LocalPrincipalActionOwner.capture();
    await clearFixtureSession();
    await useAccount('a');
    expect(await owner.isCurrent(), isFalse);
    await expectLater(
        DataService.addRentalCartProject(
            title: privateTitle, expectedOwner: owner),
        throwsStateError);
    expect((await DataService.getRentalCart()).projects, isEmpty);
  });

  test('malformed stored session is never confirmed guest authority', () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_session_v1', '{"unexpected":"shape"}');
    await expectLater(LocalPrincipalActionOwner.capture(), throwsStateError);
  });
}
