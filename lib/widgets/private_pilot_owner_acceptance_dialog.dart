import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/private_pilot_pricing.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/private_pilot_risk_notice.dart';

Future<List<Map<String, dynamic>>?> showPrivatePilotOwnerAcceptanceDialog(
  BuildContext context, {
  required RentalRequest request,
  PrivatePilotQuote? quote,
  bool? isBindingServerQuote,
}) async {
  PrivatePilotQuote? requestSnapshot;
  try {
    requestSnapshot = PrivatePilotQuote.fromRentalRequestSnapshot(request);
  } on FormatException {
    requestSnapshot = null;
  }
  final displayedQuote = quote ?? requestSnapshot;
  final bindingServerQuote = !request.simulationOnly &&
      (isBindingServerQuote ??
          (BackendConfig.enabled &&
              !QaRuntimeService.isEnabled &&
              requestSnapshot != null));
  final requiresRemoteDeadline = !request.simulationOnly &&
      BackendConfig.enabled &&
      !QaRuntimeService.isEnabled;
  final bindingDeadline = request.bindingExpiresAt;
  return showDialog<List<Map<String, dynamic>>>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => _OwnerAcceptanceDialog(
      request: request,
      displayedQuote: displayedQuote,
      bindingServerQuote: bindingServerQuote,
      requiresRemoteDeadline: requiresRemoteDeadline,
      bindingDeadline: bindingDeadline,
    ),
  );
}

class _OwnerAcceptanceDialog extends StatefulWidget {
  final RentalRequest request;
  final PrivatePilotQuote? displayedQuote;
  final bool bindingServerQuote;
  final bool requiresRemoteDeadline;
  final DateTime? bindingDeadline;

  const _OwnerAcceptanceDialog({
    required this.request,
    required this.displayedQuote,
    required this.bindingServerQuote,
    required this.requiresRemoteDeadline,
    required this.bindingDeadline,
  });

  @override
  State<_OwnerAcceptanceDialog> createState() => _OwnerAcceptanceDialogState();
}

class _OwnerAcceptanceDialogState extends State<_OwnerAcceptanceDialog> {
  Timer? _deadlineTimer;
  bool _confirmed = false;

  @override
  void initState() {
    super.initState();
    final deadline = widget.bindingDeadline;
    if (!widget.requiresRemoteDeadline || deadline == null) return;
    final remaining = deadline.difference(DateTime.now());
    if (remaining <= Duration.zero) return;
    _deadlineTimer = Timer(remaining, () {
      if (!mounted) return;
      setState(() => _confirmed = false);
    });
  }

  @override
  void dispose() {
    _deadlineTimer?.cancel();
    super.dispose();
  }

  bool get _deadlineValid =>
      !widget.requiresRemoteDeadline ||
      (widget.bindingDeadline != null &&
          widget.bindingDeadline!.isAfter(DateTime.now()));

  @override
  Widget build(BuildContext context) {
    final displayedQuote = widget.displayedQuote;
    final deadlineValid = _deadlineValid;
    final acceptanceAllowed = displayedQuote != null && deadlineValid;
    return AlertDialog(
      title: Text(
        widget.request.simulationOnly
            ? 'Test-Mietanfrage annehmen'
            : 'Buchungsanfrage annehmen',
      ),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Zeitraum: ${_date(widget.request.start)} bis ${_date(widget.request.end)}',
              ),
              const SizedBox(height: 8),
              Text(
                displayedQuote == null
                    ? 'Preisprüfung fehlgeschlagen'
                    : widget.request.simulationOnly
                        ? 'Unverbindliche Pilot-Simulation · kein Echtgeld'
                        : widget.bindingServerQuote
                            ? 'Verbindlicher Serverpreis'
                            : 'Lokaler Testpreis · kein Echtgeld',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              if (!deadlineValid) ...[
                const SizedBox(height: 4),
                Text(
                  'Die 30-Minuten-Annahmefrist ist abgelaufen. Diese Anfrage kann nicht mehr angenommen werden.',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ] else if (displayedQuote == null) ...[
                const SizedBox(height: 4),
                Text(
                  'Der verbindliche Preis fehlt oder ist widersprüchlich. Die Annahme bleibt gesperrt; bitte lade die Anfrage neu.',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ] else ...[
                if (widget.requiresRemoteDeadline) ...[
                  const SizedBox(height: 4),
                  Text(
                      'Annahme möglich bis ${_dateTime(widget.bindingDeadline!)}.'),
                ],
                const SizedBox(height: 4),
                const Text(
                  'Preisaufschlüsselung',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  'Privater Mietpreis vor Rabatt: ${_money(displayedQuote.baseRentalMinor)}',
                ),
                if (displayedQuote.discountMinor > 0)
                  Text(
                    '${displayedQuote.discountLabel}: -${_money(displayedQuote.discountMinor)}',
                  ),
                Text(
                  'Privater Mietpreis / deine vorgesehene Auszahlung: ${_money(displayedQuote.rentalSubtotalMinor)}',
                ),
                Text(
                  'SIT-Plattformbeitrag des Mieters: ${_money(displayedQuote.platformFeeMinor)}',
                ),
                Text(
                  'Gesamtpreis des Mieters: ${_money(displayedQuote.totalMinor)}',
                ),
              ],
              const SizedBox(height: 12),
              if (widget.request.simulationOnly)
                Card(
                  color: Theme.of(context).colorScheme.tertiaryContainer,
                  child: const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text(
                      'Diese Annahme bestätigt nur den Testablauf. Sie schließt keinen Miet- oder Plattformvertrag, reserviert den Artikel nicht und löst keine Zahlung aus.',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                )
              else
                const PrivatePilotRiskNotice(
                  title: 'Privatvermietung ohne SIT-Schadenschutz',
                ),
              const SizedBox(height: 8),
              CheckboxListTile(
                value: _confirmed,
                onChanged: acceptanceAllowed
                    ? (value) => setState(() => _confirmed = value == true)
                    : null,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(
                  widget.request.simulationOnly
                      ? 'Ich nehme ausschließlich diese unverbindliche Pilot-Simulation an.'
                      : PrivatePilotConfig.ownerAcceptanceDeclaration,
                ),
                subtitle: widget.request.simulationOnly
                    ? const Text(
                        'Kein Vertrag · keine Reservierung · keine Zahlung')
                    : const Text(
                        '${PrivatePilotConfig.documentName} · ${PrivatePilotConfig.documentVersion}',
                      ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          onPressed: _confirmed && acceptanceAllowed
              ? () {
                  if (widget.requiresRemoteDeadline &&
                      (widget.bindingDeadline == null ||
                          !widget.bindingDeadline!.isAfter(DateTime.now()))) {
                    setState(() => _confirmed = false);
                    return;
                  }
                  if (widget.request.simulationOnly) {
                    Navigator.of(context).pop(<Map<String, dynamic>>[]);
                    return;
                  }
                  final acceptedAt = DateTime.now();
                  Navigator.of(context).pop([
                    {
                      'type': 'owner_booking_acceptance',
                      'exactWording':
                          PrivatePilotConfig.ownerAcceptanceDeclaration,
                      'documentName': PrivatePilotConfig.documentName,
                      'documentVersion': PrivatePilotConfig.documentVersion,
                      'language': PrivatePilotConfig.language,
                      'accepted': true,
                      'acceptedAt': acceptedAt.toIso8601String(),
                    },
                  ]);
                }
              : null,
          child: Text(
            widget.request.simulationOnly
                ? 'Test annehmen'
                : 'Verbindlich annehmen',
          ),
        ),
      ],
    );
  }
}

Future<bool> commitPrivatePilotOwnerAcceptance(
  BuildContext context, {
  required RentalRequest request,
  required List<Map<String, dynamic>> legalDeclarations,
}) async {
  try {
    await DataService.updateRentalRequestStatus(
      requestId: request.id,
      status: 'accepted',
      legalDeclarations: legalDeclarations,
    );
    return true;
  } on BackendException catch (error) {
    if (error.code != 'booking_request_expired') rethrow;
    if (!context.mounted) return false;
    await AppPopup.info(
      context,
      title: 'Annahmefrist abgelaufen',
      message:
          'Die 30-Minuten-Frist ist inzwischen abgelaufen. Diese Anfrage kann nicht mehr angenommen werden. Bitte lade die Ansicht neu.',
    );
    return false;
  }
}

String _date(DateTime value) {
  String two(int number) => number.toString().padLeft(2, '0');
  return '${two(value.day)}.${two(value.month)}.${value.year}';
}

String _money(int minor) => '${(minor / 100).toStringAsFixed(2)} €';

String _dateTime(DateTime value) {
  String two(int number) => number.toString().padLeft(2, '0');
  final local = value.toLocal();
  return '${two(local.day)}.${two(local.month)}.${local.year}, '
      '${two(local.hour)}:${two(local.minute)} Uhr';
}
