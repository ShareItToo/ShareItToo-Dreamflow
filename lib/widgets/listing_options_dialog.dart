import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/screens/report_user_screen.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/listing_feedback_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:lendify/widgets/wishlist_selection_sheet.dart';
import 'package:lendify/widgets/saved_cart_action_scope.dart';
import 'package:share_plus/share_plus.dart';

enum ListingOptionsContext { explore, wishlist }

Future<void> showListingOptionsDialog(
  BuildContext context, {
  required Item item,
  required ListingOptionsContext contextType,
  VoidCallback? onWishlistChanged,
  VoidCallback? onVisibilityChanged,
  SavedCartActionScope? savedCartScope,
}) async {
  if (savedCartScope != null) {
    if (contextType != ListingOptionsContext.wishlist) {
      throw ArgumentError(
          'Saved-cart ownership requires the wishlist context.');
    }
    await _showOwnedWishlistOptions(context,
        item: item,
        scope: savedCartScope,
        onWishlistChanged: onWishlistChanged);
    return;
  }
  final List<_ListingOption> options;
  try {
    options = await _buildOptions(context,
        item: item,
        contextType: contextType,
        onWishlistChanged: onWishlistChanged,
        onVisibilityChanged: onVisibilityChanged);
  } catch (error) {
    if (!context.mounted) return;
    await AppPopup.toast(
      context,
      icon: Icons.error_outline,
      title: 'Gemerkt-Status konnte nicht geladen werden',
      message: 'Es wurde nichts verändert.',
    );
    return;
  }
  if (!context.mounted) return;

  await showGeneralDialog<void>(
    context: context,
    barrierLabel: 'Anzeigenoptionen',
    barrierDismissible: true,
    barrierColor: Colors.black.withValues(alpha: 0.28),
    pageBuilder: (context, _, __) => const SizedBox.shrink(),
    transitionDuration: const Duration(milliseconds: 170),
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      final curved =
          CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
      return FadeTransition(
        opacity: curved,
        child: Stack(
          children: [
            Positioned.fill(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                child: Container(color: Colors.black.withValues(alpha: 0.08)),
              ),
            ),
            Center(
              child: ScaleTransition(
                scale: Tween<double>(begin: 0.96, end: 1.0).animate(curved),
                child: _ScrollableOptionsPanel(
                  maxWidth: 420,
                  backgroundColor:
                      const Color(0xFF141A24).withValues(alpha: 0.94),
                  borderRadius: 24,
                  shadowBlur: 28,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Anzeigenoptionen',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  item.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.72),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            tooltip: 'Schließen',
                            onPressed: () => Navigator.of(context).pop(),
                            icon: const Icon(Icons.close,
                                color: Colors.white60, size: 18),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      for (var i = 0; i < options.length; i++) ...[
                        _ListingOptionRow(
                          icon: options[i].icon,
                          label: options[i].label,
                          destructive: options[i].destructive,
                          onTap: () async {
                            Navigator.of(context).pop();
                            await options[i].onTap();
                          },
                        ),
                        if (i != options.length - 1)
                          Divider(
                              height: 1,
                              thickness: 0.6,
                              color: Colors.white.withValues(alpha: 0.05)),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// Only the saved-folder surface opts into this owner-bound action chain.
/// General Explore, visibility, reporting and provider workflows are unchanged.
Future<void> _showOwnedWishlistOptions(
  BuildContext context, {
  required Item item,
  required SavedCartActionScope scope,
  VoidCallback? onWishlistChanged,
}) async {
  try {
    if (!await scope.isCurrent()) return;
    final current = await DataService.getWishlistForItem(item.id,
        expectedOwner: scope.owner);
    if (!await scope.isCurrent()) return;
    if (!context.mounted) return;
    const choices = [
      (Icons.open_in_new, 'Anzeige öffnen'),
      (Icons.delete_outline, 'Aus Gemerkt entfernen'),
      (Icons.drive_file_move_outline, 'In andere Merkliste verschieben'),
      (Icons.ios_share, 'Teilen'),
      (Icons.calendar_month_outlined, 'Verfügbarkeit prüfen'),
    ];
    final choice = await scope.dialog<int>(
      context,
      icon: Icons.more_horiz,
      title: 'Anzeigenoptionen',
      body: (complete) => Column(mainAxisSize: MainAxisSize.min, children: [
        Text(item.title),
        for (var i = 0; i < choices.length; i++)
          ListTile(
            leading: Icon(choices[i].$1),
            title: Text(choices[i].$2),
            onTap: () => complete(i),
          ),
      ]),
    );
    if (choice == null || !await scope.isCurrent()) return;
    if (!context.mounted) return;
    if (choice == 0 || choice == 4) {
      await ItemDetailsOverlay.showFullPage(context,
          item: item, fresh: true, savedCartScope: scope);
      return;
    }
    if (choice == 3) {
      final url = AppLinkBuilder.listing(item.id).toString();
      try {
        await SharePlus.instance
            .share(ShareParams(text: '${item.title}\n$url'));
      } catch (_) {
        if (!await scope.isCurrent()) return;
        await Clipboard.setData(ClipboardData(text: url));
        if (!context.mounted) return;
        await scope.notice(context, icon: Icons.link, title: 'Link kopiert');
      }
      return;
    }
    if (choice == 1) {
      await DataService.removeItemFromWishlist(item.id,
          expectedOwner: scope.owner);
    } else if (choice == 2) {
      final String? selected;
      if (current == null) {
        if (!context.mounted) return;
        selected = await WishlistSelectionSheet.showAdd(context, scope: scope);
      } else {
        if (!context.mounted) return;
        selected = await WishlistSelectionSheet.showMove(context,
            currentListId: current, scope: scope);
      }
      if (selected == null || selected.isEmpty || !await scope.isCurrent()) {
        return;
      }
      await DataService.setItemWishlist(item.id, selected,
          expectedOwner: scope.owner);
    } else {
      return;
    }
    if (!await scope.isCurrent()) return;
    onWishlistChanged?.call();
    if (!context.mounted) return;
    await scope.notice(context,
        icon: choices[choice].$1,
        title:
            choice == 1 ? 'Aus Gemerkt entfernt' : 'In Merkliste verschoben');
  } catch (_) {
    if (!context.mounted) return;
    await scope.notice(context,
        icon: Icons.error_outline,
        title: 'Gemerkt konnte nicht bestätigt werden',
        message: 'Bitte lade die Merklisten erneut.');
  }
}

Future<List<_ListingOption>> _buildOptions(
  BuildContext context, {
  required Item item,
  required ListingOptionsContext contextType,
  VoidCallback? onWishlistChanged,
  VoidCallback? onVisibilityChanged,
}) async {
  Future<void> openListing() async {
    if (!context.mounted) return;
    ItemDetailsOverlay.showFullPage(context, item: item, fresh: true);
  }

  Future<void> shareListing() async {
    final url = AppLinkBuilder.listing(item.id).toString();
    try {
      await SharePlus.instance.share(ShareParams(text: '${item.title}\n$url'));
    } catch (_) {
      await Clipboard.setData(ClipboardData(text: url));
      if (context.mounted) {
        await AppPopup.toast(context, icon: Icons.link, title: 'Link kopiert');
      }
    }
  }

  Future<void> copyListingLink() async {
    final url = AppLinkBuilder.listing(item.id).toString();
    try {
      await Clipboard.setData(ClipboardData(text: url));
      if (context.mounted) {
        await AppPopup.toast(context, icon: Icons.link, title: 'Link kopiert');
      }
    } catch (_) {
      if (context.mounted) {
        await AppPopup.toast(context,
            icon: Icons.link_off, title: 'Link kopieren folgt bald');
      }
    }
  }

  Future<void> addToWishlist() async {
    try {
      final currentWishlistId = await DataService.getWishlistForItem(item.id);
      String? selected;
      if (currentWishlistId == null) {
        if (!context.mounted) return;
        selected = await WishlistSelectionSheet.showAdd(context);
      } else {
        if (!context.mounted) return;
        selected = await WishlistSelectionSheet.showMove(context,
            currentListId: currentWishlistId);
      }
      if (!context.mounted) return;
      if (selected != null && selected.isNotEmpty) {
        await DataService.setItemWishlist(item.id, selected);
        if (!context.mounted) return;
        onWishlistChanged?.call();
        await AppPopup.toast(context,
            icon: Icons.favorite,
            title: currentWishlistId == null
                ? 'Unter Gemerkt gespeichert'
                : 'In Merkliste verschoben');
      }
    } catch (error) {
      if (!context.mounted) return;
      await AppPopup.toast(
        context,
        icon: Icons.error_outline,
        title: 'Gemerkt wurde nicht aktualisiert',
        message: 'Es wurde nichts als gespeichert bestätigt.',
      );
    }
  }

  Future<void> removeFromWishlist() async {
    try {
      await DataService.removeItemFromWishlist(item.id);
      if (!context.mounted) return;
      onWishlistChanged?.call();
      await AppPopup.toast(context,
          icon: Icons.delete_outline, title: 'Aus Gemerkt entfernt');
    } catch (error) {
      if (!context.mounted) return;
      await AppPopup.toast(
        context,
        icon: Icons.error_outline,
        title: 'Artikel wurde nicht entfernt',
        message: 'Der bestätigte Stand bleibt erhalten.',
      );
    }
  }

  Future<void> moveToAnotherWishlist() async {
    try {
      final current = await DataService.getWishlistForItem(item.id);
      if (!context.mounted) return;
      if (current == null || current.isEmpty) {
        await addToWishlist();
        return;
      }
      final selected = await WishlistSelectionSheet.showMove(context,
          currentListId: current);
      if (!context.mounted) return;
      if (selected != null && selected.isNotEmpty) {
        await DataService.setItemWishlist(item.id, selected);
        if (!context.mounted) return;
        onWishlistChanged?.call();
        await AppPopup.toast(context,
            icon: Icons.drive_file_move_outline,
            title: 'In Merkliste verschoben');
      }
    } catch (error) {
      if (!context.mounted) return;
      await AppPopup.toast(
        context,
        icon: Icons.error_outline,
        title: 'Merkliste wurde nicht geändert',
        message: 'Der bestätigte Stand bleibt erhalten.',
      );
    }
  }

  final lessOfThisOptions = <_ListingOption>[
    _ListingOption(
        icon: Icons.place_outlined,
        label: 'Zu weit entfernt',
        onTap: () => saveLessOfThisReason(context, item, 'too_far',
            onVisibilityChanged: onVisibilityChanged,
            successTitle: 'Entfernung wird schwächer gewichtet')),
    _ListingOption(
        icon: Icons.euro_outlined,
        label: 'Zu teuer',
        onTap: () => saveLessOfThisReason(context, item, 'too_expensive',
            onVisibilityChanged: onVisibilityChanged,
            successTitle: 'Hohe Preise werden schwächer gewichtet')),
    _ListingOption(
        icon: Icons.heart_broken_outlined,
        label: 'Nicht interessant',
        onTap: () => saveLessOfThisReason(context, item, 'not_interesting',
            onVisibilityChanged: onVisibilityChanged,
            successTitle: 'Kategorie wird leicht abgewertet')),
    _ListingOption(
        icon: Icons.inventory_2_outlined,
        label: 'Bereits vorhanden',
        onTap: () => saveLessOfThisReason(context, item, 'already_have',
            onVisibilityChanged: onVisibilityChanged,
            successTitle: 'Ähnliche Anzeigen werden schwächer gezeigt')),
    _ListingOption(
        icon: Icons.repeat_outlined,
        label: 'Zu oft gesehen',
        onTap: () => saveLessOfThisReason(context, item, 'seen_too_often',
            onVisibilityChanged: onVisibilityChanged,
            successTitle: 'Sichtbarkeitsfrequenz wird reduziert')),
    _ListingOption(
        icon: Icons.more_horiz,
        label: 'Sonstiger Grund',
        onTap: () => saveLessOfThisReason(context, item, 'other',
            onVisibilityChanged: onVisibilityChanged,
            successTitle: 'Grund gespeichert')),
    _ListingOption(
        icon: Icons.visibility_off_outlined,
        label: 'Nur diese Anzeige ausblenden',
        onTap: () => saveLessOfThisReason(context, item, 'hide_only_this_item',
            onVisibilityChanged: onVisibilityChanged,
            hideOnlyThisItem: true,
            successTitle: 'Diese Anzeige wird ausgeblendet'),
        destructive: true),
  ];

  Future<void> showLessOfThisDialog() async {
    if (!context.mounted) return;
    await showGeneralDialog<void>(
      context: context,
      barrierLabel: 'Weniger davon anzeigen',
      barrierDismissible: true,
      barrierColor: Colors.black.withValues(alpha: 0.26),
      pageBuilder: (context, _, __) => const SizedBox.shrink(),
      transitionDuration: const Duration(milliseconds: 160),
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        final curved =
            CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
        return FadeTransition(
          opacity: curved,
          child: Stack(
            children: [
              Positioned.fill(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                  child: Container(color: Colors.black.withValues(alpha: 0.08)),
                ),
              ),
              Center(
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.97, end: 1.0).animate(curved),
                  child: _ScrollableOptionsPanel(
                    maxWidth: 390,
                    backgroundColor:
                        const Color(0xFF141A24).withValues(alpha: 0.95),
                    borderRadius: 22,
                    shadowBlur: 26,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Weshalb möchtest du weniger davon sehen?',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Schließen',
                              onPressed: () => Navigator.of(context).pop(),
                              icon: const Icon(Icons.close,
                                  color: Colors.white60, size: 18),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        const Text(
                          'Hilf uns, deine Empfehlungen zu verbessern.',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 6),
                        for (final option in lessOfThisOptions) ...[
                          _ListingOptionRow(
                            icon: option.icon,
                            label: option.label,
                            destructive: option.destructive,
                            onTap: () async {
                              Navigator.of(context).pop();
                              await option.onTap();
                            },
                          ),
                          if (option != lessOfThisOptions.last)
                            Divider(
                                height: 1,
                                thickness: 0.6,
                                color: Colors.white.withValues(alpha: 0.05)),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> openOwnerProfile() async {
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PublicProfileScreen(userId: item.ownerId)));
  }

  Future<void> reportListing() async {
    if (!context.mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => ReportUserScreen(
        reportedUserId: item.ownerId,
        reportedListingId: item.id,
        reportedListingTitle: item.title,
        reference: 'listing_options',
      ),
    ));
  }

  Future<void> placeholder(String title,
      {IconData icon = Icons.info_outline}) async {
    if (!context.mounted) return;
    await AppPopup.toast(context, icon: icon, title: title);
  }

  if (contextType == ListingOptionsContext.wishlist) {
    return [
      _ListingOption(
          icon: Icons.open_in_new, label: 'Anzeige öffnen', onTap: openListing),
      _ListingOption(
          icon: Icons.delete_outline,
          label: 'Aus Gemerkt entfernen',
          onTap: removeFromWishlist,
          destructive: true),
      _ListingOption(
          icon: Icons.drive_file_move_outline,
          label: 'In andere Merkliste verschieben',
          onTap: moveToAnotherWishlist),
      _ListingOption(
          icon: Icons.ios_share, label: 'Teilen', onTap: shareListing),
      _ListingOption(
          icon: Icons.calendar_month_outlined,
          label: 'Verfügbarkeit prüfen',
          onTap: openListing),
    ];
  }

  return [
    _ListingOption(
        icon: Icons.open_in_new, label: 'Anzeige öffnen', onTap: openListing),
    _ListingOption(
        icon: Icons.calendar_month_outlined,
        label: 'Verfügbarkeit prüfen',
        onTap: openListing),
    _ListingOption(
        icon: Icons.person_outline,
        label: 'Vermieterprofil ansehen',
        onTap: openOwnerProfile),
    _ListingOption(
        icon: Icons.favorite_border,
        label: 'Unter Gemerkt speichern',
        onTap: addToWishlist),
    _ListingOption(icon: Icons.ios_share, label: 'Teilen', onTap: shareListing),
    _ListingOption(
        icon: Icons.link, label: 'Link kopieren', onTap: copyListingLink),
    _ListingOption(
        icon: Icons.auto_awesome_outlined,
        label: 'Ähnliche Anzeigen anzeigen',
        onTap: () => placeholder('Ähnliche Anzeigen folgen bald')),
    _ListingOption(
        icon: Icons.visibility_off_outlined,
        label: 'Ausblenden / Weniger davon anzeigen',
        onTap: showLessOfThisDialog),
    _ListingOption(
        icon: Icons.flag_outlined,
        label: 'Melden',
        onTap: reportListing,
        destructive: true),
  ];
}

Future<void> saveLessOfThisReason(
  BuildContext context,
  Item item,
  String reason, {
  VoidCallback? onVisibilityChanged,
  bool hideOnlyThisItem = false,
  String successTitle = 'Feedback gespeichert',
}) async {
  await ListingFeedbackService.recordFeedback(
    itemId: item.id,
    reason: reason,
    categoryId: item.categoryId,
    pricePerDay: item.pricePerDay,
    city: item.city,
    hideOnlyThisItem: hideOnlyThisItem,
  );
  if (hideOnlyThisItem) {
    onVisibilityChanged?.call();
  }
  if (context.mounted) {
    await AppPopup.toast(
      context,
      icon: hideOnlyThisItem ? Icons.visibility_off_outlined : Icons.tune,
      title: hideOnlyThisItem
          ? successTitle
          : 'Danke. Wir berücksichtigen das für zukünftige Empfehlungen.',
    );
  }
}

class _ListingOption {
  final IconData icon;
  final String label;
  final Future<void> Function() onTap;
  final bool destructive;

  _ListingOption(
      {required this.icon,
      required this.label,
      required this.onTap,
      this.destructive = false});
}

class _ListingOptionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  const _ListingOptionRow(
      {required this.icon,
      required this.label,
      required this.onTap,
      this.destructive = false});

  @override
  Widget build(BuildContext context) {
    final color = destructive ? const Color(0xFFFF8C8C) : Colors.white;
    return Semantics(
      button: true,
      label: label,
      onTap: onTap,
      child: ExcludeSemantics(
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: ConstrainedBox(
            constraints:
                const BoxConstraints(minHeight: kMinInteractiveDimension),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 9),
              child: Row(
                children: [
                  Icon(icon, color: color.withValues(alpha: 0.9), size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                          color: color,
                          fontSize: 14,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ScrollableOptionsPanel extends StatelessWidget {
  const _ScrollableOptionsPanel({
    required this.maxWidth,
    required this.backgroundColor,
    required this.borderRadius,
    required this.shadowBlur,
    required this.child,
  });

  final double maxWidth;
  final Color backgroundColor;
  final double borderRadius;
  final double shadowBlur;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final availableHeight = (media.size.height -
            media.padding.vertical -
            media.viewInsets.vertical -
            24)
        .clamp(0.0, double.infinity);
    return SafeArea(
      minimum: const EdgeInsets.symmetric(vertical: 12),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: maxWidth,
          maxHeight: availableHeight,
        ),
        child: Material(
          color: Colors.transparent,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 24),
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(borderRadius),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.30),
                  blurRadius: shadowBlur,
                  offset: const Offset(0, 16),
                ),
              ],
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}
