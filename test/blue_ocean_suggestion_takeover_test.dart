import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/blue_ocean_suggestion_takeover.dart';

void main() {
  test('fresh assistant result is not accepted and has no auto-applied values', () {
    const state = BlueOceanSuggestionTakeoverState.fresh();

    expect(state.accepted, isFalse);
    expect(state.editableFields, isEmpty);
    expect(state.canPublish, isFalse);
  });

  test('explicit takeover applies suggestions and authorizes only that state', () {
    const fresh = BlueOceanSuggestionTakeoverState.fresh();

    final accepted = fresh.accept(<String, dynamic>{
      'title': 'Bohrmaschine',
      'condition': 'good',
    });

    expect(accepted.accepted, isTrue);
    expect(accepted.canPublish, isTrue);
    expect(accepted.editableFields, <String, dynamic>{
      'title': 'Bohrmaschine',
      'condition': 'good',
    });
  });

  test('accepted recovery restores editable values and acceptance', () {
    final restored = BlueOceanSuggestionTakeoverState.fromRecovery(
      <String, dynamic>{
        'suggestionsAccepted': true,
        'title': 'Geretteter Entwurf',
        'description': 'Manuell geprüft.',
      },
    );

    expect(restored.accepted, isTrue);
    expect(restored.canPublish, isTrue);
    expect(restored.editableFields, <String, dynamic>{
      'title': 'Geretteter Entwurf',
      'description': 'Manuell geprüft.',
    });
    expect(restored.toRecoveryFields()['suggestionsAccepted'], isTrue);
  });

  test('unaccepted recovery stays blocked and new photos/new analysis reset it', () {
    final unacceptedRecovery = BlueOceanSuggestionTakeoverState.fromRecovery(
      <String, dynamic>{
        'suggestionsAccepted': false,
        'title': 'Noch zu prüfen',
      },
    );
    expect(unacceptedRecovery.canPublish, isFalse);

    final accepted = unacceptedRecovery.accept(<String, dynamic>{
      'title': 'Übernommen',
    });
    expect(accepted.canPublish, isTrue);
    expect(accepted.resetForNewAssistant().canPublish, isFalse);
    expect(accepted.resetForPhotoReplacement().editableFields, isEmpty);
    expect(accepted.resetForPhotoReplacement().accepted, isFalse);
  });
}
