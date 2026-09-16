import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPrivatePilotAccountState,
  assertPrivatePilotBooking,
  assertPrivatePilotCatalogEntry,
  assertPrivatePilotListing,
  assertPrivatePilotStoredListing,
  privatePilotCheckoutDocument,
  privatePilotOpenDecisions,
  privatePilotRequiredCheckoutDeclarations,
  PrivatePilotValidationError,
} from '../src/private_pilot_domain.js';
import {
  evaluateReturnTimeline,
  evaluateCancellation,
  cancellationAmounts,
  isBookingChatOpen,
  resolveReturnT0,
  shortNoticeGraceDeadline,
  splitAuthorizedBookingAmount,
} from '../src/private_pilot_return_domain.js';

test('T0 prefers mutually confirmed actual return, then changed return, then schedule', () => {
  const base = {
    scheduledReturnAt: '2026-09-01T10:00:00Z',
    mutuallyConfirmedChangedReturnAt: '2026-09-01T11:00:00Z',
    mutuallyConfirmedActualReturnAt: '2026-09-01T09:30:00Z',
  };
  assert.equal(resolveReturnT0(base).toISOString(), '2026-09-01T09:30:00.000Z');
  assert.equal(resolveReturnT0({
    ...base,
    mutuallyConfirmedActualReturnAt: null,
  }).toISOString(), '2026-09-01T11:00:00.000Z');
  assert.equal(resolveReturnT0({
    scheduledReturnAt: base.scheduledReturnAt,
  }).toISOString(), '2026-09-01T10:00:00.000Z');
});

function checkoutDeclarations() {
  return privatePilotRequiredCheckoutDeclarations.map((entry) => ({
    type: entry.type,
    exactWording: entry.wording,
    documentName: privatePilotCheckoutDocument.name,
    documentVersion: privatePilotCheckoutDocument.version,
    language: privatePilotCheckoutDocument.locale,
    clientBuild: '1.0.0+2026081510',
    quoteId: 'quote-1',
    quoteHash: 'a'.repeat(64),
    documentReferences: entry.documentReferences.map((reference) => ({
      ...reference,
    })),
    accepted: true,
    acceptedAt: '2026-08-14T12:00:00.000Z',
  }));
}

test('all six V4 questions have an explicit V5.1 successor and source', () => {
  assert.equal(privatePilotOpenDecisions.length, 6);
  assert.deepEqual(
    privatePilotOpenDecisions.map((entry) => entry.id),
    [
      'platform_contract_and_withdrawal_timing',
      'withdrawal_effect_on_private_rental',
      'cancellation_50_100_or_30_50',
      'marketplace_psp_mechanics',
      'missing_return_confirmation_window',
      'handover_photo_workflow',
    ],
  );
  for (const entry of privatePilotOpenDecisions) {
    assert.equal(entry.status, 'superseded_by_v51');
    assert.ok(entry.interimRule.length > 0);
    assert.ok(entry.updateAuthority.length > 0);
    assert.equal(typeof entry.blocksLiveActivation, 'boolean');
  }
});

test('private listing and booking guardrails reject bypasses', () => {
  assert.equal(assertPrivatePilotListing({
    privateStatusConfirmed: true,
    categoryId: 'cat8',
    subcategory: 'Bohrmaschinen',
    country: 'Deutschland',
    city: 'Berlin',
  }, { allowedRegions: ['berlin'] }), true);
  assert.throws(
    () => assertPrivatePilotListing({
      privateStatusConfirmed: true,
      categoryId: 'cat10',
      subcategory: 'Autos',
      country: 'Deutschland',
      city: 'Berlin',
    }, { allowedRegions: ['berlin'] }),
    (error) => error instanceof PrivatePilotValidationError
      && error.code === 'private_pilot_category_not_allowed',
  );
  assert.throws(
    () => assertPrivatePilotBooking({
      privateStatusConfirmed: true,
      ownerDeliversAtDropoffChosen: true,
    }),
    (error) => error.code === 'private_pilot_delivery_disabled',
  );
  assert.equal(assertPrivatePilotBooking({
    privateStatusConfirmed: true,
    legalDeclarations: checkoutDeclarations(),
  }), true);
  assert.throws(
    () => assertPrivatePilotBooking({
      privateStatusConfirmed: true,
      legalDeclarations: checkoutDeclarations().slice(0, -1),
    }),
    (error) => error.code ===
      'v52_exactly_two_declarations_required',
  );
});

test('private pilot allowlist binds exact subcategories, Germany and configured regions', () => {
  assert.deepEqual(assertPrivatePilotCatalogEntry({
    categoryId: 'cat3',
    subcategory: 'Kameras',
    country: 'DE',
    city: ' Berlin ',
  }, { allowedRegions: ['berlin'] }), {
    categoryId: 'cat3',
    regionCode: 'berlin',
  });
  for (const [override, code] of [
    [{ subcategory: 'Drohnen' }, 'private_pilot_subcategory_not_allowed'],
    [{ city: 'Hamburg' }, 'private_pilot_region_not_allowed'],
    [{ country: 'Frankreich' }, 'private_pilot_country_not_allowed'],
  ]) {
    assert.throws(
      () => assertPrivatePilotCatalogEntry({
        categoryId: 'cat3',
        subcategory: 'Kameras',
        country: 'Deutschland',
        city: 'Berlin',
        ...override,
      }, { allowedRegions: ['berlin'] }),
      (error) => error instanceof PrivatePilotValidationError && error.code === code,
    );
  }
});

test('stored account and listing eligibility is persistent and review-aware', () => {
  assert.equal(assertPrivatePilotAccountState({
    privateUseConfirmedAt: '2026-08-20T00:00:00Z',
    privateMarketplaceReviewStatus: 'clear',
  }), true);
  assert.equal(assertPrivatePilotStoredListing({
    categoryId: 'cat8',
    subcategory: 'Bohrmaschinen',
    country: 'Deutschland',
    city: 'Berlin',
    privateStatusConfirmedAt: '2026-08-20T00:00:00Z',
    pilotRegionCode: 'berlin',
    ownerPrivateUseConfirmedAt: '2026-08-20T00:00:00Z',
    ownerPrivateMarketplaceReviewStatus: 'clear',
  }, { allowedRegions: ['berlin'] }), true);
  assert.throws(
    () => assertPrivatePilotAccountState({
      privateUseConfirmedAt: '2026-08-20T00:00:00Z',
      privateMarketplaceReviewStatus: 'review_required',
    }),
    (error) => error.code === 'private_pilot_commercial_review_blocked',
  );
  assert.throws(
    () => assertPrivatePilotStoredListing({
      categoryId: 'cat8',
      subcategory: 'Bohrmaschinen',
      country: 'Deutschland',
      city: 'Berlin',
      privateStatusConfirmedAt: '2026-08-20T00:00:00Z',
      pilotRegionCode: 'hamburg',
      ownerPrivateUseConfirmedAt: '2026-08-20T00:00:00Z',
      ownerPrivateMarketplaceReviewStatus: 'clear',
    }, { allowedRegions: ['berlin'] }),
    (error) => error.code === 'private_pilot_listing_region_unbound',
  );
});

test('missing return confirmation is neutral and never creates needsReview', () => {
  const timeline = evaluateReturnTimeline({
    scheduledReturnAt: '2026-09-01T10:00:00Z',
    ownerConfirmed: true,
    renterConfirmed: false,
    now: '2026-09-03T09:00:00Z',
  });
  assert.equal(timeline.state, 'awaitingReturnConfirmation');
  assert.equal(timeline.t1, null);
  assert.equal(timeline.clarificationDeadline, '2026-09-06T10:00:00.000Z');
});

test('return timeline releases after the applicable window without a case', () => {
  const both = evaluateReturnTimeline({
    scheduledReturnAt: '2026-09-01T10:00:00Z',
    mutuallyConfirmedActualReturnAt: '2026-09-01T09:30:00Z',
    ownerConfirmed: true,
    renterConfirmed: true,
    now: '2026-09-03T09:31:00Z',
  });
  assert.equal(both.state, 'payoutEligible');
  assert.equal(both.payoutInstructionDueAt, '2026-09-03T09:30:00.000Z');

  const missing = evaluateReturnTimeline({
    scheduledReturnAt: '2026-09-01T10:00:00Z',
    ownerConfirmed: false,
    renterConfirmed: true,
    now: '2026-09-06T10:01:00Z',
  });
  assert.equal(missing.state, 'payoutEligible');
});

test('only a substantiated case enters needsReview and keeps chat open', () => {
  const timeline = evaluateReturnTimeline({
    scheduledReturnAt: '2026-09-01T10:00:00Z',
    ownerConfirmed: true,
    renterConfirmed: true,
    substantiatedCaseOpenedAt: '2026-09-02T08:00:00Z',
    now: '2026-09-02T09:00:00Z',
  });
  assert.equal(timeline.state, 'needsReview');
  assert.equal(timeline.responseDueAt, '2026-09-07T08:00:00.000Z');
  assert.equal(isBookingChatOpen({ returnState: timeline.state }), true);
  assert.equal(isBookingChatOpen({
    returnState: timeline.state,
    caseClosedAt: '2026-09-04T08:00:00Z',
  }), false);
});

test('missing confirmation does not extend direct chat beyond T0 plus 48 hours', () => {
  assert.equal(isBookingChatOpen({
    returnState: 'awaitingReturnConfirmation',
    now: '2026-09-03T10:00:00.001Z',
    reportDeadline: '2026-09-03T10:00:00.000Z',
    clarificationDeadline: '2026-09-06T10:00:00.000Z',
  }), false);
});

test('return timeline uses booking calendar days across daylight-saving changes', () => {
  const timeline = evaluateReturnTimeline({
    scheduledReturnAt: '2026-03-27T11:00:00.000Z',
    ownerConfirmed: true,
    renterConfirmed: true,
    substantiatedCaseOpenedAt: '2026-03-27T11:00:00.000Z',
    now: '2026-03-27T11:00:00.000Z',
    timezone: 'Europe/Berlin',
  });
  assert.equal(timeline.responseDueAt, '2026-04-01T10:00:00.000Z');
  assert.equal(timeline.nextStatusUpdateDueAt, '2026-04-03T10:00:00.000Z');
});

test('alleged damage never creates a charge or blocks undisputed rent', () => {
  const result = splitAuthorizedBookingAmount({
    authorizedBookingMinor: 11_000,
    contestedAuthorizedMinor: 2_000,
    allegedDamageMinor: 50_000,
  });
  assert.equal(result.undisputedReleasableMinor, 9_000);
  assert.equal(result.additionalChargeMinor, 0);

  const damageOnly = splitAuthorizedBookingAmount({
    authorizedBookingMinor: 11_000,
    allegedDamageMinor: 50_000,
  });
  assert.equal(damageOnly.undisputedReleasableMinor, 11_000);
});

test('short-notice cancellation grace ends exactly after 60 minutes or at start', () => {
  assert.equal(
    shortNoticeGraceDeadline({
      contractConfirmedAt: '2026-09-01T15:00:00Z',
      rentalStartAt: '2026-09-01T20:00:00Z',
    }).toISOString(),
    '2026-09-01T16:00:00.000Z',
  );
  assert.equal(
    shortNoticeGraceDeadline({
      contractConfirmedAt: '2026-09-01T15:00:00Z',
      rentalStartAt: '2026-09-01T15:30:00Z',
    }).toISOString(),
    '2026-09-01T15:30:00.000Z',
  );
  assert.equal(shortNoticeGraceDeadline({
    contractConfirmedAt: '2026-09-01T15:00:00Z',
    rentalStartAt: '2026-09-02T15:00:00Z',
  }), null);
});

test('V5.1 cancellation uses exact instants and cent-based proportional refund', () => {
  const outcome = evaluateCancellation({
    rentalStartAt: '2026-09-01T20:00:00Z',
    contractConfirmedAt: '2026-09-01T15:00:00Z',
    cancelAt: '2026-09-01T17:00:00Z',
    actor: 'renter',
  });
  assert.equal(outcome.refundBasisPoints, 5000);
  assert.deepEqual(cancellationAmounts({
    totalMinor: 11001,
    refundBasisPoints: outcome.refundBasisPoints,
  }), {
    totalMinor: 11001,
    refundBasisPoints: 5000,
    refundMinor: 5501,
    retainedMinor: 5500,
  });
  assert.equal(evaluateCancellation({
    rentalStartAt: '2026-09-01T20:00:00Z',
    cancelAt: '2026-09-02T10:00:00Z',
    actor: 'owner',
  }).refundBasisPoints, 10000);
});
