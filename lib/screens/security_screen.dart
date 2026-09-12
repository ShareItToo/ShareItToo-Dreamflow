import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/foundation.dart'
    show TargetPlatform, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:lendify/models/security.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/services/account_security_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

class SecurityScreen extends StatefulWidget {
  final AccountSecurityService? securityService;

  const SecurityScreen({super.key, this.securityService});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  late final AccountSecurityService _securityService;
  StreamSubscription<String>? _securityStateSubscription;
  final _currentCtrl = TextEditingController();
  final _nextCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _loading = true;
  bool _pwBusy = false;
  bool _devicesBusy = false;
  TrackedDialogRouteHandle<bool>? _activeConfirmationDialog;
  TrackedDialogRouteHandle<void>? _activeOutcomeDialog;
  bool _pwObscureCurrent = true;
  bool _pwObscureNext = true;
  bool _pwObscureConfirm = true;
  String? _loadError;
  List<SecurityDevice> _devices = const [];
  int _loadRevision = 0;
  int _securityEpoch = 0;

  @override
  void initState() {
    super.initState();
    _securityService = widget.securityService ?? const AccountSecurityService();
    _securityStateSubscription =
        SharedPersistenceSync.changes.listen(_handleSecurityStateChange);
    unawaited(_load());
  }

  @override
  void dispose() {
    _loadRevision += 1;
    _securityEpoch += 1;
    _securityStateSubscription?.cancel();
    _currentCtrl.dispose();
    _nextCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  void _handleSecurityStateChange(String key) {
    if (key != SharedPersistenceSync.accountSecurityStateKey) return;
    _securityEpoch += 1;
    _loadRevision += 1;
    _clearPasswordFields();
    if (!mounted) return;
    _activeConfirmationDialog?.dismiss(false);
    _activeOutcomeDialog?.dismiss();
    setState(() {
      _devices = const [];
      _loadError = null;
      _pwBusy = false;
      _devicesBusy = false;
      _loading = _securityService.isAvailable;
    });
    if (_securityService.isAvailable) unawaited(_load());
  }

  void _clearPasswordFields() {
    _currentCtrl.clear();
    _nextCtrl.clear();
    _confirmCtrl.clear();
  }

  _SecurityInteractionOwner? _captureInteractionOwner() {
    if (_loading || _loadError != null) return null;
    final current = _devices.where((device) => device.isThisDevice).toList();
    if (current.length != 1 || current.single.id.trim().isEmpty) return null;
    return _SecurityInteractionOwner(
      epoch: _securityEpoch,
      principalSessionId: current.single.id.trim(),
    );
  }

  bool _isInteractionOwnerCurrent(_SecurityInteractionOwner owner) {
    if (!mounted || owner.epoch != _securityEpoch) return false;
    final current = _devices.where((device) => device.isThisDevice).toList();
    return current.length == 1 &&
        current.single.id.trim() == owner.principalSessionId;
  }

  Future<void> _showOwnedOutcome({
    required String title,
    required String message,
  }) async {
    final handle = TrackedDialogRouteHandle<void>();
    _activeOutcomeDialog = handle;
    try {
      await AppPopup.error(
        context,
        title: title,
        message: message,
        routeHandle: handle,
      );
    } finally {
      if (identical(_activeOutcomeDialog, handle)) {
        _activeOutcomeDialog = null;
      }
    }
  }

  Future<void> _showOwnedSuccess({
    required String title,
    required String message,
  }) async {
    final handle = TrackedDialogRouteHandle<void>();
    _activeOutcomeDialog = handle;
    try {
      await AppPopup.success(
        context,
        title: title,
        message: message,
        routeHandle: handle,
      );
    } finally {
      if (identical(_activeOutcomeDialog, handle)) {
        _activeOutcomeDialog = null;
      }
    }
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    if (!_securityService.isAvailable) {
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _devices = const [];
        _loadError = null;
        _loading = false;
      });
      return;
    }
    if (mounted) {
      setState(() {
        _devices = const [];
        _loadError = null;
        _loading = true;
      });
    }
    try {
      final devices = await _securityService.getSessions();
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _devices = devices;
        _loading = false;
      });
    } catch (error) {
      debugPrint('[SecurityScreen] load failed: ${error.runtimeType}');
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _devices = const [];
        _loadError = 'Die serverbestätigten Sicherheitsdaten konnten nicht '
            'geladen werden.';
        _loading = false;
      });
    }
  }

  bool get _passwordValid {
    final current = _currentCtrl.text;
    final next = _nextCtrl.text;
    return current.isNotEmpty &&
        _validateNewPassword(next) == null &&
        next == _confirmCtrl.text;
  }

  String? _validateNewPassword(String value) {
    final password = value.trim();
    if (password.length < 10) return 'Mindestens 10 Zeichen';
    if (password.length > 1024) return 'Passwort ist zu lang';
    if (!RegExp(r'\p{L}', unicode: true).hasMatch(password)) {
      return 'Mindestens ein Buchstabe';
    }
    if (!RegExp(r'\d').hasMatch(password)) {
      return 'Mindestens eine Zahl';
    }
    return null;
  }

  Future<void> _changePassword() async {
    if (!_securityService.isAvailable || !_passwordValid || _pwBusy) return;
    final owner = _captureInteractionOwner();
    if (owner == null || !_isInteractionOwnerCurrent(owner)) return;
    final operationEpoch = owner.epoch;
    setState(() => _pwBusy = true);
    try {
      try {
        if (!_isInteractionOwnerCurrent(owner)) return;
        await _securityService.changePassword(
          currentPassword: _currentCtrl.text,
          newPassword: _nextCtrl.text,
        );
      } on PasswordChangeFailure catch (error) {
        debugPrint(
          '[SecurityScreen] changePassword outcome: ${error.kind.name}',
        );
        if (!mounted) return;
        final outcomeEpoch = _securityEpoch;
        if (error.localSessionDefinitelyCleared) {
          if (!await _securityService.isLocalSessionDefinitelyAbsent()) return;
          if (!mounted || outcomeEpoch != _securityEpoch) return;
        } else if (!_isInteractionOwnerCurrent(owner)) {
          return;
        }
        _clearPasswordFields();
        setState(() {});
        final (title, message) = switch (error.kind) {
          PasswordChangeFailureKind.rejected => (
              'Passwort nicht geändert',
              'Der Server hat die Änderung abgelehnt. '
                  'Bitte prüfe deine Eingaben und versuche es erneut.',
            ),
          PasswordChangeFailureKind.confirmedLocalFinalizationFailed => (
              'Passwort serverseitig geändert',
              'Die lokale Abmeldung konnte nicht sicher bestätigt werden. '
                  'Schließe die App und melde dich erneut an.',
            ),
          PasswordChangeFailureKind.outcomeUnknown => (
              'Ergebnis der Passwortänderung unklar',
              'Die Serverantwort ist nicht angekommen. Melde dich neu an und '
                  'prüfe das neue Passwort, bevor du die Änderung erneut sendest.',
            ),
        };
        await _showOwnedOutcome(title: title, message: message);
        if (!mounted || outcomeEpoch != _securityEpoch) return;
        if (!error.localSessionDefinitelyCleared) {
          if (!_isInteractionOwnerCurrent(owner)) return;
          return;
        }
        if (!await _securityService.isLocalSessionDefinitelyAbsent()) return;
        if (!mounted || outcomeEpoch != _securityEpoch) return;
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (_) => false,
        );
        return;
      } catch (error) {
        debugPrint(
            '[SecurityScreen] changePassword failed: ${error.runtimeType}');
        if (!_isInteractionOwnerCurrent(owner)) return;
        _clearPasswordFields();
        setState(() {});
        await _showOwnedOutcome(
          title: 'Passwort nicht geändert',
          message: 'Die Anfrage wurde vor einer Serverbestätigung abgebrochen. '
              'Bitte prüfe deine Sitzung und versuche es erneut.',
        );
        return;
      }

      if (!mounted) return;
      final successEpoch = _securityEpoch;
      if (!await _securityService.isLocalSessionDefinitelyAbsent()) return;
      if (!mounted || successEpoch != _securityEpoch) return;
      _clearPasswordFields();
      setState(() {});
      await _showOwnedSuccess(
        title: 'Passwort geändert',
        message: 'Bitte melde dich erneut an.',
      );
      if (!await _securityService.isLocalSessionDefinitelyAbsent()) return;
      if (!mounted || successEpoch != _securityEpoch) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
    } finally {
      if (mounted && operationEpoch == _securityEpoch) {
        setState(() => _pwBusy = false);
      }
    }
  }

  Future<void> _signOutDevice(SecurityDevice device) async {
    if (!_securityService.isAvailable || _devicesBusy || device.isThisDevice) {
      return;
    }
    final owner = _captureInteractionOwner();
    if (owner == null) return;
    final confirmationHandle = TrackedDialogRouteHandle<bool>();
    _activeConfirmationDialog = confirmationHandle;
    bool confirmed;
    try {
      confirmed = await showTrackedDialog<bool>(
            context: context,
            handle: confirmationHandle,
            barrierDismissible: true,
            barrierLabel: 'Gerät abmelden?',
            builder: (dialogContext) => AlertDialog(
              title: const Text('Gerät abmelden?'),
              content: Text('Du wirst auf „${device.name}“ abgemeldet.'),
              actions: [
                TextButton(
                  onPressed: () => confirmationHandle.dismiss(false),
                  child: const Text('Abbrechen'),
                ),
                FilledButton(
                  onPressed: () => confirmationHandle.dismiss(true),
                  child: const Text('Abmelden'),
                ),
              ],
            ),
          ) ??
          false;
    } finally {
      if (identical(_activeConfirmationDialog, confirmationHandle)) {
        _activeConfirmationDialog = null;
      }
    }
    if (!confirmed || !_isInteractionOwnerCurrent(owner)) return;

    final operationEpoch = owner.epoch;
    setState(() => _devicesBusy = true);
    try {
      try {
        if (!_isInteractionOwnerCurrent(owner)) return;
        await _securityService.revokeSession(device.id);
      } on SessionRevocationFailure catch (error) {
        debugPrint(
          '[SecurityScreen] revokeSession outcome: ${error.kind.name}',
        );
        if (!mounted ||
            error.targetSessionId != device.id ||
            !error.invokingSessionDefinitelyCurrent ||
            !_isInteractionOwnerCurrent(owner)) {
          return;
        }
        _loadRevision += 1;
        setState(() {
          _devices = const [];
          _loadError = 'Die Sitzungsliste ist nach der Geräteaktion nicht mehr '
              'sicher aktuell.';
          _loading = false;
        });
        final (title, message) = switch (error.kind) {
          SessionRevocationFailureKind.rejected => (
              'Geräteabmeldung abgelehnt',
              'Der Server hat die Abmeldung nicht ausgeführt. '
                  'Lade die Sitzungsliste erneut.',
            ),
          SessionRevocationFailureKind.confirmedLocalFinalizationFailed => (
              'Gerät serverseitig abgemeldet',
              'Die lokale Sitzungsliste konnte nicht sicher aktualisiert '
                  'werden. Lade sie erneut.',
            ),
          SessionRevocationFailureKind.outcomeUnknown => (
              'Ergebnis der Geräteabmeldung unklar',
              'Die Serverantwort ist nicht angekommen. Lade die Sitzungsliste '
                  'neu, bevor du die Abmeldung erneut sendest.',
            ),
        };
        await _showOwnedOutcome(title: title, message: message);
        return;
      } catch (error) {
        debugPrint(
            '[SecurityScreen] revokeSession failed: ${error.runtimeType}');
        if (!_isInteractionOwnerCurrent(owner)) return;
        await _showOwnedOutcome(
          title: 'Geräteaktion nicht abgeschlossen',
          message: 'Die Anfrage wurde vor einer Serverbestätigung abgebrochen. '
              'Bitte prüfe deine Sitzung und versuche es erneut.',
        );
        return;
      }

      if (!_isInteractionOwnerCurrent(owner)) return;
      setState(() {
        _devices = _devices.where((entry) => entry.id != device.id).toList();
      });
    } finally {
      if (mounted && operationEpoch == _securityEpoch) {
        setState(() => _devicesBusy = false);
      }
    }
  }

  Future<void> _logoutAllDevices() async {
    if (!_securityService.isAvailable || _devicesBusy) return;
    final owner = _captureInteractionOwner();
    if (owner == null) return;
    final confirmationHandle = TrackedDialogRouteHandle<bool>();
    _activeConfirmationDialog = confirmationHandle;
    bool confirmed;
    try {
      confirmed = await showTrackedDialog<bool>(
            context: context,
            handle: confirmationHandle,
            barrierLabel: 'Alle Geräte abmelden?',
            builder: (dialogContext) => AlertDialog(
              title: const Text('Alle Geräte abmelden?'),
              content: const Text(
                'Alle serverseitigen Sitzungen werden beendet. Du musst dich '
                'anschließend neu anmelden.',
              ),
              actions: [
                TextButton(
                  onPressed: () => confirmationHandle.dismiss(false),
                  child: const Text('Abbrechen'),
                ),
                FilledButton(
                  onPressed: () => confirmationHandle.dismiss(true),
                  child: const Text('Alle abmelden'),
                ),
              ],
            ),
          ) ??
          false;
    } finally {
      if (identical(_activeConfirmationDialog, confirmationHandle)) {
        _activeConfirmationDialog = null;
      }
    }
    if (!confirmed || !_isInteractionOwnerCurrent(owner)) return;

    final operationEpoch = owner.epoch;
    setState(() => _devicesBusy = true);
    try {
      try {
        if (!_isInteractionOwnerCurrent(owner)) return;
        await _securityService.logoutAllSessions();
      } on LogoutAllFailure catch (error) {
        debugPrint('[SecurityScreen] logoutAll outcome: ${error.kind.name}');
        if (!mounted) return;
        final outcomeEpoch = _securityEpoch;
        if (error.localSessionDefinitelyCleared) {
          if (!await _securityService.isLocalSessionDefinitelyAbsent()) return;
          if (!mounted || outcomeEpoch != _securityEpoch) return;
        } else if (!_isInteractionOwnerCurrent(owner)) {
          return;
        }
        if (error.kind != LogoutAllFailureKind.rejected) {
          setState(() {
            _devices = const [];
            _loadError = null;
          });
        }
        final (title, message) = switch (error.kind) {
          LogoutAllFailureKind.rejected => (
              'Geräte nicht abgemeldet',
              'Der Server hat die Abmeldung abgelehnt. '
                  'Bitte lade die Sitzungsliste erneut.',
            ),
          LogoutAllFailureKind.confirmedLocalFinalizationFailed => (
              'Geräte serverseitig abgemeldet',
              'Die lokale Abmeldung konnte nicht sicher bestätigt werden. '
                  'Schließe die App und melde dich erneut an.',
            ),
          LogoutAllFailureKind.outcomeUnknown => (
              'Ergebnis der Geräteabmeldung unklar',
              'Die Serverantwort ist nicht angekommen. Melde dich neu an und '
                  'prüfe deine Sitzungen, bevor du die Aktion erneut sendest.',
            ),
        };
        await _showOwnedOutcome(title: title, message: message);
        if (!mounted || outcomeEpoch != _securityEpoch) return;
        if (!error.localSessionDefinitelyCleared) {
          if (!_isInteractionOwnerCurrent(owner)) return;
          return;
        }
        if (!await _securityService.isLocalSessionDefinitelyAbsent()) return;
        if (!mounted || outcomeEpoch != _securityEpoch) return;
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (_) => false,
        );
        return;
      } catch (error) {
        debugPrint('[SecurityScreen] logoutAll failed: ${error.runtimeType}');
        if (!_isInteractionOwnerCurrent(owner)) return;
        await _showOwnedOutcome(
          title: 'Geräte nicht abgemeldet',
          message: 'Die Anfrage wurde vor einer Serverbestätigung abgebrochen. '
              'Bitte prüfe deine Sitzung und versuche es erneut.',
        );
        return;
      }

      if (!mounted) return;
      final successEpoch = _securityEpoch;
      if (!await _securityService.isLocalSessionDefinitelyAbsent()) return;
      if (!mounted || successEpoch != _securityEpoch) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
    } finally {
      if (mounted && operationEpoch == _securityEpoch) {
        setState(() => _devicesBusy = false);
      }
    }
  }

  String _deviceNameThisPlatform() {
    if (kIsWeb) return 'Browser';
    return switch (defaultTargetPlatform) {
      TargetPlatform.iOS => 'iPhone',
      TargetPlatform.android => 'Android',
      TargetPlatform.macOS => 'Mac',
      TargetPlatform.windows => 'Windows',
      TargetPlatform.linux => 'Linux',
      TargetPlatform.fuchsia => 'Gerät',
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Stack(children: [
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
          title: const Text('Sicherheit'),
          centerTitle: true,
          leading: IconButton(
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
        body: SafeArea(
          top: false,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              16,
              kToolbarHeight + 18,
              16,
              22,
            ),
            children: [
              Text(
                'Sicherheit',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              Text(
                'Sicherheitsaktionen werden erst nach einer serverseitigen '
                'Bestätigung als erfolgreich angezeigt.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.white70,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 18),
              const _SectionHeader(
                title: 'Identitätsverifizierung',
                icon: Icons.verified_user_outlined,
              ),
              const SizedBox(height: 10),
              const _UnavailableCard(
                title: 'Noch nicht verfügbar',
                message: 'Keine lokale Demo-Verifizierung. Bis ein geprüfter '
                    'Anbieter angebunden und '
                    'freigegeben ist, nimmt ShareItToo keine Ausweise oder '
                    'Selfies entgegen.',
              ),
              const SizedBox(height: 18),
              const _SectionHeader(title: 'Passwort', icon: Icons.lock_outline),
              const SizedBox(height: 10),
              if (_securityService.isAvailable)
                _passwordCard(theme)
              else
                const _UnavailableCard(
                  title: 'Kontosicherheit ist offline nicht verfügbar.',
                  message: 'Ohne serverseitige Anmeldung kann ShareItToo das '
                      'aktuelle Passwort weder prüfen noch ändern. Es wird '
                      'kein lokaler Erfolg simuliert.',
                ),
              const SizedBox(height: 18),
              const _SectionHeader(
                title: 'Zwei‑Faktor‑Authentifizierung',
                icon: Icons.phonelink_lock_outlined,
              ),
              const SizedBox(height: 10),
              const _UnavailableCard(
                title: 'Zwei-Faktor-Schutz ist noch nicht verfügbar.',
                message: 'Eine lokale Einstellung schützt keine Anmeldung. '
                    'Aktivierung und Codes bleiben bis zu einem '
                    'serverautoritativen Flow deaktiviert.',
              ),
              const SizedBox(height: 18),
              const _SectionHeader(
                title: 'Angemeldete Geräte',
                icon: Icons.devices_outlined,
              ),
              const SizedBox(height: 10),
              if (_securityService.isAvailable)
                _deviceCard(theme)
              else
                const _UnavailableCard(
                  title: 'Keine lokale Sitzungsliste',
                  message: 'Geräte und Abmeldungen werden nur aus einer '
                      'serverbestätigten Kontositzung angezeigt. Demo-Geräte '
                      'sind keine Kontowahrheit.',
                ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.10),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded,
                        color: theme.colorScheme.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Teile dein Passwort niemals mit anderen. Bei einer '
                        'unklaren oder abgelaufenen Sitzung melde dich neu an.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.white70,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ]);
  }

  Widget _passwordCard(ThemeData theme) => _SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _currentCtrl,
              obscureText: _pwObscureCurrent,
              onChanged: (_) => setState(() {}),
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.lock_outline),
                labelText: 'Aktuelles Passwort',
                suffixIcon: IconButton(
                  tooltip: _pwObscureCurrent ? 'Anzeigen' : 'Verbergen',
                  onPressed: () => setState(
                    () => _pwObscureCurrent = !_pwObscureCurrent,
                  ),
                  icon: Icon(
                    _pwObscureCurrent
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _nextCtrl,
              obscureText: _pwObscureNext,
              onChanged: (_) => setState(() {}),
              autofillHints: const [AutofillHints.newPassword],
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.password_outlined),
                labelText: 'Neues Passwort',
                errorText: _nextCtrl.text.isEmpty
                    ? null
                    : _validateNewPassword(_nextCtrl.text),
                suffixIcon: IconButton(
                  tooltip: _pwObscureNext ? 'Anzeigen' : 'Verbergen',
                  onPressed: () =>
                      setState(() => _pwObscureNext = !_pwObscureNext),
                  icon: Icon(
                    _pwObscureNext
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _confirmCtrl,
              obscureText: _pwObscureConfirm,
              onChanged: (_) => setState(() {}),
              autofillHints: const [AutofillHints.newPassword],
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.check_circle_outline),
                labelText: 'Neues Passwort bestätigen',
                errorText: _confirmCtrl.text.isEmpty
                    ? null
                    : (_confirmCtrl.text == _nextCtrl.text
                        ? null
                        : 'Passwörter stimmen nicht überein'),
                suffixIcon: IconButton(
                  tooltip: _pwObscureConfirm ? 'Anzeigen' : 'Verbergen',
                  onPressed: () => setState(
                    () => _pwObscureConfirm = !_pwObscureConfirm,
                  ),
                  icon: Icon(
                    _pwObscureConfirm
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Mindestens 10 Zeichen, ein Buchstabe und eine Zahl.',
              style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: _passwordValid && !_pwBusy ? _changePassword : null,
              child: _pwBusy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Passwort ändern',
                      style: TextStyle(color: Colors.white),
                    ),
            ),
          ],
        ),
      );

  Widget _deviceCard(ThemeData theme) => _SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Nur aktuell serverbestätigte Sitzungen werden angezeigt.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.white70,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_loadError != null) ...[
              Text(
                _loadError!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: BrandColors.danger,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _devicesBusy ? null : _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Erneut laden'),
              ),
            ] else ...[
              for (var index = 0; index < _devices.length; index++) ...[
                _DeviceTile(
                  device: _devices[index],
                  isThisDevice: _devices[index].isThisDevice,
                  thisPlatformName: _deviceNameThisPlatform(),
                  onSignOut: _devices[index].isThisDevice || _devicesBusy
                      ? null
                      : () => _signOutDevice(_devices[index]),
                ),
                if (index + 1 < _devices.length)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Divider(
                      height: 1,
                      thickness: 1,
                      color: Colors.white.withValues(alpha: 0.10),
                    ),
                  ),
              ],
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _devicesBusy ? null : _logoutAllDevices,
                icon: const Icon(Icons.logout_outlined),
                label: const Text('Alle Geräte abmelden'),
              ),
            ],
          ],
        ),
      );
}

class _SecurityInteractionOwner {
  final int epoch;
  final String principalSessionId;

  const _SecurityInteractionOwner({
    required this.epoch,
    required this.principalSessionId,
  });
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;

  const _SectionHeader({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(children: [
      Icon(icon, size: 18, color: theme.colorScheme.primary),
      const SizedBox(width: 10),
      Expanded(
        child: Text(
          title,
          style: theme.textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
      ),
    ]);
  }
}

class _SectionCard extends StatelessWidget {
  final Widget child;

  const _SectionCard({required this.child});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.22),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        ),
        child: child,
      );
}

class _UnavailableCard extends StatelessWidget {
  final String title;
  final String message;

  const _UnavailableCard({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _StatusPill(
            icon: Icons.schedule_outlined,
            label: 'Nicht aktiv',
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: theme.textTheme.bodyMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            style: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white70,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final IconData icon;
  final String label;

  const _StatusPill({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 18, color: Colors.white70),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ]),
        ),
      );
}

class _DeviceTile extends StatelessWidget {
  final SecurityDevice device;
  final bool isThisDevice;
  final String thisPlatformName;
  final VoidCallback? onSignOut;

  const _DeviceTile({
    required this.device,
    required this.isThisDevice,
    required this.thisPlatformName,
    required this.onSignOut,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rawName = device.name.trim();
    final deviceName =
        isThisDevice && (rawName.isEmpty || rawName == 'Unbekanntes Gerät')
            ? thisPlatformName
            : (rawName.isEmpty ? 'Unbekanntes Gerät' : rawName);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: theme.colorScheme.primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: theme.colorScheme.primary.withValues(alpha: 0.22),
          ),
        ),
        child: Center(
          child: Icon(device.icon, color: theme.colorScheme.primary, size: 18),
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text(
                deviceName + (isThisDevice ? ' (Dieses Gerät)' : ''),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            if (onSignOut != null)
              TextButton(
                onPressed: onSignOut,
                child: const Text(
                  'Abmelden',
                  style: TextStyle(color: Colors.white),
                ),
              ),
          ]),
          const SizedBox(height: 2),
          Text(
            '${device.location} · ${device.lastActiveLabel}',
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
          ),
        ]),
      ),
    ]);
  }
}
