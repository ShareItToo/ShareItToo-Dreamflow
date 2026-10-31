import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/mission_need_display.dart';

void main() {
  test('maps supported mission need to its product label', () {
    expect(
      missionNeedDisplayLabel('plant_container_equipment'),
      'Pflanzkübel-Ausstattung',
    );
  });

  test('preserves unknown user-defined mission need text', () {
    expect(missionNeedDisplayLabel('custom_user_need'), 'custom_user_need');
  });
}
