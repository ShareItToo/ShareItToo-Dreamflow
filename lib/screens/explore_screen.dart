import 'dart:async';
import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/supply_enrichment.dart';
import 'package:lendify/models/user.dart' as model;
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/config/supply_enrichment_technical_config.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/search_header.dart';
import 'package:lendify/widgets/category_icon_row.dart';
import 'package:lendify/widgets/search_overlay.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/screens/owner_requests_screen.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:provider/provider.dart';
import 'package:lendify/widgets/wishlist_selection_sheet.dart';
import 'package:geolocator/geolocator.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/listing_feedback_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/screens/explore_screen_pinned_header.dart';
import 'package:lendify/widgets/scroll_edge_indicators.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/listing_carousel_card.dart';
import 'package:lendify/widgets/listing_display_truth.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/rating_badge.dart';
import 'package:lendify/widgets/listing_options_dialog.dart';
import 'package:lendify/widgets/long_press_feedback_wrapper.dart';
import 'package:lendify/widgets/profile_mutation_interaction.dart';
import 'package:lendify/widgets/listing_mutation_interaction.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';
import 'package:lendify/widgets/supply_enrichment_dialog.dart';
import 'package:lendify/navigation/main_nav_controller.dart';

class ExploreScreen extends StatefulWidget {
  final ProfileMutationService profileMutationService;
  final ListingMutationService listingMutationService;

  const ExploreScreen({
    super.key,
    this.profileMutationService = const ProfileMutationService(),
    this.listingMutationService = const ListingMutationService(),
  });
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final ScrollController _scrollController = ScrollController();
  final PageController _feedPager = PageController();
  final ScrollController _ctrlGuests = ScrollController();
  final SharedPersistenceRefreshCoordinator _savedRefreshCoordinator =
      SharedPersistenceRefreshCoordinator();
  final _profileActions = ProfileMutationInteractionController();
  final _listingActions = ListingMutationInteractionController();
  StreamSubscription<String>? _savedStateSubscription;
  int _loadRevision = 0;

  ProfileMutationService get _profileMutationService =>
      widget.profileMutationService;
  ListingMutationService get _listingMutationService =>
      widget.listingMutationService;

  List<Item> _items = [];
// Map fine category id -> coarse/top-level category label
  Map<String, String> _coarseByCatId = {};
  Map<String, model.User> _usersById = {};
  bool _isLoading = true;
  String? _catalogError;
  String? _currentUserName;
  String? _currentUserCity;
  Set<String> _savedIds = {};
  bool _favoriteActionInFlight = false;

// Extra curated cards for "Am meisten gebucht" to add two full rows (3 under 3)
  List<Item> _extraTopBooked = [];

  Map<String, dynamic>? _filters;

// Coarse/top-level category icon mapping
  IconData _coarseIconForGroup(String group) {
    final g = group.toLowerCase();
    if (g.contains('technik')) return Icons.devices;
    if (g.contains('haushalt') || g.contains('wohnen')) return Icons.weekend;
    if (g.contains('fahrzeuge') || g.contains('mobil')) {
      return Icons.directions_car;
    }
    if (g.contains('mode') || g.contains('lifestyle')) return Icons.checkroom;
    if (g.contains('sport') || g.contains('hobby') || g.contains('hobb')) {
      return Icons.sports_soccer;
    }
    if (g.contains('event') || g.contains('feier')) return Icons.celebration;
    if (g.contains('reise') || g.contains('camping')) return Icons.hiking;
    if (g.contains('kleidung') || g.contains('anlass')) return Icons.checkroom;
    if (g.contains('werkzeuge') ||
        g.contains('geräte') ||
        g.contains('geraete')) {
      return Icons.construction;
    }
    if (g.contains('garten') || g.contains('hof')) return Icons.grass;
    if (g.contains('büro') || g.contains('buero') || g.contains('gewerbe')) {
      return Icons.business_center;
    }
    if (g.contains('baby') || g.contains('kinder')) return Icons.child_friendly;
    if (g.contains('haustier')) return Icons.pets;
    return Icons.category;
  }

// Build the top-level categories in fixed order for the home header
  List<CategoryIconDataModel> get _homeCategories {
    return [
      for (final label in DataService.coarseCategoryOrder)
        CategoryIconDataModel(
            id: label, icon: _coarseIconForGroup(label), label: label)
    ];
  }

  @override
  void initState() {
    super.initState();
    _savedStateSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) {
        _profileActions.invalidate();
        _listingActions.invalidate();
        if (mounted) setState(() => _isLoading = true);
        unawaited(_savedRefreshCoordinator.schedule(_loadData));
      } else if (key == SharedPersistenceSync.wishlistStateKey ||
          key == SharedPersistenceSync.savedItemsKey) {
        unawaited(_savedRefreshCoordinator.schedule(_reloadSavedState));
      } else if (key == SharedPersistenceSync.localSafetyPrivacyStateKey) {
        unawaited(_savedRefreshCoordinator.schedule(_loadData));
      }
    });
    _loadData();
  }

  @override
  void dispose() {
    _savedRefreshCoordinator.dispose();
    _savedStateSubscription?.cancel();
    _profileActions.dispose();
    _listingActions.dispose();
    _scrollController.dispose();
    _feedPager.dispose();
    _ctrlGuests.dispose();
    super.dispose();
  }

  Future<void> _reloadSavedState() async {
    try {
      final saved = await DataService.getSavedItemIds();
      final session = await AuthService.readSession();
      if (!mounted) return;
      setState(() => _savedIds = session == null ? <String>{} : saved);
    } catch (error) {
      debugPrint(
        '[Explore] saved state refresh failed (${error.runtimeType})',
      );
    }
  }

  void _retryAfterPrincipalTransition(int revision) {
    if (!mounted || revision != _loadRevision) return;
    unawaited(_savedRefreshCoordinator.schedule(_loadData));
  }

  Future<void> _loadData() async {
    final revision = ++_loadRevision;
    if (mounted) {
      setState(() {
        _isLoading = true;
        _catalogError = null;
      });
    }
    try {
      final initialSession = await AuthService.readSession();
      final initialSessionEpoch = AuthService.sessionEpoch;
      final initialSessionOwner = initialSession == null
          ? null
          : AuthService.captureSessionOwner(initialSession);
      final items = await DataService.getPublicItems();
      final categories = await DataService.getCategories();
      // Public catalog truth must not wait for account-scoped presentation
      // state. In particular, a stale/slow profile, saved-items or mutation
      // context read may never turn a reachable catalog into an endless
      // loading surface. Commit only public data first; authenticated
      // enrichment below remains bound to the exact principal and epoch.
      if (!mounted || revision != _loadRevision) return;
      if (initialSessionOwner == null) {
        if (AuthService.sessionEpoch != initialSessionEpoch ||
            !await AuthService.isStoredSessionDefinitelyAbsent() ||
            AuthService.sessionEpoch != initialSessionEpoch) {
          _retryAfterPrincipalTransition(revision);
          return;
        }
      } else if (AuthService.sessionEpoch != initialSessionEpoch ||
          !await AuthService.isSessionOwnerDefinitelyCurrent(
            initialSessionOwner,
          )) {
        _retryAfterPrincipalTransition(revision);
        return;
      }
      if (!mounted || revision != _loadRevision) return;
      final coarseMap = <String, String>{
        for (final c in categories) c.id: DataService.coarseCategoryFor(c.name)
      };
      setState(() {
        _items = List<Item>.from(items);
        _coarseByCatId = coarseMap;
        _usersById = <String, model.User>{};
        _currentUserName = null;
        _currentUserCity = null;
        _savedIds = <String>{};
        _extraTopBooked = <Item>[];
        _isLoading = false;
      });
      // The public guest catalog must not depend on an old or corrupt local
      // account document. Account-scoped presentation data is resolved only
      // when this load actually started with an authenticated session; a
      // later session re-read and the mutation contexts below still guard a
      // concurrent guest/account or account/account transition.
      if (initialSession == null) {
        // The public snapshot above is already the complete guest result.
        // Do not read or initialize any account-scoped local document.
        return;
      }
      final users = await DataService.getUsers();
      final user = await DataService.getCurrentUser();
      final saved = await DataService.getSavedItemIds();
      final hiddenIds = await ListingFeedbackService.getHiddenItemIds();
      final profileContext = await _profileMutationService.loadCurrentContext();
      final listingContext = await _listingMutationService.loadCurrentContext();
      // Authenticated enrichment is committed only for the exact captured
      // owner and epoch. A stale result is simply discarded while the public
      // snapshot remains usable and free of A-owned presentation state.
      if (AuthService.sessionEpoch != initialSessionEpoch ||
          !await AuthService.isSessionOwnerDefinitelyCurrent(
            initialSessionOwner!,
          )) {
        return;
      }
      final hasRealSession = profileContext != null;
      if (!mounted || revision != _loadRevision) return;
      if (profileContext != null &&
          !await _profileMutationService.isContextCurrent(profileContext)) {
        return;
      }
      if (listingContext != null &&
          !await _listingMutationService.isContextCurrent(listingContext)) {
        return;
      }
      if (profileContext?.user.id != listingContext?.user.id) return;

// No extra fillers for the five-item showcase
      final extrasTop = <Item>[];

      if (!mounted || revision != _loadRevision) return;
      _profileActions.replaceContext(profileContext);
      _listingActions.replaceContext(listingContext);
      final resolvedUser = profileContext?.user ?? user;
      setState(() {
        _items = items.where((item) => !hiddenIds.contains(item.id)).toList();
        _coarseByCatId = coarseMap;
        _usersById = hasRealSession
            ? {for (final u in users) u.id: u}
            : <String, model.User>{};
        _currentUserName = hasRealSession ? resolvedUser?.displayName : null;
        _currentUserCity = hasRealSession ? resolvedUser?.city : null;
        _savedIds = hasRealSession ? saved : <String>{};
        _extraTopBooked = extrasTop;
        _isLoading = false;
      });
      // After data is loaded, check if we have a freshly created/saved listing event to show a popup
      final ev = listingContext == null
          ? null
          : DataService.takeLastCreateEventForOwner(
              listingContext.owner.authOwner,
            );
      if (ev != null && mounted) {
        final eventOwner = _listingActions.capture();
        if (eventOwner == null) return;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && _listingActions.isSynchronouslyCurrent(eventOwner)) {
            unawaited(_showCreatedPopup(eventOwner, ev.$1, ev.$2));
          }
        });
      }
    } catch (e) {
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _isLoading = false;
        _catalogError = 'Anzeigen konnten nicht geladen werden.';
      });
    }
  }

  Future<void> _showCreatedPopup(
    ListingMutationActionOwner owner,
    Item item,
    bool draft,
  ) async {
    final message = draft
        ? 'Anzeige wurde für später gespeichert'
        : 'Anzeige wurde erstellt';
    if (!mounted) return;
    final viewListing = await _listingActions.showOwnedDialog<bool>(
      context: context,
      owner: owner,
      barrierDismissible: true,
      builder: (dialogContext) {
        return Dialog(
          backgroundColor: Colors.black.withValues(alpha: 0.90),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    const Icon(Icons.check_circle,
                        color: Colors.lightGreenAccent),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(message,
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 16))),
                    IconButton(
                        onPressed: () => Navigator.of(dialogContext).pop(false),
                        icon: const Icon(Icons.close, color: Colors.white70)),
                  ]),
                  const SizedBox(height: 8),
                  Text(
                    draft
                        ? 'Du findest den Entwurf unter „Meine Anzeigen“.'
                        : 'Deine Anzeige ist jetzt sichtbar.',
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.of(dialogContext).pop(false),
                        icon: const Icon(Icons.check),
                        label: const Text('Schließen'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => Navigator.of(dialogContext).pop(true),
                        icon: const Icon(Icons.visibility),
                        label: Text(
                            draft ? 'Vorschau ansehen' : 'Anzeige ansehen'),
                      ),
                    ),
                  ]),
                ],
              ),
            ),
          ),
        );
      },
    );
    if (!mounted) return;
    if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
      return;
    }
    if (!mounted) return;
    if (viewListing == true) {
      await _listingActions.pushOwnedRoute<void>(
        context: context,
        owner: owner,
        route: MaterialPageRoute<void>(
          builder: (_) => LinkedListingDetailsScreen(item: item),
        ),
      );
    }
    if (!draft &&
        mounted &&
        await _listingActions.isCurrent(_listingMutationService, owner)) {
      await _showSupplyEnrichment(owner, item);
    }
  }

  Future<void> _showSupplyEnrichment(
    ListingMutationActionOwner owner,
    Item item,
  ) async {
    if (!BackendConfig.enabled ||
        QaRuntimeService.isEnabled ||
        !SupplyEnrichmentTechnicalConfig.available) {
      return;
    }
    try {
      final session = SupplyEnrichmentSession.fromJson(
        await _listingMutationService.generateSupplyEnrichment(
          context: owner.context,
          listingId: item.id,
        ),
      );
      if (!session.primaryListingCreated ||
          session.primaryListingBlocked ||
          session.externalGenerativeAiUsed ||
          session.suggestions.isEmpty ||
          !mounted) {
        return;
      }
      if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
        return;
      }
      if (!mounted) return;
      final result =
          await _listingActions.showOwnedDialog<SupplyEnrichmentOutcomeResult>(
        context: context,
        owner: owner,
        builder: (_) => SupplyEnrichmentDialog(
          session: session,
          onOutcome: (suggestion, outcome) async {
            return SupplyEnrichmentOutcomeResult.fromJson(
              await _listingMutationService.recordSupplyEnrichmentOutcome(
                context: owner.context,
                listingId: item.id,
                suggestionId: suggestion.id,
                outcome: outcome.wireValue,
              ),
            );
          },
        ),
      );
      final prefill = result?.prefill;
      if (prefill != null && mounted) {
        if (!await _listingActions.isCurrent(_listingMutationService, owner)) {
          return;
        }
        if (!mounted) return;
        await _listingActions.pushOwnedRoute<void>(
          context: context,
          owner: owner,
          route: MaterialPageRoute<void>(
            builder: (_) => CreateListingScreen(
              supplyPrefill: prefill,
              listingMutationService: _listingMutationService,
            ),
          ),
        );
      }
    } catch (error) {
      // G5A is deliberately fail-open: the already-created listing stays
      // successful even if the optional technical suggestion path is down.
      debugPrint(
          'Supply enrichment unavailable after listing creation: $error');
    }
  }

  Future<void> _handleListingCreated(Item created) async {
    await _loadData();
    if (!mounted) return;
    final owner = _listingActions.capture();
    if (owner == null || owner.context.user.id != created.ownerId) return;
    await _showCreatedPopup(owner, created, false);
  }

  Future<Item?> _openCreateListing() async {
    final owner = _listingActions.capture();
    if (owner == null) {
      if (mounted) {
        await showGuestRestrictionSheet(
          context,
          gateContext: GuestGateContext.listing,
        );
      }
      return null;
    }
    return _listingActions.pushOwnedRoute<Item?>(
      context: context,
      owner: owner,
      route: MaterialPageRoute<Item?>(
        builder: (_) => CreateListingScreen(
          listingMutationService: _listingMutationService,
        ),
      ),
    );
  }

  void _openSearch() => SearchOverlay.show(context);

  Future<void> _openLocationUpdate() async {
    final owner = _profileActions.capture();
    if (owner == null) return;
    final list = DataService.getCities().keys.toList();
    final cities = ['Automatisch', ...list];
    final selected = await _profileActions.showOwnedSheet<String>(
      context: context,
      owner: owner,
      backgroundColor: Colors.black.withValues(alpha: 0.7),
      builder: (context) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 12),
          Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 12),
          Text('Standort aktualisieren',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 420),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: cities.length,
              separatorBuilder: (_, __) =>
                  const Divider(color: Colors.white12, height: 1),
              itemBuilder: (context, i) {
                final c = cities[i];
                return ListTile(
                  leading: c == 'Automatisch'
                      ? const Icon(Icons.my_location, color: Colors.white70)
                      : const SizedBox.shrink(),
                  title: Text(c, style: const TextStyle(color: Colors.white)),
                  trailing: (owner.context.user.city == c)
                      ? const Icon(Icons.check, color: Colors.lightBlueAccent)
                      : null,
                  onTap: () => Navigator.of(context).pop(c),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
        ]),
      ),
    );
    if (selected == null ||
        selected.isEmpty ||
        !await _profileActions.isCurrent(_profileMutationService, owner)) {
      return;
    }

    if (selected == 'Automatisch') {
      await _useAutomaticLocation(owner);
      return;
    }

    await _persistCity(selected, owner);
  }

  Future<void> _persistCity(
    String selected,
    ProfileMutationActionOwner owner,
  ) async {
    try {
      if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      final result = await _profileMutationService.updateProfile(
        context: owner.context,
        updates: {
          CurrentUserProfileField.city: selected,
        },
      );
      if (!await _profileActions.isCurrent(
        _profileMutationService,
        owner,
      )) {
        return;
      }
      _profileActions.replaceContext(ProfileMutationContext(
        user: result.user,
        owner: owner.context.owner,
      ));
      setState(() => _currentUserCity = result.user.city);
      final refreshedOwner = _profileActions.capture();
      if (refreshedOwner != null) {
        await _showOwnedProfileStatus(
          refreshedOwner,
          title: 'Standort aktualisiert: $selected',
        );
      }
    } on ProfileMutationFailure catch (failure) {
      if (failure.kind == ProfileMutationFailureKind.principalChanged ||
          !await _profileActions.isCurrent(
            _profileMutationService,
            owner,
          )) {
        return;
      }
      await _showOwnedProfileStatus(
        owner,
        title: failure.remoteAccepted
            ? 'Serverseitig gespeichert'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Speicherstatus unklar'
                : 'Standort nicht gespeichert',
        message: failure.remoteAccepted
            ? 'Der Standort wurde serverseitig verarbeitet, aber der lokale Profilstand konnte noch nicht aktualisiert werden.'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Die Änderung könnte verarbeitet worden sein. Lade dein Profil neu, bevor du erneut speicherst.'
                : null,
      );
    } catch (error) {
      debugPrint('[Explore] location save failed: ${error.runtimeType}');
      if (await _profileActions.isCurrent(_profileMutationService, owner)) {
        await _showOwnedProfileStatus(
          owner,
          title: 'Standort nicht gespeichert',
        );
      }
    }
  }

  Future<void> _useAutomaticLocation(
    ProfileMutationActionOwner owner,
  ) async {
    try {
      if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      LocationPermission perm = await Geolocator.checkPermission();
      if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
        if (!await _profileActions.isCurrent(
          _profileMutationService,
          owner,
        )) {
          return;
        }
      }
      if (perm == LocationPermission.deniedForever ||
          perm == LocationPermission.denied) {
        await _showOwnedProfileStatus(
          owner,
          title: 'Standortzugriff verweigert.',
          message: 'Bitte erlaube den Zugriff in den Einstellungen.',
        );
        return;
      }
      if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      final nearest = DataService.nearestCityName(pos.latitude, pos.longitude);
      await _persistCity(nearest, owner);
    } catch (e) {
      if (await _profileActions.isCurrent(_profileMutationService, owner)) {
        await _showOwnedProfileStatus(
          owner,
          title: 'Standort konnte nicht ermittelt werden.',
        );
      }
    }
  }

  Future<void> _showOwnedProfileStatus(
    ProfileMutationActionOwner owner, {
    required String title,
    String? message,
  }) =>
      _profileActions.showOwnedDialog<void>(
        context: context,
        owner: owner,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: message == null ? null : Text(message),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );

  Future<void> _toggleFavorite(String id) async {
    if (_favoriteActionInFlight) return;
    _favoriteActionInFlight = true;
    try {
      final current = await DataService.getWishlistForItem(id);
      if (!mounted) return;
      if (current == null) {
        final sel = await WishlistSelectionSheet.showAdd(context);
        if (sel != null && sel.isNotEmpty) {
          await DataService.setItemWishlist(id, sel);
        }
      } else {
        final choice = await WishlistSelectionSheet.showManageOptions(context);
        if (!mounted) return;
        if (choice == 'move') {
          final sel = await WishlistSelectionSheet.showMove(context,
              currentListId: current);
          if (sel != null && sel.isNotEmpty) {
            await DataService.setItemWishlist(id, sel);
          }
        } else if (choice == 'remove') {
          await DataService.removeItemFromWishlist(id);
        }
      }
      final saved = await DataService.getSavedItemIds();
      if (!mounted) return;
      setState(() => _savedIds = saved);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _catalogError = 'Gemerkt-Status konnte nicht geladen werden.';
      });
    } finally {
      _favoriteActionInFlight = false;
    }
  }

  bool _matches(Item it) {
    final f = _filters;
    final RangeValues price = f?['price'] ?? const RangeValues(0, 500);
    final String priceUnit = f?['priceUnit'] ?? 'day';
    final double maxDistance = (f?['distance'] as double?) ?? 100;
    final bool verifiedOnly = f?['verified'] == true;
    final String condition = (f?['condition'] as String?) ?? 'egal';
    // Now stores coarse/top-level category labels (not fine-grained IDs)
    final List<String> catGroups =
        (f?['categories'] as List<String>?) ?? const [];
    final double minRating = (f?['minRating'] as double?) ?? 0;
    final List<String> delivery = (f?['delivery'] as List<String>?) ?? const [];

    final double minPerDay =
        priceUnit == 'week' ? price.start / 7 : price.start;
    final double maxPerDay = priceUnit == 'week' ? price.end / 7 : price.end;
    final customerPrice = listingCustomerPrice(it.pricePerDay);
    if (customerPrice < minPerDay || customerPrice > maxPerDay) return false;
    if (verifiedOnly) {
      final ok = it.verificationStatus == 'approved' ||
          it.verificationStatus == 'verified';
      if (!ok) return false;
    }
    if (condition != 'egal') {
      String mapped;
      switch (condition) {
        case 'neu':
          mapped = 'new';
          break;
        case 'wie-neu':
          mapped = 'like-new';
          break;
        case 'gut':
          mapped = 'good';
          break;
        case 'akzeptabel':
          mapped = 'acceptable';
          break;
        default:
          mapped = condition;
          break;
      }
      if (it.condition != mapped) return false;
    }
    if (catGroups.isNotEmpty) {
      final g = _coarseByCatId[it.categoryId] ?? '';
      if (!catGroups.contains(g)) return false;
    }
    if (delivery.isNotEmpty) {
      bool matchesAny = false;
      for (final opt in delivery) {
        switch (opt) {
          case 'dropoff':
            matchesAny = matchesAny || it.offersDeliveryAtDropoff;
            break;
          case 'pickup':
            matchesAny = matchesAny || it.offersPickupAtReturn;
            break;
          case 'express':
            matchesAny = matchesAny || it.offersExpressAtDropoff;
            break;
        }
        if (matchesAny) break;
      }
      if (!matchesAny) return false;
    }
    final d = _distanceFromUserKm(it);
    if (d != null && d > maxDistance) return false;
    final ownerRating = _usersById[it.ownerId]?.avgRating ?? 0.0;
    if (ownerRating < minRating) return false;
    return true;
  }

  List<Item> get _filteredItems {
    final src = [..._items];
    if (_filters == null) return _sorted(src);
    final filtered = src.where(_matches).toList();
    return _sorted(filtered);
  }

  List<Item> _sorted(List<Item> list) {
    final sort = _filters?['sort'] as String? ?? 'Preis';
    switch (sort) {
      case 'Preis':
        final order = (_filters?['priceOrder'] as String?) ?? 'asc';
        list.sort((a, b) => listingCustomerPrice(a.pricePerDay)
            .compareTo(listingCustomerPrice(b.pricePerDay)));
        if (order == 'desc') {
          list = list.reversed.toList();
        }
        break;
      case 'Bewertung':
        double ratingOf(String ownerId) =>
            _usersById[ownerId]?.avgRating ?? 0.0;
        list.sort((a, b) => ratingOf(b.ownerId).compareTo(ratingOf(a.ownerId)));
        break;
      case 'Neueste':
        list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        break;
      case 'Entfernung':
      default:
        double dist(Item i) => _distanceFromUserKm(i) ?? double.infinity;
        list.sort((a, b) => dist(a).compareTo(dist(b)));
        break;
    }
    return list;
  }

  double? _distanceFromUserKm(Item item) {
    final cities = DataService.getCities();
    final city = configuredUserCity(_currentUserCity);
    if (city == null) return null;
    final origin = cities[city];
    if (origin == null) return null;
    return _haversine(origin.$1, origin.$2, item.lat, item.lng);
  }

  double _haversine(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371.0;
    double dLat = _deg2rad(lat2 - lat1);
    double dLon = _deg2rad(lon2 - lon1);
    double a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_deg2rad(lat1)) *
            cos(_deg2rad(lat2)) *
            sin(dLon / 2) *
            sin(dLon / 2);
    double c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return R * c;
  }

  double _deg2rad(double deg) => deg * (pi / 180.0);

  @override
  Widget build(BuildContext context) {
    final itemsFiltered = _filteredItems;
    final now = DateTime.now();
    final latest = [...itemsFiltered]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final recent = latest
        .where(
            (e) => e.createdAt.isAfter(now.subtract(const Duration(days: 14))))
        .toList();
    final neueQuelle = (recent.isNotEmpty ? recent : latest);

    // Feed datasets (same cards/logic; only layout/navigation changes)
    final topBooked = [...itemsFiltered, ..._extraTopBooked];
    final nearYou = [...itemsFiltered]..sort((a, b) =>
        (_distanceFromUserKm(a) ?? double.infinity)
            .compareTo(_distanceFromUserKm(b) ?? double.infinity));
    final customersLike = itemsFiltered
        .where((it) => _savedIds.contains(it.id) || it.timesLent > 5)
        .toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _catalogError != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.cloud_off_outlined, size: 44),
                          const SizedBox(height: 12),
                          Text(_catalogError!, textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          FilledButton.icon(
                            onPressed: _loadData,
                            style: FilledButton.styleFrom(
                              minimumSize: const Size(0, 48),
                            ),
                            icon: const Icon(Icons.refresh),
                            label: const Text('Erneut versuchen'),
                          ),
                        ],
                      ),
                    ),
                  )
                : LayoutBuilder(builder: (context, constraints) {
                    final width = constraints.maxWidth;
                    final isTablet = width >= 600 && width < 900;
                    final isDesktop = width >= 900;

                    // Guests row: keep previous style
                    Widget feedPage(
                        {required String title, required List<Item> items}) {
                      final l10n = context.watch<LocalizationController>();
                      final activeCategories =
                          (_filters?['categories'] as List?)
                                  ?.whereType<String>()
                                  .toList() ??
                              const <String>[];
                      final showingCategoryResults =
                          activeCategories.isNotEmpty;
                      if (items.isEmpty) {
                        return CustomScrollView(
                          slivers: [
                            SliverToBoxAdapter(
                              child: Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(24, 42, 24, 24),
                                child: Column(
                                  children: [
                                    Icon(Icons.inventory_2_outlined,
                                        size: 46,
                                        color: Colors.white
                                            .withValues(alpha: 0.62)),
                                    const SizedBox(height: 14),
                                    Text(
                                      showingCategoryResults
                                          ? l10n.t('Keine Anzeigen gefunden')
                                          : l10n.t('Noch keine Anzeigen'),
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleLarge
                                          ?.copyWith(color: Colors.white),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      showingCategoryResults
                                          ? l10n.t(
                                              'Wähle eine andere Kategorie oder setze die Filter zurück.')
                                          : l10n.t(
                                              'Sobald die ersten Anzeigen veröffentlicht sind, erscheinen sie hier.'),
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium
                                          ?.copyWith(color: Colors.white70),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        );
                      }
                      return CustomScrollView(
                        // Each page scrolls vertically on its own.
                        slivers: [
                          SliverToBoxAdapter(
                            child: _SectionHeader(
                              title: title,
                              // Keep the title very close to the pinned categories row.
                              padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                            ),
                          ),
                          if (items.isNotEmpty && !showingCategoryResults)
                            SliverToBoxAdapter(
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 14),
                                child: LayoutBuilder(builder: (context, c) {
                                  // 2 full cards + 25% of the next card.
                                  const sidePad = 16.0;
                                  const gap = 10.0;
                                  final viewport = c.maxWidth;
                                  final cardW =
                                      (viewport - sidePad * 2 - gap * 2) / 3;
                                  // Keep the featured (upper) cards compact.
                                  // Image is 4:3 => height = width * 3/4.
                                  // Tighten the horizontal featured cards so they end right under the price.
                                  // Image is 4:3 => height = width * 3/4.
                                  // Content below image is intentionally compact.
                                  final cardH = cardW * (3 / 4) + 84;
                                  final featured = items.take(10).toList();
                                  return SizedBox(
                                    height: cardH,
                                    child: ListView.separated(
                                      padding: const EdgeInsets.fromLTRB(
                                          sidePad, 0, sidePad, 0),
                                      scrollDirection: Axis.horizontal,
                                      physics: const BouncingScrollPhysics(),
                                      itemBuilder: (context, i) {
                                        final it = featured[i];
                                        final isFav = _savedIds.contains(it.id);
                                        final dist = _distanceFromUserKm(it);
                                        return SizedBox(
                                          width: cardW,
                                          child: LongPressFeedbackWrapper(
                                            child: InkWell(
                                              onTap: () => ItemDetailsOverlay
                                                  .showFullPage(context,
                                                      item: it, fresh: true),
                                              onLongPress: () =>
                                                  showListingOptionsDialog(
                                                      context,
                                                      item: it,
                                                      contextType:
                                                          ListingOptionsContext
                                                              .explore,
                                                      onWishlistChanged:
                                                          _loadData,
                                                      onVisibilityChanged:
                                                          _loadData),
                                              splashColor: Colors.transparent,
                                              highlightColor:
                                                  Colors.transparent,
                                              child: ListingCarouselCard(
                                                item: it,
                                                isFavorite: isFav,
                                                onFavoriteToggle: () =>
                                                    _toggleFavorite(it.id),
                                                distanceKm: dist,
                                                rating: _usersById[it.ownerId]
                                                    ?.avgRating,
                                              ),
                                            ),
                                          ),
                                        );
                                      },
                                      separatorBuilder: (_, __) =>
                                          const SizedBox(width: gap),
                                      itemCount: featured.length,
                                    ),
                                  );
                                }),
                              ),
                            ),
                          SliverPadding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 24, 32),
                            sliver: SliverGrid(
                              gridDelegate:
                                  SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount:
                                    isDesktop ? 4 : (isTablet ? 3 : 2),
                                mainAxisSpacing: 12,
                                crossAxisSpacing: 12,
                                // Make cards more compact vertically so the tile ends right below
                                // the price row (matching "Meine Anzeigen" density).
                                // Higher ratio => less height for the same width.
                                // Tuned to remove the remaining bottom "air" under "Preis pro Tag".
                                // Slightly higher ratio => slightly less tile height (tighter bottom edge).
                                // 4:3 image + trust row + price rows.
                                // Slightly taller on phones to avoid bottom overflows in tight grid tiles
                                // (e.g., with larger textScaleFactor).
                                childAspectRatio:
                                    _exploreListingChildAspectRatio(context,
                                        isDesktop: isDesktop,
                                        isTablet: isTablet),
                              ),
                              delegate: SliverChildBuilderDelegate(
                                (context, index) {
                                  final item = items[index];
                                  final isFav = _savedIds.contains(item.id);
                                  return _ExploreListingCard(
                                    item: item,
                                    isFavorite: isFav,
                                    onFavoriteToggle: () =>
                                        _toggleFavorite(item.id),
                                    distanceKm: _distanceFromUserKm(item),
                                    rating: _usersById[item.ownerId]?.avgRating,
                                  );
                                },
                                childCount: items.length,
                              ),
                            ),
                          ),
                        ],
                      );
                    }

                    return NestedScrollView(
                      controller: _scrollController,
                      headerSliverBuilder: (context, innerBoxIsScrolled) {
                        return [
                          const SliverToBoxAdapter(child: SizedBox(height: 0)),

// New Header with greeting and rotating logo
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                              child: Builder(builder: (context) {
                                final l10n =
                                    context.watch<LocalizationController>();
                                final hasRealUserName =
                                    (_currentUserName ?? '').trim().isNotEmpty;
                                final greeting = hasRealUserName
                                    ? (l10n.language == AppLanguage.de
                                        ? 'Hallo ${_currentUserName!.trim().split(' ').first}! 👋'
                                        : 'Hi ${_currentUserName!.trim().split(' ').first}! 👋')
                                    : l10n.t('Hallo 👋');
                                final city = (_currentUserCity ?? '').trim();
                                final locationLabel = city.isEmpty
                                    ? l10n.t('Ort hinzufügen')
                                    : city;
                                final primaryText =
                                    AppTheme.textPrimary(context);
                                final secondaryText =
                                    AppTheme.textSecondary(context);
                                return Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: InkWell(
                                        onTap: () {
                                          context
                                              .read<MainNavController>()
                                              .setIndex(4);
                                        },
                                        borderRadius: BorderRadius.circular(16),
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(
                                              vertical: 4),
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                greeting,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .headlineSmall
                                                    ?.copyWith(
                                                        color: primaryText,
                                                        fontWeight:
                                                            FontWeight.bold,
                                                        fontSize: 24),
                                              ),
                                              const SizedBox(height: 4),
                                              InkWell(
                                                onTap: _openLocationUpdate,
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                                child: Padding(
                                                  padding:
                                                      const EdgeInsets.all(4.0),
                                                  child: Row(
                                                    mainAxisSize:
                                                        MainAxisSize.min,
                                                    children: [
                                                      Icon(Icons.location_on,
                                                          size: 16,
                                                          color: secondaryText),
                                                      const SizedBox(width: 4),
                                                      Text(locationLabel,
                                                          style: Theme.of(
                                                                  context)
                                                              .textTheme
                                                              .bodyMedium
                                                              ?.copyWith(
                                                                  color:
                                                                      secondaryText,
                                                                  fontSize:
                                                                      14)),
                                                    ],
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                    GestureDetector(
                                      onTap: null,
                                      behavior: HitTestBehavior.opaque,
                                      child: Transform.translate(
                                          offset: const Offset(0, 4),
                                          child: _HoverSpinAppLogo(size: 48)),
                                    ),
                                  ],
                                );
                              }),
                            ),
                          ),

                          const SliverToBoxAdapter(child: SizedBox(height: 16)),
                          SliverToBoxAdapter(
                            child: SearchHeader(
                              onFiltersPressed: () async {
                                await Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const OwnerRequestsScreen(
                                        initialTabIndex: 2),
                                  ),
                                );
                              },
                              onSearchTap: _openSearch,
                              onCreateListing: _openCreateListing,
                              onListingCreated: _handleListingCreated,
                            ),
                          ),

                          SliverPersistentHeader(
                            pinned: true,
                            delegate: PinnedCategoriesHeader(
                              textScale:
                                  MediaQuery.textScalerOf(context).scale(10.5) /
                                      10.5,
                              builder: (context) {
                                final l10n =
                                    context.watch<LocalizationController>();
                                final localized = _homeCategories
                                    .map((e) => CategoryIconDataModel(
                                        id: e.id,
                                        icon: e.icon,
                                        label: l10n.t(e.label)))
                                    .toList();
                                return Container(
                                  color: Colors.transparent,
                                  child: CategoryIconRow(
                                    categories: localized,
                                    onSelected: (c) async {
// Apply immediately without confirmation popup
                                      if (!mounted) return;
                                      setState(() => _filters = {
                                            ...?_filters,
                                            'categories': [c.id]
                                          });
                                      AppPopup.toast(context,
                                          icon: Icons.filter_alt_outlined,
                                          title:
                                              '${l10n.t('Gefiltert nach:')} ${c.label}',
                                          duration: const Duration(seconds: 1));
                                    },
                                    onAllCategoriesTap: () {
                                      setState(() {
                                        _filters ??= {};
                                        final f = Map<String, dynamic>.from(
                                            _filters!);
                                        f.remove('categories');
                                        _filters = f;
                                      });
                                      final l10n = context
                                          .read<LocalizationController>();
                                      AppPopup.toast(context,
                                          icon: Icons.category_outlined,
                                          title: l10n.t('Alle Kategorien'),
                                          duration: const Duration(seconds: 1));
                                    },
                                  ),
                                );
                              },
                            ),
                          ),
                          const SliverToBoxAdapter(child: SizedBox(height: 0)),

                          // Keep the feed visually tight to the pinned categories row.
                          const SliverToBoxAdapter(child: SizedBox(height: 0)),
                        ];
                      },
                      body: ScrollEdgeIndicators.page(
                        controller: _feedPager,
                        pageCount: itemsFiltered.isEmpty ? 1 : 4,
                        showLeft: true,
                        showRight: true,
                        showArrows: false,
                        // Keep the fade aligned with the page-title area.
                        arrowsTop: 6,
                        child: itemsFiltered.isEmpty
                            ? feedPage(title: '', items: const <Item>[])
                            : PageView(
                                controller: _feedPager,
                                physics: const BouncingScrollPhysics(),
                                children: [
                                  feedPage(
                                      title: context
                                          .watch<LocalizationController>()
                                          .t('Am meisten gebucht'),
                                      items: topBooked),
                                  feedPage(
                                      title: context
                                          .watch<LocalizationController>()
                                          .t('Neue Angebote'),
                                      items: neueQuelle),
                                  feedPage(
                                      title: context
                                          .watch<LocalizationController>()
                                          .t(configuredUserCity(
                                                      _currentUserCity) !=
                                                  null
                                              ? 'In der Nähe von dir'
                                              : 'Weitere Angebote'),
                                      items: nearYou),
                                  feedPage(
                                      title: context
                                          .watch<LocalizationController>()
                                          .t('Kunden gefällt auch'),
                                      items: customersLike),
                                ],
                              ),
                      ),
                    );
                  }),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final EdgeInsets? padding;
  const _SectionHeader({required this.title, this.padding});
  @override
  Widget build(BuildContext context) {
    final effectivePadding =
        padding ?? const EdgeInsets.symmetric(horizontal: 16, vertical: 8);
    final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w600,
          fontSize: 18,
          color: AppTheme.textPrimary(context),
          letterSpacing: -0.2,
        );

    return Padding(
      padding: effectivePadding,
      child: SizedBox(
        height: 28,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Align(
              alignment: Alignment.center,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: titleStyle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HoverResponsiveTopGrid extends StatefulWidget {
  final List<Item> items;
  final Set<String> savedIds;
  final ValueChanged<String> onFavoriteToggle;
  const _HoverResponsiveTopGrid(
      {required this.items,
      required this.savedIds,
      required this.onFavoriteToggle});
  @override
  State<_HoverResponsiveTopGrid> createState() =>
      _HoverResponsiveTopGridState();
}

class _HoverResponsiveTopGridState extends State<_HoverResponsiveTopGrid> {
  static const double _gap = 8.0;
  OverlayEntry? _hoverEntry;
  int? _hoveredIndex;

  @override
  void dispose() {
    _removeHoverOverlay();
    super.dispose();
  }

  void _showHoverOverlay(int index, Rect rect) {
    _removeHoverOverlay();
    _hoveredIndex = index;
    final item = widget.items.length > index ? widget.items[index] : null;
    if (item == null) return;
    final isFav = widget.savedIds.contains(item.id);
    final overlay = Overlay.of(context);

    const scale = 1.33;
    final media = MediaQuery.of(context);
    final screenSize = media.size;
    final scaledW = rect.width * scale;
    final scaledH = rect.height * scale;
    final center = rect.center;
    double left = center.dx - scaledW / 2;
    double top = center.dy - scaledH / 2;
    const margin = 8.0;
    left = left.clamp(margin, screenSize.width - scaledW - margin);
    top = top.clamp(margin, screenSize.height - scaledH - margin);

    _hoverEntry = OverlayEntry(builder: (_) {
      return Stack(children: [
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _removeHoverOverlay,
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
              child: Container(color: Colors.black.withValues(alpha: 0.06)),
            ),
          ),
        ),
        Positioned(
          left: left,
          top: top,
          width: scaledW,
          height: scaledH,
          child: MouseRegion(
            onExit: (_) => _removeHoverOverlay(),
            child: Material(
              elevation: 16,
              borderRadius: BorderRadius.circular(18),
              clipBehavior: Clip.antiAlias,
              child: _SquareItemCard(
                item: item,
                isFavorite: isFav,
                onFavoriteToggle: () {
                  widget.onFavoriteToggle(item.id);
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _rebuildHoverOverlay(
                        index,
                        Rect.fromLTWH(
                            rect.left, rect.top, rect.width, rect.height));
                  });
                },
              ),
            ),
          ),
        ),
      ]);
    });
    overlay.insert(_hoverEntry!);
  }

  void _rebuildHoverOverlay(int index, Rect rect) {
    if (_hoverEntry == null) return;
    _showHoverOverlay(index, rect);
  }

  void _removeHoverOverlay() {
    _hoverEntry?.remove();
    _hoverEntry = null;
    _hoveredIndex = null;
  }

  @override
  Widget build(BuildContext context) {
    final items =
        widget.items.length > 9 ? widget.items.take(9).toList() : widget.items;
    if (items.isEmpty) return const SizedBox();

    return LayoutBuilder(builder: (context, constraints) {
      final maxWidth = constraints.maxWidth;
      final rows = (items.length / 3).ceil();
      return Column(children: [
        for (int r = 0; r < rows; r++) ...[
          _AnimatedHoverRow(
            rowIndex: r,
            maxWidth: maxWidth,
            items: items,
            start: r * 3,
            end: (r * 3 + 3).clamp(0, items.length),
            onHoverEnter: (i, rect) => _showHoverOverlay(i, rect),
            onHoverExit: (i) {
              if (_hoveredIndex == i) _removeHoverOverlay();
            },
            savedIds: widget.savedIds,
            onFavoriteToggle: widget.onFavoriteToggle,
          ),
          if (r != rows - 1) const SizedBox(height: _gap),
        ]
      ]);
    });
  }
}

class _AnimatedHoverRow extends StatelessWidget {
  final int rowIndex;
  final double maxWidth;
  final List<Item> items;
  final int start;
  final int end; // exclusive
  final void Function(int, Rect) onHoverEnter;
  final ValueChanged<int> onHoverExit;
  final Set<String> savedIds;
  final ValueChanged<String> onFavoriteToggle;

  static const double gap = 8.0;

  const _AnimatedHoverRow({
    required this.rowIndex,
    required this.maxWidth,
    required this.items,
    required this.start,
    required this.end,
    required this.onHoverEnter,
    required this.onHoverExit,
    required this.savedIds,
    required this.onFavoriteToggle,
  });

  @override
  Widget build(BuildContext context) {
    final count = end - start;
    final totalGap = (count - 1) * gap;
    final tileWidth = count > 0 ? (maxWidth - totalGap) / count : 0.0;

    return SizedBox(
      width: maxWidth,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (int j = 0; j < count; j++) ...[
          _HoverTile(
            globalIndex: start + j,
            width: tileWidth,
            item: items[start + j],
            isFavorite: savedIds.contains(items[start + j].id),
            onFavoriteToggle: () => onFavoriteToggle(items[start + j].id),
            onHoverEnter: onHoverEnter,
            onHoverExit: onHoverExit,
          ),
          if (j != count - 1) const SizedBox(width: gap),
        ]
      ]),
    );
  }
}

class _HoverTile extends StatefulWidget {
  final int globalIndex;
  final double width;
  final Item item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  final void Function(int, Rect) onHoverEnter;
  final ValueChanged<int> onHoverExit;

  const _HoverTile({
    required this.globalIndex,
    required this.width,
    required this.item,
    required this.isFavorite,
    required this.onFavoriteToggle,
    required this.onHoverEnter,
    required this.onHoverExit,
  });

  @override
  State<_HoverTile> createState() => _HoverTileState();
}

class _HoverTileState extends State<_HoverTile> {
  final GlobalKey _tileKey = GlobalKey();
  Timer? _pressTimer;
  bool _pointerDown = false;

  void _startPressTimer() {
    _pressTimer?.cancel();
    _pressTimer = Timer(const Duration(seconds: 1), () {
      if (!_pointerDown) return;
      final ctx = _tileKey.currentContext;
      if (ctx != null) {
        final box = ctx.findRenderObject() as RenderBox;
        final pos = box.localToGlobal(Offset.zero);
        final size = box.size;
        widget.onHoverEnter(widget.globalIndex,
            Rect.fromLTWH(pos.dx, pos.dy, size.width, size.height));
      } else {
        widget.onHoverEnter(widget.globalIndex,
            Rect.fromLTWH(0, 0, widget.width, widget.width));
      }
    });
  }

  void _cancelPressTimer() {
    _pressTimer?.cancel();
    _pressTimer = null;
  }

  @override
  void dispose() {
    _cancelPressTimer();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.basic,
      child: GestureDetector(
        onTapDown: (_) {
          _pointerDown = true;
          _startPressTimer();
        },
        onTapUp: (_) {
          _pointerDown = false;
          _cancelPressTimer();
        },
        onTapCancel: () {
          _pointerDown = false;
          _cancelPressTimer();
        },
        child: SizedBox(
          key: _tileKey,
          width: widget.width,
          height: widget.width * 0.86,
          child: _SquareItemCard(
              item: widget.item,
              isFavorite: widget.isFavorite,
              onFavoriteToggle: widget.onFavoriteToggle),
        ),
      ),
    );
  }
}

class _OverlayPresenter {
  static void showEnlarged(BuildContext context, Item item, Rect anchorRect,
      {bool isFavorite = false, VoidCallback? onFavoriteToggle}) {
    final overlay = Overlay.of(context);
    const scale = 1.33;
    final media = MediaQuery.of(context);
    final screenSize = media.size;
    final scaledW = anchorRect.width * scale;
    final scaledH = anchorRect.height * scale;
    final center = anchorRect.center;
    double left = center.dx - scaledW / 2;
    double top = center.dy - scaledH / 2;
    const margin = 8.0;
    left = left.clamp(margin, screenSize.width - scaledW - margin);
    top = top.clamp(margin, screenSize.height - scaledH - margin);

    late OverlayEntry entry;
    entry = OverlayEntry(builder: (_) {
      return Stack(children: [
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => entry.remove(),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
              child: Container(color: Colors.black.withValues(alpha: 0.06)),
            ),
          ),
        ),
        Positioned(
          left: left,
          top: top,
          width: scaledW,
          height: scaledH,
          child: Material(
            elevation: 16,
            borderRadius: BorderRadius.circular(18),
            clipBehavior: Clip.antiAlias,
            child: _SquareItemCard(
              item: item,
              isFavorite: isFavorite,
              onFavoriteToggle: () {
                if (onFavoriteToggle != null) onFavoriteToggle();
              },
            ),
          ),
        ),
      ]);
    });
    overlay.insert(entry);
  }
}

class _SquareItemCard extends StatefulWidget {
  final Item item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  const _SquareItemCard(
      {required this.item,
      required this.isFavorite,
      required this.onFavoriteToggle});
  @override
  State<_SquareItemCard> createState() => _SquareItemCardState();
}

class _SquareItemCardState extends State<_SquareItemCard> {
  bool get _isVerified =>
      widget.item.verificationStatus == 'approved' ||
      widget.item.verificationStatus == 'verified';

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.basic,
      child: LongPressFeedbackWrapper(
        child: GestureDetector(
          onTap: () => ItemDetailsOverlay.showFullPage(context,
              item: widget.item, fresh: true),
          onLongPress: () => showListingOptionsDialog(context,
              item: widget.item,
              contextType: ListingOptionsContext.explore,
              onWishlistChanged: widget.onFavoriteToggle,
              onVisibilityChanged: () => Navigator.of(context).maybePop()),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Stack(children: [
              Positioned.fill(
                child: LayoutBuilder(builder: (context, c) {
                  return AppImage(
                    url: widget.item.photos.isNotEmpty
                        ? widget.item.photos.first
                        : '',
                    fit: BoxFit.cover,
                    // cacheWidth ignored by AppImage; kept simple
                  );
                }),
              ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border:
                        Border.all(color: Colors.white.withValues(alpha: 0.10)),
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.0),
                          Colors.black.withValues(alpha: 0.55),
                        ]),
                  ),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(widget.item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white)),
                        const SizedBox(height: 2),
                        Row(children: [
                          Expanded(child: Builder(builder: (context) {
                            final unit = widget.item.priceUnit;
                            final perDay = widget.item.pricePerDay;
                            final price = unit == 'week' ? perDay * 7 : perDay;
                            return Text(
                                '${listingCustomerPriceText(price, currency: widget.item.currency)} ${unit == 'week' ? '/ Woche' : '/ Tag'}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context)
                                    .textTheme
                                    .labelSmall
                                    ?.copyWith(color: Colors.white));
                          })),
                        ]),
                      ]),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: InkWell(
                  onTap: widget.onFavoriteToggle,
                  borderRadius: BorderRadius.circular(16),
                  mouseCursor: SystemMouseCursors.basic,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.9),
                        shape: BoxShape.circle),
                    child: Icon(
                        widget.isFavorite
                            ? Icons.favorite
                            : Icons.favorite_border,
                        size: 14,
                        color: widget.isFavorite
                            ? Colors.pinkAccent
                            : Colors.black54),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                left: 8,
                child: Icon(Icons.verified,
                    size: 16,
                    color: _isVerified ? BrandColors.success : Colors.grey),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _SmallScrollCard extends StatefulWidget {
  final Item item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  const _SmallScrollCard(
      {required this.item,
      required this.isFavorite,
      required this.onFavoriteToggle});
  @override
  State<_SmallScrollCard> createState() => _SmallScrollCardState();
}

class _SmallScrollCardState extends State<_SmallScrollCard> {
  bool get _isVerified =>
      widget.item.verificationStatus == 'approved' ||
      widget.item.verificationStatus == 'verified';

  double _iconSizeFor(double width) => (width * 0.10).clamp(14.0, 20.0);

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.basic,
      child: LongPressFeedbackWrapper(
        child: GestureDetector(
          onTap: () => ItemDetailsOverlay.showFullPage(context,
              item: widget.item, fresh: true),
          onLongPress: () => showListingOptionsDialog(context,
              item: widget.item,
              contextType: ListingOptionsContext.explore,
              onWishlistChanged: widget.onFavoriteToggle,
              onVisibilityChanged: () => Navigator.of(context).maybePop()),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: LayoutBuilder(builder: (context, c) {
              final iconSize = _iconSizeFor(c.maxWidth);
              return Stack(children: [
                Positioned.fill(
                  child: LayoutBuilder(builder: (context, c2) {
                    return AppImage(
                      url: widget.item.photos.isNotEmpty
                          ? widget.item.photos.first
                          : '',
                      fit: BoxFit.cover,
                    );
                  }),
                ),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(
                          color: Colors.white.withValues(alpha: 0.10)),
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.0),
                            Colors.black.withValues(alpha: 0.55),
                          ]),
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(widget.item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context)
                                  .textTheme
                                  .labelSmall
                                  ?.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Row(children: [
                            Expanded(child: Builder(builder: (context) {
                              final unit = widget.item.priceUnit;
                              final perDay = widget.item.pricePerDay;
                              final price =
                                  unit == 'week' ? perDay * 7 : perDay;
                              return Text(
                                  '${listingCustomerPriceText(price, currency: widget.item.currency)} ${unit == 'week' ? '/ Woche' : '/ Tag'}',
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelSmall
                                      ?.copyWith(color: Colors.white));
                            })),
                          ])
                        ]),
                  ),
                ),

// Favorite heart (top-right)
                Positioned(
                  top: 8,
                  right: 8,
                  child: InkWell(
                    onTap: widget.onFavoriteToggle,
                    borderRadius: BorderRadius.circular(16),
                    mouseCursor: SystemMouseCursors.basic,
                    child: Container(
                      padding: EdgeInsets.all(iconSize * 0.28),
                      decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.9),
                          shape: BoxShape.circle),
                      child: Icon(
                          widget.isFavorite
                              ? Icons.favorite
                              : Icons.favorite_border,
                          size: iconSize * 0.86,
                          color:
                              widget.isFavorite ? Colors.red : Colors.black54),
                    ),
                  ),
                ),
// Verified (top-left)
                Positioned(
                  top: 8,
                  left: 8,
                  child: Icon(Icons.verified,
                      size: iconSize,
                      color: _isVerified ? BrandColors.success : Colors.grey),
                ),
              ]);
            }),
          ),
        ),
      ),
    );
  }
}

class _SmallGridCard extends StatefulWidget {
  final Item item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  const _SmallGridCard(
      {required this.item,
      required this.isFavorite,
      required this.onFavoriteToggle});
  @override
  State<_SmallGridCard> createState() => _SmallGridCardState();
}

class _SmallGridCardState extends State<_SmallGridCard> {
  bool get _isVerified =>
      widget.item.verificationStatus == 'approved' ||
      widget.item.verificationStatus == 'verified';

  double _iconSizeFor(double width) => (width * 0.10).clamp(14.0, 20.0);

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.basic,
      child: LongPressFeedbackWrapper(
        child: GestureDetector(
          onTap: () => ItemDetailsOverlay.showFullPage(context,
              item: widget.item, fresh: true),
          onLongPress: () => showListingOptionsDialog(context,
              item: widget.item,
              contextType: ListingOptionsContext.explore,
              onWishlistChanged: widget.onFavoriteToggle,
              onVisibilityChanged: () => Navigator.of(context).maybePop()),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: LayoutBuilder(builder: (context, c) {
              final iconSize = _iconSizeFor(c.maxWidth);
              return Stack(children: [
                Positioned.fill(
                  child: LayoutBuilder(builder: (context, c2) {
                    return AppImage(
                      url: widget.item.photos.isNotEmpty
                          ? widget.item.photos.first
                          : '',
                      fit: BoxFit.cover,
                    );
                  }),
                ),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(
                          color: Colors.white.withValues(alpha: 0.10)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                // Title overlay at bottom (like Neue Angebote)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.0),
                            Colors.black.withValues(alpha: 0.55),
                          ]),
                    ),
                    child: Text(
                      widget.item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                // Favorite heart (top-right)
                Positioned(
                  top: 6,
                  right: 6,
                  child: InkWell(
                    onTap: widget.onFavoriteToggle,
                    borderRadius: BorderRadius.circular(16),
                    mouseCursor: SystemMouseCursors.basic,
                    child: Container(
                      padding: EdgeInsets.all(iconSize * 0.28),
                      decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.9),
                          shape: BoxShape.circle),
                      child: Icon(
                          widget.isFavorite
                              ? Icons.favorite
                              : Icons.favorite_border,
                          size: iconSize * 0.86,
                          color: widget.isFavorite
                              ? Colors.pinkAccent
                              : Colors.black54),
                    ),
                  ),
                ),
                // Verified (top-left)
                Positioned(
                  top: 6,
                  left: 6,
                  child: Icon(Icons.verified,
                      size: iconSize,
                      color: _isVerified ? BrandColors.success : Colors.grey),
                ),
              ]);
            }),
          ),
        ),
      ),
    );
  }
}

/// Explore tile in the same visual style as "Meine Anzeigen":
/// image (16:9) + title + price per day.
///
/// Note: intentionally no "Aktiv" chip and no overflow menu.
double _exploreListingChildAspectRatio(BuildContext context,
    {required bool isDesktop, required bool isTablet}) {
  final size = MediaQuery.sizeOf(context);
  final textScaler = MediaQuery.textScalerOf(context);
  final cols = isDesktop ? 4 : (isTablet ? 3 : 2);
  const horizontalPadding = 40.0; // grid left 16 + right 24
  const crossSpacing = 12.0;
  final colWidth =
      (size.width - horizontalPadding - (crossSpacing * (cols - 1))) / cols;
  final imageHeight = colWidth * 0.60; // shorter image block to cut bottom air
  final theme = Theme.of(context).textTheme;
  final titleFs = textScaler.scale(theme.titleMedium?.fontSize ?? 16);
  final titleHeight = titleFs * ((theme.titleMedium?.height ?? 1.2));
  final metaHeight = textScaler.scale(16).clamp(16, 20).toDouble();
  final priceFs = textScaler.scale(theme.titleLarge?.fontSize ?? 22);
  final priceHeight = priceFs * ((theme.titleLarge?.height ?? 1.1));
  final suffixFs = textScaler.scale(theme.bodySmall?.fontSize ?? 12);
  final suffixHeight = suffixFs * ((theme.bodySmall?.height ?? 1.2));
  const verticalPadding = 12.0;
  const gaps = 12.0; // tighter vertical rhythm under the last visible block
  final infoHeight = verticalPadding +
      titleHeight +
      metaHeight +
      max(priceHeight, suffixHeight) +
      gaps;
  final cardHeight = imageHeight + infoHeight;
  return (colWidth / cardHeight)
      .clamp(isDesktop ? 0.90 : (isTablet ? 0.86 : 0.82), 1.0);
}

class _ExploreListingCard extends StatelessWidget {
  final Item item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  final double? distanceKm;
  final double? rating;

  const _ExploreListingCard(
      {required this.item,
      required this.isFavorite,
      required this.onFavoriteToggle,
      required this.distanceKm,
      required this.rating});

  @override
  Widget build(BuildContext context) {
    // Guardrail: explore grid tiles can become very tight on small devices and/or
    // with large accessibility text. We clamp scaling inside the card to prevent
    // RenderFlex overflows while keeping the overall app text scaling intact.
    final clampedMediaQuery = MediaQuery.of(context).copyWith(
      textScaler: MediaQuery.textScalerOf(context)
          .clamp(minScaleFactor: 1.0, maxScaleFactor: 1.18),
    );

    return MediaQuery(
      data: clampedMediaQuery,
      child: _ExploreListingCardContent(
          item: item,
          isFavorite: isFavorite,
          onFavoriteToggle: onFavoriteToggle,
          distanceKm: distanceKm,
          rating: rating),
    );
  }
}

class _ExploreListingCardContent extends StatelessWidget {
  final Item item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  final double? distanceKm;
  final double? rating;

  const _ExploreListingCardContent(
      {required this.item,
      required this.isFavorite,
      required this.onFavoriteToggle,
      required this.distanceKm,
      required this.rating});

  bool get _isVerified =>
      item.verificationStatus == 'approved' ||
      item.verificationStatus == 'verified';

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cs = theme.colorScheme;
    final displayRating = listingRatingForDisplay(rating);
    final textScale = MediaQuery.textScalerOf(context).scale(1.0);
    final titleColor = isDark ? Colors.white : AppTheme.textPrimary(context);
    final metaColor = isDark
        ? Colors.white.withValues(alpha: 0.86)
        : AppTheme.textSecondary(context);
    final metaIconColor =
        isDark ? Colors.white70 : AppTheme.textSecondary(context);
    final priceColor = isDark ? Colors.white : AppTheme.textPrimary(context);
    final priceSuffixColor = isDark
        ? Colors.white.withValues(alpha: 0.80)
        : AppTheme.textSecondary(context);

    const String? highlight = null;

    return LongPressFeedbackWrapper(
      child: InkWell(
        onTap: () =>
            ItemDetailsOverlay.showFullPage(context, item: item, fresh: true),
        onLongPress: () => showListingOptionsDialog(context,
            item: item,
            contextType: ListingOptionsContext.explore,
            onWishlistChanged: onFavoriteToggle,
            onVisibilityChanged: () => Navigator.of(context).maybePop()),
        borderRadius: BorderRadius.circular(20),
        mouseCursor: SystemMouseCursors.basic,
        splashColor: Colors.transparent,
        highlightColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: isDark
                ? AppTheme.glassSurface(context)
                : AppTheme.surfacePrimary(context),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppTheme.glassStroke(context)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.22 : 0.10),
                blurRadius: isDark ? 16 : 14,
                offset: const Offset(0, 10),
              )
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AspectRatio(
              aspectRatio: 1.55,
              child: Stack(fit: StackFit.expand, children: [
                AppImage(
                    url: item.photos.isNotEmpty ? item.photos.first : '',
                    fit: BoxFit.cover),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 68,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          AppTheme.imageScrim(context)
                        ],
                      ),
                    ),
                  ),
                ),
                // Verified symbol only (top-left): green if verified, grey otherwise.
                Positioned(
                  top: 10,
                  left: 10,
                  child: Icon(Icons.verified,
                      size: 18,
                      color: _isVerified ? BrandColors.success : Colors.grey),
                ),
                if (highlight != null)
                  Positioned(
                    left: 10,
                    bottom: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 4),
                      decoration: BoxDecoration(
                        color: cs.primary.withValues(alpha: 0.92),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                            color: Colors.white.withValues(alpha: 0.12)),
                      ),
                      child: Text(
                        highlight,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: ((Theme.of(context)
                                          .textTheme
                                          .labelSmall
                                          ?.fontSize) ??
                                      11) *
                                  0.78,
                            ),
                      ),
                    ),
                  ),
                Positioned(
                  top: 10,
                  right: 10,
                  child: GestureDetector(
                    onTap: onFavoriteToggle,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.92),
                          shape: BoxShape.circle),
                      child: Icon(
                          isFavorite ? Icons.favorite : Icons.favorite_border,
                          size: 16,
                          color:
                              isFavorite ? BrandColors.danger : Colors.black54),
                    ),
                  ),
                ),

                // Rating badge bottom-right on image
                if (displayRating != null)
                  Positioned(
                      right: 10,
                      bottom: 10,
                      child: RatingBadge(rating: displayRating)),
              ]),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 7, 10, 4),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final body = Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                                fontSize: 15.5,
                                color: titleColor,
                              )),
                          const SizedBox(height: 2),
                          SizedBox(
                            height: (16 * textScale).clamp(16, 20).toDouble(),
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: Row(children: [
                                Builder(
                                  builder: (context) {
                                    final baseStyle =
                                        Theme.of(context).textTheme.labelSmall;
                                    final style = baseStyle?.copyWith(
                                      color: metaColor,
                                      fontWeight: FontWeight.w500,
                                      fontSize:
                                          (baseStyle.fontSize ?? 11) * 0.95,
                                      letterSpacing: -0.05,
                                    );

                                    const iconSize = 12.0;
                                    return Row(children: [
                                      Icon(Icons.place_outlined,
                                          size: iconSize, color: metaIconColor),
                                      const SizedBox(width: 3),
                                      Text(
                                          listingLocationLabel(
                                            distanceKm: distanceKm,
                                            listingCity: item.city,
                                            unavailableLabel:
                                                l10n.t('Nicht verfügbar'),
                                          ),
                                          style: style),
                                      const SizedBox(width: 6),
                                      Icon(Icons.loop,
                                          size: iconSize, color: metaIconColor),
                                      const SizedBox(width: 3),
                                      Text(
                                          '${item.timesLent.clamp(0, 999)} ${l10n.t('Vermietungen')}',
                                          style: style),
                                    ]);
                                  },
                                ),
                              ]),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Flexible(
                                  child: FittedBox(
                                    fit: BoxFit.scaleDown,
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                        listingCustomerPriceText(
                                          item.pricePerDay,
                                          currency: item.currency,
                                        ),
                                        style: theme.textTheme.titleMedium
                                            ?.copyWith(
                                          color: priceColor,
                                          fontWeight: FontWeight.w700,
                                        )),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 1),
                                  child: Text('/ ${l10n.t('Tag')}',
                                      style:
                                          theme.textTheme.bodySmall?.copyWith(
                                        color: priceSuffixColor,
                                        fontWeight: FontWeight.w500,
                                      )),
                                ),
                              ]),
                        ]);

                    return Align(
                      alignment: Alignment.topLeft,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.topLeft,
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                              minWidth: constraints.maxWidth,
                              maxWidth: constraints.maxWidth),
                          child: body,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _SquareTitleOnlyCard extends StatefulWidget {
  final Item item;
  const _SquareTitleOnlyCard({required this.item});
  @override
  State<_SquareTitleOnlyCard> createState() => _SquareTitleOnlyCardState();
}

class _SquareTitleOnlyCardState extends State<_SquareTitleOnlyCard> {
  final GlobalKey _key = GlobalKey();
  Timer? _pressTimer;
  bool _pointerDown = false;
  bool get _isVerified =>
      widget.item.verificationStatus == 'approved' ||
      widget.item.verificationStatus == 'verified';

  void _startPressTimer() {
    _pressTimer?.cancel();
    _pressTimer = Timer(const Duration(seconds: 1), () {
      if (!_pointerDown) return;
      final ctx = _key.currentContext;
      if (ctx != null) {
        final box = ctx.findRenderObject() as RenderBox;
        final pos = box.localToGlobal(Offset.zero);
        final size = box.size;
        _OverlayPresenter.showEnlarged(context, widget.item,
            Rect.fromLTWH(pos.dx, pos.dy, size.width, size.height));
      }
    });
  }

  void _cancelTimer() {
    _pressTimer?.cancel();
    _pressTimer = null;
  }

  @override
  void dispose() {
    _cancelTimer();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.basic,
      child: GestureDetector(
        onTapDown: (_) {
          _pointerDown = true;
          _startPressTimer();
        },
        onTapUp: (_) {
          _pointerDown = false;
          _cancelTimer();
        },
        onTapCancel: () {
          _pointerDown = false;
          _cancelTimer();
        },
        child: GestureDetector(
          key: _key,
          onTap: () => ItemDetailsOverlay.showFullPage(context,
              item: widget.item, fresh: true),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Stack(children: [
              Positioned.fill(
                child: LayoutBuilder(builder: (context, c) {
                  return AppImage(
                    url: widget.item.photos.isNotEmpty
                        ? widget.item.photos.first
                        : '',
                    fit: BoxFit.cover,
                  );
                }),
              ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border:
                        Border.all(color: Colors.white.withValues(alpha: 0.10)),
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.0),
                          Colors.black.withValues(alpha: 0.55),
                        ]),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(widget.item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white)),
                      // Date removed per request
                    ],
                  ),
                ),
              ),
              Positioned(
                top: 8,
                left: 8,
                child: _isVerified
                    ? const Icon(Icons.verified,
                        size: 16, color: BrandColors.success)
                    : const Tooltip(
                        message: 'Nicht verifiziert',
                        child: Icon(Icons.verified_outlined,
                            size: 16, color: Colors.grey)),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _ShimmerBox extends StatefulWidget {
  const _ShimmerBox();
  @override
  State<_ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<_ShimmerBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  @override
  void initState() {
    super.initState();
    _c = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        return DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            gradient: LinearGradient(
              begin: Alignment(-1 + 2 * _c.value, -1),
              end: Alignment(0 + 2 * _c.value, 1),
              colors: [
                Colors.white.withValues(alpha: 0.08),
                Colors.white.withValues(alpha: 0.20),
                Colors.white.withValues(alpha: 0.08),
              ],
            ),
          ),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _HoverSpinAppLogo extends StatefulWidget {
  final double size;
  const _HoverSpinAppLogo({required this.size});
  @override
  State<_HoverSpinAppLogo> createState() => _HoverSpinAppLogoState();
}

class _HoverSpinAppLogoState extends State<_HoverSpinAppLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 700));
  late final Animation<double> _turns = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic));

  void _spinOnce() {
// Restart from 0 so each hover completes a single rotation
    _controller.forward(from: 0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: MouseRegion(
        onEnter: (_) => _spinOnce(),
        child: Center(
          child: RotationTransition(
            turns: _turns,
            child: Image.asset(
                'assets/images/icononly_transparent_nobuffer.png',
                fit: BoxFit.contain),
          ),
        ),
      ),
    );
  }
}
