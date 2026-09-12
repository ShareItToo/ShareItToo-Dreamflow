# B11 – Google-Play-Console-Eingabeblatt

Stand: 15. August 2026
Status: interner, geheimnisfreier Arbeitsentwurf; keine Einreichung freigegeben

## 1. Zweck und feste Grenze

Dieses Blatt ordnet die bereits belegten ShareItToo-Fakten den erwarteten
Google-Play-Feldern zu. Es dient nach Abschluss der persönlichen
Kontoverifizierung als Eingabe- und Gegenprüfliste. Es ersetzt weder die
sichtbaren Console-Fragen noch Rechts-/Datenschutzentscheidungen und darf
keinen Upload oder Review-Versand auslösen.

Verbindlicher Kandidat:

- App: `ShareItToo`
- Paket: `com.shareittoo.app`
- Version: `1.0.0`
- Build: `2026081509` (gebaut, archiviert, binär geprüft, intern veröffentlicht und als exakter Play-Store-Split auf dem physischen Android-Gerät validiert)
- App-Commit: `3fa045b98897f9551f91da932136c2b100b2d700`
- Kanal: ausschließlich Internal Testing
- Umgebung: ausschließlich Staging
- Zahlung: `paymentMode=memory`, `stripeLivemode=false`
- Freigabezustand: AAB im Internal Testing aktiv und als exakter Store-Build geprüft; weiterhin
  keine Store-Einreichung erlaubt und keine Review-, Closed-, Open- oder
  Production-Freigabe zulässig

Aktueller interner Verlauf: Build `2026081501` wurde am 15. August 2026 im
Internal Testing aktiviert und vom Play Store auf dem Pixel installiert. Der
physische Chat-Test zeigte anschließend eine zweite, rein interne
Selbstaktualisierungsschleife. Build `2026081502` ersetzte diesen Stand für
weitere Staging-Tests. Build `2026081505` bestand Anmeldung/Sitzung, Chat,
Deep Links, alle drei Push-Zustände, Abmeldung, Offline-Wiederkehr und den
V4-Rollen-/Buchungsablauf. Build `2026081506` ergänzte die
Android-Systemfotoauswahl ohne pauschalen Galerie-Zugriff und bestand den
Chat-Fotoablauf. Build `2026081507` korrigierte zusätzlich die Sichtbarkeit
der bestätigten Übergabe- und Rückgabeaktionen. Der aktuelle Build
`2026081508` ergänzte die serverseitig synchronisierte Übergabezeit: Vermieter
schlägt vor, Mieter bestätigt und erst danach kann der Vermieter die Übergabe
starten. Dieser Ablauf ist mit zwei synthetischen Rollen auf dem lokal
signierten Kandidaten bestanden. Build `2026081509` fängt nicht konfigurierte
Social-Login-Anbieter sicher ab und beseitigt den zuvor beobachteten
Facebook-SDK-Startfehler. Er ist im internen Play-Track aktiv. Die erste
Store-Installation von Build `2026081508` unmittelbar nach dessen Aktivierung
lieferte noch `2026081507`; nach kurzer Propagation bot Google Play das Update
an und installierte exakt `2026081508`. Google Play bot anschließend Build
`2026081509` unmittelbar als Update an und installierte exakt diesen Build.
Paket, vier Store-Splits,
Play-Installer, Play-Signatur, Kaltstart, synthetische Sitzung und Staging-Feed
sind bestanden; der frühere Facebook-SDK-Fehler trat nicht mehr auf. Die
weiteren Geräteabläufe werden für `2026081509` neu geprüft und nicht aus
älteren Builds übernommen. Keine höhere Freigabestufe wurde geöffnet.

## 2. Persönliches Entwicklerkonto und App-Datensatz

Erledigt:

- persönliches Google-Play-Entwicklerkonto `ShareItToo` erstellt;
- erforderliche Konto-Verträge bewusst angenommen;
- einmalige Registrierungsgebühr bezahlt;
- Identität mit amtlichem Lichtbildausweis, Android-Gerät und Telefonnummer
  verifiziert;
- App-Datensatz `ShareItToo` für `com.shareittoo.app` erstellt;
- Play App Signing aktiviert und beide Zertifikate kontrolliert erfasst.

Keine Ausweisbilder, Telefonnummern, Einmalcodes, E-Mail-Adressen,
Zahlungsdaten oder Google-Konto-IDs in Git, Drive, Telegram oder Evidenz
übernehmen.

## 3. „App erstellen“ – vorbereitete Eingaben

| Console-Feld | Arbeitswert | Grenze |
|---|---|---|
| Standardsprache | Deutsch – Deutschland (`de-DE`) | vor Speichern sichtbare Auswahl prüfen |
| App-Name | `ShareItToo` | 10 von 30 Zeichen |
| App oder Spiel | App | kein Spiel |
| Kostenlos oder kostenpflichtig | kostenlos | nach Veröffentlichung nicht ohne Folgen auf bezahlt umstellbar |
| Nutzerkontakt | im geschützten Console-Feld die betriebliche ShareItToo-Adresse | niemals in Repository/Evidenz kopieren |
| Entwicklerprogramm-Richtlinien | nur nach sichtbarer Prüfung bestätigen | Kontoinhaberentscheidung |
| US-Exportrecht | nur nach sichtbarer Prüfung bestätigen | Kontoinhaberentscheidung |
| Play App Signing | für den neuen App-Datensatz vorgesehen | Terms vor Annahme sichtbar prüfen |

Die App vermittelt die zeitweise Nutzung physischer Gegenstände außerhalb der
App. Für diese Mietzahlungen wird kein Google Play Billing eingerichtet.
Digitale Abonnements, Credits, Funktionsfreischaltungen oder werbefreie
Premiumstufen sind auch im aktuellen Kandidaten 2026081509 nicht enthalten.

Falls die Kontoregistrierung allgemein nach geplanten Einnahmequellen fragt,
ist eine mögliche spätere Provision auf die Miete physischer Gegenstände als
anderer Geschäftsumsatz plausibel. Sie macht die konkrete Miete aber nicht zu
einem In-App-Kauf im Sinne digitaler Play-Produkte. „Ads“, „Subscriptions“ und
digitale „In-App purchases“ dürfen für den aktuellen Kandidaten nicht als
vorhandene App-Funktionen übernommen werden: Der signierte Build enthält weder
Werbe-SDK noch digitale Abonnements oder digitale Kaufprodukte. Erst ein
späterer, tatsächlich implementierter Build würde diese Antworten ändern.

## 4. Store-Haupteintrag

Vorbereitete Dateien:

- Titel: `store/google-play/de-DE/title.txt`
- Kurzbeschreibung: `store/google-play/de-DE/short_description.txt`
- vollständige Beschreibung: `store/google-play/de-DE/full_description.txt`
- interne Release-Notiz: `store/google-play/de-DE/internal_release_notes.txt`
- Alternativtexte: `store/google-play/de-DE/screenshot_alt_texts.json`
- App-Icon: `store/assets/google-play/icon-512.png`
- Feature-Grafik: `store/assets/google-play/feature-graphic-1024x500.png`

Arbeitswerte:

| Feld | Wert/Status |
|---|---|
| App-Kategorie | Shopping |
| Tags | erst aus den tatsächlich angebotenen Console-Tags auswählen |
| Website | `https://shareittoo.com/` – technisch verifiziert |
| Support-URL | `https://shareittoo.com/support` – öffentlich verifiziert |
| Datenschutz-URL | `https://shareittoo.com/privacy` – öffentlich verifiziert und in Google Play gespeichert |
| öffentliche Kontolöschung | `https://shareittoo.com/account-deletion` – öffentlich verifiziert und operativ |
| Telefon-Screenshots | vier bereinigte Aufnahmen lokal validiert und in der Console gespeichert; die sichtbaren Kernabläufe bleiben für Kandidat 2026081509 gültig, die Systemfotoauswahl wird separat auf dem Gerät geprüft |

Support-, Datenschutz- und Löschseite sind als getrennte öffentliche Seiten
ohne Login erreichbar und maschinenlesbar verifiziert. Die Datenschutz-URL
wurde in Google Play gespeichert; die Änderung wurde noch nicht zur Prüfung
gesendet. Ein HTTP-200 mit der normalen App-Shell würde weiterhin nicht als
Nachweis gelten.

## 5. App-Inhalte – vorbereitete Antworten

### 5.1 Werbung

- Antwort für Kandidat 2026081509: **Nein, die App enthält keine Werbung.**
- Beleg: kein Werbe-SDK, kein Firebase Analytics, kein Advertising Tracking.
- Eine im Entwicklerprofil genannte mögliche spätere Werbefinanzierung ändert
  die Antwort für diesen konkreten App-Build nicht.
- Vor jedem späteren Build Abhängigkeiten und Binärscan erneut prüfen.

### 5.2 App-Zugriff / Sign-in details

- Teile der App sind auf angemeldete Nutzer beschränkt: **Ja**.
- Zwei synthetische Rollen stehen bereit: Vermieter und Mieter.
- Passwort-Login ohne OTP ist technisch bestanden.
- Aktives Inserat, akzeptierte Testbuchung, gemeinsamer Chat, Melden/Blockieren,
  Datenexport und Löschung eines entbehrlichen Testkontos sind bestanden.
- Zugangsdaten ausschließlich in den geschützten Play-Console-Feldern
  eintragen; niemals in Freitext, Git, Drive, Telegram oder Screenshots.
- Die geschützten Console-Felder sowie Login aus frischer Store-Installation
  und Zweitnetz bleiben offen.

Englischer Review-Text ist im Abschnitt „App-Zugriff für Google Review“ von
`docs/operations/B11_STORE_SUBMISSION_PACKET_2026-08-09.md` vorbereitet.

### 5.3 Advertising ID

- Google Play zeigt eine zusätzliche verpflichtende Erklärung an: **„Does
  your app use advertising ID?“**
- Arbeitsantwort für Kandidat 2026081509: **Nein.**
- Der signierte Build mit Ziel-Android 35 enthält weder
  `com.google.android.gms.permission.AD_ID` noch
  `android.permission.ACCESS_ADSERVICES_AD_ID`, kein Werbe-, Analytics- oder
  Attributions-SDK und keine Facebook-Werbe-ID-Erfassung.
- Die Antwort wurde am 13. August 2026 in der Console gespeichert. Sie liegt
  ausschließlich im Veröffentlichungsüberblick bereit; sie wurde nicht zur
  Prüfung eingereicht und löste keinen Rollout aus. Nachweis:
  `docs/evidence/b11/google-play-advertising-id-declaration-20260812.json`.

### 5.3 Zielgruppe und Kinder

- Zielgruppe: ausschließlich Erwachsene/18+.
- Für Kinder entwickelt: **Nein**.
- Keine Altersgruppe unter 18 auswählen.
- Die sichtbare Altersfrage der Registrierung ist eine Mindestalter-
  Bestätigung; AGB, Datenschutz und Mindestalter bleiben getrennte,
  standardmäßig nicht gesetzte Bestätigungen.

### 5.4 Nutzerinhalte und Kommunikation

- Nutzerinhalte: **Ja** – Inserate, Bilder, Chats, Bewertungen und
  Meldungen.
- Direkte Kommunikation: **Ja** – private Buchungs-Chats.
- Melden und Blockieren sind im Kandidaten vorhanden und technisch geprüft.
- Community-/Nutzerinhaltsregeln und endgültige Moderations-/Rechtsfreigabe
  bleiben offen; kein Review-Versand vor Veröffentlichung der Regeln.

### 5.5 Weitere Inhaltsangaben

| Bereich | Arbeitsantwort |
|---|---|
| Nachrichten-/Magazin-App | nein |
| staatliche App | nein |
| Gesundheits-/Medizin-App | nein |
| VPN-App | nein |
| Glücksspiel oder Echtgeldspiel | nein |
| Bank, Kredit, Anlage, Krypto oder anderes Finanzprodukt | nein |
| Kauf/Miete physischer Gegenstände | ja |
| In-App-Purchases digitaler Güter im aktuellen Kandidaten | nein |

### 5.6 Finanzfunktionen

Auch Apps ohne Finanzfunktion müssen das sichtbare Google-Play-Formular
beantworten. Der aktuelle Kandidat bietet weder Banking, Kredite,
Geldtransfer, Wallet, Krypto, Anlage, Versicherung noch „Buy now, pay later“.
Die reine Vermittlung und spätere Bezahlung einer Miete physischer Gegenstände
ist nach dem derzeit belegten Funktionsumfang keine solche Finanzfunktion.
Arbeitsantwort deshalb: **„Meine App bietet keine Finanzfunktionen.“** Vor dem
Speichern jede dann sichtbare Definition erneut gegen den tatsächlichen Build
prüfen; eine spätere Wallet-, Kredit-, Versicherungs- oder eigene
Zahlungsfunktion würde eine neue Bewertung erzwingen.

Der zunächst unvollständige IARC-Fragebogen wurde lesend geprüft und auf
**„Alle anderen App-Typen“** vorbereitet, weil Miete/Shopping der Hauptzweck
ist und nicht soziale Vernetzung oder Gaming. Nutzerinhalte, private direkte
Kommunikation und Fotoaustausch sind wahrheitsgemäß vorhanden; freie
Dokumente, Video und Audio nicht. Der damalige Vorbereitungsstand mit noch
offener persönlicher Zustimmung ist chronologisch erhalten unter
`docs/evidence/b11/google-play-iarc-content-rating-preparation-20260812.json`.

Am 13. August 2026 hat der Betreiber die IARC-Nutzungsbedingungen persönlich
bestätigt. Der anschließend kandidatengenau ausgefüllte Fragebogen wurde in
Google Play gespeichert. Er weist Nutzerinhalte, Bild-/Textaustausch,
Melden/Blockieren, Online-Inhalte und das freiwillige Teilen eines präzisen
Standorts aus; nicht vorhandene oder nicht erlaubte Inhalte wurden nicht
behauptet. Google Play zeigt für Deutschland **USK 12+** und den interaktiven
Hinweis „Users Interact“. Die Bewertung liegt in der Publishing Overview,
wurde aber nicht zur Store-Prüfung gesendet. Abschlussnachweis:
`docs/evidence/b11/google-play-iarc-content-rating-completion-20260813.json`.

## 6. Data Safety – technischer Entwurf

Globale Arbeitsantworten:

| Frage | Arbeitsantwort/Status |
|---|---|
| Sammelt oder überträgt die App Nutzerdaten? | ja |
| Daten bei Übertragung verschlüsselt? | ja, HTTPS/TLS; finalen Upload erneut prüfen |
| Nutzer kann Löschung beantragen? | technisch ja; öffentliche Produktionsseite noch offen |
| Kontoerstellung | Benutzername/E-Mail und Passwort; OAuth noch nicht angeben, weil Google/Apple/Facebook extern nicht aktiviert und nicht auf Geräten abgenommen sind |
| Teillöschung ohne Kontolöschung | nein; einzelne Produktaktionen beweisen keine vollständige Löschung aller zugehörigen Nutzerdaten |
| Datenverkauf oder Werbetracking? | nein |
| „Data shared“ | offen, bis Service-Provider-/Auftragsverarbeiter-Einordnung je Empfänger bestätigt ist |
| Alle Daten optional? | nein; Konto-/Sicherheitsdaten sind erforderlich, viele Featuredaten optional |

Konservativ vorbereitete Datentypen sind in
`store/privacy-disclosures.json` und
`docs/operations/B11_STORE_PRIVACY_DISCLOSURE_MATRIX_2026-08-09.md`
einzeln belegt. Dazu gehören insbesondere:

- Name, E-Mail, optionale Telefonnummer und Adresse;
- User-ID;
- grober und optional präziser Standort;
- Fotos, Nachrichten und sonstige Nutzerinhalte; keine freien Dokument-,
  Video- oder Audio-Uploads im Kandidaten 2026081509;
- Buchungs-/Kaufhistorie und sonstige Finanzinformationen;
- Push-/Installationskennungen;
- Crashdaten und sonstige Diagnostik.

Vollständige Karten- oder Bankdaten werden im Kandidaten nicht von
ShareItToo erhoben. Stripe-Liveverarbeitung ist deaktiviert. „Shared“ darf
erst final beantwortet werden, wenn die konkrete Service-Provider-Einordnung
für Hosting, Mail, Firebase/Google Maps und den späteren Zahlungsdienst
bestätigt ist. Der gespeicherte Console-Stand und die vorbereiteten, noch nicht
gespeicherten Antworten sind kandidatengenau in
`docs/evidence/b11/google-play-data-safety-step2-20260812.json` festgehalten.
Das Data-Safety-Formular noch nicht absenden.

Für Schritt 3 sind 16 tatsächlich erhobene Datentypen als direkte
Auswahlliste vorbereitet. `Files and docs`, Videos, Audio und
Zahlungsinformationen bleiben für diesen Kandidaten ungewählt. Die
maschinengeprüfte Liste liegt in
`docs/evidence/b11/google-play-data-safety-datatypes-20260812.json`.

Die technische Bindung an den aktuell installierten internen Kandidaten
`1.0.0+2026081509` ist unter
`docs/evidence/b11/google-play-data-safety-current-candidate-binding-2026081509-20260815.json`
gesichert. Die 16 ausgewaehlten von insgesamt 17 deklarierten Datentypen und
ihre Zwecke entsprechen nach der gesonderten Authentifizierungs- und
Kommunikationspruefung weiterhin der vorbereiteten Matrix von Build
`2026081505`. Das ist nur eine technische Kandidatenbindung: Die
Provider-Rollen, Aufbewahrungs-/Loeschfristen, eine spaetere
Google-Maps-Aktivierung und die rechtliche Freigabe bleiben offen. Im Play
Console-Formular wurde nichts geaendert, gespeichert oder abgesendet.

## 7. Berechtigungen und SDK-Prüfung nach AAB-Upload

Der Release-APK von Kandidat 2026081201 wurde geprüft, anschließend aber wegen
eines eingebetteten, nicht an eine Anwendung gebundenen Google-Schlüssels
gesperrt und nicht hochgeladen. Kandidat 2026081202 wurde danach sicher gebaut,
aber durch die spätere Produktkorrektur „keine Kaution und kein Schutz zum
Launch“ ersetzt und ebenfalls nicht hochgeladen. Kandidat 2026081404 wurde im
internen Play-Track veröffentlicht und als Store-Split geprüft; der dabei
entdeckte Kontextfehler des mittigen Vordergrund-Push-Popups wurde ab Kandidat
2026081405 behoben. Kandidat 2026081505 bestand anschließend Vordergrund-,
Hintergrund- und Beendet-Push sowie das mittige, vollständig im Systemkreis
enthaltene SIT-Symbol. Der aktuelle Kandidat 2026081509 wurde neu gebaut,
privat archiviert, binär geprüft, intern veröffentlicht und nach kurzer
Store-Propagation als exakter Google-Play-Build auf dem Pixel geprüft. Er verwendet für Fotos die
Android-Systemauswahl, enthält keine pauschale Berechtigung für die Bild- oder
Videobibliothek und hält bestätigte Übergabe- und Rückgabeaktionen sichtbar.
Er enthält nur die erwarteten Funktions-,
Netzwerk- und Firebase-Berechtigungen für Kamera, nutzergewählte Bilder, groben/präzisen
Standort, Benachrichtigungen, Internet/Netzstatus, Wake Lock und FCM. Nicht
enthalten sind unter anderem SMS-/Anruflisten-/Kontakte-, Mikrofon-,
Accessibility-Service-, Vollspeicher-, Paketinstallations-,
Alle-Pakete-Abfrage- oder Overlay-Berechtigungen. Der bereinigte,
artefaktgebundene Nachweis liegt in
`docs/evidence/b11/android-release-permissions-2026081509.json`.

Diese Vorprüfung nimmt keine Console-Antwort vorweg. Der AAB-Upload wurde von
Google ohne Fehler angenommen; zukünftige kandidatenspezifische Hinweise
bleiben weiterhin vor jeder Veröffentlichung sichtbar zu prüfen.

Nach dem ersten Internal-AAB-Upload:

1. Play-Console-Warnungen und SDK-Index-Hinweise vollständig lesen;
2. nur tatsächlich vom Bundle ausgelöste Berechtigungsformulare bearbeiten;
3. Kamera, Foto-/Dateizugriff, Standort und Benachrichtigungen als
   funktionsbezogene, nutzerinitiierte Flows erklären;
4. keine SMS-, Anruflisten-, Accessibility-Service- oder anderen nicht
   implementierten Sonderberechtigungen beanspruchen;
5. Play-App-Signing-Zertifikat bereinigt erfassen und zusätzlich zum
   Uploadzertifikat in `assetlinks.json` vorbereiten – am 12.08.2026 erledigt;
6. vor jeder öffentlichen Route, DNS-/Serveränderung oder Einreichung erneut
   Backup, Inhaltsprüfung, kontrollierten Reload und Rollback planen.

## 8. Internal Testing – Freigabereihenfolge

1. ausschließlich den gebundenen AAB-Kandidaten 2026081509 nach unmittelbarer
   Hash-Prüfung verwenden – Upload, interne Aktivierung und kandidatengenaue
   Store-Installation sind abgeschlossen;
2. Store-Haupteintrag und App-Inhalte weiter als Entwurf vervollständigen;
3. Uploadwarnungen, App-Signing-Fingerprint und Artefaktidentität prüfen;
4. geschützte Review-Zugangsdaten eintragen;
5. nur Internal Testing vorbereiten – keine Production-, Open- oder Closed-
   Veröffentlichung;
6. aus Play installieren und dieselbe Kandidaten-/Gerätematrix wiederholen;
7. erst danach über Closed Testing und die für neue persönliche Konten
   angezeigte Testeranforderung entscheiden.

Für dieses neu erstellte persönliche Konto gilt nach der aktuell
veröffentlichten Google-Play-Regel: Vor einem Antrag auf Produktionszugang
müssen mindestens zwölf Tester während mindestens 14 aufeinanderfolgenden
Tagen durchgehend im geschlossenen Test angemeldet sein. Internal Testing hat
keine Tester-Mindestzahl und kann sofort für die technische Store-Installation
verwendet werden, startet diese 14-Tage-Frist aber nicht. Deshalb bleibt der
separate Launch-Gate `googlePlayClosedTestingRequirement` auch nach der
Identitätsprüfung offen, bis ein eigener bereinigter Closed-Test-Nachweis
vorliegt.

Die qualifizierende Uhr startet erst bei einer bestätigten aggregierten
Console-Beobachtung von mindestens zwölf gleichzeitig durchgehend angemeldeten
Testern. Ein Bestand von elf oder weniger wird nicht als Beginn gespeichert.
Der sichere Vorschau-Lauf lautet:

```text
node tool/prepare_google_play_closed_testing_observation.mjs \
  --observed-at <UTC-CONSOLE-ZEITPUNKT> \
  --continuous-testers <ANZAHL>
```

Ohne `--confirm-console-observation` ändert das Werkzeug keine Datei. Erst nach
manueller Prüfung der aggregierten Console-Werte darf derselbe Lauf mit dieser
Bestätigung den bereinigten Nachweis und den readiness-Stand schreiben.
Testerlisten, E-Mail-Adressen, Konto-IDs, Roh-Screenshots und Zugangsdaten sind
ausdrücklich verboten.

### 8.1 Antrag auf Produktionszugang – vorbereitete Wahrheitsgrenze

Google fragt nach erfülltem Closed Test in drei Bereichen: Durchführung des
geschlossenen Tests, App und Produktionsreife. Der maschinenlesbare Entwurf
liegt in `store/google-play/production-access-application.json`.

Bereits belegbar vorbereitet sind nur:

- Zielgruppe: Erwachsene ab 18 Jahren, die physische Gegenstände lokal mieten
  oder anbieten möchten;
- Nutzen: lokale Suche, Inserate, Verfügbarkeit, Buchung, Chat sowie geführte
  Übergabe und Rückgabe in einem gemeinsamen Ablauf.

Erst nach dem realen Test dürfen ergänzt werden:

- die tatsächlich in der Console gewählte Schwierigkeit der Testergewinnung;
- reale, aggregierte Nutzung der Funktionen und Abweichungen vom erwarteten
  Produktivverhalten;
- tatsächliche Feedbackkanäle und zusammengefasste Feedbackthemen;
- die vom Eigentümer gewählte Console-Spanne der erwarteten Installationen im
  ersten Jahr;
- wirklich umgesetzte Änderungen aus dem Test;
- die belegte Entscheidung, warum der Kandidat produktionsreif ist.

Bis diese Antworten belegt sind, bleibt der Entwurf
`draft-before-closed-test`. Weder das Werkzeug noch der Entwurf senden einen
Antrag ab.

## 9. Harte Stop-Regeln

Kein „Send for review“, Rollout oder öffentliche Freigabe, solange mindestens
einer dieser Punkte offen ist:

- geschlossener Play-Test mit mindestens zwölf dauerhaft angemeldeten Testern
  über mindestens 14 aufeinanderfolgende Tage und anschließender
  Produktionszugangsprüfung;
- gespeicherte Datenschutz-URL und übrige Publishing-Änderungen noch nicht geprüft; Data Safety bleibt offen;
- Anbieter-/Copyright- und Nutzerinhaltsregeln;
- finale Data-Safety-/Auftragsverarbeiter-Entscheidung;
- geschützte Review-Felder oder frischer Store-Login;
- Store-Screenshots und Privatdatenprüfung;
- Play-App-Signing-/Asset-Link-Nachweis;
- Store-Installation, Hotspot/TalkBack oder übrige B11-Matrix;
- Crashlytics-Zuordnung für exakt den hochgeladenen Kandidaten;
- technisches und produktseitiges Go.

## 10. Maschinengeprüfte Upload-Übergabe

Die Datei `store/google-play/internal-upload-handoff.json` bindet jede weitere
Play-Aktion ausschließlich an Build `2026081509`. AAB-Hash,
Upload-Zertifikat und privater Archivname sind eingetragen und geprüft. Das Prüfwerkzeug
`tool/validate_google_play_internal_handoff.mjs` bricht ab, wenn sich Datei,
Hash, Kandidatenidentität oder Dateirechte unterscheiden.

Identitäts-, Geräte- und Telefonnummernprüfung sind abgeschlossen, der
App-Datensatz ist erstellt und die drei rechtlichen Erklärungen wurden mit
ausdrücklicher Zustimmung bestätigt. Play App Signing ist aktiv; sein
bereinigter Zertifikat-Fingerprint wurde zusätzlich zum Uploadzertifikat in
der lokalen `assetlinks.json`-Vorbereitung hinterlegt. `submissionAllowed`
bleibt dennoch `false`: Die unmittelbare Artefaktprüfung, der interne Upload,
die Aktivierung und die exakte Installation über Google Play sind abgeschlossen.
Alle öffentlichen, Review-, Open- und Closed-Aktionen bleiben harte Stopps.

Die Nachkontrollen des exakten Play-Builds sind jetzt genauer gebunden:
Gemeinsamer Chat ist für beide synthetischen Rollen sichtbar und lesbar und
öffnet über den authentifizierten Chat-Link. Eine während des kontrollierten
Offlinefensters erzeugte Nachricht blieb zunächst verborgen und erschien nach
der Netzwiederherstellung im selben laufenden Prozess; Prozess und Netz wurden
sauber wiederhergestellt. Damit stehen `sharedChatStability`,
`messageSendPersistence` und `messageRefreshPattern` auf
`passed-exact-build`. `messageComposerKeyboard` bleibt bewusst
`pending-exact-build`, bis die Tastatur im physischen Store-Build manuell
geprüft wurde.

## 11. Quellen

- Google Play: App erstellen und einrichten –
  <https://support.google.com/googleplay/android-developer/answer/9859152?hl=en-EN>
- Google Play: App für Review vorbereiten –
  <https://support.google.com/googleplay/android-developer/answer/9859455?hl=en-EN>
- Google Play: Data Safety –
  <https://support.google.com/googleplay/android-developer/answer/10787469?hl=en>
- Google Play: Zahlungen und Miete physischer Güter –
  <https://support.google.com/googleplay/android-developer/answer/9858738?hl=en>
- Google Play: Entwicklerkonto-Angaben –
  <https://support.google.com/googleplay/android-developer/answer/13628312?hl=en>
