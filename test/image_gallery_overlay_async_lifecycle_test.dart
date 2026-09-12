import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/widgets/image_gallery_overlay.dart';

Widget _gallery({
  required Future<void> Function() onWishlistPressed,
  Future<void> Function()? onShare,
}) {
  return MaterialApp(
    home: ImageGalleryOverlay(
      images: const [],
      initialIndex: 0,
      isWishlisted: () => false,
      onWishlistPressed: onWishlistPressed,
      onShare: onShare,
    ),
  );
}

Future<void> _replaceGallery(WidgetTester tester) {
  return tester.pumpWidget(
    const MaterialApp(home: Scaffold(body: Text('replacement'))),
  );
}

void main() {
  testWidgets('completed wishlist action ignores a disposed gallery',
      (tester) async {
    final action = Completer<void>();
    await tester.pumpWidget(
      _gallery(onWishlistPressed: () => action.future),
    );

    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pump();
    await _replaceGallery(tester);

    action.complete();
    await tester.pump();

    expect(find.text('replacement'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed wishlist action cannot open a popup after disposal',
      (tester) async {
    final action = Completer<void>();
    await tester.pumpWidget(
      _gallery(onWishlistPressed: () => action.future),
    );

    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pump();
    await _replaceGallery(tester);

    action.completeError(StateError('wishlist unavailable'));
    await tester.pump();

    expect(find.text('Fehler beim Aktualisieren'), findsNothing);
    expect(find.text('replacement'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed share action cannot open a popup after disposal',
      (tester) async {
    final action = Completer<void>();
    await tester.pumpWidget(
      _gallery(
        onWishlistPressed: () async {},
        onShare: () => action.future,
      ),
    );

    await tester.tap(find.bySemanticsLabel('Teilen'));
    await tester.pump();
    await _replaceGallery(tester);

    action.completeError(StateError('share unavailable'));
    await tester.pump();

    expect(find.text('Teilen fehlgeschlagen'), findsNothing);
    expect(find.text('replacement'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
