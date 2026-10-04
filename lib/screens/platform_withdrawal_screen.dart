import 'package:flutter/material.dart';
import 'package:crypto/crypto.dart' as dart_crypto;
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:share_plus/share_plus.dart';

class PlatformWithdrawalScreen extends StatefulWidget {
  final String? initialBookingId;

  const PlatformWithdrawalScreen({super.key, this.initialBookingId});

  @override
  State<PlatformWithdrawalScreen> createState() =>
      _PlatformWithdrawalScreenState();
}

class _PlatformWithdrawalScreenState extends State<PlatformWithdrawalScreen> {
  bool _loading = true;
  bool _submitting = false;
  List<RentalRequest> _requests = const [];
  RentalRequest? _selected;
  String _scope = 'account_contract';
  String _actorName = 'SIT-Nutzer';
  bool _confirmStep = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final current = await DataService.getCurrentUser();
    final requests = current == null
        ? <RentalRequest>[]
        : await DataService.getRentalRequestsForRenter(current.id);
    if (!mounted) return;
    final eligibleRequests = requests
        .where(
          (request) => !{'declined', 'cancelled'}.contains(request.status),
        )
        .toList(growable: false);
    final initialBookingId = widget.initialBookingId?.trim() ?? '';
    RentalRequest? initiallySelected;
    for (final request in eligibleRequests) {
      if (request.id == initialBookingId) {
        initiallySelected = request;
        break;
      }
    }
    setState(() {
      _actorName = current?.displayName.trim().isNotEmpty == true
          ? current!.displayName.trim()
          : 'SIT-Nutzer';
      _requests = eligibleRequests;
      if (initiallySelected != null) {
        _selected = initiallySelected;
        _scope = 'booking_contract';
      }
      _loading = false;
    });
  }

  bool get _canContinue => _scope == 'account_contract' || _selected != null;

  Future<void> _shareReceipt(Map<String, dynamic> withdrawal) async {
    final id = withdrawal['id']?.toString() ?? '';
    final receipt = withdrawal['receipt'];
    if (id.isEmpty || receipt is! Map) {
      throw const BackendException(409, 'v51_withdrawal_receipt_unavailable');
    }
    final expectedHash = receipt['artifactSha256']?.toString() ?? '';
    if (expectedHash.length != 64) {
      throw const BackendException(
        409,
        'v51_withdrawal_receipt_integrity_failed',
      );
    }
    final downloaded = await BackendRepository.downloadWithdrawalReceipt(id);
    final observedHash =
        downloaded.headers['x-sit-artifact-sha256']?.trim() ?? '';
    final contentHash = dart_crypto.sha256.convert(downloaded.bytes).toString();
    if (observedHash != expectedHash || contentHash != expectedHash) {
      throw const BackendException(
        409,
        'v51_withdrawal_receipt_integrity_failed',
      );
    }
    const filename = 'shareittoo-widerrufsbestaetigung.html';
    await SharePlus.instance.share(
      ShareParams(
        files: [
          XFile.fromData(
            downloaded.bytes,
            name: filename,
            mimeType: 'text/html',
          ),
        ],
        fileNameOverrides: const [filename],
        subject: 'ShareItToo Widerrufsbestätigung',
        text:
            'Dauerhafte Bestätigung deines bei ShareItToo eingegangenen Widerrufs.',
        downloadFallbackEnabled: true,
      ),
    );
  }

  Future<void> _submit() async {
    final current = await DataService.getCurrentUser();
    if (current == null || !_canContinue || _submitting) return;
    setState(() => _submitting = true);
    try {
      final result = await DataService.recordPlatformWithdrawal(
        requestId: _scope == 'booking_contract' ? _selected?.id : null,
        userId: current.id,
        scope: _scope,
      );
      if (!mounted) return;
      if (result == null) {
        await AppPopup.error(
          context,
          title: 'Widerruf nicht gesendet',
          message:
              'Der Vertrag konnte nicht eindeutig und sicher zugeordnet werden.',
        );
        return;
      }
      final withdrawalRaw = result['withdrawal'];
      final withdrawal = withdrawalRaw is Map
          ? Map<String, dynamic>.from(withdrawalRaw)
          : const <String, dynamic>{};
      final remoteDurableReceipt =
          BackendConfig.enabled && !QaRuntimeService.isEnabled;
      if (remoteDurableReceipt) await _shareReceipt(withdrawal);
      if (!mounted) return;
      final phase = withdrawal['effectPhase']?.toString();
      final manualReview =
          withdrawal['eligibilityStatus'] == 'manual_review_required';
      final message = manualReview
          ? 'Die Erklärung wurde empfangen. Das garantierte vertragliche 14-Tage-Fenster ist abgelaufen; mögliche längere gesetzliche Rechte werden geprüft. Buchung und Erstattungen wurden nicht automatisch verändert.'
          : switch (phase) {
              'before_handover' =>
                'Die Buchung wurde kostenfrei beendet. Mietpreis und SIT-Plattformgebühr wurden als zwei getrennte Erstattungen vorgemerkt.',
              'after_handover' =>
                'Die Nutzung endet jetzt. Die dokumentierte Rückgabe ist erforderlich; die SIT-Plattformgebühr wird vollständig und der übrige Mietpreis nach bestätigter Rückgabe zeitanteilig vorgemerkt.',
              _ =>
                'Der Widerruf des Kontovertrags wurde mit Inhalt, Datum und Uhrzeit erfasst. Bestehende Buchungen wurden nicht stillschweigend verändert.',
            };
      await AppPopup.success(
        context,
        title: 'Widerruf eingegangen',
        message: remoteDurableReceipt
            ? '$message Die dauerhafte Eingangsbestätigung wurde zum Speichern oder Teilen geöffnet.'
            : '$message Im internen Testmodus wurde keine rechtsverbindliche Eingangsbestätigung erzeugt.',
      );
      if (mounted) Navigator.of(context).maybePop();
    } on BackendException catch (error) {
      if (!mounted) return;
      await AppPopup.error(
        context,
        title: 'Widerruf nicht abgeschlossen',
        message: _backendMessage(error.code),
      );
    } catch (_) {
      if (!mounted) return;
      await AppPopup.error(
        context,
        title: 'Widerruf nicht gesendet',
        message:
            'Die sichere Speicherung oder Eingangsbestätigung ist fehlgeschlagen. Es wurde kein Erfolg behauptet. Bitte versuche es erneut.',
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _consequences() {
    if (_scope == 'account_contract') {
      return 'Der Eingang betrifft den Kontovertrag. Bestehende Buchungen werden nicht automatisch verändert.';
    }
    final request = _selected;
    if (request == null) return 'Bitte wähle zuerst eine Buchung.';
    if ({'running', 'completed'}.contains(request.status)) {
      return 'Nach Übergabe endet die Nutzung sofort. Du musst die dokumentierte Rückgabe abschließen. Der Mietpreis wird bis zur bestätigten Rückgabe zeitanteilig berechnet; die SIT-Plattformgebühr wird vollständig separat vorgemerkt.';
    }
    return 'Vor Übergabe wird die Buchung kostenfrei beendet. Der Vermieter wird informiert. Mietpreis und SIT-Plattformgebühr werden vollständig als getrennte Erstattungen vorgemerkt.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vertrag widerrufen')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(18),
              children: [
                Text(
                  _confirmStep ? 'Widerruf bestätigen' : 'Vertrag auswählen',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Eine Begründung ist nicht erforderlich. Vor dem Absenden zeigen wir Identität, Vertrag, Empfangskanal und Folgen nochmals vollständig an.',
                ),
                const SizedBox(height: 18),
                if (!_confirmStep) ...[
                  RadioGroup<String>(
                    groupValue: _scope,
                    onChanged: (value) => setState(() {
                      if (value != null) _scope = value;
                    }),
                    child: const Column(
                      children: [
                        RadioListTile<String>(
                          value: 'account_contract',
                          title: Text('Kontovertrag'),
                          subtitle: Text(
                              'Ohne automatische Änderung bestehender Buchungen'),
                        ),
                        RadioListTile<String>(
                          value: 'booking_contract',
                          title: Text('Buchungsbezogener SIT-Vertrag'),
                          subtitle: Text(
                            'Mit den vertraglich gebundenen Folgen für diese Buchung',
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_scope == 'booking_contract') ...[
                    const SizedBox(height: 8),
                    if (_requests.isEmpty)
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('Keine zuordenbare Buchung gefunden.'),
                        ),
                      ),
                    RadioGroup<RentalRequest>(
                      groupValue: _selected,
                      onChanged: (value) => setState(() => _selected = value),
                      child: Column(
                        children: [
                          for (final request in _requests)
                            RadioListTile<RentalRequest>(
                              value: request,
                              title: Text('Buchung ${request.id}'),
                              subtitle: Text(
                                '${_date(request.start)} bis ${_date(request.end)} · Status ${request.status}',
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _canContinue
                        ? () => setState(() => _confirmStep = true)
                        : null,
                    child: const Text('Folgen prüfen'),
                  ),
                ] else ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _Info(label: 'Name', value: _actorName),
                          _Info(
                            label: 'Vertrag',
                            value: _scope == 'account_contract'
                                ? 'Kontovertrag'
                                : 'Buchung ${_selected!.id}',
                          ),
                          const _Info(
                            label: 'Elektronischer Empfangskanal',
                            value: 'Sicherer In-App-Download',
                          ),
                          const Divider(height: 24),
                          const Text(
                            'Folgen',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 6),
                          Text(_consequences()),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _confirmStep = false),
                    child: const Text('Zurück'),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: Text(
                      _submitting
                          ? 'Wird sicher gespeichert…'
                          : 'Widerruf bestätigen',
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

class _Info extends StatelessWidget {
  final String label;
  final String value;

  const _Info({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 2),
          SelectableText(value),
        ],
      ),
    );
  }
}

String _backendMessage(String code) => switch (code) {
      'v51_withdrawal_document_unavailable' =>
        'Die verbindliche Widerrufsinformation ist serverseitig nicht verfügbar. Der Vorgang bleibt sicher blockiert.',
      'v51_withdrawal_receipt_unavailable' ||
      'v51_withdrawal_receipt_integrity_failed' =>
        'Die dauerhafte Eingangsbestätigung konnte nicht sicher erstellt oder geprüft werden. Es wurde kein Erfolg behauptet.',
      'v51_withdrawal_booking_not_eligible' =>
        'Diese Buchung kann dem automatischen Widerrufsablauf nicht sicher zugeordnet werden.',
      'v51_withdrawal_email_delivery_not_available' =>
        'E-Mail-Zustellung ist noch nicht freigegeben. Bitte verwende den sicheren In-App-Download.',
      _ =>
        'Die sichere Verarbeitung ist fehlgeschlagen. Bitte versuche es erneut oder kontaktiere den Support.',
    };

String _date(DateTime value) {
  String two(int number) => number.toString().padLeft(2, '0');
  return '${two(value.day)}.${two(value.month)}.${value.year}';
}
