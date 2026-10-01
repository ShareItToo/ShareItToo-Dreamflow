import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/models/mission_need.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/mission_need_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

typedef MissionNeedIdempotencyKeyFactory = String Function();

@visibleForTesting
String newMissionNeedIdempotencyKey() {
  final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  return 'mission-${bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join()}';
}

class MissionNeedsScreen extends StatefulWidget {
  const MissionNeedsScreen({
    super.key,
    this.gateway = const BackendMissionNeedGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.idempotencyKeyFactory = newMissionNeedIdempotencyKey,
    this.enableForTesting = false,
  });

  final MissionNeedGateway gateway;
  final ListingMutationService listingMutationService;
  final MissionNeedIdempotencyKeyFactory idempotencyKeyFactory;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<MissionNeedsScreen> createState() => _MissionNeedsScreenState();
}

class _MissionNeedsScreenState extends State<MissionNeedsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final List<_MissionNeedDraft> _needDrafts = <_MissionNeedDraft>[];
  StreamSubscription<String>? _sessionSubscription;
  ListingMutationContext? _context;
  List<MissionNeed> _missions = const <MissionNeed>[];
  MissionNeed? _selected;
  MissionNeedStatus _status = MissionNeedStatus.draft;
  bool _loading = true;
  bool _busy = false;
  int _accountGeneration = 0;
  String? _message;
  bool _messageIsError = false;
  String? _pendingRequestFingerprint;
  String? _pendingIdempotencyKey;

  bool get _available =>
      PlannerTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  @override
  void initState() {
    super.initState();
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _accountGeneration += 1;
      if (mounted) {
        setState(() {
          _context = null;
          _missions = const <MissionNeed>[];
          _clearEditor();
          _loading = true;
          _busy = false;
          _message = null;
        });
      }
      unawaited(_load());
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    _accountGeneration += 1;
    _sessionSubscription?.cancel();
    _titleController.dispose();
    _disposeNeedDrafts();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = _accountGeneration;
    if (!_available) {
      if (mounted && generation == _accountGeneration) {
        setState(() => _loading = false);
      }
      return;
    }
    try {
      final context = await widget.listingMutationService.loadCurrentContext();
      if (context == null || generation != _accountGeneration) {
        throw StateError('mission_need_authentication_required');
      }
      final missions = await widget.gateway.list(context.owner.authOwner);
      if (!mounted ||
          generation != _accountGeneration ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        _context = context;
        _missions = missions;
        _loading = false;
        _message = null;
      });
    } catch (_) {
      if (!mounted || generation != _accountGeneration) return;
      setState(() {
        _context = null;
        _missions = const <MissionNeed>[];
        _clearEditor();
        _loading = false;
        _message =
            'Deine Missionen konnten für das aktuell angemeldete Konto nicht sicher geladen werden.';
        _messageIsError = true;
      });
    }
  }

  void _clearEditor() {
    _selected = null;
    _titleController.clear();
    _status = MissionNeedStatus.draft;
    _disposeNeedDrafts();
    _pendingRequestFingerprint = null;
    _pendingIdempotencyKey = null;
  }

  void _disposeNeedDrafts() {
    for (final draft in _needDrafts) {
      draft.dispose();
    }
    _needDrafts.clear();
  }

  void _startNew() {
    setState(() {
      _clearEditor();
      _needDrafts.add(_MissionNeedDraft());
      _message = null;
      _messageIsError = false;
    });
  }

  Future<void> _openMission(MissionNeed summary) async {
    final context = _context;
    if (_busy || context == null) return;
    final generation = _accountGeneration;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final mission = await widget.gateway.load(
        owner: context.owner.authOwner,
        missionNeedId: summary.missionNeedId,
      );
      if (!mounted ||
          generation != _accountGeneration ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        _applyServerMission(mission);
        _message = 'Serverstand Revision ${mission.revision} geladen.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message =
            'Die Mission konnte nicht sicher vom Server geladen werden. Die Liste bleibt unverändert.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _busy = false);
      }
    }
  }

  void _applyServerMission(MissionNeed mission) {
    _selected = mission;
    _titleController.text = mission.payload.title;
    _status = mission.payload.status;
    _disposeNeedDrafts();
    _needDrafts.addAll(
      mission.payload.needs.map(
        (need) => _MissionNeedDraft(
          needKey: need.needKey,
          necessity: need.necessity,
          quantity: need.quantity,
        ),
      ),
    );
    _pendingRequestFingerprint = null;
    _pendingIdempotencyKey = null;
  }

  void _addNeed() {
    if (_needDrafts.length >= 50) return;
    setState(() => _needDrafts.add(_MissionNeedDraft()));
  }

  void _removeNeed(int index) {
    if (_needDrafts.length <= 1) return;
    setState(() => _needDrafts.removeAt(index).dispose());
  }

  MissionNeedPayload? _validatedPayload() {
    if (!(_formKey.currentState?.validate() ?? false)) return null;
    final needs = <MissionNeedItem>[];
    for (final draft in _needDrafts) {
      needs.add(
        MissionNeedItem(
          needKey: draft.needKeyController.text.trim(),
          necessity: draft.necessity,
          quantity: int.parse(draft.quantityController.text.trim()),
        ),
      );
    }
    if (needs.map((need) => need.needKey).toSet().length != needs.length) {
      setState(() {
        _message = 'Jeder Bedarfspunkt braucht einen eindeutigen Schlüssel.';
        _messageIsError = true;
      });
      return null;
    }
    return MissionNeedPayload(
      title: _titleController.text.trim(),
      status: _status,
      needs: needs,
    );
  }

  String _idempotencyKeyFor(
    MissionNeedPayload payload,
    MissionNeed? selected,
  ) {
    final fingerprint = jsonEncode(<String, dynamic>{
      'operation': selected == null ? 'create' : 'correct',
      if (selected != null) 'missionNeedId': selected.missionNeedId,
      if (selected != null) 'expectedRevision': selected.revision,
      'payload': payload.toJson(),
    });
    if (_pendingRequestFingerprint != fingerprint ||
        _pendingIdempotencyKey == null) {
      _pendingRequestFingerprint = fingerprint;
      _pendingIdempotencyKey = widget.idempotencyKeyFactory();
    }
    return _pendingIdempotencyKey!;
  }

  Future<void> _save() async {
    final context = _context;
    if (_busy || context == null || _needDrafts.isEmpty) return;
    final payload = _validatedPayload();
    if (payload == null) return;
    final generation = _accountGeneration;
    final selected = _selected;
    final idempotencyKey = _idempotencyKeyFor(payload, selected);
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          generation != _accountGeneration) {
        return;
      }
      final result = selected == null
          ? await widget.gateway.create(
              owner: context.owner.authOwner,
              payload: payload,
              idempotencyKey: idempotencyKey,
            )
          : await widget.gateway.correct(
              owner: context.owner.authOwner,
              missionNeedId: selected.missionNeedId,
              expectedRevision: selected.revision,
              payload: payload,
              idempotencyKey: idempotencyKey,
            );
      if (!mounted ||
          generation != _accountGeneration ||
          !await widget.listingMutationService.isContextCurrent(context)) {
        return;
      }
      setState(() {
        final mission = result.missionNeed;
        _missions = <MissionNeed>[
          mission,
          ..._missions.where(
            (item) => item.missionNeedId != mission.missionNeedId,
          ),
        ];
        _applyServerMission(mission);
        _message = result.replayed
            ? 'Der bereits bestätigte Serverstand Revision ${mission.revision} wurde geladen.'
            : selected == null
                ? 'Mission serverseitig als Revision ${mission.revision} angelegt.'
                : 'Korrektur serverseitig als Revision ${mission.revision} gespeichert.';
        _messageIsError = false;
      });
    } on BackendException catch (error) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message = _backendErrorMessage(error);
        _messageIsError = true;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message =
            'Speichern nicht bestätigt. Deine Eingaben bleiben erhalten; es wird keine Reservierung, Buchung oder Zahlung angenommen.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _busy = false);
      }
    }
  }

  Future<bool> _mayUpdate(
    ListingMutationContext context,
    int generation,
  ) async =>
      mounted &&
      generation == _accountGeneration &&
      await widget.listingMutationService.isContextCurrent(context);

  String _backendErrorMessage(BackendException error) {
    if (error.statusCode == 409 &&
        error.code == 'mission_need_revision_conflict') {
      final details = error.details;
      final actual = details is Map ? details['actualRevision'] : null;
      return 'Die Mission wurde inzwischen auf dem Server geändert${actual is int ? ' (Revision $actual)' : ''}. Deine Eingaben bleiben erhalten. Lade den aktuellen Serverstand, bevor du erneut speicherst.';
    }
    if (error.statusCode == 409 &&
        error.code == 'mission_need_idempotency_key_reused') {
      return 'Die Wiederholungskennung passt nicht zu dieser Anfrage. Deine Eingaben bleiben erhalten; ändere einen Wert oder lade den Serverstand neu.';
    }
    return 'Speichern nicht bestätigt (${error.code}). Deine Eingaben bleiben erhalten.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Meine Missionen')),
      body: SafeArea(
        child: !_available
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Missionen sind nur im freigegebenen internen Pilot verfügbar.',
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            : _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: <Widget>[
                        Semantics(
                          container: true,
                          label:
                              'Unverbindlich. Keine Reservierung, Buchung oder Zahlung.',
                          child: const Card(
                            child: ListTile(
                              leading: Icon(Icons.info_outline),
                              title: Text('Unverbindlicher Missionsbedarf'),
                              subtitle: Text(
                                'Entwurf oder Planung – keine Reservierung, Buchung, kein Vertrag und keine Zahlung.',
                              ),
                            ),
                          ),
                        ),
                        if (_message != null) ...[
                          const SizedBox(height: 8),
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              _message!,
                              key: const Key('mission-message'),
                              style: TextStyle(
                                color: _messageIsError
                                    ? Theme.of(context).colorScheme.error
                                    : Theme.of(context).colorScheme.primary,
                              ),
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed:
                              _busy || _context == null ? null : _startNew,
                          icon: const Icon(Icons.add),
                          label: const Text('Neue Mission anlegen'),
                        ),
                        const SizedBox(height: 16),
                        Text('Gespeicherte Missionen',
                            style: Theme.of(context).textTheme.titleMedium),
                        if (_missions.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Text('Noch keine Mission gespeichert.'),
                          )
                        else
                          ..._missions.map(
                            (mission) => Card(
                              child: ListTile(
                                title: Text(mission.payload.title),
                                subtitle: Text(
                                  '${_statusLabel(mission.status)} · Revision ${mission.revision} · unverbindlich',
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap:
                                    _busy ? null : () => _openMission(mission),
                              ),
                            ),
                          ),
                        if (_needDrafts.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          _buildEditor(context),
                        ],
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _buildEditor(BuildContext context) {
    final selected = _selected;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            selected == null
                ? 'Neue Mission'
                : 'Mission korrigieren · Server-Revision ${selected.revision}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('mission-title'),
            controller: _titleController,
            maxLength: 160,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Titel',
              hintText: 'z. B. Wohnung renovieren',
              border: OutlineInputBorder(),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return 'Bitte einen Titel eingeben.';
              if (text.length > 160) return 'Maximal 160 Zeichen.';
              return null;
            },
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<MissionNeedStatus>(
            key: ValueKey(
              'mission-status-${selected?.missionNeedId ?? 'new'}-'
              '${selected?.revision ?? 0}-${_status.name}',
            ),
            initialValue: _status,
            decoration: const InputDecoration(
              labelText: 'Planungsstand',
              border: OutlineInputBorder(),
            ),
            items: MissionNeedStatus.values
                .map(
                  (status) => DropdownMenuItem<MissionNeedStatus>(
                    value: status,
                    child: Text(_statusLabel(status)),
                  ),
                )
                .toList(growable: false),
            onChanged: _busy
                ? null
                : (value) {
                    if (value != null) setState(() => _status = value);
                  },
          ),
          const SizedBox(height: 16),
          Text('Bedarfspunkte', style: Theme.of(context).textTheme.titleMedium),
          const Text(
            'Kurzer eindeutiger Schlüssel mit Buchstaben/Zahlen, z. B. farbrolle.',
          ),
          const SizedBox(height: 8),
          for (var index = 0; index < _needDrafts.length; index++)
            _buildNeedEditor(context, index, _needDrafts[index]),
          OutlinedButton.icon(
            onPressed: _busy || _needDrafts.length >= 50 ? null : _addNeed,
            icon: const Icon(Icons.add),
            label: const Text('Bedarfspunkt hinzufügen'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const Key('mission-save'),
            onPressed: _busy ? null : _save,
            icon: _busy
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(
              selected == null
                  ? 'Unverbindlich speichern'
                  : 'Als neue Revision speichern',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNeedEditor(
    BuildContext context,
    int index,
    _MissionNeedDraft draft,
  ) {
    return Card(
      key: ValueKey(draft),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(child: Text('Bedarf ${index + 1}')),
                IconButton(
                  tooltip: 'Bedarf ${index + 1} entfernen',
                  constraints:
                      const BoxConstraints(minWidth: 48, minHeight: 48),
                  onPressed: _busy || _needDrafts.length <= 1
                      ? null
                      : () => _removeNeed(index),
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
            TextFormField(
              key: ValueKey('mission-need-key-$index'),
              controller: draft.needKeyController,
              maxLength: 80,
              decoration: const InputDecoration(
                labelText: 'Bedarfsschlüssel',
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                final text = value?.trim() ?? '';
                if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$')
                    .hasMatch(text)) {
                  return '2–80 Zeichen: Buchstaben, Zahlen, Punkt, Doppelpunkt, _ oder -.';
                }
                return null;
              },
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<MissionNeedNecessity>(
              key: ValueKey('mission-need-necessity-$index'),
              initialValue: draft.necessity,
              decoration: const InputDecoration(
                labelText: 'Bedeutung',
                border: OutlineInputBorder(),
              ),
              items: const <DropdownMenuItem<MissionNeedNecessity>>[
                DropdownMenuItem(
                  value: MissionNeedNecessity.required,
                  child: Text('Erforderlich'),
                ),
                DropdownMenuItem(
                  value: MissionNeedNecessity.optional,
                  child: Text('Optional'),
                ),
              ],
              onChanged: _busy
                  ? null
                  : (value) {
                      if (value != null) draft.necessity = value;
                    },
            ),
            const SizedBox(height: 8),
            TextFormField(
              key: ValueKey('mission-need-quantity-$index'),
              controller: draft.quantityController,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[
                FilteringTextInputFormatter.digitsOnly,
              ],
              decoration: const InputDecoration(
                labelText: 'Menge',
                helperText: '1 bis 100',
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                final quantity = int.tryParse(value?.trim() ?? '');
                if (quantity == null || quantity < 1 || quantity > 100) {
                  return 'Bitte eine Menge von 1 bis 100 eingeben.';
                }
                return null;
              },
            ),
          ],
        ),
      ),
    );
  }

  String _statusLabel(MissionNeedStatus status) => switch (status) {
        MissionNeedStatus.draft => 'Entwurf',
        MissionNeedStatus.planned => 'Geplant',
      };
}

class _MissionNeedDraft {
  _MissionNeedDraft({
    String needKey = '',
    this.necessity = MissionNeedNecessity.required,
    int quantity = 1,
  })  : needKeyController = TextEditingController(text: needKey),
        quantityController = TextEditingController(text: quantity.toString());

  final TextEditingController needKeyController;
  final TextEditingController quantityController;
  MissionNeedNecessity necessity;

  void dispose() {
    needKeyController.dispose();
    quantityController.dispose();
  }
}
