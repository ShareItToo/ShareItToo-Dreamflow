import 'package:flutter/material.dart';

/// Read-only projection of the pending result, never an editable-field write.
/// Kept independent of analysis/HTTP so a recovered result also works offline.
class ListingSuggestionPreview extends StatelessWidget {
  const ListingSuggestionPreview({
    super.key,
    required this.fields,
    required this.categoryLabels,
  });

  final Map<dynamic, dynamic> fields;
  final Map<String, String> categoryLabels;

  static const _labels = <String, String>{
    'title': 'Titel',
    'category': 'Kategorie',
    'subcategory': 'Unterkategorie',
    'description': 'Beschreibung',
  };

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Vorschau – noch nicht übernommen',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          for (final entry in _labels.entries) _field(context, entry),
        ],
      );

  Widget _field(BuildContext context, MapEntry<String, String> entry) {
    final field = fields[entry.key];
    final raw = field is Map ? field['value'] : null;
    final confidence = field is Map ? field['confidence'] : null;
    final confident = confidence == 'HIGH' || confidence == 'MEDIUM';
    String? value =
        confident && raw is String && raw.trim().isNotEmpty ? raw.trim() : null;
    if (entry.key == 'category') value = categoryLabels[value];
    final display = value ?? 'Kein sicherer Vorschlag – bitte selbst ergänzen.';
    final review = value == null ? '' : 'Vorschlag – bitte prüfen.';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Semantics(
        container: true,
        label: '${entry.value}: $display $review'.trim(),
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(entry.value, style: Theme.of(context).textTheme.labelLarge),
            Text(display),
            if (review.isNotEmpty)
              Text(review, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
