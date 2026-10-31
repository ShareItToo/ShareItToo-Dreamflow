import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:lendify/models/identity_verification.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/identity_verification_service.dart';
import 'package:lendify/config/draft_operator_config.dart';
import 'package:lendify/screens/legal_privacy_screen.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:url_launcher/url_launcher.dart';

class VerificationScreen extends StatefulWidget {
  final IdentityVerificationService? service;
  final Future<AuthSession?> Function()? sessionReader;
  final Future<bool> Function(AuthSessionOwner owner)? ownerChecker;
  final Future<bool> Function(Uri uri)? urlLauncher;

  const VerificationScreen(
      {super.key,
      this.service,
      this.sessionReader,
      this.ownerChecker,
      this.urlLauncher});

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen>
    with WidgetsBindingObserver {
  late final IdentityVerificationService _service;
  AuthSessionOwner? _owner;
  IdentityVerificationState? _state;
  bool _loading = true;
  bool _busy = false;
  bool _consentGiven = false;
  String? _error;
  int _epoch = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _service = widget.service ?? const IdentityVerificationService();
    unawaited(_load());
  }

  @override
  void dispose() {
    _epoch += 1;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        _state != null &&
        _state!.status != IdentityVerificationStatus.notStarted) {
      unawaited(_refresh());
    }
  }

  Future<AuthSession?> _session() =>
      widget.sessionReader?.call() ?? AuthService.readSession();
  Future<bool> _isCurrent(AuthSessionOwner owner) =>
      widget.ownerChecker?.call(owner) ??
      AuthService.isSessionOwnerDefinitelyCurrent(owner);

  void _invalidateOwner() {
    if (!mounted) return;
    setState(() {
      _owner = null;
      _state = null;
      _loading = false;
      _busy = false;
      _error = 'Melde dich erneut an.';
    });
  }

  Future<void> _load() async {
    final operation = ++_epoch;
    try {
      final session = await _session();
      if (session == null) {
        throw const IdentityVerificationException(
            401, 'authentication_required');
      }
      final owner = AuthService.captureSessionOwner(session);
      final state = await _service.getStatus(owner);
      if (!mounted || operation != _epoch) return;
      if (!await _isCurrent(owner)) {
        _invalidateOwner();
        return;
      }
      setState(() {
        _owner = owner;
        _state = state;
        _loading = false;
        _error = null;
      });
    } on IdentityVerificationException catch (error) {
      if (!mounted || operation != _epoch) return;
      setState(() {
        _owner = null;
        _state = null;
        _loading = false;
        _error = _messageFor(error);
      });
    } catch (_) {
      if (!mounted || operation != _epoch) return;
      setState(() {
        _owner = null;
        _state = null;
        _loading = false;
        _error = 'Identitätsstatus konnte nicht geladen werden.';
      });
    }
  }

  String _messageFor(IdentityVerificationException error) =>
      switch (error.code) {
        'identity_verification_disabled' =>
          'Die Identitätsprüfung ist in dieser Umgebung nicht aktiviert.',
        'authentication_required' ||
        'principal_changed' =>
          'Melde dich erneut an.',
        'identity_verification_deletion_in_progress' =>
          'Die Löschung läuft noch. Starte erst nach bestätigter Provider-Redaktion erneut.',
        'identity_verification_pilot_closed' =>
          'Der technische Pilot ist beendet; neue Identitätstests sind geschlossen.',
        _ => 'Die serverseitige Identitätsprüfung konnte nicht geladen werden.',
      };

  String _statusLabel(IdentityVerificationStatus status) {
    final redactionStatus = _state?.redactionStatus;
    if (redactionStatus == 'redacted' ||
        status == IdentityVerificationStatus.redacted) {
      return 'Provider-Redaktion bestätigt';
    }
    if (redactionStatus != null && redactionStatus != 'redacted') {
      return 'Löschung läuft';
    }
    return switch (status) {
      IdentityVerificationStatus.notStarted => 'Noch nicht gestartet',
      IdentityVerificationStatus.requiresInput => 'Noch nicht abgeschlossen',
      IdentityVerificationStatus.processing => 'Prüfung läuft',
      IdentityVerificationStatus.verified =>
        'Technischer Test erfolgreich – keine Identitätsbestätigung',
      IdentityVerificationStatus.canceled => 'Prüfung abgebrochen',
      IdentityVerificationStatus.redacted => 'Provider-Redaktion bestätigt',
    };
  }

  Future<void> _start() async {
    final owner = _owner;
    if (owner == null || _busy) return;
    if (!_consentGiven) {
      setState(() =>
          _error = 'Bitte bestätige zuerst die freiwillige Einwilligung.');
      return;
    }
    if (!await _isCurrent(owner)) {
      _invalidateOwner();
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await _service.start(
          owner: owner,
          idempotencyKey: IdentityVerificationService.newIdempotencyKey());
      if (!mounted) return;
      if (!await _isCurrent(owner)) {
        _invalidateOwner();
        return;
      }
      setState(() => _state = session);
      final url = session.url;
      final openUrl = widget.urlLauncher ??
          (Uri uri) => launchUrl(uri, mode: LaunchMode.externalApplication);
      if (url != null && !await openUrl(Uri.parse(url))) {
        if (mounted && await _isCurrent(owner)) {
          setState(() =>
              _error = 'Der sichere Prüf-Link konnte nicht geöffnet werden.');
        }
      }
    } on IdentityVerificationException catch (error) {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _error = _messageFor(error));
      } else {
        _invalidateOwner();
      }
    } catch (_) {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _error = 'Die Prüfung konnte nicht gestartet werden.');
      } else {
        _invalidateOwner();
      }
    } finally {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _busy = false);
      } else {
        _invalidateOwner();
      }
    }
  }

  Future<void> _refresh() async {
    final owner = _owner;
    if (owner == null || _busy) return;
    if (!await _isCurrent(owner)) {
      _invalidateOwner();
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final state = await _service.refresh(owner);
      if (mounted && await _isCurrent(owner)) {
        setState(() => _state = state);
      } else {
        _invalidateOwner();
      }
    } on IdentityVerificationException catch (error) {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _error = _messageFor(error));
      } else {
        _invalidateOwner();
      }
    } catch (_) {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _error = 'Der Status konnte nicht aktualisiert werden.');
      } else {
        _invalidateOwner();
      }
    } finally {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _busy = false);
      } else {
        _invalidateOwner();
      }
    }
  }

  Future<void> _showPrivacyNotice() async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Datenschutzhinweise zum Test'),
        content: const SingleChildScrollView(
          child: Text(
              'Freiwilliger interner technischer Pilot-Test mit Stripe Identity, '
              'keine öffentliche oder kommerzielle Freigabe und keine echte '
              'Identitätsprüfung. Verwende ausschließlich die vorgesehenen '
              'Testfälle; keine echten Ausweise oder Selfies. Stripe kann im '
              'eigenen Ablauf Identitätsdokumentbilder, Ausweisnummern, Adress-, '
              'Selfie- und Gesichtsaufnahmen, fortgeschrittene Betrugssignale sowie '
              'Geräte- und Verbindungsdaten verarbeiten. SIT erhält und speichert nur technische '
              'Zuordnung, Providerstatus, Zeitpunkte sowie minimierte Audit- und '
              'Löschdaten, keine Dokumente oder Schlüssel. Verantwortlicher für '
              'den SIT-Test ist ${DraftOperatorConfig.businessDesignation}, '
              '${DraftOperatorConfig.legalForm}, '
              '${DraftOperatorConfig.serviceAddress}; Kontakt: '
              'contact@shareittoo.com.\n\nRechtsgrundlage ist die '
              'widerrufliche Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO; ein '
              'Widerruf ist ohne Nachteil. Unvollständige Eingaben laufen nach '
              '24 Stunden aus. Bis zur bestätigten Provider-Redaktion gilt '
              '„Löschung läuft“; eine vollständige Löschung bei Stripe wird nicht '
              'behauptet. Stripe kann je nach Zweck eigener Verantwortlicher oder '
              'Dienstleister sein. Mögliche USA-Transfers und SCC/EU-US DPF gelten '
              'nur, soweit offiziell und konkret anwendbar. Technische Daten '
              'höchstens 30 Tage, offene Löschaufträge bis zur Bestätigung. Siehe '
              'https://stripe.com/de/legal/privacy-center und '
              'https://stripe.com/de/legal/dpa. Du hast Rechte auf Auskunft, '
              'Berichtigung, Löschung, Einschränkung und Datenübertragbarkeit; '
              'du kannst die Einwilligung jederzeit widerrufen und dich bei einer '
              'Aufsichtsbehörde beschweren. Kontakt: contact@shareittoo.com.'),
        ),
        actions: [
          TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                Navigator.of(this.context).push(MaterialPageRoute(
                    builder: (_) => const LegalPrivacyScreen()));
              },
              child: const Text('Vollständige Datenschutzerklärung öffnen')),
          TextButton(
              onPressed: () async {
                await _openPolicyUrl(
                    Uri.parse('https://stripe.com/de/legal/privacy-center'));
              },
              child: const Text('Stripe Privacy Center')),
          TextButton(
              onPressed: () async {
                await _openPolicyUrl(Uri.parse('https://stripe.com/de/legal/dpa'));
              },
              child: const Text('Stripe DPA')),
          TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Schließen')),
        ],
      ),
    );
  }

  Future<void> _openPolicyUrl(Uri uri) async {
    final open = widget.urlLauncher ??
        (Uri target) => launchUrl(target, mode: LaunchMode.externalApplication);
    bool opened;
    try {
      opened = await open(uri);
    } catch (_) {
      opened = false;
    }
    if (!opened && mounted) {
      await AppPopup.error(
        context,
        title: 'Link konnte nicht geöffnet werden',
        message: 'Öffne den offiziellen Hinweis erneut oder kopiere die Adresse aus der Datenschutzerklärung.',
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              unawaited(_openPolicyUrl(uri));
            },
            child: const Text('Erneut versuchen'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Schließen'),
          ),
        ],
      );
    }
  }

  void _retryLoad() {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    unawaited(_load());
  }

  Future<void> _revoke() async {
    final owner = _owner;
    if (owner == null || _busy) return;
    if (!await _isCurrent(owner)) {
      _invalidateOwner();
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final state = await _service.revoke(owner);
      if (mounted && await _isCurrent(owner)) {
        setState(() {
          _state = state;
        });
      } else {
        _invalidateOwner();
      }
    } on IdentityVerificationException catch (error) {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _error = _messageFor(error));
      } else {
        _invalidateOwner();
      }
    } catch (_) {
      if (mounted && await _isCurrent(owner)) {
        setState(
            () => _error = 'Die Löschung konnte nicht angefordert werden.');
      } else {
        _invalidateOwner();
      }
    } finally {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _busy = false);
      } else {
        _invalidateOwner();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    final status = state?.status;
    final canStart = _owner != null &&
        (_state?.redactionStatus == null ||
            _state?.redactionStatus == 'redacted') &&
        (status == null ||
            status == IdentityVerificationStatus.notStarted ||
            status == IdentityVerificationStatus.requiresInput ||
            status == IdentityVerificationStatus.canceled ||
            status == IdentityVerificationStatus.redacted);
    return Stack(children: [
      Positioned.fill(
          child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(color: Colors.black.withValues(alpha: 0.35)))),
      Scaffold(
        extendBodyBehindAppBar: true,
        backgroundColor: Colors.transparent,
        appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            surfaceTintColor: Colors.transparent,
            title: const Text('Identitätsprüfung'),
            centerTitle: true,
            leading: IconButton(
                tooltip: MaterialLocalizations.of(context).backButtonTooltip,
                icon: const Icon(Icons.arrow_back),
                onPressed: () => Navigator.of(context).maybePop())),
        body: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 16, 16, 24),
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                        Card(
                            child: ListTile(
                                leading: Icon(status ==
                                        IdentityVerificationStatus.verified
                                    ? Icons.verified
                                    : Icons.badge_outlined),
                                title: Text(status == null
                                    ? 'Status unbekannt'
                                    : _statusLabel(status)),
                                subtitle: const Text(
                                    'Pilot-Testmodus – keine reale Identitätsbestätigung. Keine echten Ausweis- oder Selfiedaten verwenden. Der Status stammt ausschließlich vom SIT-Backend.'))),
                        TextButton.icon(
                            onPressed: _showPrivacyNotice,
                            icon: const Icon(Icons.privacy_tip_outlined),
                            label: const Text('Datenschutzhinweise zum Test')),
                        if (canStart)
                          CheckboxListTile(
                              value: _consentGiven,
                              onChanged: _busy
                                  ? null
                                  : (value) => setState(
                                      () => _consentGiven = value == true),
                              title: const Text(
                                  'Ich stimme dem freiwilligen technischen Test '
                                  '(Einwilligung sit-identity-test-consent-v1) zu.'),
                              controlAffinity: ListTileControlAffinity.leading),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Text(_error!,
                              style: TextStyle(
                                  color: Theme.of(context).colorScheme.error))
                        ],
                        const SizedBox(height: 20),
                        if (_owner == null)
                          OutlinedButton.icon(
                              onPressed: _busy ? null : _retryLoad,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Erneut laden')),
                        if (canStart)
                          FilledButton.icon(
                              onPressed: _busy ? null : _start,
                              icon: const Icon(Icons.open_in_new),
                              label: Text(_busy
                                  ? 'Wird vorbereitet …'
                                  : (status ==
                                          IdentityVerificationStatus
                                              .requiresInput
                                      ? 'Prüfung fortsetzen'
                                      : (status ==
                                                  IdentityVerificationStatus
                                                      .canceled ||
                                              status ==
                                                  IdentityVerificationStatus
                                                      .redacted
                                          ? 'Erneut versuchen'
                                          : 'Prüfung starten')))),
                        if (status != null &&
                            status != IdentityVerificationStatus.notStarted &&
                            status != IdentityVerificationStatus.redacted)
                          OutlinedButton.icon(
                              onPressed: _busy ||
                                      (_state?.redactionStatus != null &&
                                          _state?.redactionStatus != 'redacted')
                                  ? null
                                  : _revoke,
                              icon: const Icon(Icons.delete_outline),
                              label: Text(_state?.redactionStatus == 'redacted'
                                  ? 'Provider-Redaktion bestätigt'
                                  : (_state?.redactionStatus != null
                                      ? 'Löschung läuft'
                                      : 'Löschung anfordern')),
                          ),
                        if (status != null &&
                            status != IdentityVerificationStatus.notStarted &&
                            status != IdentityVerificationStatus.redacted)
                          OutlinedButton.icon(
                            onPressed: _busy ? null : _refresh,
                            icon: const Icon(Icons.refresh),
                            label: Text(_busy
                                ? 'Wird aktualisiert …'
                                : (_state?.redactionStatus != null
                                    ? 'Löschstatus aktualisieren'
                                    : 'Status aktualisieren')),
                          ),
                      ])),
      ),
    ]);
  }
}
