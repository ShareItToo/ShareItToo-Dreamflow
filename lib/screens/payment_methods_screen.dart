import 'package:flutter/material.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';

import 'technical_sandbox_screen.dart';

class PaymentMethodsScreen extends StatefulWidget {
  final Future<Map<String, dynamic>> Function()? loadCapabilities;
  final Future<AuthSession?> Function()? sessionReader;
  final Future<bool> Function(AuthSessionOwner owner)? ownerChecker;

  const PaymentMethodsScreen({
    super.key,
    this.loadCapabilities,
    this.sessionReader,
    this.ownerChecker,
  });

  @override
  State<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends State<PaymentMethodsScreen> {
  Map<String, dynamic>? _capabilities;
  bool _loading = true;
  String? _error;
  int _loadRevision = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    setState(() {
      _capabilities = null;
      _loading = true;
      _error = null;
    });
    AuthSessionOwner? capturedOwner;
    try {
      final session = widget.sessionReader != null
          ? await widget.sessionReader!()
          : (widget.loadCapabilities != null
              ? null
              : await AuthService.readSession());
      if (!_isActive(revision)) return;
      if (session == null && widget.loadCapabilities == null) {
        throw const BackendException(401, 'authentication_required');
      }
      capturedOwner =
          session == null ? null : AuthService.captureSessionOwner(session);
      if (!await _isCurrent(capturedOwner) || !_isActive(revision)) {
        _invalidateOwner(revision);
        return;
      }
      final capabilities = widget.loadCapabilities != null
          ? await widget.loadCapabilities!()
          : await BackendRepository.getPaymentCapabilitiesForOwner(
              capturedOwner!,
            );
      if (!await _isCurrent(capturedOwner) || !_isActive(revision)) {
        _invalidateOwner(revision);
        return;
      }
      setState(() {
        _capabilities = capabilities;
        _loading = false;
      });
    } on BackendException {
      if (!_isActive(revision) ||
          !await _isCurrent(capturedOwner) ||
          !_isActive(revision)) {
        _invalidateOwner(revision);
        return;
      }
      setState(() {
        _capabilities = null;
        _loading = false;
        _error =
            'Der Zahlungsstatus konnte gerade nicht sicher geprüft werden.';
      });
    } catch (_) {
      if (!_isActive(revision) ||
          !await _isCurrent(capturedOwner) ||
          !_isActive(revision)) {
        _invalidateOwner(revision);
        return;
      }
      setState(() {
        _capabilities = null;
        _loading = false;
        _error =
            'Der Zahlungsstatus konnte gerade nicht sicher geprüft werden.';
      });
    }
  }

  bool _isActive(int revision) => mounted && revision == _loadRevision;

  Future<bool> _isCurrent(AuthSessionOwner? owner) async {
    if (owner == null) {
      // Injected loaders are test seams and do not represent an authenticated
      // backend read. Production backend reads always capture an owner above.
      return widget.loadCapabilities != null;
    }
    return widget.ownerChecker?.call(owner) ??
        AuthService.isSessionOwnerDefinitelyCurrent(owner);
  }

  void _invalidateOwner(int revision) {
    if (!_isActive(revision)) return;
    setState(() {
      _capabilities = null;
      _loading = false;
      _error = 'Melde dich erneut an.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final available = _capabilities?['checkoutAvailable'] == true;
    final testMode = available && _capabilities?['mode'] == 'test';
    final technicalSandbox = TechnicalSandboxCapabilities.fromJson(
        _capabilities?['technicalSandbox']);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Zahlungsmethoden'),
        actions: [
          IconButton(
            tooltip: 'Status neu laden',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(22),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          available ? Icons.lock_outline : Icons.schedule,
                          size: 42,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          !available
                              ? 'Noch nicht freigeschaltet'
                              : (testMode
                                  ? 'Zahlungstest verfügbar'
                                  : 'Sicher über Stripe'),
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          !available
                              ? 'Für dieses Konto ist noch kein echter Marketplace-Zahlungsdienstleister freigeschaltet. ShareItToo fordert deshalb keine Karten- oder Kontodaten an.'
                              : (testMode
                                  ? 'Für dieses Konto ist ausschließlich ein gekennzeichneter Testmodus freigeschaltet. Dabei fließt kein echtes Geld.'
                                  : 'Eine verfügbare Zahlungsmethode wird erst beim Bezahlen einer angenommenen Buchung direkt im sicheren Stripe-Checkout erfasst.'),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'ShareItToo speichert keine vollständigen Karten-, Sicherheitscode- oder Kontodaten in der App.',
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          available ? 'So funktioniert es' : 'Klare Grenze',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 17,
                          ),
                        ),
                        const SizedBox(height: 10),
                        if (!available)
                          const Text(
                            'Eine Zahlungsart erscheint erst im Buchungsablauf, wenn der Server einen real angebundenen und für dein Konto freigegebenen Zahlungsdienst bestätigt.',
                          )
                        else ...[
                          const Text(
                              '1. Der Vermieter nimmt deine Buchungsanfrage an.'),
                          const Text('2. Du öffnest in der Buchung „Zahlung“.'),
                          const Text('3. Du prüfst Betrag und Gebühr.'),
                          Text(
                            testMode
                                ? '4. Der deutlich gekennzeichnete Test-Checkout verwendet keine echten Zahlungsmittel.'
                                : '4. Die Eingabe der Zahlungsdaten erfolgt ausschließlich bei Stripe.',
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
                if (technicalSandbox.available) ...[
                  const SizedBox(height: 14),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Stripe Sandbox',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 18,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text('1,00 € Test'),
                          const SizedBox(height: 8),
                          const Text(
                            'Kein echtes Geld. Keine Buchung, kein Zahlungsledger, kein Payout, kein Connect. Nur synthetischer Testnutzer. Keine professionelle Prüfung.',
                          ),
                          const SizedBox(height: 14),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              icon: const Icon(Icons.science_outlined),
                              label:
                                  const Text('Technischen Zahlungstest öffnen'),
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => TechnicalSandboxScreen(
                                      loadCapabilities: widget.loadCapabilities,
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
                ],
              ],
            ),
    );
  }
}
