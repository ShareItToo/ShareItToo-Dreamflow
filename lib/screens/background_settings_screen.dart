import 'package:flutter/material.dart';
import 'package:lendify/services/background_theme_service.dart';
import 'package:provider/provider.dart';

class BackgroundSettingsScreen extends StatelessWidget {
  const BackgroundSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BackgroundThemeController>();
    final selected = controller.selectedChoice;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Hintergrund'),
        centerTitle: true,
        leading: IconButton(
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Wähle einen Hintergrund für den eingeloggten Bereich von ShareItToo.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colorScheme.onSurface.withValues(alpha: 0.86),
                    ),
              ),
              const SizedBox(height: 12),
              Semantics(
                container: true,
                button: true,
                selected: selected == null,
                label: 'Systemeinstellung verwenden',
                onTap: controller.clearChoice,
                child: ExcludeSemantics(
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      key: const ValueKey('background-system-default'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        foregroundColor: colorScheme.onSurface,
                        side: BorderSide(
                          color: selected == null
                              ? colorScheme.primary
                              : colorScheme.onSurface.withValues(alpha: 0.28),
                          width: selected == null ? 2 : 1,
                        ),
                      ),
                      onPressed: controller.clearChoice,
                      icon: Icon(
                        selected == null
                            ? Icons.check_circle
                            : Icons.brightness_auto_outlined,
                      ),
                      label: const Text('Systemeinstellung verwenden'),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: GridView.builder(
                  physics: const BouncingScrollPhysics(),
                  itemCount: AppBackgroundChoice.values.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 14,
                    mainAxisSpacing: 14,
                    childAspectRatio: 0.84,
                  ),
                  itemBuilder: (context, index) {
                    final choice = AppBackgroundChoice.values[index];
                    return _BackgroundPreviewCard(
                      choice: choice,
                      selected: selected == choice,
                      onTap: () => controller.setChoice(choice),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BackgroundPreviewCard extends StatelessWidget {
  final AppBackgroundChoice choice;
  final bool selected;
  final VoidCallback onTap;

  const _BackgroundPreviewCard({
    required this.choice,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final borderColor = selected
        ? colorScheme.primary
        : colorScheme.onSurface.withValues(alpha: 0.24);
    final previewIsDark = choice.family == Brightness.dark;
    final previewForeground =
        previewIsDark ? Colors.white : const Color(0xFF0F172A);
    final previewSurface = previewIsDark
        ? Colors.black.withValues(alpha: 0.62)
        : Colors.white.withValues(alpha: 0.86);

    return Semantics(
      container: true,
      button: true,
      selected: selected,
      label: '${choice.uiLabel} Hintergrund',
      onTap: onTap,
      child: ExcludeSemantics(
        child: Material(
          key: ValueKey('background-choice-${choice.storageValue}'),
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: onTap,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: borderColor,
                  width: selected ? 2.6 : 1.0,
                ),
                boxShadow: selected
                    ? [
                        BoxShadow(
                          color: colorScheme.primary.withValues(alpha: 0.22),
                          blurRadius: 18,
                          spreadRadius: 1,
                        ),
                      ]
                    : null,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(23),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset(choice.assetPath, fit: BoxFit.cover),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            (previewIsDark ? Colors.black : Colors.white)
                                .withValues(alpha: 0.04),
                            (previewIsDark ? Colors.black : Colors.white)
                                .withValues(
                              alpha: choice.overlayOpacity * 0.42,
                            ),
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      top: 12,
                      right: 12,
                      child: AnimatedOpacity(
                        duration: const Duration(milliseconds: 150),
                        opacity: selected ? 1.0 : 0.0,
                        child: Container(
                          width: 30,
                          height: 30,
                          decoration: BoxDecoration(
                            color: colorScheme.primary,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.check,
                            color: Colors.black,
                            size: 18,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 14,
                      right: 14,
                      bottom: 14,
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: previewSurface,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 6,
                            ),
                            child: Text(
                              choice.uiLabel,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: previewForeground,
                                  ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
