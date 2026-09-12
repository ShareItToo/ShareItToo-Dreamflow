import 'package:flutter/material.dart';
import 'package:lendify/models/supply_enrichment.dart';

typedef SupplyEnrichmentOutcomeRecorder = Future<SupplyEnrichmentOutcomeResult>
    Function(
  SupplyEnrichmentSuggestion suggestion,
  SupplyEnrichmentOutcome outcome,
);

class SupplyEnrichmentDialog extends StatefulWidget {
  const SupplyEnrichmentDialog({
    super.key,
    required this.session,
    required this.onOutcome,
  });

  final SupplyEnrichmentSession session;
  final SupplyEnrichmentOutcomeRecorder onOutcome;

  static Future<SupplyEnrichmentOutcomeResult?> show(
    BuildContext context, {
    required SupplyEnrichmentSession session,
    required SupplyEnrichmentOutcomeRecorder onOutcome,
  }) {
    return showDialog<SupplyEnrichmentOutcomeResult>(
      context: context,
      barrierDismissible: true,
      builder: (_) => SupplyEnrichmentDialog(
        session: session,
        onOutcome: onOutcome,
      ),
    );
  }

  @override
  State<SupplyEnrichmentDialog> createState() => _SupplyEnrichmentDialogState();
}

class _SupplyEnrichmentDialogState extends State<SupplyEnrichmentDialog> {
  final Set<String> _completed = <String>{};
  String? _busySuggestionId;
  String? _error;

  Future<void> _record(
    SupplyEnrichmentSuggestion suggestion,
    SupplyEnrichmentOutcome outcome,
  ) async {
    if (_busySuggestionId != null) return;
    setState(() {
      _busySuggestionId = suggestion.id;
      _error = null;
    });
    try {
      final result = await widget.onOutcome(suggestion, outcome);
      if (!mounted) return;
      if (result.prefill != null) {
        Navigator.of(context).pop(result);
        return;
      }
      setState(() {
        _completed.add(suggestion.id);
        _busySuggestionId = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busySuggestionId = null;
        _error = 'Die Auswahl konnte nicht gespeichert werden.';
      });
    }
  }

  Widget _action(
    SupplyEnrichmentSuggestion suggestion,
    SupplyEnrichmentOutcome outcome,
    String label,
    IconData icon,
  ) {
    return OutlinedButton.icon(
      onPressed:
          _busySuggestionId == null ? () => _record(suggestion, outcome) : null,
      icon: Icon(icon, size: 17),
      label: Text(label),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pending = widget.session.suggestions
        .where((suggestion) =>
            suggestion.outcome == null && !_completed.contains(suggestion.id))
        .toList(growable: false);
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620, maxHeight: 720),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Passt noch etwas dazu?',
                      style:
                          TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Schließen',
                    onPressed: _busySuggestionId == null
                        ? () => Navigator.of(context).maybePop()
                        : null,
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const Text(
                'Das sind nur Fragen auf Basis der gewählten Kategorie. '
                'Deine Anzeige wurde bereits erstellt.',
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 12),
              Flexible(
                child: pending.isEmpty
                    ? const Center(
                        child: Text('Alle Antworten wurden gespeichert.'),
                      )
                    : ListView.separated(
                        shrinkWrap: true,
                        itemCount: pending.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final suggestion = pending[index];
                          final busy = _busySuggestionId == suggestion.id;
                          return Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text(
                                    suggestion.prompt,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  if (busy)
                                    const LinearProgressIndicator()
                                  else
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        _action(
                                          suggestion,
                                          SupplyEnrichmentOutcome
                                              .includedAccessory,
                                          'Als Zubehör enthalten',
                                          Icons.inventory_2_outlined,
                                        ),
                                        _action(
                                          suggestion,
                                          SupplyEnrichmentOutcome
                                              .separateRental,
                                          'Separat vermieten',
                                          Icons.add_link,
                                        ),
                                        _action(
                                          suggestion,
                                          SupplyEnrichmentOutcome
                                              .standaloneListing,
                                          'Neue eigene Anzeige',
                                          Icons.post_add,
                                        ),
                                        _action(
                                          suggestion,
                                          SupplyEnrichmentOutcome.notPart,
                                          'Gehört nicht dazu',
                                          Icons.remove_circle_outline,
                                        ),
                                        _action(
                                          suggestion,
                                          SupplyEnrichmentOutcome
                                              .wrongDetection,
                                          'Vorschlag ist falsch',
                                          Icons.feedback_outlined,
                                        ),
                                      ],
                                    ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _busySuggestionId == null
                      ? () => Navigator.of(context).maybePop()
                      : null,
                  child: Text(pending.isEmpty ? 'Fertig' : 'Später'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
