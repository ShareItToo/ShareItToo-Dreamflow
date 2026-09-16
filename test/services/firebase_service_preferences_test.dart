import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/firebase_service_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  test('Firebase device services default to opt-out', () async {
    final preferences = await FirebaseServicePreferencesStore.read();

    expect(preferences.pushEnabled, isFalse);
    expect(preferences.crashDiagnosticsEnabled, isFalse);
    expect(preferences.pushBackendCleanupPending, isFalse);
    expect(preferences.pushBackendCleanupOwnerToken, isNull);
    expect(preferences.pushLocalCleanupPending, isFalse);
    expect(preferences.installationCleanupPending, isFalse);
  });

  test('push and crash decisions persist independently', () async {
    final decidedAt = DateTime.utc(2026, 8, 16, 12, 30);

    await FirebaseServicePreferencesStore.setPushEnabled(
      true,
      decidedAt: decidedAt,
    );
    await FirebaseServicePreferencesStore.setCrashDiagnosticsEnabled(
      false,
      decidedAt: decidedAt,
    );
    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      true,
      ownerToken: 'opaque-session-owner',
    );
    await FirebaseServicePreferencesStore.setPushLocalCleanupPending(true);
    await FirebaseServicePreferencesStore.setInstallationCleanupPending(true);

    final preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.pushEnabled, isTrue);
    expect(preferences.crashDiagnosticsEnabled, isFalse);
    expect(preferences.pushBackendCleanupPending, isTrue);
    expect(
      preferences.pushBackendCleanupOwnerToken,
      'opaque-session-owner',
    );
    expect(preferences.pushLocalCleanupPending, isTrue);
    expect(preferences.installationCleanupPending, isTrue);
  });

  test('backend cleanup cannot be persisted without an exact owner', () async {
    await expectLater(
      FirebaseServicePreferencesStore.setPushBackendCleanupPending(true),
      throwsArgumentError,
    );
  });

  test('clearing backend cleanup also removes its owner token', () async {
    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      true,
      ownerToken: 'opaque-session-owner',
    );
    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(false);

    final preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.pushBackendCleanupPending, isFalse);
    expect(preferences.pushBackendCleanupOwnerToken, isNull);
  });
}
