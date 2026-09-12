import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/language_screen.dart';
import 'package:lendify/screens/privacy_info_screen.dart';
import 'package:lendify/screens/explore_screen_pinned_header.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/profile_header_card.dart';
import 'package:lendify/widgets/category_icon_row.dart';
import 'package:lendify/widgets/search_header.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('guest profile does not claim an identity verification state',
      (tester) async {
    final localization = LocalizationController();
    final guest = User(
      id: 'guest-user',
      displayName: 'Gast',
      email: '',
      city: '',
      country: '',
      preferredLanguage: 'de-DE',
      isVerified: false,
      isBanned: false,
      role: 'guest',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime(2026),
    );

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>.value(
        value: localization,
        child: MaterialApp(
          home: Scaffold(
            body: ProfileHeaderCard(user: guest, listingsCount: 0),
          ),
        ),
      ),
    );

    expect(find.text('Nicht angemeldet'), findsOneWidget);
    expect(find.text('Identität noch nicht geprüft'), findsNothing);
  });

  testWidgets('language selector offers only maintained app translations',
      (tester) async {
    final localization = LocalizationController();
    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>.value(
        value: localization,
        child: const MaterialApp(home: LanguageScreen()),
      ),
    );

    expect(find.text('Deutsch'), findsOneWidget);
    expect(find.text('English'), findsOneWidget);
    expect(find.text('Español'), findsNothing);
    expect(find.text('Français'), findsNothing);
    expect(find.text('العربية'), findsNothing);
  });

  test('transient refresh failures preserve the stored session for retry', () {
    expect(
      AuthService.shouldClearStoredSessionAfterRefreshFailure(
        const BackendException(401, 'invalid_refresh_token'),
      ),
      isTrue,
    );
    expect(
      AuthService.shouldClearStoredSessionAfterRefreshFailure(
        const BackendException(503, 'service_unavailable'),
      ),
      isFalse,
    );
    expect(
      AuthService.shouldClearStoredSessionAfterRefreshFailure(
        const FormatException('temporary malformed response'),
      ),
      isFalse,
    );
  });

  test('backend guest cannot reuse a stale cached profile as authentication',
      () {
    expect(
      DataService.canExposeCachedCurrentUser(
        backendEnabled: true,
        hasSession: false,
      ),
      isFalse,
    );
    expect(
      DataService.canExposeCachedCurrentUser(
        backendEnabled: true,
        hasSession: true,
      ),
      isTrue,
    );
    expect(
      DataService.canExposeCachedCurrentUser(
        backendEnabled: false,
        hasSession: false,
      ),
      isTrue,
    );
  });

  test(
      'transient profile failure may reuse only the exact active-session cache',
      () {
    final cached = User(
      id: 'owner-1',
      displayName: 'SIT Owner',
      email: 'owner@synthetic.invalid',
      city: 'Berlin',
      country: 'DE',
      preferredLanguage: 'de-DE',
      isVerified: true,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime.utc(2026, 8, 11),
    );
    const matchingSession = AuthSession(
      userId: 'owner-1',
      email: 'owner@synthetic.invalid',
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: 'session',
    );

    expect(
      DataService.cachedCurrentUserForSession(
        encodedUser: jsonEncode(cached.toJson()),
        session: matchingSession,
      )?.id,
      'owner-1',
    );
    expect(
      DataService.cachedCurrentUserForSession(
        encodedUser: jsonEncode(cached.toJson()),
        session: null,
      ),
      isNull,
    );
    expect(
      DataService.cachedCurrentUserForSession(
        encodedUser: jsonEncode(cached.toJson()),
        session: const AuthSession(
          userId: 'different-user',
          email: 'owner@synthetic.invalid',
        ),
      ),
      isNull,
    );
    expect(
      DataService.cachedCurrentUserForSession(
        encodedUser: jsonEncode(cached.toJson()),
        session: const AuthSession(
          userId: 'owner-1',
          email: 'different@synthetic.invalid',
        ),
      ),
      isNull,
    );
  });

  test('account tabs require both a stored session and a resolved user', () {
    expect(
      shouldGateAccountTab(
        hasSession: true,
        hasCurrentUser: false,
        backendEnabled: true,
        releaseMode: true,
        previewGuest: false,
      ),
      isTrue,
    );
    expect(
      shouldGateAccountTab(
        hasSession: true,
        hasCurrentUser: true,
        backendEnabled: true,
        releaseMode: true,
        previewGuest: false,
      ),
      isFalse,
    );
    expect(
      shouldGateAccountTab(
        hasSession: false,
        hasCurrentUser: false,
        backendEnabled: false,
        releaseMode: false,
        previewGuest: false,
      ),
      isFalse,
    );
  });

  test('release client contains no AI proxy secret and all helpers fail closed',
      () async {
    final source = await File('lib/openai/openai_config.dart').readAsString();

    expect(source, isNot(contains('OPENAI_PROXY_API_KEY')));
    expect(source, isNot(contains("'Authorization': 'Bearer")));
    expect(source, isNot(contains('package:http/http.dart')));
    expect(source, isNot(contains('http.post')));
    expect(source, contains('externalAiNetworkAllowed = false'));
    expect(source, contains('directAiChatEnabled = false'));
    expect(source, contains('static bool get isAvailable => false'));
  });

  test('account security copy does not present demo 2FA as real protection',
      () async {
    final account =
        await File('lib/screens/account_settings_screen.dart').readAsString();
    final help =
        await File('lib/screens/help_center_screen.dart').readAsString();
    final profile =
        await File('lib/screens/profile_screen.dart').readAsString();
    final security =
        await File('lib/screens/security_screen.dart').readAsString();
    final notifications =
        await File('lib/screens/notifications_screen.dart').readAsString();

    expect(account, isNot(contains('TwoFactorAuthScreen')));
    expect(account, isNot(contains('VerificationIntroScreen')));
    expect(account, isNot(contains('VerificationScreen')));
    expect(account, contains('Noch nicht verfügbar'));
    expect(help, contains('Identitätsprüfung ist noch nicht verfügbar'));
    expect(help, contains('noch nicht verfügbar'));
    for (final source in [profile, security, notifications]) {
      expect(source, isNot(contains('VerificationIntroScreen')));
      expect(source, isNot(contains('VerificationScreen')));
    }
    expect(security, contains('Keine lokale Demo-Verifizierung'));
    expect(security, contains('AccountSecurityService'));
    expect(security, contains('_securityService.isAvailable'));
    expect(
        security, isNot(contains('!BackendConfig.enabled && !kReleaseMode')));
    expect(security, isNot(contains('setSecuritySettings')));
    expect(security, isNot(contains('_toggleTwoFactor')));
    expect(security, isNot(contains('Future<void>.delayed')));
  });

  test(
      'listing details do not claim an unapproved ShareItToo protection product',
      () async {
    final details =
        await File('lib/widgets/item_details_overlay.dart').readAsString();

    expect(details, isNot(contains('ShareItToo Standardschutz')));
    expect(details, contains("label: 'Buchungsablauf'"));
    expect(details, contains("value: 'Geführte Übergabe und Rückgabe'"));
  });

  test('launch app does not expose deposit or protection flows', () async {
    final sources = <String>[
      await File('lib/screens/payment_checkout_screen.dart').readAsString(),
      await File('lib/screens/booking_detail_screen.dart').readAsString(),
      await File('lib/screens/create_listing_screen.dart').readAsString(),
      await File('lib/screens/help_center_screen.dart').readAsString(),
      await File('lib/screens/legal_terms_screen.dart').readAsString(),
      await File('lib/screens/payment_methods_screen.dart').readAsString(),
      await File('lib/services/data_service.dart').readAsString(),
    ].join('\n');
    // Rechtstexte müssen ausdrücklich erklären dürfen, dass es keine Kaution
    // gibt. Verboten bleiben nur technische Kautions- oder Schutzprodukt-Flows.
    expect(sources, contains('Keine Kaution'));
    expect(sources, isNot(contains('Kaution hinterlegen')));
    expect(sources, isNot(contains('Kaution einziehen')));
    expect(sources, isNot(contains('protectionModel:')));
    expect(sources, isNot(contains('createDepositSetup')));
    expect(sources.toLowerCase(), isNot(contains('securitydeposit')));
    expect(sources, isNot(contains('inkl. Schutz & Service')));
  });

  test('internal imprint never claims an unverified company identity',
      () async {
    final imprint =
        await File('lib/screens/legal_imprint_screen.dart').readAsString();
    final providerConfig =
        await File('lib/config/legal_provider_config.dart').readAsString();

    expect(imprint, isNot(contains('ShareItToo GmbH')));
    expect(
        imprint, contains('LegalProviderConfig.hasCompleteApprovedIdentity'));
    expect(providerConfig, contains('SIT_LEGAL_PROVIDER_APPROVED'));
    expect(providerConfig, contains('defaultValue: false'));
  });

  test('launch item model cannot reintroduce deposit or protection fields',
      () async {
    final itemModel = await File('lib/models/item.dart').readAsString();

    expect(itemModel, isNot(contains('final double? deposit')));
    expect(itemModel, isNot(contains('final String protectionModel')));
    expect(itemModel, isNot(contains("'deposit':")));
    expect(itemModel, isNot(contains("'protectionModel':")));
  });

  test('guest notification entry is gated and its header control is named',
      () async {
    final profile =
        await File('lib/screens/profile_screen.dart').readAsString();
    final notifications =
        await File('lib/screens/notifications_screen.dart').readAsString();

    expect(profile, contains('_openNotifications(isGuest: isGuest)'));
    expect(profile, contains("title: 'Benachrichtigungen ansehen'"));
    expect(profile, contains('overrideContent: const GuestGateContent'));
    expect(profile, contains("label: l10n.t('Profil durchsuchen')"));
    expect(profile, contains("'Sucheingabe löschen'"));
    expect(profile,
        contains("_isProfileSearchOpen ? 'Suche schließen' : 'Suchen'"));
    expect(
      notifications,
      contains('tooltip: MaterialLocalizations.of(context).backButtonTooltip'),
    );
  });

  test('login fields and icon controls expose screen reader names', () async {
    final login = await File('lib/screens/login_screen.dart').readAsString();
    final register =
        await File('lib/screens/register_screen.dart').readAsString();

    for (final source in [login, register]) {
      expect(source, contains('label: label'));
      expect(source, contains('textField: true'));
      expect(
        source,
        matches(RegExp(r'MergeSemantics\(\s*child:\s*Semantics\(')),
      );
      expect(source, contains("? 'Passwort verbergen'"));
      expect(source, contains(": 'Passwort anzeigen'"));
      expect(
        source,
        matches(
          RegExp(
            r'MaterialLocalizations\s*\.of\(context\)\s*\.backButtonTooltip',
          ),
        ),
      );
    }
    expect(
      register,
      contains("? 'Passwortbestätigung verbergen'"),
    );
    expect(register, contains(": 'Passwortbestätigung anzeigen'"));
    expect(login, contains("label: 'E-Mail für Passwortzurücksetzung'"));
  });

  test('help search, support field, and back action are named', () async {
    final help =
        await File('lib/screens/help_center_screen.dart').readAsString();

    expect(help, contains("label: 'Hilfe durchsuchen'"));
    expect(help, contains("label: 'Support-Anliegen'"));
    expect(
      RegExp(r'MergeSemantics\(\s*child:\s*Semantics\(')
          .allMatches(help)
          .length,
      2,
    );
    expect(help, contains("tooltip: 'Sucheingabe löschen'"));
    expect(
      help,
      contains('MaterialLocalizations.of(context).backButtonTooltip'),
    );
  });

  test('every back-arrow control has an accessible name', () async {
    final dartFiles = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'));

    for (final file in dartFiles) {
      final lines = await file.readAsLines();
      for (var index = 0; index < lines.length; index++) {
        if (!lines[index].contains('Icons.arrow_back')) continue;
        final start = index > 5 ? index - 5 : 0;
        final end = index + 4 < lines.length ? index + 4 : lines.length;
        final context = lines.sublist(start, end).join('\n');
        expect(
          context.contains('tooltip:') ||
              context.contains('semanticLabel:') ||
              context.contains('label:'),
          isTrue,
          reason: '${file.path}:${index + 1} has an unnamed back arrow',
        );
      }
    }
  });

  test('authenticated empty states do not present invented marketplace data',
      () async {
    final profile =
        await File('lib/screens/profile_screen.dart').readAsString();
    final profileHeader =
        await File('lib/widgets/profile_header_card.dart').readAsString();
    final publicProfile =
        await File('lib/screens/public_profile_screen.dart').readAsString();
    final ownProfile =
        await File('lib/screens/own_profile_screen.dart').readAsString();
    final ownerRequests =
        await File('lib/screens/owner_requests_screen.dart').readAsString();
    final messageThread =
        await File('lib/screens/message_thread_screen.dart').readAsString();
    final accountSettings =
        await File('lib/screens/account_settings_screen.dart').readAsString();
    final maps = await File('lib/services/maps_service.dart').readAsString();
    final appRoot = await File('lib/main.dart').readAsString();
    final navigation =
        await File('lib/navigation/main_navigation.dart').readAsString();
    final explore =
        await File('lib/screens/explore_screen.dart').readAsString();
    final backendHttp =
        await File('lib/services/backend_http.dart').readAsString();
    final securityScreen =
        await File('lib/screens/security_screen.dart').readAsString();

    expect(profile, isNot(contains('walid.placeholder')));
    expect(profile, isNot(contains('responseTimeMinutes: 42')));
    expect(
        profile, contains('final handle = TrackedDialogRouteHandle<bool>();'));
    expect(profile, contains('await showTrackedDialog<bool>('));
    expect(profile, contains('onPressed: () => handle.dismiss(false)'));
    expect(profile, contains('onPressed: () => handle.dismiss(true)'));
    expect(
      profile,
      contains(
        'final preview = context.read<DeveloperPreviewController>();',
      ),
    );
    expect(
      profile,
      matches(
        RegExp(
          r'!await _sessionTransitions\.isCompletionCurrent\(completion\)\) \{\s+return;\s+\}\s+await preview\.setState\(DeveloperUserState\.loggedOut\)',
        ),
      ),
    );
    expect(profileHeader, isNot(contains('_estimatedBookings')));
    expect(profileHeader, isNot(contains('images.unsplash.com/photo')));
    expect(publicProfile, isNot(contains('_mockResponseTimeMin')));
    expect(publicProfile, isNot(contains('responseTimeMinutes')));
    expect(ownProfile, isNot(contains('responseTimeMin = 42')));
    expect(ownProfile, isNot(contains('DJI Mavic Air 2')));
    expect(ownProfile, isNot(contains('Makita Akkuschrauber')));
    expect(
        RegExp(r'if \(QaRuntimeService\.isEnabled\)')
            .allMatches(ownerRequests)
            .length,
        greaterThanOrEqualTo(2));
    expect(messageThread, contains('QaRuntimeService.isEnabled &&'));
    expect(messageThread, contains('_thread?.id == _translationDemoThreadId'));
    expect(accountSettings, contains('const SecurityScreen()'));
    expect(accountSettings, isNot(contains('const ChangePasswordScreen()')));
    expect(maps, isNot(contains('Musterstraße 1')));
    expect(appRoot,
        contains('final accessToken = await AuthService.accessToken()'));
    expect(appRoot, contains('if (BackendConfig.enabled || kReleaseMode)'));
    expect(
      navigation,
      contains(
          'final guestGateEnabled = backendEnabled || releaseMode || previewGuest;'),
    );
    expect(
      navigation,
      contains('guestGateEnabled && (!hasSession || !hasCurrentUser)'),
    );
    expect(
        explore, contains('_savedIds = hasRealSession ? saved : <String>{}'));
    expect(profileHeader, contains('if (user.isVerified)'));
    expect(
        backendHttp,
        contains(
            "'User-Agent': 'ShareItToo (\${defaultTargetPlatform.name})'"));
    expect(securityScreen, contains("rawName == 'Unbekanntes Gerät'"));
  });

  test('normal startup cannot seed showcase data or clear user data', () async {
    final appRoot = await File('lib/main.dart').readAsString();

    expect(appRoot, isNot(contains('ensureListingsSeededIfEmpty')));
    expect(appRoot, isNot(contains('clearAllRentalsAndBookings')));
    expect(
      appRoot,
      contains(
          'Release startup must never seed showcase data or clear user data.'),
    );
  });

  testWidgets(
      'privacy export remains usable with large text and keyboard focus',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': 'privacy-accessibility-fixture',
        'sessionId': 'privacy-accessibility-session',
        'email': 'privacy-accessibility@example.invalid',
        'createdAt': DateTime.utc(2026, 9, 4).toIso8601String(),
      }),
    });
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(2)),
          child: PrivacyInfoScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final button = find.byKey(const ValueKey('privacy-data-export-button'));
    await tester.scrollUntilVisible(
      button,
      500,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();

    expect(button, findsOneWidget);
    expect(find.text('Meine Daten exportieren'), findsOneWidget);
    expect(tester.takeException(), isNull);

    final exportButton = find.widgetWithText(
      FilledButton,
      'Meine Daten exportieren',
    );
    await tester.ensureVisible(exportButton);
    await tester.drag(
      find.byType(Scrollable).last,
      const Offset(0, 120),
    );
    await tester.pumpAndSettle();
    await tester.tap(exportButton);
    await tester.pumpAndSettle();
    final passwordField = find.byKey(
      const ValueKey('privacy-data-export-password'),
    );
    expect(passwordField, findsOneWidget);
    final passwordWidget = tester.widget<TextField>(passwordField);
    expect(passwordWidget.obscureText, isTrue);
    expect(passwordWidget.enableSuggestions, isFalse);
    expect(passwordWidget.autocorrect, isFalse);
    expect(
      find.textContaining('ausschließlich für dein angemeldetes Konto'),
      findsOneWidget,
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(FocusManager.instance.primaryFocus, isNotNull);
    await tester.tap(find.text('Abbrechen'));
    await tester.pumpAndSettle();
    semantics.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('category header expands without clipping at 200 percent text',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final localization = LocalizationController();
    final delegate = PinnedCategoriesHeader(
      textScale: 2,
      builder: (_) => const SizedBox.shrink(),
    );

    expect(delegate.minExtent, 172);
    expect(delegate.maxExtent, 172);

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>.value(
        value: localization,
        child: const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(412, 915),
              textScaler: TextScaler.linear(2),
            ),
            child: Scaffold(
              body: CategoryIconRow(
                categories: [
                  CategoryIconDataModel(
                    id: 'technology',
                    icon: Icons.devices,
                    label: 'Technik & Elektronik',
                  ),
                  CategoryIconDataModel(
                    id: 'tools',
                    icon: Icons.construction,
                    label: 'Werkzeuge & Kleingeräte',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    for (final label in <String>[
      'Alle\nKategorien',
      'Technik\n& Elektronik',
      'Werkzeuge\n& Kleingeräte',
    ]) {
      final paragraph = tester.renderObject<RenderParagraph>(find.text(label));
      expect(paragraph.didExceedMaxLines, isFalse, reason: label);
    }
    expect(tester.getRect(find.text('Alle\nKategorien')).left,
        greaterThanOrEqualTo(0));
    expect(tester.getRect(find.text('Technik\n& Elektronik')).right,
        lessThanOrEqualTo(412));

    await tester.drag(find.byType(ListView), const Offset(-2000, 0));
    await tester.pumpAndSettle();
    final lastCategoryRect =
        tester.getRect(find.text('Werkzeuge\n& Kleingeräte'));
    expect(lastCategoryRect.left, greaterThanOrEqualTo(0));
    expect(lastCategoryRect.right, lessThanOrEqualTo(412));
    expect(tester.takeException(), isNull);
  });

  testWidgets('explore header actions expose meaningful screen reader names',
      (tester) async {
    final semantics = tester.ensureSemantics();
    final localization = LocalizationController();

    await tester.pumpWidget(
      ChangeNotifierProvider<LocalizationController>.value(
        value: localization,
        child: MaterialApp(
          home: Scaffold(
            body: SearchHeader(
              onFiltersPressed: () {},
              onSearchTap: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Neue Anzeige erstellen'), findsOneWidget);
    expect(find.bySemanticsLabel('Jetzt suchen'), findsOneWidget);
    expect(find.bySemanticsLabel('Mietanfragen'), findsOneWidget);
    expect(tester.takeException(), isNull);

    semantics.dispose();
  });
}
