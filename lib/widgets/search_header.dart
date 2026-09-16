import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/box_chat_icon.dart';
import 'package:lendify/services/data_service.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';

class SearchHeader extends StatelessWidget {
  final VoidCallback onFiltersPressed;
  final VoidCallback onSearchTap;
  final Future<void> Function(Item created)? onListingCreated;
  final Future<Item?> Function()? onCreateListing;

  const SearchHeader(
      {super.key,
      required this.onFiltersPressed,
      required this.onSearchTap,
      this.onListingCreated,
      this.onCreateListing});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bodyText = AppTheme.textBody(context);
    final secondaryText = AppTheme.textSecondary(context);
    final l10n = context.watch<LocalizationController>();

    Widget buildCreateButton(double size) => Semantics(
          button: true,
          label: l10n.t('Neue Anzeige erstellen'),
          excludeSemantics: true,
          child: InkWell(
            onTap: () async {
              if (onCreateListing != null) {
                final created = await onCreateListing!();
                if (created != null && onListingCreated != null) {
                  await onListingCreated!(created);
                }
                return;
              }
              final u = await DataService.getCurrentUser();
              if (!context.mounted) return;
              if (u == null) {
                await showGuestRestrictionSheet(context,
                    gateContext: GuestGateContext.listing);
                return;
              }
              final created = await Navigator.of(context).push<Item?>(
                  MaterialPageRoute(
                      builder: (_) => const CreateListingScreen()));
              if (created != null && onListingCreated != null) {
                await onListingCreated!(created);
              }
            },
            borderRadius: BorderRadius.circular(size / 2),
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                color: isDark
                    ? AppTheme.surfaceSecondary(context)
                    : AppTheme.surfacePrimary(context),
                borderRadius: BorderRadius.circular(size / 2),
                boxShadow: [
                  ...AppTheme.cardShadow(context),
                ],
                border: Border.all(
                    color: AppTheme.searchBorder(context), width: 1.5),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.add_business,
                  size: 22, color: BrandColors.primary),
            ),
          ),
        );

    Widget buildSearchField() => Semantics(
          button: true,
          label: l10n.t('Jetzt suchen'),
          excludeSemantics: true,
          child: InkWell(
            onTap: onSearchTap,
            borderRadius: BorderRadius.circular(28),
            child: Container(
              height: 52,
              decoration: BoxDecoration(
                color: isDark
                    ? AppTheme.surfaceSecondary(context)
                    : AppTheme.surfacePrimary(context),
                borderRadius: BorderRadius.circular(28),
                boxShadow: [
                  ...AppTheme.cardShadow(context),
                ],
                border: Border.all(
                    color: AppTheme.searchBorder(context), width: 1.5),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.search,
                      color: isDark ? BrandColors.primary : secondaryText),
                  const SizedBox(width: 10),
                  Builder(builder: (context) {
                    return Text(l10n.t('Jetzt suchen'),
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: isDark ? BrandColors.primary : bodyText));
                  })
                ],
              ),
            ),
          ),
        );

    Widget buildRequestsButton(double size) => Semantics(
          button: true,
          label: l10n.t('profile.menu.rentalRequests'),
          excludeSemantics: true,
          child: InkWell(
            onTap: () async {
              final u = await DataService.getCurrentUser();
              if (!context.mounted) return;
              if (u == null) {
                await showGuestRestrictionSheet(context,
                    gateContext: GuestGateContext.rentalRequest);
                return;
              }
              onFiltersPressed();
            },
            borderRadius: BorderRadius.circular(size / 2),
            child: FutureBuilder<bool>(
              future: () async {
                try {
                  final u = await DataService.getCurrentUser();
                  if (u == null) return false;
                  final pending = await DataService.getRentalRequestsForOwner(
                      u.id,
                      status: 'pending');
                  final has = pending.isNotEmpty;
                  debugPrint('[SearchHeader] hasPendingOwnerRequests=$has '
                      '(ownerId=${u.id}, count=${pending.length})');
                  return has;
                } catch (_) {
                  return false;
                }
              }(),
              builder: (context, snapshot) {
                final hasNew = (snapshot.data == true);
                return Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: size,
                      height: size,
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppTheme.surfaceSecondary(context)
                            : AppTheme.surfacePrimary(context),
                        borderRadius: BorderRadius.circular(size / 2),
                        boxShadow: [
                          ...AppTheme.cardShadow(context),
                        ],
                        border: Border.all(
                            color: AppTheme.searchBorder(context), width: 1.5),
                      ),
                      alignment: Alignment.center,
                      child: Transform.translate(
                        offset: const Offset(-1, 3),
                        child: const BoxChatIcon(
                            size: 22, color: BrandColors.primary),
                      ),
                    ),
                    if (hasNew)
                      const Positioned(
                        right: 1,
                        top: 1,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                              color: BrandColors.logoAccent,
                              shape: BoxShape.circle),
                          child: SizedBox(width: 8, height: 8),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: LayoutBuilder(builder: (context, constraints) {
        const gap = 8.0;
        const buttonSize = 44.0;
        const minSearchWidth = 120.0;
        final requiredWidth = (buttonSize * 2) + (gap * 2) + minSearchWidth;

        if (constraints.maxWidth < requiredWidth) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              buildSearchField(),
              const SizedBox(height: gap),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  buildCreateButton(buttonSize),
                  buildRequestsButton(buttonSize),
                ],
              ),
            ],
          );
        }

        return Row(children: [
          buildCreateButton(buttonSize),
          const SizedBox(width: gap),
          Expanded(child: buildSearchField()),
          const SizedBox(width: gap),
          buildRequestsButton(buttonSize),
        ]);
      }),
    );
  }
}
