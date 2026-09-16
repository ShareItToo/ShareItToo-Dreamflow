import 'package:flutter/material.dart';
import 'package:lendify/screens/moderation_decisions_screen.dart';
import 'package:lendify/screens/support_cases_screen.dart';
import 'package:lendify/screens/support_flow_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';
import 'package:lendify/widgets/support_principal_controller.dart';

typedef HelpCenterSessionCheck = Future<bool> Function();

class HelpCenterScreen extends StatefulWidget {
  final SupportCaseSubmitter? submitter;
  final HelpCenterSessionCheck? sessionCheck;
  final SupportCaseListLoader? caseListLoader;
  final SupportCaseDetailLoader? caseDetailLoader;
  final ModerationDecisionLoader? moderationDecisionLoader;
  final ModerationReviewSubmitter? moderationReviewSubmitter;

  const HelpCenterScreen({
    super.key,
    this.submitter,
    this.sessionCheck,
    this.caseListLoader,
    this.caseDetailLoader,
    this.moderationDecisionLoader,
    this.moderationReviewSubmitter,
  });

  @override
  State<HelpCenterScreen> createState() => _HelpCenterScreenState();
}

class _HelpCenterScreenState extends State<HelpCenterScreen> {
  final _supportPrincipal = SupportPrincipalController();
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  final TextEditingController _supportCtrl = TextEditingController();
  bool _sendingSupport = false;

  String get _query => _searchCtrl.text.trim().toLowerCase();

  final Set<String> _expandedCategories = <String>{'Konto & Profil'};

  @override
  void initState() {
    super.initState();
    _supportPrincipal.addListener(_supportPrincipalChanged);
  }

  void _supportPrincipalChanged() {
    if (!mounted) return;
    if (_supportPrincipal.invalidated) _supportCtrl.clear();
    setState(() {});
  }

  @override
  void dispose() {
    _supportPrincipal.removeListener(_supportPrincipalChanged);
    _supportPrincipal.dispose();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    _supportCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final categories = _helpCategories(context);
    final results = _query.isEmpty
        ? const <_HelpSearchResult>[]
        : _search(categories, _query);

    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: true,
        leading: IconButton(
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Hilfe-Center'),
      ),
      body: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 14, 16, 32),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _HelpHeaderCard(),
          const SizedBox(height: 14),
          _SearchField(
            controller: _searchCtrl,
            focusNode: _searchFocus,
            onChanged: (_) => setState(() {}),
            onClear: () {
              _searchCtrl.clear();
              _searchFocus.unfocus();
              setState(() {});
            },
          ),
          const SizedBox(height: 14),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            transitionBuilder: (child, anim) =>
                FadeTransition(opacity: anim, child: child),
            child: _query.isNotEmpty
                ? _SearchResultsPanel(
                    key: ValueKey('results-${_query.hashCode}'),
                    results: results,
                    onOpen: _openArticle,
                  )
                : _CategoriesPanel(
                    key: const ValueKey('categories'),
                    categories: categories,
                    expandedCategories: _expandedCategories,
                    onToggleCategory: (id) {
                      setState(() {
                        if (_expandedCategories.contains(id)) {
                          _expandedCategories.remove(id);
                        } else {
                          _expandedCategories.add(id);
                        }
                      });
                    },
                    onOpen: _openArticle,
                  ),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            key: const ValueKey('open-moderation-decisions'),
            onPressed: _openModerationDecisions,
            icon: const Icon(Icons.gavel_outlined),
            label: const Text('Meine Moderationsentscheidungen'),
          ),
          const SizedBox(height: 18),
          Text('Support kontaktieren',
              style: t.textTheme.titleMedium
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          if (_supportPrincipal.invalidated)
            const Text(
                'Die Sitzung hat sich geändert. Bitte öffne das Hilfe-Center erneut.'),
          _SupportCard(
            controller: _supportCtrl,
            sending: _sendingSupport,
            onChanged: (_) => setState(() {}),
            onSend: _sendingSupport ||
                    _supportPrincipal.loading ||
                    _supportPrincipal.invalidated
                ? null
                : _sendSupportMessage,
            onOpenCases: _openSupportCases,
          ),
        ]),
      ),
    );
  }

  List<_HelpCategory> _helpCategories(BuildContext context) {
    // MVP: hard-coded DE content; later: move to localization/content service.
    return const [
      _HelpCategory(
        id: 'Konto & Profil',
        icon: Icons.person_outline,
        articles: [
          _HelpArticle(
            id: 'konto-erstellen',
            title: 'Konto erstellen',
            short: 'In wenigen Schritten registrieren und loslegen.',
            body: _HelpBody(
              intro:
                  'Du kannst ShareItToo im MVP ohne komplizierte Schritte starten. Später kommen mehr Login-Optionen hinzu.',
              steps: [
                'Öffne „Mein SIT“ und wähle „Anmelden“ oder „Konto erstellen“.',
                'Vervollständige Profilangaben (Name, Stadt).',
                'Optional: Verifizierung durchführen, um Vertrauen zu erhöhen.',
              ],
              tips: [
                'Verifiziere dich frühzeitig – das erhöht die Chance auf Buchungen.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'profil-bearbeiten',
            title: 'Profil bearbeiten',
            short: 'Bio, Sprache, Kontaktinfos und Profilfoto anpassen.',
            body: _HelpBody(
              intro:
                  'Ein vollständiges Profil erhöht Vertrauen und reduziert Rückfragen.',
              steps: [
                'Gehe zu „Mein SIT“ → „Kontoeinstellungen“ → „Profilinformationen“.',
                'Passe Foto, Beschreibung und Basisdaten an.',
                'Speichere deine Änderungen.',
              ],
              tips: [
                'Nutze ein klares Profilfoto und eine kurze, freundliche Beschreibung.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'verifizierung',
            title: 'Verifizierung durchführen',
            short: 'Geplante geprüfte Identitätsbestätigung.',
            body: _HelpBody(
              intro:
                  'Die Identitätsprüfung ist noch nicht verfügbar. ShareItToo zeigt deshalb keinen lokalen Demo-Ablauf als echte Prüfung an.',
              steps: [
                'Bestätige deine E-Mail-Adresse über den zugesandten Link.',
                'Nutze bis zur Anbieteranbindung ausschließlich korrekte Profildaten.',
              ],
              tips: [
                'Sobald ein geprüfter Identitätsanbieter angebunden ist, wird der Einstieg in den Kontoeinstellungen freigeschaltet.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'passwort-aendern',
            title: 'Passwort ändern',
            short: 'Sicheres Passwort setzen und Konto schützen.',
            body: _HelpBody(
              intro:
                  'Empfohlen: ein einzigartiges Passwort nur für ShareItToo.',
              steps: [
                'Gehe zu „Kontoeinstellungen“ → „Passwort ändern“.',
                'Gib aktuelles Passwort und neues Passwort ein.',
                'Bestätige die Änderung.',
              ],
              tips: [
                'Nutze mindestens 12 Zeichen, Groß-/Kleinbuchstaben und Zahlen.'
              ],
            ),
          ),
          _HelpArticle(
            id: '2fa',
            title: 'Zwei-Faktor-Authentifizierung',
            short: 'Geplanter zusätzlicher Schutz für dein Konto.',
            body: _HelpBody(
              intro:
                  'Die sichere Zwei-Faktor-Authentifizierung ist noch nicht verfügbar. Wir zeigen keine lokale Demo als echte Kontosicherheit an.',
              steps: [
                'Nutze bis dahin ein einzigartiges, starkes Passwort.',
                'Prüfe unter „Sicherheit“ regelmäßig deine angemeldeten Geräte.',
              ],
              tips: [
                'Sobald die serverseitige Funktion verfügbar ist, wird sie in den Kontoeinstellungen aktivierbar.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'konto-loeschen',
            title: 'Konto löschen',
            short: 'DSGVO-konform und mit Sicherheitsprüfung.',
            body: _HelpBody(
              intro:
                  'Aus Sicherheitsgründen ist die Löschung zweistufig und kann blockiert sein, wenn noch Aktivitäten offen sind.',
              steps: [
                'Gehe zu „Kontoeinstellungen“ → „Konto löschen“.',
                'Bestätige die Bedingungen im ersten Dialog.',
                'Tippe „LÖSCHEN“ im zweiten Dialog ein und bestätige.',
              ],
              tips: [
                'Schließe laufende Buchungen/Zahlungen zuerst ab, falls die Löschung blockiert ist.'
              ],
            ),
          ),
        ],
      ),
      _HelpCategory(
        id: 'Anzeigen erstellen & verwalten',
        icon: Icons.storefront_outlined,
        articles: [
          _HelpArticle(
            id: 'anzeige-erstellen',
            title: 'Anzeige erstellen',
            short: 'Artikel anlegen, Details ausfüllen und veröffentlichen.',
            body: _HelpBody(
              intro:
                  'Je klarer deine Anzeige, desto weniger Rückfragen und desto höher die Buchungsrate.',
              steps: [
                'Öffne „Entdecken“ und wähle „Neue Anzeige erstellen“.',
                'Wähle Kategorie, Titel und Beschreibung.',
                'Lege Standort und Verfügbarkeit fest.',
              ],
              tips: [
                'Achte auf einen realistischen Preis und klare Regeln für Abholung und Rückgabe.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'fotos-hinzufuegen',
            title: 'Fotos hinzufügen',
            short: 'Gute Bilder erhöhen Vertrauen und sparen Zeit.',
            body: _HelpBody(
              intro: 'Fotos sind der wichtigste Faktor für Vertrauen.',
              steps: [
                'Nutze mindestens 4 Fotos: Front, Seite, Details, Zubehör.',
                'Zeige Zustand (Kratzer, Normale Gebrauchsspuren) ehrlich.',
              ],
              tips: [
                'Helles Tageslicht und neutraler Hintergrund wirken professionell.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'preis-festlegen',
            title: 'Preis festlegen',
            short: 'Einen fairen Tagespreis sinnvoll festlegen.',
            body: _HelpBody(
              intro: 'Ein fairer Preis sorgt für wiederkehrende Buchungen.',
              steps: [
                'Vergleiche ähnliche Artikel (Marktpreise).',
                'Berücksichtige Zustand und lokalen Vergleichspreis.',
                'Biete Rabatte für längere Mietdauern an.'
              ],
              tips: ['Zu hohe Preise erhöhen Stornos und lange Liegezeiten.'],
            ),
          ),
          _HelpArticle(
            id: 'anzeige-bearbeiten',
            title: 'Anzeige bearbeiten',
            short: 'Titel, Fotos, Verfügbarkeit und Preis anpassen.',
            body: _HelpBody(
              intro:
                  'Halte deine Anzeige aktuell – besonders Verfügbarkeit und Zustand.',
              steps: [
                'Öffne „Meine Anzeigen“ und wähle eine Anzeige.',
                'Passe Details an und speichere.'
              ],
              tips: [
                'Ändere die Beschreibung, wenn Zubehör fehlt/neu hinzugekommen ist.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'anzeige-pausieren-loeschen',
            title: 'Anzeige pausieren oder löschen',
            short: 'Temporär ausblenden oder dauerhaft entfernen.',
            body: _HelpBody(
              intro:
                  'Nutze „Pausieren“, wenn du nur kurz nicht vermieten möchtest.',
              steps: [
                'Öffne „Meine Anzeigen“.',
                'Wähle „Pausieren“ oder „Löschen“ (falls verfügbar).'
              ],
              tips: [
                'Löschen ist endgültig; pausieren ist oft die bessere Option.'
              ],
            ),
          ),
        ],
      ),
      _HelpCategory(
        id: 'Buchungen & Anmietungen',
        icon: Icons.calendar_month_outlined,
        articles: [
          _HelpArticle(
            id: 'mietanfrage-senden',
            title: 'Mietanfrage senden',
            short: 'Wunschtermin wählen, Nachricht senden, bestätigen.',
            body: _HelpBody(
              intro:
                  'Eine kurze, freundliche Nachricht erhöht die Chance auf Annahme.',
              steps: [
                'Öffne einen Artikel und wähle Zeitraum.',
                'Sende eine Anfrage an den Vermieter.',
                'Warte auf Annahme/Ablehnung.'
              ],
              tips: [
                'Schreibe kurz wofür du den Artikel brauchst und wie du damit umgehst.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'anfragen-annehmen-ablehnen',
            title: 'Mietanfragen annehmen oder ablehnen',
            short: 'Als Vermieter Anfragen prüfen und entscheiden.',
            body: _HelpBody(
              intro:
                  'Antworte möglichst schnell – das steigert Zufriedenheit und Ranking.',
              steps: [
                'Gehe zu „Anfragen“.',
                'Prüfe Profil/Zeitraum.',
                'Nimm an oder lehne höflich ab.'
              ],
              tips: [
                'Wenn du ablehnst, nenne kurz einen Grund (z.B. nicht verfügbar).'
              ],
            ),
          ),
          _HelpArticle(
            id: 'buchung-starten',
            title: 'Buchung starten',
            short: 'Nach Übergabe beginnt die Mietzeit offiziell.',
            body: _HelpBody(
              intro:
                  'Die Buchung startet, wenn beide Seiten die Übergabe bestätigen.',
              steps: [
                'Trefft euch zur Übergabe.',
                'Verwendet QR-Code/Code (falls aktiv).',
                'Macht Übergabe-Fotos.'
              ],
              tips: ['Dokumentiert Zustand und Zubehör vollständig.'],
            ),
          ),
          _HelpArticle(
            id: 'buchung-stornieren',
            title: 'Buchung stornieren',
            short: 'Storno vor Beginn oder während einer Buchung.',
            body: _HelpBody(
              intro:
                  'Stornos können Gebühren oder Einschränkungen haben (je nach Richtlinie).',
              steps: [
                'Öffne die Buchungsdetails.',
                'Wähle „Stornieren“ und bestätige.'
              ],
              tips: [
                'Bei Problemen immer zuerst im Chat schreiben – oft lässt sich eine Lösung finden.'
              ],
            ),
          ),
        ],
      ),
      _HelpCategory(
        id: 'Übergabe & Rückgabe',
        icon: Icons.qr_code_scanner,
        articles: [
          _HelpArticle(
            id: 'uebergabe-starten',
            title: 'Übergabe starten',
            short:
                'Übergabe-Prozess öffnen und Schritt für Schritt bestätigen.',
            body: _HelpBody(
              intro: 'Eine saubere Übergabe schützt beide Seiten.',
              steps: [
                'Öffne die Buchung.',
                'Starte „Übergabe“.',
                'Bestätige Zubehör und Zustand.'
              ],
              tips: ['Nimm dir 2 Minuten mehr – das spart Streit.'],
            ),
          ),
          _HelpArticle(
            id: 'qr-oder-code',
            title: 'QR-Code oder Code verwenden',
            short: 'Schnelle Bestätigung direkt vor Ort.',
            body: _HelpBody(
              intro:
                  'QR/Code sorgt dafür, dass beide Seiten dieselbe Buchung bestätigen.',
              steps: [
                'Öffne den Übergabe-/Rückgabe-Screen.',
                'Scanne QR-Code oder gib den Code ein.',
                'Bestätige die Aktion.'
              ],
              tips: ['Wenn Scannen nicht geht: Code manuell eingeben.'],
            ),
          ),
          _HelpArticle(
            id: 'fotos-uebergabe',
            title: 'Fotos bei Übergabe machen',
            short: 'Zustand dokumentieren (schützt Vermieter & Mieter).',
            body: _HelpBody(
              intro:
                  'Fotos sind die beste Absicherung bei Schäden oder fehlendem Zubehör.',
              steps: [
                'Fotografiere den Artikel aus mehreren Perspektiven.',
                'Fotografiere Seriennummern/Details bei Elektronik.',
                'Fotografiere Zubehör vollständig.'
              ],
              tips: ['Fotos sollten scharf und gut beleuchtet sein.'],
            ),
          ),
          _HelpArticle(
            id: 'rueckgabe-bestaetigen',
            title: 'Rückgabe bestätigen',
            short: 'Rückgabe-Prozess abschließen und Zustand prüfen.',
            body: _HelpBody(
              intro: 'Bei der Rückgabe wird der Zustand erneut dokumentiert.',
              steps: [
                'Öffne die Buchung.',
                'Starte „Rückgabe“.',
                'Prüfe Artikel & Zubehör, mache Fotos, bestätige.'
              ],
              tips: [
                'Bei Abweichungen: direkt im Prozess melden, nicht erst später.'
              ],
            ),
          ),
        ],
      ),
      _HelpCategory(
        id: 'Zahlungen & Auszahlungen',
        icon: Icons.account_balance_wallet_outlined,
        articles: [
          _HelpArticle(
            id: 'zahlungsmethoden',
            title: 'Buchung sicher bezahlen',
            short:
                'Zahlungsdaten ausschließlich im sicheren Checkout des tatsächlich freigeschalteten Zahlungsdienstleisters eingeben.',
            body: _HelpBody(
              intro:
                  'ShareItToo speichert keine vollständigen Karten- oder Kontodaten auf deinem Gerät. Der verbindliche Betrag wird vom Server berechnet. Ohne freigeschalteten Marketplace-Zahlungsdienst bleibt der Abschluss gesperrt.',
              steps: [
                'Öffne eine vom Vermieter angenommene Buchung.',
                'Wähle „Zahlung“.',
                'Prüfe Betrag und Gebühr und öffne nur einen vom Server freigeschalteten Zahlungs-Checkout.'
              ],
              tips: [
                'Eine Buchung gilt erst als bezahlt, wenn der freigeschaltete Zahlungsdienst die Zahlung serverseitig bestätigt hat.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'auszahlungsmethoden',
            title: 'Auszahlungskonto einrichten',
            short:
                'Identität und Bankverbindung nur beim tatsächlich freigeschalteten Marketplace-Zahlungsdienst hinterlegen.',
            body: _HelpBody(
              intro:
                  'Vermieter richten ihr Auszahlungskonto erst nach sichtbarer Anbieterfreigabe direkt beim Zahlungsdienst ein. ShareItToo speichert keine vollständige IBAN in der App.',
              steps: [
                'Gehe zu „Kontoeinstellungen“ → „Auszahlungsmethoden“.',
                'Öffne das sichere Anbieter-Onboarding nur, wenn die App es ausdrücklich als verfügbar zeigt.',
                'Vervollständige Identitäts- und Bankangaben direkt beim freigeschalteten Zahlungsdienst.'
              ],
              tips: [
                'Auszahlungen bleiben gesperrt, bis der freigeschaltete Zahlungsdienst das Konto bestätigt hat.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'wann-auszahlung',
            title: 'Wann erhalte ich meine Auszahlung?',
            short: 'Auszahlungen nach erfolgreicher Rückgabe/Bestätigung.',
            body: _HelpBody(
              intro:
                  'Der Vermietererlös wird erst nach abgeschlossener Rückgabe und der festgelegten Sicherheitsfrist freigegeben.',
              steps: [
                'Nach Abschluss der Buchung prüft der Server die Sicherheitsfrist.',
                'Offene Streitfälle oder Erstattungen blockieren die Freigabe.',
                'Nach der Freigabe verarbeitet der Marketplace-Zahlungsdienst die Auszahlung auf das dort hinterlegte Konto.'
              ],
              tips: [
                'Bei Problemen: Support kontaktieren und Buchungsnummer nennen.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'gebuehren',
            title: 'Gebühren bei ShareItToo',
            short: 'Betrag und Plattformgebühr vor der Zahlung prüfen.',
            body: _HelpBody(
              intro:
                  'Gebühren decken Plattformbetrieb, Support und Sicherheit ab.',
              steps: [
                'Du siehst Gesamtbetrag und Plattformgebühr vor dem Öffnen des Zahlungsdienstes.',
                'Der freigeschaltete Zahlungsdienst zeigt den endgültigen Zahlbetrag nochmals im sicheren Checkout.'
              ],
              tips: [
                'Wir zeigen dir Kosten immer vor der endgültigen Bestätigung.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'rechnungen-belege',
            title: 'Rechnungen & Belege',
            short: 'Alle Nachweise an einem Ort herunterladen.',
            body: _HelpBody(
              intro:
                  'Rechnungen helfen bei Garantiefragen oder für die Steuer.',
              steps: [
                'Gehe zu „Kontoeinstellungen“ → „Rechnungen & Belege“.',
                'Wähle Zeitraum und lade PDF herunter.'
              ],
              tips: ['Speichere wichtige Belege zusätzlich lokal ab.'],
            ),
          ),
        ],
      ),
      _HelpCategory(
        id: 'Sicherheit & Vertrauen',
        icon: Icons.shield_outlined,
        articles: [
          _HelpArticle(
            id: 'verifizierung-2',
            title: 'Verifizierung',
            short:
                'Warum Verifizierung wichtig ist – und wie sie funktioniert.',
            body: _HelpBody(
              intro: 'Verifizierung ist ein wichtiger Baustein gegen Betrug.',
              steps: [
                'Mein SIT → Kontoeinstellungen → Verifizierung öffnen.',
                'Schritte in der App folgen.'
              ],
              tips: [
                'Verifizierte Profile erhalten mehr Vertrauen und Anfragen.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'bewertungen',
            title: 'Bewertungen',
            short: 'Nach jeder Buchung fair bewerten.',
            body: _HelpBody(
              intro:
                  'Bewertungen schaffen Transparenz und schützen die Community.',
              steps: [
                'Nach Abschluss kannst du bewerten.',
                'Bleibe sachlich und beschreibe kurz deine Erfahrung.'
              ],
              tips: [
                'Fotos und klare Übergaben führen meist zu besseren Bewertungen.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'nutzer-melden',
            title: 'Nutzer melden',
            short: 'Bei verdächtigem Verhalten schnell reagieren.',
            body: _HelpBody(
              intro: 'Wenn etwas komisch wirkt: lieber einmal zu viel melden.',
              steps: [
                'Öffne das Profil oder den Chat.',
                'Wähle „Melden“ (falls verfügbar).',
                'Beschreibe kurz, was passiert ist.'
              ],
              tips: ['Keine Zahlungen außerhalb der Plattform vereinbaren.'],
            ),
          ),
          _HelpArticle(
            id: 'sicherheitstipps',
            title: 'Sicherheitstipps',
            short: 'Praktische Tipps für sichere Übergaben und Zahlungen.',
            body: _HelpBody(
              intro: 'Ein paar einfache Regeln reduzieren Risiken erheblich.',
              steps: [
                'Trefft euch an gut beleuchteten Orten.',
                'Macht Übergabe-/Rückgabe-Fotos.',
                'Kommuniziert über den Chat in der App.'
              ],
              tips: [
                'Wenn du dich unwohl fühlst: Termin abbrechen und Support informieren.'
              ],
            ),
          ),
        ],
      ),
      _HelpCategory(
        id: 'Probleme & Konflikte',
        icon: Icons.report_outlined,
        articles: [
          _HelpArticle(
            id: 'problem-mit-buchung',
            title: 'Problem mit Buchung',
            short: 'Was tun, wenn etwas nicht wie geplant läuft?',
            body: _HelpBody(
              intro:
                  'Viele Probleme lassen sich schnell lösen, wenn beide Seiten früh kommunizieren.',
              steps: [
                'Schreibe zuerst im Chat.',
                'Dokumentiere relevante Infos (Screenshots/Fotos).',
                'Kontaktiere Support, wenn nötig.'
              ],
              tips: [
                'Nenne immer Buchung und Datum – das beschleunigt die Hilfe.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'artikel-beschaedigt',
            title: 'Artikel beschädigt',
            short: 'Schaden dokumentieren und fair klären.',
            body: _HelpBody(
              intro:
                  'Dokumentation ist entscheidend: Übergabe- und Rückgabe-Fotos vergleichen.',
              steps: [
                'Mache Fotos vom Schaden.',
                'Vergleiche mit Übergabe-Fotos.',
                'Kontaktiere Support mit Details.'
              ],
              tips: ['Bleibe sachlich. Wir helfen bei einer fairen Lösung.'],
            ),
          ),
          _HelpArticle(
            id: 'artikel-nicht-erhalten',
            title: 'Artikel nicht erhalten',
            short: 'Wenn die Übergabe nicht stattgefunden hat.',
            body: _HelpBody(
              intro:
                  'Wenn du den Artikel nicht erhalten hast, handle bitte sofort.',
              steps: [
                'Schreibe dem Vermieter im Chat.',
                'Prüfe Ort/Zeit und vereinbartes Übergabemodell.',
                'Kontaktiere Support bei ausbleibender Antwort.'
              ],
              tips: [
                'Teile keine privaten Zahlungsinfos und bleibe im Plattform-Chat.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'streitfall-melden',
            title: 'Streitfall melden',
            short: 'Support einschalten, wenn keine Einigung möglich ist.',
            body: _HelpBody(
              intro:
                  'Wir schauen uns Chatverlauf und Dokumentation an, um zu vermitteln.',
              steps: [
                'Sammle Belege (Fotos, Chat, Zeiten).',
                'Kontaktiere Support mit kurzer Zusammenfassung.',
                'Warte auf Rückmeldung.'
              ],
              tips: [
                'Je klarer deine Infos, desto schneller können wir helfen.'
              ],
            ),
          ),
        ],
      ),
      _HelpCategory(
        id: 'Datenschutz & Rechtliches',
        icon: Icons.privacy_tip_outlined,
        articles: [
          _HelpArticle(
            id: 'datenschutz',
            title: 'Datenschutz',
            short: 'Welche Daten sichtbar sind – und welche privat bleiben.',
            body: _HelpBody(
              intro:
                  'Wir trennen öffentliche Profilinfos und private Kontodaten klar.',
              steps: [
                'Öffne „Kontoeinstellungen“ → „Datenschutz-Infos“.',
                'Lies die Regeln zu Chat, Übergabe und Foto-Dokumentation.'
              ],
              tips: [
                'Teile im Chat keine sensiblen Daten, die nicht nötig sind.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'datennutzung',
            title: 'Datennutzung',
            short:
                'Wofür Daten genutzt werden (Sicherheit, Buchungen, Support).',
            body: _HelpBody(
              intro:
                  'Daten helfen uns, Buchungen sicher abzuwickeln und Betrug zu verhindern.',
              steps: [
                'Wir nutzen Daten für Buchungsabwicklung, Support und Sicherheitsprüfungen.',
                'Es gibt klare Lösch-/Anonymisierungsregeln.'
              ],
              tips: [
                'In den Datenschutz-Infos findest du Details zu Speicherfristen.'
              ],
            ),
          ),
          _HelpArticle(
            id: 'konto-loeschen-2',
            title: 'Konto löschen',
            short: 'Wie Löschung und Anonymisierung funktionieren.',
            body: _HelpBody(
              intro:
                  'Konto-Löschung ist endgültig und wird nur durchgeführt, wenn keine blockierenden Aktivitäten offen sind. Eine offene Supportakte allein blockiert die Löschung nicht; sie kann kontrolliert erhalten bleiben, während dein Zugang endet.',
              steps: [
                'Kontoeinstellungen → Konto löschen.',
                'Bedingungen prüfen und bestätigen.',
                '„LÖSCHEN“ eingeben.'
              ],
              tips: [
                'Wenn du nur pausieren willst: Support kontaktieren (später Feature).'
              ],
            ),
          ),
        ],
      ),
    ];
  }

  List<_HelpSearchResult> _search(
      List<_HelpCategory> categories, String query) {
    final q = query.toLowerCase();
    final res = <_HelpSearchResult>[];
    for (final cat in categories) {
      for (final a in cat.articles) {
        final hay =
            '${cat.id} ${a.title} ${a.short} ${a.body.intro} ${a.body.steps.join(' ')} ${a.body.tips.join(' ')}'
                .toLowerCase();
        if (hay.contains(q)) {
          res.add(_HelpSearchResult(category: cat, article: a));
        }
      }
    }
    return res;
  }

  Future<void> _openArticle(
      _HelpCategory category, _HelpArticle article) async {
    if (!mounted) return;
    _searchFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.35),
      builder: (ctx) => _HelpArticleSheet(category: category, article: article),
    );
  }

  Future<void> _sendSupportMessage() async {
    final owner = _supportPrincipal.capture();
    if (_sendingSupport ||
        _supportPrincipal.loading ||
        _supportPrincipal.invalidated) {
      return;
    }
    final msg = _supportCtrl.text.trim();
    if (msg.runes.length < 20) {
      AppPopup.toast(context,
          icon: Icons.info_outline,
          title: 'Bitte beschreibe dein Anliegen etwas genauer.',
          message:
              'Mindestens 20 Zeichen, damit wir dir schnell helfen können.');
      return;
    }

    setState(() => _sendingSupport = true);
    try {
      final hasSession = await (widget.sessionCheck?.call() ??
          AuthService.readSession().then((session) => session != null));
      if (!mounted || _supportPrincipal.invalidated) return;
      if (!hasSession || owner == null) {
        // Awaiting the guest sheet is not an in-flight support submission.
        setState(() => _sendingSupport = false);
        await showGuestRestrictionSheet(
          context,
          overrideContent: const GuestGateContent(
            icon: Icons.support_agent_outlined,
            title: 'Support-Fall melden',
            description:
                'Melde dich an oder registriere dich kostenlos, damit dein Fall sicher deinem Konto zugeordnet und später wieder angezeigt werden kann.',
            benefits: [
              'Serverbestätigte Case-ID erhalten',
              'Sichere Rückfragen und Updates bekommen',
              'Deinen Fall eindeutig deinem Konto zuordnen',
            ],
          ),
        );
        return;
      }
      if (!await _supportPrincipal.isCurrent(owner) || !mounted) return;
      final result = await _supportPrincipal.pushOwnedRoute<SupportFlowResult?>(
        context: context,
        owner: owner,
        route: MaterialPageRoute(
          builder: (_) => SupportFlowScreen(
            owner: owner,
            context: const SupportFlowContext(
              itemTitle: '',
              itemId: '',
              requestId: '',
              bookingStatus: 'general',
              source: SupportFlowSource.helpCenter,
              role: SupportFlowRole.renter,
            ),
            initialDescription: msg,
            submitter: widget.submitter,
          ),
        ),
      );
      if (result == null ||
          !await _supportPrincipal.isCurrent(owner) ||
          !mounted) {
        return;
      }
      _supportCtrl.clear();
    } catch (_) {
      if (owner == null ||
          !await _supportPrincipal.isCurrent(owner) ||
          !mounted) {
        return;
      }
      await _supportPrincipal.showOwnedDialog(
        context: context,
        owner: owner,
        builder: (_, dismiss) => AlertDialog(
          title: const Text('Support konnte nicht geöffnet werden'),
          content: const Text('Bitte versuche es erneut.'),
          actions: [TextButton(onPressed: dismiss, child: const Text('OK'))],
        ),
      );
    } finally {
      if (mounted) setState(() => _sendingSupport = false);
    }
  }

  Future<void> _openSupportCases() async {
    final owner = _supportPrincipal.capture();
    if (_supportPrincipal.loading || _supportPrincipal.invalidated) return;
    final hasSession = await (widget.sessionCheck?.call() ??
        AuthService.readSession().then((session) => session != null));
    if (!mounted || _supportPrincipal.invalidated) return;
    if (!hasSession) {
      await showGuestRestrictionSheet(
        context,
        overrideContent: const GuestGateContent(
          icon: Icons.folder_shared_outlined,
          title: 'Support-Fälle ansehen',
          description:
              'Melde dich an oder registriere dich kostenlos, damit nur du deine zugeordneten Support-Fälle sehen kannst.',
          benefits: [
            'Serverbestätigte Case-IDs wiederfinden',
            'Status und nächsten Schritt sicher ansehen',
            'Keine Falldaten ohne Kontozuordnung anzeigen',
          ],
        ),
      );
      return;
    }
    if (owner == null || !await _supportPrincipal.isCurrent(owner) || !mounted) {
      return;
    }
    await _supportPrincipal.pushOwnedRoute<void>(
        context: context,
        owner: owner,
        route: MaterialPageRoute(
          builder: (_) => SupportCasesScreen(
            owner: owner,
            listLoader: widget.caseListLoader,
            detailLoader: widget.caseDetailLoader,
          ),
        ));
  }

  Future<void> _openModerationDecisions() async {
    final hasSession = await (widget.sessionCheck?.call() ??
        AuthService.readSession().then((session) => session != null));
    if (!mounted) return;
    if (!hasSession) {
      await showGuestRestrictionSheet(
        context,
        overrideContent: const GuestGateContent(
          icon: Icons.gavel_outlined,
          title: 'Moderationsentscheidungen ansehen',
          description:
              'Melde dich an oder registriere dich kostenlos, damit nur du '
              'deine Entscheidungen und Begründungen sehen kannst.',
          benefits: [
            'Konkrete Begründungen sicher ansehen',
            'Umfang und Dauer nachvollziehen',
            'Kostenlose menschliche Prüfung beantragen',
          ],
        ),
      );
      return;
    }
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ModerationDecisionsScreen(
        loader: widget.moderationDecisionLoader,
        reviewSubmitter: widget.moderationReviewSubmitter,
      ),
    ));
  }
}

@immutable
class _HelpCategory {
  final String id;
  final IconData icon;
  final List<_HelpArticle> articles;
  const _HelpCategory(
      {required this.id, required this.icon, required this.articles});
}

@immutable
class _HelpArticle {
  final String id;
  final String title;
  final String short;
  final _HelpBody body;
  const _HelpArticle(
      {required this.id,
      required this.title,
      required this.short,
      required this.body});
}

@immutable
class _HelpBody {
  final String intro;
  final List<String> steps;
  final List<String> tips;
  const _HelpBody(
      {required this.intro, required this.steps, required this.tips});
}

@immutable
class _HelpSearchResult {
  final _HelpCategory category;
  final _HelpArticle article;
  const _HelpSearchResult({required this.category, required this.article});
}

class _HelpHeaderCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.30),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.support_agent, color: t.colorScheme.primary),
          const SizedBox(width: 10),
          Expanded(
              child: Text('Benötigst du Hilfe?',
                  style: t.textTheme.titleLarge?.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w800))),
        ]),
        const SizedBox(height: 8),
        Text(
          'Finde schnell Antworten zu Konto, Buchungen, Übergabe und Zahlungen. Wenn du nicht weiterkommst, kannst du unten den Support kontaktieren.',
          style: t.textTheme.bodyMedium
              ?.copyWith(color: Colors.white70, height: 1.5),
        ),
      ]),
    );
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  const _SearchField(
      {required this.controller,
      required this.focusNode,
      required this.onChanged,
      required this.onClear});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(children: [
        const SizedBox(width: 10),
        Icon(Icons.search, color: Colors.white.withValues(alpha: 0.70)),
        const SizedBox(width: 8),
        Expanded(
          child: MergeSemantics(
              child: Semantics(
            label: 'Hilfe durchsuchen',
            textField: true,
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              onChanged: onChanged,
              style: t.textTheme.bodyMedium?.copyWith(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Wie können wir dir helfen?',
                hintStyle:
                    t.textTheme.bodyMedium?.copyWith(color: Colors.white38),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          )),
        ),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 160),
          child: controller.text.trim().isEmpty
              ? const SizedBox(width: 42, height: 42)
              : IconButton(
                  key: const ValueKey('clear'),
                  tooltip: 'Sucheingabe löschen',
                  onPressed: onClear,
                  icon: const Icon(Icons.close),
                  color: Colors.white70,
                ),
        ),
      ]),
    );
  }
}

class _CategoriesPanel extends StatelessWidget {
  final List<_HelpCategory> categories;
  final Set<String> expandedCategories;
  final ValueChanged<String> onToggleCategory;
  final Future<void> Function(_HelpCategory, _HelpArticle) onOpen;
  const _CategoriesPanel(
      {super.key,
      required this.categories,
      required this.expandedCategories,
      required this.onToggleCategory,
      required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final cat in categories) ...[
        _HelpCategoryCard(
          category: cat,
          expanded: expandedCategories.contains(cat.id),
          onToggle: () => onToggleCategory(cat.id),
          onOpen: onOpen,
        ),
        const SizedBox(height: 12),
      ],
    ]);
  }
}

class _HelpCategoryCard extends StatelessWidget {
  final _HelpCategory category;
  final bool expanded;
  final VoidCallback onToggle;
  final Future<void> Function(_HelpCategory, _HelpArticle) onOpen;
  const _HelpCategoryCard(
      {required this.category,
      required this.expanded,
      required this.onToggle,
      required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final header = Row(children: [
      Icon(category.icon, color: Colors.white70),
      const SizedBox(width: 10),
      Expanded(
          child: Text(category.id,
              style: t.textTheme.titleMedium?.copyWith(
                  color: Colors.white, fontWeight: FontWeight.w800))),
      AnimatedRotation(
        duration: const Duration(milliseconds: 180),
        turns: expanded ? 0.5 : 0.0,
        curve: Curves.easeOut,
        child: const Icon(Icons.expand_more, color: Colors.white54),
      ),
    ]);

    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Column(children: [
        GestureDetector(
          onTap: onToggle,
          behavior: HitTestBehavior.opaque,
          child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
              child: header),
        ),
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 220),
          crossFadeState:
              expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          firstChild: const SizedBox.shrink(),
          secondChild: Column(children: [
            const Divider(height: 1, thickness: 1, color: Colors.white24),
            for (int i = 0; i < category.articles.length; i++) ...[
              _HelpArticleRow(
                title: category.articles[i].title,
                subtitle: category.articles[i].short,
                onTap: () => onOpen(category, category.articles[i]),
              ),
              if (i < category.articles.length - 1)
                const Divider(height: 1, thickness: 1, color: Colors.white24),
            ],
          ]),
        ),
      ]),
    );
  }
}

class _HelpArticleRow extends StatefulWidget {
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _HelpArticleRow(
      {required this.title, required this.subtitle, required this.onTap});

  @override
  State<_HelpArticleRow> createState() => _HelpArticleRowState();
}

class _HelpArticleRowState extends State<_HelpArticleRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          color: _hover
              ? Colors.white.withValues(alpha: 0.05)
              : Colors.transparent,
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.title,
                        style: t.textTheme.bodyMedium?.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(widget.subtitle,
                        style: t.textTheme.bodySmall
                            ?.copyWith(color: Colors.white70, height: 1.4)),
                  ]),
            ),
            const SizedBox(width: 10),
            const Padding(
              padding: EdgeInsets.only(top: 2),
              child: Icon(Icons.chevron_right, color: Colors.white38),
            ),
          ]),
        ),
      ),
    );
  }
}

class _SearchResultsPanel extends StatelessWidget {
  final List<_HelpSearchResult> results;
  final Future<void> Function(_HelpCategory, _HelpArticle) onOpen;
  const _SearchResultsPanel(
      {super.key, required this.results, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    if (results.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.28),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        ),
        child: Row(children: [
          const Icon(Icons.search_off_outlined, color: Colors.white70),
          const SizedBox(width: 10),
          Expanded(
              child: Text(
                  'Keine Treffer. Versuche andere Begriffe oder kontaktiere unten den Support.',
                  style: t.textTheme.bodyMedium
                      ?.copyWith(color: Colors.white70, height: 1.5))),
        ]),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
          child: Row(children: [
            const Icon(Icons.tune, color: Colors.white70, size: 20),
            const SizedBox(width: 8),
            Expanded(
                child: Text('Treffer',
                    style: t.textTheme.titleMedium?.copyWith(
                        color: Colors.white, fontWeight: FontWeight.w800))),
            Text('${results.length}',
                style: t.textTheme.labelSmall?.copyWith(color: Colors.white60)),
          ]),
        ),
        const Divider(height: 1, thickness: 1, color: Colors.white24),
        for (int i = 0; i < results.length; i++) ...[
          _SearchResultRow(result: results[i], onOpen: onOpen),
          if (i < results.length - 1)
            const Divider(height: 1, thickness: 1, color: Colors.white24),
        ],
      ]),
    );
  }
}

class _SearchResultRow extends StatefulWidget {
  final _HelpSearchResult result;
  final Future<void> Function(_HelpCategory, _HelpArticle) onOpen;
  const _SearchResultRow({required this.result, required this.onOpen});

  @override
  State<_SearchResultRow> createState() => _SearchResultRowState();
}

class _SearchResultRowState extends State<_SearchResultRow> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cat = widget.result.category;
    final a = widget.result.article;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => widget.onOpen(cat, a),
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          color: _hover
              ? Colors.white.withValues(alpha: 0.05)
              : Colors.transparent,
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(cat.icon, color: Colors.white70, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.title,
                        style: t.textTheme.bodyMedium?.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(cat.id,
                        style: t.textTheme.labelSmall
                            ?.copyWith(color: Colors.white60)),
                    const SizedBox(height: 4),
                    Text(a.short,
                        style: t.textTheme.bodySmall
                            ?.copyWith(color: Colors.white70, height: 1.4)),
                  ]),
            ),
            const SizedBox(width: 10),
            const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(Icons.chevron_right, color: Colors.white38)),
          ]),
        ),
      ),
    );
  }
}

class _HelpArticleSheet extends StatelessWidget {
  final _HelpCategory category;
  final _HelpArticle article;
  const _HelpArticleSheet({required this.category, required this.article});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: BoxDecoration(
          color: const Color(0xFF0B1220).withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.82),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(category.icon, color: t.colorScheme.primary),
            const SizedBox(width: 10),
            Expanded(
                child: Text(article.title,
                    style: t.textTheme.titleLarge?.copyWith(
                        color: Colors.white, fontWeight: FontWeight.w900))),
            IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.close),
                color: Colors.white70),
          ]),
          const SizedBox(height: 4),
          Text(category.id,
              style: t.textTheme.labelSmall?.copyWith(color: Colors.white60)),
          const SizedBox(height: 12),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(article.body.intro,
                        style: t.textTheme.bodyMedium
                            ?.copyWith(color: Colors.white70, height: 1.55)),
                    const SizedBox(height: 14),
                    _SheetSectionTitle('So geht’s'),
                    const SizedBox(height: 8),
                    for (int i = 0; i < article.body.steps.length; i++) ...[
                      _BulletLine(index: i + 1, text: article.body.steps[i]),
                      const SizedBox(height: 8),
                    ],
                    if (article.body.tips.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _SheetSectionTitle('Tipps'),
                      const SizedBox(height: 8),
                      for (final tip in article.body.tips) ...[
                        _TipCard(text: tip),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ]),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => Navigator.of(context).maybePop(),
              icon: const Icon(Icons.check),
              label: const Text('Verstanden'),
            ),
          ),
        ]),
      ),
    );
  }
}

class _SheetSectionTitle extends StatelessWidget {
  final String text;
  const _SheetSectionTitle(this.text);
  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: Theme.of(context)
            .textTheme
            .titleMedium
            ?.copyWith(color: Colors.white, fontWeight: FontWeight.w900));
  }
}

class _BulletLine extends StatelessWidget {
  final int index;
  final String text;
  const _BulletLine({required this.index, required this.text});
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
            color: t.colorScheme.primary.withValues(alpha: 0.20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
                color: t.colorScheme.primary.withValues(alpha: 0.35))),
        child: Center(
            child: Text('$index',
                style: t.textTheme.labelSmall?.copyWith(
                    color: Colors.white, fontWeight: FontWeight.w900))),
      ),
      const SizedBox(width: 10),
      Expanded(
          child: Text(text,
              style: t.textTheme.bodyMedium
                  ?.copyWith(color: Colors.white70, height: 1.55))),
    ]);
  }
}

class _TipCard extends StatelessWidget {
  final String text;
  const _TipCard({required this.text});
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.lightbulb_outline,
            color: t.colorScheme.primary.withValues(alpha: 0.95), size: 20),
        const SizedBox(width: 10),
        Expanded(
            child: Text(text,
                style: t.textTheme.bodyMedium
                    ?.copyWith(color: Colors.white70, height: 1.5))),
      ]),
    );
  }
}

class _SupportCard extends StatelessWidget {
  final TextEditingController controller;
  final bool sending;
  final ValueChanged<String> onChanged;
  final VoidCallback? onSend;
  final VoidCallback onOpenCases;
  const _SupportCard(
      {required this.controller,
      required this.sending,
      required this.onChanged,
      required this.onSend,
      required this.onOpenCases});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final msg = controller.text.trim();
    final tooShort = msg.isNotEmpty && msg.runes.length < 20;
    final canSend = onSend != null && msg.runes.length >= 20;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.30),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(
          'Beschreibe kurz dein Anliegen. Danach folgen zuerst die Sicherheitsfrage und eine passende Kategorie. Ein Fall gilt erst mit serverbestätigter Case-ID als eingegangen.',
          style: t.textTheme.bodySmall
              ?.copyWith(color: Colors.white70, height: 1.5),
        ),
        const SizedBox(height: 12),
        MergeSemantics(
            child: Semantics(
          label: 'Support-Anliegen',
          textField: true,
          child: TextField(
            controller: controller,
            maxLength: 1400,
            maxLines: 4,
            minLines: 3,
            onChanged: onChanged,
            style: t.textTheme.bodyMedium?.copyWith(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Beschreibe dein Anliegen…',
              hintStyle:
                  t.textTheme.bodyMedium?.copyWith(color: Colors.white38),
              filled: true,
              fillColor: Colors.black.withValues(alpha: 0.20),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide:
                      BorderSide(color: Colors.white.withValues(alpha: 0.10))),
              enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide:
                      BorderSide(color: Colors.white.withValues(alpha: 0.10))),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(
                      color: t.colorScheme.primary.withValues(alpha: 0.65))),
            ),
          ),
        )),
        if (tooShort) ...[
          const SizedBox(height: 8),
          Text('Bitte mindestens 20 Zeichen – so können wir schneller helfen.',
              style: t.textTheme.bodySmall
                  ?.copyWith(color: Colors.white60, height: 1.35)),
        ],
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: canSend ? onSend : null,
            icon: sending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.support_agent_outlined),
            label: Text(sending
                ? 'Support wird geöffnet…'
                : 'Support-Fall sicher melden'),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            key: const ValueKey('support_cases_open'),
            onPressed: onOpenCases,
            icon: const Icon(Icons.folder_shared_outlined),
            label: const Text('Meine Support-Fälle'),
          ),
        ),
      ]),
    );
  }
}
