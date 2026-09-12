import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lendify/services/data_service.dart';
import 'package:provider/provider.dart';
import 'package:lendify/widgets/selection_controls.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/utils/category_label.dart';
import 'package:lendify/utils/condition_labels.dart';
import 'package:lendify/theme.dart';

class FiltersOverlay {
  static Future<Map<String, dynamic>?> show(BuildContext context,
      {Map<String, dynamic>? initial}) async {
    return await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      isDismissible: true,
      enableDrag: true,
      barrierColor: Colors.black.withValues(alpha: 0.18),
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Material(
          type: MaterialType.transparency,
          child: SafeArea(
            child: Scaffold(
              backgroundColor: Colors.transparent,
              body: Stack(children: [
                // Allow tap outside sheet to dismiss
                Positioned.fill(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => Navigator.of(context).maybePop(),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                      child: Container(color: Colors.transparent),
                    ),
                  ),
                ),
                Align(
                    alignment: Alignment.bottomCenter,
                    child: _FiltersSheet(initial: initial)),
              ]),
            ),
          ),
        );
      },
    );
  }
}

class _FiltersSheet extends StatefulWidget {
  final Map<String, dynamic>? initial;
  const _FiltersSheet({this.initial});
  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  RangeValues _price = const RangeValues(0, 500);
  String _priceUnit = 'day'; // 'hour' | 'day' | 'week'
  double _distance = 25;
  bool _verifiedOnly = false;
  String _condition =
      'egal'; // 'neu' | 'wie-neu' | 'gut' | 'akzeptabel' | 'egal' (label "Alle")
  // Delivery filters: multi-select list of codes: 'dropoff' | 'pickup' | 'express'
  final Set<String> _delivery = <String>{};
  final Set<String> _selectedCategories = {};
  String _sort = 'Preis';
  String _priceOrder = 'asc'; // 'asc' | 'desc'
  String _ratingOrder =
      'desc'; // 'asc' | 'desc' (default: highest rating first)
  // Use one common SliderTheme for both Entfernung (Slider) and Preis/Tag (RangeSlider)
  SliderThemeData _commonSliderTheme(BuildContext context) =>
      SliderTheme.of(context).copyWith(
        trackHeight: 2.0,
        // Ensure both single and range sliders use the same paddle-style indicator
        valueIndicatorShape: const PaddleSliderValueIndicatorShape(),
        rangeValueIndicatorShape: const PaddleRangeSliderValueIndicatorShape(),
      );
  double _minRating = 0;
  // Progressive disclosure: whether to show advanced section
  bool _showAdvanced = false;
  // Coarse/top-level categories used in filters (labels only)
  List<String> _allCoarse = const [];
  final TextEditingController _minCtrl = TextEditingController(text: '0');
  final TextEditingController _maxCtrl = TextEditingController(text: '500');
  final FocusNode _minFocus = FocusNode();
  final FocusNode _maxFocus = FocusNode();
  bool _minCleared = false;
  bool _maxCleared = false;
  // Ort
  final String _locationMode = 'registered'; // 'gps' | 'address' | 'registered'
  final TextEditingController _addressCtrl = TextEditingController();
  String? _registeredCity;
  final String _distanceBias = 'near'; // 'near' | 'far'

  @override
  void initState() {
    super.initState();
    _load();
    final i = widget.initial;
    if (i != null) {
      _price = i['price'] ?? _price;
      _priceUnit = i['priceUnit'] ?? _priceUnit;
      _distance = i['distance'] ?? _distance;
      _verifiedOnly = i['verified'] ?? _verifiedOnly;
      _condition = i['condition'] ?? _condition;
      _selectedCategories
          .addAll((i['categories'] as List<String>? ?? const []));
      _delivery
        ..clear()
        ..addAll(
            ((i['delivery'] as List?)?.cast<String>() ?? const <String>[]));
      _sort = i['sort'] ?? _sort;
      _minRating = (i['minRating'] as double?) ?? _minRating;
      _minCtrl.text = _price.start.round().toString();
      _maxCtrl.text = _price.end.round().toString();
      _priceOrder = i['priceOrder'] ?? _priceOrder;
      _ratingOrder = i['ratingOrder'] ?? _ratingOrder;
      // Determine if advanced section should be shown initially
      // Do not consider rating order anymore (no UI for asc/desc on rating)
      final hasAdvanced = (_sort != 'Preis') ||
          (_priceOrder != 'asc') ||
          _delivery.isNotEmpty ||
          (_minRating > 0) ||
          _selectedCategories.isNotEmpty;
      _showAdvanced = hasAdvanced;
    }
    // Clear default values on first focus so placeholder is readable and defaults vanish
    _minFocus.addListener(() {
      if (_minFocus.hasFocus && !_minCleared) {
        _minCleared = true;
        _minCtrl.clear();
        setState(() {});
      }
    });
    _maxFocus.addListener(() {
      if (_maxFocus.hasFocus && !_maxCleared) {
        _maxCleared = true;
        _maxCtrl.clear();
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _minCtrl.dispose();
    _maxCtrl.dispose();
    _addressCtrl.dispose();
    _minFocus.dispose();
    _maxFocus.dispose();
    super.dispose();
  }

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
    if (g.contains('büro') || g.contains('buero') || g.contains('gewerbe')) {
      return Icons.business_center;
    }
    if (g.contains('baby') || g.contains('kinder')) return Icons.child_friendly;
    if (g.contains('haustier')) return Icons.pets;
    return Icons.category;
  }

  Future<void> _load() async {
    final cats = await DataService.getCategories();
    final user = await DataService.getCurrentUser();
    // Build unique coarse group set from categories and align to fixed order
    final present = <String>{
      for (final c in cats) DataService.coarseCategoryFor(c.name)
    };
    final ordered = [
      for (final g in DataService.coarseCategoryOrder)
        if (present.contains(g)) g
    ];
    if (!mounted) return;
    setState(() {
      _allCoarse =
          ordered.isNotEmpty ? ordered : DataService.coarseCategoryOrder;
      _registeredCity = user?.city;
    });
  }

  void _syncPriceFromText() {
    final min =
        double.tryParse(_minCtrl.text.replaceAll(',', '.')) ?? _price.start;
    final max =
        double.tryParse(_maxCtrl.text.replaceAll(',', '.')) ?? _price.end;
    final clampedMin = min.clamp(0, 500);
    final clampedMax = max.clamp(0, 500);
    final orderedMin = clampedMin <= clampedMax ? clampedMin : clampedMax;
    final orderedMax = clampedMax >= clampedMin ? clampedMax : clampedMin;
    setState(() =>
        _price = RangeValues(orderedMin.toDouble(), orderedMax.toDouble()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sheet = Container(
      constraints: const BoxConstraints(maxWidth: 720),
      decoration: BoxDecoration(
        color: AppTheme.surfacePrimary(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: AppTheme.glassStroke(context)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 44,
              child: Stack(children: [
                Center(
                    child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                            color: AppTheme.textDisabled(context),
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
                      child: Center(
                          child: Icon(Icons.close,
                              color: AppTheme.textPrimary(context))),
                    ),
                  ),
                ),
              ]),
            ),
            const SizedBox(height: 4),
            Center(
                child: Builder(
                    builder: (context) => Text(
                        context.watch<LocalizationController>().t('Filter'),
                        style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppTheme.textPrimary(context))))),
            const SizedBox(height: 12),
            Expanded(
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Ort selector removed per request
                      const SizedBox.shrink(),

                      // ---------- Standardansicht (kompakt) ----------
                      const SizedBox(height: 12),

                      const SizedBox(height: 12),
                      _Section(
                        label: context
                            .watch<LocalizationController>()
                            .t('Preis/Tag'),
                        labelColor: Theme.of(context).colorScheme.primary,
                        child: Column(children: [
                          // Fixed to day; hide unit switcher
                          // Use the EXACT same theme as Entfernung
                          SliderTheme(
                            data: _commonSliderTheme(context),
                            child: RangeSlider(
                              values: _price,
                              min: 0,
                              max: 500,
                              divisions: 100,
                              labels: RangeLabels('${_price.start.round()} €',
                                  '${_price.end.round()} €'),
                              onChanged: (v) {
                                setState(() {
                                  _price = v;
                                  _minCtrl.text = v.start.round().toString();
                                  _maxCtrl.text = v.end.round().toString();
                                  _priceUnit = 'day';
                                });
                              },
                            ),
                          ),
                          Row(children: [
                            Expanded(
                              child: TextField(
                                controller: _minCtrl,
                                focusNode: _minFocus,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                        decimal: true),
                                style: TextStyle(
                                    color: AppTheme.textPrimary(context)),
                                decoration: InputDecoration(
                                  labelText: 'Min',
                                  hintText: '€ 0',
                                  hintStyle: TextStyle(
                                      color: AppTheme.textSecondary(context)),
                                ),
                                onSubmitted: (_) => _syncPriceFromText(),
                                onEditingComplete: _syncPriceFromText,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextField(
                                controller: _maxCtrl,
                                focusNode: _maxFocus,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                        decimal: true),
                                style: TextStyle(
                                    color: AppTheme.textPrimary(context)),
                                decoration: InputDecoration(
                                  labelText: 'Max',
                                  hintText: '€ 500',
                                  hintStyle: TextStyle(
                                      color: AppTheme.textSecondary(context)),
                                ),
                                onSubmitted: (_) => _syncPriceFromText(),
                                onEditingComplete: _syncPriceFromText,
                              ),
                            ),
                          ])
                        ]),
                      ),

                      const SizedBox(height: 12),
                      _Section(
                          label: context
                              .watch<LocalizationController>()
                              .t('Entfernung (bis zu)'),
                          dense: true,
                          child: Column(children: [
                            SliderTheme(
                              data: _commonSliderTheme(context),
                              child: Slider(
                                  value: _distance,
                                  min: 0,
                                  max: 100,
                                  divisions: 20,
                                  label: '${_distance.round()} km',
                                  onChanged: (v) =>
                                      setState(() => _distance = v)),
                            ),
                            Row(children: [
                              Expanded(
                                  child: Text('${_distance.round()} km',
                                      style: TextStyle(
                                          color: AppTheme.textSecondary(
                                              context)))),
                              const SizedBox.shrink()
                            ])
                          ])),

                      const SizedBox(height: 12),
                      _Section(
                        label: context
                            .watch<LocalizationController>()
                            .t('Zustand'),
                        child: _FilterConditionPager(
                          selected: _condition,
                          onChanged: (v) => setState(() => _condition = v),
                        ),
                      ),

                      const SizedBox(height: 12),
                      _Section(
                          label: context
                              .watch<LocalizationController>()
                              .t('Verifizierung'),
                          child: SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Builder(builder: (context) {
                              final primary =
                                  Theme.of(context).colorScheme.primary;
                              return Text(
                                context
                                    .watch<LocalizationController>()
                                    .t('Nur verifiziert'),
                                style: TextStyle(
                                    color: _verifiedOnly
                                        ? primary
                                        : AppTheme.textBody(context),
                                    fontWeight: FontWeight.w700),
                              );
                            }),
                            value: _verifiedOnly,
                            onChanged: (v) => setState(() => _verifiedOnly = v),
                          )),

                      const SizedBox(height: 12),
                      Center(
                        child: TextButton.icon(
                          onPressed: () =>
                              setState(() => _showAdvanced = !_showAdvanced),
                          icon: Icon(
                              _showAdvanced
                                  ? Icons.expand_less
                                  : Icons.expand_more,
                              color: Theme.of(context).colorScheme.primary),
                          label: Builder(
                              builder: (context) => Text(
                                    context.watch<LocalizationController>().t(
                                        _showAdvanced
                                            ? 'Weitere Filter ausblenden'
                                            : 'Weitere Filter anzeigen'),
                                    style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary,
                                        fontWeight: FontWeight.w700),
                                  )),
                        ),
                      ),

                      // ---------- Erweiterter Bereich ----------
                      if (_showAdvanced) ...[
                        const SizedBox(height: 12),
                        _Section(
                          label: context
                              .watch<LocalizationController>()
                              .t('Sortieren nach'),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(children: [
                                  Expanded(
                                      child: _SortPager(
                                          selected: _sort,
                                          onChanged: (v) =>
                                              setState(() => _sort = v))),
                                ]),
                                if (_sort == 'Preis')
                                  Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: SizedBox(
                                      height: 40,
                                      child: SingleChildScrollView(
                                        scrollDirection: Axis.horizontal,
                                        physics: const BouncingScrollPhysics(),
                                        child: Row(children: [
                                          _RadioTextOption(
                                            label: context
                                                .watch<LocalizationController>()
                                                .t('aufsteigend'),
                                            value: 'asc',
                                            groupValue: _priceOrder,
                                            onChanged: (v) =>
                                                setState(() => _priceOrder = v),
                                          ),
                                          const SizedBox(width: 12),
                                          _RadioTextOption(
                                            label: context
                                                .watch<LocalizationController>()
                                                .t('absteigend'),
                                            value: 'desc',
                                            groupValue: _priceOrder,
                                            onChanged: (v) =>
                                                setState(() => _priceOrder = v),
                                          ),
                                          const SizedBox(width: 4),
                                        ]),
                                      ),
                                    ),
                                  ),
                                // No ascending/descending options for rating
                              ]),
                        ),
                        const SizedBox(height: 12),
                        _Section(
                          label: context
                              .watch<LocalizationController>()
                              .t('Lieferung'),
                          subtitle: Text(
                              context
                                  .watch<LocalizationController>()
                                  .t('Mehrfachauswahl möglich'),
                              style: TextStyle(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ToggleTextOption(
                                label: context
                                    .watch<LocalizationController>()
                                    .t('Lieferung bei Abgabe'),
                                selected: _delivery.contains('dropoff'),
                                onTap: () => setState(() {
                                  final currently =
                                      _delivery.contains('dropoff');
                                  if (currently) {
                                    _delivery.remove('dropoff');
                                    _delivery.remove('express');
                                  } else {
                                    _delivery.add('dropoff');
                                  }
                                }),
                              ),
                              const SizedBox(height: 8),
                              ToggleTextOption(
                                label: context
                                    .watch<LocalizationController>()
                                    .t('Abholung bei Rückgabe'),
                                selected: _delivery.contains('pickup'),
                                onTap: () => setState(() {
                                  final currently =
                                      _delivery.contains('pickup');
                                  if (currently) {
                                    _delivery.remove('pickup');
                                  } else {
                                    _delivery.add('pickup');
                                  }
                                }),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        _Section(
                            label: context
                                .watch<LocalizationController>()
                                .t('Bewertung'),
                            child: Row(children: [
                              for (int i = 1; i <= 5; i++)
                                IconButton(
                                  onPressed: () =>
                                      setState(() => _minRating = i.toDouble()),
                                  icon: Icon(
                                      i <= _minRating
                                          ? Icons.star
                                          : Icons.star_border,
                                      color: i <= _minRating
                                          ? const Color(0xFFFB923C)
                                          : AppTheme.textDisabled(context)),
                                ),
                              const SizedBox.shrink(),
                            ])),
                        const SizedBox(height: 12),
                        _Section(
                            label: context
                                .watch<LocalizationController>()
                                .t('Kategorien'),
                            subtitle: Text(
                                context
                                    .watch<LocalizationController>()
                                    .t('Mehrfachauswahl möglich'),
                                style: TextStyle(
                                    color:
                                        Theme.of(context).colorScheme.primary,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600)),
                            child: GridView.builder(
                              physics: const NeverScrollableScrollPhysics(),
                              shrinkWrap: true,
                              padding: EdgeInsets.zero,
                              gridDelegate:
                                  const SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: 4,
                                      crossAxisSpacing: 12,
                                      mainAxisSpacing: 12,
                                      childAspectRatio: 0.68),
                              itemCount: _allCoarse.length,
                              itemBuilder: (context, index) {
                                final raw = _allCoarse[index];
                                final label = stackCategoryLabel(raw);
                                final active =
                                    _selectedCategories.contains(raw);
                                return InkWell(
                                  onTap: () => setState(() {
                                    if (active) {
                                      _selectedCategories.remove(raw);
                                    } else {
                                      _selectedCategories.add(raw);
                                    }
                                  }),
                                  borderRadius: BorderRadius.circular(14),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: active
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primary
                                          : AppTheme.surfaceSecondary(context),
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(
                                          color: active
                                              ? Theme.of(context)
                                                  .colorScheme
                                                  .primary
                                              : AppTheme.glassStroke(context)),
                                    ),
                                    padding: const EdgeInsets.all(8),
                                    child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                              _coarseIconForGroup(
                                                  _allCoarse[index]),
                                              color: active
                                                  ? Colors.white
                                                  : AppTheme.textBody(context),
                                              size: 24),
                                          const SizedBox(height: 6),
                                          Text(
                                            label,
                                            maxLines: 2,
                                            softWrap: true,
                                            overflow: TextOverflow.clip,
                                            textAlign: TextAlign.center,
                                            style: TextStyle(
                                              color: active
                                                  ? Colors.white
                                                  : AppTheme.textBody(context),
                                              fontWeight: FontWeight.w700,
                                              fontSize: 9,
                                              height: 1.15,
                                              letterSpacing: -0.1,
                                            ),
                                          ),
                                        ]),
                                  ),
                                );
                              },
                            )),
                        const SizedBox(height: 8),
                      ],
                    ]),
              ),
            ),
            // Pinned footer actions
            Container(
              decoration: BoxDecoration(
                color: AppTheme.surfaceMuted(context),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.glassStroke(context)),
              ),
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
              child: Row(children: [
                Expanded(
                    child: OutlinedButton(
                        onPressed: () {
                          // Apply defaults and close immediately
                          final defaults = {
                            'price': const RangeValues(0, 500),
                            'priceUnit': 'day',
                            'distance': 25.0,
                            'distanceBias': 'near',
                            'verified': false,
                            'condition': 'egal',
                            'delivery': <String>[],
                            'categories': <String>[],
                            'sort': 'Preis',
                            'priceOrder': 'asc',
                            'ratingOrder': 'desc',
                            'minRating': 0.0,
                            'location': {
                              'mode': 'registered',
                              'address': '',
                              'registeredCity': _registeredCity,
                            }
                          };
                          Navigator.of(context).pop(defaults);
                        },
                        child: Builder(
                            builder: (context) => Text(context
                                .watch<LocalizationController>()
                                .t('Zurücksetzen'))))),
                const SizedBox(width: 12),
                Expanded(
                    child: ElevatedButton(
                        onPressed: () {
                          _syncPriceFromText();
                          Navigator.of(context).pop({
                            'price': _price,
                            'priceUnit': _priceUnit,
                            'distance': _distance,
                            'distanceBias': _distanceBias,
                            'verified': _verifiedOnly,
                            'condition': _condition,
                            'delivery': _delivery.toList(),
                            'categories': _selectedCategories.toList(),
                            'sort': _sort,
                            'priceOrder': _priceOrder,
                            'ratingOrder': _ratingOrder,
                            'minRating': _minRating,
                            'location': {
                              'mode': _locationMode,
                              'address': _addressCtrl.text.trim(),
                              'registeredCity': _registeredCity,
                            }
                          });
                        },
                        child: Builder(
                            builder: (context) => Text(context
                                .watch<LocalizationController>()
                                .t('Anwenden'))))),
              ]),
            ),
          ],
        ),
      ),
    );

    return Padding(padding: const EdgeInsets.only(bottom: 8), child: sheet);
  }
}

class _Section extends StatelessWidget {
  final String label;
  final Widget child;
  final bool dense;
  final Color? labelColor;
  final Widget? subtitle;
  const _Section(
      {required this.label,
      required this.child,
      this.dense = false,
      this.labelColor,
      this.subtitle});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
          color: AppTheme.surfaceSecondary(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.glassStroke(context))),
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: dense ? 6 : 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: TextStyle(
                fontSize: 12,
                color: labelColor ?? AppTheme.textSecondary(context),
                fontWeight: FontWeight.w600)),
        if (subtitle != null) ...[const SizedBox(height: 4), subtitle!],
        const SizedBox(height: 6),
        child,
      ]),
    );
  }
}

// ---------- Horizontal pager for Zustand in Filters (mirrors Create Listing style) ----------
class _FilterConditionPager extends StatefulWidget {
  final String selected;
  final ValueChanged<String> onChanged;
  const _FilterConditionPager(
      {required this.selected, required this.onChanged});
  @override
  State<_FilterConditionPager> createState() => _FilterConditionPagerState();
}

class _FilterConditionPagerState extends State<_FilterConditionPager> {
  late final PageController _controller;
  int _currentIndex = 0;
  // Keep order stable; include "Alle" to allow resetting the filter quickly.
  static const List<String> _codes = [
    'neu',
    'wie-neu',
    'gut',
    'akzeptabel',
    'egal'
  ];

  int _indexFor(String sel) {
    final i = _codes.indexOf(sel);
    return i >= 0 ? i : _codes.indexOf('egal');
  }

  @override
  void initState() {
    super.initState();
    _currentIndex = _indexFor(widget.selected);
    _controller =
        PageController(initialPage: _currentIndex, viewportFraction: 0.5);
  }

  @override
  void didUpdateWidget(covariant _FilterConditionPager oldWidget) {
    super.didUpdateWidget(oldWidget);
    final newIndex = _indexFor(widget.selected);
    if (newIndex != _currentIndex && _controller.hasClients) {
      _currentIndex = newIndex;
      _controller.jumpToPage(_currentIndex);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final labels = _codes
        .map((c) => l10n.t(ConditionLabels.filterLabel(c)))
        .toList(growable: false);
    final width = MediaQuery.sizeOf(context).width;
    return SizedBox(
      height: 56,
      child: PageView.builder(
        controller: _controller,
        physics: const BouncingScrollPhysics(),
        onPageChanged: (i) {
          setState(() => _currentIndex = i);
          if (i >= 0 && i < _codes.length) widget.onChanged(_codes[i]);
        },
        itemCount: labels.length,
        itemBuilder: (context, i) {
          final selected = i == _currentIndex;
          final itemWidth = width * 0.5;
          return Center(
            child: SizedBox(
              width: itemWidth - 16,
              child: Center(
                child: _PillChoice(
                  label: labels[i],
                  selected: selected,
                  onTap: () {
                    if (_controller.hasClients) {
                      _controller.animateToPage(i,
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOut);
                    }
                  },
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PillChoice extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _PillChoice(
      {required this.label, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? primary : AppTheme.surfaceMuted(context),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
              color: selected ? primary : AppTheme.glassStroke(context)),
        ),
        child: Text(label,
            style: TextStyle(
                color: selected ? Colors.black : AppTheme.textBody(context),
                fontWeight: FontWeight.w600)),
      ),
    );
  }
}

// ---------- Text-only scroller for Sortieren nach ----------
class _SortPager extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onChanged;
  const _SortPager({required this.selected, required this.onChanged});

  static const List<String> _options = [
    'Preis',
    'Entfernung',
    'Bewertung',
    'Neueste'
  ];

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final primary = Theme.of(context).colorScheme.primary;
    return SizedBox(
      height: 40,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        child: Row(
          children: [
            const SizedBox(width: 4),
            for (final opt in _options) ...[
              InkWell(
                onTap: () => onChanged(opt),
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Text(
                    l10n.t(opt),
                    style: TextStyle(
                      color: opt == selected ? primary : AppTheme.textBody(context),
                      fontWeight:
                          opt == selected ? FontWeight.w700 : FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                    softWrap: false,
                  ),
                ),
              ),
              const SizedBox(width: 12),
            ],
          ],
        ),
      ),
    );
  }
}

class _RadioTextOption extends StatelessWidget {
  final String label;
  final String value;
  final String groupValue;
  final ValueChanged<String> onChanged;
  const _RadioTextOption(
      {required this.label,
      required this.value,
      required this.groupValue,
      required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final selected = value == groupValue;
    final primary = Theme.of(context).colorScheme.primary;
    return InkWell(
      onTap: () => onChanged(value),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          DotCircleIndicator(selected: selected, dotColor: primary),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
                color: selected ? primary : AppTheme.textBody(context),
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500),
            overflow: TextOverflow.ellipsis,
            softWrap: false,
          ),
        ]),
      ),
    );
  }
}
