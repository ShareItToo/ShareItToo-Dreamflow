import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/listing_display_truth.dart';
import 'package:lendify/widgets/rating_badge.dart';

class ListingCarouselCard extends StatelessWidget {
  final Item item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  final String? badgeText;
  final double? distanceKm;
  final double? rating;
  final int? rentals;
  const ListingCarouselCard({
    super.key,
    required this.item,
    required this.isFavorite,
    required this.onFavoriteToggle,
    this.badgeText,
    this.distanceKm,
    this.rating,
    this.rentals,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cs = theme.colorScheme;
    final l10n = context.watch<LocalizationController>();
    final displayRating = listingRatingForDisplay(rating);
    final derivedRentals = rentals ?? item.timesLent;
    final highlight = badgeText;
    final isVerified = item.verificationStatus == 'verified' ||
        item.verificationStatus == 'approved';
    final titleColor = isDark ? Colors.white : AppTheme.textPrimary(context);
    final metaColor = isDark
        ? Colors.white.withValues(alpha: 0.86)
        : AppTheme.textSecondary(context);
    final metaIconColor =
        isDark ? Colors.white70 : AppTheme.textSecondary(context);
    final priceColor = isDark ? Colors.white : AppTheme.textPrimary(context);
    final priceSuffixColor = isDark
        ? Colors.white.withValues(alpha: 0.80)
        : AppTheme.textSecondary(context);
    // Keep in lockstep with RatingBadge + on-image highlight chips.
    final tagFontSize = ((theme.textTheme.labelSmall?.fontSize) ?? 11) * 0.78;

    return Container(
      decoration: BoxDecoration(
        color: isDark
            ? BrandColors.glassSurface.withValues(alpha: 0.55)
            : AppTheme.surfacePrimary(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.glassStroke(context)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.28 : 0.10),
            blurRadius: isDark ? 18 : 14,
            offset: const Offset(0, 10),
          )
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Stack(fit: StackFit.expand, children: [
            AppImage(
              url: item.photos.isNotEmpty ? item.photos.first : '',
              fit: BoxFit.cover,
            ),
            // Bottom scrim for readability
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 72,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      BrandColors.imageScrim.withValues(alpha: 0.55)
                    ],
                  ),
                ),
              ),
            ),
            // Verified symbol only (top-left): green if verified, grey otherwise.
            Positioned(
              top: 10,
              left: 10,
              child: Icon(Icons.verified,
                  size: 18,
                  color: isVerified ? BrandColors.success : Colors.grey),
            ),
            if (highlight != null)
              Positioned(
                left: 10,
                bottom: 10,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                  decoration: BoxDecoration(
                    color: cs.primary.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(999),
                    border:
                        Border.all(color: Colors.white.withValues(alpha: 0.12)),
                  ),
                  child: Text(
                    highlight,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: tagFontSize),
                  ),
                ),
              ),
            Positioned(
              top: 10,
              right: 10,
              child: GestureDetector(
                onTap: onFavoriteToggle,
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.92),
                      shape: BoxShape.circle),
                  child: Icon(
                      isFavorite ? Icons.favorite : Icons.favorite_border,
                      size: 16,
                      color: isFavorite ? BrandColors.danger : Colors.black54),
                ),
              ),
            ),

            // Rating badge (bottom-right on image)
            if (displayRating != null)
              Positioned(
                right: 10,
                bottom: 10,
                child: RatingBadge(rating: displayRating),
              ),
          ]),
        ),
        Padding(
          // Keep this section ultra-compact so the card visually ends right under the price.
          padding: const EdgeInsets.fromLTRB(12, 7, 12, 5),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    fontSize: 15.5,
                    color: titleColor,
                  ),
                ),
                const SizedBox(height: 4),
                _TrustRow(
                  distanceKm: distanceKm,
                  listingCity: item.city,
                  rentals: derivedRentals,
                  textColor: metaColor,
                  iconColor: metaIconColor,
                ),
                const SizedBox(height: 6),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(
                    listingCustomerPriceText(
                      item.pricePerDay,
                      currency: item.currency,
                    ),
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: priceColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 1),
                    child: Text(
                      '/ ${l10n.t('Tag')}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: priceSuffixColor,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const Spacer(),
                ]),
              ]),
        ),
      ]),
    );
  }
}

class _TrustRow extends StatelessWidget {
  final double? distanceKm;
  final String listingCity;
  final int rentals;
  final Color textColor;
  final Color iconColor;
  const _TrustRow({
    required this.distanceKm,
    required this.listingCity,
    required this.rentals,
    required this.textColor,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final baseStyle = Theme.of(context).textTheme.labelSmall;
    final style = baseStyle?.copyWith(
      color: textColor,
      fontWeight: FontWeight.w500,
      fontSize: (baseStyle.fontSize ?? 11) * 0.95,
      letterSpacing: -0.05,
    );
    const iconSize = 12.0;

    final parts = <Widget>[
      Icon(Icons.place_outlined, size: iconSize, color: iconColor),
      const SizedBox(width: 3),
      Text(
          listingLocationLabel(
            distanceKm: distanceKm,
            listingCity: listingCity,
            unavailableLabel: l10n.t('Nicht verfügbar'),
          ),
          style: style),
      const SizedBox(width: 6),
      Icon(Icons.loop, size: iconSize, color: iconColor),
      const SizedBox(width: 3),
      Text('${rentals.clamp(0, 999)}',
          style: style, maxLines: 1, overflow: TextOverflow.ellipsis),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const NeverScrollableScrollPhysics(),
      child: Row(children: parts),
    );
  }
}
