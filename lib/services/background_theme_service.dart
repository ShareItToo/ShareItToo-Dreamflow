import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String kDefaultDarkBackgroundAsset =
    'assets/images/backgrounds/sit_bg_dark_1.png';
const String kDefaultLightBackgroundAsset =
    'assets/images/backgrounds/sit_bg_light_1.png';

enum AppBackgroundChoice {
  dark1(
    'dark1',
    'Dark 1',
    kDefaultDarkBackgroundAsset,
    Brightness.dark,
    0.34,
  ),
  dark2(
    'dark2',
    'Dark 2',
    'assets/images/backgrounds/sit_bg_dark_2.png',
    Brightness.dark,
    0.32,
  ),
  light1(
    'light1',
    'Light 1',
    kDefaultLightBackgroundAsset,
    Brightness.light,
    0.46,
  ),
  light2(
    'light2',
    'Light 2',
    'assets/images/backgrounds/sit_bg_light_2.png',
    Brightness.light,
    0.50,
  );

  const AppBackgroundChoice(
    this.storageValue,
    this.uiLabel,
    this.assetPath,
    this.family,
    this.overlayOpacity,
  );

  final String storageValue;
  final String uiLabel;
  final String assetPath;
  final Brightness family;
  final double overlayOpacity;

  static AppBackgroundChoice? fromStorageValue(String? value) {
    for (final choice in values) {
      if (choice.storageValue == value) return choice;
    }
    return null;
  }
}

class BackgroundThemeController extends ChangeNotifier {
  static const String _prefsKey = 'app_background_choice_v1';

  AppBackgroundChoice? _selectedChoice;
  bool _hydrated = false;

  bool get hydrated => _hydrated;
  AppBackgroundChoice? get selectedChoice => _selectedChoice;
  ThemeMode get themeMode => switch (_selectedChoice?.family) {
        Brightness.dark => ThemeMode.dark,
        Brightness.light => ThemeMode.light,
        null => ThemeMode.system,
      };

  AppBackgroundChoice effectiveChoice(Brightness platformBrightness) {
    return _selectedChoice ??
        (platformBrightness == Brightness.dark
            ? AppBackgroundChoice.dark1
            : AppBackgroundChoice.light1);
  }

  Future<void> loadFromPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _selectedChoice = AppBackgroundChoice.fromStorageValue(
        prefs.getString(_prefsKey),
      );
    } catch (_) {
      _selectedChoice = null;
    } finally {
      _hydrated = true;
      notifyListeners();
    }
  }

  Future<void> setChoice(AppBackgroundChoice choice) async {
    _selectedChoice = choice;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, choice.storageValue);
    } catch (_) {
      // ignore
    }
  }

  Future<void> clearChoice() async {
    _selectedChoice = null;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefsKey);
    } catch (_) {
      // Keep the current session on the explicit system default. A later
      // successful choice/reset can persist the preference again.
    }
  }
}
