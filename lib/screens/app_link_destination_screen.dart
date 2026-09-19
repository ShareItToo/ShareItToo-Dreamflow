import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/booking_detail_screen.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/message_thread_screen.dart';
import 'package:lendify/screens/notifications_screen.dart';
import 'package:lendify/screens/ongoing_owner_detail_screen.dart';
import 'package:lendify/screens/request_detail_screen.dart';
import 'package:lendify/screens/payment_checkout_screen.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lendify/widgets/item_details_overlay.dart';

class AppLinkHost extends StatefulWidget {
  final Widget child;

  const AppLinkHost({super.key, required this.child});

  @override
  State<AppLinkHost> createState() => _AppLinkHostState();
}

class _AppLinkHostState extends State<AppLinkHost> {
  AppLinkController? _controller;
  StreamSubscription<String>? _principalSubscription;
  Route<void>? _activeOwnedRoute;
  AppLinkPrincipalOwner? _activeOwner;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    _principalSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) {
        _removeStaleOwnedRoute();
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = context.read<AppLinkController>();
    if (identical(next, _controller)) return;
    _controller?.removeListener(_handlePending);
    _controller = next..addListener(_handlePending);
    WidgetsBinding.instance.addPostFrameCallback((_) => _handlePending());
  }

  void _handlePending() {
    if (!mounted || _opening) return;
    final action = _controller?.takePending();
    if (action == null) return;
    _opening = true;
    unawaited(_openOwned(action));
  }

  Future<void> _openOwned(PrincipalBoundAppLinkTarget action) async {
    Route<void>? route;
    try {
      if (!action.owner.isCurrentEpoch ||
          !await action.owner.isCurrent() ||
          !mounted ||
          !action.owner.isCurrentEpoch) {
        return;
      }
      route = MaterialPageRoute<void>(
        builder: (_) => AppLinkDestinationScreen(
          target: action.target,
          owner: action.owner,
        ),
      );
      _activeOwnedRoute = route;
      _activeOwner = action.owner;
      final navigator = Navigator.of(context);
      if (!action.owner.isCurrentEpoch) return;
      await navigator.push<void>(route);
    } finally {
      if (identical(route, _activeOwnedRoute)) {
        _activeOwnedRoute = null;
        _activeOwner = null;
      }
      _opening = false;
      if (mounted) _handlePending();
    }
  }

  void _removeStaleOwnedRoute() {
    final route = _activeOwnedRoute;
    final owner = _activeOwner;
    if (route == null || owner == null) return;
    if (!owner.isCurrentEpoch) {
      _removeExactOwnedRoute(route, owner);
      return;
    }
    unawaited(_removeIfNoLongerCurrent(route, owner));
  }

  Future<void> _removeIfNoLongerCurrent(
    Route<void> route,
    AppLinkPrincipalOwner owner,
  ) async {
    if (!await owner.isCurrent()) {
      _removeExactOwnedRoute(route, owner);
    }
  }

  void _removeExactOwnedRoute(Route<void> route, AppLinkPrincipalOwner owner) {
    if (!identical(route, _activeOwnedRoute) ||
        !identical(owner, _activeOwner)) {
      return;
    }
    final navigator = route.navigator;
    if (navigator != null && route.isActive) {
      navigator.removeRoute(route);
    }
  }

  @override
  void dispose() {
    _controller?.removeListener(_handlePending);
    _principalSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class AppLinkDestinationScreen extends StatefulWidget {
  final AppLinkTarget target;
  final AppLinkPrincipalOwner owner;

  const AppLinkDestinationScreen({
    super.key,
    required this.target,
    required this.owner,
  });

  @override
  State<AppLinkDestinationScreen> createState() =>
      _AppLinkDestinationScreenState();
}

class _AppLinkDestinationScreenState extends State<AppLinkDestinationScreen> {
  late Future<_ResolvedBooking?> _booking;
  late Future<Item?> _listing;
  late Future<AuthSession?> _session;
  late Future<bool> _ownerCurrent;
  late Future<bool> _crashDiagnostic;
  late Future<bool> _externalAction;
  StreamSubscription<String>? _principalSubscription;
  Route<dynamic>? _ownedRoute;
  bool _externalOpened = false;

  @override
  void initState() {
    super.initState();
    _booking = _resolveBooking();
    _listing = _resolveListing();
    _session = _resolveSession();
    _ownerCurrent = widget.owner.isCurrent();
    _crashDiagnostic = _runCrashDiagnostic();
    _externalAction = _openExternalAction();
    _principalSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key == SharedPersistenceSync.accountSecurityStateKey) {
        _removeIfPrincipalChanged();
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _ownedRoute ??= ModalRoute.of(context);
  }

  Future<T> _runOwned<T>(Future<T> Function() operation) async {
    return runPrincipalBoundAppLinkOperation(
      owner: widget.owner,
      operation: operation,
    );
  }

  void _removeIfPrincipalChanged() {
    if (!widget.owner.isCurrentEpoch) {
      _removeExactOwnedRoute();
      return;
    }
    unawaited(() async {
      if (!await widget.owner.isCurrent()) _removeExactOwnedRoute();
    }());
  }

  void _removeExactOwnedRoute() {
    final route = _ownedRoute;
    final navigator = route?.navigator;
    if (route != null && navigator != null && route.isActive) {
      navigator.removeRoute(route);
    }
  }

  Future<AuthSession?> _resolveSession() async {
    if (!const {
      AppLinkKind.chat,
      AppLinkKind.paymentReturn,
      AppLinkKind.notifications,
    }.contains(widget.target.kind)) {
      return null;
    }
    return _runOwned(AuthService.readSession);
  }

  Future<Item?> _resolveListing() async {
    if (widget.target.kind != AppLinkKind.listing) return null;
    final publicItems = await _runOwned(DataService.getPublicItems);
    for (final item in publicItems) {
      if (item.id == widget.target.id) return item;
    }
    return null;
  }

  Future<_ResolvedBooking?> _resolveBooking() async {
    if (widget.target.kind != AppLinkKind.booking) return null;
    final session = await _runOwned(AuthService.readSession);
    if (session == null) return null;
    final request = await _runOwned(
      () => DataService.getRentalRequestById(widget.target.id!),
    );
    if (request == null) return null;
    final values = await _runOwned(
      () => Future.wait<Object?>([
        DataService.getCurrentUser(),
        DataService.getItemById(request.itemId),
        DataService.getUserById(request.ownerId),
      ]),
    );
    return _ResolvedBooking(
      request: request,
      viewer: values[0] as User?,
      item: values[1] as Item?,
      owner: values[2] as User?,
    );
  }

  Future<bool> _runCrashDiagnostic() async {
    if (widget.target.kind != AppLinkKind.crashDiagnostic) return false;
    return _runOwned(
      () => FirebaseRuntime.recordControlledStagingCrashDiagnostic(
        widget.target.id!,
      ),
    );
  }

  Future<bool> _openExternalAction() async {
    if (!const {
      AppLinkKind.emailVerification,
      AppLinkKind.passwordReset,
    }.contains(widget.target.kind)) {
      return false;
    }
    if (_externalOpened) return true;
    _externalOpened = true;
    return _runOwned(
      () => launchUrl(widget.target.uri, mode: LaunchMode.externalApplication),
    );
  }

  Future<void> _loginAndRetry() async {
    if (!await widget.owner.isCurrent() || !mounted) return;
    final route = MaterialPageRoute<void>(builder: (_) => const LoginScreen());
    final navigator = Navigator.of(context);
    if (!widget.owner.isCurrentEpoch) return;
    await navigator.push<void>(route);
    if (!mounted || !await widget.owner.isCurrent()) return;
    setState(() {
      _booking = _resolveBooking();
      _session = _resolveSession();
    });
  }

  Future<void> _retryListing() async {
    if (!await widget.owner.isCurrent() || !mounted) return;
    setState(() => _listing = _resolveListing());
  }

  Future<void> _retryBooking() async {
    if (!await widget.owner.isCurrent() || !mounted) return;
    setState(() => _booking = _resolveBooking());
  }

  Future<void> _retryExternalAction() async {
    if (!await widget.owner.isCurrent() || !mounted) return;
    setState(() {
      _externalOpened = false;
      _externalAction = _openExternalAction();
    });
  }

  bool _isStale(AsyncSnapshot<dynamic> snapshot) =>
      snapshot.error is AppLinkPrincipalChanged;

  Widget _principalBound(Widget child) => FutureBuilder<bool>(
        future: _ownerCurrent,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done ||
              snapshot.data != true) {
            if (snapshot.connectionState == ConnectionState.done) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _removeExactOwnedRoute();
              });
            }
            return const _LinkLoadingScreen();
          }
          return child;
        },
      );

  @override
  void dispose() {
    _principalSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    switch (widget.target.kind) {
      case AppLinkKind.listing:
        return FutureBuilder<Item?>(
          future: _listing,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _LinkLoadingScreen();
            }
            if (snapshot.hasError) {
              if (_isStale(snapshot)) return const _LinkLoadingScreen();
              return _LinkErrorScreen(
                title: 'Anzeige konnte nicht geladen werden',
                message:
                    'Die Anzeige ist gerade nicht erreichbar. Ihr Status wurde nicht als entfernt oder pausiert bewertet.',
                actionLabel: 'Erneut versuchen',
                onAction: _retryListing,
              );
            }
            final item = snapshot.data;
            if (item == null) {
              return _LinkErrorScreen(
                title: 'Anzeige nicht verfügbar',
                message:
                    'Die Anzeige wurde entfernt, pausiert oder ist nicht mehr öffentlich.',
                actionLabel: 'Erneut prüfen',
                onAction: _retryListing,
              );
            }
            return LinkedListingDetailsScreen(item: item);
          },
        );
      case AppLinkKind.profile:
        return _principalBound(PublicProfileScreen(userId: widget.target.id!));
      case AppLinkKind.chat:
        return FutureBuilder<AuthSession?>(
          future: _session,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _LinkLoadingScreen();
            }
            if (snapshot.hasError) {
              if (_isStale(snapshot)) return const _LinkLoadingScreen();
              return _LinkErrorScreen(
                title: 'Chat konnte nicht geladen werden',
                message:
                    'Die Kontositzung konnte nicht sicher bestätigt werden.',
                actionLabel: 'Erneut versuchen',
                onAction: _loginAndRetry,
              );
            }
            if (snapshot.data == null) {
              return _LinkErrorScreen(
                title: 'Bitte zuerst anmelden',
                message:
                    'Melde dich an und öffne die Benachrichtigung danach erneut.',
                actionLabel: 'Anmelden',
                onAction: _loginAndRetry,
              );
            }
            return MessageThreadScreen(threadId: widget.target.id);
          },
        );
      case AppLinkKind.booking:
        return FutureBuilder<_ResolvedBooking?>(
          future: _booking,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _LinkLoadingScreen();
            }
            if (snapshot.hasError) {
              if (_isStale(snapshot)) return const _LinkLoadingScreen();
              return _LinkErrorScreen(
                title: 'Buchung konnte nicht geladen werden',
                message:
                    'Die Buchung ist gerade nicht erreichbar. Das wurde nicht als fehlende oder fremde Buchung bewertet.',
                actionLabel: 'Erneut versuchen',
                onAction: _retryBooking,
              );
            }
            final resolved = snapshot.data;
            if (resolved == null) {
              return _LinkErrorScreen(
                title: 'Buchung nicht verfügbar',
                message:
                    'Melde dich mit dem zugehörigen Konto an oder prüfe, ob der Link noch gültig ist.',
                actionLabel: 'Anmelden und erneut prüfen',
                onAction: _loginAndRetry,
              );
            }
            if (resolved.request.ownerId == resolved.viewer?.id) {
              if (resolved.request.status == 'pending') {
                return RequestDetailScreen(requestId: resolved.request.id);
              }
              return OngoingOwnerDetailScreen(
                requestId: resolved.request.id,
                titleOverride: 'Vermietung',
              );
            }
            return BookingDetailScreen(
              booking: _bookingMap(resolved),
              viewerIsOwner: false,
            );
          },
        );
      case AppLinkKind.emailVerification:
      case AppLinkKind.passwordReset:
        return FutureBuilder<bool>(
          future: _externalAction,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _LinkLoadingScreen();
            }
            if (snapshot.hasError) {
              if (_isStale(snapshot)) return const _LinkLoadingScreen();
              return _LinkErrorScreen(
                title: 'Sicherer Link konnte nicht geöffnet werden',
                message: 'Die Bestätigung wurde nicht als geöffnet bewertet.',
                actionLabel: 'Erneut versuchen',
                onAction: _retryExternalAction,
              );
            }
            return _LinkErrorScreen(
              title: snapshot.data == true
                  ? 'Sicheren Link geöffnet'
                  : 'Sicherer Link nicht geöffnet',
              message: snapshot.data == true
                  ? 'Die Bestätigung wird in einer sicheren Browserseite abgeschlossen. Danach kannst du zu ShareItToo zurückkehren.'
                  : 'Die sichere Browserseite wurde nicht geöffnet.',
              actionLabel: 'Link erneut öffnen',
              onAction: _retryExternalAction,
            );
          },
        );
      case AppLinkKind.paymentReturn:
        return FutureBuilder<AuthSession?>(
          future: _session,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _LinkLoadingScreen();
            }
            if (snapshot.hasError) {
              if (_isStale(snapshot)) return const _LinkLoadingScreen();
              return _LinkErrorScreen(
                title: 'Zahlungsstatus konnte nicht geladen werden',
                message:
                    'Die Kontositzung konnte nicht sicher bestätigt werden.',
                actionLabel: 'Erneut versuchen',
                onAction: _loginAndRetry,
              );
            }
            if (snapshot.data == null) {
              return _LinkErrorScreen(
                title: 'Bitte zuerst anmelden',
                message:
                    'Melde dich an und öffne den sicheren Zahlungsstatus danach erneut.',
                actionLabel: 'Anmelden',
                onAction: _loginAndRetry,
              );
            }
            return PaymentCheckoutScreen(bookingId: widget.target.id!);
          },
        );
      case AppLinkKind.notifications:
        return FutureBuilder<AuthSession?>(
          future: _session,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _LinkLoadingScreen();
            }
            if (snapshot.hasError) {
              if (_isStale(snapshot)) return const _LinkLoadingScreen();
              return _LinkErrorScreen(
                title: 'Benachrichtigungen konnten nicht geladen werden',
                message:
                    'Die Kontositzung konnte nicht sicher bestätigt werden.',
                actionLabel: 'Erneut versuchen',
                onAction: _loginAndRetry,
              );
            }
            if (snapshot.data == null) {
              return _LinkErrorScreen(
                title: 'Bitte zuerst anmelden',
                message:
                    'Melde dich an und öffne die Benachrichtigung danach erneut.',
                actionLabel: 'Anmelden',
                onAction: _loginAndRetry,
              );
            }
            return const NotificationsScreen();
          },
        );
      case AppLinkKind.crashDiagnostic:
        return FutureBuilder<bool>(
          future: _crashDiagnostic,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _LinkLoadingScreen();
            }
            if (snapshot.hasError) {
              if (_isStale(snapshot)) return const _LinkLoadingScreen();
              return _LinkErrorScreen(
                title: 'Diagnose konnte nicht ausgeführt werden',
                message: 'Der interne Diagnosestatus ist nicht bestätigt.',
                actionLabel: 'Zurück',
                onAction: () async {
                  _removeExactOwnedRoute();
                },
              );
            }
            final sent = snapshot.data == true;
            return _LinkErrorScreen(
              title: sent ? 'Diagnose gesendet' : 'Diagnose gesperrt',
              message: sent
                  ? 'Der bereinigte interne Crashlytics-Test wurde übertragen.'
                  : 'Dieser Test ist nur im ausdrücklich freigegebenen internen Staging-Build möglich.',
              actionLabel: 'Zurück',
              onAction: () async {
                if (mounted) Navigator.of(context).pop();
              },
            );
          },
        );
    }
  }

  Map<String, dynamic> _bookingMap(_ResolvedBooking resolved) {
    final request = resolved.request;
    final item = resolved.item;
    final owner = resolved.owner;
    String category(String status) => switch (status) {
          'pending' => 'pending',
          'accepted' || 'confirmed' => 'upcoming',
          'running' || 'active' || 'returned' => 'ongoing',
          _ => 'completed',
        };
    return {
      'requestId': request.id,
      'itemId': request.itemId,
      'rawStatus': request.status,
      'status': request.status,
      'category': category(request.status),
      'title': item?.title ?? 'Buchung',
      'image': item?.photos.isNotEmpty == true ? item!.photos.first : null,
      'images': item?.photos ?? const <String>[],
      'location': item?.locationText,
      'listerId': request.ownerId,
      'listerName': owner?.displayName ?? 'Vermieter',
      'listerAvatar': owner?.photoURL,
      'quotedTotalRenter': request.quotedTotalRenter,
      'quotedSubtitle': request.quotedSubtitle,
      'quotedQuoteVersion': request.quotedQuoteVersion,
      'quotedDays': request.quotedDays,
      'quotedPricePerDayMinor': request.quotedPricePerDayMinor,
      'quotedBaseRentalMinor': request.quotedBaseRentalMinor,
      'quotedDiscountPercent': request.quotedDiscountPercent,
      'quotedDiscountId': request.quotedDiscountId,
      'quotedDiscountLabel': request.quotedDiscountLabel,
      'quotedDiscountFundingSource': request.quotedDiscountFundingSource,
      'quotedDiscountThresholdDays': request.quotedDiscountThresholdDays,
      'quotedDiscountMinor': request.quotedDiscountMinor,
      'quotedRentalSubtotalMinor': request.quotedRentalSubtotalMinor,
      'quotedPlatformFeeMinor': request.quotedPlatformFeeMinor,
      'quotedTotalMinor': request.quotedTotalMinor,
      'quotedOwnerPayoutMinor': request.quotedOwnerPayoutMinor,
      'quotedCurrency': request.quotedCurrency,
      'startIso': request.start.toIso8601String(),
      'endIso': request.end.toIso8601String(),
      'requestCreatedAtIso': request.createdAt.toIso8601String(),
    };
  }
}

class _ResolvedBooking {
  final RentalRequest request;
  final User? viewer;
  final Item? item;
  final User? owner;

  const _ResolvedBooking({
    required this.request,
    required this.viewer,
    required this.item,
    required this.owner,
  });
}

class _LinkLoadingScreen extends StatelessWidget {
  const _LinkLoadingScreen();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

class _LinkErrorScreen extends StatelessWidget {
  final String title;
  final String message;
  final String actionLabel;
  final Future<void> Function() onAction;

  const _LinkErrorScreen({
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('ShareItToo')),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.link_outlined, size: 46),
                  const SizedBox(height: 16),
                  Text(title, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 10),
                  Text(message, textAlign: TextAlign.center),
                  const SizedBox(height: 22),
                  FilledButton(onPressed: onAction, child: Text(actionLabel)),
                ],
              ),
            ),
          ),
        ),
      );
}
