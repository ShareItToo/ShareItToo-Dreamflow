import 'package:flutter/material.dart';

class SyntheticCloneChatPanel extends StatelessWidget {
  final List<Map<String, dynamic>> messages;
  final bool busy;
  final ValueChanged<String> onSendTemplate;

  const SyntheticCloneChatPanel({
    super.key,
    required this.messages,
    required this.busy,
    required this.onSendTemplate,
  });

  @override
  Widget build(BuildContext context) => Card(
        key: const ValueKey('synthetic-clone-chat'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Synthetischer Chat · keine externe Nachricht',
                  style: TextStyle(fontWeight: FontWeight.w800)),
              for (final message in messages)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(message['text']?.toString() ?? ''),
                  subtitle: Text('Testrolle: ${message['actorRole'] ?? ''}'),
                ),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton(
                    key: const ValueKey('synthetic-clone-chat-handover'),
                    onPressed:
                        busy ? null : () => onSendTemplate('handover_arranged'),
                    child: const Text('Übergabe abstimmen'),
                  ),
                  OutlinedButton(
                    key: const ValueKey('synthetic-clone-chat-return'),
                    onPressed:
                        busy ? null : () => onSendTemplate('return_arranged'),
                    child: const Text('Rückgabe abstimmen'),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}

class SyntheticCloneReviewDraftPanel extends StatelessWidget {
  final List<Map<String, dynamic>> reviewDrafts;
  final bool ownDraftExists;
  final bool busy;
  final int rating;
  final ValueChanged<int> onRatingChanged;
  final VoidCallback onSave;

  const SyntheticCloneReviewDraftPanel({
    super.key,
    required this.reviewDrafts,
    required this.ownDraftExists,
    required this.busy,
    required this.rating,
    required this.onRatingChanged,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) => Card(
        key: const ValueKey('synthetic-clone-review-drafts'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Private synthetische Bewertungsentwürfe',
                  style: TextStyle(fontWeight: FontWeight.w800)),
              const Text(
                  'Keine Veröffentlichung, kein Profilwert und kein Ranking.'),
              for (final draft in reviewDrafts)
                ListTile(
                  key: ValueKey(
                      'synthetic-review-draft-${draft['reviewerRole']}'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                      '${draft['direction']}: ${draft['rating']}/5 · nur Entwurf'),
                ),
              if (!ownDraftExists) ...[
                DropdownButtonFormField<int>(
                  key: const ValueKey('synthetic-clone-review-rating'),
                  initialValue: rating,
                  decoration: const InputDecoration(
                      labelText: 'Synthetische Testbewertung'),
                  items: List<DropdownMenuItem<int>>.generate(
                    5,
                    (index) => DropdownMenuItem<int>(
                      value: index + 1,
                      child: Text('${index + 1} von 5 · Testwert'),
                    ),
                  ),
                  onChanged: busy
                      ? null
                      : (value) {
                          if (value != null) onRatingChanged(value);
                        },
                ),
                const SizedBox(height: 8),
                FilledButton(
                  key: const ValueKey('synthetic-clone-save-review-draft'),
                  onPressed: busy ? null : onSave,
                  child: const Text('Testentwurf speichern'),
                ),
              ],
            ],
          ),
        ),
      );
}
