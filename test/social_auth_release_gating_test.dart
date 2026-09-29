import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/widgets/social_auth_button.dart';
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
        '${screen.runtimeType} visibly marks every unconfigured provider',
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
      expect(find.text('Im Privatpiloten nicht verfügbar'), findsNWidgets(3));
      for (final button in tester
          .widgetList<SocialAuthButton>(find.byType(SocialAuthButton))) {
        expect(button.available, isFalse);
        expect(button.onTap, isNull);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
