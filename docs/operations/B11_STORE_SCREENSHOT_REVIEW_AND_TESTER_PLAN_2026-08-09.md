# B11 – Screenshot-, Review- und Testerplan

Stand: 13. August 2026
Status: vier bereinigte Motive aus dem exakten Kandidaten 2026081302 lokal aufgenommen und visuell validiert; Console-Upload weiterhin nicht freigegeben

## 1. Ziel

Dieses Dokument definiert die Store-Bilder, Review-Daten und geschlossenen
Testgruppen für ShareItToo. Es verhindert, dass veraltete Screens, Demo-
Funktionen, echte Privatdaten oder ein falscher Backendzustand in Google Play,
App Store Connect, Git, Telegram oder den Masterplan gelangen.

## 2. Verbindliche Aufnahmebedingungen

Screenshots und Review-Video werden erst erstellt, wenn:

- der aktuelle Android-Store-Kandidat exakt Build `2026081302` und App-Commit
  `530ed17e46dbd82916eef0d59f1b07e448c737f8` entspricht;
- Android/iOS exakt `com.shareittoo.app` verwenden;
- Firebase, Push und Crashlytics im Artefakt vollständig und sicher
  konfiguriert sind;
- der Build ausschließlich `https://staging.shareittoo.com/api/v1` verwendet;
- `/version` auf den dokumentierten Commit zeigt;
- `livemode=false` und der freigegebene Testtransport sichtbar bestätigt sind;
- die weißen App-Icons und Launch-Assets im installierten Store-Build erscheinen;
- ausschließlich synthetische Konten, Inserate, Chats, Orte, Bilder und
  Zahlungstests verwendet werden;
- die deutsche UI auf dem Aufnahmegerät vollständig und ohne Debug-/Preview-
  Kennzeichnung funktioniert.

Ändern sich UI, Commit, Buildnummer oder relevante Store-Texte nach der
Aufnahme, werden betroffene Bilder neu erstellt.

## 3. Bildsatz und Erzählfolge

Die Bilder sollen echte App-Oberflächen zeigen. Marketingtexte dürfen nur
außerhalb der eigentlichen UI ergänzt werden, dürfen keine Garantie oder
nicht vorhandene Funktion behaupten und müssen mit ausreichend Kontrast
lesbar sein.

| Nr. | Szene | Kurze Bildaussage | Abnahmepunkte |
|---|---|---|---|
| 1 | Feed/Entdecken | „Dinge in deiner Nähe entdecken“ | vielfältige synthetische Inserate, keine 0-km-Falschaussage, Standort nur grob |
| 2 | Suche und Filter | „Finden, was du gerade brauchst“ | echte Filter-/Suchfunktion, keine fremden Marken oder geschützten Produktbilder |
| 3 | Inseratdetail | „Preis und Verfügbarkeit auf einen Blick“ | Beträge konsistent, keine Kautions- oder Schutzangabe, Adresse geschützt, Bilder lizenziert/synthetisch |
| 4 | Inserat erstellen | „Eigene Dinge einfach anbieten“ | Medien-, Preis-, Verfügbarkeits- und Übergabefelder sichtbar |
| 5 | Buchungsanfrage | „Zeitraum wählen und Anfrage senden“ | Testmodus, keine echte Karte oder persönliche Adresse |
| 6 | Buchungsstatus/Chat | „Buchung gemeinsam abstimmen“ | nur synthetischer neutraler Chat, keine Pushvorschau mit privatem Inhalt |
| 7 | Übergabe/Rückgabe | „Geführte Übergabe und Rückgabe“ | QR-/Schrittlogik wahrheitsgetreu, keine Garantiebehauptung |
| 8 | Vertrauen/Kontrolle | „Bewerten, melden und blockieren“ | reale Bedienelemente, keine frei erfundenen Bewertungssummen |
| 9 | Datenschutz/Konto | „Daten exportieren und Konto verwalten“ | Export/Löschung sichtbar, finaler Rechtstext noch nicht fotografieren, solange offen |

Für die erste Einreichung werden sechs bis acht der stärksten Szenen gewählt.
Mindestens Feed, Inseratdetail, Buchung, Chat und Übergabe sind enthalten.
Datenschutz/Konto wird erst verwendet, wenn öffentliche Rechtstexte und die
Produktions-Löschseite final sind.

## 4. Formate

### Google Play

- Store-Icon: Die aus dem weißen Masterlogo abgeleitete Play-Datei liegt geprüft
  unter `store/assets/google-play/icon-512.png`: 512 × 512 Pixel, PNG ohne
  Alphakanal und 80.578 Byte. Der Metadatenvalidator prüft Abmessungen, Format,
  Alphakanal und die 1.024-KB-Grenze bei jedem Lauf.
- Feature-Grafik: Die geprüfte, deterministisch erzeugbare Datei liegt unter
  `store/assets/google-play/feature-graphic-1024x500.png`: exakt 1024 × 500
  Pixel, 24-Bit-PNG ohne Alpha. Sie verwendet ausschließlich vorhandene
  SIT-Markenassets und die im Store-Text bereits belegte Aussage
  „Teile mehr. Kaufe weniger.“.
- Telefon: zwei bis acht Screenshots, JPEG oder 24-Bit-PNG ohne Alpha;
  Mindestkante 320 Pixel, Maximalkante 3.840 Pixel und längste Kante höchstens
  doppelt so lang wie die kürzeste.
- Für jedes Bild wird ein präziser deutscher Alternativtext mit höchstens 140
  Zeichen vorbereitet. Der geprüfte Entwurf mit acht eindeutigen Szenen liegt
  unter `store/google-play/de-DE/screenshot_alt_texts.json`; die Zuordnung zu
  einer Bilddatei erfolgt erst nach der echten Aufnahme.
- Tablet-Screenshots nur hochladen, wenn das Layout auf realen großen Displays
  bestanden ist; Telefonbilder nicht als Tabletansicht ausgeben.

### Apple

- Ein bis zehn Screenshots je benötigter Gerätegröße und Lokalisierung;
  JPEG/JPG/PNG ohne Alphakanal.
- Zunächst höchste benötigte iPhone-Auflösung aus App Store Connect aufnehmen;
  Apple skaliert bei identischer UI auf kleinere Größen.
- Die aktuell dokumentierte 6,9-Zoll-Familie akzeptiert unter anderem
  1320 × 2868, 1290 × 2796 oder 1260 × 2736 Pixel im Hochformat. Der konkrete
  Aufnahme-Simulator/-gerätetyp und die Console-Vorgabe werden unmittelbar vor
  Export erneut geprüft.
- App-Vorschauvideo ist optional und wird für B11 nur erstellt, wenn die
  vollständige Geräte-Matrix stabil ist.

## 5. Datenschutz- und Qualitätsprüfung jedes Assets

Vor Upload wird jedes einzelne Bild bei 100 Prozent und in Store-Vorschau
geprüft. Entfernt oder ersetzt werden:

- echte E-Mail-Adressen, Namen, Telefonnummern und Profilbilder;
- Hausnummern, exakte Koordinaten und reale Übergabeorte;
- Nachrichten, Supporttexte und Bewertungsinhalte echter Personen;
- Gerätekennungen, Push-Tokens, Request-IDs mit Personenbezug und QR-Codes aus
  echten Buchungen;
- Karten-, Bank-, Stripe- oder Auszahlungsangaben;
- Betriebssystem-Benachrichtigungen, Uhrzeit-/Kalenderdetails oder Statusleisten
  mit privaten Informationen;
- Debugbanner, Staging-Host, interne Build-IDs, technische Fehlermeldungen und
  Testdatenbezeichnungen, sofern sie nicht bewusst Teil eines Review-Nachweises
  und nicht der öffentlichen Grafik sind;
- fremde Logos, Marken, urheberrechtlich ungeklärte Produktfotos und
  irreführende Sterne-/Rankingangaben.

Retusche darf nur Privatdaten bereinigen oder den äußeren Marketingrahmen
gestalten. Die gezeigte App-Funktion selbst wird nicht grafisch erfunden.

## 6. Synthetische Review-Konten

| Konto | Rolle | Inhalt | Schutz |
|---|---|---|---|
| Review Owner | Vermieter | zwei neutrale Testinserate, Verfügbarkeit, keine echte Adresse | dauerhaft, kein OTP, nur Staging |
| Review Renter | Mieter | eine vorbereitete Anfrage/Buchung und neutraler Chat | dauerhaft, kein OTP, nur Staging |
| Support/Admin | nicht an Store-Reviewer geben | interne Moderationsprüfung | getrennt, nur internes Team |

Zugangsdaten werden ausschließlich in den geschützten Review-Feldern der
Stores gespeichert. Das Passwort ist eindeutig, wiederverwendbar für den
Reviewzeitraum und läuft nicht automatisch ab. Falls eine E-Mail-Verifizierung
nötig ist, wird das Konto vorher verifiziert. Reviewkonten dürfen keine
Produktionsrechte und keine Verbindung zu realen Zahlungsdaten besitzen.

Der maschinenlesbare Status liegt in `store/review-access.json`; der bereinigte
Nachweis liegt ausschließlich unter `docs/evidence/b11/`. Die Prüfung mit
`tool/diagnose_store_review_accounts.mjs` darf keine Konto-, Fixture- oder
Sessionkennungen ausgeben. Sie erzeugt beim Login lediglich technische
Testsitzungen und verändert keine Inserate, Buchungen, Nachrichten oder
Produktionsdaten. `tool/validate_store_review_access.mjs --require-ready`
sperrt jede Store-Einreichung, solange die realen Review-Szenarien, die
geschützten Store-Felder oder `blockingGates.reviewAccounts` offen sind.

Status vom 13. August 2026: Der geschützte synthetische Rollen-Satz wurde auf
Kandidat 2026081302 erneut geprüft. Beide Rollen bestehen den Passwort-Login
ohne OTP, sehen dasselbe aktive Inserat und eine frische akzeptierte
Testbuchung und können den gemeinsamen Chat lesen. Melden/Blockieren, ein
vollständiger privater Kontodatenexport und die Kontolöschung sind ebenfalls
technisch bestanden. Für den Löschtest wurde ausschließlich ein älteres
entbehrliches synthetisches Mieterkonto geschlossen; die aktiven
Review-Konten blieben unverändert. Damit sind acht von zehn Review-Szenarien
technisch bestanden.
Frische Installation, Zweitnetz und die geschützten Store-Felder bleiben
offen; deshalb gilt weiterhin `readyForStore=false`.
Der bereinigte Laufzeitnachweis für gleichzeitig aktives SMTP und FCM liegt in
`docs/evidence/b11/staging-mail-push-runtime-20260811.json`; er enthält keine
Konten, Tokens oder Zugangsdaten und dokumentiert den unveränderten
Produktionscontainer sowie die private Rollback-Sicherung.

Für die Review-Konten werden folgende Zustände vorbereitet:

1. ein sichtbares, buchbares Inserat des Vermieters;
2. ein zweites Inserat für Erstellen/Bearbeiten/Medien;
3. eine offene Anfrage und eine akzeptierte Testbuchung;
4. ein neutraler Chat ohne personenbezogene Information;
5. ein abgeschlossener Testfall für Bewertung;
6. ein separater meldbarer synthetischer Inhalt;
7. keine blockierende reale Buchung beim Test der Kontolöschung.

## 7. Interne Testgruppen

### Phase A – technische Internal-Gruppe

- Walid als Kontoinhaber/Produktverantwortlicher;
- Codex als technischer Ausführungs- und Evidenzprozess, nicht als eigener
  Store-Account;
- mindestens ein reales Android- und ein reales iOS-Gerät;
- nur der B11-Store-Build und Staging;
- Testmatrix aus
  `B11_CLOSED_STORE_AND_DEVICE_TEST_RUNBOOK_2026-08-09.md` vollständig.

### Phase B – geschlossene Rollen-/Gerätegruppe

- mindestens zwei reale Personen beziehungsweise klar getrennte Testrollen;
- Vermieter und Mieter gleichzeitig auf unterschiedlichen Geräten/Netzen;
- keine Familien-/Kindergruppe und keine öffentliche Einladung;
- Testervereinbarung: ausschließlich synthetische Inhalte, keine echten
  Adressen, Zahlungsmittel oder Identitätsdokumente;
- Feedback über festes Formular mit Build, Plattform, Schritt, Erwartung,
  Ergebnis, Schweregrad und bereinigtem Beleg.

### Google-Sonderfall neues persönliches Konto

Wenn Play Console das Konto als neu angelegtes persönliches Entwicklerkonto
nach dem 13. November 2023 einstuft, wird nach Internal Testing ein geschlossener
Test mit mindestens 12 durchgehend angemeldeten Testern über mindestens 14 Tage
geplant. Diese Gruppe wird erst eingeladen, wenn Datenschutzseiten,
Nutzerinhaltsregeln und der B11-Build stabil sind. Ein Organisationskonto oder
abweichende Console-Anforderungen werden nicht vorweggenommen.

Die Frist beginnt im Nachweis erst, wenn mindestens zwölf gleichzeitig
durchgehend angemeldete Tester als aggregierter Console-Wert bestätigt wurden.
Während des Testfensters wird der Stand regelmäßig und mindestens bei Start,
Zwischenkontrolle, Ablauf der 14 Tage sowie Produktionszugangsentscheidung
bereinigt beobachtet. Die Repository-Evidenz enthält nur Anzahl, Zeitfenster,
Engagement- und Freigabestatus; die eigentliche Testerzuordnung bleibt
ausschließlich im geschützten Google-Konto.

Der maschinenlesbare Feedbackplan liegt in
`store/google-play/closed-testing-feedback-plan.json`. Er verteilt die reale
Nutzung auf Installation/Sitzung, Feed/Suche, Inserate, Buchung, Chat/Push,
Offline-Wiederkehr, Übergabe/Rückgabe/Storno, Melden/Blockieren/Bewertung sowie
Barrierefreiheit/Export/Löschung. Kontrollpunkte sind qualifizierender Start,
frühe Nutzung, Halbzeit, späte Nutzung und Eligibility-Beobachtung.

Die versandfertige, aber noch linkfreie Anleitung für alle geschlossenen
Tester liegt in
`docs/operations/B11_GOOGLE_PLAY_CLOSED_TESTER_ONBOARDING_2026-08-14.md`.
Der private Opt-in-Link und der private Feedbackkanal werden ausschließlich
beim persönlichen Versand ergänzt. Weder die Testerzuordnung noch ein aktiver
Link dürfen in Repository oder Master-Dokument gelangen.

Vor dem realen Start bindet der Feedbackplan nur Build `2026081403` als
reservierten finalen Kandidaten; ein Commit darf in diesem Zustand nicht
erfunden werden. Erst wenn der exakte Play-Internal-Build installiert und der
Closed Test tatsächlich gestartet ist, wird der Plan auf Build und Commit des
Gerätekandidaten umgestellt. Aktive Rückmeldungen mit einer bloßen Reservierung
werden fail-closed abgelehnt.

Der bestätigte Beobachtungsschritt
`tool/prepare_google_play_closed_testing_observation.mjs` übernimmt diese
Umstellung beim ersten qualifizierenden Console-Stand automatisch zusammen
mit dem Beginn des 14-Tage-Fensters. Ohne mindestens zwölf beobachtete Tester,
exakten installierten Endkandidaten und den ausdrücklichen Schalter
`--confirm-console-observation` bleibt der Lauf reine Vorschau und verändert
keine Datei.

Einzelne Rückmeldungen und die Testerzuordnung bleiben im geschützten Kanal.
In das Repository dürfen nur aggregierte Anzahlen, bereinigte Themen,
tatsächlich umgesetzte Änderungen und ein bereinigter Evidenzverweis gelangen.
Solange der Closed Test nicht real begonnen hat, erzwingt der Validator den
Zustand `planned` mit vollständig leeren Ergebnisfeldern.

## 8. Review-Ablauf

1. Reviewer-Anmeldedaten aus dem geschützten Store-Feld testen.
2. Login aus frischer Installation und einem zweiten Netz prüfen.
3. Beide Rollen und alle geschützten Kernbereiche ohne OTP erreichbar machen.
4. Zahlungsweg klar als Miete eines physischen Gegenstands und Testmodus
   kennzeichnen.
5. Kamera-, Foto-, Datei-, Standort- und Push-Zwecke direkt am jeweiligen
   Funktionsweg verständlich erklären.
6. Nutzerinhalt melden und Nutzer blockieren; Staff-Adminbereich bleibt intern.
7. Kontodatenexport und Kontolöschung inklusive externer URL prüfen.
8. Store-Review-Hinweise gegen den installierten Build Wort für Wort abgleichen.

## 9. Evidenzstruktur

Jede Aufnahme-/Review-Runde erhält die Kennung
`b11-store-<plattform>-<build>-<kurzzeit>` und enthält:

- Commit, Version, Buildnummer, Paketkennung und Artefakthash;
- Gerät/Simulator und Betriebssystem ohne persönliche Geräte-ID;
- Bildnummer, Szene, Sprache und Exportabmessungen;
- Privatdatenprüfung bestanden/nicht bestanden;
- UI-/Textabgleich bestanden/nicht bestanden;
- Name der finalen Store-Datei;
- Reviewer-Konten getestet, aber keine Zugangsdaten;
- Store-Vorschau und Warnungen als bereinigter Nachweis.

## 10. Stop-Regeln

Kein Asset-Upload und keine Review-Anforderung bei:

- P0/P1 aus der realen Geräteprüfung;
- sichtbaren Privatdaten oder ungeklärten Bildrechten;
- falscher App-ID, API-Umgebung, Buildnummer oder Zahlungskonfiguration;
- Abweichung zwischen Screenshot und finaler App;
- fehlendem Melden/Blockieren bei Nutzerinhalten;
- fehlender Datenschutz-, Support- oder Löschseite;
- ablaufenden/gesperrten Review-Konten;
- nicht bestätigter rechtlicher Anbieteridentität.

## 11. Offizielle Referenzen

- [Google Play: Vorschau-Assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Google Play: Review-Anmeldedaten](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en-EN)
- [Google Play: interne und geschlossene Tests](https://support.google.com/googleplay/android-developer/answer/9845334/set-up-an-open-closed-or-internal-test?hl=en-GB)
- [Google Play: Anforderungen an neue persönliche Konten](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Apple: Screenshots hochladen](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
- [Apple: Screenshot-Spezifikationen](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Apple: App-Review-Vorbereitung](https://developer.apple.com/app-store/review/)
