enum InvoiceType {
  bookingPaymentReceipt,
  sitFeeReceipt,
  ownerPayoutStatement,
  refundReceipt,
}

class Invoice {
  final String id;
  final String documentNumber;
  final String bookingId;
  final InvoiceType type;
  final String title;
  final String sourceKind;
  final String sourceId;
  final String currency;
  final int amountMinor;
  final int privateRentMinor;
  final int sitFeeMinor;
  final int ownerPayoutMinor;
  final int rentRefundMinor;
  final int sitFeeRefundMinor;
  final String supplierRole;
  final String debtorRole;
  final String taxTreatment;
  final bool testMode;
  final DateTime issuedAt;
  final String artifactSha256;
  final String downloadPath;
  final InvoiceBookingDetails booking;
  final String sitFeeTaxLabel;

  const Invoice({
    required this.id,
    required this.documentNumber,
    required this.bookingId,
    required this.type,
    required this.title,
    required this.sourceKind,
    required this.sourceId,
    required this.currency,
    required this.amountMinor,
    required this.privateRentMinor,
    required this.sitFeeMinor,
    required this.ownerPayoutMinor,
    required this.rentRefundMinor,
    required this.sitFeeRefundMinor,
    required this.supplierRole,
    required this.debtorRole,
    required this.taxTreatment,
    required this.testMode,
    required this.issuedAt,
    required this.artifactSha256,
    required this.downloadPath,
    required this.booking,
    required this.sitFeeTaxLabel,
  });

  String get invoiceNumber => documentNumber;
  String get requestId => bookingId;
  DateTime get date => issuedAt;
  DateTime get createdAt => issuedAt;
  DateTime get updatedAt => issuedAt;
  double get amount => amountMinor / 100;

  InvoicePriceBreakdown get pricing => InvoicePriceBreakdown(
        vatRate: 0,
        netAmount: privateRentMinor / 100,
        taxAmount: 0,
        totalAfterTax: amountMinor / 100,
        platformFee: sitFeeMinor / 100,
        payoutToOwner: ownerPayoutMinor / 100,
        rentRefund: rentRefundMinor / 100,
        sitFeeRefund: sitFeeRefundMinor / 100,
      );

  factory Invoice.fromJson(Map<String, dynamic> json) {
    final id = _requiredString(json['id'], 'id');
    final rawType = _requiredString(json['type'], 'type');
    final type = switch (rawType) {
      'booking_payment_receipt' => InvoiceType.bookingPaymentReceipt,
      'sit_fee_receipt' => InvoiceType.sitFeeReceipt,
      'owner_payout_statement' => InvoiceType.ownerPayoutStatement,
      'refund_receipt' => InvoiceType.refundReceipt,
      _ => throw FormatException('Unknown financial document type: $rawType'),
    };
    if (json['booking'] is! Map) {
      throw const FormatException(
          'Missing financial document booking snapshot');
    }
    final bookingJson = Map<String, dynamic>.from(json['booking'] as Map);
    final currency = _requiredString(json['currency'], 'currency');
    if (!RegExp(r'^[A-Z]{3}$').hasMatch(currency)) {
      throw const FormatException('Invalid financial document currency');
    }
    final issuedAt = DateTime.tryParse(
      _requiredString(json['issuedAt'], 'issuedAt'),
    )?.toUtc();
    if (issuedAt == null) {
      throw const FormatException('Invalid financial document issue time');
    }
    final artifactSha256 = _requiredString(
      json['artifactSha256'],
      'artifactSha256',
    );
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(artifactSha256)) {
      throw const FormatException('Invalid financial document artifact hash');
    }
    final downloadPath = _requiredString(json['downloadPath'], 'downloadPath');
    if (downloadPath !=
        '/v1/financial-documents/${Uri.encodeComponent(id)}/artifact') {
      throw const FormatException('Invalid financial document download path');
    }
    if (json['testMode'] is! bool) {
      throw const FormatException('Invalid financial document test mode');
    }
    final amountMinor = _requiredMinor(json['amountMinor'], 'amountMinor');
    final privateRentMinor =
        _requiredMinor(json['privateRentMinor'], 'privateRentMinor');
    final sitFeeMinor = _requiredMinor(json['sitFeeMinor'], 'sitFeeMinor');
    final ownerPayoutMinor =
        _requiredMinor(json['ownerPayoutMinor'], 'ownerPayoutMinor');
    final rentRefundMinor =
        _requiredMinor(json['rentRefundMinor'], 'rentRefundMinor');
    final sitFeeRefundMinor =
        _requiredMinor(json['sitFeeRefundMinor'], 'sitFeeRefundMinor');
    final sourceKind = _requiredString(json['sourceKind'], 'sourceKind');
    _validateAmounts(
      type: type,
      sourceKind: sourceKind,
      amountMinor: amountMinor,
      privateRentMinor: privateRentMinor,
      sitFeeMinor: sitFeeMinor,
      ownerPayoutMinor: ownerPayoutMinor,
      rentRefundMinor: rentRefundMinor,
      sitFeeRefundMinor: sitFeeRefundMinor,
    );
    return Invoice(
      id: id,
      documentNumber: _requiredString(json['documentNumber'], 'documentNumber'),
      bookingId: _requiredString(json['bookingId'], 'bookingId'),
      type: type,
      title: _requiredString(json['title'], 'title'),
      sourceKind: sourceKind,
      sourceId: _requiredString(json['sourceId'], 'sourceId'),
      currency: currency,
      amountMinor: amountMinor,
      privateRentMinor: privateRentMinor,
      sitFeeMinor: sitFeeMinor,
      ownerPayoutMinor: ownerPayoutMinor,
      rentRefundMinor: rentRefundMinor,
      sitFeeRefundMinor: sitFeeRefundMinor,
      supplierRole: _requiredString(json['supplierRole'], 'supplierRole'),
      debtorRole: _requiredString(json['debtorRole'], 'debtorRole'),
      taxTreatment: _requiredString(json['taxTreatment'], 'taxTreatment'),
      testMode: json['testMode'] as bool,
      issuedAt: issuedAt,
      artifactSha256: artifactSha256,
      downloadPath: downloadPath,
      booking: InvoiceBookingDetails.fromJson(bookingJson),
      sitFeeTaxLabel: _requiredString(
        json['sitFeeTaxLabel'],
        'sitFeeTaxLabel',
      ),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'documentNumber': documentNumber,
        'bookingId': bookingId,
        'type': switch (type) {
          InvoiceType.bookingPaymentReceipt => 'booking_payment_receipt',
          InvoiceType.sitFeeReceipt => 'sit_fee_receipt',
          InvoiceType.ownerPayoutStatement => 'owner_payout_statement',
          InvoiceType.refundReceipt => 'refund_receipt',
        },
        'title': title,
        'sourceKind': sourceKind,
        'sourceId': sourceId,
        'currency': currency,
        'amountMinor': amountMinor,
        'privateRentMinor': privateRentMinor,
        'sitFeeMinor': sitFeeMinor,
        'ownerPayoutMinor': ownerPayoutMinor,
        'rentRefundMinor': rentRefundMinor,
        'sitFeeRefundMinor': sitFeeRefundMinor,
        'supplierRole': supplierRole,
        'debtorRole': debtorRole,
        'taxTreatment': taxTreatment,
        'testMode': testMode,
        'issuedAt': issuedAt.toIso8601String(),
        'artifactSha256': artifactSha256,
        'downloadPath': downloadPath,
        'booking': booking.toJson(),
        'sitFeeTaxLabel': sitFeeTaxLabel,
      };
}

class InvoiceBookingDetails {
  final String itemTitle;
  final String renterName;
  final String ownerName;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final String? quoteId;
  final String? quoteHash;
  final String? contractVersion;

  const InvoiceBookingDetails({
    required this.itemTitle,
    required this.renterName,
    required this.ownerName,
    required this.startsAt,
    required this.endsAt,
    required this.quoteId,
    required this.quoteHash,
    required this.contractVersion,
  });

  int get rentalDays {
    if (startsAt == null || endsAt == null) return 1;
    return (endsAt!.difference(startsAt!).inHours / 24).ceil().clamp(1, 365);
  }

  factory InvoiceBookingDetails.fromJson(Map<String, dynamic> json) =>
      InvoiceBookingDetails(
        itemTitle: _requiredString(json['itemTitle'], 'booking.itemTitle'),
        renterName: _requiredString(json['renterName'], 'booking.renterName'),
        ownerName: _requiredString(json['ownerName'], 'booking.ownerName'),
        startsAt: _requiredDate(json['startsAt'], 'booking.startsAt'),
        endsAt: _requiredDate(json['endsAt'], 'booking.endsAt'),
        quoteId: _nullableString(json['quoteId']),
        quoteHash: _nullableString(json['quoteHash']),
        contractVersion: _nullableString(json['contractVersion']),
      );

  Map<String, dynamic> toJson() => {
        'itemTitle': itemTitle,
        'renterName': renterName,
        'ownerName': ownerName,
        'startsAt': startsAt?.toIso8601String(),
        'endsAt': endsAt?.toIso8601String(),
        'quoteId': quoteId,
        'quoteHash': quoteHash,
        'contractVersion': contractVersion,
      };
}

class InvoicePriceBreakdown {
  final double vatRate;
  final double netAmount;
  final double taxAmount;
  final double totalAfterTax;
  final double platformFee;
  final double payoutToOwner;
  final double rentRefund;
  final double sitFeeRefund;

  const InvoicePriceBreakdown({
    required this.vatRate,
    required this.netAmount,
    required this.taxAmount,
    required this.totalAfterTax,
    required this.platformFee,
    required this.payoutToOwner,
    required this.rentRefund,
    required this.sitFeeRefund,
  });
}

String _string(Object? value, {String fallback = ''}) {
  final normalized = value?.toString().trim() ?? '';
  return normalized.isEmpty ? fallback : normalized;
}

String? _nullableString(Object? value) {
  final normalized = _string(value);
  return normalized.isEmpty ? null : normalized;
}

int _requiredMinor(Object? value, String field) {
  final parsed = value is num ? value.toInt() : int.tryParse(_string(value));
  if (parsed == null || parsed < 0 || (value is num && value != parsed)) {
    throw FormatException('Invalid financial document $field');
  }
  return parsed;
}

String _requiredString(Object? value, String field) {
  final normalized = _string(value);
  if (normalized.isEmpty) {
    throw FormatException('Missing financial document $field');
  }
  return normalized;
}

DateTime _requiredDate(Object? value, String field) {
  final parsed = DateTime.tryParse(_requiredString(value, field))?.toUtc();
  if (parsed == null) {
    throw FormatException('Invalid financial document $field');
  }
  return parsed;
}

void _validateAmounts({
  required InvoiceType type,
  required String sourceKind,
  required int amountMinor,
  required int privateRentMinor,
  required int sitFeeMinor,
  required int ownerPayoutMinor,
  required int rentRefundMinor,
  required int sitFeeRefundMinor,
}) {
  final valid = switch (type) {
    InvoiceType.bookingPaymentReceipt => sourceKind == 'payment' &&
        amountMinor == privateRentMinor + sitFeeMinor &&
        ownerPayoutMinor == 0 &&
        rentRefundMinor == 0 &&
        sitFeeRefundMinor == 0,
    InvoiceType.sitFeeReceipt => sourceKind == 'payment' &&
        amountMinor == sitFeeMinor &&
        privateRentMinor == 0 &&
        ownerPayoutMinor == 0 &&
        rentRefundMinor == 0 &&
        sitFeeRefundMinor == 0,
    InvoiceType.ownerPayoutStatement => sourceKind == 'payout' &&
        amountMinor == ownerPayoutMinor &&
        privateRentMinor == 0 &&
        sitFeeMinor == 0 &&
        rentRefundMinor == 0 &&
        sitFeeRefundMinor == 0,
    InvoiceType.refundReceipt => sourceKind == 'refund' &&
        amountMinor == rentRefundMinor + sitFeeRefundMinor &&
        privateRentMinor == 0 &&
        sitFeeMinor == 0 &&
        ownerPayoutMinor == 0,
  };
  if (!valid) {
    throw const FormatException('Inconsistent financial document amounts');
  }
}
