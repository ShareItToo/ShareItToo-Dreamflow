import 'dart:async';
import 'dart:ui' show ImageFilter;
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/handover_code.dart';
import 'package:lendify/services/local_artifact_storage_service.dart';
import 'package:lendify/widgets/private_pilot_risk_notice.dart';

typedef CounterpartyConfirmationVerifier = Future<bool> Function({
  String? qrPayload,
  String? code,
});

class ReturnHandoverStepResult {
  final bool confirmed;
  final bool galleryUsed;
  const ReturnHandoverStepResult(
      {required this.confirmed, required this.galleryUsed});
}

class ReturnHandoverStepperSheet {
  static Future<ReturnHandoverStepResult?> show(
    BuildContext context, {
    required Item item,
    required RentalRequest request,
    required String renterName,
    required String ownerName,
    required String handoverCode,
    String? qrPayload,
    CounterpartyConfirmationVerifier? confirmationVerifier,
    bool viewerIsOwner = false,
    ReturnFlowMode mode = ReturnFlowMode.returnFlow,
  }) async {
    return await showModalBottomSheet<ReturnHandoverStepResult>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.80),
      builder: (context) => _ReturnHandoverStepper(
        item: item,
        request: request,
        renterName: renterName,
        ownerName: ownerName,
        handoverCode: handoverCode,
        qrPayload: qrPayload,
        confirmationVerifier: confirmationVerifier,
        viewerIsOwner: viewerIsOwner,
        mode: mode,
        fullScreen: false,
      ),
    );
  }

  // New: push full-screen page version
  static Future<ReturnHandoverStepResult?> push(
    BuildContext context, {
    required Item item,
    required RentalRequest request,
    required String renterName,
    required String ownerName,
    required String handoverCode,
    String? qrPayload,
    CounterpartyConfirmationVerifier? confirmationVerifier,
    bool viewerIsOwner = false,
    ReturnFlowMode mode = ReturnFlowMode.returnFlow,
  }) async {
    return Navigator.of(context).push<ReturnHandoverStepResult>(
      MaterialPageRoute(
        builder: (_) => ReturnHandoverStepperPage(
          item: item,
          request: request,
          renterName: renterName,
          ownerName: ownerName,
          handoverCode: handoverCode,
          qrPayload: qrPayload,
          confirmationVerifier: confirmationVerifier,
          viewerIsOwner: viewerIsOwner,
          mode: mode,
        ),
      ),
    );
  }
}

class ReturnHandoverStepperPage extends StatelessWidget {
  final Item item;
  final RentalRequest request;
  final String renterName;
  final String ownerName;
  final String handoverCode;
  final String? qrPayload;
  final CounterpartyConfirmationVerifier? confirmationVerifier;
  final ReturnFlowMode mode;
  final bool viewerIsOwner;
  const ReturnHandoverStepperPage(
      {super.key,
      required this.item,
      required this.request,
      required this.renterName,
      required this.ownerName,
      required this.handoverCode,
      this.qrPayload,
      this.confirmationVerifier,
      this.mode = ReturnFlowMode.returnFlow,
      this.viewerIsOwner = false});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: _ReturnHandoverStepper(
        item: item,
        request: request,
        renterName: renterName,
        ownerName: ownerName,
        handoverCode: handoverCode,
        qrPayload: qrPayload,
        confirmationVerifier: confirmationVerifier,
        viewerIsOwner: viewerIsOwner,
        mode: mode,
        fullScreen: true,
      ),
    );
  }
}

class _ReturnHandoverStepper extends StatefulWidget {
  final Item item;
  final RentalRequest request;
  final String renterName;
  final String ownerName;
  final String handoverCode;
  final String? qrPayload;
  final CounterpartyConfirmationVerifier? confirmationVerifier;
  final bool
      fullScreen; // new: when true, fill the whole page instead of sheet height
  final ReturnFlowMode mode;
  final bool viewerIsOwner;
  const _ReturnHandoverStepper(
      {required this.item,
      required this.request,
      required this.renterName,
      required this.ownerName,
      required this.handoverCode,
      this.qrPayload,
      this.confirmationVerifier,
      this.mode = ReturnFlowMode.returnFlow,
      this.fullScreen = false,
      this.viewerIsOwner = false});

  @override
  State<_ReturnHandoverStepper> createState() => _ReturnHandoverStepperState();
}

enum ReturnFlowMode { returnFlow, pickupFlow }

enum _StepKind { photos, damage, codes }

class _ReturnHandoverStepperState extends State<_ReturnHandoverStepper> {
  static const List<String> _presenterEvidenceSlots = <String>[
    'overview',
    'detail',
    'accessories',
    'critical',
  ];
  static const Map<String, String> _presenterEvidenceLabels = <String, String>{
    'overview': 'Gesamtansicht',
    'detail': 'Detailansicht',
    'accessories': 'Zubehör',
    'critical': 'kritischer Zustandspunkt',
  };
  // Dynamic steps based on mode
  late final List<_StepKind> _steps = _buildSteps();
  int _step = 0;

  // Legacy (removed) steps are no longer used

  // Step: photos
  List<PlatformFile> _checkoutPhotos = [];
  List<String> _checkoutPhotoSources = [];
  bool _galleryUsedInCheckoutPhotos = false;
  int _presenterEvidenceCount = 0;
  int _deviationEvidenceCount = 0;
  bool _presenterNonCameraUsed = false;
  String? _counterpartyDecision;
  bool _savingEvidence = false;
  bool _evidencePersisted = false;
  String _lastPhotoSource = 'browser_picker';

  // Step: damage report (return flow only)
  bool _hasDamage = false;
  List<PlatformFile> _damagePhotos = [];
  final TextEditingController _damageNotesCtrl = TextEditingController();
  // Removed: cost estimate field per request
  final TextEditingController _manualCodeCtrl = TextEditingController();
  bool _showManualEntry = false;

  // Step: code confirm (now display-only + manual confirm)
  bool _otherPartyConfirmed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadConditionEvidence());
  }

  String get _evidenceSegment =>
      widget.mode == ReturnFlowMode.returnFlow ? 'return' : 'pickup';

  bool get _viewerIsPresenter => widget.mode == ReturnFlowMode.pickupFlow
      ? widget.viewerIsOwner
      : !widget.viewerIsOwner;

  Future<void> _loadConditionEvidence() async {
    try {
      final summary = await DataService.getConditionEvidenceSummary(
        requestId: widget.request.id,
        segment: _evidenceSegment,
      );
      if (!mounted) return;
      final confirmation = summary['counterpartyConfirmation'];
      setState(() {
        _presenterEvidenceCount =
            (summary['presenterPhotos'] as num?)?.toInt() ?? 0;
        _deviationEvidenceCount =
            (summary['deviationPhotos'] as num?)?.toInt() ?? 0;
        _presenterNonCameraUsed = summary['presenterNonCameraUsed'] == true;
        if (confirmation is Map) {
          _counterpartyDecision = confirmation['decision']?.toString();
          _evidencePersisted = true;
        } else if (_deviationEvidenceCount > 0) {
          _counterpartyDecision = 'deviation_recorded';
        }
      });
    } catch (error) {
      debugPrint('[handover] evidence summary failed: $error');
    }
  }

  @override
  void dispose() {
    _damageNotesCtrl.dispose();
    _manualCodeCtrl.dispose();
    super.dispose();
  }

  // Checklisten-Logik entfernt

  String get _title {
    final kind = _steps[_step];
    switch (kind) {
      case _StepKind.photos:
        // Rename to domain wording per request
        return widget.mode == ReturnFlowMode.returnFlow
            ? 'Rückgabe Fotos'
            : 'Übergabe Fotos';
      case _StepKind.damage:
        return 'Schaden melden';
      case _StepKind.codes:
        // In pickup flow this step is named "Übergabe-QR"
        return widget.mode == ReturnFlowMode.returnFlow
            ? 'Rückgabe-QR'
            : 'Übergabe-QR';
    }
  }

  bool get _canContinue {
    final kind = _steps[_step];
    switch (kind) {
      case _StepKind.photos:
        if (_savingEvidence) return false;
        if (_viewerIsPresenter) {
          return _presenterEvidenceCount + _checkoutPhotos.length >= 4;
        }
        if (_presenterEvidenceCount < 4) return false;
        if (_counterpartyDecision == 'confirmed') {
          return _deviationEvidenceCount == 0 && _checkoutPhotos.isEmpty;
        }
        if (_counterpartyDecision == 'deviation_recorded') {
          return _deviationEvidenceCount + _checkoutPhotos.length >= 1;
        }
        return false;
      case _StepKind.damage:
        if (!_hasDamage) return true;
        return _damagePhotos.isNotEmpty ||
            _damageNotesCtrl.text.trim().isNotEmpty;
      case _StepKind.codes:
        // Hard SIT rule: final completion requires true counterparty confirmation.
        return _otherPartyConfirmed;
    }
  }

  Future<void> _next() async {
    if (!_canContinue) {
      await AppPopup.toast(context,
          icon: Icons.error_outline,
          title: 'Bitte die Anforderungen dieses Schritts erfüllen.');
      return;
    }
    if (_steps[_step] == _StepKind.photos && !_evidencePersisted) {
      final saved = await _saveConditionEvidenceStep();
      if (!saved) return;
    }
    if (!mounted) return;
    if (_step < _steps.length - 1) {
      setState(() => _step++);
    } else {
      Navigator.of(context).pop(ReturnHandoverStepResult(
          confirmed: true,
          galleryUsed:
              _galleryUsedInCheckoutPhotos || _presenterNonCameraUsed));
    }
  }

  Future<bool> _saveConditionEvidenceStep() async {
    setState(() => _savingEvidence = true);
    try {
      final kind =
          _viewerIsPresenter ? 'presenter_photo' : 'counterparty_deviation';
      while (_checkoutPhotos.isNotEmpty) {
        final photo = _checkoutPhotos.first;
        final bytes = photo.bytes;
        if (bytes == null || bytes.isEmpty) {
          throw StateError('condition_evidence_bytes_missing');
        }
        final source = _checkoutPhotoSources.isEmpty
            ? (kIsWeb ? 'browser_picker' : 'gallery')
            : _checkoutPhotoSources.first;
        final semanticSlot = _viewerIsPresenter
            ? _presenterEvidenceSlots[_presenterEvidenceCount]
            : 'deviation';
        await DataService.addConditionEvidencePhoto(
          requestId: widget.request.id,
          bytes: bytes,
          filename: photo.name,
          segment: _evidenceSegment,
          kind: kind,
          source: source,
          semanticSlot: semanticSlot,
        );
        if (!mounted) return false;
        setState(() {
          _checkoutPhotos = _checkoutPhotos.sublist(1);
          if (_checkoutPhotoSources.isNotEmpty) {
            _checkoutPhotoSources = _checkoutPhotoSources.sublist(1);
          }
          if (_viewerIsPresenter) {
            _presenterEvidenceCount++;
            if (source != 'camera') _presenterNonCameraUsed = true;
          } else {
            _deviationEvidenceCount++;
          }
        });
      }
      if (!_viewerIsPresenter) {
        await DataService.recordConditionConfirmation(
          requestId: widget.request.id,
          segment: _evidenceSegment,
          decision: _counterpartyDecision!,
        );
      }
      if (!mounted) return false;
      setState(() => _evidencePersisted = true);
      return true;
    } catch (error) {
      debugPrint('[handover] evidence persistence failed: $error');
      if (mounted) {
        await AppPopup.toast(
          context,
          icon: Icons.error_outline,
          title: 'Fotodokumentation nicht gespeichert',
          message:
              'Bitte prüfe die Verbindung und versuche diesen Schritt erneut.',
        );
      }
      return false;
    } finally {
      if (mounted) setState(() => _savingEvidence = false);
    }
  }

  void _back() {
    if (_step == 0) {
      Navigator.of(context).pop(
          const ReturnHandoverStepResult(confirmed: false, galleryUsed: false));
    } else {
      setState(() => _step--);
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxWidth = 760.0;

    return Material(
      color: Colors.transparent,
      child: SafeArea(
        top: !widget.fullScreen ? false : true,
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: ClipRRect(
              borderRadius: widget.fullScreen
                  ? BorderRadius.zero
                  : const BorderRadius.vertical(top: Radius.circular(24)),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
                child: Stack(
                  children: [
                    // SIT-style blurred blue background with logo
                    Positioned.fill(
                      child: ImageFiltered(
                        imageFilter: ImageFilter.blur(sigmaX: 60, sigmaY: 60),
                        child: Image.asset('assets/images/fulllogo.jpg',
                            fit: BoxFit.cover),
                      ),
                    ),
                    // Blue-tinted gradient overlay for stronger brand feel
                    Positioned.fill(
                      child: Builder(builder: (context) {
                        final blue = Theme.of(context).colorScheme.primary;
                        return Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                blue.withValues(alpha: 0.22),
                                Colors.black.withValues(alpha: 0.50),
                              ],
                            ),
                          ),
                        );
                      }),
                    ),
                    // Glass container border overlay
                    Positioned.fill(
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.22),
                          borderRadius: widget.fullScreen
                              ? BorderRadius.zero
                              : const BorderRadius.vertical(
                                  top: Radius.circular(24)),
                          border: Border.all(
                              color: Colors.white.withValues(alpha: 0.08)),
                        ),
                      ),
                    ),
                    Column(
                      children: [
                        if (!widget.fullScreen) ...[
                          const SizedBox(height: 8),
                          Container(
                            width: 44,
                            height: 4,
                            decoration: BoxDecoration(
                                color: Colors.white24,
                                borderRadius: BorderRadius.circular(2)),
                          ),
                        ] else
                          const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                          child: Row(
                            children: [
                              // Close should abort the whole process and exit
                              IconButton(
                                onPressed: () => Navigator.of(context).pop(
                                    const ReturnHandoverStepResult(
                                        confirmed: false, galleryUsed: false)),
                                icon: const Icon(Icons.close,
                                    color: Colors.white),
                              ),
                              Expanded(
                                child: Center(
                                  child: Text(
                                    _title,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900,
                                        fontSize: 18),
                                  ),
                                ),
                              ),
                              SizedBox(
                                width: 48,
                                height: 48,
                                child: Center(
                                  child: Text(
                                    '${_step + 1}/${_steps.length}',
                                    style: const TextStyle(
                                        color: Colors.white70,
                                        fontWeight: FontWeight.w700),
                                  ),
                                ),
                              )
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 16),
                          child: PrivatePilotRiskNotice(
                            title: 'Dokumentation, kein SIT-Schadenschutz',
                          ),
                        ),
                        const SizedBox(height: 8),
                        Expanded(
                          child: AnimatedSwitcher(
                            duration: const Duration(milliseconds: 400),
                            transitionBuilder: (child, animation) {
                              final curved = CurvedAnimation(
                                  parent: animation,
                                  curve: Curves.easeOutCubic,
                                  reverseCurve: Curves.easeInCubic);
                              return FadeTransition(
                                  opacity: curved, child: child);
                            },
                            child: Padding(
                              key: ValueKey(_step),
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                              child: _buildStep(),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: Builder(builder: (context) {
                            final bool hidePrimaryAction = (
                                // Renter in return flow (zeigt QR/Code); kein Primär-Button
                                (!widget.viewerIsOwner &&
                                        widget.mode ==
                                            ReturnFlowMode.returnFlow &&
                                        _steps[_step] == _StepKind.codes) ||
                                    // Owner in pickup flow beim Schritt "Übergabe-QR": keinen "Abschließen"-Button anzeigen
                                    (widget.viewerIsOwner &&
                                        widget.mode ==
                                            ReturnFlowMode.pickupFlow &&
                                        _steps[_step] == _StepKind.codes));
                            return Row(
                              children: [
                                TextButton(
                                    onPressed: _back,
                                    child: const Text('Zurück')),
                                const Spacer(),
                                if (!hidePrimaryAction)
                                  FilledButton(
                                    onPressed: _canContinue ? _next : null,
                                    child: Text(_step == _steps.length - 1
                                        ? 'Abschließen'
                                        : 'Weiter'),
                                  ),
                              ],
                            );
                          }),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep() {
    final kind = _steps[_step];
    switch (kind) {
      case _StepKind.photos:
        return _stepCheckoutPhotos();
      case _StepKind.damage:
        return _stepDamage();
      case _StepKind.codes:
        return _stepCodes();
    }
  }

  Widget _card({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      padding: const EdgeInsets.all(12),
      child: child,
    );
  }

  // Entfernt: Zeitplanung und Ort-Bestätigung

  // Entfernt: Checkliste, Zeitplanung, Ort bestätigen, Abrechnung, Unterschriften

  Widget _photoGrid(List<PlatformFile> files, VoidCallback onPick,
      {required String emptyText}) {
    final grid = Wrap(
      alignment: files.isEmpty ? WrapAlignment.center : WrapAlignment.start,
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final f in files)
          GestureDetector(
            onTap: () => _openImagePreview(f),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 92,
                height: 92,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.10)),
                ),
                child: (f.bytes != null)
                    ? Image.memory(f.bytes!, fit: BoxFit.cover)
                    : Center(
                        child: Icon(Icons.image,
                            color: Colors.white.withValues(alpha: 0.6))),
              ),
            ),
          ),
        InkWell(
          onTap: onPick,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: 92,
            height: 92,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            child: const Center(
                child: Icon(Icons.add_a_photo, color: Colors.white70)),
          ),
        ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (files.isEmpty)
          SizedBox(height: 140, child: Center(child: grid))
        else
          grid,
        if (files.isEmpty && emptyText.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(emptyText,
                style: const TextStyle(color: Colors.white54),
                textAlign: TextAlign.center),
          ),
      ],
    );
  }

  List<_StepKind> _buildSteps() {
    final isReturn = widget.mode == ReturnFlowMode.returnFlow;
    final List<_StepKind> base = [];
    base.add(_StepKind.photos);
    if (isReturn) base.add(_StepKind.damage);
    base.add(_StepKind.codes);
    return base;
  }

  void _openImagePreview(PlatformFile file) {
    if (file.bytes == null && (file.path == null || file.path!.isEmpty)) return;
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'preview',
      barrierColor: Colors.black.withValues(alpha: 0.7),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (context, anim, anim2) {
        return GestureDetector(
          onTap: () => Navigator.of(context, rootNavigator: true).maybePop(),
          child: Stack(children: [
            Positioned.fill(
              child: Container(color: Colors.black.withValues(alpha: 0.85)),
            ),
            Center(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: InteractiveViewer(
                  clipBehavior: Clip.none,
                  minScale: 0.5,
                  maxScale: 4,
                  child: file.bytes != null
                      ? Image.memory(file.bytes!, fit: BoxFit.contain)
                      : Image.asset(file.path!, fit: BoxFit.contain),
                ),
              ),
            ),
            Positioned(
              right: 8,
              top: 8,
              child: IconButton(
                onPressed: () =>
                    Navigator.of(context, rootNavigator: true).maybePop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ]),
        );
      },
      transitionBuilder: (context, anim, anim2, child) {
        final curved =
            CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
        return FadeTransition(
            opacity: curved,
            child: ScaleTransition(
                scale: Tween<double>(begin: 0.98, end: 1.0).animate(curved),
                child: child));
      },
    );
  }

  Future<void> _pickPhotosGallery(Function(List<PlatformFile>) addToList,
      {bool allowMultiple = true}) async {
    final res = await FilePicker.pickFiles(
      type: FileType.image,
      allowMultiple: allowMultiple,
      withData: true,
    );
    if (res != null) {
      setState(() {
        _lastPhotoSource = kIsWeb ? 'browser_picker' : 'gallery';
        _galleryUsedInCheckoutPhotos =
            _galleryUsedInCheckoutPhotos || res.files.isNotEmpty;
        addToList(res.files);
      });
    }
  }

  Future<void> _pickPhotoCamera(Function(List<PlatformFile>) addToList) async {
    try {
      final ImagePicker picker = ImagePicker();
      final XFile? shot =
          await picker.pickImage(source: ImageSource.camera, imageQuality: 85);
      if (shot != null) {
        final bytes = await shot.readAsBytes();
        final pf = PlatformFile(
            name: shot.name, size: bytes.length, path: shot.path, bytes: bytes);
        setState(() {
          _lastPhotoSource = kIsWeb ? 'browser_picker' : 'camera';
          addToList([pf]);
          if (kIsWeb) _galleryUsedInCheckoutPhotos = true;
        });
        final result = await LocalArtifactStorageService.maybeSaveEvidencePhoto(
          file: shot,
          bookingId: widget.request.id,
          isReturn: widget.mode == ReturnFlowMode.returnFlow,
          fromCamera: true,
          webBytes: bytes,
        );
        if (!mounted || !result.shouldNotify) return;
        await AppPopup.toast(
          context,
          icon:
              result.success ? Icons.check_circle_outline : Icons.info_outline,
          title: result.message!,
        );
      }
    } catch (e) {
      debugPrint('[handover] camera pick failed: $e');
      if (!mounted) return;
      await AppPopup.toast(context,
          icon: Icons.error_outline, title: 'Kamera nicht verfügbar');
    }
  }

  Future<void> _pickPhotosMenu(Function(List<PlatformFile>) addToList,
      {bool multiple = true}) async {
    await AppPopup.show(
      context,
      icon: Icons.add_a_photo,
      title: 'Fotos hinzufügen',
      message: kIsWeb
          ? 'Im Browser kann dieselbe Auswahl Kamera oder Galerie öffnen.'
          : 'Quelle wählen',
      showCloseIcon: false,
      useExploreBackground: true,
      actions: [
        OutlinedButton.icon(
          onPressed: () async {
            Navigator.of(context, rootNavigator: true).maybePop();
            await _pickPhotosGallery(addToList, allowMultiple: multiple);
          },
          icon: const Icon(Icons.photo_library_outlined),
          label: Text(kIsWeb ? 'Bild hinzufügen' : 'Galerie'),
        ),
        FilledButton.icon(
          onPressed: () async {
            Navigator.of(context, rootNavigator: true).maybePop();
            await _pickPhotoCamera(addToList);
          },
          icon: const Icon(Icons.photo_camera),
          label: Text(kIsWeb ? 'Foto aufnehmen / auswählen' : 'Kamera'),
        ),
      ],
    );
  }

  Widget _stepCheckoutPhotos() {
    final isReturn = widget.mode == ReturnFlowMode.returnFlow;
    final presenterLabel = isReturn ? 'Mieter' : 'Vermieter';
    return Align(
      alignment: Alignment.center,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              _viewerIsPresenter
                  ? (_galleryUsedInCheckoutPhotos
                      ? 'Bitte mindestens 4 aktuelle Fotos hinzufügen. Galerie-Fotos werden bei der Bestätigung offengelegt.'
                      : (kIsWeb
                          ? 'Bitte mindestens 4 aktuelle Fotos hinzufügen. Im Browser kann eine Live-Aufnahme nicht eindeutig verifiziert werden.'
                          : 'Bitte mindestens 4 aktuelle Fotos hinzufügen.'))
                  : '$presenterLabel hat $_presenterEvidenceCount von 4 Pflichtfotos im geschützten Buchungs-Chat hinterlegt. Bestätige den Satz oder dokumentiere eine Abweichung.',
              style: const TextStyle(
                  color: Colors.white70, fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            _card(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_viewerIsPresenter) ...[
                    Text(
                      '${isReturn ? 'Rückgabe' : 'Übergabe'}-Fotos (${_presenterEvidenceCount + _checkoutPhotos.length}/4)',
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Pflichtmotive: ${_presenterEvidenceSlots.map((slot) => _presenterEvidenceLabels[slot]).join(', ')}.',
                      style: const TextStyle(color: Colors.white60),
                    ),
                    const SizedBox(height: 8),
                    _photoGrid(
                      _checkoutPhotos,
                      () => _pickPhotosMenu((newOnes) {
                        final remaining = 4 -
                            _presenterEvidenceCount -
                            _checkoutPhotos.length;
                        if (remaining <= 0) return;
                        final accepted = newOnes.take(remaining).toList();
                        _checkoutPhotos = [..._checkoutPhotos, ...accepted];
                        _checkoutPhotoSources = [
                          ..._checkoutPhotoSources,
                          ...List<String>.filled(
                              accepted.length, _lastPhotoSource),
                        ];
                      }, multiple: true),
                      emptyText: '',
                    ),
                  ] else ...[
                    _conditionDecisionButton(
                      decision: 'confirmed',
                      label: 'Fotos stimmen überein',
                      icon: Icons.check_circle_outline,
                      enabled: _deviationEvidenceCount == 0,
                    ),
                    const SizedBox(height: 8),
                    _conditionDecisionButton(
                      decision: 'deviation_recorded',
                      label: 'Abweichung dokumentieren',
                      icon: Icons.report_problem_outlined,
                    ),
                    if (_counterpartyDecision == 'deviation_recorded') ...[
                      const SizedBox(height: 8),
                      const Text(
                        'Mindestens ein eigenes Gegenfoto ist erforderlich.',
                        style: TextStyle(color: Colors.white70),
                      ),
                      const SizedBox(height: 8),
                      _photoGrid(
                        _checkoutPhotos,
                        () => _pickPhotosMenu((newOnes) {
                          _checkoutPhotos = [..._checkoutPhotos, ...newOnes];
                          _checkoutPhotoSources = [
                            ..._checkoutPhotoSources,
                            ...List<String>.filled(
                                newOnes.length, _lastPhotoSource),
                          ];
                        }, multiple: true),
                        emptyText: '',
                      ),
                    ],
                  ],
                  if (_savingEvidence) ...[
                    const SizedBox(height: 12),
                    const LinearProgressIndicator(),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _conditionDecisionButton({
    required String decision,
    required String label,
    required IconData icon,
    bool enabled = true,
  }) {
    void select() {
      setState(() {
        _counterpartyDecision = decision;
        if (decision == 'confirmed') {
          _checkoutPhotos = [];
          _checkoutPhotoSources = [];
        }
        _evidencePersisted = false;
      });
    }

    if (_counterpartyDecision == decision) {
      return FilledButton.icon(
        onPressed: enabled ? select : null,
        icon: Icon(icon),
        label: Text(label),
      );
    }
    return OutlinedButton.icon(
      onPressed: enabled ? select : null,
      icon: Icon(icon),
      label: Text(label),
    );
  }

  Widget _stepDamage() {
    return Align(
      alignment: Alignment.center,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600),
        child: _card(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: const [
                Icon(Icons.report_gmailerrorred_outlined,
                    color: Colors.white70),
                SizedBox(width: 8),
                Text('Schaden melden',
                    style: TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w800))
              ]),
              const SizedBox(height: 8),
              SwitchListTile(
                value: _hasDamage,
                onChanged: (v) => setState(() => _hasDamage = v),
                title: const Text('Schaden vorhanden',
                    style: TextStyle(color: Colors.white)),
              ),
              if (_hasDamage) ...[
                const SizedBox(height: 8),
                _photoGrid(
                  _damagePhotos,
                  () => _pickPhotosMenu(
                      (newOnes) =>
                          _damagePhotos = [..._damagePhotos, ...newOnes],
                      multiple: true),
                  emptyText: 'Beschädigungsfotos hinzufügen (optional).',
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _damageNotesCtrl,
                  minLines: 1,
                  maxLines: null,
                  decoration: const InputDecoration(
                    hintText: 'Notizen (optional)',
                    hintStyle: TextStyle(color: Colors.white54),
                    border: InputBorder.none,
                  ),
                  style: const TextStyle(color: Colors.white),
                ),
              ]
            ],
          ),
        ),
      ),
    );
  }

  Widget _stepCodes() {
    final isReturn = widget.mode == ReturnFlowMode.returnFlow;
    final flowLabel = isReturn ? 'Rückgabe' : 'Übergabe';
    final bookingSeed = _computeBookingSeed(widget.item, widget.request);
    final segment = isReturn
        ? HandoverCodeService.segmentReturn
        : HandoverCodeService.segmentPickup;
    final presenterRole = isReturn
        ? HandoverCodeService.presenterRenter
        : HandoverCodeService.presenterOwner;
    final qrData = widget.qrPayload ??
        HandoverCodeService.qrPayload(
          segment: segment,
          presenterRole: presenterRole,
          code: widget.handoverCode,
          bookingId: bookingSeed,
        );

    // Owner:
    // - In pickup flow the owner SHOWS QR + Code to the renter
    // - In return flow the owner SCANS renter's QR or enters the code
    if (widget.viewerIsOwner) {
      if (isReturn) {
        // Owner (return): scan renter's QR or manual code entry
        return Align(
          alignment: Alignment.center,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: _card(
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                  Text('$flowLabel bestätigen',
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  const Text(
                    'Bitte scanne den QR‑Code des Mieters oder gib den Rückgabe‑Code manuell ein.',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _scanCounterpartyQr,
                        icon: const Icon(Icons.qr_code_scanner),
                        label: const Text('QR‑Code scannen'),
                      ),
                    ),
                  ]),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () =>
                          setState(() => _showManualEntry = !_showManualEntry),
                      child: Text(_showManualEntry
                          ? 'Eingabe ausblenden'
                          : 'QR nicht möglich?'),
                    ),
                  ),
                  if (_showManualEntry) ...[
                    const SizedBox(height: 4),
                    const Text('Code manuell eingeben',
                        style: TextStyle(color: Colors.white70)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _manualCodeCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        hintText: '6‑stelliger Code',
                        hintStyle: TextStyle(color: Colors.white54),
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      style: const TextStyle(color: Colors.white),
                    ),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () async {
                            final entered = _manualCodeCtrl.text.trim();
                            if (entered.isEmpty) return;
                            final verified =
                                await _verifyCounterpartyCode(entered);
                            if (!mounted) return;
                            if (verified) {
                              setState(() => _otherPartyConfirmed = true);
                              await AppPopup.toast(context,
                                  icon: Icons.check_circle_outline,
                                  title: '$flowLabel per Code bestätigt');
                            } else {
                              await AppPopup.toast(context,
                                  icon: Icons.error_outline,
                                  title: isReturn
                                      ? 'Dieser Code gehört nicht zu dieser Rückgabe. Bitte den aktuellen Rückgabe-Code verwenden.'
                                      : 'Dieser Code passt nicht zu diesem Übergabeschritt. Bitte den aktuellen Code erneut anzeigen oder scannen.');
                            }
                          },
                          icon: const Icon(Icons.key),
                          label: const Text('Code bestätigen'),
                        ),
                      ),
                    ]),
                  ],
                ])),
          ),
        );
      } else {
        // Owner (pickup): show QR + 6-digit code
        return Align(
          alignment: Alignment.center,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: _card(
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                  Text('$flowLabel bestätigen',
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text(
                    'Lass den Mieter deinen QR‑Code scannen. Falls das nicht klappt, gib ihm den 6‑stelligen $flowLabel‑Code.',
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: GestureDetector(
                      onTap: () => _showQrOverlay(context, qrData),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          color: Colors.white,
                          padding: const EdgeInsets.all(12),
                          child: QrImageView(
                              data: qrData,
                              version: QrVersions.auto,
                              size: 180,
                              backgroundColor: Colors.white),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(children: [
                    const Icon(Icons.vpn_key, color: Colors.white70),
                    const SizedBox(width: 8),
                    Text('$flowLabel‑Code',
                        style: const TextStyle(
                            color: Colors.white70,
                            fontWeight: FontWeight.w700)),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8)),
                      child: Text(widget.handoverCode,
                          style: const TextStyle(
                              letterSpacing: 2,
                              fontWeight: FontWeight.w800,
                              color: Colors.white)),
                    )
                  ]),
                ])),
          ),
        );
      }
    }

    // Renter:
    // - In Return flow (laufende Buchung) the renter SHOWS a QR + 6‑digit code to the owner.
    // - In Pickup flow the renter scans the owner's QR or enters the code.
    if (isReturn) {
      // Show QR + 6-digit code for the renter to be scanned by the Vermieter
      return Align(
        alignment: Alignment.center,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: _card(
              child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                Text('$flowLabel bestätigen',
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                const Text(
                  'Lass den Vermieter deinen QR‑Code scannen. Falls das nicht klappt, gib ihm den 6‑stelligen Rückgabe‑Code.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 12),
                Center(
                  child: GestureDetector(
                    onTap: () => _showQrOverlay(context, qrData),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Container(
                        color: Colors.white,
                        padding: const EdgeInsets.all(12),
                        child: QrImageView(
                            data: qrData,
                            version: QrVersions.auto,
                            size: 180,
                            backgroundColor: Colors.white),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(children: [
                  const Icon(Icons.vpn_key, color: Colors.white70),
                  const SizedBox(width: 8),
                  const Text('Rückgabe‑Code',
                      style: TextStyle(
                          color: Colors.white70, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8)),
                    child: Text(widget.handoverCode,
                        style: const TextStyle(
                            letterSpacing: 2,
                            fontWeight: FontWeight.w800,
                            color: Colors.white)),
                  )
                ]),
                // Hinweis entfernt: Kein "Warte, bis der Vermieter bestätigt hat." mehr in der Mieter-Rückgabeansicht.
              ])),
        ),
      );
    }

    // Pickup flow (renter) → scan owner's QR or enter the code manually
    return Align(
      alignment: Alignment.center,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600),
        child: _card(
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              Text('$flowLabel bestätigen',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text(
                  'Bitte scanne den QR‑Code des Vermieters oder gib den Code manuell ein.',
                  style: TextStyle(color: Colors.white70),
                  textAlign: TextAlign.left),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _scanCounterpartyQr,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('QR‑Code scannen'),
                  ),
                ),
              ]),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () =>
                      setState(() => _showManualEntry = !_showManualEntry),
                  child: Text(_showManualEntry
                      ? 'Eingabe ausblenden'
                      : 'QR nicht möglich?'),
                ),
              ),
              if (_showManualEntry) ...[
                const SizedBox(height: 4),
                const Text('Code manuell eingeben',
                    style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 6),
                TextField(
                  controller: _manualCodeCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    hintText: '6‑stelliger Code',
                    hintStyle: TextStyle(color: Colors.white54),
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  style: const TextStyle(color: Colors.white),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () async {
                        final entered = _manualCodeCtrl.text.trim();
                        if (entered.isEmpty) return;
                        final verified = await _verifyCounterpartyCode(entered);
                        if (!mounted) return;
                        if (verified) {
                          setState(() => _otherPartyConfirmed = true);
                          await AppPopup.toast(context,
                              icon: Icons.check_circle_outline,
                              title: '$flowLabel per Code bestätigt');
                        } else {
                          await AppPopup.toast(context,
                              icon: Icons.error_outline,
                              title: isReturn
                                  ? 'Dieser Code gehört nicht zu dieser Rückgabe. Bitte den aktuellen Rückgabe-Code verwenden.'
                                  : 'Dieser Code passt nicht zu diesem Übergabeschritt. Bitte den aktuellen Code erneut anzeigen oder scannen.');
                        }
                      },
                      icon: const Icon(Icons.key),
                      label: const Text('Code bestätigen'),
                    ),
                  ),
                ]),
              ],
            ])),
      ),
    );
  }

  Future<void> _scanCounterpartyQr() async {
    String? scanned;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black,
      barrierColor: Colors.black.withValues(alpha: 0.8),
      builder: (ctx) {
        return SizedBox(
          height: MediaQuery.of(ctx).size.height * 0.86,
          child: Stack(children: [
            MobileScanner(
              controller: MobileScannerController(
                  detectionSpeed: DetectionSpeed.normal,
                  facing: CameraFacing.back,
                  torchEnabled: false),
              onDetect: (capture) {
                final barcodes = capture.barcodes;
                if (barcodes.isEmpty) return;
                final value = barcodes.first.rawValue ?? '';
                if (value.isEmpty) return;
                scanned = value;
                Navigator.of(ctx).maybePop();
              },
            ),
            Positioned(
              left: 8,
              top: 8,
              child: IconButton(
                  onPressed: () => Navigator.of(ctx).maybePop(),
                  icon: const Icon(Icons.close, color: Colors.white)),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  widget.viewerIsOwner
                      ? 'Scanne den QR‑Code des Mieters'
                      : 'Scanne den QR‑Code des Vermieters',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
            )
          ]),
        );
      },
    );

    if (!mounted) return;
    if (scanned == null || scanned!.isEmpty) {
      await AppPopup.toast(context,
          icon: Icons.qr_code_2, title: 'Kein Code erkannt');
      return;
    }

    try {
      final raw = scanned!.trim();
      final expectedSegment = widget.mode == ReturnFlowMode.returnFlow
          ? HandoverCodeService.segmentReturn
          : HandoverCodeService.segmentPickup;
      final expectedPresenterRole = widget.mode == ReturnFlowMode.returnFlow
          ? HandoverCodeService.presenterRenter
          : HandoverCodeService.presenterOwner;
      final matches = widget.confirmationVerifier != null
          ? await widget.confirmationVerifier!(qrPayload: raw)
          : HandoverCodeService.isExpectedQrPayload(
              raw,
              segment: expectedSegment,
              presenterRole: expectedPresenterRole,
              code: widget.handoverCode,
              bookingId: _computeBookingSeed(widget.item, widget.request),
            );
      if (!mounted) return;
      if (!matches) {
        await AppPopup.toast(context,
            icon: Icons.error_outline,
            title: widget.mode == ReturnFlowMode.returnFlow
                ? 'Dieser Code gehört nicht zu dieser Rückgabe. Bitte den aktuellen Rückgabe-Code verwenden.'
                : 'Dieser Code passt nicht zu diesem Übergabeschritt. Bitte den aktuellen Code erneut anzeigen oder scannen.');
        return;
      }
      setState(() => _otherPartyConfirmed = true);
      await AppPopup.toast(context,
          icon: Icons.check_circle_outline,
          title:
              '${widget.mode == ReturnFlowMode.returnFlow ? 'Rückgabe' : 'Abholung'} per QR bestätigt');
    } catch (e) {
      debugPrint('[handover] scan failed: $e');
      if (!mounted) return;
      await AppPopup.toast(context,
          icon: Icons.error_outline, title: 'Bestätigung fehlgeschlagen');
    }
  }

  Future<bool> _verifyCounterpartyCode(String code) async {
    if (widget.confirmationVerifier != null) {
      return widget.confirmationVerifier!(code: code);
    }
    return code == widget.handoverCode;
  }

  void _showQrOverlay(BuildContext context, String data) {
    showGeneralDialog(
      context: context,
      barrierLabel: 'QR',
      barrierDismissible: true,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 180),
      pageBuilder: (context, anim, anim2) {
        final theme = Theme.of(context);
        return GestureDetector(
          onTap: () => Navigator.of(context, rootNavigator: true).maybePop(),
          child: Stack(children: [
            Positioned.fill(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                child: Container(color: Colors.black.withValues(alpha: 0.25)),
              ),
            ),
            Center(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                          color:
                              theme.colorScheme.primary.withValues(alpha: 0.45),
                          blurRadius: 28,
                          spreadRadius: 1),
                    ],
                  ),
                  padding: const EdgeInsets.all(16),
                  child: QrImageView(
                      data: data,
                      version: QrVersions.auto,
                      size: 300,
                      backgroundColor: Colors.white),
                ),
              ),
            ),
          ]),
        );
      },
      transitionBuilder: (context, anim, anim2, child) {
        final curved =
            CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
        return FadeTransition(
            opacity: curved,
            child: ScaleTransition(
                scale: Tween<double>(begin: 0.95, end: 1.0).animate(curved),
                child: child));
      },
    );
  }

  // Zusammenfassungszeilen entfernt (Abrechnung entfallen)

  // Entfernt: Abrechnung

  // Entfernt: Unterschriften

  String _computeBookingSeed(Item item, RentalRequest req) {
    final seed =
        ((item.id.hashCode) ^ (req.id.hashCode) ^ (item.title.hashCode)).abs();
    final s = seed.toString().padLeft(8, '0');
    return 'BKG-${s.substring(0, 4)}-${s.substring(4, 8)}';
  }
}

// Entfernt: frühere Hilfsklassen für Checkliste/Abrechnung
