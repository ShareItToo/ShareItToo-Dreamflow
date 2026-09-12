import 'dart:async';
import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lendify/models/category.dart' as app_category;
import 'package:lendify/models/item.dart';
import 'package:lendify/models/user.dart' as app_user;
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/search_category_inference.dart';
import 'package:lendify/widgets/modern_range_picker_sheet.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/all_categories_overlay.dart';
import 'package:lendify/openai/openai_config.dart';
import 'package:lendify/widgets/app_popup.dart';

class SearchOverlay {
  static Future<void> show(BuildContext context) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      isDismissible: true,
      enableDrag: true,
      barrierColor: Colors.black.withValues(alpha: 0.25),
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Material(
          type: MaterialType.transparency,
          child: SafeArea(
            child: Scaffold(
              backgroundColor: Colors.transparent,
              body: Stack(children: [
                Positioned.fill(
                    child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                        child: Container(color: Colors.transparent))),
                Positioned.fill(child: _SearchSheet()),
              ]),
            ),
          ),
        );
      },
    );
  }
}

class _SearchSheet extends StatefulWidget {
  @override
  State<_SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<_SearchSheet> {
  final TextEditingController _aiCtrl = TextEditingController();
  final FocusNode _aiFocus = FocusNode();
  final TextEditingController _whatCtrl = TextEditingController();
  final FocusNode _whatFocus = FocusNode();
  final TextEditingController _whereCtrl = TextEditingController();
  final FocusNode _whereFocus = FocusNode();
  // Floating suggestion overlays so the fields below don't move
  final LayerLink _whatLink = LayerLink();
  final LayerLink _whereLink = LayerLink();
  final GlobalKey _whatFieldKey = GlobalKey();
  final GlobalKey _whereFieldKey = GlobalKey();
  OverlayEntry? _whatOverlay;
  OverlayEntry? _whereOverlay;
  DateTime? _pickup;
  DateTime? _return;

  Timer? _aiDebounce;
  Timer? _categoryDebounce;

  Future<void> _openDateTimeFlow() async {
    // Use a simple calendar range picker for an easier flow (like availability check)
    final now = DateTime.now();
    final initialRange = (_pickup != null && _return != null)
        ? DateTimeRange(start: _pickup!, end: _return!)
        : null;
    final picked = await showModalBottomSheet<DateTimeRange>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      // Make barrier transparent so our in-sheet BackdropFilter can blur the page content
      barrierColor: Colors.transparent,
      builder: (context) => ModernRangePickerSheet(
        firstDate: DateTime(now.year, now.month, now.day),
        lastDate: DateTime(now.year + 2, now.month, now.day),
        initialRange: initialRange,
        allowSameDayEnd: true,
        unavailableRanges: const [],
      ),
    );
    if (!mounted) return;
    if (picked != null) {
      setState(() {
        _pickup = picked.start;
        _return = picked.end;
      });
    }
  }

  List<String> _suggestions = [];
  List<String> _locSuggestions = [];
  // Live-updated grid suggestions based on Was/Wo/Datum
  List<Item> _displayNearby = [];
  List<app_category.Category> _categories = [];

  // Multiple possible categories inferred from "Was" or "KI-Suche".
  // NOTE: In Suche we only allow the 11 coarse categories (same as "Neue Anzeige").
  // We keep this list for internal/AI logic, but we intentionally do not render
  // live suggestion chips in the UI (per previous request).
  List<String> _categoryCandidates = [];
  Set<String> _verifiedOwnerIds = {};
  Map<String, app_user.User> _usersById = {};
  app_user.User? _currentUser;
  // Recent section removed per request – keep local var for minimal code churn but unused
  List<String> _recent = [];
  bool _loading = true;
  bool _recomputing = false;

  @override
  void initState() {
    super.initState();
    _loadData();
    _whatFocus.addListener(() {
      if (_whatFocus.hasFocus) {
        _updateWhatOverlay();
      } else {
        _hideWhatOverlay();
      }
    });
    _whereFocus.addListener(() {
      if (_whereFocus.hasFocus) {
        _updateWhereOverlay();
      } else {
        _hideWhereOverlay();
      }
    });
  }

  Future<void> _loadData() async {
    late final List<Item> items;
    late final List<app_user.User> users;
    late final app_user.User? me;
    late final List<app_category.Category> categories;
    try {
      items = await DataService.getPublicItems();
      if (!mounted) return;
      users = await DataService.getUsers();
      if (!mounted) return;
      me = await DataService.getCurrentUser();
      if (!mounted) return;
      categories = await DataService.getCategories();
      if (!mounted) return;
    } catch (error) {
      debugPrint('[_SearchSheet] initial load failed: $error');
      if (!mounted) return;
      setState(() => _loading = false);
      return;
    }
    final byId = {for (final u in users) u.id: u};
    final verifiedIds =
        users.where((u) => u.isVerified).map((u) => u.id).toSet();
    final itemTitles =
        items.map((e) => e.title).where((e) => e.trim().isNotEmpty).toList();
    setState(() {
      _usersById = byId;
      _verifiedOwnerIds = verifiedIds;
      _currentUser = me;
      _categories = categories;
      _suggestions = itemTitles.take(12).toList();
      _recent = itemTitles.take(12).toList();
      _loading = false;
    });
    // Compute initial grid suggestions
    await _recomputeNearbySuggestions();
  }

  @override
  void dispose() {
    _hideWhatOverlay();
    _hideWhereOverlay();
    _aiDebounce?.cancel();
    _categoryDebounce?.cancel();
    _aiCtrl.dispose();
    _aiFocus.dispose();
    _whatCtrl.dispose();
    _whatFocus.dispose();
    _whereCtrl.dispose();
    _whereFocus.dispose();
    super.dispose();
  }

  List<String> _availableCategoryNamesForAI() {
    // STRICT: Only the 11 coarse categories that exist in "Neue Anzeige".
    // The AI must not invent any other category labels.
    return _coarseCategoryOrder;
  }

  Future<void> _suggestCategoriesFromText(String text) async {
    if (!OpenAIConfig.isAvailable) return;
    if (!mounted) return;
    final q = text.trim();
    if (q.isEmpty || _categories.isEmpty) {
      if (_categoryCandidates.isNotEmpty) {
        setState(() => _categoryCandidates = []);
      }
      return;
    }

    // Fast local guess (no network) so the UI reacts instantly.
    final local = _normalizeCoarseCategory(q);
    final quick = <String>[];
    if (local != null) quick.add(local);
    if (quick.isNotEmpty) {
      setState(() {
        final uniq = <String>{};
        _categoryCandidates = [
          for (final c in quick)
            if (uniq.add(c)) c
        ];
      });
    }

    // Then ask OpenAI for multiple plausible categories.
    try {
      final suggestions = await OpenAIConfig.suggestCategories(
        userInput: q,
        availableCategories: _availableCategoryNamesForAI(),
        maxResults: 5,
      );
      if (!mounted) return;

      final mapped = <String>[];
      for (final s in suggestions) {
        final c = _normalizeCoarseCategory(s);
        if (c != null) mapped.add(c);
      }
      // Always also include the local guess at the front.
      if (local != null) mapped.insert(0, local);
      final ids = <String>{};
      final unique = [
        for (final c in mapped)
          if (ids.add(c)) c
      ];

      setState(() {
        // Don't show the currently selected category as a "candidate" chip.
        _categoryCandidates =
            unique.where((c) => c != _coarseCategory).toList();
      });
    } catch (e) {
      debugPrint('[_SearchSheet] suggestCategories failed: $e');
    }
  }

  double? _priceMin;
  double? _priceMax;

  /// Selected category must always come from the same coarse categories as
  /// the "Neue Anzeige" flow.
  String? _coarseCategory;

  List<String> get _coarseCategoryOrder => DataService.coarseCategoryOrder;

  String? _normalizeCoarseCategory(String raw) {
    return inferSearchCoarseCategory(
      raw: raw,
      coarseCategories: _coarseCategoryOrder,
      vocabularies: _categories.map(
        (category) => SearchCategoryVocabulary(
          coarseCategory: DataService.coarseCategoryFor(category.name),
          name: category.name,
          subcategories: category.subcategories,
        ),
      ),
    );
  }

  IconData _iconForCoarseGroup(String group) {
    switch (group) {
      case 'Technik & Elektronik':
        return Icons.devices_other_outlined;
      case 'Werkzeuge & Kleingeräte':
        return Icons.construction_outlined;
      case 'Haushalt & Wohnen':
        return Icons.weekend_outlined;
      case 'Sport & Hobbys':
        return Icons.sports_soccer_outlined;
      case 'Auto & Mobilität':
        return Icons.directions_car_outlined;
      case 'Garten & Outdoor':
        return Icons.grass_outlined;
      case 'Events & Feiern':
        return Icons.celebration_outlined;
      case 'Baby & Familie':
        return Icons.family_restroom;
      case 'Reisen & Camping':
        return Icons.travel_explore;
      case 'Kleidung & Anlässe':
        return Icons.checkroom_outlined;
      case 'Büro & Lernen':
        return Icons.school_outlined;
      case 'Sonstiges':
        return Icons.more_horiz;
      default:
        return Icons.category_outlined;
    }
  }

  Future<void> _openCategoryPicker() async {
    final data = [
      for (final c in _coarseCategoryOrder)
        CategoryChipData(id: c, label: c, icon: _iconForCoarseGroup(c)),
    ];
    final pickedId = await AllCategoriesOverlay.show(context, data);
    if (!mounted) return;
    if (pickedId == null) return;
    _setSelectedCoarseCategory(pickedId);
    await _recomputeNearbySuggestions();
  }

  void _setSelectedCoarseCategory(String? coarse) {
    if (_coarseCategory == coarse) return;
    setState(() => _coarseCategory = coarse);
  }

  Future<void> _parseAIPrompt(String prompt) async {
    if (prompt.trim().isEmpty) return;
    if (!OpenAIConfig.isAvailable) {
      if (mounted) {
        AppPopup.info(
          context,
          title: 'KI-Hilfe vorübergehend nicht verfügbar',
          message: 'Bitte suche in der Zwischenzeit manuell weiter.',
        );
      }
      return;
    }

    // The compatibility helper is fail-closed and currently returns only an
    // empty local parse result; no search text leaves the device.
    final result = await OpenAIConfig.parseSearchQuery(prompt);
    if (!mounted) return;

    setState(() {
      // Update "Was" field
      if (result['what'] != null && result['what'].toString().isNotEmpty) {
        _whatCtrl.text = result['what'].toString();
      }

      // Update "Wo" field
      if (result['where'] != null && result['where'].toString().isNotEmpty) {
        _whereCtrl.text = result['where'].toString();
      }

      // Update "Wann" fields
      if (result['whenStart'] != null &&
          result['whenStart'].toString().isNotEmpty) {
        try {
          final startDate = DateTime.parse(result['whenStart'].toString());
          _pickup = startDate;

          // Set end date if provided, otherwise same as start
          if (result['whenEnd'] != null &&
              result['whenEnd'].toString().isNotEmpty) {
            _return = DateTime.parse(result['whenEnd'].toString());
          } else {
            _return = startDate;
          }
        } catch (e) {
          debugPrint('Failed to parse dates: $e');
        }
      }

      // Update price filters
      if (result['priceMin'] != null) {
        _priceMin = result['priceMin'] as double?;
      }
      if (result['priceMax'] != null) {
        _priceMax = result['priceMax'] as double?;
      }

      // Update category filter
      if (result['category'] != null &&
          result['category'].toString().isNotEmpty) {
        final normalized =
            _normalizeCoarseCategory(result['category'].toString());
        _coarseCategory = normalized;
      }
    });

    // Heuristic fallback: if AI didn't provide a valid category, try to infer from the user's "Was".
    if (_coarseCategory == null && _whatCtrl.text.trim().isNotEmpty) {
      final inferred = _normalizeCoarseCategory(_whatCtrl.text);
      if (inferred != null) _setSelectedCoarseCategory(inferred);
    }
    // Refresh live grid after AI updated fields
    await _recomputeNearbySuggestions();

    // Suggest possible categories based on the final "Was" (preferred) or the whole prompt.
    final basis = _whatCtrl.text.trim().isNotEmpty ? _whatCtrl.text : prompt;
    _categoryDebounce?.cancel();
    _categoryDebounce = Timer(const Duration(milliseconds: 200), () {
      if (!mounted) return;
      _suggestCategoriesFromText(basis);
    });
  }

  void _onQueryChangedWhat(String v) async {
    final items = await DataService.getItems();
    if (!mounted) return;
    final q = v.toLowerCase();
    final titles =
        items.map((e) => e.title).where((t) => t.trim().isNotEmpty).toSet();
    final tags =
        items.expand((e) => e.tags).where((t) => t.trim().isNotEmpty).toSet();
    final all = <String>{...titles, ...tags};
    final matches = all.where((t) => t.toLowerCase().contains(q)).toList()
      ..sort((a, b) =>
          a.toLowerCase().indexOf(q).compareTo(b.toLowerCase().indexOf(q)));
    setState(() => _suggestions = matches.take(10).toList());
    _updateWhatOverlay();

    // If the user types a category name (or common synonym like "Auto"), snap to one of the 11.
    final inferred = _normalizeCoarseCategory(v);
    if (inferred != null) _setSelectedCoarseCategory(inferred);

    // Also show multiple possible categories under "Wann".
    _categoryDebounce?.cancel();
    _categoryDebounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      _suggestCategoriesFromText(v);
    });

    await _recomputeNearbySuggestions();
  }

  void _onQueryChangedWhere(String v) async {
    final q = v.toLowerCase();
    final cities = DataService.getCities().keys;
    final items = await DataService.getItems();
    if (!mounted) return;
    final fromItems = <String>{
      ...items.map((e) => e.city),
      ...items.map((e) => e.country),
      ...items.map((e) => e.locationText)
    };
    final all = <String>{...cities, ...fromItems}
        .where((e) => e.trim().isNotEmpty)
        .toSet();
    final matches = all.where((t) => t.toLowerCase().contains(q)).toList()
      ..sort((a, b) =>
          a.toLowerCase().indexOf(q).compareTo(b.toLowerCase().indexOf(q)));
    setState(() => _locSuggestions = matches.take(10).toList());
    _updateWhereOverlay();
    await _recomputeNearbySuggestions();
  }

  void _addToRecentWhat(String term) {
    if (term.trim().isEmpty) return;
    setState(() {
      _recent.removeWhere((e) => e.toLowerCase() == term.toLowerCase());
      _recent.insert(0, term);
      if (_recent.length > 12) _recent = _recent.take(12).toList();
    });
  }

  String _fmt(DateTime? dt) => dt == null
      ? 'Zeitraum wählen'
      : '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year}';

  // Live compute suggestions grid near user's city or typed "Wo"
  Future<void> _recomputeNearbySuggestions() async {
    if (!mounted) return;
    try {
      setState(() => _recomputing = true);
      final whatRaw = _whatCtrl.text.trim();
      final inferredCatFromWhat = _normalizeCoarseCategory(whatRaw);
      final what = (inferredCatFromWhat != null &&
              inferredCatFromWhat == _coarseCategory)
          ? ''
          : whatRaw.toLowerCase();
      final whereRaw = _whereCtrl.text.trim();

      // Resolve target city text
      String targetCity = '';
      if (whereRaw.isNotEmpty) {
        final extracted = DataService.deriveCityFromAddress(whereRaw);
        targetCity = extracted.isNotEmpty ? extracted : whereRaw;
      } else {
        targetCity = (_currentUser?.city ?? '').toString();
      }

      // Find coordinates for target city
      (double lat, double lng)? targetCoords;
      if (targetCity.trim().isNotEmpty) {
        final cities = DataService.getCities();
        for (final e in cities.entries) {
          if (e.key.toLowerCase() == targetCity.toLowerCase()) {
            targetCoords = (e.value.$1, e.value.$2);
            break;
          }
        }
        if (targetCoords == null) {
          for (final e in cities.entries) {
            if (targetCity.toLowerCase().contains(e.key.toLowerCase()) ||
                e.key.toLowerCase().contains(targetCity.toLowerCase())) {
              targetCoords = (e.value.$1, e.value.$2);
              break;
            }
          }
        }
      }

      final categoryIds = _coarseCategory == null
          ? const <String>[]
          : _categories
              .where((category) =>
                  DataService.coarseCategoryFor(category.name) ==
                  _coarseCategory)
              .map((category) => category.id)
              .toList();
      final candidates = await DataService.searchPublicItems(
        query: what,
        categoryIds: categoryIds,
        minPrice: _priceMin,
        maxPrice: _priceMax,
        latitude: targetCoords?.$1,
        longitude: targetCoords?.$2,
        radiusKm: targetCoords == null ? null : 60,
        sort: targetCoords == null ? 'newest' : 'distance',
        limit: 80,
      );

      // Optional availability filter when a date range is set
      List<Item> available = candidates;
      if (_pickup != null && _return != null) {
        final start = _pickup!;
        final end = _return!;
        final subset = candidates.take(80).toList();
        final checks = await Future.wait(subset.map((it) =>
            DataService.checkAvailability(
                itemId: it.id, start: start, end: end)));
        available = [
          for (int i = 0; i < subset.length; i++)
            if (checks[i]) subset[i]
        ];
      }

      if (!mounted) return;
      setState(() {
        _displayNearby = available.take(16).toList();
      });
    } catch (e) {
      debugPrint('[_SearchSheet] recompute suggestions failed: $e');
    } finally {
      if (mounted) setState(() => _recomputing = false);
    }
  }

  Future<void> _openResults() async {
    final whereRaw = _whereCtrl.text.trim();
    final origin = _resolveOriginCoords(whereRaw);
    final whatRaw = _whatCtrl.text.trim();
    final inferredCatFromWhat = _normalizeCoarseCategory(whatRaw);
    final what =
        inferredCatFromWhat != null && inferredCatFromWhat == _coarseCategory
            ? ''
            : whatRaw;
    final categoryIds = _coarseCategory == null
        ? const <String>[]
        : _categories
            .where((category) =>
                DataService.coarseCategoryFor(category.name) == _coarseCategory)
            .map((category) => category.id)
            .toList();
    if (mounted) setState(() => _recomputing = true);
    late final List<Item> items;
    try {
      items = await DataService.searchPublicItems(
        query: what,
        categoryIds: categoryIds,
        minPrice: _priceMin,
        maxPrice: _priceMax,
        latitude: origin?.lat,
        longitude: origin?.lng,
        radiusKm: origin == null ? null : 60,
        sort: origin == null ? 'newest' : 'distance',
        limit: 100,
      );
    } catch (_) {
      if (!mounted) return;
      AppPopup.error(
        context,
        title: 'Suche nicht erreichbar',
        message: 'Bitte versuche es in einem Moment erneut.',
      );
      return;
    } finally {
      if (mounted) setState(() => _recomputing = false);
    }

    String buildQueryText() {
      final w = _whatCtrl.text.trim();
      final loc = _whereCtrl.text.trim();
      if (w.isNotEmpty && loc.isNotEmpty) return '$w in $loc';
      if (w.isNotEmpty) return w;
      if (loc.isNotEmpty) return loc;
      return 'Suche';
    }

    String? buildDateText() {
      if (_pickup == null || _return == null) return null;
      final months = [
        'Jan',
        'Feb',
        'Mär',
        'Apr',
        'Mai',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Okt',
        'Nov',
        'Dez'
      ];
      final s = _pickup!;
      final e = _return!;
      final left = '${s.day}. ${months[s.month - 1]}';
      final right = '${e.day}. ${months[e.month - 1]}';
      return '$left – $right';
    }

    final query = buildQueryText();
    final date = buildDateText();
    // Push results as a full screen above the overlay so Back returns to KI-Suche
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        builder: (_) => SearchResultsScreen(
            queryText: query,
            dateText: date,
            results: items,
            originCoords: origin),
      ),
    );
  }

  ({double lat, double lng})? _resolveOriginCoords(String whereRaw) {
    if (whereRaw.trim().isEmpty) return null;

    // We only have demo cities locally (until Maps API is connected), so we resolve
    // the freeform address to the closest matching known city token.
    final extracted = DataService.deriveCityFromAddress(whereRaw);
    final targetCity = extracted.isNotEmpty ? extracted : whereRaw;
    final cities = DataService.getCities();

    for (final e in cities.entries) {
      if (e.key.toLowerCase() == targetCity.toLowerCase()) {
        return (lat: e.value.$1, lng: e.value.$2);
      }
    }
    for (final e in cities.entries) {
      if (targetCity.toLowerCase().contains(e.key.toLowerCase()) ||
          e.key.toLowerCase().contains(targetCity.toLowerCase())) {
        return (lat: e.value.$1, lng: e.value.$2);
      }
    }
    return null;
  }

  void _clearAll() {
    setState(() {
      _aiCtrl.clear();
      _whatCtrl.clear();
      _whereCtrl.clear();
      _pickup = null;
      _return = null;
      _priceMin = null;
      _priceMax = null;
      _coarseCategory = null;
      _categoryCandidates = [];
    });
    _hideWhatOverlay();
    _hideWhereOverlay();
    // Reset suggestions to defaults near user's city
    _recomputeNearbySuggestions();
  }

  void _updateWhatOverlay() {
    if (!mounted) return;
    if (!_whatFocus.hasFocus ||
        _whatCtrl.text.isEmpty ||
        _suggestions.isEmpty) {
      _hideWhatOverlay();
      return;
    }
    final overlay = Overlay.of(context);
    // We want the suggestions panel to span from the very left to the very right of the screen.
    // Therefore use the full screen width and horizontally shift the follower so its left aligns with the screen edge.
    final screenSize = MediaQuery.of(context).size;
    final fullWidth = screenSize.width;
    // Compute available height to the bottom so the panel can stretch "bis ganz unten".
    double maxHeight = 320;
    double horizontalShift =
        0; // negative dx of field to align left edge to screen
    try {
      final box =
          _whatFieldKey.currentContext?.findRenderObject() as RenderBox?;
      if (box != null) {
        final fieldSize = box.size;
        final fieldOffset = box.localToGlobal(Offset.zero);
        final panelTop =
            fieldOffset.dy + fieldSize.height + 8; // follower offset
        final screenH = MediaQuery.of(context).size.height;
        final bottomPad = MediaQuery.of(context).padding.bottom + 16;
        maxHeight = (screenH - panelTop - bottomPad).clamp(120.0, 600.0);
        horizontalShift = -fieldOffset.dx; // move panel to screen's left edge
      }
    } catch (_) {
      // keep default
    }
    if (_whatOverlay == null) {
      _whatOverlay = OverlayEntry(builder: (ctx) {
        return CompositedTransformFollower(
          link: _whatLink,
          showWhenUnlinked: false,
          targetAnchor: Alignment.bottomLeft,
          followerAnchor: Alignment.topLeft,
          offset: Offset(horizontalShift, 8),
          child: _FloatingSuggestionsPanel(
            width: fullWidth,
            panelMaxHeight: maxHeight,
            icon: Icons.search,
            query: _whatCtrl.text,
            suggestions: _suggestions,
            onTap: (s) async {
              setState(() => _whatCtrl.text = s);
              _whatCtrl.selection = TextSelection.fromPosition(
                  TextPosition(offset: _whatCtrl.text.length));
              _addToRecentWhat(s);
              _hideWhatOverlay();
              _whatFocus.unfocus();
              await _recomputeNearbySuggestions();
            },
            onClose: _hideWhatOverlay,
          ),
        );
      });
      overlay.insert(_whatOverlay!);
    } else {
      _whatOverlay!.markNeedsBuild();
    }
  }

  void _hideWhatOverlay() {
    _whatOverlay?.remove();
    _whatOverlay = null;
  }

  void _updateWhereOverlay() {
    if (!mounted) return;
    if (!_whereFocus.hasFocus ||
        _whereCtrl.text.isEmpty ||
        _locSuggestions.isNotEmpty == false) {
      _hideWhereOverlay();
      return;
    }
    final overlay = Overlay.of(context);
    // Full-width suggestions panel for the location field as well
    final screenSize = MediaQuery.of(context).size;
    final fullWidth = screenSize.width;
    // Compute dynamic maxHeight to allow suggestions down to the screen bottom
    double maxHeight = 320;
    double horizontalShift = 0;
    try {
      final box =
          _whereFieldKey.currentContext?.findRenderObject() as RenderBox?;
      if (box != null) {
        final fieldSize = box.size;
        final fieldOffset = box.localToGlobal(Offset.zero);
        final panelTop = fieldOffset.dy + fieldSize.height + 8;
        final screenH = MediaQuery.of(context).size.height;
        final bottomPad = MediaQuery.of(context).padding.bottom + 16;
        maxHeight = (screenH - panelTop - bottomPad).clamp(120.0, 700.0);
        horizontalShift = -fieldOffset.dx;
      }
    } catch (_) {}
    if (_whereOverlay == null) {
      _whereOverlay = OverlayEntry(builder: (ctx) {
        return CompositedTransformFollower(
          link: _whereLink,
          showWhenUnlinked: false,
          targetAnchor: Alignment.bottomLeft,
          followerAnchor: Alignment.topLeft,
          offset: Offset(horizontalShift, 8),
          child: _FloatingSuggestionsPanel(
            width: fullWidth,
            panelMaxHeight: maxHeight,
            icon: Icons.place_outlined,
            query: _whereCtrl.text,
            suggestions: _locSuggestions,
            onTap: (s) async {
              setState(() => _whereCtrl.text = s);
              _whereCtrl.selection = TextSelection.fromPosition(
                  TextPosition(offset: _whereCtrl.text.length));
              _hideWhereOverlay();
              _whereFocus.unfocus();
              await _recomputeNearbySuggestions();
            },
            onClose: _hideWhereOverlay,
          ),
        );
      });
      overlay.insert(_whereOverlay!);
    } else {
      _whereOverlay!.markNeedsBuild();
    }
  }

  void _hideWhereOverlay() {
    _whereOverlay?.remove();
    _whereOverlay = null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;

    Widget offsetOnSuggest({required Widget child, required bool active}) {
      // 0.5 mm ~ ~2 logical px. Apply subtle upward shift when suggestions are visible.
      final dy = active ? -2.0 : 0.0;
      return AnimatedSlide(
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        offset: Offset(
            0, dy / 56.0), // normalize against field height for consistency
        child: child,
      );
    }

    final header = Column(children: [
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: SizedBox(
          height: 44,
          child: Stack(children: [
            Center(
                child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.35),
                        borderRadius: BorderRadius.circular(2)))),
            Positioned(
              right: 12,
              top: 6,
              child: SizedBox(
                width: 44,
                height: 44,
                child: InkWell(
                  borderRadius: BorderRadius.circular(22),
                  onTap: () => Navigator.of(context).maybePop(),
                  child: const Center(
                      child: Icon(Icons.close, color: Colors.white)),
                ),
              ),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 4),
      Center(
          child: Text('Suche',
              style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800, color: Colors.white))),
      const SizedBox(height: 8),
    ]);

    final scroller = SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // KI-Suche Feld (ganz oben)
        Container(
          decoration: BoxDecoration(
            color: primary.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: primary.withValues(alpha: 0.25)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Icon(Icons.auto_awesome, color: primary, size: 16),
                const SizedBox(width: 6),
                Text('KI-Suche',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: primary)),
              ]),
              const SizedBox(height: 6),
              TextField(
                controller: _aiCtrl,
                focusNode: _aiFocus,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                maxLines: 3,
                minLines: 2,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  border: InputBorder.none,
                  hintText:
                      'Beschreibe einfach, was du brauchst.\n„Akkuschrauber in Leipzig für 2 Tage“',
                  hintStyle: TextStyle(
                      color: Colors.white.withValues(alpha: 0.35),
                      fontSize: 12),
                ),
                onChanged: (v) {
                  // Debounce to avoid firing an OpenAI request on every keystroke.
                  _aiDebounce?.cancel();

                  // Debounce category suggestions too (separate from the structured parse).
                  _categoryDebounce?.cancel();
                  _categoryDebounce =
                      Timer(const Duration(milliseconds: 450), () {
                    if (!mounted) return;
                    _suggestCategoriesFromText(v);
                  });

                  // Instant: infer category from taxonomy (e.g., "Auto" -> "Auto & Mobilität").
                  final inferred = _normalizeCoarseCategory(v);
                  if (inferred != null) {
                    _setSelectedCoarseCategory(inferred);
                    _recomputeNearbySuggestions();
                  }

                  _aiDebounce = Timer(const Duration(milliseconds: 650), () {
                    if (!mounted) return;
                    _parseAIPrompt(v);
                  });
                },
                onSubmitted: (v) {
                  _aiDebounce?.cancel();
                  _parseAIPrompt(v);
                  _aiFocus.unfocus();
                },
              ),
              // Beispieltext entfernt – bewusst minimaler Platz unter dem Feld
            ],
          ),
        ),
        const SizedBox(height: 10),
        offsetOnSuggest(
          active: _whatOverlay != null,
          child: CompositedTransformTarget(
            link: _whatLink,
            child: _FieldShell(
              key: _whatFieldKey,
              label: 'Was',
              trailingIcon: Icons.widgets_outlined,
              child: TextField(
                controller: _whatCtrl,
                focusNode: _whatFocus,
                onChanged: _onQueryChangedWhat,
                onSubmitted: (v) => _addToRecentWhat(v),
                style: const TextStyle(color: Colors.white, fontSize: 13),
                textAlignVertical: TextAlignVertical.center,
                maxLines: 1,
                minLines: 1,
                decoration: const InputDecoration(
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  border: InputBorder.none,
                  hintText: 'Was suchst du?',
                  hintStyle: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        _FieldShell(
          label: 'Kategorie',
          trailingIcon: Icons.category_outlined,
          child: InkWell(
            onTap: _openCategoryPicker,
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              height: 56,
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                Expanded(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      _coarseCategory ?? 'Alle Kategorien',
                      style:
                          const TextStyle(fontSize: 13, color: Colors.white70),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                if (_coarseCategory != null)
                  IconButton(
                    onPressed: () async {
                      setState(() => _coarseCategory = null);
                      await _recomputeNearbySuggestions();
                    },
                    icon: const Icon(Icons.close,
                        color: Colors.white70, size: 18),
                    tooltip: 'Kategorie entfernen',
                  ),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 6),
        offsetOnSuggest(
          active: _whereOverlay != null,
          child: CompositedTransformTarget(
            link: _whereLink,
            child: _FieldShell(
              key: _whereFieldKey,
              label: 'Wo',
              trailingIcon: Icons.place_outlined,
              child: TextField(
                controller: _whereCtrl,
                focusNode: _whereFocus,
                onChanged: _onQueryChangedWhere,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                textAlignVertical: TextAlignVertical.center,
                maxLines: 1,
                minLines: 1,
                decoration: const InputDecoration(
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                  border: InputBorder.none,
                  hintText: 'Ort oder Adresse',
                  hintStyle: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        _FieldShell(
          label: 'Wann',
          trailingIcon: Icons.event_available_rounded,
          child: InkWell(
            onTap: () async {
              await _openDateTimeFlow();
              await _recomputeNearbySuggestions();
            },
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              height: 56,
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                Expanded(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      (_pickup == null || _return == null)
                          ? 'Zeitraum wählen'
                          : '${_fmt(_pickup)} → ${_fmt(_return)}',
                      style:
                          const TextStyle(fontSize: 13, color: Colors.white70),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 12),
        // "Zuletzt gesucht" Abschnitt entfernt
        const SizedBox(height: 12),
        Text('Beliebt in deiner Nähe',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700, color: Colors.white)),
        const SizedBox(height: 8),
        (_loading || _recomputing)
            ? const Center(
                child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2)))
            : (_displayNearby.isEmpty
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: Text('Keine passenden Vorschläge',
                        style: TextStyle(color: Colors.white70, fontSize: 12)))
                : LayoutBuilder(builder: (context, constraints) {
                    // Grid: 3 Anzeigen pro Zeile, 5 Zeilen max (=> bis zu 15 Items)
                    final itemCount =
                        _displayNearby.length > 15 ? 15 : _displayNearby.length;
                    const crossAxisCount = 3;
                    const spacing = 10.0;
                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        crossAxisSpacing: spacing,
                        mainAxisSpacing: spacing,
                        childAspectRatio: 1,
                      ),
                      itemCount: itemCount,
                      itemBuilder: (context, index) {
                        final it = _displayNearby[index];
                        final ownerVerified =
                            _verifiedOwnerIds.contains(it.ownerId);
                        final owner = _usersById[it.ownerId];
                        return _MiniItem(
                          item: it,
                          ownerVerified: ownerVerified,
                          rating: 0,
                          reviews: 0,
                          onTap: () => ItemDetailsOverlay.showFullPage(context,
                              item: it, owner: owner),
                        );
                      },
                    );
                  })),
        const SizedBox(height: 0),
      ]),
    );

    final bottomBar = SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Row(children: [
          Expanded(
              child: OutlinedButton(
                  onPressed: _clearAll,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white70,
                    side:
                        BorderSide(color: Colors.white.withValues(alpha: 0.25)),
                  ),
                  child: const Text('Zurücksetzen'))),
          const SizedBox(width: 12),
          Expanded(
              child: FilledButton(
                  onPressed: _openResults, child: const Text('Suchen'))),
        ]),
      ),
    );

    final content = SafeArea(
      top: true,
      bottom: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        header,
        Expanded(child: scroller),
        bottomBar,
      ]),
    );

    return Container(
      decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.34),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08))),
      child: content,
    );
  }
}

class _FieldShell extends StatelessWidget {
  final String label;
  final Widget child;
  final IconData? trailingIcon;
  const _FieldShell(
      {super.key, required this.label, required this.child, this.trailingIcon});
  static const double _labelWidth =
      82; // ensures first letters align vertically without truncating "Kategorie"
  static const double _iconSlotWidth = 28; // fixed slot for icon alignment
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10),
      constraints: const BoxConstraints(minHeight: 56),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Leading label with fixed width so first letters align
          SizedBox(
            width: _labelWidth,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.primary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Field/content area
          Expanded(
            child: SizedBox(
              height: 56,
              child: Align(
                alignment: Alignment.centerLeft,
                child: child,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Trailing icon slot so text ends exactly before the icon
          SizedBox(
            width: _iconSlotWidth,
            child: trailingIcon == null
                ? const SizedBox.shrink()
                : Center(
                    child: Icon(trailingIcon, size: 20, color: Colors.white70)),
          ),
        ],
      ),
    );
  }
}

class _MiniItem extends StatelessWidget {
  final Item item;
  final bool ownerVerified;
  final double rating;
  final int reviews;
  final VoidCallback? onTap;
  const _MiniItem(
      {required this.item,
      required this.ownerVerified,
      required this.rating,
      required this.reviews,
      this.onTap});
  @override
  Widget build(BuildContext context) {
    final bool isVerified = ownerVerified;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: DecoratedBox(
          decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.32),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 10,
                    offset: const Offset(0, 6))
              ]),
          child: Stack(children: [
            Positioned.fill(
                child: AppImage(
                    url: item.photos.isNotEmpty ? item.photos.first : '',
                    fit: BoxFit.cover)),
            // Verification badge moved to top-right and reduced to half size
            Positioned(
              right: 6,
              top: 6,
              child: Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                    color: isVerified ? const Color(0xFF22C55E) : Colors.grey,
                    shape: BoxShape.circle),
                child: Icon(
                    isVerified ? Icons.verified : Icons.verified_outlined,
                    size: 8,
                    color: Colors.white),
              ),
            ),
            // Title overlay at the bottom for better discoverability
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(8, 16, 8, 8),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.55),
                      Colors.black.withValues(alpha: 0.20),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Text(
                  item.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    // Slightly increased (~+1/6 of original ~11.5 => ~9.6)
                    fontSize: 9.6,
                    fontWeight: FontWeight.w700,
                    height: 1.15,
                  ),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _FloatingSuggestionsPanel extends StatelessWidget {
  final double width;
  final double? panelMaxHeight;
  final List<String> suggestions;
  final void Function(String) onTap;
  final VoidCallback? onClose;
  final IconData icon;
  final String query;
  const _FloatingSuggestionsPanel({
    required this.width,
    required this.suggestions,
    required this.onTap,
    required this.icon,
    required this.query,
    this.onClose,
    this.panelMaxHeight,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      child: SizedBox(
        width: width,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Stack(
              children: [
                // Blur the content behind this panel so underlying text is not readable.
                BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                  child: Container(color: Colors.black.withValues(alpha: 0.45)),
                ),
                ConstrainedBox(
                  constraints: BoxConstraints(
                      maxHeight: max(180.0, (panelMaxHeight ?? 260))),
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    shrinkWrap: true,
                    itemCount: suggestions.length,
                    separatorBuilder: (_, __) => Divider(
                        height: 1, color: Colors.white.withValues(alpha: 0.08)),
                    itemBuilder: (context, i) {
                      final s = suggestions[i];
                      return InkWell(
                        onTap: () => onTap(s),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 10),
                          child: Row(children: [
                            Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                  color: theme.colorScheme.primary
                                      .withValues(alpha: 0.18),
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                      color: theme.colorScheme.primary
                                          .withValues(alpha: 0.35))),
                              child: Icon(icon, size: 14, color: Colors.white),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                                child: _Highlighted(query: query, text: s)),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Highlighted extends StatelessWidget {
  final String query;
  final String text;
  const _Highlighted({required this.query, required this.text});

  @override
  Widget build(BuildContext context) {
    final q = query.trim();
    if (q.isEmpty) {
      return Text(text,
          style: const TextStyle(color: Colors.white, fontSize: 13));
    }
    final lower = text.toLowerCase();
    final idx = lower.indexOf(q.toLowerCase());
    if (idx < 0) {
      return Text(text,
          style: const TextStyle(color: Colors.white, fontSize: 13));
    }
    final before = text.substring(0, idx);
    final match = text.substring(idx, idx + q.length);
    final after = text.substring(idx + q.length);
    return RichText(
      text: TextSpan(children: [
        TextSpan(
            text: before,
            style: const TextStyle(color: Colors.white, fontSize: 13)),
        TextSpan(
            text: match,
            style: const TextStyle(
                color: Colors.lightBlueAccent,
                fontWeight: FontWeight.w700,
                fontSize: 13)),
        TextSpan(
            text: after,
            style: const TextStyle(color: Colors.white, fontSize: 13)),
      ]),
      overflow: TextOverflow.ellipsis,
    );
  }
}
