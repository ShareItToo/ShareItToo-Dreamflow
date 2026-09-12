import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const requestDetail = readFileSync(
  new URL('../../lib/screens/request_detail_screen.dart', import.meta.url),
  'utf8',
);
const dialog = readFileSync(
  new URL(
    '../../lib/widgets/private_pilot_owner_acceptance_dialog.dart',
    import.meta.url,
  ),
  'utf8',
);
const pricing = readFileSync(
  new URL('../../lib/services/private_pilot_pricing.dart', import.meta.url),
  'utf8',
);

test('owner acceptance reconstructs the strict immutable request snapshot', () => {
  assert.match(pricing, /PrivatePilotQuote\.fromRentalRequestSnapshot/u);
  for (const field of [
    'quotedQuoteVersion',
    'quotedDays',
    'quotedPricePerDayMinor',
    'quotedBaseRentalMinor',
    'quotedDiscountPercent',
    'quotedDiscountId',
    'quotedDiscountLabel',
    'quotedDiscountFundingSource',
    'quotedDiscountThresholdDays',
    'quotedDiscountMinor',
    'quotedRentalSubtotalMinor',
    'quotedPlatformFeeMinor',
    'quotedTotalMinor',
    'quotedOwnerPayoutMinor',
    'quotedCurrency',
  ]) {
    assert.match(pricing, new RegExp(`request\\.${field}`, 'u'));
  }
  assert.match(
    pricing,
    /request\.quotedOwnerPayoutMinor != quote\.rentalSubtotalMinor/u,
  );
});

test('remote owner acceptance is disabled when the server snapshot is invalid', () => {
  assert.match(
    requestDetail,
    /usesRemoteBackend &&[\s\S]*?simulationOnly != true &&[\s\S]*?serverQuote == null[\s\S]*?Annahme gesperrt/u,
  );
  assert.match(
    requestDetail,
    /onAccept: displayedQuote == null \|\| !deadlineValid\s+\? null/u,
  );
  assert.match(
    requestDetail,
    /Kein verbindlicher Preis verfügbar\. Die Annahme bleibt gesperrt\./u,
  );
});

test('local fallback is visibly nonbinding and isolated from the remote branch', () => {
  assert.match(
    requestDetail,
    /serverQuote \?\?[\s\S]*?usesRemoteBackend[\s\S]*?PrivatePilotPricing\.quoteForItem/u,
  );
  assert.match(requestDetail, /Lokaler Testpreis · kein Echtgeld/u);
  assert.match(dialog, /Lokaler Testpreis · kein Echtgeld/u);
});

test('owner sees exact rent, renter fee, renter total and intended payout', () => {
  for (const label of [
    'Preisaufschlüsselung',
    'Privater Mietpreis vor Rabatt',
    'Privater Mietpreis',
    'SIT-Plattformbeitrag des Mieters',
    'Gesamtpreis des Mieters',
    'Deine vorgesehene Auszahlung',
  ]) {
    assert.match(requestDetail, new RegExp(label, 'u'));
  }
  assert.match(dialog, /displayedQuote\.rentalSubtotalMinor/u);
  assert.match(dialog, /displayedQuote\.platformFeeMinor/u);
  assert.match(dialog, /displayedQuote\.totalMinor/u);
  assert.match(dialog, /displayedQuote\.discountLabel/u);
  assert.match(requestDetail, /price\.discountLabel/u);
});

test('acceptance dialog and backend transition receive the same guarded quote flow', () => {
  assert.match(
    requestDetail,
    /showPrivatePilotOwnerAcceptanceDialog\([\s\S]*?quote: displayedQuote,[\s\S]*?isBindingServerQuote: serverQuote != null/u,
  );
  assert.match(
    requestDetail,
    /if \(declarations == null\) return;[\s\S]*?commitPrivatePilotOwnerAcceptance\([\s\S]*?legalDeclarations: declarations/u,
  );
  assert.match(
    dialog,
    /commitPrivatePilotOwnerAcceptance\([\s\S]*?updateRentalRequestStatus\([\s\S]*?status: 'accepted'/u,
  );
  assert.match(dialog, /PrivatePilotConfig\.ownerAcceptanceDeclaration/u);
  assert.match(
    dialog,
    /PrivatePilotQuote\.fromRentalRequestSnapshot\(request\)/u,
  );
  assert.match(
    dialog,
    /onPressed: _confirmed && acceptanceAllowed/u,
  );
  assert.match(
    dialog,
    /onChanged: acceptanceAllowed\s+\? \(value\)/u,
  );
  assert.match(dialog, /Preisprüfung fehlgeschlagen/u);
});

test('remote owner acceptance is bound to the server 30-minute deadline', () => {
  const model = readFileSync(
    new URL('../../lib/models/rental_request.dart', import.meta.url),
    'utf8',
  );
  const checkout = readFileSync(
    new URL('../../lib/screens/private_pilot_checkout_screen.dart', import.meta.url),
    'utf8',
  );
  const dataService = readFileSync(
    new URL('../../lib/services/data_service.dart', import.meta.url),
    'utf8',
  );
  const backend = readFileSync(
    new URL('../../backend/src/booking_workflow.js', import.meta.url),
    'utf8',
  );

  assert.match(model, /final DateTime\? bindingExpiresAt/u);
  assert.match(model, /bindingExpiresAt: _parseDt\(json\['bindingExpiresAt'\]\)/u);
  assert.match(model, /'bindingExpiresAt': bindingExpiresAt\?\.toIso8601String\(\)/u);
  assert.match(
    checkout,
    /bindingExpiresAt: simulationOnly \? null : _bindingDeadline/u,
  );
  assert.match(dataService, /bindingExpiresAt: req\.bindingExpiresAt/u);
  assert.match(
    requestDetail,
    /bindingDeadline != null && bindingDeadline\.isAfter\(DateTime\.now\(\)\)/u,
  );
  assert.match(
    requestDetail,
    /onAccept: displayedQuote == null \|\| !deadlineValid\s+\? null/u,
  );
  assert.match(dialog, /final acceptanceAllowed = displayedQuote != null && deadlineValid/u);
  assert.match(
    dialog,
    /widget\.bindingDeadline == null \|\|[\s\S]*?!widget\.bindingDeadline!\.isAfter\(DateTime\.now\(\)\)/u,
  );
  assert.match(backend, /throw new BookingWorkflowError\(409, 'booking_request_expired'\)/u);
});

test('an open request detail view rebuilds exactly when the binding deadline expires', () => {
  assert.match(
    requestDetail,
    /_bindingDeadlinePending\(RentalRequest req, DateTime now\)[\s\S]*?BackendConfig\.enabled[\s\S]*?!QaRuntimeService\.isEnabled[\s\S]*?req\.status\.toLowerCase\(\)\.trim\(\) == 'pending'[\s\S]*?deadline\.isAfter\(now\)/u,
  );
  assert.match(
    requestDetail,
    /_scheduleAcceptanceDeadlineRefresh\(\)[\s\S]*?_bindingDeadlinePending\(req, now\)[\s\S]*?_acceptanceDeadlineTimer = Timer\(deadline\.difference\(now\)[\s\S]*?setState\(\(\) \{\}\)/u,
  );
  assert.doesNotMatch(requestDetail, /Timer\.periodic/u);
  assert.match(
    requestDetail,
    /final deadlineValid = req\?\.simulationOnly == true \|\|[\s\S]*?!usesRemoteBackend \|\|[\s\S]*?bindingDeadline\.isAfter\(DateTime\.now\(\)\)/u,
  );
  assert.match(
    requestDetail,
    /onAccept: displayedQuote == null \|\| !deadlineValid\s+\? null/u,
  );
});

test('every alternative owner-acceptance surface reaches the guarded dialog', () => {
  for (const relative of [
    '../../lib/screens/ongoing_owner_detail_screen.dart',
    '../../lib/screens/owner_requests_screen.dart',
    '../../lib/screens/message_thread_screen.dart',
  ]) {
    const caller = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(caller, /showPrivatePilotOwnerAcceptanceDialog\(/u);
    assert.match(caller, /commitPrivatePilotOwnerAcceptance\(/u);
    assert.match(caller, /if \(!accepted\) return;/u);
  }
});

test('an acceptance race at the server deadline becomes a centered SIT message', () => {
  assert.match(dialog, /on BackendException catch \(error\)/u);
  assert.match(
    dialog,
    /if \(error\.code != 'booking_request_expired'\) rethrow;/u,
  );
  assert.match(dialog, /if \(!context\.mounted\) return false;/u);
  assert.match(
    dialog,
    /AppPopup\.info\([\s\S]*?title: 'Annahmefrist abgelaufen'/u,
  );
  assert.match(dialog, /Diese Anfrage kann nicht mehr angenommen werden/u);
  assert.match(dialog, /Bitte lade die Ansicht neu/u);
});

test('an already-open acceptance dialog expires itself and clears confirmation', () => {
  assert.match(dialog, /class _OwnerAcceptanceDialog extends StatefulWidget/u);
  assert.match(
    dialog,
    /_deadlineTimer = Timer\(remaining,[\s\S]*?setState\(\(\) => _confirmed = false\)/u,
  );
  assert.match(
    dialog,
    /void dispose\(\)[\s\S]*?_deadlineTimer\?\.cancel\(\)[\s\S]*?super\.dispose\(\)/u,
  );
  assert.match(
    dialog,
    /bool get _deadlineValid[\s\S]*?bindingDeadline!\.isAfter\(DateTime\.now\(\)\)/u,
  );
  assert.match(
    dialog,
    /value: _confirmed,[\s\S]*?onChanged: acceptanceAllowed[\s\S]*?onPressed: _confirmed && acceptanceAllowed/u,
  );
});

test('the owner request overview refreshes exactly at the next server deadline', () => {
  const ownerRequests = readFileSync(
    new URL('../../lib/screens/owner_requests_screen.dart', import.meta.url),
    'utf8',
  );
  assert.match(ownerRequests, /Timer\? _acceptanceDeadlineTimer/u);
  assert.match(
    ownerRequests,
    /void _scheduleAcceptanceDeadlineRefresh\(\)[\s\S]*?!BackendConfig\.enabled \|\| QaRuntimeService\.isEnabled[\s\S]*?entry\.r\.bindingExpiresAt[\s\S]*?_acceptanceDeadlineTimer = Timer\(nextDeadline\.difference\(now\)[\s\S]*?setState\(\(\) \{\}\)[\s\S]*?_scheduleAcceptanceDeadlineRefresh\(\)/u,
  );
  assert.match(
    ownerRequests,
    /void dispose\(\)[\s\S]*?_acceptanceDeadlineTimer\?\.cancel\(\)/u,
  );
  assert.match(
    ownerRequests,
    /bool _ownerAcceptanceDeadlineValid\(_OwnerEntry entry\)[\s\S]*?deadline != null && deadline\.isAfter\(DateTime\.now\(\)\)/u,
  );
  assert.match(ownerRequests, /Annahmefrist abgelaufen/u);
  assert.match(ownerRequests, /Annahme gesperrt/u);
});

test('the open owner detail disables acceptance exactly at the server deadline', () => {
  const ownerDetail = readFileSync(
    new URL('../../lib/screens/ongoing_owner_detail_screen.dart', import.meta.url),
    'utf8',
  );
  assert.match(ownerDetail, /Timer\? _acceptanceDeadlineTimer/u);
  assert.match(
    ownerDetail,
    /void _scheduleAcceptanceDeadlineRefresh\(RentalRequest request\)[\s\S]*?!BackendConfig\.enabled[\s\S]*?QaRuntimeService\.isEnabled[\s\S]*?request\.bindingExpiresAt[\s\S]*?_acceptanceDeadlineTimer = Timer\(remaining,[\s\S]*?setState\(\(\) \{\}\)/u,
  );
  assert.match(
    ownerDetail,
    /void dispose\(\)[\s\S]*?_acceptanceDeadlineTimer\?\.cancel\(\)/u,
  );
  assert.match(
    ownerDetail,
    /final acceptanceDeadlineValid = _ownerAcceptanceDeadlineValid\(req\)/u,
  );
  assert.match(
    ownerDetail,
    /onPressed: acceptanceDeadlineValid[\s\S]*?showPrivatePilotOwnerAcceptanceDialog/u,
  );
  assert.match(ownerDetail, /Annahmefrist abgelaufen/u);
  assert.match(ownerDetail, /Die verbindliche Annahmefrist fehlt/u);
  assert.match(ownerDetail, /commitPrivatePilotOwnerAcceptance/u);
});
