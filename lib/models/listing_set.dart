enum ListingSetKind {
  sitSet('sit_set'),
  oneStopSet('one_stop_set');

  const ListingSetKind(this.wireValue);
  final String wireValue;

  static ListingSetKind parse(Object? value) {
    return values.firstWhere(
      (kind) => kind.wireValue == value,
      orElse: () => throw const FormatException('invalid_listing_set_kind'),
    );
  }
}

enum ListingSetMemberRole {
  required('required'),
  optional('optional');

  const ListingSetMemberRole(this.wireValue);
  final String wireValue;

  static ListingSetMemberRole parse(Object? value) {
    return values.firstWhere(
      (role) => role.wireValue == value,
      orElse: () => throw const FormatException('invalid_listing_set_role'),
    );
  }
}

class ListingSetOwnerMember {
  const ListingSetOwnerMember({
    required this.listingId,
    required this.role,
    required this.sortOrder,
    required this.title,
  });

  final String listingId;
  final ListingSetMemberRole role;
  final int sortOrder;
  final String title;

  factory ListingSetOwnerMember.fromJson(Map<String, dynamic> json) {
    final listingId = json['listingId']?.toString() ?? '';
    final title = json['title']?.toString() ?? '';
    final sortOrder = json['sortOrder'];
    if (listingId.isEmpty ||
        title.isEmpty ||
        sortOrder is! int ||
        sortOrder < 0 ||
        sortOrder > 11) {
      throw const FormatException('invalid_listing_set_owner_member');
    }
    return ListingSetOwnerMember(
      listingId: listingId,
      role: ListingSetMemberRole.parse(json['role']),
      sortOrder: sortOrder,
      title: title,
    );
  }
}

class ListingSetOwnerView {
  const ListingSetOwnerView({
    required this.id,
    required this.revision,
    required this.kind,
    required this.title,
    required this.status,
    required this.currency,
    required this.members,
  });

  final String id;
  final int revision;
  final ListingSetKind kind;
  final String title;
  final String status;
  final String currency;
  final List<ListingSetOwnerMember> members;

  factory ListingSetOwnerView.fromJson(Map<String, dynamic> json) {
    final rawMembers = json['members'];
    final members = rawMembers is List
        ? rawMembers
            .whereType<Map>()
            .map(
              (entry) => ListingSetOwnerMember.fromJson(
                Map<String, dynamic>.from(entry),
              ),
            )
            .toList(growable: false)
        : const <ListingSetOwnerMember>[];
    final id = json['id']?.toString() ?? '';
    final title = json['title']?.toString() ?? '';
    final revision = json['revision'];
    final status = json['status']?.toString() ?? '';
    final currency = json['currency']?.toString() ?? '';
    final membershipHash = json['membershipHash']?.toString() ?? '';
    if (json['listingSetVersion'] != 'G5B-2026-08-21.1' ||
        !RegExp(
          r'^listing_set_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(id) ||
        revision is! int ||
        revision < 1 ||
        title.trim().length < 3 ||
        title.length > 120 ||
        !const {'active', 'paused', 'ended'}.contains(status) ||
        currency != 'EUR' ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(membershipHash) ||
        rawMembers is! List ||
        members.length != rawMembers.length ||
        members.length < 2 ||
        members.length > 12 ||
        members
                .where((entry) => entry.role == ListingSetMemberRole.required)
                .length <
            2 ||
        members.map((entry) => entry.listingId).toSet().length !=
            members.length ||
        json['individualBookabilityPreserved'] != true) {
      throw const FormatException('unsafe_listing_set_owner_view');
    }
    return ListingSetOwnerView(
      id: id,
      revision: revision,
      kind: ListingSetKind.parse(json['setKind']),
      title: title,
      status: status,
      currency: currency,
      members: members,
    );
  }
}

class ListingSetItemQuote {
  const ListingSetItemQuote({
    required this.quoteHash,
    required this.availabilityRevision,
    required this.currency,
    required this.rentalSubtotalMinor,
    required this.platformFeeMinor,
    required this.totalMinor,
    required this.ownerPayoutMinor,
    required this.securityDepositMinor,
  });

  final String quoteHash;
  final int availabilityRevision;
  final String currency;
  final int rentalSubtotalMinor;
  final int platformFeeMinor;
  final int totalMinor;
  final int ownerPayoutMinor;
  final int securityDepositMinor;

  factory ListingSetItemQuote.fromJson(Map<String, dynamic> json) {
    int integer(String key) {
      final value = json[key];
      if (value is! int || value < 0) {
        throw const FormatException('invalid_listing_set_quote');
      }
      return value;
    }

    final quoteHash = json['quoteHash']?.toString() ?? '';
    final currency = json['currency']?.toString() ?? '';
    final availabilityRevision = integer('availabilityRevision');
    final rentalSubtotalMinor = integer('rentalSubtotalMinor');
    final platformFeeMinor = integer('platformFeeMinor');
    final totalMinor = integer('totalMinor');
    final ownerPayoutMinor = integer('ownerPayoutMinor');
    final securityDepositMinor = integer('securityDepositMinor');
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(quoteHash) ||
        !RegExp(r'^[A-Z]{3}$').hasMatch(currency) ||
        json['preview'] != true ||
        json['persisted'] != false ||
        securityDepositMinor != 0 ||
        rentalSubtotalMinor > ownerPayoutMinor ||
        ownerPayoutMinor + platformFeeMinor != totalMinor) {
      throw const FormatException('invalid_listing_set_quote');
    }
    return ListingSetItemQuote(
      quoteHash: quoteHash,
      availabilityRevision: availabilityRevision,
      currency: currency,
      rentalSubtotalMinor: rentalSubtotalMinor,
      platformFeeMinor: platformFeeMinor,
      totalMinor: totalMinor,
      ownerPayoutMinor: ownerPayoutMinor,
      securityDepositMinor: securityDepositMinor,
    );
  }
}

class ListingSetResolvedItem {
  const ListingSetResolvedItem({
    required this.listingId,
    required this.title,
    required this.role,
    required this.sortOrder,
    required this.quote,
  });

  final String listingId;
  final String title;
  final ListingSetMemberRole role;
  final int sortOrder;
  final ListingSetItemQuote quote;

  factory ListingSetResolvedItem.fromJson(Map<String, dynamic> json) {
    final listing =
        Map<String, dynamic>.from(json['listing'] as Map? ?? const {});
    final boundary = Map<String, dynamic>.from(
      json['itemBoundary'] as Map? ?? const {},
    );
    if (boundary['priceAllocation'] != 'item_quote' ||
        boundary['handoverReturnEvidence'] != 'v52_item_booking_evidence' ||
        boundary['damageAndNeedsReview'] != 'v52_item_booking_case' ||
        boundary['refund'] != 'v51_v52_item_booking_obligation' ||
        boundary['auditReference'] != 'item_booking_and_quote_ids') {
      throw const FormatException('invalid_listing_set_item_boundary');
    }
    final sortOrder = json['sortOrder'];
    if (sortOrder is! int || sortOrder < 0 || sortOrder > 11) {
      throw const FormatException('invalid_listing_set_sort_order');
    }
    return ListingSetResolvedItem(
      listingId: listing['id']?.toString() ?? '',
      title: listing['title']?.toString() ?? '',
      role: ListingSetMemberRole.parse(json['role']),
      sortOrder: sortOrder,
      quote: ListingSetItemQuote.fromJson(
        Map<String, dynamic>.from(json['quote'] as Map? ?? const {}),
      ),
    );
  }
}

class ListingSetResolution {
  const ListingSetResolution({
    required this.id,
    required this.revision,
    required this.kind,
    required this.title,
    required this.currency,
    required this.items,
    required this.totalMinor,
    required this.handoverCount,
    required this.unavailableOptionalCount,
  });

  final String id;
  final int revision;
  final ListingSetKind kind;
  final String title;
  final String currency;
  final List<ListingSetResolvedItem> items;
  final int totalMinor;
  final int handoverCount;
  final int unavailableOptionalCount;

  factory ListingSetResolution.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    if (rawItems is! List || rawItems.length < 2 || rawItems.length > 12) {
      throw const FormatException('invalid_listing_set_items');
    }
    final items = rawItems
        .whereType<Map>()
        .map((item) => ListingSetResolvedItem.fromJson(
              Map<String, dynamic>.from(item),
            ))
        .toList(growable: false);
    if (items.length != rawItems.length ||
        items
                .where((item) => item.role == ListingSetMemberRole.required)
                .length <
            2 ||
        items.map((item) => item.listingId).toSet().length != items.length) {
      throw const FormatException('invalid_listing_set_items');
    }
    final totals =
        Map<String, dynamic>.from(json['totals'] as Map? ?? const {});
    final ranking = Map<String, dynamic>.from(
      json['rankingBasis'] as Map? ?? const {},
    );
    final truth = Map<String, dynamic>.from(
      json['serverTruth'] as Map? ?? const {},
    );
    final currency = json['currency']?.toString() ?? '';
    final id = json['id']?.toString() ?? '';
    final title = json['title']?.toString() ?? '';
    final membershipHash = json['membershipHash']?.toString() ?? '';
    final revision = json['revision'];
    final rentalSubtotalMinor = totals['rentalSubtotalMinor'];
    final platformFeeMinor = totals['platformFeeMinor'];
    final totalMinor = totals['totalMinor'];
    final ownerPayoutMinor = totals['ownerPayoutMinor'];
    final handoverCount = ranking['handoverCount'];
    final unavailableOptionalCount = json['unavailableOptionalCount'];
    final kind = ListingSetKind.parse(json['setKind']);
    if (json['listingSetVersion'] != 'G5B-2026-08-21.1' ||
        !RegExp(
          r'^listing_set_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(id) ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(membershipHash) ||
        revision is! int ||
        revision < 1 ||
        title.trim().length < 3 ||
        title.length > 120 ||
        !RegExp(r'^[A-Z]{3}$').hasMatch(currency) ||
        rentalSubtotalMinor is! int ||
        platformFeeMinor is! int ||
        totalMinor is! int ||
        ownerPayoutMinor is! int ||
        rentalSubtotalMinor < 0 ||
        platformFeeMinor < 0 ||
        totalMinor < 0 ||
        ownerPayoutMinor < 0 ||
        totals['currency'] != currency ||
        totals['securityDepositMinor'] != 0 ||
        items.any((item) => item.quote.currency != currency) ||
        items.fold<int>(
              0,
              (sum, item) => sum + item.quote.rentalSubtotalMinor,
            ) !=
            rentalSubtotalMinor ||
        items.fold<int>(0, (sum, item) => sum + item.quote.platformFeeMinor) !=
            platformFeeMinor ||
        items.fold<int>(0, (sum, item) => sum + item.quote.totalMinor) !=
            totalMinor ||
        items.fold<int>(0, (sum, item) => sum + item.quote.ownerPayoutMinor) !=
            ownerPayoutMinor ||
        handoverCount is! int ||
        handoverCount < 1 ||
        (kind == ListingSetKind.oneStopSet && handoverCount != 1) ||
        ranking['approvedSignal'] != 'fewer_handovers' ||
        ranking['businessStatusUsed'] != false ||
        ranking['priceUsedForRanking'] != false ||
        ranking['hiddenPriceManipulationUsed'] != false ||
        unavailableOptionalCount is! int ||
        unavailableOptionalCount < 0 ||
        truth['allRequiredItemsAvailable'] != true ||
        truth['individualBookabilityPreserved'] != true ||
        truth['setDiscountApplied'] != false ||
        truth['quotePersisted'] != false ||
        truth['reservationCreated'] != false ||
        truth['bookingCreated'] != false ||
        truth['contractCreated'] != false ||
        truth['paymentCreated'] != false ||
        truth['revalidationRequiredBeforeRequest'] != true) {
      throw const FormatException('unsafe_listing_set_resolution');
    }
    return ListingSetResolution(
      id: id,
      revision: revision,
      kind: kind,
      title: title,
      currency: currency,
      items: items,
      totalMinor: totalMinor,
      handoverCount: handoverCount,
      unavailableOptionalCount: unavailableOptionalCount,
    );
  }
}

class ListingSetDiscovery {
  const ListingSetDiscovery({required this.sets});

  final List<ListingSetResolution> sets;

  factory ListingSetDiscovery.fromJson(Map<String, dynamic> json) {
    final rawSets = json['sets'];
    if (rawSets is! List ||
        rawSets.length > 25 ||
        json['unavailableSetsOmitted'] != true ||
        json['externalProviderTraffic'] != false) {
      throw const FormatException('invalid_listing_set_discovery');
    }
    final sets = rawSets.whereType<Map>().map((entry) {
      final map = Map<String, dynamic>.from(entry);
      final ranking =
          Map<String, dynamic>.from(map['ranking'] as Map? ?? const {});
      final signals = ranking['approvedSignals'];
      if (ranking['position'] is! int ||
          signals is! List ||
          signals.length != 1 ||
          signals.single != 'fewer_handovers' ||
          ranking['businessStatusUsed'] != false ||
          ranking['priceUsedForRanking'] != false ||
          ranking['hiddenPriceManipulationUsed'] != false) {
        throw const FormatException('unsafe_listing_set_ranking');
      }
      return ListingSetResolution.fromJson(map);
    }).toList(growable: false);
    if (sets.length != rawSets.length) {
      throw const FormatException('invalid_listing_set_discovery');
    }
    return ListingSetDiscovery(sets: sets);
  }
}
