import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/models/mission_supply_demand.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/mission_supply_demand_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

typedef MissionSupplyDemandKeyFactory = String Function();
typedef MissionSupplyDemandClock = DateTime Function();
typedef MissionSupplyDemandExpiryPicker = Future<DateTime?> Function(
  BuildContext context,
  DateTime now,
  DateTime maximum,
);

@visibleForTesting
String newMissionSupplyDemandKey() {
  final random = Random.secure();
  return 'mission-demand-${List<int>.generate(16, (_) => random.nextInt(256)).map((value) => value.toRadixString(16).padLeft(2, '0')).join()}';
}

Future<DateTime?> _defaultExpiryPicker(
  BuildContext context,
  DateTime now,
  DateTime maximum,
) async {
  final first = DateUtils.dateOnly(now.toLocal());
  final last = DateUtils.dateOnly(maximum.toLocal());
  if (last.isBefore(first)) return null;
  final date = await showDatePicker(
    context: context,
    firstDate: first,
    lastDate: last,
    initialDate: first,
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime:
        TimeOfDay.fromDateTime(now.toLocal().add(const Duration(hours: 1))),
  );
  if (time == null) return null;
  return DateTime(date.year, date.month, date.day, time.hour, time.minute)
      .toUtc();
}

class MissionSupplyDemandScreen extends StatefulWidget {
  const MissionSupplyDemandScreen({
    super.key,
    this.createContext,
    this.gateway = const BackendMissionSupplyDemandGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.idempotencyKeyFactory = newMissionSupplyDemandKey,
    this.clock = DateTime.now,
    this.expiryPicker = _defaultExpiryPicker,
    this.enableForTesting = false,
  });

  final MissionSupplyDemandCreateContext? createContext;
  final MissionSupplyDemandGateway gateway;
  final ListingMutationService listingMutationService;
  final MissionSupplyDemandKeyFactory idempotencyKeyFactory;
  final MissionSupplyDemandClock clock;
  final MissionSupplyDemandExpiryPicker expiryPicker;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<MissionSupplyDemandScreen> createState() =>
      _MissionSupplyDemandScreenState();
}

class _MissionSupplyDemandScreenState extends State<MissionSupplyDemandScreen> {
  StreamSubscription<String>? _sessionSubscription;
  ListingMutationContext? _context;
  List<MissionSupplyDemand> _demands = const <MissionSupplyDemand>[];
  DateTime? _expiry;
  bool _loading = true;
  bool _loadActive = false;
  bool _actionActive = false;
  int _generation = 0;
  String? _message;
  bool _messageIsError = false;
  final Map<String, String> _pendingKeys = <String, String>{};

  bool get _available =>
      PlannerTechnicalConfig.demandAvailable ||
      (!kReleaseMode && widget.enableForTesting);

  bool get _busy => _loading || _loadActive || _actionActive;

  @override
  void initState() {
    super.initState();
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _generation += 1;
      _clearPrincipalState();
      if (mounted) setState(() {});
      unawaited(_load());
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    _generation += 1;
    _sessionSubscription?.cancel();
    super.dispose();
  }

  void _clearPrincipalState() {
    _context = null;
    _demands = const <MissionSupplyDemand>[];
    _expiry = null;
    _loading = true;
    _loadActive = false;
    _actionActive = false;
    _message = null;
    _messageIsError = false;
    _pendingKeys.clear();
  }

  Future<bool> _mayUpdate(
      ListingMutationContext context, int generation) async {
    if (!mounted || generation != _generation) return false;
    final current =
        await widget.listingMutationService.isContextCurrent(context);
    return current && mounted && generation == _generation;
  }

  Future<void> _load() async {
    if (_loadActive) return;
    final generation = _generation;
    _loadActive = true;
    if (mounted) setState(() => _loading = true);
    ListingMutationContext? captured;
    try {
      if (!_available) return;
      captured = await widget.listingMutationService.loadCurrentContext();
      if (captured == null || generation != _generation) {
        throw StateError('mission_supply_authentication_required');
      }
      if (!await _mayUpdate(captured, generation)) return;
      final demands = await widget.gateway.list(captured.owner.authOwner);
      if (!await _mayUpdate(captured, generation)) return;
      setState(() {
        _context = captured;
        _demands = demands;
        _loading = false;
        _message = null;
      });
    } catch (_) {
      if (captured != null && !await _mayUpdate(captured, generation)) return;
      if (!mounted || generation != _generation) return;
      setState(() {
        _context = null;
        _demands = const <MissionSupplyDemand>[];
        _loading = false;
        _message =
            'Private Bedarfsanfragen konnten nicht sicher geladen werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loadActive = false);
      }
    }
  }

  String _keyFor(String fingerprint) => _pendingKeys.putIfAbsent(
        fingerprint,
        widget.idempotencyKeyFactory,
      );

  Future<void> _chooseExpiry() async {
    final create = widget.createContext;
    final captured = _context;
    if (_busy || create == null || captured == null) return;
    final generation = _generation;
    final now = widget.clock().toUtc();
    final end = create.periodEnd.toUtc();
    final maximum = DateTime.utc(end.year, end.month, end.day, 23, 59, 59, 999);
    final chosen = await widget.expiryPicker(context, now, maximum);
    if (chosen == null || !await _mayUpdate(captured, generation)) return;
    final normalized = chosen.toUtc();
    if (!normalized.isAfter(now) || normalized.isAfter(maximum)) {
      setState(() {
        _message =
            'Der Ablauf muss in der Zukunft und spätestens am Missionsende liegen.';
        _messageIsError = true;
      });
      return;
    }
    setState(() {
      _expiry = normalized;
      _message = null;
    });
  }

  Future<void> _create() async {
    final context = _context;
    final create = widget.createContext;
    final expiry = _expiry;
    if (_actionActive || context == null || create == null || expiry == null) {
      return;
    }
    final generation = _generation;
    final request = <String, dynamic>{
      'operation': 'create',
      'resolutionId': create.resolutionId,
      'resolutionRevision': create.resolutionRevision,
      'slotKey': create.slotKey,
      'purpose': missionSupplyDemandPurpose,
      'expiresAt': expiry.toIso8601String(),
    };
    final fingerprint = jsonEncode(request);
    final key = _keyFor(fingerprint);
    setState(() {
      _actionActive = true;
      _message = null;
    });
    try {
      if (!await _mayUpdate(context, generation)) return;
      await widget.gateway.create(
        owner: context.owner.authOwner,
        context: create,
        expiresAt: expiry,
        idempotencyKey: key,
      );
      if (!await _mayUpdate(context, generation)) return;
      final demands = await widget.gateway.list(context.owner.authOwner);
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _demands = demands;
        _pendingKeys.remove(fingerprint);
        _message = 'Private Anfrage wurde serverseitig gespeichert.';
        _messageIsError = false;
      });
    } catch (error) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message = error is BackendException && error.statusCode == 409
            ? 'Konflikt mit dem Serverstand. Eingaben und Wiederholungsschlüssel bleiben erhalten; bitte aktualisieren.'
            : 'Ausgang unklar. Nicht blind neu anlegen: derselbe Auftrag kann sicher erneut gesendet werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _actionActive = false);
      }
    }
  }

  Future<void> _respond(
    MissionSupplyDemand demand,
    MissionSupplyDemandDecision decision,
  ) async {
    final context = _context;
    if (_actionActive || context == null || !demand.mayRespond) return;
    final generation = _generation;
    final request = <String, dynamic>{
      'operation': 'respond',
      'demandId': demand.demandId,
      'expectedRevision': demand.revision,
      'decision': decision.name,
    };
    final fingerprint = jsonEncode(request);
    final key = _keyFor(fingerprint);
    setState(() {
      _actionActive = true;
      _message = null;
    });
    try {
      if (!await _mayUpdate(context, generation)) return;
      await widget.gateway.respond(
        owner: context.owner.authOwner,
        demand: demand,
        decision: decision,
        idempotencyKey: key,
      );
      if (!await _mayUpdate(context, generation)) return;
      final demands = await widget.gateway.list(context.owner.authOwner);
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _demands = demands;
        _pendingKeys.remove(fingerprint);
        _message = decision == MissionSupplyDemandDecision.release
            ? 'Privater Zugriff wurde unverbindlich freigegeben.'
            : 'Anfrage wurde abgelehnt.';
        _messageIsError = false;
      });
    } catch (error) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message = error is BackendException && error.statusCode == 409
            ? 'Serverkonflikt. Entscheidung und Wiederholungsschlüssel bleiben erhalten; bitte aktualisieren.'
            : 'Ausgang unklar. Dieselbe Entscheidung kann sicher erneut gesendet werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _actionActive = false);
      }
    }
  }

  Future<void> _revoke(MissionSupplyDemand demand) async {
    final context = _context;
    if (_actionActive || context == null || !demand.mayRevoke) return;
    final generation = _generation;
    final request = <String, dynamic>{
      'operation': 'revoke',
      'demandId': demand.demandId,
      'expectedRevision': demand.revision,
    };
    final fingerprint = jsonEncode(request);
    final key = _keyFor(fingerprint);
    setState(() {
      _actionActive = true;
      _message = null;
    });
    try {
      if (!await _mayUpdate(context, generation)) return;
      await widget.gateway.revoke(
        owner: context.owner.authOwner,
        demand: demand,
        idempotencyKey: key,
      );
      if (!await _mayUpdate(context, generation)) return;
      final demands = await widget.gateway.list(context.owner.authOwner);
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _demands = demands;
        _pendingKeys.remove(fingerprint);
        _message = 'Private Freigabe wurde widerrufen.';
        _messageIsError = false;
      });
    } catch (error) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message = error is BackendException && error.statusCode == 409
            ? 'Serverkonflikt. Widerruf bleibt erhalten; bitte aktualisieren.'
            : 'Ausgang unklar. Derselbe Widerruf kann sicher erneut gesendet werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _actionActive = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Private Bedarfsanfragen')),
      body: !_available
          ? const Center(
              child: Text('Nur im freigegebenen internen Pilot verfügbar.'))
          : _loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: <Widget>[
                      const Card(
                        child: ListTile(
                          leading: Icon(Icons.lock_outline),
                          title: Text('Privat und unverbindlich'),
                          subtitle: Text(
                            'Keine öffentliche Anzeige, Benachrichtigung, Reservierung, Buchung, kein Vertrag und keine Zahlung.',
                          ),
                        ),
                      ),
                      if (_message != null) ...<Widget>[
                        const SizedBox(height: 8),
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            _message!,
                            key: const Key('mission-demand-message'),
                            style: TextStyle(
                              color: _messageIsError
                                  ? Theme.of(context).colorScheme.error
                                  : Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        key: const Key('mission-demand-refresh'),
                        onPressed: _busy ? null : _load,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Serverstand aktualisieren'),
                      ),
                      if (widget.createContext case final create?) ...<Widget>[
                        const SizedBox(height: 16),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: <Widget>[
                                Text('Offene Lücke',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium),
                                Text(
                                  '${create.necessity == 'required' ? 'Erforderlich' : 'Optional'} · ${create.needKey} · Menge 1',
                                ),
                                const SizedBox(height: 12),
                                OutlinedButton.icon(
                                  key: const Key('mission-demand-expiry'),
                                  onPressed: _busy ? null : _chooseExpiry,
                                  icon: const Icon(Icons.schedule),
                                  label: Text(_expiry == null
                                      ? 'Ablauf ausdrücklich wählen'
                                      : 'Ablauf: ${_dateTime(_expiry!)}'),
                                ),
                                const SizedBox(height: 8),
                                FilledButton.icon(
                                  key: const Key('mission-demand-create'),
                                  onPressed:
                                      _busy || _expiry == null ? null : _create,
                                  icon: const Icon(Icons.send_outlined),
                                  label: const Text('Private Anfrage senden'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Text('Meine Beteiligungen',
                          style: Theme.of(context).textTheme.titleMedium),
                      if (_demands.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child:
                              Text('Keine privaten Bedarfsanfragen vorhanden.'),
                        )
                      else
                        ..._demands.map(_buildDemand),
                    ],
                  ),
                ),
    );
  }

  Widget _buildDemand(MissionSupplyDemand demand) {
    final recipient = demand.role == MissionSupplyDemandRole.recipient;
    return Card(
      key: ValueKey(demand.demandId),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(recipient ? 'An dich gerichtet' : 'Von dir angefragt'),
            Text(
              '${demand.necessity == 'required' ? 'Erforderlich' : 'Optional'} · ${demand.needKey} · Menge ${demand.quantity}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(
                '${_date(demand.startDate)} bis ${_date(demand.endDate)} · Radius ${demand.radiusKm} km'),
            Text(
                'Status: ${_status(demand.status)} · Ablauf ${_dateTime(demand.expiresAt)}'),
            if (demand.mayRespond) ...<Widget>[
              const SizedBox(height: 8),
              Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton(
                      key: ValueKey('mission-demand-reject-${demand.demandId}'),
                      onPressed: _busy
                          ? null
                          : () => _respond(
                              demand, MissionSupplyDemandDecision.reject),
                      child: const Text('Ablehnen'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      key:
                          ValueKey('mission-demand-release-${demand.demandId}'),
                      onPressed: _busy
                          ? null
                          : () => _respond(
                              demand, MissionSupplyDemandDecision.release),
                      child: const Text('Privat freigeben'),
                    ),
                  ),
                ],
              ),
            ],
            if (demand.mayRevoke) ...<Widget>[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: ValueKey('mission-demand-revoke-${demand.demandId}'),
                onPressed: _busy ? null : () => _revoke(demand),
                icon: const Icon(Icons.lock_reset),
                label: const Text('Private Freigabe widerrufen'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String _date(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}.${value.year}';

String _dateTime(DateTime value) {
  final local = value.toLocal();
  return '${_date(local)} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

String _status(MissionSupplyDemandStatus value) => switch (value) {
      MissionSupplyDemandStatus.pending => 'Offen',
      MissionSupplyDemandStatus.rejected => 'Abgelehnt',
      MissionSupplyDemandStatus.released => 'Privat freigegeben',
      MissionSupplyDemandStatus.revoked => 'Widerrufen',
      MissionSupplyDemandStatus.expiredNoResponse => 'Ohne Antwort abgelaufen',
    };
