import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/blocked_users_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/blocked_users_service.dart';
import 'package:lendify/services/listing_feedback_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/local_safety_privacy_service.dart';
import 'package:lendify/services/messages_settings_service.dart';
import 'package:lendify/services/notification_preferences_service.dart';
import 'package:lendify/services/safety_action_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/user_reports_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> useAccount(String email, {String? userId}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        if (userId != null) 'userId': userId,
        'email': email,
        'createdAt': '2026-08-25T00:00:00.000Z',
      }),
    );
  }

  Future<void> useGuest() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_session_v1');
  }

  test('account A, guest and account B do not share safety or discovery state',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});

    await useAccount('rw5-account-a@example.invalid');
    await BlockedUsersService.blockUser('blocked-by-a');
    await ListingFeedbackService.hideItem('hidden-by-a');
    await ListingFeedbackService.recordFeedback(
      itemId: 'feedback-by-a',
      reason: 'too_expensive',
      categoryId: 'tools',
      pricePerDay: 19,
      city: 'Synthetic A',
    );
    await UserReportsService.addReport(
      reporterUserId: 'rw5-user-a',
      reportedUserId: 'reported-by-a',
      reasonCode: 'synthetic-a',
      details: 'Synthetic report A',
    );
    await LocalSafetyPrivacyService.setThreadMuted(
      threadId: 'thread-a',
      muted: true,
    );
    await MessagesSettingsService.set(
      MessagesSettings.defaults().copyWith(
        showChatPreview: false,
        autoTranslateChat: true,
        preferredLanguageCode: 'fr',
      ),
    );
    await NotificationPreferencesService.set(
      NotificationPreferences.defaults().copyWith(
        showMessages: false,
        showSupport: false,
      ),
    );

    await useGuest();
    expect(await BlockedUsersService.isBlocked('blocked-by-a'), isFalse);
    expect(await ListingFeedbackService.getHiddenItemIds(), isEmpty);
    expect(await UserReportsService.getLocalReports(), isEmpty);
    expect(await LocalSafetyPrivacyService.getMutedThreadIds(), isEmpty);
    expect((await MessagesSettingsService.get()).showChatPreview, isTrue);
    expect((await NotificationPreferencesService.get()).showMessages, isTrue);
    await BlockedUsersService.blockUser('blocked-by-guest');
    await ListingFeedbackService.hideItem('hidden-by-guest');

    await useAccount('rw5-account-b@example.invalid');
    expect(await BlockedUsersService.isBlocked('blocked-by-a'), isFalse);
    expect(await BlockedUsersService.isBlocked('blocked-by-guest'), isFalse);
    expect(await ListingFeedbackService.getHiddenItemIds(), isEmpty);
    expect(await UserReportsService.getLocalReports(), isEmpty);
    expect(await LocalSafetyPrivacyService.getMutedThreadIds(), isEmpty);
    expect((await MessagesSettingsService.get()).showChatPreview, isTrue);
    expect((await NotificationPreferencesService.get()).showMessages, isTrue);
    await BlockedUsersService.blockUser('blocked-by-b');
    await ListingFeedbackService.hideItem('hidden-by-b');

    await useAccount('rw5-account-a@example.invalid');
    expect(await BlockedUsersService.isBlocked('blocked-by-a'), isTrue);
    expect(await BlockedUsersService.isBlocked('blocked-by-b'), isFalse);
    expect(
      await ListingFeedbackService.getHiddenItemIds(),
      <String>{'hidden-by-a'},
    );
    expect(
      (await UserReportsService.getLocalReports()).single['reasonCode'],
      'synthetic-a',
    );
    expect(
      await LocalSafetyPrivacyService.getMutedThreadIds(),
      <String>{'thread-a'},
    );
    final restoredMessages = await MessagesSettingsService.get();
    expect(restoredMessages.showChatPreview, isFalse);
    expect(restoredMessages.autoTranslateChat, isTrue);
    expect(restoredMessages.preferredLanguageCode, 'fr');
    final restoredNotifications = await NotificationPreferencesService.get();
    expect(restoredNotifications.showMessages, isFalse);
    expect(restoredNotifications.showSupport, isFalse);

    await useGuest();
    expect(await BlockedUsersService.isBlocked('blocked-by-guest'), isTrue);
    expect(
      await ListingFeedbackService.getHiddenItemIds(),
      <String>{'hidden-by-guest'},
    );
  });

  test('identical block-list sync is idempotent and does not refresh again',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await useAccount('rw5-idempotent-blocks@example.invalid');
    final notifications = <String>[];
    final subscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.localSafetyPrivacyStateKey) {
        notifications.add(key);
      }
    });
    addTearDown(subscription.cancel);

    await LocalSafetyPrivacyService.setBlockedUserIds(
      const <String>['blocked-z', 'blocked-a'],
    );
    expect(notifications, hasLength(1));

    await LocalSafetyPrivacyService.setBlockedUserIds(
      const <String>['blocked-a', 'blocked-z'],
    );
    expect(notifications, hasLength(1));
    expect(
      await LocalSafetyPrivacyService.getBlockedUserIds(),
      <String>['blocked-a', 'blocked-z'],
    );
  });

  test('unattributed legacy safety and discovery state belongs only to guest',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'blocked_user_ids_v1': jsonEncode(<String>['legacy-blocked']),
      'hidden_listing_ids_v1': <String>['legacy-hidden'],
      'listing_feedback_log_v1': <String>[
        jsonEncode(<String, Object>{
          'itemId': 'legacy-feedback',
          'reason': 'not_interesting',
          'recordedAt': '2026-08-25T00:00:00.000Z',
        }),
      ],
      'listing_feedback_reason_profile_v1': jsonEncode(<String, Object>{
        'reasonCounts': <String, int>{'not_interesting': 1},
      }),
      'messages_settings_v1': jsonEncode(<String, Object>{
        'showChatPreview': false,
        'preferredLanguageCode': 'en',
      }),
      'notification_preferences_v2': jsonEncode(<String, Object>{
        'showMessages': false,
        'showSupport': false,
      }),
    });

    await useAccount('rw5-new-account@example.invalid');
    expect(await BlockedUsersService.getBlockedUserIds(), isEmpty);
    expect(await ListingFeedbackService.getHiddenItemIds(), isEmpty);
    expect((await MessagesSettingsService.get()).showChatPreview, isTrue);
    expect((await NotificationPreferencesService.get()).showMessages, isTrue);

    await useGuest();
    expect(
      await BlockedUsersService.getBlockedUserIds(),
      <String>['legacy-blocked'],
    );
    expect(
      await ListingFeedbackService.getHiddenItemIds(),
      <String>{'legacy-hidden'},
    );
    expect((await MessagesSettingsService.get()).showChatPreview, isFalse);
    expect((await MessagesSettingsService.get()).preferredLanguageCode, 'en');
    expect((await NotificationPreferencesService.get()).showMessages, isFalse);
  });

  test('corrupt block state fails closed without being rewritten as empty',
      () async {
    const corrupt = '{corrupt-block-state';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'blocked_user_ids_v1': corrupt,
    });

    await useGuest();
    await expectLater(
      BlockedUsersService.getBlockedUserIds(),
      throwsA(isA<FormatException>()),
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('blocked_user_ids_v1'), corrupt);
  });

  test('corrupt legacy communication preferences fail closed and are kept',
      () async {
    const corrupt = '{corrupt-settings';
    SharedPreferences.setMockInitialValues(<String, Object>{
      'messages_settings_v1': corrupt,
    });

    await useGuest();
    await expectLater(
      MessagesSettingsService.get(),
      throwsA(isA<FormatException>()),
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('messages_settings_v1'), corrupt);
    expect(
      prefs.getString('local_safety_privacy_state_v1'),
      contains('"legacyGuestQuarantined":true'),
    );
  });

  test('privacy export and confirmed deletion affect only the current account',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await useAccount('rw5-export-a@example.invalid');
    await BlockedUsersService.blockUser('export-block-a');
    await ListingFeedbackService.hideItem('export-hidden-a');
    await UserReportsService.addReport(
      reporterUserId: 'export-a',
      reportedUserId: 'reported-a',
      reasonCode: 'synthetic-a',
    );
    await LocalSafetyPrivacyService.setThreadMuted(
      threadId: 'export-thread-a',
      muted: true,
    );
    await MessagesSettingsService.set(
      MessagesSettings.defaults().copyWith(showChatPreview: false),
    );
    await NotificationPreferencesService.set(
      NotificationPreferences.defaults().copyWith(showMessages: false),
    );

    await useAccount('rw5-export-b@example.invalid');
    await BlockedUsersService.blockUser('export-block-b');
    await ListingFeedbackService.hideItem('export-hidden-b');
    await UserReportsService.addReport(
      reporterUserId: 'export-b',
      reportedUserId: 'reported-b',
      reasonCode: 'synthetic-b',
    );
    final export = await LocalSafetyPrivacyService.exportCurrentPrincipal();
    expect(export['principalScope'], 'authenticated-account');
    expect(export['blockedUserIds'], <String>['export-block-b']);
    expect(export['hiddenItemIds'], <String>['export-hidden-b']);
    expect(
      ((export['reports'] as List).single as Map)['reasonCode'],
      'synthetic-b',
    );
    expect(jsonEncode(export), isNot(contains('export-block-a')));

    await LocalSafetyPrivacyService.clearCurrentPrincipal();
    expect(await BlockedUsersService.getBlockedUserIds(), isEmpty);
    expect(await UserReportsService.getLocalReports(), isEmpty);
    expect((await MessagesSettingsService.get()).showChatPreview, isTrue);
    expect((await NotificationPreferencesService.get()).showMessages, isTrue);

    await useAccount('rw5-export-a@example.invalid');
    expect(await BlockedUsersService.isBlocked('export-block-a'), isTrue);
    expect(
      await ListingFeedbackService.getHiddenItemIds(),
      <String>{'export-hidden-a'},
    );
    expect(
      (await UserReportsService.getLocalReports()).single['reasonCode'],
      'synthetic-a',
    );
    expect(
      await LocalSafetyPrivacyService.getMutedThreadIds(),
      <String>{'export-thread-a'},
    );
    expect((await MessagesSettingsService.get()).showChatPreview, isFalse);
    expect((await NotificationPreferencesService.get()).showMessages, isFalse);
  });

  test('local listing reports retain listing target semantics', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await useAccount('rw5-listing-reporter@example.invalid');
    final principal = await LocalPrincipalScope.current();

    await LocalSafetyPrivacyService.addReportForPrincipal(
      principal: principal,
      reporterUserId: 'listing-reporter',
      reportedUserId: 'listing-owner',
      targetType: 'listing',
      targetId: 'listing-target',
      reasonCode: 'fraud_or_deception',
      reference: 'listing_options',
    );

    final export = await LocalSafetyPrivacyService.exportCurrentPrincipal();
    final report = (export['reports'] as List).single as Map;
    expect(report['reportedUserId'], 'listing-owner');
    expect(report['targetType'], 'listing');
    expect(report['targetId'], 'listing-target');
  });

  test('already-invoked mutations cannot cross an immediate session switch',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await useAccount('rw5-switch-a@example.invalid');
    final block = BlockedUsersService.blockUser('switch-block-a');
    final hidden = ListingFeedbackService.hideItem('switch-hidden-a');
    final report = UserReportsService.addReport(
      reporterUserId: 'switch-a',
      reportedUserId: 'switch-target',
      reasonCode: 'synthetic-switch',
    );
    final muted = LocalSafetyPrivacyService.setThreadMuted(
      threadId: 'switch-thread-a',
      muted: true,
    );
    final messageSettings = MessagesSettingsService.set(
      MessagesSettings.defaults().copyWith(showChatPreview: false),
    );
    final notificationSettings = NotificationPreferencesService.set(
      NotificationPreferences.defaults().copyWith(showMessages: false),
    );
    await useAccount('rw5-switch-b@example.invalid');
    await Future.wait(<Future<void>>[
      block,
      hidden,
      report,
      muted,
      messageSettings,
      notificationSettings,
    ]);

    expect(await BlockedUsersService.getBlockedUserIds(), isEmpty);
    expect(await ListingFeedbackService.getHiddenItemIds(), isEmpty);
    expect(await UserReportsService.getLocalReports(), isEmpty);
    expect(await LocalSafetyPrivacyService.getMutedThreadIds(), isEmpty);
    expect((await MessagesSettingsService.get()).showChatPreview, isTrue);
    expect((await NotificationPreferencesService.get()).showMessages, isTrue);

    await useAccount('rw5-switch-a@example.invalid');
    expect(await BlockedUsersService.isBlocked('switch-block-a'), isTrue);
    expect(
      await ListingFeedbackService.getHiddenItemIds(),
      <String>{'switch-hidden-a'},
    );
    expect(await UserReportsService.getLocalReports(), hasLength(1));
    expect(
      await LocalSafetyPrivacyService.getMutedThreadIds(),
      <String>{'switch-thread-a'},
    );
    expect((await MessagesSettingsService.get()).showChatPreview, isFalse);
    expect((await NotificationPreferencesService.get()).showMessages, isFalse);
  });

  test('opaque principal state survives process-style recreation', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await useAccount('rw5-recreate-a@example.invalid');
    await BlockedUsersService.blockUser('recreate-block-a');
    await MessagesSettingsService.set(
      MessagesSettings.defaults().copyWith(showChatPreview: false),
    );
    await useAccount('rw5-recreate-b@example.invalid');
    await ListingFeedbackService.hideItem('recreate-hidden-b');
    await NotificationPreferencesService.set(
      NotificationPreferences.defaults().copyWith(showMessages: false),
    );

    final before = await SharedPreferences.getInstance();
    final canonical = before.getString('local_safety_privacy_state_v1')!;
    expect(canonical, isNot(contains('rw5-recreate-a@example.invalid')));
    expect(canonical, isNot(contains('rw5-recreate-b@example.invalid')));

    SharedPreferences.setMockInitialValues(<String, Object>{
      'local_safety_privacy_state_v1': canonical,
    });
    await useAccount('rw5-recreate-a@example.invalid');
    expect(await BlockedUsersService.isBlocked('recreate-block-a'), isTrue);
    expect(await ListingFeedbackService.getHiddenItemIds(), isEmpty);
    expect((await MessagesSettingsService.get()).showChatPreview, isFalse);
    expect((await NotificationPreferencesService.get()).showMessages, isTrue);
    await useAccount('rw5-recreate-b@example.invalid');
    expect(await BlockedUsersService.getBlockedUserIds(), isEmpty);
    expect(
      await ListingFeedbackService.getHiddenItemIds(),
      <String>{'recreate-hidden-b'},
    );
    expect((await MessagesSettingsService.get()).showChatPreview, isTrue);
    expect((await NotificationPreferencesService.get()).showMessages, isFalse);
  });

  test('principal registry is bounded without evicting earlier state',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    for (var index = 0; index < 12; index += 1) {
      await useAccount('rw5-bounded-$index@example.invalid');
      await BlockedUsersService.blockUser('bounded-block-$index');
    }
    await useAccount('rw5-bounded-overflow@example.invalid');
    await expectLater(
      BlockedUsersService.blockUser('overflow-block'),
      throwsStateError,
    );
    await useAccount('rw5-bounded-0@example.invalid');
    expect(await BlockedUsersService.isBlocked('bounded-block-0'), isTrue);
  });

  test('one corrupt principal bucket is preserved without blocking another',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    const accountA = 'rw5-bucket-a@example.invalid';
    const accountB = 'rw5-bucket-b@example.invalid';
    await useAccount(accountA);
    await BlockedUsersService.blockUser('safe-a');
    await useAccount(accountB);
    await BlockedUsersService.blockUser('corrupt-b');

    final prefs = await SharedPreferences.getInstance();
    final document = jsonDecode(
      prefs.getString('local_safety_privacy_state_v1')!,
    ) as Map;
    final principals = document['principals'] as Map;
    final tokenB = principals.keys.cast<String>().firstWhere(
          (token) => ((principals[token] as Map)['blockedUserIds'] as List)
              .contains('corrupt-b'),
        );
    final corruptBucket = Map<String, dynamic>.from(principals[tokenB] as Map)
      ..['blockedUserIds'] = 'corrupt-bucket';
    principals[tokenB] = corruptBucket;
    await prefs.setString(
      'local_safety_privacy_state_v1',
      jsonEncode(document),
    );

    await useAccount(accountA);
    expect(await BlockedUsersService.isBlocked('safe-a'), isTrue);
    await BlockedUsersService.blockUser('safe-a-2');
    final rewritten = jsonDecode(
      prefs.getString('local_safety_privacy_state_v1')!,
    ) as Map;
    expect((rewritten['principals'] as Map)[tokenB], corruptBucket);

    await useAccount(accountB);
    await expectLater(
      BlockedUsersService.getBlockedUserIds(),
      throwsA(isA<FormatException>()),
    );
  });

  test('legacy muted entries migrate only to their exact user-id principal',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'muted_message_threads_v1': jsonEncode(<String>[
        'rw5-user-a::legacy-thread-a',
        'rw5-user-b::legacy-thread-b',
      ]),
    });
    await useAccount(
      'rw5-muted-a@example.invalid',
      userId: 'rw5-user-a',
    );
    expect(
      await LocalSafetyPrivacyService.getMutedThreadIds(
        legacyUserId: 'rw5-user-a',
      ),
      <String>{'legacy-thread-a'},
    );
    final prefs = await SharedPreferences.getInstance();
    expect(
      prefs.getString('muted_message_threads_v1'),
      isNot(contains('rw5-user-a::legacy-thread-a')),
    );
    expect(
      prefs.getString('muted_message_threads_v1'),
      contains('rw5-user-b::legacy-thread-b'),
    );

    await useAccount(
      'rw5-muted-b@example.invalid',
      userId: 'rw5-user-b',
    );
    expect(
      await LocalSafetyPrivacyService.getMutedThreadIds(
        legacyUserId: 'rw5-user-b',
      ),
      <String>{'legacy-thread-b'},
    );
  });

  testWidgets('corrupt block state renders a closed error instead of empty',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'blocked_user_ids_v1': '{corrupt-block-state',
    });
    await useGuest();

    await tester.pumpWidget(
      MaterialApp(
        home: BlockedUsersScreen(
          safetyActionService: _Rw5LocalSafetyActionService(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Blockierte Nutzer konnten nicht sicher geladen werden.'),
      findsOneWidget,
    );
    expect(find.text('Du hast keine Nutzer blockiert.'), findsNothing);
    expect(find.widgetWithText(ElevatedButton, 'Erneut versuchen'),
        findsOneWidget);
  });

  testWidgets('blocked-users UI drops account A state after switch to B',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await useAccount('rw5-ui-a@example.invalid');
    await BlockedUsersService.blockUser('blocked-ui-a');

    await tester.pumpWidget(
      MaterialApp(
        home: BlockedUsersScreen(
          safetyActionService: _Rw5LocalSafetyActionService(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('blocked-ui-a'), findsWidgets);

    await useAccount('rw5-ui-b@example.invalid');
    SharedPersistenceSync.notify(
      SharedPersistenceSync.localSafetyPrivacyStateKey,
    );
    await tester.pumpAndSettle();

    expect(find.text('blocked-ui-a'), findsNothing);
    expect(find.text('Du hast keine Nutzer blockiert.'), findsOneWidget);
  });
}

class _Rw5LocalSafetyActionService extends SafetyActionService {
  @override
  bool get backendEnabled => false;

  @override
  Future<SafetyActionContext?> loadCurrentContext() async {
    final session = await AuthService.readSession();
    if (session == null) return null;
    final owner = AuthService.captureSessionOwner(session);
    final id = (session.userId ?? session.email).trim();
    return SafetyActionContext(
      user: buildTestUser(id, name: id, email: session.email),
      owner: SessionTransitionOwner(
        authOwner: owner,
        profileUserId: session.userId,
      ),
      localPrincipal: LocalPrincipalScope.fromSession(session),
    );
  }

  @override
  Future<bool> isContextCurrent(SafetyActionContext context) =>
      AuthService.isSessionOwnerDefinitelyCurrent(context.owner.authOwner);
}
