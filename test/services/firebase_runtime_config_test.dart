import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

void main() {
  tearDown(() {
    FirebaseRuntime.markAuthenticatedPushSessionActiveForTesting(false);
  });

  test('logout closes account-bound foreground push synchronously', () {
    FirebaseRuntime.markAuthenticatedPushSessionActiveForTesting(true);
    expect(FirebaseRuntime.authenticatedPushSessionActive, isTrue);

    FirebaseRuntime.closeAuthenticatedPushSessionForLogout();

    expect(FirebaseRuntime.authenticatedPushSessionActive, isFalse);
  });

  group('FirebaseRuntimeConfig', () {
    test('requires all four platform identifiers', () {
      expect(
        FirebaseRuntimeConfig.hasCompleteValues(
          project: 'shareittoo-staging',
          sender: '123456789',
          appId: '1:123456789:android:abc',
          apiKey: 'api-key',
        ),
        isTrue,
      );
      expect(
        FirebaseRuntimeConfig.hasCompleteValues(
          project: 'shareittoo-staging',
          sender: '123456789',
          appId: '',
          apiKey: 'api-key',
        ),
        isFalse,
      );
    });

    test('stays safely disabled when no build-time Firebase values exist', () {
      expect(FirebaseRuntimeConfig.currentOptions, isNull);
    });
  });

  group('waitForApplePushToken', () {
    test('returns an immediately available APNs token', () async {
      var reads = 0;
      final token = await waitForApplePushToken(
        readToken: () async {
          reads += 1;
          return '  apns-token  ';
        },
        delay: (_) async {},
      );

      expect(token, 'apns-token');
      expect(reads, 1);
    });

    test('waits until APNs has produced a token', () async {
      var reads = 0;
      var delays = 0;
      final token = await waitForApplePushToken(
        readToken: () async {
          reads += 1;
          return reads < 3 ? null : 'apns-token';
        },
        delay: (_) async {
          delays += 1;
        },
        maxAttempts: 4,
      );

      expect(token, 'apns-token');
      expect(reads, 3);
      expect(delays, 2);
    });

    test('fails closed when APNs never produces a token', () async {
      var reads = 0;
      final token = await waitForApplePushToken(
        readToken: () async {
          reads += 1;
          return null;
        },
        delay: (_) async {},
        maxAttempts: 3,
      );

      expect(token, isNull);
      expect(reads, 3);
    });
  });

  group('controlled Crashlytics diagnostic gate', () {
    test('permits collection only in release mode after explicit opt-in', () {
      expect(
        crashDiagnosticsCollectionAllowed(
          releaseMode: true,
          userEnabled: true,
        ),
        isTrue,
      );
      expect(
        crashDiagnosticsCollectionAllowed(
          releaseMode: false,
          userEnabled: true,
        ),
        isFalse,
      );
      expect(
        crashDiagnosticsCollectionAllowed(
          releaseMode: true,
          userEnabled: false,
        ),
        isFalse,
      );
    });

    test('allows only non-personal release mapping custom keys', () {
      expect(
        controlledCrashDiagnosticCustomKeys,
        {
          'sit_release_commit',
          'sit_build_number',
          'sit_release_channel',
          'sit_diagnostic_run_id',
        },
      );
      for (final key in controlledCrashDiagnosticCustomKeys) {
        expect(controlledCrashDiagnosticCustomKeyAllowed(key), isTrue);
      }
      for (final forbidden in [
        'user_id',
        'case_id',
        'account_id',
        'email',
        'phone_number',
      ]) {
        expect(controlledCrashDiagnosticCustomKeyAllowed(forbidden), isFalse);
      }
      expect(
        controlledCrashDiagnosticCustomValueAllowed(
          'sit_release_commit',
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
        isTrue,
      );
      expect(
        controlledCrashDiagnosticCustomValueAllowed(
          'sit_build_number',
          '2026082201',
        ),
        isTrue,
      );
      expect(
        controlledCrashDiagnosticCustomValueAllowed(
          'sit_release_channel',
          'internal',
        ),
        isTrue,
      );
      expect(
        controlledCrashDiagnosticCustomValueAllowed(
          'sit_diagnostic_run_id',
          'b11-android-2026082201',
        ),
        isTrue,
      );
      expect(
        controlledCrashDiagnosticCustomValueAllowed(
          'sit_diagnostic_run_id',
          '',
        ),
        isTrue,
      );
      for (final value in [
        'person@example.com',
        'case-11111111-1111-4111-8111-111111111111',
        'internal/user-1',
      ]) {
        for (final key in controlledCrashDiagnosticCustomKeys) {
          expect(
            controlledCrashDiagnosticCustomValueAllowed(key, value),
            isFalse,
          );
        }
      }
    });

    test('allows only the exact internal staging release run', () {
      expect(
        controlledCrashDiagnosticAllowed(
          releaseMode: true,
          enabled: true,
          apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
          releaseChannel: 'internal',
          configuredRunId: 'b11-android-2026081027',
          requestedRunId: 'b11-android-2026081027',
        ),
        isTrue,
      );
    });

    test('fails closed outside the exact bounded run', () {
      bool allowed({
        bool releaseMode = true,
        bool enabled = true,
        String apiBaseUrl = 'https://staging.shareittoo.com/api/v1',
        String releaseChannel = 'internal',
        String configuredRunId = 'b11-android-2026081027',
        String requestedRunId = 'b11-android-2026081027',
      }) =>
          controlledCrashDiagnosticAllowed(
            releaseMode: releaseMode,
            enabled: enabled,
            apiBaseUrl: apiBaseUrl,
            releaseChannel: releaseChannel,
            configuredRunId: configuredRunId,
            requestedRunId: requestedRunId,
          );

      expect(allowed(releaseMode: false), isFalse);
      expect(allowed(enabled: false), isFalse);
      expect(allowed(apiBaseUrl: 'https://shareittoo.com/api/v1'), isFalse);
      expect(allowed(releaseChannel: 'production'), isFalse);
      expect(allowed(requestedRunId: 'b11-other-run'), isFalse);
      expect(allowed(configuredRunId: 'unsafe/value'), isFalse);
    });

    test('allows each exact build diagnostic only once', () {
      final key = controlledCrashDiagnosticAttemptKey(
        buildNumber: '2026081404',
        runId: 'b11-android-2026081404',
      );

      expect(
        key,
        'sit_controlled_crash_diagnostic_attempted_2026081404_'
        'b11-android-2026081404',
      );
      expect(
        controlledCrashDiagnosticCanStart(
          allowed: true,
          alreadyAttempted: false,
          inFlight: false,
        ),
        isTrue,
      );
      expect(
        controlledCrashDiagnosticCanStart(
          allowed: true,
          alreadyAttempted: true,
          inFlight: false,
        ),
        isFalse,
      );
      expect(
        controlledCrashDiagnosticCanStart(
          allowed: true,
          alreadyAttempted: false,
          inFlight: true,
        ),
        isFalse,
      );
    });
  });

  group('Crashlytics fatality classification', () {
    test('keeps unexpected asynchronous errors fatal', () {
      expect(
        shouldRecordUnhandledErrorAsFatal(StateError('unexpected')),
        isTrue,
      );
    });

    test('treats realtime connection failures as non-fatal', () {
      expect(
        shouldRecordUnhandledErrorAsFatal(
          WebSocketChannelException('offline'),
        ),
        isFalse,
      );
    });
  });

  group('foreground push message', () {
    test('normalizes visible copy and opens only the neutral V5.2 route', () {
      final message = parseForegroundPushMessage(
        title: '  Neue Buchungsaktualisierung  ',
        body: '  In der App ansehen.  ',
        data: const {'contract': 'v52', 'route': 'notifications'},
      );

      expect(message, isNotNull);
      expect(message!.title, 'Neue Buchungsaktualisierung');
      expect(message.body, 'In der App ansehen.');
      expect(
        message.actionUri,
        Uri.parse('shareittoo://notifications'),
      );
    });

    test('drops empty notifications and refuses legacy or expanded push data',
        () {
      expect(parseForegroundPushMessage(), isNull);

      final message = parseForegroundPushMessage(
        body: 'Hinweis',
        data: const {'actionUrl': 'shareittoo://booking/private-id'},
      );
      expect(message, isNotNull);
      expect(message!.title, 'ShareItToo');
      expect(message.actionUri, isNull);

      final expanded = parseForegroundPushMessage(
        body: 'Hinweis',
        data: const {
          'contract': 'v52',
          'route': 'notifications',
          'bookingId': 'private-id',
        },
      );
      expect(expanded!.actionUri, isNull);
    });

    test('refreshes generic local caches only for the exact V5.2 contract', () {
      expect(
        sharedPersistenceKeysForForegroundPush(
          const {'contract': 'v52', 'route': 'notifications'},
        ),
        {
          SharedPersistenceSync.rentalRequestsKey,
          SharedPersistenceSync.messageThreadsKey,
        },
      );
      expect(
        sharedPersistenceKeysForForegroundPush(
          const {'contract': 'v52', 'route': 'booking'},
        ),
        isEmpty,
      );
    });
  });

  group('push action URI', () {
    test('accepts supported link schemes without embedded credentials', () {
      expect(
        parsePushActionUri(
          'https://staging.shareittoo.com/api/v1/open/booking/booking-123',
        ),
        Uri.parse(
          'https://staging.shareittoo.com/api/v1/open/booking/booking-123',
        ),
      );
      expect(
        parsePushActionUri('shareittoo://chat/thread-123'),
        Uri.parse('shareittoo://chat/thread-123'),
      );
    });

    test('rejects empty, credentialed and executable action URIs', () {
      expect(parsePushActionUri(null), isNull);
      expect(
        parsePushActionUri('https://user:pass@shareittoo.com/open/booking/1'),
        isNull,
      );
      expect(parsePushActionUri('javascript:alert(1)'), isNull);
    });
  });
}
