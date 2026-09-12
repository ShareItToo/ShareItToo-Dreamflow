import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/auth_service.dart';

class _FakePrincipalOwner implements AppLinkPrincipalOwner {
  @override
  final String principalToken;
  @override
  bool get authenticated => true;
  @override
  final int epoch;
  bool current = true;

  _FakePrincipalOwner({required this.principalToken, required this.epoch});

  @override
  bool get isCurrentEpoch => current;

  @override
  Future<bool> isCurrent() async => current;
}

AppLinkTarget target(String raw) => AppLinkParser.parse(Uri.parse(raw))!;

void main() {
  test(
    'settles an existing backend session before initial link ownership',
    () async {
      final refreshStarted = Completer<void>();
      final releaseRefresh = Completer<String?>();

      final settled = settleInitialAppLinkPrincipal(
        backendEnabled: true,
        readSession: () async => const AuthSession(
          userId: 'opaque-test-user',
          email: 'private-test@example.invalid',
        ),
        resolveAccessToken: () {
          refreshStarted.complete();
          return releaseRefresh.future;
        },
      );

      await refreshStarted.future;
      var completed = false;
      settled.then((_) => completed = true);
      await Future<void>.delayed(Duration.zero);
      expect(completed, isFalse);

      releaseRefresh.complete(null);
      await settled;
      expect(completed, isTrue);
    },
  );

  test(
    'does not resolve credentials without a persisted backend session',
    () async {
      var accessTokenCalls = 0;
      await settleInitialAppLinkPrincipal(
        backendEnabled: true,
        readSession: () async => null,
        resolveAccessToken: () async {
          accessTokenCalls += 1;
          return null;
        },
      );
      await settleInitialAppLinkPrincipal(
        backendEnabled: false,
        readSession: () async =>
            const AuthSession(email: 'not-read@example.invalid'),
        resolveAccessToken: () async {
          accessTokenCalls += 1;
          return null;
        },
      );
      expect(accessTokenCalls, 0);
    },
  );

  test('parses secure booking and chat links', () {
    final booking = AppLinkParser.parse(
      Uri.parse('https://shareittoo.com/api/v1/open/booking/booking-123'),
    );
    expect(booking?.kind, AppLinkKind.booking);
    expect(booking?.id, 'booking-123');

    final chat = AppLinkParser.parse(Uri.parse('shareittoo://chat/thread_456'));
    expect(chat?.kind, AppLinkKind.chat);
    expect(chat?.id, 'thread_456');

    final payment = AppLinkParser.parse(
      Uri.parse(
        'https://shareittoo.com/api/v1/open/payment/booking-123?result=success',
      ),
    );
    expect(payment?.kind, AppLinkKind.paymentReturn);
    expect(payment?.id, 'booking-123');
  });

  test('builds and parses canonical listing and profile links', () {
    final listingUri = AppLinkBuilder.listing('item-123');
    expect(
      listingUri.toString(),
      'https://shareittoo.com/api/v1/open/listing/item-123',
    );
    final listing = AppLinkParser.parse(listingUri);
    expect(listing?.kind, AppLinkKind.listing);
    expect(listing?.id, 'item-123');

    final profileUri = AppLinkBuilder.profile('user_456');
    expect(
      profileUri.toString(),
      'https://shareittoo.com/api/v1/open/profile/user_456',
    );
    final profile = AppLinkParser.parse(profileUri);
    expect(profile?.kind, AppLinkKind.profile);
    expect(profile?.id, 'user_456');
  });

  test('accepts only the identifier-free notifications route', () {
    final notifications = AppLinkParser.parse(
      Uri.parse('shareittoo://notifications'),
    );
    expect(notifications?.kind, AppLinkKind.notifications);
    expect(notifications?.id, isNull);
    expect(
      AppLinkParser.parse(Uri.parse('shareittoo://notifications/private-id')),
      isNull,
    );
  });

  test('refuses unsafe public link identifiers', () {
    expect(() => AppLinkBuilder.listing('not/safe'), throwsArgumentError);
    expect(() => AppLinkBuilder.profile(''), throwsArgumentError);
  });

  test('accepts auth actions only with a token', () {
    final valid = AppLinkParser.parse(
      Uri.parse(
        'https://shareittoo.com/api/v1/auth/email-verification/confirm?token=secret',
      ),
    );
    expect(valid?.kind, AppLinkKind.emailVerification);

    expect(
      AppLinkParser.parse(
        Uri.parse(
          'https://shareittoo.com/api/v1/auth/email-verification/confirm',
        ),
      ),
      isNull,
    );
  });

  test('rejects foreign hosts, credentials and unsafe identifiers', () {
    expect(
      AppLinkParser.parse(
        Uri.parse('https://attacker.example/open/booking/booking-123'),
      ),
      isNull,
    );
    expect(
      AppLinkParser.parse(
        Uri.parse('https://user:pass@shareittoo.com/open/booking/booking-123'),
      ),
      isNull,
    );
    expect(
      AppLinkParser.parse(Uri.parse('shareittoo://booking/not%2Fsafe')),
      isNull,
    );
  });

  test('accepts only the bounded custom-scheme Crashlytics diagnostic link', () {
    final diagnostic = AppLinkParser.parse(
      Uri.parse('shareittoo://qa/crashlytics/b11-android-2026081027'),
    );
    expect(diagnostic?.kind, AppLinkKind.crashDiagnostic);
    expect(diagnostic?.id, 'b11-android-2026081027');

    expect(
      AppLinkParser.parse(
        Uri.parse(
          'https://staging.shareittoo.com/qa/crashlytics/b11-android-2026081027',
        ),
      ),
      isNull,
    );
    expect(
      AppLinkParser.parse(Uri.parse('shareittoo://qa/crashlytics/unsafe%2Fid')),
      isNull,
    );
  });

  test('keeps one pending target and suppresses duplicate push ingress', () {
    var now = DateTime.utc(2026, 8, 11, 8);
    final inbox = AppLinkTargetInbox(now: () => now);
    final owner = _FakePrincipalOwner(principalToken: 'opaque-a', epoch: 7);
    const raw =
        'https://staging.shareittoo.com/api/v1/open/booking/booking-123';

    expect(inbox.accept(target(raw), owner), isTrue);
    expect(inbox.takePending()?.target.id, 'booking-123');

    now = now.add(const Duration(seconds: 1));
    expect(inbox.accept(target(raw), owner), isFalse);
    expect(inbox.takePending(), isNull);

    now = now.add(AppLinkTargetInbox.duplicateWindow);
    expect(inbox.accept(target(raw), owner), isTrue);
    expect(inbox.takePending()?.target.kind, AppLinkKind.booking);
  });

  test('duplicate suppression is scoped to exact principal and epoch', () {
    final inbox = AppLinkTargetInbox();
    final action = target('shareittoo://notifications');
    final ownerA = _FakePrincipalOwner(principalToken: 'opaque-a', epoch: 7);
    final ownerB = _FakePrincipalOwner(principalToken: 'opaque-b', epoch: 8);
    final ownerANewEpoch = _FakePrincipalOwner(
      principalToken: 'opaque-a',
      epoch: 9,
    );

    expect(inbox.accept(action, ownerA), isTrue);
    expect(inbox.takePending()?.owner, same(ownerA));
    expect(inbox.accept(action, ownerB), isTrue);
    expect(inbox.takePending()?.owner, same(ownerB));
    expect(inbox.accept(action, ownerANewEpoch), isTrue);
    expect(inbox.takePending()?.owner, same(ownerANewEpoch));
  });

  test('does not let an invalid link replace a valid pending target', () {
    final inbox = AppLinkTargetInbox();
    final owner = _FakePrincipalOwner(principalToken: 'opaque-a', epoch: 7);
    expect(inbox.accept(target('shareittoo://chat/thread_456'), owner), isTrue);
    expect(
      AppLinkParser.parse(
        Uri.parse('https://attacker.example/open/booking/booking-123'),
      ),
      isNull,
    );
    expect(inbox.takePending()?.target.id, 'thread_456');
  });

  testWidgets('drops an ingress whose captured principal becomes stale', (
    tester,
  ) async {
    final capture = Completer<AppLinkPrincipalOwner>();
    final owner = _FakePrincipalOwner(principalToken: 'opaque-a', epoch: 7);
    var captures = 0;
    final controller = AppLinkController(
      capturePrincipalOwner: () {
        captures += 1;
        return capture.future;
      },
    );
    addTearDown(controller.dispose);

    await controller.didPushRouteInformation(
      RouteInformation(uri: Uri.parse('shareittoo://notifications')),
    );
    expect(captures, 1);

    owner.current = false;
    capture.complete(owner);
    await tester.pump();
    await tester.pump();

    expect(controller.takePending(), isNull);
  });

  test(
    'principal-bound operation never starts for an already stale owner',
    () async {
      final owner = _FakePrincipalOwner(principalToken: 'opaque-a', epoch: 7)
        ..current = false;
      var calls = 0;

      await expectLater(
        runPrincipalBoundAppLinkOperation<int>(
          owner: owner,
          operation: () async {
            calls += 1;
            return 1;
          },
        ),
        throwsA(isA<AppLinkPrincipalChanged>()),
      );
      expect(calls, 0);
    },
  );

  test(
    'principal-bound operation rejects an A result after B becomes active',
    () async {
      final owner = _FakePrincipalOwner(principalToken: 'opaque-a', epoch: 7);
      final remote = Completer<int>();
      final result = runPrincipalBoundAppLinkOperation<int>(
        owner: owner,
        operation: () => remote.future,
      );
      await Future<void>.delayed(Duration.zero);

      owner.current = false;
      remote.complete(42);

      await expectLater(result, throwsA(isA<AppLinkPrincipalChanged>()));
    },
  );

  testWidgets('replays a pending Android notification link when app resumes', (
    tester,
  ) async {
    final owner = _FakePrincipalOwner(principalToken: 'opaque-a', epoch: 7);
    final controller = AppLinkController(
      takeNativePendingActionLink: () async => Uri.parse(
        'https://staging.shareittoo.com/api/v1/open/booking/booking-resumed',
      ),
      capturePrincipalOwner: () async => owner,
    );
    addTearDown(controller.dispose);
    controller.initialize();

    controller.didChangeAppLifecycleState(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump();

    final target = controller.takePending();
    expect(target?.target.kind, AppLinkKind.booking);
    expect(target?.target.id, 'booking-resumed');
  });
}
