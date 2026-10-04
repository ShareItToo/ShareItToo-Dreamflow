import 'package:flutter/material.dart';

import 'package:lendify/config/synthetic_clone_config.dart';

const String syntheticCloneNonBindingBannerText =
    'Synthetischer Test – keine vertragliche oder finanzielle Wirkung';

class SyntheticCloneNonBindingBanner extends StatelessWidget {
  final bool? enabledOverride;

  const SyntheticCloneNonBindingBanner({super.key, this.enabledOverride});

  @override
  Widget build(BuildContext context) {
    final enabled = enabledOverride ?? isSyntheticCloneNonBinding;
    if (!enabled) return const SizedBox.shrink();

    return Material(
      color: const Color(0xFF7C2D12),
      child: SafeArea(
        bottom: false,
        child: Semantics(
          container: true,
          liveRegion: true,
          label: syntheticCloneNonBindingBannerText,
          child: SizedBox(
            width: double.infinity,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Text(
                syntheticCloneNonBindingBannerText,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Widget buildSyntheticCloneMaterialAppShell({
  required Widget? child,
  bool? enabledOverride,
}) {
  final content = child ?? const SizedBox.shrink();
  return Column(
    children: [
      SyntheticCloneNonBindingBanner(enabledOverride: enabledOverride),
      Expanded(child: content),
    ],
  );
}
