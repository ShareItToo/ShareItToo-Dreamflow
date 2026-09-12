import 'package:flutter/material.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:url_launcher/url_launcher.dart';

class PaymentCheckoutScreen extends StatefulWidget {
  final String bookingId;
  final Future<Map<String, dynamic>> Function()? loadCapabilities;
  final Future<Map<String, dynamic>> Function(String bookingId)? loadPayment;

  const PaymentCheckoutScreen({
    super.key,
    required this.bookingId,
    this.loadCapabilities,
    this.loadPayment,
  });

  @override
  State<PaymentCheckoutScreen> createState() => _PaymentCheckoutScreenState();
}

class _PaymentCheckoutScreenState extends State<PaymentCheckoutScreen>
    with WidgetsBindingObserver {
  late final String _checkoutKey =
      'checkout_${widget.bookingId}_${DateTime.now().microsecondsSinceEpoch}';
  Map<String, dynamic>? _state;
  Map<String, dynamic>? _capabilities;
  bool _loading = true;
  bool _working = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    try {
      final capabilities = await (widget.loadCapabilities ??
          BackendRepository.getPaymentCapabilities)();
      final providerAvailable = _providerAvailable(capabilities);
      final value = providerAvailable
          ? await (widget.loadPayment ?? BackendRepository.getBookingPayment)(
              widget.bookingId,
            )
          : null;
      if (!mounted) return;
      setState(() {
        _state = value;
        _capabilities = capabilities;
        _loading = false;
        _error = null;
      });
    } on BackendException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _message(error.code);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Der Zahlungsstatus konnte gerade nicht geladen werden.';
      });
    }
  }

  Future<void> _openSecureCheckout() async {
    if (!_providerAvailable(_capabilities)) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final response = await BackendRepository.createBookingCheckout(
        bookingId: widget.bookingId,
        idempotencyKey: _checkoutKey,
      );
      final rawUrl = response['checkoutUrl']?.toString() ?? '';
      final uri = Uri.tryParse(rawUrl);
      if (uri == null ||
          !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw const BackendException(503, 'checkout_open_failed');
      }
    } on BackendException catch (error) {
      if (mounted) {
        setState(() => _error = _message(error.code));
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Der sichere Zahlungs-Checkout konnte nicht geöffnet werden.');
      }
    } finally {
      if (mounted) {
        setState(() => _working = false);
      }
    }
  }

  String _message(String code) => switch (code) {
        'booking_not_ready_for_payment' =>
          'Die Buchung muss zuerst vom Vermieter angenommen werden.',
        'owner_payout_account_not_ready' =>
          'Der Vermieter muss sein Auszahlungskonto beim freigeschalteten Zahlungsdienst zuerst vervollständigen.',
        'payments_disabled' =>
          'Zahlungen sind für dieses Konto noch nicht freigeschaltet.',
        'payment_provider_unavailable' =>
          'Für dieses Konto ist noch kein echter Marketplace-Zahlungsdienst freigeschaltet.',
        'payment_checkout_in_progress' =>
          'Für diese Buchung läuft bereits ein sicherer Checkout. Es wird kein zweiter Zahlungsvorgang gestartet.',
        'payment_checkout_reconciliation_required' =>
          'Der Status des bisherigen Checkouts wird sicher abgeglichen. Bitte später aktualisieren; es wird kein zweiter Zahlungsvorgang gestartet.',
        'booking_already_paid' => 'Diese Buchung wurde bereits bezahlt.',
        _ => 'Die Zahlungsaktion konnte gerade nicht abgeschlossen werden.',
      };

  String _money(Object? minor, String currency) {
    final value = (minor as num?)?.toInt() ?? 0;
    return '${(value / 100).toStringAsFixed(2).replaceAll('.', ',')} $currency';
  }

  bool _providerAvailable(Map<String, dynamic>? capabilities) {
    final mode = capabilities?['mode']?.toString();
    return capabilities?['checkoutAvailable'] == true &&
        capabilities?['provider'] == 'stripe' &&
        (mode == 'test' || mode == 'live');
  }

  @override
  Widget build(BuildContext context) {
    final payment = _state?['payment'] as Map?;
    final quote = _state?['quote'] as Map?;
    final amounts = payment ?? quote;
    final currency = amounts?['currency']?.toString() ?? 'EUR';
    final paymentStatus = payment?['status']?.toString();
    final captured = const {'captured', 'partially_refunded', 'refunded'}
        .contains(paymentStatus);
    final providerAvailable = _providerAvailable(_capabilities);
    final testMode = providerAvailable && _capabilities?['mode'] == 'test';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Zahlungsstatus'),
        actions: [
          IconButton(
              onPressed: _working ? null : _refresh,
              icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.lock_outline, size: 36),
                          const SizedBox(height: 12),
                          Text(
                            !providerAvailable
                                ? 'Zahlung noch nicht freigeschaltet'
                                : (captured
                                    ? 'Zahlung bestätigt'
                                    : (testMode
                                        ? 'Zahlungstest'
                                        : 'Buchung bezahlen')),
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            !providerAvailable
                                ? 'Für dieses Konto ist noch kein echter Marketplace-Zahlungsdienst freigeschaltet. ShareItToo fordert deshalb keine Karten-, Konto- oder Sicherheitsdaten an.'
                                : (captured
                                    ? 'Der freigeschaltete Zahlungsdienst hat die Zahlung bestätigt. Der Status stammt direkt vom Server.'
                                    : (testMode
                                        ? 'Dieser Checkout ist ausschließlich für gekennzeichnete Tests vorgesehen. Es fließt kein echtes Geld.'
                                        : 'Betrag und Gebühr werden vom ShareItToo-Server festgelegt. Deine Zahlungsdaten werden ausschließlich im sicheren Stripe-Checkout eingegeben.')),
                          ),
                          if (amounts != null) ...[
                            const SizedBox(height: 18),
                            _AmountRow(
                                label: 'Gesamtbetrag',
                                value:
                                    _money(amounts['amountMinor'], currency)),
                            _AmountRow(
                                label: 'Plattformgebühr',
                                value: _money(
                                    amounts['platformFeeMinor'], currency)),
                            _AmountRow(
                                label: 'Vermietererlös',
                                value: _money(
                                    amounts['ownerPayoutMinor'], currency)),
                          ],
                          if (providerAvailable && !captured) ...[
                            const SizedBox(height: 18),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed:
                                    _working ? null : _openSecureCheckout,
                                icon: const Icon(Icons.open_in_new),
                                label: Text(_working
                                    ? 'Bitte warten …'
                                    : (testMode
                                        ? 'Test-Checkout öffnen'
                                        : 'Sicher mit Stripe bezahlen')),
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

class _AmountRow extends StatelessWidget {
  final String label;
  final String value;

  const _AmountRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(child: Text(label)),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
