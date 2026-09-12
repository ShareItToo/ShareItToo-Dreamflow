import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/private_pilot_owner_acceptance_dialog.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/message_thread_screen.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/widgets/return_handover_stepper_sheet.dart';
import 'package:lendify/widgets/review_prompt_sheet.dart';
import 'package:lendify/screens/owner_requests_screen.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/screens/support_flow_screen.dart';
import 'package:lendify/screens/report_issue_screen.dart';
import 'package:lendify/services/return_case_entry_point_policy.dart';
import 'package:lendify/widgets/support_principal_controller.dart';
import 'package:lendify/widgets/sit_glass_time_picker.dart';
import 'dart:ui' show ImageFilter;
import 'package:lendify/widgets/sit_overflow_menu.dart';
import 'package:lendify/services/handover_code.dart';
import 'package:lendify/models/invoice.dart';
import 'package:lendify/services/invoice_pdf_service.dart';
import 'package:lendify/services/invoices_service.dart';
import 'package:lendify/services/local_artifact_storage_service.dart';
import 'package:printing/printing.dart';

class OngoingOwnerDetailScreen extends StatefulWidget {
  final String requestId;
  final String? titleOverride; // Allows caller to reflect the source tab name
  const OngoingOwnerDetailScreen({
    super.key,
    required this.requestId,
    this.titleOverride,
  });

  @override
  State<OngoingOwnerDetailScreen> createState() =>
      _OngoingOwnerDetailScreenState();
}

class _OngoingOwnerDetailScreenState extends State<OngoingOwnerDetailScreen> {
  final _supportPrincipal = SupportPrincipalController();
  RentalRequest? _req;
  Item? _item;
  User? _renter;
  User? _owner;
  final TextEditingController _manualCodeCtrl = TextEditingController();
  Map<String, dynamic> _flowState = const {};
  Map<String, dynamic> _addressVisibility = const {};
  Timer? _acceptanceDeadlineTimer;
  StreamSubscription<String>? _sharedPersistenceSub;
  final SharedPersistenceRefreshCoordinator _sharedPersistenceRefresh =
      SharedPersistenceRefreshCoordinator();

  @override
  void initState() {
    super.initState();
    _load();
    _sharedPersistenceSub = SharedPersistenceSync.changes.listen((key) {
      if (!mounted || !SharedPersistenceSync.affectsBookingSync(key)) return;
      unawaited(_sharedPersistenceRefresh.schedule(() async {
        await SharedPersistenceSync.reloadPreferences();
        if (mounted) await _load();
      }));
    });
  }

  Future<void> _load() async {
    final req = await DataService.getRentalRequestById(widget.requestId);
    if (req == null) return;
    final item = await DataService.getItemById(req.itemId);
    final renter = await DataService.getUserById(req.renterId);
    final owner = await DataService.getUserById(req.ownerId);
    final flowState = await DataService.getHandoverReturnState(req.id);
    final addressVisibility = item == null
        ? const <String, dynamic>{}
        : await DataService.getBookingAddressReveal(
            request: req,
            localExactAddress: item.locationText,
            segment: 'return',
          );
    if (!mounted) return;
    setState(() {
      _req = req;
      _item = item;
      _renter = renter;
      _owner = owner;
      _flowState = flowState;
      _addressVisibility = addressVisibility;
    });
    _scheduleAcceptanceDeadlineRefresh(req);
    // Show one-time handover banner if present (e.g., renter confirmed)
    if (mounted && item != null) {
      final msg = await DataService.takeHandoverBanner(req.id);
      if (msg != null && msg.isNotEmpty && mounted) {
        AppPopup.toast(context, icon: Icons.check_circle_outline, title: msg);
      }
    }
  }

  @override
  void dispose() {
    _supportPrincipal.dispose();
    _acceptanceDeadlineTimer?.cancel();
    _sharedPersistenceSub?.cancel();
    _sharedPersistenceRefresh.dispose();
    _manualCodeCtrl.dispose();
    super.dispose();
  }

  void _scheduleAcceptanceDeadlineRefresh(RentalRequest request) {
    _acceptanceDeadlineTimer?.cancel();
    _acceptanceDeadlineTimer = null;
    if (!BackendConfig.enabled ||
        QaRuntimeService.isEnabled ||
        request.status.toLowerCase().trim() != 'pending') {
      return;
    }
    final deadline = request.bindingExpiresAt;
    if (deadline == null) return;
    final remaining = deadline.difference(DateTime.now());
    if (remaining <= Duration.zero) return;
    _acceptanceDeadlineTimer = Timer(remaining, () {
      if (!mounted) return;
      setState(() {});
    });
  }

  bool _ownerAcceptanceDeadlineValid(RentalRequest request) {
    if (request.simulationOnly) return true;
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) return true;
    final deadline = request.bindingExpiresAt;
    return deadline != null && deadline.isAfter(DateTime.now());
  }

  List<String> get _photos => (_item?.photos ?? const <String>[]);

  String? _confirmedLocationText(bool isReturn) {
    final prefix = isReturn ? 'return' : 'handover';
    final label =
        ((_flowState['${prefix}LocationLabel'] as String?) ?? '').trim();
    final name =
        ((_flowState['${prefix}LocationSharedByName'] as String?) ?? '').trim();
    if (label.isNotEmpty) {
      return '${isReturn ? 'Rückgabeort' : 'Übergabeort'}: $label';
    }
    if (name.isNotEmpty) {
      return '${isReturn ? 'Rückgabeort' : 'Übergabeort'}: Standort von $name';
    }
    return null;
  }

  String _confirmedLocationMapsUrl(bool isReturn) {
    final prefix = isReturn ? 'return' : 'handover';
    return ((_flowState['${prefix}LocationMapsUrl'] as String?) ?? '').trim();
  }

  Future<void> _openConfirmedLocationUrl(bool isReturn) async {
    final url = _confirmedLocationMapsUrl(isReturn);
    if (url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _openSupportFlow({
    required RentalRequest req,
    required Item item,
  }) async {
    final owner = _supportPrincipal.capture();
    if (owner == null ||
        !await _supportPrincipal.isCurrent(owner) ||
        !mounted) {
      return;
    }
    final current = await DataService.getCurrentUser();
    if (current == null ||
        current.id != owner.userId ||
        !await _supportPrincipal.isCurrent(owner) ||
        !mounted) {
      return;
    }
    final flowContext = SupportFlowContext.fromOwnerRequestDetail(
      itemTitle: item.title,
      itemId: item.id,
      requestId: req.id,
      bookingStatus: req.status,
      otherUserName: _renter?.displayName,
      itemImageUrl: _photos.isNotEmpty ? _photos.first : null,
      otherUserImageUrl: _renter?.photoURL,
    );
    final result = await _supportPrincipal.pushOwnedRoute<SupportFlowResult?>(
      context: context,
      owner: owner,
      route: MaterialPageRoute(
        builder: (_) => SupportFlowScreen(context: flowContext, owner: owner),
      ),
    );
    if (result == null ||
        !await _supportPrincipal.isCurrent(owner) ||
        !mounted) {
      return;
    }
    final supportThread = await DataService.createSupportThread(
      userId: current.id,
      canonicalCaseNumber: result.canonicalCaseNumber,
    );
    if (!await _supportPrincipal.isCurrent(owner) || !mounted) return;
    if (supportThread == null) {
      await _supportPrincipal.showNotice(
        context: context,
        owner: owner,
        title: 'Fall ${result.canonicalCaseNumber} ist eingegangen',
      );
      return;
    }
    final descText = result.userDescription.isNotEmpty
        ? '\n\nBeschreibung:\n${result.userDescription}'
        : '';
    await DataService.addSystemMessageToThread(
      threadId: supportThread.id,
      text:
          "${result.canonicalReceiptMessage}\n\n📋 Support-Anfrage zu: ${item.title}\nBuchung: ${req.id}\nKategorie: ${result.mainCategoryLabel}\nUnterkategorie: ${result.subCategory}$descText",
    );
    if (!await _supportPrincipal.isCurrent(owner) || !mounted) return;
    _supportPrincipal.pushOwnedRoute<void>(
      context: context,
      owner: owner,
      route: MaterialPageRoute(
        builder: (_) => MessageThreadScreen(
          threadId: supportThread.id,
          participantName: 'SIT Support',
          itemTitle: 'Support',
        ),
      ),
    );
  }

  Future<void> _openReturnCase({
    required RentalRequest req,
    required Item item,
  }) async {
    final owner = _supportPrincipal.capture();
    if (owner == null || !_returnCaseEntryPointEligible(req)) return;
    if (!await _supportPrincipal.isCurrent(owner) || !mounted) return;
    final result = await _supportPrincipal.pushOwnedRoute<bool?>(
      context: context,
      owner: owner,
      route: MaterialPageRoute(
        builder: (_) => ReportIssueScreen(
          requestId: req.id,
          itemTitle: item.title,
        ),
      ),
    );
    if (result != true ||
        !await _supportPrincipal.isCurrent(owner) ||
        !mounted) {
      return;
    }
    await _load();
  }

  Future<void> _manageBookingTime({
    required RentalRequest req,
    required bool isReturn,
  }) async {
    final current = await DataService.getCurrentUser();
    if (current == null) return;
    final thread = await DataService.createOrGetThreadForRequest(req.id);
    if (thread == null || !mounted) return;
    final state = await DataService.getHandoverReturnState(req.id);
    if (!mounted) return;
    final key = isReturn ? 'return' : 'handover';
    final requestedLabel =
        ((state['${key}TimeRequested'] as String?) ?? '').trim();
    final requestedBy =
        ((state['${key}TimeRequestedByUserId'] as String?) ?? '').trim();
    final confirmed = state['${key}TimeConfirmed'] == true;
    final flowLabel = isReturn ? 'Rückgabezeit' : 'Übergabezeit';
    if (requestedLabel.isNotEmpty && !confirmed) {
      final action = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('$flowLabel verwalten'),
          content: Text(
            requestedBy.isNotEmpty && requestedBy != current.id
                ? 'Möchtest du die $flowLabel annehmen oder ändern?'
                : 'Möchtest du die $flowLabel ändern oder neu anfragen?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Abbrechen'),
            ),
            if (requestedBy.isNotEmpty && requestedBy != current.id)
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop('accept'),
                child: const Text('Annehmen'),
              ),
            OutlinedButton(
              onPressed: () => Navigator.of(ctx).pop('change'),
              child: Text(
                requestedBy.isNotEmpty && requestedBy != current.id
                    ? 'Ändern'
                    : 'Neu anfragen',
              ),
            ),
          ],
        ),
      );
      if (action == null || !mounted) return;
      if (action == 'accept') {
        await DataService.confirmFlowTime(
          requestId: req.id,
          isReturn: isReturn,
          confirmedByUserId: current.id,
        );
        await DataService.addSystemMessageToThread(
          threadId: thread.id,
          text:
              '${isReturn ? '🔄' : '📦'} $flowLabel bestätigt: $requestedLabel Uhr',
        );
        if (!mounted) return;
        AppPopup.toast(
          context,
          icon: Icons.check_circle_outline,
          title: '$flowLabel bestätigt',
        );
        await _load();
        return;
      }
    }
    final initial = (isReturn ? req.end : req.start).toLocal();
    final picked = await SitGlassTimePicker.show(
      context,
      title: isReturn ? 'Rückgabezeit wählen' : 'Übergabezeit wählen',
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (picked == null || !mounted) return;
    final proposed = req.flowTimeAt(
      isReturn: isReturn,
      hour: picked.hour,
      minute: picked.minute,
    );
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    final label =
        '${days[(proposed.weekday - 1) % 7]}, ${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    await DataService.requestFlowTime(
      requestId: req.id,
      isReturn: isReturn,
      label: label,
      time: proposed,
      requestedByUserId: current.id,
    );
    await DataService.addSystemMessageToThread(
      threadId: thread.id,
      text:
          '${isReturn ? '🔄' : '📦'} $flowLabel ${requestedLabel.isNotEmpty ? 'geändert' : 'angefragt'}: $label Uhr',
    );
    if (!mounted) return;
    AppPopup.toast(context, icon: Icons.schedule, title: '$flowLabel gesendet');
    await _load();
  }

  Future<bool> _timeConfirmedForStart({
    required RentalRequest req,
    required bool isReturn,
  }) async {
    final state = await DataService.getHandoverReturnState(req.id);
    final confirmed =
        state[isReturn ? 'returnTimeConfirmed' : 'handoverTimeConfirmed'] ==
            true;
    final requested =
        ((state[isReturn ? 'returnTimeRequested' : 'handoverTimeRequested']
                    as String?) ??
                '')
            .trim();
    if (requested.isNotEmpty && !confirmed) {
      if (mounted) {
        AppPopup.toast(
          context,
          icon: Icons.schedule,
          title: isReturn
              ? 'Rückgabezeit noch nicht bestätigt'
              : 'Übergabezeit noch nicht bestätigt',
        );
      }
      return false;
    }
    return true;
  }

  Future<void> _showImagePreview(
    List<String> urls, {
    int initialIndex = 0,
  }) async {
    if (urls.isEmpty) return;
    await showGeneralDialog(
      context: context,
      barrierLabel: 'image_preview',
      barrierDismissible: true,
      barrierColor: Colors.transparent,
      pageBuilder: (ctx, anim, secAnim) {
        final images = urls.where((u) => u.isNotEmpty).toList();
        if (images.isEmpty) return const SizedBox.shrink();
        final startIndex = initialIndex.clamp(0, images.length - 1);
        final controller = PageController(initialPage: startIndex);
        var page = startIndex;
        final size = MediaQuery.of(ctx).size;

        Future<void> shift(int delta) async {
          final target = (page + delta).clamp(0, images.length - 1);
          if (target != page) {
            page = target;
            await controller.animateToPage(
              target,
              duration: const Duration(milliseconds: 160),
              curve: Curves.easeOutCubic,
            );
          }
        }

        return StatefulBuilder(
          builder: (context, setState) {
            return Stack(
              fit: StackFit.expand,
              children: [
                Positioned.fill(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => Navigator.of(ctx).maybePop(),
                    child: ClipRect(
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 25.2, sigmaY: 25.2),
                        child: Container(
                          color: Colors.black.withValues(alpha: 0.05),
                        ),
                      ),
                    ),
                  ),
                ),
                SafeArea(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: size.width * 0.85,
                          maxHeight: size.height * 0.75,
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(16),
                            child: Listener(
                              onPointerSignal: (signal) {
                                if (signal is PointerScrollEvent) {
                                  if (signal.scrollDelta.dy > 0 ||
                                      signal.scrollDelta.dx > 0) {
                                    shift(1);
                                  } else if (signal.scrollDelta.dy < 0 ||
                                      signal.scrollDelta.dx < 0) {
                                    shift(-1);
                                  }
                                }
                              },
                              child: Stack(
                                children: [
                                  ScrollConfiguration(
                                    behavior: const ScrollBehavior().copyWith(
                                      scrollbars: false,
                                    ),
                                    child: PageView.builder(
                                      controller: controller,
                                      onPageChanged: (i) =>
                                          setState(() => page = i),
                                      itemCount: images.length,
                                      itemBuilder: (_, i) => DecoratedBox(
                                        decoration: BoxDecoration(
                                          color: Colors.black.withValues(
                                            alpha: 0.08,
                                          ),
                                        ),
                                        child: Center(
                                          child: ClipRRect(
                                            borderRadius: BorderRadius.circular(
                                              16,
                                            ),
                                            child: AppImage(
                                              url: images[i],
                                              fit: BoxFit.contain,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  if (images.length > 1)
                                    Positioned(
                                      left: 0,
                                      right: 0,
                                      bottom: 12,
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          for (int i = 0;
                                              i < images.length;
                                              i++)
                                            AnimatedContainer(
                                              duration: const Duration(
                                                milliseconds: 160,
                                              ),
                                              margin:
                                                  const EdgeInsets.symmetric(
                                                horizontal: 4,
                                              ),
                                              width: i == page ? 10 : 8,
                                              height: i == page ? 10 : 8,
                                              decoration: BoxDecoration(
                                                color: Colors.white.withValues(
                                                  alpha: i == page ? 0.9 : 0.5,
                                                ),
                                                borderRadius:
                                                    BorderRadius.circular(999),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
      transitionBuilder: (ctx, anim, secAnim, child) {
        final curved = CurvedAnimation(
          parent: anim,
          curve: Curves.easeOutCubic,
        );
        return FadeTransition(opacity: curved, child: child);
      },
      transitionDuration: const Duration(milliseconds: 160),
    );
  }

  @override
  Widget build(BuildContext context) {
    final req = _req;
    final item = _item;
    final renter = _renter;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          req?.simulationOnly == true
              ? 'Pilot-Simulation · ${widget.titleOverride ?? _titleFromReq()}'
              : widget.titleOverride ?? _titleFromReq(),
        ),
        centerTitle: true,
        actions: [
          if (req != null && item != null)
            IconButton(
              icon: const Icon(Icons.more_vert),
              onPressed: () async {
                final cat = _categoryFor(req);
                final picked = await showSITOverflowMenu<String>(
                  context,
                  options: [
                    const SitMenuOption(
                      icon: Icons.visibility_rounded,
                      label: 'Anzeige ansehen',
                      value: 'view',
                    ),
                    if (cat == 'upcoming')
                      const SitMenuOption(
                        icon: Icons.cancel_outlined,
                        label: 'Stornieren',
                        value: 'cancel',
                      ),
                    const SitMenuOption(
                      icon: Icons.error_outline,
                      label: 'Problem melden',
                      value: 'issue',
                    ),
                    if (_returnCaseEntryPointEligible(req))
                      const SitMenuOption(
                        icon: Icons.fact_check_outlined,
                        label: 'Rückgabe-Prüffall eröffnen',
                        value: 'return_case',
                      ),
                  ],
                );
                if (!context.mounted) return;
                switch (picked) {
                  case 'view':
                    ItemDetailsOverlay.showFullPage(context, item: item);
                    break;
                  case 'cancel':
                    await AppPopup.show(
                      context,
                      icon: Icons.close,
                      title: 'Buchung stornieren?',
                      message:
                          'Bist du sicher? Diese Buchung wird storniert und der Mieter wird informiert.',
                      barrierDismissible: true,
                      plainCloseIcon: true,
                      actions: [
                        OutlinedButton(
                          onPressed: () => Navigator.of(
                            context,
                            rootNavigator: true,
                          ).maybePop(),
                          child: const Text('Abbrechen'),
                        ),
                        FilledButton(
                          onPressed: () async {
                            Navigator.of(
                              context,
                              rootNavigator: true,
                            ).maybePop();
                            await DataService
                                .updateRentalRequestStatusWithActor(
                              requestId: req.id,
                              status: 'cancelled',
                              cancelledBy: 'owner',
                            );
                            await DataService.addTimelineEvent(
                              requestId: req.id,
                              type: 'cancelled',
                              note: 'Von Vermieter storniert',
                            );
                            if (!context.mounted) return;
                            AppPopup.toast(
                              context,
                              icon: Icons.cancel_outlined,
                              title: 'Buchung storniert',
                            );
                            await _load();
                          },
                          child: const Text('Stornieren'),
                        ),
                      ],
                    );
                    break;
                  case 'issue':
                    await _openSupportFlow(req: req, item: item);
                    break;
                  case 'return_case':
                    await _openReturnCase(req: req, item: item);
                    break;
                  default:
                }
              },
            ),
        ],
      ),
      // Bottom-anchored review button for completed rentals (owner -> renter)
      bottomNavigationBar: Builder(
        builder: (context) {
          final r = _req;
          final it = _item;
          final rn = _renter;
          if (r == null || it == null || rn == null) {
            return const SizedBox.shrink();
          }
          final cat = _categoryFor(r);
          // Show for all "completed" bucket items that are not cancelled/declined
          final isTrulyCompleted = (cat == 'completed') &&
              r.status != 'cancelled' &&
              r.status != 'declined';
          if (!isTrulyCompleted || r.needsReview || r.simulationOnly) {
            return const SizedBox.shrink();
          }
          return SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: SizedBox(
                height: 46,
                child: FilledButton.icon(
                  onPressed: () => _showReviewSheet(context, rn),
                  icon: const Icon(Icons.star_rate_outlined),
                  label: const Text('Bewerten'),
                ),
              ),
            ),
          );
        },
      ),
      body: (req == null || item == null || renter == null)
          ? const Center(child: CircularProgressIndicator())
          : _buildOngoingBody(context, req, item, renter),
    );
  }

  String _titleFromReq() {
    final r = _req;
    if (r == null) return 'Laufende Vermietung';
    switch (_categoryFor(r)) {
      case 'requests':
        return 'Mietanfrage';
      case 'upcoming':
        return 'Kommende Vermietung';
      case 'completed':
        return r.needsReview
            ? 'Vermietung in Prüfung'
            : 'Abgeschlossene Vermietung';
      case 'ongoing':
      default:
        return 'Laufende Vermietung';
    }
  }

  String _categoryFor(RentalRequest r) {
    // Owner view follows strict status-driven categories
    final s = r.status.toLowerCase();
    if (s == 'pending') return 'requests';
    if (s == 'accepted') return 'upcoming';
    if (s == 'running') return 'ongoing';
    if (s == 'completed' || s == 'cancelled' || s == 'declined') {
      return 'completed';
    }
    // Fallback
    return 'upcoming';
  }

  bool _returnCaseEntryPointEligible(RentalRequest request) =>
      ReturnCaseEntryPointPolicy.isEligible(
        bookingStatus: request.status,
        simulationOnly: request.simulationOnly,
        needsReview: request.needsReview,
        platformContract: request.platformContract,
        returnT0: request.returnT0,
        reportDeadline: request.returnReportDeadline,
        returnCaseOpenedAt: request.returnCaseOpenedAt,
      );

  Widget _buildOngoingBody(
    BuildContext context,
    RentalRequest req,
    Item item,
    User renter,
  ) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final due = req.end;
    final diff = due.difference(now);
    final isOverdue = now.isAfter(due) && req.status != 'completed';
    final category = _categoryFor(req);
    final acceptanceDeadlineValid = _ownerAcceptanceDeadlineValid(req);

    final isCompleted = req.status == 'completed';
    final isHeldForReview = req.needsReview;
    final breakdown =
        DataService.priceBreakdownForRequest(item: item, req: req);
    final totalPaid = breakdown.totalRenter;
    final fee = breakdown.platformFee;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Hero image with overlays: status chip (bottom-left), optional countdown (bottom-right),
        // and for upcoming a cancel button (top-right)
        if (_photos.isNotEmpty)
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              width: double.infinity,
              height: 220,
              child: Stack(
                children: [
                  // Ensure the image fills and is centered (avoid half-shifted appearance)
                  Positioned.fill(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _showImagePreview(_photos, initialIndex: 0),
                      child: AppImage(url: _photos.first, fit: BoxFit.cover),
                    ),
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Material(
                      color: Colors.black.withValues(alpha: 0.35),
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () => ItemDetailsOverlay.showFullPage(
                          context,
                          item: item,
                        ),
                        child: const Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(
                            Icons.visibility_outlined,
                            size: 18,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Status chip overlay (bottom-left) across all categories
                  Positioned(
                    left: 8,
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: () {
                          if (category == 'completed') {
                            // Completed bucket may be cancelled or finished
                            final cancelled = req.status == 'cancelled' ||
                                req.status == 'declined';
                            return (cancelled
                                    ? const Color(0xFFF43F5E)
                                    : const Color(0xFF22C55E))
                                .withValues(alpha: 0.12);
                          }
                          if (isCompleted) {
                            return const Color(
                              0xFF22C55E,
                            ).withValues(alpha: 0.12);
                          }
                          switch (category) {
                            case 'requests':
                              return (acceptanceDeadlineValid
                                      ? Colors.grey
                                      : const Color(0xFFF43F5E))
                                  .withValues(alpha: 0.12);
                            case 'upcoming':
                              return const Color(
                                0xFF0EA5E9,
                              ).withValues(alpha: 0.12);
                            case 'ongoing':
                            default:
                              return const Color(
                                0xFF0EA5E9,
                              ).withValues(alpha: 0.12);
                          }
                        }(),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.10),
                        ),
                      ),
                      child: Text(
                        () {
                          if (category == 'completed') {
                            final isCancelled = req.status == 'cancelled';
                            final isDeclined = req.status == 'declined';
                            if (isCancelled && (req.cancelledBy == 'renter')) {
                              return 'Zurückgezogen';
                            }
                            if (isCancelled || isDeclined) return 'Storniert';
                            return 'Abgeschlossen';
                          }
                          if (isCompleted) return 'Abgeschlossen';
                          if (category == 'requests' &&
                              !acceptanceDeadlineValid) {
                            return req.bindingExpiresAt == null
                                ? 'Annahme gesperrt'
                                : 'Annahmefrist abgelaufen';
                          }
                          if (category == 'requests') return 'Anfrage';
                          if (category == 'upcoming') return 'Kommend';
                          return 'Laufend';
                        }(),
                        style: TextStyle(
                          color: () {
                            if (category == 'completed') {
                              final cancelled = req.status == 'cancelled' ||
                                  req.status == 'declined';
                              return cancelled
                                  ? const Color(0xFFF43F5E)
                                  : const Color(0xFF22C55E);
                            }
                            if (isCompleted) return const Color(0xFF22C55E);
                            if (category == 'requests') {
                              return acceptanceDeadlineValid
                                  ? Colors.grey
                                  : const Color(0xFFF43F5E);
                            }
                            return const Color(0xFF0EA5E9);
                          }(),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  // Right countdown: Rückgabe in ... (laufend) or Übergabe in ... (kommend)
                  if (category == 'ongoing')
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.45),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.10),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: (isOverdue
                                      ? const Color(0xFFF43F5E)
                                      : Theme.of(
                                          context,
                                        ).colorScheme.primary)
                                  .withValues(alpha: 0.30),
                              blurRadius: 10,
                              spreadRadius: 0.2,
                            ),
                          ],
                        ),
                        child: Row(
                          children: [
                            Icon(
                              isOverdue
                                  ? Icons.report_outlined
                                  : Icons.timer_outlined,
                              size: 16,
                              color: isOverdue
                                  ? const Color(0xFFF43F5E)
                                  : Colors.white,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              _formatDurationCompact(diff),
                              style: TextStyle(
                                color: isOverdue
                                    ? const Color(0xFFF43F5E)
                                    : Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (category == 'upcoming')
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Builder(
                        builder: (context) {
                          final now = DateTime.now();
                          final d = req.start.difference(now);
                          String text;
                          if (d.isNegative || d.inDays == 0) {
                            text = 'Übergabe Heute';
                          } else if (d.inDays == 1) {
                            text = 'Übergabe in 1 Tag';
                          } else {
                            text = 'Übergabe in ${d.inDays} Tagen';
                          }
                          return Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.45),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.10),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.primary.withValues(alpha: 0.30),
                                  blurRadius: 10,
                                  spreadRadius: 0.2,
                                ),
                              ],
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.timer_outlined,
                                  size: 16,
                                  color: Colors.white,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  text,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),

        const SizedBox(height: 12),

        // Centered title above the info card
        const SizedBox(height: 10),
        Text(
          item.title,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
        ),

        // (verlegt) "Was passiert als Nächstes?" wird unten auf der Seite angezeigt
        if (category == 'requests') ...[
          const SizedBox(height: 10),
          // Actions directly under the image per request
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    await AppPopup.show(
                      context,
                      icon: Icons.block,
                      title: 'Anfrage ablehnen?',
                      message: 'Bist du sicher? Der Mieter wird informiert.',
                      plainCloseIcon: true,
                      leadingWidget: Builder(
                        builder: (context) {
                          final danger = Theme.of(context).colorScheme.error;
                          return Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.transparent,
                              border: Border.all(color: danger, width: 2),
                            ),
                            child: Icon(Icons.close, color: danger),
                          );
                        },
                      ),
                      actions: [
                        OutlinedButton(
                          onPressed: () => Navigator.of(
                            context,
                            rootNavigator: true,
                          ).maybePop(),
                          child: const Text('Abbrechen'),
                        ),
                        FilledButton(
                          onPressed: () async {
                            Navigator.of(
                              context,
                              rootNavigator: true,
                            ).maybePop();
                            await DataService.updateRentalRequestStatus(
                              requestId: req.id,
                              status: 'declined',
                            );
                            await DataService.addTimelineEvent(
                              requestId: req.id,
                              type: 'declined',
                              note: 'Anfrage abgelehnt',
                            );
                            if (!mounted) return;
                            await _load();
                            if (!context.mounted) return;
                            // Auto-close after 3 seconds
                            Future.delayed(const Duration(seconds: 3), () {
                              if (context.mounted) {
                                Navigator.of(
                                  context,
                                  rootNavigator: true,
                                ).maybePop();
                              }
                            });
                            // Result popup
                            // ignore: unawaited_futures
                            AppPopup.show(
                              context,
                              icon: Icons.cancel_outlined,
                              title: 'Du hast die Anfrage abgelehnt.',
                              message:
                                  'Du findest sie jetzt unter Abgeschlossene Vermietungen.',
                              barrierDismissible: true,
                              showCloseIcon: false,
                              plainCloseIcon: true,
                              autoCloseAfter: const Duration(seconds: 20),
                              actions: [
                                FilledButton(
                                  onPressed: () {
                                    Navigator.of(
                                      context,
                                      rootNavigator: true,
                                    ).maybePop();
                                    Navigator.of(context).pushReplacement(
                                      MaterialPageRoute(
                                        builder: (_) => OwnerRequestsScreen(
                                          initialTabIndex: 3,
                                        ),
                                      ),
                                    );
                                  },
                                  child: const Text(
                                    'Zu Abgeschlossene Vermietungen',
                                  ),
                                ),
                              ],
                            );
                          },
                          child: const Text('Ablehnen'),
                        ),
                      ],
                    );
                  },
                  icon: const Icon(
                    Icons.cancel_outlined,
                    color: Color(0xFFF43F5E),
                  ),
                  label: const Text('Ablehnen'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFF43F5E),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: acceptanceDeadlineValid
                      ? () async {
                          final declarations =
                              await showPrivatePilotOwnerAcceptanceDialog(
                            context,
                            request: req,
                          );
                          if (declarations == null) return;
                          if (!context.mounted) return;
                          final accepted =
                              await commitPrivatePilotOwnerAcceptance(
                            context,
                            request: req,
                            legalDeclarations: declarations,
                          );
                          if (!accepted) return;
                          await DataService.addTimelineEvent(
                            requestId: req.id,
                            type: 'accepted',
                            note: 'Anfrage akzeptiert',
                          );
                          if (!mounted) return;
                          await _load();
                          if (!context.mounted) return;
                          // Auto-close after 3 seconds
                          Future.delayed(const Duration(seconds: 3), () {
                            if (context.mounted) {
                              Navigator.of(context, rootNavigator: true)
                                  .maybePop();
                            }
                          });
                          // Result popup
                          // ignore: unawaited_futures
                          AppPopup.show(
                            context,
                            icon: Icons.check_circle_outline,
                            title: 'Du hast die Anfrage akzeptiert.',
                            message:
                                'Du findest diese Vermietung jetzt unter Kommende Vermietungen.',
                            barrierDismissible: true,
                            showCloseIcon: false,
                            plainCloseIcon: true,
                            autoCloseAfter: const Duration(seconds: 20),
                            actions: [
                              FilledButton(
                                onPressed: () {
                                  Navigator.of(
                                    context,
                                    rootNavigator: true,
                                  ).maybePop();
                                  Navigator.of(context).pushReplacement(
                                    MaterialPageRoute(
                                      builder: (_) => OwnerRequestsScreen(
                                        initialTabIndex: 1,
                                      ),
                                    ),
                                  );
                                },
                                child: const Text(
                                  'Zu Kommende Vermietungen',
                                ),
                              ),
                            ],
                          );
                        }
                      : null,
                  icon: const Icon(
                    Icons.check_circle_outline,
                    color: Color(0xFF22C55E),
                  ),
                  label: const Text(
                    'Akzeptieren',
                    style: TextStyle(color: Color(0xFF22C55E)),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          if (!acceptanceDeadlineValid) ...[
            const SizedBox(height: 8),
            Text(
              req.bindingExpiresAt == null
                  ? 'Die verbindliche Annahmefrist fehlt. Diese Anfrage kann nicht angenommen werden; bitte lade die Ansicht neu.'
                  : 'Die 30-Minuten-Annahmefrist ist abgelaufen. Diese Anfrage kann nicht mehr angenommen werden.',
              style: const TextStyle(
                color: Color(0xFFF43F5E),
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],

        const SizedBox(height: 12),

        // Removed separate inline "Problem melden"; now available from overflow menu
        const SizedBox(height: 16),
        // Details card (modernized, tighter spacing, transport sentence inline)
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withValues(alpha: 0.06),
                Colors.white.withValues(alpha: 0.03),
              ],
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Private-pilot transport is self pickup and self return.
              Builder(
                builder: (context) {
                  String? t;
                  if (req.simulationOnly) {
                    t = 'Unverbindliche Pilot-Simulation: kein Vertrag, keine Reservierung und keine Zahlung.';
                  } else if (category == 'upcoming' || category == 'requests') {
                    t = 'Der Mieter holt den Artikel selbst ab.';
                  } else if (category == 'ongoing') {
                    t = 'Der Mieter bringt den Artikel selbst zurück.';
                  }
                  if (t == null) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Center(
                      child: Text(
                        t,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                },
              ),
              _InfoRow(
                icon: Icons.schedule,
                label: 'Zeitraum',
                value: _formatRange(req.start, req.end),
              ),
              const SizedBox(height: 4),
              _InfoRow(
                icon: Icons.timelapse,
                label: 'Dauer',
                value: _formatDaysHours(req.end.difference(req.start)),
              ),
              const SizedBox(height: 4),
              if (category != 'requests')
                _InfoRow(
                  icon: Icons.tag,
                  label: 'Buchungs-ID',
                  value: _computeBookingId(item, req),
                ),
              if (category != 'requests') ...[
                const SizedBox(height: 6),
                Divider(
                  height: 12,
                  color: Colors.white.withValues(alpha: 0.08),
                ),
                const SizedBox(height: 2),
              ],
              const SizedBox(height: 6),
              _CounterpartyRow(
                name: renter.displayName,
                avatarUrl: renter.photoURL,
                role: 'Mieter',
                onProfile: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PublicProfileScreen(userId: renter.id),
                    ),
                  );
                },
                // Remove message button for requests (Ausstehende Anmietung)
                onMessage: (category == 'requests')
                    ? null
                    : () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => MessageThreadScreen(
                              requestId: req.id,
                              participantName: renter.displayName,
                              avatarUrl: renter.photoURL,
                              itemTitle: item.title,
                            ),
                          ),
                        );
                      },
              ),
            ],
          ),
        ),

        if (_addressVisibility['result'] == 'revealed' &&
            _confirmedLocationText(false) != null) ...[
          const SizedBox(height: 12),
          _AddressInfoCardInline(
            icon: Icons.place_outlined,
            text: _confirmedLocationText(false)!,
          ),
        ],
        if (_addressVisibility['result'] == 'revealed' &&
            _confirmedLocationMapsUrl(false).isNotEmpty) ...[
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => _openConfirmedLocationUrl(false),
              child: const Text('In Google Maps öffnen'),
            ),
          ),
        ],
        if (_confirmedLocationText(true) != null) ...[
          const SizedBox(height: 8),
          _AddressInfoCardInline(
            icon: Icons.place,
            text: _confirmedLocationText(true)!,
          ),
        ],
        if (_confirmedLocationMapsUrl(true).isNotEmpty) ...[
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => _openConfirmedLocationUrl(true),
              child: const Text('In Google Maps öffnen'),
            ),
          ),
        ],

        const SizedBox(height: 16),
        // Payment summary (owner view): only payout shown
        if (!req.simulationOnly)
          Container(
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.20),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Zahlungsübersicht',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                // If this rental was cancelled by the owner, there is no payout
                if (req.status == 'cancelled' &&
                    (req.cancelledBy == 'owner')) ...[
                  _AmountRow(
                      label: 'Auszahlung', value: '0,00 €', strong: true),
                  const SizedBox(height: 2),
                  Text(
                    'Keine Auszahlung, da vom Vermieter storniert.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white70,
                    ),
                  ),
                ] else if (isCompleted && isHeldForReview) ...[
                  _AmountRow(
                    label: 'Wird geprüft',
                    value: 'Wird nach Prüfung abgeschlossen',
                    strong: true,
                  ),
                ] else if (isCompleted) ...[
                  _AmountRow(
                    label: 'Ausgezahlt (an Vermieter)',
                    value: _formatEuro(totalPaid - fee),
                    strong: true,
                  ),
                  Text(
                    'Ausgezahlt am ${_formatPayoutDate(req.end)}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white70,
                    ),
                  ),
                ] else ...[
                  _AmountRow(
                    label: 'Vorauss. Auszahlung',
                    value: _formatEuro(breakdown.payoutOwner),
                    strong: true,
                  ),
                  Text(
                    'Auszahlung am ${_formatPayoutDate(req.end)}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white70,
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                if (!isHeldForReview &&
                    (category == 'ongoing' || category == 'completed') &&
                    !(req.status == 'cancelled' &&
                        (req.cancelledBy == 'owner')))
                  Align(
                    alignment: Alignment.center,
                    child: OutlinedButton.icon(
                      onPressed: () => _downloadReceiptPdf(req),
                      icon: const Icon(Icons.picture_as_pdf),
                      label: const Text('Beleg herunterladen (PDF)'),
                    ),
                  ),
              ],
            ),
          ),

        // Completion summary (like renter view) – show for completed bucket including cancelled
        const SizedBox(height: 12),
        if (category == 'completed')
          Container(
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.20),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isHeldForReview ? 'Prüfstatus' : 'Abschluss-Zusammenfassung',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                _FactRow(
                  icon: req.status == 'cancelled'
                      ? Icons.cancel_outlined
                      : (isHeldForReview
                          ? Icons.hourglass_top_outlined
                          : Icons.verified_outlined),
                  label: 'Status',
                  value: () {
                    if (req.status == 'cancelled' &&
                        (req.cancelledBy == 'renter')) {
                      return 'Zurückgezogen';
                    }
                    if (req.status == 'cancelled') return 'Storniert';
                    if (isHeldForReview) return 'Wird geprüft';
                    return 'Abgeschlossen';
                  }(),
                  color: req.status == 'cancelled'
                      ? const Color(0xFFF43F5E)
                      : (isHeldForReview
                          ? const Color(0xFFF59E0B)
                          : Colors.blueGrey),
                ),
                const SizedBox(height: 8),
                _FactRow(
                  icon: Icons.event_busy,
                  label: req.status == 'cancelled'
                      ? 'Storniert am'
                      : 'Rückgabe bestätigt',
                  value: _formatRange(
                    req.start,
                    req.end,
                  ).split('–').last.trim(),
                ),
                const SizedBox(height: 8),
                _FactRow(
                  icon: Icons.receipt_long_outlined,
                  label: 'Beleg',
                  value: isHeldForReview
                      ? 'Wird nach Prüfung bereitgestellt'
                      : 'Erstattung gem. Richtlinien',
                ),
                if (isHeldForReview) ...[
                  const SizedBox(height: 8),
                  _FactRow(
                    icon: Icons.info_outline,
                    label: 'Hinweis',
                    value:
                        'Zu dieser Buchung liegt eine Rückmeldung vor. Wir prüfen den Vorgang sorgfältig und schließen die Buchung danach vollständig ab. Danke für dein Verständnis.',
                  ),
                ],
              ],
            ),
          ),

        // Bottom timeline removed in favor of compact status card
        const SizedBox(height: 12),
        if (!req.simulationOnly &&
            (category == 'requests' ||
                category == 'upcoming' ||
                category == 'ongoing'))
          Container(
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.20),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Theme(
              data: theme.copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                collapsedIconColor: Colors.white70,
                iconColor: Colors.white70,
                leading: const Icon(Icons.help_outline, color: Colors.white70),
                title: Text(
                  'Was passiert als Nächstes?',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                childrenPadding: const EdgeInsets.only(
                  left: 0,
                  right: 0,
                  bottom: 12,
                ),
                children: [
                  if (category == 'requests') ...const [
                    _Bullet(
                      text:
                          'Prüfe die Details und entscheide, ob du die Anfrage annimmst oder ablehnst.',
                    ),
                    _Bullet(
                      text:
                          'Wenn du die Anfrage annimmst, erscheint sie unter Kommende Vermietungen.',
                    ),
                    _Bullet(
                      text:
                          'Vereinbare mit dem Mieter einen konkreten Zeitpunkt für Übergabe und Rückgabe.',
                    ),
                  ] else if (category == 'upcoming') ...const [
                    _Bullet(
                      text:
                          'Triff dich mit dem Mieter zum vereinbarten Übergabezeitpunkt.',
                    ),
                    _Bullet(
                      text:
                          'Tippe auf „Übergabe starten“, wenn ihr euch trefft.',
                    ),
                    _Bullet(
                      text:
                          'Beide müssen mindestens 4 Übergabe‑Fotos vom Artikel machen.',
                    ),
                    _Bullet(
                      text:
                          'Übergabe bestätigen durch QR‑Code‑Scan oder Eingabe des 6‑stelligen Übergabecodes.',
                    ),
                  ] else ...const [
                    _Bullet(
                      text:
                          'Triff dich mit dem Mieter zum vereinbarten Rückgabezeitpunkt.',
                    ),
                    _Bullet(
                      text:
                          'Tippe auf „Rückgabe starten“, wenn ihr euch trefft.',
                    ),
                    _Bullet(
                      text:
                          'Beide müssen mindestens 4 Rückgabe‑Fotos vom Artikel machen.',
                    ),
                    _Bullet(
                      text:
                          'Rückgabe bestätigen durch QR‑Code‑Scan oder Eingabe des 6‑stelligen Rückgabecodes.',
                    ),
                    _Bullet(
                      text:
                          'Tippe auf „Abschließen“, um die Übergabe abzuschließen.',
                    ),
                  ],
                ],
              ),
            ),
          ),

        const SizedBox(height: 16),
        // Handover/Return block moved to the very bottom (above page padding)
        // Show only for upcoming or ongoing. Hide for completed (incl. cancelled/declined)
        // and for requests.
        if (!req.simulationOnly &&
            (category == 'upcoming' || category == 'ongoing'))
          Container(
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.20),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category == 'upcoming' ? 'Übergabe' : 'Rückgabe',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                if (category == 'upcoming') ...[
                  _InlineTimeActionButton(
                    icon: Icons.inventory_2_rounded,
                    label: 'Übergabezeit',
                    onTap: () => _manageBookingTime(req: req, isReturn: false),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () async {
                            if (!await _timeConfirmedForStart(
                              req: req,
                              isReturn: false,
                            )) {
                              return;
                            }
                            if (!context.mounted) return;
                            await _startPickupFlowOwner(
                              context,
                              req,
                              item,
                              renter,
                            );
                          },
                          icon: const Icon(Icons.qr_code_scanner),
                          label: const Text('Übergabe starten'),
                        ),
                      ),
                    ],
                  ),
                ] else if (category == 'ongoing' && !req.needsReview) ...[
                  _InlineTimeActionButton(
                    icon: Icons.undo_rounded,
                    label: 'Rückgabezeit',
                    onTap: () => _manageBookingTime(req: req, isReturn: true),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () async {
                            if (!await _timeConfirmedForStart(
                              req: req,
                              isReturn: true,
                            )) {
                              return;
                            }
                            if (!context.mounted) return;
                            await _startReturnFlow(context, req, item, renter);
                          },
                          icon: const Icon(Icons.qr_code_scanner),
                          label: const Text('Rückgabe starten'),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

        // Review button moved to bottomNavigationBar for completed owner view

        // Problem melden should be at the bottom for completed
        // Removed duplicate Problem melden CTA – moved to overflow menu
      ],
    );
  }

  Future<void> _downloadReceiptPdf(RentalRequest req) async {
    try {
      final documents = await InvoicesService.getInvoicesForCurrentUser();
      final matching = documents.where((document) =>
          document.bookingId == req.id &&
          document.type == InvoiceType.ownerPayoutStatement);
      if (matching.isEmpty) {
        if (mounted) {
          await AppPopup.info(
            context,
            title: 'Noch kein Auszahlungsnachweis',
            message:
                'Der Beleg wird erst nach einer tatsächlich ausgeführten Auszahlung bereitgestellt.',
          );
        }
        return;
      }
      final invoice = matching.first;
      await InvoicesService.verifyDownloadArtifact(invoice);
      final bytes = await InvoicePdfService.buildPdf(invoice);
      final fileName =
          'SIT_Auszahlungsbeleg_${invoice.bookingId}_${invoice.issuedAt.toIso8601String().split('T').first}.pdf';
      final saveResult = await LocalArtifactStorageService.maybeSaveReceiptPdf(
        bytes: bytes,
        artifactKey:
            'financial-document:${invoice.id}:${invoice.artifactSha256}',
        filename: fileName,
      );
      if (!saveResult.handledPrimaryAction) {
        await Printing.layoutPdf(name: fileName, onLayout: (_) async => bytes);
      }
    } catch (error) {
      debugPrint('[OngoingOwnerDetail] payout document failed: $error');
      if (mounted) {
        await AppPopup.error(
          context,
          title: 'Auszahlungsnachweis konnte nicht geladen werden',
          message: 'Bitte versuche es erneut.',
        );
      }
    }
  }

  String _formatRange(DateTime a, DateTime b) {
    // Show dates only (no time-of-day) to match the SIT design app-wide
    const months = [
      'Jan',
      'Feb',
      'M\u00e4r',
      'Apr',
      'Mai',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dez',
    ];
    String dd(int v) => v.toString().padLeft(2, '0');
    final sa = '${dd(a.day)}. ${months[(a.month - 1).clamp(0, 11)]}';
    final sb = '${dd(b.day)}. ${months[(b.month - 1).clamp(0, 11)]}';
    return '$sa – $sb';
  }

  String _formatDurationCompact(Duration d) {
    final days = d.inDays;
    if (d.isNegative) {
      final ad = d.abs();
      final aDays = ad.inDays;
      if (aDays == 0) return 'Überfällig seit Heute';
      if (aDays == 1) return 'Überfällig seit 1 Tag';
      return 'Überfällig seit $aDays Tagen';
    }
    if (days == 0) return 'Rückgabe Heute';
    if (days == 1) return 'Rückgabe in 1 Tag';
    return 'Rückgabe in $days Tagen';
  }

  String _formatDaysHours(Duration d) {
    final days = d.inDays;
    if (days == 0) return '1 Tag';
    if (days == 1) return '1 Tag';
    return '$days Tage';
  }

  String _computeBookingId(Item item, RentalRequest req) {
    final seed =
        ((item.id.hashCode) ^ (req.id.hashCode) ^ (item.title.hashCode)).abs();
    final s = seed.toString().padLeft(8, '0');
    return 'BKG-${s.substring(0, 4)}-${s.substring(4, 8)}';
  }

  String _formatEuro(double v) {
    String two = v.toStringAsFixed(2);
    two = two.replaceAll('.', ',');
    return '$two €';
  }

  String _formatPayoutDate(DateTime end) {
    final payout = end.add(const Duration(days: 1));
    const months = [
      'Jan',
      'Feb',
      'Mär',
      'Apr',
      'Mai',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dez',
    ];
    final m = months[(payout.month - 1).clamp(0, 11)];
    final dd = payout.day.toString().padLeft(2, '0');
    return '$dd. $m';
  }

  bool _canCompleteOwnerReturn(RentalRequest req) {
    final status = req.status.toLowerCase().trim();
    return status == 'running';
  }

  Future<bool> _guardRequiredReturnPhotos(String requestId) async {
    final returnPhotos = await DataService.getReturnPhotoCount(requestId);
    if (returnPhotos >= DataService.minimumRequiredPhotos) return true;
    if (mounted) {
      AppPopup.toast(
        context,
        icon: Icons.photo_camera_back_outlined,
        title: 'Bitte dokumentiere die Rückgabe zuerst mit mindestens 4 Fotos.',
      );
    }
    return false;
  }

  Future<bool> _acknowledgeGalleryEvidenceIfNeeded(
    String requestId, {
    required bool isReturn,
  }) async {
    final galleryUsed = isReturn
        ? await DataService.wasReturnGalleryUsed(requestId)
        : await DataService.wasHandoverGalleryUsed(requestId);
    if (!galleryUsed) return true;
    if (!mounted) return false;
    bool acknowledged = false;
    await AppPopup.show(
      context,
      icon: Icons.photo_library_outlined,
      title: 'Galerie-Fotos verwendet',
      message:
          'Hinweis: Mindestens ein Foto wurde aus der Galerie hinzugefügt. Bitte prüfe die Dokumentation bewusst, bevor du bestätigst.',
      actions: [
        OutlinedButton(
          onPressed: () =>
              Navigator.of(context, rootNavigator: true).maybePop(),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          onPressed: () {
            acknowledged = true;
            Navigator.of(context, rootNavigator: true).maybePop();
          },
          child: const Text('Trotzdem bestätigen'),
        ),
      ],
    );
    return acknowledged;
  }

  Future<bool> _guardActiveFlow(
    String requestId, {
    required bool isReturn,
  }) async {
    final state = await DataService.getHandoverReturnState(requestId);
    final isActive = isReturn
        ? state['returnActive'] == true
        : state['handoverActive'] == true;
    if (isActive) return true;
    if (mounted) {
      AppPopup.toast(
        context,
        icon: Icons.info_outline,
        title: isReturn
            ? 'Bitte starte die Rückgabe zuerst im Chat.'
            : 'Bitte starte die Übergabe zuerst im Chat.',
      );
    }
    return false;
  }

  Future<String?> _guardAuthenticatedOwner(String ownerId) async {
    final current = await DataService.getCurrentUser();
    final expectedOwnerId = ownerId.trim();
    if (current == null ||
        expectedOwnerId.isEmpty ||
        current.id != expectedOwnerId) {
      if (mounted) {
        AppPopup.toast(
          context,
          icon: Icons.lock_outline,
          title: 'Diese Bestätigung ist nur für den Vermieter möglich.',
        );
      }
      return null;
    }
    return current.id;
  }

  Future<void> _startReturnFlow(
    BuildContext context,
    RentalRequest req,
    Item item,
    User renter,
  ) async {
    final ok = await ReturnHandoverStepperSheet.push(
      context,
      item: item,
      request: req,
      renterName: renter.displayName,
      ownerName: _owner?.displayName ?? 'Vermieter',
      handoverCode: '',
      confirmationVerifier: ({qrPayload, code}) =>
          DataService.verifyBookingConfirmationChallenge(
        requestId: req.id,
        segment: HandoverCodeService.segmentReturn,
        presenterRole: HandoverCodeService.presenterRenter,
        qrPayload: qrPayload,
        code: code,
      ),
      viewerIsOwner: true,
      mode: ReturnFlowMode.returnFlow,
    );
    final counterpartyConfirmed = ok?.confirmed == true;
    if (counterpartyConfirmed) {
      await _completeOwnerReturnWithSideEffects(
        req: req,
        item: item,
        renter: renter,
      );
    }
  }

  Future<void> _completeOwnerReturnWithSideEffects({
    required RentalRequest req,
    required Item item,
    required User renter,
  }) async {
    // Set completed, add timeline + notification, send receipt
    final ownerUserId = await _guardAuthenticatedOwner(req.ownerId);
    if (!mounted) return;
    if (ownerUserId == null) return;
    if (!_canCompleteOwnerReturn(req)) {
      AppPopup.toast(
        context,
        icon: Icons.info_outline,
        title: 'Rückgabe ist gerade nicht verfügbar',
      );
      return;
    }
    final isActive = await _guardActiveFlow(req.id, isReturn: true);
    if (!isActive) return;
    final hasRequiredPhotos = await _guardRequiredReturnPhotos(req.id);
    if (!hasRequiredPhotos) return;
    final galleryAcknowledged = await _acknowledgeGalleryEvidenceIfNeeded(
      req.id,
      isReturn: true,
    );
    if (!galleryAcknowledged) return;
    final transition = await DataService.confirmReturnTransition(
      requestId: req.id,
      confirmedByUserId: ownerUserId,
      method: 'stepper',
      confirmationContextVerified: true,
      galleryAcknowledged: galleryAcknowledged,
      reviewPauseSource: 'ongoing_owner_detail_screen',
    );
    if (!transition.success) {
      if (!mounted) return;
      AppPopup.toast(
        context,
        icon: Icons.info_outline,
        title: transition.errorMessage ?? 'Rückgabe nicht abgeschlossen',
      );
      await _load();
      return;
    }
    await DataService.addNotification(
      title: 'Buchung abgeschlossen',
      body:
          'Die Rückgabe für "${item.title}" wurde abgeschlossen. Beleg gesendet.',
    );
    if (!mounted) return;
    AppPopup.toast(context, icon: Icons.receipt_long, title: 'Beleg gesendet');
    await _load(); // refresh request
    if (!mounted) return;
    // Schedule a review reminder for the owner in 10 minutes instead of immediate prompt
    try {
      final owner = _owner;
      if (owner != null) {
        await DataService.scheduleReviewReminder(
          requestId: req.id,
          itemId: item.id,
          reviewerId: owner.id,
          reviewedUserId: renter.id,
          direction: 'owner_to_renter',
          dueAt: DateTime.now().add(const Duration(minutes: 10)),
        );
      }
    } catch (_) {}
  }

  Future<void> _startPickupFlowOwner(
    BuildContext context,
    RentalRequest req,
    Item item,
    User renter,
  ) async {
    final challenge = await DataService.issueBookingConfirmationChallenge(
      requestId: req.id,
      segment: HandoverCodeService.segmentPickup,
    );
    if (challenge == null) {
      if (!context.mounted) return;
      AppPopup.toast(
        context,
        icon: Icons.lock_outline,
        title: 'Sicherer Übergabe-Code konnte nicht erstellt werden.',
      );
      return;
    }
    if (!context.mounted) return;
    await ReturnHandoverStepperSheet.push(
      context,
      item: item,
      request: req,
      renterName: renter.displayName,
      ownerName: _owner?.displayName ?? 'Vermieter',
      handoverCode: challenge['code']?.toString() ?? '',
      qrPayload: challenge['qrPayload']?.toString(),
      viewerIsOwner: true,
      mode: ReturnFlowMode.pickupFlow,
    );
  }

  Future<void> _showReviewSheet(BuildContext context, User renter) async {
    final request = _req;
    final item = _item;
    final owner = _owner;
    if (request == null || item == null || owner == null) return;
    final ok = await ReviewPromptSheet.show(
      context,
      requestId: request.id,
      itemId: item.id,
      reviewerId: owner.id,
      reviewedUserId: renter.id,
      direction: 'owner_to_renter',
    );
    if (ok == true && context.mounted) {
      await AppPopup.toast(
        context,
        icon: Icons.star_rate_outlined,
        title: 'Danke für deine Bewertung!',
      );
    } else if (ok == false && context.mounted) {
      await AppPopup.toast(
        context,
        icon: Icons.check_circle_outline,
        title: 'Bewertung abgegeben',
      );
    }
  }
}

/// Small non-collapsible card identical in look to the renter view
/// used under the map to show either the privacy notice (with a lock)
/// or the exact address (with a pin).
class _AddressInfoCardInline extends StatelessWidget {
  final IconData icon;
  final String text;
  const _AddressInfoCardInline({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.20),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      padding: const EdgeInsets.all(10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white70, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.white70,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  final String text;
  const _Bullet({required this.text});
  @override
  Widget build(BuildContext context) {
    final style = Theme.of(
      context,
    ).textTheme.bodyMedium?.copyWith(color: Colors.white70, height: 1.3);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text('•', style: style),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: style)),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });
  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Colors.white, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CounterpartyRow extends StatelessWidget {
  final String name;
  final String? avatarUrl;
  final String role;
  final VoidCallback? onProfile;
  final VoidCallback? onMessage;
  const _CounterpartyRow({
    required this.name,
    this.avatarUrl,
    required this.role,
    this.onProfile,
    this.onMessage,
  });
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onProfile,
          child: SitUserAvatar(
            url: avatarUrl,
            radius: 18,
            borderColor: Colors.white.withValues(alpha: 0.12),
            placeholderIcon: Icons.person_outline,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                role,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: Colors.white70),
              ),
            ],
          ),
        ),
        if (onMessage != null)
          IconButton(
            tooltip: 'Nachricht',
            onPressed: onMessage,
            icon: const Icon(Icons.forum_outlined, color: Colors.white70),
          ),
      ],
    );
  }
}

class _AmountRow extends StatelessWidget {
  final String label;
  final String value;
  final bool strong;
  const _AmountRow({
    required this.label,
    required this.value,
    this.strong = false,
  });
  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: Colors.white,
          fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
        );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.white70,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          Text(value, style: style),
        ],
      ),
    );
  }
}

class _FactRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? color;
  const _FactRow({
    required this.icon,
    required this.label,
    required this.value,
    this.color,
  });
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 18, color: color ?? Colors.white),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: theme.colorScheme.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _InlineTimeActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _InlineTimeActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: const Color(0xFFB8956C)),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
