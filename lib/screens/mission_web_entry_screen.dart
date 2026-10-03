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
  List<int> _pickupRevisions = [1, 2];
  List<bool> _pickupChanged = [false, false];
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
      _pickupRevisions = [1, 2];
      _pickupChanged = [false, false];
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
    final view = MissionWebEntryView(
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
        ]);
    final pickupCopy = MissionPickupCopy(
      title: t('pickup.title'),
      separate: t('pickup.separate'),
      syntheticNotAgreed: t('pickup.syntheticNotAgreed'),
      noDeliveryOrCombined: t('pickup.noDeliveryOrCombined'),
      unavailable: t('pickup.unavailable'),
      area: t('pickup.area'),
      time: t('pickup.time'),
      unknownArea: t('pickup.unknownArea'),
      changedArea: t('pickup.changedArea'),
      unknownTime: t('pickup.unknownTime'),
      changedTime: t('pickup.changedTime'),
      areas: {
        MissionPickupArea.exampleA: t('pickup.areaA'),
        MissionPickupArea.exampleB: t('pickup.areaB')
      },
      windows: {
        MissionPickupWindowLabel.october4Morning: t('pickup.october4Morning'),
        MissionPickupWindowLabel.october5Afternoon:
            t('pickup.october5Afternoon'),
      },
    );
    final pickupPlan = MissionPickupPlan(
        version: MissionPickupPlan.schemaVersion,
        synthetic: true,
        entries: List.generate(
            2,
            (index) => MissionPickupEntry(
                  componentOrdinal: index,
                  sourceRevision: _pickupRevisions[index],
                  areaStatus: _pickupChanged[index]
                      ? MissionPickupValueStatus.changed
                      : MissionPickupValueStatus.syntheticExample,
                  timeStatus: _pickupChanged[index]
                      ? MissionPickupValueStatus.changed
                      : MissionPickupValueStatus.syntheticExample,
                  area: _pickupChanged[index]
                      ? null
                      : index == 0
                          ? MissionPickupArea.exampleA
                          : MissionPickupArea.exampleB,
                  window: _pickupChanged[index]
                      ? null
                      : index == 0
                          ? const MissionPickupWindow(
                              start: '2026-10-04T08:00:00Z',
                              end: '2026-10-04T09:00:00Z',
                              zone: 'Europe/Berlin')
                          : const MissionPickupWindow(
                              start: '2026-10-05T13:00:00Z',
                              end: '2026-10-05T14:00:00Z',
                              zone: 'Europe/Berlin'),
                )));
    return MissionWebEntry(
      copy: copy, view: view, pickupPlan: pickupPlan, pickupCopy: pickupCopy,
      pickupBinding: MissionPickupBinding(
          display: view, sourceRevisions: _pickupRevisions),
      // Cycle only fixed example quantities 1–3; never accept free text or IDs.
      onCorrect: (index) {
        if (_available && index >= 0 && index < 2) {
          setState(() {
            _quantities = List.generate(
                2, (i) => i == index ? _quantities[i] % 3 + 1 : _quantities[i]);
            _pickupRevisions = List.generate(
                2,
                (i) =>
                    i == index ? _pickupRevisions[i] + 1 : _pickupRevisions[i]);
            _pickupChanged =
                List.generate(2, (i) => i == index || _pickupChanged[i]);
          });
        }
      },
      onReset: () {
        if (_available) {
          setState(() {
            _quantities = [2, 1];
            _pickupRevisions = [1, 2];
            _pickupChanged = [false, false];
          });
        }
      },
    );
  }
}
