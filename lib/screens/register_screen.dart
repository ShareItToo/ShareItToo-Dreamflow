import 'dart:ui';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lendify/config/private_pilot_config.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/screens/legal_privacy_screen.dart';
import 'package:lendify/screens/legal_terms_screen.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/utils/registration_input_policy.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/social_auth_button.dart';
import 'package:provider/provider.dart';

class RegisterScreen extends StatefulWidget {
  final int? returnTabIndex;
  const RegisterScreen({super.key, this.returnTabIndex});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _cardKey = GlobalKey();
  final _stickyBarKey = GlobalKey();

  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _pwCtrl = TextEditingController();

  Future<void> _syncRentalCartAfterAuthentication() async {
    try {
      await DataService.syncGuestRentalCartAfterAuthentication();
    } catch (error) {
      // Preserve the guest copy. RentalCartScreen retries after navigation.
      debugPrint('[RegisterScreen] rental cart sync pending: $error');
    }
  }

  final _pw2Ctrl = TextEditingController();

  final _nameFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _pwFocus = FocusNode();
  final _pw2Focus = FocusNode();

  bool _busy = false;
  bool _pwVisible = false;
  bool _pw2Visible = false;
  bool _peekBackdrop = false;
  bool _minimumAgeConfirmed = false;
  bool _privateUseConfirmed = false;
  bool _termsAccepted = false;
  bool _privacyAccepted = false;

  bool _didInteract = false;
  int _socialActionEpoch = 0;

  @override
  void initState() {
    super.initState();
    void markDirty() {
      if (!_didInteract) _didInteract = true;
      if (mounted) setState(() {});
    }

    _nameCtrl.addListener(markDirty);
    _emailCtrl.addListener(markDirty);
    _pwCtrl.addListener(markDirty);
    _pw2Ctrl.addListener(markDirty);
  }

  void _openTerms() {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const LegalTermsScreen()));
  }

  void _openPrivacy() {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const LegalPrivacyScreen()));
  }

  @override
  void dispose() {
    _socialActionEpoch += 1;
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _pwCtrl.dispose();
    _pw2Ctrl.dispose();
    _nameFocus.dispose();
    _emailFocus.dispose();
    _pwFocus.dispose();
    _pw2Focus.dispose();
    super.dispose();
  }

  bool _isOutsideInteractiveArea(Offset globalPosition) {
    final cardCtx = _cardKey.currentContext;
    if (cardCtx != null) {
      final box = cardCtx.findRenderObject();
      if (box is RenderBox) {
        final topLeft = box.localToGlobal(Offset.zero);
        final rect = topLeft & box.size;
        if (rect.contains(globalPosition)) return false;
      }
    }
    final barCtx = _stickyBarKey.currentContext;
    if (barCtx != null) {
      final box = barCtx.findRenderObject();
      if (box is RenderBox) {
        final topLeft = box.localToGlobal(Offset.zero);
        final rect = topLeft & box.size;
        if (rect.contains(globalPosition)) return false;
      }
    }
    return true;
  }

  String? _validateName(String? v) {
    return registrationDisplayNameError(v);
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
    if (value.length < 10) return 'Mindestens 10 Zeichen erforderlich.';
    if (!RegExp(r'\p{L}', unicode: true).hasMatch(value) ||
        !RegExp(r'\d').hasMatch(value)) {
      return 'Nutze mindestens einen Buchstaben und eine Zahl.';
    }
    return null;
  }

  String? _validatePassword2(String? v) {
    final value = (v ?? '');
    if (value.trim().isEmpty) return 'Bitte bestätige dein Passwort.';
    if (value != _pwCtrl.text) return 'Die Passwörter stimmen nicht überein.';
    return null;
  }

  Future<void> _register() async {
    if (_busy) return;
    FocusScope.of(context).unfocus();
    final ok = _formKey.currentState?.validate() ?? false;
    if (!ok) return;
    if (!_minimumAgeConfirmed) {
      await AppPopup.toast(
        context,
        icon: Icons.cake_outlined,
        title: 'Bitte bestätige, dass du 18 Jahre oder älter bist.',
      );
      return;
    }
    if (!_termsAccepted || !_privacyAccepted || !_privateUseConfirmed) {
      await AppPopup.toast(
        context,
        icon: Icons.gavel_outlined,
        title: 'Bitte bestätige AGB und Datenschutz.',
      );
      return;
    }

    setState(() => _busy = true);
    try {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      final result = await AuthService.registerLocalAccount(
        email: _emailCtrl.text.trim(),
        password: _pwCtrl.text,
        displayName: _nameCtrl.text.trim(),
        termsAccepted: _termsAccepted,
        privacyAccepted: _privacyAccepted,
        minimumAgeConfirmed: _minimumAgeConfirmed,
        privateUseConfirmed: _privateUseConfirmed,
      );
      if (!mounted) return;
      if (!result.ok) {
        final msg = switch (result.failure) {
          AuthFailure.emailInUse => 'Diese E-Mail ist bereits registriert.',
          AuthFailure.weakPassword =>
            'Das Passwort muss mindestens 10 Zeichen, einen Buchstaben und eine Zahl enthalten.',
          AuthFailure.consentRequired =>
            'Bitte bestätige: 18 Jahre oder älter, AGB und Datenschutz.',
          AuthFailure.verificationDeliveryUnavailable =>
            'Dein Konto wurde vorgemerkt, aber die Bestätigungs-E-Mail konnte nicht angefordert werden. Bitte versuche die Registrierung später mit derselben E-Mail erneut.',
          AuthFailure.network =>
            'Es ist ein Netzwerkfehler aufgetreten. Bitte versuche es erneut.',
          _ => 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.',
        };
        await AppPopup.toast(context, icon: Icons.error_outline, title: msg);
        return;
      }

      if (result.session == null) {
        final pendingEmail = _emailCtrl.text.trim();
        _pwCtrl.clear();
        _pw2Ctrl.clear();
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => LoginScreen(
              returnTabIndex: widget.returnTabIndex,
              initialEmail: pendingEmail,
              verificationPending: true,
            ),
          ),
        );
        return;
      }

      await DataService.syncCurrentUserForSessionEmail(
        _emailCtrl.text.trim(),
      );
      await _syncRentalCartAfterAuthentication();
      final registeredUser = await DataService.getCurrentUser();
      final displayName = _nameCtrl.text.trim();
      if (registeredUser != null && displayName.isNotEmpty) {
        await DataService.setCurrentUser(
          registeredUser.copyWith(displayName: displayName),
        );
      }

      if (result.verificationEmailSent && mounted) {
        await AppPopup.toast(
          context,
          icon: Icons.mark_email_read_outlined,
          title: 'Bestätigungs-E-Mail gesendet',
          message:
              'Öffne den Link in deiner E-Mail, um dein Konto zu bestätigen.',
        );
      }

      if (!mounted) return;
      await context
          .read<DeveloperPreviewController>()
          .setState(DeveloperUserState.loggedIn);
      if (!mounted) return;
      final targetIndex = widget.returnTabIndex;
      Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(
              builder: (_) => MainNavigation(initialIndex: targetIndex ?? 0)),
          (route) => false);
    } catch (e) {
      debugPrint('[RegisterScreen] register failed: $e');
      if (!mounted) return;
      await AppPopup.toast(context,
          icon: Icons.wifi_off_outlined,
          title: 'Es ist ein Fehler aufgetreten.',
          message: 'Bitte versuche es erneut.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _socialRegister(AuthSocialProvider provider) async {
    if (_busy || !mounted) return;
    final actionEpoch = ++_socialActionEpoch;
    final noSessionEpoch = AuthService.sessionEpoch;
    final providerLabel = switch (provider) {
      AuthSocialProvider.google => 'Google',
      AuthSocialProvider.apple => 'Apple',
      AuthSocialProvider.facebook => 'Facebook',
    };
    if (!_minimumAgeConfirmed ||
        !_termsAccepted ||
        !_privacyAccepted ||
        !_privateUseConfirmed) {
      await AppPopup.toast(
        context,
        icon: Icons.gavel_outlined,
        title: 'Bitte bestätige: 18 Jahre oder älter, AGB und Datenschutz.',
      );
      return;
    }
    AuthSessionOwner? successfulSessionOwner;
    setState(() => _busy = true);
    try {
      final definitelySignedOut =
          await AuthService.isStoredSessionDefinitelyAbsent();
      if (!_isSocialActionCurrent(actionEpoch) ||
          AuthService.sessionEpoch != noSessionEpoch ||
          !definitelySignedOut) {
        return;
      }
      final result = await AuthService.signInWithSocialProvider(
        provider,
        termsAccepted: _termsAccepted,
        privacyAccepted: _privacyAccepted,
        minimumAgeConfirmed: _minimumAgeConfirmed,
        privateUseConfirmed: _privateUseConfirmed,
        expectedSessionEpoch: noSessionEpoch,
        isActionCurrent: () => _isSocialActionCurrent(actionEpoch),
      );
      if (!_isSocialActionCurrent(actionEpoch)) {
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
            'Die $providerLabel-Registrierung ist gerade nicht erreichbar. Bitte versuche es erneut.',
        };
        if (!mounted) return;
        await AppPopup.toast(
          context,
          icon: Icons.error_outline,
          title: message,
        );
        return;
      }
      if (result.session == null) {
        final pendingEmail = result.pendingEmail ?? '';
        if (!_isSocialActionCurrent(actionEpoch)) return;
        if (!mounted) return;
        await AppPopup.toast(
          context,
          icon: Icons.mark_email_read_outlined,
          title: 'Bestätigungs-E-Mail gesendet',
          message:
              'Bestätige einmal deine E-Mail und melde dich danach erneut mit $providerLabel an.',
        );
        if (!_isSocialActionCurrent(actionEpoch)) return;
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => LoginScreen(
              returnTabIndex: widget.returnTabIndex,
              initialEmail: pendingEmail,
              verificationPending: true,
            ),
          ),
        );
        return;
      }
      final successfulSession = result.session!;
      successfulSessionOwner =
          AuthService.captureSessionOwner(successfulSession);
      final email = successfulSession.email;
      await DataService.syncCurrentUserForSessionEmail(email);
      if (!await _retainSuccessfulSocialRegistrationOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      await _syncRentalCartAfterAuthentication();
      if (!await _retainSuccessfulSocialRegistrationOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      await FirebaseRuntime.syncPushRegistration();
      if (!await _retainSuccessfulSocialRegistrationOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      if (!mounted) return;
      await context
          .read<DeveloperPreviewController>()
          .setState(DeveloperUserState.loggedIn);
      if (!await _retainSuccessfulSocialRegistrationOwner(
        actionEpoch,
        successfulSessionOwner,
      )) {
        return;
      }
      final targetIndex = widget.returnTabIndex;
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => MainNavigation(initialIndex: targetIndex ?? 0),
        ),
        (route) => false,
      );
    } catch (error) {
      debugPrint('[RegisterScreen] social registration failed: $error');
      final completedOwner = successfulSessionOwner;
      if (completedOwner != null) {
        await AuthService.clearSessionOwnerIfMatches(
          completedOwner,
          runLogoutCleanup: false,
        );
      }
      if (!_isSocialActionCurrent(actionEpoch)) return;
      if (!mounted) return;
      await AppPopup.toast(
        context,
        icon: Icons.wifi_off_outlined,
        title: 'Registrierung nicht abgeschlossen.',
        message: 'Bitte versuche es erneut.',
      );
    } finally {
      if (_isSocialActionCurrent(actionEpoch)) {
        setState(() => _busy = false);
      }
    }
  }

  bool _isSocialActionCurrent(int actionEpoch) =>
      mounted && actionEpoch == _socialActionEpoch;

  Future<bool> _retainSuccessfulSocialRegistrationOwner(
    int actionEpoch,
    AuthSessionOwner successfulSessionOwner,
  ) async {
    if (_isSocialActionCurrent(actionEpoch) &&
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

    final nameOk = _validateName(_nameCtrl.text) == null;
    final emailOk = _validateEmail(_emailCtrl.text) == null;
    final pwOk = _validatePassword(_pwCtrl.text) == null;
    final pw2Ok = _validatePassword2(_pw2Ctrl.text) == null;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          Positioned.fill(
              child: IgnorePointer(
                  child: _RegisterBackdrop(peekClear: _peekBackdrop))),
          Listener(
            behavior: HitTestBehavior.translucent,
            onPointerDown: (e) {
              if (_isOutsideInteractiveArea(e.position)) {
                setState(() => _peekBackdrop = true);
              }
            },
            onPointerUp: (_) {
              if (_peekBackdrop) setState(() => _peekBackdrop = false);
            },
            onPointerCancel: (_) {
              if (_peekBackdrop) setState(() => _peekBackdrop = false);
            },
            child: SafeArea(
              child: Column(
                children: [
                  AnimatedOpacity(
                    duration: const Duration(milliseconds: 140),
                    curve: Curves.easeOut,
                    opacity: _peekBackdrop ? 0.0 : 1.0,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                      child: Row(children: [
                        _GlassIconButton(
                            icon: Icons.arrow_back,
                            semanticLabel: MaterialLocalizations.of(context)
                                .backButtonTooltip,
                            onTap: () => Navigator.of(context).maybePop()),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text('Dein SIT-Konto erstellen',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.titleLarge?.copyWith(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  height: 1.15)),
                        ),
                        const SizedBox(width: 54),
                      ]),
                    ),
                  ),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        const bottomBarHeight = _StickyAuthBar.kMinHeight;
                        final bottomPadding =
                            bottomBarHeight + 8 + media.padding.bottom;
                        final availableHeight =
                            constraints.maxHeight - bottomPadding - 8;

                        return SingleChildScrollView(
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          padding:
                              EdgeInsets.fromLTRB(16, 12, 16, bottomPadding),
                          child: ConstrainedBox(
                            constraints:
                                BoxConstraints(minHeight: availableHeight),
                            child: Center(
                              child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 520),
                                child: AnimatedOpacity(
                                  duration: const Duration(milliseconds: 140),
                                  curve: Curves.easeOut,
                                  opacity: _peekBackdrop ? 0.0 : 1.0,
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 16),
                                        child: Text(
                                            'Miete und vermiete Dinge sicher in deiner Nähe.',
                                            textAlign: TextAlign.center,
                                            style: theme.textTheme.bodyMedium
                                                ?.copyWith(
                                                    color: Colors.white
                                                        .withValues(
                                                            alpha: 0.85),
                                                    height: 1.3,
                                                    fontWeight: FontWeight.w600,
                                                    fontSize: 14)),
                                      ),
                                      KeyedSubtree(
                                        key: _cardKey,
                                        child: _GlassCard(
                                          child: Padding(
                                            padding: const EdgeInsets.fromLTRB(
                                                14, 12, 14, 12),
                                            child: Form(
                                              key: _formKey,
                                              autovalidateMode: _didInteract
                                                  ? AutovalidateMode
                                                      .onUserInteraction
                                                  : AutovalidateMode.disabled,
                                              child: Column(
                                                  crossAxisAlignment:
                                                      CrossAxisAlignment
                                                          .stretch,
                                                  children: [
                                                    _SITTextField(
                                                      label: 'Name',
                                                      placeholder:
                                                          'Max Mustermann',
                                                      controller: _nameCtrl,
                                                      focusNode: _nameFocus,
                                                      nextFocusNode:
                                                          _emailFocus,
                                                      keyboardType:
                                                          TextInputType.name,
                                                      textInputAction:
                                                          TextInputAction.next,
                                                      validator: _validateName,
                                                      prefixIcon:
                                                          Icons.person_outline,
                                                      status: _didInteract &&
                                                              _nameCtrl.text
                                                                  .trim()
                                                                  .isNotEmpty
                                                          ? (nameOk
                                                              ? _FieldStatus
                                                                  .success
                                                              : _FieldStatus
                                                                  .error)
                                                          : _FieldStatus
                                                              .neutral,
                                                      autocorrect: true,
                                                      enableSuggestions: true,
                                                      textCapitalization:
                                                          TextCapitalization
                                                              .words,
                                                    ),
                                                    const SizedBox(height: 10),
                                                    _SITTextField(
                                                      label: 'E-Mail',
                                                      placeholder:
                                                          'deine@email.com',
                                                      controller: _emailCtrl,
                                                      focusNode: _emailFocus,
                                                      nextFocusNode: _pwFocus,
                                                      keyboardType:
                                                          TextInputType
                                                              .emailAddress,
                                                      textInputAction:
                                                          TextInputAction.next,
                                                      validator: _validateEmail,
                                                      prefixIcon:
                                                          Icons.alternate_email,
                                                      status: _didInteract &&
                                                              _emailCtrl.text
                                                                  .trim()
                                                                  .isNotEmpty
                                                          ? (emailOk
                                                              ? _FieldStatus
                                                                  .success
                                                              : _FieldStatus
                                                                  .error)
                                                          : _FieldStatus
                                                              .neutral,
                                                      autocorrect: false,
                                                      enableSuggestions: false,
                                                      textCapitalization:
                                                          TextCapitalization
                                                              .none,
                                                    ),
                                                    const SizedBox(height: 10),
                                                    _SITTextField(
                                                      label: 'Passwort',
                                                      placeholder: '••••••••',
                                                      controller: _pwCtrl,
                                                      focusNode: _pwFocus,
                                                      nextFocusNode: _pw2Focus,
                                                      keyboardType:
                                                          TextInputType
                                                              .visiblePassword,
                                                      textInputAction:
                                                          TextInputAction.next,
                                                      validator:
                                                          _validatePassword,
                                                      prefixIcon:
                                                          Icons.lock_outline,
                                                      status: _didInteract &&
                                                              _pwCtrl.text
                                                                  .isNotEmpty
                                                          ? (pwOk
                                                              ? _FieldStatus
                                                                  .success
                                                              : _FieldStatus
                                                                  .error)
                                                          : _FieldStatus
                                                              .neutral,
                                                      obscureText: !_pwVisible,
                                                      autocorrect: false,
                                                      enableSuggestions: false,
                                                      textCapitalization:
                                                          TextCapitalization
                                                              .none,
                                                      suffix: _GlassSuffixIconButton(
                                                          icon: _pwVisible
                                                              ? Icons
                                                                  .visibility_off_outlined
                                                              : Icons
                                                                  .visibility_outlined,
                                                          semanticLabel: _pwVisible
                                                              ? 'Passwort verbergen'
                                                              : 'Passwort anzeigen',
                                                          onTap: () => setState(
                                                              () => _pwVisible =
                                                                  !_pwVisible)),
                                                    ),
                                                    const SizedBox(height: 4),
                                                    _HintRow(
                                                        icon: Icons
                                                            .check_circle_outline,
                                                        ok: pwOk,
                                                        text:
                                                            'Mind. 10 Zeichen, Buchstabe und Zahl'),
                                                    const SizedBox(height: 10),
                                                    _SITTextField(
                                                      label:
                                                          'Passwort wiederholen',
                                                      placeholder: '••••••••',
                                                      controller: _pw2Ctrl,
                                                      focusNode: _pw2Focus,
                                                      keyboardType:
                                                          TextInputType
                                                              .visiblePassword,
                                                      textInputAction:
                                                          TextInputAction.done,
                                                      validator:
                                                          _validatePassword2,
                                                      prefixIcon:
                                                          Icons.lock_outline,
                                                      status: _didInteract &&
                                                              _pw2Ctrl.text
                                                                  .isNotEmpty
                                                          ? (pw2Ok
                                                              ? _FieldStatus
                                                                  .success
                                                              : _FieldStatus
                                                                  .error)
                                                          : _FieldStatus
                                                              .neutral,
                                                      obscureText: !_pw2Visible,
                                                      autocorrect: false,
                                                      enableSuggestions: false,
                                                      textCapitalization:
                                                          TextCapitalization
                                                              .none,
                                                      onSubmitted: (_) =>
                                                          _register(),
                                                      suffix: _GlassSuffixIconButton(
                                                          icon: _pw2Visible
                                                              ? Icons
                                                                  .visibility_off_outlined
                                                              : Icons
                                                                  .visibility_outlined,
                                                          semanticLabel: _pw2Visible
                                                              ? 'Passwortbestätigung verbergen'
                                                              : 'Passwortbestätigung anzeigen',
                                                          onTap: () => setState(
                                                              () => _pw2Visible =
                                                                  !_pw2Visible)),
                                                    ),
                                                    const SizedBox(height: 4),
                                                    _HintRow(
                                                        icon: Icons
                                                            .verified_outlined,
                                                        ok: pw2Ok,
                                                        text:
                                                            'Passwörter müssen übereinstimmen'),
                                                    const SizedBox(height: 10),
                                                    CheckboxListTile(
                                                      value:
                                                          _minimumAgeConfirmed,
                                                      onChanged: _busy
                                                          ? null
                                                          : (value) => setState(
                                                              () =>
                                                                  _minimumAgeConfirmed =
                                                                      value ==
                                                                          true),
                                                      controlAffinity:
                                                          ListTileControlAffinity
                                                              .leading,
                                                      contentPadding:
                                                          EdgeInsets.zero,
                                                      dense: true,
                                                      title: const Text(
                                                        'Ich bin 18 Jahre oder älter.',
                                                      ),
                                                    ),
                                                    CheckboxListTile(
                                                      value:
                                                          _privateUseConfirmed,
                                                      onChanged: _busy
                                                          ? null
                                                          : (value) => setState(
                                                              () =>
                                                                  _privateUseConfirmed =
                                                                      value ==
                                                                          true),
                                                      controlAffinity:
                                                          ListTileControlAffinity
                                                              .leading,
                                                      contentPadding:
                                                          EdgeInsets.zero,
                                                      dense: true,
                                                      title: const Text(
                                                        PrivatePilotConfig
                                                            .accountPrivateDeclaration,
                                                      ),
                                                    ),
                                                    CheckboxListTile(
                                                      value: _termsAccepted,
                                                      onChanged: _busy
                                                          ? null
                                                          : (value) => setState(
                                                              () =>
                                                                  _termsAccepted =
                                                                      value ==
                                                                          true),
                                                      controlAffinity:
                                                          ListTileControlAffinity
                                                              .leading,
                                                      contentPadding:
                                                          EdgeInsets.zero,
                                                      dense: true,
                                                      title: const Text(
                                                        'Ich akzeptiere die AGB.',
                                                      ),
                                                    ),
                                                    CheckboxListTile(
                                                      value: _privacyAccepted,
                                                      onChanged: _busy
                                                          ? null
                                                          : (value) => setState(
                                                              () =>
                                                                  _privacyAccepted =
                                                                      value ==
                                                                          true),
                                                      controlAffinity:
                                                          ListTileControlAffinity
                                                              .leading,
                                                      contentPadding:
                                                          EdgeInsets.zero,
                                                      dense: true,
                                                      title: const Text(
                                                        'Ich akzeptiere die Datenschutzbestimmungen.',
                                                      ),
                                                    ),
                                                    const SizedBox(height: 10),
                                                    const SocialAuthOrDivider(),
                                                    const SizedBox(height: 10),
                                                    SocialAuthButton(
                                                        brand: SocialAuthBrand
                                                            .google,
                                                        label:
                                                            'Mit Google registrieren',
                                                        onTap: _busy ||
                                                                !AuthService.socialProviderEnabled(
                                                                    AuthSocialProvider
                                                                        .google)
                                                            ? null
                                                            : () => _socialRegister(
                                                                AuthSocialProvider
                                                                    .google)),
                                                    const SizedBox(height: 8),
                                                    SocialAuthButton(
                                                        brand: SocialAuthBrand
                                                            .apple,
                                                        label:
                                                            'Mit Apple registrieren',
                                                        onTap: _busy ||
                                                                !AuthService
                                                                    .socialProviderEnabled(
                                                                        AuthSocialProvider
                                                                            .apple)
                                                            ? null
                                                            : () => _socialRegister(
                                                                AuthSocialProvider
                                                                    .apple)),
                                                    const SizedBox(height: 8),
                                                    SocialAuthButton(
                                                        brand: SocialAuthBrand
                                                            .facebook,
                                                        label:
                                                            'Mit Facebook registrieren',
                                                        onTap: _busy ||
                                                                !AuthService.socialProviderEnabled(
                                                                    AuthSocialProvider
                                                                        .facebook)
                                                            ? null
                                                            : () => _socialRegister(
                                                                AuthSocialProvider
                                                                    .facebook)),
                                                  ]),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 140),
              curve: Curves.easeOut,
              opacity: _peekBackdrop ? 0.0 : 1.0,
              child: KeyedSubtree(
                key: _stickyBarKey,
                child: _StickyAuthBar(
                  busy: _busy,
                  onSubmit: _busy ? null : _register,
                  onOpenTerms: _openTerms,
                  onOpenPrivacy: _openPrivacy,
                  onLogin: () => Navigator.of(context).maybePop(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RegisterBackdrop extends StatelessWidget {
  final bool peekClear;
  const _RegisterBackdrop({required this.peekClear});

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

enum _FieldStatus { neutral, success, error }

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
  final _FieldStatus status;
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
    this.status = _FieldStatus.neutral,
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

    final border = switch (status) {
      _FieldStatus.success => BrandColors.success.withValues(alpha: 0.90),
      _FieldStatus.error => BrandColors.danger.withValues(alpha: 0.95),
      _FieldStatus.neutral => Colors.white.withValues(alpha: 0.12),
    };
    final focusedBorder = switch (status) {
      _FieldStatus.success => BrandColors.success,
      _FieldStatus.error => BrandColors.danger,
      _FieldStatus.neutral => BrandColors.primary,
    };

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
          fillColor: Colors.black.withValues(alpha: 0.10),
          contentPadding: const EdgeInsets.fromLTRB(12, 14, 12, 14),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(color: border, width: 1.0)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                  color: focusedBorder.withValues(alpha: 0.90), width: 1.35)),
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

class _HintRow extends StatelessWidget {
  final IconData icon;
  final bool ok;
  final String text;
  const _HintRow({required this.icon, required this.ok, required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = ok
        ? BrandColors.success.withValues(alpha: 0.95)
        : Colors.white.withValues(alpha: 0.55);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Row(children: [
        Icon(icon, size: 14, color: c),
        const SizedBox(width: 8),
        Expanded(
            child: Text(text,
                style: theme.textTheme.labelSmall?.copyWith(
                    color: c, height: 1.2, fontWeight: FontWeight.w700))),
      ]),
    );
  }
}

class _StickyAuthBar extends StatelessWidget {
  static const kMinHeight = 130.0;
  final bool busy;
  final VoidCallback? onSubmit;
  final VoidCallback onOpenTerms;
  final VoidCallback onOpenPrivacy;
  final VoidCallback onLogin;
  const _StickyAuthBar(
      {required this.busy,
      required this.onSubmit,
      required this.onOpenTerms,
      required this.onOpenPrivacy,
      required this.onLogin});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            16, 8, 16, 8 + (media.padding.bottom > 0 ? 0 : 4)),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _PrimaryCTAButton(
                    busy: busy,
                    label: busy ? 'Registrieren…' : 'Kostenlos registrieren',
                    onTap: onSubmit),
                const SizedBox(height: 8),
                _LegalText(
                    onOpenTerms: onOpenTerms, onOpenPrivacy: onOpenPrivacy),
                const SizedBox(height: 6),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text('Schon bei SIT? ',
                      style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 13)),
                  _TextLink(label: 'Anmelden', onTap: onLogin),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PrimaryCTAButton extends StatelessWidget {
  final bool busy;
  final String label;
  final VoidCallback? onTap;
  const _PrimaryCTAButton(
      {required this.busy, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Pressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 56,
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
                      theme.colorScheme.primary.withValues(alpha: 0.82)
                    ]),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: onTap == null
                  ? Colors.white.withValues(alpha: 0.10)
                  : theme.colorScheme.primary.withValues(alpha: 0.55)),
          boxShadow: [
            BoxShadow(
                color:
                    Colors.black.withValues(alpha: onTap == null ? 0.14 : 0.30),
                blurRadius: 26,
                offset: const Offset(0, 16))
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16),
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
              Icon(Icons.person_add_alt_1,
                  color: Colors.white
                      .withValues(alpha: onTap == null ? 0.75 : 1.0),
                  size: 20),
              const SizedBox(width: 10),
            ],
            Flexible(
                child: Text(label,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: Colors.white))),
          ],
        ),
      ),
    );
  }
}

class _LegalText extends StatelessWidget {
  final VoidCallback onOpenTerms;
  final VoidCallback onOpenPrivacy;
  const _LegalText({required this.onOpenTerms, required this.onOpenPrivacy});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final base = theme.textTheme.labelSmall?.copyWith(
        color: Colors.white.withValues(alpha: 0.75), height: 1.3, fontSize: 11);
    final link = theme.textTheme.labelSmall?.copyWith(
      color: Colors.white.withValues(alpha: 0.95),
      height: 1.3,
      fontSize: 11,
      fontWeight: FontWeight.w800,
      decoration: TextDecoration.underline,
      decorationColor: Colors.white.withValues(alpha: 0.80),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
                text: 'Bitte lies vor der Registrierung unsere ', style: base),
            TextSpan(
                text: 'AGB',
                style: link,
                recognizer: TapGestureRecognizer()..onTap = onOpenTerms),
            TextSpan(text: ' und ', style: base),
            TextSpan(
                text: 'Datenschutzbestimmungen',
                style: link,
                recognizer: TapGestureRecognizer()..onTap = onOpenPrivacy),
            TextSpan(text: '.', style: base),
          ],
        ),
        textAlign: TextAlign.center,
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
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Text(label,
            style: theme.textTheme.bodySmall?.copyWith(
                color: BrandColors.logoAccent,
                fontWeight: FontWeight.w900,
                fontSize: 13)),
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
