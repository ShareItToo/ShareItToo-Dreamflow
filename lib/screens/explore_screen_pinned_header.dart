import 'dart:ui' as ui show ImageFilter;
import 'package:flutter/material.dart';

class PinnedCategoriesHeader extends SliverPersistentHeaderDelegate {
  final WidgetBuilder builder;
  final double textScale;
  PinnedCategoriesHeader({required this.builder, required this.textScale});

  // Thickness adjustments (~1 mm ≈ 6 dp) applied on top and bottom
  // Keep this very tight so the first feed title sits close to the category row.
  static const double _topGapAfterSeparator =
      16; // +12dp (~3mm) mehr Abstand von Icons oberhalb
  static const double _bottomPad = 0;

  double get _iconsHeight => 84 + ((textScale.clamp(1.0, 3.0) - 1) * 72);
  double get _totalHeight => _topGapAfterSeparator + _iconsHeight + _bottomPad;

  @override
  double get minExtent => _totalHeight;
  @override
  double get maxExtent => _totalHeight;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Stack(children: [
      // Paint the same global background as the app so content below is fully hidden
      Positioned.fill(child: _PinnedHeaderBackgroundReplica()),
      // Foreground content: icons + smooth gradient transition
      Column(
        mainAxisAlignment: MainAxisAlignment.start,
        mainAxisSize: MainAxisSize.max,
        children: [
          // Top gap (upper separator removed)
          const SizedBox(height: _topGapAfterSeparator),
          // Icons row provided by caller
          Material(
              color: Colors.transparent,
              child: SizedBox(height: _iconsHeight, child: builder(context))),
          const SizedBox(height: _bottomPad),
        ],
      ),
    ]);
  }

  @override
  bool shouldRebuild(covariant PinnedCategoriesHeader oldDelegate) =>
      oldDelegate.textScale != textScale;
}

class _PinnedHeaderBackgroundReplica extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ImageFiltered(
      imageFilter: ui.ImageFilter.blur(sigmaX: 36, sigmaY: 36),
      child: Image.asset('assets/images/fulllogo.jpg', fit: BoxFit.cover),
    );
  }
}
