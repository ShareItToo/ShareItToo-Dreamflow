import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lendify/models/invoice.dart';
import 'package:lendify/models/rental_request.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';

/// Financial documents are server-issued from immutable payment/refund/payout
/// snapshots. The only local generator is an explicitly marked QA simulation;
/// release code never recomputes a receipt from an item price.
class InvoicesService {
  static Future<List<Invoice>> getInvoicesForCurrentUser() async {
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final rows = await BackendRepository.getFinancialDocuments();
        return _sorted(rows.map(Invoice.fromJson));
      }
      if (!QaRuntimeService.isEnabled) return const [];
      final current = await DataService.getCurrentUser();
      if (current == null) return const [];
      return getInvoicesForUser(current.id);
    } catch (error) {
      debugPrint('[InvoicesService] getInvoicesForCurrentUser failed: $error');
      return const [];
    }
  }

  static Future<List<Invoice>> getInvoicesForUser(String userId) async {
    try {
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        final current = await DataService.getCurrentUser();
        if (current?.id != userId) return const [];
        final rows = await BackendRepository.getFinancialDocuments();
        return _sorted(rows.map(Invoice.fromJson));
      }
      if (!QaRuntimeService.isEnabled) return const [];

      final asRenter = await DataService.getRentalRequestsForRenter(userId);
      final asOwner = await DataService.getRentalRequestsForOwner(userId);
      final documents = <Invoice>[];
      for (final request in [...asRenter, ...asOwner]) {
        documents.addAll(await _qaDocumentsForCompletedRequest(
          request,
          perspectiveUserId: userId,
        ));
      }
      return _sorted({for (final entry in documents) entry.id: entry}.values);
    } catch (error) {
      debugPrint('[InvoicesService] getInvoicesForUser failed: $error');
      return const [];
    }
  }

  static Future<Invoice?> findInvoiceForCurrentUser(String invoiceId) async {
    final documents = await getInvoicesForCurrentUser();
    for (final document in documents) {
      if (document.id == invoiceId) return document;
    }
    return null;
  }

  /// Release downloads are authorized and hash-checked by the backend before
  /// the app renders the immutable snapshot as a PDF view. QA simulations are
  /// deliberately local and carry no server artifact.
  static Future<void> verifyDownloadArtifact(Invoice invoice) async {
    if (QaRuntimeService.isEnabled) return;
    if (!BackendConfig.enabled) {
      throw StateError('financial_document_backend_required');
    }
    final response =
        await BackendRepository.downloadFinancialDocument(invoice.id);
    final observed =
        response.headers['x-sit-artifact-sha256']?.trim().toLowerCase() ?? '';
    if (observed.isEmpty || observed != invoice.artifactSha256.toLowerCase()) {
      throw StateError('financial_document_artifact_hash_mismatch');
    }
  }

  static Future<List<Invoice>> _qaDocumentsForCompletedRequest(
    RentalRequest request, {
    required String perspectiveUserId,
  }) async {
    if (request.status.toLowerCase() != 'completed') return const [];
    final rentMinor = request.quotedRentalSubtotalMinor;
    final feeMinor = request.quotedPlatformFeeMinor;
    final totalMinor = request.quotedTotalMinor;
    if (rentMinor == null || feeMinor == null || totalMinor == null) {
      return const [];
    }
    if (rentMinor < 0 || feeMinor < 0 || totalMinor != rentMinor + feeMinor) {
      return const [];
    }
    final item = await DataService.getItemById(request.itemId);
    final renter = await DataService.getUserById(request.renterId);
    final owner = await DataService.getUserById(request.ownerId);
    if (item == null || renter == null || owner == null) return const [];

    final issuedAt = request.end.toUtc();
    final booking = InvoiceBookingDetails(
      itemTitle: item.title,
      renterName: renter.displayName,
      ownerName: owner.displayName,
      startsAt: request.start.toUtc(),
      endsAt: request.end.toUtc(),
      quoteId: 'qa-quote-${request.id}',
      quoteHash: null,
      contractVersion: 'QA-SIMULATION',
    );
    if (perspectiveUserId == request.renterId) {
      return [
        _qaDocument(
          request: request,
          type: InvoiceType.bookingPaymentReceipt,
          issuedAt: issuedAt,
          amountMinor: totalMinor,
          privateRentMinor: rentMinor,
          sitFeeMinor: feeMinor,
          supplierRole: 'private_owner',
          debtorRole: 'renter',
          booking: booking,
        ),
        if (feeMinor > 0)
          _qaDocument(
            request: request,
            type: InvoiceType.sitFeeReceipt,
            issuedAt: issuedAt,
            amountMinor: feeMinor,
            sitFeeMinor: feeMinor,
            supplierRole: 'sit',
            debtorRole: 'renter',
            booking: booking,
          ),
      ];
    }
    if (perspectiveUserId == request.ownerId) {
      return [
        _qaDocument(
          request: request,
          type: InvoiceType.ownerPayoutStatement,
          issuedAt: issuedAt,
          amountMinor: rentMinor,
          ownerPayoutMinor: rentMinor,
          supplierRole: 'private_owner',
          debtorRole: 'payment_provider',
          booking: booking,
        ),
      ];
    }
    return const [];
  }

  static Invoice _qaDocument({
    required RentalRequest request,
    required InvoiceType type,
    required DateTime issuedAt,
    required int amountMinor,
    required String supplierRole,
    required String debtorRole,
    required InvoiceBookingDetails booking,
    int privateRentMinor = 0,
    int sitFeeMinor = 0,
    int ownerPayoutMinor = 0,
  }) {
    final typeName = switch (type) {
      InvoiceType.bookingPaymentReceipt => 'booking_payment_receipt',
      InvoiceType.sitFeeReceipt => 'sit_fee_receipt',
      InvoiceType.ownerPayoutStatement => 'owner_payout_statement',
      InvoiceType.refundReceipt => 'refund_receipt',
    };
    final suffix = _stableDigits('${request.id}:$typeName');
    return Invoice(
      id: 'qa-${request.id}-$typeName',
      documentNumber: 'SIT-QA-${issuedAt.year}-$suffix',
      bookingId: request.id,
      type: type,
      title: switch (type) {
        InvoiceType.bookingPaymentReceipt => 'Buchungs- und Zahlungsübersicht',
        InvoiceType.sitFeeReceipt => 'Beleg über die SIT-Plattformgebühr',
        InvoiceType.ownerPayoutStatement =>
          'Auszahlungsnachweis für den Vermieter',
        InvoiceType.refundReceipt => 'Erstattungsbeleg',
      },
      sourceKind: 'qa_simulation',
      sourceId: request.id,
      currency: 'EUR',
      amountMinor: amountMinor,
      privateRentMinor: privateRentMinor,
      sitFeeMinor: sitFeeMinor,
      ownerPayoutMinor: ownerPayoutMinor,
      rentRefundMinor: 0,
      sitFeeRefundMinor: 0,
      supplierRole: supplierRole,
      debtorRole: debtorRole,
      taxTreatment: type == InvoiceType.bookingPaymentReceipt
          ? 'private_rent_no_sit_vat'
          : 'not_applicable',
      testMode: true,
      issuedAt: issuedAt,
      artifactSha256: '',
      downloadPath: '',
      booking: booking,
      sitFeeTaxLabel: 'QA-Testbeleg – keine steuerliche Rechnung',
    );
  }

  static List<Invoice> _sorted(Iterable<Invoice> documents) {
    final result = documents.toList()
      ..sort((left, right) => right.issuedAt.compareTo(left.issuedAt));
    return result;
  }

  static String _stableDigits(String value) {
    var hash = 2166136261;
    for (final codeUnit in value.codeUnits) {
      hash ^= codeUnit;
      hash = (hash * 16777619) & 0x7fffffff;
    }
    return (100000 + hash % 900000).toString();
  }

  static double sumAmountForYear(List<Invoice> invoices, int year) {
    var minor = 0;
    for (final invoice in invoices) {
      if (invoice.issuedAt.year == year) minor += invoice.amountMinor;
    }
    return minor / 100;
  }

  static List<int> availableYears(List<Invoice> invoices) {
    final years = invoices.map((entry) => entry.issuedAt.year).toSet().toList()
      ..sort((left, right) => right.compareTo(left));
    return years;
  }

  static List<Invoice> filter({
    required List<Invoice> invoices,
    required InvoiceFilter filter,
    int? year,
  }) {
    Iterable<Invoice> result = invoices;
    if (year != null) {
      result = result.where((entry) => entry.issuedAt.year == year);
    }
    result = switch (filter) {
      InvoiceFilter.all => result,
      InvoiceFilter.bookings => result
          .where((entry) => entry.type == InvoiceType.bookingPaymentReceipt),
      InvoiceFilter.rentals =>
        result.where((entry) => entry.type == InvoiceType.ownerPayoutStatement),
      InvoiceFilter.refunds =>
        result.where((entry) => entry.type == InvoiceType.refundReceipt),
      InvoiceFilter.fees =>
        result.where((entry) => entry.type == InvoiceType.sitFeeReceipt),
    };
    return _sorted(result);
  }
}

enum InvoiceFilter { all, bookings, rentals, refunds, fees }
