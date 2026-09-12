import 'dart:async';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/models/planner.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/planner_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

class ClosedPilotPlannerScreen extends StatefulWidget {
  const ClosedPilotPlannerScreen({
    super.key,
    this.gateway = const BackendPlannerGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.enableForTesting = false,
  });

  final PlannerGateway gateway;
  final ListingMutationService listingMutationService;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<ClosedPilotPlannerScreen> createState() =>
      _ClosedPilotPlannerScreenState();
}

class _ClosedPilotPlannerScreenState extends State<ClosedPilotPlannerScreen> {
  StreamSubscription<String>? _sessionSubscription;
  ListingMutationContext? _context;
  PlannerCatalog? _catalog;
  PlannerTemplate? _template;
  PlannerResolution? _resolution;
  final Map<String, String> _answers = <String, String>{};
  late DateTimeRange _range;
  bool _loading = true;
  bool _busy = false;
  String? _message;
  bool _messageIsError = false;
  int _revision = 0;

  bool get _available =>
      PlannerTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  @override
  void initState() {
    super.initState();
    final today = DateUtils.dateOnly(DateTime.now());
    _range = DateTimeRange(
      start: today.add(const Duration(days: 1)),
      end: today.add(const Duration(days: 3)),
    );
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _revision += 1;
      if (mounted) {
        setState(() {
          _context = null;
          _catalog = null;
          _template = null;
          _resolution = null;
          _answers.clear();
          _message = null;
          _loading = true;
          _busy = false;
        });
      }
      unawaited(_load());
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    _revision += 1;
    _sessionSubscription?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final revision = ++_revision;
    if (!_available) {
      if (mounted && revision == _revision) setState(() => _loading = false);
      return;
    }
    try {
      final context = await widget.listingMutationService.loadCurrentContext();
      if (context == null || revision != _revision) {
        throw StateError('planner_authentication_required');
      }
      final catalog = await widget.gateway.loadCatalog(context.owner.authOwner);
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision ||
          !mounted) {
        return;
      }
      setState(() {
        _context = context;
        _catalog = catalog;
        _selectTemplate(catalog.templates.first, notify: false);
        _loading = false;
        _message = null;
      });
    } catch (_) {
      if (!mounted || revision != _revision) return;
      setState(() {
        _context = null;
        _catalog = null;
        _template = null;
        _resolution = null;
        _loading = false;
        _message =
            'Der Planer konnte für das aktuell angemeldete Pilotkonto nicht sicher geladen werden.';
        _messageIsError = true;
      });
    }
  }

  void _selectTemplate(PlannerTemplate template, {bool notify = true}) {
    void update() {
      _template = template;
      _answers
        ..clear()
        ..addEntries(
          template.questions.map(
            (question) => MapEntry(question.id, question.options.first),
          ),
        );
      _resolution = null;
      _message = null;
      _messageIsError = false;
    }

    if (notify) {
      setState(update);
    } else {
      update();
    }
  }

  Future<void> _pickDates() async {
    final context = _context;
    if (_busy || context == null) return;
    final range = await showDateRangePicker(
      context: this.context,
      firstDate: DateUtils.dateOnly(DateTime.now()),
      lastDate: DateUtils.dateOnly(
        DateTime.now().add(const Duration(days: 365)),
      ),
      initialDateRange: _range,
      helpText: 'Mietzeitraum für den Projektplan',
    );
    if (range == null || !mounted) return;
    if (!await widget.listingMutationService.isContextCurrent(context)) return;
    setState(() {
      _range = range;
      _resolution = null;
      _message = null;
    });
  }

  Map<String, dynamic> _request() => <String, dynamic>{
        'templateId': _template!.id,
        'answers': Map<String, String>.from(_answers),
        'startDate': _date(_range.start),
        'endDate': _date(_range.end),
      };

  Future<void> _resolve() async {
    final context = _context;
    if (_busy || context == null || _template == null) return;
    final revision = ++_revision;
    setState(() {
      _busy = true;
      _resolution = null;
      _message = null;
    });
    try {
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision) {
        return;
      }
      final resolution = await widget.gateway.resolve(
        owner: context.owner.authOwner,
        request: _request(),
      );
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision ||
          !mounted) {
        return;
      }
      setState(() {
        _resolution = resolution;
        _message = resolution.cartEligible
            ? 'Serverbestand und Preisvorschauen sind aktuell geprüft.'
            : 'Mindestens ein erforderlicher Artikeltyp fehlt. Das Projekt kann nicht in den Mietkorb gelegt werden.';
        _messageIsError = !resolution.cartEligible;
      });
    } catch (_) {
      if (!mounted ||
          revision != _revision ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        _message =
            'Die Serverprüfung ist fehlgeschlagen. Es wurde kein bestätigtes Ergebnis, keine Reservierung und keine Zahlung angezeigt.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && revision == _revision) setState(() => _busy = false);
    }
  }

  Future<void> _addToCart(PlannerVariant variant) async {
    final context = _context;
    final resolution = _resolution;
    if (_busy ||
        context == null ||
        resolution == null ||
        !resolution.cartEligible ||
        !variant.available) {
      return;
    }
    final revision = ++_revision;
    final projectId = 'planner_${DateTime.now().microsecondsSinceEpoch}';
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision) {
        return;
      }
      final receipt = await widget.gateway.addToCart(
        owner: context.owner.authOwner,
        projectId: projectId,
        request: <String, dynamic>{
          ..._request(),
          'variantId': variant.id,
          'inventorySnapshotHash': resolution.inventorySnapshotHash,
        },
        resolution: resolution,
        variantId: variant.id,
      );
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision ||
          !mounted) {
        return;
      }
      setState(() {
        _message =
            '${receipt.addedItemCount} Artikel wurden serverbestätigt in den Mietkorb gelegt. Noch keine Reservierung, kein Vertrag und keine Zahlung.';
        _messageIsError = false;
      });
      SharedPersistenceSync.notify(SharedPersistenceSync.rentalCartKey);
    } catch (_) {
      if (!mounted ||
          revision != _revision ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        _message =
            'Das Ergebnis der Mietkorb-Übernahme ist nicht sicher bestätigt. Bitte den Mietkorb neu laden und den Serverstand prüfen, bevor du wiederholst.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && revision == _revision) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_available) {
      return Scaffold(
        appBar: AppBar(title: const Text('SIT Planer')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text('Der Planer ist nur im geschlossenen Pilot verfügbar.'),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('SIT Planer')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _catalog == null || _template == null || _context == null
              ? _PlannerLoadFailure(message: _message, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [
                    const _PlannerBoundaryCard(),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<PlannerTemplate>(
                      initialValue: _template,
                      decoration: const InputDecoration(
                        labelText: 'Projekt',
                        border: OutlineInputBorder(),
                      ),
                      items: _catalog!.templates
                          .map(
                            (template) => DropdownMenuItem(
                              value: template,
                              child: Text(template.title),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: _busy
                          ? null
                          : (template) {
                              if (template != null) _selectTemplate(template);
                            },
                    ),
                    const SizedBox(height: 12),
                    for (final question in _template!.questions) ...[
                      Text(
                        question.prompt,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      SegmentedButton<String>(
                        segments: question.options
                            .map(
                              (option) => ButtonSegment<String>(
                                value: option,
                                label: Text(_optionLabel(option)),
                              ),
                            )
                            .toList(growable: false),
                        selected: <String>{_answers[question.id]!},
                        onSelectionChanged: _busy
                            ? null
                            : (selection) => setState(() {
                                  _answers[question.id] = selection.single;
                                  _resolution = null;
                                  _message = null;
                                }),
                        showSelectedIcon: false,
                      ),
                      const SizedBox(height: 12),
                    ],
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.date_range_outlined),
                      title: const Text('Mietzeitraum'),
                      subtitle: Text(
                        '${_displayDate(_range.start)} – ${_displayDate(_range.end)}',
                      ),
                      trailing: const Icon(Icons.edit_calendar_outlined),
                      onTap: _busy ? null : _pickDates,
                    ),
                    FilledButton.icon(
                      onPressed: _busy ? null : _resolve,
                      icon: _busy
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.fact_check_outlined),
                      label: const Text('Bestand und Preis prüfen'),
                    ),
                    if (_message != null) ...[
                      const SizedBox(height: 12),
                      _PlannerMessageCard(
                        message: _message!,
                        error: _messageIsError,
                      ),
                    ],
                    if (_resolution != null) ...[
                      const SizedBox(height: 12),
                      for (final variant in _resolution!.variants)
                        _PlannerVariantCard(
                          variant: variant,
                          busy: _busy,
                          cartEligible: _resolution!.cartEligible,
                          onAdd: () => _addToCart(variant),
                        ),
                    ],
                  ],
                ),
    );
  }
}

class _PlannerBoundaryCard extends StatelessWidget {
  const _PlannerBoundaryCard();

  @override
  Widget build(BuildContext context) => Card(
        color: Theme.of(context).colorScheme.tertiaryContainer,
        child: const Padding(
          padding: EdgeInsets.all(14),
          child: Text(
            'Geschlossener Pilot · deterministische Regeln · aktueller Serverbestand. Vorschläge reservieren nichts und lösen weder Vertrag noch Zahlung aus.',
          ),
        ),
      );
}

class _PlannerLoadFailure extends StatelessWidget {
  const _PlannerLoadFailure({required this.message, required this.onRetry});

  final String? message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                message ?? 'Der Planer ist derzeit nicht verfügbar.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: onRetry,
                child: const Text('Erneut laden'),
              ),
            ],
          ),
        ),
      );
}

class _PlannerMessageCard extends StatelessWidget {
  const _PlannerMessageCard({required this.message, required this.error});

  final String message;
  final bool error;

  @override
  Widget build(BuildContext context) => Card(
        color: error
            ? Theme.of(context).colorScheme.errorContainer
            : Theme.of(context).colorScheme.primaryContainer,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(message),
        ),
      );
}

class _PlannerVariantCard extends StatelessWidget {
  const _PlannerVariantCard({
    required this.variant,
    required this.busy,
    required this.cartEligible,
    required this.onAdd,
  });

  final PlannerVariant variant;
  final bool busy;
  final bool cartEligible;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                variant.label,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              Text(variant.rankingBasis),
              if (variant.available) ...[
                const SizedBox(height: 8),
                for (final selection in variant.selections)
                  Text(
                      '• ${selection.title} · ${_money(selection.totalMinor)}'),
                const SizedBox(height: 8),
                Text('Informative Summe: ${_money(variant.totalMinor!)}'),
                const SizedBox(height: 8),
                FilledButton.tonalIcon(
                  onPressed: busy || !cartEligible ? null : onAdd,
                  icon: const Icon(Icons.add_shopping_cart_outlined),
                  label: const Text('Als Projekt in den Mietkorb'),
                ),
              ] else ...[
                const SizedBox(height: 8),
                const Text('Für den aktuellen Serverbestand nicht verfügbar.'),
              ],
            ],
          ),
        ),
      );
}

String _date(DateTime value) => DateTime(value.year, value.month, value.day)
    .toIso8601String()
    .substring(0, 10);

String _displayDate(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}.${value.year}';

String _money(int minor) =>
    '${(minor / 100).toStringAsFixed(2).replaceAll('.', ',')} EUR';

String _optionLabel(String option) =>
    const <String, String>{
      'stone': 'Stein',
      'wood': 'Holz',
      'composite': 'Verbundstoff',
      'small': 'Klein',
      'medium': 'Mittel',
      'large': 'Groß',
      'available': 'Vorhanden',
      'unavailable': 'Nicht vorhanden',
      'drill': 'Bohren',
      'sand': 'Schleifen',
      'saw': 'Sägen',
      'assemble': 'Montieren',
      'masonry': 'Mauerwerk',
      'mixed': 'Gemischt',
      'indoor': 'Innen',
      'outdoor': 'Außen',
      'beginner': 'Einsteiger',
      'experienced': 'Erfahren',
      'mow': 'Mähen',
      'trim': 'Schneiden',
      'water': 'Bewässern',
      'plant': 'Pflanzen',
      'level': 'Eben',
      'sloped': 'Hanglage',
      'dry': 'Trocken',
      'damp': 'Feucht',
      'unknown': 'Unklar',
      'none': 'Keine',
      'some': 'Einige',
      'many': 'Viele',
      'yes': 'Ja',
      'no': 'Nein',
      'event': 'Event',
      'camping': 'Camping',
      'few': 'Wenige',
      'group': 'Gruppe',
      'large_group': 'Große Gruppe',
    }[option] ??
    option;
