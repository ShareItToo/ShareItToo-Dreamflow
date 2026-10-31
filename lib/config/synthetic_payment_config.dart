import 'package:flutter/foundation.dart';
import 'synthetic_clone_config.dart';

abstract final class SyntheticPaymentConfig {
  static const flag = String.fromEnvironment(
      'SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE',
      defaultValue: 'false');
  static const requested = flag == 'true';
  static bool validFlag(String value) => value == 'true' || value == 'false';
  static const bundleId = String.fromEnvironment('SIT_BUNDLE_ID');
  static bool allowed(
          {required bool requested,
          required bool release,
          required bool clone,
          required String bundle}) =>
      !requested || (!release && clone && bundle == 'com.shareittoo.app.qa');
  static bool get enabled =>
      requested &&
      allowed(
          requested: requested,
          release: kReleaseMode || kProfileMode,
          clone: SyntheticCloneConfig.isSyntheticCloneNonBinding,
          bundle: bundleId);
  static void validateCurrentBuild() {
    if (!validFlag(flag)) throw StateError('synthetic_payment_flag_invalid');
    if (!allowed(
        requested: requested,
        release: kReleaseMode || kProfileMode,
        clone: SyntheticCloneConfig.isSyntheticCloneNonBinding,
        bundle: bundleId)) {
      throw StateError('synthetic_payment_local_qa_build_required');
    }
  }
}
