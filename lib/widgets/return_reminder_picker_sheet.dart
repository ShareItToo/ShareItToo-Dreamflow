import 'dart:ui' show ImageFilter;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// A Cupertino-style wheel picker for selecting a reminder offset
/// (days, hours, minutes) before the Rückgabe time.
class ReturnReminderPickerSheet {
  /// Shows the sheet and returns the selected offset in minutes.
  /// Returns null if the user cancels.
  static Future<int?> show(
    BuildContext context, {
    int? initialMinutes,
    int maxDays = 14,
    int minuteStep = 5,
  }) async {
    return await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.80),
      builder: (context) => _ReminderOffsetContent(
        initialMinutes: initialMinutes,
        maxDays: maxDays,
        minuteStep: minuteStep,
      ),
    );
  }
}

class _ReminderOffsetContent extends StatefulWidget {
  final int? initialMinutes;
  final int maxDays;
  final int minuteStep;
  const _ReminderOffsetContent({this.initialMinutes, this.maxDays = 14, this.minuteStep = 5});

  @override
  State<_ReminderOffsetContent> createState() => _ReminderOffsetContentState();
}

class _ReminderOffsetContentState extends State<_ReminderOffsetContent> {
  late int _days;
  late FixedExtentScrollController _dayCtrl;

  @override
  void initState() {
    super.initState();
    final total = (widget.initialMinutes ?? 0).clamp(0, (widget.maxDays * 24 + 23) * 60);
    _days = (total / (60 * 24)).round().clamp(0, widget.maxDays);
    _dayCtrl = FixedExtentScrollController(initialItem: _days);
  }

  @override
  void dispose() {
    _dayCtrl.dispose();
    super.dispose();
  }

  int get _totalMinutes => _days * 24 * 60;

  String _title() {
    if (_totalMinutes == 0) return 'Kein Erinnern';
    final d = _days;
    if (d == 0) return 'Am selben Tag';
    if (d == 1) return '1 Tag vorher';
    return '$d Tage vorher';
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.52;
    final theme = Theme.of(context);
    const wheelText = TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700);
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
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.34),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: Column(
                children: [
                  const SizedBox(height: 8),
                  Container(width: 44, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: SizedBox(
                      height: 56,
                      child: Center(
                        child: Text('Erinnerung', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20)),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Column(
                        children: [
                          Container(
                            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withValues(alpha: 0.10))),
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                              Text('Tage', textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.primary, fontSize: 12, fontWeight: FontWeight.w800)),
                              const SizedBox(height: 4),
                              SizedBox(
                                height: 160,
                                child: CupertinoPicker(
                                  magnification: 1.1,
                                  squeeze: 1.1,
                                  diameterRatio: 1.4,
                                  scrollController: _dayCtrl,
                                  itemExtent: 40,
                                  onSelectedItemChanged: (i) => setState(() => _days = i),
                                  children: [for (int d = 0; d <= widget.maxDays; d++) Center(child: Text(d.toString(), style: wheelText))],
                                ),
                              ),
                            ]),
                          ),
                          const SizedBox(height: 12),
                          Text(_title(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 8),
                          Text('Vor Rückgabetermin', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20)),
                          const Spacer(),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () => Navigator.of(context).pop(null),
                                  child: const Text('Abbrechen'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: FilledButton(
                                  onPressed: () => Navigator.of(context).pop(_totalMinutes),
                                  child: const Text('Übernehmen'),
                                ),
                              ),
                            ]),
                          )
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
