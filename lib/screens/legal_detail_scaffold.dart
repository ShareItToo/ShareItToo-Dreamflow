import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_popup.dart';

class LegalDetailScaffold extends StatelessWidget {
  final String title;
  final String intro;
  final List<Widget> sections;

  const LegalDetailScaffold({super.key, required this.title, required this.intro, required this.sections});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);

    return Stack(children: [
      Positioned.fill(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(color: Colors.black.withValues(alpha: 0.35)),
        ),
      ),
      Scaffold(
        extendBodyBehindAppBar: true,
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          title: Text(title),
          centerTitle: true,
          leading: IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 16, 16, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _LegalIntroCard(title: title, intro: intro),
            const SizedBox(height: 12),
            ...List.generate(
              sections.length,
              (i) => Padding(
                padding: EdgeInsets.only(bottom: i == sections.length - 1 ? 0 : 12),
                child: _AnimatedSection(index: i, child: sections[i]),
              ),
            ),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.verified_outlined, color: t.colorScheme.primary.withValues(alpha: 0.95)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Transparenz-Hinweis: Diese Inhalte sind im MVP als verständliche Übersicht formuliert und können mit dem Produkt/Backend weiter präzisiert werden.',
                    style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurface.withValues(alpha: 0.85), height: 1.5),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    ]);
  }
}

class LegalSectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final List<Widget> children;
  final String? badge;

  const LegalSectionCard({super.key, required this.icon, required this.title, required this.children, this.badge});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.24),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: 20, offset: const Offset(0, 10))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [BrandColors.primary.withValues(alpha: 0.30), BrandColors.primary.withValues(alpha: 0.12)],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            child: Icon(icon, color: BrandColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(title, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
                if (badge != null) _Badge(text: badge!),
              ]),
              const SizedBox(height: 8),
              ...children,
            ]),
          ),
        ]),
      ]),
    );
  }
}

class LegalParagraph extends StatelessWidget {
  final String text;
  const LegalParagraph(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Text(text, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurface.withValues(alpha: 0.88), height: 1.55));
  }
}

class LegalBullets extends StatelessWidget {
  final List<String> items;
  const LegalBullets({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final onSurface = t.colorScheme.onSurface;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: items
          .map(
            (s) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  margin: const EdgeInsets.only(top: 7),
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(color: onSurface.withValues(alpha: 0.85), borderRadius: BorderRadius.circular(99)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(s, style: t.textTheme.bodyMedium?.copyWith(color: onSurface.withValues(alpha: 0.88), height: 1.55))),
              ]),
            ),
          )
          .toList(),
    );
  }
}

class CopyableLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String? toastTitle;
  const CopyableLine({super.key, required this.icon, required this.label, required this.value, this.toastTitle});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final onSurface = t.colorScheme.onSurface;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () async {
        await Clipboard.setData(ClipboardData(text: value));
        if (!context.mounted) return;
        AppPopup.toast(context, icon: Icons.copy_rounded, title: toastTitle ?? 'Kopiert');
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(children: [
          Icon(icon, color: BrandColors.logoAccent.withValues(alpha: 0.95), size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: t.textTheme.labelSmall?.copyWith(color: onSurface.withValues(alpha: 0.82))),
              const SizedBox(height: 2),
              Text(value, style: t.textTheme.bodyMedium?.copyWith(color: onSurface.withValues(alpha: 0.92), fontWeight: FontWeight.w700)),
            ]),
          ),
          Icon(Icons.copy_rounded, color: onSurface.withValues(alpha: 0.35), size: 18),
        ]),
      ),
    );
  }
}

class _LegalIntroCard extends StatelessWidget {
  final String title;
  final String intro;
  const _LegalIntroCard({required this.title, required this.intro});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [BrandColors.primary.withValues(alpha: 0.18), Colors.black.withValues(alpha: 0.18)],
        ),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 22, offset: const Offset(0, 10))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        Text(intro, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurface.withValues(alpha: 0.88), height: 1.55)),
      ]),
    );
  }
}

class _AnimatedSection extends StatelessWidget {
  final int index;
  final Widget child;
  const _AnimatedSection({required this.index, required this.child});

  @override
  Widget build(BuildContext context) {
    final delay = Duration(milliseconds: 45 * index);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 380),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, v, c) {
        final eased = Curves.easeOut.transform(v);
        return FutureBuilder<void>(
          future: Future<void>.delayed(delay),
          builder: (context, snap) {
            final visible = snap.connectionState == ConnectionState.done;
            final a = visible ? eased : 0.0;
            return Opacity(opacity: a, child: Transform.translate(offset: Offset(0, (1 - a) * 10), child: c));
          },
        );
      },
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  const _Badge({required this.text});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: BrandColors.primary.withValues(alpha: 0.14),
        border: Border.all(color: BrandColors.primary.withValues(alpha: 0.35)),
      ),
      child: Text(text, style: t.textTheme.labelSmall?.copyWith(color: BrandColors.primary, fontWeight: FontWeight.w800)),
    );
  }
}
