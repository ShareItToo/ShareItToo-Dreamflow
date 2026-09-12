import 'package:flutter/material.dart';
import 'dart:ui';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/openai/openai_config.dart';

class ModernRangePickerSheet extends StatefulWidget {
  final DateTime firstDate;
  final DateTime lastDate;
  final DateTimeRange? initialRange;
  // When true, the user may pick the same calendar day for start and end.
  // Useful for hourly rentals.
  final bool allowSameDayEnd;
  // New: mark days that are already booked (start inclusive, end exclusive)
  final List<DateTimeRange> unavailableRanges;
  // Optional: pass item to show discount hints in a chat-style header
  final Item? item;
  const ModernRangePickerSheet(
      {super.key,
      required this.firstDate,
      required this.lastDate,
      this.initialRange,
      this.allowSameDayEnd = false,
      this.unavailableRanges = const [],
      this.item});

  @override
  State<ModernRangePickerSheet> createState() => _ModernRangePickerSheetState();
}

class _ModernRangePickerSheetState extends State<ModernRangePickerSheet> {
  late DateTime _visibleMonth; // first day of month
  DateTime? _start;
  DateTime? _end;
  bool _overlapsBlocked = false;
  String? _aiTip; // Short chat-style hint from OpenAI

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
    _visibleMonth = DateTime(now.year, now.month, 1);
    if (widget.initialRange != null) {
      _start = _stripTime(widget.initialRange!.start);
      _end = _stripTime(widget.initialRange!.end);
      _visibleMonth = DateTime(_start!.year, _start!.month, 1);
    }
    _maybeLoadAiTip();
  }

  DateTime _stripTime(DateTime d) => DateTime(d.year, d.month, d.day);
  bool _isSameOrAfter(DateTime a, DateTime b) => !a.isBefore(b);
  bool _isStrictBefore(DateTime a, DateTime b) => a.isBefore(b);

  Future<void> _maybeLoadAiTip() async {
    final item = widget.item;
    if (item == null) return;
    if (!OpenAIConfig.isAvailable) {
      if (mounted) setState(() => _aiTip = null);
      return;
    }
    try {
      // Convert tiers to simple maps for AI prompt
      final tiers = item.longRentalDiscounts
          .map((t) => {'days': t.days, 'discount': t.discountPercent})
          .toList(growable: false);
      final msg = await OpenAIConfig.availabilityDiscountTip(
        title: item.title,
        location: item.city,
        pricePerDay: item.pricePerDay,
        tiers: tiers.isEmpty
            ? [
                {'days': 3, 'discount': 10},
                {'days': 5, 'discount': 20},
                {'days': 8, 'discount': 30},
              ]
            : tiers,
      );
      if (!mounted) return;
      setState(() => _aiTip = msg);
    } catch (_) {/* non-fatal */}
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  bool _isDisabled(DateTime day) =>
      day.isBefore(_stripTime(widget.firstDate)) ||
      day.isAfter(_stripTime(widget.lastDate));

  bool _isBookedDay(DateTime day) {
    final d = _stripTime(day);
    for (final r in widget.unavailableRanges) {
      final s = _stripTime(r.start);
      final e = _stripTime(r.end);
      // booked covers [s, e) days
      if (_isSameOrAfter(d, s) && _isStrictBefore(d, e)) return true;
    }
    return false;
  }

  bool _rangeOverlapsBooked(DateTime a, DateTime b) {
    final s = _stripTime(a);
    final e = _stripTime(b);
    final start = s.isBefore(e) ? s : e;
    final end = s.isBefore(e) ? e : s;
    for (final r in widget.unavailableRanges) {
      final rs = _stripTime(r.start);
      final re = _stripTime(r.end);
      // Overlap for day-ranges when requestedStart < bookedEnd && requestedEnd > bookedStart
      if (start.isBefore(re) && end.isAfter(rs)) return true;
    }
    return false;
  }

  void _onDayTap(DateTime day) {
    if (_isDisabled(day) || _isBookedDay(day)) return;
    setState(() {
      if (_start == null || (_start != null && _end != null)) {
        _start = day;
        _end = null;
        _overlapsBlocked = false;
      } else {
        // Allow choosing the same day as end only when enabled
        final same = _isSameDay(day, _start!);
        if (day.isBefore(_start!) || (same && !widget.allowSameDayEnd)) {
          _start = day;
          _end = null;
          _overlapsBlocked = false;
        } else {
          _end = day; // Do not auto-close; user confirms via "Fertig"
          _overlapsBlocked = _rangeOverlapsBooked(_start!, _end!);
        }
      }
    });
  }

  void _prevMonth() {
    final prev = DateTime(_visibleMonth.year, _visibleMonth.month - 1, 1);
    if (!prev
        .isBefore(DateTime(widget.firstDate.year, widget.firstDate.month, 1))) {
      setState(() => _visibleMonth = prev);
    }
  }

  void _nextMonth() {
    final next = DateTime(_visibleMonth.year, _visibleMonth.month + 1, 1);
    final lastBound = DateTime(widget.lastDate.year, widget.lastDate.month, 1);
    if (!next.isAfter(lastBound)) {
      setState(() => _visibleMonth = next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bg = Colors.black.withValues(alpha: 0.5);
    final border = Colors.white.withValues(alpha: 0.10);
    final headerText = Colors.white;
    final subText = Colors.white.withValues(alpha: 0.64);
    final primary = const Color(0xFF0EA5E9);
    final danger = const Color(0xFFF43F5E);

    return Stack(
      children: [
        // Blurred, tinted backdrop behind the calendar
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
            // Keep the backdrop mostly just blurred with a very subtle tint
            child: Container(color: Colors.black.withValues(alpha: 0.08)),
          ),
        ),
        SafeArea(
          top: false,
          child: Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 720),
              decoration: BoxDecoration(
                color: bg,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(24)),
                border: Border.all(color: border),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Header row with month navigation and a close button
                    Row(
                      children: [
                        IconButton(
                            onPressed: _prevMonth,
                            icon: const Icon(Icons.chevron_left,
                                color: Colors.white)),
                        Expanded(
                          child: Center(
                            child: Text(
                              '${_monthsDe[_visibleMonth.month - 1]} ${_visibleMonth.year}',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16),
                            ),
                          ),
                        ),
                        IconButton(
                            onPressed: _nextMonth,
                            icon: const Icon(Icons.chevron_right,
                                color: Colors.white)),
                        const SizedBox(width: 4),
                        // Close without selection
                        IconButton(
                          tooltip: 'Schließen',
                          onPressed: () => Navigator.of(context).maybePop(),
                          icon: const Icon(Icons.close, color: Colors.white),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Chat-style helper section
                    if (widget.item != null)
                      _ChatTipsBox(
                        aiTip: _aiTip,
                        item: widget.item!,
                        start: _start,
                        end: _end,
                        blocked: _overlapsBlocked,
                        primary: primary,
                        textColor: headerText,
                      )
                    else
                      const SizedBox.shrink(),
                    const SizedBox(height: 8),
                    _WeekdayRow(color: subText),
                    const SizedBox(height: 6),
                    _MonthGrid(
                      month: _visibleMonth,
                      firstDate: widget.firstDate,
                      lastDate: widget.lastDate,
                      start: _start,
                      end: _end,
                      onTap: _onDayTap,
                      primary: primary,
                      textColor: headerText,
                      subText: subText,
                      danger: danger,
                      isBooked: _isBookedDay,
                    ),
                    const SizedBox(height: 8),
                    const SizedBox(height: 12),
                    // Footer with left "Löschen" and right "Fertig" buttons only
                    Row(
                      children: [
                        TextButton.icon(
                          onPressed: (_start != null || _end != null)
                              ? () {
                                  setState(() {
                                    _start = null;
                                    _end = null;
                                  });
                                }
                              : null,
                          icon: const Icon(Icons.delete_outline,
                              color: Colors.white),
                          label: const Text('Löschen',
                              style: TextStyle(color: Colors.white)),
                        ),
                        const Spacer(),
                        ElevatedButton.icon(
                          onPressed: (_start != null &&
                                  _end != null &&
                                  !_overlapsBlocked)
                              ? () {
                                  final range =
                                      DateTimeRange(start: _start!, end: _end!);
                                  Navigator.of(context).pop(range);
                                }
                              : null,
                          icon: const Icon(Icons.check_circle_outline),
                          label: const Text('Fertig'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// Legacy header removed; header now lives inline to allow a close button.

class _WeekdayRow extends StatelessWidget {
  final Color color;
  const _WeekdayRow({required this.color});
  static const _wdDe = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      for (final d in _wdDe)
        Expanded(
            child: Center(
                child: Text(d,
                    style:
                        TextStyle(color: color, fontWeight: FontWeight.w600))))
    ]);
  }
}

class _MonthGrid extends StatelessWidget {
  final DateTime month; // first day
  final DateTime firstDate;
  final DateTime lastDate;
  final DateTime? start;
  final DateTime? end;
  final void Function(DateTime) onTap;
  final Color primary;
  final Color textColor;
  final Color subText;
  final Color danger;
  final bool Function(DateTime) isBooked;
  const _MonthGrid(
      {required this.month,
      required this.firstDate,
      required this.lastDate,
      required this.start,
      required this.end,
      required this.onTap,
      required this.primary,
      required this.textColor,
      required this.subText,
      required this.danger,
      required this.isBooked});

  int _daysInMonth(DateTime m) => DateTime(m.year, m.month + 1, 0).day;
  int _mondayBasedWeekday(DateTime d) => (d.weekday + 6) % 7; // 0..6, 0=Mon

  @override
  Widget build(BuildContext context) {
    final days = _daysInMonth(month);
    final firstW = _mondayBasedWeekday(month);
    final totalCells = ((firstW + days + 6) ~/ 7) * 7; // round up to full weeks

    final cells = <DateTime?>[];
    // Leading empty cells
    for (int i = 0; i < firstW; i++) {
      cells.add(null);
    }
    // Current month
    for (int d = 1; d <= days; d++) {
      cells.add(DateTime(month.year, month.month, d));
    }
    // Trailing to fill grid
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
              isBooked: isBooked,
            )),
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
  final Color primary;
  final Color textColor;
  final Color subText;
  final Color danger;
  final bool Function(DateTime) isBooked;
  const _DayCell(
      {required this.day,
      required this.firstDate,
      required this.lastDate,
      required this.start,
      required this.end,
      required this.onTap,
      required this.primary,
      required this.textColor,
      required this.subText,
      required this.danger,
      required this.isBooked});

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
  DateTime _strip(DateTime d) => DateTime(d.year, d.month, d.day);
  bool _disabled(DateTime d) =>
      d.isBefore(_strip(firstDate)) || d.isAfter(_strip(lastDate));
  bool _inRange(DateTime d) {
    if (start == null || end == null) return false;
    final s = _strip(start!);
    final e = _strip(end!);
    return (d.isAfter(s) && d.isBefore(e)) ||
        _isSameDay(d, s) ||
        _isSameDay(d, e);
  }

  @override
  Widget build(BuildContext context) {
    if (day == null) return const SizedBox(height: 44);
    final d = day!;
    final isStart = start != null && _isSameDay(d, start!);
    final isEnd = end != null && _isSameDay(d, end!);
    final isRange = _inRange(d);
    final disabled = _disabled(d) || isBooked(d);

    final bgRange = primary.withValues(alpha: 0.18);
    final bgSE = primary; // start/end solid
    final bgBooked = danger.withValues(alpha: 0.20);
    final txtOnPrimary = Colors.white;
    final txtDefault = (isBooked(d))
        ? danger
        : (disabled ? subText.withValues(alpha: 0.4) : textColor);

    Widget content = Center(
        child: Text('${d.day}',
            style: TextStyle(
                color: (isStart || isEnd) ? txtOnPrimary : txtDefault,
                fontWeight: FontWeight.w600)));

    Widget decorated =
        Container(height: 44, alignment: Alignment.center, child: content);

    if (isRange && !(isStart || isEnd)) {
      decorated = Container(
          height: 44,
          decoration: BoxDecoration(color: bgRange),
          child: content);
    }

    if (isStart || isEnd) {
      decorated = Container(
          height: 44,
          decoration: BoxDecoration(
              color: bgSE, borderRadius: BorderRadius.circular(12)),
          child: content);
    }

    // Booked days: red tinted background, disabled tap
    if (isBooked(d)) {
      decorated = Container(
          height: 44,
          decoration: BoxDecoration(
              color: bgBooked, borderRadius: BorderRadius.circular(8)),
          child: content);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
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

class _ChatTipsBox extends StatelessWidget {
  final String? aiTip;
  final Item item;
  final DateTime? start;
  final DateTime? end;
  final bool blocked;
  final Color primary;
  final Color textColor;
  const _ChatTipsBox(
      {required this.aiTip,
      required this.item,
      required this.start,
      required this.end,
      required this.blocked,
      required this.primary,
      required this.textColor});

  int _rentalDays(DateTime s, DateTime e) {
    int d = e.difference(s).inDays;
    if (d <= 0) d = 1;
    return d;
  }

  @override
  Widget build(BuildContext context) {
    final bubbleBg = Colors.white.withValues(alpha: 0.06);
    final bubbleBorder = Colors.white.withValues(alpha: 0.12);
    final danger = const Color(0xFFF43F5E);

    String? dynamicLine;
    String? savingsLine;
    if (start != null && end != null) {
      final days = _rentalDays(start!, end!);
      dynamicLine = 'Zeitraum: $days ${days == 1 ? 'Tag' : 'Tage'}';
      final priced =
          DataService.computeTotalWithDiscounts(item: item, days: days);
      final pct = priced.$3;
      final disc = priced.$4;
      if (pct > 0) {
        savingsLine =
            'Langzeitmiet‑Rabatt: -${pct.toStringAsFixed(0)}% · Du sparst ${disc.toStringAsFixed(2)} €';
      } else if (item.autoApplyDiscounts &&
          item.longRentalDiscounts.isNotEmpty) {
        // Find next tier above the chosen days
        final tiers = List.of(item.longRentalDiscounts)
          ..sort((a, b) => a.days.compareTo(b.days));
        final next =
            tiers.firstWhere((t) => t.days > days, orElse: () => tiers.last);
        if (next.days > days) {
          savingsLine =
              'Tipp: Ab ${next.days} Tagen erhältst du ${next.discountPercent.toStringAsFixed(0)}% Rabatt.';
        }
      }
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (aiTip != null && aiTip!.trim().isNotEmpty)
        _BotBubble(
          icon: Icons.tips_and_updates_outlined,
          text: aiTip!,
          color: bubbleBg,
          border: bubbleBorder,
        ),
      if (blocked)
        _BotBubble(
          icon: Icons.block,
          text: 'In diesem Zeitraum bereits gebucht',
          color: danger.withValues(alpha: 0.20),
          border: danger.withValues(alpha: 0.30),
          iconColor: danger,
        )
      else if (dynamicLine != null) ...[
        _BotBubble(
            icon: Icons.event_available,
            text: dynamicLine,
            color: bubbleBg,
            border: bubbleBorder),
        if (savingsLine != null)
          _BotBubble(
              icon: Icons.local_offer_outlined,
              text: savingsLine,
              color: bubbleBg,
              border: bubbleBorder),
      ] else ...[
        _BotBubble(
            icon: Icons.calendar_month,
            text: 'Wähle Start- und Enddatum',
            color: bubbleBg,
            border: bubbleBorder),
      ],
    ]);
  }
}

class _BotBubble extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  final Color border;
  final Color? iconColor;
  const _BotBubble(
      {required this.icon,
      required this.text,
      required this.color,
      required this.border,
      this.iconColor});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
          color: color,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(14)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: iconColor ?? Colors.white70, size: 18),
        const SizedBox(width: 8),
        Expanded(
            child: Text(text,
                style: const TextStyle(color: Colors.white, fontSize: 13))),
      ]),
    );
  }
}
