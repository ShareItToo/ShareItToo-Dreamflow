import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/app_link_destination_screen.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MutablePrincipalOwner implements AppLinkPrincipalOwner {
  @override
  final String principalToken;
  @override
  final int epoch;
  bool current = true;

  _MutablePrincipalOwner({
    required this.principalToken,
    required this.epoch,
  });

  @override
  bool get authenticated => true;

  @override
  bool get isCurrentEpoch => current;

  @override
  Future<bool> isCurrent() async => current;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets(
      'A principal transition removes only the exact A app-link route and preserves a newer B route',
      (tester) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    final ownerA = _MutablePrincipalOwner(
      principalToken: 'opaque-principal-a',
      epoch: 17,
    );
    final controller = AppLinkController(
      capturePrincipalOwner: () async => ownerA,
    );
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider<AppLinkController>.value(
        value: controller,
        child: MaterialApp(
          navigatorKey: navigatorKey,
          home: const AppLinkHost(
            child: Scaffold(body: Text('Root surface')),
          ),
        ),
      ),
    );

    await controller.didPushRouteInformation(
      RouteInformation(uri: Uri.parse('shareittoo://notifications')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Bitte zuerst anmelden'), findsOneWidget);

    navigatorKey.currentState!.push<void>(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('Account B route')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Account B route'), findsOneWidget);

    ownerA.current = false;
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();

    expect(find.text('Account B route'), findsOneWidget);
    navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.text('Root surface'), findsOneWidget);
    expect(find.text('Bitte zuerst anmelden'), findsNothing);
  });
}
