export function v51DisabledTransportCode(candidate = {}) {
  if (candidate.ownerDeliversAtDropoffChosen === true) {
    return 'delivery_booking_not_enabled';
  }
  if (candidate.ownerPicksUpAtReturnChosen === true) {
    return 'pickup_booking_not_enabled';
  }
  if (candidate.expressRequested === true) {
    return 'express_booking_not_enabled';
  }
  return null;
}

export function v51ZeroTransportQuote() {
  return { deliveryFeeMinor: 0, pickupFeeMinor: 0 };
}
