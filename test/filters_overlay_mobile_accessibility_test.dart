import 'dart:async';
import 'dart:ui' show SemanticsAction, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/filters_overlay.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets(
      'mobile category filters wrap at 2x text and expose selected state to semantics and keyboard',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    tester.view.physicalSize = const Size(320, 960);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final semantics = tester.ensureSemantics();
    Map<String, dynamic>? applied;

    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => LocalizationController(),
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(2),
            ),
            child: child!,
          ),
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: FilledButton(
                  onPressed: () {
                    unawaited(FiltersOverlay.show(context).then((result) {
                      applied = result;
                    }));
                  },
                  child: const Text('Filter öffnen'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Filter öffnen'));
    await tester.pumpAndSettle();

    final advanced = find.text('Weitere Filter anzeigen');
    await tester.ensureVisible(advanced);
    await tester.tap(advanced.hitTestable());
    await tester.pumpAndSettle();

    const group = 'Technik & Elektronik';
    final tile =
        find.byKey(const ValueKey('filter-category-Technik & Elektronik'));
    await tester.scrollUntilVisible(
      tile,
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    final tileSize = tester.getSize(tile);
    expect(tileSize.width, greaterThanOrEqualTo(48));
    expect(tileSize.height, greaterThanOrEqualTo(48));
    final label = tester.widget<Text>(find.descendant(
      of: tile,
      matching: find.text('Technik\n& Elektronik'),
    ));
    expect(label.style?.fontSize, 14);
    expect(label.maxLines, 3);

    var semanticsData = tester.getSemantics(tile).getSemanticsData();
    expect(semanticsData.label, group);
    expect(semanticsData.flagsCollection.isSelected, Tristate.isFalse);
    expect(semanticsData.hasAction(SemanticsAction.tap), isTrue);

    await tester.tap(tile);
    await tester.pump();
    semanticsData = tester.getSemantics(tile).getSemanticsData();
    expect(semanticsData.flagsCollection.isSelected, Tristate.isTrue);

    // Keyboard activation and the selected state are available to assistive
    // technology through the same focusable button.
    Focus.of(tester.element(tile)).requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    semanticsData = tester.getSemantics(tile).getSemanticsData();
    expect(semanticsData.flagsCollection.isSelected, Tristate.isFalse);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    semanticsData = tester.getSemantics(tile).getSemanticsData();
    expect(semanticsData.flagsCollection.isSelected, Tristate.isTrue);

    const deliveryLabel = 'Lieferung bei Abgabe';
    final delivery =
        find.byKey(const ValueKey('toggle-text-option-$deliveryLabel'));
    await tester.scrollUntilVisible(
      delivery,
      -160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(tester.getSize(delivery).height, greaterThanOrEqualTo(48));
    semanticsData = tester.getSemantics(delivery).getSemanticsData();
    expect(semanticsData.label, deliveryLabel);
    expect(semanticsData.flagsCollection.isSelected, Tristate.isFalse);
    expect(semanticsData.hasAction(SemanticsAction.tap), isTrue);
    await tester.tap(delivery);
    await tester.pump();
    semanticsData = tester.getSemantics(delivery).getSemanticsData();
    expect(semanticsData.flagsCollection.isSelected, Tristate.isTrue);
    Focus.of(tester.element(delivery)).requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    semanticsData = tester.getSemantics(delivery).getSemanticsData();
    expect(semanticsData.flagsCollection.isSelected, Tristate.isFalse);
    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pump();
    semanticsData = tester.getSemantics(delivery).getSemanticsData();
    expect(semanticsData.flagsCollection.isSelected, Tristate.isTrue);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Anwenden'));
    await tester.pumpAndSettle();
    expect(applied?['categories'], [group]);
    expect(applied?['delivery'], contains('dropoff'));
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
