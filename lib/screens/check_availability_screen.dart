import 'dart:math';
import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/widgets/app_popup.dart';

class CheckAvailabilityScreen extends StatefulWidget {
  final Item item;
  final DateTimeRange? initialRange;
  const CheckAvailabilityScreen({super.key, required this.item, this.initialRange});

  @override
  State<CheckAvailabilityScreen> createState() => _CheckAvailabilityScreenState();
}

class _CheckAvailabilityScreenState extends State<CheckAvailabilityScreen> {
  late DateTime _firstDate;
  late DateTime _lastDate;
  late DateTime _visibleMonth; // first of month
  List<DateTimeRange> _unavailable = const [];

  DateTime? _start;
  DateTime? _end; // end-exclusive
  int _selectedDays = 1;
  bool _checking = false;
  bool _overlapsBlocked = false;

  static const _monthsDe = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

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
  }

  DateTime _strip(DateTime d) => DateTime(d.year, d.month, d.day);
  bool _isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  Future<void> _loadUnavailable() async {
    final ranges = await DataService.getUnavailableRangesForItem(widget.item.id);
    if (!mounted) return;
    setState(() => _unavailable = ranges);
    // Ensure current selection is valid
    if (_start != null && _end != null) {
      setState(() => _overlapsBlocked = _rangeOverlapsBooked(_start!, _end!));
    }
  }

  bool _isBookedDay(DateTime d) {
    final day = _strip(d);
    for (final r in _unavailable) {
      final s = _strip(r.start);
      final e = _strip(r.end);
      if (!day.isBefore(s) && day.isBefore(e)) return true; // [s, e)
    }
    return false;
  }

  bool _rangeOverlapsBooked(DateTime a, DateTime b) {
    final s = _strip(a); final e = _strip(b);
    final start = s.isBefore(e) ? s : e; final end = s.isBefore(e) ? e : s;
    for (final r in _unavailable) {
      final rs = _strip(r.start); final re = _strip(r.end);
      if (start.isBefore(re) && end.isAfter(rs)) return true;
    }
    return false;
  }

  void _onDayTap(DateTime day) {
    if (day.isBefore(_firstDate) || day.isAfter(_lastDate) || _isBookedDay(day)) return;
    setState(() {
      if (_start == null || (_start != null && _end != null)) {
        _start = _strip(day);
        _end = null;
        _overlapsBlocked = false;
        // If a duration chip is selected, auto-extend
        if (_selectedDays >= 1) {
          final e = _start!.add(Duration(days: _selectedDays));
          _end = e;
          _overlapsBlocked = _rangeOverlapsBooked(_start!, _end!);
        }
      } else {
        // Require end >= start
        if (day.isBefore(_start!)) {
          _start = _strip(day);
          _end = null;
          _overlapsBlocked = false;
        } else {
          _end = _strip(day);
          if (_isSameDay(_start!, _end!)) {
            _end = _start!.add(const Duration(days: 1)); // 1 Tag
          }
          _overlapsBlocked = _rangeOverlapsBooked(_start!, _end!);
          _selectedDays = max(1, _end!.difference(_start!).inDays);
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

  // Scan forward to find the earliest continuous available range of [days]
  (DateTime, DateTime)? _findEarliestRange(int days) {
    final cap = _lastDate;
    DateTime cursor = _start ?? _firstDate;
    while (!cursor.isAfter(cap)) {
      final end = cursor.add(Duration(days: days));
      // stop if past cap
      if (end.isAfter(_lastDate.add(const Duration(days: 1)))) break;
      if (!_rangeOverlapsBooked(cursor, end)) {
        return (cursor, end);
      }
      cursor = cursor.add(const Duration(days: 1));
    }
    return null;
  }

  List<_DurationChip> get _chips {
    // Build 1-day + discount tiers (3/5/8 default)
    final tiers = List.of(widget.item.longRentalDiscounts);
    tiers.sort((a, b) => a.days.compareTo(b.days));
    final defaults = tiers.isNotEmpty ? tiers : [
      const LongRentalDiscount(days: 3, discountPercent: 15),
      const LongRentalDiscount(days: 5, discountPercent: 25),
      const LongRentalDiscount(days: 8, discountPercent: 35),
    ];
    final maxPct = defaults.fold<double>(0, (p, e) => e.discountPercent > p ? e.discountPercent : p);
    final chips = <_DurationChip>[
      _DurationChip(days: 1, label: '1 Tag'),
      for (final t in defaults)
        _DurationChip(days: t.days, label: '${t.days} Tage –${t.discountPercent.toStringAsFixed(0)}%', best: t.discountPercent == maxPct),
    ];
    return chips;
  }

  Future<void> _confirm() async {
    if (_start == null || _end == null || _overlapsBlocked) return;
    setState(() => _checking = true);
    try {
      final ok = await DataService.checkAvailability(itemId: widget.item.id, start: _start!, end: _end!);
      if (!mounted) return;
      if (ok) {
        Navigator.of(context).pop(DateTimeRange(start: _start!, end: _end!));
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

  String _dateSpanText() {
    if (_start == null || _end == null) return '';
    String two(int v) => v.toString().padLeft(2, '0');
    final s = _start!; final e = _end!.subtract(const Duration(days: 1));
    return '${two(s.day)}. ${_monthsDe[s.month - 1].substring(0, 3)} → ${two(e.day)}. ${_monthsDe[e.month - 1].substring(0, 3)}';
  }

  String _durationLabel() {
    final d = (_start != null && _end != null) ? max(1, _end!.difference(_start!).inDays) : _selectedDays;
    return d == 1 ? '1 Tag' : '$d Tage';
  }

  String? _dynamicHint() {
    final d = (_start != null && _end != null) ? max(1, _end!.difference(_start!).inDays) : _selectedDays;
    if (d <= 0) return null;
    // Find next tier above d
    final tiers = _chips.where((c) => c.days > 1).toList()
      ..sort((a, b) => a.days.compareTo(b.days));
    for (final t in tiers) {
      if (t.days > d) {
        final delta = t.days - d;
        return 'Nur ${delta == 1 ? '1 Tag' : '$delta Tage'} mehr → ${t.label.split('–').last}';
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final bg = Colors.black;
    final card = Colors.white.withValues(alpha: 0.06);
    final border = Colors.white.withValues(alpha: 0.12);
    final text = Colors.white;
    final sub = Colors.white.withValues(alpha: 0.64);
    final primary = const Color(0xFF0EA5E9);
    final danger = const Color(0xFFF43F5E);

    final chips = _chips;
    final dynamicHint = _dynamicHint();

    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: Column(children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
            child: Row(children: [
              IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.arrow_back, color: Colors.white)),
              const SizedBox(width: 4),
              // Month navigation cluster
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(12), border: Border.all(color: border)),
                child: Row(children: [
                  IconButton(onPressed: _prevMonth, icon: const Icon(Icons.chevron_left, color: Colors.white), visualDensity: VisualDensity.compact),
                  Text('${_monthsDe[_visibleMonth.month - 1]} ${_visibleMonth.year}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                  IconButton(onPressed: _nextMonth, icon: const Icon(Icons.chevron_right, color: Colors.white), visualDensity: VisualDensity.compact),
                ]),
              ),
              const Spacer(),
              IconButton(onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.close, color: Colors.white)),
            ]),
          ),

          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                // 2. Rental duration focus with overlapping header chip
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Stack(clipBehavior: Clip.none, children: [
                    // Card
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
                      decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(16), border: Border.all(color: border)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(_durationLabel(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 26))),
                        ]),
                        const SizedBox(height: 2),
                        if (_start != null && _end != null)
                          Text(_dateSpanText(), style: TextStyle(color: sub, fontSize: 13))
                        else
                          Text('Wähle Zeitraum', style: TextStyle(color: sub, fontSize: 13)),
                        const SizedBox(height: 8),
                        const Text('Verlängere & spare automatisch', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      ]),
                    ),
                    // Overlapping label chip
                    Positioned(
                      left: 18,
                      top: -14,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: bg,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: border),
                        ),
                        child: const Text('Mietdauer', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600, fontSize: 12)),
                      ),
                    ),
                  ]),
                ),
                const SizedBox(height: 12),

                // 3. Discount chips
                SizedBox(
                  height: 38,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: chips.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, i) {
                      final c = chips[i];
                      final selected = _selectedDays == c.days;
                      return GestureDetector(
                        onTap: () {
                          setState(() {
                            _selectedDays = c.days;
                            if (_start == null) {
                              final found = _findEarliestRange(_selectedDays);
                              if (found != null) {
                                _start = found.$1; _end = found.$2; _overlapsBlocked = false;
                              }
                            } else {
                              _end = _start!.add(Duration(days: _selectedDays));
                              _overlapsBlocked = _rangeOverlapsBooked(_start!, _end!);
                            }
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(
                            color: selected ? primary.withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.06),
                            border: Border.all(color: selected ? primary : border),
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Row(children: [
                            Text(c.label, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                            if (c.best) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.star, size: 14, color: Color(0xFFFBBF24)),
                            ]
                          ]),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                const Text('💡 Länger mieten = automatisch günstiger', style: TextStyle(color: Colors.white70, fontSize: 12)),
                if (dynamicHint != null) ...[
                  const SizedBox(height: 4),
                  Text(dynamicHint, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                ],

                const SizedBox(height: 16),

                // 5. Calendar
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
                  textColor: text,
                  subText: sub,
                  danger: danger,
                ),
                const SizedBox(height: 6),
                // Hinweis direkt unter dem Kalender
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    child: Text(
                      'Nach Annahme deiner Anfrage vereinbarst du im Chat die Abhol- und Rückgabezeit mit dem Vermieter',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ),
                ),
              ]),
            ),
          ),

          // 6. Sticky CTA
          Container(
            decoration: BoxDecoration(color: Colors.black, border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.08)))),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            child: SafeArea(
              top: false,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                FilledButton(
                  onPressed: (_start != null && _end != null && !_overlapsBlocked && !_checking) ? _confirm : null,
                  style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                  child: _checking ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Verfügbarkeit prüfen'),
                ),
                const SizedBox(height: 6),
                const Center(child: Text('Noch keine Zahlung', style: TextStyle(color: Colors.white60, fontSize: 11))),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _DurationChip {
  final int days;
  final String label;
  final bool best;
  const _DurationChip({required this.days, required this.label, this.best = false});
}

class _WeekdayRow extends StatelessWidget {
  final Color color;
  const _WeekdayRow({required this.color});
  static const _wdDe = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  @override
  Widget build(BuildContext context) => Row(children: [for (final d in _wdDe) Expanded(child: Center(child: Text(d, style: TextStyle(color: color, fontWeight: FontWeight.w600))))]);
}

class _MonthGrid extends StatelessWidget {
  final DateTime month; final DateTime firstDate; final DateTime lastDate; final DateTime? start; final DateTime? end; final void Function(DateTime) onTap; final bool Function(DateTime) isBooked; final Color primary; final Color textColor; final Color subText; final Color danger;
  const _MonthGrid({required this.month, required this.firstDate, required this.lastDate, required this.start, required this.end, required this.onTap, required this.isBooked, required this.primary, required this.textColor, required this.subText, required this.danger});

  int _daysInMonth(DateTime m) => DateTime(m.year, m.month + 1, 0).day;
  int _mondayBasedWeekday(DateTime d) => (d.weekday + 6) % 7; // 0..6, 0=Mon

  @override
  Widget build(BuildContext context) {
    final days = _daysInMonth(month);
    final firstW = _mondayBasedWeekday(month);
    final totalCells = ((firstW + days + 6) ~/ 7) * 7;
    final cells = <DateTime?>[];
    for (int i = 0; i < firstW; i++) { cells.add(null); }
    for (int d = 1; d <= days; d++) { cells.add(DateTime(month.year, month.month, d)); }
    while (cells.length < totalCells) { cells.add(null); }
    return Column(children: [
      for (int row = 0; row < cells.length / 7; row++)
        Row(children: [
          for (int col = 0; col < 7; col++)
            Expanded(child: _DayCell(day: cells[row * 7 + col], firstDate: firstDate, lastDate: lastDate, start: start, end: end, onTap: onTap, primary: primary, textColor: textColor, subText: subText, danger: danger, isBooked: isBooked)),
        ]),
    ]);
  }
}

class _DayCell extends StatelessWidget {
  final DateTime? day; final DateTime firstDate; final DateTime lastDate; final DateTime? start; final DateTime? end; final void Function(DateTime) onTap; final Color primary; final Color textColor; final Color subText; final Color danger; final bool Function(DateTime) isBooked;
  const _DayCell({required this.day, required this.firstDate, required this.lastDate, required this.start, required this.end, required this.onTap, required this.primary, required this.textColor, required this.subText, required this.danger, required this.isBooked});

  bool _isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;
  DateTime _strip(DateTime d) => DateTime(d.year, d.month, d.day);
  bool _disabled(DateTime d) => d.isBefore(_strip(firstDate)) || d.isAfter(_strip(lastDate));
  bool _inRange(DateTime d) {
    if (start == null || end == null) return false;
    final s = _strip(start!); final e = _strip(end!);
    return (d.isAfter(s) && d.isBefore(e)) || _isSameDay(d, s) || _isSameDay(d, e);
  }

  @override
  Widget build(BuildContext context) {
    if (day == null) return const SizedBox(height: 40);
    final d = day!;
    final isStart = start != null && _isSameDay(d, start!);
    final isEnd = end != null && _isSameDay(d, end!);
    final isRange = _inRange(d);
    final disabled = _disabled(d) || isBooked(d);

    final bgRange = primary.withValues(alpha: 0.18);
    final bgSE = primary;
    final bgBooked = danger.withValues(alpha: 0.20);
    final txtOnPrimary = Colors.white;
    final txtDefault = (isBooked(d)) ? danger : (disabled ? subText.withValues(alpha: 0.4) : textColor);

    Widget content = Center(child: Text('${d.day}', style: TextStyle(color: (isStart || isEnd) ? txtOnPrimary : txtDefault, fontWeight: FontWeight.w600)));
    Widget decorated = Container(height: 40, alignment: Alignment.center, child: content);
    if (isRange && !(isStart || isEnd)) {
      decorated = Container(height: 40, decoration: BoxDecoration(color: bgRange), child: content);
    }
    if (isStart || isEnd) {
      decorated = Container(height: 40, decoration: BoxDecoration(color: bgSE, borderRadius: BorderRadius.circular(12)), child: content);
    }
    if (isBooked(d)) {
      decorated = Container(height: 40, decoration: BoxDecoration(color: bgBooked, borderRadius: BorderRadius.circular(8)), child: content);
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 1),
      child: Opacity(
        opacity: disabled ? 0.5 : 1,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: disabled ? null : () => onTap(_strip(d)),
          child: decorated,
        ),
      ),
    );
  }
}
