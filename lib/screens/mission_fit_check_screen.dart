import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/models/mission_fit_check.dart';
import 'package:lendify/models/mission_need.dart';
import 'package:lendify/models/mission_need_display.dart';
import 'package:lendify/models/private_shelf_item.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/mission_fit_check_gateway.dart';
import 'package:lendify/services/mission_need_gateway.dart';
import 'package:lendify/services/private_shelf_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

typedef MissionFitTokenFactory = String Function();

@visibleForTesting
String newMissionFitToken() {
  final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}

class MissionFitCheckScreen extends StatefulWidget {
  const MissionFitCheckScreen({
    super.key,
    required this.missionNeedId,
    this.missionGateway = const BackendMissionNeedGateway(),
    this.shelfGateway = const BackendPrivateShelfGateway(),
    this.fitCheckGateway = const BackendMissionFitCheckGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.idempotencyKeyFactory = newMissionFitToken,
    this.measurementBatchFactory = newMissionFitToken,
    this.enableForTesting = false,
  });

  final String missionNeedId;
  final MissionNeedGateway missionGateway;
  final PrivateShelfGateway shelfGateway;
  final MissionFitCheckGateway fitCheckGateway;
  final ListingMutationService listingMutationService;
  final MissionFitTokenFactory idempotencyKeyFactory;
  final MissionFitTokenFactory measurementBatchFactory;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<MissionFitCheckScreen> createState() => _MissionFitCheckScreenState();
}

class _MissionFitCheckScreenState extends State<MissionFitCheckScreen> {
  final _formKey = GlobalKey<FormState>();
  final Map<String, TextEditingController> _requirementControllers =
      <String, TextEditingController>{
    for (final key in missionFitRequirementUnits.keys)
      key: TextEditingController(),
  };
  final Map<String, TextEditingController> _itemControllers =
      <String, TextEditingController>{
    for (final key in missionFitItemUnits.keys) key: TextEditingController(),
  };
  StreamSubscription<String>? _sessionSubscription;
  ListingMutationContext? _context;
  MissionNeed? _mission;
  List<PrivateShelfItem> _shelfItems = const <PrivateShelfItem>[];
  List<MissionFitCheck> _fitChecks = const <MissionFitCheck>[];
  PrivateShelfItem? _selectedShelf;
  MissionFitCheck? _selectedCheck;
  MissionFitCheck? _selectedTruth;
  bool _editing = false;
  bool _requirementConfirmed = false;
  bool _itemFactsConfirmed = false;
  bool _loading = true;
  bool _loadActive = false;
  bool _actionActive = false;
  int _accountGeneration = 0;
  String? _message;
  bool _messageIsError = false;
  String? _measurementBatch;
  String? _pendingFingerprint;
  String? _pendingIdempotencyKey;
  int? _boundMissionRevision;
  String? _boundMissionDigest;
  DateTime? _boundShelfUpdatedAt;

  bool get _available =>
      PlannerTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  bool get _busy => _loading || _loadActive || _actionActive;

  bool get _missionSupportsFit =>
      _mission?.payload.needs
          .any((need) => need.needKey == plantContainerNeedKey) ??
      false;

  @override
  void initState() {
    super.initState();
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _accountGeneration += 1;
      _clearPrincipalState();
      if (mounted) setState(() {});
      unawaited(_load());
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    _accountGeneration += 1;
    _sessionSubscription?.cancel();
    for (final controller in <TextEditingController>[
      ..._requirementControllers.values,
      ..._itemControllers.values,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _clearPrincipalState() {
    _context = null;
    _mission = null;
    _shelfItems = const <PrivateShelfItem>[];
    _fitChecks = const <MissionFitCheck>[];
    _selectedShelf = null;
    _selectedCheck = null;
    _selectedTruth = null;
    _editing = false;
    _requirementConfirmed = false;
    _itemFactsConfirmed = false;
    _loading = true;
    _loadActive = false;
    _actionActive = false;
    _message = null;
    _messageIsError = false;
    _measurementBatch = null;
    _pendingFingerprint = null;
    _pendingIdempotencyKey = null;
    _boundMissionRevision = null;
    _boundMissionDigest = null;
    _boundShelfUpdatedAt = null;
    _clearControllers();
  }

  void _clearControllers() {
    for (final controller in <TextEditingController>[
      ..._requirementControllers.values,
      ..._itemControllers.values,
    ]) {
      controller.clear();
    }
  }

  Future<bool> _mayUpdate(
    ListingMutationContext context,
    int generation,
  ) async =>
      mounted &&
      generation == _accountGeneration &&
      await widget.listingMutationService.isContextCurrent(context);

  Future<void> _load() async {
    if (_loadActive) return;
    final generation = _accountGeneration;
    _loadActive = true;
    if (mounted) {
      setState(() {
        _loading = true;
        _message = null;
      });
    }
    ListingMutationContext? captured;
    try {
      if (!_available) return;
      captured = await widget.listingMutationService.loadCurrentContext();
      if (captured == null || generation != _accountGeneration) {
        throw StateError('mission_fit_authentication_required');
      }
      final owner = captured.owner.authOwner;
      final mission = await widget.missionGateway.load(
        owner: owner,
        missionNeedId: widget.missionNeedId,
      );
      final shelfItems = await widget.shelfGateway.list(owner);
      final fitChecks = await widget.fitCheckGateway.list(
        owner: owner,
        missionNeedId: widget.missionNeedId,
      );
      if (!await _mayUpdate(captured, generation)) return;
      setState(() {
        _context = captured;
        _mission = mission;
        _shelfItems = shelfItems;
        _fitChecks = fitChecks;
        final selectedShelfId = _selectedShelf?.shelfItemId;
        if (selectedShelfId != null) {
          _selectedShelf = _findShelf(shelfItems, selectedShelfId);
        }
        final selectedCheckId = _selectedCheck?.fitCheckId;
        if (selectedCheckId != null) {
          final refreshed = _findCheck(fitChecks, selectedCheckId);
          if (refreshed != null) {
            _selectedTruth = refreshed;
            if (refreshed.revision != _selectedCheck!.revision) {
              _message =
                  'Eine neuere Server-Revision ist verfügbar. Dein unveröffentlichter Entwurf bleibt auf Revision ${_selectedCheck!.revision} gebunden und muss beim Speichern den Konflikt ehrlich auslösen.';
              _messageIsError = true;
            }
          }
        }
        _loading = false;
      });
    } catch (_) {
      if (captured != null && !await _mayUpdate(captured, generation)) return;
      if (!mounted || generation != _accountGeneration) return;
      setState(() {
        _loading = false;
        _message = captured == null
            ? 'FitCheck benötigt das aktuell angemeldete Konto.'
            : 'Der private FitCheck-Serverstand konnte nicht sicher geladen werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _loadActive = false);
      }
    }
  }

  PrivateShelfItem? _findShelf(
    List<PrivateShelfItem> items,
    String id,
  ) {
    for (final item in items) {
      if (item.shelfItemId == id) return item;
    }
    return null;
  }

  MissionFitCheck? _findCheck(List<MissionFitCheck> checks, String id) {
    for (final check in checks) {
      if (check.fitCheckId == id) return check;
    }
    return null;
  }

  void _startNew() {
    if (_busy || !_missionSupportsFit) return;
    setState(() {
      _editing = true;
      _selectedCheck = null;
      _selectedTruth = null;
      _selectedShelf = null;
      _clearControllers();
      _requirementConfirmed = false;
      _itemFactsConfirmed = false;
      _measurementBatch = widget.measurementBatchFactory();
      _boundMissionRevision = _mission!.revision;
      _boundMissionDigest = _mission!.payloadDigest;
      _boundShelfUpdatedAt = null;
      _pendingFingerprint = null;
      _pendingIdempotencyKey = null;
      _message = null;
    });
  }

  Future<void> _selectShelf(String? shelfItemId) async {
    final context = _context;
    if (_actionActive || context == null || shelfItemId == null) return;
    final generation = _accountGeneration;
    setState(() {
      _actionActive = true;
      _message = null;
      _selectedShelf = null;
      for (final controller in _itemControllers.values) {
        controller.clear();
      }
      _itemFactsConfirmed = false;
      _measurementBatch = widget.measurementBatchFactory();
      _boundShelfUpdatedAt = null;
      _pendingFingerprint = null;
      _pendingIdempotencyKey = null;
    });
    try {
      final shelf = await widget.shelfGateway.load(
        owner: context.owner.authOwner,
        shelfItemId: shelfItemId,
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _selectedShelf = shelf;
        _itemFactsConfirmed = false;
        _boundShelfUpdatedAt = shelf.updatedAt;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message =
            'Das private Regalobjekt konnte nicht sicher geladen werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _actionActive = false);
      }
    }
  }

  Future<void> _openCheck(MissionFitCheck summary) async {
    final context = _context;
    if (_actionActive || context == null) return;
    final generation = _accountGeneration;
    setState(() {
      _actionActive = true;
      _message = null;
    });
    try {
      final check = await widget.fitCheckGateway.load(
        owner: context.owner.authOwner,
        missionNeedId: widget.missionNeedId,
        fitCheckId: summary.fitCheckId,
      );
      final shelf = await widget.shelfGateway.load(
        owner: context.owner.authOwner,
        shelfItemId: check.shelfItemId,
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _applyServerCheck(check, shelf);
        _message = 'Serverstand Revision ${check.revision} geladen.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message = 'Der FitCheck konnte nicht sicher geladen werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _actionActive = false);
      }
    }
  }

  void _applyServerCheck(
    MissionFitCheck check,
    PrivateShelfItem shelf,
  ) {
    _selectedCheck = check;
    _selectedTruth = check;
    _selectedShelf = shelf;
    _editing = true;
    _setFacts(_requirementControllers, check.requirement.facts);
    _setFacts(_itemControllers, check.itemFacts);
    _requirementConfirmed = false;
    _itemFactsConfirmed = false;
    _measurementBatch = widget.measurementBatchFactory();
    _boundMissionRevision = check.missionRevision;
    _boundMissionDigest = check.missionPayloadDigest;
    _boundShelfUpdatedAt = check.shelfSnapshot.updatedAt;
    _pendingFingerprint = null;
    _pendingIdempotencyKey = null;
  }

  void _setFacts(
    Map<String, TextEditingController> controllers,
    List<MissionFitMeasurement> facts,
  ) {
    for (final entry in controllers.entries) {
      String value = '';
      for (final fact in facts) {
        if (fact.key == entry.key) value = fact.value.toString();
      }
      entry.value.text = value;
    }
  }

  MissionFitCheckDraft? _validatedDraft() {
    if (!(_formKey.currentState?.validate() ?? false)) return null;
    final mission = _mission;
    final shelf = _selectedShelf;
    final boundMissionRevision = _boundMissionRevision;
    final boundMissionDigest = _boundMissionDigest;
    final boundShelfUpdatedAt = _boundShelfUpdatedAt;
    if (mission == null ||
        shelf == null ||
        boundMissionRevision == null ||
        boundMissionDigest == null ||
        boundShelfUpdatedAt == null) {
      setState(() {
        _message = 'Bitte ein eigenes Regalobjekt auswählen.';
        _messageIsError = true;
      });
      return null;
    }
    if (!_requirementConfirmed || !_itemFactsConfirmed) {
      setState(() {
        _message =
            'Bitte Bedarf und eigene Messwerte jeweils ausdrücklich bestätigen.';
        _messageIsError = true;
      });
      return null;
    }
    final batch = _measurementBatch ??= widget.measurementBatchFactory();
    return MissionFitCheckDraft(
      missionRevision: boundMissionRevision,
      missionPayloadDigest: boundMissionDigest,
      shelfItemId: shelf.shelfItemId,
      shelfUpdatedAt: boundShelfUpdatedAt,
      requirement: MissionFitRequirement(
        ownerConfirmed: true,
        facts: _measurements(
          _requirementControllers,
          missionFitRequirementUnits,
        ),
      ),
      itemFacts: _measurements(
        _itemControllers,
        missionFitItemUnits,
        provenance: (key) => MissionFitProvenance(
          sourceType: 'owner_confirmed_measurement',
          sourceReference: 'shelf:${shelf.shelfItemId}:$key',
          sourceVersion: 'owner-measurement-v1:$batch',
          ownerConfirmed: true,
        ),
      ),
    );
  }

  List<MissionFitMeasurement> _measurements(
    Map<String, TextEditingController> controllers,
    Map<String, String> units, {
    MissionFitProvenance Function(String key)? provenance,
  }) =>
      units.entries
          .map(
            (entry) => MissionFitMeasurement(
              key: entry.key,
              value: int.parse(controllers[entry.key]!.text.trim()),
              unit: entry.value,
              provenance: provenance?.call(entry.key),
            ),
          )
          .toList(growable: false);

  String _idempotencyKeyFor(
    MissionFitCheckDraft draft,
    MissionFitCheck? selected,
  ) {
    final fingerprint = jsonEncode(<String, dynamic>{
      'operation': selected == null ? 'create' : 'correct',
      if (selected != null) 'fitCheckId': selected.fitCheckId,
      if (selected != null) 'expectedRevision': selected.revision,
      'draft': draft.toJson(),
    });
    if (_pendingFingerprint != fingerprint || _pendingIdempotencyKey == null) {
      _pendingFingerprint = fingerprint;
      _pendingIdempotencyKey = 'fit-${widget.idempotencyKeyFactory()}';
    }
    return _pendingIdempotencyKey!;
  }

  Future<void> _save() async {
    final context = _context;
    if (_actionActive || context == null) return;
    final draft = _validatedDraft();
    if (draft == null) return;
    final selected = _selectedCheck;
    final generation = _accountGeneration;
    final key = _idempotencyKeyFor(draft, selected);
    setState(() {
      _actionActive = true;
      _message = null;
    });
    try {
      if (!await widget.listingMutationService.isContextCurrent(context) ||
          generation != _accountGeneration) {
        return;
      }
      final result = selected == null
          ? await widget.fitCheckGateway.create(
              owner: context.owner.authOwner,
              missionNeedId: widget.missionNeedId,
              draft: draft,
              idempotencyKey: key,
            )
          : await widget.fitCheckGateway.correct(
              owner: context.owner.authOwner,
              missionNeedId: widget.missionNeedId,
              fitCheckId: selected.fitCheckId,
              expectedRevision: selected.revision,
              draft: draft,
              idempotencyKey: key,
            );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        final check = result.fitCheck;
        _fitChecks = <MissionFitCheck>[
          check,
          ..._fitChecks.where((item) => item.fitCheckId != check.fitCheckId),
        ];
        _selectedCheck = check;
        _selectedTruth = check;
        _boundMissionRevision = check.missionRevision;
        _boundMissionDigest = check.missionPayloadDigest;
        _boundShelfUpdatedAt = check.shelfSnapshot.updatedAt;
        _requirementConfirmed = false;
        _itemFactsConfirmed = false;
        _measurementBatch = widget.measurementBatchFactory();
        _pendingFingerprint = null;
        _pendingIdempotencyKey = null;
        _message = result.replayed
            ? 'Der bereits bestätigte FitCheck-Serverstand Revision ${check.revision} wurde geladen.'
            : selected == null
                ? 'FitCheck serverseitig als Revision ${check.revision} gespeichert.'
                : 'Korrektur serverseitig als Revision ${check.revision} gespeichert.';
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
            'Speichern nicht bestätigt. Messwerte und Wiederholungskennung bleiben erhalten; es erfolgt keine automatische Wiederholung.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _actionActive = false);
      }
    }
  }

  String _backendErrorMessage(BackendException error) {
    if (error.statusCode == 409 &&
        error.code == 'mission_fit_check_revision_conflict') {
      final actual = error.details is Map
          ? (error.details as Map)['actualRevision']
          : null;
      return 'Der FitCheck wurde serverseitig geändert${actual is int ? ' (Revision $actual)' : ''}. Deine Messwerte bleiben erhalten. Lade den Serverstand vor einer neuen Korrektur.';
    }
    if (error.statusCode == 409 &&
        const <String>{
          'mission_fit_check_mission_snapshot_stale',
          'mission_fit_check_shelf_snapshot_stale',
        }.contains(error.code)) {
      return 'Mission oder Regalobjekt wurde inzwischen geändert. Der FitCheck bleibt unbekannt und blockiert; deine Messwerte bleiben erhalten. Lade den aktuellen Serverstand.';
    }
    if (error.statusCode == 409 &&
        error.code == 'mission_fit_check_idempotency_key_reused') {
      return 'Die Wiederholungskennung passt nicht mehr zu diesem Entwurf. Deine Messwerte bleiben erhalten.';
    }
    return 'FitCheck nicht bestätigt (${error.code}). Deine Messwerte bleiben erhalten.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privater Maß-FitCheck')),
      body: SafeArea(
        child: !_available
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Der FitCheck ist nur im freigegebenen internen Planner verfügbar.',
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            : _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      children: <Widget>[
                        Semantics(
                          container: true,
                          label:
                              'Nur unverbindlicher Größenvergleich. Keine Eignungs- oder Sicherheitsgarantie.',
                          child: const Card(
                            child: ListTile(
                              leading: Icon(Icons.straighten_outlined),
                              title: Text('Nur Maße und Volumen'),
                              subtitle: Text(
                                'Unverbindlicher Vergleich – keine Gartenbau-, Material-, Traglast-, Entwässerungs-, Nutzungs- oder Sicherheitsberatung. Keine Reservierung, Buchung oder Zahlung.',
                              ),
                            ),
                          ),
                        ),
                        if (_message != null) ...<Widget>[
                          const SizedBox(height: 8),
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              _message!,
                              key: const Key('mission-fit-message'),
                              style: TextStyle(
                                color: _messageIsError
                                    ? Theme.of(context).colorScheme.error
                                    : Theme.of(context).colorScheme.primary,
                              ),
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        _buildMissionSummary(context),
                        const SizedBox(height: 16),
                        if (_missionSupportsFit)
                          FilledButton.icon(
                            key: const Key('mission-fit-new'),
                            onPressed: _busy ? null : _startNew,
                            icon: const Icon(Icons.add),
                            label: const Text('Neuen Maß-FitCheck anlegen'),
                          )
                        else
                          Card(
                            child: ListTile(
                              leading: Icon(Icons.block_outlined),
                              title: Text('Kein passender Bedarfspunkt'),
                              subtitle: Text(
                                'Diese Mission enthält keinen Bedarf für ${missionNeedDisplayLabel(plantContainerNeedKey)}. Es wird kein FitCheck angeboten.',
                              ),
                            ),
                          ),
                        const SizedBox(height: 16),
                        Text(
                          'Gespeicherte FitChecks',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        if (_fitChecks.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Text('Noch kein FitCheck gespeichert.'),
                          )
                        else
                          ..._fitChecks.map(_buildFitCheckTile),
                        if (_editing) ...<Widget>[
                          const SizedBox(height: 20),
                          _buildEditor(context),
                        ],
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _buildMissionSummary(BuildContext context) {
    final mission = _mission;
    if (mission == null) {
      return const Card(
        child: ListTile(title: Text('Mission nicht verfügbar.')),
      );
    }
    return Card(
      child: ListTile(
        title: Text(mission.payload.title),
        subtitle: Text(
          '${mission.status == MissionNeedStatus.draft ? 'Entwurf' : 'Geplant'} · Server-Revision ${mission.revision}',
        ),
      ),
    );
  }

  Widget _buildFitCheckTile(MissionFitCheck check) => Card(
        child: ListTile(
          title: Text(check.shelfSnapshot.title),
          subtitle: Text(
            '${_statusLabel(check.currentEvaluation.status)} · ${check.currentApplicability == MissionFitApplicability.current ? 'aktuell' : 'veraltet/blockiert'} · Revision ${check.revision}',
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: _busy ? null : () => _openCheck(check),
        ),
      );

  Widget _buildEditor(BuildContext context) {
    final selected = _selectedCheck;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            selected == null
                ? 'Neuer unverbindlicher FitCheck'
                : 'FitCheck korrigieren · Server-Revision ${selected.revision}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: ValueKey(
              'mission-fit-shelf-${_selectedShelf?.shelfItemId ?? 'none'}',
            ),
            initialValue: _selectedShelf?.shelfItemId,
            decoration: const InputDecoration(
              labelText: 'Eigenes privates Regalobjekt',
              border: OutlineInputBorder(),
            ),
            items: _shelfItems
                .map(
                  (item) => DropdownMenuItem<String>(
                    value: item.shelfItemId,
                    child: Text(item.title),
                  ),
                )
                .toList(growable: false),
            onChanged: _busy || selected != null ? null : _selectShelf,
            validator: (_) => _selectedShelf == null
                ? 'Bitte ein eigenes Regalobjekt auswählen.'
                : null,
          ),
          if (selected != null) ...<Widget>[
            const SizedBox(height: 12),
            _buildResult(context, _selectedTruth ?? selected),
          ],
          const SizedBox(height: 20),
          Text('Bedarf der Mission',
              style: Theme.of(context).textTheme.titleMedium),
          const Text('Ganze Zahlen in den fest angegebenen Einheiten.'),
          const SizedBox(height: 8),
          _measurementField(
            keyName: 'minimumUsableVolumeMl',
            label: 'Mindestens nutzbares Volumen (ml)',
            controller: _requirementControllers['minimumUsableVolumeMl']!,
            maximum: 10000000,
          ),
          _measurementField(
            keyName: 'maximumFootprintWidthMm',
            label: 'Maximale Stellfläche – Breite (mm)',
            controller: _requirementControllers['maximumFootprintWidthMm']!,
            maximum: 10000,
          ),
          _measurementField(
            keyName: 'maximumFootprintDepthMm',
            label: 'Maximale Stellfläche – Tiefe (mm)',
            controller: _requirementControllers['maximumFootprintDepthMm']!,
            maximum: 10000,
          ),
          _measurementField(
            keyName: 'maximumHeightMm',
            label: 'Maximale Höhe (mm)',
            controller: _requirementControllers['maximumHeightMm']!,
            maximum: 10000,
          ),
          CheckboxListTile(
            key: const Key('mission-fit-requirement-confirmed'),
            value: _requirementConfirmed,
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Ich bestätige diese vier Bedarfsmaße für die aktuelle Mission.',
            ),
            onChanged: _busy
                ? null
                : (value) => setState(
                      () => _requirementConfirmed = value ?? false,
                    ),
          ),
          const SizedBox(height: 16),
          Text('Eigene Messwerte des Regalobjekts',
              style: Theme.of(context).textTheme.titleMedium),
          const Text(
            'Quelle: von dir bestätigte Messung. Keine Fotoanalyse oder automatische Ergänzung.',
          ),
          const SizedBox(height: 8),
          _measurementField(
            keyName: 'usableVolumeMl',
            label: 'Nutzbares Volumen (ml)',
            controller: _itemControllers['usableVolumeMl']!,
            maximum: 10000000,
          ),
          _measurementField(
            keyName: 'footprintWidthMm',
            label: 'Stellfläche – Breite (mm)',
            controller: _itemControllers['footprintWidthMm']!,
            maximum: 10000,
          ),
          _measurementField(
            keyName: 'footprintDepthMm',
            label: 'Stellfläche – Tiefe (mm)',
            controller: _itemControllers['footprintDepthMm']!,
            maximum: 10000,
          ),
          _measurementField(
            keyName: 'heightMm',
            label: 'Höhe (mm)',
            controller: _itemControllers['heightMm']!,
            maximum: 10000,
          ),
          CheckboxListTile(
            key: const Key('mission-fit-item-confirmed'),
            value: _itemFactsConfirmed,
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Ich habe diese vier Itemmaße selbst geprüft und bestätige sie.',
            ),
            onChanged: _busy
                ? null
                : (value) =>
                    setState(() => _itemFactsConfirmed = value ?? false),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const Key('mission-fit-save'),
            onPressed: _busy || !_missionSupportsFit ? null : _save,
            icon: _actionActive
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.rule_outlined),
            label: Text(
              selected == null
                  ? 'Unverbindlich vergleichen'
                  : 'Als neue Revision korrigieren',
            ),
          ),
        ],
      ),
    );
  }

  Widget _measurementField({
    required String keyName,
    required String label,
    required TextEditingController controller,
    required int maximum,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextFormField(
          key: ValueKey('mission-fit-$keyName'),
          controller: controller,
          keyboardType: TextInputType.number,
          inputFormatters: <TextInputFormatter>[
            FilteringTextInputFormatter.digitsOnly,
          ],
          decoration: InputDecoration(
            labelText: label,
            helperText: '1 bis $maximum',
            border: const OutlineInputBorder(),
          ),
          validator: (raw) {
            final value = int.tryParse(raw?.trim() ?? '');
            if (value == null || value < 1 || value > maximum) {
              return 'Bitte eine ganze Zahl von 1 bis $maximum eingeben.';
            }
            return null;
          },
        ),
      );

  Widget _buildResult(BuildContext context, MissionFitCheck check) {
    final stale = check.currentApplicability == MissionFitApplicability.stale;
    return Semantics(
      container: true,
      liveRegion: true,
      child: Card(
        color: stale ? Theme.of(context).colorScheme.errorContainer : null,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Gespeichertes Ergebnis: ${_statusLabel(check.storedEvaluation.status)}',
                key: const Key('mission-fit-stored-result'),
              ),
              const SizedBox(height: 4),
              Text(
                stale
                    ? 'Aktuell: unbekannt und blockiert – Mission oder Regalobjekt hat sich seit der gespeicherten Revision geändert.'
                    : 'Aktuell: ${_statusLabel(check.currentEvaluation.status)}',
                key: const Key('mission-fit-current-result'),
              ),
              const SizedBox(height: 8),
              const Text(
                'Nur unverbindlicher Maß-/Volumenvergleich. Keine Eignungs- oder Sicherheitsgarantie und keine Freigabe für Reservierung, Buchung oder Zahlung.',
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _statusLabel(MissionFitStatus status) => switch (status) {
        MissionFitStatus.fit => 'passt nach den vier Maßen',
        MissionFitStatus.unfit => 'passt nach den vier Maßen nicht',
        MissionFitStatus.unknown => 'unbekannt – blockiert',
      };
}
