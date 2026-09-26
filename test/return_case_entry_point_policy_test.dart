import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/return_case_entry_point_policy.dart';

void main() {
  final t0 = DateTime.utc(2026, 9, 6, 12);
  final deadline = t0.add(const Duration(hours: 48));
  final contract = <String, dynamic>{
    'state': 'platformContractAccepted',
    'contractVersion': 'V5.2-2026-08-16',
  };

  bool eligible({
    String status = 'completed',
    bool simulationOnly = false,
    bool needsReview = false,
    Map<String, dynamic>? platformContract,
    DateTime? returnT0,
    DateTime? reportDeadline,
    DateTime? returnCaseOpenedAt,
    DateTime? now,
  }) =>
      ReturnCaseEntryPointPolicy.isEligible(
        bookingStatus: status,
        simulationOnly: simulationOnly,
        needsReview: needsReview,
        platformContract: platformContract ?? contract,
        returnT0: returnT0 ?? t0,
        reportDeadline: reportDeadline ?? deadline,
        returnCaseOpenedAt: returnCaseOpenedAt,
        now: now ?? t0.add(const Duration(hours: 1)),
      );

  test('eligible V5.2 completion exposes the entry point inside the window',
      () {
    expect(eligible(), isTrue);
  });

  test('T0 and the exact inclusive deadline remain eligible', () {
    expect(eligible(now: t0), isTrue);
    expect(eligible(now: deadline), isTrue);
  });

  test('before T0 and after the deadline fail closed', () {
    expect(
        eligible(now: t0.subtract(const Duration(microseconds: 1))), isFalse);
    expect(
      eligible(now: deadline.add(const Duration(microseconds: 1))),
      isFalse,
    );
  });

  test('non-completed, simulation and review states stay on Support', () {
    expect(eligible(status: 'running'), isFalse);
    expect(eligible(status: 'cancelled'), isFalse);
    expect(eligible(simulationOnly: true), isFalse);
    expect(eligible(needsReview: true), isFalse);
  });

  test('an existing return case cannot expose a duplicate entry point', () {
    expect(eligible(returnCaseOpenedAt: t0), isFalse);
  });

  test('missing, legacy or unaccepted contracts fail closed', () {
    expect(
      eligible(platformContract: const <String, dynamic>{}),
      isFalse,
    );
    expect(
      eligible(platformContract: const <String, dynamic>{
        'state': 'platformContractAccepted',
        'contractVersion': 'V5.1-2026-08-01',
      }),
      isFalse,
    );
    expect(
      eligible(platformContract: const <String, dynamic>{
        'state': 'draft',
        'contractVersion': 'V5.2-2026-08-16',
      }),
      isFalse,
    );
  });
}
