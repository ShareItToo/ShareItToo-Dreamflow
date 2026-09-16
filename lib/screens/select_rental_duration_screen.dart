import 'dart:math';
import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_popup.dart';

class SelectRentalDurationScreen extends StatefulWidget {
  final Item item;
  final DateTimeRange? initialRange;
  const SelectRentalDurationScreen(
      {super.key, required this.item, this.initialRange});

  @override
  State<SelectRentalDurationScreen> createState() =>
      _SelectRentalDurationScreenState();
}

class _SelectRentalDurationScreenState
    extends State<SelectRentalDurationScreen> {
  late DateTime _firstDate;
  late DateTime _lastDate;
  late DateTime _visibleMonth;
  List<DateTimeRange> _unavailable = const [];

  DateTime? _start;
  DateTime? _end;
  int _selectedDays = 1;
  bool _checking = false;
  bool _overlapsBlocked = false;
  bool _calendarExpanded = true;

  bool get _usesRemoteBackend =>
      BackendConfig.enabled && !QaRuntimeService.isEnabled;

  static const _monthsDe = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember'
  ];

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _firstDate = DateTime(now.year, now.month, now.day);
    _lastDate = DateTime(now.year + 1, now.month, now.day);
    _visibleMonth = DateTime(_firstDate.year, _firstDate.month, 1);
    final r = widget.initialRange;
    if (r != null) {
      _start = _strip(r.start);
      _end = _strip(r.end);
      _selectedDays = max(1, _end!.difference(_start!).inDays);
      _visibleMonth = DateTime(_start!.year, _start!.month, 1);
    }
    _loadUnavailable();
    DataService.clearSavedDeliverySelection(widget.item.id);
  }

  DateTime _strip(DateTime d) => DateTime(d.year, d.month, d.day);
  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  Future<void> _loadUnavailable() async {
    final ranges =
        await DataService.getUnavailableRangesForItem(widget.item.id);
    if (!mounted) return;
    setState(() => _unavailable = ranges);
    if (_start != null && _end != null) {
      setState(() => _overlapsBlocked = _rangeOverlapsBooked(_start!, _end!));
    }
  }

  String? _continueHint() {
    if (_start == null) return 'Bitte wähle mindestens einen Miettag.';
    if (_overlapsBlocked) return 'Bitte wähle einen verfügbaren Zeitraum.';
    return null;
  }

  bool _isBookedDay(DateTime d) {
    final day = _strip(d);
    for (final r in _unavailable) {
      final s = _strip(r.start);
      final e = _strip(r.end);
      if (!day.isBefore(s) && day.isBefore(e)) return true;
    }
    return false;
  }

  bool _rangeOverlapsBooked(DateTime a, DateTime b) {
    final s = _strip(a);
    final e = _strip(b);
    final start = s.isBefore(e) ? s : e;
    final end = s.isBefore(e) ? e : s;
    for (final r in _unavailable) {
      final rs = _strip(r.start);
      final re = _strip(r.end);
      if (start.isBefore(re) && end.isAfter(rs)) return true;
    }
    return false;
  }

  void _onDayTap(DateTime day) {
    if (day.isBefore(_firstDate)) {
      final label = _formatShortDate(day);
      AppPopup.info(
        context,
        title: 'Datum nicht verfügbar',
        message: '$label liegt in der Vergangenheit.',
      );
      return;
    }
    if (day.isAfter(_lastDate) || _isBookedDay(day)) return;
    setState(() {
      if (_start == null || (_start != null && _end != null)) {
        _start = _strip(day);
        _end = null;
        _selectedDays = 1;
        _overlapsBlocked = false;
        _calendarExpanded = true;
      } else {
        if (day.isBefore(_start!)) {
          _start = _strip(day);
          _end = null;
          _overlapsBlocked = false;
          _calendarExpanded = true;
        } else {
          _end = _strip(day).add(const Duration(days: 1));
          _overlapsBlocked = _rangeOverlapsBooked(_start!, _end!);
          _selectedDays = max(1, _end!.difference(_start!).inDays);
          _calendarExpanded = false;
        }
      }
    });
  }

  void _prevMonth() {
    final prev = DateTime(_visibleMonth.year, _visibleMonth.month - 1, 1);
    if (!prev.isBefore(DateTime(_firstDate.year, _firstDate.month, 1))) {
      setState(() => _visibleMonth = prev);
    }
  }

  void _nextMonth() {
    final next = DateTime(_visibleMonth.year, _visibleMonth.month + 1, 1);
    final lastBound = DateTime(_lastDate.year, _lastDate.month, 1);
    if (!next.isAfter(lastBound)) {
      setState(() => _visibleMonth = next);
    }
  }

  (DateTime, DateTime)? _findEarliestRange(int days) {
    final cap = _lastDate;
    DateTime cursor = _start ?? _firstDate;
    while (!cursor.isAfter(cap)) {
      final end = cursor.add(Duration(days: days));
      if (end.isAfter(_lastDate.add(const Duration(days: 1)))) break;
      if (!_rangeOverlapsBooked(cursor, end)) return (cursor, end);
      cursor = cursor.add(const Duration(days: 1));
    }
    return null;
  }

  List<_ThresholdChip> get _thresholdChips {
    if (!widget.item.autoApplyDiscounts ||
        widget.item.longRentalDiscounts.isEmpty) {
      return const [];
    }
    final tiers = List.of(widget.item.longRentalDiscounts)
      ..removeWhere((t) => t.days <= 1)
      ..sort((a, b) => a.days.compareTo(b.days));
    final maxPct = tiers.fold<double>(
        0, (p, e) => e.discountPercent > p ? e.discountPercent : p);
    return [
      for (final t in tiers)
        _ThresholdChip(
            days: t.days,
            label:
                'ab ${t.days} Tagen ${t.discountPercent.toStringAsFixed(0)}%',
            best: t.discountPercent == maxPct),
    ];
  }

  int get _previewDays {
    if (_start == null) return _selectedDays;
    final end = _end ?? _start!.add(const Duration(days: 1));
    return max(1, end.difference(_start!).inDays);
  }

  _PricePreview get _pricePreview {
    final tuple = DataService.computeTotalWithDiscounts(
        item: widget.item, days: _previewDays);
    final rentalSubtotal = tuple.$1;
    final baseTotal = tuple.$2;
    final discountAmt = tuple.$4;
    final platformFee =
        DataService.platformContributionForRental(rentalSubtotal);

    final total =
        double.parse((rentalSubtotal + platformFee).toStringAsFixed(2));

    return _PricePreview(
      rentalSubtotal: double.parse(rentalSubtotal.toStringAsFixed(2)),
      baseTotal: double.parse(baseTotal.toStringAsFixed(2)),
      discountAmount: double.parse(discountAmt.toStringAsFixed(2)),
      platformFee: double.parse(platformFee.toStringAsFixed(2)),
      total: total,
    );
  }

  bool get _canContinue => !_checking && _continueHint() == null;

  Future<void> _confirm() async {
    if (!_canContinue) return;
    setState(() => _checking = true);
    try {
      final start = _start!;
      final end = _end ?? _start!.add(const Duration(days: 1));
      final ok = await DataService.checkAvailability(
          itemId: widget.item.id, start: start, end: end);
      if (!mounted) return;
      if (ok) {
        await DataService.clearSavedDeliverySelection(widget.item.id);
        if (!mounted) return;
        Navigator.of(context).pop(DateTimeRange(start: start, end: end));
      } else {
        AppPopup.info(
          context,
          title: 'Zeitraum nicht verfügbar',
          message: 'Der Artikel ist in diesem Zeitraum bereits gebucht.',
        );
        setState(() => _overlapsBlocked = true);
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  String _formatShortDate(DateTime s) {
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(s.day)}. ${_monthsDe[s.month - 1]}';
  }

  String _dateSpanText() {
    if (_start == null || _end == null) return '';
    final s = _start!;
    final e = _end!.subtract(const Duration(days: 1));
    if (_isSameDay(s, e)) {
      return _formatShortDate(s);
    }
    return '${_formatShortDate(s)} – ${_formatShortDate(e)}';
  }

  String _singleDateText(DateTime s) => _formatShortDate(s);

  String _durationLabel() {
    final d = (_start != null && _end != null)
        ? max(1, _end!.difference(_start!).inDays)
        : _selectedDays;
    return d == 1 ? '1 Miettag' : '$d Miettage';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark
        ? Colors.black.withValues(alpha: 0.34)
        : AppTheme.surfaceMuted(context);
    final card = isDark
        ? Colors.white.withValues(alpha: 0.06)
        : AppTheme.surfacePrimary(context);
    final border = isDark
        ? Colors.white.withValues(alpha: 0.12)
        : AppTheme.glassStroke(context);
    final sub = isDark
        ? Colors.white.withValues(alpha: 0.70)
        : AppTheme.textSecondary(context);
    final primary = BrandColors.primary;
    final danger = BrandColors.danger;
    final chips = _thresholdChips;
    final preview = _pricePreview;
    final continueHint = _continueHint();

    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 4, 6),
              child: SizedBox(
                height: 40,
                child: Stack(
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: IconButton(
                        tooltip:
                            MaterialLocalizations.of(context).backButtonTooltip,
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: Icon(Icons.arrow_back,
                            color: isDark
                                ? Colors.white
                                : AppTheme.textPrimary(context)),
                      ),
                    ),
                    Center(
                      child: Text(
                        'Verfügbarkeit prüfen',
                        style: TextStyle(
                            color: isDark
                                ? Colors.white
                                : AppTheme.textPrimary(context),
                            fontWeight: FontWeight.w800,
                            fontSize: 16),
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: IconButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: Icon(Icons.close,
                            color: isDark
                                ? Colors.white
                                : AppTheme.textPrimary(context)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 2, 16, 118),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _StepCard(
                      step: '1',
                      title: 'Zeitraum',
                      subtitle:
                          'Wähle den Tag oder Zeitraum, an dem du den Artikel nutzen möchtest.',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 12),
                            decoration: BoxDecoration(
                                color: card,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: border)),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_durationLabel(),
                                      style: TextStyle(
                                          color: isDark
                                              ? Colors.white
                                              : AppTheme.textPrimary(context),
                                          fontWeight: FontWeight.w900,
                                          fontSize: 22)),
                                  const SizedBox(height: 4),
                                  if (_start != null && _end != null)
                                    Text(_dateSpanText(),
                                        style:
                                            TextStyle(color: sub, fontSize: 13))
                                  else if (_start != null)
                                    Text(_singleDateText(_start!),
                                        style:
                                            TextStyle(color: sub, fontSize: 13))
                                  else
                                    Text('Noch kein Miettag ausgewählt',
                                        style: TextStyle(
                                            color: sub, fontSize: 13)),
                                  if (_start != null && _end == null) ...[
                                    const SizedBox(height: 8),
                                    Text(
                                        'Ein einzelner ausgewählter Tag zählt als 1 Miettag.',
                                        style: TextStyle(
                                            color: sub, fontSize: 12)),
                                  ],
                                ]),
                          ),
                          if (chips.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                for (final chip in chips)
                                  _DiscountChip(
                                    chip: chip,
                                    isSelected: _previewDays >= chip.days &&
                                        chip.days ==
                                            chips
                                                .where((c) =>
                                                    _previewDays >= c.days)
                                                .map((c) => c.days)
                                                .fold<int?>(
                                                    null,
                                                    (p, e) => p == null || e > p
                                                        ? e
                                                        : p),
                                    onTap: () {
                                      setState(() {
                                        _selectedDays = chip.days;
                                        if (_start == null) {
                                          final found =
                                              _findEarliestRange(_selectedDays);
                                          if (found != null) {
                                            _start = found.$1;
                                            _end = found.$2;
                                            _overlapsBlocked = false;
                                            _visibleMonth = DateTime(
                                                _start!.year, _start!.month, 1);
                                          }
                                        } else {
                                          _end = _start!.add(
                                              Duration(days: _selectedDays));
                                          _overlapsBlocked =
                                              _rangeOverlapsBooked(
                                                  _start!, _end!);
                                        }
                                      });
                                    },
                                  ),
                              ],
                            ),
                          ],
                          const SizedBox(height: 12),
                          InkWell(
                            onTap: () => setState(
                                () => _calendarExpanded = !_calendarExpanded),
                            borderRadius: BorderRadius.circular(18),
                            child: Container(
                              padding:
                                  const EdgeInsets.fromLTRB(12, 12, 12, 12),
                              decoration: BoxDecoration(
                                  color: card,
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(color: border)),
                              child: Column(
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          _calendarExpanded
                                              ? 'Kalender'
                                              : (_start == null
                                                  ? 'Kalender öffnen'
                                                  : 'Zeitraum ändern'),
                                          style: TextStyle(
                                              color: isDark
                                                  ? Colors.white
                                                  : AppTheme.textPrimary(
                                                      context),
                                              fontWeight: FontWeight.w700),
                                        ),
                                      ),
                                      Icon(
                                          _calendarExpanded
                                              ? Icons.keyboard_arrow_up
                                              : Icons.keyboard_arrow_down,
                                          color: isDark
                                              ? Colors.white70
                                              : AppTheme.textSecondary(
                                                  context)),
                                    ],
                                  ),
                                  AnimatedCrossFade(
                                    duration: const Duration(milliseconds: 180),
                                    crossFadeState: _calendarExpanded
                                        ? CrossFadeState.showFirst
                                        : CrossFadeState.showSecond,
                                    firstChild: Column(
                                      children: [
                                        const SizedBox(height: 10),
                                        Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            IconButton(
                                              visualDensity:
                                                  VisualDensity.compact,
                                              onPressed: () => _prevMonth(),
                                              icon: Icon(Icons.chevron_left,
                                                  color: isDark
                                                      ? Colors.white
                                                      : AppTheme.textPrimary(
                                                          context)),
                                            ),
                                            Expanded(
                                              child: Text(
                                                '${_monthsDe[_visibleMonth.month - 1]} ${_visibleMonth.year}',
                                                textAlign: TextAlign.center,
                                                style: TextStyle(
                                                    color: isDark
                                                        ? Colors.white
                                                        : AppTheme.textPrimary(
                                                            context),
                                                    fontWeight:
                                                        FontWeight.w800),
                                              ),
                                            ),
                                            IconButton(
                                              visualDensity:
                                                  VisualDensity.compact,
                                              onPressed: () => _nextMonth(),
                                              icon: Icon(Icons.chevron_right,
                                                  color: isDark
                                                      ? Colors.white
                                                      : AppTheme.textPrimary(
                                                          context)),
                                            ),
                                          ],
                                        ),
                                        _WeekdayRow(color: sub),
                                        const SizedBox(height: 4),
                                        _MonthGrid(
                                          month: _visibleMonth,
                                          firstDate: _firstDate,
                                          lastDate: _lastDate,
                                          start: _start,
                                          end: _end,
                                          onTap: _onDayTap,
                                          isBooked: _isBookedDay,
                                          primary: primary,
                                          textColor: isDark
                                              ? Colors.white
                                              : AppTheme.textPrimary(context),
                                          subText: sub,
                                          danger: danger,
                                        ),
                                      ],
                                    ),
                                    secondChild: const SizedBox.shrink(),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                              'Die genaue Übergabe- und Rückgabezeit stimmst du nach Annahme im Chat ab.',
                              style: TextStyle(color: sub, fontSize: 12)),
                          if (_overlapsBlocked) ...[
                            const SizedBox(height: 8),
                            Text(
                                'Der gewählte Zeitraum überschneidet sich mit einer bestehenden Buchung.',
                                style: TextStyle(
                                    color: danger,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700)),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    _StepCard(
                      step: '2',
                      title: 'Persönliche Abholung und Rückgabe',
                      subtitle:
                          'Lieferung und Versand sind im Privat-Pilot deaktiviert.',
                      child: Text(
                        'Du holst den Gegenstand beim Vermieter ab und bringst '
                        'ihn persönlich dorthin zurück. Den genauen Termin und '
                        'Treffpunkt stimmt ihr nach Annahme im Buchungschat ab.',
                        style: TextStyle(color: sub, height: 1.45),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _StepCard(
                      step: '3',
                      title: 'Übersicht & Preis',
                      subtitle: _usesRemoteBackend
                          ? 'Der verbindliche Gesamtbetrag wird im nächsten Schritt direkt vom Server geladen.'
                          : 'Lokale QA-Vorschau der preisrelevanten Bestandteile.',
                      child: Column(
                        children: [
                          if (_usesRemoteBackend)
                            Semantics(
                              label:
                                  'Verbindlicher Gesamtbetrag wird im Checkout vom Server geladen',
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: isDark
                                      ? Colors.white.withValues(alpha: 0.06)
                                      : AppTheme.surfaceSecondary(context),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: border),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Verbindlicher Serverpreis',
                                      style: TextStyle(
                                        color: isDark
                                            ? Colors.white
                                            : AppTheme.textPrimary(context),
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      'Nach „Weiter“ lädt SIT einen frischen, zeitlich begrenzten Quote. Erst dieser zeigt Mietpreis, konkreten Rabatt, 10 % Plattformgebühr und Gesamtbetrag.',
                                      style: TextStyle(
                                        color: sub,
                                        height: 1.4,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          else ...[
                            _PriceRow(
                                label: 'Mietpreis',
                                value: preview.rentalSubtotal),
                            if (preview.discountAmount > 0)
                              _PriceRow(
                                  label: 'Rabatt',
                                  value: -preview.discountAmount,
                                  positiveAccent: true),
                            _PriceRow(
                                label: 'Plattformgebühr',
                                value: preview.platformFee),
                          ],
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Divider(
                                color: isDark
                                    ? Colors.white24
                                    : const Color(0xFFE2E8F0),
                                height: 1),
                          ),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              _usesRemoteBackend
                                  ? 'Ändert sich der Serverpreis, musst du den neuen Gesamtbetrag im Checkout erneut bestätigen.'
                                  : 'Preisrelevante Änderungen müssen später von beiden Seiten bestätigt werden.',
                              style: TextStyle(
                                  color: isDark
                                      ? Colors.white70
                                      : AppTheme.textSecondary(context),
                                  fontSize: 12,
                                  height: 1.4),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Container(
              decoration: BoxDecoration(
                  color:
                      isDark ? Colors.black : AppTheme.surfacePrimary(context),
                  border: Border(
                      top: BorderSide(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.08)
                              : AppTheme.glassStroke(context)))),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  _usesRemoteBackend
                                      ? 'Verbindlicher Gesamtbetrag'
                                      : 'Gesamtbetrag',
                                  style: TextStyle(
                                      color: isDark
                                          ? Colors.white
                                          : AppTheme.textPrimary(context),
                                      fontWeight: FontWeight.w800)),
                              const SizedBox(height: 2),
                              Text(
                                  _usesRemoteBackend
                                      ? 'wird im Checkout vom Server geladen'
                                      : 'inkl. Plattformgebühr',
                                  style: TextStyle(
                                      color: isDark
                                          ? Colors.white70
                                          : AppTheme.textSecondary(context),
                                      fontSize: 12)),
                              const SizedBox(height: 4),
                              if (!_usesRemoteBackend)
                                Text('${preview.total.toStringAsFixed(2)} €',
                                    style: TextStyle(
                                        color: isDark
                                            ? Colors.white
                                            : AppTheme.textPrimary(context),
                                        fontWeight: FontWeight.w900,
                                        fontSize: 20)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        SizedBox(
                          width: 148,
                          child: FilledButton(
                            onPressed: _canContinue ? _confirm : null,
                            style: FilledButton.styleFrom(
                              backgroundColor: BrandColors.primary,
                              disabledBackgroundColor: isDark
                                  ? Colors.white.withValues(alpha: 0.14)
                                  : AppTheme.surfaceSecondary(context),
                              foregroundColor: Colors.white,
                              disabledForegroundColor: isDark
                                  ? Colors.white70
                                  : AppTheme.textSecondary(context),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16)),
                            ),
                            child: _checking
                                ? const SizedBox(
                                    height: 18,
                                    width: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2))
                                : Text(_start == null ? 'Weiter' : 'Weiter'),
                          ),
                        ),
                      ],
                    ),
                    if (continueHint != null) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          continueHint,
                          style: TextStyle(
                              color: isDark
                                  ? Colors.white70
                                  : AppTheme.textSecondary(context),
                              fontSize: 12,
                              height: 1.35),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PricePreview {
  final double rentalSubtotal;
  final double baseTotal;
  final double discountAmount;
  final double platformFee;
  final double total;

  const _PricePreview({
    required this.rentalSubtotal,
    required this.baseTotal,
    required this.discountAmount,
    required this.platformFee,
    required this.total,
  });
}

class _ThresholdChip {
  final int days;
  final String label;
  final bool best;
  const _ThresholdChip(
      {required this.days, required this.label, this.best = false});
}

class _StepCard extends StatelessWidget {
  final String step;
  final String title;
  final String subtitle;
  final Widget child;
  const _StepCard(
      {required this.step,
      required this.title,
      required this.subtitle,
      required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = BrandColors.primary;
    final lineColor =
        isDark ? Colors.white.withValues(alpha: 0.14) : const Color(0xFFD7E3F4);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 28,
                child: Column(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: isDark
                            ? accent.withValues(alpha: 0.22)
                            : accent.withValues(alpha: 0.10),
                        shape: BoxShape.circle,
                        border: Border.all(color: accent, width: 1.2),
                      ),
                      child: Text(step,
                          style: TextStyle(
                              color: isDark ? Colors.white : accent,
                              fontWeight: FontWeight.w800)),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: 1.5,
                      height: 28,
                      color: lineColor,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(title,
                        style: TextStyle(
                            color: isDark
                                ? Colors.white
                                : AppTheme.textPrimary(context),
                            fontWeight: FontWeight.w800,
                            fontSize: 18)),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: TextStyle(
                            color: isDark
                                ? Colors.white70
                                : AppTheme.textSecondary(context),
                            fontSize: 12,
                            height: 1.35)),
                  ])),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String label;
  final double value;
  final bool positiveAccent;
  const _PriceRow(
      {required this.label, required this.value, this.positiveAccent = false});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final labelColor = positiveAccent
        ? const Color(0xFF86EFAC)
        : (isDark ? Colors.white70 : AppTheme.textSecondary(context));
    final valueColor = positiveAccent
        ? const Color(0xFF86EFAC)
        : (isDark ? Colors.white : AppTheme.textPrimary(context));
    final prefix = value < 0 ? '- ' : '';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: labelColor, fontSize: 13)),
          Text('$prefix${value.abs().toStringAsFixed(2)} €',
              style: TextStyle(color: valueColor, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _DiscountChip extends StatelessWidget {
  final _ThresholdChip chip;
  final bool isSelected;
  final VoidCallback onTap;
  const _DiscountChip(
      {required this.chip, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final primary = BrandColors.primary;
    final border = Colors.white.withValues(alpha: 0.12);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 38,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? primary.withValues(alpha: 0.22)
              : Colors.white.withValues(alpha: 0.06),
          border: Border.all(color: isSelected ? primary : border),
          borderRadius: BorderRadius.circular(999),
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(chip.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 13)),
        ),
      ),
    );
  }
}

class _WeekdayRow extends StatelessWidget {
  final Color color;
  const _WeekdayRow({required this.color});
  static const _wdDe = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  @override
  Widget build(BuildContext context) => Row(children: [
        for (final d in _wdDe)
          Expanded(
              child: Center(
                  child: Text(d,
                      style: TextStyle(
                          color: color, fontWeight: FontWeight.w600))))
      ]);
}

class _MonthGrid extends StatelessWidget {
  final DateTime month;
  final DateTime firstDate;
  final DateTime lastDate;
  final DateTime? start;
  final DateTime? end;
  final void Function(DateTime) onTap;
  final bool Function(DateTime) isBooked;
  final Color primary;
  final Color textColor;
  final Color subText;
  final Color danger;
  const _MonthGrid(
      {required this.month,
      required this.firstDate,
      required this.lastDate,
      required this.start,
      required this.end,
      required this.onTap,
      required this.isBooked,
      required this.primary,
      required this.textColor,
      required this.subText,
      required this.danger});

  int _daysInMonth(DateTime m) => DateTime(m.year, m.month + 1, 0).day;
  int _mondayBasedWeekday(DateTime d) => (d.weekday + 6) % 7;

  @override
  Widget build(BuildContext context) {
    final days = _daysInMonth(month);
    final firstW = _mondayBasedWeekday(month);
    final totalCells = ((firstW + days + 6) ~/ 7) * 7;
    final cells = <DateTime?>[];
    for (int i = 0; i < firstW; i++) {
      cells.add(null);
    }
    for (int d = 1; d <= days; d++) {
      cells.add(DateTime(month.year, month.month, d));
    }
    while (cells.length < totalCells) {
      cells.add(null);
    }
    return Column(children: [
      for (int row = 0; row < cells.length / 7; row++)
        Row(children: [
          for (int col = 0; col < 7; col++)
            Expanded(
                child: _DayCell(
                    day: cells[row * 7 + col],
                    firstDate: firstDate,
                    lastDate: lastDate,
                    start: start,
                    end: end,
                    onTap: onTap,
                    primary: primary,
                    textColor: textColor,
                    subText: subText,
                    danger: danger,
                    isBooked: isBooked)),
        ]),
    ]);
  }
}

class _DayCell extends StatelessWidget {
  final DateTime? day;
  final DateTime firstDate;
  final DateTime lastDate;
  final DateTime? start;
  final DateTime? end;
  final void Function(DateTime) onTap;
  final bool Function(DateTime) isBooked;
  final Color primary;
  final Color textColor;
  final Color subText;
  final Color danger;
  const _DayCell(
      {required this.day,
      required this.firstDate,
      required this.lastDate,
      required this.start,
      required this.end,
      required this.onTap,
      required this.isBooked,
      required this.primary,
      required this.textColor,
      required this.subText,
      required this.danger});

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    if (day == null) return const SizedBox(height: 42);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final today = DateTime.now();
    final todayOnly = DateTime(today.year, today.month, today.day);
    final d = day!;
    final disabled = d.isBefore(firstDate) || d.isAfter(lastDate);
    final booked = isBooked(d);
    final isToday = _sameDay(d, todayOnly);
    final isStart = start != null && _sameDay(d, start!);
    final isEnd =
        end != null && _sameDay(d, end!.subtract(const Duration(days: 1)));
    final inRange =
        start != null && end != null && !d.isBefore(start!) && d.isBefore(end!);
    final selected = isStart || isEnd;

    Color bg = Colors.transparent;
    BoxBorder? border;
    Color fg = disabled
        ? (isDark ? const Color(0xFF9CA3AF) : AppTheme.textDisabled(context))
        : textColor;
    if (disabled) {
      bg = isDark
          ? Colors.white.withValues(alpha: 0.06)
          : const Color(0xFFF1F5F9);
      border = Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : const Color(0xFFE2E8F0));
    }
    if (booked) {
      bg = isDark
          ? Colors.white.withValues(alpha: 0.05)
          : const Color(0xFFF8FAFC);
      fg = isDark ? const Color(0xFF9CA3AF) : AppTheme.textDisabled(context);
      border = Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : const Color(0xFFE5E7EB));
    } else if (selected) {
      bg = primary;
      fg = Colors.white;
      border = Border.all(color: primary);
    } else if (inRange) {
      bg = primary.withValues(alpha: 0.18);
      fg = isDark ? Colors.white : AppTheme.textPrimary(context);
    } else if (isToday) {
      border = Border.all(
          color: primary.withValues(alpha: isDark ? 0.85 : 1.0), width: 1.2);
    }

    return Padding(
      padding: const EdgeInsets.all(2),
      child: GestureDetector(
        onTap: (booked || disabled) ? null : () => onTap(d),
        child: Container(
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(12),
            border: border,
          ),
          child: booked
              ? Stack(
                  alignment: Alignment.center,
                  children: [
                    Text('${d.day}',
                        style:
                            TextStyle(color: fg, fontWeight: FontWeight.w500)),
                    Container(
                        width: 20,
                        height: 1.5,
                        color: isDark
                            ? const Color(0xFF9CA3AF)
                            : AppTheme.textDisabled(context)),
                  ],
                )
              : Text('${d.day}',
                  style: TextStyle(
                      color: fg,
                      fontWeight:
                          selected ? FontWeight.w800 : FontWeight.w500)),
        ),
      ),
    );
  }
}
