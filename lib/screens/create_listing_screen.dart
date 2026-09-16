import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:ui';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart'
    show kIsWeb, debugPrint, visibleForTesting;
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/category.dart';
import 'package:lendify/models/supply_enrichment.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/blue_ocean_draft_recovery_service.dart';
import 'package:lendify/services/maps_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/on_device_listing_analysis_service.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/all_categories_overlay.dart';
import 'package:lendify/services/ai_price_calculator_service.dart';
import 'package:lendify/openai/openai_config.dart';
import 'package:lendify/utils/cancellation_policy_text.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/widgets/private_pilot_risk_notice.dart';
import 'package:lendify/widgets/listing_mutation_interaction.dart';
import 'package:lendify/theme.dart';

@visibleForTesting
String resolveListingEditorCity({
  String? existingCity,
  String? supplyPrefillCity,
  String? userCity,
  required Iterable<String> availableCities,
}) {
  for (final candidate in <String?>[
    existingCity,
    supplyPrefillCity,
    userCity,
  ]) {
    final normalized = candidate?.trim() ?? '';
    if (normalized.isNotEmpty) return normalized;
  }
  for (final candidate in availableCities) {
    final normalized = candidate.trim();
    if (normalized.isNotEmpty) return normalized;
  }
  throw StateError('Für den Anzeigeneditor ist keine Stadt verfügbar.');
}

class CreateListingScreen extends StatefulWidget {
  final Item? existing; // when provided -> edit mode
  final SupplyEnrichmentPrefill? supplyPrefill;
  final ListingMutationService listingMutationService;
  const CreateListingScreen({
    super.key,
    this.existing,
    this.supplyPrefill,
    this.listingMutationService = const ListingMutationService(),
  }) : assert(existing == null || supplyPrefill == null);
  @override
  State<CreateListingScreen> createState() => _CreateListingScreenState();
}

class _CreateListingScreenState extends State<CreateListingScreen>
    with WidgetsBindingObserver {
  final _formKey = GlobalKey<FormState>();

  // Basic fields
  final TextEditingController _titleCtrl = TextEditingController();
  final TextEditingController _descCtrl = TextEditingController();
  final TextEditingController _priceCtrl = TextEditingController();
  final TextEditingController _blueOceanBrandCtrl = TextEditingController();
  final TextEditingController _blueOceanModelCtrl = TextEditingController();
  final TextEditingController _blueOceanAccessoriesCtrl =
      TextEditingController();
  final TextEditingController _blueOceanProjectTagsCtrl =
      TextEditingController();
  final TextEditingController _blueOceanUseCasesCtrl = TextEditingController();
  final TextEditingController _blueOceanSafetyCtrl = TextEditingController();
  final TextEditingController _blueOceanReplacementValueCtrl =
      TextEditingController();
  final TextEditingController _blueOceanPickupRegionCtrl =
      TextEditingController();

  // Photos
  final ImagePicker _picker = ImagePicker();
  final List<XFile> _pickedImages = [];
  String? _photoAccessError;
  // For edit mode: keep previously saved photos (non-removable for now)
  List<String> _existingPhotos = [];

  // Dropdowns / switches
  List<Category> _categories = [];
  String? _categoryId;
  String? _subcategory;
  // Coarse/top-level categories for selection UI
  List<String> _coarseCats = [];
  // Map coarse label -> fine categories in that group
  Map<String, List<Category>> _catsByCoarse = {};
  String _priceUnit = 'day'; // only 'day' is supported in UI
  String _condition =
      'new'; // 'new' | 'like-new' | 'good' | 'acceptable' | 'worn'
  // Delivery options
  bool _offersDeliveryAtDropoff = false; // Lieferung bei Abgabe (Hinweg)
  bool _offersPickupAtReturn = false; // Abholung bei Rückgabe (Rückweg)
  double? _maxDistanceKm; // applies to both delivery and pickup (simple model)

  // Location (only address mode now)
  final TextEditingController _addressCtrl = TextEditingController();
  String? _registeredCity;
  double? _selectedAddrLat;
  double? _selectedAddrLng;
  bool get _isEdit => widget.existing != null;

  // Address suggestions are routed through the authenticated SIT backend.
  Timer? _debounce;
  List<_PlaceSuggestion> _addrSuggestions = const [];
  bool _addrSuggestionsUnavailable = false;

  // AI Price Calculator
  PriceSuggestion? _priceSuggestion;
  String _priceStrategy = 'quick'; // 'quick' | 'premium'
  bool _hasCalculatedPrice = false;
  // Stable market-price truth (independent of mode)
  double? _marketPriceMin;
  double? _marketPriceMax;
  // Debounce for live AI recalculation
  Timer? _priceRecalcDebounce;
  // Long-term discount state (threshold-based: Ab X Tagen -> Y%)
  bool _autoApplyDiscounts = true; // acts as "Rabatt aktivieren"
  int _tier1Days = 3;
  double _tier1Pct = 10;
  int _tier2Days = 5;
  double _tier2Pct = 20;
  int _tier3Days = 8;
  double _tier3Pct = 30;
  bool _hasCalculatedDiscounts = false;
  bool _discountsTouched =
      false; // if user edits any tier, avoid overwriting with AI
  // If user manually edits the price, we stop all auto-adjustments
  bool _priceTouched = false;
  bool _privateStatusConfirmed = false;
  final GlobalKey _blueOceanCardKey = GlobalKey();
  final FocusNode _blueOceanErrorFocus = FocusNode();
  bool _blueOceanConsentAccepted = false;
  bool _blueOceanBusy = false;
  bool _submitBusy = false;
  String _blueOceanProgress = '';
  String? _blueOceanError;
  String? _blueOceanDraftId;
  Map<String, dynamic>? _blueOceanAssistant;
  List<String> _blueOceanPhotoUrls = const <String>[];
  String? _blueOceanReadyFingerprint;
  final Set<String> _blueOceanAnsweredQuestions = <String>{};
  String _blueOceanReplacementBand = 'eur_100_250';
  bool _blueOceanReplacementBandConfirmed = false;
  final Map<String, bool> _blueOceanConfirmations = <String, bool>{
    'ownership': false,
    'item_identity': false,
    'allowed_category': false,
    'functionality': false,
    'condition': false,
    'accessories': false,
    'owner_price': false,
    'duration_discounts': false,
    'availability': false,
    'pickup_region': false,
    'final_publication': false,
  };
  final BlueOceanDraftRecoveryService _blueOceanDraftRecovery =
      BlueOceanDraftRecoveryService();
  final OnDeviceListingAnalysisService _onDeviceListingAnalysis =
      const OnDeviceListingAnalysisService();
  Timer? _blueOceanRecoveryDebounce;
  String? _currentOwnerId;
  final _listingActions = ListingMutationInteractionController();
  StreamSubscription<String>? _accountSecuritySubscription;

  ListingMutationService get _listingMutationService =>
      widget.listingMutationService;
  // Force-refresh discount rows when switching strategy so focused inputs also update
  int _strategyEpoch = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _accountSecuritySubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      final ownedRoute = mounted ? ModalRoute.of(context) : null;
      _debounce?.cancel();
      _priceRecalcDebounce?.cancel();
      _blueOceanRecoveryDebounce?.cancel();
      _listingActions.invalidate();
      if (mounted) {
        setState(() {
          _submitBusy = false;
          _blueOceanBusy = false;
        });
        _listingActions.removeOwnedNavigationRoute(ownedRoute);
      }
    });
    for (final controller in <TextEditingController>[
      _titleCtrl,
      _descCtrl,
      _priceCtrl,
      _blueOceanBrandCtrl,
      _blueOceanModelCtrl,
      _blueOceanAccessoriesCtrl,
      _blueOceanProjectTagsCtrl,
      _blueOceanUseCasesCtrl,
      _blueOceanSafetyCtrl,
      _blueOceanReplacementValueCtrl,
      _blueOceanPickupRegionCtrl,
      _addressCtrl,
    ]) {
      controller.addListener(_scheduleBlueOceanRecoverySave);
    }
    _load();
    // Prefill when editing
    final ex = widget.existing;
    if (ex != null) {
      _titleCtrl.text = ex.title;
      _descCtrl.text = ex.description;
      _priceCtrl.text = ex.priceRaw.toStringAsFixed(
          ex.priceRaw.truncateToDouble() == ex.priceRaw ? 0 : 2);
      _categoryId = ex.categoryId;
      _subcategory = ex.subcategory;
      _priceUnit = ex.priceUnit;
      // Enforce day-only pricing unit in UI
      if (_priceUnit != 'day') {
        _priceUnit = 'day';
      }
      _condition = ex.condition;
      _offersDeliveryAtDropoff =
          PrivatePilotConfig.deliveryEnabled && ex.offersDeliveryAtDropoff;
      _offersPickupAtReturn =
          PrivatePilotConfig.deliveryEnabled && ex.offersPickupAtReturn;
      _maxDistanceKm = ex.maxDeliveryKmAtDropoff ?? ex.maxPickupKmAtReturn;
      _registeredCity = ex.city;
      _addressCtrl.text = ex.locationText;
      _selectedAddrLat = ex.lat;
      _selectedAddrLng = ex.lng;
      _existingPhotos = List<String>.from(ex.photos);
      _privateStatusConfirmed = ex.privateStatusConfirmed;
      // Prefill discount tiers: map first three thresholds ascending
      _autoApplyDiscounts = ex.autoApplyDiscounts;
      if (ex.longRentalDiscounts.isNotEmpty) {
        final tiers = [...ex.longRentalDiscounts]
          ..sort((a, b) => a.days.compareTo(b.days));
        if (tiers.isNotEmpty) {
          _tier1Days = tiers[0].days;
          _tier1Pct = tiers[0].discountPercent;
        }
        if (tiers.length >= 2) {
          _tier2Days = tiers[1].days;
          _tier2Pct = tiers[1].discountPercent;
        }
        if (tiers.length >= 3) {
          _tier3Days = tiers[2].days;
          _tier3Pct = tiers[2].discountPercent;
        }
      }
    } else if (widget.supplyPrefill case final prefill?) {
      _titleCtrl.text = prefill.title;
      _categoryId = prefill.categoryId;
      _subcategory = prefill.subcategory;
      _registeredCity = prefill.city;
      _addressCtrl.text = prefill.locationText;
      _selectedAddrLat = prefill.latitude;
      _selectedAddrLng = prefill.longitude;
    }
  }

  Future<void> _load() async {
    final cats = await DataService.getCategories();
    final listingContext = await _listingMutationService.loadCurrentContext();
    final user = listingContext?.user;
    if (!mounted ||
        listingContext == null ||
        !await _listingMutationService.isContextCurrent(listingContext)) {
      return;
    }
    if (widget.existing != null && widget.existing!.ownerId != user!.id) {
      _listingActions.invalidate();
      return;
    }
    // Build coarse/top-level groups in fixed order, limited to those present
    final present = <String>{
      for (final c in cats) DataService.coarseCategoryFor(c.name)
    };
    final ordered = [
      for (final g in DataService.coarseCategoryOrder)
        if (present.contains(g)) g
    ];
    // Group fine categories by their coarse label
    final byCoarse = <String, List<Category>>{};
    for (final c in cats) {
      final g = DataService.coarseCategoryFor(c.name);
      (byCoarse[g] ??= <Category>[]).add(c);
    }
    _listingActions.replaceContext(listingContext);
    setState(() {
      _currentOwnerId = user?.id;
      _categories = cats;
      final existingCategory =
          widget.existing?.categoryId ?? widget.supplyPrefill?.categoryId;
      _categoryId = cats.isEmpty
          ? null
          : (cats.any((category) => category.id == existingCategory)
              ? existingCategory
              : cats.first.id);
      final selectedCategory = cats.cast<Category?>().firstWhere(
            (category) => category?.id == _categoryId,
            orElse: () => cats.isEmpty ? null : cats.first,
          );
      final allowedSubcategories = selectedCategory?.subcategories
              .where((subcategory) => PrivatePilotConfig.subcategoryAllowed(
                    selectedCategory.id,
                    subcategory,
                  ))
              .toList(growable: false) ??
          const <String>[];
      final requestedSubcategory =
          widget.existing?.subcategory ?? widget.supplyPrefill?.subcategory;
      _subcategory = allowedSubcategories.contains(requestedSubcategory)
          ? requestedSubcategory
          : (allowedSubcategories.isEmpty ? null : allowedSubcategories.first);
      _coarseCats =
          ordered.isNotEmpty ? ordered : DataService.coarseCategoryOrder;
      _catsByCoarse = byCoarse;
      _registeredCity = resolveListingEditorCity(
        existingCity: widget.existing?.city,
        supplyPrefillCity: widget.supplyPrefill?.city,
        userCity: user?.city,
        availableCities: DataService.getCities().keys,
      );
    });
    if (!_isEdit && user != null) {
      await _restoreBlueOceanRecoverySnapshot(user.id);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _accountSecuritySubscription?.cancel();
    _listingActions.dispose();
    _blueOceanRecoveryDebounce?.cancel();
    unawaited(_persistBlueOceanRecoverySnapshot());
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _priceCtrl.dispose();
    _blueOceanBrandCtrl.dispose();
    _blueOceanModelCtrl.dispose();
    _blueOceanAccessoriesCtrl.dispose();
    _blueOceanProjectTagsCtrl.dispose();
    _blueOceanUseCasesCtrl.dispose();
    _blueOceanSafetyCtrl.dispose();
    _blueOceanReplacementValueCtrl.dispose();
    _blueOceanPickupRegionCtrl.dispose();
    _addressCtrl.dispose();
    _blueOceanErrorFocus.dispose();
    _debounce?.cancel();
    _priceRecalcDebounce?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.hidden) {
      _blueOceanRecoveryDebounce?.cancel();
      unawaited(_persistBlueOceanRecoverySnapshot());
    }
  }

  static const String _blueOceanDisclosureVersion =
      'listing-ai-on-device-disclosure-v1';
  static const String _blueOceanDisclosureText =
      'SIT wertet deine ausgewählten Bilder direkt auf diesem Android-Gerät '
      'aus. Erkannte Objektbegriffe und Texte sowie die ausgewählten '
      'Anzeigenfotos werden an SIT übertragen, um einen bearbeitbaren Entwurf '
      'zu erstellen. ML Kit sendet Bildinhalte und Erkennungsergebnisse nicht '
      'an Google; technische ML-Kit-Nutzungs- und Diagnosedaten können an '
      'Google übertragen werden. Es wird nichts automatisch veröffentlicht.';

  String _newBlueOceanUuid() {
    final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int value) => value.toRadixString(16).padLeft(2, '0');
    final raw = bytes.map(hex).join();
    return '${raw.substring(0, 8)}-${raw.substring(8, 12)}-'
        '${raw.substring(12, 16)}-${raw.substring(16, 20)}-'
        '${raw.substring(20)}';
  }

  String _newBlueOceanGenerationKey(String action) => sha256
      .convert(utf8.encode(
          '$action:${_newBlueOceanUuid()}:${DateTime.now().toUtc().toIso8601String()}'))
      .toString();

  Map<String, dynamic> _blueOceanRecoveryEditableFields() => <String, dynamic>{
        'title': _titleCtrl.text,
        'description': _descCtrl.text,
        'categoryId': _categoryId,
        'subcategory': _subcategory,
        'brand': _blueOceanBrandCtrl.text,
        'model': _blueOceanModelCtrl.text,
        'accessories': _blueOceanAccessoriesCtrl.text,
        'projectTags': _blueOceanProjectTagsCtrl.text,
        'useCases': _blueOceanUseCasesCtrl.text,
        'safetyNotes': _blueOceanSafetyCtrl.text,
        'replacementValue': _blueOceanReplacementValueCtrl.text,
        'replacementBand': _blueOceanReplacementBand,
        'pickupRegion': _blueOceanPickupRegionCtrl.text,
        'address': _addressCtrl.text,
        'registeredCity': _registeredCity,
        'latitude': _selectedAddrLat,
        'longitude': _selectedAddrLng,
        'ownerDailyPrice': _priceCtrl.text,
        'condition': _condition,
        'durationPricingEnabled': _autoApplyDiscounts,
        'durationPricing': <Map<String, dynamic>>[
          <String, dynamic>{'days': _tier1Days, 'percent': _tier1Pct},
          <String, dynamic>{'days': _tier2Days, 'percent': _tier2Pct},
          <String, dynamic>{'days': _tier3Days, 'percent': _tier3Pct},
        ],
        'privateStatusConfirmed': _privateStatusConfirmed,
      };

  BlueOceanDraftRecoverySnapshot? _blueOceanRecoverySnapshot() {
    final ownerId = _currentOwnerId;
    final draftId = _blueOceanDraftId;
    final assistant = _blueOceanAssistant;
    if (ownerId == null ||
        draftId == null ||
        assistant == null ||
        _blueOceanPhotoUrls.isEmpty ||
        _blueOceanPhotoUrls.any(
          (url) => !BackendConfig.isManagedListingImageUrl(url),
        )) {
      return null;
    }
    return BlueOceanDraftRecoverySnapshot(
      ownerId: ownerId,
      draftId: draftId,
      savedAtUtc: DateTime.now().toUtc(),
      assistant: Map<String, dynamic>.from(assistant),
      managedPhotoUrls: List<String>.from(_blueOceanPhotoUrls),
      editableFields: _blueOceanRecoveryEditableFields(),
    );
  }

  Future<void> _persistBlueOceanRecoverySnapshot() async {
    final snapshot = _blueOceanRecoverySnapshot();
    if (snapshot == null) return;
    try {
      await _blueOceanDraftRecovery.save(snapshot);
    } catch (_) {
      debugPrint(
        '[CreateListingScreen] Blue-Ocean recovery snapshot was not saved.',
      );
    }
  }

  Future<void> _clearBlueOceanRecoverySnapshot() async {
    try {
      await _blueOceanDraftRecovery.clear();
    } catch (_) {
      debugPrint(
        '[CreateListingScreen] Blue-Ocean recovery snapshot was not cleared.',
      );
    }
  }

  void _scheduleBlueOceanRecoverySave() {
    if (_blueOceanDraftId == null) return;
    _blueOceanRecoveryDebounce?.cancel();
    _blueOceanRecoveryDebounce = Timer(
      const Duration(milliseconds: 350),
      () => unawaited(_persistBlueOceanRecoverySnapshot()),
    );
  }

  void _restoreTextField(
    Map<String, dynamic> fields,
    String key,
    TextEditingController controller, {
    int maximumLength = 4000,
  }) {
    final value = fields[key];
    if (value is String && value.length <= maximumLength) {
      controller.text = value;
    }
  }

  void _applyBlueOceanRecoveryEditableFields(Map<String, dynamic> fields) {
    _restoreTextField(fields, 'title', _titleCtrl, maximumLength: 200);
    _restoreTextField(fields, 'description', _descCtrl);
    _restoreTextField(fields, 'brand', _blueOceanBrandCtrl, maximumLength: 200);
    _restoreTextField(fields, 'model', _blueOceanModelCtrl, maximumLength: 200);
    _restoreTextField(fields, 'accessories', _blueOceanAccessoriesCtrl);
    _restoreTextField(fields, 'projectTags', _blueOceanProjectTagsCtrl);
    _restoreTextField(fields, 'useCases', _blueOceanUseCasesCtrl);
    _restoreTextField(fields, 'safetyNotes', _blueOceanSafetyCtrl);
    _restoreTextField(
        fields, 'replacementValue', _blueOceanReplacementValueCtrl,
        maximumLength: 32);
    _restoreTextField(fields, 'pickupRegion', _blueOceanPickupRegionCtrl,
        maximumLength: 240);
    _restoreTextField(fields, 'address', _addressCtrl, maximumLength: 500);
    _restoreTextField(fields, 'ownerDailyPrice', _priceCtrl, maximumLength: 32);

    final categoryId = fields['categoryId'];
    final subcategory = fields['subcategory'];
    if (categoryId is String &&
        subcategory is String &&
        _categories.any((entry) => entry.id == categoryId) &&
        PrivatePilotConfig.subcategoryAllowed(categoryId, subcategory)) {
      _categoryId = categoryId;
      _subcategory = subcategory;
    }
    final condition = fields['condition'];
    if (condition is String &&
        const <String>{'new', 'like-new', 'good', 'acceptable', 'worn'}
            .contains(condition)) {
      _condition = condition;
    }
    final replacementBand = fields['replacementBand'];
    if (replacementBand is String &&
        const <String>{
          'under_100',
          'eur_100_250',
          'eur_250_500',
          'eur_500_1000',
          'over_1000',
        }.contains(replacementBand)) {
      _blueOceanReplacementBand = replacementBand;
    }
    final registeredCity = fields['registeredCity'];
    if (registeredCity is String &&
        DataService.getCities().containsKey(registeredCity)) {
      _registeredCity = registeredCity;
    }
    final latitude = fields['latitude'];
    final longitude = fields['longitude'];
    if (latitude is num &&
        longitude is num &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180) {
      _selectedAddrLat = latitude.toDouble();
      _selectedAddrLng = longitude.toDouble();
    }
    _autoApplyDiscounts = fields['durationPricingEnabled'] == true;
    final durationPricing = fields['durationPricing'];
    if (durationPricing is List && durationPricing.length == 3) {
      final days = <int>[];
      final percentages = <double>[];
      for (final entry in durationPricing) {
        if (entry is! Map ||
            entry['days'] is! int ||
            entry['percent'] is! num) {
          return;
        }
        final day = entry['days'] as int;
        final percentage = (entry['percent'] as num).toDouble();
        if (day < 2 || day > 365 || percentage < 0 || percentage > 95) {
          return;
        }
        days.add(day);
        percentages.add(percentage);
      }
      _tier1Days = days[0];
      _tier2Days = days[1];
      _tier3Days = days[2];
      _tier1Pct = percentages[0];
      _tier2Pct = percentages[1];
      _tier3Pct = percentages[2];
    }
    _privateStatusConfirmed = fields['privateStatusConfirmed'] == true;
  }

  Future<void> _restoreBlueOceanRecoverySnapshot(String ownerId) async {
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) return;
    try {
      final snapshot = await _blueOceanDraftRecovery.readForOwner(ownerId);
      if (!mounted || snapshot == null) return;
      final revision = snapshot.assistant['revision'];
      final revisionDraftId = revision is Map ? revision['draftId'] : null;
      if (revisionDraftId != snapshot.draftId ||
          snapshot.managedPhotoUrls.any(
            (url) => !BackendConfig.isManagedListingImageUrl(url),
          )) {
        await _clearBlueOceanRecoverySnapshot();
        return;
      }
      setState(() {
        _blueOceanDraftId = snapshot.draftId;
        _blueOceanAssistant = snapshot.assistant;
        _blueOceanPhotoUrls = snapshot.managedPhotoUrls;
        _applyBlueOceanDraft(snapshot.assistant);
        _applyBlueOceanRecoveryEditableFields(snapshot.editableFields);
        _blueOceanConsentAccepted = false;
        _blueOceanAnsweredQuestions.clear();
        _blueOceanReplacementBandConfirmed = false;
        for (final key in _blueOceanConfirmations.keys) {
          _blueOceanConfirmations[key] = false;
        }
        _blueOceanReadyFingerprint = null;
        _blueOceanProgress =
            'Der unterbrochene Entwurf wurde lokal wiederhergestellt. Prüfe '
            'Rückfragen, Bestätigungen, Preis und Vorschau erneut.';
        _blueOceanError = null;
      });
    } catch (_) {
      if (mounted) {
        debugPrint(
          '[CreateListingScreen] Blue-Ocean recovery snapshot was not restored.',
        );
      }
    }
  }

  void _clearBlueOceanDraftForPhotoChange() {
    if (_blueOceanDraftId == null && _blueOceanPhotoUrls.isEmpty) return;
    _blueOceanDraftId = null;
    _blueOceanAssistant = null;
    _blueOceanPhotoUrls = const <String>[];
    _blueOceanReadyFingerprint = null;
    _blueOceanAnsweredQuestions.clear();
    _blueOceanReplacementBandConfirmed = false;
    _blueOceanError =
        'Die Fotoauswahl wurde geändert. Starte die KI-Analyse erneut; deine '
        'manuellen Eingaben bleiben erhalten.';
    for (final key in _blueOceanConfirmations.keys) {
      _blueOceanConfirmations[key] = false;
    }
    _blueOceanRecoveryDebounce?.cancel();
    unawaited(_clearBlueOceanRecoverySnapshot());
  }

  void _invalidateBlueOceanReviewState({
    Iterable<String> confirmations = const <String>[],
    bool clearClarifications = false,
    bool resetReplacementBand = false,
  }) {
    if (_blueOceanDraftId == null) return;
    for (final key in confirmations) {
      _blueOceanConfirmations[key] = false;
    }
    _blueOceanConfirmations['final_publication'] = false;
    _blueOceanReadyFingerprint = null;
    if (clearClarifications) _blueOceanAnsweredQuestions.clear();
    if (resetReplacementBand) {
      _blueOceanReplacementBandConfirmed = false;
    }
    _scheduleBlueOceanRecoverySave();
  }

  String _blueOceanEditableFingerprint() {
    final answered = _blueOceanAnsweredQuestions.toList()..sort();
    final confirmationKeys = _blueOceanConfirmations.keys.toList()..sort();
    final confirmations = <String, bool>{
      for (final key in confirmationKeys)
        key: _blueOceanConfirmations[key] ?? false,
    };
    final snapshot = <String, dynamic>{
      'title': _titleCtrl.text.trim(),
      'description': _descCtrl.text.trim(),
      'category': _categoryId,
      'subcategory': _subcategory,
      'brand': _blueOceanBrandCtrl.text.trim(),
      'model': _blueOceanModelCtrl.text.trim(),
      'condition': _condition,
      'accessories': _commaSeparated(_blueOceanAccessoriesCtrl),
      'projectTags': _commaSeparated(_blueOceanProjectTagsCtrl),
      'useCases': _commaSeparated(_blueOceanUseCasesCtrl),
      'safetyNotes': _blueOceanSafetyCtrl.text.trim(),
      'replacementValueBand': _blueOceanReplacementBand,
      'replacementValueMinor': _blueOceanReplacementValueMinor(),
      'replacementValueBandConfirmed': _blueOceanReplacementBandConfirmed,
      'pickupRegion': _blueOceanPickupRegionCtrl.text.trim(),
      'handoverAddress': _addressCtrl.text.trim(),
      'ownerDailyPrice': _priceCtrl.text.trim().replaceAll(',', '.'),
      'durationPricingEnabled': _autoApplyDiscounts,
      'durationPricing': <Map<String, dynamic>>[
        <String, dynamic>{'days': _tier1Days, 'percent': _tier1Pct},
        <String, dynamic>{'days': _tier2Days, 'percent': _tier2Pct},
        <String, dynamic>{'days': _tier3Days, 'percent': _tier3Pct},
      ],
      'answeredClarifications': answered,
      'ownerConfirmations': confirmations,
      'photoUrls': _blueOceanPhotoUrls,
    };
    return sha256.convert(utf8.encode(jsonEncode(snapshot))).toString();
  }

  void _focusBlueOceanMessage() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _blueOceanCardKey.currentContext;
      if (target != null) {
        Scrollable.ensureVisible(
          target,
          duration: const Duration(milliseconds: 250),
          alignment: 0.12,
        );
      }
      if (mounted) _blueOceanErrorFocus.requestFocus();
    });
  }

  dynamic _blueOceanFieldValue(Map<String, dynamic> assistant, String key) {
    final revision = assistant['revision'];
    if (revision is! Map) return null;
    final fields = revision['fields'];
    if (fields is! Map) return null;
    final field = fields[key];
    return field is Map ? field['value'] : null;
  }

  void _applyBlueOceanDraft(Map<String, dynamic> assistant) {
    final title = _blueOceanFieldValue(assistant, 'title')?.toString();
    final description =
        _blueOceanFieldValue(assistant, 'description')?.toString();
    final category = _blueOceanFieldValue(assistant, 'category')?.toString();
    final subcategory =
        _blueOceanFieldValue(assistant, 'subcategory')?.toString();
    final condition = _blueOceanFieldValue(assistant, 'condition')?.toString();
    if (title != null && title.isNotEmpty) _titleCtrl.text = title;
    if (description != null && description.isNotEmpty) {
      _descCtrl.text = description;
    }
    if (category != null &&
        _categories.any((entry) => entry.id == category) &&
        PrivatePilotConfig.subcategoryAllowed(category, subcategory ?? '')) {
      _categoryId = category;
      _subcategory = subcategory;
    }
    if (condition != null &&
        const <String>{'new', 'like-new', 'good', 'acceptable', 'worn'}
            .contains(condition)) {
      _condition = condition;
    }
    _blueOceanBrandCtrl.text =
        _blueOceanFieldValue(assistant, 'brand')?.toString() ?? '';
    _blueOceanModelCtrl.text =
        _blueOceanFieldValue(assistant, 'model')?.toString() ?? '';
    _blueOceanAccessoriesCtrl.text =
        ((_blueOceanFieldValue(assistant, 'accessories') as List?) ?? const [])
            .join(', ');
    _blueOceanProjectTagsCtrl.text =
        ((_blueOceanFieldValue(assistant, 'projectTags') as List?) ?? const [])
            .join(', ');
    _blueOceanUseCasesCtrl.text =
        ((_blueOceanFieldValue(assistant, 'useCases') as List?) ?? const [])
            .join(', ');
    _blueOceanSafetyCtrl.text =
        _blueOceanFieldValue(assistant, 'safetyNotes')?.toString() ?? '';
    final replacementMinor =
        _blueOceanFieldValue(assistant, 'replacementValueMinor');
    if (replacementMinor is num) {
      _blueOceanReplacementValueCtrl.text =
          (replacementMinor / 100).toStringAsFixed(0);
    }
    _blueOceanPickupRegionCtrl.text =
        _blueOceanFieldValue(assistant, 'pickupRegion')?.toString() ??
            (_registeredCity ?? '');
  }

  Future<void> _startBlueOceanAssistant() async {
    final owner = _listingActions.capture();
    if (owner == null) return;
    if (!_blueOceanConsentAccepted) {
      setState(() => _blueOceanError =
          'Bitte lies den Hinweis und stimme der ausgewählten Bildanalyse zu.');
      _focusBlueOceanMessage();
      return;
    }
    if (_pickedImages.isEmpty || _pickedImages.length > 4) {
      setState(() => _blueOceanError = _pickedImages.isEmpty
          ? 'Wähle zuerst mindestens ein Foto aus.'
          : 'Für die KI-Analyse sind höchstens vier Fotos möglich. Entferne '
              'weitere Fotos oder nutze den manuellen Editor.');
      _focusBlueOceanMessage();
      return;
    }
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) {
      setState(() => _blueOceanError =
          'Der technische KI-Pilot benötigt den nicht-produktiven SIT-Backendpfad. '
              'Der manuelle Editor bleibt vollständig verfügbar.');
      _focusBlueOceanMessage();
      return;
    }
    setState(() {
      _blueOceanBusy = true;
      _blueOceanProgress = 'Fotos werden lokal auf diesem Gerät analysiert …';
      _blueOceanError = null;
    });
    try {
      final onDeviceAnalysis = await _onDeviceListingAnalysis.analyzeImagePaths(
        _pickedImages.map((file) => file.path).toList(growable: false),
      );
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      if (mounted) {
        setState(() => _blueOceanProgress =
            'Lokale Bildanalyse abgeschlossen. Fotos werden sicher vorbereitet …');
      }
      final photoUrls = <String>[];
      for (var index = 0; index < _pickedImages.length; index++) {
        if (mounted &&
            await _listingActions.isCurrent(_listingMutationService, owner)) {
          setState(() => _blueOceanProgress =
              'Foto ${index + 1} von ${_pickedImages.length} wird vorbereitet …');
        }
        final file = _pickedImages[index];
        final bytes = await file.readAsBytes();
        if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
          return;
        }
        photoUrls.add(await _listingMutationService.uploadImage(
          context: owner.context,
          bytes: bytes,
          filename: file.name,
        ));
      }
      final draftId = 'listing_ai_draft_${_newBlueOceanUuid()}';
      if (mounted) {
        setState(() => _blueOceanProgress =
            'Datenschutzprüfung und Entwurfserstellung laufen …');
      }
      final assistant = await _listingMutationService.analyzeBlueOceanDraft(
        context: owner.context,
        draftId: draftId,
        generationKey: _newBlueOceanGenerationKey('analyze'),
        photoUrls: photoUrls,
        consent: const <String, dynamic>{
          'explicitlyInitiated': true,
          'accepted': true,
          'disclosureVersion': _blueOceanDisclosureVersion,
          'disclosureText': _blueOceanDisclosureText,
        },
        onDeviceAnalysis: onDeviceAnalysis,
      );
      if (!mounted) return;
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      if (!mounted) return;
      setState(() {
        _blueOceanPhotoUrls = List<String>.unmodifiable(photoUrls);
        _blueOceanAssistant = assistant;
        if (assistant['status'] == 'draft_ready') {
          _blueOceanDraftId = draftId;
          _blueOceanReadyFingerprint = null;
          _blueOceanAnsweredQuestions.clear();
          _blueOceanReplacementBandConfirmed = false;
          for (final key in _blueOceanConfirmations.keys) {
            _blueOceanConfirmations[key] = false;
          }
          _blueOceanProgress = 'Bearbeitbarer Entwurf ist bereit.';
          _applyBlueOceanDraft(assistant);
        } else {
          _blueOceanDraftId = null;
          _blueOceanError =
              'Die KI-Analyse wurde sicher beendet. Prüfe oder ersetze die '
              'Fotos und arbeite im manuellen Editor weiter.';
          _blueOceanProgress = 'Manueller Editor geöffnet.';
        }
      });
      if (_blueOceanDraftId != null) {
        unawaited(_persistBlueOceanRecoverySnapshot());
      }
      if (_blueOceanError != null) _focusBlueOceanMessage();
    } on OnDeviceListingAnalysisException catch (failure) {
      if (!mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      setState(() {
        _blueOceanError =
            'Die lokale Bildanalyse ist nicht verfügbar (${failure.code}). '
            'Fotos und Eingaben bleiben erhalten; arbeite manuell weiter.';
        _blueOceanProgress = 'Manueller Fallback aktiv.';
      });
      _focusBlueOceanMessage();
    } on ListingMutationFailure catch (failure) {
      if (failure.kind == ListingMutationFailureKind.principalChanged ||
          !mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      setState(() {
        _blueOceanError =
            'Die KI-Hilfe ist nicht verfügbar (${failure.code ?? failure.kind.name}). Fotos und '
            'Eingaben bleiben erhalten; arbeite manuell weiter.';
        _blueOceanProgress = 'Manueller Fallback aktiv.';
      });
      _focusBlueOceanMessage();
    } catch (_) {
      if (!mounted) return;
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      if (!mounted) return;
      setState(() {
        _blueOceanError =
            'Die KI-Hilfe ist gerade nicht verfügbar. Fotos und Eingaben '
            'bleiben erhalten; arbeite manuell weiter.';
        _blueOceanProgress = 'Manueller Fallback aktiv.';
      });
      _focusBlueOceanMessage();
    } finally {
      if (mounted && _listingActions.isSynchronouslyCurrent(owner)) {
        setState(() => _blueOceanBusy = false);
      }
    }
  }

  List<String> _commaSeparated(TextEditingController controller) =>
      controller.text
          .split(',')
          .map((entry) => entry.trim())
          .where((entry) => entry.isNotEmpty)
          .take(12)
          .toList(growable: false);

  int? _blueOceanReplacementValueMinor() {
    final value = double.tryParse(
        _blueOceanReplacementValueCtrl.text.replaceAll(',', '.'));
    return value == null || value <= 0 ? null : (value * 100).round();
  }

  Map<String, dynamic> _blueOceanReviewPayload({
    required bool finalPublication,
  }) {
    final ownerDaily = double.tryParse(_priceCtrl.text.replaceAll(',', '.'));
    final confirmations = Map<String, bool>.from(_blueOceanConfirmations);
    confirmations['final_publication'] = finalPublication &&
        (_blueOceanConfirmations['final_publication'] ?? false);
    return <String, dynamic>{
      'generationKey': _newBlueOceanGenerationKey(
          finalPublication ? 'publish-review' : 'review'),
      'editedFields': <String, dynamic>{
        'title': _titleCtrl.text.trim(),
        'category': _categoryId,
        'subcategory': _subcategory,
        'brand': _blueOceanBrandCtrl.text.trim(),
        'model': _blueOceanModelCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'condition': _condition,
        'accessories': _commaSeparated(_blueOceanAccessoriesCtrl),
        'projectTags': _commaSeparated(_blueOceanProjectTagsCtrl),
        'useCases': _commaSeparated(_blueOceanUseCasesCtrl),
        'safetyNotes': _blueOceanSafetyCtrl.text.trim(),
        'replacementValueMinor': _blueOceanReplacementValueMinor(),
        'pickupRegion': _blueOceanPickupRegionCtrl.text.trim(),
      },
      'answeredClarificationIds':
          _blueOceanAnsweredQuestions.toList(growable: false),
      'ownerConfirmations': confirmations,
      'pricing': <String, dynamic>{
        'replacementValueBand': _blueOceanReplacementBand,
        'ownerConfirmedReplacementValueBand':
            _blueOceanReplacementBandConfirmed,
        'ownerConfirmedReplacementValueMinor':
            _blueOceanReplacementBand == 'over_1000'
                ? _blueOceanReplacementValueMinor()
                : null,
        'ownerDailyPriceMinor': ownerDaily == null || ownerDaily <= 0
            ? null
            : (ownerDaily * 100).round(),
        'durationPricingEnabled': _autoApplyDiscounts,
      },
      'previewDays': const <int>[1, 7],
    };
  }

  Future<void> _reviewBlueOceanAssistant() async {
    final owner = _listingActions.capture();
    if (owner == null) return;
    final draftId = _blueOceanDraftId;
    if (draftId == null) return;
    if (!_blueOceanReplacementBandConfirmed) {
      setState(() => _blueOceanError =
          'Bitte bestätige zuerst den geschätzten Wiederbeschaffungswert.');
      _focusBlueOceanMessage();
      return;
    }
    setState(() {
      _blueOceanBusy = true;
      _blueOceanProgress =
          'Entwurf, Preis, Mietdauer und Gebührenvorschau werden geprüft …';
      _blueOceanError = null;
      _blueOceanReadyFingerprint = null;
    });
    try {
      final assistant = await _listingMutationService.reviewBlueOceanDraft(
        context: owner.context,
        draftId: draftId,
        review: _blueOceanReviewPayload(finalPublication: true),
      );
      if (!mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      setState(() {
        _blueOceanAssistant = assistant;
        _blueOceanProgress = 'Vorschau wurde aktualisiert.';
        final recommendation = assistant['recommendation'];
        if (recommendation is Map && _priceCtrl.text.trim().isEmpty) {
          final minor = recommendation['recommendedDailyMinor'];
          if (minor is num) {
            _priceCtrl.text = (minor / 100).toStringAsFixed(2);
            _invalidateBlueOceanReviewState(
              confirmations: const <String>['owner_price'],
            );
          }
        }
        final readiness = assistant['readiness'];
        if (readiness is Map && readiness['readyToPublish'] == true) {
          _blueOceanReadyFingerprint = _blueOceanEditableFingerprint();
        }
      });
      unawaited(_persistBlueOceanRecoverySnapshot());
    } on ListingMutationFailure catch (failure) {
      if (failure.kind == ListingMutationFailureKind.principalChanged ||
          !mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      setState(() => _blueOceanError =
          'Die Vorschau ist noch nicht bereit (${failure.code ?? failure.kind.name}). Prüfe die '
              'markierten Angaben; der manuelle Editor bleibt verfügbar.');
      _focusBlueOceanMessage();
    } finally {
      if (mounted && _listingActions.isSynchronouslyCurrent(owner)) {
        setState(() => _blueOceanBusy = false);
      }
    }
  }

  Future<void> _pickFromCamera(ListingMutationActionOwner owner) async {
    // Always prefer camera when explicitly chosen, including on Web.
    // On Web, image_picker's web implementation may open a file dialog,
    // but on supported devices it can trigger camera capture.
    try {
      final XFile? file = await _picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.rear,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (file != null &&
          mounted &&
          await _listingActions.isCurrent(_listingMutationService, owner)) {
        setState(() {
          _photoAccessError = null;
          _clearBlueOceanDraftForPhotoChange();
          _pickedImages.add(file);
        });
      }
    } catch (_) {
      if (!mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      setState(() => _photoAccessError =
          'Die Kamera ist nicht verfügbar oder der Zugriff wurde abgelehnt. '
              'Du kannst den Zugriff in den Geräteeinstellungen erlauben oder '
              'ein vorhandenes Foto auswählen.');
    }
  }

  Future<void> _pickFromGallery(ListingMutationActionOwner owner) async {
    try {
      if (kIsWeb) {
        final res = await FilePicker.pickFiles(
          allowMultiple: true,
          withData: true,
          type: FileType.image,
        );
        if (res != null &&
            res.files.isNotEmpty &&
            mounted &&
            await _listingActions.isCurrent(_listingMutationService, owner)) {
          setState(() {
            _photoAccessError = null;
            _clearBlueOceanDraftForPhotoChange();
            _pickedImages.addAll(res.files
                .where((f) => f.bytes != null)
                .map((f) => XFile.fromData(f.bytes!, name: f.name)));
          });
        }
        return;
      }
      final List<XFile> files =
          await _picker.pickMultiImage(imageQuality: 85, maxWidth: 1600);
      if (files.isNotEmpty &&
          mounted &&
          await _listingActions.isCurrent(_listingMutationService, owner)) {
        setState(() {
          _photoAccessError = null;
          _clearBlueOceanDraftForPhotoChange();
          _pickedImages.addAll(files);
        });
      }
    } catch (_) {
      if (!mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      setState(() => _photoAccessError =
          'Auf Fotos kann gerade nicht zugegriffen werden. Prüfe die '
              'Foto-Berechtigung in den Geräteeinstellungen und versuche es erneut.');
    }
  }

  Future<void> _showPhotoSourceSheet() async {
    final owner = _listingActions.capture();
    if (owner == null) return;
    // Centered popup for picking photos with blurred background
    final source = await _listingActions.showOwnedDialog<String>(
      context: context,
      owner: owner,
      barrierDismissible: true,
      builder: (dialogContext) {
        return Material(
          type: MaterialType.transparency,
          child: SafeArea(
            child: Stack(children: [
              // Blurred backdrop
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => Navigator.of(dialogContext).pop(),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                    child: Container(color: Colors.transparent),
                  ),
                ),
              ),
              // Dialog content
              Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Container(
                    decoration: BoxDecoration(
                      color:
                          Theme.of(dialogContext).brightness == Brightness.dark
                              ? Colors.black.withValues(alpha: 0.34)
                              : AppTheme.surfacePrimary(context),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                          color: Theme.of(dialogContext).brightness ==
                                  Brightness.dark
                              ? Colors.white.withValues(alpha: 0.08)
                              : const Color(0xFFE2E8F0)),
                      boxShadow:
                          Theme.of(dialogContext).brightness == Brightness.dark
                              ? null
                              : [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.08),
                                    blurRadius: 20,
                                    offset: const Offset(0, 10),
                                  ),
                                ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ListTile(
                          leading: Icon(Icons.photo_camera,
                              color: Theme.of(dialogContext).brightness ==
                                      Brightness.dark
                                  ? Colors.white
                                  : Theme.of(dialogContext)
                                      .colorScheme
                                      .primary),
                          title: Text('Mit Kamera aufnehmen',
                              style: TextStyle(
                                  color: Theme.of(dialogContext).brightness ==
                                          Brightness.dark
                                      ? Colors.white
                                      : AppTheme.textPrimary(dialogContext))),
                          onTap: () =>
                              Navigator.of(dialogContext).pop('camera'),
                        ),
                        Divider(
                            height: 1,
                            color: Theme.of(dialogContext).brightness ==
                                    Brightness.dark
                                ? Colors.white12
                                : const Color(0xFFE2E8F0)),
                        ListTile(
                          leading: Icon(Icons.photo_library,
                              color: Theme.of(dialogContext).brightness ==
                                      Brightness.dark
                                  ? Colors.white
                                  : AppTheme.textBody(dialogContext)),
                          title: Text('Aus Galerie auswählen',
                              style: TextStyle(
                                  color: Theme.of(dialogContext).brightness ==
                                          Brightness.dark
                                      ? Colors.white
                                      : AppTheme.textPrimary(dialogContext))),
                          onTap: () =>
                              Navigator.of(dialogContext).pop('gallery'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ]),
          ),
        );
      },
    );
    if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
      return;
    }
    if (source == 'camera') {
      await _pickFromCamera(owner);
    } else if (source == 'gallery') {
      await _pickFromGallery(owner);
    }
  }

  String _inferMimeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
  }

  Future<void> _submit({bool forceInactive = false}) async {
    if (_submitBusy) return;
    final owner = _listingActions.capture();
    if (owner == null) return;
    setState(() => _submitBusy = true);
    try {
      await _performSubmit(owner, forceInactive: forceInactive);
    } on ListingMutationFailure catch (failure) {
      if (failure.kind == ListingMutationFailureKind.principalChanged ||
          !mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      await _showListingMutationFailure(owner, failure);
    } catch (_) {
      if (!mounted ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      await _showOwnedListingMessage(
        owner,
        title: 'Lokaler Stand nicht verfügbar',
        message:
            'Fotos und Eingaben bleiben erhalten. Lade den Anzeigenstand neu, bevor du den Vorgang wiederholst.',
      );
    } finally {
      if (mounted && _listingActions.isSynchronouslyCurrent(owner)) {
        setState(() => _submitBusy = false);
      }
    }
  }

  Future<void> _performSubmit(
    ListingMutationActionOwner owner, {
    bool forceInactive = false,
  }) async {
    if (!_formKey.currentState!.validate()) {
      if (mounted) {
        await _showOwnedListingMessage(
          owner,
          title: 'Bitte Felder prüfen',
          message:
              'Einige Pflichtfelder sind noch unvollständig. Bitte fülle die markierten Felder aus.',
        );
      }
      return;
    }

    if (PrivatePilotConfig.enabled && !_privateStatusConfirmed) {
      await _showOwnedListingMessage(
        owner,
        title: 'Privatstatus bestaetigen',
        message: PrivatePilotConfig.listingPrivateDeclaration,
      );
      return;
    }
    if (PrivatePilotConfig.enabled &&
        !PrivatePilotConfig.categoryAllowed(_categoryId ?? '')) {
      await _showOwnedListingMessage(
        owner,
        title: 'Kategorie im Privat-Pilot nicht zugelassen',
        message:
            'Bitte waehle eine Kategorie aus der technisch freigeschalteten Positivliste.',
      );
      return;
    }
    if (PrivatePilotConfig.enabled &&
        !PrivatePilotConfig.subcategoryAllowed(
          _categoryId ?? '',
          _subcategory ?? '',
        )) {
      await _showOwnedListingMessage(
        owner,
        title: 'Unterkategorie nicht zugelassen',
        message:
            'Bitte waehle eine serverseitig freigeschaltete Unterkategorie.',
      );
      return;
    }

    if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
      return;
    }
    final user = owner.context.user;
    final blueOceanPublication =
        !forceInactive && !_isEdit && _blueOceanDraftId != null;
    if (blueOceanPublication) {
      final missingConfirmation = _blueOceanConfirmations.entries
          .where((entry) => entry.value != true)
          .map((entry) => entry.key)
          .toList(growable: false);
      final revision = _blueOceanAssistant?['revision'];
      final questions =
          revision is Map && revision['clarificationQuestions'] is List
              ? revision['clarificationQuestions'] as List
              : const <dynamic>[];
      final unanswered = questions
          .whereType<Map>()
          .map((entry) => entry['id']?.toString() ?? '')
          .where((id) => !_blueOceanAnsweredQuestions.contains(id))
          .toList(growable: false);
      if (missingConfirmation.isNotEmpty ||
          unanswered.isNotEmpty ||
          !_blueOceanReplacementBandConfirmed) {
        if (!mounted) return;
        setState(() => _blueOceanError =
            'Vor der Veröffentlichung müssen alle Eigentümer-Bestätigungen, '
                'Rückfragen und die Wertspanne geprüft sein.');
        _focusBlueOceanMessage();
        return;
      }
      if (_blueOceanReadyFingerprint == null ||
          _blueOceanReadyFingerprint != _blueOceanEditableFingerprint()) {
        if (!mounted) return;
        setState(() {
          _invalidateBlueOceanReviewState();
          _blueOceanError =
              'Der Anzeigeninhalt wurde nach der letzten vollständigen '
              'Prüfung geändert. Prüfe den Entwurf erneut und bestätige die '
              'abschließende Veröffentlichung danach neu.';
        });
        _focusBlueOceanMessage();
        return;
      }
    }
    final productionBackend =
        BackendConfig.enabled && !QaRuntimeService.isEnabled;
    final acceptedExistingPhotos = productionBackend
        ? _existingPhotos.where(BackendConfig.isManagedListingImageUrl).toList()
        : List<String>.from(_existingPhotos);
    if (!forceInactive &&
        acceptedExistingPhotos.isEmpty &&
        _pickedImages.isEmpty &&
        _blueOceanPhotoUrls.isEmpty) {
      if (!mounted) return;
      await _showOwnedListingMessage(
        owner,
        title: 'Mindestens ein Foto erforderlich',
        message:
            'Füge ein echtes Foto des Artikels hinzu, bevor du die Anzeige veröffentlichst.',
      );
      return;
    }

    final allCities = DataService.getCities();
    String city = _registeredCity ?? allCities.keys.first;
    (double, double) pos = allCities[city] ?? (52.52, 13.405);

    // Always use address mode now
    String locationText = _addressCtrl.text.trim().isNotEmpty
        ? _addressCtrl.text.trim()
        : 'Übergabeort';
    if (_selectedAddrLat != null && _selectedAddrLng != null) {
      pos = (_selectedAddrLat!, _selectedAddrLng!);
    }
    // Try to derive city name from the typed address; fall back to registered city
    final derived = DataService.deriveCityFromAddress(locationText);
    if (derived.isNotEmpty) city = derived;

    final raw = double.tryParse(_priceCtrl.text.replaceAll(',', '.')) ?? 0.0;
    double pricePerDay;
    switch (_priceUnit) {
      case 'week':
        pricePerDay = raw / 7;
        break;
      case 'day':
      default:
        pricePerDay = raw;
        break;
    }

    // Production uploads images to the central backend. Debug/QA keeps the
    // existing local data-URL behavior for deterministic offline fixtures.
    final List<String> photos = List<String>.from(acceptedExistingPhotos);
    if (blueOceanPublication && productionBackend) {
      if (_pickedImages.isNotEmpty &&
          _blueOceanPhotoUrls.length != _pickedImages.length) {
        if (!mounted) return;
        setState(() => _blueOceanError =
            'Die Fotoauswahl stimmt nicht mehr mit dem geprüften Entwurf '
                'überein. Starte die Analyse erneut.');
        _focusBlueOceanMessage();
        return;
      }
      photos.addAll(_blueOceanPhotoUrls);
    } else if (_pickedImages.isNotEmpty) {
      for (final f in _pickedImages) {
        try {
          final bytes = await f.readAsBytes();
          if (!await _listingActions.isCurrent(
            _listingMutationService,
            owner,
          )) {
            return;
          }
          if (productionBackend) {
            photos.add(
              await _listingMutationService.uploadImage(
                context: owner.context,
                bytes: bytes,
                filename: f.name,
              ),
            );
          } else {
            final b64 = base64Encode(bytes);
            final mime = _inferMimeFromName(f.name);
            photos.add('data:$mime;base64,$b64');
          }
        } catch (error) {
          if (productionBackend) rethrow;
          debugPrint('Local image processing failed: $error');
        }
      }
    }
    if (!_isEdit) {
      final item = Item(
        id: 'new',
        ownerId: user.id,
        title: _titleCtrl.text.trim(),
        description: _descCtrl.text.trim(),
        categoryId: _categoryId ??
            (_categories.isNotEmpty ? _categories.first.id : 'cat1'),
        subcategory: _subcategory!,
        tags: const <String>[],
        pricePerDay: pricePerDay,
        currency: 'EUR',
        priceUnit: _priceUnit,
        priceRaw: raw,
        photos: photos,
        locationText: locationText,
        lat: pos.$1,
        lng: pos.$2,
        geohash: 'u${DateTime.now().millisecondsSinceEpoch}',
        condition: _condition,
        minDays: 1,
        maxDays: 30,
        createdAt: DateTime.now(),
        isActive: forceInactive ? false : true,
        verificationStatus: 'pending',
        city: city,
        country: 'Deutschland',
        status: forceInactive ? 'draft' : 'active',
        offersDeliveryAtDropoff:
            PrivatePilotConfig.deliveryEnabled && _offersDeliveryAtDropoff,
        offersPickupAtReturn:
            PrivatePilotConfig.deliveryEnabled && _offersPickupAtReturn,
        offersExpressAtDropoff: false, // deprecated option removed from UI
        maxDeliveryKmAtDropoff:
            PrivatePilotConfig.deliveryEnabled ? _maxDistanceKm : null,
        maxPickupKmAtReturn:
            PrivatePilotConfig.deliveryEnabled ? _maxDistanceKm : null,
        cancellationPolicy: 'unified',
        availabilityMode: 'calendar',
        autoApplyDiscounts: _autoApplyDiscounts,
        longRentalDiscounts: ([
          LongRentalDiscount(days: _tier1Days, discountPercent: _tier1Pct),
          LongRentalDiscount(days: _tier2Days, discountPercent: _tier2Pct),
          LongRentalDiscount(days: _tier3Days, discountPercent: _tier3Pct),
        ]..sort((a, b) => a.days.compareTo(b.days))),
        privateStatusConfirmed: _privateStatusConfirmed,
      );

      final result = await _listingMutationService.execute(
        context: owner.context,
        command: ListingMutationCommand.create(
          item,
          supplyEnrichmentLink: widget.supplyPrefill?.link.toJson(),
          blueOceanDraftId: blueOceanPublication ? _blueOceanDraftId : null,
          blueOceanReview: blueOceanPublication
              ? _blueOceanReviewPayload(finalPublication: true)
              : null,
        ),
      );
      final saved = result.item!;
      if (!mounted) return;
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      if (!mounted) return;
      try {
        await _clearBlueOceanRecoverySnapshot();
      } catch (error) {
        debugPrint('Blue Ocean recovery cleanup unavailable: $error');
      }
      if (!mounted) return;
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      if (!mounted) return;
      DataService.setLastCreateEventForOwner(
        owner.context.owner.authOwner,
        saved,
        draft: forceInactive,
      );
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const MainNavigation()),
        (route) => false,
      );
      return;
    }

    // Edit flow: update existing item in place
    final ex = widget.existing!;
    final updated = Item(
      id: ex.id,
      ownerId: ex.ownerId,
      title: _titleCtrl.text.trim(),
      description: _descCtrl.text.trim(),
      categoryId: _categoryId ?? ex.categoryId,
      subcategory: _subcategory ?? ex.subcategory,
      tags: ex.tags,
      pricePerDay: pricePerDay,
      currency: ex.currency,
      priceUnit: _priceUnit,
      priceRaw: raw,
      photos: photos,
      locationText: locationText,
      lat: pos.$1,
      lng: pos.$2,
      geohash: ex.geohash,
      condition: _condition,
      minDays: ex.minDays,
      maxDays: ex.maxDays,
      createdAt: ex.createdAt,
      isActive: !forceInactive,
      verificationStatus: ex.verificationStatus,
      city: city,
      country: ex.country,
      status: forceInactive ? 'draft' : 'active',
      endedAt: forceInactive ? null : ex.endedAt,
      timesLent: ex.timesLent,
      offersDeliveryAtDropoff:
          PrivatePilotConfig.deliveryEnabled && _offersDeliveryAtDropoff,
      offersPickupAtReturn:
          PrivatePilotConfig.deliveryEnabled && _offersPickupAtReturn,
      offersExpressAtDropoff: false, // deprecated option removed from UI
      maxDeliveryKmAtDropoff:
          PrivatePilotConfig.deliveryEnabled ? _maxDistanceKm : null,
      maxPickupKmAtReturn:
          PrivatePilotConfig.deliveryEnabled ? _maxDistanceKm : null,
      cancellationPolicy: 'unified',
      availabilityMode: ex.availabilityMode,
      autoApplyDiscounts: _autoApplyDiscounts,
      longRentalDiscounts: ([
        LongRentalDiscount(days: _tier1Days, discountPercent: _tier1Pct),
        LongRentalDiscount(days: _tier2Days, discountPercent: _tier2Pct),
        LongRentalDiscount(days: _tier3Days, discountPercent: _tier3Pct),
      ]..sort((a, b) => a.days.compareTo(b.days))),
      privateStatusConfirmed: _privateStatusConfirmed,
      catalogRevision: ex.catalogRevision,
    );

    final result = await _listingMutationService.execute(
      context: owner.context,
      command: ListingMutationCommand.update(updated),
    );
    final savedUpdate = result.item!;
    if (!mounted) return;
    if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
      return;
    }
    if (!mounted) return;
    if (forceInactive) {
      // Save edits only: return to "Meine Anzeigen" → drafts.
      // We intentionally do NOT show a toast here because popping immediately after
      // opening a dialog would just close the dialog. The caller screen will
      // display the confirmation toast after navigation.
      Navigator.of(context).pop('drafts');
    } else {
      // Publish and show the same popup in Explore
      DataService.setLastCreateEventForOwner(
        owner.context.owner.authOwner,
        savedUpdate,
        draft: false,
      );
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const MainNavigation()),
        (route) => false,
      );
    }
  }

  Future<void> _showListingMutationFailure(
    ListingMutationActionOwner owner,
    ListingMutationFailure failure,
  ) =>
      _showOwnedListingMessage(
        owner,
        title: failure.remoteAccepted
            ? 'Serverseitig gespeichert'
            : failure.kind == ListingMutationFailureKind.outcomeUnknown
                ? 'Speicherstatus unklar'
                : 'Speichern abgelehnt',
        message: failure.remoteAccepted
            ? 'Der Server hat die Anzeige verarbeitet, aber der lokale Stand konnte noch nicht sicher aktualisiert werden. Bitte lade deine Anzeigen neu.'
            : failure.kind == ListingMutationFailureKind.outcomeUnknown
                ? 'Die Anzeige könnte serverseitig verarbeitet worden sein. Bitte lade deine Anzeigen neu und prüfe den Stand, bevor du erneut speicherst.'
                : 'Der Server hat die Änderung eindeutig abgelehnt. Fotos und Eingaben bleiben erhalten.',
      );

  Future<void> _showOwnedListingMessage(
    ListingMutationActionOwner owner, {
    required String title,
    required String message,
  }) =>
      _listingActions.showOwnedDialog<void>(
        context: context,
        owner: owner,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );

  // --- Address Autocomplete: debounced query ---
  void _onAddressQueryChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 220), () async {
      if (q.trim().isEmpty) {
        setState(() {
          _addrSuggestions = const [];
          _addrSuggestionsUnavailable = false;
        });
        return;
      }
      try {
        final results = await _fetchAutocomplete(q);
        if (!mounted) return;
        setState(() {
          _addrSuggestions = results;
          _addrSuggestionsUnavailable = false;
        });
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _addrSuggestions = const [];
          _addrSuggestionsUnavailable = true;
        });
      }
    });
  }

  void _schedulePriceRecalc() {
    if (!PrivatePilotConfig.aiFeaturesEnabled) return;
    _priceRecalcDebounce?.cancel();
    _priceRecalcDebounce = Timer(const Duration(milliseconds: 450), () async {
      await _calculatePriceSuggestion();
      if (!_discountsTouched) {
        _applyModeDiscountPreset();
      }
    });
  }

  // Coarse/top-level category icon mapping (keep in sync with filters overlay)
  IconData _coarseIconForGroup(String group) {
    final g = group.toLowerCase();
    if (g.contains('technik')) return Icons.devices;
    if (g.contains('haushalt') || g.contains('wohnen')) return Icons.weekend;
    if (g.contains('fahrzeuge') || g.contains('mobil')) {
      return Icons.directions_car;
    }
    if (g.contains('mode') || g.contains('lifestyle')) return Icons.checkroom;
    if (g.contains('sport') || g.contains('hobby') || g.contains('hobb')) {
      return Icons.sports_soccer;
    }
    if (g.contains('werkzeuge') ||
        g.contains('geräte') ||
        g.contains('geraete')) {
      return Icons.construction;
    }
    if (g.contains('garten') || g.contains('hof')) return Icons.grass;
    if (g.contains('event') || g.contains('feier') || g.contains('party')) {
      return Icons.celebration;
    }
    if (g.contains('reise') || g.contains('camping')) {
      return Icons.travel_explore;
    }
    if (g.contains('büro') || g.contains('buero') || g.contains('gewerbe')) {
      return Icons.business_center;
    }
    if (g.contains('baby') || g.contains('kinder')) return Icons.child_friendly;
    if (g.contains('haustier')) return Icons.pets;
    return Icons.category;
  }

  String _currentCoarseLabel() {
    if (_categoryId == null || _categories.isEmpty) return 'Kategorie';
    final fine = _categories.firstWhere(
      (c) => c.id == _categoryId,
      orElse: () => _categories.first,
    );
    return DataService.coarseCategoryFor(fine.name);
  }

  List<String> _availableSubcategories() {
    if (_categoryId == null || _categories.isEmpty) return const [];
    final category = _categories.firstWhere(
      (candidate) => candidate.id == _categoryId,
      orElse: () => _categories.first,
    );
    return category.subcategories
        .where((subcategory) => PrivatePilotConfig.subcategoryAllowed(
              category.id,
              subcategory,
            ))
        .toList(growable: false);
  }

  Future<void> _pickCategory() async {
    if (_coarseCats.isEmpty) return;
    final tiles = _coarseCats.map((label) {
      final list = _catsByCoarse[label] ?? const <Category>[];
      final id = list.isNotEmpty ? list.first.id : label;
      return CategoryChipData(
          id: id, label: label, icon: _coarseIconForGroup(label));
    }).toList();

    final selected = await AllCategoriesOverlay.show(context, tiles);
    if (selected != null) {
      // Map back from coarse label to a representative fine category id (first in group)
      final list = _catsByCoarse.entries
          .firstWhere((e) => (e.value).any((c) => c.id == selected),
              orElse: () => MapEntry('', const <Category>[]))
          .value;
      final target = list.isNotEmpty ? list.first.id : selected;
      final subcategories = _categories
          .firstWhere(
            (category) => category.id == target,
            orElse: () => _categories.first,
          )
          .subcategories
          .where((subcategory) =>
              PrivatePilotConfig.subcategoryAllowed(target, subcategory))
          .toList(growable: false);
      setState(() {
        _categoryId = target;
        _subcategory = subcategories.isEmpty ? null : subcategories.first;
        _invalidateBlueOceanReviewState(
          confirmations: const <String>['allowed_category'],
          clearClarifications: true,
        );
      });
      _schedulePriceRecalc();
    }
  }

  Future<void> _calculatePriceSuggestion() async {
    if (!PrivatePilotConfig.aiFeaturesEnabled) return;
    // Only calculate if all required fields are filled
    if (_titleCtrl.text.trim().isEmpty ||
        _categoryId == null ||
        _addressCtrl.text.trim().isEmpty) {
      return;
    }

    // Get category name
    final cat = _categories.firstWhere((c) => c.id == _categoryId,
        orElse: () => _categories.first);
    final categoryName = DataService.coarseCategoryFor(cat.name);

    if (!OpenAIConfig.isAvailable) {
      await AppPopup.toast(
        context,
        icon: Icons.info_outline,
        title: 'KI-Hilfe ist vorübergehend deaktiviert',
        message: 'Bitte gib die Details manuell ein.',
      );
      return;
    }

    // The compatibility helper is fail-closed and currently returns only a
    // deterministic local fallback; no listing content leaves the device.
    final result = await OpenAIConfig.suggestPrice(
      title: _titleCtrl.text.trim(),
      description: _descCtrl.text.trim(),
      category: categoryName,
      condition: _condition,
      location: _addressCtrl.text.trim(),
    );

    setState(() {
      // Be defensive: values may come back as int on web → cast via num
      final dailyPrice = (result['dailyPrice'] as num).toDouble();
      final weeklyPrice = (result['weeklyPrice'] as num).toDouble();
      final reasoning = (result['reasoning'] as String);

      // IMPORTANT: One market-price truth (independent of mode)
      final mMin = (dailyPrice * 0.9);
      final mMax = (dailyPrice * 1.1);
      _marketPriceMin = mMin;
      _marketPriceMax = mMax;

      _priceSuggestion = PriceSuggestion(
        dailyPriceMin: mMin,
        dailyPriceMax: mMax,
        weeklyPriceMin: weeklyPrice * 0.9,
        weeklyPriceMax: weeklyPrice * 1.1,
        reasoning: reasoning,
        // Keep messaging neutral and factual – no % promises
        optimizationTip:
            'Richte den Preis an der Marktspanne aus und nutze Rabatte sinnvoll.',
      );
      _hasCalculatedPrice = true;
    });

    // Auto-fill the price field based on selected mode unless user has manually edited
    if (!_priceTouched) {
      _autofillPriceFromMarket();
    }

    // Also set discount presets based on mode unless manually edited
    if (!_hasCalculatedDiscounts || !_discountsTouched) {
      _applyModeDiscountPreset();
    }
  }

  // Apply fixed, mode-based discount presets unless user touched them
  void _applyModeDiscountPreset({bool force = false}) {
    if (_discountsTouched && !force) return;
    setState(() {
      if (_priceStrategy == 'quick') {
        // Schnell vermieten – aggressive Rabatte
        _tier1Days = 3;
        _tier1Pct = 15;
        _tier2Days = 5;
        _tier2Pct = 25;
        _tier3Days = 8;
        _tier3Pct = 35;
      } else {
        // Maximaler Gewinn – moderate Rabatte
        _tier1Days = 3;
        _tier1Pct = 8;
        _tier2Days = 5;
        _tier2Pct = 15;
        _tier3Days = 8;
        _tier3Pct = 25;
      }
      _hasCalculatedDiscounts = true;
      _invalidateBlueOceanReviewState(
        confirmations: const <String>['duration_discounts'],
      );
    });
  }

  // Compute price from market range according to current mode
  void _autofillPriceFromMarket() {
    final min = _marketPriceMin;
    final max = _marketPriceMax;
    if (min == null || max == null) return;
    // Small offset to avoid exact boundary numbers
    const double offset = 1.0;
    double price = _priceStrategy == 'quick' ? (min + offset) : (max - offset);
    // Clamp to [min, max]
    if (price < min) price = min;
    if (price > max) price = max;
    _priceCtrl.text =
        price.toStringAsFixed(price.truncateToDouble() == price ? 0 : 2);
    _invalidateBlueOceanReviewState(
      confirmations: const <String>['owner_price'],
    );
  }

  Widget _buildBlueOceanAssistantCard(BuildContext context) {
    final assistant = _blueOceanAssistant;
    final revision = assistant?['revision'];
    final fields = revision is Map ? revision['fields'] : null;
    final questions =
        revision is Map && revision['clarificationQuestions'] is List
            ? revision['clarificationQuestions'] as List
            : const <dynamic>[];
    final recommendation = assistant?['recommendation'];
    final ownerOptions =
        recommendation is Map && recommendation['ownerOptions'] is List
            ? recommendation['ownerOptions'] as List
            : const <dynamic>[];
    final quotePreviews = assistant?['quotePreviews'] is List
        ? assistant!['quotePreviews'] as List
        : const <dynamic>[];
    final readiness = assistant?['readiness'];
    final exactCurrentStateIsReady = readiness is Map &&
        readiness['readyToPublish'] == true &&
        _blueOceanReadyFingerprint != null &&
        _blueOceanReadyFingerprint == _blueOceanEditableFingerprint();
    const confirmationLabels = <String, String>{
      'ownership': 'Der Artikel gehört mir oder ich darf ihn vermieten.',
      'item_identity': 'Artikel, Marke, Modell und Beschreibung sind geprüft.',
      'allowed_category': 'Kategorie und Unterkategorie sind korrekt.',
      'functionality': 'Der Artikel funktioniert vollständig.',
      'condition': 'Der angegebene Zustand ist korrekt.',
      'accessories': 'Das aufgeführte Zubehör ist vollständig und korrekt.',
      'owner_price': 'Ich bestätige meinen ausgewählten Tagespreis.',
      'duration_discounts': 'Ich bestätige die Einstellungen zur Mietdauer.',
      'availability': 'Die Verfügbarkeit kann von mir eingehalten werden.',
      'pickup_region': 'Die grobe Abholregion ist korrekt.',
      'final_publication':
          'Ich habe die vollständige Vorschau geprüft und möchte veröffentlichen.',
    };
    const bandLabels = <String, String>{
      'under_100': 'unter 100 €',
      'eur_100_250': '100–250 €',
      'eur_250_500': '250–500 €',
      'eur_500_1000': '500–1.000 €',
      'over_1000': 'über 1.000 €',
    };
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Focus(
      focusNode: _blueOceanErrorFocus,
      child: Semantics(
        container: true,
        label: 'SIT KI-Anzeigenassistent, geschlossener technischer Pilot',
        child: Container(
          key: _blueOceanCardKey,
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF0D1B2A) : const Color(0xFFF0F7FF),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Theme.of(context).colorScheme.primary),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.auto_awesome_outlined,
                    color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('KI-Anzeigenassistent',
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      const Text(
                        'Geschlossener Stage-A-Test. Jeder Vorschlag bleibt '
                        'bearbeitbar. Es wird nie automatisch veröffentlicht.',
                        style: TextStyle(fontSize: 13.5, height: 1.4),
                      ),
                    ],
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              Semantics(
                liveRegion: false,
                label: PrivatePilotConfig.blueOceanStageANonBindingNotice,
                child: const Text(
                  PrivatePilotConfig.blueOceanStageANonBindingNotice,
                  style: TextStyle(fontSize: 13.5, height: 1.4),
                ),
              ),
              const SizedBox(height: 12),
              CheckboxListTile(
                value: _blueOceanConsentAccepted,
                onChanged: _blueOceanBusy
                    ? null
                    : (value) => setState(
                        () => _blueOceanConsentAccepted = value ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: const Text(_blueOceanDisclosureText,
                    style: TextStyle(fontSize: 13.5, height: 1.4)),
                subtitle: const Text(
                  'Nur die ausgewählten 1–4 Fotos · ausdrücklicher Start · '
                  'keine automatische Veröffentlichung',
                  style: TextStyle(fontSize: 12.5),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _blueOceanBusy ? null : _startBlueOceanAssistant,
                  icon: const Icon(Icons.photo_camera_back_outlined),
                  label: const Text('Ausgewählte Fotos analysieren'),
                ),
              ),
              if (_blueOceanBusy || _blueOceanProgress.isNotEmpty) ...[
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  label: _blueOceanProgress,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_blueOceanBusy) const LinearProgressIndicator(),
                      if (_blueOceanBusy) const SizedBox(height: 8),
                      Text(_blueOceanProgress,
                          style: const TextStyle(fontSize: 13.5)),
                    ],
                  ),
                ),
              ],
              if (_blueOceanError case final message?) ...[
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  label: 'Hinweis: $message',
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .errorContainer
                          .withValues(alpha: 0.72),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.info_outline,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onErrorContainer),
                          const SizedBox(width: 8),
                          Expanded(child: Text(message)),
                        ]),
                  ),
                ),
              ],
              if (_blueOceanDraftId != null && fields is Map) ...[
                const SizedBox(height: 18),
                Text('Bearbeitbarer KI-Entwurf',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: fields.entries.map<Widget>((entry) {
                    final field = entry.value;
                    final confidence = field is Map
                        ? field['confidence']?.toString() ?? 'LOW'
                        : 'LOW';
                    final icon = confidence == 'HIGH'
                        ? Icons.check_circle_outline
                        : confidence == 'MEDIUM'
                            ? Icons.rate_review_outlined
                            : Icons.help_outline;
                    final label = confidence == 'HIGH'
                        ? 'hoch – bearbeitbar'
                        : confidence == 'MEDIUM'
                            ? 'bitte prüfen'
                            : 'Angabe fehlt';
                    return Semantics(
                      label: '${entry.key}: $label',
                      child: Chip(
                        avatar: Icon(icon, size: 17),
                        label: Text('${entry.key}: $label'),
                      ),
                    );
                  }).toList(growable: false),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _blueOceanBrandCtrl,
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      confirmations: const <String>['item_identity'],
                      clearClarifications: true,
                    );
                  }),
                  decoration: const InputDecoration(labelText: 'Marke'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _blueOceanModelCtrl,
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      confirmations: const <String>['item_identity'],
                      clearClarifications: true,
                    );
                  }),
                  decoration: const InputDecoration(
                    labelText: 'Modell (leer lassen, wenn unbekannt)',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _blueOceanAccessoriesCtrl,
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      confirmations: const <String>['accessories'],
                      clearClarifications: true,
                    );
                  }),
                  decoration: const InputDecoration(
                    labelText: 'Zubehör, durch Kommas getrennt',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _blueOceanProjectTagsCtrl,
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      clearClarifications: true,
                    );
                  }),
                  decoration: const InputDecoration(
                    labelText: 'Projekt-Tags, durch Kommas getrennt',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _blueOceanUseCasesCtrl,
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      clearClarifications: true,
                    );
                  }),
                  decoration: const InputDecoration(
                    labelText: 'Einsatzmöglichkeiten, durch Kommas getrennt',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _blueOceanSafetyCtrl,
                  minLines: 2,
                  maxLines: 4,
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      clearClarifications: true,
                    );
                  }),
                  decoration: const InputDecoration(
                    labelText: 'Sicherheits- und Nutzungshinweise',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _blueOceanPickupRegionCtrl,
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      confirmations: const <String>['pickup_region'],
                      clearClarifications: true,
                    );
                  }),
                  decoration: const InputDecoration(
                    labelText: 'Grobe Abholregion (keine genaue Adresse)',
                  ),
                ),
                const SizedBox(height: 14),
                Text('Rückfragen (höchstens drei)',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                if (questions.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Text('Keine Rückfrage offen.'),
                  )
                else
                  for (final rawQuestion in questions)
                    if (rawQuestion is Map)
                      CheckboxListTile(
                        value: _blueOceanAnsweredQuestions
                            .contains(rawQuestion['id']?.toString()),
                        onChanged: (value) => setState(() {
                          _blueOceanConfirmations['final_publication'] = false;
                          _blueOceanReadyFingerprint = null;
                          final id = rawQuestion['id']?.toString() ?? '';
                          if (value == true) {
                            _blueOceanAnsweredQuestions.add(id);
                          } else {
                            _blueOceanAnsweredQuestions.remove(id);
                          }
                        }),
                        controlAffinity: ListTileControlAffinity.leading,
                        contentPadding: EdgeInsets.zero,
                        title: Text(rawQuestion['question']?.toString() ?? ''),
                        subtitle: const Text(
                            'Angabe im Entwurf ergänzen und danach abhaken.'),
                      ),
                const SizedBox(height: 12),
                Text('Wiederbeschaffungswert',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _blueOceanReplacementBand,
                  decoration: const InputDecoration(labelText: 'Wertspanne'),
                  items: bandLabels.entries
                      .map((entry) => DropdownMenuItem(
                            value: entry.key,
                            child: Text(entry.value),
                          ))
                      .toList(growable: false),
                  onChanged: (value) => setState(() {
                    if (value != null) _blueOceanReplacementBand = value;
                    _invalidateBlueOceanReviewState(
                      resetReplacementBand: true,
                    );
                  }),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _blueOceanReplacementValueCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(() {
                    _invalidateBlueOceanReviewState(
                      resetReplacementBand: true,
                    );
                  }),
                  decoration: const InputDecoration(
                    labelText: 'Geschätzter Wert in Euro',
                  ),
                ),
                CheckboxListTile(
                  value: _blueOceanReplacementBandConfirmed,
                  onChanged: (value) => setState(() {
                    _invalidateBlueOceanReviewState();
                    _blueOceanReplacementBandConfirmed = value ?? false;
                  }),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    'Ich bestätige die Wertspanne. Sie wird nur verwendet, '
                    'wenn für diese Artikelart eine passende '
                    'deterministische Preisregel vorhanden ist.',
                  ),
                ),
                const SizedBox(height: 12),
                Text('Eigentümer-Bestätigungen',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const Text(
                  'Funktionalität und die abschließende Publikationsprüfung '
                  'sind harte Sperren.',
                  style: TextStyle(fontSize: 13, height: 1.35),
                ),
                for (final entry in confirmationLabels.entries)
                  CheckboxListTile(
                    value: _blueOceanConfirmations[entry.key] ?? false,
                    onChanged: (value) => setState(() {
                      _blueOceanReadyFingerprint = null;
                      if (entry.key != 'final_publication') {
                        _blueOceanConfirmations['final_publication'] = false;
                      }
                      _blueOceanConfirmations[entry.key] = value ?? false;
                    }),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                    title: Text(entry.value),
                  ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed:
                        _blueOceanBusy ? null : _reviewBlueOceanAssistant,
                    icon: const Icon(Icons.fact_check_outlined),
                    label: const Text('Entwurf und Preisvorschau prüfen'),
                  ),
                ),
              ],
              if (recommendation is Map) ...[
                const SizedBox(height: 18),
                Text('Unverbindliche SIT-Preisempfehlung',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  '${recommendation['explanation'] ?? ''}\n'
                  'Vertrauen: ${recommendation['confidence'] ?? 'LOW'}. '
                  'Du entscheidest über deinen Mietpreis.',
                  style: const TextStyle(fontSize: 13.5, height: 1.4),
                ),
                const SizedBox(height: 8),
                for (final rawOption in ownerOptions)
                  if (rawOption is Map && rawOption['dailyPriceMinor'] is num)
                    Builder(builder: (context) {
                      final minor =
                          (rawOption['dailyPriceMinor'] as num).toInt();
                      final selectedMinor = (() {
                        final euros = double.tryParse(
                            _priceCtrl.text.replaceAll(',', '.'));
                        return euros == null ? null : (euros * 100).round();
                      })();
                      final selected = minor == selectedMinor;
                      return Semantics(
                        button: true,
                        selected: selected,
                        label:
                            '${rawOption['label'] ?? ''}, ${(minor / 100).toStringAsFixed(2)} Euro pro Tag',
                        child: ListTile(
                          onTap: () => setState(() {
                            _priceCtrl.text = (minor / 100).toStringAsFixed(2);
                            _invalidateBlueOceanReviewState(
                              confirmations: const <String>['owner_price'],
                            );
                          }),
                          leading: Icon(selected
                              ? Icons.radio_button_checked
                              : Icons.radio_button_unchecked),
                          title: Text(rawOption['label']?.toString() ?? ''),
                          subtitle: Text(
                              '${(minor / 100).toStringAsFixed(2)} € pro Tag · bearbeitbar'),
                        ),
                      );
                    }),
              ],
              if (assistant?['priceMode'] ==
                  'owner_manual_no_recommendation') ...[
                const SizedBox(height: 18),
                Text('Tagespreis selbst festlegen',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  assistant?['priceNotice']?.toString() ??
                      'Für diese Artikelart ist keine SIT-Preisempfehlung '
                          'verfügbar. Dein bestätigter Tagespreis bleibt '
                          'maßgeblich.',
                  style: const TextStyle(fontSize: 13.5, height: 1.4),
                ),
              ],
              if (quotePreviews.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text('Mietdauer- und V5.2-Gebührenvorschau',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const Text(
                  'Reine Simulation ohne Zahlung, Kaution oder versteckte Gebühr.',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 8),
                for (final rawPreview in quotePreviews)
                  if (rawPreview is Map)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.calculate_outlined),
                      title: Text('${rawPreview['days']} Tag(e)'),
                      subtitle: Text(
                        'Vermieter-Miete: ${_formatMinor(rawPreview['ownerRentMinor'])} · '
                        'SIT-Beitrag: ${_formatMinor(rawPreview['sitPlatformContributionMinor'])} · '
                        'Mieter gesamt: ${_formatMinor(rawPreview['renterTotalMinor'])}',
                      ),
                    ),
              ],
              if (readiness is Map) ...[
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: exactCurrentStateIsReady
                          ? Colors.green.withValues(alpha: 0.12)
                          : Colors.amber.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(exactCurrentStateIsReady
                              ? Icons.check_circle_outline
                              : Icons.pending_actions_outlined),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              exactCurrentStateIsReady
                                  ? 'READY_TO_PUBLISH: Die vollständige Vorschau '
                                      'ist bereit. Nur der Button „Anzeige '
                                      'veröffentlichen“ darf jetzt publizieren.'
                                  : 'NEEDS_REVIEW: Prüfe offene Rückfragen, '
                                      'Bestätigungen, Preis und Vorschau.',
                            ),
                          ),
                        ]),
                  ),
                ),
              ],
              const SizedBox(height: 10),
              const Text(
                'Du kannst den KI-Pfad jederzeit verlassen und alle Felder '
                'im normalen Editor manuell bearbeiten.',
                style: TextStyle(fontSize: 12.5, height: 1.35),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatMinor(dynamic value) {
    if (value is! num) return '–';
    return '${(value / 100).toStringAsFixed(2).replaceAll('.', ',')} €';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    // Auto-calculate price suggestion when all required fields are filled (only once)
    if (PrivatePilotConfig.aiFeaturesEnabled &&
        !_hasCalculatedPrice &&
        _titleCtrl.text.trim().isNotEmpty &&
        _categoryId != null &&
        _addressCtrl.text.trim().isNotEmpty) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _calculatePriceSuggestion());
    }
    return Scaffold(
      appBar: AppBar(
          title: Text(_isEdit ? 'Anzeige bearbeiten' : 'Neue Anzeige'),
          centerTitle: true),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Theme(
            data: theme.copyWith(
                inputDecorationTheme: InputDecorationTheme(
                  filled: true,
                  fillColor: isDark
                      ? const Color(0x1FFFFFFF)
                      : const Color(0xFFFFFFFF),
                  labelStyle: TextStyle(
                      color: isDark
                          ? Colors.white
                          : AppTheme.textSecondary(context),
                      fontSize: 15,
                      fontWeight: FontWeight.w500),
                  floatingLabelStyle: TextStyle(
                      color: colorScheme.primary,
                      fontSize: 15,
                      fontWeight: FontWeight.w600),
                  floatingLabelBehavior: FloatingLabelBehavior.auto,
                  hintStyle: TextStyle(
                      color: isDark
                          ? Colors.white70
                          : AppTheme.textDisabled(context),
                      fontSize: 14),
                  border: OutlineInputBorder(
                      borderSide: BorderSide(
                          color: isDark
                              ? Colors.white24
                              : AppTheme.glassStroke(context)),
                      borderRadius:
                          const BorderRadius.all(Radius.circular(12))),
                  enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(
                          color: isDark
                              ? Colors.white24
                              : AppTheme.glassStroke(context)),
                      borderRadius:
                          const BorderRadius.all(Radius.circular(12))),
                  focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: colorScheme.primary),
                      borderRadius:
                          const BorderRadius.all(Radius.circular(12))),
                  prefixStyle: TextStyle(
                      color:
                          isDark ? Colors.white : AppTheme.textBody(context)),
                ),
                dropdownMenuTheme: DropdownMenuThemeData(
                    menuStyle: MenuStyle(
                        backgroundColor: WidgetStatePropertyAll(isDark
                            ? const Color(0xE6000000)
                            : const Color(0xFFFFFFFF))))),
            child: Form(
              key: _formKey,
              child: Column(children: [
                _Section(
                    title: 'Kategorie',
                    leading: Icon(Icons.widgets_outlined,
                        color: colorScheme.primary, size: 18),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          InkWell(
                            onTap: _pickCategory,
                            borderRadius: BorderRadius.circular(12),
                            child: InputDecorator(
                              decoration: const InputDecoration(
                                  hintText: 'Kategorie wählen'),
                              child: Row(children: [
                                Icon(_coarseIconForGroup(_currentCoarseLabel()),
                                    color: isDark
                                        ? Colors.white
                                        : AppTheme.textPrimary(context)),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    // In "Neue Anzeige" show the selected category on a single line
                                    _currentCoarseLabel(),
                                    style: TextStyle(
                                        color: isDark
                                            ? Colors.white
                                            : AppTheme.textBody(context),
                                        fontSize: 15,
                                        fontWeight: FontWeight.w500),
                                    maxLines: 1,
                                    softWrap: false,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                )
                              ]),
                            ),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            key: ValueKey(_categoryId),
                            isExpanded: true,
                            initialValue:
                                _availableSubcategories().contains(_subcategory)
                                    ? _subcategory
                                    : null,
                            decoration: const InputDecoration(
                              labelText: 'Unterkategorie',
                            ),
                            items: _availableSubcategories()
                                .map((subcategory) => DropdownMenuItem(
                                      value: subcategory,
                                      child: Text(
                                        subcategory,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ))
                                .toList(growable: false),
                            onChanged: (value) => setState(() {
                              _subcategory = value;
                              _invalidateBlueOceanReviewState(
                                confirmations: const <String>[
                                  'allowed_category'
                                ],
                                clearClarifications: true,
                              );
                            }),
                            validator: (value) =>
                                PrivatePilotConfig.subcategoryAllowed(
                              _categoryId ?? '',
                              value ?? '',
                            )
                                    ? null
                                    : 'Unterkategorie auswählen',
                          )
                        ])),
                const SizedBox(height: 12),
                const SizedBox(height: 12),
                _Section(
                    title: 'Details',
                    leading: Icon(Icons.description_outlined,
                        color: colorScheme.primary, size: 18),
                    child: Column(children: [
                      TextFormField(
                        controller: _titleCtrl,
                        style: TextStyle(
                            color: isDark
                                ? Colors.white
                                : AppTheme.textBody(context),
                            fontSize: 15,
                            fontWeight: FontWeight.w500),
                        decoration: const InputDecoration(
                            labelText: 'Titel', hintText: 'Was bietest du an?'),
                        onChanged: (_) {
                          setState(() {
                            _invalidateBlueOceanReviewState(
                              confirmations: const <String>['item_identity'],
                              clearClarifications: true,
                            );
                          });
                          _schedulePriceRecalc();
                        },
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'Titel ist erforderlich'
                            : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _descCtrl,
                        maxLines: 5,
                        style: TextStyle(
                            color: isDark
                                ? Colors.white
                                : AppTheme.textBody(context),
                            fontSize: 15,
                            fontWeight: FontWeight.w500),
                        decoration: const InputDecoration(
                            labelText: 'Beschreibung',
                            hintText:
                                'Beschreibe Zustand, Zubehör, Abholung …'),
                        onChanged: (_) {
                          setState(() {
                            _invalidateBlueOceanReviewState(
                              confirmations: const <String>['item_identity'],
                              clearClarifications: true,
                            );
                          });
                          _schedulePriceRecalc();
                        },
                        validator: (v) => (v == null || v.trim().length < 10)
                            ? 'Mindestens 10 Zeichen'
                            : null,
                      ),
                    ])),
                const SizedBox(height: 12),
                // Fotos kommt vor Zustand
                _Section(
                    title: 'Fotos',
                    leading: Icon(Icons.photo_library_outlined,
                        color: colorScheme.primary, size: 18),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Builder(builder: (context) {
                            final restoredBlueOceanPhotos =
                                _blueOceanDraftId != null &&
                                        _pickedImages.isEmpty
                                    ? _blueOceanPhotoUrls
                                    : const <String>[];
                            final hasAnyPhotos = _existingPhotos.isNotEmpty ||
                                _pickedImages.isNotEmpty ||
                                restoredBlueOceanPhotos.isNotEmpty;
                            if (!hasAnyPhotos) {
                              // Center the + photo button horizontally (and give the card some height) when there are no images yet
                              return SizedBox(
                                height: 120,
                                child: Center(
                                    child: _AddPhotoTile(
                                        onTap: _showPhotoSourceSheet)),
                              );
                            }
                            // When there are photos, show the grid-like wrap (the + button stays inline)
                            return Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              alignment: WrapAlignment.center,
                              runAlignment: WrapAlignment.center,
                              children: [
                                // Show existing photos (non-removable) when editing
                                if (_existingPhotos.isNotEmpty)
                                  for (final url in _existingPhotos)
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: SizedBox(
                                          width: 84,
                                          height: 84,
                                          child: AppImage(
                                              url: url, fit: BoxFit.cover)),
                                    ),
                                for (final url in restoredBlueOceanPhotos)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: SizedBox(
                                      width: 84,
                                      height: 84,
                                      child: AppImage(
                                        url: url,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                  ),
                                for (int i = 0; i < _pickedImages.length; i++)
                                  _PickedThumb(
                                      file: _pickedImages[i],
                                      onRemove: () => setState(() {
                                            _clearBlueOceanDraftForPhotoChange();
                                            _pickedImages.removeAt(i);
                                          })),
                                _AddPhotoTile(onTap: _showPhotoSourceSheet),
                              ],
                            );
                          }),
                          const SizedBox(height: 6),
                          Text(
                              'Füge Fotos hinzu. Tippe auf +, um Kamera oder Galerie zu wählen.',
                              style: TextStyle(
                                  color: Theme.of(context).brightness ==
                                          Brightness.dark
                                      ? Colors.white70
                                      : AppTheme.textSecondary(context),
                                  fontSize: 13,
                                  height: 1.35)),
                          if (_photoAccessError case final error?) ...[
                            const SizedBox(height: 8),
                            Semantics(
                              liveRegion: true,
                              label: error,
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.info_outline,
                                      size: 18,
                                      color:
                                          Theme.of(context).colorScheme.error),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      error,
                                      style: TextStyle(
                                        color:
                                            Theme.of(context).colorScheme.error,
                                        fontSize: 13,
                                        height: 1.35,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                          _Accordion(
                            title: '💬 Tipp',
                            initiallyExpanded: false,
                            bare: true,
                            child: Text(
                              'Hochwertige, klare Bilder erhöhen die Chance, dass deine Anzeige öfter gemietet wird.\n'
                              'Zeig den Artikel aus verschiedenen Winkeln – hell, scharf und komplett.',
                              style: TextStyle(
                                  color: Theme.of(context).brightness ==
                                          Brightness.dark
                                      ? Colors.white70
                                      : AppTheme.textSecondary(context),
                                  fontSize: 13.5,
                                  height: 1.45),
                            ),
                          ),
                        ])),
                const SizedBox(height: 12),
                if (PrivatePilotConfig.blueOceanListingAssistantEnabled &&
                    !_isEdit) ...[
                  _buildBlueOceanAssistantCard(context),
                  const SizedBox(height: 12),
                ],
                _Section(
                  title: 'Zustand',
                  leading: Icon(Icons.workspace_premium_outlined,
                      color: colorScheme.primary, size: 18),
                  child: _ConditionPager(
                    selected: _condition,
                    onChanged: (v) {
                      setState(() {
                        _condition = v;
                        _invalidateBlueOceanReviewState(
                          confirmations: const <String>['condition'],
                        );
                      });
                      _schedulePriceRecalc();
                    },
                  ),
                ),
                const SizedBox(height: 12),
                _Section(
                    title: 'Übergabeort',
                    leading: Icon(Icons.place_outlined,
                        color: colorScheme.primary, size: 18),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _AddressAutocompleteField(
                            controller: _addressCtrl,
                            onPlaceChosen: (d) {
                              setState(() {
                                _addressCtrl.text =
                                    d.formattedAddress ?? d.description;
                                _selectedAddrLat = d.lat;
                                _selectedAddrLng = d.lng;
                                _invalidateBlueOceanReviewState(
                                  confirmations: const <String>[
                                    'pickup_region'
                                  ],
                                  clearClarifications: true,
                                );
                              });
                              _schedulePriceRecalc();
                            },
                            onQueryChanged: (q) {
                              _onAddressQueryChanged(q);
                              setState(() {
                                _invalidateBlueOceanReviewState(
                                  confirmations: const <String>[
                                    'pickup_region'
                                  ],
                                  clearClarifications: true,
                                );
                              });
                              _schedulePriceRecalc();
                            },
                            suggestions: _addrSuggestions,
                          ),
                          if (_addrSuggestionsUnavailable)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                  'Vorschläge sind gerade nicht verfügbar. Du kannst den Ort trotzdem manuell eingeben.',
                                  style: TextStyle(
                                      color: Theme.of(context).brightness ==
                                              Brightness.dark
                                          ? Colors.white70
                                          : AppTheme.textSecondary(context),
                                      fontSize: 13,
                                      height: 1.35)),
                            ),
                          const SizedBox(height: 8),
                          _Accordion(
                            title: 'Datenschutz & Übergabeort',
                            initiallyExpanded: false,
                            bare: true,
                            child: Text(
                              'Der genaue Übergabeort wird nur zur Berechnung der Entfernung genutzt und erst nach bestätigter Anfrage angezeigt, wenn der Mieter Selbstabholer ist.',
                              style: TextStyle(
                                  color: Theme.of(context).brightness ==
                                          Brightness.dark
                                      ? Colors.white70
                                      : AppTheme.textSecondary(context),
                                  fontSize: 13.5,
                                  height: 1.45),
                            ),
                          ),
                        ])),
                const SizedBox(height: 12),
                _Section(
                  title: 'Persönliche Abholung im Privat-Pilot',
                  leading: Icon(Icons.handshake_outlined,
                      color: colorScheme.primary, size: 18),
                  child: Text(
                    'Lieferung und Versand sind im Privat-Pilot deaktiviert. '
                    'Mieter und Vermieter treffen sich persönlich am vereinbarten '
                    'Übergabeort und dokumentieren Übergabe und Rückgabe gemeinsam.',
                    style: TextStyle(
                      color: isDark
                          ? Colors.white70
                          : AppTheme.textSecondary(context),
                      fontSize: 13.5,
                      height: 1.45,
                    ),
                  ),
                ),
                // Removed per request: Preisberechnung & Gebühren infocard
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    gradient: isDark
                        ? const LinearGradient(
                            colors: [Color(0xFF0C1222), Color(0xFF0A152B)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight)
                        : const LinearGradient(
                            colors: [Color(0xFFFFFFFF), Color(0xFFF6FBFF)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                        color: isDark
                            ? Colors.white.withValues(alpha: 0.12)
                            : AppTheme.glassStroke(context)),
                    boxShadow: isDark
                        ? [
                            BoxShadow(
                                color: Colors.lightBlueAccent
                                    .withValues(alpha: 0.14),
                                blurRadius: 22,
                                spreadRadius: 1,
                                offset: const Offset(0, 10)),
                          ]
                        : [
                            BoxShadow(
                                color: Colors.black.withValues(alpha: 0.06),
                                blurRadius: 18,
                                offset: const Offset(0, 8)),
                          ],
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          const _CircleBadge(
                              icon: Icons.euro_rounded,
                              color: Colors.lightBlueAccent,
                              diameter: 38),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text('Dein Mietpreis pro Tag',
                                style: TextStyle(
                                    color: Theme.of(context).brightness ==
                                            Brightness.dark
                                        ? Colors.white
                                        : AppTheme.textPrimary(context),
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16)),
                          ),
                        ]),
                        const SizedBox(height: 14),
                        if (PrivatePilotConfig.aiFeaturesEnabled)
                          _AIPriceCalculatorCard(
                            suggestion: _priceSuggestion,
                            strategy: _priceStrategy,
                            onStrategyChanged: (v) {
                              setState(() {
                                _priceStrategy = v;
                                _strategyEpoch++;
                                _priceTouched = false;
                              });
                              _autofillPriceFromMarket();
                              _applyModeDiscountPreset(force: true);
                            },
                            onRecalculate: _calculatePriceSuggestion,
                            canCalculate: _titleCtrl.text.trim().isNotEmpty &&
                                _categoryId != null &&
                                _addressCtrl.text.trim().isNotEmpty,
                          )
                        else
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: colorScheme.primaryContainer
                                  .withValues(alpha: 0.28),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              'Der Vermieter legt den Mietpreis selbst fest. Die '
                              'KI-Preisberechnung bleibt im Privat-Pilot deaktiviert, '
                              'bis Transparenz, Anbieter und Datenfluss freigegeben sind.',
                              style: TextStyle(
                                color: isDark
                                    ? Colors.white70
                                    : AppTheme.textSecondary(context),
                                fontSize: 13.5,
                                height: 1.4,
                              ),
                            ),
                          ),
                        const SizedBox(height: 14),
                        _PricePerDayInput(
                          controller: _priceCtrl,
                          onChanged: (_) => setState(() {
                            _priceTouched = true;
                            _invalidateBlueOceanReviewState(
                              confirmations: const <String>['owner_price'],
                            );
                          }),
                          validator: (v) {
                            final n =
                                double.tryParse((v ?? '').replaceAll(',', '.'));
                            if (n == null || n <= 0) {
                              return 'Gültigen Preis eingeben';
                            }
                            return null;
                          },
                        ),
                        if (_priceTouched)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text('Du hast den Preis manuell angepasst.',
                                style: TextStyle(
                                    color: Theme.of(context).brightness ==
                                            Brightness.dark
                                        ? Colors.white70
                                        : AppTheme.textSecondary(context),
                                    fontSize: 13)),
                          ),
                        const SizedBox(height: 16),
                        Container(
                          decoration: BoxDecoration(
                            gradient: isDark
                                ? const LinearGradient(
                                    colors: [
                                        Color(0xFF11192B),
                                        Color(0xFF0D1424)
                                      ],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight)
                                : const LinearGradient(
                                    colors: [
                                        Color(0xFFFFFFFF),
                                        Color(0xFFF8FAFC)
                                      ],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                                color: isDark
                                    ? Colors.white.withValues(alpha: 0.10)
                                    : AppTheme.glassStroke(context)),
                          ),
                          padding: const EdgeInsets.symmetric(
                              vertical: 10, horizontal: 10),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(children: [
                                  const _CircleBadge(
                                      icon: Icons.discount_outlined,
                                      color: Colors.lightBlueAccent,
                                      diameter: 24),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text('Rabatt bei längerer Mietdauer',
                                        style: TextStyle(
                                            color: Theme.of(context)
                                                        .brightness ==
                                                    Brightness.dark
                                                ? Colors.white
                                                : AppTheme.textPrimary(context),
                                            fontWeight: FontWeight.w600,
                                            fontSize: 15)),
                                  ),
                                ]),
                                SwitchListTile.adaptive(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text('Rabatt aktiv',
                                      style: TextStyle(
                                          color: _autoApplyDiscounts
                                              ? (isDark
                                                  ? Colors.white
                                                  : AppTheme.textBody(context))
                                              : (isDark
                                                  ? Colors.white54
                                                  : AppTheme.textDisabled(
                                                      context)),
                                          fontWeight: FontWeight.w600,
                                          fontSize: 11)),
                                  value: _autoApplyDiscounts,
                                  onChanged: (value) => setState(() {
                                    _autoApplyDiscounts = value;
                                    _invalidateBlueOceanReviewState(
                                      confirmations: const <String>[
                                        'duration_discounts'
                                      ],
                                    );
                                  }),
                                  activeThumbColor: colorScheme.primary,
                                ),
                                const SizedBox(height: 6),
                                if (_autoApplyDiscounts) ...[
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 6, horizontal: 4),
                                    child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.center,
                                        children: [
                                          Expanded(
                                              child: Align(
                                            alignment: Alignment.centerLeft,
                                            child: Text('Mietdauer',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                    color: isDark
                                                        ? Colors.white60
                                                        : AppTheme
                                                            .textSecondary(
                                                                context),
                                                    fontSize: 13,
                                                    fontWeight:
                                                        FontWeight.w600)),
                                          )),
                                          Expanded(
                                            child: Align(
                                              alignment: Alignment.center,
                                              child: Text('Rabatt',
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  textAlign: TextAlign.center,
                                                  style: TextStyle(
                                                      color: isDark
                                                          ? Colors.white60
                                                          : AppTheme
                                                              .textSecondary(
                                                                  context),
                                                      fontSize: 13,
                                                      fontWeight:
                                                          FontWeight.w600)),
                                            ),
                                          ),
                                          Expanded(
                                            child: Align(
                                              alignment: Alignment.centerRight,
                                              child: Text('Preis pro Tag',
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  textAlign: TextAlign.right,
                                                  style: TextStyle(
                                                      color: isDark
                                                          ? Colors.white60
                                                          : AppTheme
                                                              .textSecondary(
                                                                  context),
                                                      fontSize: 13,
                                                      fontWeight:
                                                          FontWeight.w600)),
                                            ),
                                          ),
                                        ]),
                                  ),
                                  _ThresholdDiscountRow(
                                    key: ValueKey('tier1_$_strategyEpoch'),
                                    days: _tier1Days,
                                    percent: _tier1Pct,
                                    pricePerDay: double.tryParse(_priceCtrl.text
                                            .replaceAll(',', '.')) ??
                                        0.0,
                                    onDaysChanged: (v) => setState(() {
                                      _tier1Days = v;
                                      _discountsTouched = true;
                                      _invalidateBlueOceanReviewState(
                                        confirmations: const <String>[
                                          'duration_discounts'
                                        ],
                                      );
                                    }),
                                    onPercentChanged: (v) => setState(() {
                                      _tier1Pct = v;
                                      _discountsTouched = true;
                                      _invalidateBlueOceanReviewState(
                                        confirmations: const <String>[
                                          'duration_discounts'
                                        ],
                                      );
                                    }),
                                  ),
                                  const SizedBox(height: 6),
                                  _ThresholdDiscountRow(
                                    key: ValueKey('tier2_$_strategyEpoch'),
                                    days: _tier2Days,
                                    percent: _tier2Pct,
                                    pricePerDay: double.tryParse(_priceCtrl.text
                                            .replaceAll(',', '.')) ??
                                        0.0,
                                    onDaysChanged: (v) => setState(() {
                                      _tier2Days = v;
                                      _discountsTouched = true;
                                      _invalidateBlueOceanReviewState(
                                        confirmations: const <String>[
                                          'duration_discounts'
                                        ],
                                      );
                                    }),
                                    onPercentChanged: (v) => setState(() {
                                      _tier2Pct = v;
                                      _discountsTouched = true;
                                      _invalidateBlueOceanReviewState(
                                        confirmations: const <String>[
                                          'duration_discounts'
                                        ],
                                      );
                                    }),
                                  ),
                                  const SizedBox(height: 6),
                                  _ThresholdDiscountRow(
                                    key: ValueKey('tier3_$_strategyEpoch'),
                                    days: _tier3Days,
                                    percent: _tier3Pct,
                                    pricePerDay: double.tryParse(_priceCtrl.text
                                            .replaceAll(',', '.')) ??
                                        0.0,
                                    onDaysChanged: (v) => setState(() {
                                      _tier3Days = v;
                                      _discountsTouched = true;
                                      _invalidateBlueOceanReviewState(
                                        confirmations: const <String>[
                                          'duration_discounts'
                                        ],
                                      );
                                    }),
                                    onPercentChanged: (v) => setState(() {
                                      _tier3Pct = v;
                                      _discountsTouched = true;
                                      _invalidateBlueOceanReviewState(
                                        confirmations: const <String>[
                                          'duration_discounts'
                                        ],
                                      );
                                    }),
                                  ),
                                  const SizedBox(height: 6),
                                  Row(children: [
                                    const Icon(Icons.autorenew,
                                        color: Colors.lightBlueAccent,
                                        size: 16),
                                    SizedBox(width: 8),
                                    Expanded(
                                        child: Text(
                                            'Rabatte greifen automatisch in Preisvorschauen.',
                                            style: TextStyle(
                                                color: Theme.of(context)
                                                            .brightness ==
                                                        Brightness.dark
                                                    ? Colors.white70
                                                    : AppTheme.textSecondary(
                                                        context),
                                                fontSize: 13)))
                                  ]),
                                ],
                              ]),
                        ),
                        const SizedBox(height: 12),
                        Container(
                          decoration: BoxDecoration(
                            gradient: isDark
                                ? const LinearGradient(
                                    colors: [
                                        Color(0xFF0F1C33),
                                        Color(0xFF0B1527)
                                      ],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight)
                                : const LinearGradient(
                                    colors: [
                                        Color(0xFFF0F9FF),
                                        Color(0xFFE0F2FE)
                                      ],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                                color: isDark
                                    ? Colors.lightBlueAccent
                                        .withValues(alpha: 0.30)
                                    : AppTheme.glassStroke(context)),
                          ),
                          padding: const EdgeInsets.all(12),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(children: [
                                  _CircleBadge(
                                      icon: Icons.lightbulb_outline,
                                      color: Colors.lightBlueAccent,
                                      diameter: 32,
                                      backgroundAlpha: 0.18),
                                  SizedBox(width: 10),
                                  Expanded(
                                    child: Text('SIT-Tipp',
                                        style: TextStyle(
                                            color: isDark
                                                ? Colors.lightBlueAccent
                                                : colorScheme.primary,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 16)),
                                  )
                                ]),
                                SizedBox(height: 8),
                                Text(
                                    'Du legst deinen Mietpreis selbst fest. Im öffentlichen Endpreis ist der Plattformbeitrag von exakt 10 % bereits enthalten. Rabatte werden zuerst vom Mietpreis abgezogen; danach wird der Beitrag centgenau berechnet.',
                                    style: TextStyle(
                                        color: Theme.of(context).brightness ==
                                                Brightness.dark
                                            ? Colors.white70
                                            : AppTheme.textSecondary(context),
                                        fontSize: 13.5,
                                        height: 1.45))
                              ]),
                        ),
                      ]),
                ),
                // Preis-Section Ende – ab hier Inhalte außerhalb der Preis-Karte
                // Stornierungsbedingungen außerhalb der Preis-Karte und oberhalb des Erstellen-Buttons
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: isDark
                        ? Colors.black.withValues(alpha: 0.20)
                        : AppTheme.surfacePrimary(context),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                        color: isDark
                            ? Colors.white.withValues(alpha: 0.10)
                            : AppTheme.glassStroke(context)),
                  ),
                  child: _OwnerCancellationInfoCard(
                      body: CancellationPolicyText.bodyForOwnerListingCard),
                ),
                const SizedBox(height: 12),
                const PrivatePilotRiskNotice(
                  title: 'Hinweis vor dem Veröffentlichen',
                ),
                const SizedBox(height: 8),
                CheckboxListTile(
                  value: _privateStatusConfirmed,
                  onChanged: (value) => setState(() {
                    _privateStatusConfirmed = value ?? false;
                    _scheduleBlueOceanRecoverySave();
                  }),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    PrivatePilotConfig.listingPrivateDeclaration,
                    style: TextStyle(fontSize: 13.5, height: 1.35),
                  ),
                  subtitle: const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text(
                      '${PrivatePilotConfig.documentName} · '
                      '${PrivatePilotConfig.documentVersion}',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      FilledButton.icon(
                        onPressed:
                            _submitBusy || _blueOceanBusy ? null : _submit,
                        icon: const Icon(Icons.add_business),
                        label: const Text('Anzeige veröffentlichen'),
                        style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            backgroundColor: colorScheme.primary,
                            foregroundColor: colorScheme.onPrimary,
                            textStyle: const TextStyle(
                                fontWeight: FontWeight.w500, fontSize: 16)),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _submitBusy || _blueOceanBusy
                            ? null
                            : () => _submit(forceInactive: true),
                        icon: const Icon(Icons.save_outlined),
                        label: Text(_isEdit
                            ? 'Bearbeitung speichern'
                            : 'Für später speichern'),
                        style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            foregroundColor: isDark
                                ? Colors.white
                                : AppTheme.textBody(context),
                            backgroundColor: isDark
                                ? Colors.white.withValues(alpha: 0.04)
                                : const Color(0xFFF8FAFC),
                            side: BorderSide(
                                color: isDark
                                    ? Colors.white.withValues(alpha: 0.22)
                                    : AppTheme.glassStroke(context)),
                            textStyle: const TextStyle(
                                fontWeight: FontWeight.w500, fontSize: 15)),
                      ),
                    ])
              ]),
            ),
          ),
        ),
      ),
      backgroundColor: isDark ? Colors.transparent : null,
    );
  }
}

Color _listingPanelSurface(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? Colors.white.withValues(alpha: 0.06)
        : const Color(0xFFFFFFFF);

Color _listingPanelBorder(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? Colors.white.withValues(alpha: 0.16)
        : const Color(0xFFE2E8F0);

class _ConditionPager extends StatefulWidget {
  final String selected;
  final ValueChanged<String> onChanged;
  const _ConditionPager({required this.selected, required this.onChanged});
  @override
  State<_ConditionPager> createState() => _ConditionPagerState();
}

class _ConditionPagerState extends State<_ConditionPager> {
  static const List<String> _labels = [
    'Wie neu',
    'Gut gepflegt',
    'Normale Gebrauchsspuren',
    'Stark gebraucht'
  ];
  static const List<String> _keys = ['like-new', 'good', 'acceptable', 'worn'];
  bool _expanded = false;

  int _indexFor(String sel) {
    switch (sel) {
      case 'like-new':
        return 0;
      case 'good':
        return 1;
      case 'acceptable':
        return 2;
      case 'worn':
        return 3;
      case 'new':
        return 0;
      default:
        return 1;
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _indexFor(widget.selected);
    final selectedLabel = _labels[selectedIndex];
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: _listingPanelSurface(context),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: _listingPanelBorder(context)),
            ),
            child: Row(children: [
              Expanded(
                  child: Text(selectedLabel,
                      style: TextStyle(
                          color: Theme.of(context).brightness == Brightness.dark
                              ? Colors.white
                              : AppTheme.textPrimary(context),
                          fontWeight: FontWeight.w600,
                          fontSize: 15.5))),
              AnimatedRotation(
                turns: _expanded ? 0.5 : 0.0,
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                child: Icon(Icons.expand_more,
                    color: isDark
                        ? Colors.white70
                        : AppTheme.textSecondary(context)),
              ),
            ]),
          ),
        ),
      ),
      AnimatedSize(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        child: _expanded
            ? Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                    children: List.generate(_labels.length, (i) {
                  final selected = i == selectedIndex;
                  return Padding(
                    padding: EdgeInsets.only(
                        bottom: i == _labels.length - 1 ? 0 : 8),
                    child: _ConditionOption(
                        label: _labels[i],
                        selected: selected,
                        onTap: () => widget.onChanged(_keys[i])),
                  );
                })),
              )
            : const SizedBox.shrink(),
      ),
    ]);
  }
}

class _ConditionOption extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _ConditionOption(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: selected
              ? colorScheme.primary.withValues(alpha: 0.10)
              : _listingPanelSurface(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: selected
                  ? colorScheme.primary
                  : _listingPanelBorder(context)),
        ),
        child: Row(children: [
          Icon(
            selected ? Icons.radio_button_checked : Icons.radio_button_off,
            color: selected
                ? colorScheme.primary
                : (isDark ? Colors.white70 : AppTheme.textSecondary(context)),
            size: 22,
          ),
          const SizedBox(width: 10),
          Expanded(
              child: Text(label,
                  softWrap: true,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: isDark ? Colors.white : AppTheme.textBody(context),
                      fontWeight: FontWeight.w500,
                      fontSize: 15))),
        ]),
      ),
    );
  }
}

class _CityAutocompleteField extends StatefulWidget {
  final TextEditingController controller;
  final String? initialValue;
  final ValueChanged<String> onChanged;
  const _CityAutocompleteField(
      {required this.controller,
      required this.initialValue,
      required this.onChanged});
  @override
  State<_CityAutocompleteField> createState() => _CityAutocompleteFieldState();
}

class _CityAutocompleteFieldState extends State<_CityAutocompleteField> {
  late final List<String> _cities = DataService.getCities().keys.toList();
  @override
  void initState() {
    super.initState();
    if ((widget.initialValue ?? '').isNotEmpty) {
      widget.controller.text = widget.initialValue!;
    }
  }

  void _showAllCities() async {
    final sel = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Theme.of(context).brightness == Brightness.dark
          ? Colors.black
          : const Color(0xFFFFFFFF),
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (context) => SafeArea(
          child: Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 12),
          Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 12),
          Text('Größstädte',
              style: TextStyle(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white
                      : AppTheme.textPrimary(context),
                  fontWeight: FontWeight.w600,
                  fontSize: 16)),
          const SizedBox(height: 8),
          SizedBox(
            height: 360,
            child: ListView.separated(
              itemBuilder: (context, i) {
                final name = _cities[i];
                return ListTile(
                    title: Text(name,
                        style: TextStyle(
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                    ? Colors.white
                                    : AppTheme.textBody(context),
                            fontSize: 15)),
                    onTap: () => Navigator.of(context).pop(name));
              },
              separatorBuilder: (_, __) =>
                  const Divider(color: Colors.white12, height: 1),
              itemCount: _cities.length,
            ),
          ),
        ]),
      )),
    );
    if (sel != null) {
      widget.controller.text = sel;
      widget.onChanged(sel);
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return RawAutocomplete<String>(
      textEditingController: widget.controller,
      optionsBuilder: (TextEditingValue textEditingValue) {
        final q = textEditingValue.text.toLowerCase();
        if (q.isEmpty) return _cities; // show all when empty so nothing "red"
        return _cities.where((e) => e.toLowerCase().startsWith(q));
      },
      displayStringForOption: (opt) => opt,
      fieldViewBuilder: (context, textCtrl, focusNode, onFieldSubmitted) {
        return TextFormField(
          controller: textCtrl,
          focusNode: focusNode,
          style: TextStyle(
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.white
                  : AppTheme.textBody(context),
              fontSize: 15),
          decoration: InputDecoration(
              labelText: 'Stadt',
              suffixIcon: IconButton(
                  onPressed: _showAllCities,
                  icon: Icon(Icons.arrow_drop_down,
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.white
                          : AppTheme.textSecondary(context)))),
          onChanged: widget.onChanged,
          validator: (v) =>
              (v == null || v.trim().isEmpty) ? 'Stadt ist erforderlich' : null,
        );
      },
      optionsViewBuilder: (context, onSelected, options) {
        final opts = options.toList();
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            elevation: 8,
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.black
                : AppTheme.surfacePrimary(context),
            borderRadius: BorderRadius.circular(12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 240, minWidth: 280),
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 6),
                shrinkWrap: true,
                itemCount: opts.length,
                separatorBuilder: (_, __) => Divider(
                    height: 1,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white12
                        : const Color(0xFFE2E8F0)),
                itemBuilder: (context, index) {
                  final opt = opts[index];
                  return ListTile(
                    dense: true,
                    title: Text(opt,
                        style: TextStyle(
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                    ? Colors.white
                                    : AppTheme.textBody(context),
                            fontSize: 14.5)),
                    onTap: () => onSelected(opt),
                  );
                },
              ),
            ),
          ),
        );
      },
      onSelected: (v) => widget.onChanged(v),
    );
  }
}

class _CircleBadge extends StatelessWidget {
  final IconData icon;
  final Color color;
  final double diameter;
  final double backgroundAlpha;
  const _CircleBadge(
      {required this.icon,
      required this.color,
      this.diameter = 36,
      this.backgroundAlpha = 0.14});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withValues(alpha: backgroundAlpha),
        boxShadow: [
          BoxShadow(
              color: color.withValues(alpha: 0.18),
              blurRadius: 10,
              offset: const Offset(0, 4)),
        ],
      ),
      child: Icon(icon, color: color, size: diameter * 0.58),
    );
  }
}

class _PricePerDayInput extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final String? Function(String?)? validator;
  const _PricePerDayInput(
      {required this.controller,
      required this.onChanged,
      required this.validator});
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextFormField(
        controller: controller,
        keyboardType:
            const TextInputType.numberWithOptions(decimal: true, signed: false),
        style: TextStyle(
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.white
                : AppTheme.textPrimary(context),
            fontWeight: FontWeight.w700,
            fontSize: 16),
        decoration: InputDecoration(
          prefixIcon: Icon(Icons.euro,
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.white70
                  : AppTheme.textSecondary(context),
              size: 18),
          prefixIconConstraints:
              const BoxConstraints(minWidth: 38, minHeight: 24),
          suffixIcon: Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Text('pro Tag',
                style: TextStyle(
                    color: isDark
                        ? Colors.white60
                        : AppTheme.textSecondary(context),
                    fontWeight: FontWeight.w500,
                    fontSize: 14)),
          ),
          suffixIconConstraints:
              const BoxConstraints(minWidth: 72, minHeight: 24),
          hintText: '0,00',
          hintStyle: TextStyle(
              color: isDark ? Colors.white38 : AppTheme.textDisabled(context),
              fontWeight: FontWeight.w500),
          filled: true,
          fillColor: _listingPanelSurface(context),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _listingPanelBorder(context))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                  color: Theme.of(context)
                      .colorScheme
                      .primary
                      .withValues(alpha: 0.8))),
        ),
        onChanged: onChanged,
        validator: validator,
      ),
    ]);
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? leading;
  const _Section({required this.title, required this.child, this.leading});
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.black.withValues(alpha: 0.30)
            : const Color(0xFFFFFFFF),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.08)
                : AppTheme.glassStroke(context)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (leading == null)
          Text(title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white
                      : AppTheme.textPrimary(context),
                  fontWeight: FontWeight.w600,
                  fontSize: 16))
        else
          Row(children: [
            if (leading != null) leading!,
            if (leading != null) const SizedBox(width: 8),
            Expanded(
                child: Text(title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white
                            : AppTheme.textPrimary(context),
                        fontWeight: FontWeight.w600,
                        fontSize: 16))),
          ]),
        const SizedBox(height: 8),
        child,
      ]),
    );
  }
}

class _AddPhotoTile extends StatelessWidget {
  final VoidCallback onTap;
  const _AddPhotoTile({required this.onTap});
  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Foto hinzufügen',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 84,
          height: 84,
          decoration: BoxDecoration(
            color: _listingPanelSurface(context),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: _listingPanelBorder(context),
                style: BorderStyle.solid,
                width: 1),
          ),
          alignment: Alignment.center,
          child: Icon(Icons.add_a_photo,
              color: Theme.of(context).colorScheme.primary),
        ),
      ),
    );
  }
}

// Compact toggle tile with a blue circular indicator (no check glyph)
// _BlueDotToggleTile removed in favor of shared ToggleTextOption for consistent design.

class _PickedThumb extends StatelessWidget {
  final XFile file;
  final VoidCallback onRemove;
  const _PickedThumb({required this.file, required this.onRemove});
  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      InkWell(
        onTap: () async {
          final bytes = await file.readAsBytes();
          if (!context.mounted) return;
          showDialog(
              context: context,
              builder: (_) => Dialog(
                    insetPadding: const EdgeInsets.all(16),
                    backgroundColor: Colors.black,
                    child: InteractiveViewer(
                        child: Image.memory(bytes, fit: BoxFit.contain)),
                  ));
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 84,
          height: 84,
          decoration: BoxDecoration(
            color: _listingPanelSurface(context),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _listingPanelBorder(context)),
          ),
          clipBehavior: Clip.antiAlias,
          child: FutureBuilder<Uint8List>(
            future: file.readAsBytes(),
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done ||
                  !snap.hasData) {
                return const Center(
                    child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2)));
              }
              return Image.memory(snap.data!, fit: BoxFit.cover);
            },
          ),
        ),
      ),
      Positioned(
        right: 0,
        top: 0,
        child: InkWell(
          onTap: onRemove,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.black.withValues(alpha: 0.6)
                    : AppTheme.surfacePrimary(context),
                borderRadius: BorderRadius.circular(12)),
            padding: const EdgeInsets.all(4),
            child: Icon(Icons.close,
                size: 14,
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.white
                    : AppTheme.textPrimary(context)),
          ),
        ),
      ),
    ]);
  }
}

// ---------- Simple Accordion (Chevron + smooth height animation) ----------
class _Accordion extends StatefulWidget {
  final String title;
  final Widget child;
  final bool initiallyExpanded;
  // When true, renders without its own card container (inline, text-only toggle)
  final bool bare;
  const _Accordion({
    required this.title,
    required this.child,
    this.initiallyExpanded = false,
    this.bare = false,
  });
  @override
  State<_Accordion> createState() => _AccordionState();
}

class _AccordionState extends State<_Accordion>
    with SingleTickerProviderStateMixin {
  late bool _expanded = widget.initiallyExpanded;
  @override
  Widget build(BuildContext context) {
    final titleStyle = widget.bare
        ? TextStyle(
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.white70
                : AppTheme.textSecondary(context),
            fontWeight: FontWeight.w600,
            fontSize: 13.5)
        : TextStyle(
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.white
                : AppTheme.textPrimary(context),
            fontWeight: FontWeight.w600,
            fontSize: 15.5);

    final header = InkWell(
      onTap: () => setState(() => _expanded = !_expanded),
      borderRadius: BorderRadius.circular(widget.bare ? 8 : 12),
      child: Padding(
        padding: EdgeInsets.symmetric(
            horizontal: widget.bare ? 0 : 12, vertical: 12),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(widget.title, style: titleStyle),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: AnimatedRotation(
                turns: _expanded ? 0.5 : 0.0,
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                child: Icon(Icons.expand_more,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white70
                        : AppTheme.textSecondary(context)),
              ),
            ),
          ],
        ),
      ),
    );

    final body = ClipRect(
      child: AnimatedAlign(
        heightFactor: _expanded ? 1.0 : 0.0,
        alignment: Alignment.topCenter,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
              widget.bare ? 0 : 12, 0, widget.bare ? 0 : 12, 12),
          child: widget.child,
        ),
      ),
    );

    if (widget.bare) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        header,
        body,
      ]);
    }

    return Container(
      decoration: BoxDecoration(
        color: _listingPanelSurface(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _listingPanelBorder(context)),
      ),
      child: Column(children: [header, body]),
    );
  }
}

// ---------- Owner-facing Cancellation Info Card (centered title, tap-to-expand) ----------
class _OwnerCancellationInfoCard extends StatefulWidget {
  final String body;
  const _OwnerCancellationInfoCard({required this.body});
  @override
  State<_OwnerCancellationInfoCard> createState() =>
      _OwnerCancellationInfoCardState();
}

class _OwnerCancellationInfoCardState
    extends State<_OwnerCancellationInfoCard> {
  bool _open = false;
  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Center(
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.policy_outlined,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white70
                        : AppTheme.textSecondary(context)),
                const SizedBox(width: 8),
                Flexible(
                  child: Text('Stornierungsbedingungen',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15.5,
                          color: Theme.of(context).brightness == Brightness.dark
                              ? Colors.white
                              : AppTheme.textPrimary(context))),
                ),
              ]),
            ),
          ),
        ),
        AnimatedCrossFade(
          crossFadeState:
              _open ? CrossFadeState.showFirst : CrossFadeState.showSecond,
          duration: const Duration(milliseconds: 200),
          firstChild: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Text(widget.body,
                style: TextStyle(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white70
                        : AppTheme.textSecondary(context),
                    fontSize: 13,
                    height: 1.4)),
          ),
          secondChild: const SizedBox(height: 0),
        ),
      ],
    );
  }
}

// ---------- Address Autocomplete with Google Places API ----------
class _PlaceSuggestion {
  final String description;
  final String placeId;
  const _PlaceSuggestion({required this.description, required this.placeId});
}

class _PlaceDetails {
  final String? formattedAddress;
  final double? lat;
  final double? lng;
  final String description;
  const _PlaceDetails(
      {this.formattedAddress, this.lat, this.lng, required this.description});
}

class _AddressAutocompleteField extends StatelessWidget {
  final TextEditingController controller;
  final List<_PlaceSuggestion> suggestions;
  final ValueChanged<String> onQueryChanged;
  final ValueChanged<_PlaceDetails> onPlaceChosen;
  const _AddressAutocompleteField({
    required this.controller,
    required this.onQueryChanged,
    required this.suggestions,
    required this.onPlaceChosen,
  });
  @override
  Widget build(BuildContext context) {
    return RawAutocomplete<_PlaceSuggestion>(
      textEditingController: controller,
      focusNode: FocusNode(),
      optionsBuilder: (TextEditingValue tev) {
        final text = tev.text.trim();
        if (text.isEmpty) return const Iterable<_PlaceSuggestion>.empty();
        // onQueryChanged is debounced by parent
        onQueryChanged(text);
        return suggestions;
      },
      displayStringForOption: (o) => o.description,
      fieldViewBuilder: (context, textCtrl, focusNode, onFieldSubmitted) {
        return TextFormField(
          controller: textCtrl,
          focusNode: focusNode,
          style: TextStyle(
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.white
                  : AppTheme.textBody(context),
              fontSize: 15),
          decoration: InputDecoration(
              prefixIcon: Icon(Icons.search,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white70
                      : AppTheme.textSecondary(context)),
              hintText: 'Übergabeort eingeben'),
          onChanged: onQueryChanged,
        );
      },
      optionsViewBuilder: (context, onSelected, options) {
        final list = options.toList();
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.black
                : AppTheme.surfacePrimary(context),
            elevation: 8,
            borderRadius: BorderRadius.circular(12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280, minWidth: 320),
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 6),
                itemBuilder: (context, i) {
                  final s = list[i];
                  return ListTile(
                    dense: true,
                    leading: Icon(Icons.place_outlined,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white70
                            : AppTheme.textSecondary(context)),
                    title: Text(s.description,
                        style: TextStyle(
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                    ? Colors.white
                                    : AppTheme.textBody(context))),
                    onTap: () async {
                      // Fetch place details for lat/lng
                      final d = await _fetchPlaceDetails(s.placeId);
                      onSelected(s);
                      onPlaceChosen(_PlaceDetails(
                        formattedAddress: d?.formattedAddress ?? s.description,
                        lat: d?.lat,
                        lng: d?.lng,
                        description: s.description,
                      ));
                    },
                  );
                },
                separatorBuilder: (_, __) => Divider(
                    height: 1,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white12
                        : const Color(0xFFE2E8F0)),
                itemCount: list.length,
              ),
            ),
          ),
        );
      },
      onSelected: (_) {},
    );
  }
}

// --- Address suggestions via the authenticated SIT backend ---
Future<List<_PlaceSuggestion>> _fetchAutocomplete(String input) async {
  try {
    final suggestions = await MapsService.autocomplete(input);
    return suggestions
        .where((entry) => entry.placeId != null)
        .map((entry) => _PlaceSuggestion(
              description: entry.description,
              placeId: entry.placeId!,
            ))
        .toList();
  } catch (_) {
    // Propagate unavailability so UI can show a friendly fallback message.
    throw Exception('gmaps_unavailable');
  }
}

Future<_PlaceDetails?> _fetchPlaceDetails(String placeId) async {
  try {
    final details = await MapsService.placeDetails(placeId);
    if (details == null) return null;
    return _PlaceDetails(
      formattedAddress: details.formattedAddress,
      lat: details.lat,
      lng: details.lng,
      description: details.formattedAddress,
    );
  } catch (_) {
    return null;
  }
}

// ---------- AI Price Calculator Card ----------
class _AIPriceCalculatorCard extends StatelessWidget {
  final PriceSuggestion? suggestion;
  final String strategy;
  final ValueChanged<String> onStrategyChanged;
  final VoidCallback onRecalculate;
  final bool canCalculate;
  const _AIPriceCalculatorCard({
    required this.suggestion,
    required this.strategy,
    required this.onStrategyChanged,
    required this.onRecalculate,
    required this.canCalculate,
  });
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        gradient: isDark
            ? const LinearGradient(
                colors: [Color(0xFF111C2F), Color(0xFF0C1424)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight)
            : const LinearGradient(
                colors: [Color(0xFFF8FCFF), Color(0xFFF0F9FF)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: isDark
                ? Colors.lightBlueAccent.withValues(alpha: 0.18)
                : const Color(0xFFBAE6FD)),
        boxShadow: [
          BoxShadow(
              color: isDark
                  ? Colors.lightBlueAccent.withValues(alpha: 0.12)
                  : Colors.black.withValues(alpha: 0.06),
              blurRadius: 18,
              offset: const Offset(0, 8)),
        ],
      ),
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const _CircleBadge(
              icon: Icons.auto_awesome,
              color: Colors.lightBlueAccent,
              diameter: 28,
              backgroundAlpha: 0.22),
          SizedBox(width: 8),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('KI-Preisberechnung',
                    style: TextStyle(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white
                            : AppTheme.textPrimary(context),
                        fontWeight: FontWeight.w600,
                        fontSize: 15)),
                SizedBox(height: 4),
                Text(
                    'Bitte fülle Titel, Kategorie und Übergabeort aus, um eine Preisempfehlung zu erhalten.',
                    style: TextStyle(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white70
                            : AppTheme.textSecondary(context),
                        fontSize: 13,
                        height: 1.35))
              ])),
        ]),
        if (canCalculate && suggestion == null) ...[
          const SizedBox(height: 8),
          Text('Berechne Preisvorschlag…',
              style: TextStyle(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white70
                      : AppTheme.textSecondary(context),
                  fontSize: 13)),
        ],
        if (suggestion != null) ...[
          const SizedBox(height: 9),
          // Strategy toggle
          Row(children: [
            Expanded(
              child: _StrategyChip(
                label: 'Schnell vermieten',
                icon: Icons.speed,
                selected: strategy == 'quick',
                onTap: () => onStrategyChanged('quick'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _StrategyChip(
                label: 'Maximaler Gewinn',
                icon: Icons.trending_up,
                selected: strategy == 'premium',
                onTap: () => onStrategyChanged('premium'),
              ),
            ),
          ]),
          const SizedBox(height: 9),
          // Price suggestions
          Container(
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.06)
                  : const Color(0xFFFFFFFF),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.08)
                      : const Color(0xFFDBEAFE)),
            ),
            padding: const EdgeInsets.all(9),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(Icons.calendar_today,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white70
                        : AppTheme.textSecondary(context),
                    size: 14),
                const SizedBox(width: 4),
                Text('Aktueller Marktpreis (€/Tag):',
                    style: TextStyle(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white70
                            : AppTheme.textSecondary(context),
                        fontWeight: FontWeight.w500,
                        fontSize: 13.5)),
                const Spacer(),
                Text(
                    '${suggestion!.dailyPriceMin.toStringAsFixed(0)}–${suggestion!.dailyPriceMax.toStringAsFixed(0)} €',
                    style: TextStyle(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white
                            : AppTheme.textPrimary(context),
                        fontWeight: FontWeight.w600,
                        fontSize: 14.5)),
              ]),
            ]),
          ),
          const SizedBox(height: 9),
          // Mode-specific helper text
          Builder(builder: (context) {
            final help = strategy == 'quick'
                ? 'Preis im unteren Marktbereich – erhöht die Buchungswahrscheinlichkeit.'
                : 'Preis im oberen Marktbereich – optimiert Ertrag pro Vermietung.';
            return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.info_outline,
                  color:
                      isDark ? Colors.white54 : AppTheme.textSecondary(context),
                  size: 14),
              const SizedBox(width: 4),
              Expanded(
                  child: Text(help,
                      style: TextStyle(
                          color: Theme.of(context).brightness == Brightness.dark
                              ? Colors.white70
                              : AppTheme.textSecondary(context),
                          fontSize: 13,
                          height: 1.35))),
            ]);
          }),
          const SizedBox(height: 7),
          // Reasoning
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.info_outline,
                color:
                    isDark ? Colors.white54 : AppTheme.textSecondary(context),
                size: 14),
            const SizedBox(width: 4),
            Expanded(
                child: Text(suggestion!.reasoning,
                    style: TextStyle(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white70
                            : AppTheme.textSecondary(context),
                        fontSize: 13,
                        height: 1.35))),
          ]),
          const SizedBox(height: 7),
          // Optimization tip
          Container(
            decoration: BoxDecoration(
              color: Colors.lightBlueAccent.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color: Colors.lightBlueAccent.withValues(alpha: 0.3)),
            ),
            padding: const EdgeInsets.all(8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.lightbulb_outline,
                  color: Colors.lightBlueAccent, size: 14),
              const SizedBox(width: 6),
              Expanded(
                  child: Text(suggestion!.optimizationTip,
                      style: TextStyle(
                          color: Theme.of(context).brightness == Brightness.dark
                              ? Colors.white
                              : AppTheme.textBody(context),
                          fontSize: 13,
                          height: 1.35))),
            ]),
          ),
        ],
      ]),
    );
  }
}

class _StrategyChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _StrategyChip(
      {required this.label,
      required this.icon,
      required this.selected,
      required this.onTap});
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        decoration: BoxDecoration(
          color: selected
              ? Colors.lightBlueAccent
              : (isDark
                  ? Colors.white.withValues(alpha: 0.06)
                  : const Color(0xFFF8FAFC)),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: selected
                  ? Colors.lightBlueAccent
                  : (isDark
                      ? Colors.white.withValues(alpha: 0.16)
                      : AppTheme.glassStroke(context))),
        ),
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon,
              color: selected
                  ? Colors.black
                  : (isDark ? Colors.white70 : AppTheme.textSecondary(context)),
              size: 14),
          const SizedBox(width: 5),
          Expanded(
              child: Text(label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: selected
                          ? Colors.black
                          : (isDark
                              ? Colors.white70
                              : AppTheme.textBody(context)),
                      fontWeight: FontWeight.w600,
                      fontSize: 11.5))),
        ]),
      ),
    );
  }
}

class _ThresholdDiscountRow extends StatefulWidget {
  final int days;
  final double percent;
  final double pricePerDay;
  final ValueChanged<int> onDaysChanged;
  final ValueChanged<double> onPercentChanged;
  const _ThresholdDiscountRow(
      {super.key,
      required this.days,
      required this.percent,
      required this.pricePerDay,
      required this.onDaysChanged,
      required this.onPercentChanged});
  @override
  State<_ThresholdDiscountRow> createState() => _ThresholdDiscountRowState();
}

class _ThresholdDiscountRowState extends State<_ThresholdDiscountRow> {
  late final TextEditingController _daysCtrl =
      TextEditingController(text: widget.days.toString());
  late final TextEditingController _pctCtrl =
      TextEditingController(text: _formatPercent(widget.percent));
  late final FocusNode _daysFocus = FocusNode();
  late final FocusNode _pctFocus = FocusNode();

  String _formatPercent(double v) =>
      v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 1);

  @override
  void didUpdateWidget(covariant _ThresholdDiscountRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Only sync controllers when field is NOT focused to avoid overriding user typing
    final newDaysText = widget.days.toString();
    if (!_daysFocus.hasFocus && _daysCtrl.text != newDaysText) {
      _daysCtrl.text = newDaysText;
    }
    final newPctText = _formatPercent(widget.percent);
    if (!_pctFocus.hasFocus && _pctCtrl.text != newPctText) {
      _pctCtrl.text = newPctText;
    }
  }

  @override
  void dispose() {
    _daysCtrl.dispose();
    _pctCtrl.dispose();
    _daysFocus.dispose();
    _pctFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final primary = Colors.lightBlueAccent;
    final discountedPerDay = (widget.pricePerDay * (1 - widget.percent / 100))
        .clamp(0.0, double.infinity)
        .toDouble();
    final discountedText =
        '${discountedPerDay.toStringAsFixed(2).replaceAll('.', ',')} € / Tag';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
          child: Row(children: [
            Text('Ab',
                style: TextStyle(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white70
                        : AppTheme.textSecondary(context),
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
            const SizedBox(width: 4),
            IntrinsicWidth(
              child: ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 13, maxWidth: 42),
                child: TextField(
                  controller: _daysCtrl,
                  focusNode: _daysFocus,
                  cursorColor: primary,
                  keyboardType: const TextInputType.numberWithOptions(
                      signed: false, decimal: false),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(3),
                  ],
                  style: TextStyle(
                      color: primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 14),
                  textAlign: TextAlign.left,
                  decoration: InputDecoration(
                      isDense: true,
                      isCollapsed: true,
                      contentPadding: EdgeInsets.zero,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                      hintText: '0',
                      hintStyle: TextStyle(
                          color: primary.withValues(alpha: 0.35),
                          fontSize: 14)),
                  onChanged: (v) {
                    final n = int.tryParse(v.replaceAll(',', '.'));
                    if (n != null) widget.onDaysChanged(n.clamp(1, 365));
                  },
                ),
              ),
            ),
            const SizedBox(width: 2),
            Text('Tagen',
                style: TextStyle(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white70
                        : AppTheme.textSecondary(context),
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
          ]),
        ),
        Expanded(
          child: Center(
            child: SizedBox(
              width: 73,
              child: TextField(
                controller: _pctCtrl,
                focusNode: _pctFocus,
                keyboardType: const TextInputType.numberWithOptions(
                    signed: false, decimal: false),
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(2),
                ],
                style: TextStyle(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white
                        : AppTheme.textPrimary(context),
                    fontWeight: FontWeight.w700,
                    fontSize: 14),
                textAlign: TextAlign.center,
                decoration: InputDecoration(
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(vertical: 7, horizontal: 8),
                  filled: true,
                  fillColor: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white.withValues(alpha: 0.05)
                      : const Color(0xFFFFFFFF),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(4),
                      borderSide: BorderSide(
                          color: Theme.of(context).brightness == Brightness.dark
                              ? Colors.white.withValues(alpha: 0.16)
                              : const Color(0xFFE2E8F0))),
                  focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(4),
                      borderSide:
                          BorderSide(color: primary.withValues(alpha: 0.9))),
                  suffixText: '%',
                  suffixStyle: TextStyle(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.white70
                          : AppTheme.textSecondary(context),
                      fontWeight: FontWeight.w600,
                      fontSize: 13),
                  hintText: '0',
                  hintStyle: TextStyle(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.white38
                          : AppTheme.textDisabled(context),
                      fontSize: 13),
                ),
                onChanged: (v) {
                  final n = double.tryParse(v.replaceAll(',', '.'));
                  if (n != null) {
                    widget.onPercentChanged(n.clamp(0.0, 95.0).toDouble());
                  }
                },
              ),
            ),
          ),
        ),
        Expanded(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Container(
                  width: 1,
                  height: 18,
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white.withValues(alpha: 0.18)
                      : const Color(0xFFE2E8F0)),
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(discountedText,
                      textAlign: TextAlign.right,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: Theme.of(context).brightness == Brightness.dark
                              ? Colors.white
                              : AppTheme.textPrimary(context),
                          fontWeight: FontWeight.w700,
                          fontSize: 14)),
                ),
              )
            ],
          ),
        )
      ]),
    );
  }
}
