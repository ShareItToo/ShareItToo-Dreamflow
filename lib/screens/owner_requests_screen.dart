import 'dart:async';
import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart' as model;
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/private_pilot_owner_acceptance_dialog.dart';
import 'package:lendify/screens/ongoing_owner_detail_screen.dart';
import 'package:lendify/widgets/box_chat_icon.dart';
import 'package:lendify/widgets/review_prompt_sheet.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/services/qa_runtime_service.dart';

/// Owner-side requests hub: Tabs for Laufend, Kommend, Anfragen, Abgeschlossen
class OwnerRequestsScreen extends StatefulWidget {
  final int?
      initialTabIndex; // 0: Laufend, 1: Kommend, 2: Anfragen, 3: Abgeschlossen
  const OwnerRequestsScreen({super.key, this.initialTabIndex});

  @override
  State<OwnerRequestsScreen> createState() => _OwnerRequestsScreenState();
}

class _OwnerRequestsScreenState extends State<OwnerRequestsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String? _ownerId;
  List<_OwnerEntry> _entries = const [];
  Timer? _ticker;
  Timer? _acceptanceDeadlineTimer;
  // Track unread counts per category
  final Map<String, int> _unreadCounts = {};
  int _loadRevision = 0;
  bool _isLoading = true;
  bool _loadFailed = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
        length: 4,
        vsync: this,
        initialIndex: (widget.initialTabIndex ?? 2).clamp(0, 3));
    _tabController.addListener(() {
      if (mounted) setState(() {}); // refresh app bar title on tab change
    });
    _load();
    _ticker = Timer.periodic(const Duration(minutes: 1), (_) async {
      if (!mounted) return;
      await _maybeShowReviewReminder();
      setState(() {});
    });
    Future.delayed(
        const Duration(seconds: 2), () => _maybeShowReviewReminder());
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _acceptanceDeadlineTimer?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  void _scheduleAcceptanceDeadlineRefresh() {
    _acceptanceDeadlineTimer?.cancel();
    _acceptanceDeadlineTimer = null;
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) return;
    final now = DateTime.now();
    DateTime? nextDeadline;
    for (final entry in _entries) {
      if (entry.r.status.toLowerCase().trim() != 'pending') continue;
      final deadline = entry.r.bindingExpiresAt;
      if (deadline == null || !deadline.isAfter(now)) continue;
      if (nextDeadline == null || deadline.isBefore(nextDeadline)) {
        nextDeadline = deadline;
      }
    }
    if (nextDeadline == null) return;
    _acceptanceDeadlineTimer = Timer(nextDeadline.difference(now), () {
      if (!mounted) return;
      setState(() {});
      _scheduleAcceptanceDeadlineRefresh();
    });
  }

  bool _showingReminder = false;
  Future<void> _maybeShowReviewReminder() async {
    if (_showingReminder) return;
    final owner = await DataService.getCurrentUser();
    if (owner == null) return;
    final reminder =
        await DataService.takeDueReviewReminder(reviewerId: owner.id);
    if (!mounted || reminder == null) return;
    _showingReminder = true;
    try {
      final String requestId = (reminder['requestId'] ?? '').toString();
      final String itemId = (reminder['itemId'] ?? '').toString();
      final String reviewedUserId =
          (reminder['reviewedUserId'] ?? '').toString();
      final String direction =
          (reminder['direction'] ?? 'owner_to_renter').toString();
      await AppPopup.show(
        context,
        icon: Icons.star_rate_outlined,
        title: 'Zeit für eine Bewertung',
        message: 'Magst du die Vermietung bewerten?',
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
                reviewerId: owner.id,
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
    var coreCommitted = false;
    if (mounted) {
      setState(() {
        _isLoading = true;
        _loadFailed = false;
        _ownerId = null;
        _entries = const [];
        _unreadCounts.clear();
      });
    }
    try {
      actionOwner = await LocalPrincipalActionOwner.capture();
      final owner = await DataService.getCurrentUser();
      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      if (owner == null) {
        if (QaRuntimeService.isEnabled) {
          final demo = await _buildDemoOwnerEntries();
          await actionOwner.assertCurrent();
          if (!mounted || revision != _loadRevision) return;
          _ownerId = demo.ownerId;
          _unreadCounts
            ..clear()
            ..addAll(
                {'ongoing': 1, 'upcoming': 1, 'requests': 1, 'completed': 3});
          setState(() {
            _entries = demo.entries;
            _isLoading = false;
          });
          _scheduleAcceptanceDeadlineRefresh();
          return;
        }
        _ownerId = null;
        setState(() => _isLoading = false);
        return;
      }
      _ownerId = owner.id;
      final requests = await DataService.getRentalRequestsForOwner(owner.id);
      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      if (requests.isEmpty) {
        if (QaRuntimeService.isEnabled) {
          final demo = await _buildDemoOwnerEntries(ownerId: owner.id);
          await actionOwner.assertCurrent();
          if (!mounted || revision != _loadRevision) return;
          _unreadCounts
            ..clear()
            ..addAll(
                {'ongoing': 1, 'upcoming': 1, 'requests': 1, 'completed': 3});
          setState(() {
            _entries = demo.entries;
            _isLoading = false;
          });
          _scheduleAcceptanceDeadlineRefresh();
          return;
        }
        setState(() => _isLoading = false);
        return;
      }
      // Load the catalog and local profile cache once. Calling getItemById for
      // every booking would reload the complete remote catalog each time and can
      // abort the screen before any request card is rendered. Only participants
      // missing from the local cache need an individual public-profile lookup.
      final items = await DataService.getItems();
      final users = await DataService.getUsers();
      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      final byItem = <String, Item?>{
        for (final item in items) item.id: item,
      };
      final byUser = <String, model.User?>{
        for (final user in users) user.id: user,
      };
      for (final request in requests) {
        if (!byUser.containsKey(request.renterId)) {
          byUser[request.renterId] =
              await DataService.getUserById(request.renterId);
          await actionOwner.assertCurrent();
          if (!mounted || revision != _loadRevision) return;
        }
      }
      // Render authoritative request/listing/participant truth before optional
      // per-booking enrichment. Historic terminal requests must never make a
      // current accepted request wait behind an unbounded serial network tail.
      final base = <_OwnerEntry>[];
      for (final r in requests) {
        final it = byItem[r.itemId];
        final renter = byUser[r.renterId];
        if (it == null || renter == null) continue;
        final reviewMayBeAvailable = r.status == 'completed' && !r.needsReview;
        base.add(_OwnerEntry(
          r: r,
          item: it,
          renter: renter,
          flowState: const {},
          // Fail closed while review state is still unknown: never offer a
          // duplicate review action during progressive hydration.
          hasSubmittedReview: reviewMayBeAvailable,
        ));
      }

      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _entries = base;
        _isLoading = false;
      });
      _scheduleAcceptanceDeadlineRefresh();
      coreCommitted = true;

      // Calculate unread counts for each category
      final categorized = {
        'ongoing': <RentalRequest>[],
        'upcoming': <RentalRequest>[],
        'requests': <RentalRequest>[],
        'completed': <RentalRequest>[],
      };
      for (final e in base) {
        final cat = _effectiveCategory(e);
        categorized[cat]?.add(e.r);
      }

      final unreadCounts = <String, int>{};
      for (final cat in categorized.keys) {
        final unreadCount = await DataService.getUnreadCountForCategory(
          userId: owner.id,
          category: cat,
          requests: categorized[cat]!,
        );
        unreadCounts[cat] = unreadCount;
      }

      final enriched = <_OwnerEntry>[];
      for (final entry in base) {
        await actionOwner.assertCurrent();
        if (!mounted || revision != _loadRevision) return;
        final status = entry.r.status.toLowerCase().trim();
        final flowState = status == 'accepted' || status == 'running'
            ? await DataService.getHandoverReturnState(entry.r.id)
            : const <String, dynamic>{};
        final reviewed = status == 'completed' && !entry.r.needsReview
            ? await DataService.hasSubmittedReview(
                requestId: entry.r.id,
                reviewerId: owner.id,
              )
            : false;
        enriched.add(_OwnerEntry(
          r: entry.r,
          item: entry.item,
          renter: entry.renter,
          flowState: flowState,
          hasSubmittedReview: reviewed,
        ));
      }
      await actionOwner.assertCurrent();
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _entries = enriched;
        _unreadCounts
          ..clear()
          ..addAll(unreadCounts);
      });
      _scheduleAcceptanceDeadlineRefresh();
    } catch (error) {
      debugPrint(
        '[OwnerRequests] load failed (${error.runtimeType})',
      );
      if (!mounted || revision != _loadRevision) return;
      if (actionOwner != null && !await actionOwner.isCurrent()) {
        if (!mounted || revision != _loadRevision) return;
        unawaited(_load());
        return;
      }
      if (coreCommitted) {
        // The authoritative cards remain usable if optional flow/review
        // presentation enrichment fails under the same principal.
        return;
      }
      setState(() {
        _isLoading = false;
        _loadFailed = true;
        _entries = const [];
        _unreadCounts.clear();
      });
      _scheduleAcceptanceDeadlineRefresh();
    }
  }

  Future<({String ownerId, List<_OwnerEntry> entries})> _buildDemoOwnerEntries(
      {String? ownerId}) async {
    final now = DateTime.now();
    final items = await DataService.getItems();
    final users = await DataService.getUsers();
    final demoOwnerId =
        ownerId ?? (items.isNotEmpty ? items.first.ownerId : 'demo_owner');
    final ownerUser = users.firstWhere(
      (u) => u.id == demoOwnerId,
      orElse: () => model.User(
        id: demoOwnerId,
        displayName: 'Du (Demo Vermieter)',
        email: 'owner@shareittoo.local',
        preferredLanguage: 'de',
        isVerified: true,
        isBanned: false,
        role: 'user',
        avgRating: 4.9,
        reviewCount: 64,
        createdAt: now.subtract(const Duration(days: 200)),
        photoURL:
            'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face',
      ),
    );

    final renterPool = users.where((u) => u.id != demoOwnerId).toList()
      ..addAll([
        model.User(
          id: 'demo_renter_a',
          displayName: 'Sarah Roth',
          email: 'sarah@example.com',
          preferredLanguage: 'de',
          isVerified: true,
          isBanned: false,
          role: 'user',
          avgRating: 4.8,
          reviewCount: 31,
          createdAt: now.subtract(const Duration(days: 160)),
          photoURL:
              'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
        ),
        model.User(
          id: 'demo_renter_b',
          displayName: 'Emre Kaya',
          email: 'emre@example.com',
          preferredLanguage: 'de',
          isVerified: false,
          isBanned: false,
          role: 'user',
          avgRating: 4.5,
          reviewCount: 9,
          createdAt: now.subtract(const Duration(days: 90)),
          photoURL:
              'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face',
        ),
        model.User(
          id: 'demo_renter_c',
          displayName: 'Lea Walter',
          email: 'lea@example.com',
          preferredLanguage: 'de',
          isVerified: true,
          isBanned: false,
          role: 'user',
          avgRating: 4.7,
          reviewCount: 22,
          createdAt: now.subtract(const Duration(days: 70)),
          photoURL:
              'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face',
        ),
      ]);

    model.User pickRenter(int index) => renterPool[index % renterPool.length];

    Item buildItem(
        {required String id,
        required String title,
        required String photo,
        required String location,
        required double lat,
        required double lng,
        String condition = 'good'}) {
      return Item(
        id: id,
        ownerId: demoOwnerId,
        title: title,
        description: 'Demo-Listing für die Karten-Vorschau.',
        categoryId: 'demo',
        subcategory: 'demo',
        tags: const ['demo'],
        pricePerDay: 22,
        currency: 'EUR',
        photos: [photo],
        locationText: location,
        lat: lat,
        lng: lng,
        geohash: 'u33d',
        condition: condition,
        createdAt: now.subtract(const Duration(days: 14)),
        isActive: true,
        verificationStatus: 'verified',
        city: location,
        country: 'Deutschland',
        priceUnit: 'day',
        priceRaw: 22,
        status: 'active',
        offersDeliveryAtDropoff: true,
        offersPickupAtReturn: true,
        offersExpressAtDropoff: true,
        cancellationPolicy: 'flexible',
      );
    }

    final itemPending = buildItem(
      id: 'owner_demo_item_pending',
      title: 'Makita Akku-Bohrschrauber',
      photo:
          'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=640',
      location: 'Berlin, Friedrichshain',
      lat: 52.51,
      lng: 13.45,
    );
    final itemUpcoming = buildItem(
      id: 'owner_demo_item_upcoming',
      title: 'Sony Alpha Kamera',
      photo:
          'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=640',
      location: 'Berlin, Prenzlauer Berg',
      lat: 52.54,
      lng: 13.41,
      condition: 'excellent',
    );
    final itemOngoing = buildItem(
      id: 'owner_demo_item_ongoing',
      title: 'Sony Alpha Kamera',
      photo:
          'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=640',
      location: 'Berlin, Kreuzberg',
      lat: 52.49,
      lng: 13.41,
    );
    final itemCompletedA = buildItem(
      id: 'owner_demo_item_completed_a',
      title: 'Weber Gasgrill',
      photo:
          'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=640',
      location: 'Berlin, Charlottenburg',
      lat: 52.51,
      lng: 13.30,
    );
    final itemCompletedB = buildItem(
      id: 'owner_demo_item_completed_b',
      title: 'Bosch Stichsäge',
      photo:
          'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=640',
      location: 'Berlin, Mitte',
      lat: 52.52,
      lng: 13.40,
    );

    final requests = <RentalRequest>[
      RentalRequest(
        id: 'owner_demo_req_pending',
        itemId: itemPending.id,
        ownerId: demoOwnerId,
        renterId: pickRenter(0).id,
        start: now.add(const Duration(days: 3, hours: 3)),
        end: now.add(const Duration(days: 5, hours: 3)),
        status: 'pending',
        expressRequested: false,
      ),
      RentalRequest(
        id: 'owner_demo_req_upcoming',
        itemId: itemUpcoming.id,
        ownerId: demoOwnerId,
        renterId: pickRenter(1).id,
        start: now.add(const Duration(days: 1, hours: 1)),
        end: now.add(const Duration(days: 3, hours: 1)),
        status: 'accepted',
        deliveryAddressLine: 'Kollwitzplatz 7',
        deliveryCity: 'Berlin',
        ownerDeliversAtDropoffChosen: true,
      ),
      RentalRequest(
        id: 'owner_demo_req_running',
        itemId: itemOngoing.id,
        ownerId: demoOwnerId,
        renterId: pickRenter(2).id,
        start: now.subtract(const Duration(hours: 2)),
        end: now.add(const Duration(days: 1, hours: 8)),
        status: 'running',
        handoverConfirmation: {'by': 'owner'},
      ),
      RentalRequest(
        id: 'owner_demo_req_completed_hold',
        itemId: itemCompletedA.id,
        ownerId: demoOwnerId,
        renterId: pickRenter(0).id,
        start: now.subtract(const Duration(days: 8)),
        end: now.subtract(const Duration(days: 6)),
        status: 'completed',
        needsReview: true,
        reviewReason: 'manual_hold',
      ),
      RentalRequest(
        id: 'owner_demo_req_completed_reviewable',
        itemId: itemCompletedB.id,
        ownerId: demoOwnerId,
        renterId: pickRenter(1).id,
        start: now.subtract(const Duration(days: 14)),
        end: now.subtract(const Duration(days: 12)),
        status: 'completed',
      ),
      RentalRequest(
        id: 'owner_demo_req_completed_reviewed',
        itemId: itemCompletedB.id,
        ownerId: demoOwnerId,
        renterId: pickRenter(2).id,
        start: now.subtract(const Duration(days: 20)),
        end: now.subtract(const Duration(days: 18)),
        status: 'completed',
      ),
    ];

    final entries = <_OwnerEntry>[
      _OwnerEntry(
          r: requests[0],
          item: itemPending,
          renter: pickRenter(0),
          flowState: const {},
          hasSubmittedReview: false),
      _OwnerEntry(
          r: requests[1],
          item: itemUpcoming,
          renter: pickRenter(1),
          flowState: const {'handoverLocationLabel': 'Mauerpark'},
          hasSubmittedReview: false),
      _OwnerEntry(
          r: requests[2],
          item: itemOngoing,
          renter: pickRenter(2),
          flowState: const {
            'handoverLocationLabel': 'S Warschauer Brücke',
            'returnLocationLabel': 'Tempelhofer Feld'
          },
          hasSubmittedReview: false),
      _OwnerEntry(
          r: requests[3],
          item: itemCompletedA,
          renter: pickRenter(0),
          flowState: const {},
          hasSubmittedReview: false),
      _OwnerEntry(
          r: requests[4],
          item: itemCompletedB,
          renter: pickRenter(1),
          flowState: const {},
          hasSubmittedReview: false),
      _OwnerEntry(
          r: requests[5],
          item: itemCompletedB,
          renter: pickRenter(2),
          flowState: const {},
          hasSubmittedReview: true),
    ];

    return (ownerId: ownerUser.id, entries: entries);
  }

  @override
  Widget build(BuildContext context) {
    final tabsStyle = Theme.of(context).textTheme.bodySmall;
    String title;
    switch (_tabController.index) {
      case 0:
        title = 'Laufende Vermietungen';
        break;
      case 1:
        title = 'Kommende Vermietungen';
        break;
      case 2:
        title = 'Mietanfragen';
        break;
      case 3:
      default:
        title = 'Abgeschlossene Vermietungen';
    }

    // Get unread counts for each tab
    final ongoingUnread = _unreadCounts['ongoing'] ?? 0;
    final upcomingUnread = _unreadCounts['upcoming'] ?? 0;
    final requestsUnread = _unreadCounts['requests'] ?? 0;
    final completedUnread = _unreadCounts['completed'] ?? 0;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back)),
        title: Text(title),
        centerTitle: true,
        bottom: TabBar(
          controller: _tabController,
          // Prevent overflow on small widths (e.g. long labels like "Abgeschlossen")
          // by allowing horizontal scrolling.
          isScrollable: true,
          tabAlignment: TabAlignment.center,
          labelPadding: const EdgeInsets.symmetric(horizontal: 14),
          indicatorSize: TabBarIndicatorSize.label,
          labelColor: Theme.of(context).colorScheme.primary,
          unselectedLabelColor: Colors.white70,
          labelStyle: tabsStyle,
          unselectedLabelStyle: tabsStyle,
          indicatorColor: Theme.of(context).colorScheme.primary,
          tabs: [
            _buildTabWithBadge('Laufend', ongoingUnread),
            _buildTabWithBadge('Kommend', upcomingUnread),
            _buildTabWithBadge('Mietanfragen', requestsUnread),
            _buildTabWithBadge('Abgeschlossen', completedUnread),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildList('ongoing'),
          _buildList('upcoming'),
          _buildList('requests'),
          _buildList('completed'),
        ],
      ),
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
          // In scrollable TabBars, we still want to be safe against edge cases
          // (very small widths / large text scale).
          Flexible(
              child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }

  Widget _buildList(String target) {
    if (_isLoading) {
      return Center(
        child: Semantics(
          label: 'Mietanfragen werden geladen',
          child: const CircularProgressIndicator(),
        ),
      );
    }
    if (_loadFailed) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 56),
              const SizedBox(height: 14),
              Text(
                'Mietanfragen konnten nicht geladen werden.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Erneut versuchen'),
              ),
            ],
          ),
        ),
      );
    }
    final maps =
        _entries.where((e) => _effectiveCategory(e) == target).toList();
    if (maps.isEmpty) {
      final (icon, title) = _emptyStateForCategory(target);
      final cs = Theme.of(context).colorScheme;
      final emptyIconColor = cs.onSurfaceVariant.withValues(alpha: 0.65);
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (target == 'requests')
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
    final bool isRequestsTab = target == 'requests';
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: maps.length,
      itemBuilder: (context, index) {
        final e = maps[index];
        final booking = _toCardMap(e);
        final (start, end) =
            (_parseDateTime(e.r.start), _parseDateTime(e.r.end));
        final effective = _effectiveCategory(e);
        final titleForCategory = _titleForCategory(effective);
        final chip = _buildStatusChipForCard(effective, start, end, e);
        final inlineAction =
            isRequestsTab ? null : _buildInlineAction(effective, e);
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 2,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () async {
              // Mark request as read when user taps on it
              if (_ownerId != null) {
                await DataService.markRequestAsRead(
                    userId: _ownerId!, requestId: e.r.id);
              }
              if (!context.mounted) return;
              await Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => OngoingOwnerDetailScreen(
                      requestId: e.r.id, titleOverride: titleForCategory)));
              if (!mounted) return;
              await _load();
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
                        child: _ThumbnailWithSkeleton(url: booking['image'])),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ConstrainedBox(
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
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(booking['title'] ?? '-',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 18,
                                            color: Colors.white,
                                            height: 1.1)),
                                    const SizedBox(height: 1),
                                    Text(booking['dates'] ?? '',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                            color: Colors.grey.shade400,
                                            fontSize: 13,
                                            height: 1.1)),
                                    const SizedBox(height: 1),
                                    Text(booking['renter'] ?? '',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                            color: Colors.grey.shade400,
                                            fontSize: 13,
                                            height: 1.1)),
                                    const SizedBox(height: 2),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              if (!isRequestsTab)
                                Text(booking['total'] ?? '',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16),
                                    textAlign: TextAlign.right),
                            ],
                          ),
                          Row(children: [
                            chip,
                            if (inlineAction != null) ...[
                              const SizedBox(width: 4),
                              Expanded(
                                child: SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Align(
                                      alignment: Alignment.centerLeft,
                                      child: inlineAction),
                                ),
                              ),
                            ],
                          ])
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Map<String, String> _toCardMap(_OwnerEntry e) {
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

    final r = e.r;
    final it = e.item;
    final renter = e.renter;
    final breakdown = DataService.priceBreakdownForRequest(item: it, req: r);
    final payout = breakdown.payoutOwner.clamp(0.0, double.infinity);
    final isOngoing = r.status == 'running';
    final prefix = isOngoing ? 'return' : 'handover';
    final label =
        ((e.flowState['${prefix}LocationLabel'] as String?) ?? '').trim();
    final sharedBy =
        ((e.flowState['${prefix}LocationSharedByName'] as String?) ?? '')
            .trim();
    final placeLine = label.isNotEmpty
        ? '${isOngoing ? 'Rückgabeort' : 'Übergabeort'}: $label'
        : (sharedBy.isNotEmpty
            ? '${isOngoing ? 'Rückgabeort' : 'Übergabeort'}: Standort von $sharedBy'
            : '');
    return {
      'title': it.title,
      'dates': '${fmt(r.start)} – ${fmt(r.end)}',
      'image': it.photos.isNotEmpty ? it.photos.first : '',
      // Show only the payout value for owner lists
      'total': '${payout.round()} €',
      'renter': renter.displayName,
      'placeLine': placeLine,
    };
  }

  // Strict status-driven categorization (no auto-advance by time)
  // Business rules (mirror renter view and detail page):
  // - pending   → requests (Mietanfragen)
  // - accepted  → upcoming (Kommend)
  // - running   → ongoing (Laufend; only after bestätigte Übergabe)
  // - completed/cancelled/declined → completed (Abgeschlossen)
  String _effectiveCategory(_OwnerEntry e) {
    final s = (e.r.status).toLowerCase();
    if (s == 'pending') return 'requests';
    if (s == 'accepted') return 'upcoming';
    if (s == 'running') return 'ongoing';
    if (s == 'completed' || s == 'cancelled' || s == 'declined') {
      return 'completed';
    }
    // Fallback to upcoming to avoid misrouting unknown states
    return 'upcoming';
  }

  String _titleForCategory(String category) {
    switch (category) {
      case 'upcoming':
        return 'Kommende Vermietung';
      case 'requests':
        return 'Mietanfrage';
      case 'completed':
        return 'Abgeschlossene Vermietung';
      case 'ongoing':
      default:
        return 'Laufende Vermietung';
    }
  }

  (IconData, String) _emptyStateForCategory(String category) {
    switch (category) {
      case 'ongoing':
        return (
          Icons.timelapse_outlined,
          'Du hast keine laufenden Vermietungen'
        );
      case 'upcoming':
        return (
          Icons.event_available_outlined,
          'Du hast keine kommenden Vermietungen'
        );
      case 'requests':
        return (Icons.assignment_outlined, 'Du hast keine Mietanfragen');
      case 'completed':
      default:
        return (
          Icons.task_alt_outlined,
          'Du hast keine abgeschlossenen Vermietungen'
        );
    }
  }

  Widget _buildStatusChipForCard(
      String category, DateTime start, DateTime end, _OwnerEntry e) {
    String label;
    Color color;
    if (e.r.simulationOnly) {
      label = 'Pilot-Simulation';
      color = const Color(0xFF0EA5E9);
      return _buildStatusChip(label: label, color: color);
    }
    switch (category) {
      case 'upcoming':
        // Do not show a return countdown for upcoming; keep a neutral label
        label = 'Kommend';
        color = const Color(0xFF0EA5E9);
        break;
      case 'ongoing':
        label = 'Laufend bis ${_formatGermanDateTime(end)}';
        color = const Color(0xFFFB923C);
        break;
      case 'requests':
        if (!_ownerAcceptanceDeadlineValid(e)) {
          label = e.r.bindingExpiresAt == null
              ? 'Annahme gesperrt'
              : 'Annahmefrist abgelaufen';
          color = const Color(0xFFF43F5E);
        } else {
          // Owner shouldn't see a passive "waiting" state. Indicate action required.
          label = 'Anfrage';
          color = Colors.grey;
        }
        break;
      case 'completed':
        final s = e.r.status;
        final cancelled = s == 'cancelled' || s == 'declined';
        // Special copy: if renter withdrew (cancelledBy == 'renter'), show "Zurückgezogen"
        if (s == 'cancelled' && (e.r.cancelledBy == 'renter')) {
          label = 'Zurückgezogen';
          color = const Color(0xFFF43F5E);
        } else if (e.r.needsReview) {
          label = 'In Prüfung';
          color = const Color(0xFFF59E0B);
        } else {
          label = cancelled ? 'Storniert' : 'Abgeschlossen';
          color = cancelled ? const Color(0xFFF43F5E) : const Color(0xFF22C55E);
        }
        break;
      default:
        label = '—';
        color = Colors.grey;
    }
    return _buildStatusChip(label: label, color: color);
  }

  Widget _buildStatusChip({required String label, required Color color}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(8)),
      child: Text(label,
          style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              height: 1.05),
          maxLines: 1,
          overflow: TextOverflow.ellipsis),
    );
  }

  bool _ownerAcceptanceDeadlineValid(_OwnerEntry entry) {
    if (entry.r.simulationOnly) return true;
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) return true;
    final deadline = entry.r.bindingExpiresAt;
    return deadline != null && deadline.isAfter(DateTime.now());
  }

  Widget? _buildInlineAction(String category, _OwnerEntry e) {
    switch (category) {
      case 'requests':
        return Row(mainAxisSize: MainAxisSize.min, children: [
          // Swap order: Akzeptieren first. Same design as Ablehnen, only text in green.
          _TinyTextButton(
            icon: Icons.check_circle_outline,
            label: 'Akzeptieren',
            color: const Color(0xFF22C55E),
            onPressed: () async {
              final declarations = await showPrivatePilotOwnerAcceptanceDialog(
                context,
                request: e.r,
              );
              if (declarations == null) return;
              if (!mounted) return;
              final accepted = await commitPrivatePilotOwnerAcceptance(
                context,
                request: e.r,
                legalDeclarations: declarations,
              );
              if (!accepted) return;
              if (!mounted) return;
              await _load();
              if (!mounted) return;
              // Success popup (keeps overlay on top for 10 seconds, does not auto-navigate underlying page)
              // ignore: unawaited_futures
              AppPopup.show(
                context,
                icon: Icons.check_circle_outline,
                title: e.r.simulationOnly
                    ? 'Du hast den Test angenommen.'
                    : 'Du hast die Anfrage akzeptiert.',
                message: e.r.simulationOnly
                    ? 'Die unverbindliche Pilot-Simulation ist jetzt für beide Testkonten sichtbar. Du kannst mit ${e.renter.displayName} den Chat testen. Es bestehen kein Vertrag, keine Reservierung und keine Zahlung.'
                    : 'Du findest diese Anmietung jetzt unter „Kommende Vermietungen“.\n\nDu kannst jetzt mit ${e.renter.displayName} unter Nachrichten einen Chat starten.',
                barrierDismissible: false,
                showCloseIcon: false,
                plainCloseIcon: true,
                autoCloseAfter: const Duration(seconds: 10),
                actions: [
                  FilledButton(
                    onPressed: () {
                      // Close the popup then open the specific upcoming rental detail
                      Navigator.of(context, rootNavigator: true).maybePop();
                      Future.delayed(const Duration(milliseconds: 120),
                          () async {
                        if (!mounted) return;
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => OngoingOwnerDetailScreen(
                              requestId: e.r.id,
                              titleOverride: 'Kommende Vermietung',
                            ),
                          ),
                        );
                        if (!mounted) return;
                        await _load();
                      });
                    },
                    child: const Text('Zur kommenden Vermietung'),
                  ),
                ],
              );
            },
          ),
          const SizedBox(width: 6),
          _TinyTextButton(
            icon: Icons.cancel_outlined,
            label: 'Ablehnen',
            color: Theme.of(context).colorScheme.error,
            onPressed: () async {
              // Confirmation popup with app design before declining
              await AppPopup.show(
                context,
                icon: Icons.block,
                title: 'Anfrage ablehnen?',
                message: 'Bist du sicher? Der Mieter wird informiert.',
                plainCloseIcon: true,
                leadingWidget: Builder(builder: (context) {
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
                }),
                actions: [
                  OutlinedButton(
                    onPressed: () =>
                        Navigator.of(context, rootNavigator: true).maybePop(),
                    child: const Text('Abbrechen'),
                  ),
                  FilledButton(
                    onPressed: () async {
                      Navigator.of(context, rootNavigator: true).maybePop();
                      await DataService.updateRentalRequestStatus(
                          requestId: e.r.id, status: 'declined');
                      if (!mounted) return;
                      await _load();
                      if (!mounted) return;
                      // Auto-close after 3 seconds
                      Future.delayed(const Duration(seconds: 3), () {
                        if (mounted) {
                          Navigator.of(context, rootNavigator: true).maybePop();
                        }
                      });
                      // Result popup
                      // ignore: unawaited_futures
                      AppPopup.show(
                        context,
                        icon: Icons.cancel_outlined,
                        title: 'Du hast die Anfrage abgelehnt.',
                        message:
                            'Du findest sie jetzt unter „Abgeschlossene Vermietungen“.',
                        barrierDismissible: true,
                        showCloseIcon: false,
                        plainCloseIcon: true,
                        autoCloseAfter: const Duration(seconds: 15),
                        actions: [
                          TextButton(
                            onPressed: () =>
                                Navigator.of(context, rootNavigator: true)
                                    .maybePop(),
                            child: const Text('OK'),
                          ),
                          FilledButton(
                            onPressed: () {
                              Navigator.of(context, rootNavigator: true)
                                  .maybePop();
                              _tabController.animateTo(3);
                            },
                            child:
                                const Text('Zu „Abgeschlossene Vermietungen“'),
                          ),
                        ],
                      );
                    },
                    child: const Text('Ablehnen'),
                  ),
                ],
              );
            },
          ),
        ]);
      case 'completed':
        // Show a small inline "Bewerten" action for completed rentals (not for cancelled/declined)
        if (e.r.status == 'completed' &&
            !e.r.needsReview &&
            !e.hasSubmittedReview) {
          return _TinyTextButton(
            icon: Icons.star_rate_outlined,
            label: 'Bewerten',
            onPressed: () async {
              final owner = await DataService.getCurrentUser();
              if (owner == null) return;
              if (!mounted) return;
              final ok = await ReviewPromptSheet.show(
                context,
                requestId: e.r.id,
                itemId: e.item.id,
                reviewerId: owner.id,
                reviewedUserId: e.renter.id,
                direction: 'owner_to_renter',
              );
              if (ok == true && mounted) {
                await AppPopup.toast(context,
                    icon: Icons.star_rate_outlined,
                    title: 'Danke für deine Bewertung!');
                if (mounted) {
                  await ItemDetailsOverlay.showFullPage(context, item: e.item);
                }
                await _load();
              } else if (ok == false && mounted) {
                await AppPopup.toast(context,
                    icon: Icons.check_circle_outline,
                    title: 'Bewertung abgegeben');
                await _load();
              }
            },
          );
        }
        return null;
      default:
        return null;
    }
  }

  String _formatGermanDateTime(DateTime d) {
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

  DateTime _parseDateTime(DateTime d) => d; // stored as real DateTime already
}

class _OwnerEntry {
  final RentalRequest r;
  final Item item;
  final model.User renter;
  final Map<String, dynamic> flowState;
  final bool hasSubmittedReview;
  const _OwnerEntry(
      {required this.r,
      required this.item,
      required this.renter,
      required this.flowState,
      required this.hasSubmittedReview});
}

class _TinyTextButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final Color? color;
  const _TinyTextButton(
      {required this.icon,
      required this.label,
      required this.onPressed,
      this.color});
  @override
  Widget build(BuildContext context) {
    final fg = color ?? Theme.of(context).colorScheme.primary;
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        minimumSize: const Size(0, 24),
        visualDensity: const VisualDensity(horizontal: -3, vertical: -3),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: fg),
        const SizedBox(width: 4),
        Text(label,
            style: TextStyle(
                fontWeight: FontWeight.w700, fontSize: 12, color: fg)),
      ]),
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
    if (url == null || url.isEmpty) return _skeleton();
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
