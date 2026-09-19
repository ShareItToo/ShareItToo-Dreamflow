import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const explore = readFileSync(
  new URL('../../lib/screens/explore_screen.dart', import.meta.url),
  'utf8',
);
const wrapper = section(
  explore,
  'class _ExploreListingCard extends StatelessWidget',
  'class _ExploreListingCardContent extends StatelessWidget',
);
const content = section(
  explore,
  'class _ExploreListingCardContent extends StatelessWidget',
  'class _SquareTitleOnlyCard extends StatefulWidget',
);

test('explore listing wrapper cannot regain its unused verification getter', () => {
  assert.doesNotMatch(wrapper, /bool get _isVerified/);
});

test('grid and wrapper keep listing state delegation and text scaling', () => {
  assert.match(
    explore,
    /return _ExploreListingCard\(\s*item: item,\s*isFavorite: isFav,\s*onFavoriteToggle: \(\) =>\s*_toggleFavorite\(item\.id\),\s*distanceKm: _distanceFromUserKm\(item\),\s*rating: _usersById\[item\.ownerId\]\?\.avgRating/,
  );
  assert.match(
    wrapper,
    /textScaler: MediaQuery\.textScalerOf\(context\)\s*\.clamp\(minScaleFactor: 1\.0, maxScaleFactor: 1\.18\)/,
  );
  assert.match(
    wrapper,
    /child: _ExploreListingCardContent\(\s*item: item,\s*isFavorite: isFavorite,\s*onFavoriteToggle: onFavoriteToggle,\s*distanceKm: distanceKm,\s*rating: rating\)/,
  );
});

test('active content keeps verification badge and real rating display', () => {
  assert.match(
    content,
    /bool get _isVerified =>\s*item\.verificationStatus == 'approved' \|\|\s*item\.verificationStatus == 'verified'/,
  );
  assert.match(
    content,
    /color: _isVerified \? BrandColors\.success : Colors\.grey/,
  );
  assert.match(content, /final displayRating = listingRatingForDisplay\(rating\)/);
  assert.match(content, /RatingBadge\(rating: displayRating\)/);
});

test('active content keeps details long press and favorite actions', () => {
  assert.match(
    content,
    /ItemDetailsOverlay\.showFullPage\(context, item: item, fresh: true\)/,
  );
  assert.match(
    content,
    /onLongPress: \(\) => showListingOptionsDialog\(context,/,
  );
  assert.match(content, /contextType: ListingOptionsContext\.explore/);
  assert.match(content, /onWishlistChanged: onFavoriteToggle/);
  assert.match(content, /onTap: onFavoriteToggle/);
});
