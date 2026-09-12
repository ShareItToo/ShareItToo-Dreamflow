import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/navigation/main_navigation.dart';

void main() {
  testWidgets('primary navigation keeps every semantic target at least 48dp',
      (tester) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            bottomNavigationBar: BottomNavigationBar(
              type: BottomNavigationBarType.fixed,
              currentIndex: 0,
              onTap: (_) {},
              selectedLabelStyle: const TextStyle(fontSize: 10),
              unselectedLabelStyle: const TextStyle(fontSize: 10),
              items: mainNavigationLabelKeys
                  .map(
                    (label) => BottomNavigationBarItem(
                      icon: mainNavigationTouchTarget(
                        const Icon(Icons.circle, size: 20),
                      ),
                      activeIcon: mainNavigationTouchTarget(
                        const Icon(Icons.circle, size: 20),
                      ),
                      label: label,
                    ),
                  )
                  .toList(growable: false),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    for (final label in mainNavigationLabelKeys) {
      final node = tester.getSemantics(
        find.bySemanticsLabel(RegExp('^${RegExp.escape(label)}(?:\\n|\$)')),
      );
      expect(
        node.rect.width,
        greaterThanOrEqualTo(mainNavigationMinimumTouchTarget),
        reason: '$label must retain a 48dp semantic width',
      );
      expect(
        node.rect.height,
        greaterThanOrEqualTo(mainNavigationMinimumTouchTarget),
        reason: '$label must retain a 48dp semantic height',
      );
    }
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets('touch-target wrapper preserves a smaller visual icon',
      (tester) async {
    const visualKey = Key('visual-icon');
    await tester.pumpWidget(
      const MaterialApp(
        home: Center(
          child: SizedBox(),
        ),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: mainNavigationTouchTarget(
            const SizedBox(key: visualKey, width: 20, height: 20),
          ),
        ),
      ),
    );

    expect(
      tester.getSize(find.byType(Center).last),
      const Size(
        mainNavigationMinimumTouchTarget,
        mainNavigationMinimumTouchTarget,
      ),
    );
    expect(tester.getSize(find.byKey(visualKey)), const Size(20, 20));
  });
}
