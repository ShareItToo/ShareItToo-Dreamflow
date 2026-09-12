import 'dart:convert';

import 'package:lendify/services/local_safety_privacy_service.dart';

/// Local-only notification settings (no push/e-mail in MVP).
///
/// These settings control what categories are shown in the in-app notification
/// feed and how it behaves. Stored in the local principal-scoped registry.
class NotificationPreferences {
  final bool showImportant;
  final bool showBookings;
  final bool showMessages;
  final bool showSupport;
  final bool showPayments;
  final bool showReviews;
  final bool showSecurity;
  final bool showSystem;
  final bool groupByCategory;
  final bool unreadFirst;

  const NotificationPreferences({
    required this.showImportant,
    required this.showBookings,
    required this.showMessages,
    required this.showSupport,
    required this.showPayments,
    required this.showReviews,
    required this.showSecurity,
    required this.showSystem,
    required this.groupByCategory,
    required this.unreadFirst,
  });

  factory NotificationPreferences.defaults() => const NotificationPreferences(
        showImportant: true,
        showBookings: true,
        showMessages: true,
        showSupport: true,
        showPayments: true,
        showReviews: true,
        showSecurity: true,
        showSystem: true,
        groupByCategory: true,
        unreadFirst: true,
      );

  NotificationPreferences copyWith({
    bool? showImportant,
    bool? showBookings,
    bool? showMessages,
    bool? showSupport,
    bool? showPayments,
    bool? showReviews,
    bool? showSecurity,
    bool? showSystem,
    bool? groupByCategory,
    bool? unreadFirst,
  }) =>
      NotificationPreferences(
        // Locked categories: always true.
        showImportant: true,
        showBookings: showBookings ?? this.showBookings,
        showMessages: showMessages ?? this.showMessages,
        showSupport: showSupport ?? this.showSupport,
        showPayments: showPayments ?? this.showPayments,
        showReviews: showReviews ?? this.showReviews,
        // Locked categories: always true.
        showSecurity: true,
        showSystem: showSystem ?? this.showSystem,
        groupByCategory: groupByCategory ?? this.groupByCategory,
        unreadFirst: unreadFirst ?? this.unreadFirst,
      );

  Map<String, dynamic> toJson() => {
        'showImportant': showImportant,
        'showBookings': showBookings,
        'showMessages': showMessages,
        'showSupport': showSupport,
        'showPayments': showPayments,
        'showReviews': showReviews,
        'showSecurity': showSecurity,
        'showSystem': showSystem,
        'groupByCategory': groupByCategory,
        'unreadFirst': unreadFirst,
      };

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) {
    final d = NotificationPreferences.defaults();
    bool b(String k, bool v) {
      final raw = json[k];
      if (raw is bool) return raw;
      return v;
    }

    return NotificationPreferences(
      // Locked categories: always enabled.
      showImportant: true,
      showBookings: b('showBookings', d.showBookings),
      showMessages: b('showMessages', d.showMessages),
      showSupport: b('showSupport', d.showSupport),
      showPayments: b('showPayments', d.showPayments),
      showReviews: b('showReviews', d.showReviews),
      // Locked categories: always enabled.
      showSecurity: true,
      showSystem: b('showSystem', d.showSystem),
      groupByCategory: b('groupByCategory', d.groupByCategory),
      unreadFirst: b('unreadFirst', d.unreadFirst),
    );
  }
}

class NotificationPreferencesService {
  static Future<NotificationPreferences> get() async {
    final stored = await LocalSafetyPrivacyService.getNotificationPreferences();
    if (stored == null) return NotificationPreferences.defaults();
    final preferences = NotificationPreferences.fromJson(stored);
    if (jsonEncode(preferences.toJson()) != jsonEncode(stored)) {
      await LocalSafetyPrivacyService.setNotificationPreferences(
        preferences.toJson(),
      );
    }
    return preferences;
  }

  static Future<void> set(NotificationPreferences value) async {
    // Sanitize to enforce locked categories.
    final sanitized = value.copyWith(showImportant: true, showSecurity: true);
    await LocalSafetyPrivacyService.setNotificationPreferences(
      sanitized.toJson(),
    );
  }

  static Future<void> reset() async => set(NotificationPreferences.defaults());
}
