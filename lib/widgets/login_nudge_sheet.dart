import 'package:flutter/material.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/widgets/blur_modal.dart';
import 'package:lendify/widgets/box_chat_icon.dart';

/// Defines what a guest tried to do, so we can show a context-aware message.
enum GuestGateContext {
  profile,
  accountSettings,
  verification,
  messages,
  booking,
  rentalRequest,
  favorites,
  reviews,
  listing,
  generic,
}

@immutable
class GuestGateContent {
  final IconData? icon;
  final Widget Function(BuildContext context)? iconBuilder;
  final String title;
  final String description;
  final List<String> benefits;
  const GuestGateContent({
    this.icon,
    this.iconBuilder,
    required this.title,
    required this.description,
    required this.benefits,
  }) : assert((icon == null) != (iconBuilder == null),
            'Provide either icon or iconBuilder');
}

/// Standard, premium guest restriction bottom sheet.
///
/// Use this whenever a guest tries to access a restricted feature.
Future<void> showGuestRestrictionSheet(
  BuildContext context, {
  GuestGateContext gateContext = GuestGateContext.generic,
  GuestGateContent? overrideContent,
}) async {
  debugPrint('[GuestGate] showGuestRestrictionSheet gateContext=$gateContext');
  await showBlurDialog<void>(
    context,
    barrierOpacity: 0.42,
    blurSigma: 14,
    glassPanel: true,
    glassSigma: 6,
    maxWidth: 560,
    child: GuestRestrictionSheet(
        gateContext: gateContext, overrideContent: overrideContent),
  );
}

/// Backwards-compatible API used in a few places.
/// (We keep it so older call sites don't break.)
Future<void> showLoginNudgeSheet(BuildContext context) =>
    showGuestRestrictionSheet(context, gateContext: GuestGateContext.generic);

int? _returnTabForGuestGate(GuestGateContext gateContext) {
  switch (gateContext) {
    case GuestGateContext.favorites:
      return 1;
    case GuestGateContext.booking:
      return 2;
    case GuestGateContext.messages:
      return 3;
    default:
      return null;
  }
}

class GuestRestrictionSheet extends StatelessWidget {
  final GuestGateContext gateContext;
  final GuestGateContent? overrideContent;
  const GuestRestrictionSheet(
      {super.key, required this.gateContext, this.overrideContent});

  GuestGateContent _content(BuildContext context) {
    final override = overrideContent;
    if (override != null) return override;
    switch (gateContext) {
      case GuestGateContext.profile:
        return const GuestGateContent(
          icon: Icons.account_circle_outlined,
          title: 'Profil ansehen',
          description:
              'Melde dich an oder registriere dich kostenlos, um dein Profil, deine Anzeigen und Einstellungen zu sehen.',
          benefits: [
            'Dein Profil & deine Daten verwalten',
            'Anzeigen, Buchungen & Nachrichten an einem Ort',
            'Mehr Vertrauen durch Verifizierung & Bewertungen'
          ],
        );
      case GuestGateContext.accountSettings:
        return const GuestGateContent(
          icon: Icons.settings_outlined,
          title: 'Konto‑Einstellungen',
          description:
              'Melde dich an oder registriere dich kostenlos, um deine Konto‑Einstellungen zu verwalten.',
          benefits: [
            'Sicherheit & Login‑Optionen verwalten',
            'Benachrichtigungen & Datenschutz einstellen',
            'Zahlungs‑ & Auszahlungsarten hinzufügen'
          ],
        );
      case GuestGateContext.verification:
        return const GuestGateContent(
          // Match iconography used across profile/menu for verification.
          icon: Icons.verified_user_outlined,
          title: 'Verifizierung freischalten',
          description:
              'Mit einem Konto kannst du deine Identität verifizieren und schneller buchen.',
          benefits: [
            'Mehr Vertrauen',
            'Schnellere Zusagen',
            'Bessere Sichtbarkeit'
          ],
        );
      case GuestGateContext.messages:
        return const GuestGateContent(
          // Match iconography used in navigation/profile for messages.
          icon: Icons.mark_unread_chat_alt_outlined,
          title: 'Nachricht senden',
          description:
              'Erstelle ein Konto, um schnell Fragen zu klären und sicher zu chatten.',
          benefits: [
            'Direkt Kontakt aufnehmen',
            'Details zur Buchung klären',
            'Verlauf jederzeit einsehen'
          ],
        );
      case GuestGateContext.booking:
        return const GuestGateContent(
          // Match calendar iconography used across the app.
          icon: Icons.calendar_month_outlined,
          title: 'Buchung anfragen',
          description:
              'Mit einem Konto kannst du buchen, Status verfolgen und alles an einem Ort verwalten.',
          benefits: [
            'Anfragen & Buchungen verwalten',
            'Status & Verlauf sehen',
            'Sicher mit Vermietern chatten'
          ],
        );
      case GuestGateContext.rentalRequest:
        return GuestGateContent(
          iconBuilder: (context) {
            final theme = Theme.of(context);
            return BoxChatIcon(size: 28, color: theme.colorScheme.primary);
          },
          title: 'Anmietungen ansehen',
          description:
              'Melde dich an oder registriere dich, um deine Anmietungen und eingehenden Anfragen zu verwalten.',
          benefits: [
            'Anmietungen verwalten',
            'Eingehende Anfragen sehen',
            'Sicher mit Mietern und Vermietern chatten'
          ],
        );
      case GuestGateContext.favorites:
        return const GuestGateContent(
          icon: Icons.favorite_border,
          title: 'Unter Gemerkt speichern',
          description:
              'Mit einem Konto bleibt Gemerkt auf all deinen Geräten erhalten.',
          benefits: [
            'Gemerktes synchron speichern',
            'Merklisten anlegen',
            'Schneller wiederfinden'
          ],
        );
      case GuestGateContext.reviews:
        return const GuestGateContent(
          icon: Icons.star_border,
          title: 'Bewertungen nutzen',
          description:
              'Erstelle ein Konto, um Bewertungen zu lesen und später selbst Feedback zu geben.',
          benefits: [
            'Bewertungen lesen',
            'Eigene Erfahrungen teilen',
            'Vertrauen in der Community stärken'
          ],
        );
      case GuestGateContext.listing:
        return const GuestGateContent(
          // Match the primary "Neue Anzeige erstellen" action icon used across the app.
          icon: Icons.add_business,
          title: 'Anzeige erstellen',
          description:
              'Mit einem Konto kannst du inserieren, Anfragen verwalten und Auszahlungen einrichten.',
          benefits: [
            'Anzeigen erstellen',
            'Anfragen verwalten',
            'Auszahlungen einrichten'
          ],
        );
      case GuestGateContext.generic:
        return const GuestGateContent(
          icon: Icons.lock_outline,
          title: 'Weiter geht’s mit einem Konto',
          description:
              'In Sekunden registrieren – und alle Funktionen freischalten.',
          benefits: [
            'Sicher buchen & kommunizieren',
            'Gemerktes & Buchungen verwalten',
            'Verifizierungen nutzen'
          ],
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = _content(context);
    final returnTab = _returnTabForGuestGate(gateContext);
    debugPrint(
        '[GuestGate] resolved content title="${c.title}" for gateContext=$gateContext');

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _HeaderBlock(
                icon: c.icon,
                iconBuilder: c.iconBuilder,
                title: c.title,
                description: c.description),
            const SizedBox(height: 12),
            _BenefitsBlock(benefits: c.benefits),
            const SizedBox(height: 12),
            _CtaZone(
              onRegister: () async {
                final navigator = Navigator.of(context);
                await navigator.maybePop();
                if (!navigator.mounted) return;
                await navigator.push(MaterialPageRoute(
                  builder: (_) => RegisterScreen(returnTabIndex: returnTab),
                ));
              },
              onLogin: () async {
                final navigator = Navigator.of(context);
                await navigator.maybePop();
                if (!navigator.mounted) return;
                await navigator.push(MaterialPageRoute(
                  builder: (_) => LoginScreen(returnTabIndex: returnTab),
                ));
              },
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.center,
              child: TextButton(
                onPressed: () => Navigator.of(context).maybePop(),
                style: TextButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  foregroundColor:
                      theme.colorScheme.onSurface.withValues(alpha: 0.62),
                  textStyle: theme.textTheme.labelSmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                child: const Text('Später'),
              ),
            ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }
}

class _HeaderBlock extends StatelessWidget {
  final IconData? icon;
  final Widget Function(BuildContext context)? iconBuilder;
  final String title;
  final String description;
  const _HeaderBlock(
      {required this.icon,
      required this.iconBuilder,
      required this.title,
      required this.description});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final Widget resolvedIcon;
    final b = iconBuilder;
    if (b != null) {
      resolvedIcon = b(context);
    } else {
      resolvedIcon = Icon(icon!, color: theme.colorScheme.primary, size: 30);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
      _IconBadge(child: resolvedIcon),
      const SizedBox(height: 10),
      Text(title,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleLarge?.copyWith(letterSpacing: -0.2)),
      const SizedBox(height: 6),
      Text(
        description,
        textAlign: TextAlign.center,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.84),
            height: 1.45),
      ),
    ]);
  }
}

class _CtaZone extends StatelessWidget {
  final Future<void> Function() onRegister;
  final Future<void> Function() onLogin;
  const _CtaZone({required this.onRegister, required this.onLogin});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () async => onRegister(),
            icon: const Icon(Icons.person_add_alt_1, color: Colors.white),
            label: const Text('Kostenlos registrieren',
                style: TextStyle(color: Colors.white)),
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () async => onLogin(),
            icon: Icon(Icons.login, color: theme.colorScheme.onSurface),
            label: Text('Anmelden',
                style: TextStyle(color: theme.colorScheme.onSurface)),
            style: OutlinedButton.styleFrom(
              side: BorderSide(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.22)),
              minimumSize: const Size.fromHeight(50),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
      ]),
    );
  }
}

class _IconBadge extends StatelessWidget {
  final Widget child;
  const _IconBadge({required this.child});

  @override
  Widget build(BuildContext context) {
    // User preference: header icon should be free-standing (no colored badge/card).
    return SizedBox(width: 48, height: 48, child: Center(child: child));
  }
}

class _BenefitsBlock extends StatelessWidget {
  final List<String> benefits;
  const _BenefitsBlock({required this.benefits});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Keep it compact: only show up to 3 lines.
    final items = benefits.take(3).toList(growable: false);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final it in items) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Freistehendes Icon (ohne Kreis/Chip)
                Icon(Icons.check_rounded,
                    size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    it,
                    style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.86),
                        height: 1.35),
                  ),
                ),
              ],
            ),
            if (it != items.last) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}
