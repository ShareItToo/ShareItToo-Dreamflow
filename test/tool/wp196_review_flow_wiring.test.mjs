import assert from 'node:assert/strict';
import fs from 'node:fs';

const screen = fs.readFileSync('lib/screens/message_thread_screen.dart', 'utf8');
const review = fs.readFileSync('lib/widgets/review_prompt_sheet.dart', 'utf8');
const itemDetails = fs.readFileSync('lib/widgets/item_details_overlay.dart', 'utf8');

assert.match(screen, /case _ChatState\.completed:[\s\S]*?ReviewPromptSheet\.show\(/u);
assert.match(screen, /sessionOwner:\s*reviewOwner\.context\.owner\.authOwner/u);
assert.doesNotMatch(screen, /Bewertung \(Demo\)/u);
assert.match(review, /getBookingReviewsForOwner/u);
assert.match(review, /createBookingReviewForOwner/u);
assert.match(
  review,
  /if \(sessionOwner != null[\s\S]*?isSessionOwnerDefinitelyCurrent\(sessionOwner\)[\s\S]*?showBlurBottomSheet/u,
);
assert.doesNotMatch(
  review,
  /createBookingReviewForOwner\([\s\S]*?if \(capturedOwner != null[\s\S]*?isSessionOwnerDefinitelyCurrent/u,
);

// The legacy express countdown is currently not reachable from any widget
// constructor. Its fallback must not be treated as a live mutation surface.
const expressReferences = itemDetails.match(/_ExpressCountdownSheet\s*\(/g) ?? [];
assert.equal(expressReferences.length, 0);
assert.doesNotMatch(itemDetails, /class _ExpressCountdownSheet/u);
assert.doesNotMatch(itemDetails, /class _ExpressFallbackSheet/u);
assert.doesNotMatch(itemDetails, /ExpressFallbackSheet/u);

console.log('WP196 review-flow wiring: PASS');
