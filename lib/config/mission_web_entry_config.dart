import 'package:flutter/foundation.dart';

/// Independent presentation-only switch. It grants no domain capability.
class MissionWebEntryConfig {
  static const enabled = bool.fromEnvironment(
    'SIT_MISSION_WEB_PREVIEW_ENABLED',
    defaultValue: false,
  );
  static bool get available => availableFor(isWeb: kIsWeb, enabled: enabled);

  static bool availableFor({required bool isWeb, required bool enabled}) =>
      isWeb && enabled;
}
