import 'package:flutter/material.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/widgets/wishlist_folder.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/saved_cart_action_scope.dart';
import 'package:lendify/theme.dart';

class WishlistSelectionSheet {
  static Future<bool> _current(SavedCartActionScope? scope) async =>
      scope == null || await scope.isCurrent();

  static Future<String?> _show(
    BuildContext context, {
    required IconData icon,
    required String title,
    required Widget Function(ValueChanged<String?> complete) body,
    SavedCartActionScope? scope,
    Color? cardBackgroundColor,
  }) {
    if (scope != null) {
      return scope.dialog<String>(context,
          icon: icon,
          title: title,
          body: body,
          cardBackgroundColor: cardBackgroundColor);
    }
    return AppPopup.showCustom<String>(context,
        icon: icon,
        title: title,
        body: body((value) => Navigator.of(context).pop(value)),
        showCloseIcon: false,
        showLeading: false,
        showAccentLine: false,
        cardBackgroundColor: cardBackgroundColor);
  }

  /// Shows the first-time add sheet with the three predefined lists only.
  static Future<String?> showAdd(BuildContext context,
      {SavedCartActionScope? scope}) async {
    if (!await _current(scope) || !context.mounted) {
      return null;
    }
    final lists = await DataService.getWishlists(expectedOwner: scope?.owner);
    if (!await _current(scope) || !context.mounted) {
      return null;
    }
    final itemsBy =
        await DataService.getItemsByWishlist(expectedOwner: scope?.owner);
    if (!await _current(scope) || !context.mounted) {
      return null;
    }
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final system = lists.where((e) => e['system'] == true).toList();
    final custom = lists.where((e) => e['system'] != true).toList();
    return _show(
      context,
      scope: scope,
      icon: Icons.favorite,
      title: 'In welcher Merkliste speichern?',
      body: (complete) => _SelectorContent(
        scope: scope,
        title: 'In welcher Merkliste speichern?',
        options: [
          // System lists first
          for (final e in system)
            _SheetOption(
              id: (e['id'] ?? '').toString(),
              title: (e['name'] ?? '').toString(),
              subtitle: _subtitleForSystem((e['id'] ?? '').toString()),
              icon: _iconForListId((e['id'] ?? '').toString(), system: true),
              count: itemsBy[(e['id'] ?? '').toString()]?.length ?? 0,
              system: true,
            ),
          // Then custom lists
          for (final e in custom)
            _SheetOption(
              id: (e['id'] ?? '').toString(),
              title: (e['name'] ?? '').toString(),
              subtitle: 'Eigene Liste',
              icon: _iconForListId((e['id'] ?? '').toString(), system: false),
              count: itemsBy[(e['id'] ?? '').toString()]?.length ?? 0,
              system: false,
            ),
        ],
        grid: false,
        onDark: isDark,
        hideIcons: false,
        allowCreate: true,
        popWith: complete,
      ),
      cardBackgroundColor: isDark ? null : AppTheme.surfacePrimary(context),
    );
  }

  /// Shows a move-to sheet across all lists except the current.
  static Future<String?> showMove(BuildContext context,
      {required String currentListId, SavedCartActionScope? scope}) async {
    if (!await _current(scope) || !context.mounted) {
      return null;
    }
    final lists = await DataService.getWishlists(expectedOwner: scope?.owner);
    if (!await _current(scope) || !context.mounted) {
      return null;
    }
    final itemsBy =
        await DataService.getItemsByWishlist(expectedOwner: scope?.owner);
    if (!await _current(scope) || !context.mounted) {
      return null;
    }
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final options = lists
        .where((e) => (e['id'] ?? '').toString() != currentListId)
        .map((e) => _SheetOption(
              id: (e['id'] ?? '').toString(),
              title: (e['name'] ?? '').toString(),
              subtitle: e['system'] == true
                  ? _subtitleForSystem((e['id'] ?? '').toString())
                  : 'Eigene Liste',
              icon: _iconForListId((e['id'] ?? '').toString(),
                  system: e['system'] == true),
              count: itemsBy[(e['id'] ?? '').toString()]?.length ?? 0,
              system: e['system'] == true,
            ));
    return _show(
      context,
      scope: scope,
      icon: Icons.drive_file_move_rtl,
      title: 'In andere Merkliste verschieben',
      body: (complete) => _SelectorContent(
        scope: scope,
        title: 'In andere Merkliste verschieben',
        options: options.toList(),
        grid: false,
        onDark: isDark,
        hideIcons: false,
        allowCreate: true,
        popWith: complete,
      ),
      cardBackgroundColor: isDark ? null : AppTheme.surfacePrimary(context),
    );
  }

  /// Shows the small management popup with two actions for an item already
  /// saved in a wishlist: move to another list or remove from wishlist.
  /// Returns 'move' | 'remove' or null when dismissed.
  static Future<String?> showManageOptions(BuildContext context,
      {SavedCartActionScope? scope}) async {
    if (!await _current(scope) || !context.mounted) {
      return null;
    }
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return _show(
      context,
      scope: scope,
      icon: Icons.favorite,
      title: 'Gemerkt',
      body: (complete) => Padding(
        padding: const EdgeInsets.only(left: 6, right: 6, bottom: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _CompactActionRow(
              icon: Icons.swap_horiz,
              iconColor: cs.primary,
              label: 'In andere Merkliste verschieben',
              onDark: isDark,
              onTap: () => complete('move'),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Divider(
                height: 1,
                thickness: 1,
                color: isDark
                    ? Colors.white.withValues(alpha: 0.10)
                    : cs.onSurface.withValues(alpha: 0.08),
              ),
            ),
            _CompactActionRow(
              icon: Icons.delete_outline,
              iconColor: cs.error,
              label: 'Aus Gemerkt entfernen',
              onDark: isDark,
              onTap: () => complete('remove'),
            ),
          ],
        ),
      ),
      cardBackgroundColor: isDark ? null : AppTheme.surfacePrimary(context),
    );
  }

  static String _subtitleForSystem(String id) {
    if (id == DataService.wlSoonId) {
      return 'Ich plane, diesen Artikel bald zu mieten';
    }
    if (id == DataService.wlLaterId) return 'Interessant, aber nicht jetzt';
    if (id == DataService.wlAgainId) return 'Diesen Artikel hatte ich schon';
    return '';
  }
}

class _SelectorContent extends StatelessWidget {
  final SavedCartActionScope? scope;
  final String title;
  final List<_SheetOption> options;
  final bool grid;
  final bool onDark;
  final bool hideIcons;
  final ValueChanged<String>?
      popWith; // when embedded inside AppPopup, we cannot use the local Navigator context directly
  final bool allowCreate;
  const _SelectorContent(
      {required this.title,
      required this.options,
      this.scope,
      this.grid = false,
      this.onDark = false,
      this.hideIcons = false,
      this.popWith,
      this.allowCreate = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 0),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (grid)
                    WishlistFolderGrid(
                      options: [
                        for (final op in options)
                          WishlistFolderOption(
                            id: op.id,
                            title: op.title,
                            subtitle: op.subtitle,
                            count: op.count,
                            system: op.system,
                          ),
                      ],
                      onSelected: (id) => (popWith ?? (s) {})(id),
                      onDark: onDark,
                    )
                  else
                    Column(children: [
                      for (final op in options)
                        _OptionCard(
                            option: op,
                            onSelected: (id) => (popWith ?? (s) {})(id),
                            onDark: onDark,
                            showIcon: !hideIcons)
                    ]),
                  if (allowCreate)
                    _CreateListCard(
                      scope: scope,
                      onDark: onDark,
                      onCreated: (id) => (popWith ?? (s) {})(id),
                    ),
                ],
              ),
            ),
          ]),
    );
  }
}

class _SheetOption {
  final String id;
  final String title;
  final String subtitle;
  final IconData icon;
  final int count;
  final bool system;
  const _SheetOption(
      {required this.id,
      required this.title,
      required this.subtitle,
      required this.icon,
      this.count = 0,
      this.system = false});
}

class _OptionCard extends StatelessWidget {
  final _SheetOption option;
  final ValueChanged<String> onSelected;
  final bool onDark;
  final bool showIcon;
  const _OptionCard(
      {required this.option,
      required this.onSelected,
      this.onDark = false,
      this.showIcon = true});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tileBg = onDark
        ? Colors.white.withValues(alpha: 0.08)
        : AppTheme.surfaceSecondary(context);
    final tileBorder = onDark
        ? Colors.white.withValues(alpha: 0.12)
        : cs.onSurface.withValues(alpha: 0.10);
    final iconBg = cs.primary.withValues(alpha: onDark ? 0.15 : 0.10);
    final iconColor = cs.primary;
    // Systemlisten (Demnächst benötigt, Für später, Wieder mieten) sollen im dunklen Popup weiß sein
    final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: onDark
              ? (option.system ? Colors.white : cs.primary)
              : AppTheme.textPrimary(context),
        );
    final subStyle = onDark
        ? Theme.of(context)
            .textTheme
            .labelSmall
            ?.copyWith(color: Colors.white60)
        : Theme.of(context)
            .textTheme
            .labelSmall
            ?.copyWith(color: cs.onSurface.withValues(alpha: 0.60));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      child: InkWell(
        onTap: () => onSelected(option.id),
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: tileBg,
              border: Border.all(color: tileBorder)),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                if (showIcon) ...[
                  Container(
                      width: 36,
                      height: 36,
                      decoration:
                          BoxDecoration(color: iconBg, shape: BoxShape.circle),
                      child: Icon(option.icon, color: iconColor)),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(option.title, style: titleStyle),
                        const SizedBox(height: 4),
                        Text(option.subtitle, style: subStyle),
                      ]),
                ),
                // Count badge for folders
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                      color: (onDark
                          ? Colors.white.withValues(alpha: 0.10)
                          : cs.primary.withValues(alpha: 0.10)),
                      borderRadius: BorderRadius.circular(999)),
                  child: Text(option.count.toString(),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: onDark ? Colors.white : cs.primary,
                          fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// _FolderGrid and _CountBadge moved to shared widgets (WishlistFolderGrid)

/// Returns a suitable icon for a wishlist id.
IconData _iconForListId(String id, {required bool system}) {
  if (system) {
    // Deutlich unterschiedliche Icons fuer "Demnächst benötigt" und "Für später"
    if (id == DataService.wlSoonId) {
      return Icons.watch_later_outlined; // bald/zeitnah
    }
    if (id == DataService.wlLaterId) {
      return Icons.event_available_outlined; // für später
    }
    if (id == DataService.wlAgainId) return Icons.repeat_outlined;
  }
  // Für vom Nutzer erstellte Wunschlisten ein persönliches Icon anzeigen
  return Icons.person_outline;
}

class _CreateListCard extends StatelessWidget {
  final SavedCartActionScope? scope;
  final bool onDark;
  final ValueChanged<String> onCreated;
  const _CreateListCard(
      {required this.onDark, required this.onCreated, this.scope});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tileBg = onDark
        ? Colors.white.withValues(alpha: 0.08)
        : AppTheme.surfaceSecondary(context);
    final tileBorder = onDark
        ? Colors.white.withValues(alpha: 0.12)
        : cs.onSurface.withValues(alpha: 0.10);
    final iconBg = cs.primary.withValues(alpha: onDark ? 0.15 : 0.10);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: InkWell(
        onTap: () async {
          if (!await WishlistSelectionSheet._current(scope) ||
              !context.mounted) {
            return;
          }
          if (!context.mounted) return;
          final isDark = Theme.of(context).brightness == Brightness.dark;
          final name = await WishlistSelectionSheet._show(
            context,
            scope: scope,
            icon: Icons.favorite_border,
            title: 'Neue Merkliste erstellen',
            cardBackgroundColor:
                isDark ? null : AppTheme.surfacePrimary(context),
            body: (complete) => _CreateListForm(onComplete: complete),
          );
          if (!await WishlistSelectionSheet._current(scope) ||
              !context.mounted) {
            return;
          }
          if (name != null && name.trim().isNotEmpty) {
            try {
              final id = await DataService.addCustomWishlist(name.trim(),
                  expectedOwner: scope?.owner);
              if (!await WishlistSelectionSheet._current(scope) ||
                  !context.mounted) {
                return;
              }
              // Return the new id only after persistence has been verified.
              onCreated(id);
            } catch (error) {
              if (!await WishlistSelectionSheet._current(scope) ||
                  !context.mounted) {
                return;
              }
              if (!context.mounted) return;
              if (scope != null) {
                await scope!.notice(context,
                    icon: Icons.error_outline,
                    title: 'Speichern konnte nicht bestätigt werden',
                    message: 'Bitte lade die Merklisten erneut.');
                return;
              }
              await AppPopup.toast(
                context,
                icon: Icons.error_outline,
                title: 'Merkliste wurde nicht gespeichert',
                message: 'Deine vorhandenen Daten bleiben unverändert.',
              );
            }
          }
        },
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: tileBg,
              border: Border.all(color: tileBorder)),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Container(
                    width: 36,
                    height: 36,
                    decoration:
                        BoxDecoration(color: iconBg, shape: BoxShape.circle),
                    child: Icon(Icons.add, color: cs.primary)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Neue Merkliste erstellen',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: onDark
                                        ? Colors.white
                                        : AppTheme.textPrimary(context))),
                        const SizedBox(height: 4),
                        Text('Eigene Liste',
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(
                                    color: onDark
                                        ? Colors.white60
                                        : AppTheme.textSecondary(context))),
                      ]),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CreateListForm extends StatefulWidget {
  final ValueChanged<String?> onComplete;
  const _CreateListForm({required this.onComplete});

  @override
  State<_CreateListForm> createState() => _CreateListFormState();
}

class _CreateListFormState extends State<_CreateListForm> {
  final TextEditingController controller = TextEditingController();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final inputBg = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : AppTheme.surfaceSecondary(context);
    final inputBorder = OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
            color: isDark
                ? Colors.white.withValues(alpha: 0.12)
                : cs.onSurface.withValues(alpha: 0.10)));
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              style: TextStyle(
                  color: isDark ? Colors.white : AppTheme.textPrimary(context)),
              cursorColor: cs.primary,
              decoration: InputDecoration(
                hintText: 'Name der Merkliste',
                hintStyle: TextStyle(
                    color: isDark
                        ? Colors.white70
                        : AppTheme.textDisabled(context)),
                filled: true,
                fillColor: inputBg,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                border: inputBorder,
                enabledBorder: inputBorder,
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: cs.primary, width: 1.2)),
              ),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => widget.onComplete(null),
                  style: OutlinedButton.styleFrom(
                      foregroundColor: isDark
                          ? Colors.white70
                          : AppTheme.textPrimary(context),
                      side: BorderSide(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.20)
                              : cs.onSurface.withValues(alpha: 0.12)),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12))),
                  child: const Text('Abbrechen'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: () => widget.onComplete(controller.text.trim()),
                  style: FilledButton.styleFrom(
                      backgroundColor: cs.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12))),
                  child: const Text('Erstellen'),
                ),
              ),
            ]),
          ]),
    );
  }
}

/// Simple two-option action rows used by showManageOptions(), matching the
/// visual language of the wishlist selection popup (glass card, rounded tiles,
/// white text on dark, colored leading icon inside a soft circle).
class _CompactActionRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final bool onDark;
  final VoidCallback onTap;
  const _CompactActionRow(
      {required this.icon,
      required this.iconColor,
      required this.label,
      required this.onTap,
      this.onDark = false});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: onDark ? 0.15 : 0.10),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: onDark ? Colors.white : AppTheme.textPrimary(context),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
