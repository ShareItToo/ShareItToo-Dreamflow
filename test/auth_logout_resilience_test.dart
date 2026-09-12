import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';

void main() {
  test('logout cleanup is bounded when realtime disconnect hangs', () async {
    final hangingDisconnect = Completer<void>();
    var remoteLogoutStarted = false;
    var disconnectStarted = false;
    final stopwatch = Stopwatch()..start();

    await AuthService.runBestEffortLogoutCleanup(
      remoteLogout: () async {
        remoteLogoutStarted = true;
      },
      disconnectRealtime: () {
        disconnectStarted = true;
        return hangingDisconnect.future;
      },
      timeout: const Duration(milliseconds: 20),
    );

    stopwatch.stop();
    expect(remoteLogoutStarted, isTrue);
    expect(disconnectStarted, isTrue);
    expect(stopwatch.elapsed, lessThan(const Duration(seconds: 1)));
  });

  test('logout cleanup stays best effort when a remote action fails', () async {
    var disconnectStarted = false;

    await AuthService.runBestEffortLogoutCleanup(
      remoteLogout: () async => throw StateError('offline'),
      disconnectRealtime: () async {
        disconnectStarted = true;
      },
      timeout: const Duration(milliseconds: 100),
    );

    expect(disconnectStarted, isTrue);
  });

  test('stale refresh result is discarded before it can restore a session',
      () async {
    var persisted = false;
    var removed = false;

    final accepted = await AuthService.persistRefreshResultSafely(
      isCurrent: () => false,
      persist: () async => persisted = true,
      remove: () async => removed = true,
    );

    expect(accepted, isFalse);
    expect(persisted, isFalse);
    expect(removed, isFalse);
  });

  test('refresh that becomes stale while saving removes its session again',
      () async {
    var current = true;
    var persisted = false;
    var removed = false;

    final accepted = await AuthService.persistRefreshResultSafely(
      isCurrent: () => current,
      persist: () async {
        persisted = true;
        current = false;
      },
      remove: () async => removed = true,
    );

    expect(accepted, isFalse);
    expect(persisted, isTrue);
    expect(removed, isTrue);
  });

  test('current refresh result remains persisted', () async {
    var persisted = false;
    var removed = false;

    final accepted = await AuthService.persistRefreshResultSafely(
      isCurrent: () => true,
      persist: () async => persisted = true,
      remove: () async => removed = true,
    );

    expect(accepted, isTrue);
    expect(persisted, isTrue);
    expect(removed, isFalse);
  });
}
