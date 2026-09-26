import 'dart:async';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:lendify/config/listing_sets_technical_config.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/listing_set.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/listing_sets_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

class ClosedPilotListingSetsScreen extends StatefulWidget {
  const ClosedPilotListingSetsScreen({
    super.key,
    required this.initialContext,
    required this.ownerListings,
    this.gateway = const BackendListingSetsGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.enableForTesting = false,
  });

  final ListingMutationContext initialContext;
  final List<Item> ownerListings;
  final ListingSetsGateway gateway;
  final ListingMutationService listingMutationService;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<ClosedPilotListingSetsScreen> createState() =>
      _ClosedPilotListingSetsScreenState();
}

class _ClosedPilotListingSetsScreenState
    extends State<ClosedPilotListingSetsScreen> {
  final TextEditingController _title = TextEditingController();
  final Set<String> _selectedIds = <String>{};
  StreamSubscription<String>? _sessionSubscription;
  late ListingMutationContext? _context;
  List<ListingSetOwnerView> _sets = const <ListingSetOwnerView>[];
  bool _loading = true;
  bool _busy = false;
  String? _pendingEndId;
  String? _message;
  bool _messageIsError = false;
  int _revision = 0;

  bool get _available =>
      ListingSetsTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  List<Item> get _eligibleListings => widget.ownerListings
      .where(
        (item) =>
            item.ownerId == widget.initialContext.user.id &&
            item.status == 'active',
      )
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    _context = widget.initialContext;
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _revision += 1;
      if (!mounted) return;
      setState(() {
        _context = null;
        _sets = const <ListingSetOwnerView>[];
        _selectedIds.clear();
        _pendingEndId = null;
        _busy = false;
        _loading = false;
        _message =
            'Das angemeldete Konto hat sich geändert. Dieser alte Kontokontext wurde geschlossen.';
        _messageIsError = true;
      });
    });
    unawaited(_loadSets());
  }

  @override
  void dispose() {
    _revision += 1;
    _sessionSubscription?.cancel();
    _title.dispose();
    super.dispose();
  }

  Future<void> _loadSets() async {
    final context = _context;
    final revision = ++_revision;
    if (!_available || context == null) {
      if (mounted && revision == _revision) setState(() => _loading = false);
      return;
    }
    if (mounted) {
      setState(() {
        _loading = true;
        _message = null;
      });
    }
    try {
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision) {
        return;
      }
      final sets = await widget.gateway.loadOwnerSets(context.owner.authOwner);
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision ||
          !mounted) {
        return;
      }
      setState(() {
        _sets = sets;
        _loading = false;
      });
    } catch (_) {
      if (!mounted ||
          revision != _revision ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        _sets = const <ListingSetOwnerView>[];
        _loading = false;
        _message =
            'Die serverbestätigten Artikel-Sets konnten nicht sicher geladen werden.';
        _messageIsError = true;
      });
    }
  }

  Future<void> _create() async {
    final context = _context;
    final title = _title.text.trim();
    if (_busy ||
        context == null ||
        title.length < 3 ||
        _selectedIds.length < 2) {
      return;
    }
    final revision = ++_revision;
    final selection = _eligibleListings
        .where((item) => _selectedIds.contains(item.id))
        .map((item) => item.id)
        .toList(growable: false);
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      if (selection.length != _selectedIds.length ||
          !await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision) {
        return;
      }
      final created = await widget.gateway.create(
        owner: context.owner.authOwner,
        title: title,
        kind: ListingSetKind.sitSet,
        listingIds: selection,
      );
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision ||
          !mounted) {
        return;
      }
      setState(() {
        _sets = <ListingSetOwnerView>[
          created,
          ..._sets.where((entry) => entry.id != created.id),
        ];
        _title.clear();
        _selectedIds.clear();
        _message =
            'Artikel-Set serverbestätigt erstellt. Alle Artikel bleiben einzeln buchbar; es wurde keine Reservierung und keine Zahlung erzeugt.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!mounted ||
          revision != _revision ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        _message =
            'Das Ergebnis der Set-Erstellung ist nicht sicher bestätigt. Bitte den Serverstand neu laden, bevor du erneut erstellst.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && revision == _revision) setState(() => _busy = false);
    }
  }

  Future<void> _endSet(ListingSetOwnerView set) async {
    final context = _context;
    if (_busy || context == null || _pendingEndId != set.id) return;
    final revision = ++_revision;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision) {
        return;
      }
      final ended = await widget.gateway.end(
        owner: context.owner.authOwner,
        set: set,
      );
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision ||
          !mounted) {
        return;
      }
      setState(() {
        _sets = _sets
            .map((entry) => entry.id == ended.id ? ended : entry)
            .toList(growable: false);
        _pendingEndId = null;
        _message = 'Das Artikel-Set wurde serverbestätigt beendet.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!mounted ||
          revision != _revision ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        _pendingEndId = null;
        _message =
            'Das Ergebnis des Beendens ist nicht sicher bestätigt. Bitte den Serverstand neu laden, bevor du wiederholst.';
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
        appBar: AppBar(title: const Text('SIT Artikel-Sets')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Artikel-Sets sind nur im geschlossenen Pilot verfügbar.',
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('SIT Artikel-Sets'),
        actions: [
          IconButton(
            tooltip: 'Serverstand neu laden',
            onPressed: _busy || _context == null ? null : _loadSets,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                Card(
                  color: Theme.of(context).colorScheme.tertiaryContainer,
                  child: const Padding(
                    padding: EdgeInsets.all(14),
                    child: Text(
                      'Geschlossener Pilot · nur eigene Anzeigen. Ein Set erzeugt keinen Set-Rabatt, keine Reservierung, keinen Vertrag und keine Zahlung.',
                    ),
                  ),
                ),
                if (_message != null) ...[
                  const SizedBox(height: 8),
                  Card(
                    color: _messageIsError
                        ? Theme.of(context).colorScheme.errorContainer
                        : Theme.of(context).colorScheme.primaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(_message!),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                Text(
                  'Neues SIT Set',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _title,
                  enabled: !_busy && _context != null,
                  maxLength: 120,
                  decoration: const InputDecoration(
                    labelText: 'Set-Name',
                    hintText: 'z. B. Werkstatt-Set',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                if (_eligibleListings.length < 2)
                  const Text(
                    'Für ein Set werden mindestens zwei aktive eigene Anzeigen benötigt.',
                  )
                else
                  for (final item in _eligibleListings)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _selectedIds.contains(item.id),
                      title: Text(item.title),
                      subtitle: const Text('Erforderlicher Einzelartikel'),
                      onChanged: _busy
                          ? null
                          : (selected) => setState(() {
                                if (selected == true) {
                                  _selectedIds.add(item.id);
                                } else {
                                  _selectedIds.remove(item.id);
                                }
                              }),
                    ),
                FilledButton.icon(
                  onPressed: !_busy &&
                          _context != null &&
                          _title.text.trim().length >= 3 &&
                          _selectedIds.length >= 2
                      ? _create
                      : null,
                  icon: _busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.playlist_add_outlined),
                  label: const Text('Set serverseitig erstellen'),
                ),
                const SizedBox(height: 20),
                Text(
                  'Bestehende Sets',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                if (_sets.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child:
                        Text('Serverbestätigt sind noch keine Sets vorhanden.'),
                  )
                else
                  for (final set in _sets)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              set.title,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            Text(
                              '${set.members.length} Artikel · Status: ${_status(set.status)}',
                            ),
                            for (final member in set.members)
                              Text('• ${member.title}'),
                            if (set.status != 'ended') ...[
                              const SizedBox(height: 8),
                              if (_pendingEndId == set.id)
                                Row(
                                  children: [
                                    Expanded(
                                      child: TextButton(
                                        onPressed: _busy
                                            ? null
                                            : () => setState(
                                                  () => _pendingEndId = null,
                                                ),
                                        child: const Text('Abbrechen'),
                                      ),
                                    ),
                                    Expanded(
                                      child: FilledButton(
                                        onPressed:
                                            _busy ? null : () => _endSet(set),
                                        child: const Text('Jetzt beenden'),
                                      ),
                                    ),
                                  ],
                                )
                              else
                                TextButton.icon(
                                  onPressed: _busy
                                      ? null
                                      : () => setState(
                                            () => _pendingEndId = set.id,
                                          ),
                                  icon: const Icon(Icons.stop_circle_outlined),
                                  label: const Text('Set beenden'),
                                ),
                            ],
                          ],
                        ),
                      ),
                    ),
              ],
            ),
    );
  }
}

String _status(String value) => switch (value) {
      'active' => 'Aktiv',
      'paused' => 'Pausiert',
      'ended' => 'Beendet',
      _ => value,
    };
