import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/payment_method.dart';
import 'package:lendify/services/blocked_users_service.dart';
import 'package:lendify/services/data_service.dart';

class ActionGuardResult {
  final bool allowed;
  final String? reason;
  final String? actionLabel;

  const ActionGuardResult.allowed()
      : allowed = true,
        reason = null,
        actionLabel = null;

  const ActionGuardResult.blocked(
      {required this.reason, required this.actionLabel})
      : allowed = false;
}

class PaymentDuplicateResult {
  final bool allowed;
  final PaymentMethod? existing;
  final String message;

  const PaymentDuplicateResult.allowed()
      : allowed = true,
        existing = null,
        message = '';

  const PaymentDuplicateResult.blocked(this.message, {this.existing})
      : allowed = false;
}

class ProfileEcosystemService {
  static const Set<String> _activeRequestStatuses = {
    'pending',
    'accepted',
    'running',
  };

  static bool isPubliclyVisibleItem(Item item) =>
      DataService.isPublicCatalogItem(item);

  static bool isOwnItemForUser({required Item item, required String? userId}) =>
      userId != null && userId.isNotEmpty && item.ownerId == userId;

  static Future<ActionGuardResult> canOpenPublicItem({
    required Item item,
    required String? currentUserId,
    bool allowOwnerPreview = false,
  }) async {
    if (allowOwnerPreview &&
        isOwnItemForUser(item: item, userId: currentUserId)) {
      return const ActionGuardResult.allowed();
    }
    final blockedUserIds =
        (await BlockedUsersService.getBlockedUserIds()).toSet();
    if (blockedUserIds.contains(item.ownerId)) {
      return const ActionGuardResult.blocked(
        reason:
            'Dieser Nutzer ist blockiert. Öffentliche Anzeigen und Profile dieses Nutzers sind deshalb ausgeblendet.',
        actionLabel: 'Nutzer zuerst entblockieren',
      );
    }
    if (!isPubliclyVisibleItem(item)) {
      return const ActionGuardResult.blocked(
        reason: 'Diese Anzeige ist aktuell nicht öffentlich verfügbar.',
        actionLabel: 'Nur aktive öffentliche Anzeigen können geöffnet werden',
      );
    }
    return const ActionGuardResult.allowed();
  }

  static Future<ActionGuardResult> canUseWishlistForItem({
    required Item item,
    required String? currentUserId,
  }) async {
    final publicGuard = await canOpenPublicItem(
      item: item,
      currentUserId: currentUserId,
    );
    if (!publicGuard.allowed) return publicGuard;
    if (isOwnItemForUser(item: item, userId: currentUserId)) {
      return const ActionGuardResult.blocked(
        reason:
            'Deine eigene Anzeige kann nicht unter Gemerkt verwaltet werden.',
        actionLabel: 'Verwalte die Anzeige über „Meine Anzeigen“',
      );
    }
    return const ActionGuardResult.allowed();
  }

  static Future<ActionGuardResult> canViewPublicProfile({
    required String? profileUserId,
    required String? currentUserId,
  }) async {
    final targetId = (profileUserId ?? '').trim();
    if (targetId.isEmpty || targetId == currentUserId) {
      return const ActionGuardResult.allowed();
    }
    final blockedUserIds =
        (await BlockedUsersService.getBlockedUserIds()).toSet();
    if (blockedUserIds.contains(targetId)) {
      return const ActionGuardResult.blocked(
        reason:
            'Dieses Profil ist blockiert und deshalb nicht mehr öffentlich erreichbar.',
        actionLabel: 'Zu Entdecken',
      );
    }
    return const ActionGuardResult.allowed();
  }

  static Future<ActionGuardResult> canStartNewChatWithUser({
    required String otherUserId,
  }) async {
    final current = await DataService.getCurrentUser();
    final currentUserId = current?.id;
    if (currentUserId != null && currentUserId == otherUserId) {
      return const ActionGuardResult.blocked(
        reason: 'Du kannst keinen neuen Chat mit dir selbst starten.',
        actionLabel: 'Nutze stattdessen deine bestehenden Bereiche in der App',
      );
    }
    final blockedUserIds =
        (await BlockedUsersService.getBlockedUserIds()).toSet();
    if (blockedUserIds.contains(otherUserId)) {
      return const ActionGuardResult.blocked(
        reason:
            'Dieser Nutzer ist blockiert. Neue Chats sind deshalb deaktiviert.',
        actionLabel: 'Nutzer zuerst entblockieren',
      );
    }
    return const ActionGuardResult.allowed();
  }

  static Future<ActionGuardResult> canReportUser({
    required String otherUserId,
  }) async {
    final current = await DataService.getCurrentUser();
    if (current != null && current.id == otherUserId) {
      return const ActionGuardResult.blocked(
        reason: 'Du kannst dein eigenes Profil nicht melden.',
        actionLabel: 'Verwalte dein Profil direkt in den Kontoeinstellungen',
      );
    }
    return const ActionGuardResult.allowed();
  }

  static Future<ActionGuardResult> canStartRentalRequest({
    required Item item,
    required String? currentUserId,
  }) async {
    if (isOwnItemForUser(item: item, userId: currentUserId)) {
      return const ActionGuardResult.blocked(
        reason: 'Du kannst deine eigene Anzeige nicht buchen.',
        actionLabel:
            'Öffne die Anzeige über „Meine Anzeigen“, um sie zu bearbeiten oder zu verwalten',
      );
    }
    final blockedUserIds =
        (await BlockedUsersService.getBlockedUserIds()).toSet();
    if (blockedUserIds.contains(item.ownerId)) {
      return const ActionGuardResult.blocked(
        reason:
            'Dieser Nutzer ist blockiert. Neue Anfragen und Merken-Aktionen sind deshalb deaktiviert.',
        actionLabel: 'Nutzer zuerst entblockieren',
      );
    }
    if (!isPubliclyVisibleItem(item)) {
      return const ActionGuardResult.blocked(
        reason: 'Diese Anzeige ist aktuell nicht öffentlich verfügbar.',
        actionLabel:
            'Nur aktive öffentliche Anzeigen können neu angefragt werden',
      );
    }
    return const ActionGuardResult.allowed();
  }

  static Future<ActionGuardResult> canShareListing(Item item) async {
    if (isPubliclyVisibleItem(item)) return const ActionGuardResult.allowed();
    return const ActionGuardResult.blocked(
      reason: 'Diese Anzeige ist aktuell nicht öffentlich sichtbar.',
      actionLabel: 'Teilen ist erst wieder möglich, wenn die Anzeige aktiv ist',
    );
  }

  static Future<List<Item>> filterVisiblePublicItems(List<Item> items) async {
    final blockedUserIds =
        (await BlockedUsersService.getBlockedUserIds()).toSet();
    return items
        .where((item) => isPubliclyVisibleItem(item))
        .where((item) => !blockedUserIds.contains(item.ownerId))
        .toList();
  }

  static bool requestKeepsProcessOpen(RentalRequest request) {
    if (_activeRequestStatuses.contains(request.status)) return true;
    if (request.needsReview) return true;
    if (_hasIncompleteConfirmation(request.handoverConfirmation)) return true;
    if (_hasIncompleteConfirmation(request.returnConfirmation)) return true;
    return false;
  }

  static Future<ActionGuardResult> canBlockUser(
      {required String otherUserId}) async {
    final current = await DataService.getCurrentUser();
    if (current == null) return const ActionGuardResult.allowed();
    if (otherUserId == current.id) {
      return const ActionGuardResult.blocked(
        reason: 'Du kannst dein eigenes Profil nicht blockieren.',
        actionLabel: 'Verwalte dein Profil direkt in den Kontoeinstellungen',
      );
    }
    final ownerRequests =
        await DataService.getRentalRequestsForOwner(current.id);
    final renterRequests =
        await DataService.getRentalRequestsForRenter(current.id);
    for (final request in [...ownerRequests, ...renterRequests]) {
      final involvesOther =
          request.ownerId == otherUserId || request.renterId == otherUserId;
      if (!involvesOther || !requestKeepsProcessOpen(request)) continue;
      return _blockReasonForRequest(current.id, request);
    }
    return const ActionGuardResult.allowed();
  }

  static Future<ActionGuardResult> canEditListing(Item item) async {
    final request = await _firstOpenRequestForItem(item.id);
    if (request == null) return const ActionGuardResult.allowed();
    return _listingGuardForRequest(request);
  }

  static Future<ActionGuardResult> canDeleteListing(Item item) async {
    final request = await _firstOpenRequestForItem(item.id);
    if (request == null) return const ActionGuardResult.allowed();
    return _listingGuardForRequest(request);
  }

  static Future<ActionGuardResult> canPauseListing(Item item) async {
    final request = await _firstOpenRequestForItem(item.id);
    if (request == null) return const ActionGuardResult.allowed();
    return _listingGuardForRequest(request);
  }

  static PaymentDuplicateResult checkDuplicatePaymentMethod({
    required List<PaymentMethod> existingMethods,
    required PaymentMethod candidate,
    String? fingerprint,
  }) {
    final normalizedFingerprint =
        _normalizeToken(fingerprint) ?? _normalizePaymentFingerprint(candidate);
    for (final existing in existingMethods) {
      if (_isProviderSingleton(candidate.type)) {
        if (existing.type == candidate.type) {
          return PaymentDuplicateResult.blocked(
            '${candidate.label} ist bereits verbunden.',
            existing: existing,
          );
        }
        continue;
      }
      if (_isCardType(candidate.type)) {
        if (!_isCardType(existing.type)) continue;
        final existingFp = _normalizePaymentFingerprint(existing);
        if (normalizedFingerprint != null &&
            existingFp != null &&
            normalizedFingerprint == existingFp) {
          return PaymentDuplicateResult.blocked(
            'Diese Karte ist bereits gespeichert.',
            existing: existing,
          );
        }
      }
    }
    return const PaymentDuplicateResult.allowed();
  }

  static String normalizeSearchText(String input) {
    return input
        .toLowerCase()
        .replaceAll('ä', 'ae')
        .replaceAll('ö', 'oe')
        .replaceAll('ü', 'ue')
        .replaceAll('ß', 'ss')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static bool fuzzyMatches(String query, Iterable<String> fields) {
    final q = normalizeSearchText(query);
    if (q.isEmpty) return false;
    final qParts = q.split(' ').where((part) => part.isNotEmpty).toList();
    if (qParts.isEmpty) return false;
    final haystack = normalizeSearchText(fields.join(' '));
    return qParts.every((part) => haystack.contains(part));
  }

  static Future<RentalRequest?> _firstOpenRequestForItem(String itemId) async {
    final current = await DataService.getCurrentUser();
    if (current == null) return null;
    final ownerRequests =
        await DataService.getRentalRequestsForOwner(current.id);
    for (final request in ownerRequests) {
      if (request.itemId == itemId && requestKeepsProcessOpen(request)) {
        return request;
      }
    }
    return null;
  }

  static bool _hasIncompleteConfirmation(Map<String, dynamic>? data) {
    if (data == null || data.isEmpty) return false;
    final completed = data['completed'] == true || data['confirmed'] == true;
    return !completed;
  }

  static ActionGuardResult _blockReasonForRequest(
      String currentUserId, RentalRequest request) {
    final isOwner = request.ownerId == currentUserId;
    switch (request.status) {
      case 'pending':
        return ActionGuardResult.blocked(
          reason: isOwner
              ? 'Zwischen euch liegt noch eine offene Mietanfrage vor.'
              : 'Zwischen euch liegt noch eine ausstehende Mietanfrage vor.',
          actionLabel: isOwner
              ? 'Anfrage zuerst ablehnen'
              : 'Anfrage zuerst zurückziehen',
        );
      case 'accepted':
        return const ActionGuardResult.blocked(
          reason:
              'Zwischen euch gibt es noch eine bestätigte, kommende Buchung.',
          actionLabel: 'Buchung zuerst stornieren',
        );
      case 'running':
        return const ActionGuardResult.blocked(
          reason:
              'Zwischen euch läuft noch eine aktive Vermietung oder Rückgabe.',
          actionLabel: 'Rückgabe und Abschluss zuerst durchführen',
        );
      default:
        if (request.needsReview) {
          return const ActionGuardResult.blocked(
            reason: 'Für diesen Vorgang ist noch eine Prüfung offen.',
            actionLabel: 'Vorgang zuerst vollständig abschließen',
          );
        }
        if (_hasIncompleteConfirmation(request.handoverConfirmation) ||
            _hasIncompleteConfirmation(request.returnConfirmation)) {
          return const ActionGuardResult.blocked(
            reason:
                'Übergabe oder Rückgabe ist noch nicht vollständig abgeschlossen.',
            actionLabel: 'Vorgang zuerst vollständig abschließen',
          );
        }
        return const ActionGuardResult.allowed();
    }
  }

  static ActionGuardResult _listingGuardForRequest(RentalRequest request) {
    switch (request.status) {
      case 'pending':
        return const ActionGuardResult.blocked(
          reason: 'Für diese Anzeige gibt es noch eine offene Mietanfrage.',
          actionLabel: 'Anfrage zuerst bearbeiten',
        );
      case 'accepted':
        return const ActionGuardResult.blocked(
          reason:
              'Für diese Anzeige gibt es noch eine bestätigte, kommende Buchung.',
          actionLabel: 'Buchung zuerst stornieren oder abschließen',
        );
      case 'running':
        return const ActionGuardResult.blocked(
          reason: 'Für diese Anzeige läuft noch eine aktive Vermietung.',
          actionLabel: 'Rückgabe und Abschluss zuerst durchführen',
        );
      default:
        if (request.needsReview) {
          final supportLabel = _supportHoldLabel(request);
          return ActionGuardResult.blocked(
            reason:
                'Für diese Anzeige ist noch ein offener Supportfall ($supportLabel) aktiv.',
            actionLabel: 'Supportfall ${request.id} zuerst abschließen',
          );
        }
        if (_hasIncompleteConfirmation(request.handoverConfirmation) ||
            _hasIncompleteConfirmation(request.returnConfirmation)) {
          return const ActionGuardResult.blocked(
            reason:
                'Für diese Anzeige ist noch ein Übergabe-, Rückgabe- oder Prüfprozess offen.',
            actionLabel: 'Vorgang zuerst vollständig abschließen',
          );
        }
        return const ActionGuardResult.allowed();
    }
  }

  static String _supportHoldLabel(RentalRequest request) {
    final source = (request.reviewSource ?? '').trim();
    final reason = (request.reviewReason ?? '').trim();
    if (source.isNotEmpty) return source;
    if (reason.isNotEmpty) return reason;
    return 'Prüffall';
  }

  static bool _isProviderSingleton(PaymentMethodType type) => const {
        PaymentMethodType.paypal,
        PaymentMethodType.applePay,
        PaymentMethodType.googlePay,
      }.contains(type);

  static bool _isCardType(PaymentMethodType type) => const {
        PaymentMethodType.visa,
        PaymentMethodType.mastercard,
        PaymentMethodType.amex,
      }.contains(type);

  static String? _normalizePaymentFingerprint(PaymentMethod method) {
    final parts = <String>[method.type.name];
    final last4 = _normalizeToken(method.last4);
    if (last4 != null) parts.add(last4);
    final holder = _normalizeToken(method.holderName);
    if (holder != null) parts.add(holder);
    if (parts.length <= 1) return null;
    return parts.join('|');
  }

  static String? _normalizeToken(String? value) {
    final cleaned = normalizeSearchText(value ?? '').replaceAll(' ', '');
    return cleaned.isEmpty ? null : cleaned;
  }
}
