import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'backend_config.dart';
import 'shared_persistence_sync.dart';

class BackendRealtimeService {
  static WebSocketChannel? _channel;
  static StreamSubscription<dynamic>? _subscription;
  static StreamSubscription<List<ConnectivityResult>>?
      _connectivitySubscription;
  static Timer? _reconnectTimer;
  static String? _accessToken;
  static bool _stopped = true;
  static bool _networkUnavailable = false;
  static DateTime? _connectivityMonitoringStartedAt;
  static bool _pendingInitialConnectivityEcho = false;
  static final StreamController<void> _authenticatedReadyEvents =
      StreamController<void>.broadcast(sync: true);

  /// Emits only after the backend has accepted the current realtime
  /// authentication. Consumers may use this as an authoritative recovery
  /// signal for idempotent, account-scoped synchronization.
  static Stream<void> get authenticatedReadyEvents =>
      _authenticatedReadyEvents.stream;

  @visibleForTesting
  static bool hasUsableConnectivity(Iterable<ConnectivityResult> results) =>
      results.any((result) => result != ConnectivityResult.none);

  @visibleForTesting
  static void listenBeforeAuthenticate({
    required void Function() listen,
    required void Function() authenticate,
  }) {
    listen();
    authenticate();
  }

  @visibleForTesting
  static bool mayReconnectFromSource(Object? current, Object? source) =>
      source == null || identical(current, source);

  @visibleForTesting
  static bool isInitialConnectivityEcho({
    required bool pending,
    required bool unavailable,
    required bool previouslyUnavailable,
    required Duration elapsed,
  }) =>
      pending &&
      unavailable == previouslyUnavailable &&
      elapsed <= const Duration(seconds: 2);

  @visibleForTesting
  static Set<String> sharedPersistenceKeysForEvent(
    Map<dynamic, dynamic> event,
  ) {
    switch (event['type']) {
      case 'ready':
        // Realtime events are intentionally transient. Anything that changed
        // while the socket was offline must be fetched once the authenticated
        // connection is ready again.
        return const {
          SharedPersistenceSync.rentalRequestsKey,
          SharedPersistenceSync.messageThreadsKey,
        };
      case 'changed':
        switch (event['resource']) {
          case 'rental_requests':
            return const {SharedPersistenceSync.rentalRequestsKey};
          case 'message_threads':
            return const {SharedPersistenceSync.messageThreadsKey};
        }
    }
    return const {};
  }

  @visibleForTesting
  static Set<String> get sharedPersistenceKeysForConnectivityRecovery => const {
        SharedPersistenceSync.rentalRequestsKey,
        SharedPersistenceSync.messageThreadsKey,
      };

  static Future<void> connect(String accessToken) async {
    if (!BackendConfig.enabled || accessToken.trim().isEmpty) return;
    if (_channel != null && _accessToken == accessToken && !_stopped) return;
    await disconnect();
    _stopped = false;
    _accessToken = accessToken;
    await _startConnectivityMonitoring();
    if (!_networkUnavailable) unawaited(_open());
  }

  static Future<void> _startConnectivityMonitoring() async {
    final connectivity = Connectivity();
    _connectivityMonitoringStartedAt = DateTime.now();
    try {
      _networkUnavailable = !hasUsableConnectivity(
        await connectivity.checkConnectivity(),
      );
    } catch (error) {
      // Connectivity type is only a recovery signal. Socket errors remain the
      // authoritative fallback and must continue to be handled normally.
      debugPrint('[BackendRealtime] connectivity check unavailable: $error');
      _networkUnavailable = false;
    }
    _pendingInitialConnectivityEcho = true;
    _connectivitySubscription = connectivity.onConnectivityChanged.listen(
      (results) => unawaited(_handleConnectivityChanged(results)),
      onError: (Object error) {
        debugPrint(
            '[BackendRealtime] connectivity monitor unavailable: $error');
      },
    );
  }

  static Future<void> _handleConnectivityChanged(
    List<ConnectivityResult> results,
  ) async {
    if (_stopped) return;
    final unavailable = !hasUsableConnectivity(results);
    final previouslyUnavailable = _networkUnavailable;
    final monitoringStartedAt = _connectivityMonitoringStartedAt;
    final initialEcho = isInitialConnectivityEcho(
      pending: _pendingInitialConnectivityEcho,
      unavailable: unavailable,
      previouslyUnavailable: previouslyUnavailable,
      elapsed: monitoringStartedAt == null
          ? Duration.zero
          : DateTime.now().difference(monitoringStartedAt),
    );
    _pendingInitialConnectivityEcho = false;
    if (initialEcho) return;
    if (unavailable) {
      _networkUnavailable = true;
      _reconnectTimer?.cancel();
      _reconnectTimer = null;
      await _closeCurrentChannel();
      return;
    }
    _networkUnavailable = false;
    // Do not make the visible catch-up depend exclusively on the websocket
    // handshake. A half-open socket can survive a radio outage long enough to
    // miss both the changed event and the next ready event. The active screens
    // therefore receive one immediate HTTP refresh pulse plus one bounded
    // retry as soon as Android reports a usable transport again.
    for (final key in sharedPersistenceKeysForConnectivityRecovery) {
      SharedPersistenceSync.notifyWithCatchUpRetry(key);
    }
    // A concrete usable-transport event is also a recovery signal when the
    // platform omitted the intermediate `none` event. Recycle the socket so a
    // half-open connection cannot suppress the authenticated catch-up.
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    await _closeCurrentChannel();
    if (!_stopped) unawaited(_open());
  }

  static Future<void> _closeCurrentChannel() async {
    final subscription = _subscription;
    final channel = _channel;
    _subscription = null;
    _channel = null;
    try {
      await subscription?.cancel();
    } catch (_) {
      // The network may have disappeared before cancellation completed.
    }
    try {
      await channel?.sink.close();
    } catch (_) {
      // Closing an already-broken socket is best effort only.
    }
  }

  static Future<void> _open() async {
    if (_stopped || _networkUnavailable || _accessToken == null) return;
    final accessToken = _accessToken;
    WebSocketChannel? channel;
    try {
      channel = WebSocketChannel.connect(BackendConfig.realtimeUri);
      _channel = channel;
      await channel.ready;
      if (_stopped || _accessToken != accessToken || _channel != channel) {
        await channel.sink.close();
        return;
      }
      // Listen before authenticating. The server answers an accepted auth
      // immediately with `ready`; subscribing afterwards can lose that event
      // and therefore skip the cache catch-up needed after an offline window.
      listenBeforeAuthenticate(
        listen: () {
          _subscription = channel!.stream.listen(
            _handleMessage,
            onError: (Object error) {
              debugPrint('[BackendRealtime] connection error: $error');
              _scheduleReconnect(channel);
            },
            onDone: () => _scheduleReconnect(channel),
            cancelOnError: true,
          );
        },
        authenticate: () => channel!.sink.add(
          jsonEncode({'type': 'auth', 'token': accessToken}),
        ),
      );
    } catch (error) {
      debugPrint('[BackendRealtime] connect failed: $error');
      final shouldReconnect = _channel == channel;
      if (shouldReconnect) {
        _subscription = null;
        _channel = null;
      }
      if (channel != null) {
        try {
          await channel.sink.close();
        } catch (_) {
          // The connection may have failed before a close frame was possible.
        }
      }
      if (shouldReconnect) _scheduleReconnect();
    }
  }

  static Future<void> _handleMessage(dynamic raw) async {
    try {
      final decoded = jsonDecode(raw.toString());
      if (decoded is! Map) return;
      final resource = decoded['resource']?.toString();
      if (decoded['type'] == 'ready') {
        _authenticatedReadyEvents.add(null);
      }
      final prefs = await SharedPreferences.getInstance();
      final syncKeys = sharedPersistenceKeysForEvent(decoded);
      for (final key in syncKeys) {
        await prefs.remove(key);
        if (decoded['type'] == 'ready') {
          SharedPersistenceSync.notifyWithCatchUpRetry(key);
        } else {
          SharedPersistenceSync.notify(key);
        }
      }
      if (decoded['type'] != 'changed') return;
      switch (resource) {
        case 'listings':
          await prefs.remove('items');
          break;
        case 'profiles':
          await prefs.remove('currentUser');
          break;
      }
    } catch (error) {
      debugPrint('[BackendRealtime] invalid event: $error');
    }
  }

  static void _scheduleReconnect([WebSocketChannel? sourceChannel]) {
    // A delayed callback from an older socket must never clear a newer,
    // already-connected channel.
    if (!mayReconnectFromSource(_channel, sourceChannel)) return;
    _subscription = null;
    _channel = null;
    if (_stopped || _networkUnavailable || _reconnectTimer != null) return;
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      _reconnectTimer = null;
      unawaited(_open());
    });
  }

  static Future<void> disconnect() async {
    _stopped = true;
    _networkUnavailable = false;
    _connectivityMonitoringStartedAt = null;
    _pendingInitialConnectivityEcho = false;
    SharedPersistenceSync.cancelCatchUpRetries();
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    await _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
    await _closeCurrentChannel();
    _accessToken = null;
  }
}
