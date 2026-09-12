import 'dart:ui';
import 'package:flutter/foundation.dart' as f;
import 'package:flutter/material.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:share_plus/share_plus.dart';
import 'package:lendify/widgets/saved_cart_action_scope.dart';

/// Immersive image gallery overlay with blurred/dimmed background.
/// Opens above current content (no hard screen change) and supports
/// horizontal swiping, back, wishlist, and share actions.
class ImageGalleryOverlay extends StatefulWidget {
  final List<String> images;
  final int initialIndex;
  final bool Function() isWishlisted;
  final Future<void> Function() onWishlistPressed;
  final Future<void> Function()? onShare;
  final SavedCartActionScope? savedCartScope;
  final VoidCallback? onClose;

  const ImageGalleryOverlay({
    super.key,
    required this.images,
    required this.initialIndex,
    required this.isWishlisted,
    required this.onWishlistPressed,
    this.onShare,
    this.savedCartScope,
    this.onClose,
  });

  static Future<void> show(
    BuildContext context, {
    required List<String> images,
    required int initialIndex,
    required bool Function() isWishlisted,
    required Future<void> Function() onWishlistPressed,
    Future<void> Function()? onShare,
    SavedCartActionScope? savedCartScope,
  }) async {
    RoutePageBuilder pageBuilder(ValueChanged<void> complete) =>
        (ctx, anim, secAnim) {
          return ImageGalleryOverlay(
            images: images,
            initialIndex: initialIndex,
            isWishlisted: isWishlisted,
            onWishlistPressed: onWishlistPressed,
            onShare: onShare,
            savedCartScope: savedCartScope,
            onClose: () => complete(null),
          );
        };
    Widget transitionBuilder(BuildContext ctx, Animation<double> anim,
        Animation<double> secAnim, Widget child) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
      return FadeTransition(opacity: curved, child: child);
    }

    if (savedCartScope != null) {
      await savedCartScope.generalDialog<void>(
        context,
        pageBuilder: pageBuilder,
        barrierLabel: 'close',
        barrierColor: Colors.transparent,
        transitionDuration: const Duration(milliseconds: 200),
        transitionBuilder: transitionBuilder,
      );
      return;
    }
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'close',
      barrierColor: Colors.transparent,
      pageBuilder: pageBuilder(
          (_) => Navigator.of(context, rootNavigator: true).maybePop()),
      transitionBuilder: transitionBuilder,
      transitionDuration: const Duration(milliseconds: 200),
    );
  }

  @override
  State<ImageGalleryOverlay> createState() => _ImageGalleryOverlayState();
}

class _ImageGalleryOverlayState extends State<ImageGalleryOverlay> {
  late final PageController _pc = PageController(
      initialPage: widget.initialIndex
          .clamp(0, (widget.images.length - 1).clamp(0, 9999)));
  int _page = 0;
  // Tracks the bounds of the currently visible image card for outside-to-dismiss.
  final GlobalKey _imageKey = GlobalKey();

  void _close() {
    if (widget.onClose != null) {
      widget.onClose!();
    } else {
      Navigator.of(context).maybePop();
    }
  }

  Future<bool> _stillCurrent() async =>
      mounted &&
      (widget.savedCartScope == null ||
          await widget.savedCartScope!.isCurrent()) &&
      mounted;

  Future<void> _failure(String title) async {
    if (!await _stillCurrent() || !mounted) return;
    final scope = widget.savedCartScope;
    if (scope != null) {
      await scope.notice(context, icon: Icons.error_outline, title: title);
    } else {
      await AppPopup.toast(context, icon: Icons.error_outline, title: title);
    }
  }

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _page =
        widget.initialIndex.clamp(0, (widget.images.length - 1).clamp(0, 9999));
  }

  @override
  Widget build(BuildContext context) {
    double mmToLogicalPx(double mm) => mm * 160 / 25.4;
    final edgeMargin = mmToLogicalPx(2); // ~2mm margin around the image
    // Match the rounded corner style used on the "Verfügbarkeit prüfen" image/card
    // ItemDetailsOverlay main image uses 16px radius.
    final imageRadius = 16.0;

    return Material(
      type: MaterialType.transparency,
      child: Stack(children: [
        // Blurred, dimmed background
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _close,
            child: BackdropFilter(
              filter:
                  ImageFilter.blur(sigmaX: 30, sigmaY: 30), // stärkerer Blur
              child: Container(
                  color: Colors.black
                      .withValues(alpha: 0.60)), // stärker abdunkeln
            ),
          ),
        ),
        // Centered gallery content
        Positioned.fill(
          child: SafeArea(
            child: Stack(children: [
              // PageView with contain fit (no cropping), bounded inside margins
              // so taps outside the image area hit the blurred background and close.
              // We wrap the whole area in a Listener to detect taps outside the
              // rounded image card and dismiss the overlay immediately.
              Listener(
                behavior: HitTestBehavior.translucent,
                onPointerDown: (evt) {
                  final box = _imageKey.currentContext?.findRenderObject()
                      as RenderBox?;
                  if (box != null) {
                    final topLeft = box.localToGlobal(Offset.zero);
                    final size = box.size;
                    final rect = Rect.fromLTWH(
                        topLeft.dx, topLeft.dy, size.width, size.height);
                    if (!rect.contains(evt.position)) {
                      _close();
                    }
                  }
                },
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(edgeMargin),
                    child: PageView.builder(
                      controller: _pc,
                      onPageChanged: (i) => setState(() => _page = i),
                      itemCount:
                          widget.images.isNotEmpty ? widget.images.length : 1,
                      itemBuilder: (context, index) {
                        final url = widget.images.isNotEmpty
                            ? widget.images[index]
                            : '';
                        // Each page uses a PhysicalModel with rounded corners to force
                        // GPU-level clipping so the corners are visibly rounded on all platforms.
                        return PhysicalModel(
                          key: index == _page ? _imageKey : null,
                          elevation: 0,
                          color: Colors.transparent,
                          clipBehavior: Clip.antiAlias,
                          borderRadius: BorderRadius.circular(imageRadius),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(imageRadius),
                              border: Border.all(
                                  color: Colors.white.withValues(alpha: 0.08)),
                            ),
                            child: ClipRRect(
                              clipBehavior: Clip.antiAlias,
                              borderRadius: BorderRadius.circular(imageRadius),
                              child: Center(
                                child: AppImage(
                                  url: url,
                                  fit: BoxFit.contain,
                                  // Also pass the same radius to the image as an extra safety.
                                  borderRadius:
                                      BorderRadius.circular(imageRadius),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
              // Top controls
              Positioned(
                left: 8,
                right: 8,
                top: 6,
                child: Row(children: [
                  _TopIcon(
                    icon: Icons.arrow_back_rounded,
                    semanticLabel:
                        MaterialLocalizations.of(context).backButtonTooltip,
                    onTap: _close,
                  ),
                  const Spacer(),
                  _TopIcon(
                    icon: widget.isWishlisted()
                        ? Icons.favorite
                        : Icons.favorite_border,
                    semanticLabel: widget.isWishlisted()
                        ? 'Aus Gemerkt entfernen'
                        : 'Unter Gemerkt speichern',
                    iconSize: 20, // Herz bewusst etwas kleiner als Teilen-Icon
                    onTap: () async {
                      try {
                        if (!await _stillCurrent()) return;
                        await widget.onWishlistPressed();
                        if (!await _stillCurrent()) return;
                        setState(() {}); // reflect updated status
                      } catch (e) {
                        f.debugPrint(
                            '[gallery] wishlist failed (${e.runtimeType})');
                        await _failure('Fehler beim Aktualisieren');
                      }
                    },
                  ),
                  const SizedBox(width: 8),
                  _TopIcon(
                    icon: (Theme.of(context).platform == TargetPlatform.iOS ||
                            Theme.of(context).platform == TargetPlatform.macOS)
                        ? Icons.ios_share_rounded
                        : Icons.share_rounded, // Android-typisches Teilen-Icon
                    semanticLabel: 'Teilen',
                    onTap: () async {
                      try {
                        if (!await _stillCurrent()) return;
                        if (widget.onShare != null) {
                          await widget.onShare!();
                        } else {
                          // Native Share Sheet öffnen (WhatsApp, Messenger, etc.)
                          final currentUrl = (widget.images.isNotEmpty &&
                                  _page < widget.images.length)
                              ? widget.images[_page]
                              : null;
                          final text = currentUrl == null
                              ? 'Schau dir dieses Angebot an.'
                              : 'Schau dir dieses Angebot an:\n$currentUrl';
                          await SharePlus.instance
                              .share(ShareParams(text: text));
                        }
                      } catch (e) {
                        f.debugPrint(
                            '[share] failed in gallery (${e.runtimeType})');
                        await _failure('Teilen fehlgeschlagen');
                      }
                    },
                  ),
                ]),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _TopIcon extends StatelessWidget {
  final IconData icon;
  final String semanticLabel;
  final VoidCallback onTap;
  final double iconSize;
  const _TopIcon(
      {required this.icon,
      required this.semanticLabel,
      required this.onTap,
      this.iconSize = 24});
  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.28),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.18))),
          child: Icon(icon,
              size: iconSize, color: Colors.white.withValues(alpha: 0.95)),
        ),
      ),
    );
  }
}
