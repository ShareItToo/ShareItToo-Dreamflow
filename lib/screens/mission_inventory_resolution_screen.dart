import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/models/mission_inventory_resolution.dart';
import 'package:lendify/models/mission_need.dart';
import 'package:lendify/models/mission_quorum_readback.dart';
import 'package:lendify/models/mission_supply_demand.dart';
import 'package:lendify/screens/mission_supply_demand_screen.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/maps_service.dart';
import 'package:lendify/services/mission_inventory_resolution_gateway.dart';
import 'package:lendify/services/mission_need_gateway.dart';
import 'package:lendify/services/mission_quorum_readback_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/listing_mutation_interaction.dart';

typedef MissionInventoryTokenFactory = String Function();
typedef MissionInventoryAutocomplete = Future<List<MapsAddressSuggestion>>
    Function(String input);
typedef MissionInventoryPlaceLookup = Future<PlaceDetails?> Function(
  String placeId,
);
typedef MissionSupplyDemandCreateScreenBuilder = Widget Function(
  MissionSupplyDemandCreateContext createContext,
);

@visibleForTesting
String newMissionInventoryToken() {
  final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}

Future<List<MapsAddressSuggestion>> _defaultAutocomplete(String input) =>
    MapsService.autocomplete(input);

Future<PlaceDetails?> _defaultPlaceLookup(String placeId) =>
    MapsService.placeDetails(placeId);

Widget _defaultSupplyDemandCreateScreenBuilder(
  MissionSupplyDemandCreateContext createContext,
) =>
    MissionSupplyDemandScreen(createContext: createContext);

class MissionInventoryResolutionScreen extends StatefulWidget {
  const MissionInventoryResolutionScreen({
    super.key,
    required this.missionNeedId,
    this.missionGateway = const BackendMissionNeedGateway(),
    this.inventoryGateway = const BackendMissionInventoryResolutionGateway(),
    this.quorumGateway = const BackendMissionQuorumReadbackGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.autocomplete = _defaultAutocomplete,
    this.placeLookup = _defaultPlaceLookup,
    this.tokenFactory = newMissionInventoryToken,
    this.supplyDemandScreenBuilder = _defaultSupplyDemandCreateScreenBuilder,
    this.enableForTesting = false,
  });

  final String missionNeedId;
  final MissionNeedGateway missionGateway;
  final MissionInventoryResolutionGateway inventoryGateway;
  final MissionQuorumReadbackGateway quorumGateway;
  final ListingMutationService listingMutationService;
  final MissionInventoryAutocomplete autocomplete;
  final MissionInventoryPlaceLookup placeLookup;
  final MissionInventoryTokenFactory tokenFactory;
  final MissionSupplyDemandCreateScreenBuilder supplyDemandScreenBuilder;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<MissionInventoryResolutionScreen> createState() =>
      _MissionInventoryResolutionScreenState();
}

class _MissionInventoryResolutionScreenState
    extends State<MissionInventoryResolutionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _locationController = TextEditingController();
  final _radiusController = TextEditingController(text: '25');
  final ListingMutationInteractionController _ownedRoutes =
      ListingMutationInteractionController();
  StreamSubscription<String>? _sessionSubscription;
  Timer? _locationDebounce;
  ListingMutationContext? _context;
  MissionNeed? _mission;
  List<MissionInventoryResolution> _resolutions =
      const <MissionInventoryResolution>[];
  MissionInventoryResolution? _selectedBase;
  MissionInventoryResolution? _selectedTruth;
  List<MapsAddressSuggestion> _suggestions = const <MapsAddressSuggestion>[];
  _EphemeralPlace? _selectedPlace;
  DateTime? _startDate;
  DateTime? _endDate;
  bool _editing = false;
  bool _loading = true;
  bool _loadActive = false;
  bool _actionActive = false;
  bool _locationLookupActive = false;
  bool _supplyDemandRouteOpening = false;
  bool _quorumLoading = false;
  bool _quorumLoadFailed = false;
  MissionQuorumReadback? _quorum;
  int _accountGeneration = 0;
  String? _message;
  bool _messageIsError = false;
  int? _boundMissionRevision;
  String? _boundMissionDigest;
  String? _locationSourceVersion;
  String? _pendingFingerprint;
  String? _pendingIdempotencyKey;

  bool get _available =>
      PlannerTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  bool get _demandAvailable =>
      PlannerTechnicalConfig.demandAvailable ||
      (!kReleaseMode && widget.enableForTesting);

  bool get _busy =>
      _loading || _loadActive || _actionActive || _locationLookupActive;

  @override
  void initState() {
    super.initState();
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _accountGeneration += 1;
      _ownedRoutes.invalidate();
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
    _ownedRoutes.dispose();
    _locationDebounce?.cancel();
    _locationController.dispose();
    _radiusController.dispose();
    super.dispose();
  }

  void _clearPrincipalState() {
    _locationDebounce?.cancel();
    _context = null;
    _mission = null;
    _resolutions = const <MissionInventoryResolution>[];
    _selectedBase = null;
    _selectedTruth = null;
    _suggestions = const <MapsAddressSuggestion>[];
    _selectedPlace = null;
    _startDate = null;
    _endDate = null;
    _editing = false;
    _loading = true;
    _loadActive = false;
    _actionActive = false;
    _locationLookupActive = false;
    _supplyDemandRouteOpening = false;
    _quorumLoading = false;
    _quorumLoadFailed = false;
    _quorum = null;
    _message = null;
    _messageIsError = false;
    _boundMissionRevision = null;
    _boundMissionDigest = null;
    _locationSourceVersion = null;
    _pendingFingerprint = null;
    _pendingIdempotencyKey = null;
    _locationController.clear();
    _radiusController.text = '25';
  }

  Future<bool> _mayUpdate(
    ListingMutationContext context,
    int generation,
  ) async {
    if (!mounted || generation != _accountGeneration) return false;
    final current =
        await widget.listingMutationService.isContextCurrent(context);
    return current && mounted && generation == _accountGeneration;
  }

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
        throw StateError('mission_inventory_authentication_required');
      }
      if (!await _mayUpdate(captured, generation)) return;
      final owner = captured.owner.authOwner;
      final mission = await widget.missionGateway.load(
        owner: owner,
        missionNeedId: widget.missionNeedId,
      );
      if (!await _mayUpdate(captured, generation)) return;
      final resolutions = await widget.inventoryGateway.list(
        owner: owner,
        missionNeedId: widget.missionNeedId,
      );
      if (!await _mayUpdate(captured, generation)) return;
      setState(() {
        _context = captured;
        _ownedRoutes.replaceContext(captured);
        _mission = mission;
        _resolutions = resolutions;
        if (!_editing) {
          _selectedBase = resolutions.firstOrNull;
          _selectedTruth = resolutions.firstOrNull;
        } else if (_selectedBase case final base?) {
          final refreshed = resolutions
              .where((entry) => entry.resolutionId == base.resolutionId)
              .firstOrNull;
          _selectedTruth = refreshed;
          if (refreshed != null && refreshed.revision != base.revision) {
            _message =
                'Eine neuere Server-Revision ist verfügbar. Deine Eingaben bleiben auf Revision ${base.revision} gebunden; Speichern muss den Konflikt ehrlich melden.';
            _messageIsError = true;
          }
        }
        if (!_editing && _locationController.text.trim().isEmpty) {
          _locationController.text = captured!.user.homeLocation?.trim() ?? '';
        }
        _quorum = null;
        _quorumLoadFailed = false;
        _loading = false;
      });
    } catch (_) {
      if (captured != null && !await _mayUpdate(captured, generation)) return;
      if (!mounted || generation != _accountGeneration) return;
      setState(() {
        _loading = false;
        _message = captured == null
            ? 'Die Inventarauflösung benötigt das aktuell angemeldete Konto.'
            : 'Der private Inventar-Serverstand konnte nicht sicher geladen werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _loadActive = false);
      }
    }
  }

  Future<void> _openSupplyDemand(MissionInventorySlot slot) async {
    final truth = _selectedTruth;
    if (!_demandAvailable ||
        _supplyDemandRouteOpening ||
        _busy ||
        truth == null ||
        truth.currentApplicability != MissionInventoryApplicability.current ||
        slot.status != 'gap' ||
        slot.assignment != null ||
        slot.gapReason != 'no_current_unique_candidate') {
      return;
    }
    final owner = _ownedRoutes.capture();
    if (owner == null) return;
    final generation = _accountGeneration;
    setState(() => _supplyDemandRouteOpening = true);
    try {
      if (!await _ownedRoutes.isCurrent(widget.listingMutationService, owner) ||
          !mounted ||
          generation != _accountGeneration) {
        return;
      }
      final createContext = MissionSupplyDemandCreateContext(
        resolutionId: truth.resolutionId,
        resolutionRevision: truth.revision,
        slotKey: slot.slotKey,
        needKey: slot.needKey,
        necessity: slot.necessity,
        ordinal: slot.ordinal,
        periodEnd: truth.endDate,
      );
      await _ownedRoutes.pushOwnedRoute<void>(
        context: context,
        owner: owner,
        route: MaterialPageRoute<void>(
          builder: (_) => widget.supplyDemandScreenBuilder(createContext),
        ),
      );
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _supplyDemandRouteOpening = false);
      }
    }
  }

  Future<void> _loadQuorum() async {
    final context = _context;
    final resolution = _selectedTruth;
    if (_quorumLoading || context == null || resolution == null) return;
    final generation = _accountGeneration;
    setState(() {
      _quorumLoading = true;
      _quorumLoadFailed = false;
    });
    try {
      final value = await widget.quorumGateway.load(
        owner: context.owner.authOwner,
        missionNeedId: widget.missionNeedId,
        resolutionId: resolution.resolutionId,
        missionRevision: resolution.missionRevision,
        resolutionRevision: resolution.revision,
        missionPayloadDigest: resolution.missionPayloadDigest,
        resolutionDigest: resolution.storedResolutionDigest,
      );
      if (!await _mayUpdate(context, generation)) return;
      if (value.missionRevision != resolution.missionRevision ||
          value.resolutionRevision != resolution.revision) {
        throw const FormatException('mission_quorum_readback_revision_drift');
      }
      setState(() {
        _quorum = value;
        _quorumLoadFailed = false;
        _message = null;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _quorum = null;
        _quorumLoadFailed = true;
        _message =
            'Der unverbindliche Missionsstand konnte nicht sicher gelesen werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _quorumLoading = false);
      }
    }
  }

  void _startNew() {
    final mission = _mission;
    if (_busy || mission == null || _resolutions.isNotEmpty) return;
    setState(() {
      _editing = true;
      _selectedBase = null;
      _selectedTruth = null;
      _startDate = null;
      _endDate = null;
      _radiusController.text = '25';
      _resetLocationSelection(prefillHome: true);
      _boundMissionRevision = mission.revision;
      _boundMissionDigest = mission.payloadDigest;
      _pendingFingerprint = null;
      _pendingIdempotencyKey = null;
      _message = null;
    });
  }

  void _startCorrection() {
    final mission = _mission;
    final truth = _selectedTruth;
    if (_busy || mission == null || truth == null) return;
    setState(() {
      _editing = true;
      _selectedBase = truth;
      _startDate = truth.startDate;
      _endDate = truth.endDate;
      _radiusController.text = truth.locationSnapshot.radiusKm.toString();
      _resetLocationSelection(prefillHome: true);
      _boundMissionRevision = mission.revision;
      _boundMissionDigest = mission.payloadDigest;
      _pendingFingerprint = null;
      _pendingIdempotencyKey = null;
      _message =
          'Für jede Korrektur ist eine neue ausdrückliche Ortsauswahl nötig. Exakte Koordinaten wurden nicht gespeichert.';
      _messageIsError = false;
    });
  }

  void _resetLocationSelection({required bool prefillHome}) {
    _locationDebounce?.cancel();
    _suggestions = const <MapsAddressSuggestion>[];
    _selectedPlace = null;
    _locationSourceVersion = null;
    _locationController.text =
        prefillHome ? (_context?.user.homeLocation?.trim() ?? '') : '';
  }

  void _onLocationChanged(String value) {
    _locationDebounce?.cancel();
    setState(() {
      _selectedPlace = null;
      _locationSourceVersion = null;
      _suggestions = const <MapsAddressSuggestion>[];
      _pendingFingerprint = null;
      _pendingIdempotencyKey = null;
    });
    final query = value.trim();
    if (query.length < 3) return;
    final context = _context;
    final generation = _accountGeneration;
    if (context == null) return;
    _locationDebounce = Timer(const Duration(milliseconds: 300), () async {
      if (!await _mayUpdate(context, generation)) return;
      try {
        final suggestions = await widget.autocomplete(query);
        if (!await _mayUpdate(context, generation) ||
            _locationController.text.trim() != query) {
          return;
        }
        setState(() => _suggestions = suggestions.take(8).toList());
      } catch (_) {
        if (!await _mayUpdate(context, generation)) return;
        setState(() {
          _suggestions = const <MapsAddressSuggestion>[];
          _message =
              'Ortsvorschläge sind gerade nicht verfügbar. Ohne ausdrückliche Auswahl wird nichts gespeichert.';
          _messageIsError = true;
        });
      }
    });
  }

  Future<void> _selectSuggestion(MapsAddressSuggestion suggestion) async {
    final context = _context;
    final placeId = suggestion.placeId;
    if (_locationLookupActive || context == null || placeId == null) return;
    final generation = _accountGeneration;
    setState(() {
      _locationLookupActive = true;
      _message = null;
    });
    try {
      if (!await _mayUpdate(context, generation)) return;
      final details = await widget.placeLookup(placeId);
      if (!await _mayUpdate(context, generation)) return;
      if (details == null ||
          !details.lat.isFinite ||
          !details.lng.isFinite ||
          details.lat < -90 ||
          details.lat > 90 ||
          details.lng < -180 ||
          details.lng > 180) {
        throw const FormatException('mission_inventory_place_invalid');
      }
      setState(() {
        _locationController.text = details.formattedAddress;
        _selectedPlace = _EphemeralPlace(
          latitudeE5: (details.lat * 100000).round(),
          longitudeE5: (details.lng * 100000).round(),
        );
        _locationSourceVersion =
            'owner-maps-selection-${widget.tokenFactory()}';
        _suggestions = const <MapsAddressSuggestion>[];
        _pendingFingerprint = null;
        _pendingIdempotencyKey = null;
        _message =
            'Suchmittelpunkt ausdrücklich ausgewählt. Die Koordinaten bleiben nur bis zum bestätigten Speichern im Arbeitsspeicher.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _selectedPlace = null;
        _locationSourceVersion = null;
        _message =
            'Der Ort konnte nicht sicher bestätigt werden. Bitte einen Vorschlag erneut auswählen.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _locationLookupActive = false);
      }
    }
  }

  Future<void> _pickDate({required bool start}) async {
    final ownerContext = _context;
    if (_busy || ownerContext == null) return;
    final generation = _accountGeneration;
    if (!await _mayUpdate(ownerContext, generation) || !mounted) return;
    final now = DateTime.now().toUtc();
    final first = DateTime.utc(now.year, now.month, now.day);
    final last = first.add(const Duration(days: 730));
    final preferred = start
        ? (_startDate ?? DateTime.now().toUtc().add(const Duration(days: 1)))
        : (_endDate ??
            _startDate?.add(const Duration(days: 1)) ??
            DateTime.now().toUtc().add(const Duration(days: 2)));
    final initial = preferred.isBefore(first)
        ? first
        : preferred.isAfter(last)
            ? last
            : preferred;
    final selected = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: last,
    );
    if (!await _mayUpdate(ownerContext, generation) || selected == null) return;
    setState(() {
      final normalized =
          DateTime.utc(selected.year, selected.month, selected.day);
      if (start) {
        _startDate = normalized;
        if (_endDate != null && _endDate!.isBefore(normalized)) {
          _endDate = null;
        }
      } else {
        _endDate = normalized;
      }
      _pendingFingerprint = null;
      _pendingIdempotencyKey = null;
    });
  }

  MissionInventoryDraft? _validatedDraft() {
    if (!(_formKey.currentState?.validate() ?? false)) return null;
    final start = _startDate;
    final end = _endDate;
    final place = _selectedPlace;
    final sourceVersion = _locationSourceVersion;
    final missionRevision = _boundMissionRevision;
    final missionDigest = _boundMissionDigest;
    final radius = int.tryParse(_radiusController.text.trim());
    if (start == null ||
        end == null ||
        !end.isAfter(start) ||
        end.difference(start).inDays > 365 ||
        place == null ||
        sourceVersion == null ||
        missionRevision == null ||
        missionDigest == null ||
        radius == null ||
        radius < 1 ||
        radius > 500) {
      setState(() {
        _message =
            'Bitte Zeitraum, Radius und einen ausdrücklich ausgewählten Ort vollständig bestätigen.';
        _messageIsError = true;
      });
      return null;
    }
    return MissionInventoryDraft(
      missionRevision: missionRevision,
      missionPayloadDigest: missionDigest,
      startDate: start,
      endDate: end,
      latitudeE5: place.latitudeE5,
      longitudeE5: place.longitudeE5,
      radiusKm: radius,
      locationSourceVersion: sourceVersion,
      expectedRevision: _selectedBase?.revision,
    );
  }

  String _idempotencyKeyFor(MissionInventoryDraft draft) {
    final fingerprint = jsonEncode(<String, dynamic>{
      'operation': _selectedBase == null ? 'create' : 'correct',
      if (_selectedBase case final selected?)
        'resolutionId': selected.resolutionId,
      'request': draft.toJson(),
    });
    if (_pendingFingerprint != fingerprint || _pendingIdempotencyKey == null) {
      _pendingFingerprint = fingerprint;
      _pendingIdempotencyKey = 'mission-inventory-${widget.tokenFactory()}';
    }
    return _pendingIdempotencyKey!;
  }

  Future<void> _save() async {
    final context = _context;
    if (_actionActive || context == null) return;
    final draft = _validatedDraft();
    if (draft == null) return;
    final base = _selectedBase;
    final generation = _accountGeneration;
    final key = _idempotencyKeyFor(draft);
    setState(() {
      _actionActive = true;
      _message = null;
    });
    try {
      if (!await _mayUpdate(context, generation)) return;
      final result = base == null
          ? await widget.inventoryGateway.create(
              owner: context.owner.authOwner,
              missionNeedId: widget.missionNeedId,
              draft: draft,
              idempotencyKey: key,
            )
          : await widget.inventoryGateway.correct(
              owner: context.owner.authOwner,
              missionNeedId: widget.missionNeedId,
              resolutionId: base.resolutionId,
              draft: draft,
              idempotencyKey: key,
            );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        final resolution = result.resolution;
        _resolutions = <MissionInventoryResolution>[resolution];
        _selectedBase = resolution;
        _selectedTruth = resolution;
        _quorum = null;
        _quorumLoadFailed = false;
        _editing = false;
        _selectedPlace = null;
        _locationSourceVersion = null;
        _suggestions = const <MapsAddressSuggestion>[];
        _pendingFingerprint = null;
        _pendingIdempotencyKey = null;
        _message = result.replayed
            ? 'Der bereits bestätigte Serverstand Revision ${resolution.revision} wurde geladen.'
            : base == null
                ? 'Inventarauflösung serverseitig als Revision ${resolution.revision} gespeichert.'
                : 'Korrektur serverseitig als Revision ${resolution.revision} gespeichert.';
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
            'Ergebnis nicht bestätigt. Eingaben, exakte Request-Daten und Wiederholungskennung bleiben nur in diesem geöffneten Screen erhalten; eine ausdrückliche Wiederholung nutzt dieselbe Anfrage.';
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
        error.code == 'mission_inventory_revision_conflict') {
      final actual = error.details is Map
          ? (error.details as Map)['actualRevision']
          : null;
      return 'Die Inventarauflösung wurde serverseitig geändert${actual is int ? ' (Revision $actual)' : ''}. Deine Eingaben bleiben erhalten. Lade den Serverstand vor einer neuen Korrektur.';
    }
    if (error.statusCode == 409 &&
        error.code == 'mission_inventory_mission_snapshot_stale') {
      return 'Die Mission wurde inzwischen geändert. Deine Eingaben bleiben erhalten; bitte Serverstand aktualisieren.';
    }
    if (error.statusCode == 409 &&
        error.code == 'mission_inventory_idempotency_key_reused') {
      return 'Die Wiederholungskennung passt nicht mehr zu dieser Anfrage. Eingaben bleiben erhalten; bitte Serverstand aktualisieren.';
    }
    return 'Inventarauflösung nicht bestätigt (${error.code}). Eingaben bleiben erhalten.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Private Inventarauflösung')),
      body: SafeArea(
        child: !_available
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Die Inventarauflösung ist nur im freigegebenen internen Planner verfügbar.',
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
                              'Unverbindliche Inventarvorschau. Keine Reservierung, Buchung oder Zahlung.',
                          child: const Card(
                            child: ListTile(
                              leading: Icon(Icons.inventory_2_outlined),
                              title: Text('Nur unverbindliche Vorschau'),
                              subtitle: Text(
                                'Kandidaten und Lücken sind eine begrenzte Momentaufnahme. Es entsteht keine Reservierung, Buchung, kein Vertrag und keine Zahlung.',
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
                              key: const Key('mission-inventory-message'),
                              style: TextStyle(
                                color: _messageIsError
                                    ? Theme.of(context).colorScheme.error
                                    : Theme.of(context).colorScheme.primary,
                              ),
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        _buildMissionSummary(),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          key: const Key('mission-inventory-refresh'),
                          onPressed: _busy ? null : _load,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Serverstand aktualisieren'),
                        ),
                        const SizedBox(height: 16),
                        if (_selectedTruth case final truth?) ...<Widget>[
                          _buildResolution(truth),
                          const SizedBox(height: 12),
                          _buildQuorumReadback(),
                          const SizedBox(height: 12),
                          FilledButton.icon(
                            key: const Key('mission-inventory-correct'),
                            onPressed: _busy ? null : _startCorrection,
                            icon: const Icon(Icons.edit_outlined),
                            label: const Text('Explizit neu auflösen'),
                          ),
                        ] else
                          FilledButton.icon(
                            key: const Key('mission-inventory-new'),
                            onPressed: _busy ? null : _startNew,
                            icon: const Icon(Icons.add),
                            label:
                                const Text('Inventar unverbindlich auflösen'),
                          ),
                        if (_editing) ...<Widget>[
                          const SizedBox(height: 20),
                          _buildEditor(),
                        ],
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _buildMissionSummary() {
    final mission = _mission;
    return Card(
      child: ListTile(
        title: Text(mission?.payload.title ?? 'Mission nicht verfügbar'),
        subtitle: mission == null
            ? null
            : Text(
                '${mission.status == MissionNeedStatus.draft ? 'Entwurf' : 'Geplant'} · Server-Revision ${mission.revision}',
              ),
      ),
    );
  }

  Widget _buildResolution(MissionInventoryResolution value) {
    final snapshot = value.storedResolution;
    final stale =
        value.currentApplicability == MissionInventoryApplicability.stale;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Card(
          child: ListTile(
            leading: Icon(
              stale ? Icons.warning_amber_outlined : Icons.check_circle_outline,
            ),
            title: Text(
              stale
                  ? 'Aktuell unbekannt / veraltet'
                  : 'Aktuelle unverbindliche Momentaufnahme',
            ),
            subtitle: Text(
              '${_dateLabel(value.startDate)} bis ${_dateLabel(value.endDate)} · Suchradius ${value.locationSnapshot.radiusKm} km · Server-Revision ${value.revision}\n'
              'Suchmittelpunkt vom Eigentümer bestätigt; exakte Koordinaten nicht gespeichert.',
            ),
          ),
        ),
        if (stale)
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: ListTile(
              title: const Text('Erneute Prüfung erforderlich'),
              subtitle: Text(value.driftReasons.map(_driftLabel).join(' · ')),
            ),
          ),
        if (snapshot.searchLimited)
          const Card(
            child: ListTile(
              leading: Icon(Icons.filter_alt_outlined),
              title: Text('Suche war begrenzt'),
              subtitle: Text(
                'Pro Bedarf wurden höchstens 24 Kandidaten bewertet. Das Ergebnis ist weder vollständig noch optimal.',
              ),
            ),
          ),
        Text('Bedarfsabdeckung',
            style: Theme.of(context).textTheme.titleMedium),
        ...snapshot.coverage.map(_buildCoverage),
        const SizedBox(height: 8),
        Text('Zuordnungen und Lücken',
            style: Theme.of(context).textTheme.titleMedium),
        ...snapshot.slots.map(_buildSlot),
      ],
    );
  }

  Widget _buildQuorumReadback() {
    final quorum = _quorum;
    final title = quorum == null
        ? 'Missionstand unverbindlich lesen'
        : switch (quorum.status) {
            MissionQuorumReadbackStatus.needsClarification =>
              'Missionstand braucht Klärung',
            MissionQuorumReadbackStatus.readbackRequired =>
              'Missionstand muss erneut gelesen werden',
            MissionQuorumReadbackStatus.incomplete =>
              'Missionstand: nicht vollständig',
          };
    return Card(
      key: const Key('mission-quorum-card'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                quorum?.status == MissionQuorumReadbackStatus.needsClarification
                    ? Icons.warning_amber_outlined
                    : Icons.account_tree_outlined,
              ),
              title: Text(title),
              subtitle: const Text(
                'Nur aktueller Serverstand. Nicht bindend, keine Eignungs- oder Buchungsbestätigung, kein Vertrag und keine Zahlung.',
              ),
            ),
            if (_quorumLoadFailed)
              const Text(
                'Der Serverstand ist nicht bestätigt. Bitte erneut lesen.',
                key: Key('mission-quorum-error'),
              ),
            if (quorum != null)
              ...quorum.components
                  .where((entry) => entry.necessity == 'required')
                  .map(_buildQuorumSlot),
            OutlinedButton.icon(
              key: const Key('mission-quorum-refresh'),
              onPressed: _quorumLoading ? null : _loadQuorum,
              icon: _quorumLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
              label: Text(_quorumLoading
                  ? 'Serverstand wird gelesen …'
                  : 'Serverstand lesen'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuorumSlot(MissionQuorumSlotReadback value) => ListTile(
        key: ValueKey('mission-quorum-slot-${value.slotKey}'),
        dense: true,
        contentPadding: EdgeInsets.zero,
        leading: Icon(_quorumSlotIcon(value.state)),
        title: Text(_quorumNeedLabel(value.necessity)),
        subtitle: Text(
          'Erforderlich · Einheit ${value.ordinal} · ${_quorumSlotLabel(value.state)}',
        ),
      );

  IconData _quorumSlotIcon(MissionQuorumSlotState state) => switch (state) {
        MissionQuorumSlotState.covered => Icons.check_circle_outline,
        MissionQuorumSlotState.open => Icons.remove_circle_outline,
        MissionQuorumSlotState.staleOrUnknown => Icons.help_outline,
        MissionQuorumSlotState.clarificationRequired =>
          Icons.warning_amber_outlined,
      };

  String _quorumSlotLabel(MissionQuorumSlotState state) => switch (state) {
        MissionQuorumSlotState.covered => 'aktuell abgedeckt',
        MissionQuorumSlotState.open => 'offen',
        MissionQuorumSlotState.staleOrUnknown => 'veraltet oder unbekannt',
        MissionQuorumSlotState.clarificationRequired => 'Klärung erforderlich',
      };

  String _quorumNeedLabel(String necessity) => necessity == 'required'
      ? 'Erforderlicher Gegenstand'
      : 'Optionaler Gegenstand';

  Widget _buildCoverage(MissionInventoryCoverage value) => Card(
        child: ListTile(
          title: Text(value.needKey),
          subtitle: Text(
            '${value.necessity == 'required' ? 'Erforderlich' : 'Optional'} · '
            '${value.coveredQuantity}/${value.requestedQuantity} zugeordnet · '
            '${value.gapQuantity} offen'
            '${value.supported ? '' : ' · Bedarfstyp nicht unterstützt'}'
            '${value.searchLimited ? ' · Suche begrenzt' : ''}',
          ),
        ),
      );

  Widget _buildSlot(MissionInventorySlot value) {
    final assignment = value.assignment;
    final mayRequest = assignment == null &&
        _demandAvailable &&
        value.gapReason == 'no_current_unique_candidate' &&
        _selectedTruth?.currentApplicability ==
            MissionInventoryApplicability.current;
    return Card(
      child: Column(
        children: <Widget>[
          ListTile(
            leading: Icon(
              assignment == null
                  ? Icons.remove_circle_outline
                  : Icons.inventory,
            ),
            title: Text(
              assignment?.title ??
                  (value.gapReason == 'unsupported_need_key'
                      ? 'Lücke: Bedarfstyp nicht unterstützt'
                      : 'Lücke: kein aktueller eindeutiger Kandidat'),
            ),
            subtitle: assignment == null
                ? Text(
                    '${value.necessity == 'required' ? 'Erforderlich' : 'Optional'} · ${value.needKey} · Menge 1',
                  )
                : Text(
                    '${assignment.city ?? 'Ort nicht angegeben'}${assignment.country == null ? '' : ', ${assignment.country}'} · ${assignment.distanceKm.toStringAsFixed(1)} km · unverbindliche Quote',
                  ),
          ),
          if (mayRequest)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: ValueKey('mission-inventory-demand-${value.slotKey}'),
                  onPressed: _busy || _supplyDemandRouteOpening
                      ? null
                      : () => _openSupplyDemand(value),
                  icon: const Icon(Icons.send_outlined),
                  label: const Text('Private Anfrage für diese Lücke'),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEditor() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            _selectedBase == null
                ? 'Neue unverbindliche Auflösung'
                : 'Korrektur auf Basis Server-Revision ${_selectedBase!.revision}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  key: const Key('mission-inventory-start-date'),
                  onPressed: _busy ? null : () => _pickDate(start: true),
                  child: Text(
                    _startDate == null
                        ? 'Startdatum wählen'
                        : 'Start: ${_dateLabel(_startDate!)}',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  key: const Key('mission-inventory-end-date'),
                  onPressed: _busy ? null : () => _pickDate(start: false),
                  child: Text(
                    _endDate == null
                        ? 'Enddatum wählen'
                        : 'Ende: ${_dateLabel(_endDate!)}',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('mission-inventory-radius'),
            controller: _radiusController,
            keyboardType: TextInputType.number,
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.digitsOnly,
            ],
            decoration: const InputDecoration(
              labelText: 'Suchradius (km)',
              helperText: '1 bis 500 km',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) {
              _pendingFingerprint = null;
              _pendingIdempotencyKey = null;
            },
            validator: (raw) {
              final value = int.tryParse(raw?.trim() ?? '');
              return value == null || value < 1 || value > 500
                  ? 'Bitte 1 bis 500 km eingeben.'
                  : null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('mission-inventory-location-query'),
            controller: _locationController,
            decoration: const InputDecoration(
              labelText: 'Privater Suchmittelpunkt',
              helperText:
                  'Freitext bestätigt nichts. Wähle ausdrücklich einen Vorschlag aus.',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.place_outlined),
            ),
            onChanged: _busy ? null : _onLocationChanged,
            validator: (_) => _selectedPlace == null
                ? 'Bitte einen Maps-Vorschlag ausdrücklich auswählen.'
                : null,
          ),
          if (_suggestions.isNotEmpty)
            Card(
              child: Column(
                children: _suggestions
                    .map(
                      (suggestion) => ListTile(
                        key: ValueKey(
                          'mission-inventory-place-${suggestion.placeId}',
                        ),
                        minVerticalPadding: 12,
                        title: Text(suggestion.description),
                        onTap:
                            _busy ? null : () => _selectSuggestion(suggestion),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
          if (_selectedPlace != null)
            Semantics(
              liveRegion: true,
              child: const ListTile(
                leading: Icon(Icons.verified_outlined),
                title: Text('Ort ausdrücklich ausgewählt'),
                subtitle: Text(
                  'Nur die bestätigte Anfrage wird gesendet. Exakte Koordinaten werden nicht gespeichert oder später angezeigt.',
                ),
              ),
            ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const Key('mission-inventory-save'),
            onPressed: _busy ? null : _save,
            icon: _actionActive
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.inventory_2_outlined),
            label: Text(
              _selectedBase == null
                  ? 'Unverbindlich auflösen'
                  : 'Als neue Revision korrigieren',
            ),
          ),
        ],
      ),
    );
  }

  String _driftLabel(String code) => switch (code) {
        'listing_missing' => 'Artikel nicht mehr verfügbar',
        'listing_catalog_changed' => 'Anzeigendaten geändert',
        'quote_binding_inputs_changed' => 'Quote-Grundlage geändert',
        'listing_availability_changed' => 'Verfügbarkeit geändert',
        'listing_location_changed' => 'Artikelort geändert',
        'listing_no_longer_candidate' => 'Artikel nicht mehr berechtigt',
        'quote_snapshot_changed' => 'Preisvorschau geändert',
        'listing_unavailable_or_quote_rejected' =>
          'Artikel im Zeitraum nicht mehr verfügbar',
        'mission_snapshot_changed' => 'Mission geändert',
        _ => 'Serverstand geändert',
      };

  String _dateLabel(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}.'
      '${value.month.toString().padLeft(2, '0')}.${value.year}';
}

class _EphemeralPlace {
  const _EphemeralPlace({
    required this.latitudeE5,
    required this.longitudeE5,
  });

  final int latitudeE5;
  final int longitudeE5;
}
