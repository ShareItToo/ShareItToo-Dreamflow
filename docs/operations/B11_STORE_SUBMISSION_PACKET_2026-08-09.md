# B11 – Store-Einreichungspaket für ShareItToo

Stand: 9. August 2026  
Status: redaktionell vorbereitet; nicht zur öffentlichen Freigabe  
Geltungsbereich: Google Play Internal/Closed Testing und Apple TestFlight gegen Staging

## 1. Zweck und Wahrheitsgrenze

Dieses Paket enthält die vorbereiteten Store-Texte, Review-Hinweise und
Einreichungsentscheidungen für `com.shareittoo.app`. Es ist aus dem tatsächlich
vorhandenen App- und Backend-Verhalten abgeleitet. Es erfindet weder
Nutzerzahlen noch Versicherungen, Garantien, Verifizierungsstufen oder
Zahlungsfunktionen.

Vor einer Einreichung müssen die mit **OFFEN** markierten Angaben fachlich oder
im jeweiligen Store-Konto bestätigt werden. Insbesondere sind die derzeit in
der App angezeigte Gesellschaftsform, Anbieteranschrift, Vertretung,
Telefonnummer, Rechts-/Steuerangaben, AGB, Datenschutzerklärung und
Aufbewahrungsfristen keine durch dieses Dokument bestätigten Rechtsangaben.

Der erste Firebase- und Push-fähige Store-Kandidat erhält mindestens die
Buildnummer `2026080903`. Der bestehende technische Zwischenkandidat
`1.0.0 (2026080902)` wird nicht hochgeladen.

## 2. Kanonische Produktangaben

| Feld | Entwurf | Status |
|---|---|---|
| Produktname | ShareItToo | bereit |
| Android Application ID | `com.shareittoo.app` | technisch verifiziert |
| iOS Bundle ID | `com.shareittoo.app` | technisch vorbereitet |
| Version | `1.0.0` | technisch verifiziert |
| Primärsprache | Deutsch (Deutschland) | Empfehlung; **OFFEN** bis Store-Anlage |
| Zielgruppe | Erwachsene ab 18 Jahren; nicht für Kinder entwickelt | durch Registrierungsvorgabe begründet |
| Werbung | keine Anzeigen, kein Werbe-SDK | durch aktuellen Code begründet |
| Tracking | kein Werbe- oder Drittanbieter-Tracking | durch aktuellen Code begründet |
| Geschäftsmodell | Marktplatz zur zeitweisen Vermietung physischer Gegenstände | bereit |
| Zahlung | außerhalb der Store-Abrechnung für die Miete physischer Gegenstände; vor B11 nur Memory- oder Stripe-Testmodus | technisch vorbereitet; Echtgeld bleibt gesperrt |
| Google-Play-Kategorie | Shopping | Empfehlung; **OFFEN** bis Kontoprüfung |
| Apple-Primärkategorie | Shopping | Empfehlung; **OFFEN** bis Kontoprüfung |
| Apple-Sekundärkategorie | Lifestyle | Empfehlung; optional |
| Support-E-Mail | `contact@shareittoo.com` oder `support@shareittoo.com` | **OFFEN: eine Adresse festlegen und Zustellung prüfen** |
| Marketing-URL | `https://shareittoo.com/` | erreichbar; finalen Inhalt vor Einreichung prüfen |
| Support-URL | noch nicht freigabefähig | **BLOCKER: öffentliche Supportseite mit echten Kontaktmöglichkeiten** |
| Datenschutz-URL | noch nicht freigabefähig | **BLOCKER: öffentliche, finale Datenschutzerklärung** |
| Löschantrag-URL | Staging technisch unter `https://staging.shareittoo.com/api/v1/account-deletion` erreichbar | **BLOCKER: dauerhafte öffentliche Produktions-URL bereitstellen** |

Kontostatus vom 12. August 2026: Das persönliche Google-Play-Entwicklerkonto
ist erstellt, die erforderlichen Verträge wurden von Walid bewusst angenommen
und die einmalige Registrierungsgebühr wurde bezahlt. Offen bleiben die
persönliche Identitätsprüfung mit amtlichem Ausweis und gegebenenfalls
Adressnachweis, anschließend die Geräte- und Telefonnummernbestätigung sowie
der erste App-Datensatz. Für Apple wurde noch keine Entwicklermitgliedschaft
angelegt. Die Firebase-Bedingungen sind noch nicht als vom Produkteigentümer
bestätigt belegt. Dieser geheimnisfreie Stand liegt in
`store/platform-account-readiness.json` und ist fest mit den drei zugehörigen
Store-Gates verknüpft. Es wurde noch keine App und kein Track eingereicht.

## 3. Google-Play-Store-Eintrag – Deutsch

### App-Name

`ShareItToo`

10 von maximal 30 Zeichen.

### Kurzbeschreibung

`Miete und vermiete Dinge in deiner Nähe – mit Buchung, Chat und Übergabe.`

73 Zeichen; die finale Zählung im Play-Console-Feld bleibt maßgeblich. Der
Text liegt unter der Grenze von 80 Zeichen.

### Vollständige Beschreibung

> Teile mehr, kaufe weniger: Mit ShareItToo kannst du Gegenstände in deiner
> Nähe finden, zeitweise mieten oder selbst zur Vermietung anbieten.
>
> Entdecken und anbieten
> • Durchsuche lokale Inserate und filtere passende Gegenstände.
> • Erstelle eigene Inserate mit Bildern, Preis, Verfügbarkeit und
>   Übergabeinformationen.
> • Teile nur so viele Standortinformationen, wie für Suche und Übergabe nötig
>   sind.
>
> Buchungen gemeinsam abwickeln
> • Sende und verwalte Buchungsanfragen mit einem klaren Status.
> • Stimme Details im Buchungs-Chat direkt mit der anderen Person ab.
> • Nutze geführte Schritte und QR-Codes für Übergabe und Rückgabe.
> • Dokumentiere bei Bedarf den Zustand mit Bildern.
>
> Vertrauen und Kontrolle
> • Bewerte abgeschlossene Buchungen.
> • Melde Inhalte oder Nutzer und blockiere unerwünschte Kontakte.
> • Verwalte Benachrichtigungen, Sitzungen und Kontoeinstellungen.
> • Exportiere deine Kontodaten oder beantrage die Löschung deines Kontos.
>
> ShareItToo ist für volljährige Nutzerinnen und Nutzer vorgesehen. Zahlungen
> betreffen ausschließlich die zeitweise Nutzung physischer Gegenstände.

Der Text bleibt unter der Google-Grenze von 4.000 Zeichen. Staging- und
Testhinweise stehen ausschließlich in den internen Release-/Review-Feldern,
nicht in der öffentlichen Beschreibung.

### Interne Release-Notiz

`Erster geschlossener ShareItToo-Test: lokale Inserate, Buchungen, Chat, Übergabe/Rückgabe, Meldungen sowie Kontodatenexport und Kontolöschung. Dieser Build verwendet ausschließlich Staging und Testzahlungen.`

### App-Zugriff für Google Review – Entwurf

Die Zugangsdaten werden ausschließlich in das geschützte Play-Console-Feld
eingetragen, niemals in Git, dieses Dokument, Telegram oder den Masterplan.

> Language: English  
> The app is a marketplace for temporary rentals of physical items. It does
> not sell digital content or unlock digital features.  
> Environment: closed staging only. Payments are in test mode and no real
> money is charged.  
> Reviewer account: [SECURE PLAY CONSOLE FIELD]  
> Password: [SECURE PLAY CONSOLE FIELD]  
> The reusable reviewer account must not require OTP or location-dependent
> verification.  
> To review the owner flow, open Profile > Switch role/test context only if the
> final build exposes an approved reviewer path; otherwise use the second
> account supplied in the protected instructions.  
> Camera is used for listing, chat and handover evidence; photo/file access is
> user initiated; location is used for nearby results and optional handover
> location; notifications are used for booking, chat and handover events.  
> Account deletion: Profile > Account settings > Delete account. The external
> deletion URL is supplied in the Data safety form.  
> User-generated listings, messages and reviews can be reported, and users can
> be blocked in the app.

Vor Einreichung werden zwei dauerhafte synthetische Review-Konten angelegt:
Vermieter und Mieter. Beide erhalten ausschließlich synthetische Inserate,
Chats, Bilder, Adressen und Testbuchungen. Keine persönliche Testadresse und
keine echte Zahlungsinformation verwenden.

Der technische Status wird maschinenlesbar in `store/review-access.json`
geführt und durch `tool/validate_store_review_access.mjs` gegen Kandidat,
Staging-Grenzen, bereinigte Evidenz und den Store-Gate geprüft. Am
11. August 2026 sind die zwei erneuerten Konten per realem Staging-Mailweg
bestätigt. Passwort-Login, aktives Inserat, akzeptierte Testbuchung und
gemeinsamer Chat sind für Vermieter und Mieter nachgewiesen. Auch
Melden/Blockieren, privater Datenexport und die Kontolöschung eines älteren
entbehrlichen synthetischen Mieterkontos sind nachgewiesen; die aktiven
Review-Konten blieben unverändert. Acht von zehn Review-Szenarien sind damit
bestanden. Frische Installation, Zweitnetz und die geschützten Store-Felder
bleiben offen. `blockingGates.reviewAccounts` bleibt deshalb offen. Der
Release-Preflight erzwingt im echten Store-Modus zusätzlich `--require-ready`
und stoppt bis zum vollständigen Nachweis.

## 4. Apple-App-Store-Eintrag – Deutsch

### Name

`ShareItToo`

10 von maximal 30 Zeichen.

### Untertitel

`Dinge lokal mieten und teilen`

29 Zeichen und damit unter der Apple-Grenze von 30 Zeichen; der
App-Store-Connect-Zähler ist vor dem Speichern maßgeblich.

### Werbetext

`Finde Gegenstände in deiner Nähe, vermiete eigene Dinge und organisiere Buchung, Chat, Übergabe und Rückgabe gemeinsam in einer App.`

132 Zeichen und damit unter der Apple-Grenze von 170 Zeichen.

### Beschreibung

Für Apple wird die vollständige Google-Beschreibung ohne Aufzählungszeichen,
die wie Formatierungsmarkup wirken könnten, verwendet. Der Inhalt bleibt
reiner Text und unter 4.000 Zeichen. Der Hinweis auf den geschlossenen Test
wird nur für TestFlight, nicht für eine spätere öffentliche Produktseite,
verwendet.

### Keywords

`mieten,vermieten,teilen,leihen,verleihen,marktplatz,nachbarschaft,werkzeug,technik,freizeit`

91 ASCII-Bytes und damit unter Apples Grenze von 100 Bytes; der Eintrag
enthält keine fremden Marken und wiederholt den App-Namen nicht.

### Copyright

`2026 [BESTÄTIGTER RECHTSINHABER]`

**OFFEN:** erst nach Bestätigung der Person oder juristischen Einheit
eintragen. Apple ergänzt das Copyright-Zeichen selbst.

### App-Review-Hinweise – Entwurf

> ShareItToo is a two-sided marketplace for temporary rentals of physical
> items. Payments relate only to physical goods used outside the app; no
> digital content, subscription or app feature is sold. The submitted build is
> connected only to our closed staging environment and uses test payments.
>
> Two non-expiring synthetic review accounts are provided in the protected
> Sign-In Information fields: one owner and one renter. They do not require OTP
> or a location-specific code. No credentials are included in the review notes.
>
> Suggested review path: sign in as owner, open or create the prepared listing;
> sign in as renter on the second account, search and request the listing;
> return to the owner account to accept; continue through test payment, chat,
> handover and return. Reporting, blocking, reviews, data export and account
> deletion are available from the relevant profile, conversation and account
> screens.
>
> Camera: listing photos, chat/report evidence and handover QR scanning.
> Photo library/files: user-initiated uploads. Location: nearby discovery and
> optional handover location. Notifications: booking, chat and handover events.
>
> There are no ads and no advertising tracking. Firebase Analytics is not
> included. Firebase Cloud Messaging and Crashlytics are used only for push
> delivery and release diagnostics. Google Maps Platform is used for
> user-initiated address and map functions. AI helpers and live Stripe
> processing are disabled in this staging candidate. Crash reports must not
> contain account, message, address, token or payment content.
>
> Contact: [PROTECTED APP STORE CONNECT FIELDS]. If any feature cannot be
> reached with the supplied accounts, contact us before rejecting the build.

## 5. Zahlungen und Store-Abrechnung

ShareItToo vermittelt die zeitweise Nutzung physischer Gegenstände außerhalb
der App. Der Store-Eintrag beschreibt keine digitalen Freischaltungen,
Abonnements, Credits, virtuellen Güter oder werbefreien Premiumstufen.

- Apple verlangt für physische Güter oder außerhalb der App konsumierte
  Dienstleistungen andere Zahlungsarten als In-App Purchase; diese
  Einordnung ist in den Review-Hinweisen erklärt.
- Google Play unterstützt seine Abrechnung nicht für Kauf oder Miete
  physischer Güter; deshalb wird kein Play-Billing-Produkt angelegt.
- Der vorhandene SIT-Credit-/lokale Demo-Zweig darf im Release keine bezahlte
  digitale Währung darstellen oder eine Store-Funktion freischalten.
- Vor B11 bleibt der Zahlungsweg `memory` oder ausdrücklich freigegebener
  Stripe-Testmodus mit `livemode=false`.
- Echtgeld, Auszahlungen und Produktions-Webhooks bleiben bis zu den
  geschützten B12/B13-Gates gesperrt.

## 6. Inhalte, Zielgruppe und Richtlinienangaben

| Angabe | Entwurf | Vor Einreichung prüfen |
|---|---|---|
| App oder Spiel | App | ja |
| Kostenloser Download | ja | Geschäftsentscheidung bestätigen |
| Anzeigen | nein | Abhängigkeiten erneut scannen |
| Zielgruppe Kinder | nein | nur Altersgruppen ab 18 auswählen |
| Nutzerinhalte | ja: Inserate, Bilder, Nachrichten und Bewertungen | Meldung/Blockierung/Moderation auf Store-Build testen |
| Kommunikation | private Chats zwischen Buchungsparteien und Support | Review-Konto vorbereiten |
| Standort | grob und präzise, nur funktionsbezogen/optional je Flow | Laufzeitdialoge und Datenschutzerklärung abgleichen |
| Kamera/Fotos | nur nutzerinitiierte Bild- und QR-Flows | Ablehnung der Berechtigung testen |
| Benachrichtigungen | Buchung, Chat, Übergabe, Zahlung, Support | FCM/APNs real testen |
| Kontenerstellung | ja | Löschung in App und öffentliche Löschseite nachweisen |
| Inhaltsbewertung | nicht vorwegnehmen | Google-IARC- und Apple-Fragebogen wahrheitsgemäß ausfüllen |
| DSA/Trader-Status | **OFFEN** | durch Kontoinhaber/Rechtsberatung bestimmen |

## 7. Öffentliche URLs vor Store-Einreichung

Die folgenden Seiten müssen dauerhaft, mobil lesbar, ohne Login und mit
gültigem TLS erreichbar sein:

1. `https://shareittoo.com/` – Produkt-/Marketingseite.
2. **OFFEN:** Supportseite mit echter Kontaktadresse und, soweit erforderlich,
   Anschrift, E-Mail und Telefonnummer.
3. **OFFEN:** finale Datenschutzerklärung einschließlich Verantwortlichem,
   Zwecken, Rechtsgrundlagen, Empfängern/Auftragsverarbeitern,
   Drittlandtransfers, Aufbewahrungsfristen, Rechten und Kontaktweg.
4. **OFFEN:** öffentliche Kontolöschseite. Die Backend-Funktion ist auf Staging
   unter `https://staging.shareittoo.com/api/v1/account-deletion` nachgewiesen;
   die gleichwertige Produktions-API-URL liefert am 9. August 2026 noch 404.
5. **OFFEN:** finale AGB/Nutzungsbedingungen und Nutzerinhaltsregeln.

### Fail-closed Rechts- und Registrierungsnachweis

`store/legal-readiness.json` bindet den weiterhin offenen
`termsAndUserContentRules`-Gate an die aktuellen Inhalte von AGB,
Community-Regeln, Widerrufs-/Stornoregeln sowie Gebühren und Zahlungen. Die
Registrierung verlangt nun drei getrennte, standardmäßig nicht gesetzte
Bestätigungen für Mindestalter, AGB und Datenschutz. Der Auth-Service reicht
die tatsächlichen Werte weiter; das Backend weist jede fehlende Bestätigung ab
und speichert die drei Annahmezeitpunkte getrennt.

Anbieteridentität und Copyright-Inhaber sind zusätzlich als zwei getrennte
Freigaben an die gleichnamigen Store-Gates gekoppelt. Ein Wechsel auf
`closed` ist nur zusammen mit einer bereinigten JSON-Nachweisreferenz unter
`docs/evidence/b11/` gültig. Der aktuelle Entwurf hält sämtliche
Rechtsfreigaben ausdrücklich auf `open` und enthält keine solche Referenz.

```text
node tool/validate_legal_readiness.mjs
node tool/validate_legal_readiness.mjs --require-approved
```

Der erste Befehl prüft den ehrlichen Entwurfszustand. Der zweite bleibt
absichtlich rot, bis die Inhalte geprüft und exakt gehasht, die öffentlichen
HTTPS-Seiten verifiziert, alle Rechts-/Moderations-/Konsistenzfreigaben belegt
und alle verbundenen Store-Gates geschlossen sind. Diese technische Absicherung ist keine
Rechtsberatung und ändert weder öffentliche Routen noch den
Store-Einreichungsstatus.

Die Flutter-Web-App liefert für unbekannte Pfade derzeit ihre Startseite aus.
Ein HTTP-200 allein beweist deshalb keine gültige Support-, Datenschutz- oder
Löschseite. Der sichtbare Inhalt muss jeweils manuell und automatisiert geprüft
werden.

## 8. Store-Konto und geschlossener Test

### Google Play

1. Persönliche Identitätsprüfung abschließen; danach Gerätezugang und
   Telefonnummer im bereits erstellten und bezahlten Konto bestätigen.
2. App mit `com.shareittoo.app` anlegen, Primärsprache Deutsch, kostenlos.
3. App-Zugriff, Anzeigen, Zielgruppe, Inhaltsbewertung, Nutzerinhalte,
   Datenschutz und Data Safety als Entwurf ausfüllen.
4. Icon 512 × 512, Feature-Grafik 1024 × 500 und bereinigte Screenshots laden.
5. Exakt den gebundenen Firebase-fähigen AAB-Kandidaten `2026081201` nur in
   Internal Testing laden; Play-App-Signing-Fingerabdruck erfassen und Asset
   Links ergänzen.
6. Nach interner Abnahme gegebenenfalls Closed Testing starten. Falls ein neu
   angelegtes persönliches Konto betroffen ist, ist vor Produktionszugang ein
   geschlossener Test mit mindestens 12 durchgehend angemeldeten Testern über
   14 Tage einzuplanen. Der konkrete Kontotyp im Console entscheidet.

### Apple

1. Apple Developer/App Store Connect mit Walids Apple-ID und 2FA öffnen.
2. Bundle ID `com.shareittoo.app`, Push, Associated Domains und Signierung im
   richtigen Team anlegen.
3. Vollständiges Xcode installieren und das Archiv aus dem dokumentierten
   sauberen Commit erzeugen.
4. App-Datensatz, Datenschutzangaben, Review-Kontakt und geschützte
   Review-Konten eintragen.
5. Einen bis zehn bereinigte iPhone-Screenshots bereitstellen; ein Vorschauvideo
   ist optional.
6. Build nur an interne TestFlight-Tester verteilen. Öffentliche Freigabe und
   externe Beta-Öffnung sind nicht Bestandteil von B11.

## 9. Einreichungs-Stoppliste

Kein Store-Upload und keine Review-Anforderung, solange einer dieser Punkte
offen ist:

- rechtliche Anbieteridentität oder Copyright-Inhaber nicht bestätigt;
- finale Datenschutz-, Support- oder öffentliche Kontolösch-URL fehlt;
- Data-Safety-/App-Privacy-Matrix stimmt nicht mit dem finalen Binärartefakt;
- Google-Maps-Anwendungs-/API-Beschränkung des Client-Schlüssels nicht belegt;
- Review-Konten fehlen, laufen ab oder benötigen OTP;
- Nutzerinhaltsregeln, Melden oder Blockieren funktionieren nicht;
- Firebase-/APNs-Konfiguration, Signierung oder höhere Buildnummer fehlt;
- Build verweist nicht ausschließlich auf Staging oder meldet `livemode=true`;
- Screenshots enthalten echte Namen, Adressen, Nachrichten, Gerätekennungen
  oder Zahlungsdaten;
- reale Android-/iOS-Geräteabnahme des B11-Runbooks ist nicht ausführbar.
- der verpflichtende geschlossene Google-Play-Test mit mindestens zwölf
  dauerhaft angemeldeten Testern noch keine 14 aufeinanderfolgenden Tage
  belegt oder der Produktionszugang noch nicht genehmigt ist.

## 10. Maschinenlesbare Metadaten und Freigabesperre

Die kanonischen Textdateien und der aktuelle Gate-Status liegen unter
`store/`. `store/submission.json` steht absichtlich auf `draft` und
`submissionAllowed: false`. Der lokale/CI-Validator
`tool/validate_store_metadata.dart` prüft insbesondere:

- Paket-/Bundle-ID, Version, internen Kanal und Staging-API;
- Google- und Apple-Zeichen-/Bytegrenzen;
- identische Produktnamen und keine fremden Marken oder riskanten
  Werbeversprechen in öffentlichen Texten;
- 18+-Zielgruppe, physische Miete, keine Anzeigen, kein Tracking und kein
  Firebase Analytics;
- vorhandene Quelldokumente, HTTPS-URLs und ehrliche offene Gates;
- höhere Mindest-Store-Buildnummer `2026080903`;
- harte Ablehnung eines einreichbaren Zustands, solange URL- oder
  Freigabegates offen sind.
- Bindung des Google-Play-Produktionszugangs an den bereinigten,
  maschinenlesbaren 12-Tester-/14-Tage-Nachweis in
  `store/google-play/closed-testing-readiness.json`.

Standardprüfung: `dart run tool/validate_store_metadata.dart`. Eine spätere
Upload-Automation muss zusätzlich `--require-submittable` verwenden und darf
bei einem Fehler keinen Store-Upload starten. Der signierte Release-Preflight
führt die Standardprüfung immer aus; mit
`SIT_REQUIRE_STORE_SUBMISSION=1` erzwingt er vor einem tatsächlichen Upload
zusätzlich den strengen Store-Metadatenmodus und
`node tool/validate_legal_readiness.mjs --require-approved` sowie
`node tool/validate_privacy_disclosures.mjs --require-approved` und
`node tool/validate_retention_deletion_readiness.mjs --require-approved`.
Zusätzlich verlangt der Store-Modus
`node tool/validate_google_play_closed_testing.mjs --require-production-access`.
Der Aufbewahrungs-/Löschvalidator bindet die tatsächlich implementierte
Kontolöschung an Quellhashes und lässt alle noch ungeklärten Rechtsfristen,
Purge-/Legal-Hold-Abläufe, Backup-Löschgrenzen und externen
Auftragsverarbeiter-Nachweise fail-closed. Ein Upload
kann damit weder die allgemeinen Store-Gates noch die inhaltsgebundene
Rechtsfreigabe oder den quell-/binärgebundenen Datenschutzentwurf umgehen.

## 11. Offizielle Referenzen

- [Google Play: Store-Eintrag und Textgrenzen](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
- [Google Play: Vorschau-Assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Google Play: Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play: Kontolöschung](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Google Play: Nutzerinhalte](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)
- [Google Play: physische Güter und Zahlungen](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- [Apple: App-Informationen](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)
- [Apple: versionsbezogene Metadaten und Review-Information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Apple: App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple: Screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
