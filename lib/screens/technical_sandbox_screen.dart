import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:url_launcher/url_launcher.dart';

class TechnicalSandboxScreen extends StatefulWidget {
  final Future<Map<String, dynamic>> Function()? loadCapabilities;
  final Future<TechnicalSandboxCheckout> Function(String key)? startCheckout;
  final Future<TechnicalSandboxRun> Function(String runId)? loadRun;
  final Future<bool> Function(Uri uri)? openExternal;

  const TechnicalSandboxScreen({
    super.key,
    this.loadCapabilities,
    this.startCheckout,
    this.loadRun,
    this.openExternal,
  });

  @override
  State<TechnicalSandboxScreen> createState() => _TechnicalSandboxScreenState();
}

class _TechnicalSandboxScreenState extends State<TechnicalSandboxScreen>
    with WidgetsBindingObserver {
  late final String _idempotencyKey =
      BackendRepository.newTechnicalSandboxIdempotencyKey();
  AuthSessionOwner? _owner;
  TechnicalSandboxCapabilities _capabilities =
      const TechnicalSandboxCapabilities.disabled();
  TechnicalSandboxRun? _run;
  bool _loading = true;
  bool _working = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refreshRun());
  }

  Future<AuthSessionOwner?> _captureOwner() async {
    if (widget.loadCapabilities != null) return null;
    final session = await AuthService.readSession();
    return session == null ? null : AuthService.captureSessionOwner(session);
  }

  Future<bool> _isCurrent(AuthSessionOwner? owner) async {
    if (!mounted) return false;
    if (owner == null) return widget.loadCapabilities != null;
    return await AuthService.isSessionOwnerDefinitelyCurrent(owner);
  }

  Future<void> _invalidateStaleRoute() async {
    if (!mounted) return;
    await Navigator.of(context).maybePop();
  }

  Future<void> _load() async {
    AuthSessionOwner? capturedOwner;
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final owner = await _captureOwner();
      capturedOwner = owner;
      if (!await _isCurrent(owner)) {
        await _invalidateStaleRoute();
        return;
      }
      final raw = widget.loadCapabilities != null
          ? await widget.loadCapabilities!()
          : await BackendRepository.getPaymentCapabilitiesForOwner(owner!);
      if (!await _isCurrent(owner)) {
        await _invalidateStaleRoute();
        return;
      }
      final capabilities = TechnicalSandboxCapabilities.fromJson(
        raw['technicalSandbox'],
      );
      if (!mounted) return;
      setState(() {
        _owner = owner;
        _capabilities = capabilities;
        _loading = false;
        _error = null;
      });
      await _refreshRun();
    } on BackendException catch (error) {
      if (!mounted || !await _isCurrent(capturedOwner)) {
        await _invalidateStaleRoute();
        return;
      }
      setState(() {
        _loading = false;
        _capabilities = const TechnicalSandboxCapabilities.disabled();
        _error = _message(error.code);
      });
    } catch (_) {
      if (!mounted || !await _isCurrent(capturedOwner)) {
        await _invalidateStaleRoute();
        return;
      }
      setState(() {
        _loading = false;
        _capabilities = const TechnicalSandboxCapabilities.disabled();
        _error =
            'Der technische Sandbox-Status konnte nicht sicher geladen werden.';
      });
    }
  }

  Future<void> _refreshRun() async {
    final runId = _run?.id;
    if (runId == null || runId.isEmpty) return;
    final owner = _owner;
    if (!await _isCurrent(owner)) {
      await _invalidateStaleRoute();
      return;
    }
    try {
      final run = widget.loadRun != null
          ? await widget.loadRun!(runId)
          : await BackendRepository.getTechnicalSandboxRunForOwner(
              owner: owner!,
              runId: runId,
            );
      if (!await _isCurrent(owner)) {
        await _invalidateStaleRoute();
        return;
      }
      if (!run.isValidEnvelope) {
        throw const BackendException(502, 'technical_sandbox_run_invalid');
      }
      if (!mounted) return;
      setState(() {
        _run = run;
        _error = null;
      });
    } on BackendException catch (error) {
      if (!mounted || !await _isCurrent(owner)) return;
      setState(() {
        if (_disablesCapability(error.code)) {
          _capabilities = const TechnicalSandboxCapabilities.disabled();
        }
        _error = _message(error.code);
      });
    } catch (_) {
      if (!mounted || !await _isCurrent(owner)) return;
      setState(() =>
          _error = 'Der Sandbox-Status konnte nicht sicher geladen werden.');
    }
  }

  Future<void> _startCheckout() async {
    if (!_capabilities.available || _working) return;
    final owner = _owner;
    if (!await _isCurrent(owner)) {
      await _invalidateStaleRoute();
      return;
    }
    if (mounted) {
      setState(() {
        _working = true;
        _error = null;
      });
    }
    try {
      final checkout = widget.startCheckout != null
          ? await widget.startCheckout!(_idempotencyKey)
          : await BackendRepository.startTechnicalSandboxCheckoutForOwner(
              owner: owner!,
              idempotencyKey: _idempotencyKey,
            );
      if (!await _isCurrent(owner)) {
        await _invalidateStaleRoute();
        return;
      }
      final runId = checkout.id.trim();
      final rawUrl = checkout.checkoutUrl?.trim() ?? '';
      final uri = Uri.tryParse(rawUrl);
      if (!isValidTechnicalSandboxRunId(runId) ||
          checkout.amountMinor != _capabilities.amountMinor ||
          checkout.currency != _capabilities.currency ||
          uri == null ||
          !isValidTechnicalSandboxHostedCheckoutUrl(rawUrl)) {
        throw const BackendException(502, 'technical_sandbox_checkout_invalid');
      }
      if (mounted) {
        setState(() {
          _run = TechnicalSandboxRun(
            id: runId,
            status: checkout.status,
            amountMinor: _capabilities.amountMinor,
            currency: _capabilities.currency,
            checkoutUrl: checkout.checkoutUrl,
            checkoutExpiresAt: checkout.checkoutExpiresAt,
            receipt: null,
          );
        });
      }
      final opened = await (widget.openExternal ??
          (Uri target) => launchUrl(
                target,
                mode: LaunchMode.externalApplication,
              ))(uri);
      if (!await _isCurrent(owner)) {
        await _invalidateStaleRoute();
        return;
      }
      if (!opened) {
        throw const BackendException(
            503, 'technical_sandbox_checkout_open_failed');
      }
      await _refreshRun();
    } on BackendException catch (error) {
      if (!mounted || !await _isCurrent(owner)) return;
      setState(() {
        if (_disablesCapability(error.code)) {
          _capabilities = const TechnicalSandboxCapabilities.disabled();
        }
        _error = _message(error.code);
      });
    } catch (_) {
      if (!mounted || !await _isCurrent(owner)) return;
      setState(() => _error =
          'Der technische Sandbox-Checkout konnte nicht geöffnet werden.');
    } finally {
      if (mounted && await _isCurrent(owner)) {
        setState(() => _working = false);
      }
    }
  }

  String _message(String code) => switch (code) {
        'technical_sandbox_unavailable' ||
        'technical_sandbox_authorization_expired' =>
          'Der technische Sandbox-Test ist derzeit nicht verfügbar.',
        'technical_sandbox_run_limit_reached' =>
          'Das Testlimit für dieses Konto ist für heute erreicht.',
        'authentication_required' ||
        'account_not_active' =>
          'Bitte melde dich erneut an, um den technischen Test zu öffnen.',
        _ => 'Der technische Sandbox-Test konnte nicht sicher geladen werden.',
      };

  bool _disablesCapability(String code) => const {
        'technical_sandbox_unavailable',
        'technical_sandbox_authorization_expired',
        'technical_sandbox_configuration_invalid',
      }.contains(code);

  @override
  Widget build(BuildContext context) {
    final run = _run;
    final confirmed = run?.serverConfirmed == true;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stripe Sandbox'),
        actions: [
          IconButton(
            tooltip: 'Sandbox-Status neu laden',
            onPressed: _loading || _working ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refreshRun,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Stripe Sandbox',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 22,
                            ),
                          ),
                          const SizedBox(height: 10),
                          const Text('1,00 € Test'),
                          const SizedBox(height: 8),
                          const Text('Kein echtes Geld.'),
                          const Text(
                            'Keine Buchung, kein Zahlungsledger, kein Payout, kein Connect.',
                          ),
                          const Text('Nur synthetischer Testnutzer.'),
                          const Text('Keine professionelle Prüfung.'),
                          const SizedBox(height: 14),
                          if (!_capabilities.available)
                            const Text(
                              'Der technische Sandbox-Test ist derzeit nicht verfügbar. Es werden keine Testdaten an Stripe gesendet.',
                            )
                          else if (confirmed)
                            const Text(
                              'Serverbestätigter Test: Der Receipt stammt aus dem Backend-Readback. Eine Weiterleitung allein gilt nicht als Erfolg.',
                            )
                          else if (run?.status == 'expired')
                            const Text(
                              'Dieser Test-Checkout ist abgelaufen. Der bestehende Lauf bleibt erhalten; es wird kein neuer Schlüssel automatisch erzeugt.',
                            )
                          else if (run != null)
                            const Text(
                              'Der Checkout wurde geöffnet. Nach der Rückkehr wird der Status erneut ausschließlich vom Server gelesen.',
                            )
                          else
                            const Text(
                              'Nur Stripe-Testdaten verwenden. Keine echten Karten- oder Personendaten eingeben.',
                            ),
                          if (_capabilities.available &&
                              !confirmed &&
                              run?.status != 'expired') ...[
                            const SizedBox(height: 18),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: _working ? null : _startCheckout,
                                icon: const Icon(Icons.open_in_new),
                                label: Text(_working
                                    ? 'Bitte warten …'
                                    : run == null
                                        ? 'Technischen Zahlungstest starten'
                                        : 'Checkout erneut öffnen'),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Card(
                      color: Theme.of(context).colorScheme.errorContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(_error!),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
