import 'package:flutter/material.dart';

class LocalStateErrorPanel extends StatelessWidget {
  final String title;
  final String message;
  final String semanticLabel;
  final VoidCallback? onRetry;
  final bool retrying;

  const LocalStateErrorPanel({
    super.key,
    required this.title,
    required this.message,
    required this.semanticLabel,
    required this.onRetry,
    this.retrying = false,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Semantics(
      container: true,
      explicitChildNodes: true,
      child: Card(
        margin: EdgeInsets.zero,
        color: colors.errorContainer,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Semantics(
                liveRegion: true,
                label: semanticLabel,
                child: ExcludeSemantics(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.sync_problem_outlined, color: colors.error),
                      const SizedBox(height: 10),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              color: colors.onErrorContainer,
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        message,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: colors.onErrorContainer,
                              height: 1.4,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: retrying ? null : onRetry,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 48),
                  foregroundColor: colors.onErrorContainer,
                  side: BorderSide(color: colors.onErrorContainer),
                ),
                icon: retrying
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
                label: const Text('Erneut laden'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
