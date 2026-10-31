import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';

/// Full-screen SIT notification detail page.
///
/// This screen is intentionally UI-only and works with the existing mock feed.
class NotificationDetailScreen extends StatelessWidget {
  const NotificationDetailScreen({super.key, required this.notification, required this.onCta});

  final Map<String, dynamic> notification;
  final VoidCallback onCta;

  @override
  Widget build(BuildContext context) {
    final model = _NotificationDetailModel.fromNotification(notification);

    return Stack(
      children: [
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
            leading: IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()),
          ),
          body: SafeArea(
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: _DetailCard(model: model, onCta: onCta),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({required this.model, required this.onCta});

  final _NotificationDetailModel model;
  final VoidCallback onCta;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        color: Colors.black.withValues(alpha: 0.55),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [accent.withValues(alpha: 0.45), accent.withValues(alpha: 0.15)],
                    ),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                  ),
                  child: Icon(model.headerIcon, color: Colors.white, size: 26),
                ),
                const SizedBox(height: 14),
                Text(
                  model.title,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text(
                  model.subline,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.78), height: 1.45),
                ),
                if (model.timeLabel.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                    ),
                    child: Text(
                      model.timeLabel,
                      style: theme.textTheme.labelSmall?.copyWith(color: Colors.white.withValues(alpha: 0.72)),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                _Section(title: 'Kurz erklärt', body: model.explanation),
                const SizedBox(height: 14),
                _Bullets(title: 'Was bedeutet das für dich?', bullets: model.bullets),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: onCta,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: theme.colorScheme.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        child: Text(model.ctaLabel, style: theme.textTheme.titleSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w900)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  style: TextButton.styleFrom(foregroundColor: Colors.white.withValues(alpha: 0.80)),
                  child: const Text('Zurück'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.body});
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Align(
      alignment: Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(body, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.86), height: 1.5)),
        ],
      ),
    );
  }
}

class _Bullets extends StatelessWidget {
  const _Bullets({required this.title, required this.bullets});
  final String title;
  final List<String> bullets;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Align(
      alignment: Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          for (final b in bullets)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(top: 7),
                    decoration: const BoxDecoration(color: BrandColors.logoGradientStart, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      b,
                      style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.86), height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _NotificationDetailModel {
  final String title;
  final String subline;
  final String explanation;
  final List<String> bullets;
  final String ctaLabel;
  final String timeLabel;
  final IconData headerIcon;

  const _NotificationDetailModel({
    required this.title,
    required this.subline,
    required this.explanation,
    required this.bullets,
    required this.ctaLabel,
    required this.timeLabel,
    required this.headerIcon,
  });

  static _NotificationDetailModel fromNotification(Map<String, dynamic> n) {
    final title = (n['title'] ?? '').toString().trim();
    final body = (n['body'] ?? '').toString().trim();
    final entityType = (n['entityType'] ?? '').toString().toLowerCase();
    final rawCategory = (n['category'] ?? '').toString().toLowerCase();
    final ts = DateTime.tryParse((n['ts'] ?? '').toString());
    final timeLabel = ts == null ? '' : _relativeTime(ts);

    final lowerTitle = title.toLowerCase();
    final lowerBody = body.toLowerCase();
    final explicitCta = (n['ctaLabel'] ?? '').toString().trim();
    bool hasAny(List<String> needles) => needles.any((x) => lowerTitle.contains(x) || lowerBody.contains(x));

    final bool isVerification = entityType == 'verification' || hasAny(['verifiz', 'sicherheits-check', 'sicherheit']);
    final bool isMessage = entityType == 'thread' || rawCategory == 'messages' || hasAny(['nachricht', 'chat']);
    final bool isPayment = entityType == 'payment' || rawCategory == 'payments' || hasAny(['zahlung', 'zahlungsmethode', 'rechnung']);
    final bool isReview = rawCategory == 'reviews' || hasAny(['bewertung']);
    final bool isSupport = rawCategory == 'support' || entityType == 'support' || hasAny(['support', 'ticket', 'hilfe']);
    final bool isHandover = entityType == 'handover' || hasAny(['übergabe', 'rückgabe', 'qr-code', 'qr code']);
    final bool isBooking = entityType == 'booking' || rawCategory == 'bookings';

    if (isMessage) {
      return _NotificationDetailModel(
        title: title.isNotEmpty ? title : 'Neue Nachricht',
        subline: 'Ein Update in deinem Chat – damit eure Buchung reibungslos bleibt.',
        explanation: 'SIT zeigt dir hier neue Nachrichten zu Buchungen oder Absprachen. Du kannst direkt in den Chat springen und antworten.',
        bullets: const [
          'Öffne den Chat, um den Kontext zu sehen und schnell zu reagieren.',
          'Prüfe, ob es um Zeiten, Abholung oder Rückgabe geht.',
          'Wenn etwas unklar ist, stelle eine kurze Rückfrage – das spart Zeit.',
          'Bei wichtigen Details: lieber schriftlich im Chat bestätigen.',
        ],
        ctaLabel: 'Zum Chat',
        timeLabel: timeLabel,
        headerIcon: Icons.chat_bubble_outline,
      );
    }

    if (isVerification) {
      return _NotificationDetailModel(
        title: title.isNotEmpty ? title : 'Sicherheits‑Check',
        subline: 'Mehr Vertrauen, mehr Sicherheit – für dich und andere.',
        explanation: 'Ein Sicherheits‑Check hilft dabei, Buchungen verlässlicher zu machen. Du kannst den Prozess in wenigen Minuten starten.',
        bullets: const [
          'Du siehst gleich, welche Schritte noch fehlen.',
          'Nach Abschluss kann dein Profil sichtbarer und vertrauenswürdiger wirken.',
          'Du bekommst ggf. Zugang zu Funktionen, die Verifizierung voraussetzen.',
          'Wenn etwas nicht klappt, kannst du den Support direkt kontaktieren.',
        ],
        ctaLabel: explicitCta.isNotEmpty ? explicitCta : 'Jetzt verifizieren',
        timeLabel: timeLabel,
        headerIcon: Icons.verified_user_outlined,
      );
    }

    if (isPayment) {
      return _NotificationDetailModel(
        title: title.isNotEmpty ? title : 'Zahlungsmethode benötigt',
        subline: 'Damit du reibungslos buchen und bezahlen kannst.',
        explanation: 'Für bezahlte Buchungen braucht SIT eine gültige Zahlungsmethode. Du kannst jederzeit eine Methode hinzufügen oder wechseln.',
        bullets: const [
          'Füge eine Zahlungsmethode hinzu, um Anfragen schneller abschließen zu können.',
          'Bei abgelaufenen Karten: aktualisiere die Daten, bevor du buchst.',
          'Zahlungen werden dir transparent in der Übersicht angezeigt.',
          'Du kannst mehrere Methoden speichern und später wechseln.',
        ],
        ctaLabel: explicitCta.isNotEmpty ? explicitCta : 'Zahlungsmethode hinzufügen',
        timeLabel: timeLabel,
        headerIcon: Icons.payments_outlined,
      );
    }

    if (isReview) {
      final reviewCtaLabel = isBooking ? 'Zur Buchung' : 'Verstanden';
      return _NotificationDetailModel(
        title: title.isNotEmpty ? title : 'Bewertung erhalten',
        subline: 'Feedback stärkt Vertrauen – klar und nachvollziehbar.',
        explanation: 'Bewertungen helfen der Community, Vertrauen aufzubauen. Wenn ein klarer Buchungskontext vorhanden ist, kannst du ihn direkt öffnen. Sonst bleibt dieses Update bewusst neutral und vollständig.',
        bullets: const [
          'Prüfe neue Bewertungen ruhig und sachlich.',
          'Ausstehende Bewertungen: möglichst zeitnah nach der Rückgabe erledigen.',
          'Wenn kein direkter Kontext verknüpft ist, zeigt SIT dieses Update bewusst ohne erfundenes Ziel an.',
        ],
        ctaLabel: reviewCtaLabel,
        timeLabel: timeLabel,
        headerIcon: Icons.star_outline,
      );
    }

    if (isSupport) {
      return _NotificationDetailModel(
        title: title.isNotEmpty ? title : 'Support‑Update',
        subline: 'Dein Fall wurde aktualisiert – wir sind dran.',
        explanation: 'Wenn du einen Support‑Fall hast, bekommst du Updates hier gebündelt. So bleibt alles nachvollziehbar an einem Ort.',
        bullets: const [
          'Öffne den Support-Thread, um die letzten Nachrichten und Schritte zu sehen.',
          'Wenn Informationen fehlen, ergänze sie direkt im Fall.',
          'Bei Dringlichkeit: antworte kurz mit dem wichtigsten Punkt zuerst.',
        ],
        ctaLabel: explicitCta.isNotEmpty ? explicitCta : 'Zum Support-Fall',
        timeLabel: timeLabel,
        headerIcon: Icons.support_agent,
      );
    }

    if (isHandover) {
      return _NotificationDetailModel(
        title: title.isNotEmpty ? title : 'Übergabe & Rückgabe',
        subline: 'Damit Abholung und Rückgabe ohne Stress laufen.',
        explanation: 'SIT bündelt hier Erinnerungen und Bestätigungen rund um Übergabe, QR‑Code und Rückgabe. So wissen beide Seiten, was als Nächstes dran ist.',
        bullets: const [
          'Prüfe die vorgeschlagene Zeit und bestätige sie, wenn sie passt.',
          'Wenn ihr euch verspätet: kurz Bescheid geben – das verhindert Konflikte.',
          'Halte für die Übergabe ggf. den QR‑Code bereit (falls aktiv).',
          'Nach der Rückgabe: Zustand prüfen und ggf. im Chat dokumentieren.',
        ],
        ctaLabel: explicitCta.isNotEmpty ? explicitCta : 'Zur Buchung',
        timeLabel: timeLabel,
        headerIcon: Icons.swap_horiz,
      );
    }

    if (isBooking) {
      final isOwnerRequest = explicitCta == 'Anfrage prüfen' ||
          hasAny(['mietanfrage', 'vermietung', 'deiner anzeige']);
      final isOwnerFlow = isOwnerRequest || hasAny(['zur vermietung']);

      if (isOwnerRequest) {
        return _NotificationDetailModel(
          title: title.isNotEmpty ? title : 'Neue Mietanfrage eingegangen',
          subline: body.isNotEmpty ? body : 'Du hast eine neue Mietanfrage zu deiner Anzeige erhalten.',
          explanation: 'Du hast eine neue Mietanfrage zu deiner Anzeige erhalten.',
          bullets: const [
            'Prüfe Zeitraum, Übergabeart und voraussichtliche Auszahlung.',
            'Akzeptiere die Anfrage, wenn der Artikel verfügbar ist.',
            'Lehne sie ab, wenn die Vermietung nicht möglich ist.',
          ],
          ctaLabel: explicitCta.isNotEmpty ? explicitCta : 'Anfrage prüfen',
          timeLabel: timeLabel,
          headerIcon: Icons.inventory_2_outlined,
        );
      }

      return _NotificationDetailModel(
        title: title.isNotEmpty ? title : 'Buchungs‑Update',
        subline: isOwnerFlow
            ? 'Ein Update zu deiner Vermietung – kurz prüfen.'
            : 'Ein Status hat sich geändert – kurz prüfen.',
        explanation: isOwnerFlow
            ? 'Vermietungs-Benachrichtigungen informieren dich über Annahmen, Status-Änderungen und nächste Schritte zu deinen Anzeigen.'
            : 'Buchungs-Benachrichtigungen informieren dich über Anfragen, Annahmen, Stornierungen und Status-Änderungen.',
        bullets: isOwnerFlow
            ? const [
                'Öffne die Vermietung, um Status und Details zu prüfen.',
                'Prüfe Zeitraum, Übergabeart und voraussichtliche Auszahlung.',
                'Bei Rückfragen: schreibe direkt im Chat, damit alles dokumentiert ist.',
              ]
            : const [
                'Öffne die Buchung, um Status und Details zu prüfen.',
                'Achte auf Zeiten/Ort und ob eine Aktion nötig ist.',
                'Bei Rückfragen: schreibe direkt im Chat, damit alles dokumentiert ist.',
              ],
        ctaLabel: explicitCta.isNotEmpty
            ? explicitCta
            : (isOwnerFlow ? 'Zur Vermietung' : 'Zur Buchung'),
        timeLabel: timeLabel,
        headerIcon: isOwnerFlow
            ? Icons.inventory_2_outlined
            : Icons.calendar_month_outlined,
      );
    }

    return _NotificationDetailModel(
      title: title.isNotEmpty ? title : 'Hinweis',
      subline: 'Ein ruhiges Update von SIT – kurz zur Kenntnis nehmen.',
      explanation: body.isNotEmpty ? body : 'Sobald SIT etwas Wichtiges für dich hat, erscheint es hier in einem klaren Detail‑Format.',
      bullets: const [
        'Wenn du keine Aktion siehst, ist meist nichts Dringendes zu tun.',
        'Du kannst Benachrichtigungen jederzeit in den Einstellungen anpassen.',
        'Bei Unsicherheit hilft der Support schnell weiter.',
      ],
      ctaLabel: 'Verstanden',
      timeLabel: timeLabel,
      headerIcon: Icons.info_outline,
    );
  }

  static String _relativeTime(DateTime ts) {
    final now = DateTime.now();
    final diff = now.difference(ts);
    if (diff.inMinutes < 1) return 'gerade eben';
    if (diff.inMinutes < 60) return 'vor ${diff.inMinutes} Min.';
    if (diff.inHours < 24) return 'vor ${diff.inHours} Std.';
    if (diff.inDays < 7) return 'vor ${diff.inDays} Tg.';
    final weeks = (diff.inDays / 7).floor();
    if (weeks < 5) return 'vor $weeks W.';
    final months = (diff.inDays / 30).floor();
    return 'vor $months Mon.';
  }
}
