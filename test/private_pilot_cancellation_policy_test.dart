import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/private_pilot_cancellation_policy.dart';

void main() {
  final start = DateTime.utc(2026, 8, 20, 15);

  test('at least 24 hours before start refunds the full total', () {
    final result = PrivatePilotCancellationPolicy.evaluate(
      rentalStartAt: start,
      cancelAt: DateTime.utc(2026, 8, 19, 15),
      actor: PrivatePilotCancellationActor.renter,
    );
    expect(result.refundBasisPoints, 10000);
    expect(result.refundMinor(11000), 11000);
  });

  test('less than 24 hours retains 50 percent after grace', () {
    final result = PrivatePilotCancellationPolicy.evaluate(
      rentalStartAt: start,
      contractConfirmedAt: DateTime.utc(2026, 8, 20, 8),
      cancelAt: DateTime.utc(2026, 8, 20, 10),
      actor: PrivatePilotCancellationActor.renter,
    );
    expect(result.refundBasisPoints, 5000);
    expect(result.refundMinor(11000), 5500);
    expect(result.retainedMinor(11000), 5500);
  });

  test('short-notice confirmation gives 60 minute grace at most to start', () {
    final confirmed = DateTime.utc(2026, 8, 20, 14, 30);
    final result = PrivatePilotCancellationPolicy.evaluate(
      rentalStartAt: start,
      contractConfirmedAt: confirmed,
      cancelAt: DateTime.utc(2026, 8, 20, 14, 50),
      actor: PrivatePilotCancellationActor.renter,
    );
    expect(result.refundBasisPoints, 10000);
    expect(result.freeCancellationUntil, start);
  });

  test('owner cancellation always refunds the full total', () {
    final result = PrivatePilotCancellationPolicy.evaluate(
      rentalStartAt: start,
      cancelAt: start.add(const Duration(hours: 1)),
      actor: PrivatePilotCancellationActor.owner,
    );
    expect(result.refundBasisPoints, 10000);
  });

  test('renter no-show has no provisional contractual refund', () {
    final result = PrivatePilotCancellationPolicy.evaluate(
      rentalStartAt: start,
      cancelAt: start.add(const Duration(minutes: 31)),
      actor: PrivatePilotCancellationActor.renter,
      noShow: true,
    );
    expect(result.refundBasisPoints, isNull);
    expect(result.refundMinor(11000), isNull);
    expect(result.calculationStatus, 'pending_actual_loss_assessment');
    expect(result.requiresActualLossAssessment, isTrue);
  });
}
