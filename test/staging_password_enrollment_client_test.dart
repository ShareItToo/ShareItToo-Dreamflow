import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/remote_auth_attempt_transaction.dart';
import 'package:lendify/services/staging_password_enrollment_client.dart';

StagingPasswordEnrollmentEnvironment environment({
  bool requested = true,
  bool web = true,
  bool backend = true,
  bool pilot = true,
  bool money = false,
  String api = 'https://staging.shareittoo.com/api/v1',
  String origin = 'https://staging.shareittoo.com',
  String channel = 'internal',
}) =>
    StagingPasswordEnrollmentEnvironment(
        requested: requested,
        web: web,
        backendEnabled: backend,
        privatePilot: pilot,
        realPayments: money,
        apiBaseUrl: api,
        origin: origin,
        releaseChannel: channel);

String invitation() => 'synthetic-invitation'.padRight(43, 'x');
String credential() =>
    List.generate(12, (i) => String.fromCharCode(65 + i)).join() + 7.toString();

void main() {
  test(
      'separate flag and every exact gate are required; ordinary runtime is off',
      () {
    expect(environment().available, isTrue);
    expect(StagingPasswordEnrollmentEnvironment.current.available, isFalse);
    for (final value in [
      environment(requested: false),
      environment(web: false),
      environment(backend: false),
      environment(pilot: false),
      environment(money: true),
      environment(api: 'https://shareittoo.com/api/v1'),
      environment(api: 'https://staging.shareittoo.com/api/v1/'),
      environment(origin: 'http://staging.shareittoo.com'),
      environment(origin: 'https://staging.shareittoo.com.evil.invalid'),
      environment(channel: 'production')
    ]) {
      expect(value.available, isFalse);
    }
  });

  test('only exact generic structured denial maps to closed enrollment', () {
    expect(
        AuthService.classifyRegistrationBackendError(const BackendException(
            403, 'staging_password_enrollment_unavailable')),
        AuthFailure.pilotRegistrationClosed);
    for (final error in [
      const BackendException(500, 'staging_password_enrollment_unavailable'),
      const BackendException(
          403, 'staging_password_enrollment_unavailable_other')
    ]) {
      expect(AuthService.classifyRegistrationBackendError(error),
          AuthFailure.network);
    }
  });

  for (final outcome in [
    'success',
    'failure',
    'stale-before',
    'stale-remote',
    'stale-persisted',
    'disabled',
    'invalid-token',
    'terms',
    'privacy',
    'age',
    'private-use',
    'action-label'
  ]) {
    test('request contract and credential cleanup: $outcome', () async {
      Map<String, dynamic>? wire, retained;
      var current = outcome != 'stale-before';
      var remoteDiscarded = false,
          persistedDiscarded = false,
          didPersist = false;
      final attempt = submitStagingPasswordEnrollment<String>(
        available: outcome != 'disabled',
        enrollmentToken:
            outcome == 'invalid-token' ? 'invalid' : '  ${invitation()}  ',
        email: ' synthetic@example.invalid ',
        password: credential(),
        displayName: ' Synthetic ',
        termsAccepted: outcome != 'terms',
        privacyAccepted: outcome != 'privacy',
        minimumAgeConfirmed: outcome != 'age',
        privateUseConfirmed: outcome != 'private-use',
        registrationActionLabel:
            outcome == 'action-label' ? 'Register' : 'Kostenlos registrieren',
        preflightCurrent: () => current,
        actionCurrent: () => current,
        send: (body) async {
          retained = body;
          wire = Map.of(body);
          if (outcome == 'failure') throw StateError(invitation());
          if (outcome == 'stale-remote') current = false;
          return {'accepted': true};
        },
        persist: (_) async {
          didPersist = true;
          return 'owned-session';
        },
        discardRemote: (_) async {
          remoteDiscarded = true;
        },
        persistedCurrent: (_) async => outcome != 'stale-persisted',
        discardPersisted: (_) async {
          persistedDiscarded = true;
        },
      );
      if (outcome == 'success') {
        expect(await attempt, 'owned-session');
        expect(didPersist, isTrue);
      } else if (outcome == 'failure') {
        await expectLater(attempt, throwsStateError);
      } else if ([
        'disabled',
        'invalid-token',
        'terms',
        'privacy',
        'age',
        'private-use',
        'action-label'
      ].contains(outcome)) {
        await expectLater(
            attempt, throwsA(isA<StagingPasswordEnrollmentUnavailable>()));
      } else {
        await expectLater(attempt, throwsA(isA<RemoteAuthAttemptSuperseded>()));
      }
      if (wire != null) {
        expect(wire, {
          'email': 'synthetic@example.invalid',
          'password': credential(),
          'displayName': 'Synthetic',
          'termsAccepted': true,
          'privacyAccepted': true,
          'minimumAgeConfirmed': true,
          'privateUseConfirmed': true,
          'registrationActionLabel': 'Kostenlos registrieren',
          'enrollmentToken': invitation()
        });
        expect(retained, isEmpty);
      } else {
        expect(
            outcome,
            isIn([
              'disabled',
              'invalid-token',
              'stale-before',
              'terms',
              'privacy',
              'age',
              'private-use',
              'action-label'
            ]));
      }
      expect(remoteDiscarded, outcome == 'stale-remote');
      expect(persistedDiscarded, outcome == 'stale-persisted');
    });
  }
}
