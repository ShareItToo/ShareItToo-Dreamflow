import 'dart:ui' show SemanticsAction, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _googleOnlyProfileUnderTest = bool.fromEnvironment(
  'SIT_TEST_GOOGLE_ONLY_PROFILE',
  defaultValue: false,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'next consolidated social profile enables only Google',
    () {
      expect(_googleOnlyProfileUnderTest, isTrue);
      expect(
        AuthService.socialProviderEnabled(AuthSocialProvider.google),
        isTrue,
      );
      expect(
        AuthService.socialProviderEnabled(AuthSocialProvider.apple),
        isFalse,
      );
      expect(
        AuthService.socialProviderEnabled(AuthSocialProvider.facebook),
        isFalse,
      );
    },
    skip: !_googleOnlyProfileUnderTest,
  );

  testWidgets('Google-only profile disables unavailable login providers', (
    tester,
  ) async {
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

    for (final entry in {
      'Mit Google anmelden': Tristate.isTrue,
      'Mit Apple anmelden': Tristate.isFalse,
      'Mit Facebook anmelden': Tristate.isFalse,
    }.entries) {
      final node = tester.getSemantics(find.text(entry.key));
      expect(node.flagsCollection.isEnabled, entry.value, reason: entry.key);
      expect(
        node.getSemanticsData().hasAction(SemanticsAction.tap),
        entry.value == Tristate.isTrue,
        reason: entry.key,
      );
    }
    semantics.dispose();
  }, skip: !_googleOnlyProfileUnderTest);

  testWidgets(
    'Google-only profile disables unavailable registration providers',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(const MaterialApp(home: RegisterScreen()));
      await tester.pumpAndSettle();

      for (final entry in {
        'Mit Google registrieren': Tristate.isTrue,
        'Mit Apple registrieren': Tristate.isFalse,
        'Mit Facebook registrieren': Tristate.isFalse,
      }.entries) {
        final node = tester.getSemantics(find.text(entry.key));
        expect(node.flagsCollection.isEnabled, entry.value, reason: entry.key);
        expect(
          node.getSemanticsData().hasAction(SemanticsAction.tap),
          entry.value == Tristate.isTrue,
          reason: entry.key,
        );
      }
      semantics.dispose();
    },
    skip: !_googleOnlyProfileUnderTest,
  );
}
