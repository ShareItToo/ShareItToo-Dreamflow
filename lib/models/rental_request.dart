class RentalRequest {
  final String id;
  final String itemId;
  final String ownerId; // item owner
  final String renterId; // user who requests to rent
  final DateTime start;
  final DateTime end;
  final String startDate;
  final String endDate;
  final String
      status; // 'pending' | 'accepted' | 'declined' | 'running' | 'completed'
  final String? message;
  // Who cancelled the request when status == 'cancelled'.
  // Values: 'renter' | 'owner'. Null when not cancelled or legacy data.
  final String? cancelledBy;
  // Legacy transport fields retained for backward-compatible storage only.
  // Remote payloads are normalized to the disabled V5.1 launch boundary.
  final bool expressRequested;
  final String? expressStatus;
  final double expressFee;
  final bool ownerDeliversAtDropoffChosen;
  final bool ownerPicksUpAtReturnChosen;
  // Optional address snapshots used for pricing and later coordination.
  final String? deliveryAddressLine;
  final String? deliveryCity;
  final double? deliveryLat;
  final double? deliveryLng;
  final String? returnAddressLine;
  final String? returnCity;
  final double? returnLat;
  final double? returnLng;
  // Timestamps
  final DateTime createdAt; // when the request was created
  final DateTime? bindingExpiresAt; // last instant at which owner may accept
  final DateTime? acceptedAt; // when the booking contract was confirmed
  final DateTime? expressRequestedAt; // when renter opted for express
  final DateTime? expressConfirmedAt; // when owner confirmed express
  final bool needsReview;
  final String? reviewReason;
  final String? reviewSource;
  final DateTime? reviewRequestedAt;
  final List<String> reviewEvidenceReferences;
  final Map<String, dynamic>? handoverConfirmation;
  final Map<String, dynamic>? returnConfirmation;
  // Snapshot of renter-facing total and subtitle at booking time to keep UI constant
  final double?
      quotedTotalRenter; // what the renter saw as Gesamtbetrag at request time
  final String?
      quotedSubtitle; // the small info line under Gesamtbetrag at request time
  final bool privateStatusConfirmed;
  final bool simulationOnly;
  final int? quotedQuoteVersion;
  final int? quotedDays;
  final int? quotedPricePerDayMinor;
  final int? quotedBaseRentalMinor;
  final double? quotedDiscountPercent;
  final String? quotedDiscountId;
  final String? quotedDiscountLabel;
  final String? quotedDiscountFundingSource;
  final int? quotedDiscountThresholdDays;
  final int? quotedDiscountMinor;
  final int? quotedRentalSubtotalMinor;
  final int? quotedPlatformFeeMinor;
  final int? quotedTotalMinor;
  final int? quotedOwnerPayoutMinor;
  final String? quotedCurrency;
  final List<Map<String, dynamic>> legalDeclarations;
  final Map<String, dynamic>? platformContract;
  final String returnState;
  final DateTime? returnT0;
  final DateTime? returnReportDeadline;
  final DateTime? returnClarificationDeadline;
  final DateTime? returnCaseOpenedAt;
  final DateTime? returnCaseClosedAt;
  final int contestedAuthorizedMinor;
  final int allegedDamageMinorRecordedOnly;
  final Map<String, dynamic>? cancellationOutcome;
  final String? workflowStatus;
  final Map<String, dynamic>? platformWithdrawal;
  final Map<String, dynamic>? listingSnapshot;

  RentalRequest({
    required this.id,
    required this.itemId,
    required this.ownerId,
    required this.renterId,
    required this.start,
    required this.end,
    String? startDate,
    String? endDate,
    this.status = 'pending',
    this.message,
    this.cancelledBy,
    this.expressRequested = false,
    this.expressStatus,
    this.expressFee = 5.0,
    this.ownerDeliversAtDropoffChosen = false,
    this.ownerPicksUpAtReturnChosen = false,
    this.deliveryAddressLine,
    this.deliveryCity,
    this.deliveryLat,
    this.deliveryLng,
    this.returnAddressLine,
    this.returnCity,
    this.returnLat,
    this.returnLng,
    DateTime? createdAt,
    this.bindingExpiresAt,
    this.acceptedAt,
    this.expressRequestedAt,
    this.expressConfirmedAt,
    this.needsReview = false,
    this.reviewReason,
    this.reviewSource,
    this.reviewRequestedAt,
    this.reviewEvidenceReferences = const [],
    this.handoverConfirmation,
    this.returnConfirmation,
    this.quotedTotalRenter,
    this.quotedSubtitle,
    this.privateStatusConfirmed = false,
    this.simulationOnly = false,
    this.quotedQuoteVersion,
    this.quotedDays,
    this.quotedPricePerDayMinor,
    this.quotedBaseRentalMinor,
    this.quotedDiscountPercent,
    this.quotedDiscountId,
    this.quotedDiscountLabel,
    this.quotedDiscountFundingSource,
    this.quotedDiscountThresholdDays,
    this.quotedDiscountMinor,
    this.quotedRentalSubtotalMinor,
    this.quotedPlatformFeeMinor,
    this.quotedTotalMinor,
    this.quotedOwnerPayoutMinor,
    this.quotedCurrency,
    this.legalDeclarations = const [],
    this.platformContract,
    this.returnState = 'not_started',
    this.returnT0,
    this.returnReportDeadline,
    this.returnClarificationDeadline,
    this.returnCaseOpenedAt,
    this.returnCaseClosedAt,
    this.contestedAuthorizedMinor = 0,
    this.allegedDamageMinorRecordedOnly = 0,
    this.cancellationOutcome,
    this.workflowStatus,
    this.platformWithdrawal,
    this.listingSnapshot,
  })  : startDate = startDate ?? _dateOnly(start.toLocal()),
        endDate = endDate ?? _dateOnly(end.toLocal()),
        createdAt = createdAt ?? DateTime.now();

  RentalRequest copyWith({
    DateTime? start,
    DateTime? end,
    String? startDate,
    String? endDate,
    String? status,
    String? cancelledBy,
    bool? expressRequested,
    String? expressStatus,
    double? expressFee,
    DateTime? expressConfirmedAt,
    DateTime? expressRequestedAt,
    DateTime? bindingExpiresAt,
    DateTime? acceptedAt,
    bool? needsReview,
    String? reviewReason,
    String? reviewSource,
    DateTime? reviewRequestedAt,
    List<String>? reviewEvidenceReferences,
    Map<String, dynamic>? handoverConfirmation,
    Map<String, dynamic>? returnConfirmation,
    bool? ownerDeliversAtDropoffChosen,
    bool? ownerPicksUpAtReturnChosen,
    String? deliveryAddressLine,
    String? deliveryCity,
    double? deliveryLat,
    double? deliveryLng,
    String? returnAddressLine,
    String? returnCity,
    double? returnLat,
    double? returnLng,
    double? quotedTotalRenter,
    String? quotedSubtitle,
    bool? privateStatusConfirmed,
    bool? simulationOnly,
    int? quotedQuoteVersion,
    int? quotedDays,
    int? quotedPricePerDayMinor,
    int? quotedBaseRentalMinor,
    double? quotedDiscountPercent,
    String? quotedDiscountId,
    String? quotedDiscountLabel,
    String? quotedDiscountFundingSource,
    int? quotedDiscountThresholdDays,
    int? quotedDiscountMinor,
    int? quotedRentalSubtotalMinor,
    int? quotedPlatformFeeMinor,
    int? quotedTotalMinor,
    int? quotedOwnerPayoutMinor,
    String? quotedCurrency,
    List<Map<String, dynamic>>? legalDeclarations,
    Map<String, dynamic>? platformContract,
    String? returnState,
    DateTime? returnT0,
    DateTime? returnReportDeadline,
    DateTime? returnClarificationDeadline,
    DateTime? returnCaseOpenedAt,
    DateTime? returnCaseClosedAt,
    int? contestedAuthorizedMinor,
    int? allegedDamageMinorRecordedOnly,
    Map<String, dynamic>? cancellationOutcome,
    String? workflowStatus,
    Map<String, dynamic>? platformWithdrawal,
    Map<String, dynamic>? listingSnapshot,
  }) =>
      RentalRequest(
        id: id,
        itemId: itemId,
        ownerId: ownerId,
        renterId: renterId,
        start: start ?? this.start,
        end: end ?? this.end,
        startDate: startDate ?? (start == null ? this.startDate : null),
        endDate: endDate ?? (end == null ? this.endDate : null),
        status: status ?? this.status,
        message: message,
        cancelledBy: cancelledBy ?? this.cancelledBy,
        expressRequested: expressRequested ?? this.expressRequested,
        expressStatus: expressStatus ?? this.expressStatus,
        expressFee: expressFee ?? this.expressFee,
        createdAt: createdAt,
        bindingExpiresAt: bindingExpiresAt ?? this.bindingExpiresAt,
        acceptedAt: acceptedAt ?? this.acceptedAt,
        expressRequestedAt: expressRequestedAt ?? this.expressRequestedAt,
        expressConfirmedAt: expressConfirmedAt ?? this.expressConfirmedAt,
        needsReview: needsReview ?? this.needsReview,
        reviewReason: reviewReason ?? this.reviewReason,
        reviewSource: reviewSource ?? this.reviewSource,
        reviewRequestedAt: reviewRequestedAt ?? this.reviewRequestedAt,
        reviewEvidenceReferences:
            reviewEvidenceReferences ?? this.reviewEvidenceReferences,
        handoverConfirmation: handoverConfirmation ?? this.handoverConfirmation,
        returnConfirmation: returnConfirmation ?? this.returnConfirmation,
        ownerDeliversAtDropoffChosen:
            ownerDeliversAtDropoffChosen ?? this.ownerDeliversAtDropoffChosen,
        ownerPicksUpAtReturnChosen:
            ownerPicksUpAtReturnChosen ?? this.ownerPicksUpAtReturnChosen,
        deliveryAddressLine: deliveryAddressLine ?? this.deliveryAddressLine,
        deliveryCity: deliveryCity ?? this.deliveryCity,
        deliveryLat: deliveryLat ?? this.deliveryLat,
        deliveryLng: deliveryLng ?? this.deliveryLng,
        returnAddressLine: returnAddressLine ?? this.returnAddressLine,
        returnCity: returnCity ?? this.returnCity,
        returnLat: returnLat ?? this.returnLat,
        returnLng: returnLng ?? this.returnLng,
        quotedTotalRenter: quotedTotalRenter ?? this.quotedTotalRenter,
        quotedSubtitle: quotedSubtitle ?? this.quotedSubtitle,
        privateStatusConfirmed:
            privateStatusConfirmed ?? this.privateStatusConfirmed,
        simulationOnly: simulationOnly ?? this.simulationOnly,
        quotedQuoteVersion: quotedQuoteVersion ?? this.quotedQuoteVersion,
        quotedDays: quotedDays ?? this.quotedDays,
        quotedPricePerDayMinor:
            quotedPricePerDayMinor ?? this.quotedPricePerDayMinor,
        quotedBaseRentalMinor:
            quotedBaseRentalMinor ?? this.quotedBaseRentalMinor,
        quotedDiscountPercent:
            quotedDiscountPercent ?? this.quotedDiscountPercent,
        quotedDiscountId: quotedDiscountId ?? this.quotedDiscountId,
        quotedDiscountLabel: quotedDiscountLabel ?? this.quotedDiscountLabel,
        quotedDiscountFundingSource:
            quotedDiscountFundingSource ?? this.quotedDiscountFundingSource,
        quotedDiscountThresholdDays:
            quotedDiscountThresholdDays ?? this.quotedDiscountThresholdDays,
        quotedDiscountMinor: quotedDiscountMinor ?? this.quotedDiscountMinor,
        quotedRentalSubtotalMinor:
            quotedRentalSubtotalMinor ?? this.quotedRentalSubtotalMinor,
        quotedPlatformFeeMinor:
            quotedPlatformFeeMinor ?? this.quotedPlatformFeeMinor,
        quotedTotalMinor: quotedTotalMinor ?? this.quotedTotalMinor,
        quotedOwnerPayoutMinor:
            quotedOwnerPayoutMinor ?? this.quotedOwnerPayoutMinor,
        quotedCurrency: quotedCurrency ?? this.quotedCurrency,
        legalDeclarations: legalDeclarations ?? this.legalDeclarations,
        platformContract: platformContract ?? this.platformContract,
        returnState: returnState ?? this.returnState,
        returnT0: returnT0 ?? this.returnT0,
        returnReportDeadline: returnReportDeadline ?? this.returnReportDeadline,
        returnClarificationDeadline:
            returnClarificationDeadline ?? this.returnClarificationDeadline,
        returnCaseOpenedAt: returnCaseOpenedAt ?? this.returnCaseOpenedAt,
        returnCaseClosedAt: returnCaseClosedAt ?? this.returnCaseClosedAt,
        contestedAuthorizedMinor:
            contestedAuthorizedMinor ?? this.contestedAuthorizedMinor,
        allegedDamageMinorRecordedOnly: allegedDamageMinorRecordedOnly ??
            this.allegedDamageMinorRecordedOnly,
        cancellationOutcome: cancellationOutcome ?? this.cancellationOutcome,
        workflowStatus: workflowStatus ?? this.workflowStatus,
        platformWithdrawal: platformWithdrawal ?? this.platformWithdrawal,
        listingSnapshot: listingSnapshot ?? this.listingSnapshot,
      );

  factory RentalRequest.fromJson(Map<String, dynamic> json) {
    final quote = json['quote'] is Map
        ? Map<String, dynamic>.from(json['quote'] as Map)
        : const <String, dynamic>{};
    return RentalRequest(
      id: json['id'] as String,
      itemId: json['itemId'] as String,
      ownerId: json['ownerId'] as String,
      renterId: json['renterId'] as String,
      start: DateTime.parse(json['start'] as String),
      end: DateTime.parse(json['end'] as String),
      startDate: json['startDate'] as String?,
      endDate: json['endDate'] as String?,
      status: (json['status'] as String?) ?? 'pending',
      message: json['message'] as String?,
      cancelledBy: json['cancelledBy'] as String?,
      expressRequested: false,
      expressStatus: null,
      expressFee: 0,
      ownerDeliversAtDropoffChosen: false,
      ownerPicksUpAtReturnChosen: false,
      deliveryAddressLine: json['deliveryAddressLine'] as String?,
      deliveryCity: json['deliveryCity'] as String?,
      deliveryLat: (json['deliveryLat'] as num?)?.toDouble(),
      deliveryLng: (json['deliveryLng'] as num?)?.toDouble(),
      returnAddressLine: json['returnAddressLine'] as String?,
      returnCity: json['returnCity'] as String?,
      returnLat: (json['returnLat'] as num?)?.toDouble(),
      returnLng: (json['returnLng'] as num?)?.toDouble(),
      createdAt: _parseDt(json['createdAt']) ?? DateTime.now(),
      bindingExpiresAt: _parseDt(json['bindingExpiresAt']),
      acceptedAt: _parseDt(json['acceptedAt']),
      expressRequestedAt: null,
      expressConfirmedAt: null,
      needsReview: (json['needsReview'] as bool?) ?? false,
      reviewReason: json['reviewReason'] as String?,
      reviewSource: json['reviewSource'] as String?,
      reviewRequestedAt: _parseDt(json['reviewRequestedAt']),
      reviewEvidenceReferences: (json['reviewEvidenceReferences'] as List?)
              ?.map((entry) => entry.toString())
              .where((entry) => entry.trim().isNotEmpty)
              .toList(growable: false) ??
          const [],
      handoverConfirmation: _parseMap(json['handoverConfirmation']),
      returnConfirmation: _parseMap(json['returnConfirmation']),
      quotedTotalRenter: (json['quotedTotalRenter'] as num?)?.toDouble(),
      quotedSubtitle: json['quotedSubtitle'] as String?,
      privateStatusConfirmed: json['privateStatusConfirmed'] == true,
      simulationOnly: json['simulationOnly'] == true,
      quotedQuoteVersion: (quote['quoteVersion'] as num?)?.toInt() ??
          (json['quotedQuoteVersion'] as num?)?.toInt(),
      quotedDays: (quote['days'] as num?)?.toInt() ??
          (json['quotedDays'] as num?)?.toInt(),
      quotedPricePerDayMinor: (quote['pricePerDayMinor'] as num?)?.toInt() ??
          (json['quotedPricePerDayMinor'] as num?)?.toInt(),
      quotedBaseRentalMinor: (quote['baseRentalMinor'] as num?)?.toInt() ??
          (json['quotedBaseRentalMinor'] as num?)?.toInt(),
      quotedDiscountPercent: (quote['discountPercent'] as num?)?.toDouble() ??
          (json['quotedDiscountPercent'] as num?)?.toDouble(),
      quotedDiscountId:
          quote['discountId'] as String? ?? json['quotedDiscountId'] as String?,
      quotedDiscountLabel: quote['discountLabel'] as String? ??
          json['quotedDiscountLabel'] as String?,
      quotedDiscountFundingSource: quote['discountFundingSource'] as String? ??
          json['quotedDiscountFundingSource'] as String?,
      quotedDiscountThresholdDays:
          (quote['discountThresholdDays'] as num?)?.toInt() ??
              (json['quotedDiscountThresholdDays'] as num?)?.toInt(),
      quotedDiscountMinor: (quote['discountMinor'] as num?)?.toInt() ??
          (json['quotedDiscountMinor'] as num?)?.toInt(),
      quotedRentalSubtotalMinor:
          (quote['rentalSubtotalMinor'] as num?)?.toInt() ??
              (json['quotedRentalSubtotalMinor'] as num?)?.toInt(),
      quotedPlatformFeeMinor: (quote['platformFeeMinor'] as num?)?.toInt() ??
          (json['quotedPlatformFeeMinor'] as num?)?.toInt(),
      quotedTotalMinor: (quote['totalMinor'] as num?)?.toInt() ??
          (json['quotedTotalMinor'] as num?)?.toInt(),
      quotedOwnerPayoutMinor: (quote['ownerPayoutMinor'] as num?)?.toInt() ??
          (json['quotedOwnerPayoutMinor'] as num?)?.toInt(),
      quotedCurrency:
          quote['currency'] as String? ?? json['quotedCurrency'] as String?,
      legalDeclarations: _parseMapList(json['legalDeclarations']),
      platformContract: _parseMap(json['platformContract']),
      returnState: (json['returnState'] as String?) ?? 'not_started',
      returnT0: _parseDt(json['returnT0']),
      returnReportDeadline: _parseDt(json['returnReportDeadline']),
      returnClarificationDeadline:
          _parseDt(json['returnClarificationDeadline']),
      returnCaseOpenedAt: _parseDt(json['returnCaseOpenedAt']),
      returnCaseClosedAt: _parseDt(json['returnCaseClosedAt']),
      contestedAuthorizedMinor:
          (json['contestedAuthorizedMinor'] as num?)?.toInt() ?? 0,
      allegedDamageMinorRecordedOnly:
          (json['allegedDamageMinorRecordedOnly'] as num?)?.toInt() ?? 0,
      cancellationOutcome: _parseMap(json['cancellationOutcome']),
      workflowStatus: json['workflowStatus'] as String?,
      platformWithdrawal: _parseMap(json['platformWithdrawal']),
      listingSnapshot: _parseMap(json['listingSnapshot']),
    );
  }

  String flowTimeDate({required bool isReturn}) =>
      isReturn ? endDate : startDate;

  DateTime flowTimeAt({
    required bool isReturn,
    required int hour,
    required int minute,
  }) {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw ArgumentError('Ungültige Uhrzeit.');
    }
    final raw = flowTimeDate(isReturn: isReturn);
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(raw);
    if (match == null) throw const FormatException('Ungültiger Miettag.');
    final value = DateTime(
      int.parse(match.group(1)!),
      int.parse(match.group(2)!),
      int.parse(match.group(3)!),
      hour,
      minute,
    );
    if (_dateOnly(value) != raw) {
      throw const FormatException('Ungültiger Miettag.');
    }
    return value;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'itemId': itemId,
        'ownerId': ownerId,
        'renterId': renterId,
        'start': start.toIso8601String(),
        'end': end.toIso8601String(),
        'startDate': startDate,
        'endDate': endDate,
        'status': status,
        'message': message,
        'cancelledBy': cancelledBy,
        'expressRequested': expressRequested,
        'expressStatus': expressStatus,
        'expressFee': expressFee,
        'ownerDeliversAtDropoffChosen': ownerDeliversAtDropoffChosen,
        'ownerPicksUpAtReturnChosen': ownerPicksUpAtReturnChosen,
        'deliveryAddressLine': deliveryAddressLine,
        'deliveryCity': deliveryCity,
        'deliveryLat': deliveryLat,
        'deliveryLng': deliveryLng,
        'returnAddressLine': returnAddressLine,
        'returnCity': returnCity,
        'returnLat': returnLat,
        'returnLng': returnLng,
        'createdAt': createdAt.toIso8601String(),
        'bindingExpiresAt': bindingExpiresAt?.toIso8601String(),
        'acceptedAt': acceptedAt?.toIso8601String(),
        'expressRequestedAt': expressRequestedAt?.toIso8601String(),
        'expressConfirmedAt': expressConfirmedAt?.toIso8601String(),
        'needsReview': needsReview,
        'reviewReason': reviewReason,
        'reviewSource': reviewSource,
        'reviewRequestedAt': reviewRequestedAt?.toIso8601String(),
        'reviewEvidenceReferences': reviewEvidenceReferences,
        'handoverConfirmation': handoverConfirmation,
        'returnConfirmation': returnConfirmation,
        'quotedTotalRenter': quotedTotalRenter,
        'quotedSubtitle': quotedSubtitle,
        'privateStatusConfirmed': privateStatusConfirmed,
        'simulationOnly': simulationOnly,
        'quotedQuoteVersion': quotedQuoteVersion,
        'quotedDays': quotedDays,
        'quotedPricePerDayMinor': quotedPricePerDayMinor,
        'quotedBaseRentalMinor': quotedBaseRentalMinor,
        'quotedDiscountPercent': quotedDiscountPercent,
        'quotedDiscountId': quotedDiscountId,
        'quotedDiscountLabel': quotedDiscountLabel,
        'quotedDiscountFundingSource': quotedDiscountFundingSource,
        'quotedDiscountThresholdDays': quotedDiscountThresholdDays,
        'quotedDiscountMinor': quotedDiscountMinor,
        'quotedRentalSubtotalMinor': quotedRentalSubtotalMinor,
        'quotedPlatformFeeMinor': quotedPlatformFeeMinor,
        'quotedTotalMinor': quotedTotalMinor,
        'quotedOwnerPayoutMinor': quotedOwnerPayoutMinor,
        'quotedCurrency': quotedCurrency,
        'legalDeclarations': legalDeclarations,
        'platformContract': platformContract,
        'returnState': returnState,
        'returnT0': returnT0?.toIso8601String(),
        'returnReportDeadline': returnReportDeadline?.toIso8601String(),
        'returnClarificationDeadline':
            returnClarificationDeadline?.toIso8601String(),
        'returnCaseOpenedAt': returnCaseOpenedAt?.toIso8601String(),
        'returnCaseClosedAt': returnCaseClosedAt?.toIso8601String(),
        'contestedAuthorizedMinor': contestedAuthorizedMinor,
        'allegedDamageMinorRecordedOnly': allegedDamageMinorRecordedOnly,
        'cancellationOutcome': cancellationOutcome,
        'workflowStatus': workflowStatus,
        'platformWithdrawal': platformWithdrawal,
        'listingSnapshot': listingSnapshot,
      };
}

String _dateOnly(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

DateTime? _parseDt(Object? v) {
  if (v is String && v.isNotEmpty) {
    try {
      return DateTime.parse(v);
    } catch (_) {
      return null;
    }
  }
  return null;
}

Map<String, dynamic>? _parseMap(Object? v) {
  if (v is Map) {
    return v.map((k, val) => MapEntry(k.toString(), val));
  }
  return null;
}

List<Map<String, dynamic>> _parseMapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((entry) => entry.map((key, val) => MapEntry(key.toString(), val)))
      .toList(growable: false);
}
