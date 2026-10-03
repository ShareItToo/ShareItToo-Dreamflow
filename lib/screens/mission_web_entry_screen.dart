import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lendify/config/mission_web_entry_config.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/mission_web_entry.dart';

/// A fixed synthetic presentation, never a Mission gateway or account editor.
class MissionWebEntryScreen extends StatefulWidget {
  const MissionWebEntryScreen({super.key, this.testWeb, this.testEnabled});
  @visibleForTesting
  final bool? testWeb;
  @visibleForTesting
  final bool? testEnabled;

  @override
  State<MissionWebEntryScreen> createState() => _MissionWebEntryScreenState();
}

class _MissionWebEntryScreenState extends State<MissionWebEntryScreen> {
  List<int> _quantities = [2, 1];
  bool get _available =>
      !kReleaseMode && widget.testWeb != null && widget.testEnabled != null
          ? MissionWebEntryConfig.availableFor(
              isWeb: widget.testWeb!, enabled: widget.testEnabled!)
          : MissionWebEntryConfig.available;

  @override
  void didUpdateWidget(covariant MissionWebEntryScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.testWeb != widget.testWeb ||
        oldWidget.testEnabled != widget.testEnabled) {
      _quantities = [2, 1];
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.watch<LocalizationController>();
    String t(String key) => l.t('missionWeb.$key');
    final copy = MissionWebEntryCopy(
      title: t('title'),
      synthetic: t('synthetic'),
      nonBinding: t('nonBinding'),
      noReservation: t('noReservation'),
      noGroupBooking: t('noGroupBooking'),
      unavailable: t('unavailable'),
      requiredUnits: t('required'),
      optionalUnits: t('optional'),
      quantity: t('quantity'),
      assigned: t('assigned'),
      gap: t('gap'),
      unknownFit: t('unknownFit'),
      source: t('source'),
      correct: t('correct'),
      reset: t('reset'),
      statuses: {
        MissionWebEntryStatus.incomplete: t('incomplete'),
        MissionWebEntryStatus.readbackRequired: t('readback'),
        MissionWebEntryStatus.needsClarification: t('clarification'),
      },
    );
    if (!_available) return MissionWebEntry(copy: copy);
    return MissionWebEntry(
      copy: copy,
      view: MissionWebEntryView(
          version: MissionWebEntryView.schemaVersion,
          synthetic: true,
          source: t('exampleSource'),
          status: MissionWebEntryStatus.incomplete,
          units: [
            MissionWebUnitView(
                label: t('container'),
                quantity: _quantities[0],
                necessity: MissionWebUnitNecessity.required,
                assignment: MissionWebUnitAssignment.assigned),
            MissionWebUnitView(
                label: t('tool'),
                quantity: _quantities[1],
                necessity: MissionWebUnitNecessity.optional,
                assignment: MissionWebUnitAssignment.gap),
          ]),
      // Cycle only fixed example quantities 1–3; never accept free text or IDs.
      onCorrect: (index) {
        if (_available && index >= 0 && index < 2) {
          setState(() => _quantities = List.generate(
              2, (i) => i == index ? _quantities[i] % 3 + 1 : _quantities[i]));
        }
      },
      onReset: () {
        if (_available) setState(() => _quantities = [2, 1]);
      },
    );
  }
}
