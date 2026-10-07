import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/synthetic_clone_config.dart';
import '../config/synthetic_payment_config.dart';
import 'synthetic_payment_test_screen.dart';
import '../services/auth_service.dart';
import '../services/backend_http.dart';
import '../services/synthetic_clone_booking_service.dart';
import '../widgets/synthetic_clone_non_binding_banner.dart';

class SyntheticCloneDiagnosticScreen extends StatefulWidget {
  const SyntheticCloneDiagnosticScreen({super.key});

  @override
  State<SyntheticCloneDiagnosticScreen> createState() =>
      _SyntheticCloneDiagnosticScreenState();
}

class _SyntheticCloneDiagnosticScreenState
    extends State<SyntheticCloneDiagnosticScreen> {
  static const _bookingKey = 'synthetic_clone_diagnostic_booking_id';

  final _bookingIdController = TextEditingController();
  final _challengeIdController = TextEditingController();
  final _fallbackCodeController = TextEditingController();
  final _qrPayloadController = TextEditingController();
  SyntheticCloneStatus? _status;
  SyntheticCloneBooking? _booking;
  SyntheticCloneChallenge? _challenge;
  List<Map<String, dynamic>> _audit = const [];
  String? _role;
  String? _error;
  String? _cleanupStatus;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _bookingIdController.dispose();
    _challengeIdController.dispose();
    _fallbackCodeController.dispose();
    _qrPayloadController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!SyntheticCloneConfig.isSyntheticCloneNonBinding) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final session = await AuthService.readSession();
      final status = await SyntheticCloneBookingService.status();
      final userId = session?.userId;
      final role = userId == status.ownerId
          ? 'owner'
          : userId == status.renterId
              ? 'renter'
              : null;
      final bookingId = prefs.getString(_bookingKey)?.trim() ?? '';
      SyntheticCloneBooking? booking;
      if (bookingId.isNotEmpty) {
        booking = await SyntheticCloneBookingService.getBooking(bookingId);
      }
      if (!mounted) return;
      setState(() {
        _status = status;
        _role = role;
        _booking = booking;
        _error = null;
      });
      _bookingIdController.text = booking?.id ?? bookingId;
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _safeError(error));
    }
  }

  Future<void> _run(Future<void> Function() operation) async {
    if (_busy || !SyntheticCloneConfig.isSyntheticCloneNonBinding) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await operation();
    } catch (error) {
      if (mounted) setState(() => _error = _safeError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createBooking() => _run(() async {
        final booking = await SyntheticCloneBookingService.createBooking();
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_bookingKey, booking.id);
        _bookingIdController.text = booking.id;
        if (!mounted) return;
        setState(() => _booking = booking);
      });

  Future<void> _loadBooking() => _run(() async {
        final id = _bookingIdController.text.trim();
        if (id.isEmpty) throw const FormatException('booking_id_required');
        final booking = await SyntheticCloneBookingService.getBooking(id);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_bookingKey, booking.id);
        if (!mounted) return;
        setState(() => _booking = booking);
      });

  Future<void> _acceptBooking() => _run(() async {
        final booking = await SyntheticCloneBookingService.acceptBooking(
          _booking!.id,
        );
        if (!mounted) return;
        setState(() => _booking = booking);
      });

  Future<void> _pickPhoto(String segment, String slot, ImageSource source) =>
      _run(() async {
        final file = await ImagePicker().pickImage(
          source: source,
          imageQuality: 85,
        );
        if (file == null) return;
        final booking = await SyntheticCloneBookingService.addPhoto(
          bookingId: _booking!.id,
          segment: segment,
          slot: slot,
          source: source == ImageSource.camera ? 'camera' : 'gallery',
        );
        if (!mounted) return;
        setState(() => _booking = booking);
      });

  Future<void> _issueChallenge() => _run(() async {
        final segment = _nextSegment;
        if (segment == null || _booking == null) return;
        final challenge = await SyntheticCloneBookingService.issueChallenge(
          bookingId: _booking!.id,
          segment: segment,
        );
        if (!mounted) return;
        setState(() {
          _challenge = challenge;
          _challengeIdController.text = challenge.id;
        });
      });

  Future<void> _verifyQr() async {
    if (_booking == null) return;
    String? scanned;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black,
      builder: (sheetContext) => SizedBox(
        height: MediaQuery.of(sheetContext).size.height * .82,
        child: MobileScanner(
          onDetect: (capture) {
            final value = capture.barcodes.firstOrNull?.rawValue?.trim();
            if (value == null || value.isEmpty) return;
            scanned = value;
            Navigator.of(sheetContext).pop();
          },
        ),
      ),
    );
    if (!mounted || scanned == null) return;
    await _run(() async {
      final booking = await SyntheticCloneBookingService.verifyQr(
        bookingId: _booking!.id,
        qrPayload: scanned!,
      );
      if (!mounted) return;
      setState(() {
        _booking = booking;
        _challenge = null;
        _challengeIdController.clear();
        _qrPayloadController.clear();
        _fallbackCodeController.clear();
      });
    });
  }

  Future<void> _verifyQrPayload() => _run(() async {
        final payload = _qrPayloadController.text.trim();
        if (payload.isEmpty) {
          throw const FormatException('synthetic_clone_qr_payload_required');
        }
        final booking = await SyntheticCloneBookingService.verifyQr(
          bookingId: _booking!.id,
          qrPayload: payload,
        );
        if (!mounted) return;
        setState(() {
          _booking = booking;
          _challenge = null;
          _challengeIdController.clear();
          _qrPayloadController.clear();
          _fallbackCodeController.clear();
        });
      });

  Future<void> _verifyFallback() => _run(() async {
        final booking = await SyntheticCloneBookingService.verifyFallback(
          bookingId: _booking!.id,
          challengeId: _challengeIdController.text.trim(),
          segment: _nextSegment!,
          presenterRole: _nextPresenterRole!,
          code: _fallbackCodeController.text.trim(),
        );
        if (!mounted) return;
        setState(() {
          _booking = booking;
          _challenge = null;
          _challengeIdController.clear();
          _qrPayloadController.clear();
          _fallbackCodeController.clear();
        });
      });

  Future<void> _loadAudit() => _run(() async {
        final audit = await SyntheticCloneBookingService.audit(_booking!.id);
        if (!mounted) return;
        setState(() => _audit = audit);
      });

  Future<void> _cleanup() => _run(() async {
        final result = await SyntheticCloneBookingService.cleanup();
        if (result['cleanupVerified'] != true) {
          throw const FormatException('synthetic_clone_cleanup_unverified');
        }
        final status = await SyntheticCloneBookingService.status();
        if (!status.cleaned || status.bookings != 0) {
          throw const FormatException('synthetic_clone_cleanup_readback_invalid');
        }
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_bookingKey);
        if (!mounted) return;
        setState(() {
          _booking = null;
          _challenge = null;
          _audit = const [];
          _status = status;
          _cleanupStatus =
              'cleanupVerified=true · verbleibende Buchungen=${status.bookings}';
        });
        _bookingIdController.clear();
        _challengeIdController.clear();
        _fallbackCodeController.clear();
        _qrPayloadController.clear();
      });

  String? get _nextSegment {
    final status = _booking?.status;
    if (status == 'accepted') return 'pickup';
    if (status == 'active') return 'return';
    return null;
  }

  String? get _nextPresenterRole =>
      _nextSegment == 'pickup' ? 'owner' : 'renter';

  bool get _isPresenter => _role == _nextPresenterRole;

  String _safeError(Object error) {
    if (error is BackendException) return error.code;
    if (error is FormatException) return error.message;
    if (error is StateError) return error.message;
    return 'synthetic_clone_operation_failed';
  }

  @override
  Widget build(BuildContext context) {
    if (!SyntheticCloneConfig.isSyntheticCloneNonBinding) {
      return const Scaffold(
        body: Center(child: Text('Synthetischer Clone nicht aktiviert.')),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Synthetischer Zwei-Rollen-Test')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildNotice(),
            const SizedBox(height: 12),
            _buildStatusCard(),
            const SizedBox(height: 12),
            _buildBookingCard(),
            if (_booking != null) ...[
              const SizedBox(height: 12),
              _buildWorkflowCard(),
              const SizedBox(height: 12),
              _buildChallengeCard(),
              const SizedBox(height: 12),
              _buildAuditCard(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildNotice() => const Card(
        child: Padding(
          padding: EdgeInsets.all(14),
          child: Text(
            syntheticCloneNonBindingBannerText,
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      );

  Widget _buildStatusCard() => Card(
        key: const ValueKey('synthetic-clone-status'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Rolle: ${_role ?? 'nicht freigegeben'}'),
              Text('Run: ${_status?.runId ?? '—'}'),
              Text('Dataset: ${_status?.datasetId ?? '—'}'),
              Text('Buchungen: ${_status?.bookings ?? '—'}'),
              if (_cleanupStatus != null) Text(_cleanupStatus!),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const ValueKey('synthetic-clone-refresh-status'),
                onPressed: _busy ? null : _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Status aktualisieren'),
              ),
            ],
          ),
        ),
      );

  Widget _buildBookingCard() => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Buchung',
                  style: TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              TextField(
                key: const ValueKey('synthetic-clone-booking-id'),
                controller: _bookingIdController,
                decoration: const InputDecoration(
                  labelText: 'Booking-ID aus dem laufenden Run',
                ),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    key: const ValueKey('synthetic-clone-load-booking'),
                    onPressed: _busy ? null : _loadBooking,
                    child: const Text('Laden'),
                  ),
                ),
                if (_role == 'renter' && _booking == null) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      key: const ValueKey('synthetic-clone-create-booking'),
                      onPressed: _busy ? null : _createBooking,
                      child: const Text('Requested erstellen'),
                    ),
                  ),
                ],
              ]),
            ],
          ),
        ),
      );

  Widget _buildWorkflowCard() {
    final booking = _booking!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Status: ${booking.status}',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('Owner: ${booking.ownerId}'),
            Text('Renter: ${booking.renterId}'),
            if (SyntheticPaymentConfig.enabled && _status != null && !_status!.cleaned)
              OutlinedButton(
                onPressed: _busy ? null : () async {
                  final runId = _status!.runId;
                  await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SyntheticPaymentTestScreen(runId: runId, bookingId: booking.id)));
                  if (mounted) await _load();
                },
                child: const Text('Lokalen Zahlungstest öffnen'),
              ),
            const SizedBox(height: 8),
            if (_role == 'owner' && booking.status == 'requested')
              FilledButton(
                key: const ValueKey('synthetic-clone-accept-booking'),
                onPressed: _busy ? null : _acceptBooking,
                child: const Text('Accepted setzen'),
              ),
            if (_nextSegment != null && _isPresenter) _buildPhotoSection(),
            if (booking.status == 'returned')
              const Text('Returned abgeschlossen; keine bindende Wirkung.'),
          ],
        ),
      ),
    );
  }

  Widget _buildPhotoSection() {
    final segment = _nextSegment!;
    final present = _booking!.photoSlots[segment] ?? const <String>{};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          segment == 'pickup' ? '4 Pickup-Fotos (Owner)' : '4 Return-Fotos (Renter)',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        SyntheticClonePhotoSlotActions(
          segment: segment,
          present: present,
          busy: _busy,
          onSelect: (slot, source) => _pickPhoto(segment, slot, source),
        ),
        if (_booking!.hasCompletePhotos(segment))
          FilledButton.icon(
            key: ValueKey('synthetic-clone-challenge-$segment'),
            onPressed: _busy ? null : _issueChallenge,
            icon: const Icon(Icons.qr_code_2),
            label: Text('${segment == 'pickup' ? 'Pickup' : 'Return'}-QR-v3 ausstellen'),
          ),
      ],
    );
  }

  Widget _buildChallengeCard() {
    final segment = _nextSegment;
    if (segment == null || _booking == null) return const SizedBox.shrink();
    final presenter = _nextPresenterRole;
    final canVerify = !_isPresenter;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Bestätigung: $segment · Presenter: $presenter',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            if (_isPresenter && _challenge != null) ...[
              const SizedBox(height: 12),
              Center(child: QrImageView(data: _challenge!.qrPayload, size: 180)),
              SelectableText('Fallback-Code: ${_challenge!.fallbackCode}'),
              SelectableText('Challenge-ID: ${_challenge!.id}'),
            ],
            SyntheticCloneVerifierEntry(
              available: canVerify,
              busy: _busy,
              challengeIdController: _challengeIdController,
              qrPayloadController: _qrPayloadController,
              fallbackCodeController: _fallbackCodeController,
              onChanged: () => setState(() {}),
              onScan: _verifyQr,
              onPayload: _verifyQrPayload,
              onFallback: _verifyFallback,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAuditCard() => Card(
        key: const ValueKey('synthetic-clone-audit'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Audit / Cleanup',
                  style: TextStyle(fontWeight: FontWeight.w800)),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const ValueKey('synthetic-clone-load-audit'),
                    onPressed: _busy ? null : _loadAudit,
                    icon: const Icon(Icons.receipt_long),
                    label: const Text('Audit laden'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    key: const ValueKey('synthetic-clone-cleanup'),
                    onPressed: _busy ? null : _cleanup,
                    icon: const Icon(Icons.delete_sweep),
                    label: const Text('Cleanup'),
                  ),
                ),
              ]),
              for (final entry in _audit)
                Text('${entry['action'] ?? 'audit'} · ${entry['at'] ?? ''}'),
            ],
          ),
        ),
      );

}

class SyntheticCloneVerifierEntry extends StatelessWidget {
  final bool available;
  final bool busy;
  final TextEditingController challengeIdController;
  final TextEditingController qrPayloadController;
  final TextEditingController fallbackCodeController;
  final VoidCallback onChanged;
  final VoidCallback onScan;
  final VoidCallback onPayload;
  final VoidCallback onFallback;

  const SyntheticCloneVerifierEntry({
    super.key,
    required this.available,
    required this.busy,
    required this.challengeIdController,
    required this.qrPayloadController,
    required this.fallbackCodeController,
    required this.onChanged,
    required this.onScan,
    required this.onPayload,
    required this.onFallback,
  });

  @override
  Widget build(BuildContext context) {
    if (!available) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('synthetic-clone-challenge-id'),
          controller: challengeIdController,
          onChanged: (_) => onChanged(),
          decoration: const InputDecoration(labelText: 'Challenge-ID'),
        ),
        TextField(
          key: const ValueKey('synthetic-clone-qr-payload'),
          controller: qrPayloadController,
          onChanged: (_) => onChanged(),
          decoration: const InputDecoration(
            labelText: 'QR-v3-Payload eingeben (kein Kamera-Scan)',
          ),
        ),
        OutlinedButton(
          key: const ValueKey('synthetic-clone-verify-qr-payload'),
          onPressed: busy || qrPayloadController.text.trim().isEmpty
              ? null
              : onPayload,
          child: const Text('QR-v3-Payload verifizieren'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const ValueKey('synthetic-clone-verify-qr'),
          onPressed: busy ? null : onScan,
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('QR-v3 scannen und verifizieren'),
        ),
        TextField(
          key: const ValueKey('synthetic-clone-fallback-code'),
          controller: fallbackCodeController,
          onChanged: (_) => onChanged(),
          maxLength: 6,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'Exakter 6-stelliger Fallback-Code',
          ),
        ),
        FilledButton(
          key: const ValueKey('synthetic-clone-verify-fallback'),
          onPressed: busy || fallbackCodeController.text.length != 6
              ? null
              : onFallback,
          child: const Text('Fallback verifizieren'),
        ),
      ],
    );
  }
}

class SyntheticClonePhotoSlotActions extends StatelessWidget {
  final String segment;
  final Set<String> present;
  final bool busy;
  final Future<void> Function(String slot, ImageSource source) onSelect;

  const SyntheticClonePhotoSlotActions({
    super.key,
    required this.segment,
    required this.present,
    required this.busy,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (final slot in syntheticClonePhotoSlots)
            Card(
              key: ValueKey('synthetic-clone-photo-$segment-$slot'),
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(_slotLabel(slot),
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(present.contains(slot) ? 'Ausgewählt' : 'Fehlt'),
                    if (present.contains(slot))
                      const Align(
                        alignment: Alignment.centerRight,
                        child: Icon(Icons.check_circle, color: Colors.green),
                      )
                    else
                      Row(
                        children: [
                          Expanded(
                            child: TextButton(
                              key: ValueKey(
                                  'synthetic-clone-camera-$segment-$slot'),
                              onPressed: busy
                                  ? null
                                  : () => onSelect(slot, ImageSource.camera),
                              child: Text('${_slotLabel(slot)} – Kamera'),
                            ),
                          ),
                          Expanded(
                            child: TextButton(
                              key: ValueKey(
                                  'synthetic-clone-picker-$segment-$slot'),
                              onPressed: busy
                                  ? null
                                  : () => onSelect(slot, ImageSource.gallery),
                              child: Text(
                                '${_slotLabel(slot)} – Photo Picker',
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
        ],
      );

  String _slotLabel(String slot) => switch (slot) {
        'overview' => 'Übersicht',
        'detail' => 'Detail',
        'accessories' => 'Zubehör',
        'critical' => 'Kritischer Bereich',
        _ => slot,
      };

}
