import 'package:flutter/material.dart';

Future<void> showIdentityVerificationUnavailable(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Identitätsprüfung noch nicht verfügbar'),
      content: const Text(
        'ShareItToo bindet vor dem Produktionsstart einen geprüften Identitätsanbieter an. Bis dahin werden keine Ausweise oder Selfies entgegengenommen und keine Demo als echte Prüfung angezeigt.',
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: const Text('Verstanden'),
        ),
      ],
    ),
  );
}
