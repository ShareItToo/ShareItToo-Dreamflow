class RentalCartProject {
  final String id;
  final String title;
  final Map<String, dynamic> answers;
  final int sortOrder;

  const RentalCartProject({
    required this.id,
    required this.title,
    this.answers = const <String, dynamic>{},
    this.sortOrder = 0,
  });

  factory RentalCartProject.fromJson(Map<String, dynamic> json) {
    return RentalCartProject(
      id: (json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      answers: json['answers'] is Map
          ? Map<String, dynamic>.from(json['answers'] as Map)
          : const <String, dynamic>{},
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'title': title,
        'answers': answers,
        'sortOrder': sortOrder,
      };
}

class RentalCartItem {
  final String id;
  final String listingId;
  final String? projectId;
  final DateTime startDate;
  final DateTime endDate;
  final int sortOrder;
  final String quoteStatus;
  final String? quoteErrorCode;
  final DateTime? quoteRecheckedAt;
  final Map<String, dynamic>? quote;
  final Map<String, dynamic> listing;

  const RentalCartItem({
    required this.id,
    required this.listingId,
    required this.startDate,
    required this.endDate,
    this.projectId,
    this.sortOrder = 0,
    this.quoteStatus = 'needs_recheck',
    this.quoteErrorCode,
    this.quoteRecheckedAt,
    this.quote,
    this.listing = const <String, dynamic>{},
  });

  factory RentalCartItem.fromJson(Map<String, dynamic> json) {
    final startDate = DateTime.tryParse((json['startDate'] ?? '').toString());
    final endDate = DateTime.tryParse((json['endDate'] ?? '').toString());
    if (startDate == null || endDate == null || !endDate.isAfter(startDate)) {
      throw const FormatException('Invalid rental cart dates');
    }
    return RentalCartItem(
      id: (json['id'] ?? '').toString(),
      listingId: (json['listingId'] ?? '').toString(),
      projectId: (json['projectId']?.toString().trim().isNotEmpty ?? false)
          ? json['projectId'].toString()
          : null,
      startDate: startDate,
      endDate: endDate,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      quoteStatus: (json['quoteStatus'] ?? 'needs_recheck').toString(),
      quoteErrorCode: json['quoteErrorCode']?.toString(),
      quoteRecheckedAt:
          DateTime.tryParse((json['quoteRecheckedAt'] ?? '').toString()),
      quote: json['quote'] is Map
          ? Map<String, dynamic>.from(json['quote'] as Map)
          : null,
      listing: json['listing'] is Map
          ? Map<String, dynamic>.from(json['listing'] as Map)
          : const <String, dynamic>{},
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'listingId': listingId,
        'projectId': projectId,
        'startDate': _date(startDate),
        'endDate': _date(endDate),
        'sortOrder': sortOrder,
        'quoteStatus': quoteStatus,
        'quoteErrorCode': quoteErrorCode,
        'quoteRecheckedAt': quoteRecheckedAt?.toUtc().toIso8601String(),
        'quote': quote,
        'listing': listing,
      };
}

class RentalCart {
  final int schemaVersion;
  final int revision;
  final bool reservationCreated;
  final bool localDeviceOnly;
  final bool syncPending;
  final List<RentalCartProject> projects;
  final List<RentalCartItem> items;

  const RentalCart({
    this.schemaVersion = 1,
    this.revision = 0,
    this.reservationCreated = false,
    this.localDeviceOnly = false,
    this.syncPending = false,
    this.projects = const <RentalCartProject>[],
    this.items = const <RentalCartItem>[],
  });

  factory RentalCart.fromJson(
    Map<String, dynamic> json, {
    bool localDeviceOnly = false,
    bool syncPending = false,
  }) {
    return RentalCart(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
      revision: (json['revision'] as num?)?.toInt() ?? 0,
      reservationCreated: json['reservationCreated'] == true,
      localDeviceOnly: localDeviceOnly,
      syncPending: syncPending,
      projects: _maps(json['projects'])
          .map(RentalCartProject.fromJson)
          .where((project) => project.id.isNotEmpty && project.title.isNotEmpty)
          .toList(growable: false),
      items: _maps(json['items'])
          .map(RentalCartItem.fromJson)
          .where((item) => item.id.isNotEmpty && item.listingId.isNotEmpty)
          .toList(growable: false),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'schemaVersion': schemaVersion,
        'revision': revision,
        'reservationCreated': false,
        'projects': projects.map((project) => project.toJson()).toList(),
        'items': items.map((item) => item.toJson()).toList(),
      };
}

List<Map<String, dynamic>> _maps(Object? value) {
  if (value is! List) return const <Map<String, dynamic>>[];
  return value
      .whereType<Map>()
      .map((entry) => Map<String, dynamic>.from(entry))
      .toList(growable: false);
}

String _date(DateTime value) {
  final normalized = DateTime(value.year, value.month, value.day);
  return normalized.toIso8601String().substring(0, 10);
}
