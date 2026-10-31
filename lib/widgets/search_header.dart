import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/box_chat_icon.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';

class SearchHeader extends StatefulWidget {
  final VoidCallback onFiltersPressed;
  final VoidCallback onSearchTap;
  final Future<void> Function(Item created)? onListingCreated;
  final Future<Item?> Function()? onCreateListing;

  const SearchHeader(
      {super.key,
      required this.onFiltersPressed,
      required this.onSearchTap,
      this.onListingCreated,
      this.onCreateListing});

  @override
  State<SearchHeader> createState() => _SearchHeaderState();
}

class _SearchHeaderState extends State<SearchHeader>
    with WidgetsBindingObserver {
  StreamSubscription<String>? _syncSubscription;
  Future<void>? _loadFuture;
  var _refreshQueued = false;
  var _generation = 0;
  var _hasNew = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _syncSubscription =
        SharedPersistenceSync.changes.listen(_onPersistenceChange);
    _scheduleRefresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _scheduleRefresh();
  }

  void _onPersistenceChange(String key) {
    if (!mounted) return;
    if (key != SharedPersistenceSync.rentalRequestsKey &&
        key != SharedPersistenceSync.accountSecurityStateKey) {
      return;
    }
    _generation++;
    if (key == SharedPersistenceSync.accountSecurityStateKey && _hasNew) {
      setState(() => _hasNew = false);
    }
    _scheduleRefresh();
  }

  void _scheduleRefresh() {
    if (!mounted) return;
    if (_loadFuture != null) {
      _refreshQueued = true;
      return;
    }
    final future = _drainRefreshes();
    _loadFuture = future;
    unawaited(future.whenComplete(() {
      if (!identical(_loadFuture, future)) return;
      _loadFuture = null;
      if (mounted && _refreshQueued) _scheduleRefresh();
    }));
  }

  Future<void> _drainRefreshes() async {
    do {
      _refreshQueued = false;
      final generation = ++_generation;
      await _loadBadge(generation);
    } while (mounted && _refreshQueued);
  }

  Future<void> _loadBadge(int generation) async {
    LocalPrincipalActionOwner? capturedOwner;
    try {
      capturedOwner = await LocalPrincipalActionOwner.capture();
      await capturedOwner.assertCurrent();
      final user = await DataService.getCurrentUser();
      if (!mounted || generation != _generation) return;
      if (user == null) {
        setState(() => _hasNew = false);
        return;
      }
      final sessionOwner = capturedOwner.sessionOwner;
      if (sessionOwner == null || sessionOwner.userId != user.id) {
        setState(() => _hasNew = false);
        return;
      }
      await capturedOwner.assertCurrent();
      final pending = await DataService.getRentalRequestsForOwner(
        user.id,
        status: 'pending',
      );
      await capturedOwner.assertCurrent();
      if (!mounted || generation != _generation) return;
      setState(() => _hasNew = pending.isNotEmpty);
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() => _hasNew = false);
      if (capturedOwner != null && !await capturedOwner.isCurrent()) {
        _generation++;
        _scheduleRefresh();
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_syncSubscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bodyText = AppTheme.textBody(context);
    final secondaryText = AppTheme.textSecondary(context);
    final l10n = context.watch<LocalizationController>();

    Widget buildCreateButton(double size) => Semantics(
          button: true,
          label: l10n.t('Neue Anzeige erstellen'),
          excludeSemantics: true,
          child: InkWell(
            onTap: () async {
              if (widget.onCreateListing != null) {
                final created = await widget.onCreateListing!();
                if (created != null && widget.onListingCreated != null) {
                  await widget.onListingCreated!(created);
                }
                return;
              }
              final u = await DataService.getCurrentUser();
              if (!context.mounted) return;
              if (u == null) {
                await showGuestRestrictionSheet(context,
                    gateContext: GuestGateContext.listing);
                return;
              }
              final created = await Navigator.of(context).push<Item?>(
                  MaterialPageRoute(
                      builder: (_) => const CreateListingScreen()));
              if (created != null && widget.onListingCreated != null) {
                await widget.onListingCreated!(created);
              }
            },
            borderRadius: BorderRadius.circular(size / 2),
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                color: isDark
                    ? AppTheme.surfaceSecondary(context)
                    : AppTheme.surfacePrimary(context),
                borderRadius: BorderRadius.circular(size / 2),
                boxShadow: [
                  ...AppTheme.cardShadow(context),
                ],
                border: Border.all(
                    color: AppTheme.searchBorder(context), width: 1.5),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.add_business,
                  size: 22, color: BrandColors.primary),
            ),
          ),
        );

    Widget buildSearchField() => Semantics(
          button: true,
          label: l10n.t('Jetzt suchen'),
          excludeSemantics: true,
          child: InkWell(
            onTap: widget.onSearchTap,
            borderRadius: BorderRadius.circular(28),
            child: Container(
              height: 52,
              decoration: BoxDecoration(
                color: isDark
                    ? AppTheme.surfaceSecondary(context)
                    : AppTheme.surfacePrimary(context),
                borderRadius: BorderRadius.circular(28),
                boxShadow: [
                  ...AppTheme.cardShadow(context),
                ],
                border: Border.all(
                    color: AppTheme.searchBorder(context), width: 1.5),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.search,
                      color: isDark ? BrandColors.primary : secondaryText),
                  const SizedBox(width: 10),
                  Builder(builder: (context) {
                    return Text(l10n.t('Jetzt suchen'),
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: isDark ? BrandColors.primary : bodyText));
                  })
                ],
              ),
            ),
          ),
        );

    Widget buildRequestsButton(double size) => Semantics(
          button: true,
          label: l10n.t('profile.menu.rentalRequests'),
          excludeSemantics: true,
          child: InkWell(
            onTap: () async {
              final u = await DataService.getCurrentUser();
              if (!context.mounted) return;
              if (u == null) {
                await showGuestRestrictionSheet(context,
                    gateContext: GuestGateContext.rentalRequest);
                return;
              }
              widget.onFiltersPressed();
            },
            borderRadius: BorderRadius.circular(size / 2),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: size,
                  height: size,
                  decoration: BoxDecoration(
                    color: isDark
                        ? AppTheme.surfaceSecondary(context)
                        : AppTheme.surfacePrimary(context),
                    borderRadius: BorderRadius.circular(size / 2),
                    boxShadow: [...AppTheme.cardShadow(context)],
                    border: Border.all(
                        color: AppTheme.searchBorder(context), width: 1.5),
                  ),
                  alignment: Alignment.center,
                  child: Transform.translate(
                    offset: const Offset(-1, 3),
                    child:
                        const BoxChatIcon(size: 22, color: BrandColors.primary),
                  ),
                ),
                if (_hasNew)
                  const Positioned(
                    key: Key('search-header-pending-owner-request-indicator'),
                    right: 1,
                    top: 1,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                          color: BrandColors.logoAccent,
                          shape: BoxShape.circle),
                      child: SizedBox(width: 8, height: 8),
                    ),
                  ),
              ],
            ),
          ),
        );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: LayoutBuilder(builder: (context, constraints) {
        const gap = 8.0;
        const buttonSize = 44.0;
        const minSearchWidth = 120.0;
        final requiredWidth = (buttonSize * 2) + (gap * 2) + minSearchWidth;

        if (constraints.maxWidth < requiredWidth) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              buildSearchField(),
              const SizedBox(height: gap),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  buildCreateButton(buttonSize),
                  buildRequestsButton(buttonSize),
                ],
              ),
            ],
          );
        }

        return Row(children: [
          buildCreateButton(buttonSize),
          const SizedBox(width: gap),
          Expanded(child: buildSearchField()),
          const SizedBox(width: gap),
          buildRequestsButton(buttonSize),
        ]);
      }),
    );
  }
}
