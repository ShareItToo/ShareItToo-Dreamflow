import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('identical shared string snapshots do not write; changed snapshots do',
      () async {
    SharedPreferences.setMockInitialValues({'items': '[{"id":"one"}]'});
    final prefs = await SharedPreferences.getInstance();

    final identicalWrite = await DataService.writePreferenceStringIfChanged(
      prefs,
      'items',
      '[{"id":"one"}]',
    );
    expect(identicalWrite, isFalse);
    expect(prefs.getString('items'), '[{"id":"one"}]');

    final changedWrite = await DataService.writePreferenceStringIfChanged(
      prefs,
      'items',
      '[{"id":"one"},{"id":"two"}]',
    );
    expect(changedWrite, isTrue);
    expect(prefs.getString('items'), '[{"id":"one"},{"id":"two"}]');
  });
}
