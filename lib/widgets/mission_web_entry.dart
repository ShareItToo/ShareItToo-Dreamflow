import 'package:flutter/material.dart';

enum MissionWebEntryStatus { incomplete, readbackRequired, needsClarification }

enum MissionWebUnitNecessity { required, optional }

enum MissionWebUnitAssignment { assigned, gap }

/// Presentation only. All wording comes from the caller's localization layer.
class MissionWebEntryCopy {
  MissionWebEntryCopy({
    required this.title,
    required this.synthetic,
    required this.nonBinding,
    required this.noReservation,
    required this.noGroupBooking,
    required this.unavailable,
    required this.requiredUnits,
    required this.optionalUnits,
    required this.quantity,
    required this.assigned,
    required this.gap,
    required this.unknownFit,
    required this.source,
    required this.correct,
    required this.reset,
    required Map<MissionWebEntryStatus, String> statuses,
  }) : statuses = Map.unmodifiable(statuses);

  final String title, synthetic, nonBinding, noReservation, noGroupBooking;
  final String unavailable, requiredUnits, optionalUnits, quantity, assigned;
  final String gap, unknownFit, source, correct, reset;
  final Map<MissionWebEntryStatus, String> statuses;

  bool get _complete => [
        title,
        synthetic,
        nonBinding,
        noReservation,
        noGroupBooking,
        unavailable,
        requiredUnits,
        optionalUnits,
        quantity,
        assigned,
        gap,
        unknownFit,
        source,
        correct,
        reset,
        ...MissionWebEntryStatus.values.map((s) => statuses[s] ?? ''),
      ].every((s) => s.trim().isNotEmpty);

  MissionWebEntryCopy copyWith(
          {String? title,
          String? unavailable,
          String? nonBinding,
          String? noReservation,
          String? noGroupBooking,
          Map<MissionWebEntryStatus, String>? statuses}) =>
      MissionWebEntryCopy(
        title: title ?? this.title,
        synthetic: synthetic,
        nonBinding: nonBinding ?? this.nonBinding,
        noReservation: noReservation ?? this.noReservation,
        noGroupBooking: noGroupBooking ?? this.noGroupBooking,
        unavailable: unavailable ?? this.unavailable,
        requiredUnits: requiredUnits,
        optionalUnits: optionalUnits,
        quantity: quantity,
        assigned: assigned,
        gap: gap,
        unknownFit: unknownFit,
        source: source,
        correct: correct,
        reset: reset,
        statuses: statuses ?? this.statuses,
      );
}

/// Contains no identity, media, location or effect fields. Fit is always unknown.
class MissionWebUnitView {
  const MissionWebUnitView(
      {required this.label,
      required this.quantity,
      required this.necessity,
      required this.assignment});
  final String label;
  final int quantity;
  final MissionWebUnitNecessity necessity;
  final MissionWebUnitAssignment assignment;
}

/// A detached display value, not a server assertion or executable request.
/// This first slice supports synthetic examples only and cannot report success.
class MissionWebEntryView {
  MissionWebEntryView(
      {required this.version,
      required this.synthetic,
      required this.source,
      required this.status,
      required List<MissionWebUnitView> units})
      : units = List.unmodifiable(units);
  static const schemaVersion = 'D6-presentation-2026-10-03.1';
  final String version;
  final bool synthetic;
  final String source;
  final MissionWebEntryStatus status;
  final List<MissionWebUnitView> units;

  bool get _valid =>
      version == schemaVersion &&
      synthetic &&
      source.trim().isNotEmpty &&
      units.isNotEmpty &&
      units.every((u) => u.label.trim().isNotEmpty && u.quantity > 0);
}

enum MissionPickupArea { exampleA, exampleB }

enum MissionPickupWindowLabel { october4Morning, october5Afternoon }

enum MissionPickupValueStatus { syntheticExample, unknown, changed }

/// UTC stays internal. Only the exact closed synthetic windows below have a
/// localized Berlin-time label; arbitrary instants never gain a display label.
class MissionPickupWindow {
  const MissionPickupWindow(
      {required this.start, required this.end, required this.zone});
  final String start, end, zone;
  MissionPickupWindowLabel? get label => switch ((start, end, zone)) {
        ('2026-10-04T08:00:00Z', '2026-10-04T09:00:00Z', 'Europe/Berlin') =>
          MissionPickupWindowLabel.october4Morning,
        ('2026-10-05T13:00:00Z', '2026-10-05T14:00:00Z', 'Europe/Berlin') =>
          MissionPickupWindowLabel.october5Afternoon,
        _ => null,
      };
  static DateTime? _instant(String value) {
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$').hasMatch(value)) {
      return null;
    }
    final parsed = DateTime.tryParse(value);
    return parsed != null &&
            parsed.toIso8601String().replaceFirst('.000Z', 'Z') == value
        ? parsed
        : null;
  }

  bool get valid {
    final first = _instant(start);
    final last = _instant(end);
    return label != null &&
        zone == 'Europe/Berlin' &&
        first != null &&
        last != null &&
        first.isBefore(last);
  }
}

class MissionPickupEntry {
  const MissionPickupEntry(
      {required this.componentOrdinal,
      required this.sourceRevision,
      required this.areaStatus,
      required this.timeStatus,
      this.area,
      this.window});
  final int componentOrdinal, sourceRevision;
  final MissionPickupValueStatus areaStatus, timeStatus;
  final MissionPickupArea? area;
  final MissionPickupWindow? window;
  bool get _valid =>
      sourceRevision > 0 &&
      (areaStatus == MissionPickupValueStatus.syntheticExample
          ? area != null
          : area == null) &&
      (timeStatus == MissionPickupValueStatus.syntheticExample
          ? window?.valid == true
          : window == null);
}

/// Binds to the exact immutable D6 display snapshot, not just its unit count.
/// Revisions are synthetic display-source facts, never server or owner IDs.
class MissionPickupBinding {
  MissionPickupBinding(
      {required this.display, required List<int> sourceRevisions})
      : sourceRevisions = List.unmodifiable(sourceRevisions);
  final MissionWebEntryView display;
  final List<int> sourceRevisions;
}

/// Separate additive D7 contract; no field or schema change to D6-v1.
class MissionPickupPlan {
  MissionPickupPlan(
      {required this.version,
      required this.synthetic,
      required List<MissionPickupEntry> entries})
      : entries = List.unmodifiable(entries);
  static const schemaVersion = 'D7-pickup-presentation-2026-10-03.1';
  final String version;
  final bool synthetic;
  final List<MissionPickupEntry> entries;
  bool validFor(MissionWebEntryView display, MissionPickupBinding binding) {
    if (version != schemaVersion ||
        !synthetic ||
        !display._valid ||
        !identical(binding.display, display) ||
        entries.length != display.units.length ||
        binding.sourceRevisions.length != display.units.length ||
        binding.sourceRevisions.any((revision) => revision <= 0)) {
      return false;
    }
    final seen = <int>{};
    for (final entry in entries) {
      final ordinal = entry.componentOrdinal;
      if (!entry._valid ||
          ordinal < 0 ||
          ordinal >= display.units.length ||
          !seen.add(ordinal) ||
          entry.sourceRevision != binding.sourceRevisions[ordinal]) {
        return false;
      }
    }
    return seen.length == display.units.length;
  }
}

class MissionPickupCopy {
  MissionPickupCopy(
      {required this.title,
      required this.separate,
      required this.syntheticNotAgreed,
      required this.noDeliveryOrCombined,
      required this.unavailable,
      required this.area,
      required this.time,
      required this.unknownArea,
      required this.changedArea,
      required this.unknownTime,
      required this.changedTime,
      required Map<MissionPickupArea, String> areas,
      required Map<MissionPickupWindowLabel, String> windows})
      : areas = Map.unmodifiable(areas),
        windows = Map.unmodifiable(windows);
  final String title,
      separate,
      syntheticNotAgreed,
      noDeliveryOrCombined,
      unavailable;
  final String area, time, unknownArea, changedArea, unknownTime, changedTime;
  final Map<MissionPickupArea, String> areas;
  final Map<MissionPickupWindowLabel, String> windows;
  bool get _complete => [
        title,
        separate,
        syntheticNotAgreed,
        noDeliveryOrCombined,
        unavailable,
        area,
        time,
        unknownArea,
        changedArea,
        unknownTime,
        changedTime,
        ...MissionPickupArea.values.map((value) => areas[value] ?? ''),
        ...MissionPickupWindowLabel.values.map((value) => windows[value] ?? ''),
      ].every((value) => value.trim().isNotEmpty);
}

/// Omitted/invalid view means unavailable and no actions.
/// Corrections return only a display ordinal, never a command or domain identity.
class MissionWebEntry extends StatefulWidget {
  const MissionWebEntry(
      {super.key,
      required this.copy,
      this.view,
      this.onCorrect,
      this.onReset,
      this.pickupPlan,
      this.pickupBinding,
      this.pickupCopy});
  final MissionWebEntryCopy copy;
  final MissionWebEntryView? view;
  final ValueChanged<int>? onCorrect;
  final VoidCallback? onReset;
  final MissionPickupPlan? pickupPlan;
  final MissionPickupBinding? pickupBinding;
  final MissionPickupCopy? pickupCopy;

  @override
  State<MissionWebEntry> createState() => _MissionWebEntryState();
}

class _MissionWebEntryState extends State<MissionWebEntry> {
  final _resetFocus = FocusNode();
  final _scroll = ScrollController();
  final List<FocusNode> _correctionFocus = [];
  int? _selected;

  MissionWebEntryView? get _view =>
      widget.copy._complete && widget.view?._valid == true ? widget.view : null;
  MissionPickupCopy? get _pickupCopy =>
      _view != null && widget.pickupCopy?._complete == true
          ? widget.pickupCopy
          : null;
  MissionPickupPlan? get _pickupPlan => _pickupCopy != null &&
          widget.pickupBinding != null &&
          widget.pickupPlan?.validFor(_view!, widget.pickupBinding!) == true
      ? widget.pickupPlan
      : null;

  Widget _pickup(int ordinal) {
    final copy = _pickupCopy!;
    final entry = _pickupPlan!.entries
        .singleWhere((entry) => entry.componentOrdinal == ordinal);
    final areaText = switch (entry.areaStatus) {
      MissionPickupValueStatus.syntheticExample => copy.areas[entry.area]!,
      MissionPickupValueStatus.unknown => copy.unknownArea,
      MissionPickupValueStatus.changed => copy.changedArea,
    };
    final timeText = switch (entry.timeStatus) {
      MissionPickupValueStatus.syntheticExample =>
        copy.windows[entry.window!.label]!,
      MissionPickupValueStatus.unknown => copy.unknownTime,
      MissionPickupValueStatus.changed => copy.changedTime,
    };
    return Semantics(
        container: true,
        key: ValueKey('mission-pickup-$ordinal'),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: 8),
          Text(copy.title),
          Text(copy.area),
          Text(areaText),
          Text(copy.time),
          Text(timeText),
        ]));
  }

  @override
  void initState() {
    super.initState();
    _replaceFocusNodes();
  }

  void _replaceFocusNodes() {
    for (final node in _correctionFocus) {
      node.dispose();
    }
    _correctionFocus.clear();
    for (var i = 0; i < (_view?.units.length ?? 0); i++) {
      _correctionFocus.add(FocusNode());
    }
  }

  @override
  void didUpdateWidget(covariant MissionWebEntry oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.view, oldWidget.view) ||
        !identical(widget.copy, oldWidget.copy)) {
      _selected = null;
      _replaceFocusNodes();
      if (_scroll.hasClients) _scroll.jumpTo(0);
    }
  }

  void _reset() {
    setState(() => _selected = null);
    for (final node in _correctionFocus) {
      node.unfocus();
    }
    _resetFocus.requestFocus();
    if (_scroll.hasClients) _scroll.jumpTo(0);
    widget.onReset?.call();
  }

  @override
  void dispose() {
    for (final node in _correctionFocus) {
      node.dispose();
    }
    _resetFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Widget _unit(MissionWebUnitView unit, int index) {
    final copy = widget.copy;
    return Semantics(
      key: ValueKey('mission-entry-unit-$index'),
      container: true,
      selected: _selected == index,
      child: Card(
          child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(unit.label, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            Text(copy.quantity),
            Text('${unit.quantity}'),
            Text(unit.assignment == MissionWebUnitAssignment.assigned
                ? copy.assigned
                : copy.gap),
          ]),
          const SizedBox(height: 8),
          Text(copy.unknownFit),
          if (_pickupPlan != null) _pickup(index),
          if (widget.onCorrect != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              key: ValueKey('mission-entry-correct-$index'),
              focusNode: _correctionFocus[index],
              style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: () {
                setState(() => _selected = index);
                widget.onCorrect!(index);
              },
              child: Text(copy.correct, textAlign: TextAlign.center),
            ),
          ],
        ]),
      )),
    );
  }

  @override
  Widget build(BuildContext context) {
    final copy = widget.copy;
    final view = _view;
    return Material(
        child: SafeArea(
            child: Center(
                child: ConstrainedBox(
      key: const ValueKey('mission-entry-content'),
      constraints: const BoxConstraints(maxWidth: 960),
      child: FocusTraversalGroup(
          child: Column(children: [
        // Disclosure stays outside the scrollable content in every state.
        Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(
                      header: true,
                      child: Text(copy.title,
                          style: Theme.of(context).textTheme.titleLarge)),
                  const SizedBox(height: 8),
                  Text(copy.nonBinding),
                  Text(copy.noReservation),
                  Text(copy.noGroupBooking),
                  if (view != null) Text(copy.synthetic),
                  if (_pickupCopy != null) ...[
                    Text(_pickupCopy!.separate),
                    Text(_pickupCopy!.syntheticNotAgreed),
                    Text(_pickupCopy!.noDeliveryOrCombined),
                  ],
                ])),
        Expanded(
            child: SingleChildScrollView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (view == null)
                        Text(copy.unavailable)
                      else ...[
                        Text(copy.source),
                        Text(view.source),
                        Text(copy.statuses[view.status]!),
                        if (_pickupCopy != null && _pickupPlan == null)
                          Text(_pickupCopy!.unavailable),
                        for (final necessity
                            in MissionWebUnitNecessity.values) ...[
                          const SizedBox(height: 16),
                          Semantics(
                              header: true,
                              child: Text(
                                  necessity == MissionWebUnitNecessity.required
                                      ? copy.requiredUnits
                                      : copy.optionalUnits,
                                  style:
                                      Theme.of(context).textTheme.titleMedium)),
                          for (var i = 0; i < view.units.length; i++)
                            if (view.units[i].necessity == necessity)
                              _unit(view.units[i], i),
                        ],
                        if (widget.onReset != null) ...[
                          const SizedBox(height: 16),
                          OutlinedButton(
                              key: const ValueKey('mission-entry-reset'),
                              focusNode: _resetFocus,
                              style: OutlinedButton.styleFrom(
                                  minimumSize: const Size(48, 48)),
                              onPressed: _reset,
                              child: Text(copy.reset,
                                  textAlign: TextAlign.center)),
                        ],
                      ],
                    ]))),
      ])),
    ))));
  }
}
