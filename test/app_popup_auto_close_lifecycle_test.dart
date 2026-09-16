import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/widgets/app_popup.dart';

void main() {
  testWidgets('dismissed auto-close popup cannot pop a later route',
      (tester) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        home: const Scaffold(body: Text('home')),
      ),
    );

    final popup = AppPopup.show(
      tester.element(find.text('home')),
      icon: Icons.info_outline,
      title: 'bounded popup',
      autoCloseAfter: const Duration(seconds: 1),
    );
    await tester.pump();
    expect(find.text('bounded popup'), findsOneWidget);

    navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();
    await popup;
    unawaited(
      navigatorKey.currentState!.push<void>(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('later route')),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(find.text('later route'), findsOneWidget);
  });

  testWidgets('toast still closes itself once while navigator is mounted',
      (tester) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        home: const Scaffold(body: Text('home')),
      ),
    );

    final toast = AppPopup.toast(
      tester.element(find.text('home')),
      icon: Icons.check,
      title: 'short toast',
      duration: const Duration(milliseconds: 100),
    );
    await tester.pump();
    expect(find.text('short toast'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    await toast;

    expect(find.text('short toast'), findsNothing);
    expect(find.text('home'), findsOneWidget);
  });
}
