import 'dart:ui' show SemanticsAction, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'login fields stay named and password visibility stays a separate action',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider(create: (_) => MainNavController()),
            ChangeNotifierProvider(
              create: (_) => DeveloperPreviewController(
                initialState: DeveloperUserState.loggedOut,
              ),
            ),
          ],
          child: const MaterialApp(home: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();

      for (final label in ['E-Mail', 'Passwort']) {
        final field = find.bySemanticsLabel(label);
        expect(field, findsAtLeastNWidgets(1));
        final node = tester.getSemantics(field.last);
        expect(node.flagsCollection.isTextField, isTrue);
        expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
        expect(
          node.getSemanticsData().hasAction(SemanticsAction.focus),
          isTrue,
        );
      }

      for (final label in [
        'Mit Google anmelden',
        'Mit Apple anmelden',
        'Mit Facebook anmelden',
      ]) {
        final button = find.text(label);
        expect(button, findsOneWidget);
        final node = tester.getSemantics(button);
        expect(node.flagsCollection.isButton, isTrue);
        expect(node.flagsCollection.isEnabled, Tristate.isFalse);
        expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isFalse);
      }

      final visibility = find.bySemanticsLabel('Passwort anzeigen');
      expect(visibility, findsAtLeastNWidgets(1));
      expect(
        tester.getSemantics(visibility.last).flagsCollection.isButton,
        isTrue,
      );
      semantics.dispose();
    },
  );
}
