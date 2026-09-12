import 'rental_cart.dart';

const List<String> bookingGroupRequiredEvidenceSlots = <String>[
  'overview',
  'detail',
  'accessories',
  'critical',
];

class BookingGroupQuoteItem {
  final String groupPositionId;
  final String listingId;
  final String bookingQuoteId;
  final String bookingQuoteHash;
  final String currency;
  final int rentalSubtotalMinor;
  final int platformFeeMinor;
  final int totalMinor;
  final int ownerPayoutMinor;
  final int securityDepositMinor;
  final int sortOrder;

  const BookingGroupQuoteItem({
    required this.groupPositionId,
    required this.listingId,
    required this.bookingQuoteId,
    required this.bookingQuoteHash,
    required this.currency,
    required this.rentalSubtotalMinor,
    required this.platformFeeMinor,
    required this.totalMinor,
    required this.ownerPayoutMinor,
    required this.securityDepositMinor,
    required this.sortOrder,
  });

  factory BookingGroupQuoteItem.fromJson(
    Map<String, dynamic> json, {
    required String expectedCurrency,
  }) {
    final currency = _currency(json['currency']);
    if (currency != expectedCurrency) {
      throw const FormatException('Booking group item currency mismatch');
    }
    final rentalSubtotalMinor =
        _minor(json['rentalSubtotalMinor'], 'rentalSubtotalMinor');
    final platformFeeMinor =
        _minor(json['platformFeeMinor'], 'platformFeeMinor');
    final totalMinor = _minor(json['totalMinor'], 'totalMinor');
    final ownerPayoutMinor =
        _minor(json['ownerPayoutMinor'], 'ownerPayoutMinor');
    final securityDepositMinor =
        _minor(json['securityDepositMinor'], 'securityDepositMinor');
    if (securityDepositMinor != 0 ||
        rentalSubtotalMinor > ownerPayoutMinor ||
        ownerPayoutMinor + platformFeeMinor != totalMinor) {
      throw const FormatException('Invalid booking group item allocation');
    }
    return BookingGroupQuoteItem(
      groupPositionId: _identifier(json['groupPositionId'], 'groupPositionId'),
      listingId: _identifier(json['listingId'], 'listingId'),
      bookingQuoteId: _identifier(json['bookingQuoteId'], 'bookingQuoteId'),
      bookingQuoteHash: _hash(json['bookingQuoteHash'], 'bookingQuoteHash'),
      currency: currency,
      rentalSubtotalMinor: rentalSubtotalMinor,
      platformFeeMinor: platformFeeMinor,
      totalMinor: totalMinor,
      ownerPayoutMinor: ownerPayoutMinor,
      securityDepositMinor: securityDepositMinor,
      sortOrder: _nonNegativeInteger(json['sortOrder'], 'sortOrder'),
    );
  }
}

class BookingGroupQuote {
  final String id;
  final int revision;
  final String? predecessorQuoteId;
  final String proposalKind;
  final String currency;
  final int rentalSubtotalMinor;
  final int platformFeeMinor;
  final int totalMinor;
  final int ownerPayoutMinor;
  final int securityDepositMinor;
  final String quoteHash;
  final DateTime expiresAt;
  final List<BookingGroupQuoteItem> items;

  const BookingGroupQuote({
    required this.id,
    required this.revision,
    required this.predecessorQuoteId,
    required this.proposalKind,
    required this.currency,
    required this.rentalSubtotalMinor,
    required this.platformFeeMinor,
    required this.totalMinor,
    required this.ownerPayoutMinor,
    required this.securityDepositMinor,
    required this.quoteHash,
    required this.expiresAt,
    required this.items,
  });

  factory BookingGroupQuote.fromJson(Map<String, dynamic> json) {
    final id = _identifier(json['id'], 'quote.id');
    final revision = _positiveInteger(json['revision'], 'quote.revision');
    final predecessor = json['predecessorQuoteId'] == null
        ? null
        : _identifier(json['predecessorQuoteId'], 'quote.predecessorQuoteId');
    final proposalKind = _identifier(json['proposalKind'], 'proposalKind');
    if (!const <String>{'initial', 'owner_counteroffer'}
        .contains(proposalKind)) {
      throw const FormatException('Invalid booking group proposal kind');
    }
    if ((revision == 1 && predecessor != null) ||
        (revision > 1 && predecessor == null)) {
      throw const FormatException('Invalid booking group predecessor');
    }
    final currency = _currency(json['currency']);
    final rawItems = _maps(json['items']);
    final itemCount = _positiveInteger(json['itemCount'], 'quote.itemCount');
    if (rawItems.length != itemCount || itemCount > 20) {
      throw const FormatException('Invalid booking group item count');
    }
    final items = rawItems
        .map((item) => BookingGroupQuoteItem.fromJson(
              item,
              expectedCurrency: currency,
            ))
        .toList(growable: false);
    if (items.map((item) => item.listingId).toSet().length != items.length ||
        items.map((item) => item.groupPositionId).toSet().length !=
            items.length) {
      throw const FormatException('Duplicate booking group quote item');
    }
    final rentalSubtotalMinor =
        _minor(json['rentalSubtotalMinor'], 'quote.rentalSubtotalMinor');
    final platformFeeMinor =
        _minor(json['platformFeeMinor'], 'quote.platformFeeMinor');
    final totalMinor = _minor(json['totalMinor'], 'quote.totalMinor');
    final ownerPayoutMinor =
        _minor(json['ownerPayoutMinor'], 'quote.ownerPayoutMinor');
    final securityDepositMinor =
        _minor(json['securityDepositMinor'], 'quote.securityDepositMinor');
    int sum(int Function(BookingGroupQuoteItem item) select) =>
        items.fold<int>(0, (total, item) => total + select(item));
    if (sum((item) => item.rentalSubtotalMinor) != rentalSubtotalMinor ||
        sum((item) => item.platformFeeMinor) != platformFeeMinor ||
        sum((item) => item.totalMinor) != totalMinor ||
        sum((item) => item.ownerPayoutMinor) != ownerPayoutMinor ||
        sum((item) => item.securityDepositMinor) != securityDepositMinor) {
      throw const FormatException('Booking group total does not match items');
    }
    final expiresAt = DateTime.tryParse((json['expiresAt'] ?? '').toString());
    if (expiresAt == null) {
      throw const FormatException('Invalid booking group expiry');
    }
    return BookingGroupQuote(
      id: id,
      revision: revision,
      predecessorQuoteId: predecessor,
      proposalKind: proposalKind,
      currency: currency,
      rentalSubtotalMinor: rentalSubtotalMinor,
      platformFeeMinor: platformFeeMinor,
      totalMinor: totalMinor,
      ownerPayoutMinor: ownerPayoutMinor,
      securityDepositMinor: securityDepositMinor,
      quoteHash: _hash(json['quoteHash'], 'quote.quoteHash'),
      expiresAt: expiresAt.toUtc(),
      items: items,
    );
  }
}

class BookingGroupSnapshot {
  final String id;
  final String state;
  final BookingGroupQuote quote;
  final BookingGroupQuote? previousQuote;

  const BookingGroupSnapshot({
    required this.id,
    required this.state,
    required this.quote,
    this.previousQuote,
  });

  bool get requiresCounterofferConsent => state == 'counteroffered';

  factory BookingGroupSnapshot.fromJson(Map<String, dynamic> json) {
    final group = json['group'] is Map
        ? Map<String, dynamic>.from(json['group'] as Map)
        : const <String, dynamic>{};
    final id = _identifier(
      json['bookingGroupId'] ?? group['id'],
      'bookingGroupId',
    );
    final state = _identifier(json['state'] ?? group['state'], 'group.state');
    final quote = BookingGroupQuote.fromJson(_map(json['quote'], 'quote'));
    final previous = json['previousQuote'] == null
        ? null
        : BookingGroupQuote.fromJson(
            _map(json['previousQuote'], 'previousQuote'),
          );
    if (quote.predecessorQuoteId != previous?.id &&
        (quote.predecessorQuoteId != null || previous != null)) {
      throw const FormatException('Booking group quote comparison mismatch');
    }
    return BookingGroupSnapshot(
      id: id,
      state: state,
      quote: quote,
      previousQuote: previous,
    );
  }
}

class BookingGroupAppointment {
  final String id;
  final String type;
  final DateTime scheduledAt;
  final String timezone;

  const BookingGroupAppointment({
    required this.id,
    required this.type,
    required this.scheduledAt,
    required this.timezone,
  });

  factory BookingGroupAppointment.fromJson(Map<String, dynamic> json) {
    final type = _identifier(json['type'], 'appointment.type');
    if (!const <String>{'pickup', 'return'}.contains(type) ||
        json['exactAddressDisclosed'] != false) {
      throw const FormatException('Invalid shared appointment boundary');
    }
    final scheduledAt =
        DateTime.tryParse((json['scheduledAt'] ?? '').toString());
    if (scheduledAt == null) {
      throw const FormatException('Invalid shared appointment time');
    }
    return BookingGroupAppointment(
      id: _identifier(json['id'], 'appointment.id'),
      type: type,
      scheduledAt: scheduledAt.toUtc(),
      timezone: _timezone(json['timezone']),
    );
  }
}

class BookingGroupEvidenceSegment {
  final Set<String> completedPresenterSlots;
  final bool accessoriesRequired;
  final String? accessoriesEvidenceId;
  final bool confirmed;

  const BookingGroupEvidenceSegment({
    required this.completedPresenterSlots,
    required this.accessoriesRequired,
    required this.accessoriesEvidenceId,
    required this.confirmed,
  });

  factory BookingGroupEvidenceSegment.fromJson(Map<String, dynamic> json) {
    final required = (json['requiredPresenterSlots'] as List?)
            ?.map((value) => value.toString())
            .toList(growable: false) ??
        const <String>[];
    if (required.length != bookingGroupRequiredEvidenceSlots.length ||
        !required.toSet().containsAll(bookingGroupRequiredEvidenceSlots)) {
      throw const FormatException('Invalid item evidence requirements');
    }
    final completed = <String>{};
    for (final evidence in _maps(json['presenterEvidence'])) {
      final slot = _identifier(evidence['semanticSlot'], 'evidence.slot');
      if (bookingGroupRequiredEvidenceSlots.contains(slot)) completed.add(slot);
    }
    final accessories = _map(json['accessories'], 'evidence.accessories');
    return BookingGroupEvidenceSegment(
      completedPresenterSlots: Set<String>.unmodifiable(completed),
      accessoriesRequired: accessories['required'] == true,
      accessoriesEvidenceId: accessories['evidenceId']?.toString(),
      confirmed: json['counterpartyConfirmation'] is Map,
    );
  }
}

class BookingGroupHandoverItem {
  final String groupPositionId;
  final String listingId;
  final String? bookingId;
  final String bindingState;
  final String operationalState;
  final BookingGroupEvidenceSegment pickup;
  final BookingGroupEvidenceSegment returnEvidence;
  final bool needsReview;
  final String? returnState;
  final String? returnCaseId;
  final DateTime? returnT0;
  final DateTime? reportDeadline;
  final DateTime? clarificationDeadline;
  final DateTime? responseDueAt;
  final DateTime? nextStatusUpdateDueAt;
  final String? chatThreadId;

  const BookingGroupHandoverItem({
    required this.groupPositionId,
    required this.listingId,
    required this.bookingId,
    required this.bindingState,
    required this.operationalState,
    required this.pickup,
    required this.returnEvidence,
    required this.needsReview,
    this.returnState,
    this.returnCaseId,
    this.returnT0,
    this.reportDeadline,
    this.clarificationDeadline,
    this.responseDueAt,
    this.nextStatusUpdateDueAt,
    required this.chatThreadId,
  });

  factory BookingGroupHandoverItem.fromJson(Map<String, dynamic> json) {
    final damage = _map(json['damage'], 'item.damage');
    final chat = _map(json['chat'], 'item.chat');
    final timers = _map(json['timers'], 'item.timers');
    if (chat['scope'] != 'item_booking_only') {
      throw const FormatException('Invalid booking group chat scope');
    }
    return BookingGroupHandoverItem(
      groupPositionId:
          _identifier(json['groupPositionId'], 'item.groupPositionId'),
      listingId: _identifier(json['listingId'], 'item.listingId'),
      bookingId: json['bookingId']?.toString(),
      bindingState: _identifier(json['bindingState'], 'item.bindingState'),
      operationalState:
          _identifier(json['operationalState'], 'item.operationalState'),
      pickup: BookingGroupEvidenceSegment.fromJson(
        _map(json['pickup'], 'item.pickup'),
      ),
      returnEvidence: BookingGroupEvidenceSegment.fromJson(
        _map(json['return'], 'item.return'),
      ),
      needsReview: damage['needsReview'] == true,
      returnState: damage['returnState']?.toString(),
      returnCaseId: damage['returnCase'] is Map
          ? (damage['returnCase'] as Map)['id']?.toString()
          : null,
      returnT0: _optionalDateTime(timers['returnT0'], 'item.returnT0'),
      reportDeadline:
          _optionalDateTime(timers['reportDeadline'], 'item.reportDeadline'),
      clarificationDeadline: _optionalDateTime(
        timers['clarificationDeadline'],
        'item.clarificationDeadline',
      ),
      responseDueAt:
          _optionalDateTime(timers['responseDueAt'], 'item.responseDueAt'),
      nextStatusUpdateDueAt: _optionalDateTime(
        timers['nextStatusUpdateDueAt'],
        'item.nextStatusUpdateDueAt',
      ),
      chatThreadId: chat['threadId']?.toString(),
    );
  }
}

class BookingGroupHandover {
  final String bookingGroupId;
  final String operationalState;
  final bool systemRiskHold;
  final List<BookingGroupAppointment> sharedAppointments;
  final List<BookingGroupHandoverItem> items;

  const BookingGroupHandover({
    required this.bookingGroupId,
    required this.operationalState,
    required this.systemRiskHold,
    required this.sharedAppointments,
    required this.items,
  });

  factory BookingGroupHandover.fromJson(Map<String, dynamic> json) {
    if (json['itemReviewIsolation'] != true ||
        json['groupNeedsReview'] != null) {
      throw const FormatException('Item review isolation is not guaranteed');
    }
    final appointments = _maps(json['sharedAppointments'])
        .map(BookingGroupAppointment.fromJson)
        .toList(growable: false);
    final items = _maps(json['items'])
        .map(BookingGroupHandoverItem.fromJson)
        .toList(growable: false);
    final required = _nonNegativeInteger(
      json['requiredItemCount'],
      'requiredItemCount',
    );
    if (items.length != required) {
      throw const FormatException('Incomplete booking group item projection');
    }
    return BookingGroupHandover(
      bookingGroupId:
          _identifier(json['bookingGroupId'], 'handover.bookingGroupId'),
      operationalState:
          _identifier(json['operationalState'], 'handover.operationalState'),
      systemRiskHold: json['systemRiskHold'] == true,
      sharedAppointments: appointments,
      items: items,
    );
  }
}

class RentalCartGroupCandidate {
  final String ownerId;
  final String? projectId;
  final DateTime startDate;
  final DateTime endDate;
  final String currency;
  final List<RentalCartItem> items;

  const RentalCartGroupCandidate({
    required this.ownerId,
    required this.projectId,
    required this.startDate,
    required this.endDate,
    required this.currency,
    required this.items,
  });

  List<String> get listingIds =>
      items.map((item) => item.listingId).toList(growable: false);

  static List<RentalCartGroupCandidate> fromCart(RentalCart cart) {
    final grouped = <String, List<RentalCartItem>>{};
    for (final item in cart.items) {
      final ownerId = (item.listing['ownerId'] ?? '').toString().trim();
      final currency = (item.listing['currency'] ?? '').toString().trim();
      if (ownerId.isEmpty ||
          currency.isEmpty ||
          item.quoteStatus == 'unavailable') {
        continue;
      }
      final key = <String>[
        ownerId,
        item.projectId ?? '',
        _date(item.startDate),
        _date(item.endDate),
        currency,
      ].join('|');
      grouped.putIfAbsent(key, () => <RentalCartItem>[]).add(item);
    }
    final candidates = <RentalCartGroupCandidate>[];
    for (final entries in grouped.values) {
      if (entries.length < 2 || entries.length > 20) continue;
      entries.sort((left, right) => left.sortOrder.compareTo(right.sortOrder));
      candidates.add(RentalCartGroupCandidate(
        ownerId: (entries.first.listing['ownerId'] ?? '').toString(),
        projectId: entries.first.projectId,
        startDate: entries.first.startDate,
        endDate: entries.first.endDate,
        currency: (entries.first.listing['currency'] ?? '').toString(),
        items: List<RentalCartItem>.unmodifiable(entries),
      ));
    }
    return List<RentalCartGroupCandidate>.unmodifiable(candidates);
  }
}

String bookingGroupMoney(int minor, String currency) {
  final amount = (minor / 100).toStringAsFixed(2).replaceAll('.', ',');
  return '$amount $currency';
}

Map<String, dynamic> _map(Object? value, String field) {
  if (value is! Map) throw FormatException('Invalid $field');
  return Map<String, dynamic>.from(value);
}

List<Map<String, dynamic>> _maps(Object? value) {
  if (value is! List) throw const FormatException('Invalid list');
  return value
      .map((entry) => _map(entry, 'list entry'))
      .toList(growable: false);
}

String _identifier(Object? value, String field) {
  final candidate = value?.toString().trim() ?? '';
  if (candidate.isEmpty ||
      candidate.length > 160 ||
      !RegExp(r'^[A-Za-z0-9_.:-]+$').hasMatch(candidate)) {
    throw FormatException('Invalid $field');
  }
  return candidate;
}

String _hash(Object? value, String field) {
  final candidate = value?.toString().trim().toLowerCase() ?? '';
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(candidate)) {
    throw FormatException('Invalid $field');
  }
  return candidate;
}

String _currency(Object? value) {
  final candidate = value?.toString().trim().toUpperCase() ?? '';
  if (!RegExp(r'^[A-Z]{3}$').hasMatch(candidate)) {
    throw const FormatException('Invalid currency');
  }
  return candidate;
}

String _timezone(Object? value) {
  final candidate = value?.toString().trim() ?? '';
  if (candidate.isEmpty ||
      candidate.length > 120 ||
      !RegExp(r'^[A-Za-z0-9_+.-]+(?:/[A-Za-z0-9_+.-]+)*$')
          .hasMatch(candidate)) {
    throw const FormatException('Invalid timezone');
  }
  return candidate;
}

int _minor(Object? value, String field) => _nonNegativeInteger(value, field);

int _nonNegativeInteger(Object? value, String field) {
  if (value is! num || value.toInt() != value || value < 0) {
    throw FormatException('Invalid $field');
  }
  return value.toInt();
}

int _positiveInteger(Object? value, String field) {
  final result = _nonNegativeInteger(value, field);
  if (result < 1) throw FormatException('Invalid $field');
  return result;
}

DateTime? _optionalDateTime(Object? value, String field) {
  if (value == null) return null;
  final parsed = DateTime.tryParse(value.toString());
  if (parsed == null) throw FormatException('Invalid $field');
  return parsed.toUtc();
}

String _date(DateTime value) => DateTime(value.year, value.month, value.day)
    .toIso8601String()
    .substring(0, 10);
