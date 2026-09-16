import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/profile_header_card.dart';
import 'package:lendify/widgets/wishlist_mosaic_card.dart';
import 'package:provider/provider.dart';

void main() {
  Widget largeTextHarness(Widget child) {
    return ChangeNotifierProvider<LocalizationController>(
      create: (_) => LocalizationController(),
      child: MaterialApp(
        theme: ThemeData.dark(),
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(412, 915),
            textScaler: TextScaler.linear(2),
          ),
          child: Scaffold(body: child),
        ),
      ),
    );
  }

  testWidgets('profile header preserves complete facts at 200 percent text',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final user = User(
      id: 'large-text-user',
      displayName: 'SIT Test Vermieter',
      email: 'synthetic@example.invalid',
      city: 'Berlin',
      country: 'DE',
      preferredLanguage: 'de-DE',
      isVerified: false,
      isBanned: false,
      role: 'user',
      avgRating: 0,
      reviewCount: 0,
      createdAt: DateTime.utc(2026, 8),
      languages: const ['Deutsch'],
    );

    await tester.pumpWidget(
      largeTextHarness(
        SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: ProfileHeaderCard(
            user: user,
            listingsCount: 6,
            completedBookingsCount: 0,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    for (final text in <String>[
      'SIT Test Vermieter',
      'Identität noch nicht geprüft',
      'Bewertung',
      'Keine Bewertung',
      'Buchungen',
      'Dabei seit',
      'August 2026',
      'Anzeigen',
    ]) {
      expect(find.text(text), findsOneWidget, reason: text);
      final paragraph = tester.renderObject<RenderParagraph>(find.text(text));
      expect(paragraph.didExceedMaxLines, isFalse, reason: text);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('wishlist title remains readable at 200 percent text',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      largeTextHarness(
        const SingleChildScrollView(
          padding: EdgeInsets.all(16),
          child: SizedBox(
            width: 380,
            height: 460,
            child: WishlistMosaicCard(
              id: 'soon',
              title: 'Demnächst benötigt',
              count: 0,
              photoUrls: <String>[],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final title =
        tester.renderObject<RenderParagraph>(find.text('Demnächst benötigt'));
    expect(title.didExceedMaxLines, isFalse);
    expect(find.text('Noch leer'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
