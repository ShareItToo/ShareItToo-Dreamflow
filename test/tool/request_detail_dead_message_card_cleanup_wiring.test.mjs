import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const requestDetail = readFileSync(
  new URL('../../lib/screens/request_detail_screen.dart', import.meta.url),
  'utf8',
);

test('request detail cannot regain the dead message card', () => {
  assert.doesNotMatch(requestDetail, /\b_MessageCard\b/);
});

test('request detail still loads the request item and renter', () => {
  assert.match(
    requestDetail,
    /DataService\.getRentalRequestById\(widget\.requestId\)/,
  );
  assert.match(requestDetail, /DataService\.getItemById\(req\.itemId\)/);
  assert.match(requestDetail, /DataService\.getUserById\(req\.renterId\)/);
});

test('request detail cannot regain disabled express UI or actions', () => {
  assert.doesNotMatch(requestDetail, /updateRentalRequestExpress/u);
  assert.doesNotMatch(requestDetail, /_ExpressOwnerBanner/u);
  assert.doesNotMatch(requestDetail, /_ExpressAcceptedInfo/u);
  assert.doesNotMatch(requestDetail, /expressRequested|expressStatus|expressFee/u);
});

test('owner acceptance and decline status transitions remain wired', () => {
  assert.match(requestDetail, /showPrivatePilotOwnerAcceptanceDialog\(/);
  assert.match(
    requestDetail,
    /commitPrivatePilotOwnerAcceptance\([\s\S]*?request: req,[\s\S]*?legalDeclarations: declarations[\s\S]*?if \(!accepted\) return;/,
  );
  assert.match(
    requestDetail,
    /DataService\.updateRentalRequestStatus\(\s*requestId: req\.id,\s*status: 'declined'\s*\)/,
  );
});

test('request cards and renter profile navigation remain active', () => {
  assert.match(
    requestDetail,
    /_ItemSummaryCard\(\s*item: item,\s*request: req,/,
  );
  assert.match(requestDetail, /_RenterCard\(user: renter\)/);
  assert.match(requestDetail, /_DatesCard\(request: req\)/);
  assert.match(
    requestDetail,
    /_PriceCard\(\s+quote: displayedQuote,\s+isBindingServerQuote: serverQuote != null/u,
  );
  assert.match(
    requestDetail,
    /builder: \(_\) => _PublicProfileQuickView\(\s*user: user, title: 'Profil des Mieters'\)/,
  );
  assert.match(
    requestDetail,
    /class _PublicProfileQuickView extends StatelessWidget/,
  );
});
