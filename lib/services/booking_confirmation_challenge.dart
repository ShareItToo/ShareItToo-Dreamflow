/// Presentation validation only. The server remains authoritative for issuing
/// and verifying challenges, participants, appointments and photo evidence.
class BookingConfirmationChallenge {
  final String code;
  final String qrPayload;
  final DateTime expiresAt;

  const BookingConfirmationChallenge._(
      this.code, this.qrPayload, this.expiresAt);

  static BookingConfirmationChallenge? parse(
    Map<String, dynamic>? value, {
    required String bookingId,
    required String segment,
    required DateTime now,
    bool allowLocalDemo = false,
  }) {
    if (value == null || !const {'pickup', 'return'}.contains(segment)) {
      return null;
    }
    final role = segment == 'pickup' ? 'owner' : 'renter';
    final id = value['id'];
    final code = value['code'];
    final qr = value['qrPayload'];
    final issued = value['issuedAt'];
    final expiry = value['expiresAt'];
    if (value['bookingId'] != bookingId ||
        value['segment'] != segment ||
        value['presenterRole'] != role ||
        value['consumedAt'] != null ||
        value['replayed'] == true ||
        id is! String ||
        code is! String ||
        qr is! String ||
        issued is! String ||
        expiry is! String ||
        !RegExp(r'^\d{6}$').hasMatch(code)) {
      return null;
    }
    final issuedAt = DateTime.tryParse(issued);
    final expiresAt = DateTime.tryParse(expiry);
    if (issuedAt == null ||
        expiresAt == null ||
        !expiresAt.isAfter(issuedAt) ||
        !expiresAt.isAfter(now)) {
      return null;
    }
    final serverId = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(id);
    final serverQr = 'shareittoo:v3:$segment:$role:$id:$code:$bookingId';
    final localQr = 'shareittoo:v2:$segment:$role:$code:$bookingId';
    if (!(serverId && qr == serverQr) &&
        !(allowLocalDemo &&
            id == 'local-$bookingId-$segment-$role' &&
            qr == localQr)) {
      return null;
    }
    return BookingConfirmationChallenge._(code, qr, expiresAt);
  }
}
