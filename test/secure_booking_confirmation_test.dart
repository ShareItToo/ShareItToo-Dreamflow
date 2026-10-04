import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/handover_code.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final owner = buildTestUser('secure-owner', name: 'Owner');
  final renter = buildTestUser('secure-renter', name: 'Renter');
  final outsider = buildTestUser('secure-outsider', name: 'Outsider');
  final item = buildTestItem(id: 'secure-item', ownerId: owner.id);
  final request = buildTestRequest(
    id: 'secure-request',
    itemId: item.id,
    ownerId: owner.id,
    renterId: renter.id,
    status: 'accepted',
  );

  Future<void> useAccount(User user) async {
    await DataService.setCurrentUser(user);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'auth_session_v1',
      jsonEncode(<String, Object>{
        'userId': user.id,
        'email': user.email,
        'createdAt': '2026-08-25T04:00:00.000Z',
      }),
    );
  }

  Future<void> seed() async {
    SharedPreferences.setMockInitialValues({
      'users': jsonEncode([
        owner.toJson(),
        renter.toJson(),
        outsider.toJson(),
      ]),
      'items': jsonEncode([item.toJson()]),
      'rental_requests': jsonEncode([request.toJson()]),
      'currentUser': jsonEncode(owner.toJson()),
      'auth_session_v1': jsonEncode(<String, Object>{
        'userId': owner.id,
        'email': owner.email,
        'createdAt': '2026-08-25T04:00:00.000Z',
      }),
    });
  }

  setUp(seed);

  test('presenter challenge is bound to booking segment role and counterparty',
      () async {
    final challenge = await DataService.issueBookingConfirmationChallenge(
      requestId: request.id,
      segment: HandoverCodeService.segmentPickup,
    );

    expect(challenge, isNotNull);
    expect(challenge!['presenterRole'], HandoverCodeService.presenterOwner);
    expect(challenge['bookingId'], request.id);
    expect(challenge['code'], matches(RegExp(r'^\d{6}$')));
    expect(
      await DataService.issueBookingConfirmationChallenge(
        requestId: request.id,
        segment: HandoverCodeService.segmentReturn,
      ),
      isNull,
    );

    await useAccount(renter);
    expect(
      await DataService.verifyBookingConfirmationChallenge(
        requestId: request.id,
        segment: HandoverCodeService.segmentPickup,
        presenterRole: HandoverCodeService.presenterOwner,
        qrPayload: challenge['qrPayload'] as String,
      ),
      isTrue,
    );

    await useAccount(outsider);
    expect(
      await DataService.verifyBookingConfirmationChallenge(
        requestId: request.id,
        segment: HandoverCodeService.segmentPickup,
        presenterRole: HandoverCodeService.presenterOwner,
        code: challenge['code'] as String,
      ),
      isFalse,
    );
  });

  test('manual confirmation rejects wrong code and accepts current code',
      () async {
    final challenge = await DataService.issueBookingConfirmationChallenge(
      requestId: request.id,
      segment: HandoverCodeService.segmentPickup,
    );
    await useAccount(renter);

    expect(
      await DataService.verifyBookingConfirmationChallenge(
        requestId: request.id,
        segment: HandoverCodeService.segmentPickup,
        presenterRole: HandoverCodeService.presenterOwner,
        code: '000000',
      ),
      isFalse,
    );
    expect(
      await DataService.verifyBookingConfirmationChallenge(
        requestId: request.id,
        segment: HandoverCodeService.segmentPickup,
        presenterRole: HandoverCodeService.presenterOwner,
        code: challenge!['code'] as String,
      ),
      isTrue,
    );
  });
}
