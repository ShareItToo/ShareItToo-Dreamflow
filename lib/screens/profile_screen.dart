import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/my_listings_screen.dart';
import 'package:lendify/screens/owner_requests_screen.dart';
import 'package:lendify/screens/placeholder_screen.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/screens/account_settings_screen.dart';
import 'package:lendify/screens/bookings_screen.dart';
import 'package:lendify/screens/help_center_screen.dart';
import 'package:lendify/screens/legal_screen.dart';
import 'package:lendify/screens/language_screen.dart';
import 'package:lendify/widgets/profile_header_card.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/box_chat_icon.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/profile_logged_out_banner.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/notifications_screen.dart';
import 'package:lendify/widgets/identity_verification_unavailable.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

class ProfileScreen extends StatefulWidget {
  final SessionTransitionService? sessionTransitionService;

  const ProfileScreen({
    super.key,
    this.sessionTransitionService,
  });

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  User? _user;
  int _myListingsCount = 0;
  int _completedBookingsCount = 0;
  bool _isLoading = true;
  bool _hasNewRequests = false;
  bool _isLoggedOutUser = false;
  bool _hasActiveSession = false;
  bool _isProfileSearchOpen = false;
  late final SessionTransitionService _sessionTransitions;
  StreamSubscription<String>? _persistenceSubscription;
  SessionTransitionOwner? _activeSessionOwner;
  SessionTransitionOwner? _logoutInteractionOwner;
  TrackedDialogRouteHandle<bool>? _activeLogoutDialog;
  int _loadRevision = 0;
  // Feedback state
  final TextEditingController _feedbackCtrl = TextEditingController();
  final FocusNode _feedbackFocus = FocusNode();
  bool _sendingFeedback = false;
  final TextEditingController _profileSearchCtrl = TextEditingController();
  final FocusNode _profileSearchFocus = FocusNode();
  final List<_ProfileSearchEntry> _profileSearchEntries = const [
    _ProfileSearchEntry(
      id: 'account_settings',
      labelKey: 'profile.menu.accountSettings',
      titleFallback: 'Kontoeinstellungen',
      icon: Icons.settings_outlined,
      route: '/accountSettings',
      description: 'Login, Passwort, Adresse, Sicherheit',
      keywords: [
        'konto',
        'passwort',
        'login',
        'sicherheit',
        'email',
        'telefon',
        'adresse',
        '2fa',
        'zweifaktor',
        'zahlungsmethoden'
      ],
    ),
    _ProfileSearchEntry(
      id: 'notifications',
      titleFallback: 'Benachrichtigungen',
      icon: Icons.notifications_outlined,
      description: 'Push, E-Mail, Ruhezeiten',
      keywords: ['push', 'meldungen', 'hinweise', 'ruhe', 'unread'],
      action: _ProfileSearchEntryAction.notifications,
    ),
    _ProfileSearchEntry(
      id: 'help_center',
      labelKey: 'profile.menu.helpCenter',
      titleFallback: 'Hilfe-Center',
      icon: Icons.help_outline,
      route: '/help',
      description: 'FAQ, Support, Kontakt',
      keywords: ['support', 'faq', 'kontakt', 'hilfe', 'problem'],
    ),
    _ProfileSearchEntry(
      id: 'legal',
      labelKey: 'profile.menu.legal',
      titleFallback: 'Rechtliches',
      icon: Icons.article_outlined,
      route: '/legal',
      description: 'AGB, Datenschutz, Richtlinien',
      keywords: [
        'agb',
        'datenschutz',
        'recht',
        'bedingungen',
        'richtlinien',
        'impressum'
      ],
    ),
    _ProfileSearchEntry(
      id: 'language',
      labelKey: 'profile.menu.language',
      titleFallback: 'Sprache',
      icon: Icons.language,
      route: '/language',
      description: 'App-Sprache',
      keywords: ['language', 'sprache', 'übersetzung'],
    ),
    _ProfileSearchEntry(
      id: 'verification',
      titleFallback: 'Verifizierung',
      icon: Icons.verified_user_outlined,
      route: '/verify',
      description: 'Identitätsprüfung',
      keywords: ['verifizieren', 'ausweis', 'identität', 'prüfung'],
    ),
  ];

  FeedbackValidation _validateFeedback(String input) {
    final raw = input;
    final text = raw.trim();
    if (text.isEmpty) {
      return const FeedbackValidation(valid: false, reason: null);
    }

    // 1) Mindestlänge
    if (text.runes.length < 20) {
      return const FeedbackValidation(
          valid: false,
          reason: 'Bitte beschreibe dein Feedback etwas genauer.');
    }

    // Normalize to simplify word analysis.
    final normalized = text
        .toLowerCase()
        .replaceAll(RegExp(r"[\n\t]+"), ' ')
        .replaceAll(RegExp(r"[^\p{L}\p{N} ]", unicode: true), ' ')
        .replaceAll(RegExp(r"\s+"), ' ')
        .trim();

    // 2) Wörterprüfung: mindestens 3 echte Wörter.
    final words = normalized.isEmpty ? <String>[] : normalized.split(' ');
    final realWords = <String>[];
    for (final w in words) {
      if (_isRealWord(w)) realWords.add(w);
    }

    if (realWords.length < 3) {
      return const FeedbackValidation(
          valid: false,
          reason: 'Bitte formuliere dein Feedback mit mindestens 3 Wörtern.');
    }

    // 3) Zeichenvielfalt / Wiederholungsmuster.
    final nonSpace = text.replaceAll(RegExp(r"\s+"), '');
    if (nonSpace.isNotEmpty) {
      final freq = <String, int>{};
      for (final r in nonSpace.runes) {
        final ch = String.fromCharCode(r).toLowerCase();
        freq[ch] = (freq[ch] ?? 0) + 1;
      }
      final maxCount = freq.values.fold<int>(0, (m, v) => v > m ? v : m);
      final ratio = maxCount / nonSpace.runes.length;
      if (ratio > 0.60) {
        return const FeedbackValidation(
            valid: false,
            reason: 'Bitte formuliere dein Feedback etwas konkreter.');
      }
    }

    // 3b) Nur ein Wort wiederholt (z.B. "test test test").
    final uniqueRealWords = realWords.toSet();
    if (uniqueRealWords.length == 1 && realWords.length >= 3) {
      return const FeedbackValidation(
          valid: false,
          reason: 'Bitte formuliere dein Feedback abwechslungsreicher.');
    }

    // 4) Spam-/Unsinnsfilter (Heuristiken)
    if (_looksLikeRandomLetters(normalized)) {
      return const FeedbackValidation(
          valid: false,
          reason: 'Bitte formuliere dein Feedback etwas konkreter.');
    }

    if (_looksLikeGenericSpam(realWords)) {
      return const FeedbackValidation(
          valid: false, reason: 'Bitte beschreibe kurz, was genau du meinst.');
    }

    return const FeedbackValidation(valid: true, reason: null);
  }

  bool _isRealWord(String word) {
    final w = word.trim();
    if (w.length < 2) return false;
    if (!RegExp(r"^[\p{L}\p{N}]+$", unicode: true).hasMatch(w)) return false;

    // Reject obvious keyboard spam / repeated patterns (asdf, aaaaa, xyzxyz, testtesttest)
    if (RegExp(r"^(.)\1{3,}$").hasMatch(w)) return false; // aaaa...
    if (_isRepeatedChunk(w)) return false; // xyzxyz, testtest...

    // Require at least one letter. If it's only digits, treat it as not a "real word".
    final hasLetter = RegExp(r"\p{L}", unicode: true).hasMatch(w);
    if (!hasLetter) return false;

    // A lightweight natural-language heuristic: at least one vowel.
    // (Allows DE umlauts and common latin vowels.)
    final hasVowel = RegExp(r"[aeiouäöüy]", unicode: true).hasMatch(w);
    if (!hasVowel) return false;

    return true;
  }

  bool _isRepeatedChunk(String word) {
    final w = word;
    if (w.length < 4) return false;
    for (int len = 2; len <= (w.length ~/ 2); len++) {
      if (w.length % len != 0) continue;
      final chunk = w.substring(0, len);
      final repeated = chunk * (w.length ~/ len);
      if (repeated == w) return true;
    }
    return false;
  }

  bool _looksLikeRandomLetters(String normalized) {
    // If it's mostly letters, but has very low vowel ratio and many distinct letters,
    // it's likely random text (e.g., "xqtrplm..." or "asdfghj...").
    final lettersOnly =
        normalized.replaceAll(RegExp(r"[^\p{L}]", unicode: true), '');
    if (lettersOnly.length < 20) return false;
    final vowels =
        RegExp(r"[aeiouäöüy]", unicode: true).allMatches(lettersOnly).length;
    final vowelRatio = vowels / lettersOnly.length;
    if (vowelRatio >= 0.18) return false;

    final distinct = lettersOnly.split('').toSet().length;
    final distinctRatio = distinct / lettersOnly.length;
    return distinctRatio > 0.25;
  }

  bool _looksLikeGenericSpam(List<String> realWords) {
    // Reject feedback that is basically a loop of generic filler words.
    const generic = {
      'ok',
      'okay',
      'gut',
      'nice',
      'cool',
      'top',
      'super',
      'danke',
      'thanks',
      'merci',
      'great',
      'perfekt',
    };
    final unique = realWords.toSet();
    if (unique.isEmpty) return false;
    if (unique.every(generic.contains) && realWords.length >= 3) return true;
    return false;
  }

  @override
  void initState() {
    super.initState();
    _sessionTransitions =
        widget.sessionTransitionService ?? const SessionTransitionService();
    _persistenceSubscription =
        SharedPersistenceSync.changes.listen(_onPersistenceChanged);
    _load();
  }

  @override
  void dispose() {
    _persistenceSubscription?.cancel();
    _activeLogoutDialog?.dismiss(false);
    _feedbackCtrl.dispose();
    _feedbackFocus.dispose();
    _profileSearchCtrl.dispose();
    _profileSearchFocus.dispose();
    super.dispose();
  }

  void _onPersistenceChanged(String key) {
    if (key != SharedPersistenceSync.accountSecurityStateKey) return;
    final owner = _logoutInteractionOwner;
    final handle = _activeLogoutDialog;
    if (owner != null && handle != null) {
      unawaited(_dismissLogoutDialogIfOwnerChanged(owner, handle));
    }
    unawaited(_load());
  }

  Future<void> _dismissLogoutDialogIfOwnerChanged(
    SessionTransitionOwner owner,
    TrackedDialogRouteHandle<bool> handle,
  ) async {
    if (await _sessionTransitions.isOwnerCurrent(owner)) return;
    if (!mounted ||
        !identical(_logoutInteractionOwner, owner) ||
        !identical(_activeLogoutDialog, handle)) {
      return;
    }
    handle.dismiss(false);
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    final startingEpoch = _sessionTransitions.sessionEpoch;
    User? maybeUser;
    AuthSession? session;
    SessionTransitionOwner? owner;
    try {
      session = await _sessionTransitions.readSession();
      if (session != null) {
        owner = _sessionTransitions.captureOwner(session);
        maybeUser = await _sessionTransitions.currentUserForOwner(owner);
      }
    } catch (e, st) {
      debugPrint('[Profile] Failed to load user: $e');
      debugPrint(st.toString());
      // Keep the exact session-bound cached profile visible while offline.
      // A real logout or mismatched cache continues to fail closed.
      session ??= await _sessionTransitions.readSession();
      if (session != null) {
        owner ??= _sessionTransitions.captureOwner(session);
        maybeUser = await _sessionTransitions.cachedCurrentUserForOwner(owner);
      }
    }

    if (!mounted || revision != _loadRevision) return;
    final hasSession = session != null &&
        owner != null &&
        await _sessionTransitions.isOwnerCurrent(owner);
    if (session == null) {
      final confirmedEmptyEpoch = _sessionTransitions.sessionEpoch;
      if (confirmedEmptyEpoch < startingEpoch ||
          !await _sessionTransitions.isNoSessionEpochCurrent(
            confirmedEmptyEpoch,
          )) {
        return;
      }
    }
    if (!hasSession) maybeUser = null;
    if (hasSession && maybeUser != null) {
      owner = _sessionTransitions.captureOwner(
        session,
        profileUserId: maybeUser.id,
      );
      if (!await _sessionTransitions.isOwnerCurrent(owner)) return;
    }

    final bool loggedOut = !hasSession || maybeUser == null;
    final user = loggedOut ? _guestUser() : maybeUser;
    if (!mounted || revision != _loadRevision) return;
    setState(() {
      _activeSessionOwner = hasSession ? owner : null;
      _user = user;
      _myListingsCount = 0;
      _completedBookingsCount = 0;
      _isLoading = false;
      _hasNewRequests = false;
      _isLoggedOutUser = loggedOut;
      _hasActiveSession = hasSession;
    });
    if (loggedOut) return;

    // The session-bound profile is useful immediately, even while offline.
    // Network-backed counters may take longer and update independently.
    unawaited(_loadProfileStats(user, owner!));
  }

  Future<void> _loadProfileStats(
    User user,
    SessionTransitionOwner owner,
  ) async {
    int count = 0;
    bool hasNew = false;
    int completedBookings = 0;
    await Future.wait<void>([
      (() async {
        try {
          final items = await DataService.getItems();
          count = items.where((e) => e.ownerId == user.id).length;
          hasNew = await DataService.hasNewOwnerRequests(user.id);
        } catch (e) {
          debugPrint('[Profile] Failed to load stats: $e');
        }
      })(),
      (() async {
        try {
          final renterCompleted = await DataService.getRentalRequestsForRenter(
            user.id,
            status: 'completed',
          );
          completedBookings = renterCompleted.length;
        } catch (e) {
          debugPrint('[Profile] Failed to compute completed bookings: $e');
        }
      })(),
    ]);

    final ownerCurrent = await _sessionTransitions.isOwnerCurrent(owner);
    if (!mounted) return;
    // A stale A statistics response has no authority to replace B with guest
    // state. The account-change reload owns the successor presentation.
    if (!ownerCurrent) return;
    if (_user?.id != user.id ||
        !_hasActiveSession ||
        !identical(_activeSessionOwner, owner)) {
      return;
    }
    setState(() {
      _myListingsCount = count;
      _completedBookingsCount = completedBookings;
      _hasNewRequests = hasNew;
    });
  }

  void _toggleProfileSearch() {
    setState(() {
      _isProfileSearchOpen = !_isProfileSearchOpen;
      if (_isProfileSearchOpen) {
        _profileSearchCtrl.clear();
        Future.microtask(() => _profileSearchFocus.requestFocus());
      } else {
        _profileSearchCtrl.clear();
        _profileSearchFocus.unfocus();
      }
    });
  }

  List<_ProfileSearchEntry> _profileSearchResults(LocalizationController l10n) {
    final query = _profileSearchCtrl.text.trim().toLowerCase();
    final entries = _profileSearchEntries;
    if (query.isEmpty) return const [];
    return entries.where((entry) {
      final haystack = <String>[
        entry.title(l10n).toLowerCase(),
        if (entry.description != null) entry.description!.toLowerCase(),
        ...entry.keywords.map((k) => k.toLowerCase()),
      ];
      return haystack.any((text) => text.contains(query));
    }).toList();
  }

  void _openProfileSearchEntry(_ProfileSearchEntry entry,
      {required bool isGuest}) {
    _profileSearchFocus.unfocus();
    setState(() {
      _isProfileSearchOpen = false;
      _profileSearchCtrl.clear();
    });

    if (entry.route != null) {
      if (isGuest && _isLoginRequiredRoute(entry.route!)) {
        showGuestRestrictionSheet(context,
            gateContext: _guestGateContextForRoute(entry.route!));
        return;
      }
      _handleRoute(entry.route!);
      return;
    }

    if (entry.action != null) {
      switch (entry.action!) {
        case _ProfileSearchEntryAction.notifications:
          _openNotifications(isGuest: isGuest);
          break;
      }
    }
  }

  void _openNotifications({required bool isGuest}) {
    if (isGuest) {
      showGuestRestrictionSheet(
        context,
        overrideContent: const GuestGateContent(
          icon: Icons.notifications_outlined,
          title: 'Benachrichtigungen ansehen',
          description:
              'Melde dich an oder registriere dich kostenlos, um deine persönlichen Benachrichtigungen zu sehen.',
          benefits: [
            'Buchungsstatus im Blick behalten',
            'Neue Nachrichten nicht verpassen',
            'Wichtige Konto-Hinweise erhalten'
          ],
        ),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const NotificationsScreen()),
    );
  }

  User _guestUser() {
    final now = DateTime.now();
    return User(
      id: 'guest-user',
      displayName: 'Gast',
      email: '',
      city: '',
      country: '',
      preferredLanguage: 'de-DE',
      isVerified: false,
      isBanned: false,
      role: 'guest',
      avgRating: 0,
      reviewCount: 0,
      createdAt: now,
      photoURL: null,
      languages: const ['Deutsch'],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    context.watch<DeveloperPreviewController>();
    final isGuest = !_hasActiveSession || _isLoggedOutUser;
    // Never invent account details while the real profile is loading.
    final userForDisplay = _user ?? _guestUser();
    final verified = userForDisplay.isVerified;
    final bool hasAnyNotifications =
        _hasNewRequests; // extend when adding more sources
    final hasProfileQuery =
        _isProfileSearchOpen && _profileSearchCtrl.text.trim().isNotEmpty;
    final searchResults = _isProfileSearchOpen
        ? _profileSearchResults(l10n)
        : const <_ProfileSearchEntry>[];
    final visibleProfileResults =
        hasProfileQuery ? searchResults : const <_ProfileSearchEntry>[];
    final showProfileSearchEmpty = hasProfileQuery && searchResults.isEmpty;
    // JSON-like spec that defines the Profile menu structure
    final Map<String, dynamic> menuSpec = {
      'primaryActions': [
        {
          'id': 'verify_now',
          'labelKey': 'profile.action.verificationUnavailable',
          'icon': 'badge-check',
          'route': '/verify',
          'visibleWhen': !verified,
          'enabled': false,
        },
        {
          'id': 'view_public_profile',
          'labelKey': 'profile.action.viewMyProfile',
          'icon': 'user',
          'route': '/myProfilePublic',
          'visibleWhen': true,
        },
      ],
      'mainMenu': [
        {
          'id': 'my_listings',
          'labelKey': 'profile.menu.myListings',
          'icon': 'storefront',
          'route': '/myListings',
        },
        {
          'id': 'rental_requests',
          'labelKey': 'profile.menu.rentalRequests',
          'icon': 'requests',
          'route': '/ownerRequests',
          'showDot': _hasNewRequests,
        },
        {
          'id': 'my_bookings',
          'labelKey': 'profile.menu.myBookings',
          'icon': 'calendar',
          'route': '/bookings',
          // Only show when real notifications exist (not implemented yet)
          // 'showDot': _hasNewBookings,
        },
      ],
      'secondaryMenu': [
        {
          'id': 'account_settings',
          'labelKey': 'profile.menu.accountSettings',
          'icon': 'settings',
          'route': '/accountSettings',
          // 'showDot': _hasNewAccountNotices,
        },
        {
          'id': 'help_center',
          'labelKey': 'profile.menu.helpCenter',
          'icon': 'help',
          'route': '/help',
          // 'showDot': _hasNewHelpUpdates,
        },
        {
          'id': 'legal',
          'labelKey': 'profile.menu.legal',
          'icon': 'legal',
          'route': '/legal',
          // 'showDot': _hasNewLegalUpdates,
        },
        {
          'id': 'language',
          'labelKey': 'profile.menu.language',
          'icon': 'language',
          'route': '/language',
        },
        {
          'id': 'logout',
          'labelKey': 'profile.menu.logout',
          'icon': 'logout',
          'route': '/logout',
          'destructive': true,
        },
      ],
    };
    final profileKey = ValueKey(
        'profile-${userForDisplay.id}-$_myListingsCount-${userForDisplay.avgRating.toStringAsFixed(2)}-${userForDisplay.reviewCount}');
    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: true,
        leading: IconButton(
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(l10n.t('Mein SIT')),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(
                tooltip:
                    l10n.t(_isProfileSearchOpen ? 'Suche schließen' : 'Suchen'),
                onPressed: _toggleProfileSearch,
                icon: Icon(_isProfileSearchOpen ? Icons.close : Icons.search),
              ),
              Stack(children: [
                IconButton(
                  tooltip: l10n.t('Benachrichtigungen'),
                  onPressed: () => _openNotifications(isGuest: isGuest),
                  icon: const Icon(Icons.notifications_outlined),
                ),
                if (hasAnyNotifications)
                  Positioned(
                      right: 8,
                      top: 8,
                      child: Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                              color: Color(0xFFFFB277),
                              shape: BoxShape.circle))),
              ]),
            ]),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 16, 16, 40),
        child: Column(children: [
          if (_isProfileSearchOpen) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.30),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: Column(children: [
                Semantics(
                  label: l10n.t('Profil durchsuchen'),
                  textField: true,
                  child: TextField(
                    controller: _profileSearchCtrl,
                    focusNode: _profileSearchFocus,
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) {
                      if (visibleProfileResults.isNotEmpty) {
                        _openProfileSearchEntry(visibleProfileResults.first,
                            isGuest: isGuest);
                      }
                    },
                    decoration: InputDecoration(
                      hintText: l10n.t(
                          'Nach Kontoeinstellungen, Hilfe oder Rechtlichem suchen'),
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: IconButton(
                        tooltip: l10n.t(_profileSearchCtrl.text.isEmpty
                            ? 'Suche schließen'
                            : 'Sucheingabe löschen'),
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          if (_profileSearchCtrl.text.isNotEmpty) {
                            setState(() {
                              _profileSearchCtrl.clear();
                            });
                            return;
                          }
                          _toggleProfileSearch();
                        },
                      ),
                      filled: true,
                      fillColor: Colors.black.withValues(alpha: 0.25),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(
                              color: Colors.white.withValues(alpha: 0.10))),
                      enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(
                              color: Colors.white.withValues(alpha: 0.10))),
                      focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(
                              color: Theme.of(context)
                                  .colorScheme
                                  .primary
                                  .withValues(alpha: 0.6))),
                    ),
                  ),
                ),
                if (!showProfileSearchEmpty &&
                    visibleProfileResults.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Column(children: [
                    for (final entry in visibleProfileResults)
                      ListTile(
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 4),
                        dense: true,
                        leading: Icon(entry.icon, color: Colors.white70),
                        title: Text(entry.title(l10n),
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium
                                ?.copyWith(color: Colors.white)),
                        subtitle: entry.description == null
                            ? null
                            : Text(entry.description!,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: Colors.white54)),
                        trailing: const Icon(Icons.chevron_right,
                            color: Colors.white38),
                        onTap: () =>
                            _openProfileSearchEntry(entry, isGuest: isGuest),
                      ),
                  ]),
                ] else if (showProfileSearchEmpty) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      l10n.t('Keine Treffer – versuche einen anderen Begriff.'),
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.white60),
                    ),
                  ),
                ],
              ]),
            ),
          ],
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            transitionBuilder: (child, animation) =>
                FadeTransition(opacity: animation, child: child),
            layoutBuilder: (currentChild, previousChildren) => Stack(
              alignment: Alignment.topCenter,
              children: [
                ...previousChildren,
                if (currentChild != null) currentChild,
              ],
            ),
            child: AnimatedOpacity(
              key: profileKey,
              duration: const Duration(milliseconds: 200),
              opacity: _isLoading ? 0.55 : 1.0,
              child: ProfileHeaderCard(
                user: userForDisplay,
                listingsCount: _myListingsCount,
                completedBookingsCount: _completedBookingsCount,
                onTap: isGuest
                    ? () => showGuestRestrictionSheet(context,
                        gateContext: GuestGateContext.profile)
                    : () => _handleRoute('/myProfilePublic'),
              ),
            ),
          ),
          if (isGuest) ...[
            const SizedBox(height: 12),
            const ProfileLoggedOutBanner(),
          ],
          const SizedBox(height: 16),
          // Primary actions (from JSON spec)
          Column(children: [
            for (final action in (menuSpec['primaryActions'] as List))
              if (action['visibleWhen'] == true) ...[
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: action['enabled'] == false
                        ? null
                        : () {
                            final route = action['route'] as String;
                            if (isGuest && _isLoginRequiredRoute(route)) {
                              showGuestRestrictionSheet(context,
                                  gateContext:
                                      _guestGateContextForRoute(route));
                              return;
                            }
                            _handleRoute(route);
                          },
                    icon: _iconFromSpec(action['icon'] as String),
                    label: Text(l10n.t(action['labelKey'] as String)),
                  ),
                ),
                const SizedBox(height: 16),
              ],
          ]),
          const SizedBox(height: 24),
          Container(
            decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.30),
                borderRadius: BorderRadius.circular(16),
                border:
                    Border.all(color: Colors.white.withValues(alpha: 0.08))),
            child: Column(children: [
              for (int i = 0;
                  i < (menuSpec['mainMenu'] as List).length;
                  i++) ...[
                _buildMenuFromSpec(
                    menuSpec['mainMenu'][i] as Map<String, dynamic>, l10n,
                    isGuest: isGuest),
                if (i < (menuSpec['mainMenu'] as List).length - 1) _divider(),
              ],
            ]),
          ),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.30),
                borderRadius: BorderRadius.circular(16),
                border:
                    Border.all(color: Colors.white.withValues(alpha: 0.08))),
            child: Column(children: [
              for (int i = 0;
                  i < (menuSpec['secondaryMenu'] as List).length;
                  i++) ...[
                _buildMenuFromSpec(
                    menuSpec['secondaryMenu'][i] as Map<String, dynamic>, l10n,
                    isGuest: isGuest),
                if (i < (menuSpec['secondaryMenu'] as List).length - 1)
                  _divider(),
              ],
            ]),
          ),
          const SizedBox(height: 16),
          _buildFeedbackSection(),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }

  Widget _divider() =>
      const Divider(height: 1, thickness: 1, color: Colors.white24);

  // removed legacy _svgIcon helper after switching to composed icon

  Widget _buildMenuItem(
    IconData icon,
    String title, {
    bool isDestructive = false,
    bool showDot = false,
    bool locked = false,
    Widget? leadingOverride,
    VoidCallback? onTapOverride,
  }) {
    final l10n = context.read<LocalizationController>();
    // Place the dot left (on the leading icon) for all items that request a dot
    final placeDotLeft = showDot;
    final baseLeading = leadingOverride ??
        Icon(icon, color: isDestructive ? Colors.red : Colors.white70);
    final leadingWithDotLeft = SizedBox(
      width: 28,
      height: 28,
      child: Stack(clipBehavior: Clip.none, children: [
        // Center the original leading widget
        Center(
            child: SizedBox(
                width: 22, height: 22, child: FittedBox(child: baseLeading))),
        // Orange badge; after feedback: move ~1mm back towards center on both axes
        // ~1mm ≈ 4.2 logical px on typical densities
        Positioned(
            left: -4.2,
            top: -2.2,
            child: Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                    color: Color(0xFFFFB277), shape: BoxShape.circle))),
      ]),
    );

    final tile = ListTile(
      leading: placeDotLeft ? leadingWithDotLeft : baseLeading,
      title: Text(title,
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: isDestructive ? Colors.red : Colors.white)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (locked) ...[
            const Icon(Icons.lock_outline, color: Colors.white54, size: 18),
            const SizedBox(width: 8),
          ],
          if (showDot && !placeDotLeft) ...[
            Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                    color: Color(0xFFFFB277), shape: BoxShape.circle)),
            const SizedBox(width: 8),
          ],
          const Icon(Icons.chevron_right, color: Colors.white38),
        ],
      ),
      onTap: () {
        if (onTapOverride != null) {
          onTapOverride();
          return;
        }
        switch (title) {
          case 'Meine Anzeigen':
          case 'My listings':
            Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const MyListingsScreen()));
            break;
          case 'Meine Buchungen':
          case 'My bookings':
            Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const BookingsScreen()));
            break;
          case 'Anfragen':
          case 'Requests':
          case 'Mietanfragen':
            Navigator.of(context)
                .push(MaterialPageRoute(
                    builder: (_) =>
                        const OwnerRequestsScreen(initialTabIndex: 2)))
                .then((_) {
              if (mounted) {
                _load();
              }
            });
            break;
          case 'Kontakte':
          case 'Contacts':
            Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => PlaceholderScreen(
                    title: l10n.t('Kontakte'),
                    description:
                        l10n.t('Verwalte deine Kontakte und Vermieter.'))));
            break;
          case 'Kontoeinstellungen':
          case 'Account settings':
            Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => const AccountSettingsScreen()));
            break;
          case 'Hilfe-Center':
          case 'Help Center':
            Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const HelpCenterScreen()));
            break;
          case 'Rechtliches':
          case 'Legal':
            Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const LegalScreen()));
            break;
          case 'Sprache':
          case 'Language':
            Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const LanguageScreen()));
            break;
          case 'Abmelden':
          case 'Log out':
            unawaited(_confirmLogout());
            break;
          default:
            AppPopup.toast(context,
                icon: Icons.hourglass_bottom, title: l10n.t('Bald verfügbar'));
        }
      },
    );

    if (!locked) return tile;
    return Opacity(opacity: 0.90, child: tile);
  }

  // Build a menu entry from the JSON-like spec
  Widget _buildMenuFromSpec(
      Map<String, dynamic> spec, LocalizationController l10n,
      {required bool isGuest}) {
    final title = l10n.t(spec['labelKey'] as String);
    final String? id = spec['id'] as String?;
    if (isGuest && id == 'logout') {
      return const SizedBox.shrink();
    }
    final iconName = (spec['icon'] as String?) ?? '';
    final showDot = (spec['showDot'] as bool?) ?? false;
    final isDestructive = (spec['destructive'] as bool?) ?? false;
    final iconData = _iconDataFromSpec(iconName);
    final leadingOverride = iconName == 'requests'
        ? const BoxChatIcon(size: 22, color: Colors.white70)
        : null;
    final String? route = spec['route'] as String?;

    final bool locked =
        isGuest && route != null && _isLoginRequiredRoute(route);
    return _buildMenuItem(
      iconData,
      title,
      isDestructive: isDestructive,
      showDot: showDot,
      locked: locked,
      leadingOverride: leadingOverride,
      onTapOverride: route != null
          ? () {
              if (locked) {
                // Be explicit for menu IDs to avoid mismatches when routes/titles change.
                final GuestGateContext gateContext = switch (id) {
                  'rental_requests' => GuestGateContext.rentalRequest,
                  'my_listings' => GuestGateContext.listing,
                  'my_bookings' => GuestGateContext.booking,
                  'account_settings' => GuestGateContext.accountSettings,
                  'verify_now' => GuestGateContext.verification,
                  'view_public_profile' => GuestGateContext.profile,
                  _ => _guestGateContextForRoute(route),
                };
                showGuestRestrictionSheet(context, gateContext: gateContext);
                // Intentionally kept as a compact guest gate sheet.
                return;
              }
              _handleRoute(route);
            }
          : null,
    );
  }

  bool _isLoginRequiredRoute(String route) {
    // We allow exploration in guest mode, but these features are tied to the user's account.
    switch (route) {
      case '/myListings':
      case '/ownerRequests':
      case '/bookings':
      case '/accountSettings':
      case '/myProfilePublic':
      case '/verify':
      case '/logout':
        return true;
      default:
        return false;
    }
  }

  GuestGateContext _guestGateContextForRoute(String route) {
    // Be defensive: some call sites may pass query-like strings.
    if (route.startsWith('/verify')) return GuestGateContext.verification;
    if (route.startsWith('/bookings')) return GuestGateContext.booking;
    if (route.startsWith('/accountSettings')) {
      return GuestGateContext.accountSettings;
    }
    if (route.startsWith('/myProfilePublic')) return GuestGateContext.profile;
    if (route.startsWith('/myListings')) return GuestGateContext.listing;
    if (route.startsWith('/ownerRequests')) {
      return GuestGateContext.rentalRequest;
    }
    return GuestGateContext.generic;
  }

  // Map abstract icon names from the spec to Material icons
  Icon _iconFromSpec(String name) => Icon(_iconDataFromSpec(name));

  IconData _iconDataFromSpec(String name) {
    switch (name) {
      case 'badge-check':
        return Icons.verified_user_outlined;
      case 'user':
        return Icons.person_outline;
      case 'storefront':
        return Icons.storefront_outlined;
      case 'requests':
        return Icons.mark_unread_chat_alt_outlined;
      case 'calendar':
        return Icons.calendar_month_outlined;
      case 'settings':
        return Icons.settings_outlined;
      case 'help':
        return Icons.help_outline;
      case 'legal':
        return Icons.article_outlined;
      case 'language':
        return Icons.language;
      case 'logout':
        return Icons.logout;
      default:
        return Icons.chevron_right;
    }
  }

  void _handleRoute(String route) {
    switch (route) {
      case '/verify':
        showIdentityVerificationUnavailable(context);
        break;
      case '/myProfilePublic':
        Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const PublicProfileScreen()));
        break;
      case '/myListings':
        Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const MyListingsScreen()));
        break;
      case '/ownerRequests':
        Navigator.of(context)
            .push(MaterialPageRoute(
                builder: (_) => const OwnerRequestsScreen(initialTabIndex: 2)))
            .then((_) {
          if (mounted) {
            _load();
          }
        });
        break;
      case '/bookings':
        Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const BookingsScreen()));
        break;
      case '/accountSettings':
        Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const AccountSettingsScreen()));
        break;
      case '/help':
        Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const HelpCenterScreen()));
        break;
      case '/legal':
        Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const LegalScreen()));
        break;
      case '/language':
        Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const LanguageScreen()));
        break;
      case '/logout':
        unawaited(_confirmLogout());
        break;
      default:
        break;
    }
  }

  // Language selection moved to a dedicated screen (LanguageScreen).

  Future<void> _confirmLogout() async {
    final owner = _activeSessionOwner;
    if (owner == null || _activeLogoutDialog != null) return;
    final l10n = context.read<LocalizationController>();
    final preview = context.read<DeveloperPreviewController>();
    final mainNavigation = context.read<MainNavController>();
    final navigator = Navigator.of(context);
    final handle = TrackedDialogRouteHandle<bool>();
    _logoutInteractionOwner = owner;
    _activeLogoutDialog = handle;
    final confirmed = await showTrackedDialog<bool>(
      context: context,
      handle: handle,
      barrierLabel: l10n.t('Abmelden?'),
      builder: (_) {
        return AlertDialog(
          title: Text(l10n.t('Abmelden?')),
          content: Text(l10n.t('Du kannst dich jederzeit wieder anmelden.')),
          actions: [
            TextButton(
              onPressed: () => handle.dismiss(false),
              child: Text(l10n.t('Abbrechen')),
            ),
            FilledButton(
              onPressed: () => handle.dismiss(true),
              child: Text(l10n.t('Abmelden')),
            ),
          ],
        );
      },
    );
    if (identical(_activeLogoutDialog, handle)) {
      _activeLogoutDialog = null;
      _logoutInteractionOwner = null;
    }
    if (confirmed != true ||
        !mounted ||
        !await _sessionTransitions.isOwnerCurrent(owner)) {
      return;
    }

    final completion = await _sessionTransitions.signOut(owner);
    if (completion == null ||
        !completion.profileCleared ||
        !mounted ||
        !await _sessionTransitions.isCompletionCurrent(completion)) {
      return;
    }
    await preview.setState(DeveloperUserState.loggedOut);
    if (!mounted ||
        !await _sessionTransitions.isCompletionCurrent(completion)) {
      return;
    }
    setState(() {
      _activeSessionOwner = null;
      _user = _guestUser();
      _myListingsCount = 0;
      _completedBookingsCount = 0;
      _hasNewRequests = false;
      _isLoggedOutUser = true;
      _hasActiveSession = false;
    });
    if (!mounted ||
        !await _sessionTransitions.isCompletionCurrent(completion)) {
      return;
    }
    mainNavigation.setIndex(4);
    navigator.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const MainNavigation()),
      (route) => false,
    );
  }

  Widget _buildFeedbackSection() {
    final theme = Theme.of(context);
    final validation = _validateFeedback(_feedbackCtrl.text);
    final canSend = !_sendingFeedback && validation.valid;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.30),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.forum_outlined, color: Colors.white70),
              const SizedBox(width: 8),
              Text('Feedback zur App',
                  style: theme.textTheme.titleMedium?.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Sag uns, was dir gefällt – oder was wir besser machen können. Dein Feedback hilft uns, ShareItToo zu verbessern. Wir lesen jede Nachricht persönlich.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: Colors.white70, height: 1.5),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _feedbackCtrl,
            focusNode: _feedbackFocus,
            maxLines: 5,
            minLines: 3,
            onChanged: (_) => setState(() {}),
            style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white),
            decoration: InputDecoration(
              hintText:
                  'Was gefällt dir an ShareItToo – oder was können wir verbessern?',
              hintStyle:
                  theme.textTheme.bodyMedium?.copyWith(color: Colors.white38),
              filled: true,
              fillColor: Colors.black.withValues(alpha: 0.25),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      BorderSide(color: Colors.white.withValues(alpha: 0.10))),
              enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      BorderSide(color: Colors.white.withValues(alpha: 0.10))),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                      color: theme.colorScheme.primary.withValues(alpha: 0.6))),
            ),
          ),
          if (!validation.valid &&
              (_feedbackCtrl.text.trim().isNotEmpty) &&
              (validation.reason != null)) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Text(
                validation.reason!,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: Colors.white60, height: 1.35),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: canSend ? _submitFeedback : null,
                  child: _sendingFeedback
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Absenden'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sitCelebrationBadge() {
    // Show only the SIT logo (no round badge), exactly 46px and centered.
    // Nudge the logo visually ~1mm downward (~4 logical pixels)
    return SizedBox(
      width: 46,
      height: 46,
      child: Center(
        child: Transform.translate(
          offset: const Offset(0, 4),
          child: Image.asset(
            'assets/images/icononly_transparent_nobuffer.png',
            width: 46,
            height: 46,
          ),
        ),
      ),
    );
  }

  Future<void> _submitFeedback() async {
    if (_user == null) return;
    final text = _feedbackCtrl.text.trim();
    final validation = _validateFeedback(text);
    if (!validation.valid) return;
    setState(() {
      _sendingFeedback = true;
    });
    try {
      await DataService.addFeedback(userId: _user!.id, text: text);
      if (!mounted) return;
      setState(() {
        _feedbackCtrl.clear();
        _sendingFeedback = false;
      });
      _feedbackFocus.unfocus();

      await AppPopup.show(
        context,
        icon: Icons.check_circle_outline,
        title: 'Danke für dein Feedback',
        message:
            'Wir lesen jedes Feedback persönlich und nutzen es, um ShareItToo zu verbessern.',
        showCloseIcon: false,
        leadingWidget: _sitCelebrationBadge(),
        accentGradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            Theme.of(context).colorScheme.primary,
            Theme.of(context).colorScheme.primary,
          ],
        ),
        borderColor:
            Theme.of(context).colorScheme.primary.withValues(alpha: 0.25),
        useExploreBackground: true,
        actions: [
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () =>
                  Navigator.of(context, rootNavigator: true).maybePop(),
              child: const Text('Schließen'),
            ),
          ),
        ],
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sendingFeedback = false;
      });
      AppPopup.toast(
        context,
        icon: Icons.error_outline,
        title: 'Senden fehlgeschlagen',
        message: 'Bitte versuche es erneut.',
      );
    }
  }
}

@immutable
class FeedbackValidation {
  final bool valid;
  final String? reason;
  const FeedbackValidation({required this.valid, required this.reason});
}

enum _ProfileSearchEntryAction { notifications }

@immutable
class _ProfileSearchEntry {
  final String id;
  final String titleFallback;
  final String? labelKey;
  final IconData icon;
  final String? route;
  final _ProfileSearchEntryAction? action;
  final String? description;
  final List<String> keywords;
  const _ProfileSearchEntry({
    required this.id,
    required this.titleFallback,
    this.labelKey,
    required this.icon,
    this.route,
    this.action,
    this.description,
    this.keywords = const [],
  });

  String title(LocalizationController l10n) =>
      labelKey == null ? titleFallback : l10n.t(labelKey!);
}
