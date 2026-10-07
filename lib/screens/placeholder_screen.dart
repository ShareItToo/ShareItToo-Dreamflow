import 'package:flutter/material.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:provider/provider.dart';

class PlaceholderScreen extends StatelessWidget {
  final String title; final String description;
  const PlaceholderScreen({super.key, required this.title, required this.description});

  void _backToExplore(BuildContext context) {
    try {
      context.read<MainNavController>().setIndex(0);
    } catch (_) {}
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.arrow_back)),
        title: Text(title),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: FilledButton.tonalIcon(
              onPressed: () => _backToExplore(context),
              icon: const Icon(Icons.explore_outlined, size: 18),
              label: const Text('Entdecken'),
            ),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.construction, size: 56, color: Colors.white.withValues(alpha: 0.7)),
            const SizedBox(height: 12),
            Text(description, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.white70)),
            const SizedBox(height: 18),
            FilledButton.tonalIcon(
              onPressed: () => _backToExplore(context),
              icon: const Icon(Icons.explore_outlined),
              label: const Text('Zurück zu Entdecken'),
            ),
          ]),
        ),
      ),
    );
  }
}
