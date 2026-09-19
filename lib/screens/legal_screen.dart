import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_popup.dart';

import 'package:lendify/screens/legal_imprint_screen.dart';
import 'package:lendify/screens/legal_privacy_screen.dart';
import 'package:lendify/screens/legal_terms_screen.dart';
import 'package:lendify/screens/legal_community_rules_screen.dart';
import 'package:lendify/screens/legal_fees_payments_screen.dart';
import 'package:lendify/screens/legal_cancellation_policy_screen.dart';
import 'package:lendify/screens/legal_disclaimer_screen.dart';
import 'package:lendify/screens/platform_withdrawal_screen.dart';

class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key});

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
          title: const Text('Rechtliches'),
          centerTitle: true,
          leading: IconButton(
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.of(context).maybePop()),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 16, 16, 24),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const _LegalHeaderCard(),
            const SizedBox(height: 12),
            _LegalMenuCard(items: [
              _LegalMenuItemData(
                icon: Icons.apartment_outlined,
                title: 'Impressum',
                subtitle: 'Anbieterkennzeichnung & Kontakt',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const LegalImprintScreen())),
              ),
              _LegalMenuItemData(
                icon: Icons.privacy_tip_outlined,
                title: 'Datenschutz',
                subtitle: 'Welche Daten verarbeitet werden – und warum',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const LegalPrivacyScreen())),
              ),
              _LegalMenuItemData(
                icon: Icons.description_outlined,
                title: 'AGB',
                subtitle: 'Regeln zur Nutzung, Buchung und Vermittlung',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const LegalTermsScreen())),
              ),
              _LegalMenuItemData(
                icon: Icons.groups_2_outlined,
                title: 'Community‑Regeln',
                subtitle: 'Was erlaubt ist – und was nicht',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const LegalCommunityRulesScreen())),
              ),
              _LegalMenuItemData(
                icon: Icons.payments_outlined,
                title: 'Gebühren & Zahlungsbedingungen',
                subtitle: 'Plattformgebühr, Abwicklung & Auszahlungen',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const LegalFeesPaymentsScreen())),
              ),
              _LegalMenuItemData(
                icon: Icons.event_busy_outlined,
                title: 'Stornierungsbedingungen',
                subtitle: 'Storno, Gebühren & Rückerstattungen',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const LegalCancellationPolicyScreen())),
              ),
              _LegalMenuItemData(
                icon: Icons.assignment_return_outlined,
                title: 'Vertrag widerrufen',
                subtitle: 'Zweistufiger Widerruf der Plattformleistung',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const PlatformWithdrawalScreen())),
              ),
              _LegalMenuItemData(
                icon: Icons.gpp_maybe_outlined,
                title: 'Haftungsausschluss',
                subtitle: 'Haftungsrollen zwischen Plattform und Nutzern',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const LegalDisclaimerScreen())),
              ),
            ]),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
              ),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.info_outline,
                    color: t.colorScheme.primary.withValues(alpha: 0.95)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Hinweis: Diese Texte sind für Transparenz im MVP gedacht. Bei rechtlichen Fragen können sich Inhalte ändern oder ergänzt werden.',
                    style: t.textTheme.bodySmall?.copyWith(
                        color: t.colorScheme.onSurface.withValues(alpha: 0.85),
                        height: 1.5),
                  ),
                ),
              ]),
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () {
                AppPopup.toast(
                  context,
                  icon: Icons.mail_outline,
                  title: 'Kontakt: contact@shareittoo.com',
                );
              },
              style: TextButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.05),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(
                        color: Colors.white.withValues(alpha: 0.08))),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child:
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.support_agent_outlined,
                      color: t.colorScheme.onSurface.withValues(alpha: 0.90)),
                  const SizedBox(width: 10),
                  Text('Fragen? Kontakt aufnehmen',
                      style: t.textTheme.labelLarge?.copyWith(
                          color:
                              t.colorScheme.onSurface.withValues(alpha: 0.92))),
                ]),
              ),
            ),
          ]),
        ),
      ),
    ]);
  }
}

class _LegalHeaderCard extends StatelessWidget {
  const _LegalHeaderCard();

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
          colors: [
            BrandColors.primary.withValues(alpha: 0.18),
            Colors.black.withValues(alpha: 0.18),
          ],
        ),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.25),
              blurRadius: 22,
              offset: const Offset(0, 10)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Rechtliches',
            style:
                t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        Text(
          'Hier findest du alle rechtlichen Informationen zur Nutzung von ShareItToo — übersichtlich, transparent und jederzeit abrufbar.',
          style: t.textTheme.bodyMedium?.copyWith(
              color: t.colorScheme.onSurface.withValues(alpha: 0.88),
              height: 1.55),
        ),
      ]),
    );
  }
}

class _LegalMenuItemData {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _LegalMenuItemData(
      {required this.icon,
      required this.title,
      required this.subtitle,
      required this.onTap});
}

class _LegalMenuCard extends StatelessWidget {
  final List<_LegalMenuItemData> items;
  const _LegalMenuCard({required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.24),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.22),
              blurRadius: 20,
              offset: const Offset(0, 10))
        ],
      ),
      child: Column(
        children: List.generate(items.length, (i) {
          final it = items[i];
          return Column(children: [
            _LegalRowTile(data: it),
            if (i != items.length - 1)
              Divider(
                  height: 1,
                  thickness: 1,
                  color: Colors.white.withValues(alpha: 0.08)),
          ]);
        }),
      ),
    );
  }
}

class _LegalRowTile extends StatefulWidget {
  final _LegalMenuItemData data;
  const _LegalRowTile({required this.data});

  @override
  State<_LegalRowTile> createState() => _LegalRowTileState();
}

class _LegalRowTileState extends State<_LegalRowTile> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final it = widget.data;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: it.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        color: _pressed
            ? Colors.white.withValues(alpha: 0.04)
            : Colors.transparent,
        child: Row(children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  BrandColors.primary.withValues(alpha: 0.30),
                  BrandColors.primary.withValues(alpha: 0.12),
                ],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            child: Icon(it.icon, color: BrandColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(it.title,
                  style: t.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(it.subtitle,
                  style: t.textTheme.bodySmall?.copyWith(
                      color: t.colorScheme.onSurface.withValues(alpha: 0.78),
                      height: 1.35)),
            ]),
          ),
          Icon(Icons.chevron_right,
              color: Colors.white.withValues(alpha: 0.35)),
        ]),
      ),
    );
  }
}
