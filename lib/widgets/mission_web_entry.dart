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

/// Unwired presentation. Omitted/invalid view means unavailable and no actions.
/// Corrections return only a display ordinal, never a command or domain identity.
class MissionWebEntry extends StatefulWidget {
  const MissionWebEntry(
      {super.key, required this.copy, this.view, this.onCorrect, this.onReset});
  final MissionWebEntryCopy copy;
  final MissionWebEntryView? view;
  final ValueChanged<int>? onCorrect;
  final VoidCallback? onReset;

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
