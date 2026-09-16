import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/backend_realtime_service.dart';

void main() {
  group('BackendRealtimeService connectivity recovery', () {
    test('treats every no-network signal as unavailable', () {
      expect(
        BackendRealtimeService.hasUsableConnectivity(
          const [ConnectivityResult.none],
        ),
        isFalse,
      );
      expect(
        BackendRealtimeService.hasUsableConnectivity(const []),
        isFalse,
      );
    });

    test('accepts any concrete transport as a reconnect signal', () {
      expect(
        BackendRealtimeService.hasUsableConnectivity(
          const [ConnectivityResult.wifi],
        ),
        isTrue,
      );
      expect(
        BackendRealtimeService.hasUsableConnectivity(
          const [ConnectivityResult.mobile, ConnectivityResult.vpn],
        ),
        isTrue,
      );
    });

    test('refreshes booking and chat caches after an authenticated reconnect',
        () {
      expect(
        BackendRealtimeService.sharedPersistenceKeysForEvent(
          const {'type': 'ready'},
        ),
        {
          'rental_requests',
          'message_threads_v1',
        },
      );
    });

    test('refreshes booking and chat data independently on transport recovery',
        () {
      expect(
        BackendRealtimeService.sharedPersistenceKeysForConnectivityRecovery,
        {
          'rental_requests',
          'message_threads_v1',
        },
      );
    });

    test('subscribes before sending the immediate authentication request', () {
      final operations = <String>[];

      BackendRealtimeService.listenBeforeAuthenticate(
        listen: () => operations.add('listen'),
        authenticate: () => operations.add('authenticate'),
      );

      expect(operations, ['listen', 'authenticate']);
    });

    test('ignores termination callbacks from a superseded socket', () {
      final active = Object();
      final stale = Object();

      expect(
        BackendRealtimeService.mayReconnectFromSource(active, active),
        isTrue,
      );
      expect(
        BackendRealtimeService.mayReconnectFromSource(active, null),
        isTrue,
      );
      expect(
        BackendRealtimeService.mayReconnectFromSource(active, stale),
        isFalse,
      );
    });

    test('ignores only a prompt equivalent initial connectivity echo', () {
      expect(
        BackendRealtimeService.isInitialConnectivityEcho(
          pending: true,
          unavailable: false,
          previouslyUnavailable: false,
          elapsed: const Duration(milliseconds: 500),
        ),
        isTrue,
      );
      expect(
        BackendRealtimeService.isInitialConnectivityEcho(
          pending: true,
          unavailable: false,
          previouslyUnavailable: false,
          elapsed: const Duration(seconds: 3),
        ),
        isFalse,
      );
      expect(
        BackendRealtimeService.isInitialConnectivityEcho(
          pending: true,
          unavailable: true,
          previouslyUnavailable: false,
          elapsed: const Duration(milliseconds: 500),
        ),
        isFalse,
      );
    });

    test('keeps ordinary changed events scoped to their resource', () {
      expect(
        BackendRealtimeService.sharedPersistenceKeysForEvent(
          const {'type': 'changed', 'resource': 'message_threads'},
        ),
        {'message_threads_v1'},
      );
      expect(
        BackendRealtimeService.sharedPersistenceKeysForEvent(
          const {'type': 'changed', 'resource': 'listings'},
        ),
        isEmpty,
      );
      expect(
        BackendRealtimeService.sharedPersistenceKeysForEvent(
          const {'type': 'unknown'},
        ),
        isEmpty,
      );
    });
  });
}
