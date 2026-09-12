import 'dart:async';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:lendify/config/listing_sets_technical_config.dart';
import 'package:lendify/models/listing_set.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/listing_sets_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

class ClosedPilotListingSetDiscoveryScreen extends StatefulWidget {
  const ClosedPilotListingSetDiscoveryScreen({
    super.key,
    required this.listingId,
    required this.listingTitle,
    required this.startDate,
    required this.endDate,
    this.gateway = const BackendListingSetsGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.enableForTesting = false,
  });

  final String listingId;
  final String listingTitle;
  final DateTime startDate;
  final DateTime endDate;
  final ListingSetsGateway gateway;
  final ListingMutationService listingMutationService;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<ClosedPilotListingSetDiscoveryScreen> createState() =>
      _ClosedPilotListingSetDiscoveryScreenState();
}

class _ClosedPilotListingSetDiscoveryScreenState
    extends State<ClosedPilotListingSetDiscoveryScreen> {
  StreamSubscription<String>? _sessionSubscription;
  ListingMutationContext? _context;
  ListingSetDiscovery? _discovery;
  bool _loading = true;
  String? _error;
  int _revision = 0;

  bool get _available =>
      ListingSetsTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  @override
  void initState() {
    super.initState();
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _revision += 1;
      if (!mounted) return;
      setState(() {
        _context = null;
        _discovery = null;
        _loading = false;
        _error =
            'Das angemeldete Konto hat sich geändert. Das alte Suchergebnis wurde verworfen.';
      });
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
    setState(() {
      _loading = true;
      _error = null;
      _discovery = null;
    });
    try {
      final context = await widget.listingMutationService.loadCurrentContext();
      if (context == null || revision != _revision) return;
      final discovery = await widget.gateway.discover(
        owner: context.owner.authOwner,
        listingId: widget.listingId,
        startDate: widget.startDate,
        endDate: widget.endDate,
      );
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          revision != _revision ||
          !mounted) {
        return;
      }
      setState(() {
        _context = context;
        _discovery = discovery;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || revision != _revision) return;
      setState(() {
        _context = null;
        _discovery = null;
        _loading = false;
        _error =
            'Artikel-Sets konnten nicht serverbestätigt geladen werden. Ein Fehler wird nicht als leeres Ergebnis behandelt.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_available) {
      return Scaffold(
        appBar: AppBar(title: const Text('SIT Sets')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text('SIT Sets sind nur im geschlossenen Pilot verfügbar.'),
          ),
        ),
      );
    }
    final discovery = _discovery;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Passende SIT Sets'),
        actions: [
          IconButton(
            tooltip: 'Serverstand neu laden',
            onPressed: _loading ? null : _load,
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
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(
                      'Ausgangspunkt: ${widget.listingTitle}. Nur aktuell verfügbare Sets werden angezeigt. Preise sind Vorschauen; alle Artikel bleiben einzeln buchbar.',
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Card(
                    color: Theme.of(context).colorScheme.errorContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(_error!),
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: _load,
                    child: const Text('Erneut laden'),
                  ),
                ] else if (_context != null &&
                    discovery != null &&
                    discovery.sets.isEmpty) ...[
                  const SizedBox(height: 16),
                  const Text(
                    'Der Server hat für diesen Zeitraum keine passenden verfügbaren Sets bestätigt.',
                  ),
                ] else if (discovery != null)
                  for (final set in discovery.sets) ...[
                    const SizedBox(height: 10),
                    _DiscoveredSetCard(set: set),
                  ],
              ],
            ),
    );
  }
}

class _DiscoveredSetCard extends StatelessWidget {
  const _DiscoveredSetCard({required this.set});

  final ListingSetResolution set;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                set.title,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              Text(
                '${set.handoverCount} Übergabe${set.handoverCount == 1 ? '' : 'n'} · ${set.items.length} Artikel',
              ),
              const SizedBox(height: 8),
              for (final item in set.items)
                Text('• ${item.title} · ${_money(item.quote.totalMinor)}'),
              const SizedBox(height: 8),
              Text('Informative Summe: ${_money(set.totalMinor)}'),
              const SizedBox(height: 4),
              const Text(
                'Vor einer Anfrage werden alle Einzelartikel erneut geprüft.',
              ),
            ],
          ),
        ),
      );
}

String _money(int minor) =>
    '${(minor / 100).toStringAsFixed(2).replaceAll('.', ',')} EUR';
