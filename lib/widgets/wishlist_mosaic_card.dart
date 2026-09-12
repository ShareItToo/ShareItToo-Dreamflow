import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_image.dart';

/// A modern wishlist card showing a 2x2 mosaic of recent item photos and
/// a clean text section with title, optional subtitle and item count.
/// Inspired by Airbnb's wishlist tiles; styled for SIT.
class WishlistMosaicCard extends StatelessWidget {
  final String id;
  final String title;
  final String? subtitle;
  final int count;
  final List<String> photoUrls; // Most recent photos; up to 4 are shown
  final VoidCallback? onTap;

  const WishlistMosaicCard(
      {super.key,
      required this.id,
      required this.title,
      this.subtitle,
      required this.count,
      required this.photoUrls,
      this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final isEmpty = count == 0;
    final largeText = MediaQuery.textScalerOf(context).scale(1) >= 1.6;
    final cardBg = isDark
        ? cs.surface.withValues(alpha: isEmpty ? 0.45 : 0.72)
        : AppTheme.surfaceSecondary(context);
    final border = isDark
        ? cs.onSurface.withValues(alpha: isEmpty ? 0.05 : 0.06)
        : cs.onSurface.withValues(alpha: isEmpty ? 0.16 : 0.12);
    // Make wishlist titles slightly smaller per request while keeping strong weight
    final titleStyle = theme.textTheme.titleSmall?.copyWith(
      fontWeight: FontWeight.w700,
      color: isDark ? cs.primary : AppTheme.textPrimary(context),
    );
    final metaStyle = theme.textTheme.labelSmall?.copyWith(
      color: isDark
          ? cs.onSurface.withValues(alpha: 0.55)
          : AppTheme.textBody(context),
    );

    Widget content =
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _Mosaic(urls: photoUrls, empty: isEmpty, totalCount: count),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 2),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              maxLines: largeText ? 2 : 1,
              overflow: TextOverflow.ellipsis,
              style: titleStyle),
          const SizedBox(height: 2),
          Text(
            isEmpty ? 'Noch leer' : '$count Artikel',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: metaStyle,
          ),
        ]),
      ),
    ]);

    // No splash effects; use InkWell disabled splash via Theme override
    return MouseRegion(
      cursor:
          onTap != null ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: border),
            boxShadow: isEmpty
                ? null
                : [
                    BoxShadow(
                      color: isDark
                          ? Colors.black.withValues(alpha: 0.12)
                          : Colors.black.withValues(alpha: 0.08),
                      blurRadius: isDark ? 8 : 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
          ),
          clipBehavior: Clip.antiAlias,
          child: content,
        ),
      ),
    );
  }
}

class _Mosaic extends StatelessWidget {
  final List<String> urls;
  final bool empty;
  final int totalCount;
  const _Mosaic(
      {required this.urls, required this.empty, required this.totalCount});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final radius = 18.0;

    if (empty) {
      // Compact calm placeholder with heart icon
      return AspectRatio(
        aspectRatio: 1.18, // Slightly more compact for empty cards
        child: Container(
          decoration: BoxDecoration(
            color: isDark
                ? cs.onSurface.withValues(alpha: 0.035)
                : AppTheme.surfaceMuted(context),
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(radius),
              topRight: Radius.circular(radius),
            ),
          ),
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(
                Icons.favorite_border_rounded,
                color: isDark
                    ? cs.onSurface.withValues(alpha: 0.2)
                    : AppTheme.textBody(context),
                size: 20,
              ),
              const SizedBox(height: 5),
              Text(
                'Noch keine Artikel',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: isDark
                          ? cs.onSurface.withValues(alpha: 0.35)
                          : AppTheme.textPrimary(context),
                      fontSize: 10,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                'Tippe auf ♡ bei Entdecken',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: isDark
                          ? cs.onSurface.withValues(alpha: 0.28)
                          : AppTheme.textBody(context),
                      fontSize: 9,
                    ),
              ),
            ]),
          ),
        ),
      );
    }

    final list = urls.where((e) => e.trim().isNotEmpty).toList(growable: false);
    final int slots = totalCount.clamp(1, 3);
    final photos = list.take(slots).toList(growable: false);
    final int hiddenCount = totalCount > slots ? totalCount - slots : 0;

    return AspectRatio(
      aspectRatio: 1.18,
      child: ClipRRect(
        borderRadius: BorderRadius.only(
            topLeft: Radius.circular(radius),
            topRight: Radius.circular(radius)),
        child: DecoratedBox(
          decoration:
              BoxDecoration(color: cs.onSurface.withValues(alpha: 0.06)),
          child: Builder(builder: (context) {
            final count = slots;
            if (count == 0) {
              // Fallback if we somehow have a non-empty list without valid images
              return Padding(
                padding: const EdgeInsets.all(10),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: cs.onSurface.withValues(alpha: 0.10),
                  ),
                ),
              );
            }

            final gap = count == 1 ? 0.0 : 4.0;
            final padding =
                count == 1 ? EdgeInsets.zero : const EdgeInsets.all(4);

            Widget tile(String? url, {bool showExtra = false}) {
              final borderRadius = BorderRadius.circular(count == 1 ? 18 : 12);
              Widget image = ClipRRect(
                borderRadius: borderRadius,
                child: Stack(fit: StackFit.expand, children: [
                  if (url != null && url.isNotEmpty)
                    AppImage(url: url, fit: BoxFit.cover)
                  else
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                            colors: [
                              cs.onSurface.withValues(alpha: 0.12),
                              cs.onSurface.withValues(alpha: 0.08)
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight),
                      ),
                      alignment: Alignment.center,
                      child: Icon(Icons.inventory_2_outlined,
                          color: Colors.white.withValues(alpha: 0.55),
                          size: 24),
                    ),
                  if (showExtra && hiddenCount > 0)
                    Container(
                      color: Colors.black.withValues(alpha: 0.45),
                      child: Center(
                        child: Text(
                          '+$hiddenCount',
                          style: Theme.of(context)
                              .textTheme
                              .labelMedium
                              ?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                ]),
              );
              return image;
            }

            return Padding(
              padding: padding,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (int i = 0; i < count; i++) ...[
                    Expanded(
                        child: tile(i < photos.length ? photos[i] : null,
                            showExtra: i == count - 1 && hiddenCount > 0)),
                    if (i < count - 1) SizedBox(width: gap),
                  ],
                ],
              ),
            );
          }),
        ),
      ),
    );
  }
}
