// Test-only registration: flutter test --platform chrome does not register
// application plugins. This is the real localStorage adapter, not a fake.
// ignore: depend_on_referenced_packages
import 'package:shared_preferences_web/shared_preferences_web.dart';

void registerBrowserStore() => SharedPreferencesPlugin.registerWith(null);
