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
      'password reset closes its own sheet before persistent success feedback',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    String? requestedEmail;

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
        child: MaterialApp(
          home: LoginScreen(
            initialEmail: 'recovery@example.test',
            passwordResetRequester: (email) async {
              requestedEmail = email;
              return true;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Passwort vergessen?'));
    await tester.pumpAndSettle();
    expect(find.text('Passwort zurücksetzen'), findsOneWidget);

    await tester.tap(find.text('Link senden'));
    await tester.pumpAndSettle();

    expect(requestedEmail, 'recovery@example.test');
    expect(find.text('Passwort zurücksetzen'), findsNothing);
    expect(find.text('E-Mail gesendet'), findsOneWidget);
    expect(
      find.text(
        'Wenn ein Konto existiert, erhältst du gleich einen Link zum Zurücksetzen.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.bySemanticsLabel('Schließen'));
    await tester.pumpAndSettle();
    expect(find.text('E-Mail gesendet'), findsNothing);
  });
}
