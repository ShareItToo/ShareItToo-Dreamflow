import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/saved_cart_action_scope.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> useScopeRole(String role, {bool notify = true}) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
      'auth_session_v1',
      jsonEncode({
        'userId': 'synthetic-scope-$role',
        'sessionId': 'synthetic-scope-session-$role',
        'email': 'scope-$role@example.invalid',
        'createdAt': '2026-09-04T00:00:00Z',
      }));
  if (notify) {
    SharedPersistenceSync.notify(SharedPersistenceSync.accountSecurityStateKey);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await useScopeRole('a');
  });
  for (final kind in ['page', 'draft', 'general', 'notice']) {
    for (final mode in ['stable', 'switch', 'silent-switch', 'dispose']) {
      testWidgets('saved cart exact $kind ownership on $mode', (tester) async {
        final nav = GlobalKey<NavigatorState>();
        await tester.pumpWidget(MaterialApp(
            navigatorKey: nav, home: const Scaffold(body: Text('root'))));
        await tester.pumpAndSettle();
        final context = tester.element(find.text('root'));
        final owner = await LocalPrincipalActionOwner.capture();
        final scope =
            SavedCartActionScope(owner, isMounted: () => context.mounted);
        ValueChanged<String?>? oldComplete;
        Route<void>? page;
        final Future<Object?> pending;
        if (kind == 'page') {
          page = MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('A private page')));
          pending = scope.push<void>(context, page).then<Object?>((_) => null);
        } else if (kind == 'draft') {
          pending = scope.dialog<String>(context,
              icon: Icons.folder, title: 'A private draft', body: (complete) {
            oldComplete = complete;
            return TextButton(
                onPressed: () => complete('A result'),
                child: const Text('Confirm A'));
          });
        } else if (kind == 'general') {
          pending = scope.generalDialog<String>(context,
              barrierLabel: 'A general',
              barrierColor: Colors.transparent,
              transitionDuration: Duration.zero, pageBuilder: (complete) {
            oldComplete = complete;
            return (_, __, ___) =>
                const AlertDialog(title: Text('A private general'));
          });
        } else {
          pending = scope
              .notice(context, icon: Icons.info, title: 'A private notice')
              .then<Object?>((_) => null);
        }
        await tester.pumpAndSettle();
        expect(find.text('A private $kind'), findsOneWidget);
        if (mode == 'stable') {
          if (kind == 'page') scope.closeRoute(page);
          if (kind == 'draft' || kind == 'general') oldComplete!('A result');
          await tester.pump(const Duration(seconds: 2));
          await tester.pumpAndSettle();
          expect(await pending, oldComplete != null ? 'A result' : isNull);
        } else {
          await useScopeRole('b', notify: mode == 'switch');
          final foreignPage = MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('B foreign page')));
          unawaited(nav.currentState!.push(foreignPage));
          await tester.pumpAndSettle();
          if (mode == 'silent-switch') expect(await scope.isCurrent(), isFalse);
          if (mode == 'dispose') {
            scope.dispose();
            expect(tester.binding.hasScheduledFrame, isTrue,
                reason:
                    'Production cleanup must schedule its own frame while idle.');
          }
          await tester.pumpAndSettle();
          oldComplete?.call('obsolete A result');
          await tester.pump(const Duration(seconds: 2));
          await tester.pumpAndSettle();
          expect(find.text('B foreign page'), findsOneWidget);
          expect(
              find.text('A private $kind', skipOffstage: false), findsNothing);
          expect(foreignPage.isCurrent, isTrue);
          expect(await pending, isNull);
        }
        scope.dispose();
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('A logout and relogin cannot revive old scope or push old page',
      (tester) async {
    final nav = GlobalKey<NavigatorState>();
    await tester
        .pumpWidget(MaterialApp(navigatorKey: nav, home: const Scaffold()));
    final owner = await LocalPrincipalActionOwner.capture();
    final scope = SavedCartActionScope(owner, isMounted: () => true);
    final session = (await AuthService.readSession())!;
    await AuthService.clearSessionOwnerIfMatches(
        AuthService.captureSessionOwner(session),
        runLogoutCleanup: false);
    await useScopeRole('a');
    expect(await scope.isCurrent(), isFalse);
    await scope.push(nav.currentContext!,
        MaterialPageRoute<void>(builder: (_) => const Text('obsolete page')));
    await tester.pumpAndSettle();
    expect(find.text('obsolete page'), findsNothing);
    scope.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });
}
