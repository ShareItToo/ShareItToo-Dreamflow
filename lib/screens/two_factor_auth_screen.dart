import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'login_screen.dart';
import 'package:lendify/models/mfa.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/mfa_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

class TwoFactorAuthScreen extends StatefulWidget {
  final MfaService? mfaService;
  final Future<AuthSession?> Function()? sessionReader;
  final Future<bool> Function(AuthSessionOwner owner)? ownerChecker;
  final Future<AuthSessionClearReceipt?> Function(AuthSessionOwner owner)?
      sessionClearer;
  final Future<(String?, String?)?> Function(AuthSessionOwner owner)?
      reauthPrompt;
  final Future<String?> Function({required String title, required String hint})?
      codePrompt;

  const TwoFactorAuthScreen({
    super.key,
    this.mfaService,
    this.sessionReader,
    this.ownerChecker,
    this.sessionClearer,
    this.reauthPrompt,
    this.codePrompt,
  });

  @override
  State<TwoFactorAuthScreen> createState() => _TwoFactorAuthScreenState();
}

class _TwoFactorAuthScreenState extends State<TwoFactorAuthScreen> {
  late final MfaService _service;
  AuthSessionOwner? _owner;
  MfaStatus? _status;
  MfaEnrollment? _enrollment;
  List<String>? _recoveryCodes;
  bool _loading = true;
  bool _busy = false;
  bool _acknowledged = false;
  bool _routeReplacementPending = false;
  bool _reauthInFlight = false;
  String? _error;
  int _epoch = 0;
  TrackedDialogRouteHandle<(String?, String?)>? _reauthDialog;
  TrackedDialogRouteHandle<String>? _codeDialog;

  @override
  void initState() {
    super.initState();
    _service = widget.mfaService ?? const MfaService();
    unawaited(_load());
  }

  @override
  void dispose() {
    _epoch += 1;
    _reauthDialog?.dismiss();
    _codeDialog?.dismiss();
    super.dispose();
  }

  Future<void> _load() async {
    final operation = ++_epoch;
    if (!_service.isAvailable) {
      if (!mounted || operation != _epoch) return;
      setState(() => _loading = false);
      return;
    }
    try {
      final session =
          await (widget.sessionReader?.call() ?? AuthService.readSession());
      if (session == null) {
        throw const MfaException(401, 'authentication_required');
      }
      final owner = AuthService.captureSessionOwner(session);
      final status = await _service.getStatus(owner);
      if (!mounted ||
          operation != _epoch ||
          !await (widget.ownerChecker?.call(owner) ??
              AuthService.isSessionOwnerDefinitelyCurrent(owner))) {
        return;
      }
      setState(() {
        _owner = owner;
        _status = status;
        _loading = false;
        _error = null;
      });
    } on MfaException catch (error) {
      if (!mounted || operation != _epoch) return;
      setState(() {
        _loading = false;
        _error = _messageFor(error);
      });
    } catch (_) {
      if (!mounted || operation != _epoch) return;
      setState(() {
        _loading = false;
        _error = 'Sicherheitsstatus konnte nicht geladen werden.';
      });
    }
  }

  bool _current() {
    final owner = _owner;
    return mounted && owner != null && owner.epoch == AuthService.sessionEpoch;
  }

  String _messageFor(MfaException error) => switch (error.code) {
        'mfa_reauthentication_required' =>
          'Bitte bestätige deine Identität erneut.',
        'mfa_code_invalid' || 'mfa_totp_invalid' => 'Der Code wurde abgelehnt.',
        'mfa_temporarily_locked' =>
          'Zu viele Versuche. Bitte warte 15 Minuten.',
        'mfa_enrollment_in_progress' => 'Eine Einrichtung ist bereits offen.',
        'mfa_already_enabled' => 'Zwei-Faktor-Schutz ist bereits aktiv.',
        'principal_changed' ||
        'authentication_required' =>
          'Melde dich erneut an.',
        _ =>
          'Die serverseitige Zwei-Faktor-Aktion konnte nicht abgeschlossen werden.',
      };

  Future<(String?, String?)?> _promptReauthentication() async {
    final owner = _owner;
    if (owner == null || !_current()) return null;
    final injected = widget.reauthPrompt;
    if (injected != null) return injected(owner);
    final password = TextEditingController();
    final handle = TrackedDialogRouteHandle<(String?, String?)>();
    _reauthDialog = handle;
    try {
      return await showTrackedDialog<(String?, String?)>(
        context: context,
        handle: handle,
        barrierDismissible: false,
        barrierLabel: 'Erneute Identitätsprüfung',
        builder: (dialogContext) => AlertDialog(
          title: const Text('Identität erneut bestätigen'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                  'Für diese Sicherheitsaktion ist eine frische Bestätigung erforderlich.'),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: true,
                autofocus: true,
                decoration:
                    const InputDecoration(labelText: 'Aktuelles Passwort'),
                onSubmitted: (value) {
                  if (value.trim().isNotEmpty) handle.dismiss((value, null));
                },
              ),
              const SizedBox(height: 8),
              for (final provider in AuthSocialProvider.values)
                if (AuthService.socialProviderEnabled(provider))
                  OutlinedButton.icon(
                    onPressed: _reauthInFlight
                        ? null
                        : () async {
                            if (_reauthInFlight) return;
                            setState(() => _reauthInFlight = true);
                            try {
                              final token = await AuthService
                                  .reauthenticateSocialProvider(provider,
                                      owner: owner);
                              if (token != null && handle.isActive) {
                                handle.dismiss((null, token));
                              } else if (mounted && _current()) {
                                AppPopup.info(
                                  context,
                                  title: 'Bestätigung abgebrochen',
                                  message:
                                      'Erneute Bestätigung wurde abgebrochen.',
                                );
                              }
                            } catch (_) {
                              if (mounted && _current()) {
                                AppPopup.error(
                                  context,
                                  title: 'Bestätigung fehlgeschlagen',
                                  message:
                                      'Erneute Bestätigung konnte nicht abgeschlossen werden.',
                                );
                              }
                            } finally {
                              if (mounted) {
                                setState(() => _reauthInFlight = false);
                              }
                            }
                          },
                    icon: const Icon(Icons.account_circle_outlined),
                    label: Text('${provider.name} erneut bestätigen'),
                  ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => handle.dismiss(),
                child: const Text('Abbrechen')),
            FilledButton(
              onPressed: () {
                final value = password.text;
                if (value.isNotEmpty) handle.dismiss((value, null));
              },
              child: const Text('Bestätigen'),
            ),
          ],
        ),
      );
    } finally {
      password.dispose();
      if (identical(_reauthDialog, handle)) _reauthDialog = null;
    }
  }

  Future<String?> _promptCode(
      {required String title, required String hint}) async {
    final injected = widget.codePrompt;
    if (injected != null) return injected(title: title, hint: hint);
    final controller = TextEditingController();
    final handle = TrackedDialogRouteHandle<String>();
    _codeDialog = handle;
    try {
      return await showTrackedDialog<String>(
        context: context,
        handle: handle,
        barrierDismissible: false,
        barrierLabel: title,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            autofocus: true,
            autocorrect: false,
            enableSuggestions: false,
            decoration: InputDecoration(hintText: hint, labelText: 'Code'),
            onSubmitted: (value) {
              if (value.trim().isNotEmpty) handle.dismiss(value.trim());
            },
          ),
          actions: [
            TextButton(
                onPressed: () => handle.dismiss(),
                child: const Text('Abbrechen')),
            FilledButton(
              onPressed: () {
                if (controller.text.trim().isNotEmpty) {
                  handle.dismiss(controller.text.trim());
                }
              },
              child: const Text('Bestätigen'),
            ),
          ],
        ),
      );
    } finally {
      controller.dispose();
      if (identical(_codeDialog, handle)) _codeDialog = null;
    }
  }

  Future<void> _restartPendingEnrollment() async {
    if (_busy || !_current()) return;
    final reauth = await _promptReauthentication();
    if (reauth == null || !_current()) return;
    setState(() => _busy = true);
    try {
      await _service.cancelEnrollment(
        owner: _owner!,
        currentPassword: reauth.$1,
        reauthSocialIdToken: reauth.$2,
      );
      final enrollment = await _service.beginEnrollment(
        owner: _owner!,
        idempotencyKey: 'mfa-${DateTime.now().microsecondsSinceEpoch}',
        currentPassword: reauth.$1,
        reauthSocialIdToken: reauth.$2,
      );
      if (!mounted || !_current()) return;
      setState(() {
        _enrollment = enrollment;
        _status = const MfaStatus(
            enabled: false, pending: true, recoveryCodesRemaining: 0);
        _error = null;
      });
    } on MfaException catch (error) {
      if (mounted && _current()) {
        setState(() {
          _enrollment = null;
          _status = null;
          _loading = true;
          _error = _messageFor(error);
        });
        await _load();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _beginEnrollment() async {
    if (_busy || !_current()) return;
    if (_status?.pending == true) {
      await _restartPendingEnrollment();
      return;
    }
    final reauth = await _promptReauthentication();
    if (reauth == null || !_current()) return;
    setState(() => _busy = true);
    try {
      final enrollment = await _service.beginEnrollment(
        owner: _owner!,
        idempotencyKey: 'mfa-${DateTime.now().microsecondsSinceEpoch}',
        currentPassword: reauth.$1,
        reauthSocialIdToken: reauth.$2,
      );
      if (!mounted || !_current()) return;
      setState(() {
        _enrollment = enrollment;
        _error = null;
      });
    } on MfaException catch (error) {
      if (mounted && _current()) setState(() => _error = _messageFor(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmEnrollment() async {
    final enrollment = _enrollment;
    if (_busy || enrollment == null || !_current()) return;
    final code = await _promptCode(title: 'Authenticator-Code', hint: '123456');
    if (code == null || !_current()) return;
    final reauth = await _promptReauthentication();
    if (reauth == null || !_current()) return;
    setState(() => _busy = true);
    try {
      final recoveryCodes = await _service.confirmEnrollment(
        owner: _owner!,
        code: code,
        currentPassword: reauth.$1,
        reauthSocialIdToken: reauth.$2,
      );
      if (!mounted || !_current()) return;
      setState(() {
        _enrollment = null;
        _recoveryCodes = recoveryCodes;
        _acknowledged = false;
        _status = const MfaStatus(
            enabled: true, pending: false, recoveryCodesRemaining: 10);
      });
    } on MfaException catch (error) {
      if (mounted && _current()) setState(() => _error = _messageFor(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disable() async {
    if (_busy || !_current()) return;
    final reauth = await _promptReauthentication();
    if (reauth == null || !_current()) return;
    final code = await _promptCode(
        title: 'Code zum Deaktivieren',
        hint: '123456 oder Wiederherstellungscode');
    if (code == null || !_current()) return;
    setState(() => _busy = true);
    try {
      await _service.disable(
        owner: _owner!,
        code: code,
        currentPassword: reauth.$1,
        reauthSocialIdToken: reauth.$2,
      );
      await _finishSessionAfterServerSecurityChange();
    } on MfaException catch (error) {
      if (mounted && _current()) setState(() => _error = _messageFor(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finishSessionAfterServerSecurityChange() async {
    final owner = _owner;
    if (owner == null ||
        !await (widget.ownerChecker?.call(owner) ??
            AuthService.isSessionOwnerDefinitelyCurrent(owner))) {
      _discardSensitiveRecoveryState(navigateToLogin: true);
      return;
    }
    if (mounted) setState(() => _routeReplacementPending = true);
    if (mounted) setState(() => _busy = true);
    final cleared = await (widget.sessionClearer?.call(owner) ??
        AuthService.clearSessionOwnerIfMatches(owner, runLogoutCleanup: false));
    if (!mounted) return;
    if (cleared == null) {
      _discardSensitiveRecoveryState(navigateToLogin: true);
      return;
    }
    _recoveryCodes = null;
    _navigateToLogin();
  }

  void _discardSensitiveRecoveryState({bool navigateToLogin = false}) {
    if (!mounted) return;
    setState(() {
      _recoveryCodes = null;
      _acknowledged = false;
      _busy = false;
      _routeReplacementPending = navigateToLogin;
      _error =
          'Die Sicherheitsanzeige wurde geschlossen. Melde dich erneut an.';
    });
    if (navigateToLogin) _navigateToLogin();
  }

  void _navigateToLogin() {
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _copyRecoveryCodes() async {
    final codes = _recoveryCodes;
    if (codes == null) return;
    final owner = _owner;
    if (owner == null ||
        !await (widget.ownerChecker?.call(owner) ??
            AuthService.isSessionOwnerDefinitelyCurrent(owner))) {
      _discardSensitiveRecoveryState(navigateToLogin: true);
      return;
    }
    await Clipboard.setData(ClipboardData(text: codes.join('\n')));
    if (mounted && _current()) {
      AppPopup.success(
        context,
        title: 'Codes kopiert',
        message: 'Wiederherstellungscodes wurden kopiert.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_service.isAvailable) {
      return Scaffold(
        appBar: AppBar(title: const Text('Zwei‑Faktor-Authentifizierung')),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                  'Server-Konfiguration für Zwei-Faktor-Schutz ist nicht erreichbar.'),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Erneut prüfen'),
              ),
            ],
          ),
        ),
      );
    }
    final theme = Theme.of(context);
    return PopScope(
      canPop: _recoveryCodes == null && !_routeReplacementPending,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _recoveryCodes != null && !_acknowledged) {
          AppPopup.info(
            context,
            title: 'Codes zuerst sichern',
            message:
                'Bestätige zuerst, dass du die Wiederherstellungscodes sicher gespeichert hast.',
          );
        }
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Zwei‑Faktor-Authentifizierung')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Serverbestätigter Kontoschutz',
                  style: theme.textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null && _status == null) ...[
                Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Erneut laden')),
              ] else if (_recoveryCodes != null)
                _recoveryCodePanel(theme)
              else if (_enrollment != null)
                _enrollmentPanel(theme)
              else
                _statusPanel(theme),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusPanel(ThemeData theme) {
    final status = _status;
    if (status == null) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
                status.enabled ? Icons.verified_user : Icons.shield_outlined),
            title: Text(status.enabled
                ? 'Aktiviert'
                : status.pending
                    ? 'Einrichtung offen'
                    : 'Nicht aktiviert'),
            subtitle: Text(status.enabled
                ? '${status.recoveryCodesRemaining} Wiederherstellungscodes verfügbar.'
                : status.pending
                    ? 'Eine unterbrochene Einrichtung kann serverseitig sicher neu gestartet werden.'
                    : 'Authenticator-App und Wiederherstellungscodes schützen die Anmeldung.'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed:
                _busy ? null : (status.enabled ? _disable : _beginEnrollment),
            icon: Icon(
                status.enabled ? Icons.remove_circle_outline : Icons.security),
            label: Text(status.enabled
                ? 'Zwei-Faktor-Schutz deaktivieren'
                : status.pending
                    ? 'Einrichtung neu starten'
                    : 'Zwei-Faktor-Schutz aktivieren'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          ],
        ]),
      ),
    );
  }

  Widget _enrollmentPanel(ThemeData theme) {
    final enrollment = _enrollment!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Authenticator-App verbinden',
              style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text(
              'Scanne den QR-Code oder trage den manuellen Schlüssel ein. Der Schlüssel bleibt nur während dieser Einrichtung im Arbeitsspeicher.'),
          const SizedBox(height: 16),
          Center(
              child: QrImageView(
                  data: enrollment.otpauthUrl,
                  size: 190,
                  backgroundColor: Colors.white)),
          const SizedBox(height: 12),
          SelectableText(enrollment.secret,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: 'monospace', fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          FilledButton(
              onPressed: _busy ? null : _confirmEnrollment,
              child: const Text('Ersten Code bestätigen')),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          ],
        ]),
      ),
    );
  }

  Widget _recoveryCodePanel(ThemeData theme) {
    final codes = _recoveryCodes!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Wiederherstellungscodes einmalig sichern',
              style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text(
              'Diese Codes werden nicht erneut angezeigt. Bewahre sie sicher auf.'),
          const SizedBox(height: 12),
          SelectableText(codes.join('\n'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontFamily: 'monospace', height: 1.5)),
          const SizedBox(height: 12),
          OutlinedButton.icon(
              onPressed: _copyRecoveryCodes,
              icon: const Icon(Icons.copy),
              label: const Text('Codes kopieren')),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _acknowledged,
            onChanged: (value) {
              if (value != true || _acknowledged) return;
              setState(() => _acknowledged = true);
              unawaited(_finishSessionAfterServerSecurityChange());
            },
            title: const Text('Ich habe die Codes sicher gespeichert.'),
          ),
          const Text(
              'Nach der Bestätigung wirst du aus Sicherheitsgründen abgemeldet.'),
        ]),
      ),
    );
  }
}
