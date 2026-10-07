import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/explore_screen.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/category_icon_row.dart';
import 'package:lendify/widgets/listing_carousel_card.dart';
import 'package:lendify/widgets/search_header.dart';
import 'package:lendify/widgets/synthetic_catalog_listing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Item syntheticItem() {
  final value = jsonDecode(
    File('test/fixtures/staging_synthetic_catalog_public_listing.json')
        .readAsStringSync(),
  ) as Map<String, dynamic>;
  value['photos'] = [
    BackendConfig.uri(
      '/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp',
    ).toString(),
  ];
  return Item.fromJson(value);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    // Use shipped glyph metrics: Ahem's square glyphs cannot prove whether
    // German words fit without being split in the actual catalog font.
    final font = FontLoader('Roboto')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await font.load();
  });
  for (final size in [
    const Size(390, 844),
    const Size(768, 1024),
    const Size(1920, 1080),
    const Size(3840, 2160),
  ]) {
    void viewport(WidgetTester tester) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
    }

    testWidgets('Explore is bounded and public at ${size.width}',
        (tester) async {
      viewport(tester);
      final item = syntheticItem();
      SharedPreferences.setMockInitialValues({
        'items': jsonEncode(List.generate(
            4,
            (index) => {
                  ...item.toJson(),
                  'id': 'synthetic-responsive-$index',
                })),
        'users': '[]',
      });
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => LocalizationController()),
          ChangeNotifierProvider(create: (_) => MainNavController()),
        ],
        child: MaterialApp(
            theme: ThemeData(fontFamily: 'Roboto'),
            home: const ExploreScreen()),
      ));
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      final content = tester.getRect(find.byType(NestedScrollView));
      expect(content.width, math.min(size.width, 1200));
      expect(content.center.dx, size.width / 2);
      expect(tester.getSize(find.byType(SearchHeader)).width, content.width);
      expect(tester.getSize(find.byType(CategoryIconRow)).width, content.width);
      // Five category tiles use content width, not the wide desktop viewport.
      expect(
          find.descendant(
              of: find.byType(CategoryIconRow),
              matching: find.byWidgetPredicate((widget) =>
                  widget is SizedBox &&
                  widget.width != null &&
                  (widget.width! - (content.width - 32) / 5).abs() < 0.01)),
          findsWidgets);
      final featured = find.byType(ListingCarouselCard).first;
      Rect cardSurface(Finder carousel) => tester.getRect(
          find.descendant(of: carousel, matching: find.byType(Material)).first);
      final card = cardSurface(featured).size;
      expect(card.width, inInclusiveRange(150, 320));
      expect(card.height, lessThanOrEqualTo(324));
      if (size.width == 390) {
        // Observe what the user sees, independently of the sizing formula.
        final cards = find.byType(ListingCarouselCard);
        final first = cardSurface(cards.at(0));
        final second = cardSurface(cards.at(1));
        final third = cardSurface(cards.at(2));
        expect(first.left, greaterThanOrEqualTo(content.left));
        expect(first.right, lessThanOrEqualTo(content.right));
        expect(second.left, greaterThan(first.right));
        expect(second.right, lessThanOrEqualTo(content.right));
        final visibleThird = third.intersect(content).width / third.width;
        expect(visibleThird, closeTo(0.25, 0.02));
      }
      if (size.width >= 900) {
        expect(card, const Size(320, 324));
      }
      expect(tester.widget<ListingCarouselCard>(featured).publicCatalogImage,
          isTrue);
      expect(find.text(Item.syntheticCatalogNotice), findsWidgets);
      expect(find.text('Testansicht öffnen'), findsWidgets);
      expect(find.textContaining('€'), findsNothing);
      final gridCard = tester.getRect(find.byType(SyntheticCatalogCard).last);
      expect(gridCard.left, greaterThanOrEqualTo(content.left));
      expect(gridCard.right, lessThanOrEqualTo(content.right));
      if (size.width >= 900) {
        expect(gridCard.width, lessThanOrEqualTo(290));
      }
      final featuredRect = tester.getRect(featured);
      for (final text in [
        item.title,
        Item.syntheticCatalogNotice,
        'Testansicht öffnen',
      ]) {
        final visibleText =
            find.descendant(of: featured, matching: find.text(text));
        final bounds = tester.getRect(visibleText);
        expect(bounds.top, greaterThanOrEqualTo(featuredRect.top));
        expect(bounds.bottom, lessThanOrEqualTo(featuredRect.bottom));
        expect(bounds.bottom, lessThan(size.height));
        expect(visibleText.hitTestable(), findsOneWidget);
        if (text == item.title) {
          final paragraph = tester.renderObject<RenderParagraph>(visibleText);
          for (final word in text.split(' ')) {
            final start = text.indexOf(word);
            expect(
                paragraph.getBoxesForSelection(TextSelection(
                    baseOffset: start, extentOffset: start + word.length)),
                hasLength(1),
                reason: 'A title word must not break across multiple lines');
          }
        }
      }
      final cardScroll = tester.state<ScrollableState>(
          find.descendant(of: featured, matching: find.byType(Scrollable)));
      expect(cardScroll.position.pixels, 0);
      expect(cardScroll.position.maxScrollExtent, 0);
      expect(tester.takeException(), isNull);
      await tester.tap(find.descendant(
          of: featured, matching: find.text('Testansicht öffnen')));
      await tester.pumpAndSettle();
      expect(find.byType(SyntheticCatalogDetails), findsOneWidget);
      expect(tester.widget<AppImage>(find.byType(AppImage)).publicCatalogImage,
          isTrue);
      expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
          isNull);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    });

    testWidgets('Synthetic detail is bounded and non-bookable at ${size.width}',
        (tester) async {
      viewport(tester);
      SharedPreferences.setMockInitialValues({});
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpWidget(MaterialApp(
          home: SyntheticCatalogDetails(
              item: syntheticItem(), publicCatalogImage: true),
        ));
        await tester.pumpAndSettle();
        final body = tester.getRect(find.byType(ListView));
        expect(body.width, math.min(size.width, 960));
        expect(body.center.dx, size.width / 2);
        final image = tester.getRect(find.byType(AppImage));
        expect(image.width, size.width >= 900 ? 640 : size.width - 40);
        expect(image.height, closeTo(image.width * 3 / 4, 0.01));
        expect(
            tester.widget<AppImage>(find.byType(AppImage)).publicCatalogImage,
            isTrue);
        final notice = find.text(Item.syntheticCatalogNotice);
        final disclaimer = find.textContaining('Erfundene Testdaten.');
        final action = find.byType(FilledButton);
        for (final finder in [notice, disclaimer, action]) {
          if (size.width >= 900) {
            expect(tester.getRect(finder).bottom, lessThan(size.height));
            expect(finder.hitTestable(), findsOneWidget);
          } else {
            await tester.ensureVisible(finder);
            await tester.pumpAndSettle();
            expect(finder.hitTestable(), findsOneWidget);
          }
        }
        expect(tester.widget<FilledButton>(action).onPressed, isNull);
        expect(find.bySemanticsLabel('Nicht buchbar – nur Katalogtest'),
            findsOneWidget);
        expect(
            find.bySemanticsLabel(
                'Testillustration, kein aktueller Produkt- oder Zustandsnachweis'),
            findsOneWidget);
        expect(find.textContaining('€'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });
  }
}
