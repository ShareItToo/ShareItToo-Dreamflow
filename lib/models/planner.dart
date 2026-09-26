import 'package:lendify/models/rental_cart.dart';

const _plannerCoreVersion = 'G4A-2026-08-21.1';
const _plannerInventoryVersion = 'G4B-2026-08-21.1';

class PlannerQuestion {
  const PlannerQuestion({
    required this.id,
    required this.prompt,
    required this.options,
  });

  final String id;
  final String prompt;
  final List<String> options;

  factory PlannerQuestion.fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final prompt = json['prompt']?.toString() ?? '';
    final rawOptions = json['options'];
    final options = rawOptions is List
        ? rawOptions.whereType<String>().toList(growable: false)
        : const <String>[];
    if (!RegExp(r'^[a-z][a-z0-9_]{2,39}$').hasMatch(id) ||
        prompt.length < 8 ||
        json['type'] != 'single_choice' ||
        options.length < 2 ||
        options.length > 8 ||
        options.toSet().length != options.length ||
        options.any(
          (entry) => !RegExp(r'^[a-z][a-z0-9_]{1,39}$').hasMatch(entry),
        )) {
      throw const FormatException('unsafe_planner_question');
    }
    return PlannerQuestion(id: id, prompt: prompt, options: options);
  }
}

class PlannerTemplate {
  const PlannerTemplate({
    required this.id,
    required this.title,
    required this.questions,
  });

  final String id;
  final String title;
  final List<PlannerQuestion> questions;

  factory PlannerTemplate.fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final title = json['title']?.toString() ?? '';
    final rawQuestions = json['questions'];
    final questions = rawQuestions is List
        ? rawQuestions
            .whereType<Map>()
            .map(
              (entry) => PlannerQuestion.fromJson(
                Map<String, dynamic>.from(entry),
              ),
            )
            .toList(growable: false)
        : const <PlannerQuestion>[];
    if (!RegExp(r'^[a-z][a-z0-9_]{2,39}$').hasMatch(id) ||
        title.length < 3 ||
        title.length > 120 ||
        questions.length < 3 ||
        questions.length > 6 ||
        questions.map((entry) => entry.id).toSet().length != questions.length ||
        rawQuestions is! List ||
        questions.length != rawQuestions.length) {
      throw const FormatException('unsafe_planner_template');
    }
    return PlannerTemplate(id: id, title: title, questions: questions);
  }
}

class PlannerCatalog {
  const PlannerCatalog({required this.templates});

  final List<PlannerTemplate> templates;

  factory PlannerCatalog.fromJson(Map<String, dynamic> json) {
    final rawTemplates = json['templates'];
    final templates = rawTemplates is List
        ? rawTemplates
            .whereType<Map>()
            .map(
              (entry) => PlannerTemplate.fromJson(
                Map<String, dynamic>.from(entry),
              ),
            )
            .toList(growable: false)
        : const <PlannerTemplate>[];
    if (json['plannerVersion'] != _plannerCoreVersion ||
        json['externalGenerativeAiUsed'] != false ||
        json['serverResolutionRequired'] != true ||
        rawTemplates is! List ||
        templates.length != rawTemplates.length ||
        templates.length != 5 ||
        templates.map((entry) => entry.id).toSet().length != templates.length) {
      throw const FormatException('unsafe_planner_catalog');
    }
    return PlannerCatalog(templates: templates);
  }
}

class PlannerSelection {
  const PlannerSelection({
    required this.itemType,
    required this.priority,
    required this.listingId,
    required this.title,
    required this.totalMinor,
    required this.currency,
  });

  final String itemType;
  final String priority;
  final String listingId;
  final String title;
  final int totalMinor;
  final String currency;

  factory PlannerSelection.fromJson(Map<String, dynamic> json) {
    final listing = Map<String, dynamic>.from(
      json['listing'] as Map? ?? const <String, dynamic>{},
    );
    final quote = Map<String, dynamic>.from(
      json['quote'] as Map? ?? const <String, dynamic>{},
    );
    final itemType = json['itemType']?.toString() ?? '';
    final priority = json['priority']?.toString() ?? '';
    final listingId = listing['id']?.toString() ?? '';
    final title = listing['title']?.toString() ?? '';
    final totalMinor = quote['totalMinor'];
    final rentalSubtotalMinor = quote['rentalSubtotalMinor'];
    final platformFeeMinor = quote['platformFeeMinor'];
    final ownerPayoutMinor = quote['ownerPayoutMinor'];
    final quoteHash = quote['quoteHash']?.toString() ?? '';
    final currency = quote['currency']?.toString() ?? '';
    if (!RegExp(r'^[a-z][a-z0-9_]{2,59}$').hasMatch(itemType) ||
        !const {'required', 'recommended', 'optional'}.contains(priority) ||
        listingId.isEmpty ||
        title.isEmpty ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(quoteHash) ||
        currency != 'EUR' ||
        totalMinor is! int ||
        rentalSubtotalMinor is! int ||
        platformFeeMinor is! int ||
        ownerPayoutMinor is! int ||
        totalMinor < 0 ||
        rentalSubtotalMinor < 0 ||
        platformFeeMinor < 0 ||
        ownerPayoutMinor < 0 ||
        ownerPayoutMinor + platformFeeMinor != totalMinor ||
        quote['preview'] != true ||
        quote['persisted'] != false) {
      throw const FormatException('unsafe_planner_selection');
    }
    return PlannerSelection(
      itemType: itemType,
      priority: priority,
      listingId: listingId,
      title: title,
      totalMinor: totalMinor,
      currency: currency,
    );
  }
}

class PlannerVariant {
  const PlannerVariant({
    required this.id,
    required this.label,
    required this.available,
    required this.rankingBasis,
    required this.selections,
    required this.totalMinor,
  });

  final String id;
  final String label;
  final bool available;
  final String rankingBasis;
  final List<PlannerSelection> selections;
  final int? totalMinor;

  factory PlannerVariant.fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final label = json['label']?.toString() ?? '';
    final status = json['status']?.toString() ?? '';
    final rankingBasis = json['rankingBasis']?.toString() ?? '';
    final rawSelections = json['selections'];
    final selections = rawSelections is List
        ? rawSelections
            .whereType<Map>()
            .map(
              (entry) => PlannerSelection.fromJson(
                Map<String, dynamic>.from(entry),
              ),
            )
            .toList(growable: false)
        : const <PlannerSelection>[];
    final totals = json['totals'];
    final available = status == 'current';
    int? totalMinor;
    if (available && totals is Map) {
      totalMinor = totals['totalMinor'] as int?;
    }
    if (!const {'one_stop', 'price_efficient', 'top_rated'}.contains(id) ||
        label.isEmpty ||
        rankingBasis.length < 12 ||
        !const {'current', 'unavailable'}.contains(status) ||
        rawSelections is! List ||
        selections.length != rawSelections.length ||
        json['reservationCreated'] != false ||
        (available &&
            (selections.isEmpty ||
                totalMinor == null ||
                totalMinor < 0 ||
                totals['currency'] != 'EUR' ||
                json['unavailableReason'] != null)) ||
        (!available &&
            (selections.isNotEmpty ||
                totals != null ||
                (json['unavailableReason']?.toString().isEmpty ?? true)))) {
      throw const FormatException('unsafe_planner_variant');
    }
    return PlannerVariant(
      id: id,
      label: label,
      available: available,
      rankingBasis: rankingBasis,
      selections: selections,
      totalMinor: totalMinor,
    );
  }
}

class PlannerResolution {
  const PlannerResolution({
    required this.templateId,
    required this.templateTitle,
    required this.startDate,
    required this.endDate,
    required this.selectedItemTypes,
    required this.cartEligible,
    required this.variants,
    required this.inventorySnapshotHash,
  });

  final String templateId;
  final String templateTitle;
  final String startDate;
  final String endDate;
  final List<String> selectedItemTypes;
  final bool cartEligible;
  final List<PlannerVariant> variants;
  final String inventorySnapshotHash;

  factory PlannerResolution.fromJson(Map<String, dynamic> json) {
    final selectedItemTypes = (json['selectedItemTypes'] as List?)
            ?.whereType<String>()
            .toList(growable: false) ??
        const <String>[];
    final rawVariants = json['variants'];
    final variants = rawVariants is List
        ? rawVariants
            .whereType<Map>()
            .map(
              (entry) => PlannerVariant.fromJson(
                Map<String, dynamic>.from(entry),
              ),
            )
            .toList(growable: false)
        : const <PlannerVariant>[];
    final serverTruth = Map<String, dynamic>.from(
      json['serverTruth'] as Map? ?? const <String, dynamic>{},
    );
    final templateId = json['templateId']?.toString() ?? '';
    final templateTitle = json['templateTitle']?.toString() ?? '';
    final startDate = json['startDate']?.toString() ?? '';
    final endDate = json['endDate']?.toString() ?? '';
    final snapshotHash = json['inventorySnapshotHash']?.toString() ?? '';
    if (json['plannerInventoryVersion'] != _plannerInventoryVersion ||
        json['plannerCoreVersion'] != _plannerCoreVersion ||
        !RegExp(r'^[a-z][a-z0-9_]{2,39}$').hasMatch(templateId) ||
        templateTitle.length < 3 ||
        DateTime.tryParse(startDate) == null ||
        DateTime.tryParse(endDate) == null ||
        selectedItemTypes.isEmpty ||
        selectedItemTypes.toSet().length != selectedItemTypes.length ||
        rawVariants is! List ||
        variants.length != 3 ||
        variants.length != rawVariants.length ||
        variants.map((entry) => entry.id).toSet().length != 3 ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(snapshotHash) ||
        json['cartEligible'] is! bool ||
        serverTruth['status'] != 'resolved_at_request_time' ||
        serverTruth['inventoryQueried'] != true ||
        serverTruth['currentAvailabilityChecked'] != true ||
        serverTruth['currentQuotePreviewChecked'] != true ||
        serverTruth['quotePersisted'] != false ||
        serverTruth['reservationCreated'] != false ||
        serverTruth['bookingCreated'] != false ||
        serverTruth['revalidationRequiredBeforeRequest'] != true ||
        json['externalGenerativeAiUsed'] != false) {
      throw const FormatException('unsafe_planner_resolution');
    }
    return PlannerResolution(
      templateId: templateId,
      templateTitle: templateTitle,
      startDate: startDate,
      endDate: endDate,
      selectedItemTypes: selectedItemTypes,
      cartEligible: json['cartEligible'] as bool,
      variants: variants,
      inventorySnapshotHash: snapshotHash,
    );
  }
}

class PlannerCartReceipt {
  const PlannerCartReceipt({
    required this.addedItemCount,
    required this.cart,
  });

  final int addedItemCount;
  final RentalCart cart;

  factory PlannerCartReceipt.fromJson(
    Map<String, dynamic> json, {
    required PlannerResolution resolution,
    required String variantId,
  }) {
    final count = json['addedItemCount'];
    final cart = RentalCart.fromJson(
      Map<String, dynamic>.from(
        json['cart'] as Map? ?? const <String, dynamic>{},
      ),
    );
    if (json['plannerInventoryVersion'] != _plannerInventoryVersion ||
        json['templateId'] != resolution.templateId ||
        json['inventorySnapshotHash'] != resolution.inventorySnapshotHash ||
        json['variantId'] != variantId ||
        count is! int ||
        count < 1 ||
        json['revalidated'] != true ||
        json['reservationCreated'] != false ||
        json['bookingCreated'] != false ||
        cart.reservationCreated) {
      throw const FormatException('unsafe_planner_cart_receipt');
    }
    return PlannerCartReceipt(addedItemCount: count, cart: cart);
  }
}
