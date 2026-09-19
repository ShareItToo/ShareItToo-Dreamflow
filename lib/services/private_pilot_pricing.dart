import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';

class PrivatePilotQuote {
  final int quoteVersion;
  final int days;
  final int ownerPricePerDayMinor;
  final int baseRentalMinor;
  final int discountBasisPoints;
  final String? discountId;
  final String? discountLabel;
  final String? discountFundingSource;
  final int? discountThresholdDays;
  final int discountMinor;
  final int rentalSubtotalMinor;
  final int platformFeeMinor;
  final int totalMinor;
  final String currency;

  const PrivatePilotQuote({
    this.quoteVersion = 3,
    required this.days,
    required this.ownerPricePerDayMinor,
    required this.baseRentalMinor,
    required this.discountBasisPoints,
    this.discountId,
    this.discountLabel,
    this.discountFundingSource,
    this.discountThresholdDays,
    required this.discountMinor,
    required this.rentalSubtotalMinor,
    required this.platformFeeMinor,
    required this.totalMinor,
    this.currency = 'EUR',
  });

  factory PrivatePilotQuote.fromServerJson(Map<String, dynamic> json) {
    int requiredMinor(String key) {
      final value = json[key];
      if (value is! num || value < 0 || value.toInt() != value) {
        throw FormatException('Ungültiger Serverpreis: $key');
      }
      return value.toInt();
    }

    String? optionalString(String key) {
      final value = json[key];
      if (value == null) return null;
      if (value is! String || value != value.trim()) {
        throw FormatException('Ungültiger Serverpreis: $key');
      }
      return value;
    }

    int? optionalInt(String key) {
      final value = json[key];
      if (value == null) return null;
      if (value is! num || value < 0 || value.toInt() != value) {
        throw FormatException('Ungültiger Serverpreis: $key');
      }
      return value.toInt();
    }

    final quoteVersion = requiredMinor('quoteVersion');
    final days = requiredMinor('days');
    final pricePerDayMinor = requiredMinor('pricePerDayMinor');
    final baseRentalMinor = requiredMinor('baseRentalMinor');
    final discountMinor = requiredMinor('discountMinor');
    final rentalSubtotalMinor = requiredMinor('rentalSubtotalMinor');
    final platformFeeMinor = requiredMinor('platformFeeMinor');
    final totalMinor = requiredMinor('totalMinor');
    final discountPercent = json['discountPercent'];
    if (discountPercent is! num ||
        !discountPercent.isFinite ||
        discountPercent < 0 ||
        discountPercent > 90) {
      throw const FormatException('Ungültiger Serverpreis: discountPercent');
    }
    final currency = json['currency'];
    if (currency != 'EUR') {
      throw const FormatException('Ungültiger Serverpreis: currency');
    }
    if (quoteVersion != 3) {
      throw const FormatException('Ungültiger Serverpreis: quoteVersion');
    }
    if (days < 1 || days > 365) {
      throw const FormatException('Ungültiger Serverpreis: days');
    }
    final discountBasisPoints = (discountPercent * 100).round();
    final discountId = optionalString('discountId');
    final discountLabel = optionalString('discountLabel');
    final discountFundingSource = optionalString('discountFundingSource');
    final discountThresholdDays = optionalInt('discountThresholdDays');
    final hasBoundDiscount = discountBasisPoints > 0;
    final validDiscountMetadata = hasBoundDiscount
        ? discountId != null &&
            RegExp(r'^listing_long_rental_[0-9]+d_[0-9]+bp$')
                .hasMatch(discountId) &&
            discountId ==
                'listing_long_rental_${discountThresholdDays}d_${discountBasisPoints}bp' &&
            discountLabel != null &&
            discountLabel.isNotEmpty &&
            discountLabel.length <= 160 &&
            discountFundingSource == 'owner' &&
            discountThresholdDays != null &&
            discountThresholdDays >= 2 &&
            discountThresholdDays <= days
        : discountBasisPoints == 0 &&
            discountId == null &&
            discountLabel == null &&
            discountFundingSource == null &&
            discountThresholdDays == null;
    if (!validDiscountMetadata) {
      throw const FormatException(
        'Ungültiger Serverpreis: Rabattbindung',
      );
    }
    if (pricePerDayMinor * days != baseRentalMinor ||
        PrivatePilotPricing.percentageMinor(
              baseRentalMinor,
              discountBasisPoints,
            ) !=
            discountMinor ||
        baseRentalMinor - discountMinor != rentalSubtotalMinor ||
        PrivatePilotPricing.platformFeeMinor(rentalSubtotalMinor) !=
            platformFeeMinor ||
        rentalSubtotalMinor + platformFeeMinor != totalMinor) {
      throw const FormatException(
        'Ungültiger Serverpreis: inkonsistente Summen',
      );
    }
    return PrivatePilotQuote(
      quoteVersion: quoteVersion,
      days: days,
      ownerPricePerDayMinor: pricePerDayMinor,
      baseRentalMinor: baseRentalMinor,
      discountBasisPoints: discountBasisPoints,
      discountId: discountId,
      discountLabel: discountLabel,
      discountFundingSource: discountFundingSource,
      discountThresholdDays: discountThresholdDays,
      discountMinor: discountMinor,
      rentalSubtotalMinor: rentalSubtotalMinor,
      platformFeeMinor: platformFeeMinor,
      totalMinor: totalMinor,
      currency: currency,
    );
  }

  factory PrivatePilotQuote.fromRentalRequestSnapshot(
    RentalRequest request,
  ) {
    final quote = PrivatePilotQuote.fromServerJson({
      'quoteVersion': request.quotedQuoteVersion,
      'days': request.quotedDays,
      'pricePerDayMinor': request.quotedPricePerDayMinor,
      'baseRentalMinor': request.quotedBaseRentalMinor,
      'discountPercent': request.quotedDiscountPercent,
      'discountId': request.quotedDiscountId,
      'discountLabel': request.quotedDiscountLabel,
      'discountFundingSource': request.quotedDiscountFundingSource,
      'discountThresholdDays': request.quotedDiscountThresholdDays,
      'discountMinor': request.quotedDiscountMinor,
      'rentalSubtotalMinor': request.quotedRentalSubtotalMinor,
      'platformFeeMinor': request.quotedPlatformFeeMinor,
      'totalMinor': request.quotedTotalMinor,
      'currency': request.quotedCurrency,
    });
    if (request.quotedOwnerPayoutMinor != quote.rentalSubtotalMinor) {
      throw const FormatException(
        'Ungültiger Serverpreis: ownerPayoutMinor',
      );
    }
    return quote;
  }
}

class PrivatePilotPricing {
  PrivatePilotPricing._();

  static int eurosToMinor(double value) {
    if (!value.isFinite || value <= 0) return 0;
    return (value * 100).round();
  }

  static double minorToEuros(int value) => value / 100;

  /// Positive monetary amounts use integer half-up rounding to the nearest
  /// cent. This is the single rounding rule for the pilot.
  static int percentageMinor(int amountMinor, int basisPoints) {
    if (amountMinor <= 0 || basisPoints <= 0) return 0;
    return ((amountMinor * basisPoints) + 5000) ~/ 10000;
  }

  static int platformFeeMinor(int discountedRentalMinor) => percentageMinor(
        discountedRentalMinor,
        PrivatePilotConfig.platformFeeBasisPoints,
      );

  static int customerUnitPriceMinor(double ownerUnitPrice) {
    final ownerMinor = eurosToMinor(ownerUnitPrice);
    return ownerMinor + platformFeeMinor(ownerMinor);
  }

  static _DiscountSelection? _discountFor(Item item, int days) {
    if (!item.autoApplyDiscounts || days < 1) return null;
    _DiscountSelection? best;
    final tiers = item.longRentalDiscounts.toList()
      ..sort((left, right) => left.days.compareTo(right.days));
    for (final tier in tiers) {
      if (tier.days > days) continue;
      final candidate =
          (tier.discountPercent * 100).round().clamp(0, 9000).toInt();
      if (candidate > 0 && (best == null || candidate > best.basisPoints)) {
        best = _DiscountSelection(
          thresholdDays: tier.days,
          basisPoints: candidate,
        );
      }
    }
    return best;
  }

  static int discountBasisPointsFor(Item item, int days) =>
      _discountFor(item, days)?.basisPoints ?? 0;

  static String _formatDiscountPercent(int basisPoints) {
    final whole = basisPoints ~/ 100;
    final fraction = basisPoints % 100;
    if (fraction == 0) return '$whole';
    return '$whole,${fraction.toString().padLeft(2, '0').replaceFirst(RegExp(r'0+$'), '')}';
  }

  static PrivatePilotQuote quoteForItem({
    required Item item,
    required int days,
  }) {
    final safeDays = days.clamp(1, 365).toInt();
    final ownerDailyMinor = eurosToMinor(item.pricePerDay);
    final baseMinor = ownerDailyMinor * safeDays;
    final discount = _discountFor(item, safeDays);
    final discountBasisPoints = discount?.basisPoints ?? 0;
    final discountMinor = percentageMinor(baseMinor, discountBasisPoints)
        .clamp(0, baseMinor)
        .toInt();
    final rentalSubtotalMinor = baseMinor - discountMinor;
    final feeMinor = platformFeeMinor(rentalSubtotalMinor);
    return PrivatePilotQuote(
      quoteVersion: 3,
      days: safeDays,
      ownerPricePerDayMinor: ownerDailyMinor,
      baseRentalMinor: baseMinor,
      discountBasisPoints: discountBasisPoints,
      discountId: discount == null
          ? null
          : 'listing_long_rental_${discount.thresholdDays}d_${discount.basisPoints}bp',
      discountLabel: discount == null
          ? null
          : 'Rabatt ab ${discount.thresholdDays} Tagen (${_formatDiscountPercent(discount.basisPoints)} %)',
      discountFundingSource: discount == null ? null : 'owner',
      discountThresholdDays: discount?.thresholdDays,
      discountMinor: discountMinor,
      rentalSubtotalMinor: rentalSubtotalMinor,
      platformFeeMinor: feeMinor,
      totalMinor: rentalSubtotalMinor + feeMinor,
      currency: item.currency,
    );
  }

  static String formatMinor(int value, {String currency = 'EUR'}) {
    final euros = (value / 100).toStringAsFixed(2).replaceAll('.', ',');
    return '$euros ${currency == 'EUR' ? '€' : currency}';
  }
}

class _DiscountSelection {
  final int thresholdDays;
  final int basisPoints;

  const _DiscountSelection({
    required this.thresholdDays,
    required this.basisPoints,
  });
}
