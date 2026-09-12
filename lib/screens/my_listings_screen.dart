import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/config/listing_sets_technical_config.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/screens/closed_pilot_listing_sets_screen.dart';
import 'package:lendify/widgets/item_details_overlay.dart';

import 'package:provider/provider.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/listing_mutation_interaction.dart';

class MyListingsScreen extends StatefulWidget {
  final int initialTabIndex;
  final ListingMutationService listingMutationService;
  const MyListingsScreen({
    super.key,
    this.initialTabIndex = 0,
    this.listingMutationService = const ListingMutationService(),
  });
  @override
  State<MyListingsScreen> createState() => _MyListingsScreenState();
}

class _MyListingsScreenState extends State<MyListingsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Item> _items = [];
  bool _canCreateListings = false;
  bool _loading = true;
  bool _actionBusy = false;
  String? _loadError;
  String? _currentUserId;
  StreamSubscription<String>? _persistenceSubscription;
  final SharedPersistenceRefreshCoordinator _refreshCoordinator =
      SharedPersistenceRefreshCoordinator();
  final _listingActions = ListingMutationInteractionController();
  int _loadRevision = 0;

  ListingMutationService get _listingMutationService =>
      widget.listingMutationService;

  @override
  void initState() {
    super.initState();
    final init = widget.initialTabIndex.clamp(0, 1);
    _tabController = TabController(length: 2, vsync: this, initialIndex: init);
    _persistenceSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) {
        _loadRevision += 1;
        _listingActions.invalidate();
        if (mounted) {
          setState(() {
            _loading = true;
            _actionBusy = false;
          });
        }
        unawaited(_refreshCoordinator.schedule(_load));
        return;
      }
      if (key != SharedPersistenceSync.listingCatalogKey) return;
      _refreshCoordinator.schedule(() async {
        await SharedPersistenceSync.reloadPreferences();
        await _load();
      });
    });
    _load();
  }

  @override
  void dispose() {
    _persistenceSubscription?.cancel();
    _refreshCoordinator.dispose();
    _listingActions.dispose();
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    if (mounted) {
      setState(() {
        _loading = true;
        _loadError = null;
        _currentUserId = null;
        _canCreateListings = false;
        _items = const <Item>[];
      });
    }
    try {
      final listingContext = await _listingMutationService.loadCurrentContext();
      final user = listingContext?.user;
      final expectedUserId = user?.id.trim() ?? '';
      if (expectedUserId.isEmpty) {
        throw StateError('Für deine Anzeigen ist eine Anmeldung erforderlich.');
      }
      final all = await DataService.getItems();
      if (listingContext == null ||
          !await _listingMutationService.isContextCurrent(listingContext)) {
        throw StateError('Das angemeldete Konto hat sich geändert.');
      }
      if (!mounted || revision != _loadRevision) return;
      _listingActions.replaceContext(listingContext);
      setState(() {
        _currentUserId = expectedUserId;
        _canCreateListings = !user!.isBanned;
        _items = all.where((item) => item.ownerId == expectedUserId).toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        _loading = false;
      });
    } catch (_) {
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _currentUserId = null;
        _canCreateListings = false;
        _items = const <Item>[];
        _loading = false;
        _loadError = 'Deine Anzeigen konnten nicht sicher geladen werden.';
      });
    }
  }

  Future<void> _startCreateListing() async {
    if (!_canCreateListings) return;
    final owner = _listingActions.capture();
    if (owner == null) return;
    final created = await _listingActions.pushOwnedRoute<Item?>(
      context: context,
      owner: owner,
      route: MaterialPageRoute(
        builder: (_) => CreateListingScreen(
          listingMutationService: _listingMutationService,
        ),
      ),
    );
    if (!mounted ||
        !await _listingActions.isCurrent(_listingMutationService, owner)) {
      return;
    }
    if (created != null) {
      if (!await _reloadForOwner(owner) || !mounted) return;
      await _showOwnedMessage(
        owner,
        title: 'Anzeige erstellt',
        message: created.title,
      );
    }
  }

  Future<void> _openListingSets() async {
    final owner = _listingActions.capture();
    if (owner == null) return;
    await _listingActions.pushOwnedRoute<void>(
      context: context,
      owner: owner,
      route: MaterialPageRoute<void>(
        builder: (_) => ClosedPilotListingSetsScreen(
          initialContext: owner.context,
          ownerListings: List<Item>.unmodifiable(_items),
          listingMutationService: _listingMutationService,
        ),
      ),
    );
  }

  // All listed items except drafts
  List<Item> _listedItems(List<Item> src) =>
      src.where((e) => e.status != 'draft').toList();
  List<Item> _draftItems(List<Item> src) =>
      src.where((e) => e.status == 'draft').toList();

  Future<bool> _reloadForOwner(ListingMutationActionOwner owner) async {
    try {
      final all = await DataService.getItems();
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return false;
      }
      if (!mounted) return false;
      final expectedUserId = owner.context.user.id;
      setState(() {
        _items = all.where((item) => item.ownerId == expectedUserId).toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        _loadError = null;
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _runOwnerMutation(
    ListingMutationCommand command, {
    String? successTitle,
  }) async {
    if (_actionBusy || _currentUserId == null) return false;
    final owner = _listingActions.capture();
    if (owner == null || command.item.ownerId != _currentUserId) return false;
    setState(() => _actionBusy = true);
    try {
      await _listingMutationService.execute(
        context: owner.context,
        command: command,
      );
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return false;
      }
      if (!await _reloadForOwner(owner)) {
        throw StateError('Die Anzeige konnte nicht sicher neu geladen werden.');
      }
      if (successTitle != null &&
          await _listingActions.isCurrent(_listingMutationService, owner)) {
        await _showOwnedMessage(
          owner,
          title: successTitle,
          message: 'Der Anzeigenstand wurde aktualisiert.',
        );
      }
      return true;
    } on ListingMutationFailure catch (failure) {
      if (failure.kind == ListingMutationFailureKind.principalChanged ||
          !await _listingActions.isCurrent(_listingMutationService, owner)) {
        return false;
      }
      await _reloadForOwner(owner);
      if (mounted &&
          await _listingActions.isCurrent(_listingMutationService, owner)) {
        await _showListingMutationFailure(owner, failure);
      }
      return false;
    } catch (_) {
      if (await _listingActions.isCurrent(_listingMutationService, owner)) {
        await _showOwnedMessage(
          owner,
          title: 'Lokaler Stand nicht verfügbar',
          message: 'Lade deine Anzeigen neu, bevor du die Aktion wiederholst.',
        );
      }
      return false;
    } finally {
      if (mounted && _listingActions.isSynchronouslyCurrent(owner)) {
        setState(() => _actionBusy = false);
      }
    }
  }

  Future<bool> _changeStatus(
    Item it,
    String status, {
    String? successTitle,
  }) =>
      _runOwnerMutation(
        ListingMutationCommand.updateStatus(it, status),
        successTitle: successTitle,
      );

  Future<bool> _deleteListing(Item item) => _runOwnerMutation(
        ListingMutationCommand.delete(item),
        successTitle: 'Entwurf gelöscht',
      );

  Future<void> _editDraft(Item item) async {
    final owner = _listingActions.capture();
    if (owner == null || owner.context.user.id != item.ownerId) return;
    final result = await _listingActions.pushOwnedRoute<Object?>(
      context: context,
      owner: owner,
      route: MaterialPageRoute<Object?>(
        builder: (_) => CreateListingScreen(
          existing: item,
          listingMutationService: _listingMutationService,
        ),
      ),
    );
    if (!mounted ||
        !await _listingActions.isCurrent(_listingMutationService, owner) ||
        !await _reloadForOwner(owner) ||
        !mounted) {
      return;
    }
    if (result == 'drafts') {
      _tabController.animateTo(1);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_listingActions.isSynchronouslyCurrent(owner)) return;
        unawaited(_showOwnedMessage(
          owner,
          title: 'Änderungen wurden gespeichert',
          message: 'Der Entwurf wurde aktualisiert.',
        ));
      });
    }
  }

  Future<void> _openOwnerPreview(Item item) async {
    final owner = _listingActions.capture();
    if (owner == null || owner.context.user.id != item.ownerId) return;
    await _listingActions.pushOwnedRoute<void>(
      context: context,
      owner: owner,
      route: MaterialPageRoute<void>(
        builder: (_) => OwnerListingDetailsScreen(
          item: item,
          overrideAppBarTitle: item.status == 'draft'
              ? 'Für Später gespeichert'
              : 'Meine Anzeigen (Vorschau)',
        ),
      ),
    );
  }

  Future<void> _showListingActions(Item item) async {
    if (_actionBusy) return;
    final owner = _listingActions.capture();
    if (owner == null || owner.context.user.id != item.ownerId) return;
    final actions = item.status == 'draft'
        ? const <(String, String)>[
            ('publish', 'Veröffentlichen'),
            ('edit', 'Bearbeiten'),
            ('delete', 'Löschen'),
          ]
        : <(String, String)>[
            if (item.status != 'active') ('active', 'Aktivieren'),
            if (item.status != 'paused') ('paused', 'Pausieren'),
            if (item.status != 'ended') ('ended', 'Beenden'),
          ];
    final selected = await _listingActions.showOwnedDialog<String>(
      context: context,
      owner: owner,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('Status ändern'),
        children: [
          for (final action in actions)
            SimpleDialogOption(
              onPressed: () => Navigator.of(dialogContext).pop(action.$1),
              child: Text(action.$2),
            ),
        ],
      ),
    );
    if (selected == null ||
        !await _listingActions.isCurrent(_listingMutationService, owner)) {
      return;
    }
    switch (selected) {
      case 'publish':
        await _changeStatus(
          item,
          'active',
          successTitle: 'Anzeige veröffentlicht',
        );
        break;
      case 'edit':
        await _editDraft(item);
        break;
      case 'delete':
        await _deleteListing(item);
        break;
      default:
        await _changeStatus(item, selected);
    }
  }

  Future<void> _showListingMutationFailure(
    ListingMutationActionOwner owner,
    ListingMutationFailure failure,
  ) =>
      _showOwnedMessage(
        owner,
        title: failure.remoteAccepted
            ? 'Serverseitig verarbeitet'
            : failure.kind == ListingMutationFailureKind.outcomeUnknown
                ? 'Änderungsstatus unklar'
                : 'Änderung abgelehnt',
        message: failure.remoteAccepted
            ? 'Der Server hat die Änderung bestätigt, aber der lokale Anzeigenstand konnte noch nicht sicher aktualisiert werden. Bitte neu laden.'
            : failure.kind == ListingMutationFailureKind.outcomeUnknown
                ? 'Die Änderung könnte serverseitig verarbeitet worden sein. Bitte neu laden und den Status prüfen, bevor du sie wiederholst.'
                : 'Der Server hat die Änderung eindeutig abgelehnt.',
      );

  Future<void> _showOwnedMessage(
    ListingMutationActionOwner owner, {
    required String title,
    required String message,
  }) =>
      _listingActions.showOwnedDialog<void>(
        context: context,
        owner: owner,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );

  Widget _buildBody(LocalizationController l10n) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadError != null) {
      return _MyListingsLoadFailure(
        message: _loadError!,
        onRetry: _load,
      );
    }
    return TabBarView(
      controller: _tabController,
      children: [
        _buildItemsGrid(_listedItems(_items), l10n,
            emptyKind: _EmptyKind.listed),
        _buildItemsGrid(_draftItems(_items), l10n,
            emptyKind: _EmptyKind.savedForLater),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final tabsStyle = Theme.of(context).textTheme.bodySmall;
    final showLabel = MediaQuery.of(context).size.width >= 420;
    final tooltipText = _canCreateListings
        ? l10n.t('Neue Anzeige erstellen')
        : l10n.t('Nicht verfügbar');
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back)),
        title: Text(l10n.t('Meine Anzeigen')),
        centerTitle: true,
        actions: [
          if (ListingSetsTechnicalConfig.available)
            IconButton(
              tooltip: 'SIT Artikel-Sets',
              onPressed: _currentUserId == null || _actionBusy
                  ? null
                  : _openListingSets,
              icon: const Icon(Icons.view_carousel_outlined),
            ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Tooltip(
              message: tooltipText,
              waitDuration: const Duration(milliseconds: 400),
              child: FilledButton(
                onPressed: _canCreateListings ? _startCreateListing : null,
                style: FilledButton.styleFrom(
                  shape: const StadiumBorder(),
                  padding:
                      EdgeInsets.symmetric(horizontal: showLabel ? 16 : 12),
                ),
                child: showLabel
                    ? Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.add, size: 18),
                        const SizedBox(width: 8),
                        Text(l10n.t('Neue Anzeige erstellen')),
                      ])
                    : const Icon(Icons.add, size: 20),
              ),
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.center,
          labelPadding: const EdgeInsets.symmetric(horizontal: 10),
          labelColor: Theme.of(context).colorScheme.primary,
          unselectedLabelColor: AppTheme.textSecondary(context),
          labelStyle: tabsStyle,
          unselectedLabelStyle: tabsStyle,
          indicatorColor: Theme.of(context).colorScheme.primary,
          tabs: [
            Tab(text: l10n.t('Meine Anzeigen')),
            Tab(text: l10n.t('für später gespeichert')),
          ],
        ),
      ),
      body: _buildBody(l10n),
    );
  }

  Widget _buildItemsGrid(List<Item> visible, LocalizationController l10n,
      {required _EmptyKind emptyKind}) {
    final compact = MediaQuery.sizeOf(context).width < 360;
    return visible.isEmpty
        ? _MyListingsEmptyState(
            kind: emptyKind,
            onTapCreate: _startCreateListing,
            canCreate: _canCreateListings)
        : GridView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: compact ? 0.78 : 1.02),
            itemCount: visible.length,
            itemBuilder: (_, i) {
              final it = visible[i];
              String statusLabel = switch (it.status) {
                'active' => 'Aktiv',
                'paused' => 'Pausiert',
                'ended' => 'Beendet',
                'draft' => 'Entwurf',
                _ => 'Aktiv'
              };
              Color chipColor = switch (it.status) {
                'active' => const Color(0x3322C55E),
                'paused' => const Color(0x33F59E0B),
                'ended' => const Color(0x33F43F5E),
                'draft' => AppTheme.textSecondary(context),
                _ => AppTheme.textSecondary(context)
              };
              return InkWell(
                onTap: () => _openOwnerPreview(it),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  decoration: BoxDecoration(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.black.withValues(alpha: 0.30)
                          : AppTheme.surfacePrimary(context),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.glassStroke(context)),
                      boxShadow: AppTheme.cardShadow(context)),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                            borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(12)),
                            child: AspectRatio(
                                aspectRatio: 16 / 9,
                                child: AppImage(
                                    url: it.photos.isNotEmpty
                                        ? it.photos.first
                                        : '',
                                    fit: BoxFit.cover))),
                        Padding(
                          padding: const EdgeInsets.all(6),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(it.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(
                                            color:
                                                AppTheme.textPrimary(context),
                                            fontWeight: FontWeight.w700)),
                                const SizedBox(height: 2),
                                Row(children: [
                                  Text('${it.pricePerDay.toStringAsFixed(0)} €',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                              color: AppTheme.textPrimary(
                                                  context))),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                      l10n.t('pro Tag'),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelSmall
                                          ?.copyWith(
                                              color: AppTheme.textSecondary(
                                                  context)),
                                    ),
                                  ),
                                ]),
                                const SizedBox(height: 4),
                                Row(children: [
                                  Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                          color: chipColor,
                                          borderRadius:
                                              BorderRadius.circular(8)),
                                      child: Text(statusLabel,
                                          style: Theme.of(context)
                                              .textTheme
                                              .labelSmall
                                              ?.copyWith(
                                                  color: AppTheme.textPrimary(
                                                      context)))),
                                  const Spacer(),
                                  IconButton(
                                    tooltip: 'Status ändern',
                                    style: IconButton.styleFrom(
                                      minimumSize: const Size.square(32),
                                      padding: EdgeInsets.zero,
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                    onPressed: _actionBusy
                                        ? null
                                        : () => _showListingActions(it),
                                    icon: Icon(Icons.more_horiz,
                                        color: AppTheme.textSecondary(context)),
                                  )
                                ])
                              ]),
                        )
                      ]),
                ),
              );
            },
          );
  }
}

class _MyListingsLoadFailure extends StatelessWidget {
  final String message;
  final Future<void> Function() onRetry;

  const _MyListingsLoadFailure({
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Semantics(
          label: '$message Lokale Daten bleiben unverändert. Erneut laden.',
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 48,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 12),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              const Text(
                'Lokale Daten bleiben unverändert.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Erneut laden'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _EmptyKind { listed, savedForLater }

class _MyListingsEmptyState extends StatelessWidget {
  final _EmptyKind kind;
  final VoidCallback onTapCreate;
  final bool canCreate;
  const _MyListingsEmptyState(
      {required this.kind, required this.onTapCreate, required this.canCreate});

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final cs = Theme.of(context).colorScheme;

    // Use the same "Neue Anzeige" icon for both empty states, and make it tappable
    // to jump directly into the create-listing flow.
    final (String title, String hint) = switch (kind) {
      _EmptyKind.listed => (
          l10n.t('Du hast noch keine Anzeige.'),
          l10n.t('Tippe auf das Icon, um eine neue Anzeige zu erstellen.')
        ),
      _EmptyKind.savedForLater => (
          l10n.t('Du hast noch keine Anzeige für später gespeichert.'),
          l10n.t('Tippe auf das Icon, um eine neue Anzeige zu erstellen.')
        ),
    };

    final iconWidget = InkWell(
      onTap: canCreate ? onTapCreate : null,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Icon(Icons.add_business,
            size: 64, color: cs.primary.withValues(alpha: 0.85)),
      ),
    );

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconWidget,
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(color: AppTheme.textPrimary(context), height: 1.4),
            ),
            const SizedBox(height: 8),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppTheme.textSecondary(context), height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}
