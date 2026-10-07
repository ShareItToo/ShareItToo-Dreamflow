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
      'verification handoff stays visible and prefills the registration email',
      (tester) async {
    SharedPreferences.setMockInitialValues({});

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
        child: const MaterialApp(
          home: LoginScreen(
            initialEmail: 'contact+b11-owner@shareittoo.com',
            verificationPending: true,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('email-verification-pending')),
      findsOneWidget,
    );
    expect(find.text('Prüfe deine E-Mail'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('email-verification-pending')),
        matching: find.textContaining('contact+b11-owner@shareittoo.com'),
      ),
      findsOneWidget,
    );

    final emailField = tester.widget<TextFormField>(
      find.byType(TextFormField).first,
    );
    expect(emailField.controller?.text, 'contact+b11-owner@shareittoo.com');
  });
}
