import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/create_listing_screen.dart';

Map<String, dynamic> _assistant({
  required String titleConfidence,
  required String categoryConfidence,
  required String subcategoryConfidence,
  required String descriptionConfidence,
  String title = 'Bohrmaschine',
  String category = 'tools',
  String subcategory = 'drill',
  String description = 'Robuste Bohrmaschine für Renovierungsarbeiten.',
  Map<String, dynamic>? optionalFields,
}) {
  final fields = <String, dynamic>{
    'title': <String, dynamic>{'value': title, 'confidence': titleConfidence},
    'category': <String, dynamic>{
      'value': category,
      'confidence': categoryConfidence,
    },
    'subcategory': <String, dynamic>{
      'value': subcategory,
      'confidence': subcategoryConfidence,
    },
    'description': <String, dynamic>{
      'value': description,
      'confidence': descriptionConfidence,
    },
    ...?optionalFields,
  };
  return <String, dynamic>{
    'status': 'draft_ready',
    'revision': <String, dynamic>{'fields': fields},
  };
}

void main() {
  test('all-low fields are not actionable', () {
    expect(
      isActionableBlueOceanAssistant(
        _assistant(
          titleConfidence: 'LOW',
          categoryConfidence: 'LOW',
          subcategoryConfidence: 'LOW',
          descriptionConfidence: 'LOW',
          title: '',
          category: '',
          subcategory: '',
          description: '',
        ),
      ),
      isFalse,
    );
  });

  test('optional fields alone are never actionable', () {
    expect(
      isActionableBlueOceanAssistant(
        _assistant(
          titleConfidence: 'LOW',
          categoryConfidence: 'LOW',
          subcategoryConfidence: 'LOW',
          descriptionConfidence: 'LOW',
          title: '',
          category: '',
          subcategory: '',
          description: '',
          optionalFields: <String, dynamic>{
            'brand': <String, dynamic>{'value': 'Bosch', 'confidence': 'HIGH'},
            'model': <String, dynamic>{
              'value': 'GSR 18V',
              'confidence': 'HIGH',
            },
          },
        ),
      ),
      isFalse,
    );
  });

  test('a complete medium-confidence core is actionable', () {
    expect(
      isActionableBlueOceanAssistant(
        _assistant(
          titleConfidence: 'MEDIUM',
          categoryConfidence: 'MEDIUM',
          subcategoryConfidence: 'MEDIUM',
          descriptionConfidence: 'MEDIUM',
        ),
      ),
      isTrue,
    );
  });

  test('a complete mixed high-medium core is actionable', () {
    expect(
      isActionableBlueOceanAssistant(
        _assistant(
          titleConfidence: 'HIGH',
          categoryConfidence: 'MEDIUM',
          subcategoryConfidence: 'HIGH',
          descriptionConfidence: 'MEDIUM',
        ),
      ),
      isTrue,
    );
  });
}
