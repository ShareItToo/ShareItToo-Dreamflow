import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/blocked_users_service.dart';
import 'package:lendify/services/user_reports_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  test('non-acute QA intake records one harassment report and blocks contact',
      () async {
    final directContactBlocked =
        await UserReportsService.addHarassmentBlockReport(
      reporterUserId: 'reporter',
      reportedUserId: 'reported',
      immediateDanger: false,
      idempotencyKey: 's4j-flutter-local',
      details: 'Kontrollierter nicht-akuter Testfall',
    );

    final prefs = await SharedPreferences.getInstance();
    final reports = jsonDecode(prefs.getString('user_reports_v1')!) as List;
    expect(reports, hasLength(1));
    expect((reports.single as Map)['reasonCode'], 'harassment');
    expect(directContactBlocked, isTrue);
    expect(await BlockedUsersService.isBlocked('reported'), isTrue);
  });

  test('acute danger is rejected before local report or block persistence',
      () async {
    await expectLater(
      UserReportsService.addHarassmentBlockReport(
        reporterUserId: 'reporter',
        reportedUserId: 'reported',
        immediateDanger: true,
        idempotencyKey: 's4j-flutter-acute',
      ),
      throwsArgumentError,
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('user_reports_v1'), isNull);
    expect(await BlockedUsersService.isBlocked('reported'), isFalse);
  });
}
