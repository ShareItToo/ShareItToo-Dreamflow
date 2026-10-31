import 'dart:ui' show ImageFilter;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class ModernDateTimeStepperSheet {
  static Future<DateTimeRange?> show(BuildContext context, {DateTime? initialStart, DateTime? initialEnd}) async {
    return await showModalBottomSheet<DateTimeRange>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.80),
      builder: (context) => _DateTimeStepper(initialStart: initialStart, initialEnd: initialEnd),
    );
  }
}

class _DateTimeStepper extends StatefulWidget {
  final DateTime? initialStart;
  final DateTime? initialEnd;
  const _DateTimeStepper({this.initialStart, this.initialEnd});
  @override
  State<_DateTimeStepper> createState() => _DateTimeStepperState();
}

class _DateTimeStepperState extends State<_DateTimeStepper> {
  // 0: Abholung (date), 1: Rückgabe (date)
  int _step = 0;
  DateTime? _startDate; // date only
  DateTime? _endDate; // date only

  // Track user interaction
  bool _startTouched = false;
  bool _endTouched = false;

  // Flash cues for missing selections
  bool _flashStartDate = false;
  bool _flashEndDate = false;
  // time flashing removed

  @override
  void initState() {
    super.initState();
    if (widget.initialStart != null) {
      final s = widget.initialStart!;
      _startDate = DateTime(s.year, s.month, s.day);
    }
    if (widget.initialEnd != null) {
      final e = widget.initialEnd!;
      _endDate = DateTime(e.year, e.month, e.day);
      _step = 1; // if end provided, jump to review-step
    }
  }

  // Compose start at 00:00 and end at 23:59 for date-only selection
  DateTime? _composeStart(DateTime? d) => d == null ? null : DateTime(d.year, d.month, d.day, 0, 0);
  DateTime? _composeEnd(DateTime? d) => d == null ? null : DateTime(d.year, d.month, d.day, 23, 59);

  void _confirmStart() {
    // If user presses Weiter without selecting date/time,
    // show a foreground helper popup (above this sheet), flash fields,
    // then proceed after a short delay so the user sees the cue.
    // Treat "no interaction yet" as missing as well, even if wheels show defaults
    debugPrint('[DateTimeStepper] Weiter tapped on Abholung. touched=$_startTouched date=$_startDate');
    if (!_startTouched || _startDate == null) {
      _flashStartDate = _startDate == null;
      setState(() {});
      _showTopOverlayHint(
        context,
        title: 'Abholung auswählen',
        message: 'Bitte Abhol-Datum wählen',
      );
      Future.delayed(const Duration(milliseconds: 900), () {
        if (!mounted) return;
        setState(() {
          _step = 1;
          _flashStartDate = false;
        });
      });
      return;
    }
    setState(() => _step = 1);
  }

  void _confirmEnd() {
    final start = _composeStart(_startDate);
    final end = _composeEnd(_endDate);
    // If nothing valid is selected, just exit without a range
    debugPrint('[DateTimeStepper] Fertig tapped on Rückgabe. touched=$_endTouched start=$start end=$end');
    if (!_endTouched || start == null || end == null || !end.isAfter(start)) {
      // Flash missing parts and show a topmost overlay hint, then close shortly after.
      _flashEndDate = _endDate == null;
      setState(() {});
      _showTopOverlayHint(
        context,
        title: 'Rückgabe auswählen',
        message: 'Bitte Rückgabe-Datum wählen',
      );
      Future.delayed(const Duration(milliseconds: 1000), () {
        if (mounted) {
          Navigator.of(context).pop(null);
        }
      });
      return;
    }
    Navigator.of(context).pop(DateTimeRange(start: start, end: end));
  }

  Widget _buildHeader() {
    final steps = ['Abholung', 'Rückgabe'];
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: SizedBox(
        height: 56,
        child: Stack(children: [
          // Title centered
          Center(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 600),
              transitionBuilder: (child, animation) {
                final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
                return FadeTransition(
                  opacity: curved,
                  child: ScaleTransition(scale: Tween<double>(begin: 0.97, end: 1.0).animate(curved), child: child),
                );
              },
              child: Text(
                steps[_step],
                key: ValueKey(_step),
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 22, letterSpacing: 0.2),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.78;
    final minEndDate = _startDate ?? DateTime.now();
    return Material(
      color: Colors.transparent,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
            child: Container(
              height: height,
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.34), borderRadius: const BorderRadius.vertical(top: Radius.circular(24)), border: Border.all(color: Colors.white.withValues(alpha: 0.08))),
              child: Column(children: [
                const SizedBox(height: 8),
                Container(width: 44, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
                _buildHeader(),
                const SizedBox(height: 8),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 600),
                    transitionBuilder: (child, animation) {
                      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
                      final offset = Tween<Offset>(begin: const Offset(0.04, 0), end: Offset.zero).animate(curved);
                      return FadeTransition(opacity: curved, child: SlideTransition(position: offset, child: child));
                    },
                    child: _step == 0
                        ? _DateOnlyStep(
                            key: const ValueKey('startDateOnly'),
                            dateInitial: _startDate ?? DateTime.now(),
                            dateMin: DateTime.now(),
                            dateMax: DateTime.now().add(const Duration(days: 365)),
                            onDateChanged: (d) {
                              setState(() { _startDate = d; _startTouched = true; });
                            },
                            primaryLabel: 'Weiter',
                            onPrimary: _confirmStart,
                            showBottomActions: true,
                            flashDate: _flashStartDate,
                          )
                        : _DateOnlyStep(
                            key: const ValueKey('endDateOnly'),
                            dateInitial: _endDate ?? minEndDate,
                            dateMin: minEndDate,
                            dateMax: minEndDate.add(const Duration(days: 365)),
                            onDateChanged: (d) {
                              setState(() { _endDate = d; _endTouched = true; });
                            },
                            primaryLabel: 'Fertig',
                            onPrimary: _confirmEnd,
                            showBottomActions: true,
                            secondaryLabel: 'Zurück',
                            onSecondary: () => setState(() => _step = 0),
                            flashDate: _flashEndDate,
                          ),
                  ),
                ),
                const SizedBox(height: 8),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

void _showTopOverlayHint(BuildContext context, {required String title, required String message}) {
  // Insert into the root overlay so it always sits above any modal sheets.
  final overlay = Overlay.of(context, rootOverlay: true);
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (ctx) {
      return IgnorePointer(
        ignoring: false,
        child: Stack(children: [
          // Very light overlay to lift the hint above the sheet visually
          Positioned.fill(
            child: Container(color: Colors.black.withValues(alpha: 0.18)),
          ),
          Positioned.fill(
            child: SafeArea(
              child: Center(child: _MissingSelectionDialog(title: title, message: message)),
            ),
          ),
        ]),
      );
    },
  );
  overlay.insert(entry);
  Future.delayed(const Duration(milliseconds: 1500), () {
    entry.remove();
  });
}

class _MissingSelectionDialog extends StatefulWidget {
  final String title;
  final String message;
  const _MissingSelectionDialog({required this.title, required this.message});
  @override
  State<_MissingSelectionDialog> createState() => _MissingSelectionDialogState();
}

class _MissingSelectionDialogState extends State<_MissingSelectionDialog> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _opacity;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
    _opacity = Tween<double>(begin: 0.55, end: 1.0).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut));
    _scale = Tween<double>(begin: 0.96, end: 1.04).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: ScaleTransition(
          scale: _scale,
          child: Container(
            width: 320,
            margin: const EdgeInsets.symmetric(horizontal: 20),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.78),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(widget.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 8),
                Text(widget.message, style: const TextStyle(color: Colors.white70, fontSize: 13), textAlign: TextAlign.center),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    FadeTransition(
                      opacity: _opacity,
                      child: const Icon(Icons.event, color: Colors.white, size: 22),
                    ),
                    const SizedBox(width: 16),
                    FadeTransition(
                      opacity: _opacity,
                      child: const Icon(Icons.schedule, color: Colors.white, size: 22),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DateOnlyStep extends StatefulWidget {
  final DateTime dateInitial;
  final DateTime dateMin;
  final DateTime dateMax;
  final ValueChanged<DateTime> onDateChanged;
  final String primaryLabel;
  final VoidCallback onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final bool showBottomActions;
  final bool flashDate;
  const _DateOnlyStep({super.key, required this.dateInitial, required this.dateMin, required this.dateMax, required this.onDateChanged, required this.primaryLabel, required this.onPrimary, this.secondaryLabel, this.onSecondary, this.showBottomActions = true, this.flashDate = false});
  @override
  State<_DateOnlyStep> createState() => _DateOnlyStepState();
}

class _DateOnlyStepState extends State<_DateOnlyStep> with SingleTickerProviderStateMixin {
  late DateTime _date = DateTime(widget.dateInitial.year, widget.dateInitial.month, widget.dateInitial.day);

  // Independent controllers for day, month, year
  late FixedExtentScrollController _dayCtrl;
  late FixedExtentScrollController _monthCtrl;
  late FixedExtentScrollController _yearCtrl;

  // Selections
  late int _selYear;
  late int _selMonth;
  late int _selDay;

  DateTime get _minDate => DateTime(widget.dateMin.year, widget.dateMin.month, widget.dateMin.day);
  DateTime get _maxDate => DateTime(widget.dateMax.year, widget.dateMax.month, widget.dateMax.day);

  late final AnimationController _flashCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
  late final Animation<double> _pulse = CurvedAnimation(parent: _flashCtrl, curve: Curves.easeInOut);

  @override
  void initState() {
    super.initState();
    // Clamp initial date
    final init = _clampDate(_date);
    _selYear = init.year;
    _selMonth = init.month;
    _selDay = init.day;

    _yearCtrl = FixedExtentScrollController(initialItem: _years().indexOf(_selYear));
    _monthCtrl = FixedExtentScrollController(initialItem: _months(_selYear).indexOf(_selMonth));
    _dayCtrl = FixedExtentScrollController(initialItem: _days(_selYear, _selMonth).indexOf(_selDay));
    _maybeToggleFlash();
  }

  @override
  void dispose() {
    _flashCtrl.dispose();
    _dayCtrl.dispose();
    _monthCtrl.dispose();
    _yearCtrl.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _DateOnlyStep oldWidget) {
    super.didUpdateWidget(oldWidget);
    _maybeToggleFlash();
  }

  void _maybeToggleFlash() {
    final need = widget.flashDate;
    if (need && !_flashCtrl.isAnimating) {
      _flashCtrl.repeat(reverse: true);
    } else if (!need && _flashCtrl.isAnimating) {
      _flashCtrl.stop();
    }
  }

  // Helpers for date wheels
  List<int> _years() {
    final y0 = _minDate.year;
    final y1 = _maxDate.year;
    return [for (int y = y0; y <= y1; y++) y];
  }

  List<int> _months(int year) {
    int m0 = 1;
    int m1 = 12;
    if (year == _minDate.year) m0 = _minDate.month;
    if (year == _maxDate.year) m1 = _maxDate.month;
    return [for (int m = m0; m <= m1; m++) m];
  }

  int _daysInMonth(int year, int month) {
    final beginningNextMonth = (month == 12) ? DateTime(year + 1, 1, 1) : DateTime(year, month + 1, 1);
    return beginningNextMonth.subtract(const Duration(days: 1)).day;
  }

  List<int> _days(int year, int month) {
    int d0 = 1;
    int d1 = _daysInMonth(year, month);
    if (year == _minDate.year && month == _minDate.month) d0 = _minDate.day;
    if (year == _maxDate.year && month == _maxDate.month) d1 = _maxDate.day;
    return [for (int d = d0; d <= d1; d++) d];
  }

  DateTime _clampDate(DateTime d) {
    if (d.isBefore(_minDate)) return _minDate;
    if (d.isAfter(_maxDate)) return _maxDate;
    return d;
  }

  void _syncDateFromSelections({bool notify = true}) {
    // Ensure selections are valid within min/max
    final months = _months(_selYear);
    if (!months.contains(_selMonth)) {
      _selMonth = (_selYear == _minDate.year) ? months.first : (_selYear == _maxDate.year) ? months.last : months.first;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _monthCtrl.jumpToItem(months.indexOf(_selMonth));
      });
    }
    final days = _days(_selYear, _selMonth);
    if (!days.contains(_selDay)) {
      _selDay = days.last.clamp(days.first, days.last);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _dayCtrl.jumpToItem(days.indexOf(_selDay));
      });
    }
    final next = _clampDate(DateTime(_selYear, _selMonth, _selDay));
    setState(() => _date = next);
    if (notify) widget.onDateChanged(next);
  }

  String _fmtDate(DateTime d) => '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  @override
  Widget build(BuildContext context) {
    final titleStyle = const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18);
    final chipStyle = const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600);
    final wheelText = const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700);

    final years = _years();
    final months = _months(_selYear);
    final days = _days(_selYear, _selMonth);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Center(child: Text(_fmtDate(_date), style: titleStyle, textAlign: TextAlign.center)),
        const SizedBox(height: 12),
        Expanded(
          child: Column(children: [
            // Date wheels (top) - three independent vertical pickers
            AnimatedBuilder(
              animation: _pulse,
              builder: (context, _) {
                final active = widget.flashDate;
                final borderColor = active
                    ? Color.lerp(Colors.white.withValues(alpha: 0.14), Theme.of(context).colorScheme.primary.withValues(alpha: 0.95), _pulse.value)!
                    : Colors.white.withValues(alpha: 0.10);
                final bgColor = active
                    ? Color.lerp(Colors.white.withValues(alpha: 0.06), Theme.of(context).colorScheme.primary.withValues(alpha: 0.16), _pulse.value)!
                    : Colors.white.withValues(alpha: 0.06);
                final labelStyle = chipStyle.copyWith(
                  color: active
                      ? Color.lerp(Colors.white70, Theme.of(context).colorScheme.primary, _pulse.value)
                      : Colors.white70,
                );
                return AnimatedContainer(
                  decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(16), border: Border.all(color: borderColor)),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeInOut,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Datum', style: labelStyle),
                    const SizedBox(height: 6),
                    Row(children: [
                      Expanded(child: Text('Tag', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 12, fontWeight: FontWeight.w800))),
                      Expanded(child: Text('Monat', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 12, fontWeight: FontWeight.w800))),
                      Expanded(child: Text('Jahr', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 12, fontWeight: FontWeight.w800))),
                    ]),
                    const SizedBox(height: 4),
                    SizedBox(
                      height: 160,
                      child: Row(children: [
                        // Day wheel
                        Expanded(
                          child: CupertinoPicker(
                            magnification: 1.1,
                            squeeze: 1.1,
                            diameterRatio: 1.4,
                            scrollController: _dayCtrl,
                            itemExtent: 40,
                            onSelectedItemChanged: (index) {
                              final dList = _days(_selYear, _selMonth);
                              _selDay = dList[index];
                              _syncDateFromSelections();
                            },
                            children: [for (final d in days) Center(child: Text(d.toString().padLeft(2, '0'), style: wheelText))],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Month wheel
                        Expanded(
                          child: CupertinoPicker(
                            magnification: 1.1,
                            squeeze: 1.1,
                            diameterRatio: 1.4,
                            scrollController: _monthCtrl,
                            itemExtent: 40,
                            onSelectedItemChanged: (index) {
                              final mList = _months(_selYear);
                              _selMonth = mList[index];
                              // After changing month, ensure day is valid
                              _syncDateFromSelections();
                            },
                            children: [for (final m in months) Center(child: Text(m.toString().padLeft(2, '0'), style: wheelText))],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Year wheel
                        Expanded(
                          child: CupertinoPicker(
                            magnification: 1.1,
                            squeeze: 1.1,
                            diameterRatio: 1.4,
                            scrollController: _yearCtrl,
                            itemExtent: 40,
                            onSelectedItemChanged: (index) {
                              _selYear = years[index];
                              // After changing year, months/days constraints may change
                              _syncDateFromSelections();
                            },
                            children: [for (final y in years) Center(child: Text(y.toString(), style: wheelText))],
                          ),
                        ),
                      ]),
                    ),
                  ]),
                );
              },
            ),
          ]),
        ),
        const SizedBox(height: 12),
        if (widget.showBottomActions)
          _BottomActionBar(
            primaryLabel: widget.primaryLabel,
            onPrimary: widget.onPrimary,
            secondaryLabel: widget.secondaryLabel,
            onSecondary: widget.onSecondary,
          )
        else
          const SizedBox.shrink(),
      ]),
    );
  }
}

class _BottomActionBar extends StatelessWidget {
  final String primaryLabel;
  final VoidCallback onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  const _BottomActionBar({required this.primaryLabel, required this.onPrimary, this.secondaryLabel, this.onSecondary});

  ButtonStyle _filledStyle(BuildContext context) {
    return FilledButton.styleFrom(
      minimumSize: const Size.fromHeight(52),
      padding: const EdgeInsets.symmetric(vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    );
  }

  ButtonStyle _outlinedStyle(BuildContext context) {
    return OutlinedButton.styleFrom(
      minimumSize: const Size.fromHeight(52),
      padding: const EdgeInsets.symmetric(vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      side: BorderSide(color: Colors.white.withValues(alpha: 0.24)),
      foregroundColor: Colors.white,
    );
  }

  @override
  Widget build(BuildContext context) {
    // Two equal columns with identical button metrics to ensure exact same dimensions in both steps.
    return Row(
      children: [
        Expanded(
          child: (secondaryLabel != null && onSecondary != null)
              ? OutlinedButton(
                  style: _outlinedStyle(context),
                  onPressed: onSecondary,
                  child: Text(secondaryLabel!),
                )
              : IgnorePointer(
                  ignoring: true,
                  child: Opacity(
                    opacity: 0.0,
                    child: OutlinedButton(
                      style: _outlinedStyle(context),
                      onPressed: () {},
                      child: const Text('Zurück'),
                    ),
                  ),
                ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: FilledButton(
            style: _filledStyle(context),
            onPressed: onPrimary,
            child: Text(primaryLabel),
          ),
        ),
      ],
    );
  }
}
