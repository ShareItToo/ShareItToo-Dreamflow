import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/contact_verification_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/sit_logo_header.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/blur_modal.dart';
import 'package:lendify/widgets/social_auth_button.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:provider/provider.dart';

typedef PasswordResetRequester = Future<bool> Function(String email);

class LoginScreen extends StatefulWidget {
  final int? returnTabIndex;
  final String? initialEmail;
  final bool verificationPending;
  final SessionTransitionService? sessionTransitionService;
  final ContactVerificationService? contactVerificationService;
  final PasswordResetRequester? passwordResetRequester;

  const LoginScreen({
    super.key,
    this.returnTabIndex,
    this.initialEmail,
    this.verificationPending = false,
    this.sessionTransitionService,
    this.contactVerificationService,
    this.passwordResetRequester,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _cardKey = GlobalKey();

  final _emailCtrl = TextEditingController();
  final _pwCtrl = TextEditingController();

  final _emailFocus = FocusNode();
  final _pwFocus = FocusNode();

  bool _busy = false;
  bool _checkingSession = true;
  bool _pwVisible = false;
  bool _peekBackdrop = false;
  late final SessionTransitionService _sessionTransitions;
  late final ContactVerificationService _contactVerificationService;
  SessionTransitionOwner? _observedSessionOwner;
  int? _confirmedNoSessionEpoch;
  int _bootstrapRevision = 0;
  bool _sessionTransitionInFlight = false;
  int _loginActionEpoch = 0;
  TrackedDialogRouteHandle<void>? _activeVerificationResultRoute;

  void _exitToExplore() {
    try {
      context.read<MainNavController>().setIndex(0);
    } catch (_) {
      // If provider isn't available, just navigate.
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const MainNavigation()),
      (route) => false,
    );
  }

  Future<void> _continueAsGuest() async {
    final owner = _observedSessionOwner;
    final noSessionEpoch = _confirmedNoSessionEpoch;
    if (_sessionTransitionInFlight ||
        (owner == null && noSessionEpoch == null)) {
      return;
    }
    final preview = context.read<DeveloperPreviewController>();
    _sessionTransitionInFlight = true;
    try {
      final completion = owner != null
          ? await _sessionTransitions.signOut(owner)
          : await _sessionTransitions.continueAsGuest(noSessionEpoch!);
      if (completion == null ||
          !mounted ||
          !await _sessionTransitions.isCompletionCurrent(completion)) {
        return;
      }
      await preview.setState(DeveloperUserState.loggedOut);
      if (!mounted ||
          !await _sessionTransitions.isCompletionCurrent(completion)) {
        return;
      }
      _observedSessionOwner = null;
      _confirmedNoSessionEpoch = completion.completionEpoch;
      _exitToExplore();
    } catch (e) {
      debugPrint('[LoginScreen] continueAsGuest failed: $e');
    } finally {
      _sessionTransitionInFlight = false;
    }
  }

  @override
  void initState() {
    super.initState();
    _sessionTransitions =
        widget.sessionTransitionService ?? const SessionTransitionService();
    _contactVerificationService =
        widget.contactVerificationService ?? const ContactVerificationService();
    _emailCtrl.text = widget.initialEmail?.trim() ?? '';
    _emailCtrl.addListener(_handleLoginEmailChanged);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final revision = ++_bootstrapRevision;
    final startingEpoch = _sessionTransitions.sessionEpoch;
    try {
      final preview = context.read<DeveloperPreviewController>();

      // Only skip this screen when there is a real persisted session that can
      // still be resolved to a current user in the local dataset.
      final session = await _sessionTransitions.readSession();
      if (!mounted || revision != _bootstrapRevision) return;

      if (session != null) {
        final owner = _sessionTransitions.captureOwner(session);
        _observedSessionOwner = owner;
        _confirmedNoSessionEpoch = null;
        if (!await _sessionTransitions.isOwnerCurrent(owner)) return;
        final resolvedUser = await _sessionTransitions.currentUserForOwner(
          owner,
          synchronize: true,
        );
        if (!mounted ||
            revision != _bootstrapRevision ||
            !await _sessionTransitions.isOwnerCurrent(owner)) {
          return;
        }

        if (resolvedUser != null) {
          final resolvedOwner = _sessionTransitions.captureOwner(
            session,
            profileUserId: resolvedUser.id,
          );
          _observedSessionOwner = resolvedOwner;
          if (preview.state != DeveloperUserState.loggedIn &&
              preview.state != DeveloperUserState.verifiedUser) {
            await preview.setState(DeveloperUserState.loggedIn);
          }
          if (!mounted ||
              revision != _bootstrapRevision ||
              !await _sessionTransitions.isOwnerCurrent(resolvedOwner)) {
            return;
          }
          _goHome(replace: true);
          return;
        }

        debugPrint(
            '[LoginScreen] stale session found for ${session.email}; clearing and staying on login.');
        if (!await _sessionTransitions.isOwnerCurrent(owner)) return;
        final completion = await _sessionTransitions.clearStaleSession(owner);
        if (completion == null ||
            !await _sessionTransitions.isCompletionCurrent(completion)) {
          return;
        }
        _observedSessionOwner = null;
        _confirmedNoSessionEpoch = completion.completionEpoch;
      } else {
        final confirmedEmptyEpoch = _sessionTransitions.sessionEpoch;
        if (confirmedEmptyEpoch < startingEpoch ||
            !await _sessionTransitions.isNoSessionEpochCurrent(
              confirmedEmptyEpoch,
            )) {
          return;
        }
        _observedSessionOwner = null;
        _confirmedNoSessionEpoch = confirmedEmptyEpoch;
      }

      // If the preview says "logged in" but there is no valid session, keep the user here.
      if (preview.state == DeveloperUserState.loggedIn ||
          preview.state == DeveloperUserState.verifiedUser) {
        debugPrint(
            '[LoginScreen] preview state indicates logged-in but no valid session found; staying on login.');
      }
    } catch (e) {
      debugPrint('[LoginScreen] bootstrap failed: $e');
    } finally {
      if (mounted && revision == _bootstrapRevision) {
        setState(() => _checkingSession = false);
      }
    }
  }

  @override
  void dispose() {
    _loginActionEpoch += 1;
    _emailCtrl.removeListener(_handleLoginEmailChanged);
    _activeVerificationResultRoute?.dismiss();
    _emailCtrl.dispose();
    _pwCtrl.dispose();
    _emailFocus.dispose();
    _pwFocus.dispose();
    super.dispose();
  }

  void _handleLoginEmailChanged() {
    _loginActionEpoch += 1;
    _activeVerificationResultRoute?.dismiss();
  }

  LoginEmailVerificationOwner _captureLoginEmailOwner() =>
      LoginEmailVerificationOwner(
        normalizedEmail: _emailCtrl.text.trim().toLowerCase(),
        actionEpoch: ++_loginActionEpoch,
      );

  bool _isLoginEmailOwnerCurrent(LoginEmailVerificationOwner owner) =>
      mounted &&
      owner.isCurrent(
        email: _emailCtrl.text,
        actionEpoch: _loginActionEpoch,
      );

  bool _isLoginActionCurrent(int actionEpoch) =>
      mounted && actionEpoch == _loginActionEpoch;

  bool _isNoSessionLoginPreflightCurrent({
    required int actionEpoch,
    required int noSessionEpoch,
  }) =>
      _isLoginActionCurrent(actionEpoch) &&
      _confirmedNoSessionEpoch == noSessionEpoch &&
      AuthService.sessionEpoch == noSessionEpoch;

  Future<bool> _retainSuccessfulLoginOwner(
    LoginEmailVerificationOwner loginOwner,
    AuthSessionOwner successfulSessionOwner,
  ) async {
    if (_isLoginEmailOwnerCurrent(loginOwner) &&
        await AuthService.isSessionOwnerDefinitelyCurrent(
          successfulSessionOwner,
        )) {
      return true;
    }
    await AuthService.clearSessionOwnerIfMatches(
      successfulSessionOwner,
      runLogoutCleanup: false,
    );
    return false;
  }

  Future<void> _showLoginVerificationResult(
    LoginEmailVerificationOwner owner, {
    required IconData icon,
    required String title,
    String? message,
  }) async {
    if (!_isLoginEmailOwnerCurrent(owner)) return;
    final handle = TrackedDialogRouteHandle<void>();
    _activeVerificationResultRoute = handle;
    try {
      await showTrackedDialog<void>(
        context: context,
        handle: handle,
        barrierLabel:
            MaterialLocalizations.of(context).modalBarrierDismissLabel,
        builder: (dialogContext) => AlertDialog(
          icon: Icon(icon),
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
    } finally {
      if (identical(_activeVerificationResultRoute, handle)) {
        _activeVerificationResultRoute = null;
      }
    }
  }

  bool _isOutsideCard(Offset globalPosition) {
    final ctx = _cardKey.currentContext;
    if (ctx == null) return true;
    final box = ctx.findRenderObject();
    if (box is! RenderBox) return true;
    final topLeft = box.localToGlobal(Offset.zero);
    final rect = topLeft & box.size;
    return !rect.contains(globalPosition);
  }

  String? _validateEmail(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
    if (!ok) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    return null;
  }

  String? _validatePassword(String? v) {
    final value = (v ?? '');
    if (value.trim().isEmpty) return 'Bitte gib dein Passwort ein.';
    if (value.length < 8) return 'Das Passwort ist zu kurz.';
    return null;
  }

  Future<void> _syncRentalCartAfterAuthentication() async {
    try {
      await DataService.syncGuestRentalCartAfterAuthentication();
    } catch (error) {
      // Keep the local guest copy intact. RentalCartScreen retries and visibly
      // reports a pending sync instead of losing prepared rental intent.
      debugPrint('[LoginScreen] rental cart sync pending: $error');
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    FocusScope.of(context).unfocus();

    final ok = _formKey.currentState?.validate() ?? false;
    if (!ok) return;
    final loginOwner = _captureLoginEmailOwner();
    final loginPassword = _pwCtrl.text;
    final noSessionEpoch = _confirmedNoSessionEpoch;
    if (noSessionEpoch == null ||
        !_isNoSessionLoginPreflightCurrent(
          actionEpoch: loginOwner.actionEpoch,
          noSessionEpoch: noSessionEpoch,
        )) {
      return;
    }
    AuthSessionOwner? successfulSessionOwner;

    setState(() => _busy = true);
    try {
      // Simulate realistic latency.
      await Future<void>.delayed(const Duration(milliseconds: 520));
      if (!_isNoSessionLoginPreflightCurrent(
        actionEpoch: loginOwner.actionEpoch,
        noSessionEpoch: noSessionEpoch,
      )) {
        return;
      }

      final result = await AuthService.signInWithEmailPassword(
        email: loginOwner.normalizedEmail,
        password: loginPassword,
        expectedSessionEpoch: noSessionEpoch,
        isActionCurrent: () => _isLoginEmailOwnerCurrent(loginOwner),
      );
      if (!_isLoginEmailOwnerCurrent(loginOwner)) {
        final staleSession = result.session;
        if (staleSession != null) {
          await AuthService.clearSessionOwnerIfMatches(
            AuthService.captureSessionOwner(staleSession),
            runLogoutCleanup: false,
          );
        }
        return;
      }

      if (!result.ok) {
        if (result.failure == AuthFailure.principalChanged) return;
        if (result.failure == AuthFailure.emailVerificationRequired) {
          try {
            if (!_isLoginEmailOwnerCurrent(loginOwner)) return;
            await _contactVerificationService.requestLoginEmailVerification(
              loginOwner.normalizedEmail,
            );
            if (!_isLoginEmailOwnerCurrent(loginOwner)) return;
            await _showLoginVerificationResult(
              loginOwner,
              icon: Icons.mark_email_read_outlined,
              title: 'Bestätigungsanfrage verarbeitet',
              message:
                  'Wenn dein Konto existiert und noch unbestätigt ist, prüfe dein Postfach auf einen Link. Kommt keiner an, versuche es später erneut.',
            );
          } on ContactActionFailure catch (failure) {
            if (!_isLoginEmailOwnerCurrent(loginOwner)) return;
            final (title, message) = switch (failure.kind) {
              ContactActionFailureKind.rejected => (
                  'Bitte kurz warten',
                  'Die Anfrage wurde begrenzt. Versuche es später erneut.'
                ),
              ContactActionFailureKind.localUnavailable => (
                  'Bestätigung nicht angefordert',
                  'Die Funktion ist derzeit nicht verfügbar.'
                ),
              ContactActionFailureKind.outcomeUnknown => (
                  'Versandstatus unklar',
                  'Die E-Mail könnte bereits gesendet worden sein. Prüfe dein Postfach, bevor du erneut anforderst.'
                ),
              ContactActionFailureKind.principalChanged => (null, null),
            };
            if (title != null) {
              await _showLoginVerificationResult(
                loginOwner,
                icon: Icons.error_outline,
                title: title,
                message: message,
              );
            }
          }
          return;
        }
        final msg = switch (result.failure) {
          AuthFailure.invalidCredentials =>
            'E-Mail oder Passwort ist nicht korrekt.',
          AuthFailure.network =>
            'Es ist ein Netzwerkfehler aufgetreten. Bitte versuche es erneut.',
          _ => 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.',
        };
        if (mounted && _isLoginEmailOwnerCurrent(loginOwner)) {
          await AppPopup.toast(
            context,
            icon: Icons.error_outline,
            title: msg,
          );
        }
        return;
      }

      final successfulSession = result.session;
      if (successfulSession == null) {
        throw StateError('Successful login did not return a session owner.');
      }
      successfulSessionOwner =
          AuthService.captureSessionOwner(successfulSession);

      await DataService.syncCurrentUserForSessionEmail(
        loginOwner.normalizedEmail,
      );
      if (!await _retainSuccessfulLoginOwner(
        loginOwner,
        successfulSessionOwner,
      )) {
        return;
      }
      await _syncRentalCartAfterAuthentication();
      if (!await _retainSuccessfulLoginOwner(
        loginOwner,
        successfulSessionOwner,
      )) {
        return;
      }
      unawaited(FirebaseRuntime.syncPushRegistration());
      if (!await _retainSuccessfulLoginOwner(
        loginOwner,
        successfulSessionOwner,
      )) {
        return;
      }
      if (!mounted) return;
      await context
          .read<DeveloperPreviewController>()
          .setState(DeveloperUserState.loggedIn);
      if (!await _retainSuccessfulLoginOwner(
        loginOwner,
        successfulSessionOwner,
      )) {
        return;
      }
      _goHome(replace: true);
    } catch (e) {
      debugPrint('[LoginScreen] submit failed: $e');
      final completedOwner = successfulSessionOwner;
      if (!_isLoginEmailOwnerCurrent(loginOwner)) {
        if (completedOwner != null) {
          await AuthService.clearSessionOwnerIfMatches(
            completedOwner,
            runLogoutCleanup: false,
          );
        }
        return;
      }
      if (completedOwner != null) {
        final receipt = await AuthService.clearSessionOwnerIfMatches(
          completedOwner,
          runLogoutCleanup: false,
        );
        if (receipt == null ||
            !await AuthService.isSessionClearReceiptCurrent(receipt)) {
          // Never present an A-owned login failure after a successor session
          // has become current, and never claim a clean failure when the
          // exact successful session could not be removed.
          return;
        }
      }
      if (!_isLoginEmailOwnerCurrent(loginOwner)) return;
      if (!mounted) return;
      await AppPopup.toast(context,
          icon: Icons.wifi_off_outlined,
          title: completedOwner == null
              ? 'Es ist ein Netzwerkfehler aufgetreten.'
              : 'Anmeldung nicht abgeschlossen.',
          message: completedOwner == null
              ? 'Bitte versuche es erneut.'
              : 'Die lokale Sitzung wurde sicher entfernt. '
                  'Bitte versuche es erneut.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _goHome({required bool replace}) {
    final targetIndex = widget.returnTabIndex;
    if (targetIndex != null) {
      try {
        context.read<MainNavController>().setIndex(targetIndex);
      } catch (_) {}
    }
    final route = MaterialPageRoute(
        builder: (_) => MainNavigation(initialIndex: targetIndex ?? 0));
    if (replace) {
      Navigator.of(context).pushAndRemoveUntil(route, (r) => false);
    } else {
      Navigator.of(context).push(route);
    }
  }

  Future<void> _openResetFlow() async {
    final prefill = _emailCtrl.text.trim();
    final sent = await showBlurBottomSheet<bool>(
      context,
      child: SheetScaffold(
        title: 'Passwort zurücksetzen',
        body: _PasswordResetSheet(
          initialEmail: prefill,
          requestPasswordReset:
              widget.passwordResetRequester ?? AuthService.requestPasswordReset,
        ),
      ),
    );
    if (!mounted || sent != true) return;
    await AppPopup.info(
      context,
      title: 'E-Mail gesendet',
      message:
          'Wenn ein Konto existiert, erhältst du gleich einen Link zum Zurücksetzen.',
    );
  }

  Future<void> _socialSignIn(AuthSocialProvider provider) async {
    if (_busy || !mounted) return;
    final actionEpoch = ++_loginActionEpoch;
    final noSessionEpoch = _confirmedNoSessionEpoch;
    if (noSessionEpoch == null ||
        !_isNoSessionLoginPreflightCurrent(
          actionEpoch: actionEpoch,
          noSessionEpoch: noSessionEpoch,
        )) {
      return;
    }
    final providerLabel = switch (provider) {
      AuthSocialProvider.google => 'Google',
      AuthSocialProvider.apple => 'Apple',
      AuthSocialProvider.facebook => 'Facebook',
    };
    AuthSessionOwner? successfulSessionOwner;
    setState(() => _busy = true);
    try {
      final result = await AuthService.signInWithSocialProvider(
        provider,
        expectedSessionEpoch: noSessionEpoch,
        isActionCurrent: () => _isLoginActionCurrent(actionEpoch),
      );
      if (!_isLoginActionCurrent(actionEpoch)) {
        final staleSession = result.session;
        if (staleSession != null) {
          await AuthService.clearSessionOwnerIfMatches(
            AuthService.captureSessionOwner(staleSession),
            runLogoutCleanup: false,
          );
        }
        return;
      }
      if (!result.ok) {
        if (result.failure == AuthFailure.socialCancelled ||
            result.failure == AuthFailure.principalChanged) {
          return;
        }
        final message = switch (result.failure) {
          AuthFailure.consentRequired =>
            'Für dein erstes SIT-Konto bestätigst du bitte noch Alter, AGB und Datenschutz.',
          AuthFailure.socialEmailRequired =>
            '$providerLabel hat keine E-Mail-Adresse übermittelt. Bitte gib sie dort frei oder nutze eine andere Anmeldung.',
          AuthFailure.socialEmailVerificationRequired =>
            'Die von $providerLabel übermittelte E-Mail ist noch nicht bestätigt.',
          AuthFailure.socialProviderAlreadyLinked =>
            'Dieses SIT-Konto ist bereits mit einem anderen $providerLabel-Konto verbunden.',
          AuthFailure.socialAccountLinkRequiresReauthentication =>
            'Diese E-Mail gehört bereits zu einem SIT-Konto. Melde dich einmal wie bisher an, bevor du $providerLabel verbindest.',
          AuthFailure.accountNotActive =>
            'Dieses SIT-Konto ist derzeit nicht aktiv.',
          AuthFailure.providerUnavailable =>
            '$providerLabel ist noch nicht freigeschaltet. Bitte nutze vorübergehend E-Mail.',
          _ =>
            'Die $providerLabel-Anmeldung ist gerade nicht erreichbar. Bitte versuche es erneut.',
        };
        if (!mounted) return;
        await AppPopup.toast(
          context,
          icon: Icons.error_outline,
          title: message,
        );
        if (!_isLoginActionCurrent(actionEpoch)) return;
        if (result.failure == AuthFailure.consentRequired) {
          if (!mounted) return;
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => RegisterScreen(
                returnTabIndex: widget.returnTabIndex,
              ),
            ),
          );
        }
        return;
      }
      if (result.session == null) {
        if (!_isLoginActionCurrent(actionEpoch)) return;
        if (!mounted) return;
        await AppPopup.toast(
          context,
          icon: Icons.mark_email_read_outlined,
          title: 'Bestätigungsanfrage verarbeitet',
          message:
              'Bestätige einmal deine E-Mail und melde dich danach erneut mit $providerLabel an.',
        );
        return;
      }
      final successfulSession = result.session!;
      successfulSessionOwner =
          AuthService.captureSessionOwner(successfulSession);
      final email = successfulSession.email;
      await DataService.syncCurrentUserForSessionEmail(email);
      if (!await _retainSuccessfulSocialLoginOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      await _syncRentalCartAfterAuthentication();
      if (!await _retainSuccessfulSocialLoginOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      unawaited(FirebaseRuntime.syncPushRegistration());
      if (!await _retainSuccessfulSocialLoginOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      if (!mounted) return;
      await context
          .read<DeveloperPreviewController>()
          .setState(DeveloperUserState.loggedIn);
      if (!await _retainSuccessfulSocialLoginOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      _goHome(replace: true);
    } catch (error) {
      debugPrint('[LoginScreen] social sign-in failed: $error');
      final completedOwner = successfulSessionOwner;
      if (completedOwner != null) {
        await AuthService.clearSessionOwnerIfMatches(
          completedOwner,
          runLogoutCleanup: false,
        );
      }
      if (!_isLoginActionCurrent(actionEpoch)) return;
      if (!mounted) return;
      await AppPopup.toast(
        context,
        icon: Icons.wifi_off_outlined,
        title: 'Anmeldung nicht abgeschlossen.',
        message: 'Bitte versuche es erneut.',
      );
    } finally {
      if (_isLoginActionCurrent(actionEpoch)) {
        setState(() => _busy = false);
      }
    }
  }

  Future<bool> _retainSuccessfulSocialLoginOwner(
    int actionEpoch,
    AuthSessionOwner successfulSessionOwner,
  ) async {
    if (_isLoginActionCurrent(actionEpoch) &&
        await AuthService.isSessionOwnerDefinitelyCurrent(
          successfulSessionOwner,
        )) {
      return true;
    }
    await AuthService.clearSessionOwnerIfMatches(
      successfulSessionOwner,
      runLogoutCleanup: false,
    );
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
                child: IgnorePointer(
                    child: _AuthBackdrop(peekClear: _peekBackdrop))),
            Positioned.fill(
              child: Listener(
                behavior: HitTestBehavior.translucent,
                onPointerDown: (e) {
                  if (_checkingSession) return;
                  if (_isOutsideCard(e.position)) {
                    setState(() => _peekBackdrop = true);
                  }
                },
                onPointerUp: (_) {
                  if (_peekBackdrop) setState(() => _peekBackdrop = false);
                },
                onPointerCancel: (_) {
                  if (_peekBackdrop) setState(() => _peekBackdrop = false);
                },
                child: IgnorePointer(
                  ignoring: _checkingSession,
                  child: CustomScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    slivers: [
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
                        sliver: SliverToBoxAdapter(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(children: [
                                  _GlassIconButton(
                                      icon: Icons.arrow_back,
                                      semanticLabel:
                                          MaterialLocalizations.of(context)
                                              .backButtonTooltip,
                                      onTap: () =>
                                          Navigator.of(context).maybePop()),
                                  Expanded(
                                    child: Center(
                                      child: Text('Anmelden',
                                          style: theme.textTheme.titleLarge
                                              ?.copyWith(
                                                  fontSize: 20,
                                                  fontWeight: FontWeight.w800,
                                                  color: Colors.white)),
                                    ),
                                  ),
                                  const SizedBox(width: 44),
                                ]),
                                const SizedBox(height: 80),
                                Center(
                                  child: ConstrainedBox(
                                    constraints:
                                        const BoxConstraints(maxWidth: 520),
                                    child: Text(
                                      'Melde dich an, um zu mieten, zu teilen und deine Buchungen zu verwalten.',
                                      textAlign: TextAlign.center,
                                      style: theme.textTheme.titleMedium
                                          ?.copyWith(
                                              color: Colors.white,
                                              height: 1.35,
                                              fontWeight: FontWeight.w900),
                                    ),
                                  ),
                                ),
                                SizedBox(
                                    height:
                                        mathMax(18, media.size.height * 0.04)),
                              ]),
                        ),
                      ),
                      SliverPadding(
                        padding: EdgeInsets.fromLTRB(
                            16,
                            0,
                            16,
                            mathMax(
                                18, media.viewInsets.bottom == 0 ? 28 : 12)),
                        sliver: SliverToBoxAdapter(
                          child: Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 520),
                              child: Visibility(
                                visible: !_peekBackdrop,
                                maintainState: true,
                                maintainAnimation: true,
                                maintainSize: true,
                                child: KeyedSubtree(
                                  key: _cardKey,
                                  child: _GlassCard(
                                    child: Padding(
                                      padding: const EdgeInsets.fromLTRB(
                                          16, 16, 16, 16),
                                      child: Form(
                                        key: _formKey,
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.stretch,
                                            children: [
                                              const SitLogoHeader(),
                                              const SizedBox(height: 16),
                                              if (widget
                                                  .verificationPending) ...[
                                                _EmailVerificationPendingNotice(
                                                  email: _emailCtrl.text.trim(),
                                                ),
                                                const SizedBox(height: 16),
                                              ],
                                              _SITTextField(
                                                label: 'E-Mail',
                                                placeholder: 'deine@email.com',
                                                controller: _emailCtrl,
                                                focusNode: _emailFocus,
                                                nextFocusNode: _pwFocus,
                                                keyboardType:
                                                    TextInputType.emailAddress,
                                                textInputAction:
                                                    TextInputAction.next,
                                                validator: _validateEmail,
                                                prefixIcon:
                                                    Icons.alternate_email,
                                                autocorrect: false,
                                                enableSuggestions: false,
                                                textCapitalization:
                                                    TextCapitalization.none,
                                              ),
                                              const SizedBox(height: 12),
                                              _SITTextField(
                                                label: 'Passwort',
                                                placeholder: '••••••••',
                                                controller: _pwCtrl,
                                                focusNode: _pwFocus,
                                                keyboardType: TextInputType
                                                    .visiblePassword,
                                                textInputAction:
                                                    TextInputAction.done,
                                                validator: _validatePassword,
                                                prefixIcon: Icons.lock_outline,
                                                obscureText: !_pwVisible,
                                                autocorrect: false,
                                                enableSuggestions: false,
                                                textCapitalization:
                                                    TextCapitalization.none,
                                                onSubmitted: (_) => _submit(),
                                                suffix: _GlassSuffixIconButton(
                                                  icon: _pwVisible
                                                      ? Icons
                                                          .visibility_off_outlined
                                                      : Icons
                                                          .visibility_outlined,
                                                  semanticLabel: _pwVisible
                                                      ? 'Passwort verbergen'
                                                      : 'Passwort anzeigen',
                                                  onTap: () => setState(() =>
                                                      _pwVisible = !_pwVisible),
                                                ),
                                              ),
                                              const SizedBox(height: 10),
                                              Align(
                                                  alignment:
                                                      Alignment.centerRight,
                                                  child: _TextLink(
                                                      label:
                                                          'Passwort vergessen?',
                                                      onTap: _openResetFlow)),
                                              const SizedBox(height: 14),
                                              _PrimaryAuthButton(
                                                  busy: _busy,
                                                  label: _busy
                                                      ? 'Anmelden…'
                                                      : 'Anmelden',
                                                  icon: Icons.login,
                                                  onTap:
                                                      _busy ? null : _submit),
                                              const SizedBox(height: 14),
                                              const SocialAuthOrDivider(),
                                              const SizedBox(height: 12),
                                              SocialAuthButton(
                                                  brand: SocialAuthBrand.google,
                                                  label: 'Mit Google anmelden',
                                                  onTap: _busy ||
                                                          !AuthService
                                                              .socialProviderEnabled(
                                                                  AuthSocialProvider
                                                                      .google)
                                                      ? null
                                                      : () => _socialSignIn(
                                                          AuthSocialProvider
                                                              .google)),
                                              const SizedBox(height: 10),
                                              SocialAuthButton(
                                                  brand: SocialAuthBrand.apple,
                                                  label: 'Mit Apple anmelden',
                                                  onTap: _busy ||
                                                          !AuthService
                                                              .socialProviderEnabled(
                                                                  AuthSocialProvider
                                                                      .apple)
                                                      ? null
                                                      : () => _socialSignIn(
                                                          AuthSocialProvider
                                                              .apple)),
                                              const SizedBox(height: 10),
                                              SocialAuthButton(
                                                  brand:
                                                      SocialAuthBrand.facebook,
                                                  label:
                                                      'Mit Facebook anmelden',
                                                  onTap: _busy ||
                                                          !AuthService
                                                              .socialProviderEnabled(
                                                                  AuthSocialProvider
                                                                      .facebook)
                                                      ? null
                                                      : () => _socialSignIn(
                                                          AuthSocialProvider
                                                              .facebook)),
                                              const SizedBox(height: 14),
                                              Row(
                                                  mainAxisAlignment:
                                                      MainAxisAlignment.center,
                                                  children: [
                                                    Text('Neu bei SIT? ',
                                                        style: theme
                                                            .textTheme.bodySmall
                                                            ?.copyWith(
                                                                color: Colors
                                                                    .white
                                                                    .withValues(
                                                                        alpha:
                                                                            0.75))),
                                                    _TextLink(
                                                        label:
                                                            'Konto erstellen',
                                                        onTap: () => Navigator
                                                                .of(context)
                                                            .push(MaterialPageRoute(
                                                                builder: (_) =>
                                                                    RegisterScreen(
                                                                        returnTabIndex:
                                                                            widget.returnTabIndex)))),
                                                  ]),
                                              const SizedBox(height: 14),
                                              Row(
                                                  mainAxisAlignment:
                                                      MainAxisAlignment.center,
                                                  children: [
                                                    Icon(
                                                        Icons
                                                            .verified_user_outlined,
                                                        size: 16,
                                                        color: Colors.white
                                                            .withValues(
                                                                alpha: 0.65)),
                                                    const SizedBox(width: 8),
                                                    Expanded(
                                                      child: Text(
                                                        'Deine Anmeldung wird sicher übertragen.',
                                                        textAlign:
                                                            TextAlign.center,
                                                        style: theme.textTheme
                                                            .labelSmall
                                                            ?.copyWith(
                                                                color: Colors
                                                                    .white
                                                                    .withValues(
                                                                        alpha:
                                                                            0.70),
                                                                height: 1.35),
                                                      ),
                                                    ),
                                                    const SizedBox(width: 24),
                                                  ]),
                                            ]),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: EdgeInsets.fromLTRB(
                            16, 8, 16, 22 + media.padding.bottom),
                        sliver: SliverToBoxAdapter(
                          child: Center(
                            child: Visibility(
                              visible: !_peekBackdrop,
                              maintainState: true,
                              maintainAnimation: true,
                              maintainSize: true,
                              child: _Pressable(
                                onTap: _continueAsGuest,
                                borderRadius: BorderRadius.circular(999),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(999),
                                  child: BackdropFilter(
                                    filter: ImageFilter.blur(
                                        sigmaX: 8.0, sigmaY: 8.0),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 16, vertical: 12),
                                      decoration: BoxDecoration(
                                        color: Colors.black
                                            .withValues(alpha: 0.38),
                                        borderRadius:
                                            BorderRadius.circular(999),
                                        border: Border.all(
                                            color: Colors.white
                                                .withValues(alpha: 0.10)),
                                      ),
                                      child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Icon(Icons.person_outline,
                                                size: 18,
                                                color: Colors.white
                                                    .withValues(alpha: 0.90)),
                                            const SizedBox(width: 10),
                                            Text('Erst mal umschauen',
                                                style: theme
                                                    .textTheme.bodyMedium
                                                    ?.copyWith(
                                                        color: Colors.white,
                                                        fontWeight:
                                                            FontWeight.w900)),
                                          ]),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (_checkingSession)
              Positioned.fill(
                child: IgnorePointer(
                  child: Center(
                    child: _GlassCard(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 18, vertical: 14),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: BrandColors.logoAccent)),
                          const SizedBox(width: 12),
                          Text('Session prüfen…',
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _EmailVerificationPendingNotice extends StatelessWidget {
  final String email;

  const _EmailVerificationPendingNotice({required this.email});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final address = email.isEmpty ? 'deine E-Mail-Adresse' : email;
    return Container(
      key: const ValueKey('email-verification-pending'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.primary.withValues(alpha: 0.42),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.mark_email_read_outlined,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Prüfe deine E-Mail',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'Wenn die Registrierung möglich war, wurde eine '
                  'Bestätigungsanfrage für $address verarbeitet. Prüfe dein '
                  'Postfach und melde dich anschließend hier an.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.white.withValues(alpha: 0.84),
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthBackdrop extends StatelessWidget {
  final bool peekClear;
  const _AuthBackdrop({required this.peekClear});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final dark = theme.colorScheme.secondary;

    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset('assets/images/Register_Login_Hintergrund.png',
            fit: BoxFit.cover, alignment: Alignment.topCenter),
        // Base blur - removed when peeking
        ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(
              sigmaX: peekClear ? 0.0 : 1.0,
              sigmaY: peekClear ? 0.0 : 1.0,
            ),
            child: const SizedBox.expand(),
          ),
        ),
        // Color tint overlay - reduced when peeking
        AnimatedOpacity(
          duration: const Duration(milliseconds: 140),
          opacity: peekClear ? 0.15 : 1.0,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color.lerp(primary, BrandColors.logoGradientStart, 0.35)!
                      .withValues(alpha: 0.34),
                  Color.lerp(dark, BrandColors.logoGradientEnd, 0.55)!
                      .withValues(alpha: 0.26),
                ],
              ),
            ),
          ),
        ),
        // Top gradient overlay (soft vignette from top) - hidden when peeking
        AnimatedOpacity(
          duration: const Duration(milliseconds: 140),
          opacity: peekClear ? 0.0 : 1.0,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.72),
                    Colors.black.withValues(alpha: 0.55),
                    Colors.black.withValues(alpha: 0.28),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.08, 0.18, 0.36],
                ),
              ),
            ),
          ),
        ),
        // Bottom gradient overlay - hidden when peeking
        AnimatedOpacity(
          duration: const Duration(milliseconds: 140),
          opacity: peekClear ? 0.0 : 1.0,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.08),
                    Colors.black.withValues(alpha: 0.22),
                    Colors.black.withValues(alpha: 0.40),
                    Colors.black.withValues(alpha: 0.58),
                    Colors.black.withValues(alpha: 0.72),
                  ],
                  stops: const [0.0, 0.55, 0.68, 0.78, 0.86, 0.93, 1.0],
                ),
              ),
            ),
          ),
        ),
        // Extra bottom blur zone - hidden when peeking
        if (!peekClear)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 180,
            child: IgnorePointer(
              child: ClipRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 1.2, sigmaY: 1.2),
                  child: ShaderMask(
                    shaderCallback: (Rect bounds) {
                      return LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.white.withValues(alpha: 0.3),
                          Colors.white.withValues(alpha: 0.7),
                          Colors.white,
                        ],
                        stops: const [0.0, 0.25, 0.55, 1.0],
                      ).createShader(bounds);
                    },
                    blendMode: BlendMode.dstIn,
                    child: Container(color: Colors.transparent),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _GlassIconButton extends StatelessWidget {
  final IconData icon;
  final String semanticLabel;
  final VoidCallback onTap;
  const _GlassIconButton(
      {required this.icon, required this.semanticLabel, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: _Pressable(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          ),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

class _GlassSuffixIconButton extends StatelessWidget {
  final IconData icon;
  final String semanticLabel;
  final VoidCallback onTap;
  const _GlassSuffixIconButton(
      {required this.icon, required this.semanticLabel, required this.onTap});

  @override
  Widget build(BuildContext context) {
    // Keep it “free-floating” inside the text field (no chip/background).
    return Semantics(
      button: true,
      label: semanticLabel,
      child: _Pressable(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Center(
              child: Icon(icon,
                  color: Colors.white.withValues(alpha: 0.85), size: 20)),
        ),
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8.0, sigmaY: 8.0),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.38),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _SITTextField extends StatelessWidget {
  final String label;
  final String placeholder;
  final TextEditingController controller;
  final FocusNode focusNode;
  final FocusNode? nextFocusNode;
  final TextInputType keyboardType;
  final TextInputAction textInputAction;
  final String? Function(String?) validator;
  final IconData prefixIcon;
  final bool obscureText;
  final Widget? suffix;
  final bool autocorrect;
  final bool enableSuggestions;
  final TextCapitalization textCapitalization;
  final ValueChanged<String>? onSubmitted;

  const _SITTextField({
    required this.label,
    required this.placeholder,
    required this.controller,
    required this.focusNode,
    this.nextFocusNode,
    required this.keyboardType,
    required this.textInputAction,
    required this.validator,
    required this.prefixIcon,
    this.obscureText = false,
    this.suffix,
    this.autocorrect = false,
    this.enableSuggestions = false,
    this.textCapitalization = TextCapitalization.none,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final field = MergeSemantics(
        child: Semantics(
      label: label,
      textField: true,
      child: TextFormField(
        controller: controller,
        focusNode: focusNode,
        keyboardType: keyboardType,
        textInputAction: textInputAction,
        obscureText: obscureText,
        autocorrect: autocorrect,
        enableSuggestions: enableSuggestions,
        textCapitalization: textCapitalization,
        style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white),
        validator: validator,
        onFieldSubmitted: (v) {
          if (nextFocusNode != null) {
            FocusScope.of(context).requestFocus(nextFocusNode);
          } else {
            onSubmitted?.call(v);
          }
        },
        decoration: InputDecoration(
          label: ExcludeSemantics(child: Text(label)),
          hintText: placeholder,
          hintStyle: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white.withValues(alpha: 0.42),
              fontWeight: FontWeight.w600),
          labelStyle: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w700),
          prefixIcon: Padding(
            padding: const EdgeInsets.only(left: 12, right: 10),
            child: Icon(prefixIcon,
                color: Colors.white.withValues(alpha: 0.78), size: 18),
          ),
          prefixIconConstraints:
              const BoxConstraints(minWidth: 0, minHeight: 0),
          suffixIcon: suffix == null
              ? null
              : const ExcludeSemantics(
                  child: SizedBox(width: 48, height: 40),
                ),
          filled: true,
          fillColor: Colors.black.withValues(alpha: 0.12),
          contentPadding: const EdgeInsets.fromLTRB(12, 16, 12, 16),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide:
                  BorderSide(color: Colors.white.withValues(alpha: 0.10))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide:
                  const BorderSide(color: BrandColors.logoAccent, width: 1.4)),
          errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                  color: BrandColors.danger.withValues(alpha: 0.9),
                  width: 1.2)),
          focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                  color: BrandColors.danger.withValues(alpha: 0.95),
                  width: 1.3)),
          errorStyle: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white.withValues(alpha: 0.92),
              height: 1.25,
              fontWeight: FontWeight.w700),
        ),
      ),
    ));
    if (suffix == null) return field;
    return Stack(
      children: [
        field,
        PositionedDirectional(top: 8, end: 8, child: suffix!),
      ],
    );
  }
}

class _PrimaryAuthButton extends StatelessWidget {
  final bool busy;
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  const _PrimaryAuthButton(
      {required this.busy,
      required this.label,
      required this.icon,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Pressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 54,
        decoration: BoxDecoration(
          gradient: onTap == null
              ? LinearGradient(colors: [
                  Colors.white.withValues(alpha: 0.10),
                  Colors.white.withValues(alpha: 0.08)
                ])
              : LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                      theme.colorScheme.primary,
                      theme.colorScheme.primary.withValues(alpha: 0.85)
                    ]),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
              color: onTap == null
                  ? Colors.white.withValues(alpha: 0.10)
                  : theme.colorScheme.primary.withValues(alpha: 0.55)),
          boxShadow: [
            BoxShadow(
                color:
                    Colors.black.withValues(alpha: onTap == null ? 0.12 : 0.26),
                blurRadius: 24,
                offset: const Offset(0, 16))
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (busy) ...[
              SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white
                          .withValues(alpha: onTap == null ? 0.75 : 1.0))),
              const SizedBox(width: 10),
            ] else ...[
              Icon(icon,
                  color: Colors.white
                      .withValues(alpha: onTap == null ? 0.75 : 1.0),
                  size: 20),
              const SizedBox(width: 10),
            ],
            Text(label,
                style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: Colors.white)),
          ],
        ),
      ),
    );
  }
}

class _TextLink extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _TextLink({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Pressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Text(label,
            style: theme.textTheme.bodySmall?.copyWith(
                color: BrandColors.logoAccent, fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class _Pressable extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final BorderRadius borderRadius;
  const _Pressable(
      {required this.child, required this.onTap, required this.borderRadius});

  @override
  State<_Pressable> createState() => _PressableState();
}

class _PressableState extends State<_Pressable> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: enabled ? (_) => setState(() => _down = true) : null,
      onTapCancel: enabled ? () => setState(() => _down = false) : null,
      onTapUp: enabled ? (_) => setState(() => _down = false) : null,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOut,
        scale: _down ? 0.985 : 1.0,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 140),
          opacity: enabled ? 1.0 : 0.55,
          child: widget.child,
        ),
      ),
    );
  }
}

class _PasswordResetSheet extends StatefulWidget {
  final String initialEmail;
  final PasswordResetRequester requestPasswordReset;
  const _PasswordResetSheet({
    required this.initialEmail,
    required this.requestPasswordReset,
  });

  @override
  State<_PasswordResetSheet> createState() => _PasswordResetSheetState();
}

class _PasswordResetSheetState extends State<_PasswordResetSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailCtrl;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _emailCtrl = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  String? _validateEmail(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
    if (!ok) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    return null;
  }

  Future<void> _submit() async {
    if (_busy) return;
    final ok = _formKey.currentState?.validate() ?? false;
    if (!ok) return;

    setState(() => _busy = true);
    try {
      final sent = await widget.requestPasswordReset(
        _emailCtrl.text.trim(),
      );
      if (!mounted) return;
      if (!sent) {
        await AppPopup.toast(
          context,
          icon: Icons.wifi_off_outlined,
          title: 'E-Mail konnte nicht angefordert werden',
          message: 'Bitte prüfe deine Verbindung und versuche es erneut.',
        );
        return;
      }
      Navigator.of(context).pop(true);
    } catch (e) {
      debugPrint('[PasswordReset] submit failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Form(
      key: _formKey,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(
          'Gib deine E-Mail ein. Wir senden dir einen sicheren Link, um dein Passwort zurückzusetzen.',
          style: theme.textTheme.bodyMedium?.copyWith(
              color: Colors.white.withValues(alpha: 0.78), height: 1.45),
        ),
        const SizedBox(height: 14),
        _SITResetField(controller: _emailCtrl, validator: _validateEmail),
        const SizedBox(height: 16),
        _PrimarySheetButton(
            busy: _busy,
            label: _busy ? 'Senden…' : 'Link senden',
            onTap: _busy ? null : _submit),
        const SizedBox(height: 8),
      ]),
    );
  }
}

class _SITResetField extends StatelessWidget {
  final TextEditingController controller;
  final String? Function(String?) validator;
  const _SITResetField({required this.controller, required this.validator});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MergeSemantics(
        child: Semantics(
      label: 'E-Mail für Passwortzurücksetzung',
      textField: true,
      child: TextFormField(
        controller: controller,
        keyboardType: TextInputType.emailAddress,
        textInputAction: TextInputAction.done,
        autocorrect: false,
        enableSuggestions: false,
        textCapitalization: TextCapitalization.none,
        style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: theme.colorScheme.onSurface),
        validator: validator,
        decoration: InputDecoration(
          label: const ExcludeSemantics(child: Text('E-Mail')),
          hintText: 'deine@email.com',
          filled: true,
          fillColor: Colors.white.withValues(alpha: 0.06),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide:
                  BorderSide(color: Colors.white.withValues(alpha: 0.12))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide:
                  const BorderSide(color: BrandColors.logoAccent, width: 1.4)),
          errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                  color: BrandColors.danger.withValues(alpha: 0.9),
                  width: 1.2)),
          focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                  color: BrandColors.danger.withValues(alpha: 0.95),
                  width: 1.3)),
          errorStyle: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white.withValues(alpha: 0.95), height: 1.25),
        ),
      ),
    ));
  }
}

class _PrimarySheetButton extends StatelessWidget {
  final bool busy;
  final String label;
  final VoidCallback? onTap;
  const _PrimarySheetButton(
      {required this.busy, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Pressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          gradient: onTap == null
              ? LinearGradient(colors: [
                  Colors.white.withValues(alpha: 0.12),
                  Colors.white.withValues(alpha: 0.10)
                ])
              : LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                      theme.colorScheme.primary,
                      theme.colorScheme.primary.withValues(alpha: 0.85)
                    ]),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        ),
        alignment: Alignment.center,
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          if (busy) ...[
            const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white)),
            const SizedBox(width: 10),
          ],
          Text(label,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w900)),
        ]),
      ),
    );
  }
}

double mathMax(double a, double b) => a > b ? a : b;
