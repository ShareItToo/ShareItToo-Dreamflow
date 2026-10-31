import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/widgets/social_auth_button.dart';
import 'package:lendify/widgets/social_auth_status.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('social providers remain fail-closed without release defines', () {
    for (final provider in AuthSocialProvider.values) {
      expect(
        AuthService.socialProviderEnabled(provider),
        isFalse,
        reason: '${provider.name} must require an explicit release opt-in',
      );
    }
  });

  for (final screen in <Widget>[const LoginScreen(), const RegisterScreen()]) {
    testWidgets(
        '${screen.runtimeType} reports unconfigured providers without fake buttons',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => MainNavController()),
          ChangeNotifierProvider(
            create: (_) => DeveloperPreviewController(
              initialState: DeveloperUserState.loggedOut,
            ),
          ),
        ],
        child: MaterialApp(home: screen),
      ));
      await tester.pumpAndSettle();
      expect(find.byType(SocialAuthButton), findsNothing);
      expect(find.byType(SocialAuthStatus), findsNWidgets(3));
      for (final name in ['Google', 'Apple', 'Facebook']) {
        expect(
          find.text('$name-Anmeldung ist derzeit nicht verfügbar.'),
          findsOneWidget,
        );
      }
      expect(find.text('Im Privatpiloten nicht verfügbar'), findsNothing);
      if (screen is RegisterScreen) {
        expect(find.text('Mit Facebook registrieren'), findsNothing);
        expect(
          find.text(
              'Facebook ist nur zur Anmeldung bestehender Konten verfügbar.'),
          findsNothing,
        );
        expect(
            AuthService.socialRegistrationProviderEnabled(
                AuthSocialProvider.facebook),
            isFalse);
      }
      for (final button in tester
          .widgetList<SocialAuthButton>(find.byType(SocialAuthButton))) {
        expect(button.available, isFalse);
        expect(button.onTap, isNull);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
