import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';

class ChangeEmailScreen extends StatefulWidget {
  const ChangeEmailScreen({super.key});
  @override
  State<ChangeEmailScreen> createState() => _ChangeEmailScreenState();
}

class _ChangeEmailScreenState extends State<ChangeEmailScreen> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      Positioned.fill(child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16), child: Container(color: Colors.black.withValues(alpha: 0.35)))),
      Scaffold(
        extendBodyBehindAppBar: true,
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          title: const Text('E‑Mail ändern'),
          centerTitle: true,
          leading: IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 16, 16, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: _ctrl, decoration: const InputDecoration(prefixIcon: Icon(Icons.alternate_email), labelText: 'Neue E‑Mail')),
            const SizedBox(height: 12),
            const _Badge(text: 'Unbestätigt'),
            const SizedBox(height: 24),
            const FilledButton(onPressed: null, child: Text('Bestätigungslink senden')),
          ]),
        ),
      ),
    ]);
  }
}

class _Badge extends StatelessWidget {
  final String text;
  const _Badge({required this.text});
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(8)), child: Text(text, textAlign: TextAlign.center));
}
