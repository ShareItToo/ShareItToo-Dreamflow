import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:lendify/models/invoice.dart';
import 'package:lendify/services/invoice_pdf_service.dart';
import 'package:lendify/services/invoices_service.dart';
import 'package:lendify/services/local_artifact_storage_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:printing/printing.dart';

class InvoiceDetailScreen extends StatefulWidget {
  final Invoice invoice;
  final bool autoStartDownload;
  const InvoiceDetailScreen(
      {super.key, required this.invoice, this.autoStartDownload = false});

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (widget.autoStartDownload) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _downloadPdf());
    }
  }

  Future<void> _downloadPdf() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await InvoicesService.verifyDownloadArtifact(widget.invoice);
      final bytes = await InvoicePdfService.buildPdf(widget.invoice);
      final fileName =
          'SIT_Beleg_${widget.invoice.bookingId}_${widget.invoice.date.toIso8601String().split('T').first}.pdf';
      final saveResult = await LocalArtifactStorageService.maybeSaveReceiptPdf(
        bytes: bytes,
        artifactKey:
            'invoice:${widget.invoice.id}:${widget.invoice.updatedAt.toIso8601String()}',
        filename: fileName,
      );
      if (!saveResult.handledPrimaryAction) {
        await Printing.layoutPdf(
          name: fileName,
          onLayout: (_) async => bytes,
        );
      }
    } catch (e) {
      debugPrint('[InvoiceDetail] download failed: $e');
      if (mounted) {
        AppPopup.error(
          context,
          title: 'PDF konnte nicht erstellt werden',
          message: 'Bitte versuche es erneut.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sharePdf() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await InvoicesService.verifyDownloadArtifact(widget.invoice);
      final bytes = await InvoicePdfService.buildPdf(widget.invoice);
      await Printing.sharePdf(
          bytes: bytes, filename: '${widget.invoice.invoiceNumber}.pdf');
    } catch (e) {
      debugPrint('[InvoiceDetail] share failed: $e');
      if (mounted) {
        AppPopup.error(
          context,
          title: 'Teilen fehlgeschlagen',
          message: 'Bitte versuche es erneut.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final inv = widget.invoice;

    final cardRadius = 18.0;
    final cardColor = Colors.black.withValues(alpha: 0.30);
    final borderColor = Colors.white.withValues(alpha: 0.07);

    return Stack(children: [
      Positioned.fill(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(color: Colors.black.withValues(alpha: 0.34)),
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
          leading: IconButton(
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              icon: const Icon(Icons.arrow_back_rounded),
              onPressed: () => Navigator.of(context).maybePop()),
          title: Text(_typeLabel(inv.type)),
        ),
        body: SafeArea(
          child: Column(children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                children: [
                  if (inv.testMode) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.orange.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.orangeAccent),
                      ),
                      child: const Text(
                        'TESTBELEG – kein Echtgeld und keine steuerliche Rechnung',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Text(_typeLabel(inv.type), style: theme.textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text(inv.bookingId,
                      style: theme.textTheme.titleMedium?.copyWith(
                          color: Colors.white.withValues(alpha: 0.88))),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: cardColor,
                      borderRadius: BorderRadius.circular(cardRadius),
                      border: Border.all(color: borderColor),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withValues(alpha: 0.30),
                            blurRadius: 16,
                            offset: const Offset(0, 10))
                      ],
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _kv(context, 'Datum', _formatDate(inv.date)),
                          _kv(context, 'Buchungs-ID', inv.bookingId),
                          _kv(context, 'Dokumentnr.', inv.invoiceNumber),
                        ]),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: cardColor,
                      borderRadius: BorderRadius.circular(cardRadius),
                      border: Border.all(color: borderColor),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withValues(alpha: 0.26),
                            blurRadius: 16,
                            offset: const Offset(0, 10))
                      ],
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Buchungsdetails',
                              style: theme.textTheme.titleMedium),
                          const SizedBox(height: 10),
                          _kv(context, 'Artikel', inv.booking.itemTitle),
                          _kv(context, 'Vermieter', inv.booking.ownerName),
                          _kv(context, 'Mietdauer',
                              '${inv.booking.rentalDays} Tage'),
                        ]),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: cardColor,
                      borderRadius: BorderRadius.circular(cardRadius),
                      border: Border.all(color: borderColor),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withValues(alpha: 0.26),
                            blurRadius: 16,
                            offset: const Offset(0, 10))
                      ],
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Beträge', style: theme.textTheme.titleMedium),
                          const SizedBox(height: 10),
                          ..._documentAmountRows(context, inv),
                          const SizedBox(height: 8),
                          Container(
                              height: 1,
                              color: Colors.white.withValues(alpha: 0.08)),
                          const SizedBox(height: 8),
                          _moneyRow(context, 'Dokumentbetrag', inv.amount,
                              emphasize: true),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(16),
                              color: Colors.black.withValues(alpha: 0.20),
                              border: Border.all(
                                  color: cs.primary.withValues(alpha: 0.22)),
                            ),
                            child: Text(
                              _documentNotice(inv),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: Colors.white.withValues(alpha: 0.82),
                                height: 1.4,
                              ),
                            ),
                          ),
                          if (inv.artifactSha256.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Text(
                              'Unveränderlicher Nachweis: ${inv.artifactSha256.substring(0, 12)}…',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: Colors.white60,
                              ),
                            ),
                          ],
                        ]),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.30),
                border: Border(
                    top: BorderSide(
                        color: Colors.white.withValues(alpha: 0.08))),
              ),
              child: Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _downloadPdf,
                    icon: Icon(Icons.picture_as_pdf_rounded,
                        color: _busy ? Colors.white54 : cs.primary),
                    label: Text('PDF herunterladen',
                        style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700)),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(
                          color: Colors.white.withValues(alpha: 0.14)),
                      backgroundColor: Colors.black.withValues(alpha: 0.18),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _sharePdf,
                    icon: Icon(Icons.ios_share_rounded, color: cs.onPrimary),
                    label: Text('Beleg teilen',
                        style: theme.textTheme.bodyMedium?.copyWith(
                            color: cs.onPrimary, fontWeight: FontWeight.w800)),
                    style: FilledButton.styleFrom(
                      backgroundColor: cs.primary,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    ]);
  }
}

String _typeLabel(InvoiceType type) {
  switch (type) {
    case InvoiceType.bookingPaymentReceipt:
      return 'Buchungs- und Zahlungsübersicht';
    case InvoiceType.ownerPayoutStatement:
      return 'Auszahlungsnachweis';
    case InvoiceType.refundReceipt:
      return 'Erstattungsbeleg';
    case InvoiceType.sitFeeReceipt:
      return 'SIT-Gebührenbeleg';
  }
}

List<Widget> _documentAmountRows(BuildContext context, Invoice invoice) {
  switch (invoice.type) {
    case InvoiceType.bookingPaymentReceipt:
      return [
        _moneyRow(context, 'Privater Mietpreis – Vermieter',
            invoice.privateRentMinor / 100),
        _moneyRow(context, 'SIT-Plattformgebühr', invoice.sitFeeMinor / 100),
      ];
    case InvoiceType.sitFeeReceipt:
      return [
        _moneyRow(context, 'SIT-Plattformgebühr', invoice.sitFeeMinor / 100),
      ];
    case InvoiceType.ownerPayoutStatement:
      return [
        _moneyRow(context, 'Ausgezahlter privater Mietpreis',
            invoice.ownerPayoutMinor / 100),
      ];
    case InvoiceType.refundReceipt:
      return [
        _moneyRow(context, 'Mietpreis – Schuldner Vermieter',
            invoice.rentRefundMinor / 100),
        _moneyRow(context, 'SIT-Gebühr – Schuldner SIT',
            invoice.sitFeeRefundMinor / 100),
      ];
  }
}

String _documentNotice(Invoice invoice) => switch (invoice.type) {
      InvoiceType.bookingPaymentReceipt =>
        'Der private Vermieter erbringt die Mietleistung. SIT ist nicht Vermieter und weist auf den privaten Mietpreis keine Umsatzsteuer aus.',
      InvoiceType.sitFeeReceipt =>
        'Dieser Beleg betrifft ausschließlich die SIT-Plattformgebühr. ${invoice.sitFeeTaxLabel}',
      InvoiceType.ownerPayoutStatement =>
        'Dies ist ein Auszahlungsnachweis und keine Rechnung von SIT über den privaten Mietpreis.',
      InvoiceType.refundReceipt =>
        'Mietpreis und SIT-Plattformgebühr sind mit getrenntem Schuldner ausgewiesen.',
    };

Widget _kv(BuildContext context, String k, String v) {
  final theme = Theme.of(context);
  return Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(
          width: 110,
          child: Text(k,
              style: theme.textTheme.labelSmall
                  ?.copyWith(color: Colors.white.withValues(alpha: 0.72)))),
      Expanded(child: Text(v, style: theme.textTheme.bodyMedium)),
    ]),
  );
}

Widget _moneyRow(BuildContext context, String label, double amount,
    {bool emphasize = false}) {
  final theme = Theme.of(context);
  final style = emphasize
      ? theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w900)
      : theme.textTheme.bodyMedium
          ?.copyWith(color: Colors.white.withValues(alpha: 0.90));
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Expanded(child: Text(label, style: style)),
      Text(_formatEuro(amount), style: style),
    ]),
  );
}

String _formatEuro(double v) {
  final s = v.toStringAsFixed(2).replaceAll('.', ',');
  return '$s €';
}

String _formatDate(DateTime dt) {
  const months = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  final m = months[(dt.month - 1).clamp(0, 11)];
  return '${dt.day}. $m ${dt.year}';
}
