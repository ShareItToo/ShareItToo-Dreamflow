import 'package:flutter/material.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/owner_acceptance_deadline_policy.dart';

class OwnerRequestInlineActions extends StatelessWidget {
  final RentalRequest request;
  final bool requiresRemoteDeadline;
  final DateTime now;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const OwnerRequestInlineActions({
    super.key,
    required this.request,
    required this.requiresRemoteDeadline,
    required this.now,
    required this.onAccept,
    required this.onDecline,
  });

  @override
  Widget build(BuildContext context) {
    final deadlineValid = OwnerAcceptanceDeadlinePolicy.isValid(
      simulationOnly: request.simulationOnly,
      requiresRemoteDeadline: requiresRemoteDeadline,
      deadline: request.bindingExpiresAt,
      now: now,
    );
    final blockedMessage = OwnerAcceptanceDeadlinePolicy.blockedMessage(
      simulationOnly: request.simulationOnly,
      requiresRemoteDeadline: requiresRemoteDeadline,
      deadline: request.bindingExpiresAt,
      now: now,
    );
    final theme = Theme.of(context);
    final acceptColor = deadlineValid
        ? const Color(0xFF22C55E)
        : theme.colorScheme.onSurface.withValues(alpha: 0.38);

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 360),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            TextButton.icon(
              key: const ValueKey('owner-request-accept'),
              onPressed: deadlineValid ? onAccept : null,
              icon: Icon(Icons.check_circle_outline,
                  size: 16, color: acceptColor),
              label: Text('Akzeptieren', style: TextStyle(color: acceptColor)),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                minimumSize: const Size(0, 24),
                visualDensity:
                    const VisualDensity(horizontal: -3, vertical: -3),
              ),
            ),
            const SizedBox(width: 6),
            TextButton.icon(
              key: const ValueKey('owner-request-decline'),
              onPressed: onDecline,
              icon: Icon(Icons.cancel_outlined,
                  size: 16, color: theme.colorScheme.error),
              label: Text('Ablehnen',
                  style: TextStyle(color: theme.colorScheme.error)),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                minimumSize: const Size(0, 24),
                visualDensity:
                    const VisualDensity(horizontal: -3, vertical: -3),
              ),
            ),
          ]),
          if (blockedMessage != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 6),
              child: Text(
                blockedMessage,
                style: TextStyle(
                  color: theme.colorScheme.error,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
