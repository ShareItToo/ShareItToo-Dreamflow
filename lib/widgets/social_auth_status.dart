import 'package:flutter/material.dart';

/// Plain status for a social provider that is not enabled in this build.
///
/// Keep unavailable providers out of the branded action-button treatment so
/// the UI does not suggest that an unconfigured sign-in is actionable.
class SocialAuthStatus extends StatelessWidget {
  final String providerName;

  const SocialAuthStatus({super.key, required this.providerName});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(
          '$providerName-Anmeldung ist derzeit nicht verfügbar.',
          textAlign: TextAlign.center,
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(color: Colors.white70),
        ),
      );
}
