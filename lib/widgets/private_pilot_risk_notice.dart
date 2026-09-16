import 'package:flutter/material.dart';
import 'package:lendify/config/private_pilot_config.dart';

class PrivatePilotRiskNotice extends StatelessWidget {
  final String? title;

  const PrivatePilotRiskNotice({super.key, this.title});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Semantics(
      container: true,
      label: '${title ?? 'Eigenverantwortliche Risikopruefung'}. '
          '${PrivatePilotConfig.riskNotice}',
      child: Card(
        color: colors.secondaryContainer.withValues(alpha: 0.58),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.policy_outlined, color: colors.onSecondaryContainer),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title ?? 'Eigenverantwortliche Risikopruefung',
                      style: TextStyle(
                        color: colors.onSecondaryContainer,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      PrivatePilotConfig.riskNotice,
                      style: TextStyle(
                        color: colors.onSecondaryContainer,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
