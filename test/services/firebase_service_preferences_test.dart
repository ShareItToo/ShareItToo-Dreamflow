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

  test('backend cleanup owners are additive and can be removed independently',
      () async {
    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      true,
      ownerToken: 'owner-a',
    );
    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      true,
      ownerToken: 'owner-b',
    );

    var preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.pushBackendCleanupOwnerTokens, ['owner-a', 'owner-b']);

    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      false,
      ownerToken: 'owner-b',
    );
    preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.pushBackendCleanupPending, isTrue);
    expect(preferences.pushBackendCleanupOwnerTokens, ['owner-a']);

    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      false,
      ownerToken: 'owner-a',
    );
    preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.pushBackendCleanupPending, isFalse);
    expect(preferences.pushBackendCleanupOwnerTokens, isEmpty);
  });

  test('legacy single owner is retained when pending bool is stale', () async {
    SharedPreferences.setMockInitialValues({
      'firebase_push_backend_cleanup_pending_v1': false,
      'firebase_push_backend_cleanup_owner_token_v1': 'legacy-a',
    });

    var preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.pushBackendCleanupPending, isTrue);
    expect(preferences.pushBackendCleanupOwnerTokens, ['legacy-a']);

    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      true,
      ownerToken: 'owner-b',
    );
    preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.pushBackendCleanupOwnerTokens, ['legacy-a', 'owner-b']);

    await FirebaseServicePreferencesStore.setPushBackendCleanupPending(
      false,
      ownerToken: 'owner-b',
    );
    expect(
      (await FirebaseServicePreferencesStore.read())
          .pushBackendCleanupOwnerTokens,
      ['legacy-a'],
    );
  });

  test('crash opt-out records cleanup pending independently', () async {
    await FirebaseServicePreferencesStore.setCrashDiagnosticsEnabled(true);
    await FirebaseServicePreferencesStore.setCrashDiagnosticsCleanupPending(
      true,
    );

    var preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.crashDiagnosticsEnabled, isTrue);
    expect(preferences.crashDiagnosticsCleanupPending, isTrue);

    await FirebaseServicePreferencesStore.setCrashDiagnosticsEnabled(false);
    preferences = await FirebaseServicePreferencesStore.read();
    expect(preferences.crashDiagnosticsEnabled, isFalse);
    expect(preferences.crashDiagnosticsCleanupPending, isTrue);

    await FirebaseServicePreferencesStore.setCrashDiagnosticsCleanupPending(
      false,
    );
    expect(
      (await FirebaseServicePreferencesStore.read())
          .crashDiagnosticsCleanupPending,
      isFalse,
    );
  });
}
