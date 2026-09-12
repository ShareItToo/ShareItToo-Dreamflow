import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/services.dart' show rootBundle;
import 'package:lendify/models/invoice.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Creates a portable PDF view of the immutable server document snapshot.
/// No amount is recalculated from item, delivery, distance or client state.
class InvoicePdfService {
  static const _regularFontAsset = 'assets/fonts/Roboto-Regular.ttf';
  static const _boldFontAsset = 'assets/fonts/Roboto-Bold.ttf';

  static Future<Uint8List> buildPdf(Invoice invoice) async {
    try {
      final theme = await _loadTheme();
      final document = pw.Document(
        title: '${invoice.title} ${invoice.documentNumber}',
        author: 'ShareItToo',
        creator: 'ShareItToo – immutable financial document view',
      );
      document.addPage(pw.MultiPage(
        theme: theme,
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (_) => [
          if (invoice.testMode) _testBanner(),
          _header(invoice),
          pw.SizedBox(height: 16),
          _meta(invoice),
          pw.SizedBox(height: 18),
          _booking(invoice),
          pw.SizedBox(height: 18),
          _amounts(invoice),
          pw.SizedBox(height: 18),
          pw.Divider(color: PdfColors.grey300),
          pw.Text(_legalNotice(invoice),
              style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
          pw.SizedBox(height: 8),
          pw.Text(
            'Quelle: unveränderlicher ${invoice.sourceKind}-Snapshot '
            '${invoice.sourceId}. Nachweis: ${invoice.artifactSha256.isEmpty ? 'QA-Simulation' : invoice.artifactSha256}.',
            style: pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
        ],
      ));
      return document.save();
    } catch (error) {
      debugPrint('[InvoicePdfService] buildPdf failed: $error');
      rethrow;
    }
  }

  static Future<pw.ThemeData> _loadTheme() async {
    final regularFontData = await rootBundle.load(_regularFontAsset);
    final boldFontData = await rootBundle.load(_boldFontAsset);
    return pw.ThemeData.withFont(
      base: pw.Font.ttf(regularFontData),
      bold: pw.Font.ttf(boldFontData),
    );
  }

  static pw.Widget _testBanner() => pw.Container(
        width: double.infinity,
        margin: const pw.EdgeInsets.only(bottom: 16),
        padding: const pw.EdgeInsets.all(10),
        decoration: pw.BoxDecoration(
          color: PdfColors.orange50,
          border: pw.Border.all(color: PdfColors.orange700, width: 2),
        ),
        child: pw.Text(
          'TESTBELEG – kein Echtgeld und keine steuerliche Rechnung',
          style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
        ),
      );

  static pw.Widget _header(Invoice invoice) => pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(invoice.title,
                    style: pw.TextStyle(
                        fontSize: 19, fontWeight: pw.FontWeight.bold)),
                pw.Text('ShareItToo',
                    style:
                        pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
              ],
            ),
          ),
          pw.Text(invoice.documentNumber,
              style:
                  pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
        ],
      );

  static pw.Widget _meta(Invoice invoice) => pw.Container(
        padding: const pw.EdgeInsets.all(12),
        decoration: pw.BoxDecoration(
          border: pw.Border.all(color: PdfColors.grey300),
          borderRadius: pw.BorderRadius.circular(8),
        ),
        child: pw.Row(children: [
          pw.Expanded(child: _kv('Ausgestellt', _date(invoice.issuedAt))),
          pw.Expanded(child: _kv('Buchungs-ID', invoice.bookingId)),
          pw.Expanded(child: _kv('Dokumenttyp', _typeLabel(invoice.type))),
        ]),
      );

  static pw.Widget _booking(Invoice invoice) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          _sectionTitle('Buchung'),
          _kv('Gegenstand', invoice.booking.itemTitle),
          _kv('Privater Vermieter', invoice.booking.ownerName),
          _kv('Mieter', invoice.booking.renterName),
          _kv('Zeitraum', _period(invoice.booking)),
          if (invoice.booking.quoteId != null)
            _kv('Quote', invoice.booking.quoteId!),
          if (invoice.booking.contractVersion != null)
            _kv('Vertragsversion', invoice.booking.contractVersion!),
        ],
      );

  static pw.Widget _amounts(Invoice invoice) {
    final rows = <pw.Widget>[];
    switch (invoice.type) {
      case InvoiceType.bookingPaymentReceipt:
        rows.add(_money('Privater Mietpreis – Leistung des Vermieters',
            invoice.privateRentMinor, invoice.currency));
        rows.add(_money('SIT-Plattformgebühr – Leistung von SIT',
            invoice.sitFeeMinor, invoice.currency));
      case InvoiceType.sitFeeReceipt:
        rows.add(_money(
            'SIT-Plattformgebühr', invoice.sitFeeMinor, invoice.currency));
      case InvoiceType.ownerPayoutStatement:
        rows.add(_money('Ausgezahlter privater Mietpreis',
            invoice.ownerPayoutMinor, invoice.currency));
      case InvoiceType.refundReceipt:
        rows.add(_money('Erstattung Mietpreis – Schuldner Vermieter',
            invoice.rentRefundMinor, invoice.currency));
        rows.add(_money('Erstattung SIT-Gebühr – Schuldner SIT',
            invoice.sitFeeRefundMinor, invoice.currency));
    }
    rows.add(pw.Divider(color: PdfColors.grey300));
    rows.add(_money('Dokumentbetrag', invoice.amountMinor, invoice.currency,
        bold: true));
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [_sectionTitle('Beträge'), ...rows],
    );
  }

  static String _legalNotice(Invoice invoice) => switch (invoice.type) {
        InvoiceType.bookingPaymentReceipt =>
          'Der private Vermieter erbringt die Mietleistung. SIT ist nicht Vermieter und weist auf den privaten Mietpreis keine Umsatzsteuer aus.',
        InvoiceType.sitFeeReceipt =>
          'Dieser Beleg betrifft ausschließlich die Leistung und Plattformgebühr von SIT. ${invoice.sitFeeTaxLabel}',
        InvoiceType.ownerPayoutStatement =>
          'Dies ist ein Auszahlungsnachweis und keine Rechnung von SIT über den privaten Mietpreis.',
        InvoiceType.refundReceipt =>
          'Mietpreis und SIT-Plattformgebühr sind mit getrenntem Schuldner ausgewiesen.',
      };

  static String _typeLabel(InvoiceType type) => switch (type) {
        InvoiceType.bookingPaymentReceipt => 'Zahlungsübersicht',
        InvoiceType.sitFeeReceipt => 'SIT-Gebührenbeleg',
        InvoiceType.ownerPayoutStatement => 'Auszahlungsnachweis',
        InvoiceType.refundReceipt => 'Erstattungsbeleg',
      };

  static pw.Widget _sectionTitle(String value) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 8),
        child: pw.Text(value,
            style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
      );

  static pw.Widget _kv(String key, String value) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 4),
        child:
            pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.SizedBox(
            width: 110,
            child: pw.Text(key,
                style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
          ),
          pw.Expanded(
              child: pw.Text(value, style: const pw.TextStyle(fontSize: 10))),
        ]),
      );

  static pw.Widget _money(String label, int minor, String currency,
          {bool bold = false}) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 3),
        child: pw.Row(children: [
          pw.Expanded(
              child: pw.Text(label,
                  style: pw.TextStyle(
                      fontSize: 10,
                      fontWeight:
                          bold ? pw.FontWeight.bold : pw.FontWeight.normal))),
          pw.Text(_currency(minor, currency),
              style: pw.TextStyle(
                  fontSize: 10,
                  fontWeight:
                      bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
        ]),
      );

  static String _currency(int minor, String currency) =>
      '${(minor / 100).toStringAsFixed(2).replaceAll('.', ',')} $currency';

  static String _date(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}.${value.year}';

  static String _period(InvoiceBookingDetails booking) {
    if (booking.startsAt == null || booking.endsAt == null) return '–';
    return '${_date(booking.startsAt!)} bis ${_date(booking.endsAt!)}';
  }
}
