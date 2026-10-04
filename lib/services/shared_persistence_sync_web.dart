import 'dart:async';
// This file is loaded only by the web conditional import above it.
// ignore: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:html' as html;

final StreamController<String> _controller =
    StreamController<String>.broadcast(sync: true);
bool _initialized = false;
html.BroadcastChannel? _channel;

const Set<String> _watchedKeys = {
  'rental_requests',
  'message_threads_v1',
  'handover_return_state_v1',
  'saved_items',
  'wishlist_state_v2',
  'wishlist_state_v3',
  'rental_cart_v1',
  'rental_cart_v2',
  'account_security_state_v1',
  'local_safety_privacy_state_v1',
};

String _canonicalKey(String key) => switch (key) {
      'wishlist_state_v2' => 'wishlist_state_v3',
      'rental_cart_v1' => 'rental_cart_v2',
      _ => key,
    };

Stream<String> get sharedPersistenceChanges {
  _ensureInitialized();
  return _controller.stream;
}

void notifySharedPersistenceChange(String key) {
  if (!_watchedKeys.contains(key)) return;
  _ensureInitialized();
  _controller.add(_canonicalKey(key));
  _channel?.postMessage(key);
}

void _ensureInitialized() {
  if (_initialized) return;
  _initialized = true;

  try {
    _channel = html.BroadcastChannel('sit_shared_persistence_sync');
    _channel!.onMessage.listen((event) {
      final key = event.data?.toString().trim() ?? '';
      if (_watchedKeys.contains(key)) {
        _controller.add(_canonicalKey(key));
      }
    });
  } catch (_) {
    _channel = null;
  }

  // shared_preferences_web writes keys with the default `flutter.` prefix.
  // Storage events are emitted only in the other same-origin tabs, which is
  // exactly where a refresh is needed.
  html.window.onStorage.listen((event) {
    final rawKey = event.key?.trim() ?? '';
    final logicalKey = rawKey.startsWith('flutter.')
        ? rawKey.substring('flutter.'.length)
        : rawKey;
    if (_watchedKeys.contains(logicalKey)) {
      _controller.add(_canonicalKey(logicalKey));
    }
  });
}
