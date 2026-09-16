import 'package:flutter/material.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:provider/provider.dart';

class LanguageScreen extends StatelessWidget {
  const LanguageScreen({super.key});

  static const List<_LanguageOption> _options = [
    _LanguageOption(lang: AppLanguage.de, title: 'Deutsch'),
    _LanguageOption(lang: AppLanguage.en, title: 'English'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.watch<LocalizationController>();
    final current = l10n.language;

    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: true,
        title: Text(l10n.t('language.title')),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 20, 16, 28),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.26),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.t('language.subtitle'),
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: Colors.white70, height: 1.45)),
                const SizedBox(height: 14),
                for (int i = 0; i < _options.length; i++) ...[
                  _LanguageTile(
                      option: _options[i],
                      selected: _options[i].lang == current),
                  if (i < _options.length - 1)
                    const Divider(
                        height: 14, thickness: 1, color: Colors.white24),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LanguageTile extends StatelessWidget {
  final _LanguageOption option;
  final bool selected;
  const _LanguageTile({required this.option, required this.selected});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: () async {
        await context.read<LocalizationController>().setLanguage(option.lang);
      },
      borderRadius: BorderRadius.circular(12),
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.white.withValues(alpha: 0.05),
      hoverColor: Colors.white.withValues(alpha: 0.04),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Text(
                option.title,
                style: theme.textTheme.bodyLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600),
              ),
            ),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              switchInCurve: Curves.easeOut,
              switchOutCurve: Curves.easeIn,
              transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SizeTransition(
                      sizeFactor: anim, axis: Axis.horizontal, child: child)),
              child: selected
                  ? Icon(Icons.check,
                      key: ValueKey(option.lang),
                      color: theme.colorScheme.primary,
                      size: 20)
                  : const SizedBox(
                      key: ValueKey('empty'), width: 20, height: 20),
            ),
          ],
        ),
      ),
    );
  }
}

class _LanguageOption {
  final AppLanguage lang;
  final String title;
  const _LanguageOption({required this.lang, required this.title});
}
