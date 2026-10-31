import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/mission_web_location.dart';

const firstHref = 'https://shareittoo.com/mission';
const otherHref = 'https://www.shareittoo.com/mission';

void main() {
  test(
      'only exact browser-serialized Mission URLs yield non-activating metadata',
      () {
    for (final host in MissionWebLocationHost.values) {
      final href = switch (host) {
        MissionWebLocationHost.primary => firstHref,
        MissionWebLocationHost.www => otherHref,
        MissionWebLocationHost.staging =>
          'https://staging.shareittoo.com/mission',
      };
      final value = classifyMissionWebLocation(browserSerializedHref: href);
      expect(value.host, host);
      expect(value.isSyntheticRoute, true);
      expect(value.provenance, MissionWebLocationProvenance.browserSerialized);
      expect(value.version, 'D6-browser-location-2026-10-03.1');
      expect(value.activationAllowed, false);
      expect(value.bindingStatus, 'non_binding');
    }
  });

  test(
      'lexical rejection preserves escapes and separators before Uri normalization',
      () {
    for (final href in <String?>[
      null,
      '',
      '/mission',
      '//shareittoo.com/mission',
      'http://shareittoo.com/mission',
      'shareittoo://mission',
      'https://shareittoo.com:443/mission',
      'https://shareittoo.com:8443/mission',
      'https://name@shareittoo.com/mission',
      'https://shareittoo.com.evil.invalid/mission',
      'https://evil.invalid/mission',
      'https://SHAREITTOO.com/mission',
      'HTTPS://shareittoo.com/mission',
      'https://shareittoo.com/Mission',
      'https://shareittoo.com/mission/',
      'https://shareittoo.com/mission/extra',
      'https://shareittoo.com//mission',
      'https://shareittoo.com/a/../mission',
      'https://shareittoo.com/%6dission',
      'https://shareittoo.com/miss%69on',
      'https://shareittoo.com/%256dission',
      'https://shareittoo.com/mission%2f',
      'https://shareittoo.com/mission?',
      'https://shareittoo.com/mission?private=fixture',
      'https://shareittoo.com/mission#',
      'https://shareittoo.com/mission#private-fixture',
      'https://shareittoo.com/open/mission',
      'https://shareittoo.com/api/v1/mission',
      ' $firstHref',
      '$firstHref\n',
      'https:\\shareittoo.com\\mission',
    ]) {
      final value = classifyMissionWebLocation(browserSerializedHref: href);
      expect(value.host, null,
          reason: 'rejected input must not retain metadata');
      expect(value.isSyntheticRoute, false);
      expect(value.activationAllowed, false);
      expect(value.toString(), isNot(contains('private-fixture')));
    }
  });

  test('Dart canonicalization is information loss, not original spelling proof',
      () {
    for (final href in [
      'https://shareittoo.com/%6dission',
      'https://shareittoo.com:443/mission',
      'https://shareittoo.com/a/../mission'
    ]) {
      expect(
          classifyMissionWebLocation(browserSerializedHref: href)
              .isSyntheticRoute,
          false);
      expect(Uri.parse(href).toString(), firstHref);
      expect(
          classifyMissionWebLocation(
                  browserSerializedHref: Uri.parse(href).toString())
              .isSyntheticRoute,
          true);
    }
  });

  test(
      'native platform reader is unavailable and never invents a browser origin',
      () {
    expect(readMissionWebLocation().isSyntheticRoute, false);
    expect(readMissionWebLocation().host, null);
  });

  test(
      'controller requires initial, monotonic observations and explicit event ordering',
      () {
    final c = MissionWebLocationController();
    expect(c.current.isSyntheticRoute, false);
    expect(
        c
            .observe(
                sequence: 0,
                event: MissionWebLocationEvent.push,
                browserSerializedHref: firstHref)
            .disposition,
        MissionWebLocationDisposition.invalidOrder);
    expect(
        c
            .observe(
                sequence: 1,
                event: MissionWebLocationEvent.initial,
                browserSerializedHref: firstHref)
            .disposition,
        MissionWebLocationDisposition.changed);
    final before = c.current;
    for (final sequence in [-1, 0, 1]) {
      final result = c.observe(
          sequence: sequence,
          event: MissionWebLocationEvent.pop,
          browserSerializedHref: otherHref);
      expect(result.disposition, MissionWebLocationDisposition.invalidSequence);
      expect(result.location.isSyntheticRoute, false);
      expect(identical(c.current, before), true);
    }
    expect(
        c
            .observe(
                sequence: 3,
                event: MissionWebLocationEvent.initial,
                browserSerializedHref: otherHref)
            .disposition,
        MissionWebLocationDisposition.invalidOrder);
    expect(c.current.isSyntheticRoute, false);
    expect(c.current.host, null);
    final cleared = c.current;
    expect(
        c
            .observe(
                sequence: 2,
                event: MissionWebLocationEvent.push,
                browserSerializedHref: otherHref)
            .disposition,
        MissionWebLocationDisposition.invalidSequence);
    expect(identical(c.current, cleared), true);
    expect(
        c
            .observe(
                sequence: 9007199254740992,
                event: MissionWebLocationEvent.push,
                browserSerializedHref: otherHref)
            .disposition,
        MissionWebLocationDisposition.invalidSequence);
  });

  test(
      'push/replace/pop metadata changes and exact valid repeats are deduplicated',
      () {
    final c = MissionWebLocationController();
    var sequence = 0;
    c.observe(
        sequence: sequence++,
        event: MissionWebLocationEvent.initial,
        browserSerializedHref: firstHref);
    for (final event in [
      MissionWebLocationEvent.push,
      MissionWebLocationEvent.replace,
      MissionWebLocationEvent.pop,
      MissionWebLocationEvent.repeat
    ]) {
      expect(
          c
              .observe(
                  sequence: sequence++,
                  event: event,
                  browserSerializedHref: firstHref)
              .disposition,
          MissionWebLocationDisposition.duplicate);
    }
    expect(
        c
            .observe(
                sequence: sequence++,
                event: MissionWebLocationEvent.repeat,
                browserSerializedHref: otherHref)
            .disposition,
        MissionWebLocationDisposition.invalidOrder);
    expect(c.current.isSyntheticRoute, false);
    expect(c.current.host, null);
    for (final event in [
      MissionWebLocationEvent.push,
      MissionWebLocationEvent.replace,
      MissionWebLocationEvent.pop
    ]) {
      final href = c.current.host == MissionWebLocationHost.primary
          ? otherHref
          : firstHref;
      expect(
          c
              .observe(
                  sequence: sequence++,
                  event: event,
                  browserSerializedHref: href)
              .disposition,
          MissionWebLocationDisposition.changed);
    }
  });

  test(
      'fresh unavailable observation clears positive metadata and cannot become a repeat fingerprint',
      () {
    final c = MissionWebLocationController();
    c.observe(
        sequence: 0,
        event: MissionWebLocationEvent.initial,
        browserSerializedHref: firstHref);
    for (final sequence in [1, 2]) {
      final value = c.observe(
          sequence: sequence,
          event: MissionWebLocationEvent.pop,
          browserSerializedHref: 'https://evil.invalid/private-fixture');
      expect(value.disposition, MissionWebLocationDisposition.unavailable);
      expect(c.current.host, null);
      expect(c.current.isSyntheticRoute, false);
    }
    expect(
        c
            .observe(
                sequence: 3,
                event: MissionWebLocationEvent.repeat,
                browserSerializedHref: firstHref)
            .disposition,
        MissionWebLocationDisposition.invalidOrder);
    expect(
        c
            .observe(
                sequence: 4,
                event: MissionWebLocationEvent.push,
                browserSerializedHref: firstHref)
            .disposition,
        MissionWebLocationDisposition.changed);
  });

  test(
      'results are immutable detached snapshots; disposal clears and ignores all events',
      () {
    final c = MissionWebLocationController();
    final first = c.observe(
        sequence: 0,
        event: MissionWebLocationEvent.initial,
        browserSerializedHref: firstHref);
    c.observe(
        sequence: 1,
        event: MissionWebLocationEvent.replace,
        browserSerializedHref: otherHref);
    expect(first.location.host, MissionWebLocationHost.primary);
    expect(
        () => (first.location as dynamic).host = MissionWebLocationHost.staging,
        throwsNoSuchMethodError);
    c.dispose();
    c.dispose();
    for (final event in MissionWebLocationEvent.values) {
      final value = c.observe(
          sequence: 99, event: event, browserSerializedHref: firstHref);
      expect(value.disposition, MissionWebLocationDisposition.disposed);
      expect(value.location.isSyntheticRoute, false);
      expect(c.current.host, null);
    }
  });
}
