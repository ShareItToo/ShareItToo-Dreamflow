import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/widgets/app_image.dart';

class SeeAllScreen extends StatelessWidget {
  final String title;
  final List<Item> items;
  const SeeAllScreen({super.key, required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final isTablet = width >= 600 && width < 900;
    final isDesktop = width >= 900;
    final cols = isDesktop ? 5 : (isTablet ? 4 : 3);

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        toolbarHeight: 44, // ~3mm thinner than default on most phones
        centerTitle: true,
        title: Text(title,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppTheme.textPrimary(context))),
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        flexibleSpace: ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
            child: Container(
                color: isDark
                    ? Colors.black.withValues(alpha: 0.18)
                    : AppTheme.surfacePrimary(context).withValues(alpha: 0.92)),
          ),
        ),
      ),
      body: items.isEmpty
          ? const _EmptyState()
          : Padding(
              padding: const EdgeInsets.all(16),
              child: GridView.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: cols,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 1),
                itemCount: items.length,
                itemBuilder: (context, index) =>
                    _SquareCard(item: items[index]),
              ),
            ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.inbox_outlined,
          size: 56, color: Colors.white.withValues(alpha: 0.6)),
      const SizedBox(height: 12),
      Text('Keine Einträge',
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: AppTheme.textSecondary(context))),
    ]));
  }
}

class _SquareCard extends StatelessWidget {
  final Item item;
  const _SquareCard({required this.item});
  bool get _isVerified =>
      item.verificationStatus == 'approved' ||
      item.verificationStatus == 'verified';
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => ItemDetailsOverlay.showFullPage(context, item: item),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(children: [
          Positioned.fill(
              child: AppImage(
                  url: item.photos.isNotEmpty ? item.photos.first : '',
                  fit: BoxFit.cover)),
          Positioned.fill(
              child: DecoratedBox(
                  decoration: BoxDecoration(
                      border: Border.all(color: AppTheme.glassStroke(context)),
                      borderRadius: BorderRadius.circular(16)))),
          Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                      Colors.black.withValues(alpha: 0.0),
                      Colors.black.withValues(alpha: 0.55)
                    ])),
                child: Row(children: [
                  Expanded(
                      child: Text(item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(
                                  color: AppTheme.textPrimary(context),
                                  fontWeight: FontWeight.w700))),
                ]),
              )),
          Positioned(
              top: 8,
              left: 8,
              child: _isVerified
                  ? const Icon(Icons.verified,
                      size: 16, color: Color(0xFF22C55E))
                  : Icon(Icons.verified_outlined,
                      size: 16, color: AppTheme.textSecondary(context))),
        ]),
      ),
    );
  }
}
