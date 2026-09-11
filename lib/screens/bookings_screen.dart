import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lendify/screens/booking_detail_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/user.dart' as model;
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/box_chat_icon.dart';
import 'package:lendify/widgets/review_prompt_sheet.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/widgets/local_state_error_panel.dart';
import 'package:lendify/utils/booking_status_copy.dart';

class BookingsScreen extends StatefulWidget {
  final int?
      initialTabIndex; // Neue Reihenfolge: 0: Laufend, 1: Kommend, 2: Ausstehend, 3: Abgeschlossen
  // When provided, the card with this requestId will pulse briefly to
  // indicate it was just created.
  final String? highlightRequestId;
  const BookingsScreen(
      {super.key, this.initialTabIndex, this.highlightRequestId});

  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _allBookings = const [];
  Timer? _ticker;
  // Used to disable highlight after navigation/first render
  String? _highlightRequestId;
  String? _currentUserId;
  // Track unread counts per category
  final Map<String, int> _unreadCounts = {};
  StreamSubscription<String>? _sharedPersistenceSub;
  final SharedPersistenceRefreshCoordinator _sharedPersistenceRefresh =
      SharedPersistenceRefreshCoordinator();
  int _loadRevision = 0;
  bool _loading = true;
  bool _hasLoadedSnapshot = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
        length: 4, vsync: this, initialIndex: widget.initialTabIndex ?? 0);
    _tabController.addListener(() {
      if (!mounted) return;
      // Rebuild AppBar title while swiping or tapping between tabs.
      setState(() {});
    });
    _highlightRequestId = widget.highlightRequestId;
    _load();
    _sharedPersistenceSub = SharedPersistenceSync.changes.listen((key) {
      if (!mounted) return;
      if (key == SharedPersistenceSync.accountSecurityStateKey) {
        _loadRevision += 1;
        setState(() {
          _allBookings = const [];
          _currentUserId = null;
          _unreadCounts.clear();
          _loading = true;
          _hasLoadedSnapshot = false;
          _loadError = null;
        });
        unawaited(_sharedPersistenceRefresh.schedule(() async {
          await SharedPersistenceSync.reloadPreferences();
          if (mounted) await _load();
        }));
        return;
      }
      if (!SharedPersistenceSync.affectsBookingSync(key)) return;
      unawaited(_sharedPersistenceRefresh.schedule(() async {
        await SharedPersistenceSync.reloadPreferences();
        if (mounted) await _load();
      }));
    });
    // Periodically refresh to update countdowns and move cards between tabs
    _ticker = Timer.periodic(const Duration(minutes: 1), (_) async {
      if (!mounted) return;
      await _maybeShowReviewReminder();
      setState(() {});
    });
    // Also check once shortly after open
    Future.delayed(
        const Duration(seconds: 2), () => _maybeShowReviewReminder());
  }

  @override
  void dispose() {
    _sharedPersistenceSub?.cancel();
    _sharedPersistenceRefresh.dispose();
    _ticker?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  bool _canReviewCompletedBooking(Map<String, dynamic> booking) {
    final rawStatus =
        ((booking['rawStatus'] as String?) ?? '').toLowerCase().trim();
    final requestId = (booking['requestId'] as String?)?.trim() ?? '';
    final itemId = (booking['itemId'] as String?)?.trim() ?? '';
    final listerId = (booking['listerId'] as String?)?.trim() ?? '';
    final needsReview = booking['needsReview'] == true;
    final alreadyReviewed = booking['hasSubmittedReview'] == true;
    return rawStatus == 'completed' &&
        !needsReview &&
        !alreadyReviewed &&
        requestId.isNotEmpty &&
        itemId.isNotEmpty &&
        listerId.isNotEmpty;
  }

  bool _showingReminder = false;
  Future<void> _maybeShowReviewReminder() async {
    if (_showingReminder) return;
    final current = await DataService.getCurrentUser();
    if (current == null) return;
    final reminder =
        await DataService.takeDueReviewReminder(reviewerId: current.id);
    if (!mounted || reminder == null) return;
    _showingReminder = true;
    try {
      final String requestId = (reminder['requestId'] ?? '').toString();
      final String itemId = (reminder['itemId'] ?? '').toString();
      final String reviewedUserId =
          (reminder['reviewedUserId'] ?? '').toString();
      final String direction =
          (reminder['direction'] ?? 'renter_to_owner').toString();
      await AppPopup.show(
        context,
        icon: Icons.star_rate_outlined,
        title: 'Zeit für eine Bewertung',
        message: 'Magst du deine letzte Buchung bewerten?',
        barrierDismissible: true,
        plainCloseIcon: true,
        actions: [
          TextButton(
            onPressed: () async {
              Navigator.of(context, rootNavigator: true).maybePop();
              await DataService.postponeReviewReminder(
                  reminder: reminder, by: const Duration(minutes: 10));
              _showingReminder = false;
            },
            child: const Text('Später erinnern'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(context, rootNavigator: true).maybePop();
              final ok = await ReviewPromptSheet.show(
                context,
                requestId: requestId,
                itemId: itemId,
                reviewerId: current.id,
                reviewedUserId: reviewedUserId,
                direction: direction,
              );
              if (ok == true && mounted) {
                await AppPopup.toast(context,
                    icon: Icons.star_rate_outlined,
                    title: 'Danke für deine Bewertung!');
                final item = await DataService.getItemById(itemId);
                if (item != null && mounted) {
                  await ItemDetailsOverlay.showFullPage(context, item: item);
                }
              }
              _showingReminder = false;
            },
            child: const Text('Jetzt bewerten'),
          ),
        ],
      );
    } catch (_) {
      _showingReminder = false;
    }
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    LocalPrincipalActionOwner? actionOwner;
    if (mounted) {
      setState(() {
        _allBookings = const [];
        _currentUserId = null;
        _unreadCounts.clear();
        _loading = true;
        _hasLoadedSnapshot = false;
        _loadError = null;
      });
    }
    try {
      actionOwner = await LocalPrincipalActionOwner.capture();
      final user = await DataService.readCurrentUserForSessionTransition();
      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      final expectedUserId = actionOwner.sessionOwner?.userId?.trim() ?? '';
      if (user == null ||
          expectedUserId.isEmpty ||
          user.id.trim() != expectedUserId) {
        throw StateError(
            'Für deine Buchungen ist eine Anmeldung erforderlich.');
      }

      final requests = await DataService.getRentalRequestsForRenter(user.id);
      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      if (requests.isEmpty) {
        setState(() {
          _currentUserId = user.id;
          _loading = false;
          _hasLoadedSnapshot = true;
        });
        return;
      }

      // A request is authoritative. If its referenced listing cannot be
      // hydrated, fail the complete snapshot closed instead of turning the
      // missing card into a false server-confirmed empty state.
      final Map<String, Item> itemById = {};
      final Map<String, model.User?> userById = {};
      for (final request in requests) {
        if (itemById.containsKey(request.itemId)) continue;
        final item = await DataService.getItemById(request.itemId);
        await actionOwner.assertCurrent();
        if (!mounted || revision != _loadRevision) return;
        if (item == null) {
          throw StateError('Eine gebuchte Anzeige ist nicht verfügbar.');
        }
        itemById[request.itemId] = item;
      }
      for (final item in itemById.values) {
        if (userById.containsKey(item.ownerId)) continue;
        userById[item.ownerId] = await DataService.getUserById(item.ownerId);
        await actionOwner.assertCurrent();
        if (!mounted || revision != _loadRevision) return;
      }

      final maps = <Map<String, dynamic>>[];
      for (final request in requests) {
        final item = itemById[request.itemId]!;
        maps.add(
          await _toBookingMap(
            request,
            item,
            userById[item.ownerId],
            reviewerId: user.id,
          ),
        );
        await actionOwner.assertCurrent();
        if (!mounted || revision != _loadRevision) return;
      }

      final categorized = {
        'ongoing': <RentalRequest>[],
        'upcoming': <RentalRequest>[],
        'pending': <RentalRequest>[],
        'completed': <RentalRequest>[],
      };
      for (final request in requests) {
        final bookingMap = maps.firstWhere(
          (map) => map['requestId'] == request.id,
        );
        final (start, end) = _parseDateRange(bookingMap['dates'] ?? '');
        final category = _effectiveCategoryFor(bookingMap, start, end);
        categorized[category]?.add(request);
      }

      final unreadCounts = <String, int>{};
      for (final category in categorized.keys) {
        unreadCounts[category] = await DataService.getUnreadCountForCategory(
          userId: user.id,
          category: category,
          requests: categorized[category]!,
        );
        await actionOwner.assertCurrent();
        if (!mounted || revision != _loadRevision) return;
      }

      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _allBookings = maps;
        _currentUserId = user.id;
        _unreadCounts
          ..clear()
          ..addAll(unreadCounts);
        _loading = false;
        _hasLoadedSnapshot = true;
      });
    } catch (error) {
      debugPrint('[Bookings] load failed (${error.runtimeType})');
      if (!mounted || revision != _loadRevision) return;
      if (actionOwner != null && !await actionOwner.isCurrent()) {
        if (!mounted || revision != _loadRevision) return;
        unawaited(_sharedPersistenceRefresh.schedule(_load));
        return;
      }
      setState(() {
        _allBookings = const [];
        _currentUserId = null;
        _unreadCounts.clear();
        _loading = false;
        _hasLoadedSnapshot = false;
        _loadError = 'Deine Buchungen konnten nicht sicher geladen werden.';
      });
    }
  }

  Future<Map<String, dynamic>> _toBookingMap(
    RentalRequest r,
    Item it,
    model.User? owner, {
    required String reviewerId,
  }) async {
    String fmt(DateTime d) {
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
        'Dez'
      ];
      final mm = months[d.month - 1];
      final dd = d.day.toString().padLeft(2, '0');
      return '$dd. $mm';
    }

    final breakdown = DataService.priceBreakdownForRequest(item: it, req: r);
    final priced = (
      breakdown.rentalSubtotal,
      breakdown.baseTotal,
      0.0,
      breakdown.discountAmount
    );
    final int days = breakdown.days;
    final double total = (r.quotedTotalRenter ?? breakdown.totalRenter);
    final addressSegment = const {
      'active',
      'running',
      'withdrawalReturnRequired',
      'returned',
    }.contains(r.workflowStatus ?? r.status)
        ? 'return'
        : 'pickup';
    final addressVisibility = await _safeBookingAddressVisibility(
      request: r,
      localExactAddress: it.locationText,
      segment: addressSegment,
    );
    final exactAddressRevealed = addressVisibility['result'] == 'revealed' &&
        addressVisibility['exactAddressReturned'] == true;
    final revealedAddress =
        (addressVisibility['exactAddress'] as String?)?.trim() ?? '';
    final displayLocation = exactAddressRevealed && revealedAddress.isNotEmpty
        ? revealedAddress
        : _approximateAddress(it.locationText, seed: r.id);

    final flowState = await _safeHandoverReturnState(r.id);
    final reviewSubmitted = await _safeReviewSubmittedState(
      requestId: r.id,
      reviewerId: reviewerId,
    );

    return {
      'requestId': r.id,
      'itemId': it.id,
      'rawStatus': r.status,
      'cancelledBy': r.cancelledBy,
      'cancellationOutcome': r.cancellationOutcome,
      'workflowStatus': r.workflowStatus,
      // Preserve the server-authoritative non-binding marker all the way to
      // the renter card and detail screen. Dropping it here makes an accepted
      // Stage-A simulation look like a real upcoming booking.
      'simulationOnly': r.simulationOnly,
      'platformWithdrawal': r.platformWithdrawal,
      'platformContract': r.platformContract,
      'needsReview': r.needsReview,
      'returnT0': r.returnT0?.toIso8601String(),
      'returnReportDeadline': r.returnReportDeadline?.toIso8601String(),
      'returnCaseOpenedAt': r.returnCaseOpenedAt?.toIso8601String(),
      'hasSubmittedReview': reviewSubmitted,
      'title': it.title,
      'dates': '${fmt(r.start)} – ${fmt(r.end)}',
      'location': displayLocation,
      'exactAddressRevealed': exactAddressRevealed,
      'addressVisibilitySegment': addressSegment,
      'addressVisibilityReason': addressVisibility['reason'],
      'status': _statusLabel(r),
      'image': (it.photos.isNotEmpty ? it.photos.first : null),
      'images': it.photos,
      'listerId': it.ownerId,
      'listerName': owner?.displayName ?? 'Vermieter',
      'listerAvatar': owner?.photoURL,
      'category':
          r.status == 'pending' ? 'pending' : null, // let UI compute otherwise
      'pricePaid': '${total.round()} €',
      // Persisted renter-facing constants for stable display across all states
      if (r.quotedTotalRenter != null) 'quotedTotalRenter': r.quotedTotalRenter,
      if (r.quotedSubtitle != null) 'quotedSubtitle': r.quotedSubtitle,
      if (r.quotedQuoteVersion != null)
        'quotedQuoteVersion': r.quotedQuoteVersion,
      if (r.quotedDays != null) 'quotedDays': r.quotedDays,
      if (r.quotedPricePerDayMinor != null)
        'quotedPricePerDayMinor': r.quotedPricePerDayMinor,
      if (r.quotedBaseRentalMinor != null)
        'quotedBaseRentalMinor': r.quotedBaseRentalMinor,
      if (r.quotedDiscountPercent != null)
        'quotedDiscountPercent': r.quotedDiscountPercent,
      if (r.quotedDiscountId != null) 'quotedDiscountId': r.quotedDiscountId,
      if (r.quotedDiscountLabel != null)
        'quotedDiscountLabel': r.quotedDiscountLabel,
      if (r.quotedDiscountFundingSource != null)
        'quotedDiscountFundingSource': r.quotedDiscountFundingSource,
      if (r.quotedDiscountThresholdDays != null)
        'quotedDiscountThresholdDays': r.quotedDiscountThresholdDays,
      if (r.quotedDiscountMinor != null)
        'quotedDiscountMinor': r.quotedDiscountMinor,
      if (r.quotedRentalSubtotalMinor != null)
        'quotedRentalSubtotalMinor': r.quotedRentalSubtotalMinor,
      if (r.quotedPlatformFeeMinor != null)
        'quotedPlatformFeeMinor': r.quotedPlatformFeeMinor,
      if (r.quotedTotalMinor != null) 'quotedTotalMinor': r.quotedTotalMinor,
      if (r.quotedOwnerPayoutMinor != null)
        'quotedOwnerPayoutMinor': r.quotedOwnerPayoutMinor,
      if (r.quotedCurrency != null) 'quotedCurrency': r.quotedCurrency,
      if (breakdown.discountAmount > 0)
        'discounts': '-${breakdown.discountAmount.toStringAsFixed(0)} €',
      // add context so detail view can show breakdown precisely
      'days': days,
      'basePerDay': it.pricePerDay,
      // keep percent only when available from item discount tiers; use computeTotalWithDiscounts again
      if (DataService.computeTotalWithDiscounts(item: it, days: days).$3 > 0)
        'discountPercentApplied':
            DataService.computeTotalWithDiscounts(item: it, days: days).$3,
      'startIso': r.start.toIso8601String(),
      'endIso': r.end.toIso8601String(),
      'policy': it.cancellationPolicy,
      'requestCreatedAtIso': r.createdAt.toIso8601String(),
      // Email copy (for potential backend integration)
      'mailSummary':
          'Anzahl Tage: $days\nUrsprünglicher Preis: ${priced.$2.round()} €\nRabatt: ${priced.$3.toStringAsFixed(0)}% (−${priced.$4.toStringAsFixed(0)} €)\nEndpreis: ${total.round()} €',
      'handoverLocationLabel':
          (flowState['handoverLocationLabel'] as String?) ?? '',
      'handoverLocationMapsUrl':
          (flowState['handoverLocationMapsUrl'] as String?) ?? '',
      'handoverLocationSharedByName':
          (flowState['handoverLocationSharedByName'] as String?) ?? '',
      'returnLocationLabel':
          (flowState['returnLocationLabel'] as String?) ?? '',
      'returnLocationMapsUrl':
          (flowState['returnLocationMapsUrl'] as String?) ?? '',
      'returnLocationSharedByName':
          (flowState['returnLocationSharedByName'] as String?) ?? '',
    };
  }

  Future<Map<String, dynamic>> _safeBookingAddressVisibility({
    required RentalRequest request,
    required String localExactAddress,
    required String segment,
  }) async {
    try {
      return await DataService.getBookingAddressReveal(
        request: request,
        localExactAddress: localExactAddress,
        segment: segment,
      );
    } catch (error) {
      debugPrint(
        '[Bookings] optional address visibility unavailable (${error.runtimeType})',
      );
      return <String, dynamic>{
        'version': 'v52_booking_address_reveal_v1',
        'segment': segment,
        'result': 'hidden',
        'reason': 'optional_enrichment_unavailable',
        'exactAddressReturned': false,
      };
    }
  }

  Future<Map<String, dynamic>> _safeHandoverReturnState(
    String requestId,
  ) async {
    try {
      return await DataService.getHandoverReturnState(requestId);
    } catch (error) {
      debugPrint(
        '[Bookings] optional handover state unavailable (${error.runtimeType})',
      );
      return const <String, dynamic>{};
    }
  }

  Future<bool> _safeReviewSubmittedState({
    required String requestId,
    required String reviewerId,
  }) async {
    try {
      return await DataService.hasSubmittedReview(
        requestId: requestId,
        reviewerId: reviewerId,
      );
    } catch (error) {
      debugPrint(
        '[Bookings] optional review state unavailable (${error.runtimeType})',
      );
      // Suppress the review CTA when its local truth is unavailable. This is
      // safer than offering a possibly duplicate or wrong-account action and
      // does not hide the server-confirmed booking card itself.
      return true;
    }
  }

  // Builds a fake house number range like "Musterstraße 30–45" when a number exists; otherwise returns original.
  String _approximateAddress(String raw, {required String seed}) {
    final reg = RegExp(r"^(.*?)(\s+)(\d{1,4})([\s,].*|)");
    final m = reg.firstMatch(raw.trim());
    if (m == null) return raw; // no obvious house number
    final street = m.group(1)!.trim();
    final numStr = m.group(3)!;
    final rest = (m.group(4) ?? '').trim();
    final base = int.tryParse(numStr) ?? 0;
    // Deterministic pseudo-random +/- offset up to 15 based on seed
    int hash = 0;
    for (int i = 0; i < seed.length; i++) {
      hash = 0x1fffffff & (hash + seed.codeUnitAt(i));
    }
    final off = (hash % 31) - 15; // -15..15
    final low = (base + (off < 0 ? off : 0)).clamp(1, 9999);
    final high = (base + (off > 0 ? off : 0)).clamp(1, 9999);
    final range = low <= high ? '$low–$high' : '$high–$low';
    return [street, range, rest].where((s) => s.isNotEmpty).join(' ');
  }

  String _statusLabel(RentalRequest r) {
    switch (r.status) {
      case 'accepted':
        return 'Akzeptiert';
      case 'running':
        return 'Laufend';
      case 'completed':
        return r.needsReview ? 'In Prüfung' : 'Abgeschlossen';
      case 'declined':
        return 'Abgelehnt';
      case 'cancelled':
        return 'Storniert';
      default:
        return 'Angefragt';
    }
  }

  @override
  Widget build(BuildContext context) {
    final tabsStyle = Theme.of(context).textTheme.bodySmall;

    // Get unread counts for each tab
    final ongoingUnread = _unreadCounts['ongoing'] ?? 0;
    final upcomingUnread = _unreadCounts['upcoming'] ?? 0;
    final pendingUnread = _unreadCounts['pending'] ?? 0;
    final completedUnread = _unreadCounts['completed'] ?? 0;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back),
        ),
        title: const Text('Meine Buchungen'),
        centerTitle: true,
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelPadding: const EdgeInsets.symmetric(horizontal: 12),
          labelColor: Theme.of(context).colorScheme.primary,
          unselectedLabelColor: Colors.white70,
          labelStyle: tabsStyle,
          unselectedLabelStyle: tabsStyle,
          indicatorColor: Theme.of(context).colorScheme.primary,
          tabs: [
            _buildTabWithBadge('Laufend', ongoingUnread),
            _buildTabWithBadge('Kommend', upcomingUnread),
            _buildTabWithBadge('Ausstehend', pendingUnread),
            _buildTabWithBadge('Abgeschlossen', completedUnread),
          ],
        ),
      ),
      body: _buildAuthoritativeBody(),
    );
  }

  Widget _buildAuthoritativeBody() {
    if (_loading && !_hasLoadedSnapshot) {
      return Center(
        child: Semantics(
          label: 'Buchungen werden geladen',
          child: const CircularProgressIndicator(),
        ),
      );
    }
    if (_loadError != null && !_hasLoadedSnapshot) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: LocalStateErrorPanel(
            title: 'Buchungen konnten nicht geladen werden',
            message: _loadError!,
            semanticLabel:
                'Buchungen konnten nicht sicher geladen werden. Erneut laden.',
            onRetry: () => unawaited(_sharedPersistenceRefresh.schedule(_load)),
            retrying: _loading,
          ),
        ),
      );
    }
    return TabBarView(
      controller: _tabController,
      children: [
        _buildBookingsList('ongoing'),
        _buildBookingsList('upcoming'),
        _buildBookingsList('pending'),
        _buildBookingsList('completed'),
      ],
    );
  }

  Widget _buildTabWithBadge(String text, int unreadCount) {
    if (unreadCount == 0) {
      return Tab(text: text);
    }
    return Tab(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: const BoxDecoration(
              color: Color(0xFFFFB277),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(text),
        ],
      ),
    );
  }

  Widget _buildBookingsList(String status) {
    final bookings = _getBookingsForStatus(status);

    if (bookings.isEmpty) {
      final (icon, title, useBoxChat) = _emptyStateForCategory(status);
      final cs = Theme.of(context).colorScheme;
      final emptyIconColor = cs.onSurfaceVariant.withValues(alpha: 0.65);
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (useBoxChat)
                BoxChatIcon(size: 64, color: emptyIconColor)
              else
                Icon(icon, size: 64, color: emptyIconColor),
              const SizedBox(height: 14),
              Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: cs.onSurfaceVariant.withValues(alpha: 0.85),
                      fontWeight: FontWeight.w700,
                      height: 1.2,
                    ),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: bookings.length,
      itemBuilder: (context, index) {
        final booking = bookings[index];
        final (start, end) = _parseDateRange(booking['dates'] ?? '');
        final effectiveCategory = _effectiveCategoryFor(booking, start, end);
        final chip =
            _buildStatusChipForCard(effectiveCategory, start, end, booking);
        final raw = booking['rawStatus'] as String?;
        final String? targetId = _highlightRequestId?.isNotEmpty == true
            ? _highlightRequestId
            : widget.highlightRequestId;
        final bool highlight = (targetId != null &&
            targetId.isNotEmpty &&
            booking['requestId'] == targetId &&
            (status == 'completed' || status == 'pending') &&
            (raw == 'cancelled' || status == 'pending'));

        final bool isPending = (effectiveCategory == 'pending');
        // Build an optional small inline action to sit next to the chip
        final Widget? inlineAction =
            _buildSmallInlineAction(effectiveCategory, booking, start, end);
        return _BlinkHighlight(
          enabled: highlight && (_highlightRequestId != null),
          onFinished: () {
            if (_highlightRequestId != null) {
              setState(() => _highlightRequestId = null);
            }
          },
          child: Card(
            margin: const EdgeInsets.only(bottom: 12),
            elevation: 2,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () async {
                // Mark request as read when user taps on it
                if (_currentUserId != null) {
                  final requestId = booking['requestId'] as String?;
                  if (requestId != null) {
                    await DataService.markRequestAsRead(
                        userId: _currentUserId!, requestId: requestId);
                  }
                }
                if (!context.mounted) return;
                await Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => BookingDetailScreen(booking: booking),
                  ),
                );
                if (!mounted) return;
                await _load(); // refresh from storage in case of changes
              },
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                          width: 80,
                          height: 80,
                          child: _ThumbnailWithSkeleton(
                              url: booking['image'] as String?)),
                    ),
                    const SizedBox(width: 16),
                    // Right content column with fixed height to keep the whole card as high as the image
                    Expanded(
                      child: ConstrainedBox(
                        // Allow the content to grow if text/chip needs a bit more room,
                        // while keeping at least the thumbnail height for alignment.
                        constraints: const BoxConstraints(minHeight: 80),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        booking['title'] ?? '-',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: isPending ? 16 : 18,
                                          color: Colors.white,
                                          height: 1.1,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 1),
                                      Text(
                                        booking['dates'] ?? '',
                                        style: TextStyle(
                                          color: Colors.grey.shade400,
                                          fontSize: isPending ? 12 : 13,
                                          height: 1.1,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 1),
                                      Text(
                                        _confirmedPlaceLineForCard(booking) ??
                                            (booking['location'] ?? ''),
                                        style: TextStyle(
                                          color: Colors.grey.shade400,
                                          fontSize: isPending ? 12 : 13,
                                          height: 1.1,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 2),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  booking['pricePaid'] ?? '',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: isPending ? 15 : 16,
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                              ],
                            ),
                            // Bottom row: status chip + optional tiny action; stays within the same 80px block
                            Row(
                              children: [
                                chip,
                                if (inlineAction != null) ...[
                                  const SizedBox(width: 8),
                                  Flexible(
                                      child: Align(
                                          alignment: Alignment.centerLeft,
                                          child: inlineAction)),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  // Compute effective category for renter view strictly from status.
  // Business rules:
  // - pending → pending
  // - accepted → upcoming (never auto-advance by time)
  // - running → ongoing (only after confirmed Übergabe)
  // - completed/cancelled/declined → completed (never auto-complete by time)
  String _effectiveCategoryFor(
      Map<String, dynamic> booking, DateTime? start, DateTime? end) {
    final raw = (booking['category'] as String?)?.toLowerCase();
    final status = (booking['rawStatus'] as String?)?.toLowerCase();
    if (raw == 'pending' || status == 'pending') return 'pending';
    if (status == 'accepted') return 'upcoming';
    if (status == 'running') return 'ongoing';
    if (status == 'completed' ||
        status == 'cancelled' ||
        status == 'declined') {
      return 'completed';
    }
    // Fallback for unknown/missing status: treat as upcoming
    return 'upcoming';
  }

  String? _confirmedPlaceLineForCard(Map<String, dynamic> booking) {
    final category = ((booking['category'] as String?) ?? '').toLowerCase();
    final isOngoing = category == 'ongoing' ||
        ((booking['rawStatus'] as String?) ?? '').toLowerCase() == 'running';
    final prefix = isOngoing ? 'return' : 'handover';
    final label = ((booking['${prefix}LocationLabel'] as String?) ?? '').trim();
    final sharedBy =
        ((booking['${prefix}LocationSharedByName'] as String?) ?? '').trim();
    if (label.isNotEmpty) {
      return '${isOngoing ? 'Rückgabeort' : 'Übergabeort'}: $label';
    }
    if (sharedBy.isNotEmpty) {
      return '${isOngoing ? 'Rückgabeort' : 'Übergabeort'}: Standort von $sharedBy';
    }
    return null;
  }

  // Status chip with countdown for list card (German, renter view)
  Widget _buildStatusChipForCard(
      String category, DateTime? start, DateTime? end,
      [Map<String, dynamic>? booking]) {
    final label = bookingCardStatusLabel(
      category: category,
      start: start,
      end: end,
      booking: booking,
    );
    Color color;

    switch (category) {
      case 'upcoming':
        color = const Color(0xFF0EA5E9); // Blau
        break;
      case 'ongoing':
        color = const Color(0xFFFB923C); // Orange
        break;
      case 'pending':
        color = Colors.grey; // Grau
        break;
      case 'completed':
        final rawStatus = booking?['rawStatus'] as String?;
        final wasCancelled =
            rawStatus == 'cancelled' || (booking?['status'] == 'Storniert');
        final wasDeclined =
            rawStatus == 'declined' || (booking?['status'] == 'Abgelehnt');
        if (wasCancelled) {
          color = const Color(0xFFF43F5E);
        } else if (wasDeclined) {
          color = Colors.grey; // neutral grey for declined
        } else if (booking?['needsReview'] == true) {
          color = const Color(0xFFF59E0B);
        } else {
          color = const Color(0xFF22C55E);
        }
        break;
      default:
        color = Colors.grey;
    }

    return Container(
      // Trim vertical padding to keep the compact card within 80px height
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: color,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            height: 1.05),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  // Build a tiny inline action button to live next to the chip, keeping the card compact
  Widget? _buildSmallInlineAction(String effectiveCategory,
      Map<String, dynamic> booking, DateTime? start, DateTime? end) {
    switch (effectiveCategory) {
      case 'pending':
        // Entfernt: kein Inline-Button mehr – nur noch in der Detailseite unten
        return null;
      case 'upcoming':
        // Kein "Stornieren"-Button mehr in der Kommend-Liste (nur in Detailseite)
        return null;
      case 'completed':
        // Show a tiny "Bewerten" button for completed bookings (not for declined/storniert)
        final isHeldForReview = booking['needsReview'] == true;
        if (!isHeldForReview && _canReviewCompletedBooking(booking)) {
          return _TinyTextButton(
            icon: Icons.star_rate_outlined,
            label: 'Bewerten',
            onPressed: () async {
              final current = await DataService.getCurrentUser();
              if (current == null || !_canReviewCompletedBooking(booking)) {
                return;
              }
              if (!mounted) return;
              final requestId = booking['requestId'] as String;
              final itemId = booking['itemId'] as String;
              final listerId = booking['listerId'] as String;
              final ok = await ReviewPromptSheet.show(
                context,
                requestId: requestId,
                itemId: itemId,
                reviewerId: current.id,
                reviewedUserId: listerId,
                direction: 'renter_to_owner',
              );
              if (ok == true && mounted) {
                await AppPopup.toast(context,
                    icon: Icons.star_rate_outlined,
                    title: 'Danke für deine Bewertung!');
                final item = await DataService.getItemById(itemId);
                if (item != null && mounted) {
                  await ItemDetailsOverlay.showFullPage(context, item: item);
                }
              }
            },
          );
        }
        return null;
      default:
        return null; // completed/ongoing have no inline action for now
    }
  }

  (String, String) _splitDatesText(String raw) {
    if (raw.contains('–')) {
      final parts = raw.split('–');
      return (parts.first.trim(), parts[1].trim());
    }
    if (raw.contains('-')) {
      final parts = raw.split('-');
      return (parts.first.trim(), parts[1].trim());
    }
    return (raw, '');
  }

  DateTime? _parseGermanDateTime(String s) {
    final months = {
      'Jan': 1,
      'Feb': 2,
      'Mär': 3,
      'Mrz': 3,
      'Apr': 4,
      'Mai': 5,
      'Jun': 6,
      'Jul': 7,
      'Aug': 8,
      'Sep': 9,
      'Okt': 10,
      'Nov': 11,
      'Dez': 12,
    };
    final reg = RegExp(r'^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]{3})');
    final m = reg.firstMatch(s);
    if (m == null) return null;
    final d = int.tryParse(m.group(1)!);
    final monStr = m.group(2)!;
    if (d == null) return null;
    String key = monStr.substring(0, 1).toUpperCase() +
        monStr.substring(1, math.min(monStr.length, 3)).toLowerCase();
    if (key == 'Mä' || key == 'Mär') key = 'Mär';
    final month = months[key];
    if (month == null) return null;
    final now = DateTime.now();
    return DateTime(now.year, month, d);
  }

  (DateTime?, DateTime?) _parseDateRange(String raw) {
    final (startText, endText) = _splitDatesText(raw);
    final start = _parseGermanDateTime(startText);
    final end = _parseGermanDateTime(endText);
    if (start == null || end == null) return (start, end);
    if (end.isBefore(start)) {
      return (start, DateTime(start.year + 1, end.month, end.day));
    }
    return (start, end);
  }

  List<Map<String, dynamic>> _getBookingsForStatus(String status) {
    return _allBookings.where((b) {
      final (start, end) = _parseDateRange(b['dates'] ?? '');
      final effective = _effectiveCategoryFor(b, start, end);
      return effective == status;
    }).toList();
  }

  /// Returns (icon, title, useBoxChatIcon)
  (IconData, String, bool) _emptyStateForCategory(String category) {
    switch (category) {
      case 'ongoing':
        return (
          Icons.timelapse_outlined,
          'Du hast keine laufenden Buchungen',
          false
        );
      case 'upcoming':
        return (
          Icons.event_available_outlined,
          'Du hast keine kommenden Buchungen',
          false
        );
      case 'pending':
        // Pending bookings are booking requests waiting for confirmation.
        // Use a dedicated pending icon (instead of the Mietanfragen/BoxChat icon).
        return (
          Icons.pending_actions_outlined,
          'Du hast keine ausstehenden Buchungen',
          false
        );
      case 'completed':
      default:
        return (
          Icons.task_alt_outlined,
          'Du hast keine abgeschlossenen Buchungen',
          false
        );
    }
  }
}

// Hinweis: Der frühere Inline-Button _WithdrawInlineButton wurde entfernt.

class _TinyTextButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  const _TinyTextButton(
      {required this.icon, required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final fg = Theme.of(context).colorScheme.primary;
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 16, color: fg),
      label: Text(label,
          style:
              TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: fg)),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        minimumSize: const Size(0, 24),
        visualDensity: const VisualDensity(horizontal: -2, vertical: -2),
      ),
    );
  }
}

/// A subtle pulsing glow around a child for a short period.
class _BlinkHighlight extends StatefulWidget {
  final Widget child;
  final bool enabled;
  final VoidCallback? onFinished;
  static const totalDuration = Duration(milliseconds: 6500);
  // Default: 5 full pulses (0->1->0) at 650ms each direction => 6.5s
  const _BlinkHighlight({
    required this.child,
    required this.enabled,
    this.onFinished,
  });
  @override
  State<_BlinkHighlight> createState() => _BlinkHighlightState();
}

class _BlinkHighlightState extends State<_BlinkHighlight>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  late final Animation<double> _t;
  Timer? _stopper;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 650));
    _t = CurvedAnimation(parent: _c, curve: Curves.easeInOut);
    if (widget.enabled) {
      _c.repeat(reverse: true);
      _stopper = Timer(_BlinkHighlight.totalDuration, () {
        if (!mounted) return;
        _c.stop();
        widget.onFinished?.call();
        setState(() {});
      });
    }
  }

  @override
  void didUpdateWidget(covariant _BlinkHighlight oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.enabled && !_c.isAnimating) {
      _c.repeat(reverse: true);
      _stopper?.cancel();
      _stopper = Timer(_BlinkHighlight.totalDuration, () {
        if (!mounted) return;
        _c.stop();
        widget.onFinished?.call();
        setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _stopper?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final bool active = widget.enabled && _c.isAnimating;
    return AnimatedBuilder(
      animation: _t,
      builder: (context, child) {
        final double p = active ? _t.value : 0.0;
        // We only show subtle pulsing markers on the four corners of the card.
        final double dotSize = 8 + 6 * p; // controls blur footprint
        final Color glow = primary.withValues(alpha: 0.85 * p);
        return Stack(
          clipBehavior: Clip.none,
          children: [
            // Card content
            child!,
            if (p > 0) ...[
              // Four corner blurs (no visible dots)
              Positioned(
                top: 6,
                left: 6,
                child: _CornerPulseDot(size: dotSize, color: glow),
              ),
              Positioned(
                top: 6,
                right: 6,
                child: _CornerPulseDot(size: dotSize, color: glow),
              ),
              Positioned(
                bottom: 6,
                left: 6,
                child: _CornerPulseDot(size: dotSize, color: glow),
              ),
              Positioned(
                bottom: 6,
                right: 6,
                child: _CornerPulseDot(size: dotSize, color: glow),
              ),
            ],
          ],
        );
      },
      child: widget.child,
    );
  }
}

class _CornerPulseDot extends StatelessWidget {
  final double size;
  final Color color;
  const _CornerPulseDot({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    // Only a soft blue blur in the corner; no visible dot center.
    return SizedBox(
      width: size,
      height: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          // keep center fully transparent; render only shadow glow
          color: Colors.transparent,
          boxShadow: [
            BoxShadow(
              color: color,
              blurRadius: size * 1.8,
              spreadRadius: 0,
            ),
          ],
        ),
      ),
    );
  }
}

class _ThumbnailWithSkeleton extends StatefulWidget {
  final String? url;
  const _ThumbnailWithSkeleton({required this.url});

  @override
  State<_ThumbnailWithSkeleton> createState() => _ThumbnailWithSkeletonState();
}

class _ThumbnailWithSkeletonState extends State<_ThumbnailWithSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.url;
    if (url == null || url.isEmpty) {
      return _skeleton();
    }
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _showPreview(context, [url], 0),
      child: AppImage(
        url: url,
        fit: BoxFit.cover,
        fallback: _skeleton(),
      ),
    );
  }

  Widget _skeleton() {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) {
        final t = _controller.value;
        final base = Colors.white.withValues(alpha: 0.06);
        final highlight = Colors.white.withValues(alpha: 0.16);
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment(-1 + t * 2, -0.3),
              end: Alignment(1 + t * 2, 0.3),
              colors: [base, highlight, base],
              stops: const [0.25, 0.5, 0.75],
            ),
          ),
        );
      },
    );
  }

  Future<void> _showPreview(
      BuildContext context, List<String> urls, int initialIndex) async {
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
            await controller.animateToPage(target,
                duration: const Duration(milliseconds: 160),
                curve: Curves.easeOutCubic);
          }
        }

        return StatefulBuilder(builder: (context, setState) {
          return Stack(fit: StackFit.expand, children: [
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.of(ctx).maybePop(),
                child: ClipRect(
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 25.2, sigmaY: 25.2),
                    child:
                        Container(color: Colors.black.withValues(alpha: 0.05)),
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
                        maxHeight: size.height * 0.75),
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
                          child: Stack(children: [
                            ScrollConfiguration(
                              behavior: const ScrollBehavior()
                                  .copyWith(scrollbars: false),
                              child: PageView.builder(
                                controller: controller,
                                onPageChanged: (i) => setState(() => page = i),
                                itemCount: images.length,
                                itemBuilder: (_, i) => DecoratedBox(
                                  decoration: BoxDecoration(
                                      color:
                                          Colors.black.withValues(alpha: 0.08)),
                                  child: Center(
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(16),
                                      child: AppImage(
                                          url: images[i], fit: BoxFit.contain),
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
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    for (int i = 0; i < images.length; i++)
                                      AnimatedContainer(
                                        duration:
                                            const Duration(milliseconds: 160),
                                        margin: const EdgeInsets.symmetric(
                                            horizontal: 4),
                                        width: i == page ? 10 : 8,
                                        height: i == page ? 10 : 8,
                                        decoration: BoxDecoration(
                                          color: Colors.white.withValues(
                                              alpha: i == page ? 0.9 : 0.5),
                                          borderRadius:
                                              BorderRadius.circular(999),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                          ]),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ]);
        });
      },
      transitionBuilder: (ctx, anim, secAnim, child) {
        final curved =
            CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
        return FadeTransition(opacity: curved, child: child);
      },
      transitionDuration: const Duration(milliseconds: 160),
    );
  }
}
