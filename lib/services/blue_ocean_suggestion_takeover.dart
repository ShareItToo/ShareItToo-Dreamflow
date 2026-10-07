/// State boundary for the deliberate takeover of AI listing suggestions.
///
/// A generated assistant result is never publication-authorizing by itself.
/// The saved editable values are retained for recovery, while the acceptance
/// bit must be set again for a fresh assistant result or a changed photo set.
class BlueOceanSuggestionTakeoverState {
  const BlueOceanSuggestionTakeoverState({
    required this.accepted,
    required this.editableFields,
  });

  const BlueOceanSuggestionTakeoverState.fresh()
      : accepted = false,
        editableFields = const <String, dynamic>{};

  final bool accepted;
  final Map<String, dynamic> editableFields;

  factory BlueOceanSuggestionTakeoverState.fromRecovery(
    Map<String, dynamic> fields,
  ) {
    final restored = Map<String, dynamic>.from(fields);
    final accepted = restored.remove('suggestionsAccepted') == true;
    return BlueOceanSuggestionTakeoverState(
      accepted: accepted,
      editableFields: Map<String, dynamic>.unmodifiable(restored),
    );
  }

  BlueOceanSuggestionTakeoverState accept(
    Map<String, dynamic> suggestionFields,
  ) {
    return BlueOceanSuggestionTakeoverState(
      accepted: true,
      editableFields: Map<String, dynamic>.unmodifiable(
        <String, dynamic>{...editableFields, ...suggestionFields},
      ),
    );
  }

  BlueOceanSuggestionTakeoverState resetForNewAssistant() =>
      BlueOceanSuggestionTakeoverState(
        accepted: false,
        editableFields: editableFields,
      );

  BlueOceanSuggestionTakeoverState resetForPhotoReplacement() =>
      const BlueOceanSuggestionTakeoverState.fresh();

  bool get canPublish => accepted;

  Map<String, dynamic> toRecoveryFields() =>
      <String, dynamic>{...editableFields, 'suggestionsAccepted': accepted};
}
