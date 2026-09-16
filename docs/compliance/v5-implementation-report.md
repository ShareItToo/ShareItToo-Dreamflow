# ShareItToo V5.1 - Umsetzungsbericht

Stand: 17.08.2026, lokaler Checkpoint 16.169

## Verbindliche Grenzen

- Der unveränderte, offiziell über Google Play Internal ausgelieferte Kandidat
  ist `1.0.0+2026081509`.
- Der neuere Kandidat `1.0.0+2026081510` wurde lokal kanonisch signiert,
  geprüft und privat archiviert. Er wurde nicht hochgeladen und ist deshalb
  weder Play-Kandidat noch Store-, Closed-Test- oder Produktionsnachweis.
- Spätere Quelländerungen sind ohne neue eindeutige Buildidentität kein
  Kandidaten- oder Store-Nachweis.
- Echtgeld, produktive Zahlungen, öffentliche Rechtstexte, Produktion und
  Store-Einreichung bleiben gesperrt.
- Firebase Cloud Messaging und Firebase Crashlytics bleiben Bestandteil des
  Launchumfangs. Sie sind getrennte freiwillige Dienste, im nächsten
  Kandidaten standardmäßig aus; Push aktiviert Crashlytics nicht.
- Werbung, Marketingtracking, allgemeine Analytics und externe generative KI
  bleiben aus, solange sie nicht separat entschieden und geprüft wurden.

## Umgesetzt und technisch geprüft

- V5.1-Nachfolgemapping für die sechs früher offenen V4-Entscheidungen
- serverseitiges, zehn Minuten gültiges und manipulationsgeschütztes Angebot
- Plattformvertrag mit genau zwei ausdrücklichen Erklärungen
- unveränderlicher, authentifizierter HTML-Vertragsbeleg
- V5.1-Widerruf, getrennte Erstattungsobligationen und Stornoregeln
- rollen- und buchungsgebundene Übergabe-/Rückgabefotos mit Gegenbestätigung
- neutrale Rückgabezeitachse bis T0+5 sowie begründete Fallfristen
- exakter, hashgebundener Satz aus sieben deutschen V5.1-Rechtsassets
- unveränderliche Finanzdokumente ausschließlich aus erfolgreich erfassten
  Zahlungs-, Erstattungs- und Auszahlungssnapshots
- getrennte Darstellung von privatem Mietpreis und SIT-Plattformgebühr ohne
  pauschalen 19-%-Umsatzsteuerausweis auf die private Miete
- authentifizierter Belegdownload mit serverseitiger und clientseitiger
  Hashbindung; unbekannte Typen, falsche Summen und unvollständige Snapshots
  werden geschlossen abgelehnt

## Finanzdokument-Boundary

Vor einem tatsächlich erfolgreichen Quellereignis entsteht kein Beleg. Der
Mieter erhält nach erfolgreicher Zahlung eine Buchungs-/Zahlungsübersicht und
gegebenenfalls einen separaten SIT-Gebührenbeleg. Der Vermieter erhält keine
SIT-Gebührenrechnung, sondern erst nach einer tatsächlich ausgeführten
Auszahlung einen Auszahlungsnachweis. Ein Erstattungsbeleg entsteht erst nach
erfolgreicher Erstattung und weist Mietpreis und SIT-Gebühr mit getrennten
Schuldnern aus.

Die Datenbank erzwingt Dokumenttyp, Quellobjekt, Rollen und Summengleichungen.
Dokumente und Downloadereignisse sind append-only. Die Release-App bezieht die
Liste authentifiziert vom Backend, ruft vor PDF-Darstellung den exakten
Serverbeleg ab und vergleicht dessen Hash mit dem unveränderlichen Snapshot.
Nur der ausdrücklich markierte QA-Modus darf lokale Testbelege erzeugen; diese
tragen sichtbar `TESTBELEG` und sind weder Echtgeld- noch Steuerbelege.

Echtbetrieb bleibt zusätzlich geschlossen, bis Betreiber-/Steuerangaben,
SIT-Gebühren-Steuerbehandlung und Live-Ausstellung ausdrücklich freigegeben
sind. Migration 020 wurde nicht auf Staging oder Produktion angewandt; dieser
Checkpoint ist Quell- und Teststand, kein Deployment.

## Rechtsasset-Boundary

Der V5.1-Satz wird aus genau der 54-seitigen Quelle mit SHA-256
`587bfd9e53539e5895c3d9dcb6fc437e0bf7c6e91db144841d0fe986b274b3fc`
reproduzierbar erzeugt. Das Manifest bindet jede Datei an ihren Inhalts-Hash.
Es bleibt `draft-blocked`, kann nicht veröffentlicht und nicht in
`legal_document_snapshots` provisioniert werden.

Die Quelle behauptet auf Seite 38 noch, dass externe Push- und Crashdienste im
Startbetrieb deaktiviert seien. Ein klar abgegrenzter Nachtrag bindet jetzt die
spätere Produktentscheidung vom 17.08.2026: FCM und Crashlytics bleiben
unabhängig, freiwillig und standardmäßig aus; Push aktiviert Crash nicht. Der
Quelltext bleibt unverändert sichtbar und der Nachtrag ersetzt ausschließlich
diese zwei alten Startaussagen. Das ist keine Aktivierungsfreigabe. Anbieter-,
Vertrags-, Regions-, Transfer-, Einwilligungs-, Aufbewahrungs-, Lösch- und
Store-Nachweise bleiben getrennt je Dienst zu schließen.

## Offene Tatsachen und Gates

- vollständige Betreiber-/Register-/Steuerangaben
- finale öffentliche Widerrufs-URL
- Hosting-, SMTP- und Kartenanbieter samt Regionen
- lizenzierter Marketplace-PSP samt Vertrag, Region und Geldfluss
- Firebase Push-/Crash-Vertrags-, Regions-, Transfer- und Betreiberfreigaben
- neun Aufbewahrungs-/Löschentscheidungen
- vier reale physische Gerätematrix-Fälle
- Play-ausgelieferter Nachfolgekandidat und vollständige Store-Kandidatenbindung
- unabhängige Rechts-/Produktprüfung, soweit verfügbar

Bis diese Punkte belegt sind, bleibt Go/No-Go auf `HOLD`.

Die neun Aufbewahrungs-/Löschfragen sind in Checkpoint 16.127 nicht mehr ein
undifferenzierter Block: Für jede Entscheidung liegen jetzt Klassifikation,
Empfehlung, Implementierungsstand und belastbare Quellen vor. Zwei Regeln sind
technisch beziehungsweise betrieblich entscheidungsreif (Credential-Purge und
14-Tage-Backuprotation). Die übrigen Regeln bleiben bewusst offen, bis ihre
Betreiber-/Rechtsgrundlage bestätigt ist. Keine kategorieweise Löschung wurde
aktiviert.

## Prüfstand Checkpoint 16.126

- Backend: 198 bestanden, 1 PostgreSQL-Integrationstest ohne lokale
  `TEST_DATABASE_URL` bewusst übersprungen
- Flutter: 275 bestanden, 1 bewusster Skip
- Analyzer: 229 Hinweise, 0 Fehler
- technische Node-/Vertragsprüfungen: 607 bestanden
- Finanzdokument-spezifisch: 7 Backend-, 3 Modell-/Fail-closed- und 4
  Verkabelungstests bestanden
- Rechtsasset-Validator: 6 bestanden
- Datenschutz-, Rechts-, Retention-, Store- und Release-Gates: grün und
  weiterhin fail-closed
- Web-Debug-Build: grün
- Android-Debug-Build: grün

Dieser Bericht beschreibt den Quell- und Prüfstand. Er ist keine Freigabe für
Produktion, Echtgeld, öffentliche Verträge oder Store-Review.

## Prüfstand Checkpoint 16.127

- alle neun Retention-/Löschentscheidungen einzeln vorbereitet, keine als
  beschlossen ausgegeben
- maschinenlesbarer Beleg und lesbare Entscheidungsmatrix gebunden
- FCM-Push und Firebase Crashlytics ausdrücklich erhalten: getrennte
  freiwillige Opt-ins, beide standardmäßig aus, keine Kopplung
- abgelaufene Zugangsdaten: bestehende automatische Bereinigung mit Startlauf,
  Sechs-Stunden-Takt und maximal vorgeschlagenem 24-Stunden-Abschlussfenster
- Backups: bestehende 14-Tage-Rotation als Betreiberentscheidung vorbereitet;
  keine falsche Behauptung kontobezogener Einzellöschung aus alten Backups
- HGB-, AO-, BGB- und BfDI-Quellen gebunden; keine pauschale Rechtsfrist auf
  fachlich unterschiedliche Daten übertragen
- Retention-/Datenschutz-/V5.1-Validatoren grün und weiterhin fail-closed
- vollständige Node-Prüfsuite: 611 bestanden, 0 fehlgeschlagen
- bestehender Kandidat, Staging, Produktion, Store, Echtgeld und öffentliche
  Rechtstexte unverändert

## Prüfstand Checkpoint 16.131

- alle Flutter-Bilddarsteller nutzen jetzt zentral `AppImage`; direkte
  `Image.network`-/`NetworkImage`-Umgehungen außerhalb dieses kontrollierten
  Darstellers sind entfernt
- ein signierter Release lädt ausschließlich Bilder aus dem authentifizierten
  SIT-Uploadspeicher; beliebige externe Hosts und unbekannte Schemas enden
  neutral und ohne Netzabruf
- lokale Debug-/QA-Demos behalten ihren ausdrücklich auf Nicht-Release-Builds
  begrenzten externen Bildpfad
- `backend_config.dart` und `app_image.dart` sind als datenschutzrelevante
  Quellen hashgebunden; der Datenschutzvalidator bleibt `draft` und
  fail-closed
- 277 Flutter-Tests bestanden bei einem bewussten Skip; 618 Tooltests,
  Android-Debug-Build und Web-Debug-Build bestanden; der Analyzer bleibt bei
  229 Hinweisen und 0 Fehlern
- FCM-Push und Firebase Crashlytics bleiben unverändert erhalten: getrennte,
  freiwillige, standardmäßig ausgeschaltete Entscheidungen; Push aktiviert
  Crashlytics nicht
- bestehender Kandidat `1.0.0+2026081509`, Staging, Produktion, Store,
  Echtgeld und öffentliche Rechtstexte blieben unverändert. Nachweis:
  `docs/evidence/b11/v51-release-image-origin-policy-20260817.json`

## Prüfstand Checkpoint 16.132

- der unveränderte Play-Internal-Kandidat `1.0.0+2026081509` wurde auf dem
  physischen Pixel 7 Pro ohne TalkBack bei 200-Prozent-Schrift auf allen fünf
  Hauptflächen geprüft
- Erkunden, Wunschlisten, Buchungen, Nachrichten, Profil und die
  Hauptnavigation renderten; Wunschlistentitel und zentrale Profilfakten
  wurden im bestehenden Kandidaten jedoch sichtbar gekürzt
- der Großtext-Fall bleibt deshalb ehrlich `testing` beziehungsweise nicht
  bestanden; TalkBack-Traversierung bleibt als eigener Nachweis offen
- die Quelle schaltet Wunschlisten ab 160 Prozent auf eine einspaltige,
  höhenangepasste Darstellung mit zwei Titelzeilen und stapelt im Profil
  Identität und ungekürzte Kennzahlen vertikal
- zwei neue 200-Prozent-Widgettests und vier fail-closed
  Verkabelungstests sichern die Korrektur; vollständige Regressionen ergaben
  279 Flutter-Tests plus einen bewussten Skip und 622 Tooltests ohne Fehler
- Analyzer unverändert 229 Hinweise bei 0 Fehlern; Android- und
  Web-Debug-Build bestanden
- der Quellfix ist noch kein physischer Pass: Er benötigt einen neuen,
  eindeutig gebundenen signierten Kandidaten und erneute Geräteprüfung
- FCM-Push und Firebase Crashlytics blieben unverändert erhalten, getrennt,
  freiwillig und standardmäßig aus; Push aktiviert Crashlytics nicht
- Produktion, Store, Echtgeld, öffentliche Rechtstexte und der bestehende
  Kandidat blieben unverändert. Nachweis:
  `docs/evidence/b11/android-large-text-physical-2026081509-20260817T053900Z.json`

## Prüfstand Checkpoint 16.133

- auf dem unveränderten Play-Internal-Kandidaten wurden die Konto- und
  Moderationsoberflächen mit einem synthetischen Konto physisch geprüft
- die Kontolöschung zeigte Voraussetzungen und Unwiderruflichkeit und wurde
  sicher abgebrochen; kein Konto wurde gelöscht
- die Blockliste war erreichbar; der private Datenexport öffnete die
  Android-Freigabeoberfläche, die ohne Zielauswahl geschlossen wurde
- das synthetische Gegenprofil bot Melden und Blockieren; die Meldegründe
  waren erreichbar, ohne eine Meldung abzusenden
- die App verweigerte das Blockieren korrekt, solange Übergabe oder Rückgabe
  noch nicht vollständig abgeschlossen waren; niemand wurde blockiert
- der Gesamtfall bleibt `testing`: erfolgreiche UI-Blockierung mit Rücknahme
  und tatsächliche UI-Löschung eines neuen Wegwerfkontos sind noch offen
- serverseitige Nachweise für Melden, Blockieren mit Rücknahme, privaten Export
  und isolierte Wegwerf-Kontolöschung bleiben gültig
- FCM-Push und Firebase Crashlytics blieben unverändert erhalten, getrennt,
  freiwillig und standardmäßig aus; Push aktiviert Crashlytics nicht
- Produktion, Store, Echtgeld, öffentliche Rechtstexte und der bestehende
  Kandidat blieben unverändert. Nachweis:
  `docs/evidence/b11/android-moderation-account-ui-2026081509-20260817T061138Z.json`

## Prüfstand Checkpoint 16.134

- der Crashlytics-Restnachweis wurde auf dem unveränderten Play-Kandidaten
  gezielt und ohne Crashereignis vorgeprüft
- dessen Benachrichtigungseinstellungen enthalten noch die ältere
  Feed-Steuerung, aber nicht die später implementierten getrennten freiwilligen
  Gerätedienst-Schalter für Push und Crashdiagnose
- der exakt begrenzte kalte App-Link für
  `b11-android-2026081509` endete erwartungsgemäß mit `Diagnose gesperrt`;
  es wurde kein kontrolliertes oder produktives Crashereignis erzeugt
- Mapping, native Symbole, Cache-Drain und sichtbare exakte
  Crashlytics-Releasezuordnung bleiben bestanden; nur das kontrollierte,
  bereinigte Ereignis bleibt offen
- der nächste Kandidat muss die unabhängigen, standardmäßig ausgeschalteten
  Einwilligungen enthalten, genau einen Staging-Lauf kompilieren und nach
  freiwilliger Aktivierung die exakte Console-Zuordnung beweisen; danach wird
  Crashdiagnose wieder ausgeschaltet
- Push blieb unangetastet und aktiviert Crashlytics weiterhin nicht
- Produktion, Store, Echtgeld, öffentliche Rechtstexte und der bestehende
  Kandidat blieben unverändert. Nachweis:
  `docs/evidence/b11/android-crash-controlled-event-gate-2026081509-20260817T061900Z.json`

## Prüfstand Checkpoint 16.135

- der lokale Plan für den nächsten konsolidierten internen Kandidaten wurde
  verschärft; gebaut oder hochgeladen wurde noch nichts
- `2026081510` ist ausschließlich für Google-Anmeldung, internen Kanal und
  isoliertes Staging zulässig; Apple, Facebook, Produktion, Store-Einreichung
  und Echtgeld bleiben geschlossen
- FCM-Push und Firebase Crashlytics sind als getrennte, freiwillige und
  standardmäßig ausgeschaltete Dienste verbindlich im Kandidatenvertrag
  erhalten
- der Build wird technisch verweigert, solange nicht genau der
  buildgebundene bereinigte Crashlauf `b11-android-2026081510` aktiviert ist
- Großtextkorrektur für Wunschlisten und Profil muss enthalten bleiben;
  V5.1-Rechtsassets bleiben `draft-blocked`
- 14 Plan-, Rollover-, Provider-, Crash- und Fail-closed-Tests bestanden; der
  aktuelle Stand bleibt bewusst `prepared-not-built`, weil die Buildnummer
  noch unverändert `2026081509` ist
- Produktion, Store, Echtgeld, öffentliche Rechtstexte und der bestehende
  Kandidat blieben unverändert. Nachweis:
  `docs/evidence/b11/next-candidate-safety-contract-2026081510-20260817.json`

## Prüfstand Checkpoint 16.136

- der konsolidierte interne Android-Kandidat `1.0.0+2026081510` wurde aus
  Commit `4cb004641391efe40fa2bf89f62da11bc1f71291` gebaut, kanonisch signiert,
  binär auf Datenschutz geprüft und im privaten unveränderlichen Archiv
  abgelegt
- AAB und APK sind lokal vorhanden; es erfolgte kein Upload, keine
  Store-Einreichung, keine Closed-Test-Änderung, keine Produktion und kein
  Echtgeldvorgang
- vollständige Regression: 279 Flutter-Tests bestanden, 1 bewusster Skip,
  Analyzer 229 Hinweise und 0 Fehler, Web- und Android-Debug-Build grün sowie
  14/14 Kandidaten-/Rollover-Tests grün
- der Kandidat wurde nach der erwarteten Signaturabweichung zur installierten
  Play-Version direkt auf dem Pixel 7 Pro installiert; Kaltstart und
  Staging-Feed bestanden
- Push und Crashdiagnose waren nach Neuinstallation getrennt sichtbar und
  beide standardmäßig aus; Push wurde mit eigenem Einwilligungsdialog
  aktiviert, Crash blieb dabei aus, anschließend wurde Push wieder
  ausgeschaltet
- Endzustand auf dem Testgerät: Push aus, Crashdiagnose aus; die Android-
  Benachrichtigungsberechtigung wurde beim Push-Grenztest erteilt
- der kontrollierte bereinigte Crashlauf `b11-android-2026081510` wurde noch
  nicht übertragen, weil dafür eine separate ausdrückliche Freigabe für die
  technische Firebase-Datenübertragung erforderlich ist
- GO/NO-GO bleibt `HOLD`. Nachweis:
  `docs/evidence/b11/android-candidate-2026081510-build-and-device-services-20260817.json`

## Prüfstand Checkpoint 16.137

- die Großtextkorrektur wurde auf dem physischen Pixel 7 Pro mit dem exakten
  Kandidaten `2026081510` und Android-Schriftgröße 200 % geprüft
- Wunschlisten wechseln sichtbar in das einspaltige Layout; „Demnächst
  benötigt“, Leerzustand und Navigation sind vollständig lesbar
- das Profil stapelt Identität und Kennzahlen; Bewertung, Buchungen,
  „Dabei seit“ und Anzeigenzahl sind ohne Ellipse oder Abschneiden sichtbar
- private lokale Screenshots wurden nur gehasht und nicht ins Repository
  übernommen
- Schriftgröße `0.85`, deaktivierte Bedienungshilfe und automatische Drehung
  wurden danach verifiziert wiederhergestellt
- TalkBack bleibt als eigenständiger manueller Bedienungshilfe-Test offen und
  wird durch diesen Großtext-Pass nicht vorweggenommen. Nachweis:
  `docs/evidence/b11/android-large-text-physical-2026081510-20260817T070236Z.json`

## Prüfstand Checkpoint 16.138

- Google TalkBack wurde auf dem physischen Pixel kurz gebunden; Android
  bestätigte gesprochenes Feedback und das fokussierte ShareItToo-Fenster
- Erkunden, Kategorien, Inserate und alle fünf Hauptnavigationseinträge waren
  mit aussagekräftigen Semantikbeschriftungen im Kandidaten sichtbar
- eine simulierte horizontale Geste öffnete jedoch das Android-Systemmenü und
  bewies keine verlässliche TalkBack-Fokusnavigation; deshalb bleiben
  sequentielle gesprochene Navigation und Doppeltipp-Aktivierung offen
- das Systemmenü wurde sofort geschlossen; TalkBack, Accessibility und
  Touch-Erkundung wurden vollständig deaktiviert. Schriftgröße `0.85`,
  automatische Drehung und null gebundene Accessibility-Dienste wurden
  verifiziert
- der Versuch wird ausdrücklich nicht als TalkBack-Pass gewertet. Nachweis:
  `docs/evidence/b11/android-talkback-bounded-probe-2026081510-20260817T071110Z.json`

## Prüfstand Checkpoint 16.139

- auf dem physischen Pixel und Kandidaten `2026081510` waren Google, Apple
  und Facebook als Anmeldeoptionen sichtbar
- Google öffnete die echte Android-Google-Kontoauswahl; es wurde bewusst kein
  privates Konto ausgewählt, keine Anmeldung abgeschlossen und keine
  Kontokennung erfasst
- Apple und Facebook blieben wie vorgesehen geschlossen und zeigten jeweils
  den klaren SIT-Hinweis, vorübergehend E-Mail zu verwenden
- das synthetische Staging-Testkonto wurde anschließend ohne Ausgabe von
  Zugangsdaten wiederhergestellt
- private lokale Screenshots wurden ausschließlich gehasht und nicht ins
  Repository übernommen
- Push und Crashdiagnose bleiben verbindlich erhalten, getrennt, freiwillig
  und standardmäßig aus; dieser Test änderte keinen der beiden Dienste und
  übertrug keine Crashdaten
- die vollständige Google-Anmeldung bleibt offen, bis eine ausdrücklich dafür
  freigegebene private oder dedizierte Testidentität ausgewählt werden darf.
  Nachweis:
  `docs/evidence/b11/android-social-auth-google-only-2026081510-20260817T072343Z.json`

## Prüfstand Checkpoint 16.140

- der Umsetzungsbericht trennt jetzt ausdrücklich den unveränderten
  Google-Play-Internal-Kandidaten `2026081509` vom lokal signierten,
  geprüften und privat archivierten Kandidaten `2026081510`
- `2026081510` bleibt `built-local-not-uploaded`; daraus wird weder ein
  Play-, Closed-Test-, Store- noch Produktionsnachweis abgeleitet
- das noch offene Kandidatengate verlangt deshalb nicht erneut irgendeinen
  signierten Build, sondern einen tatsächlich über Play ausgelieferten
  Nachfolgekandidaten mit vollständiger Store-Bindung
- Push und Crashdiagnose bleiben in beiden Kandidatengrenzen erhalten,
  getrennt, freiwillig und standardmäßig aus; Push aktiviert Crash nicht
- es erfolgte kein neuer Build, kein Upload und keine externe Änderung.
  Gebundene Nachweise:
  `docs/evidence/b11/android-candidate-2026081510-build-and-device-services-20260817.json`
  und `store/google-only-next-candidate.json`

## Prüfstand Checkpoint 16.141

- die Löschmatrix bildet die Produktentscheidung jetzt korrekt ab: FCM-Push
  und Firebase Crashlytics bleiben verbindlich Bestandteil von SIT
- beide Dienste bleiben getrennt, freiwillig und standardmäßig aus; Push darf
  Crashdiagnose niemals automatisch aktivieren
- die Aufnahmeentscheidung wird nicht fälschlich als Datenschutz- oder
  Löschfreigabe gewertet: Transfergrundlage, Region, Vertrag, Storeangaben,
  Anbieterfristen sowie lokaler Opt-out- und Löschablauf bleiben je Dienst offen
- Firebase Authentication und Google Maps bleiben zusätzlich als eigene
  Anbieterentscheidungen abzugrenzen
- alle neun Aufbewahrungs-/Löschentscheidungen bleiben deshalb formal offen;
  keine Löschroutine, Produktion, Store-Angabe oder externe Übertragung wurde
  durch diesen Dokumentationsschritt aktiviert.

## Prüfstand Checkpoint 16.142

- im echten Backendpfad zeigt die Auswahl des Mietzeitraums keinen lokal
  berechneten Gesamtpreis mehr als verbindlichen Betrag an
- der verbindliche Gesamtpreis wird erst nach „Weiter“ im Checkout über ein
  frisches, zeitlich begrenztes Serverangebot geladen; ändert sich dieses
  Angebot, muss der Nutzer es erneut ausdrücklich bestätigen
- nur der ausdrücklich gebundene lokale QA-Modus darf weiterhin eine lokale
  Vorschau anzeigen; sie ist sichtbar als unverbindliche QA-Vorschau markiert
- der Checkout bleibt geschlossen, wenn das Angebot abgelaufen ist, keine
  Zahlungsart gewählt wurde oder eine der beiden Erklärungen fehlt
- Lieferung, Rückgabeabholung und Express bleiben im gebundenen Serverangebot
  ausgeschaltet; sie werden nicht stillschweigend in den Preis aufgenommen
- 4/4 neue Preis-Wiring-Tests, 61 gezielte Flutter-Tests und die vollständige
  Regression mit 268 bestandenen Tests, 1 bewusstem Skip, 229 Analyzer-
  Hinweisen bei 0 Fehlern sowie grünen Web- und Android-Debug-Builds bestanden
- der Quellstand wurde nicht als Kandidat neu gebaut, umbenannt oder
  hochgeladen. Google Play Internal bleibt unverändert bei `2026081509`; der
  lokale signierte Kandidat `2026081510` bleibt `built-local-not-uploaded`
- Push und Crashdiagnose bleiben erhalten, getrennt, freiwillig und
  standardmäßig aus; dieser Meilenstein änderte keinen Dienst und übertrug
  keine Crashdaten. Nachweis:
  `docs/evidence/b11/v51-selected-range-server-price-truth-20260817T074500Z.json`

## Prüfstand Checkpoint 16.143

- das vollständige, unveränderliche Serverpreis-Abbild wird jetzt vom
  Backendangebot über die Buchungsanfrage bis in alle Buchungsdetailwege
  erhalten: Tage, Tagespreis, Grundmiete, Rabatt, private Mietsumme,
  Plattformbeitrag, Gesamtbetrag, Vermieterauszahlung und Währung
- Buchungsliste, Benachrichtigungen, Chat und App-Links reichen dieselben
  gebundenen Werte weiter; kein Detailweg darf den Plattformbeitrag aus dem
  bereits inklusive Beitrag gespeicherten Gesamtbetrag schätzen
- ein Preis-Abbild gilt nur, wenn es aus ganzzahligen Cent-Beträgen besteht,
  `Mietsumme + Plattformbeitrag = Gesamtbetrag` erfüllt und die optionale
  Vermieterauszahlung exakt der privaten Mietsumme entspricht
- bei einem gültigen Serverpreis werden alte Liefer-, Rückhol- oder
  Prioritätsbeträge nicht zusätzlich in die Launch-Preisanzeige gerechnet
- unvollständige ältere Buchungen und ausdrücklich lokale QA-Buchungen behalten
  ihre bisherige Darstellung; sie werden nicht fälschlich zu einem
  verbindlichen V5.1-Serverpreis hochgestuft
- 5/5 neue Snapshot-Wiring-Tests, zusammen 9/9 Preis-Wiring-Tests, 58 gezielte
  Flutter-Tests, 39 Datenschutz-/Löschtests und die vollständige Regression
  mit 269 bestandenen Tests, 1 bewusstem Skip, 229 Analyzer-Hinweisen bei
  0 Fehlern sowie grünen Web- und Android-Debug-Builds bestanden
- der Quellstand wurde nicht deployt, hochgeladen, als Kandidat neu gebaut oder
  umbenannt. Google Play Internal bleibt unverändert bei `2026081509`; der
  lokale signierte Kandidat `2026081510` bleibt `built-local-not-uploaded`
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Dieser Meilenstein änderte
  keinen der beiden Dienste und übertrug keine Crashdaten. Nachweis:
  `docs/evidence/b11/v51-booking-detail-server-price-snapshot-20260817T081200Z.json`

## Prüfstand Checkpoint 16.144

- der Checkout übernimmt einen Serverpreis erst dann als verbindliche Anzeige,
  wenn alle Geldwerte ganzzahlige Centbeträge sind und der Preis vollständig
  in sich stimmt
- der Parser verlangt für den Privatlaunch EUR, 1 bis 365 Miettage,
  `Tagespreis × Tage = Grundmiete`, `Grundmiete − Rabatt = Mietsumme`, den
  exakt einmal centgenau berechneten 10-%-Plattformbeitrag und
  `Mietsumme + Plattformbeitrag = Gesamtbetrag`
- formal gültig aussehende, aber rechnerisch widersprüchliche Antworten sowie
  Nicht-EUR-Preise werden geschlossen verworfen und gelangen nicht in den
  bestätigbaren Checkout-Zustand
- 13/13 Preis-Wiring-Tests, 10 gezielte Flutter-Tests und ein gezielter
  Analyzerlauf mit 0 Hinweisen bestanden; die vollständige Regression blieb
  mit 270 bestandenen Tests, 1 bewusstem Skip, 229 Analyzer-Hinweisen bei
  0 Fehlern sowie grünen Web- und Android-Debug-Builds vollständig grün
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-checkout-server-quote-validation-20260817T082300Z.json`

## Prüfstand Checkpoint 16.145

- das vollständige Preis-Abbild bleibt jetzt auch beim isolierten lokalen
  QA-Speicherweg erhalten: Tage, Tagespreis, Grundmiete, Rabatt, Mietsumme,
  Plattformbeitrag, Gesamtbetrag, Vermieterauszahlung und Währung
- der echte Backendpfad bleibt davon getrennt und ersetzt die lokale Eingabe
  weiterhin durch die authentifizierte Serverbuchung; QA wird nicht zu einem
  Produktions-, Echtgeld- oder Servernachweis hochgestuft
- 3/3 neue Persistenz-Wiring-Tests, 51 gezielte Buchungs-/Checkout-Tests und
  19 Datenschutzprüfungen bestanden; der gezielte Analyzer erzeugte keine
  neuen Hinweise
- die vollständige Regression blieb mit 270 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- die Datenschutz-Inventarbindung wurde auf den neuen Quellhash aktualisiert;
  Erhebungszweck, Transport, Anbieter und Berechtigungen änderten sich nicht
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-local-quote-snapshot-persistence-20260817T083200Z.json`

## Prüfstand Checkpoint 16.146

- die Vermieterannahme rekonstruiert und prüft jetzt erneut exakt dasselbe
  vollständige Preis-Abbild, das beim Mieter gebunden und in der Buchung
  gespeichert wurde; auch die Vermieterauszahlung muss der privaten Mietsumme
  entsprechen
- fehlt der Preis oder widersprechen sich Centwerte, Währung, Tage,
  Plattformbeitrag, Gesamtbetrag oder Auszahlung, zeigt SIT ausdrücklich
  „Preisprüfung fehlgeschlagen“ und deaktiviert sowohl Erklärung als auch
  verbindliche Annahme
- diese gemeinsame letzte Schranke gilt für alle vier Annahmewege:
  Anfragedetail, Vermieter-Anfragenliste, Nachrichten und laufende
  Vermieteransicht
- der Vermieter sieht vor der Erklärung getrennt den privaten Mietpreis, den
  vom Mieter getragenen SIT-Plattformbeitrag, den Gesamtpreis des Mieters und
  die vorgesehene eigene Auszahlung
- nur außerhalb des echten Backendpfads bleibt ein lokaler Testpreis möglich;
  er ist sichtbar mit „kein Echtgeld“ als nicht bindend gekennzeichnet
- 11/11 neue bzw. angepasste Wiring-Tests und 9 gezielte Flutter-Tests
  bestanden; der gezielte Analyzer erzeugte keine neuen Hinweise
- die vollständige Regression blieb mit 271 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-owner-acceptance-server-price-gate-20260817T084500Z.json`

## Prüfstand Checkpoint 16.147

- die vom Server gesetzte verbindliche Annahmefrist bleibt jetzt im
  Buchungsmodell, im Checkout und im isolierten lokalen QA-Speicherweg
  vollständig erhalten; der echte Backendpfad bleibt weiterhin die
  maßgebliche Quelle
- die Anfragedetailansicht zeigt dem Vermieter die genaue Annahmefrist und
  deaktiviert die Annahme, sobald die 30-Minuten-Frist abgelaufen ist
- dieselbe Fristschranke gilt über den gemeinsamen Annahmedialog für alle vier
  Annahmewege; nach Ablauf sind sowohl die Erklärung als auch die verbindliche
  Annahme deaktiviert
- unmittelbar beim Tippen auf „Verbindlich annehmen“ wird die Frist nochmals
  geprüft, damit ein während des geöffneten Dialogs eintretender Ablauf nicht
  umgangen werden kann
- das Backend bleibt die letzte maßgebliche Schranke und weist einen
  Annahmeversuch nach der gespeicherten Frist mit
  `booking_request_expired` zurück
- 32/32 gezielte Struktur-, Backend- und Datenschutztests sowie 12/12
  gezielte Flutter-Tests bestanden; die gezielte Analyse erzeugte keine Fehler
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- die Datenschutz-Inventarbindung wurde auf den neuen Quellhash aktualisiert;
  Erhebungszweck, Transport, Anbieter und Berechtigungen änderten sich nicht
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-owner-acceptance-deadline-gate-20260817T085811Z.json`

## Prüfstand Checkpoint 16.148

- weist das Backend einen Annahmeversuch exakt mit
  `booking_request_expired` zurück, zeigt SIT jetzt zentral das mittige Popup
  „Annahmefrist abgelaufen“ statt eines technischen oder kaum sichtbaren
  Fehlers
- die Meldung erklärt, dass die 30-Minuten-Frist abgelaufen ist, dass die
  Anfrage nicht mehr angenommen werden kann und dass die Ansicht neu geladen
  werden soll
- andere Backendfehler werden nicht fälschlich als Fristablauf ausgegeben,
  sondern weiterhin an die bestehende Fehlerbehandlung weitergereicht
- alle vier Vermieter-Annahmewege verwenden dieselbe zentrale Abschluss- und
  Fehlerfunktion; nach einer abgelaufenen Annahme entstehen weder
  Erfolgsmeldung noch Chatstatus-, Timeline- oder Navigations-Folgeschritte
- 8/8 Annahme-Wiring-Tests und 57/57 gezielte Flutter-Tests bestanden
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- die Datenschutz-Inventarbindung der zwei bereits inventarisierten Ansichten
  wurde aktualisiert; Datenerhebung, Speicherung, Transport, Anbieter und
  Berechtigungen änderten sich nicht
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-owner-acceptance-expired-popup-20260817T091611Z.json`

## Prüfstand Checkpoint 16.149

- der Checkout unterscheidet jetzt bekannte serverseitige Buchungsschranken
  und zeigt verständliche SIT-Texte statt interner Fehlercodes oder der
  pauschalen Aufforderung, nur die Verbindung zu prüfen
- abgelaufene, fehlende oder geänderte verbindliche Preise werden aus dem
  bestätigbaren Zustand entfernt; SIT lädt danach automatisch einen frischen
  Serverpreis, den der Nutzer erneut prüfen und bestätigen muss
- nicht mehr verfügbare Zeiträume, vorhandene Doppelanfragen, eigene Anzeigen,
  fehlende Anmeldung, bereits laufende Serververarbeitung und vorübergehend
  gesperrte Buchungen erhalten jeweils eine begrenzte, ehrliche Meldung
- Moderations- oder Blockgründe werden bewusst neutral formuliert und legen
  keine privaten Gegenpartei-Informationen offen
- unbekannte Fehler bleiben fail-closed bei der generischen Meldung; es wird
  kein Erfolg, keine Belastung und keine erzeugte Buchung behauptet
- 4/4 neue Checkout-Fehler-Wiring-Tests, insgesamt 17/17 gezielte Node-Tests,
  11/11 gezielte Flutter-Tests und 16/16 Datenschutztests bestanden; die
  geänderte Checkout-Datei hat 0 Analyzer-Hinweise
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-checkout-backend-error-mapping-20260817T092630Z.json`

## Prüfstand Checkpoint 16.150

- jede neue Serverpreisabfrage setzt jetzt sowohl die Bestätigung der privaten
  Bedingungen als auch die Erklärung zur vorzeitigen Leistung und
  Widerrufsfolge auf nicht bestätigt zurück
- dasselbe gilt sofort beim automatischen Ablauf des zehn Minuten gültigen
  Preisangebots; alte Häkchen bleiben nicht sichtbar oder technisch wirksam
- nach einem abgelaufenen oder geänderten Preis kann der automatisch neu
  geladene Preis deshalb erst gesendet werden, wenn der Nutzer beide
  Erklärungen für den frischen Preis erneut bewusst setzt
- der Absende-Guard verlangt weiterhin gleichzeitig beide Erklärungen, einen
  frischen Serverpreis, die Zahlungsbereitschaft und einen nicht laufenden
  Sendevorgang
- 5/5 Checkout-Fehler-/Neubestätigungs-Wiring-Tests, 9/9 gezielte Node-Tests
  und 8/8 gezielte Flutter-Tests bestanden; die Checkout-Datei hat weiterhin
  0 Analyzer-Hinweise
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-checkout-reconfirmation-after-requote-20260817T093351Z.json`

## Prüfstand Checkpoint 16.151

- eine offen gelassene Vermieter-Anfragedetailansicht beobachtet jetzt auch
  die normale serverseitige 30-Minuten-Annahmefrist und baut sich beim Ablauf
  ohne manuelles Neuladen neu auf
- unmittelbar nach dem Ablauf wechselt der sichtbare Hinweis auf
  „Annahmefrist abgelaufen“ und der Annahmebutton wird deaktiviert; ein zuvor
  gerenderter aktiver Button bleibt nicht bis zur nächsten Navigation stehen
- der Zeitgeber läuft nur für eine tatsächlich ausstehende Remote-Anfrage mit
  zukünftiger gebundener Frist oder für den bereits vorhandenen
  Express-Bestätigungsfall und beendet sich nach Wegfall beider Gründe
- lokale QA-Daten erhalten keinen fälschlich servergebundenen Zeitgeber; die
  Backendprüfung `booking_request_expired` und der zentrale SIT-Fehlerdialog
  bleiben unverändert die letzte maßgebliche Schranke
- 14/14 gezielte Strukturtests und 52/52 gezielte Flutter-Buchungs- und
  Sicherheitstests bestanden
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün; das technische Gesamttor bestand mit
  der dokumentierten lokalen Kandidaten-Rollover-Grenze
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-owner-acceptance-live-deadline-20260817T095017Z.json`

## Prüfstand Checkpoint 16.152

- ein bereits geöffnetes zentrales Vermieter-Annahmefenster beobachtet die
  gebundene 30-Minuten-Frist jetzt selbst und wechselt beim exakten Ablauf
  ohne erneutes Tippen oder Schließen in den abgelaufenen Zustand
- eine zuvor gesetzte Annahmeerklärung wird beim Ablauf sofort zurückgesetzt;
  Checkbox und verbindlicher Annahmebutton werden gleichzeitig technisch
  deaktiviert und der sichtbare Ablaufhinweis erscheint im selben Dialog
- der Dialog verwendet genau einen Fristzeitgeber und beendet ihn beim
  Schließen zuverlässig; ein späterer Callback kann keine bereits entfernte
  Ansicht mehr verändern
- die zusätzliche Prüfung beim Antippen, der gemeinsame Serverabschluss und
  die serverseitige Schranke `booking_request_expired` bleiben unverändert;
  alle vier Annahmewege profitieren vom gemeinsamen Dialog
- 10/10 Annahme-Wiring-Tests und 52/52 gezielte Flutter-Buchungs- und
  Sicherheitstests bestanden; die gezielte Dialoganalyse hatte 0 Hinweise
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün; das technische Gesamttor bestand mit
  der dokumentierten lokalen Kandidaten-Rollover-Grenze
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-owner-acceptance-dialog-live-expiry-20260817T100225Z.json`

## Prüfstand Checkpoint 16.153

- die Vermieterübersicht wertet eine ausstehende Remote-Anfrage nicht mehr
  pauschal als aktive „Anfrage“, wenn ihre servergebundene Annahmefrist fehlt
  oder bereits abgelaufen ist
- fehlt die Pflichtfrist, zeigt die Karte „Annahme gesperrt“; nach Ablauf
  wechselt sie sichtbar auf „Annahmefrist abgelaufen“ und verwendet die rote
  Warnfarbe statt eines neutralen aktiven Status
- die Übersicht plant genau den jeweils nächsten zukünftigen Ablaufzeitpunkt,
  baut sich dort neu auf und plant danach gegebenenfalls die nächste Frist;
  ihr Zeitgeber wird bei neu geladenen Daten ersetzt und beim Verlassen beendet
- der isolierte QA-Modus bleibt von einer behaupteten Serverfrist getrennt;
  Dialogprüfung, Antippprüfung und Backendschranke bleiben die verbindlichen
  technischen Annahme-Gates
- 11/11 Annahme-Wiring-Tests und 53/53 gezielte Flutter-Buchungs-,
  Hydrations- und Sicherheitstests bestanden; die gezielte Übersichtsanalyse
  blieb bei den zwei bereits vorhandenen Hinweisen und ohne neue Diagnose
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün; das technische Gesamttor bestand mit
  der dokumentierten lokalen Kandidaten-Rollover-Grenze
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-owner-request-overview-live-expiry-20260817T101258Z.json`

## Prüfstand Checkpoint 16.154

- auch die geöffnete Vermieter-Detailansicht beobachtet ihre servergebundene
  Annahmefrist jetzt selbst und baut sich am exakten Ablaufzeitpunkt neu auf
- ihr bisher optisch aktiver grüner Annahmebutton wird dann technisch
  deaktiviert; Statusmarke und Erklärung zeigen sichtbar
  „Annahmefrist abgelaufen“ statt eine weiterhin aktive Anfrage zu behaupten
- fehlt im echten Backend die Pflichtfrist, zeigt die Ansicht
  „Annahme gesperrt“ und erklärt, dass die verbindliche Annahmefrist fehlt;
  der isolierte QA-Modus bleibt davon getrennt
- der Ansichtszeitgeber wird bei jedem Neuladen ersetzt und beim Verlassen
  beendet; gemeinsamer Dialog, Antippprüfung und Backendschranke bleiben als
  zusätzliche unabhängige Schutzschichten bestehen
- 12/12 Annahme-Wiring-Tests und 53/53 gezielte Flutter-Buchungs-,
  Hydrations- und Sicherheitstests bestanden; die gezielte Dateianalyse blieb
  bei 26 bereits vorhandenen Hinweisen und ohne neue Diagnose
- die vollständige Regression blieb mit 282 bestandenen Tests, 1 bewusstem
  Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün; das technische Gesamttor bestand mit
  der dokumentierten lokalen Kandidaten-Rollover-Grenze
- der Quellhash der bereits inventarisierten Detailansicht wurde aktualisiert;
  Datenerhebung, Speicherung, Transport, Anbieter und Berechtigungen änderten
  sich nicht
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
- Push und Crashdiagnose bleiben bestehen, getrennt, freiwillig und
  standardmäßig aus; Push aktiviert Crash nicht. Es wurden keine Crashdaten
  übertragen. Nachweis:
  `docs/evidence/b11/v51-owner-detail-live-expiry-20260817T102341Z.json`

## Prüfstand Checkpoint 16.155

- Firebase Cloud Messaging und Firebase Crashlytics bleiben verbindlich
  Bestandteil des vorgesehenen SIT-Launchumfangs
- ein datierter Nachtrag in der internen V5.1-Datenschutzfassung ersetzt jetzt
  ausschließlich die zwei alten Aussagen auf Quellseite 38, wonach externe
  Push- und Crashdienste beim Start generell nicht aktiviert seien; der
  ursprüngliche Quelltext bleibt für die Nachvollziehbarkeit sichtbar
- der Nachtrag bindet beide Dienste als unabhängige, freiwillige und
  standardmäßig ausgeschaltete Entscheidungen; Push kann Crashdiagnose nicht
  aktivieren
- Werbung, Marketingtracking, allgemeine Analytics und externe generative KI
  bleiben weiterhin aus
- die Produktentscheidung ist ausdrücklich keine Live-, Datenschutz- oder
  Store-Freigabe. Anbieterrolle, Vertrag, Regionen, Drittlandtransfer,
  Datenfelder, Einwilligung/Widerruf, Aufbewahrung/Löschung und Store-Angaben
  bleiben je Dienst offen und aktivierungsblockierend
- Manifest, V5.1-Rechtsvalidator und allgemeiner Datenschutzvalidator lehnen
  sowohl Entfernen/Koppeln der Dienste als auch eine vorzeitige Freigabe
  geschlossen ab
- 50/50 gezielte Node-Prüfungen und 18/18 gezielte Flutter-Prüfungen
  bestanden; die vollständige Regression blieb mit 282 bestandenen Tests,
  1 bewusstem Skip, 229 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web-
  und Android-Debug-Builds vollständig grün
- die zwei geänderten Rechtsassets wurden mit ihren neuen Hashes im
  Datenschutz-Inventar neu gebunden; Datenerhebung, Speicherung, Transport,
  Anbieter und Berechtigungen änderten sich nicht
- es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder Kandidatenwechsel
  und es wurden keine Crashdaten erzeugt oder übertragen. Nachweis:
  `docs/evidence/b11/v51-push-crash-successor-decision-20260817T103613Z.json`

## Prüfstand Checkpoint 16.156

- FCM-Push und Firebase Crashlytics besitzen jetzt zwei getrennte,
  maschinenlesbare Anbieter-/Aufbewahrungs-/Löschbereitschaftsbelege; kein
  Dienst kann durch den Nachweis des anderen freigegeben werden
- für FCM sind die bestehende Sitzungsregistrierungs-, Token- und
  Firebase-Installationslöschung samt gespeichertem Wiederholungsversuch an
  ihre echten Quellhashes gebunden; Googles Abschlussfenster von bis zu 180
  Tagen nach dem installationsgebundenen Löschantrag wird als
  anbietergesteuert und nicht als SIT-Sofortlöschung ausgewiesen
- für Crashlytics sind standardmäßig ausgeschaltete Erfassung, getrennte
  Aktivierung und Löschung noch nicht gesendeter Geräteberichte belegt
- bereits bei Google gespeicherte Crashberichte werden ausdrücklich nicht als
  vollständig löschbar behauptet: Die aktuelle Firebase-Schnittstelle setzt
  eine stabile Benutzerzuordnung und einen autorisierten serverseitigen
  Löschaufruf voraus; beides ist in SIT noch nicht implementiert oder
  betrieblich bestätigt
- Vertrag, Verarbeitungsorte, Drittlandtransfer, Betreiberakzeptanz,
  Storeangaben und ein neuer physisch geprüfter Nachfolgekandidat bleiben für
  beide Dienste getrennt `open`; die neun Retention-Entscheidungen bleiben
  ebenfalls offen
- 52/52 gezielte Node-Prüfungen bestanden; die vollständige Regression blieb
  mit 282 bestandenen Flutter-Tests, 1 bewusstem Skip, 229
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und es wurden keine Crashdaten erzeugt oder
  übertragen. Nachweis:
  `docs/evidence/b11/v51-firebase-service-specific-retention-readiness-20260817T105628Z.json`

## Prüfstand Checkpoint 16.157

- eine zentrale Retention-Ausführungsvorprüfung bewertet jetzt die neun
  Entscheidungen, technische Cutoff-/Eligible-Row-Reife, alle vier externen
  Anbieter, Rechts-/Betreiberfreigabe sowie Datenschutz- und Store-Gates
  gemeinsam
- der aktuelle Stand bleibt mit genau 20 stabilen, rein symbolischen
  Blockercodes geschlossen; Richtlinienwerte, E-Mails, Kennungen oder andere
  sensible Inhalte werden nicht in das Ergebnis übernommen
- auch vollständig unterschriebene Richtlinien können allein keine Löschung
  ermöglichen: kategorieweiser Purge, angewandte Fristen, berechnete
  löschbare Zeilen und ein verifizierter Staging-Trockenlauf müssen zusätzlich
  gemeinsam vorliegen
- die Vorprüfung stellt keinen destruktiven API-Pfad bereit und hat weder
  Datenbankzeilen gelesen oder verändert noch Fristen, Betreiberentscheidungen
  oder Anbieterfreigaben erfunden
- 36/36 gezielte Retention-Prüfungen bestanden; die vollständige Regression
  blieb mit 282 bestandenen Flutter-Tests, 1 bewusstem Skip, 229
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- FCM-Push und Crashlytics bleiben unverändert getrennt, freiwillig und im
  nächsten Kandidaten standardmäßig aus; es erfolgte kein Deployment,
  Upload, Echtgeld-, Store-, Anbieterconsole- oder Kandidatenwechsel und kein
  Crashereignis. Nachweis:
  `docs/evidence/b11/v51-retention-execution-preflight-20260817T130000Z.json`

## Prüfstand Checkpoint 16.158

- der ausschließlich deklarierte, nirgends verwendete
  `_canStartOwnerHandover`-Getter wurde aus der Vermieter-Detailansicht
  entfernt; der Laufzeitdiff umfasst exakt fünf Löschungen und keine
  Ergänzung
- der tatsächlich aktive Übergabeweg bleibt unverändert an bestätigte Zeit,
  serverseitige Challenge, Buchung/Segment/Rolle, QR beziehungsweise
  sechsstelligen Code und den Übergabe-Stepper gebunden
- der Rückgabeweg behält seinen aktiven Statusguard, Gegenparteiprüfung,
  mindestens vier beweisgebundene Fotos, gegebenenfalls Gegenfoto sowie den
  verifizierten Abschluss; Vermieter-Storno und `owner_to_renter`-Bewertung
  bleiben rollen- und buchungsgebunden
- sechs neue abschnittsgebundene Fail-closed-Prüfungen verhindern die
  Wiedereinführung des toten Getters und schützen die genannten aktiven Wege;
  zusammen mit den bestehenden Strukturprüfungen waren 16/16 gezielte
  Node-Prüfungen grün, zusätzlich 59/59 gezielte Flutter-Sicherheitstests
- das Datenschutz-Inventar wurde ausschließlich mit dem neuen Quellhash der
  bereits gebundenen Ansicht aktualisiert; Datenarten, Zwecke, Anbieter,
  Transport, Berechtigungen und öffentliche Angaben blieben unverändert
- die vollständige Regression bestand mit 282 Flutter-Tests, 1 bewusstem
  Skip, jetzt 228 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds; die bekannten externen WebAssembly-Trockenlaufhinweise
  blieben unverändert
- FCM-Push und Crashlytics bleiben getrennt, freiwillig und im nächsten
  Kandidaten standardmäßig aus; Push aktiviert Crash nicht. Es erfolgte kein
  Deployment, Upload, Echtgeld-, Store-, Anbieterconsole- oder
  Kandidatenwechsel und kein Crashereignis. Nachweis:
  `docs/evidence/b11/v51-owner-handover-dead-gate-cleanup-20260817T112722Z.json`

## Prüfstand Checkpoint 16.159

- aus dem Übergabe-/Rückgabe-Stepper wurde ausschließlich der projektweit
  unreferenzierte lokale Datumsformatter `_fmtDateTime` entfernt; der
  Laufzeitdiff umfasst exakt fünf Löschungen und keine Ergänzung
- die Schrittfolge erzwingt weiterhin den Foto-/Gegenfoto-Nachweis vor der
  QR-/Code-Bestätigung; QR und manueller Code delegieren unverändert an den
  buchungs-, segment- und rollengebundenen Gegenparteiprüfer
- der echte Euroformatter und der bestätigte Stepperabschluss bleiben
  unverändert; fünf neue Fail-closed-Prüfungen verriegeln die Entfernung und
  die aktiven Sicherheitsanker
- 15/15 kombinierte gezielte Node-Prüfungen, 16/16 Datenschutzprüfungen und
  59/59 gezielte Flutter-Übergabe-/Rückgabeprüfungen bestanden
- der bereits vorhandene Datenschutz-Quellnachweis wurde ausschließlich auf
  den neuen Stepper-Hash aktualisiert; Datenarten, Zwecke, Anbieter,
  Übertragung, Berechtigungen und öffentliche Angaben blieben unverändert
- die vollständige Regression bestand mit 282 Flutter-Tests, 1 bewusstem
  Skip, jetzt 227 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds; die bekannten externen WebAssembly-Trockenlaufhinweise
  blieben unverändert
- FCM-Push und Crashlytics bleiben getrennt, freiwillig und im nächsten
  Kandidaten standardmäßig aus; Push aktiviert Crash nicht. Es erfolgte kein
  Deployment, Upload, Echtgeld-, Store-, Anbieterconsole- oder
  Kandidatenwechsel und kein Crashereignis. Nachweis:
  `docs/evidence/b11/v51-return-stepper-dead-datetime-cleanup-20260817T113817Z.json`

## Prüfstand Checkpoint 16.160

- aus der Buchungsdetailansicht wurde ausschließlich der projektweit
  unreferenzierte lokale Rückgabe-Code-Helfer `_returnRenterCode` entfernt;
  der Laufzeitdiff umfasst exakt fünf Löschungen und keine Ergänzung
- die aktive Abholcode-Erzeugung bleibt an Buchung, Abholsegment und
  Vermieterrolle gebunden; die echte Rückgabe verwendet keine lokale
  Ersatzerzeugung, sondern weiterhin die serverseitig ausgestellte Challenge
- der Rückgabe-Stepper sowie die direkten QR- und manuellen Codepfade prüfen
  unverändert Rückgabesegment, präsentierende Mieterrolle und aktuellen
  Buchungskontext; ein Abschluss setzt weiterhin den verifizierten Kontext
- fünf neue abschnittsgebundene Fail-closed-Prüfungen verhindern die
  Wiedereinführung des toten Helfers und schützen alle genannten aktiven
  Sicherheitswege
- 16/16 kombinierte gezielte Node-Prüfungen, 16/16 Datenschutzprüfungen und
  59/59 gezielte Flutter-Übergabe-/Rückgabeprüfungen bestanden
- der bereits vorhandene Datenschutz-Quellnachweis wurde ausschließlich auf
  den neuen Buchungsdetail-Hash aktualisiert; Datenarten, Zwecke, Anbieter,
  Übertragung, Berechtigungen und öffentliche Angaben blieben unverändert
- die vollständige Regression bestand mit 282 Flutter-Tests, 1 bewusstem
  Skip, jetzt 226 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds; die bekannten externen WebAssembly-Trockenlaufhinweise
  blieben unverändert
- FCM-Push und Crashlytics bleiben getrennt, freiwillig und im nächsten
  Kandidaten standardmäßig aus; Push aktiviert Crash nicht. Es erfolgte kein
  Deployment, Upload, Echtgeld-, Store-, Anbieterconsole- oder
  Kandidatenwechsel und kein Crashereignis. Nachweis:
  `docs/evidence/b11/v51-booking-detail-dead-return-code-cleanup-20260817T114634Z.json`

## Prüfstand Checkpoint 16.161

- FCM-Push und Firebase Crashlytics bleiben für den Launch erhalten,
  unabhängig voneinander, freiwillig und im nächsten Kandidaten
  standardmäßig aus; die Aktivierung von Push kann Crashlytics weiterhin
  nicht aktivieren
- Crashlytics erhält weiterhin keine Werbe-ID und keine SIT-Nutzerkennung;
  es wurde bewusst keine zusätzliche kontoverknüpfte Diagnosekennung
  eingeführt
- der Aktivierungsdialog und die öffentliche Datenschutzerklärung erklären
  jetzt deckungsgleich: Beim Ausschalten beziehungsweise bei Kontolöschung
  werden ungesendete Berichte auf dem Gerät entfernt und die Löschung der
  Firebase-Installation angefordert
- bereits gesendete Crashberichte können ohne SIT-Nutzerkennung keinem
  SIT-Konto zugeordnet und deshalb nicht kontobezogen vor Ablauf der
  Anbieterfrist entfernt werden; die 90-Tage-Frist bis zum Beginn der
  Entfernung wird ausdrücklich genannt und eine sofortige Providerlöschung
  nicht versprochen
- sechs Fail-closed-Prüfungen schützen Standard-Aus, getrennte Aktivierung,
  lokale Löschung, Installationslöschung, das Verbot einer SIT-Nutzerkennung
  sowie die übereinstimmende öffentliche Erklärung; 58/58 gezielte Node-,
  10/10 Backend-Sicherheits- und 19/19 gezielte Flutter-Tests bestanden
- Datenschutz- und Retention-Quellhashes wurden aktualisiert; die
  vollständige Regression bestand mit 282 Flutter-Tests, 1 bewusstem Skip,
  226 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- Anbieter-Vertrag, Verarbeitungsorte/Drittlandtransfer, die übergreifende
  externe Retention-Entscheidung, Storefreigabe und ein physisch geprüfter
  Nachfolgekandidat bleiben offen. Es erfolgte kein Deployment, Upload,
  Echtgeld-, Store-, Anbieterconsole- oder Kandidatenwechsel und kein
  Crashereignis. Nachweis:
  `docs/evidence/b11/v51-crashlytics-privacy-preserving-deletion-boundary-20260817T120447Z.json`

## Prüfstand Checkpoint 16.162

- aus der Artikel-Detailansicht wurde ausschließlich die projektweit
  unreferenzierte lokale Darstellungsklasse `_TagChips` entfernt; der
  Laufzeitdiff umfasst exakt 19 Löschungen und keine Ergänzung
- die aktive Liefer- und Kategoriedarstellung, einklappbare Beschreibung,
  Preis- und Buchungslogik, Checkout, Vermieterprofil und Wunschlistenaktion
  bleiben unverändert erhalten
- vier neue abschnittsgebundene Fail-closed-Prüfungen verhindern die
  Wiedereinführung der toten Klasse und schützen die aktiven Nachbarpfade;
  zusammen mit der Analyzer-Sperre waren 6/6 gezielte Node- und 34/34
  gezielte Flutter-Tests grün
- die Ansicht ist nicht an das Datenschutz-Quellinventar gebunden; Erhebung,
  Speicherung, Übertragung, Berechtigungen, Anbieter, öffentliche Angaben
  und Store-Metadaten blieben unverändert
- die vollständige Regression bestand mit 282 Flutter-Tests, 1 bewusstem
  Skip, jetzt 225 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds; die bekannten externen WebAssembly-Trockenlaufhinweise
  blieben unverändert
- FCM-Push und Crashlytics bleiben getrennt, freiwillig und im nächsten
  Kandidaten standardmäßig aus; Push aktiviert Crash nicht. Es erfolgte kein
  Deployment, Upload, Echtgeld-, Store-, Anbieterconsole- oder
  Kandidatenwechsel und kein Crashereignis. Nachweis:
  `docs/evidence/b11/v51-item-details-dead-tag-chips-cleanup-20260817T122246Z.json`

## Prüfstand Checkpoint 16.163

- aus der Artikel-Detailseite wurde ausschließlich der projektweit
  unreferenzierte lokale Kurz-Datumsformatter `_formatRange` entfernt; der
  Laufzeitdiff umfasst exakt sieben Löschungen und keine Ergänzung
- die aktive vollständige Datumsdarstellung, Verfügbarkeitsprüfung,
  Gast-Sperre, Buchungsübermittlung, Preisangabe und der
  Privatpilot-Checkout bleiben unverändert erhalten
- eine neue abschnittsgebundene Fail-closed-Prüfung verhindert die
  Wiedereinführung des toten Formatters und schützt die aktiven Nachbarpfade;
  zusammen mit den bestehenden Artikel- und Analyzer-Sperren waren 7/7
  gezielte Node- und 34/34 gezielte Flutter-Tests grün
- die Ansicht bleibt außerhalb des Datenschutz-Quellinventars; Erhebung,
  Speicherung, Übertragung, Berechtigungen, Anbieter, öffentliche Angaben
  und Store-Metadaten blieben unverändert
- die vollständige Regression bestand mit 282 Flutter-Tests, 1 bewusstem
  Skip, jetzt 224 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds; die bekannten externen WebAssembly-Trockenlaufhinweise
  blieben unverändert
- FCM-Push und Crashlytics bleiben getrennt, freiwillig und im nächsten
  Kandidaten standardmäßig aus; Push aktiviert Crash nicht. Es erfolgte kein
  Deployment, Upload, Echtgeld-, Store-, Anbieterconsole- oder
  Kandidatenwechsel und kein Crashereignis. Nachweis:
  `docs/evidence/b11/v51-item-details-dead-range-formatter-cleanup-20260817T123234Z.json`

## Prüfstand Checkpoint 16.164

- die bisher fehlenden service-spezifischen Aufbewahrungs- und Löschakten
  für Firebase Authentication und Google Maps Platform wurden aus aktuellen
  offiziellen Anbieterquellen erstellt und zusammen mit FCM und Crashlytics
  als vier strikt getrennte Anbietergrenzen gebunden
- die aktive SMS-Prüfung bleibt im Launchumfang und entfernt ihre temporäre,
  ausschließlich telefongebundene Firebase-Identität nach sicherer
  Gegenprüfung; Google beschreibt wenige Wochen für protokollierte
  IP-Adressen und bis zu 180 Tage nach kundenseitig ausgelöster
  Nutzerlöschung für andere Authentifizierungsdaten
- eine persistente soziale Firebase-Identität würde bei heutiger
  Kontolöschung noch nicht beim Anbieter entfernt; Google-, Apple- und
  Facebook-Anmeldung bleiben deshalb bis zur technischen Schließung dieser
  Lücke und den erforderlichen Betreiberfreigaben ausdrücklich deaktiviert
- Google-Maps-Adressvorschläge und Ortsdetails bleiben im Launchumfang,
  laufen aber ausschließlich authentifiziert und begrenzt über den SIT-Server;
  ein Maps-Schlüssel ist nicht in der App eingebettet und eine dauerhafte
  Hintergrund- oder Live-Ortung bleibt ausgeschlossen
- Google veröffentlicht für Maps-Protokolle keinen einheitlichen festen
  Aufbewahrungszeitraum und SIT hat keinen kontobezogenen Anbieter-Löschweg;
  Vertrag, aktivierte APIs, Logging, Schlüsselrestriktion, Verarbeitungsorte,
  Transfer und Betreiberentscheidung bleiben deshalb offen statt erfunden
- 39/39 gezielte Fail-closed-Retention-Prüfungen bestanden; die vollständige
  Regression blieb mit 282 Flutter-Tests, 1 bewusstem Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- FCM-Push und Crashlytics bleiben unverändert erhalten, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crash nicht. Es erfolgte kein Deployment, Upload, Echtgeld-, Store-,
  Anbieterconsole- oder Kandidatenwechsel. Nachweis:
  `docs/evidence/b11/v51-firebase-auth-maps-retention-boundaries-20260817T124523Z.json`

## Prüfstand Checkpoint 16.165

- der in Checkpoint 16.164 belegte technische Löschblocker für persistente
  soziale Firebase-Identitäten ist im Quellstand geschlossen: Vor der lokalen
  Entfernung einer Kontoverknüpfung wird die zugehörige Firebase-UID innerhalb
  derselben Datenbanktransaktion in eine dauerhafte Anbieter-Löschwarteschlange
  aufgenommen
- die Warteschlange enthält keine SIT-Konto-ID, ist auf Google, Apple und
  Facebook begrenzt und bewahrt die Provider-UID nur bis zum erfolgreichen
  Abschluss auf; gleichzeitige Worker werden mit atomarem `SKIP LOCKED`-Claim
  getrennt
- nach dem Commit erfolgt sofort ein Löschversuch; vorübergehende Fehler werden
  mit begrenztem exponentiellem Abstand erneut versucht, hängende Claims nach
  15 Minuten wieder aufgenommen und der Worker bei API-Start sowie periodisch
  ausgeführt
- nur eine bestätigte Firebase-Löschung oder `user-not-found` entfernt den
  Auftrag; Providerfehlermeldungen und Firebase-UIDs werden weder protokolliert
  noch als Fehlerdetail gespeichert. Ein Konto ohne soziale Identität kann
  keinen globalen Warteschlangenlauf auslösen
- die bestehende sichere Löschung der temporären telefongebundenen Identität
  bleibt unverändert; App-, Rechts- und öffentliche Datenschutztexte erklären
  jetzt die Anbieter-Löschvormerkung, Wiederholung bei Fehlern und die von
  Firebase genannte Abschlussfrist von bis zu 180 Tagen
- Google-, Apple- und Facebook-Anmeldung bleibt trotz geschlossener technischer
  Löschwarteschlange deaktiviert, bis Betreiber-, Vertrags-, Transfer-,
  Store- und physische Kandidatenfreigaben abgeschlossen sind
- 10/10 neue Löschsicherheits-, 55/55 gezielte Datenschutz-/Retention- und
  11/11 Rechtsprüfungen bestanden; die vollständige Regression blieb mit 282
  Flutter-Tests, 1 bewusstem Skip, 224 Analyzer-Hinweisen bei 0 Fehlern sowie
  grünen Web- und Android-Debug-Builds vollständig grün
- FCM-Push und Crashlytics bleiben unverändert erhalten, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crash nicht. Migration 021 wurde nicht auf Staging oder Produktion
  angewandt; es erfolgte kein Deployment, Upload, Echtgeld-, Store-,
  Anbieterconsole- oder Kandidatenwechsel. Nachweis:
  `docs/evidence/b11/v51-firebase-persistent-identity-deletion-20260817T130728Z.json`

## Prüfstand Checkpoint 16.166

- für eine spätere kontobezogene Löschung gespeicherter Crashlytics-Berichte
  wurde ausschließlich ein standardmäßig ausgeschalteter serverseitiger
  Unterbau vorbereitet: zufällige Diagnosekennung je Plattform, atomare
  Löschwarteschlange, Wiederaufnahme hängender Aufträge und begrenzte
  Wiederholungen
- die Löschwarteschlange enthält keine SIT-Konto-ID; beim Vormerken wird die
  aktive Kontozuordnung in derselben Datenbanktransaktion entfernt. Anbieter-
  Fehlertexte, Firebase-Objektkennungen und Diagnosekennungen werden weder
  protokolliert noch als Fehlerdetail gespeichert
- die Firebase-Löschschnittstelle wird nur bei einer ausdrücklich aktivierten
  Serverkonfiguration aufgebaut. Diese Konfiguration bleibt standardmäßig
  aus; Migration 022 wurde nicht angewandt und es wurde keine Anbieteranfrage
  gesendet
- die App übermittelt weiterhin keine pseudonyme Crashlytics-
  Diagnosekennung. Diese zusätzliche, kontoverknüpfbare Übertragung und der
  daraus folgende irreversible Löschaufruf bleiben eine eigene ausdrückliche
  Freigabegrenze und wurden nicht vorweggenommen
- 9/9 neue Unterbauprüfungen, 65/65 gezielte Datenschutz-/Retention-Prüfungen
  und 209/209 Backendtests bestanden; 1 PostgreSQL-Integrationstest blieb
  ohne lokale `TEST_DATABASE_URL` bewusst übersprungen
- die vollständige Regression blieb mit 282 Flutter-Tests, 1 bewusstem Skip,
  224 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds vollständig grün
- FCM-Push und Crashlytics bleiben ausdrücklich erhalten, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel, keine Migration, keine Kennungsübertragung und kein
  Crashereignis. Nachweis:
  `docs/evidence/b11/v51-crashlytics-provider-deletion-foundation-20260817T133007Z.json`

## Prüfstand Checkpoint 16.167

- die erreichbaren Kontoansichten für Zahlungsmethoden und Auszahlungen
  behaupten keinen realen Anbieter und bieten keine Zahlungs- oder
  Onboarding-Aktion mehr an, solange der Server keinen tatsächlich
  angebundenen und für das Konto freigegebenen Marketplace-Zahlungsdienst
  bestätigt
- eine neue authentifizierte, kontogebundene und nicht cachebare
  Serverauskunft ist die gemeinsame Wahrheit für Checkout,
  Auszahlungs-Onboarding und die Zahlungsangabe im Buchungsangebot
- nicht verfügbare Ansichten fordern ausdrücklich keine Karten-, Konto-,
  Bank- oder Identitätsdaten an; ein freigeschalteter Testmodus wird klar als
  Test ohne Echtgeld gekennzeichnet. Nur der Live-Modus darf Stripe nennen
- auch die Hilfe verwendet bis zur echten Anbieterfreigabe neutrale und
  wahrheitsgemäße Formulierungen. Der lokale Memory-Zahlungsweg bleibt allein
  für isolierte Backendtests in der exakt bezeichneten Testumgebung
  aufrufbar und wird weder Staging noch Produktion als Fähigkeit gemeldet
- 4/4 neue Fail-closed-Verkabelungs-, 5/5 neue Widget- und 51/51 gezielte
  Flutter-Tests bestanden; 13/13 gezielt wiederholte Backendtests waren grün.
  Die gesamte Backendbilanz beträgt 209 bestanden und 1 bewusster
  PostgreSQL-Skip ohne lokale `TEST_DATABASE_URL`
- die vollständige technische Regression bestand mit 287 Flutter-Tests und
  1 bewusstem Skip, 224 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web-
  und Android-Debug-Builds; Datenschutz-, Retention- und Rechtsvalidatoren
  blieben grün
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel, keine Migration und keine zusätzliche
  Crashlytics-Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-payment-provider-ui-truth-20260817T135537Z.json`

## Prüfstand Checkpoint 16.168

- auch der direkt aus Buchungsdetails und einem authentifizierten
  Zahlungs-Rückkehrlink erreichbare Checkout ist jetzt an dieselbe
  kontogebundene Serverwahrheit gebunden; ohne konsistente Bestätigung von
  Anbieter, Verfügbarkeit und Modus lädt er keinen zahlbaren Vorgang und zeigt
  keine Aktion
- ohne real angebundenen Marketplace-Zahlungsdienst nennt die Ansicht keinen
  Anbieter und fordert keine Karten-, Konto- oder Sicherheitsdaten an. Ein
  echter Provider-Testmodus wird ausdrücklich als Test ohne Echtgeld gezeigt;
  nur ein gültiger Live-Modus darf den Stripe-Checkout benennen
- die Checkout-Route selbst verweigert Memory-/Demoausführung in Staging und
  Produktion mit `payment_provider_unavailable`; allein die exakt bezeichnete
  isolierte Backend-Testumgebung behält den Memory-Pfad für Integrationstests
- die Auszahlungsbenachrichtigung behauptet nicht länger pauschal ein
  Stripe-Konto, sondern nennt wahrheitsgemäß nur das bestätigte
  Auszahlungskonto
- 6/6 Fail-closed-Verkabelungs- und 8/8 Zahlungs-Widgettests bestanden; die
  Backendbilanz blieb bei 209 bestanden und 1 bewusstem PostgreSQL-Skip ohne
  lokale `TEST_DATABASE_URL`
- die vollständige technische Regression bestand mit 290 Flutter-Tests und
  1 bewusstem Skip, 224 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web-
  und Android-Debug-Builds; Datenschutz-, Retention- und Rechtsgates blieben
  geschlossen und grün
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Es erfolgte kein Deployment, Upload, Echtgeld-, Store-,
  Anbieterconsole- oder Kandidatenwechsel und keine zusätzliche
  Crashlytics-Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-direct-checkout-provider-truth-20260817T141319Z.json`

## Prüfstand Checkpoint 16.169

- das unerreichbare lokale Demo-Wallet mit erfundenem Guthaben und
  Beispieltransaktionen sowie der ebenfalls unerreichbare Demo-
  Verifizierungsablauf wurden vollständig entfernt; zusammen entfielen 667
  tote Quellzeilen ohne Laufzeitaufrufer
- der verbleibende Buchungsmenüpunkt heißt wahrheitsgemäß
  `Zahlungsstatus` und verspricht keine freigeschaltete Zahlung
- 4/4 neue Demo-Abwesenheits-, 10/10 kombinierte Zahlungs-Verkabelungs- und
  31/31 gezielte Flutter-Tests bestanden; die vollständige Regression blieb
  mit 290 Flutter-Tests, 1 bewusstem Skip, 224 Analyzer-Hinweisen bei 0
  Fehlern sowie grünen Web- und Android-Debug-Builds vollständig grün
- FCM-Push und Firebase Crashlytics bleiben bestehen, getrennt, freiwillig
  und im nächsten Kandidaten standardmäßig aus; Push aktiviert Crashlytics
  nicht. Es erfolgte kein Deployment, Upload, Echtgeld-, Store- oder
  Kandidatenwechsel. Nachweis:
  `docs/evidence/b11/v51-remove-unreachable-payment-demos-20260817T142336Z.json`

## Prüfstand Checkpoint 16.170

- Lieferung durch den Vermieter, Rückgabe-Abholservice und Express sind jetzt
  nicht nur in der App abgewählt, sondern an der maßgeblichen Serverquote
  ausdrücklich gesperrt; manipulierte Anfragen erhalten je einen stabilen
  Konfliktcode und können keine Transportgebühr erzeugen
- die ältere Synchronisationsroute kann diese drei Modi ebenfalls nicht mehr
  einführen. Bei einer zulässigen Aktualisierung werden alte Expressfelder
  fail-closed auf `false` beziehungsweise `null` normalisiert
- der Serverquote-Pfad enthält keine Entfernungs- oder
  Liefergebührenberechnung mehr und setzt Liefer- sowie Abholgebühr
  unveränderlich auf null Cent; die persönliche Übergabe und Rückgabe mit
  ihren bestehenden Foto-, QR-/Code- und Rollenregeln bleiben unangetastet
- Datenschutz- und Kontaktdatenansichten versprechen weder mögliche
  Lieferungen noch Liefergebühren. Sie erklären stattdessen die lokale Suche,
  sichere Übergabeplanung und die festgelegte Zeit- und Statusregel für die
  genaue Adresse
- 8/8 neue fachliche und Fail-closed-Verkabelungstests bestanden; die gesamte
  Backendbilanz beträgt 213 bestanden und 1 bewusster PostgreSQL-Skip ohne
  lokale `TEST_DATABASE_URL`
- die vollständige technische Regression bestand mit 290 Flutter-Tests und
  1 bewusstem Skip, 224 Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web-
  und Android-Debug-Builds; Datenschutz-, Retention-, Rechts-, Store- und
  Geräteevidenzvalidatoren blieben grün
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-disable-transport-services-20260817T144339Z.json`

## Prüfstand Checkpoint 16.171

- die App neutralisiert jetzt auch alte oder manipulierte Transportfelder
  unmittelbar beim Einlesen: Listingangebote für Lieferung, Rückgabe-Abholung
  und Express werden auf `false`, zugehörige Entfernungsgrenzen auf `null`
  gesetzt
- eingelesene Buchungen können keine Lieferung, Abholservice oder Express mehr
  reaktivieren; Auswahl, Status und Zeitstempel werden auf `false`/`null`, die
  frühere Expressgebühr auf null gesetzt. Die bereinigte Form wird auch wieder
  so serialisiert
- diese zweite Verteidigungsschicht verhindert, dass bereits gespeicherte oder
  manipulierte Payloads frühere Liefer-/Expressanzeigen auslösen, während
  persönliche Übergabe und Rückgabe sowie Preis-, Katalog- und
  Buchungssnapshots unverändert bleiben
- 2/2 neue Ingestion-Tests und 9/9 kombinierte Modell-, Buchungs- und
  Katalogtests bestanden; beide geänderten Modelle analysieren ohne Befund
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben bestehen, getrennt, freiwillig
  und im nächsten Kandidaten standardmäßig aus; Push aktiviert Crashlytics
  nicht. Es erfolgte kein Deployment, Upload, Echtgeld-, Store-,
  Anbieterconsole- oder Kandidatenwechsel. Nachweis:
  `docs/evidence/b11/v51-neutralize-legacy-transport-payloads-20260817T145418Z.json`

## Prüfstand Checkpoint 16.172

- die Eigentümer-Anfrageansicht enthält keine Prioritätslieferungs-Anfrage,
  Expressannahme/-ablehnung, +5-Euro-Aktion, Lieferfrist oder bestätigte
  Expressanzeige mehr; die zugehörigen zwei UI-Komponenten und alle Aufrufer
  wurden vollständig entfernt
- der frühere sekündliche Mehrzweck-Timer wurde durch einen einmaligen,
  präzise auf das Ende der verbindlichen 30-Minuten-Annahmefrist gesetzten
  Timer ersetzt. Dadurch bleibt die servergebundene Annahmesperre exakt, ohne
  eine unsichtbare Ansicht jede Sekunde neu aufzubauen
- das Laden von Anfrage, Anzeige und Mieter, die bindende Serverpreisprüfung,
  Annahme mit zwei Erklärungen, Ablehnung, alle Detailkarten sowie die
  Mieterprofilnavigation bleiben durch abschnittsgebundene Tests geschützt
- 21/21 gezielte Fail-closed-, Annahmefrist-, Preis- und
  Transportverkabelungstests bestanden; 194 alte Laufzeitzeilen wurden aus der
  Anfrageansicht entfernt
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben bestehen, getrennt, freiwillig
  und im nächsten Kandidaten standardmäßig aus; Push aktiviert Crashlytics
  nicht. Es erfolgte kein Deployment, Upload, Echtgeld-, Store-,
  Anbieterconsole- oder Kandidatenwechsel. Nachweis:
  `docs/evidence/b11/v51-remove-request-express-ui-20260817T150818Z.json`

## Prüfstand Checkpoint 16.173

- auch die Vermieter-Detailansicht liest keine gespeicherte Lieferauswahl mehr
  ein und enthält keine Expressannahme/-ablehnung, Prioritätsgebühr,
  Lieferadresse oder Lieferkarte mehr; dadurch kann auch ein alter lokaler
  Auswahlrest keine abgeschaltete Transportleistung sichtbar reaktivieren
- für den Privat-Pilot nennt die Ansicht jetzt ausschließlich die gültige
  Selbstabholung und Selbstrückgabe. Die tatsächlich im abgesicherten
  Übergabe-/Rückgabeablauf bestätigten Orte und Kartenlinks bleiben erhalten
- Preis-Snapshot, verbindliche Annahmefrist, Annahme und Ablehnung, Chat,
  sichere Übergabe/Rückgabe mit Challenge, QR/Code und Fotos sowie Storno und
  Bewertung blieben unverändert und werden durch fail-closed Tests geschützt
- 6/6 neue Transport-Abwesenheitstests, 26/26 kombinierte Funktionsschutztests
  und 30/30 gezielte Datenschutz-/Store-Prüfungen bestanden; aus der
  Laufzeitansicht entfielen netto 269 Zeilen. Der gebundene
  Datenschutz-Quellhash wurde auf die geprüfte Quelle aktualisiert, ohne eine
  Erhebungs-, Speicher-, Übertragungs- oder Berechtigungsänderung zu behaupten
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-remove-owner-detail-transport-ui-20260817T152652Z.json`

## Prüfstand Checkpoint 16.174

- die Mieter-Buchungsliste lädt keine alte lokale Lieferauswahl mehr und gibt
  weder Expressstatus noch Lieferangebot, Lieferverantwortung oder
  Lieferadresse an die Buchungsdetailansicht weiter. Damit kann der
  Navigationspfad keinen bereits abgeschalteten Transportmodus aus einem
  lokalen Altbestand rekonstruieren
- die Preisvorschau verwendet weiterhin den kanonischen Privat-Pilot-
  Preisweg, jedoch ohne transiente Transportauswahl. Der unveränderliche
  Serverpreis-Snapshot bleibt für alle Buchungszustände vorrangig
- Buchungsnavigation, Statusgruppen, ungelesene Nachrichten, Bewertung,
  Storno sowie die im sicheren Ablauf bestätigten Übergabe- und Rückgabeorte
  bleiben erhalten und werden durch Verkabelungstests geschützt
- 17/17 gezielte Listen-, Preis-, Navigations- und Transporttests bestanden;
  aus der Laufzeitansicht entfielen netto 38 Zeilen. Der Bildschirm analysiert
  mit 0 Fehlern; seine zwei bestehenden Kontext-Hinweise blieben unverändert
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-neutralize-renter-booking-navigation-transport-20260817T154108Z.json`

## Prüfstand Checkpoint 16.175

- die Mieter-Buchungsdetailansicht liest oder rekonstruiert keine alte
  Liefer-, Rückgabe-Abhol- oder Expressauswahl mehr. Alte Lieferadressen,
  Distanzschätzungen, Prioritätszustände und Fahrtvergütungs-Mutationen sind
  aus diesem Laufzeitpfad entfernt
- der Privat-Pilot zeigt dort jetzt ausschließlich Selbstabholung und
  Selbstrückgabe. Geschützte Ortsdarstellung, exakte Adressfreigabe sowie die
  im sicheren Ablauf bestätigten Übergabe- und Rückgabeorte bleiben erhalten
- der unveränderliche Serverpreis-Snapshot bleibt vorrangig. Nur für den
  vorhandenen Legacy-/QA-Fallback wird noch Mietpreis plus Plattformbeitrag
  dargestellt; Transport- und Expressgebühren werden nicht lokal neu erfunden
- sichere Übergabe und Rückgabe mit Rollenbindung, Challenge, QR/Code und
  Fotos sowie Chat, Storno und Bewertung bleiben durch fail-closed Tests
  geschützt
- 27/27 gezielte Funktionsschutztests und 31/31 Datenschutz-/Store-Prüfungen
  bestanden; aus der Laufzeitansicht entfielen netto 373 Zeilen. Der gebundene
  Datenschutz-Quellhash wurde auf die geprüfte Quelle aktualisiert, ohne eine
  Erhebungs-, Speicher-, Übertragungs- oder Berechtigungsänderung zu behaupten
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-remove-booking-detail-transport-20260817T182243Z.json`

## Prüfstand Checkpoint 16.176

- beide Artikel-/Reservierungsoberflächen verbergen die alte Liefer-,
  Rückgabe-Abhol- und Expressauswahl jetzt ausdrücklich. Der Standardwert ist
  ebenfalls geschlossen, damit ein neuer Aufrufer die Optionen nicht
  versehentlich wieder sichtbar macht
- der aktive Pfad liest keine gespeicherte Transportauswahl mehr ein und
  bereinigt einen eventuell vorhandenen lokalen Altwert. Die Reservierung kann
  Express weder beim Ändern noch beim Neuerstellen wieder einschalten
- die lokale Preisvorschau besteht nur noch aus Mietpreis plus
  Plattformbeitrag. Der verbindliche serverseitige Privat-Pilot-Checkout,
  Verfügbarkeit, Gastschutz und Eigentümervorschau bleiben erhalten
- 17/17 gezielte Artikel-, Preis-, Checkout- und Transporttests bestanden;
  aus dem Laufzeitpfad entfielen netto 147 Zeilen. Der Bildschirm analysiert
  mit 0 Fehlern; seine bestehenden Hinweise bleiben innerhalb des
  festgeschriebenen Gesamtbestands
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-item-details-transport-fail-closed-20260817T183625Z.json`

## Prüfstand Checkpoint 16.177

- die Mietdauer-/Datumsansicht enthält keine Liefer- oder Abholauswahl, keine
  Liefer-/Rückgabeadresse und keine Transport-Distanz- oder Gebührenberechnung
  mehr. Die zugehörigen Zustände, Eingabekomponenten und Hilfsklassen wurden
  vollständig entfernt
- ein eventuell vorhandener lokaler Altwert wird bereinigt und nicht mehr
  eingelesen. Die Ansicht beschreibt ausschließlich persönliche Abholung und
  persönliche Rückgabe; Termin und Treffpunkt werden nach Annahme im Chat
  abgestimmt
- Kalender, belegte Zeiträume, Mietdauer-Rabatte und Verfügbarkeitsprüfung
  bleiben erhalten. Die isolierte QA-Preisvorschau besteht nur aus Mietpreis
  plus Plattformbeitrag; im echten Backendpfad bleibt allein der frische,
  zeitlich begrenzte Server-Quote verbindlich
- 9/9 gezielte Preis-, Checkout- und Transporttests bestanden; aus der
  Laufzeitansicht entfielen netto 584 Zeilen. Die geänderte Datei analysiert
  vollständig sauber mit 0 Hinweisen und 0 Fehlern
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 224
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-duration-selection-transport-cleanup-20260817T184903Z.json`

## Prüfstand Checkpoint 16.178

- der Übergabe-/Rückgabe-Assistent enthält keinen Fahrtbestätigungs- oder
  Fahrtvergütungsschritt mehr. Er liest keine alten Liefer-/Abholflags und
  trifft keine transportbezogene Standortentscheidung
- der Pilotablauf bleibt bewusst vollständig: mindestens vier aktuelle Fotos
  der übergebenden Partei, Gegenbestätigung beziehungsweise eigenes Gegenfoto,
  Schadensdokumentation sowie rollen- und buchungsgebundene Challenge mit
  QR- oder sechsstelligem Ersatzcode bleiben erhalten
- der aus diesem Ablauf entfernte Standortzugriff reduziert die dort mögliche
  Datenerhebung. Es wurde keine neue Speicherung, Übertragung oder
  Berechtigung eingeführt; der gebundene Datenschutz-Quellhash wurde auf die
  geprüfte Quelle aktualisiert
- 35/35 gezielte Sicherheits- und Datenschutzprüfungen sowie nach Anpassung
  einer veralteten Erwartung nochmals 12/12 betroffene Tests bestanden. Aus
  der Laufzeitdatei entfielen netto 260 Zeilen; sie analysiert mit 0 Hinweisen
  und 0 Fehlern
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 223
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-return-stepper-transport-cleanup-20260817T190416Z.json`

## Prüfstand Checkpoint 16.179

- die alte Fahrtvergütung ist jetzt auch aus der wirkungsfähigen
  Rückgabe-Finalisierung entfernt. Nach Abschluss wird weder ein lokaler
  Fahrtentscheid gelesen oder verbraucht noch ein Freigabe-/Stornoereignis
  für eine im Privat-Pilot nicht angebotene Transportleistung erzeugt
- der zugehörige lokale Speicher samt Schreib- und Lesezugriff wurde aus dem
  zentralen Datendienst entfernt. Es werden keine Buchungs-, Nutzer- oder
  Übergabedaten gelöscht; nur die nicht mehr zulässige Pilotfunktion entfällt
- Eigentümer-Authentifizierung, aktiver Rückgabeprozess, mindestens vier
  Rollenfotos, Gallery-Bestätigung und verifizierter Abschluss bleiben
  fail-closed. Abschlussbenachrichtigung, Beleghinweis, Aktualisierung und
  Bewertungs-Erinnerung bleiben aktiv
- 31/31 gezielte Verkabelungs-/Datenschutzprüfungen und 55/55
  sicherheitskritische Flutter-Tests bestanden. Aus den Laufzeitdateien
  entfielen 93 Zeilen; es entstanden keine neuen Analysefehler oder -hinweise
- die vollständige technische Regression bestand mit 292 Flutter-Tests und
  1 bewusstem Skip, 213 Backendtests und 1 bewusstem PostgreSQL-Skip, 223
  Analyzer-Hinweisen bei 0 Fehlern sowie grünen Web- und
  Android-Debug-Builds
- FCM-Push und Firebase Crashlytics bleiben ausdrücklich bestehen, getrennt,
  freiwillig und im nächsten Kandidaten standardmäßig aus; Push aktiviert
  Crashlytics nicht. Werbung, Marketingtracking, allgemeine Analytics und
  externe generative KI bleiben aus
- es erfolgte kein Deployment, Upload, Echtgeld-, Store-, Anbieterconsole-
  oder Kandidatenwechsel und keine zusätzliche Crashlytics-
  Kennungsübertragung. Nachweis:
  `docs/evidence/b11/v51-ride-compensation-runtime-removal-20260817T191453Z.json`
