// Test-support entry point, not AppRoot or an application release build.
// Imports the unchanged production navigation implementation. The sole local
// control supplies synthetic foreground-link input, never a provider message.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:lendify/navigation/web_app_router.dart';
import 'package:lendify/screens/app_link_destination_screen.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/services/localization_service.dart';

class _SyntheticOwner implements AppLinkPrincipalOwner {
  @override
  String get principalToken => 'synthetic-history-harness';
  @override
  int get epoch => 1;
  @override
  bool get authenticated => false;
  @override
  bool get isCurrentEpoch => true;
  @override
  Future<bool> isCurrent() async => true;
}

Future<void> main() async {
  prepareInitialWebAppLinks();
  WidgetsFlutterBinding.ensureInitialized();
  WidgetsBinding.instance.ensureSemantics();
  final font = FontLoader('Roboto')
    ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
  await font.load();
  final controller =
      AppLinkController(capturePrincipalOwner: () async => _SyntheticOwner())
        ..initialize();
  final localization = LocalizationController();
  runApp(MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: controller),
        ChangeNotifierProvider.value(value: localization),
      ],
      child: WebAppRouterHost(
        controller: controller,
        navigatorKey: GlobalKey<NavigatorState>(),
        root: AppLinkHost(
            child: Scaffold(
                body: Column(children: [
          const Text(
              'Exact production navigation code; synthetic harness; not AppRoot.'),
          TextButton(
              onPressed: () {
                final message = ForegroundPushMessage(
                    title: 'Synthetic',
                    body: 'Synthetic',
                    actionUri: Uri.parse('https://shareittoo.com/mission'));
                // Two identical synchronous stimuli exercise production duplicate
                // suppression; there must be exactly one pushed history entry.
                FirebaseRuntime.openForegroundMessage(message);
                FirebaseRuntime.openForegroundMessage(message);
              },
              child: const Text('Synthetic Mission ingress')),
        ]))),
        buildApp: (config) => MaterialApp.router(
            routerConfig: config,
            theme: ThemeData(fontFamily: 'Roboto'),
            debugShowCheckedModeBanner: false),
      )));
}
