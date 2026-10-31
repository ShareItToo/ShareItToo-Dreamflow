import 'dart:math';
import 'package:flutter/material.dart';
import '../config/synthetic_payment_config.dart';
import '../services/synthetic_payment_service.dart';

class SyntheticPaymentTestScreen extends StatefulWidget {
  final String runId;
  final String bookingId;
  final SyntheticPaymentApi? api;
  const SyntheticPaymentTestScreen(
      {super.key, required this.runId, required this.bookingId, this.api});
  @override
  State<SyntheticPaymentTestScreen> createState() =>
      _SyntheticPaymentTestScreenState();
}

class _SyntheticPaymentTestScreenState extends State<SyntheticPaymentTestScreen>
    with WidgetsBindingObserver {
  SyntheticPaymentApi? _api;
  final _scroll = ScrollController();
  Map<String, dynamic>? _snapshot;
  Map<String, dynamic>? _lastCommand;
  String? _scenario;
  String? _error;
  bool _busy = false;
  bool _cleaned = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy || _cleaned || !SyntheticPaymentConfig.enabled) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      _api ??= widget.api ??
          await SyntheticPaymentService.create(widget.runId, widget.bookingId);
      await action();
    } catch (_) {
      if (mounted) {
        setState(() {
          _snapshot = null;
          _error =
              'Teststatus nicht verfügbar. Anmeldung, Run und Buchung prüfen; es wird kein Erfolg angenommen.';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _read() async {
    final value = await _api!.load();
    validateSyntheticPaymentSnapshot(value, widget.runId, widget.bookingId);
    if (value['scenarios'] is! List ||
        (value['scenarios'] as List).join(',') !=
            syntheticPaymentScenarios.join(',') ||
        value['isRenter'] is! bool) {
      throw const FormatException('synthetic_payment_capability_invalid');
    }
    if (mounted) {
      setState(() => _snapshot = value);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _scroll.hasClients) _scroll.jumpTo(0);
      });
    }
  }

  Future<void> _refresh() => _run(_read);
  Future<void> _command(String action) => _run(() async {
        final key =
            'synthetic-ui-${List.generate(16, (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
        final body = <String, dynamic>{
          'runId': widget.runId,
          'key': key,
          'action': action,
          if (action == 'select') ...{
            'method': 'synthetic',
            'scenario': _scenario
          }
        };
        _lastCommand = body;
        await _api!.command(body);
        await _read(); // Never render a command receipt as the current state.
      });
  Future<void> _replay() => _run(() async {
        await _api!.command(Map.of(_lastCommand!));
        await _read();
      });
  Future<void> _cleanup() => _run(() async {
        await _api!.cleanup();
        if (mounted) {
          setState(() {
            _cleaned = true;
            _snapshot = null;
            _lastCommand = null;
          });
        }
      });

  @override
  Widget build(BuildContext context) {
    if (!SyntheticPaymentConfig.enabled) {
      return const Scaffold(
          body: Center(
              child: Text('Synthetischer Zahlungstest nicht aktiviert.')));
    }
    final payment = _snapshot?['payment'] as Map?;
    final status = payment?['status'] as String?;
    final renter = _snapshot?['isRenter'] == true;
    final selectable = renter &&
        (status == null || const ['failed', 'refunded'].contains(status));
    String money(String field) =>
        (((_snapshot!['quote'] as Map)[field] as num) / 100)
            .toStringAsFixed(2)
            .replaceAll('.', ',');
    return Scaffold(
      appBar: AppBar(title: const Text('Synthetischer Zahlungstest'), actions: [
        IconButton(
            tooltip: 'Teststatus aktualisieren',
            onPressed: _busy || _cleaned ? null : _refresh,
            icon: const Icon(Icons.refresh))
      ]),
      body: SafeArea(
          child: Column(children: [
        const Padding(
            padding: EdgeInsets.all(12),
            child: Text(syntheticPaymentNotice,
                style: TextStyle(fontWeight: FontWeight.bold))),
        if (_snapshot != null) ...[
          Semantics(
              liveRegion: true,
              child: Text('Server-Teststatus: ${status ?? 'keine Auswahl'}')),
          if (!renter)
            const Text(
                'Vermieteransicht: nur Serverstatus; keine Zahlungsaktion.'),
        ],
        Expanded(
            child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.all(16),
                children: [
              if (_busy) const LinearProgressIndicator(),
              if (_error != null) Text(_error!, semanticsLabel: _error),
              if (_cleaned)
                const Text(
                    'Testbereinigung bestätigt: 0 Zustände, 0 Befehle, 0 Zahlungsereignisse.'),
              if (_snapshot != null) ...[
                Text(
                    'Testbetrag: ${money('ownerPayoutMinor')} EUR + ${money('platformFeeMinor')} EUR Plattformbeitrag = ${money('amountMinor')} EUR'),
                Text(
                    'Server-Zahlungsereignisse: ${(_snapshot!['audit'] as List).length}'),
                if (selectable) ...[
                  const Text('Testmethode: Synthetisch (keine Zahlungsdaten)'),
                  for (final scenario in _snapshot!['scenarios'] as List)
                    OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () =>
                                setState(() => _scenario = scenario as String),
                        child: Text(scenario == 'decline'
                            ? 'Sichere Testablehnung wählen'
                            : 'Bestätigung mit Testerfolg wählen')),
                  if (_scenario != null)
                    Text(_scenario == 'decline'
                        ? 'Gewählt: Testablehnung'
                        : 'Gewählt: Bestätigung mit Testerfolg'),
                  FilledButton(
                      onPressed: _busy || _scenario == null
                          ? null
                          : () => _command('select'),
                      child: const Text('Testauswahl speichern')),
                ],
                if (renter && status == 'ready')
                  FilledButton(
                      onPressed: _busy ? null : () => _command('submit'),
                      child: const Text('Testzahlung absenden')),
                if (renter && status == 'requires_action')
                  FilledButton(
                      onPressed: _busy ? null : () => _command('confirm'),
                      child: const Text('Zusätzliche Testbestätigung')),
                if (renter && status == 'captured')
                  FilledButton(
                      onPressed: _busy ? null : () => _command('refund'),
                      child: const Text('Testerstattung auslösen')),
              ],
              if (_lastCommand != null)
                OutlinedButton(
                    onPressed: _busy ? null : _replay,
                    child: const Text('Letzten Testbefehl wiederholen')),
              if (_snapshot != null)
                OutlinedButton(
                    onPressed: _busy ? null : _cleanup,
                    child: const Text('Klon und Zahlungstest bereinigen')),
            ])),
      ])),
    );
  }
}
