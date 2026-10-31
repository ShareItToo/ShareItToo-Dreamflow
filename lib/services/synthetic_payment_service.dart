import '../config/synthetic_payment_config.dart';
import '../config/synthetic_clone_config.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'auth_service.dart';
import 'backend_http.dart';

const syntheticPaymentNotice =
    'Synthetischer Zahlungstest – kein echtes Geld/kein Vertrag/keine Auszahlung';
const syntheticPaymentScenarios = ['challenge_then_capture', 'decline'];

Future<Map<String, dynamic>> requestSyntheticPaymentJson(
    {required String method,
    required String path,
    required String token,
    Object? body,
    http.Client? client}) async {
  SyntheticPaymentConfig.validateCurrentBuild();
  if (!SyntheticPaymentConfig.enabled) {
    throw StateError('synthetic_payment_disabled');
  }
  final uri = Uri.parse('${SyntheticCloneConfig.isolatedLocalQaEndpoint}$path');
  if (!const ['GET', 'POST', 'DELETE'].contains(method) ||
      uri.scheme != 'http' ||
      uri.host != '127.0.0.1' ||
      uri.port != 18080 ||
      !uri.path.startsWith('/api/v1/synthetic-clone/') ||
      uri.hasFragment) {
    throw StateError('synthetic_payment_loopback_required');
  }
  final request = http.Request(method, uri)..followRedirects = false;
  request.headers.addAll({
    'Accept': 'application/json',
    'Authorization': 'Bearer $token',
    if (body != null) 'Content-Type': 'application/json'
  });
  if (body != null) request.body = jsonEncode(body);
  final transport = client ?? http.Client();
  try {
    final response = await http.Response.fromStream(
            await transport.send(request).timeout(const Duration(seconds: 15)))
        .timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw BackendException(
          response.statusCode, 'synthetic_payment_request_failed');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('synthetic_payment_response_invalid');
    }
    return decoded;
  } finally {
    if (client == null) transport.close();
  }
}

void validateSyntheticPaymentMarker(dynamic marker) {
  if (marker is! Map ||
      marker['persistentNotice'] != syntheticPaymentNotice ||
      marker['syntheticTestOnly'] != true ||
      marker['monetaryEffectMinor'] != 0 ||
      marker['contractEligible'] != false ||
      marker['payoutEligible'] != false) {
    throw const FormatException('synthetic_payment_marker_invalid');
  }
}

Map<String, dynamic> validateSyntheticPaymentSnapshot(
    Map<String, dynamic> raw, String runId, String bookingId) {
  validateSyntheticPaymentMarker(raw['marker']);
  if (raw['runId'] != runId ||
      raw['bookingId'] != bookingId ||
      raw['payout'] != null ||
      raw['audit'] is! List) {
    throw const FormatException('synthetic_payment_binding_invalid');
  }
  final quote = raw['quote'];
  if (quote is! Map ||
      quote['currency'] != 'EUR' ||
      quote['amountMinor'] != 6600 ||
      quote['platformFeeMinor'] != 600 ||
      quote['ownerPayoutMinor'] != 6000) {
    throw const FormatException('synthetic_payment_quote_invalid');
  }
  final payment = raw['payment'];
  if (payment != null) {
    if (payment is! Map ||
        !const ['ready', 'requires_action', 'captured', 'failed', 'refunded']
            .contains(payment['status']) ||
        payment['livemode'] != false ||
        payment['method'] != 'synthetic' ||
        !syntheticPaymentScenarios.contains(payment['scenario'])) {
      throw const FormatException('synthetic_payment_status_invalid');
    }
    final captured = const ['captured', 'refunded'].contains(payment['status']);
    if (payment['capturedMinor'] != (captured ? 6600 : 0) ||
        payment['refundedMinor'] !=
            (payment['status'] == 'refunded' ? 6600 : 0)) {
      throw const FormatException('synthetic_payment_amount_invalid');
    }
  }
  return raw;
}

abstract class SyntheticPaymentApi {
  Future<Map<String, dynamic>> load();
  Future<void> command(Map<String, dynamic> body);
  Future<void> cleanup();
}

class SyntheticPaymentService implements SyntheticPaymentApi {
  final String runId;
  final String bookingId;
  final Future<Map<String, dynamic>> Function(String, String, Object?) _request;
  SyntheticPaymentService._(this.runId, this.bookingId, this._request);

  static Future<SyntheticPaymentService> create(
      String runId, String bookingId) async {
    SyntheticPaymentConfig.validateCurrentBuild();
    if (!SyntheticPaymentConfig.enabled) {
      throw StateError('synthetic_payment_disabled');
    }
    final session = await AuthService.readSession();
    if (session == null) {
      throw const BackendException(401, 'authentication_required');
    }
    final owner = AuthService.captureSessionOwner(session);
    return SyntheticPaymentService._(runId, bookingId,
        (method, path, body) async {
      if (!SyntheticPaymentConfig.enabled) {
        throw StateError('synthetic_payment_disabled');
      }
      // This isolated lane never invokes generic token refresh (or follows redirects).
      final current = await AuthService.readSession();
      final token = current?.accessToken;
      if (token == null ||
          token.isEmpty ||
          !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
        throw const BackendException(401, 'authentication_required');
      }
      final result = await requestSyntheticPaymentJson(
          method: method, path: path, body: body, token: token);
      if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
        throw const BackendException(401, 'authentication_required');
      }
      return {...result, '_viewerId': owner.userId};
    });
  }

  String get _path =>
      '/synthetic-clone/bookings/${Uri.encodeComponent(bookingId)}/payment-test';

  @override
  Future<Map<String, dynamic>> load() async {
    final status = await _request('GET', '/synthetic-clone/status', null);
    final cap = status['paymentTest'];
    final principals = status['principals'];
    if (status['runId'] != runId ||
        status['cleaned'] != false ||
        cap is! Map ||
        cap['runId'] != runId ||
        cap['enabled'] != true ||
        principals is! Map ||
        ![principals['renterId'], principals['ownerId']]
            .contains(status['_viewerId'])) {
      throw const FormatException('synthetic_payment_capability_invalid');
    }
    validateSyntheticPaymentMarker(cap['marker']);
    if (cap['methods'] is! List ||
        (cap['methods'] as List).join(',') != 'synthetic' ||
        cap['scenarios'] is! List ||
        (cap['scenarios'] as List).join(',') !=
            syntheticPaymentScenarios.join(',')) {
      throw const FormatException('synthetic_payment_selection_invalid');
    }
    final snapshot = validateSyntheticPaymentSnapshot(
        await _request(
            'GET', '$_path?runId=${Uri.encodeComponent(runId)}', null),
        runId,
        bookingId);
    return {
      ...snapshot,
      'isRenter': status['_viewerId'] == principals['renterId'],
      'scenarios': cap['scenarios']
    };
  }

  @override
  Future<void> command(Map<String, dynamic> body) async {
    validateSyntheticPaymentSnapshot(
        await _request('POST', '$_path/commands', body), runId, bookingId);
  }

  @override
  Future<void> cleanup() async {
    await load(); // Bind current run/booking before the clone-wide cleanup action.
    final response =
        await _request('DELETE', '/synthetic-clone/bookings', null);
    final status = await _request('GET', '/synthetic-clone/status', null);
    final cap = status['paymentTest'];
    if (response['cleanupVerified'] != true ||
        status['runId'] != runId ||
        status['cleaned'] != true ||
        status['bookings'] != 0 ||
        cap is! Map ||
        cap['runId'] != runId ||
        cap['enabled'] != false ||
        cap['states'] != 0 ||
        cap['commands'] != 0 ||
        cap['auditEvents'] != 0) {
      throw const FormatException('synthetic_payment_cleanup_invalid');
    }
    validateSyntheticPaymentMarker(cap['marker']);
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString('synthetic_clone_diagnostic_booking_id') == bookingId) {
      await prefs.remove('synthetic_clone_diagnostic_booking_id');
    }
  }
}
