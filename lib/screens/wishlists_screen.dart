import 'dart:async';

import 'package:flutter/material.dart';
import 'dart:math' as math;
import 'package:lendify/config/booking_group_technical_config.dart';
import 'package:lendify/config/planner_technical_config.dart';
import 'package:lendify/config/listing_sets_technical_config.dart';
import 'package:lendify/models/booking_group.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_cart.dart';
import 'package:lendify/screens/booking_group_technical_screen.dart';
import 'package:lendify/screens/closed_pilot_planner_screen.dart';
import 'package:lendify/screens/closed_pilot_listing_set_discovery_screen.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/private_pilot_checkout_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/item_card.dart';
import 'package:lendify/widgets/listing_options_dialog.dart';
import 'package:lendify/widgets/local_state_error_panel.dart';
import 'package:lendify/widgets/wishlist_mosaic_card.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:lendify/widgets/saved_cart_action_scope.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/theme.dart';

class RentalCartScreen extends StatefulWidget {
  const RentalCartScreen(
      {super.key, this.projectCreator, this.projectAssigner});

  final Future<RentalCartProject> Function(
    String title,
    LocalPrincipalActionOwner owner,
  )? projectCreator;

  final Future<RentalCart> Function(
    String itemId,
    String? projectId,
    LocalPrincipalActionOwner owner,
  )? projectAssigner;

  @override
  State<RentalCartScreen> createState() => _RentalCartScreenState();
}

/// Compatibility type for callers that still use the pre-G2A screen name.
/// Persisted wishlist values remain on the original keys for safe rollback.
@Deprecated('Use RentalCartScreen; saved wishlist data remains compatible.')
class WishlistsScreen extends RentalCartScreen {
  const WishlistsScreen({super.key});
}

class _RentalCartScreenState extends State<RentalCartScreen> {
  final SharedPersistenceRefreshCoordinator _refreshCoordinator =
      SharedPersistenceRefreshCoordinator();
  StreamSubscription<String>? _savedStateSubscription;
  bool _loading = true;
  RentalCart _rentalCart = const RentalCart(localDeviceOnly: true);
  String? _busyCartItemId;
  List<Map<String, dynamic>> _lists = [];
  Map<String, List<Item>> _itemsByList = {};
  bool _hasLoadedSnapshot = false;
  bool _reloadInFlight = false;
  String? _loadErrorTitle;
  String? _loadErrorMessage;
  LocalPrincipalActionOwner? _snapshotOwner;
  int _principalGeneration = 0;
  bool _projectBusy = false;
  TrackedDialogRouteHandle<String>? _projectDraft;
  TrackedDialogRouteHandle<void>? _projectNotice;
  TrackedDialogRouteHandle<String>? _assignmentSheet;
  final Set<TrackedDialogRouteHandle<void>> _assignmentNotices = {};
  final Set<SavedCartActionScope> _cartActions = {};
  SavedCartActionScope? _openingCartItem;

  SavedCartActionScope? _beginCartAction() {
    final owner = _snapshotOwner;
    if (owner == null || !owner.isCurrentEpoch || !mounted) return null;
    final action = SavedCartActionScope(owner, isMounted: () => mounted);
    _cartActions.add(action);
    return action;
  }

  void _endCartAction(SavedCartActionScope action) {
    _cartActions.remove(action);
    action.dispose();
  }

  @override
  void initState() {
    super.initState();
    _savedStateSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) {
        _principalGeneration++;
        _snapshotOwner = null;
        for (final action in _cartActions.toList()) {
          action.invalidate();
        }
        _openingCartItem = null;
        _projectDraft?.dismiss();
        _projectNotice?.dismiss();
        final assignment = _assignmentSheet;
        _assignmentSheet = null;
        assignment?.dismiss();
        for (final notice in _assignmentNotices.toList()) {
          notice.dismiss();
        }
        if (mounted) {
          setState(() {
            _hasLoadedSnapshot = false;
            _lists = [];
            _itemsByList = {};
            _rentalCart = const RentalCart(localDeviceOnly: true);
            _busyCartItemId = null;
            _loadErrorTitle = null;
            _loadErrorMessage = null;
          });
        }
      }
      if (key == SharedPersistenceSync.accountSecurityStateKey ||
          key == SharedPersistenceSync.wishlistStateKey ||
          key == SharedPersistenceSync.savedItemsKey ||
          key == SharedPersistenceSync.rentalCartKey) {
        unawaited(_refreshCoordinator.schedule(_reload));
      }
    });
    unawaited(_refreshCoordinator.schedule(_reload));
  }

  @override
  void dispose() {
    for (final action in _cartActions.toList()) {
      action.dispose();
    }
    _cartActions.clear();
    _refreshCoordinator.dispose();
    _savedStateSubscription?.cancel();
    final draft = _projectDraft;
    final notice = _projectNotice;
    final assignment = _assignmentSheet;
    final assignmentNotices = _assignmentNotices.toList();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      draft?.dismiss();
      notice?.dismiss();
      assignment?.dismiss();
      for (final notice in assignmentNotices) {
        notice.dismiss();
      }
    });
    super.dispose();
  }

  Future<void> _reload() async {
    if (_reloadInFlight) return;
    _reloadInFlight = true;
    final generation = _principalGeneration;
    LocalPrincipalActionOwner? owner;
    setState(() => _loading = true);
    try {
      owner = await LocalPrincipalActionOwner.capture();
      final results = await Future.wait<Object>(<Future<Object>>[
        DataService.getWishlists(expectedOwner: owner),
        DataService.getItemsByWishlist(expectedOwner: owner),
        DataService.getRentalCart(expectedOwner: owner),
      ]);
      if (!mounted ||
          generation != _principalGeneration ||
          !await owner.isCurrent() ||
          !mounted ||
          generation != _principalGeneration) {
        return;
      }
      setState(() {
        _snapshotOwner = owner;
        _lists = results[0] as List<Map<String, dynamic>>;
        _itemsByList = results[1] as Map<String, List<Item>>;
        _rentalCart = results[2] as RentalCart;
        _hasLoadedSnapshot = true;
        _loadErrorTitle = null;
        _loadErrorMessage = null;
        _reloadInFlight = false;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _principalGeneration) return;
      if (owner != null && !await owner.isCurrent()) return;
      if (!mounted || generation != _principalGeneration) return;
      setState(() {
        _loading = false;
        _loadErrorTitle = 'Gespeicherte Daten konnten nicht geladen werden';
        _loadErrorMessage =
            'Deine Merklisten und dein Mietkorb wurden nicht als leer behandelt. '
            'Die lokale Kopie bleibt unverändert.';
        _reloadInFlight = false;
      });
    } finally {
      _reloadInFlight = false;
    }
  }

  Future<void> _addProject() async {
    // Capture the already verified snapshot owner synchronously, before any
    // dialog/session await. A delayed draft can never adopt its successor.
    final owner = _snapshotOwner;
    final generation = _principalGeneration;
    if (owner == null || _projectBusy || !owner.isCurrentEpoch) return;
    _projectBusy = true;
    bool stillOwned() => mounted && generation == _principalGeneration;
    try {
      if (!await owner.isCurrent() || !stillOwned()) return;
      if (!mounted) return;
      final draft = TrackedDialogRouteHandle<String>();
      _projectDraft = draft;
      final title = await AppPopup.showCustom<String>(
        context,
        icon: Icons.create_new_folder_outlined,
        title: 'Neues Projekt',
        showCloseIcon: false,
        showLeading: false,
        showAccentLine: false,
        routeHandle: draft,
        body: _CreateWishlistPopupBody(onComplete: draft.dismiss),
      );
      if (title == null || title.trim().isEmpty || !stillOwned()) return;
      if (!await owner.isCurrent() || !stillOwned()) return;
      final creator = widget.projectCreator;
      if (creator == null) {
        await DataService.addRentalCartProject(
            title: title, expectedOwner: owner);
      } else {
        await creator(title, owner);
      }
      if (!await owner.isCurrent() || !stillOwned()) return;
      await _reload();
    } catch (error) {
      if (!stillOwned() || !await owner.isCurrent() || !stillOwned()) return;
      if (!mounted) return;
      final notice = TrackedDialogRouteHandle<void>();
      _projectNotice = notice;
      await AppPopup.toast(
        context,
        icon: Icons.error_outline,
        title: 'Projekt konnte nicht bestätigt werden',
        message:
            'Bitte lade den Mietkorb erneut, bevor du das Projekt noch einmal anlegst.',
        routeHandle: notice,
      );
    } finally {
      _projectDraft = null;
      _projectNotice = null;
      _projectBusy = false;
    }
  }

  Future<void> _recheckCart() async {
    await _changeCart(
      (owner) => DataService.recheckRentalCart(expectedOwner: owner),
      'Prüfung gerade nicht möglich',
    );
  }

  Future<void> _removeCartItem(String id) async {
    await _changeCart(
      (owner) => DataService.removeRentalCartItem(id, expectedOwner: owner),
      'Entfernen des Artikels konnte nicht bestätigt werden',
    );
  }

  Future<void> _removeProject(String id) async {
    await _changeCart(
      (owner) => DataService.removeRentalCartProject(id, expectedOwner: owner),
      'Entfernen des Projekts konnte nicht bestätigt werden',
    );
  }

  Future<void> _changeCart(
    Future<RentalCart> Function(LocalPrincipalActionOwner owner) change,
    String errorTitle,
  ) async {
    final action = _beginCartAction();
    if (action == null) return;
    try {
      if (!await action.isCurrent()) return;
      final cart = await change(action.owner);
      if (!await action.isCurrent()) return;
      setState(() => _rentalCart = cart);
    } catch (error) {
      if (!mounted) return;
      await action.notice(
        context,
        icon: Icons.error_outline,
        title: errorTitle,
        message:
            'Bitte lade den Mietkorb erneut, bevor du die Aktion wiederholst.',
      );
    } finally {
      _endCartAction(action);
    }
  }

  Future<void> _assignCartItem(RentalCartItem item) async {
    final owner = _snapshotOwner;
    final generation = _principalGeneration;
    if (owner == null || !owner.isCurrentEpoch || _assignmentSheet != null) {
      return;
    }
    final projects = _rentalCart.projects.toList(growable: false);
    final sheet = TrackedDialogRouteHandle<String>();
    _assignmentSheet = sheet;
    TrackedDialogRouteHandle<void>? notice;
    bool stillOwned() => mounted && generation == _principalGeneration;
    const unassigned = '__unassigned__';
    try {
      if (!await owner.isCurrent() || !stillOwned()) return;
      if (!mounted) return;
      final selected = await showTrackedModalBottomSheet<String>(
        context: context,
        handle: sheet,
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const ListTile(
                title: Text('Projekt zuordnen'),
                subtitle: Text('Die Zuordnung ändert keine Reservierung.'),
              ),
              ListTile(
                leading: const Icon(Icons.folder_off_outlined),
                title: const Text('Ohne Projekt'),
                trailing:
                    item.projectId == null ? const Icon(Icons.check) : null,
                onTap: () => sheet.dismiss(unassigned),
              ),
              for (final project in projects)
                ListTile(
                  leading: const Icon(Icons.folder_outlined),
                  title: Text(project.title),
                  trailing: item.projectId == project.id
                      ? const Icon(Icons.check)
                      : null,
                  onTap: () => sheet.dismiss(project.id),
                ),
            ],
          ),
        ),
      );
      if (selected == null || !stillOwned()) return;
      if (!await owner.isCurrent() || !stillOwned()) return;
      final projectId = selected == unassigned ? null : selected;
      final assigner = widget.projectAssigner;
      final cart = assigner == null
          ? await DataService.assignRentalCartItemToProject(
              itemId: item.id, projectId: projectId, expectedOwner: owner)
          : await assigner(item.id, projectId, owner);
      if (!await owner.isCurrent() || !stillOwned()) return;
      setState(() => _rentalCart = cart);
    } catch (error) {
      if (!stillOwned() || !await owner.isCurrent() || !stillOwned()) return;
      if (!mounted) return;
      notice = TrackedDialogRouteHandle<void>();
      _assignmentNotices.add(notice);
      await AppPopup.toast(
        context,
        icon: Icons.error_outline,
        title: 'Projektzuordnung konnte nicht bestätigt werden',
        message:
            'Bitte lade den Mietkorb erneut, bevor du die Zuordnung wiederholst.',
        routeHandle: notice,
      );
    } finally {
      if (identical(_assignmentSheet, sheet)) _assignmentSheet = null;
      if (notice != null) _assignmentNotices.remove(notice);
    }
  }

  Future<void> _openCartItem(RentalCartItem cartItem) async {
    if (_openingCartItem != null) return;
    final action = _beginCartAction();
    if (action == null) return;
    _openingCartItem = action;
    setState(() => _busyCartItemId = cartItem.id);
    try {
      if (!await action.isCurrent()) return;
      if (!mounted) return;
      if (action.owner.sessionOwner == null) {
        await action.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => const LoginScreen(returnTabIndex: 1),
            ));
        return;
      }
      final checked =
          await DataService.recheckRentalCart(expectedOwner: action.owner);
      if (!await action.isCurrent()) return;
      RentalCartItem? current;
      for (final entry in checked.items) {
        if (entry.id == cartItem.id) current = entry;
      }
      setState(() => _rentalCart = checked);
      if (!mounted) return;
      if (current == null || current.quoteStatus == 'unavailable') {
        await action.notice(context,
            icon: Icons.event_busy_outlined,
            title: current == null
                ? 'Artikel nicht mehr im Mietkorb'
                : 'Zeitraum derzeit nicht verfügbar',
            message: 'Bitte prüfe den aktuellen Mietkorb erneut.');
        return;
      }
      final item = await DataService.getItemByIdForSavedCart(current.listingId,
          expectedOwner: action.owner);
      if (!await action.isCurrent()) return;
      if (!mounted) return;
      if (item == null) {
        await action.notice(context,
            icon: Icons.inventory_2_outlined,
            title: 'Artikel derzeit nicht verfügbar');
        return;
      }
      await action.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => PrivatePilotCheckoutScreen(
              item: item,
              range: DateTimeRange(
                  start: current!.startDate, end: current.endDate),
            ),
          ));
      if (await action.isCurrent()) await _reload();
    } catch (error) {
      if (!mounted) return;
      await action.notice(context,
          icon: Icons.cloud_off_outlined,
          title: 'Serverprüfung konnte nicht bestätigt werden',
          message: 'Bitte lade den Mietkorb erneut.');
    } finally {
      // A late finally must not clear a newer B action's loading indicator.
      if (mounted && identical(_openingCartItem, action)) {
        setState(() {
          _openingCartItem = null;
          _busyCartItemId = null;
        });
      }
      _endCartAction(action);
    }
  }

  Future<void> _openBookingGroupCandidate(RentalCartGroupCandidate candidate) =>
      _openSavedDestination(
          () => BookingGroupTechnicalScreen(candidate: candidate));

  Future<void> _openPlanner() =>
      _openSavedDestination(() => const ClosedPilotPlannerScreen(),
          reload: true);

  Future<void> _openListingSetDiscovery(RentalCartItem item) =>
      _openSavedDestination(() => ClosedPilotListingSetDiscoveryScreen(
            listingId: item.listingId,
            listingTitle: (item.listing['title'] ?? 'Mietartikel').toString(),
            startDate: item.startDate,
            endDate: item.endDate,
          ));

  Future<void> _openSavedDestination(Widget Function() page,
      {bool reload = false}) async {
    final action = _beginCartAction();
    if (action == null) return;
    try {
      if (!await action.isCurrent()) return;
      if (!mounted) return;
      await action.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => action.owner.sessionOwner == null
                ? const LoginScreen(returnTabIndex: 1)
                : page(),
          ));
      if (reload && await action.isCurrent()) await _reload();
    } finally {
      _endCartAction(action);
    }
  }

  Future<void> _openWishlistFolder(String id, String title, bool system) async {
    final action = _beginCartAction();
    if (action == null) return;
    try {
      if (!await action.isCurrent()) return;
      if (!mounted) return;
      await action.push(
          context,
          _mosaicRoute(_WishlistFolderDetail(
            listId: id,
            title: title,
            system: system,
            owner: action.owner,
          )));
      if (await action.isCurrent()) await _reload();
    } finally {
      _endCartAction(action);
    }
  }

  Future<void> _addCustomList() async {
    final action = _beginCartAction();
    if (action == null) return;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    try {
      final name = await action.dialog<String>(
        context,
        icon: Icons.bookmark_add_outlined,
        title: 'Neue Merkliste',
        cardBackgroundColor: isDark ? null : AppTheme.surfacePrimary(context),
        body: (complete) => _CreateWishlistPopupBody(onComplete: complete),
      );
      if (name != null && name.isNotEmpty && await action.isCurrent()) {
        await DataService.addCustomWishlist(name, expectedOwner: action.owner);
        if (!await action.isCurrent()) return;
        await _reload();
      }
    } catch (error) {
      if (!await action.isCurrent()) return;
      setState(() {
        _loadErrorTitle =
            'Speichern der Merkliste konnte nicht bestätigt werden';
        _loadErrorMessage =
            'Bitte lade deine Merklisten erneut, bevor du sie noch einmal anlegst.';
      });
    } finally {
      _endCartAction(action);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final cs = Theme.of(context).colorScheme;
    final useUnifiedScroll = MediaQuery.sizeOf(context).width < 360 ||
        MediaQuery.textScalerOf(context).scale(1) > 1.3;
    final savedNotice = Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Semantics(
            container: true,
            label: l10n.t('saved.nonBindingSemantics'),
            child: ExcludeSemantics(
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.bookmark_border, size: 20, color: cs.primary),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          l10n.t('Gemerkt'),
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    l10n.t('saved.nonBindingNotice'),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: cs.onSurface.withValues(alpha: 0.55),
                          height: 1.5,
                        ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    final content = useUnifiedScroll
        ? ListView(
            children: [
              _buildRentalCartSection(context),
              savedNotice,
              _buildFolderGrid(context, embedded: true),
            ],
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildRentalCartSection(context),
              savedNotice,
              Expanded(child: _buildFolderGrid(context)),
            ],
          );
    final errorPanel = LocalStateErrorPanel(
      title: _loadErrorTitle ?? '',
      message: _loadErrorMessage ?? '',
      semanticLabel:
          '${_loadErrorTitle ?? ''}. Lokale Daten bleiben unverändert. Erneut laden.',
      onRetry: _reload,
      retrying: _loading,
    );
    final Widget body;
    if (_loading && !_hasLoadedSnapshot) {
      body = const Center(child: CircularProgressIndicator());
    } else if (!_hasLoadedSnapshot) {
      body = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 72, 16, 24),
        children: [errorPanel],
      );
    } else {
      body = Column(
        children: [
          if (_loadErrorTitle != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: errorPanel,
            ),
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          Expanded(child: content),
        ],
      );
    }
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back)),
        title: Text(l10n.t('Mietkorb')),
        centerTitle: true,
        actions: [
          IconButton(
            tooltip: 'Neue Merkliste',
            onPressed: _hasLoadedSnapshot ? _addCustomList : null,
            icon: const Icon(Icons.add),
          )
        ],
      ),
      body: body,
    );
  }
}

extension on _RentalCartScreenState {
  Widget _buildRentalCartSection(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final cart = _rentalCart;
    final groupCandidates = BookingGroupTechnicalConfig.available
        ? RentalCartGroupCandidate.fromCart(cart)
        : const <RentalCartGroupCandidate>[];
    final itemHeight =
        cart.items.isEmpty ? 72.0 : math.min(300.0, 96.0 * cart.items.length);
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.shopping_bag_outlined, color: cs.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Im Mietkorb – noch nicht reserviert',
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        'Verfügbarkeit und Preis werden vor jeder Anfrage neu geprüft.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: cs.onSurface.withValues(alpha: 0.62),
                            ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Verfügbarkeit und Preis neu prüfen',
                  onPressed: cart.items.isEmpty ? null : _recheckCart,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            if (cart.syncPending)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Kontosynchronisierung ausstehend – die lokale Kopie bleibt erhalten.',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: cs.error,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
            if (cart.projects.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final project in cart.projects)
                    Chip(
                      avatar: const Icon(Icons.folder_outlined, size: 16),
                      label: Text(project.title),
                      onDeleted: () => _removeProject(project.id),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            SizedBox(
              height: itemHeight,
              child: cart.items.isEmpty
                  ? Center(
                      child: Text(
                        'Noch keine Mietzeiträume vorbereitet.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: cs.onSurface.withValues(alpha: 0.58),
                            ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: cart.items.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = cart.items[index];
                        final title =
                            (item.listing['title'] ?? 'Mietartikel').toString();
                        RentalCartProject? project;
                        for (final entry in cart.projects) {
                          if (entry.id == item.projectId) {
                            project = entry;
                            break;
                          }
                        }
                        final status = switch (item.quoteStatus) {
                          'current' => 'Aktuell geprüft',
                          'changed' => 'Preis oder Verfügbarkeit geändert',
                          'unavailable' => 'Derzeit nicht verfügbar',
                          _ => cart.localDeviceOnly
                              ? 'Lokal vorbereitet – Serverprüfung nach Anmeldung'
                              : 'Serverprüfung erforderlich',
                        };
                        final quoteLabel = _informativeQuoteLabel(item);
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            item.quoteStatus == 'unavailable'
                                ? Icons.event_busy_outlined
                                : Icons.event_available_outlined,
                            color: item.quoteStatus == 'unavailable'
                                ? cs.error
                                : cs.primary,
                          ),
                          title: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '${_cartDate(item.startDate)} – ${_cartDate(item.endDate)}'
                            '${project == null ? '' : ' · ${project.title}'}'
                            '${quoteLabel == null ? '' : '\n$quoteLabel'}\n$status',
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          isThreeLine: true,
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Projekt zuordnen',
                                onPressed: () => _assignCartItem(item),
                                icon: const Icon(Icons.drive_file_move_outline),
                              ),
                              IconButton(
                                tooltip: 'Einzelmiete prüfen',
                                onPressed: _busyCartItemId == null
                                    ? () => _openCartItem(item)
                                    : null,
                                icon: _busyCartItemId == item.id
                                    ? const SizedBox.square(
                                        dimension: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.arrow_forward),
                              ),
                              IconButton(
                                tooltip: 'Aus Mietkorb entfernen',
                                onPressed: () => _removeCartItem(item.id),
                                icon: const Icon(Icons.close),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            if (groupCandidates.isNotEmpty) ...[
              const Divider(height: 20),
              Text(
                'Technische Mehrfachanfrage',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              const Text(
                'Nur für kompatible Artikel desselben Vermieters. Noch keine Reservierung, kein Vertrag und keine Zahlung.',
              ),
              for (final candidate in groupCandidates)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.inventory_2_outlined),
                  title: Text(
                    '${candidate.items.length} Artikel gemeinsam prüfen',
                  ),
                  subtitle: Text(
                    '${_cartDate(candidate.startDate)} – ${_cartDate(candidate.endDate)}',
                  ),
                  trailing: const Icon(Icons.arrow_forward),
                  onTap: () => _openBookingGroupCandidate(candidate),
                ),
            ],
            if (ListingSetsTechnicalConfig.available &&
                cart.items.isNotEmpty) ...[
              const Divider(height: 20),
              Text(
                'Passende SIT Sets',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              const Text(
                'Serverbestätigte Mehrartikel-Sets entdecken. Alle Artikel bleiben einzeln buchbar.',
              ),
              for (final item in cart.items)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.view_carousel_outlined),
                  title: Text(
                    (item.listing['title'] ?? 'Mietartikel').toString(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    '${_cartDate(item.startDate)} – ${_cartDate(item.endDate)}',
                  ),
                  trailing: const Icon(Icons.arrow_forward),
                  onTap: () => _openListingSetDiscovery(item),
                ),
            ],
            LayoutBuilder(
              builder: (context, constraints) {
                final compactActions = constraints.maxWidth < 360 ||
                    MediaQuery.textScalerOf(context).scale(1) > 1.3;
                final projectAction = TextButton.icon(
                  onPressed: _addProject,
                  icon: const Icon(Icons.create_new_folder_outlined, size: 18),
                  label: const Text('Projekt anlegen'),
                );
                final plannerAction = PlannerTechnicalConfig.available
                    ? TextButton.icon(
                        onPressed: _openPlanner,
                        icon: const Icon(Icons.auto_awesome_mosaic_outlined,
                            size: 18),
                        label: const Text('SIT Planer'),
                      )
                    : null;
                final syncAction = cart.localDeviceOnly && cart.items.isNotEmpty
                    ? TextButton(
                        onPressed: () => _openSavedDestination(
                            () => const LoginScreen(returnTabIndex: 1)),
                        child: const Text('Anmelden & synchronisieren'),
                      )
                    : null;
                if (compactActions) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (plannerAction != null) plannerAction,
                      projectAction,
                      if (syncAction != null) syncAction,
                    ],
                  );
                }
                return Row(
                  children: [
                    if (plannerAction != null) ...[
                      plannerAction,
                      const SizedBox(width: 4),
                    ],
                    projectAction,
                    const Spacer(),
                    if (syncAction != null) syncAction,
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  String _cartDate(DateTime date) =>
      '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';

  String? _informativeQuoteLabel(RentalCartItem item) {
    if (item.quoteStatus == 'unavailable') return null;
    final quoteEnvelope = item.quote;
    final quote = quoteEnvelope?['quote'];
    if (quote is! Map) return null;
    final totalMinor = (quote['totalMinor'] as num?)?.toInt();
    if (totalMinor == null || totalMinor < 0) return null;
    final currency = (quote['currency'] ?? 'EUR').toString();
    final amount = (totalMinor / 100).toStringAsFixed(2).replaceAll('.', ',');
    return 'Informative Preisangabe: $amount $currency';
  }

  Widget _buildFolderGrid(BuildContext context, {bool embedded = false}) {
    if (_lists.isEmpty) {
      return Center(
          child: Text(
              context
                  .watch<LocalizationController>()
                  .t('Noch keine Merklisten'),
              style: Theme.of(context).textTheme.titleMedium));
    }

    // Build data for mosaic cards
    final cards = _lists.map((wl) {
      final id = (wl['id'] ?? '').toString();
      // Make a mutable copy first, then sort. Sorting an unmodifiable/const list throws "Unsupported operation: sort".
      final items = List<Item>.from(_itemsByList[id] ?? const <Item>[])
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      final photos = <String>[
        for (int i = 0; i < (items.length < 4 ? items.length : 4); i++)
          ((items[i].photos.isNotEmpty) ? items[i].photos.first : '')
      ];
      return (
        id: id,
        title: (wl['name'] ?? '').toString(),
        subtitle: wl['system'] == true ? _systemSubtitle(id) : 'Eigene Liste',
        count: items.length,
        photos: photos,
        system: wl['system'] == true,
      );
    }).toList();

    final columnCount = _wishlistGridColumnCount(context);
    return GridView.builder(
      shrinkWrap: embedded,
      physics: embedded ? const NeverScrollableScrollPhysics() : null,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: cards.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columnCount,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        // Dynamically size height so the 1:1 image mosaic + text fits without overflow
        childAspectRatio:
            _mosaicChildAspectRatio(context, columnCount: columnCount),
      ),
      itemBuilder: (_, i) {
        final c = cards[i];
        return WishlistMosaicCard(
          id: c.id,
          title: c.title,
          subtitle: c.subtitle,
          count: c.count,
          photoUrls: c.photos,
          onTap: () => _openWishlistFolder(c.id, c.title, c.system),
        );
      },
    );
  }

  String _systemSubtitle(String id) {
    if (id == DataService.wlSoonId) {
      return 'Ich plane, diesen Artikel bald zu mieten';
    }
    if (id == DataService.wlLaterId) return 'Interessant, aber nicht jetzt';
    if (id == DataService.wlAgainId) return 'Diesen Artikel hatte ich schon';
    return '';
  }
}

Route<void> _mosaicRoute(Widget page) {
  return PageRouteBuilder<void>(
    transitionDuration: const Duration(milliseconds: 210),
    reverseTransitionDuration: const Duration(milliseconds: 180),
    pageBuilder: (context, animation, secondaryAnimation) => FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
      child: ScaleTransition(
        scale: Tween<double>(begin: 0.98, end: 1.0)
            .animate(CurvedAnimation(parent: animation, curve: Curves.easeOut)),
        child: page,
      ),
    ),
  );
}

class _WishlistFolderDetail extends StatefulWidget {
  final String listId;
  final String title;
  final bool system;
  final LocalPrincipalActionOwner owner;
  const _WishlistFolderDetail(
      {required this.listId,
      required this.title,
      required this.system,
      required this.owner});

  @override
  State<_WishlistFolderDetail> createState() => _WishlistFolderDetailState();
}

class _WishlistFolderDetailState extends State<_WishlistFolderDetail> {
  late final SavedCartActionScope _scope;
  Route<dynamic>? _folderRoute;
  VoidCallback? _releaseFolderRoute;
  final SharedPersistenceRefreshCoordinator _refreshCoordinator =
      SharedPersistenceRefreshCoordinator();
  StreamSubscription<String>? _savedStateSubscription;
  bool _loading = true;
  List<Item> _items = const [];
  bool _editMode = false;
  bool _hasLoadedSnapshot = false;
  bool _loadInFlight = false;
  String? _loadError;
  String? _title; // Null-safe to survive hot reload without initState re-run

  @override
  void initState() {
    super.initState();
    _scope = SavedCartActionScope(widget.owner, isMounted: () => mounted);
    _title = widget.title;
    _savedStateSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) {
        _scope.invalidate();
        if (mounted) {
          setState(() {
            _items = const [];
            _title = '';
            _hasLoadedSnapshot = false;
          });
          _scope.closeRoute(ModalRoute.of(context));
        }
        return;
      }
      if (key == SharedPersistenceSync.wishlistStateKey ||
          key == SharedPersistenceSync.savedItemsKey) {
        unawaited(_refreshCoordinator.schedule(_load));
      }
    });
    unawaited(_refreshCoordinator.schedule(_load));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != null && !identical(route, _folderRoute)) {
      _releaseFolderRoute?.call();
      _folderRoute = route;
      _releaseFolderRoute = _scope.trackRoute(route);
    }
  }

  @override
  void dispose() {
    _releaseFolderRoute?.call();
    _scope.dispose();
    _refreshCoordinator.dispose();
    _savedStateSubscription?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loadInFlight) return;
    _loadInFlight = true;
    setState(() => _loading = true);
    try {
      if (!await _scope.isCurrent()) return;
      final by =
          await DataService.getItemsByWishlist(expectedOwner: _scope.owner);
      if (!await _scope.isCurrent()) return;
      setState(() {
        _items = by[widget.listId] ?? const <Item>[];
        _hasLoadedSnapshot = true;
        _loadError = null;
        _loadInFlight = false;
        _loading = false;
      });
    } catch (error) {
      if (!await _scope.isCurrent()) return;
      setState(() {
        _loadError = 'Merkliste konnte nicht geladen werden';
        _loadInFlight = false;
        _loading = false;
      });
    } finally {
      _loadInFlight = false;
    }
  }

  String _headerSubline() {
    if (widget.listId == DataService.wlSoonId) {
      return 'Plane, was du bald mieten möchtest.';
    }
    if (widget.listId == DataService.wlLaterId) {
      return 'Sammle Ideen für spätere Mieten.';
    }
    if (widget.listId == DataService.wlAgainId) {
      return 'Artikel, die du erneut mieten möchtest.';
    }
    return 'Eigene Sammlung';
  }

  String _systemDetailSubline(String id) {
    if (id == DataService.wlSoonId) {
      return 'Speichere passende Artikel aus Entdecken,\num deine nächste Miete zu planen.';
    }
    if (id == DataService.wlLaterId) {
      return 'Sammle Ideen für spätere Mieten\nund finde sie hier wieder.';
    }
    if (id == DataService.wlAgainId) {
      return 'Merke dir Artikel, die du bereits\ngemietet hast und erneut mieten möchtest.';
    }
    return 'Speichere passende Artikel aus Entdecken.';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            onPressed: _closeFolder,
            icon: const Icon(Icons.arrow_back)),
        title: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_title ?? widget.title),
          Text(
            _headerSubline(),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: cs.onSurface.withValues(alpha: 0.5),
                  fontWeight: FontWeight.w400,
                ),
          ),
        ]),
        centerTitle: true,
        toolbarHeight: 64,
        actions: [
          if (_hasLoadedSnapshot && (!widget.system || _items.isNotEmpty))
            IconButton(
              icon: const Icon(Icons.more_vert),
              onPressed: () async {
                final items = <({
                  String value,
                  IconData icon,
                  String label,
                  Color color
                })>[];
                if (_items.isNotEmpty) {
                  items.add((
                    value: 'edit',
                    icon: _editMode
                        ? Icons.check_circle_outline
                        : Icons.edit_outlined,
                    label: _editMode ? 'Fertig' : 'Merkliste bearbeiten',
                    color:
                        isDark ? Colors.white : AppTheme.textSecondary(context)
                  ));
                }
                if (!widget.system) {
                  items.addAll([
                    (
                      value: 'rename',
                      icon: Icons.drive_file_rename_outline,
                      label: 'Name ändern',
                      color: isDark
                          ? Colors.white
                          : AppTheme.textSecondary(context)
                    ),
                    (
                      value: 'delete',
                      icon: Icons.delete_outline,
                      label: 'Merkliste löschen',
                      color: cs.error
                    ),
                  ]);
                }
                final choice = await _scope.dialog<String>(
                  context,
                  icon: Icons.folder_outlined,
                  title: 'Merkliste',
                  body: (complete) =>
                      Column(mainAxisSize: MainAxisSize.min, children: [
                    for (final item in items)
                      ListTile(
                        leading: Icon(item.icon, color: item.color),
                        title: Text(item.label),
                        onTap: () => complete(item.value),
                      )
                  ]),
                );
                if (!await _scope.isCurrent()) return;
                switch (choice) {
                  case 'rename':
                    await _renameWishlist();
                    break;
                  case 'edit':
                    setState(() => _editMode = !_editMode);
                    break;
                  case 'delete':
                    await _deleteWishlist();
                    break;
                }
              },
            ),
        ],
      ),
      body: _loading && !_hasLoadedSnapshot
          ? const Center(child: CircularProgressIndicator())
          : !_hasLoadedSnapshot
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 72, 16, 24),
                  children: [
                    LocalStateErrorPanel(
                      title:
                          _loadError ?? 'Merkliste konnte nicht geladen werden',
                      message:
                          'Die gespeicherten Artikel wurden nicht als leer behandelt. '
                          'Die lokale Kopie bleibt unverändert.',
                      semanticLabel:
                          'Merkliste konnte nicht geladen werden. Lokale Daten bleiben unverändert. Erneut laden.',
                      onRetry: _load,
                      retrying: _loading,
                    ),
                  ],
                )
              : Column(children: [
                  if (_loadError != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: LocalStateErrorPanel(
                        title: _loadError!,
                        message:
                            'Der letzte bestätigte Stand bleibt sichtbar und unverändert.',
                        semanticLabel:
                            '$_loadError. Letzter bestätigter Stand bleibt sichtbar. Erneut laden.',
                        onRetry: _load,
                        retrying: _loading,
                      ),
                    ),
                  if (_loading) const LinearProgressIndicator(minHeight: 2),
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: _load,
                      child: _items.isEmpty
                          ? ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              children: [
                                SizedBox(
                                    height: MediaQuery.of(context).size.height *
                                        0.2),
                                Center(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 32),
                                    child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(Icons.favorite_border_rounded,
                                              size: 48,
                                              color: isDark
                                                  ? cs.onSurface
                                                      .withValues(alpha: 0.18)
                                                  : cs.onSurface
                                                      .withValues(alpha: 0.26)),
                                          const SizedBox(height: 16),
                                          Text(
                                            'Noch keine Artikel gespeichert',
                                            textAlign: TextAlign.center,
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleMedium
                                                ?.copyWith(
                                                    color: cs.onSurface
                                                        .withValues(
                                                            alpha: 0.75),
                                                    fontWeight:
                                                        FontWeight.w600),
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            widget.system
                                                ? _systemDetailSubline(
                                                    widget.listId)
                                                : 'Speichere passende Artikel aus Entdecken.',
                                            textAlign: TextAlign.center,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall
                                                ?.copyWith(
                                                    color: cs.onSurface
                                                        .withValues(
                                                            alpha: isDark
                                                                ? 0.5
                                                                : 0.58),
                                                    height: 1.4),
                                          ),
                                          const SizedBox(height: 24),
                                          TextButton.icon(
                                            onPressed: _discoverItems,
                                            icon: const Icon(
                                                Icons.explore_outlined,
                                                size: 18),
                                            label:
                                                const Text('Artikel entdecken'),
                                            style: TextButton.styleFrom(
                                              foregroundColor: cs.primary,
                                              textStyle: Theme.of(context)
                                                  .textTheme
                                                  .labelLarge
                                                  ?.copyWith(
                                                      fontWeight:
                                                          FontWeight.w600),
                                            ),
                                          ),
                                        ]),
                                  ),
                                ),
                              ],
                            )
                          : Column(children: [
                              if (_editMode)
                                Container(
                                  width: double.infinity,
                                  margin:
                                      const EdgeInsets.fromLTRB(16, 10, 16, 0),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 10),
                                  decoration: BoxDecoration(
                                    color: isDark
                                        ? cs.surface.withValues(alpha: 0.08)
                                        : cs.primary.withValues(alpha: 0.08),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                        color:
                                            cs.primary.withValues(alpha: 0.18)),
                                  ),
                                  child: Row(children: [
                                    Icon(
                                      Icons.info_outline,
                                      size: 18,
                                      color:
                                          isDark ? Colors.white70 : cs.primary,
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Bearbeitungsmodus: Tippe auf das X, um Artikel zu entfernen.',
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelSmall
                                            ?.copyWith(
                                              color: isDark
                                                  ? Colors.white
                                                  : cs.onSurface,
                                            ),
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: () =>
                                          setState(() => _editMode = false),
                                      style: TextButton.styleFrom(
                                        foregroundColor:
                                            isDark ? Colors.white : cs.primary,
                                      ),
                                      child: const Text('Fertig'),
                                    ),
                                  ]),
                                ),
                              Expanded(
                                child: GridView.builder(
                                  padding:
                                      const EdgeInsets.fromLTRB(16, 12, 16, 24),
                                  gridDelegate:
                                      SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: 2,
                                    crossAxisSpacing: 12,
                                    mainAxisSpacing: 12,
                                    childAspectRatio:
                                        _wishlistDetailChildAspectRatio(
                                            context),
                                  ),
                                  itemCount: _items.length,
                                  itemBuilder: (_, i) {
                                    final item = _items[i];
                                    return Stack(children: [
                                      Positioned.fill(
                                          child: ItemCard(
                                              item: item,
                                              savedCartScope: _scope,
                                              longPressContext:
                                                  ListingOptionsContext
                                                      .wishlist,
                                              onContextActionCompleted: _load)),
                                      if (_editMode)
                                        Positioned(
                                          top: 8,
                                          right: 8,
                                          child: InkWell(
                                            onTap: () =>
                                                _removeSavedItem(item.id),
                                            borderRadius:
                                                BorderRadius.circular(16),
                                            child: Container(
                                              width: 28,
                                              height: 28,
                                              decoration: BoxDecoration(
                                                color: cs.error
                                                    .withValues(alpha: 0.90),
                                                shape: BoxShape.circle,
                                              ),
                                              child: const Icon(Icons.close,
                                                  size: 16,
                                                  color: Colors.white),
                                            ),
                                          ),
                                        ),
                                    ]);
                                  },
                                ),
                              ),
                            ]),
                    ),
                  ),
                ]),
    );
  }

  Future<void> _discoverItems() async {
    final route = ModalRoute.of(context);
    if (!await _scope.isCurrent()) return;
    if (!mounted) return;
    context.read<MainNavController>().setIndex(0);
    _scope.closeRoute(route);
  }

  Future<void> _closeFolder() async {
    final route = _folderRoute;
    if (await _scope.isCurrent()) _scope.closeRoute(route);
  }

  Future<void> _removeSavedItem(String id) async {
    try {
      if (!await _scope.isCurrent()) return;
      await DataService.removeItemFromWishlist(id, expectedOwner: _scope.owner);
      if (!await _scope.isCurrent()) return;
      await _load();
    } catch (error) {
      if (!await _scope.isCurrent()) return;
      setState(() => _loadError =
          'Entfernen konnte nicht bestätigt werden. Bitte erneut laden.');
    }
  }

  Future<void> _renameWishlist() async {
    if (!await _scope.isCurrent()) return;
    if (!mounted) return;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    try {
      final newName = await _scope.dialog<String>(
        context,
        icon: Icons.drive_file_rename_outline,
        title: 'Merkliste umbenennen',
        cardBackgroundColor: isDark ? null : AppTheme.surfacePrimary(context),
        body: (complete) => _RenameWishlistPopupBody(
            initialName: _title ?? widget.title, onComplete: complete),
      );
      if (newName == null ||
          newName.trim().isEmpty ||
          !await _scope.isCurrent()) {
        return;
      }
      await DataService.renameCustomWishlist(
          id: widget.listId,
          newName: newName.trim(),
          expectedOwner: _scope.owner);
      if (!await _scope.isCurrent()) return;
      setState(() => _title = newName.trim());
    } catch (error) {
      if (!await _scope.isCurrent()) return;
      setState(() => _loadError =
          'Umbenennen konnte nicht bestätigt werden. Bitte erneut laden.');
    }
  }

  Future<void> _deleteWishlist() async {
    final route = ModalRoute.of(context);
    if (!await _scope.isCurrent()) return;
    if (!mounted) return;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    try {
      final confirmed = await _scope.dialog<bool>(
        context,
        icon: Icons.delete_outline,
        title: 'Merkliste löschen',
        cardBackgroundColor: isDark ? null : AppTheme.surfacePrimary(context),
        body: (complete) => _ConfirmDeleteWishlistBody(
            name: _title ?? widget.title, onComplete: complete),
      );
      if (confirmed != true || !await _scope.isCurrent()) return;
      await DataService.deleteCustomWishlist(widget.listId,
          expectedOwner: _scope.owner);
      if (!await _scope.isCurrent()) return;
      _scope.closeRoute(route);
    } catch (error) {
      if (!await _scope.isCurrent()) return;
      setState(() => _loadError =
          'Löschen konnte nicht bestätigt werden. Bitte erneut laden.');
    }
  }
}

// Compute a childAspectRatio that gives enough vertical room for
// 1:1 mosaic image + text block without causing pixel overflow,
// while staying visually balanced on various widths and text scales.
int _wishlistGridColumnCount(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  final textScale = MediaQuery.textScalerOf(context).scale(1);
  return size.width < 360 || textScale >= 1.6 ? 1 : 2;
}

double _mosaicChildAspectRatio(
  BuildContext context, {
  required int columnCount,
}) {
  final size = MediaQuery.sizeOf(context);
  final textScaler = MediaQuery.textScalerOf(context);

  // Grid paddings and spacing must match GridView.builder settings above
  const horizontalPadding = 32.0; // 16 + 16
  const crossSpacing = 12.0;

  // Column width per card
  final totalSpacing = crossSpacing * (columnCount - 1);
  final colWidth =
      (size.width - horizontalPadding - totalSpacing) / columnCount;

  // Estimate height from actual card layout: mosaic (fixed aspect) + padded text block.
  // This keeps the card frame ending right below the count text without dead space.
  final theme = Theme.of(context).textTheme;
  final titleFs = textScaler.scale(theme.titleSmall?.fontSize ?? 16);
  final labelFs = textScaler.scale(theme.labelSmall?.fontSize ?? 12);
  final titleLines = textScaler.scale(1) >= 1.6 ? 2 : 1;
  final titleHeight = titleFs * (theme.titleSmall?.height ?? 1.2) * titleLines;
  final labelHeight = labelFs * (theme.labelSmall?.height ?? 1.2);

  const mosaicAspect = 1.18; // width / height used in card
  final mosaicHeight = colWidth / mosaicAspect;
  final textBlockHeight =
      6 + titleHeight + 2 + labelHeight + 18; // padding, gaps and font metrics

  final totalHeight = mosaicHeight + textBlockHeight;
  final ratio = colWidth / totalHeight;
  // Keep within a safe band to avoid overflow on small screens or large text scales
  final maxRatio = columnCount == 1 ? 0.96 : 0.9;
  return math.min(maxRatio, math.max(0.62, ratio));
}

// Keep wishlist detail item cards a bit tighter than the generic grid,
// while still leaving enough room for two title lines on smaller phones.
double _wishlistDetailChildAspectRatio(BuildContext context) {
  final textScale = MediaQuery.textScalerOf(context).scale(14) / 14;
  final base = ItemCard.recommendedGridChildAspectRatio(context);
  final extra = textScale > 1.1 ? 0.06 : 0.10;
  return (base + extra).clamp(0.82, 1.0);
}

class _CreateWishlistPopupBody extends StatefulWidget {
  const _CreateWishlistPopupBody({this.onComplete});

  final void Function(String?)? onComplete;

  @override
  State<_CreateWishlistPopupBody> createState() =>
      _CreateWishlistPopupBodyState();
}

class _CreateWishlistPopupBodyState extends State<_CreateWishlistPopupBody> {
  final TextEditingController _controller = TextEditingController();

  void _complete([String? result]) {
    final complete = widget.onComplete;
    if (complete != null) {
      complete(result);
    } else {
      Navigator.of(context).maybePop(result);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final inputBg = isDark
        ? Colors.white.withValues(alpha: 0.06)
        : AppTheme.surfaceSecondary(context);
    final inputBorder = OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
            color: isDark
                ? Colors.white.withValues(alpha: 0.10)
                : cs.onSurface.withValues(alpha: 0.10)));
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(
                'Ordne Artikel nach Anlass, Projekt oder Zeitraum.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.6)
                        : AppTheme.textSecondary(context)),
                textAlign: TextAlign.center,
              ),
            ),
            TextField(
              controller: _controller,
              autofocus: true,
              textInputAction: TextInputAction.done,
              onSubmitted: (value) => _complete(_controller.text.trim()),
              style: TextStyle(
                  color: isDark ? Colors.white : AppTheme.textPrimary(context),
                  fontSize: 15),
              cursorColor: cs.primary,
              decoration: InputDecoration(
                hintText: 'z. B. Umzug, Werkzeug, Gartenparty',
                hintStyle: TextStyle(
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.4)
                        : AppTheme.textDisabled(context),
                    fontSize: 14),
                filled: true,
                fillColor: inputBg,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: inputBorder,
                enabledBorder: inputBorder,
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(
                        color: cs.primary.withValues(alpha: 0.35), width: 1)),
              ),
            ),
            const SizedBox(height: 20),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _complete,
                  style: OutlinedButton.styleFrom(
                      foregroundColor: isDark
                          ? Colors.white.withValues(alpha: 0.7)
                          : AppTheme.textPrimary(context),
                      side: BorderSide(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.15)
                              : cs.onSurface.withValues(alpha: 0.12)),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                      padding: const EdgeInsets.symmetric(vertical: 14)),
                  child: const Text('Abbrechen'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () => _complete(_controller.text.trim()),
                  style: FilledButton.styleFrom(
                      backgroundColor: cs.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                      padding: const EdgeInsets.symmetric(vertical: 14)),
                  child: const Text('Erstellen'),
                ),
              ),
            ]),
          ]),
    );
  }
}

class _RenameWishlistPopupBody extends StatefulWidget {
  final String initialName;
  final ValueChanged<String?> onComplete;
  const _RenameWishlistPopupBody(
      {required this.initialName, required this.onComplete});

  @override
  State<_RenameWishlistPopupBody> createState() =>
      _RenameWishlistPopupBodyState();
}

class _RenameWishlistPopupBodyState extends State<_RenameWishlistPopupBody> {
  late final TextEditingController controller =
      TextEditingController(text: widget.initialName);

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final inputBg = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : AppTheme.surfaceSecondary(context);
    final inputBorder = OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
            color: isDark
                ? Colors.white.withValues(alpha: 0.12)
                : cs.onSurface.withValues(alpha: 0.10)));
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              style: TextStyle(
                  color: isDark ? Colors.white : AppTheme.textPrimary(context)),
              cursorColor: cs.primary,
              decoration: InputDecoration(
                hintText: 'Neuer Name',
                hintStyle: TextStyle(
                    color: isDark
                        ? Colors.white70
                        : AppTheme.textDisabled(context)),
                filled: true,
                fillColor: inputBg,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                border: inputBorder,
                enabledBorder: inputBorder,
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: cs.primary, width: 1.2)),
              ),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => widget.onComplete(null),
                  style: OutlinedButton.styleFrom(
                      foregroundColor: isDark
                          ? Colors.white70
                          : AppTheme.textPrimary(context),
                      side: BorderSide(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.20)
                              : cs.onSurface.withValues(alpha: 0.12)),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12))),
                  child: const Text('Abbrechen'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: () => widget.onComplete(controller.text.trim()),
                  style: FilledButton.styleFrom(
                      backgroundColor: cs.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12))),
                  child: const Text('Umbenennen'),
                ),
              ),
            ]),
          ]),
    );
  }
}

class _ConfirmDeleteWishlistBody extends StatelessWidget {
  final String name;
  final ValueChanged<bool?> onComplete;
  const _ConfirmDeleteWishlistBody(
      {required this.name, required this.onComplete});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
                'Möchtest du "$name" wirklich löschen?\nAlle Artikel-Zuordnungen werden entfernt.',
                style: TextStyle(
                    color: isDark
                        ? Colors.white70
                        : AppTheme.textSecondary(context))),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => onComplete(false),
                  style: OutlinedButton.styleFrom(
                      foregroundColor: isDark
                          ? Colors.white70
                          : AppTheme.textPrimary(context),
                      side: BorderSide(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.20)
                              : cs.onSurface.withValues(alpha: 0.12)),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12))),
                  child: const Text('Abbrechen'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: () => onComplete(true),
                  style: FilledButton.styleFrom(
                      backgroundColor: cs.error,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12))),
                  child: const Text('Löschen'),
                ),
              ),
            ]),
          ]),
    );
  }
}
