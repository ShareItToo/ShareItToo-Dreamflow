import 'package:flutter/foundation.dart';

/// Controls the bottom navigation tab index.
///
/// This allows screens deeper in the Navigator stack (e.g. settings pages)
/// to switch the main tab (e.g. jump to "Entdecken") without pushing a new
/// ExploreScreen route.
class MainNavController extends ChangeNotifier {
  int _index;
  MainNavController({int initialIndex = 0}) : _index = initialIndex;

  int get index => _index;

  void setIndex(int next) {
    if (next == _index) return;
    _index = next;
    notifyListeners();
  }
}
