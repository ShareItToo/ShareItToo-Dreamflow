import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/data_service.dart';

enum NotificationTargetKind {
  none,
  ownerRequestDetail,
  ownerRequestsOverview,
  ownerBookingDetail,
  renterBookingDetail,
}

class NotificationCtaResolution {
  final NotificationTargetKind target;
  final String sitCategory;
  final String? ctaLabel;
  final String? requestId;

  const NotificationCtaResolution({
    required this.target,
    required this.sitCategory,
    this.ctaLabel,
    this.requestId,
  });
}

class NotificationCtaResolver {
  static Future<NotificationCtaResolution> resolve({
    required Map<String, dynamic> notification,
    required String currentUserId,
  }) async {
    String str(Object? value) => value == null ? '' : value.toString().trim();
    String lower(Object? value) => str(value).toLowerCase();

    final routeKind = _deriveRouteKind(notification);
    final entityType = lower(notification['entityType']);
    final title = lower(notification['title']);
    final body = lower(notification['body']);
    final cta = lower(notification['ctaLabel']);
    final looksLikeOwnerRequest = _looksLikeOwnerRequest(
      routeKind: routeKind,
      title: title,
      body: body,
      cta: cta,
    );

    if (routeKind != _RouteKind.booking && routeKind != _RouteKind.rentals) {
      return NotificationCtaResolution(
        target: NotificationTargetKind.none,
        sitCategory: _sitCategoryFor(routeKind),
      );
    }

    final requestId = _resolveRequestId(notification, entityType: entityType);
    if (requestId.isEmpty) {
      if (looksLikeOwnerRequest) {
        return const NotificationCtaResolution(
          target: NotificationTargetKind.ownerRequestsOverview,
          sitCategory: 'rentals',
          ctaLabel: 'Zu Vermietungen',
        );
      }
      return NotificationCtaResolution(
        target: NotificationTargetKind.none,
        sitCategory: _sitCategoryFor(routeKind),
      );
    }

    RentalRequest? req;
    try {
      req = await DataService.getRentalRequestById(requestId);
    } on StateError {
      // A stale notification must not become a foreign-account lookup oracle.
      return NotificationCtaResolution(
        target: NotificationTargetKind.none,
        sitCategory: _sitCategoryFor(routeKind),
      );
    }
    if (req == null) {
      if (looksLikeOwnerRequest) {
        return const NotificationCtaResolution(
          target: NotificationTargetKind.ownerRequestsOverview,
          sitCategory: 'rentals',
          ctaLabel: 'Zu Vermietungen',
        );
      }
      return NotificationCtaResolution(
        target: NotificationTargetKind.none,
        sitCategory: _sitCategoryFor(routeKind),
      );
    }

    final isOwner = req.ownerId == currentUserId;
    final isRenter = req.renterId == currentUserId;
    if (!isOwner && !isRenter) {
      return NotificationCtaResolution(
        target: NotificationTargetKind.none,
        sitCategory: _sitCategoryFor(routeKind),
      );
    }

    final status = req.status.toLowerCase();
    if (status == 'pending') {
      if (!isOwner) {
        return NotificationCtaResolution(
          target: NotificationTargetKind.none,
          sitCategory: _sitCategoryFor(routeKind),
        );
      }
      return NotificationCtaResolution(
        target: NotificationTargetKind.ownerRequestDetail,
        sitCategory: 'rentals',
        ctaLabel: 'Anfrage prüfen',
        requestId: req.id,
      );
    }

    if (_isBookingDetailStatus(status)) {
      return NotificationCtaResolution(
        target: isOwner
            ? NotificationTargetKind.ownerBookingDetail
            : NotificationTargetKind.renterBookingDetail,
        sitCategory: isOwner ? 'rentals' : 'bookings',
        ctaLabel: isOwner ? 'Zur Vermietung' : 'Zur Buchung',
        requestId: req.id,
      );
    }

    return NotificationCtaResolution(
      target: NotificationTargetKind.none,
      sitCategory: _sitCategoryFor(routeKind),
    );
  }

  static String _resolveRequestId(
    Map<String, dynamic> notification, {
    required String entityType,
  }) {
    final explicit = (notification['requestId'] ?? '').toString().trim();
    if (explicit.isNotEmpty) return explicit;
    if (entityType == 'booking') {
      return (notification['entityId'] ?? '').toString().trim();
    }
    return '';
  }

  static bool _looksLikeOwnerRequest({
    required _RouteKind routeKind,
    required String title,
    required String body,
    required String cta,
  }) {
    if (routeKind == _RouteKind.rentals) return true;
    return cta == 'anfrage prüfen' ||
        title.contains('mietanfrage') ||
        body.contains('deiner anzeige');
  }

  static bool _isBookingDetailStatus(String status) =>
      status == 'accepted' ||
      status == 'running' ||
      status == 'completed' ||
      status == 'declined' ||
      status == 'cancelled';

  static _RouteKind _deriveRouteKind(Map<String, dynamic> notification) {
    String lower(Object? value) =>
        value == null ? '' : value.toString().trim().toLowerCase();

    final raw = lower(notification['category']);
    final entityType = lower(notification['entityType']);
    final title = lower(notification['title']);
    final body = lower(notification['body']);
    final cta = lower(notification['ctaLabel']);

    bool matchesAny(Iterable<String> needles) => needles.any(
          (needle) => title.contains(needle) || body.contains(needle),
        );

    if (entityType == 'thread' || raw == 'messages') return _RouteKind.message;
    if (entityType == 'support' || raw == 'support') return _RouteKind.support;
    if (entityType == 'payment' || raw == 'payments') return _RouteKind.payment;
    if (raw == 'reviews') return _RouteKind.review;
    if (entityType == 'verification' ||
        raw == 'security' ||
        raw == 'important') {
      return _RouteKind.system;
    }
    if (raw == 'system' || raw == 'platform' || entityType == 'system') {
      return _RouteKind.system;
    }
    if (matchesAny(const ['rechnung', 'invoice'])) return _RouteKind.invoice;
    if (matchesAny(const [
      'übergabe',
      'rückgabe',
      'handover',
      'return',
      'qr-code',
      'qr code',
    ])) {
      return _RouteKind.handover;
    }
    if (raw == 'bookings' || entityType == 'booking') {
      if (cta == 'anfrage prüfen' ||
          matchesAny(const ['mietanfrage', 'vermietung', 'deiner anzeige'])) {
        return _RouteKind.rentals;
      }
      return _RouteKind.booking;
    }
    return _RouteKind.system;
  }

  static String _sitCategoryFor(_RouteKind kind) {
    switch (kind) {
      case _RouteKind.rentals:
        return 'rentals';
      case _RouteKind.booking:
        return 'bookings';
      case _RouteKind.handover:
        return 'handover';
      case _RouteKind.support:
        return 'support';
      case _RouteKind.payment:
      case _RouteKind.invoice:
        return 'payments';
      case _RouteKind.message:
        return 'messages';
      case _RouteKind.review:
        return 'reviews';
      case _RouteKind.system:
        return 'system';
    }
  }
}

enum _RouteKind {
  booking,
  rentals,
  handover,
  support,
  payment,
  invoice,
  message,
  review,
  system,
}
