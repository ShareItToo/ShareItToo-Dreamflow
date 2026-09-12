import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:lendify/screens/booking_detail_screen.dart';
import 'package:lendify/screens/help_center_screen.dart';
import 'package:lendify/screens/ongoing_owner_detail_screen.dart';
import 'package:lendify/screens/owner_requests_screen.dart';
import 'package:lendify/screens/message_thread_screen.dart';
import 'package:lendify/screens/notification_detail_screen.dart';
import 'package:lendify/screens/notification_settings_screen.dart';
import 'package:lendify/screens/payment_methods_screen.dart';
import 'package:lendify/screens/support_cases_screen.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/notification_cta_resolver.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/notification_preferences_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/theme.dart';
import 'package:provider/provider.dart';
import 'package:lendify/widgets/identity_verification_unavailable.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/support_principal_controller.dart';

class NotificationsScreen extends StatefulWidget {
  /// Optional: open the notifications screen already filtered to one category.
  ///
  /// When [initialCategory] is provided and [lockToInitialCategory] is true, the
  /// screen behaves like a "category details" page (no filter chips, no
  /// grouping headers – just the list for that category).
  const NotificationsScreen(
      {super.key,
      this.initialCategory,
      this.lockToInitialCategory = false,
      this.titleOverride});

  /// Category key, e.g. 'important', 'bookings', 'messages', 'reviews',
  /// 'payments', 'security', 'platform'.
  final String? initialCategory;

  /// If true, user cannot change the category filter on this screen.
  ///
  /// Note: This is intentionally nullable to stay resilient against stale
  /// hot-reload states on Flutter Web where an older widget shape might still
  /// exist briefly. `null` is treated as `false`.
  final bool? lockToInitialCategory;

  /// Optional app bar title.
  final String? titleOverride;

  bool get isCategoryLocked => lockToInitialCategory == true;
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

enum _NotifFilter {
  all,
  important,
  bookings,
  rentals,
  handover,
  messages,
  support,
  payments,
  reviews,
  system
}

enum _DateBucket { today, yesterday, week, older }

enum _MenuAction { settings, markAllRead, unreadOnly, contactSupport, help }

String _deriveSitCategory(Map<String, dynamic> notification) {
  String lower(Object? value) =>
      value == null ? '' : value.toString().toLowerCase();
  final raw = lower(notification['category']);
  final title = lower(notification['title']);
  final body = lower(notification['body']);
  final entityType = lower(notification['entityType']);

  bool matchesAny(Iterable<String> needles) =>
      needles.any((needle) => title.contains(needle) || body.contains(needle));

  if (raw == 'important' || raw == 'security') return 'important';
  if (raw == 'payments') return 'payments';
  if (raw == 'reviews') return 'reviews';
  if (raw == 'support') return 'support';
  if (raw == 'system' || raw == 'platform') return 'system';

  if (raw == 'bookings') {
    if (matchesAny(
        const ['übergabe', 'rückgabe', 'handover', 'qr-code', 'qr code'])) {
      return 'handover';
    }
    if (matchesAny(const ['mietanfrage', 'vermietung', 'deiner anzeige']) ||
        lower(notification['ctaLabel']) == 'anfrage prüfen') {
      return 'rentals';
    }
    return 'bookings';
  }

  if (raw == 'messages') {
    final bool looksLikeSupport = entityType == 'support' ||
        matchesAny(const [
          'support-fall',
          'supportfall',
          'support',
          'ticket',
          'hilfe'
        ]);
    if (looksLikeSupport) return 'support';
    if (title.startsWith('tipp') ||
        matchesAny(const ['tipp', 'schnelle abstimmung', 'hinweis'])) {
      return 'system';
    }
    return 'messages';
  }

  if (entityType == 'verification') return 'important';

  if (matchesAny(const ['verifizier', 'sicherheit'])) return 'important';
  if (matchesAny(const ['zahlung', 'rechnung'])) return 'payments';
  if (matchesAny(const ['bewertung'])) return 'reviews';
  if (matchesAny(const ['übergabe', 'rückgabe'])) return 'handover';
  if (matchesAny(const ['nachricht', 'chat'])) return 'messages';

  return 'system';
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _supportPrincipal = SupportPrincipalController();
  _NotifFilter _filter = _NotifFilter.all;
  bool _loading = true;
  bool _loadFailed = false;
  String? _currentUserId;
  List<Map<String, dynamic>> _feed = [];
  NotificationPreferences _prefs = NotificationPreferences.defaults();
  bool _showUnreadOnly = false;
  final ScrollController _scrollController = ScrollController();
  StreamSubscription<String>? _persistenceSubscription;
  final SharedPersistenceRefreshCoordinator _refreshCoordinator =
      SharedPersistenceRefreshCoordinator();

  @override
  void dispose() {
    _supportPrincipal.dispose();
    _persistenceSubscription?.cancel();
    _refreshCoordinator.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final initial = widget.initialCategory;
    if (initial != null && initial.isNotEmpty) {
      _filter = _filterForCategory(initial);
    }
    Future.microtask(_load);
    _persistenceSubscription = SharedPersistenceSync.changes.listen((key) {
      if (!mounted || key != SharedPersistenceSync.localSafetyPrivacyStateKey) {
        return;
      }
      unawaited(_refreshCoordinator.schedule(() async {
        await SharedPersistenceSync.reloadPreferences();
        if (mounted) await _load();
      }));
    });
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
      _currentUserId = null;
      _feed = [];
      _prefs = NotificationPreferences.defaults();
    });
    try {
      final prefs = await NotificationPreferencesService.get();
      final user = await DataService.getCurrentUser();
      final userId = user?.id;
      if (userId == null || userId.isEmpty) {
        setState(() {
          _currentUserId = null;
          _feed = [];
          _prefs = prefs;
        });
        return;
      }
      final feed = await DataService.getNotificationFeedForUser(userId);
      final currentAfterLoad = await DataService.getCurrentUser();
      if (!mounted) return;
      if (currentAfterLoad?.id.trim() != userId.trim()) {
        setState(() {
          _currentUserId = null;
          _feed = [];
          _prefs = prefs;
        });
        return;
      }
      setState(() {
        _currentUserId = userId;
        _feed = [...feed]..sort(_compareNotifications);
        _prefs = prefs;
      });
    } catch (e) {
      debugPrint('[NotificationsScreen] load failed: $e');
      if (mounted) setState(() => _loadFailed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markAllRead() async {
    final uid = _currentUserId;
    if (uid == null) return;
    await DataService.markAllNotificationsRead(uid);
    await _load();
  }

  void _handleMenuSelection(_MenuAction action, int unreadCount) async {
    switch (action) {
      case _MenuAction.settings:
        await Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const NotificationSettingsScreen()));
        if (mounted) await _load();
        break;
      case _MenuAction.markAllRead:
        if (unreadCount == 0) {
          _showNotice('Alles ist bereits gelesen.');
          return;
        }
        await _markAllRead();
        break;
      case _MenuAction.unreadOnly:
        setState(() => _showUnreadOnly = !_showUnreadOnly);
        _showNotice(_showUnreadOnly
            ? 'Zeige nur ungelesene Benachrichtigungen.'
            : 'Zeige wieder alle Benachrichtigungen.');
        break;
      case _MenuAction.contactSupport:
        await Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const HelpCenterScreen()));
        break;
      case _MenuAction.help:
        await Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const HelpCenterScreen()));
        break;
    }
  }

  void _showNotice(String message) {
    if (!mounted) return;
    AppPopup.info(
      context,
      title: 'Benachrichtigungen',
      message: message,
    );
  }

  List<Map<String, dynamic>> get _filtered {
    final String? filterKey =
        _filter == _NotifFilter.all ? null : _categoryKeyForFilter(_filter);

    bool allowedByPrefs(Map<String, dynamic> entry) {
      final cat = _deriveSitCategory(entry);
      switch (cat) {
        case 'important':
          return _prefs.showImportant || _prefs.showSecurity;
        case 'bookings':
        case 'handover':
          return _prefs.showBookings;
        case 'messages':
          return _prefs.showMessages;
        case 'support':
          return _prefs.showSupport;
        case 'payments':
          return _prefs.showPayments;
        case 'reviews':
          return _prefs.showReviews;
        case 'system':
        default:
          return _prefs.showSystem;
      }
    }

    var base = _feed.where(allowedByPrefs).toList();
    if (_showUnreadOnly) {
      base = base.where((e) => e['read'] != true).toList();
    }
    if (filterKey == null) return base;
    return base.where((e) => _deriveSitCategory(e) == filterKey).toList();
  }

  String _categoryKeyForFilter(_NotifFilter f) {
    switch (f) {
      case _NotifFilter.important:
        return 'important';
      case _NotifFilter.bookings:
        return 'bookings';
      case _NotifFilter.rentals:
        return 'rentals';
      case _NotifFilter.handover:
        return 'handover';
      case _NotifFilter.messages:
        return 'messages';
      case _NotifFilter.support:
        return 'support';
      case _NotifFilter.payments:
        return 'payments';
      case _NotifFilter.reviews:
        return 'reviews';
      case _NotifFilter.system:
        return 'system';
      case _NotifFilter.all:
        return 'all';
    }
  }

  Future<void> _openNotification(Map<String, dynamic> n) async {
    final uid = _currentUserId;
    if (uid == null) return;

    final id = (n['id'] ?? '').toString();
    if (id.isNotEmpty) {
      // Mark read immediately to make the UI feel responsive.
      await DataService.markNotificationRead(userId: uid, notificationId: id);
      if (mounted) {
        setState(() {
          _feed = [
            for (final e in _feed)
              if ((e['id'] ?? '').toString() == id) {...e, 'read': true} else e,
          ];
        });
      }
    }

    if (!mounted) return;

    // Always open a full-screen detail page (no popups / bottom sheets).
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NotificationDetailScreen(
          notification: n,
          onCta: () => _handleNotificationCta(n),
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _handleNotificationCta(Map<String, dynamic> n) async {
    final supportOwner = _supportPrincipal.capture();
    final uid = _currentUserId;
    if (uid == null || !mounted) return;

    try {
      final resolution = await NotificationCtaResolver.resolve(
        notification: n,
        currentUserId: uid,
      );

      switch (resolution.target) {
        case NotificationTargetKind.ownerRequestDetail:
          final requestId = resolution.requestId;
          if (requestId == null || requestId.isEmpty || !mounted) return;
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => OngoingOwnerDetailScreen(
                requestId: requestId,
                titleOverride: 'Mietanfrage',
              ),
            ),
          );
          return;
        case NotificationTargetKind.ownerRequestsOverview:
          if (!mounted) return;
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => const OwnerRequestsScreen(initialTabIndex: 2),
            ),
          );
          return;
        case NotificationTargetKind.ownerBookingDetail:
          final requestId = resolution.requestId;
          if (requestId == null || requestId.isEmpty || !mounted) return;
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => OngoingOwnerDetailScreen(requestId: requestId),
            ),
          );
          return;
        case NotificationTargetKind.renterBookingDetail:
          final requestId = resolution.requestId;
          if (requestId == null || requestId.isEmpty) return;
          final req = await DataService.getRentalRequestById(requestId);
          if (req == null) return;
          final item = await DataService.getItemById(req.itemId);
          if (item == null) return;
          final owner = await DataService.getUserById(req.ownerId);
          final booking = _toBookingMap(req, item, owner);
          if (!mounted) return;
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => BookingDetailScreen(booking: booking),
            ),
          );
          return;
        case NotificationTargetKind.none:
          break;
      }
    } catch (e) {
      debugPrint('[NotificationsScreen] minimal CTA resolver failed: $e');
    }

    final category = (n['category'] ?? '').toString();
    final entityType = (n['entityType'] ?? '').toString();
    final entityId = (n['entityId'] ?? '').toString();
    final sitCategory = _deriveSitCategory(n);

    try {
      if (entityType == 'booking' &&
          entityId.isNotEmpty &&
          !entityId.startsWith('mock')) {
        final req = await DataService.getRentalRequestById(entityId);
        if (req == null) return;
        final item = await DataService.getItemById(req.itemId);
        if (item == null) return;
        final owner = await DataService.getUserById(req.ownerId);
        final booking = _toBookingMap(req, item, owner);
        if (!mounted) return;
        await Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => BookingDetailScreen(
                booking: booking, viewerIsOwner: uid == req.ownerId)));
        return;
      }

      if (entityType == 'thread' &&
          entityId.isNotEmpty &&
          !entityId.startsWith('mock')) {
        final thread = await DataService.getMessageThreadById(entityId);
        if (thread == null) return;
        final otherId =
            (thread.user1Id == uid) ? thread.user2Id : thread.user1Id;
        final other = await DataService.getUserById(otherId);
        if (!mounted) return;
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => MessageThreadScreen(
              threadId: thread.id,
              participantName: other?.displayName ?? 'Chat',
              avatarUrl: other?.photoURL,
              itemTitle: thread.itemTitle,
            ),
          ),
        );
        return;
      }

      if (entityType == 'payment' || sitCategory == 'payments') {
        if (!mounted) return;
        await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const PaymentMethodsScreen()));
        return;
      }

      if (entityType == 'verification' ||
          category == 'security' ||
          sitCategory == 'important') {
        if (!mounted) return;
        await showIdentityVerificationUnavailable(context);
        return;
      }

      if (sitCategory == 'support') {
        if (supportOwner == null ||
            uid != supportOwner.userId ||
            !await _supportPrincipal.isCurrent(supportOwner) ||
            !mounted) {
          return;
        }
        if (entityType == 'support' &&
            entityId.isNotEmpty &&
            !entityId.startsWith('mock')) {
          await _supportPrincipal.pushOwnedRoute<void>(
            context: context,
            owner: supportOwner,
            route: MaterialPageRoute(
              builder: (_) => SupportCaseNotificationDestinationScreen(
                owner: supportOwner,
                caseId: entityId,
              ),
            ),
          );
          return;
        }
        if (!mounted) return;
        await _supportPrincipal.pushOwnedRoute<void>(
            context: context,
            owner: supportOwner,
            route: MaterialPageRoute(
                builder: (_) => SupportCasesScreen(owner: supportOwner)));
        return;
      }

      if (sitCategory == 'reviews') {
        if (mounted) Navigator.of(context).maybePop();
        return;
      }

      _showNotice('Alles klar.');
    } catch (e) {
      debugPrint('[NotificationsScreen] CTA handling failed: $e');
    }
  }

  Future<void> _archive(Map<String, dynamic> n) async {
    final uid = _currentUserId;
    if (uid == null) return;
    final id = (n['id'] ?? '').toString();
    if (id.isEmpty) return;
    await DataService.archiveNotification(userId: uid, notificationId: id);
    await _load();
  }

  void _setFilter(_NotifFilter f) {
    if (widget.isCategoryLocked) return;
    if (_filter == f) return;
    setState(() => _filter = f);
    if (_scrollController.hasClients) {
      _scrollController.animateTo(0,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic);
    }
  }

  _NotifFilter _filterForCategory(String category) {
    switch (category) {
      case 'important':
      case 'security':
        return _NotifFilter.important;
      case 'bookings':
        return _NotifFilter.bookings;
      case 'rentals':
        return _NotifFilter.rentals;
      case 'handover':
      case 'return':
        return _NotifFilter.handover;
      case 'messages':
        return _NotifFilter.messages;
      case 'support':
        return _NotifFilter.support;
      case 'payments':
        return _NotifFilter.payments;
      case 'reviews':
        return _NotifFilter.reviews;
      case 'system':
      case 'platform':
        return _NotifFilter.system;
      case 'all':
        return _NotifFilter.all;
      default:
        return _NotifFilter.system;
    }
  }

  String _labelForCategory(String category) {
    switch (category) {
      case 'important':
        return 'Wichtig';
      case 'bookings':
        return 'Buchungen';
      case 'rentals':
        return 'Vermietungen';
      case 'handover':
        return 'Übergabe & Rückgabe';
      case 'messages':
        return 'Nachrichten';
      case 'support':
        return 'Support-Fälle';
      case 'payments':
        return 'Zahlungen';
      case 'security':
        return 'Wichtig';
      case 'reviews':
        return 'Bewertungen';
      case 'system':
      case 'platform':
        return 'System';
      case 'all':
        return 'Alle';
      default:
        return 'System';
    }
  }

  Map<_DateBucket, List<Map<String, dynamic>>> _groupByDate(
      List<Map<String, dynamic>> list) {
    final out = <_DateBucket, List<Map<String, dynamic>>>{
      _DateBucket.today: [],
      _DateBucket.yesterday: [],
      _DateBucket.week: [],
      _DateBucket.older: [],
    };
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));

    for (final n in list) {
      final ts = DateTime.tryParse((n['ts'] ?? '').toString());
      if (ts == null) {
        out[_DateBucket.older]!.add(n);
        continue;
      }
      final d = DateTime(ts.year, ts.month, ts.day);
      if (d == today) {
        out[_DateBucket.today]!.add(n);
      } else if (d == yesterday) {
        out[_DateBucket.yesterday]!.add(n);
      } else if (ts.isAfter(today.subtract(const Duration(days: 7)))) {
        out[_DateBucket.week]!.add(n);
      } else {
        out[_DateBucket.older]!.add(n);
      }
    }

    for (final e in out.entries) {
      e.value.sort(_compareNotifications);
    }
    return out;
  }

  int _compareNotifications(Map<String, dynamic> a, Map<String, dynamic> b) {
    if (_prefs.unreadFirst) {
      final ar = a['read'] == true;
      final br = b['read'] == true;
      if (ar != br) return ar ? 1 : -1;
    }

    final at = DateTime.tryParse((a['ts'] ?? '').toString()) ??
        DateTime.fromMillisecondsSinceEpoch(0);
    final bt = DateTime.tryParse((b['ts'] ?? '').toString()) ??
        DateTime.fromMillisecondsSinceEpoch(0);
    return bt.compareTo(at);
  }

  Map<String, List<Map<String, dynamic>>> _groupBySitCategory(
      List<Map<String, dynamic>> list) {
    final out = <String, List<Map<String, dynamic>>>{
      'important': [],
      'bookings': [],
      'rentals': [],
      'handover': [],
      'messages': [],
      'support': [],
      'payments': [],
      'reviews': [],
      'system': [],
    };

    for (final n in list) {
      final key = _deriveSitCategory(n);
      (out[key] ??= <Map<String, dynamic>>[]).add(n);
    }

    for (final e in out.entries) {
      e.value.sort(_compareNotifications);
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final theme = Theme.of(context);

    final visible = _filtered;
    final unreadCount = visible.where((e) => e['read'] != true).length;

    Widget body;
    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_loadFailed) {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.gpp_maybe_outlined, size: 42),
              const SizedBox(height: 12),
              const Text(
                'Benachrichtigungen konnten nicht sicher geladen werden.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Es werden keine Daten eines vorherigen Kontos angezeigt.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 48,
                child: FilledButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Erneut versuchen'),
                ),
              ),
            ],
          ),
        ),
      );
    } else if (_currentUserId == null) {
      body = _EmptyState(
        icon: Icons.notifications_off,
        title: 'Nicht verfügbar',
        subtitle:
            'Bitte erst ein Profil erstellen, um deinen persönlichen Benachrichtigungs‑Feed zu sehen. Einstellungen kannst du aber schon festlegen.',
      );
    } else if (visible.isEmpty) {
      final bool categoryMode = widget.isCategoryLocked &&
          widget.initialCategory != null &&
          widget.initialCategory!.isNotEmpty;
      final bool isFiltered = _filter != _NotifFilter.all;
      if (categoryMode || isFiltered) {
        final String catKey = categoryMode
            ? widget.initialCategory!
            : _categoryKeyForFilter(_filter);
        if (catKey == 'rentals') {
          body = _EmptyState(
            icon: Icons.inventory_2_outlined,
            title: 'Keine Benachrichtigungen zu Vermietungen',
            subtitle:
                'Sobald jemand eine deiner Anzeigen anfragt, wirst du hier benachrichtigt.',
          );
        } else {
          final String label = _labelForCategory(catKey);
          body = _EmptyState(
            icon: Icons.notifications_none,
            title: 'Keine Benachrichtigungen in „$label“',
            subtitle:
                'Sobald es neue Updates in dieser Kategorie gibt, erscheinen sie hier.',
          );
        }
      } else {
        body = _EmptyState(
          icon: Icons.notifications_none,
          title: 'Hier siehst du künftig deine Benachrichtigungen.',
          subtitle:
              'Sobald es Neuigkeiten zu deinen Buchungen oder Nachrichten gibt, erscheinen sie hier.',
        );
      }
    } else {
      final bool categoryMode = widget.isCategoryLocked &&
          widget.initialCategory != null &&
          widget.initialCategory!.isNotEmpty;

      body = CustomScrollView(
        controller: _scrollController,
        physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          if (!categoryMode)
            SliverToBoxAdapter(
              child: Padding(
                padding:
                    const EdgeInsets.fromLTRB(16, kToolbarHeight + 12, 16, 10),
                child: _FilterBar(filter: _filter, onChanged: _setFilter),
              ),
            )
          else
            const SliverToBoxAdapter(
                child: SizedBox(height: kToolbarHeight + 12)),
          if (categoryMode)
            SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                sliver: _notifSliverList(
                    theme, ([...visible]..sort(_compareNotifications))))
          else if (_prefs.groupByCategory)
            ..._buildCategoryGroupedSlivers(theme, visible)
          else
            ..._buildDateGroupedSlivers(theme, visible),
          const SliverToBoxAdapter(child: SizedBox(height: 18)),
        ],
      );
    }

    return Stack(
      children: [
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(color: Colors.black.withValues(alpha: 0.35)),
          ),
        ),
        Scaffold(
          extendBodyBehindAppBar: true,
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            surfaceTintColor: Colors.transparent,
            title: SizedBox(
              width: double.infinity,
              child: Text(
                  widget.titleOverride ?? l10n.t('account.item.notifications'),
                  textAlign: TextAlign.center),
            ),
            centerTitle: true,
            leading: IconButton(
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: PopupMenuButton<_MenuAction>(
                  tooltip: 'Mehr Optionen',
                  // Match the exact overflow menu styling used in MessageThreadScreen.
                  color: Colors.grey.shade900,
                  elevation: 4,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                  offset: const Offset(0, 8),
                  icon: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Icon(Icons.more_vert,
                          color: Colors.white.withValues(alpha: 0.85),
                          size: 22),
                      if (unreadCount > 0)
                        Positioned(
                          right: -2,
                          top: -2,
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                                color: theme.colorScheme.primary,
                                shape: BoxShape.circle),
                          ),
                        ),
                    ],
                  ),
                  onSelected: (action) =>
                      _handleMenuSelection(action, unreadCount),
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: _MenuAction.settings,
                      height: 42,
                      child: Row(children: [
                        Icon(Icons.tune_rounded,
                            size: 18,
                            color: Colors.white.withValues(alpha: 0.85)),
                        const SizedBox(width: 10),
                        const Text('Benachrichtigungseinstellungen',
                            style: TextStyle(fontSize: 13)),
                      ]),
                    ),
                    PopupMenuItem(
                      value: _MenuAction.markAllRead,
                      height: 42,
                      child: Row(children: [
                        Icon(Icons.done_all_rounded,
                            size: 18,
                            color: Colors.white.withValues(alpha: 0.85)),
                        const SizedBox(width: 10),
                        const Text('Alle als gelesen markieren',
                            style: TextStyle(fontSize: 13)),
                      ]),
                    ),
                    const PopupMenuDivider(height: 8),
                    CheckedPopupMenuItem<_MenuAction>(
                      value: _MenuAction.unreadOnly,
                      checked: _showUnreadOnly,
                      height: 42,
                      child: Row(children: [
                        Icon(Icons.mark_email_unread_outlined,
                            size: 18,
                            color: Colors.white.withValues(alpha: 0.85)),
                        const SizedBox(width: 10),
                        const Text('Nur ungelesene anzeigen',
                            style: TextStyle(fontSize: 13)),
                      ]),
                    ),
                    const PopupMenuDivider(height: 8),
                    PopupMenuItem(
                      value: _MenuAction.contactSupport,
                      height: 42,
                      child: Row(children: [
                        ClipOval(
                          child: Image.asset(
                            'assets/images/icononly_transparent_nobuffer.png',
                            width: 18,
                            height: 18,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Icon(
                                Icons.support_agent_rounded,
                                size: 18,
                                color: theme.colorScheme.primary),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text('Support kontaktieren',
                            style: TextStyle(
                                color: theme.colorScheme.primary,
                                fontSize: 13)),
                      ]),
                    ),
                    PopupMenuItem(
                      value: _MenuAction.help,
                      height: 42,
                      child: Row(children: [
                        Icon(Icons.help_outline_rounded,
                            size: 18,
                            color: Colors.white.withValues(alpha: 0.85)),
                        const SizedBox(width: 10),
                        const Text('Hilfe zu Benachrichtigungen',
                            style: TextStyle(fontSize: 13)),
                      ]),
                    ),
                  ],
                ),
              ),
            ],
          ),
          body: RefreshIndicator(
            color: theme.colorScheme.primary,
            onRefresh: _load,
            child: body,
          ),
        ),
      ],
    );
  }

  List<Widget> _buildDateGroupedSlivers(
      ThemeData theme, List<Map<String, dynamic>> visible) {
    final grouped = _groupByDate(visible);
    const order = [
      _DateBucket.today,
      _DateBucket.yesterday,
      _DateBucket.week,
      _DateBucket.older
    ];
    return [
      for (final b in order)
        if (grouped[b] != null && grouped[b]!.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
              child: _DateHeader(bucket: b),
            ),
          ),
          SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              sliver: _notifSliverList(theme, grouped[b]!)),
        ],
    ];
  }

  List<Widget> _buildCategoryGroupedSlivers(
      ThemeData theme, List<Map<String, dynamic>> visible) {
    final grouped = _groupBySitCategory(visible);
    const order = [
      'important',
      'bookings',
      'rentals',
      'handover',
      'messages',
      'support',
      'payments',
      'reviews',
      'system'
    ];
    return [
      for (final key in order)
        if (grouped[key] != null && grouped[key]!.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
              child: _CategoryHeader(
                  label: _labelForCategory(key), icon: _iconForCategory(key)),
            ),
          ),
          SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              sliver: _notifSliverList(theme, grouped[key]!)),
        ],
    ];
  }

  SliverList _notifSliverList(
      ThemeData theme, List<Map<String, dynamic>> list) {
    return SliverList.separated(
      itemCount: list.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final n = list[index];
        final critical = n['critical'] == true;
        final archivable =
            !critical && (n['category']?.toString() == 'platform');
        final card = _NotificationCard(
            notification: n, onTap: () => _openNotification(n));
        if (!archivable) return card;
        return Dismissible(
          key: ValueKey('notif_${n['id']}'),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 16),
            decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(18)),
            child: Icon(Icons.archive_outlined,
                color: AppTheme.textPrimary(context)),
          ),
          confirmDismiss: (_) async {
            await _archive(n);
            return true;
          },
          child: card,
        );
      },
    );
  }

  IconData _iconForCategory(String category) {
    switch (category) {
      case 'important':
        return Icons.error_outline;
      case 'bookings':
        return Icons.calendar_month_outlined;
      case 'rentals':
        return Icons.inventory_2_outlined;
      case 'handover':
        return Icons.swap_horiz;
      case 'messages':
        return Icons.chat_bubble_outline;
      case 'support':
        return Icons.support_agent;
      case 'payments':
        return Icons.payments_outlined;
      case 'reviews':
        return Icons.star_outline;
      case 'system':
      case 'platform':
      default:
        return Icons.info_outline;
    }
  }

  Map<String, dynamic> _toBookingMap(
    RentalRequest req,
    Item it,
    User? owner,
  ) {
    // We intentionally keep this minimal-but-compatible with BookingDetailScreen.
    // (BookingDetailScreen reads keys defensively; missing optional fields are okay.)
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

    final breakdown = DataService.priceBreakdownForRequest(item: it, req: req);
    final total = (req.quotedTotalRenter ?? breakdown.totalRenter);
    return {
      'requestId': req.id,
      'itemId': it.id,
      'rawStatus': req.status,
      'cancelledBy': req.cancelledBy,
      'title': it.title,
      'dates': '${fmt(req.start)} – ${fmt(req.end)}',
      'location': it.locationText,
      'status': req.status,
      'image': (it.photos.isNotEmpty ? it.photos.first : null),
      'images': it.photos,
      'listerId': it.ownerId,
      'listerName': owner?.displayName ?? 'Vermieter',
      'listerAvatar': owner?.photoURL,
      'pricePaid': '${total.round()} €',
      'quotedTotalRenter': total,
      if (req.quotedSubtitle != null) 'quotedSubtitle': req.quotedSubtitle,
      if (req.quotedQuoteVersion != null)
        'quotedQuoteVersion': req.quotedQuoteVersion,
      if (req.quotedDays != null) 'quotedDays': req.quotedDays,
      if (req.quotedPricePerDayMinor != null)
        'quotedPricePerDayMinor': req.quotedPricePerDayMinor,
      if (req.quotedBaseRentalMinor != null)
        'quotedBaseRentalMinor': req.quotedBaseRentalMinor,
      if (req.quotedDiscountPercent != null)
        'quotedDiscountPercent': req.quotedDiscountPercent,
      if (req.quotedDiscountId != null)
        'quotedDiscountId': req.quotedDiscountId,
      if (req.quotedDiscountLabel != null)
        'quotedDiscountLabel': req.quotedDiscountLabel,
      if (req.quotedDiscountFundingSource != null)
        'quotedDiscountFundingSource': req.quotedDiscountFundingSource,
      if (req.quotedDiscountThresholdDays != null)
        'quotedDiscountThresholdDays': req.quotedDiscountThresholdDays,
      if (req.quotedDiscountMinor != null)
        'quotedDiscountMinor': req.quotedDiscountMinor,
      if (req.quotedRentalSubtotalMinor != null)
        'quotedRentalSubtotalMinor': req.quotedRentalSubtotalMinor,
      if (req.quotedPlatformFeeMinor != null)
        'quotedPlatformFeeMinor': req.quotedPlatformFeeMinor,
      if (req.quotedTotalMinor != null)
        'quotedTotalMinor': req.quotedTotalMinor,
      if (req.quotedOwnerPayoutMinor != null)
        'quotedOwnerPayoutMinor': req.quotedOwnerPayoutMinor,
      if (req.quotedCurrency != null) 'quotedCurrency': req.quotedCurrency,
      'days': breakdown.days,
      'basePerDay': it.pricePerDay,
      'startIso': req.start.toIso8601String(),
      'endIso': req.end.toIso8601String(),
      'policy': it.cancellationPolicy,
      'requestCreatedAtIso': req.createdAt.toIso8601String(),
    };
  }
}

class _FilterBar extends StatelessWidget {
  final _NotifFilter filter;
  final ValueChanged<_NotifFilter> onChanged;
  const _FilterBar({required this.filter, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          _FilterPill(
              label: 'Alle',
              selected: filter == _NotifFilter.all,
              onTap: () => onChanged(_NotifFilter.all)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'Wichtig',
              selected: filter == _NotifFilter.important,
              onTap: () => onChanged(_NotifFilter.important)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'Buchungen',
              selected: filter == _NotifFilter.bookings,
              onTap: () => onChanged(_NotifFilter.bookings)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'Übergabe',
              selected: filter == _NotifFilter.handover,
              onTap: () => onChanged(_NotifFilter.handover)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'Nachrichten',
              selected: filter == _NotifFilter.messages,
              onTap: () => onChanged(_NotifFilter.messages)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'Support',
              selected: filter == _NotifFilter.support,
              onTap: () => onChanged(_NotifFilter.support)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'Zahlungen',
              selected: filter == _NotifFilter.payments,
              onTap: () => onChanged(_NotifFilter.payments)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'Bewertungen',
              selected: filter == _NotifFilter.reviews,
              onTap: () => onChanged(_NotifFilter.reviews)),
          const SizedBox(width: 8),
          _FilterPill(
              label: 'System',
              selected: filter == _NotifFilter.system,
              onTap: () => onChanged(_NotifFilter.system)),
        ],
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterPill(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        color: selected
            ? accent.withValues(alpha: 0.18)
            : AppTheme.surfaceMuted(context),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
            color: selected
                ? accent.withValues(alpha: 0.28)
                : AppTheme.glassStroke(context)),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                  color: selected ? accent : AppTheme.textSecondary(context),
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w700),
            ),
          ),
        ),
      ),
    );
  }
}

class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  accent.withValues(alpha: 0.42),
                  accent.withValues(alpha: 0.14)
                ]),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.glassStroke(context)),
          ),
          child: Icon(icon, size: 16, color: AppTheme.textPrimary(context)),
        ),
        const SizedBox(width: 10),
        Text(label,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(width: 10),
        Expanded(
            child: Container(height: 1, color: AppTheme.glassStroke(context))),
      ],
    );
  }
}

class _DateHeader extends StatelessWidget {
  final _DateBucket bucket;
  const _DateHeader({required this.bucket});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = switch (bucket) {
      _DateBucket.today => 'Heute',
      _DateBucket.yesterday => 'Gestern',
      _DateBucket.week => 'Diese Woche',
      _DateBucket.older => 'Älter',
    };

    return Row(
      children: [
        Text(label,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(width: 10),
        Expanded(
            child: Container(height: 1, color: AppTheme.glassStroke(context))),
      ],
    );
  }
}

class _NotificationCard extends StatelessWidget {
  final Map<String, dynamic> notification;
  final VoidCallback onTap;
  const _NotificationCard({required this.notification, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final title = (notification['title'] ?? '').toString();
    final body = (notification['body'] ?? '').toString();
    final tsStr = (notification['ts'] ?? '').toString();
    final ts = DateTime.tryParse(tsStr);
    final timeLabel = ts == null ? '' : _relativeTime(ts);
    final read = notification['read'] == true;
    final bool showChevron = body.trim().isNotEmpty ||
        (notification['entityType']?.toString().isNotEmpty ?? false);

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 180),
      opacity: read ? 0.74 : 1.0,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: read
                  ? AppTheme.surfacePrimary(context)
                  : AppTheme.surfaceSecondary(context),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                  color: read
                      ? AppTheme.glassStroke(context)
                      : accent.withValues(alpha: 0.18)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight:
                                      read ? FontWeight.w700 : FontWeight.w900),
                            ),
                          ),
                          if (!read)
                            Container(
                              width: 7.5,
                              height: 7.5,
                              margin: const EdgeInsets.only(left: 8),
                              decoration: BoxDecoration(
                                  color: accent.withValues(alpha: 0.9),
                                  shape: BoxShape.circle),
                            ),
                        ],
                      ),
                      if (body.trim().isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          body,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: AppTheme.textBody(context)),
                        ),
                      ],
                      if (timeLabel.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(
                          timeLabel,
                          style: theme.textTheme.labelSmall?.copyWith(
                              color: AppTheme.textDisabled(context),
                              fontSize: 11),
                        ),
                      ],
                    ],
                  ),
                ),
                if (showChevron) ...[
                  const SizedBox(width: 10),
                  Icon(Icons.chevron_right,
                      color: AppTheme.textDisabled(context)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _relativeTime(DateTime ts) {
    final now = DateTime.now();
    final diff = now.difference(ts);
    if (diff.inMinutes < 1) return 'gerade eben';
    if (diff.inMinutes < 60) return 'vor ${diff.inMinutes} Min.';
    if (diff.inHours < 24) return 'vor ${diff.inHours} Std.';
    if (diff.inDays < 7) return 'vor ${diff.inDays} Tg.';
    final weeks = (diff.inDays / 7).floor();
    if (weeks < 5) return 'vor $weeks W.';
    final months = (diff.inDays / 30).floor();
    return 'vor $months Mon.';
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _EmptyState(
      {required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [
                  BrandColors.logoGradientStart,
                  BrandColors.logoGradientEnd
                ]),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(icon, color: AppTheme.textPrimary(context), size: 34),
            ),
            const SizedBox(height: 14),
            Text(title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(subtitle,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: AppTheme.textSecondary(context))),
          ],
        ),
      ),
    );
  }
}
