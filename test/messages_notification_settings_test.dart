import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/notifications_screen.dart';
import 'package:lendify/services/messages_settings_service.dart';
import 'package:lendify/services/notification_preferences_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test(
      'messages settings normalize locked product rules when reading persisted values',
      () async {
    SharedPreferences.setMockInitialValues({
      'messages_settings_v1': jsonEncode({
        'muteAll': true,
        'sendReadReceipts': false,
        'showChatPreview': false,
        'newMessagesNotif': false,
        'handoverReturnReminders': false,
        'openTimeConfirmations': false,
        'supportCaseUpdates': false,
        'whoCanWrite': 'everyone',
        'autoSaveHandoverPhotos': false,
        'handoverReminders': false,
        'saveReceiptsLocally': false,
        'showQrCodeHints': false,
        'autoArchiveChats': true,
        'hideCompletedChats': true,
        'mediaAutoDownload': 'never',
        'autoTranslateChat': true,
        'showOriginalMessages': true,
        'preferredLanguageCode': 'en',
      }),
    });

    final settings = await MessagesSettingsService.get();

    expect(settings.muteAll, isFalse);
    expect(settings.sendReadReceipts, isTrue);
    expect(settings.newMessagesNotif, isTrue);
    expect(settings.handoverReturnReminders, isTrue);
    expect(settings.openTimeConfirmations, isTrue);
    expect(settings.supportCaseUpdates, isTrue);
    expect(settings.showQrCodeHints, isTrue);
    expect(settings.autoArchiveChats, isFalse);
    expect(settings.hideCompletedChats, isFalse);
    expect(settings.showChatPreview, isFalse);
    expect(settings.whoCanWrite, WhoCanWrite.everyone);
    expect(settings.mediaAutoDownload, MediaAutoDownload.never);
    expect(settings.autoTranslateChat, isTrue);
    expect(settings.preferredLanguageCode, 'en');
  });

  test(
      'notification preferences keep important and security categories locked on',
      () async {
    final prefs = NotificationPreferences.defaults().copyWith(
      showBookings: false,
      showMessages: false,
      showSupport: false,
      showPayments: false,
      showReviews: false,
      showSystem: false,
      unreadFirst: false,
      groupByCategory: false,
    );

    await NotificationPreferencesService.set(prefs.copyWith(
      showImportant: false,
      showSecurity: false,
    ));

    final restored = await NotificationPreferencesService.get();

    expect(restored.showImportant, isTrue);
    expect(restored.showSecurity, isTrue);
    expect(restored.showBookings, isFalse);
    expect(restored.showMessages, isFalse);
    expect(restored.showSupport, isFalse);
    expect(restored.showPayments, isFalse);
    expect(restored.showReviews, isFalse);
    expect(restored.showSystem, isFalse);
    expect(restored.groupByCategory, isFalse);
    expect(restored.unreadFirst, isFalse);
  });

  test(
      'handover filter is independent and missing legacy value migrates enabled',
      () async {
    final migrated = NotificationPreferences.fromJson({
      'showBookings': false,
      'showMessages': true,
    });
    expect(migrated.showBookings, isFalse);
    expect(migrated.showHandover, isTrue);

    await NotificationPreferencesService.set(
      migrated.copyWith(showBookings: true, showHandover: false),
    );
    final restored = await NotificationPreferencesService.get();
    expect(restored.showBookings, isTrue);
    expect(restored.showHandover, isFalse);
  });

  test('notification feed categories use their dedicated persisted filters',
      () {
    final prefs = NotificationPreferences.defaults().copyWith(
      showBookings: false,
      showHandover: false,
      showSystem: false,
    );
    expect(
      notificationAllowedByPreferences(
        {'category': 'bookings', 'title': 'Statusänderung'},
        prefs,
      ),
      isFalse,
    );
    expect(
      notificationAllowedByPreferences(
        {'category': 'bookings', 'title': 'Mietanfrage für deine Anzeige'},
        prefs,
      ),
      isFalse,
    );
    expect(
      notificationAllowedByPreferences(
        {'category': 'bookings', 'title': 'Übergabe bestätigen'},
        prefs,
      ),
      isFalse,
    );
    expect(
      notificationAllowedByPreferences({'category': 'system'}, prefs),
      isFalse,
    );

    final split = prefs.copyWith(showBookings: true);
    expect(
      notificationAllowedByPreferences(
        {'category': 'bookings', 'title': 'Statusänderung'},
        split,
      ),
      isTrue,
    );
    expect(
      notificationAllowedByPreferences(
        {'category': 'bookings', 'title': 'Übergabe bestätigen'},
        split,
      ),
      isFalse,
    );
  });
}
