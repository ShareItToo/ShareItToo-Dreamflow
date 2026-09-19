import 'package:flutter/material.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:url_launcher/url_launcher.dart';

class StripePayoutAccountScreen extends StatefulWidget {
  final Future<Map<String, dynamic>> Function()? loadCapabilities;
  final Future<Map<String, dynamic>> Function()? loadConnectStatus;

  const StripePayoutAccountScreen({
    super.key,
    this.loadCapabilities,
    this.loadConnectStatus,
  });

  @override
  State<StripePayoutAccountScreen> createState() =>
      _StripePayoutAccountScreenState();
}

class _StripePayoutAccountScreenState extends State<StripePayoutAccountScreen>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _account;
  Map<String, dynamic>? _capabilities;
  bool _loading = true;
  bool _working = false;
  String? _error;
  late final String _onboardingKey =
      'connect_onboarding_${DateTime.now().microsecondsSinceEpoch}';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    try {
      final capabilities = await (widget.loadCapabilities ??
          BackendRepository.getPaymentCapabilities)();
      if (capabilities['payoutOnboardingAvailable'] != true) {
        if (!mounted) return;
        setState(() {
          _account = null;
          _capabilities = capabilities;
          _loading = false;
          _error = null;
        });
        return;
      }
      final account = await (widget.loadConnectStatus ??
          BackendRepository.getConnectStatus)();
      if (!mounted) return;
      setState(() {
        _account = account;
        _capabilities = capabilities;
        _loading = false;
        _error = null;
      });
    } on BackendException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.code == 'payments_disabled'
            ? 'Auszahlungen sind für dieses Konto noch nicht freigeschaltet.'
            : 'Der Stripe-Kontostatus konnte gerade nicht geladen werden.';
      });
    }
  }

  Future<void> _startOnboarding() async {
    if (_capabilities?['payoutOnboardingAvailable'] != true) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final response = await BackendRepository.startConnectOnboarding(
        idempotencyKey: _onboardingKey,
      );
      final uri = Uri.tryParse(response['onboardingUrl']?.toString() ?? '');
      if (uri == null ||
          !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw const BackendException(503, 'connect_open_failed');
      }
    } on BackendException {
      if (mounted) {
        setState(() => _error =
            'Das sichere Stripe-Onboarding konnte nicht geöffnet werden.');
      }
    } finally {
      if (mounted) {
        setState(() => _working = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = _account?['ready'] == true;
    final providerAvailable =
        _capabilities?['payoutOnboardingAvailable'] == true;
    final testMode = providerAvailable && _capabilities?['mode'] == 'test';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Auszahlungskonto'),
        actions: [
          IconButton(
              onPressed: _working ? null : _load,
              icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            ready
                                ? Icons.verified_rounded
                                : Icons.account_balance_outlined,
                            size: 40,
                            color: ready
                                ? Colors.green
                                : Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(height: 14),
                          Text(
                            !providerAvailable
                                ? 'Auszahlungen noch nicht freigeschaltet'
                                : (testMode
                                    ? 'Auszahlungstest verfügbar'
                                    : (ready
                                        ? 'Stripe-Konto bereit'
                                        : 'Stripe-Auszahlungskonto einrichten')),
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          const SizedBox(height: 10),
                          Text(
                            !providerAvailable
                                ? 'Für dieses Konto ist noch kein echter Marketplace-Zahlungsdienstleister freigeschaltet. ShareItToo fordert deshalb keine Identitäts- oder Bankdaten für Auszahlungen an.'
                                : (testMode
                                    ? 'Dieser Zugang ist ausschließlich für gekennzeichnete Tests vorgesehen. Es fließt kein echtes Geld.'
                                    : (ready
                                        ? 'Identität und Auszahlungsmöglichkeit wurden bestätigt. Erlöse werden erst nach abgeschlossener Rückgabe und der festgelegten Sicherheitsfrist freigegeben.'
                                        : 'Stripe erfasst Identität, Steuer- und Bankdaten in einem sicheren, aktuellen Onboarding. ShareItToo speichert keine IBAN auf diesem Gerät.')),
                          ),
                          if (_account?['disabledReason'] != null) ...[
                            const SizedBox(height: 12),
                            Text('Hinweis: ${_account!['disabledReason']}'),
                          ],
                          if (providerAvailable) ...[
                            const SizedBox(height: 18),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: _working ? null : _startOnboarding,
                                icon: const Icon(Icons.open_in_new),
                                label: Text(
                                  _working
                                      ? 'Bitte warten …'
                                      : (testMode
                                          ? 'Test-Onboarding öffnen'
                                          : (ready
                                              ? 'Stripe-Konto verwalten'
                                              : 'Sicher bei Stripe fortfahren')),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Card(
                    child: Padding(
                      padding: EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              providerAvailable
                                  ? 'So fließt das Geld'
                                  : 'Klare Grenze',
                              style: TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 17)),
                          SizedBox(height: 10),
                          if (!providerAvailable)
                            const Text(
                              'Ein Auszahlungskonto kann erst eingerichtet werden, wenn der Server einen real angebundenen und für dein Konto freigegebenen Marketplace-Zahlungsdienst bestätigt.',
                            )
                          else ...[
                            Text(testMode
                                ? '1. Es werden ausschließlich Testzahlungen ohne Echtgeld verwendet.'
                                : '1. Der Mieter bezahlt sicher über Stripe.'),
                            const Text(
                                '2. ShareItToo bestätigt eine Zahlung ausschließlich durch ein serverseitiges Anbieterereignis.'),
                            const Text(
                                '3. Der Vermietererlös bleibt bis zum Buchungsabschluss gesperrt.'),
                            const Text(
                                '4. Streitfälle oder Erstattungen stoppen die Auszahlung automatisch.'),
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
                          child: Text(_error!)),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
