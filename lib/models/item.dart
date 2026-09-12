class Item {
  final String id;
  final String ownerId;
  final String title;
  final String description;
  final String categoryId;
  final String subcategory;
  final List<String> tags;
  // Pricing
  final double pricePerDay; // normalized for comparisons and map
  final String currency;
  // Display helpers: what the owner originally chose and entered
  final String priceUnit; // 'day' | 'week'
  final double priceRaw; // original value typed in that unit
  // Long‑term discount configuration
  final bool autoApplyDiscounts;
  final List<LongRentalDiscount> longRentalDiscounts;
  // Media
  final List<String> photos;
  // Location
  final String locationText;
  final double lat;
  final double lng;
  final String geohash;
  // Item meta
  final String
      condition; // 'new' | 'like-new' | 'good' | 'acceptable' | 'worn' | legacy: 'used'
  final int? minDays;
  final int? maxDays;
  final DateTime createdAt;
  // Legacy: still used by some views. Mirrored from status.
  final bool isActive;
  final String verificationStatus;
  final String city;
  final String country;
  // New lifecycle fields
  final String status; // 'active' | 'paused' | 'ended' | 'draft'
  final DateTime? endedAt;
  // Engagement
  final int timesLent;
  // Legacy transport fields retained only for backward-compatible storage.
  // Remote payloads are normalized to the disabled V5.1 launch boundary.
  final bool offersDeliveryAtDropoff;
  final bool offersPickupAtReturn;
  final bool offersExpressAtDropoff;
  final double? maxDeliveryKmAtDropoff;
  final double? maxPickupKmAtReturn;
  // Cancellation policy selected by the lister: 'flexible' | 'moderate' | 'strict'
  final String cancellationPolicy;
  final String availabilityMode;
  final bool approximateLocation;
  final bool privateStatusConfirmed;
  // Server-owned optimistic-concurrency token for owner mutations.
  final int catalogRevision;

  const Item({
    required this.id,
    required this.ownerId,
    required this.title,
    required this.description,
    required this.categoryId,
    required this.subcategory,
    required this.tags,
    required this.pricePerDay,
    required this.currency,
    this.priceUnit = 'day',
    double? priceRaw,
    this.autoApplyDiscounts = false,
    this.longRentalDiscounts = const <LongRentalDiscount>[],
    required this.photos,
    required this.locationText,
    required this.lat,
    required this.lng,
    required this.geohash,
    required this.condition,
    this.minDays,
    this.maxDays,
    required this.createdAt,
    required this.isActive,
    required this.verificationStatus,
    required this.city,
    required this.country,
    this.status = 'active',
    this.endedAt,
    this.timesLent = 0,
    this.offersDeliveryAtDropoff = false,
    this.offersPickupAtReturn = false,
    this.offersExpressAtDropoff = false,
    this.maxDeliveryKmAtDropoff,
    this.maxPickupKmAtReturn,
    this.cancellationPolicy = 'flexible',
    this.availabilityMode = 'calendar',
    this.approximateLocation = false,
    this.privateStatusConfirmed = false,
    this.catalogRevision = 1,
  }) : priceRaw = priceRaw ?? pricePerDay;

  factory Item.fromJson(Map<String, dynamic> json) {
    final bool active = json['isActive'] ?? true;
    final String status = json['status'] ?? (active ? 'active' : 'paused');
    final String? endedAtStr = json['endedAt'];
    final String unit = (json['priceUnit'] as String?) ?? 'day';
    final double perDay = (json['pricePerDay'] as num).toDouble();
    final double raw = (json['priceRaw'] as num?)?.toDouble() ?? perDay;
    // Parse discounts if present; tolerate missing/legacy items
    final bool autoDisc = (json['autoApplyDiscounts'] == true);
    final List<LongRentalDiscount> tiers = [];
    try {
      final list = json['longRentalDiscounts'] as List?;
      if (list != null) {
        for (final e in list) {
          if (e is Map) {
            final days = (e['days'] as num?)?.toInt();
            final pct = (e['discountPercent'] as num?)?.toDouble();
            if (days != null && pct != null) {
              tiers.add(LongRentalDiscount(days: days, discountPercent: pct));
            }
          }
        }
      }
    } catch (_) {}
    return Item(
      id: json['id'],
      ownerId: json['ownerId'],
      title: json['title'],
      description: json['description'],
      categoryId: json['categoryId'],
      subcategory: json['subcategory'],
      tags: List<String>.from(json['tags'] ?? []),
      pricePerDay: perDay,
      currency: json['currency'] ?? 'EUR',
      priceUnit: unit,
      priceRaw: raw,
      autoApplyDiscounts: autoDisc,
      longRentalDiscounts: tiers,
      photos: List<String>.from(json['photos'] ?? []),
      locationText: json['locationText'],
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      geohash: json['geohash'],
      condition: json['condition'],
      minDays: json['minDays'],
      maxDays: json['maxDays'],
      createdAt: DateTime.parse(json['createdAt']),
      isActive: active,
      verificationStatus: json['verificationStatus'] ?? 'pending',
      city: json['city'],
      country: json['country'],
      status: status,
      endedAt: (endedAtStr is String && endedAtStr.isNotEmpty)
          ? DateTime.tryParse(endedAtStr)
          : null,
      timesLent: (json['timesLent'] as num?)?.toInt() ?? 0,
      offersDeliveryAtDropoff: false,
      offersPickupAtReturn: false,
      offersExpressAtDropoff: false,
      maxDeliveryKmAtDropoff: null,
      maxPickupKmAtReturn: null,
      cancellationPolicy: (json['cancellationPolicy'] as String?) ?? 'flexible',
      availabilityMode: (json['availabilityMode'] as String?) ?? 'calendar',
      approximateLocation: json['approximateLocation'] == true,
      privateStatusConfirmed: json['privateStatusConfirmed'] == true,
      catalogRevision: (json['catalogRevision'] as num?)?.toInt() ?? 1,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'ownerId': ownerId,
        'title': title,
        'description': description,
        'categoryId': categoryId,
        'subcategory': subcategory,
        'tags': tags,
        'pricePerDay': pricePerDay,
        'currency': currency,
        'priceUnit': priceUnit,
        'priceRaw': priceRaw,
        'autoApplyDiscounts': autoApplyDiscounts,
        'longRentalDiscounts':
            longRentalDiscounts.map((e) => e.toJson()).toList(),
        'photos': photos,
        'locationText': locationText,
        'lat': lat,
        'lng': lng,
        'geohash': geohash,
        'condition': condition,
        'minDays': minDays,
        'maxDays': maxDays,
        'createdAt': createdAt.toIso8601String(),
        'isActive': isActive,
        'verificationStatus': verificationStatus,
        'city': city,
        'country': country,
        'status': status,
        'endedAt': endedAt?.toIso8601String(),
        'timesLent': timesLent,
        'offersDeliveryAtDropoff': offersDeliveryAtDropoff,
        'offersPickupAtReturn': offersPickupAtReturn,
        'offersExpressAtDropoff': offersExpressAtDropoff,
        'maxDeliveryKmAtDropoff': maxDeliveryKmAtDropoff,
        'maxPickupKmAtReturn': maxPickupKmAtReturn,
        'cancellationPolicy': cancellationPolicy,
        'availabilityMode': availabilityMode,
        'approximateLocation': approximateLocation,
        'privateStatusConfirmed': privateStatusConfirmed,
        'catalogRevision': catalogRevision,
      };
}

/// Defines a threshold discount for long rentals.
/// If the rental duration is at least [days], apply [discountPercent] to the base rental total.
class LongRentalDiscount {
  final int days;
  final double discountPercent; // e.g., 15 => 15%
  const LongRentalDiscount({required this.days, required this.discountPercent});

  factory LongRentalDiscount.fromJson(Map<String, dynamic> json) =>
      LongRentalDiscount(
        days: (json['days'] as num).toInt(),
        discountPercent: (json['discountPercent'] as num).toDouble(),
      );

  Map<String, dynamic> toJson() => {
        'days': days,
        'discountPercent': discountPercent,
      };
}
