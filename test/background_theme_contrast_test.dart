import 'dart:ui' show SemanticsAction, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/background_settings_screen.dart';
import 'package:lendify/services/background_theme_service.dart';
import 'package:lendify/theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  test(
    'explicit background family controls theme and reset restores system',
    () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        'app_background_choice_v1': 'dark2',
      });
      final controller = BackgroundThemeController();
      expect(controller.hydrated, isFalse);

      await controller.loadFromPrefs();
      expect(controller.hydrated, isTrue);
      expect(controller.selectedChoice, AppBackgroundChoice.dark2);
      expect(controller.themeMode, ThemeMode.dark);

      await controller.setChoice(AppBackgroundChoice.light1);
      expect(controller.themeMode, ThemeMode.light);
      expect(
        (await SharedPreferences.getInstance()).getString(
          'app_background_choice_v1',
        ),
        'light1',
      );

      await controller.clearChoice();
      expect(controller.selectedChoice, isNull);
      expect(controller.themeMode, ThemeMode.system);
      expect(
        (await SharedPreferences.getInstance()).containsKey(
          'app_background_choice_v1',
        ),
        isFalse,
      );
      expect(
        controller.effectiveChoice(Brightness.dark),
        AppBackgroundChoice.dark1,
      );
      expect(
        controller.effectiveChoice(Brightness.light),
        AppBackgroundChoice.light1,
      );
    },
  );

  testWidgets(
    'background selector exposes exact selection semantics and adaptive labels',
    (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      final controller = BackgroundThemeController();
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpWidget(
          ChangeNotifierProvider<BackgroundThemeController>.value(
            value: controller,
            child: Consumer<BackgroundThemeController>(
              builder: (context, backgroundTheme, _) => MaterialApp(
                theme: buildLightTheme(context),
                darkTheme: buildDarkTheme(context),
                themeMode: backgroundTheme.themeMode,
                home: const BackgroundSettingsScreen(),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final systemChoice = find.bySemanticsLabel(
          'Systemeinstellung verwenden',
        );
        expect(systemChoice, findsOneWidget);
        var systemData = tester.getSemantics(systemChoice).getSemanticsData();
        expect(systemData.flagsCollection.isSelected, Tristate.isTrue);
        expect(systemData.hasAction(SemanticsAction.tap), isTrue);
        expect(systemData.rect.height, greaterThanOrEqualTo(48));

        final darkChoice = find.bySemanticsLabel('Dark 1 Hintergrund');
        expect(darkChoice, findsOneWidget);
        expect(
          tester
              .getSemantics(darkChoice)
              .getSemanticsData()
              .flagsCollection
              .isSelected,
          Tristate.isFalse,
        );

        await tester.tap(darkChoice);
        await tester.pumpAndSettle();
        expect(controller.selectedChoice, AppBackgroundChoice.dark1);
        expect(
          Theme.of(
            tester.element(find.byType(BackgroundSettingsScreen)),
          ).brightness,
          Brightness.dark,
        );
        expect(
          tester
              .getSemantics(find.bySemanticsLabel('Dark 1 Hintergrund'))
              .getSemanticsData()
              .flagsCollection
              .isSelected,
          Tristate.isTrue,
        );

        final darkLabel = tester.widget<Text>(find.text('Dark 1'));
        expect(darkLabel.style?.color, Colors.white);
        await tester.scrollUntilVisible(
          find.text('Light 1'),
          120,
          scrollable: find.byType(Scrollable),
        );
        final lightLabel = tester.widget<Text>(find.text('Light 1'));
        expect(lightLabel.style?.color, const Color(0xFF0F172A));

        await tester.tap(find.bySemanticsLabel('Systemeinstellung verwenden'));
        await tester.pumpAndSettle();
        expect(controller.selectedChoice, isNull);
        expect(controller.themeMode, ThemeMode.system);
        expect(
          Theme.of(
            tester.element(find.byType(BackgroundSettingsScreen)),
          ).brightness,
          Brightness.light,
        );
        systemData = tester
            .getSemantics(find.bySemanticsLabel('Systemeinstellung verwenden'))
            .getSemanticsData();
        expect(systemData.flagsCollection.isSelected, Tristate.isTrue);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );
}
