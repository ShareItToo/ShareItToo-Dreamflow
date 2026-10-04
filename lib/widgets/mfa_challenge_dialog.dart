import 'package:flutter/material.dart';

import '../models/mfa.dart';
import 'tracked_dialog_route.dart';

/// Prompts for one ephemeral TOTP or recovery code. The caller owns the
/// route handle so a stale account action can dismiss only its own dialog.
Future<String?> showMfaChallengeDialog(
  BuildContext context, {
  required AuthMfaChallenge challenge,
  required TrackedDialogRouteHandle<String> handle,
}) {
  final controller = TextEditingController();
  return showTrackedDialog<String>(
    context: context,
    handle: handle,
    barrierDismissible: false,
    barrierLabel: 'Zwei-Faktor-Code eingeben',
    builder: (dialogContext) => AlertDialog(
      title: const Text('Zwei-Faktor-Code'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Gib den aktuellen Authenticator-Code oder einen einmaligen '
            'Wiederherstellungscode ein.',
          ),
          const SizedBox(height: 14),
          TextField(
            controller: controller,
            autofocus: true,
            keyboardType: TextInputType.text,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(
              labelText: 'Code',
              hintText: '123456 oder Wiederherstellungscode',
            ),
            onSubmitted: (value) {
              final code = value.trim();
              if (code.isNotEmpty) handle.dismiss(code);
            },
          ),
          const SizedBox(height: 8),
          Text(
            'Gültig bis ${MaterialLocalizations.of(dialogContext).formatShortDate(challenge.expiresAt.toLocal())} '
            'um ${MaterialLocalizations.of(dialogContext).formatTimeOfDay(TimeOfDay.fromDateTime(challenge.expiresAt.toLocal()))}.',
            style: Theme.of(dialogContext).textTheme.bodySmall,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => handle.dismiss(),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          onPressed: () {
            final code = controller.text.trim();
            if (code.isNotEmpty) handle.dismiss(code);
          },
          child: const Text('Bestätigen'),
        ),
      ],
    ),
  ).whenComplete(controller.dispose);
}
