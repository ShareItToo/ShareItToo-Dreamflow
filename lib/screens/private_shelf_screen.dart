import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lendify/models/mission_supply_participation.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/models/private_shelf_item.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/private_shelf_gateway.dart';
import 'package:lendify/services/mission_supply_participation_gateway.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

typedef PrivateShelfIdempotencyKeyFactory = String Function();
typedef PrivateShelfPhotoPicker = Future<XFile?> Function();

@visibleForTesting
String newPrivateShelfIdempotencyKey() {
  final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  return 'shelf-${bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join()}';
}

Future<XFile?> pickPrivateShelfPhoto() => ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1600,
    );

class PrivateShelfScreen extends StatefulWidget {
  const PrivateShelfScreen({
    super.key,
    this.gateway = const BackendPrivateShelfGateway(),
    this.listingMutationService = const ListingMutationService(),
    this.photoPicker = pickPrivateShelfPhoto,
    this.idempotencyKeyFactory = newPrivateShelfIdempotencyKey,
    this.participationGateway,
    this.enableForTesting = false,
  });

  final PrivateShelfGateway gateway;
  final ListingMutationService listingMutationService;
  final PrivateShelfPhotoPicker photoPicker;
  final PrivateShelfIdempotencyKeyFactory idempotencyKeyFactory;
  final MissionSupplyParticipationGateway? participationGateway;

  @visibleForTesting
  final bool enableForTesting;

  @override
  State<PrivateShelfScreen> createState() => _PrivateShelfScreenState();
}

class _PrivateShelfScreenState extends State<PrivateShelfScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _categoryController = TextEditingController();
  final Map<String, Future<PrivateShelfMediaBytes>> _mediaLoads =
      <String, Future<PrivateShelfMediaBytes>>{};
  StreamSubscription<String>? _sessionSubscription;
  TrackedDialogRouteHandle<bool>? _deleteDialog;
  TrackedDialogRouteHandle<void>? _photoDialog;
  ListingMutationContext? _context;
  List<PrivateShelfItem> _items = const <PrivateShelfItem>[];
  PrivateShelfItem? _selected;
  PrivateShelfCondition _condition = PrivateShelfCondition.good;
  bool _creating = false;
  Uint8List? _pickedPhotoBytes;
  String? _pickedPhotoName;
  bool _uploadOutcomeUnknown = false;
  bool _loading = true;
  bool _busy = false;
  bool _deleteFlowActive = false;
  bool _photoFlowActive = false;
  bool _pickerFlowActive = false;
  int _accountGeneration = 0;
  int _mediaGeneration = 0;
  String? _message;
  bool _messageIsError = false;
  String? _pendingCreateFingerprint;
  String? _pendingCreateKey;
  MissionSupplyParticipationSnapshot? _participationSnapshot;
  bool _participationLoading = false;
  bool _participationLoadFailed = false;
  bool _participationBusy = false;
  String? _participationMessage;
  bool _participationMessageIsError = false;

  bool get _available =>
      PlannerTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  bool get _participationAvailable =>
      PlannerTechnicalConfig.supplyParticipationAvailable ||
      (widget.participationGateway != null &&
          (!kReleaseMode && widget.enableForTesting));

  MissionSupplyParticipationGateway get _participationGateway =>
      widget.participationGateway ??
      const BackendMissionSupplyParticipationGateway();

  @override
  void initState() {
    super.initState();
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _accountGeneration += 1;
      final deleteDialog = _deleteDialog;
      final photoDialog = _photoDialog;
      _deleteDialog = null;
      _photoDialog = null;
      deleteDialog?.dismiss(false);
      photoDialog?.dismiss();
      if (mounted) {
        setState(() {
          _context = null;
          _items = const <PrivateShelfItem>[];
          _clearEditor();
          _loading = true;
          _busy = false;
          _deleteFlowActive = false;
          _photoFlowActive = false;
          _pickerFlowActive = false;
          _message = null;
          _participationSnapshot = null;
          _participationLoading = false;
          _participationLoadFailed = false;
          _participationBusy = false;
          _participationMessage = null;
        });
      }
      unawaited(_load());
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    _accountGeneration += 1;
    _deleteDialog?.dismiss(false);
    _photoDialog?.dismiss();
    _sessionSubscription?.cancel();
    _titleController.dispose();
    _categoryController.dispose();
    _clearPrivateMedia();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = _accountGeneration;
    ListingMutationContext? attemptedContext;
    if (!_available) {
      if (mounted && generation == _accountGeneration) {
        setState(() => _loading = false);
      }
      return;
    }
    try {
      final context = await widget.listingMutationService.loadCurrentContext();
      attemptedContext = context;
      if (context == null || generation != _accountGeneration) {
        throw StateError('private_shelf_authentication_required');
      }
      final items = await widget.gateway.list(context.owner.authOwner);
      if (!await _mayUpdate(context, generation)) return;
      final photoDialog = _photoDialog;
      _photoDialog = null;
      photoDialog?.dismiss();
      setState(() {
        final selectedId = _selected?.shelfItemId;
        _context = context;
        _items = items;
        _mediaGeneration += 1;
        _mediaLoads.clear();
        if (selectedId != null) {
          PrivateShelfItem? refreshed;
          for (final item in items) {
            if (item.shelfItemId == selectedId) {
              refreshed = item;
              break;
            }
          }
          if (refreshed == null) {
            _clearEditor();
          } else {
            _applyServerItem(refreshed);
          }
        }
        _loading = false;
        _message = null;
        _messageIsError = false;
      });
      if (_participationAvailable) {
        unawaited(_loadParticipation(context, generation));
      }
    } catch (_) {
      if (!mounted || generation != _accountGeneration) return;
      final previousContext = _context;
      var preserveDraft = _creating &&
          _selected == null &&
          attemptedContext != null &&
          previousContext != null &&
          _sameOwner(previousContext, attemptedContext);
      if (preserveDraft) {
        try {
          preserveDraft = await widget.listingMutationService
              .isContextCurrent(attemptedContext);
        } catch (_) {
          preserveDraft = false;
        }
      }
      if (!mounted || generation != _accountGeneration) return;
      setState(() {
        if (!preserveDraft) {
          _context = null;
          _items = const <PrivateShelfItem>[];
          _clearEditor();
        }
        _loading = false;
        _message =
            'Dein privates Regal konnte für das aktuell angemeldete Konto nicht sicher geladen werden.';
        _messageIsError = true;
      });
    }
  }

  Future<void> _loadParticipation(
    ListingMutationContext context,
    int generation,
  ) async {
    if (!_participationAvailable ||
        !mounted ||
        generation != _accountGeneration) {
      return;
    }
    setState(() {
      _participationLoading = true;
      _participationLoadFailed = false;
    });
    try {
      final snapshot =
          await _participationGateway.load(context.owner.authOwner);
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationSnapshot = snapshot;
        _participationLoadFailed = false;
        _participationMessage = null;
        _participationMessageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationSnapshot = null;
        _participationLoadFailed = true;
        _participationMessage =
            'Die private Teilnahme konnte für dieses Konto nicht sicher geladen werden.';
        _participationMessageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _participationLoading = false);
      }
    }
  }

  Future<void> _retryParticipationLoad() async {
    final context = _context;
    if (context == null || _participationLoading) return;
    await _loadParticipation(context, _accountGeneration);
  }

  Future<void> _refreshParticipationAfterConflict(
    ListingMutationContext context,
    int generation,
  ) async {
    if (!await _mayUpdate(context, generation)) return;
    setState(() {
      _participationLoading = true;
      _participationLoadFailed = false;
    });
    try {
      final snapshot =
          await _participationGateway.load(context.owner.authOwner);
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationSnapshot = snapshot;
        _participationMessage = 'Stand aktualisiert – bitte erneut versuchen';
        _participationMessageIsError = true;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationLoadFailed = true;
        _participationMessage =
            'Stand konnte nicht aktualisiert werden. Bitte erneut laden.';
        _participationMessageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _participationLoading = false);
      }
    }
  }

  Future<void> _setParticipationStatus() async {
    final context = _context;
    if (context == null || _participationBusy || !_participationAvailable) {
      return;
    }
    final current = _participationSnapshot?.participation;
    final status = current?.status == MissionSupplyParticipationStatus.active
        ? MissionSupplyParticipationStatus.withdrawn
        : MissionSupplyParticipationStatus.active;
    final generation = _accountGeneration;
    setState(() {
      _participationBusy = true;
      _participationMessage = null;
    });
    try {
      final result = await _participationGateway.setParticipation(
        owner: context.owner.authOwner,
        status: status,
        expectedRevision: current?.currentRevision ?? 0,
        idempotencyKey: widget.idempotencyKeyFactory(),
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationSnapshot = result.snapshot;
        _participationMessage = result.replayed
            ? 'Der private Teilnahmestand wurde erneut bestätigt.'
            : status == MissionSupplyParticipationStatus.active
                ? 'Private Teilnahme aktiviert.'
                : 'Private Teilnahme zurückgezogen.';
        _participationMessageIsError = false;
      });
    } catch (error) {
      if (error is BackendException && error.statusCode == 409) {
        await _refreshParticipationAfterConflict(context, generation);
        return;
      }
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationMessage =
            'Teilnahme nicht bestätigt. Es wurde keine öffentliche Wirkung ausgelöst.';
        _participationMessageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _participationBusy = false);
      }
    }
  }

  Future<void> _setParticipationItem(PrivateShelfItem item) async {
    final context = _context;
    final snapshot = _participationSnapshot;
    final participation = snapshot?.participation;
    if (context == null ||
        participation == null ||
        participation.status != MissionSupplyParticipationStatus.active ||
        _participationBusy ||
        !_participationAvailable ||
        item.categoryKey != missionSupplyParticipationNeedKey) {
      return;
    }
    final existing = participation.items.where(
      (entry) =>
          entry.availabilityStatus ==
          MissionSupplyParticipationAvailability.confirmedAvailable,
    );
    MissionSupplyParticipationItem? current;
    for (final entry in participation.items) {
      if (entry.shelfItemId == item.shelfItemId) {
        current = entry;
        break;
      }
    }
    final next = current?.availabilityStatus ==
            MissionSupplyParticipationAvailability.confirmedAvailable
        ? MissionSupplyParticipationAvailability.withdrawn
        : MissionSupplyParticipationAvailability.confirmedAvailable;
    if (next == MissionSupplyParticipationAvailability.confirmedAvailable &&
        existing.any((entry) => entry.shelfItemId != item.shelfItemId)) {
      setState(() {
        _participationMessage =
            'Es kann genau ein passendes Regalobjekt bestätigt werden.';
        _participationMessageIsError = true;
      });
      return;
    }
    final generation = _accountGeneration;
    setState(() {
      _participationBusy = true;
      _participationMessage = null;
    });
    try {
      final result = await _participationGateway.setItem(
        owner: context.owner.authOwner,
        shelfItemId: item.shelfItemId,
        availabilityStatus: next,
        expectedParticipationRevision: participation.currentRevision,
        expectedRevision: current?.revision ?? 0,
        idempotencyKey: widget.idempotencyKeyFactory(),
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationSnapshot = result.snapshot;
        _participationMessage = result.replayed
            ? 'Der private Objektstand wurde erneut bestätigt.'
            : next == MissionSupplyParticipationAvailability.confirmedAvailable
                ? 'Ein privates Regalobjekt ist für deine private Teilnahme vorgemerkt.'
                : 'Das private Regalobjekt ist nicht mehr vorgemerkt.';
        _participationMessageIsError = false;
      });
    } catch (error) {
      if (error is BackendException && error.statusCode == 409) {
        await _refreshParticipationAfterConflict(context, generation);
        return;
      }
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _participationMessage =
            'Objekt nicht bestätigt. Es wurde keine öffentliche Wirkung ausgelöst.';
        _participationMessageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _participationBusy = false);
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

  bool _sameOwner(
    ListingMutationContext first,
    ListingMutationContext second,
  ) {
    final left = first.owner.authOwner;
    final right = second.owner.authOwner;
    return left.userId == right.userId &&
        left.sessionId == right.sessionId &&
        left.email == right.email &&
        left.createdAt == right.createdAt &&
        left.epoch == right.epoch;
  }

  void _clearPrivateMedia() {
    _mediaGeneration += 1;
    _mediaLoads.clear();
    _pickedPhotoBytes = null;
    _pickedPhotoName = null;
    _uploadOutcomeUnknown = false;
  }

  void _clearEditor() {
    _selected = null;
    _creating = false;
    _titleController.clear();
    _categoryController.clear();
    _condition = PrivateShelfCondition.good;
    _pendingCreateFingerprint = null;
    _pendingCreateKey = null;
    _clearPrivateMedia();
  }

  void _startNew() {
    setState(() {
      _clearEditor();
      _creating = true;
      _message = null;
      _messageIsError = false;
    });
  }

  void _applyServerItem(PrivateShelfItem item) {
    _selected = item;
    _creating = false;
    _titleController.text = item.title;
    _categoryController.text = item.categoryKey;
    _condition = item.condition;
    _pendingCreateFingerprint = null;
    _pendingCreateKey = null;
    _pickedPhotoBytes = null;
    _pickedPhotoName = null;
    _uploadOutcomeUnknown = false;
    _mediaLoads.removeWhere((key, _) => key.startsWith('${item.shelfItemId}:'));
  }

  Future<void> _openItem(PrivateShelfItem summary) async {
    final context = _context;
    if (_busy || context == null) return;
    final generation = _accountGeneration;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final item = await widget.gateway.load(
        owner: context.owner.authOwner,
        shelfItemId: summary.shelfItemId,
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _applyServerItem(item);
        _message = 'Privater Serverstand geladen.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message =
            'Das private Objekt konnte nicht sicher geladen werden. Deine Liste bleibt unverändert.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _busy = false);
      }
    }
  }

  PrivateShelfItemPayload? _validatedPayload() {
    if (!(_formKey.currentState?.validate() ?? false)) return null;
    return PrivateShelfItemPayload(
      title: _titleController.text.trim(),
      categoryKey: _categoryController.text.trim(),
      condition: _condition,
    );
  }

  String _idempotencyKey(PrivateShelfItemPayload payload) {
    final fingerprint = jsonEncode(payload.toJson());
    if (_pendingCreateFingerprint != fingerprint || _pendingCreateKey == null) {
      _pendingCreateFingerprint = fingerprint;
      _pendingCreateKey = widget.idempotencyKeyFactory();
    }
    return _pendingCreateKey!;
  }

  Future<void> _create() async {
    final context = _context;
    if (_busy || context == null || _selected != null) return;
    final payload = _validatedPayload();
    if (payload == null) return;
    final generation = _accountGeneration;
    final idempotencyKey = _idempotencyKey(payload);
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      if (!await _mayUpdate(context, generation)) return;
      final result = await widget.gateway.create(
        owner: context.owner.authOwner,
        payload: payload,
        idempotencyKey: idempotencyKey,
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _items = <PrivateShelfItem>[
          result.shelfItem,
          ..._items.where(
            (item) => item.shelfItemId != result.shelfItem.shelfItemId,
          ),
        ];
        _applyServerItem(result.shelfItem);
        _message = result.replayed
            ? 'Der bereits bestätigte private Serverstand wurde geladen.'
            : 'Privates Objekt gespeichert. Es wurde kein Inserat erstellt.';
        _messageIsError = false;
      });
    } on BackendException catch (error) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message = error.statusCode == 409
            ? 'Speichern nicht bestätigt (${error.code}). Deine Eingaben bleiben erhalten.'
            : 'Speichern nicht bestätigt. Deine Eingaben bleiben erhalten; es wurde kein Inserat erstellt.';
        _messageIsError = true;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message =
            'Speichern nicht bestätigt. Deine Eingaben bleiben erhalten; es wurde kein Inserat erstellt.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _pickPhoto() async {
    final context = _context;
    if (_busy || _pickerFlowActive || context == null || _selected == null) {
      return;
    }
    final generation = _accountGeneration;
    setState(() => _pickerFlowActive = true);
    try {
      if (!await _mayUpdate(context, generation)) return;
      final file = await widget.photoPicker();
      if (file == null || !await _mayUpdate(context, generation)) return;
      final bytes = await file.readAsBytes();
      if (!await _mayUpdate(context, generation)) return;
      if (bytes.isEmpty || bytes.length > 8 * 1024 * 1024) {
        throw StateError('private_shelf_photo_size_invalid');
      }
      setState(() {
        _pickedPhotoBytes = bytes;
        _pickedPhotoName = file.name;
        _uploadOutcomeUnknown = false;
        _message = 'Privates Foto ausgewählt. Noch nicht hochgeladen.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message =
            'Das private Foto konnte nicht sicher ausgewählt werden. Vorhandene Daten bleiben erhalten.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _pickerFlowActive = false);
      }
    }
  }

  Future<void> _uploadPhoto() async {
    final context = _context;
    final item = _selected;
    final bytes = _pickedPhotoBytes;
    final filename = _pickedPhotoName;
    if (_busy ||
        context == null ||
        item == null ||
        bytes == null ||
        filename == null ||
        _uploadOutcomeUnknown) {
      return;
    }
    final generation = _accountGeneration;
    setState(() {
      _busy = true;
      _message = null;
    });
    var accepted = false;
    try {
      if (!await _mayUpdate(context, generation)) return;
      await widget.gateway.uploadMedia(
        owner: context.owner.authOwner,
        shelfItemId: item.shelfItemId,
        bytes: bytes,
        filename: filename,
      );
      accepted = true;
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _pickedPhotoBytes = null;
        _pickedPhotoName = null;
      });
      final refreshed = await widget.gateway.load(
        owner: context.owner.authOwner,
        shelfItemId: item.shelfItemId,
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _items = <PrivateShelfItem>[
          refreshed,
          ..._items.where(
            (entry) => entry.shelfItemId != refreshed.shelfItemId,
          ),
        ];
        _applyServerItem(refreshed);
        _message = 'Privates Foto hochgeladen und Serverstand neu geladen.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        if (accepted) {
          _pickedPhotoBytes = null;
          _pickedPhotoName = null;
          _uploadOutcomeUnknown = false;
          _message =
              'Foto wurde angenommen, aber der neue Serverstand konnte nicht geladen werden. Nicht erneut senden; lade das Objekt neu.';
        } else {
          _uploadOutcomeUnknown = true;
          _message =
              'Upload nicht bestätigt. Das Foto wird nicht automatisch erneut gesendet. Lade zuerst den Serverstand neu.';
        }
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _deleteSelected() async {
    final context = _context;
    final item = _selected;
    if (_busy || _deleteFlowActive || context == null || item == null) return;
    final generation = _accountGeneration;
    setState(() => _deleteFlowActive = true);
    TrackedDialogRouteHandle<bool>? handle;
    try {
      final dialogContext = this.context;
      handle = TrackedDialogRouteHandle<bool>();
      _deleteDialog = handle;
      final confirmed = await showTrackedDialog<bool>(
        context: dialogContext,
        handle: handle,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Privates Objekt löschen?'),
          content: Text(
            '„${item.title}“ und seine privaten Fotos werden gelöscht. Es wird kein Inserat verändert.',
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Privat löschen'),
            ),
          ],
        ),
      );
      if (identical(_deleteDialog, handle)) _deleteDialog = null;
      if (confirmed != true || !await _mayUpdate(context, generation)) return;
      setState(() {
        _busy = true;
        _message = null;
      });
      await widget.gateway.delete(
        owner: context.owner.authOwner,
        shelfItemId: item.shelfItemId,
      );
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _items = _items
            .where((entry) => entry.shelfItemId != item.shelfItemId)
            .toList(growable: false);
        _clearEditor();
        _message = 'Privates Objekt gelöscht.';
        _messageIsError = false;
      });
    } catch (_) {
      if (!await _mayUpdate(context, generation)) return;
      setState(() {
        _message =
            'Löschen nicht bestätigt. Das Objekt bleibt angezeigt, bis ein neuer Serverstand geladen wurde.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() {
          _busy = false;
          _deleteFlowActive = false;
        });
      }
      if (identical(_deleteDialog, handle)) _deleteDialog = null;
    }
  }

  Future<PrivateShelfMediaBytes> _loadMedia(
    ListingMutationContext context,
    int generation,
    int mediaGeneration,
    PrivateShelfItem item,
    PrivateShelfMedia media, {
    required bool thumbnail,
  }) async {
    if (mediaGeneration != _mediaGeneration ||
        !await _mayUpdate(context, generation)) {
      throw StateError('private_shelf_principal_changed');
    }
    final result = await widget.gateway.readMedia(
      owner: context.owner.authOwner,
      shelfItemId: item.shelfItemId,
      media: media,
      thumbnail: thumbnail,
    );
    if (mediaGeneration != _mediaGeneration ||
        !await _mayUpdate(context, generation)) {
      throw StateError('private_shelf_principal_changed');
    }
    return result;
  }

  Future<PrivateShelfMediaBytes> _mediaFuture(
    PrivateShelfItem item,
    PrivateShelfMedia media,
  ) {
    final context = _context;
    if (context == null) {
      return Future<PrivateShelfMediaBytes>.error(
        StateError('private_shelf_authentication_required'),
      );
    }
    final generation = _accountGeneration;
    final mediaGeneration = _mediaGeneration;
    final key = '${item.shelfItemId}:${media.mediaId}:thumbnail:'
        '$generation:$mediaGeneration';
    return _mediaLoads.putIfAbsent(
      key,
      () => _loadMedia(
        context,
        generation,
        mediaGeneration,
        item,
        media,
        thumbnail: true,
      ),
    );
  }

  Future<void> _showFullPhoto(
    PrivateShelfItem item,
    PrivateShelfMedia media,
  ) async {
    final context = _context;
    if (context == null || _busy || _photoFlowActive) return;
    final generation = _accountGeneration;
    final mediaGeneration = _mediaGeneration;
    setState(() => _photoFlowActive = true);
    TrackedDialogRouteHandle<void>? handle;
    try {
      final image = await _loadMedia(
        context,
        generation,
        mediaGeneration,
        item,
        media,
        thumbnail: false,
      );
      if (!await _mayUpdate(context, generation)) return;
      final dialogContext = this.context;
      if (!dialogContext.mounted) return;
      handle = TrackedDialogRouteHandle<void>();
      _photoDialog = handle;
      await showTrackedDialog<void>(
        context: dialogContext,
        handle: handle,
        builder: (dialogContext) => Dialog(
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minWidth: 280,
              minHeight: 280,
              maxWidth: 800,
              maxHeight: 800,
            ),
            child: Stack(
              children: <Widget>[
                Semantics(
                  image: true,
                  label: 'Privates Foto von ${item.title}',
                  child: Image.memory(image.bytes, fit: BoxFit.contain),
                ),
                Positioned(
                  right: 8,
                  top: 8,
                  child: IconButton.filled(
                    key: const Key('private-shelf-photo-close'),
                    tooltip: 'Foto schließen',
                    constraints:
                        const BoxConstraints(minWidth: 48, minHeight: 48),
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      if (identical(_photoDialog, handle)) _photoDialog = null;
    } catch (_) {
      if (mediaGeneration != _mediaGeneration ||
          !await _mayUpdate(context, generation)) {
        return;
      }
      setState(() {
        _message = 'Das private Foto konnte nicht sicher geladen werden.';
        _messageIsError = true;
      });
    } finally {
      if (mounted && generation == _accountGeneration) {
        setState(() => _photoFlowActive = false);
      }
      if (identical(_photoDialog, handle)) _photoDialog = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mein Regal')),
      body: SafeArea(
        child: !_available
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Das private Regal ist nur im freigegebenen internen Pilot verfügbar.',
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
                              'Privat. Kein Inserat, keine Suche, Reservierung, Buchung oder Zahlung.',
                          child: const Card(
                            child: ListTile(
                              leading: Icon(Icons.lock_outline),
                              title: Text('Privat · kein Inserat'),
                              subtitle: Text(
                                'Nur du kannst deine Regalobjekte und privaten Fotos sehen. Es entsteht keine öffentliche Anzeige.',
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
                              key: const Key('private-shelf-message'),
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
                          key: const Key('private-shelf-new'),
                          onPressed:
                              _busy || _context == null ? null : _startNew,
                          icon: const Icon(Icons.add),
                          label: const Text('Privates Objekt anlegen'),
                        ),
                        const SizedBox(height: 16),
                        Text('Meine privaten Objekte',
                            style: Theme.of(context).textTheme.titleMedium),
                        if (_items.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child:
                                Text('Noch kein privates Objekt gespeichert.'),
                          )
                        else
                          ..._items.map(_buildItemCard),
                        if (_participationAvailable) ...<Widget>[
                          const SizedBox(height: 20),
                          _buildParticipationCard(context),
                        ],
                        if (_selected == null && _creating) ...<Widget>[
                          const SizedBox(height: 20),
                          _buildCreateForm(context),
                        ] else if (_selected != null) ...<Widget>[
                          const SizedBox(height: 20),
                          _buildSelected(context, _selected!),
                        ],
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _buildParticipationCard(BuildContext context) {
    final snapshot = _participationSnapshot;
    if (_participationLoading || snapshot == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _participationLoading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const Text(
                        'Private Teilnahme konnte nicht geladen werden.'),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      key: const Key('mission-supply-participation-retry'),
                      onPressed: _participationLoadFailed
                          ? _retryParticipationLoad
                          : null,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Erneut laden'),
                    ),
                  ],
                ),
        ),
      );
    }
    final participation = snapshot.participation;
    final active =
        participation?.status == MissionSupplyParticipationStatus.active;
    final eligibleItems = _items
        .where((item) => item.categoryKey == missionSupplyParticipationNeedKey)
        .toList(growable: false);
    final confirmed = participation?.items
            .where((item) =>
                item.availabilityStatus ==
                MissionSupplyParticipationAvailability.confirmedAvailable)
            .toList(growable: false) ??
        const <MissionSupplyParticipationItem>[];
    return Card(
      key: const Key('mission-supply-participation-card'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Private Teilnahme',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text(
              'Nur für deine private Teilnahme. Keine öffentliche Anzeige, Suche, Nachricht, Buchung oder Zahlung. Eine automatische Zuordnung bleibt aus.',
            ),
            const SizedBox(height: 12),
            Semantics(
              button: true,
              label: active
                  ? 'Private Teilnahme zurückziehen'
                  : 'Private Teilnahme aktivieren',
              child: OutlinedButton.icon(
                key: const Key('mission-supply-participation-toggle'),
                onPressed: _participationBusy ? null : _setParticipationStatus,
                icon: Icon(active ? Icons.pause : Icons.play_arrow),
                label: Text(active
                    ? 'Private Teilnahme zurückziehen'
                    : 'Private Teilnahme aktivieren'),
              ),
            ),
            if (active) ...<Widget>[
              const SizedBox(height: 12),
              Text('Genau ein eigenes passendes Regalobjekt bestätigen:',
                  style: Theme.of(context).textTheme.titleSmall),
              if (eligibleItems.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Lege zuerst ein passendes privates Pflanzobjekt an.',
                  ),
                )
              else
                ...eligibleItems.map((item) {
                  MissionSupplyParticipationItem? participationItem;
                  for (final entry in participation?.items ??
                      const <MissionSupplyParticipationItem>[]) {
                    if (entry.shelfItemId == item.shelfItemId) {
                      participationItem = entry;
                      break;
                    }
                  }
                  final isConfirmed = participationItem?.availabilityStatus ==
                      MissionSupplyParticipationAvailability.confirmedAvailable;
                  final anotherConfirmed = confirmed.any(
                    (entry) => entry.shelfItemId != item.shelfItemId,
                  );
                  return ListTile(
                    key: ValueKey('mission-supply-item-${item.shelfItemId}'),
                    contentPadding: EdgeInsets.zero,
                    title: Text(item.title),
                    subtitle: Text(isConfirmed
                        ? 'Privat vorgemerkt · passendes Objekt'
                        : 'Privat verfügbar · passendes Objekt'),
                    trailing: OutlinedButton(
                      key: ValueKey(
                          'mission-supply-item-toggle-${item.shelfItemId}'),
                      onPressed: _participationBusy ||
                              (!isConfirmed && anotherConfirmed)
                          ? null
                          : () => _setParticipationItem(item),
                      child: Text(isConfirmed ? 'Zurückziehen' : 'Bestätigen'),
                    ),
                  );
                }),
            ],
            if (_participationMessage != null) ...<Widget>[
              const SizedBox(height: 8),
              Semantics(
                liveRegion: true,
                child: Text(
                  _participationMessage!,
                  key: const Key('mission-supply-participation-message'),
                  style: TextStyle(
                    color: _participationMessageIsError
                        ? Theme.of(context).colorScheme.error
                        : Theme.of(context).colorScheme.primary,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildItemCard(PrivateShelfItem item) {
    final media = item.media.isEmpty ? null : item.media.first;
    return Card(
      child: ListTile(
        minLeadingWidth: 64,
        leading: SizedBox.square(
          dimension: 64,
          child: media == null
              ? const Icon(Icons.inventory_2_outlined)
              : FutureBuilder<PrivateShelfMediaBytes>(
                  future: _mediaFuture(item, media),
                  builder: (context, snapshot) => snapshot.hasData
                      ? Semantics(
                          image: true,
                          label: 'Privates Vorschaubild von ${item.title}',
                          child: Image.memory(
                            snapshot.data!.bytes,
                            fit: BoxFit.cover,
                          ),
                        )
                      : const Icon(Icons.lock_outline),
                ),
        ),
        title: Text(item.title),
        subtitle: Text(
          '${item.categoryKey} · ${_conditionLabel(item.condition)}\nPrivat · kein Inserat',
        ),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
        onTap: _busy ? null : () => _openItem(item),
      ),
    );
  }

  Widget _buildCreateForm(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('Neues privates Objekt',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('private-shelf-title'),
            controller: _titleController,
            maxLength: 160,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Bezeichnung',
              border: OutlineInputBorder(),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return 'Bitte eine Bezeichnung eingeben.';
              if (text.length > 160) return 'Maximal 160 Zeichen.';
              return null;
            },
          ),
          const SizedBox(height: 8),
          TextFormField(
            key: const Key('private-shelf-category'),
            controller: _categoryController,
            maxLength: 80,
            decoration: const InputDecoration(
              labelText: 'Kategorie',
              helperText: '2–80 Zeichen, z. B. werkzeug',
              border: OutlineInputBorder(),
            ),
            validator: (value) {
              if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$')
                  .hasMatch(value?.trim() ?? '')) {
                return 'Bitte eine gültige Kategorie eingeben.';
              }
              return null;
            },
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<PrivateShelfCondition>(
            key: ValueKey('private-shelf-condition-${_condition.name}'),
            initialValue: _condition,
            decoration: const InputDecoration(
              labelText: 'Zustand',
              border: OutlineInputBorder(),
            ),
            items: PrivateShelfCondition.values
                .map(
                  (condition) => DropdownMenuItem<PrivateShelfCondition>(
                    value: condition,
                    child: Text(_conditionLabel(condition)),
                  ),
                )
                .toList(growable: false),
            onChanged: _busy
                ? null
                : (value) {
                    if (value != null) setState(() => _condition = value);
                  },
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const Key('private-shelf-create'),
            onPressed: _busy ? null : _create,
            icon: const Icon(Icons.lock_outline),
            label: const Text('Privat speichern'),
          ),
        ],
      ),
    );
  }

  Widget _buildSelected(BuildContext context, PrivateShelfItem item) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(item.title, style: Theme.of(context).textTheme.titleLarge),
        Text('${item.categoryKey} · ${_conditionLabel(item.condition)}'),
        const Text('Privat · kein Inserat'),
        const SizedBox(height: 12),
        if (item.media.isEmpty)
          const Text('Noch kein privates Foto gespeichert.')
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: item.media
                .map(
                  (media) => Semantics(
                    button: true,
                    image: true,
                    label: 'Privates Foto von ${item.title} vergrößern',
                    child: InkWell(
                      key: ValueKey('private-shelf-photo-${media.mediaId}'),
                      onTap: _busy || _photoFlowActive
                          ? null
                          : () => _showFullPhoto(item, media),
                      child: SizedBox.square(
                        dimension: 96,
                        child: FutureBuilder<PrivateShelfMediaBytes>(
                          future: _mediaFuture(item, media),
                          builder: (context, snapshot) => snapshot.hasData
                              ? Image.memory(
                                  snapshot.data!.bytes,
                                  fit: BoxFit.cover,
                                )
                              : const DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: Color(0x14000000),
                                  ),
                                  child: Icon(Icons.lock_outline),
                                ),
                        ),
                      ),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          key: const Key('private-shelf-pick-photo'),
          onPressed: _busy || _pickerFlowActive ? null : _pickPhoto,
          icon: const Icon(Icons.photo_library_outlined),
          label: const Text('Ein privates Foto auswählen'),
        ),
        if (_pickedPhotoBytes != null) ...<Widget>[
          const SizedBox(height: 8),
          Semantics(
            image: true,
            label: 'Ausgewähltes privates Foto, noch nicht hochgeladen',
            child: SizedBox(
              height: 160,
              child: Image.memory(_pickedPhotoBytes!, fit: BoxFit.contain),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('private-shelf-upload-photo'),
            onPressed: _busy || _uploadOutcomeUnknown ? null : _uploadPhoto,
            icon: const Icon(Icons.cloud_upload_outlined),
            label: const Text('Privat hochladen'),
          ),
        ],
        if (_uploadOutcomeUnknown) ...<Widget>[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const Key('private-shelf-reload-after-upload'),
            onPressed: _busy ? null : () => _openItem(item),
            icon: const Icon(Icons.refresh),
            label: const Text('Serverstand vor erneutem Upload laden'),
          ),
        ],
        const SizedBox(height: 12),
        OutlinedButton.icon(
          key: const Key('private-shelf-delete'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(48, 48),
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
          onPressed: _busy || _deleteFlowActive ? null : _deleteSelected,
          icon: const Icon(Icons.delete_outline),
          label: const Text('Privates Objekt löschen'),
        ),
      ],
    );
  }

  String _conditionLabel(PrivateShelfCondition condition) =>
      switch (condition) {
        PrivateShelfCondition.newItem => 'Neu',
        PrivateShelfCondition.likeNew => 'Wie neu',
        PrivateShelfCondition.good => 'Gut',
        PrivateShelfCondition.acceptable => 'Akzeptabel',
        PrivateShelfCondition.worn => 'Abgenutzt',
        PrivateShelfCondition.used => 'Gebraucht',
      };
}
