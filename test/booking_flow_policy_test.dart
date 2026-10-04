import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/utils/booking_flow_policy.dart';

void main() {
  test('handover requires accepted state owner confirmed time and no hold', () {
    expect(
      canStartHandover(
        requestStatus: 'accepted',
        viewerIsOwner: true,
        handoverTimeConfirmed: true,
        handoverActive: false,
        needsReview: false,
      ),
      isTrue,
    );
    expect(
      canStartHandover(
        requestStatus: 'accepted',
        viewerIsOwner: true,
        handoverTimeConfirmed: false,
        handoverActive: false,
        needsReview: false,
      ),
      isFalse,
    );
    expect(
      canStartHandover(
        requestStatus: 'accepted',
        viewerIsOwner: true,
        handoverTimeConfirmed: true,
        handoverActive: false,
        needsReview: true,
      ),
      isFalse,
    );
  });

  test('return requires renter and confirmed time but remains possible on hold',
      () {
    expect(
      canStartReturn(
        requestStatus: 'running',
        viewerIsOwner: false,
        returnTimeConfirmed: true,
        returnActive: false,
      ),
      isTrue,
    );
    expect(
      canStartReturn(
        requestStatus: 'running',
        viewerIsOwner: true,
        returnTimeConfirmed: true,
        returnActive: false,
      ),
      isFalse,
    );
    expect(
      canStartReturn(
        requestStatus: 'running',
        viewerIsOwner: false,
        returnTimeConfirmed: false,
        returnActive: false,
      ),
      isFalse,
    );
  });

  test('bound snapshot skips duplicate confirmation but blocks pending changes',
      () {
    expect(
      canStartHandover(
        requestStatus: 'accepted',
        viewerIsOwner: true,
        handoverTimeConfirmed: false,
        handoverActive: false,
        needsReview: false,
        hasBoundTimeSnapshot: true,
      ),
      isTrue,
    );
    expect(
      canStartHandover(
        requestStatus: 'accepted',
        viewerIsOwner: true,
        handoverTimeConfirmed: false,
        handoverActive: false,
        needsReview: false,
        hasBoundTimeSnapshot: true,
        timeOverridePending: true,
      ),
      isFalse,
    );
    expect(
      canStartReturn(
        requestStatus: 'running',
        viewerIsOwner: false,
        returnTimeConfirmed: false,
        returnActive: false,
        hasBoundTimeSnapshot: true,
      ),
      isTrue,
    );
  });
}
