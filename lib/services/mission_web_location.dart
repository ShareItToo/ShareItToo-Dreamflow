import 'package:lendify/services/mission_web_location_stub.dart'
    if (dart.library.html) 'package:lendify/services/mission_web_location_web.dart'
    as platform;

enum MissionWebLocationProvenance { browserSerialized }

enum MissionWebLocationHost { primary, www, staging }

/// Labels supplied by a caller, not proof that a browser event occurred.
enum MissionWebLocationEvent { initial, push, replace, pop, repeat }

enum MissionWebLocationDisposition {
  changed,
  duplicate,
  unavailable,
  invalidSequence,
  invalidOrder,
  disposed,
}

/// Detached metadata only. No URL or rejected input is retained.
final class MissionWebLocation {
  final MissionWebLocationHost? host;

  const MissionWebLocation._(this.host);
  static const unavailable = MissionWebLocation._(null);

  String get version => 'D6-browser-location-2026-10-03.1';
  MissionWebLocationProvenance get provenance =>
      MissionWebLocationProvenance.browserSerialized;
  bool get isSyntheticRoute => host != null;
  bool get activationAllowed => false;
  String get bindingStatus => 'non_binding';
}

/// This accepts serialized browser bytes, not address-bar keystrokes. Earlier
/// normalization may already have erased default ports or dot segments. Matching
/// the supplied string preserves remaining escapes, case and empty separators.
MissionWebLocation classifyMissionWebLocation({
  required String? browserSerializedHref,
}) =>
    switch (browserSerializedHref) {
      'https://shareittoo.com/mission' =>
        const MissionWebLocation._(MissionWebLocationHost.primary),
      'https://www.shareittoo.com/mission' =>
        const MissionWebLocation._(MissionWebLocationHost.www),
      'https://staging.shareittoo.com/mission' =>
        const MissionWebLocation._(MissionWebLocationHost.staging),
      _ => MissionWebLocation.unavailable,
    };

/// Explicit read only; importing this module does not observe the platform.
MissionWebLocation readMissionWebLocation() => classifyMissionWebLocation(
      browserSerializedHref: platform.readBrowserSerializedHref(),
    );

final class MissionWebLocationUpdate {
  final MissionWebLocationDisposition disposition;
  final MissionWebLocation location;

  const MissionWebLocationUpdate._(this.disposition, this.location);
}

/// Pure injected sequence model, with no subscriptions or platform writes.
/// A valid fresh sequence consumes its high-water mark even if its event order
/// is rejected. Sequence numbers are safe integers in both native and web Dart.
/// Rejected URLs have no repeat fingerprint; only an exact admitted URL can
/// deduplicate. Since each admitted host has one exact URL, the host enum is a
/// sufficient fingerprint without storing URL strings. No session authority.
final class MissionWebLocationController {
  int? _lastSequence;
  bool _initialized = false;
  bool _disposed = false;
  MissionWebLocation _current = MissionWebLocation.unavailable;

  MissionWebLocation get current => _current;

  MissionWebLocationUpdate observe({
    required int sequence,
    required MissionWebLocationEvent event,
    required String? browserSerializedHref,
  }) {
    if (_disposed) {
      return const MissionWebLocationUpdate._(
          MissionWebLocationDisposition.disposed,
          MissionWebLocation.unavailable);
    }
    if (sequence < 0 ||
        sequence > 9007199254740991 ||
        (_lastSequence != null && sequence <= _lastSequence!)) {
      return const MissionWebLocationUpdate._(
          MissionWebLocationDisposition.invalidSequence,
          MissionWebLocation.unavailable);
    }
    _lastSequence = sequence;
    if ((!_initialized && event != MissionWebLocationEvent.initial) ||
        (_initialized && event == MissionWebLocationEvent.initial)) {
      _current = MissionWebLocation.unavailable;
      return const MissionWebLocationUpdate._(
          MissionWebLocationDisposition.invalidOrder,
          MissionWebLocation.unavailable);
    }
    _initialized = true;
    final location = classifyMissionWebLocation(
        browserSerializedHref: browserSerializedHref);
    if (!location.isSyntheticRoute) {
      _current = MissionWebLocation.unavailable;
      return const MissionWebLocationUpdate._(
          MissionWebLocationDisposition.unavailable,
          MissionWebLocation.unavailable);
    }
    if (_current.host == location.host) {
      return MissionWebLocationUpdate._(
          MissionWebLocationDisposition.duplicate, _current);
    }
    if (event == MissionWebLocationEvent.repeat) {
      _current = MissionWebLocation.unavailable;
      return const MissionWebLocationUpdate._(
          MissionWebLocationDisposition.invalidOrder,
          MissionWebLocation.unavailable);
    }
    _current = location;
    return MissionWebLocationUpdate._(
        MissionWebLocationDisposition.changed, location);
  }

  void dispose() {
    _disposed = true;
    _initialized = false;
    _lastSequence = null;
    _current = MissionWebLocation.unavailable;
  }
}
