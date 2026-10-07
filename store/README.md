# ShareItToo Store-Metadaten

Dieser Ordner ist die maschinenlesbare Quelle für die vorbereiteten Google-
Play- und Apple-Metadaten. `store/submission.json` hält App-Identität,
Wahrheitsgrenzen, öffentliche URLs und die offenen Einreichungsgates fest.
`store/device-validation.json` bindet den späteren B11-Go/No-Go zusätzlich an
denselben Build, vier reale Rollen-/Netz-Gerätezellen, die plattformweiten
Releaseprüfungen und bereinigte lokale Evidenzdateien.

Der aktuelle Zustand ist absichtlich `draft` und
`submissionAllowed: false`. Der Validator darf nur dann einen einreichbaren
Zustand akzeptieren, wenn alle Pflicht-URLs verifiziert, alle Gates geschlossen
und die Buildnummer mindestens `2026080903` ist.

`store/platform-account-readiness.json` hält zusätzlich den geheimnisfreien
Ist-Stand der drei externen Kontovoraussetzungen fest. Das persönliche
Google-Play-Konto ist aktuell `ready`: Entwicklerkonto, bezahlte einmalige
Registrierung, Identitäts-, Geräte- und Telefonnummernbestätigung sowie der
erste App-Datensatz sind im bereinigten Nachweis belegt. Für Apple fehlt die
Entwicklermitgliedschaft, und die Firebase-Nutzungsbedingungen sind noch nicht
als vom Eigentümer bestätigt belegt. Der Store-Prüfer koppelt diese drei
Zustände fest an `googlePlayAccountAndFee`, `appleAccountXcodeAndSigning` und
`firebaseTermsAcceptedByOwner`. Ein Gate kann daher nicht durch bloßes Ändern
von `open` auf `closed` umgangen werden. E-Mail-Adressen, Konto-IDs,
Zugangsdaten, Zahlungsdetails und Vertragsinhalte gehören nicht in diesen
Nachweis. Bereits erfolgte Gebühr und Vertragsannahme werden ausschließlich
als bereinigte boolesche Historie festgehalten, damit der reale Kontostand
nicht wieder fälschlich als nebenwirkungsfrei erscheint.

Für das neu erstellte persönliche Play-Konto ist außerdem ein eigener
Launch-Gate `googlePlayClosedTestingRequirement` offen. Nach Googles aktuell
veröffentlichter Regel muss vor dem Antrag auf Produktionszugang ein
geschlossener Test mit mindestens zwölf dauerhaft angemeldeten Testern über
mindestens 14 aufeinanderfolgende Tage laufen. Internal Testing kann vorher
genutzt werden, ersetzt diese Frist aber nicht. Der Gate ist bewusst von
Identitäts-, Geräte- und Telefonnummernprüfung getrennt und darf erst durch
einen späteren, eigenen Testnachweis geschlossen werden.

Der maschinenlesbare Nachweis dafür liegt in
`store/google-play/closed-testing-readiness.json`. Er kennt vier ehrliche
Zustände: `not-started`, `running`, `eligible` und
`production-access-approved`. Ab Testbeginn ist eine bereinigte
Beobachtungsdatei unter `docs/evidence/b11/` Pflicht. Sie enthält nur
Zeitpunkte, aggregierte Testerzahl und Freigabestatus – niemals Tester-E-Mails,
Konto-IDs oder Zugangsdaten. Erst mindestens zwölf durchgehend angemeldete
Tester, exakt berechnete 14 Tage, gesammelte Engagement-Evidenz und der später
beobachtete positive Produktionszugang dürfen den Launch-Gate schließen.
Ein qualifizierender Start wird erst ab zwölf gleichzeitig durchgehend
angemeldeten Testern akzeptiert. Für spätere Console-Beobachtungen erzeugt
`tool/prepare_google_play_closed_testing_observation.mjs` standardmäßig nur
eine Vorschau. Schreiben ist erst mit der ausdrücklichen Option
`--confirm-console-observation` möglich; die erzeugte Evidenz bleibt
aggregiert und datensparsam.

Die späteren Antworten für den Antrag auf Produktionszugang werden separat in
`store/google-play/production-access-application.json` vorbereitet. Vor dem
realen Closed Test enthält diese Datei nur die bereits belegbare Zielgruppe
und den Produktnutzen. Tester-Rekrutierung, Nutzung, Feedback, daraus
abgeleitete Änderungen, Installationsprognose und Freigabeentscheidung bleiben
ausdrücklich offen. Der Validator akzeptiert `ready-to-apply` erst nach einem
evidenzierten `eligible`-Stand und `production-access-approved` erst nach der
beobachteten positiven Console-Entscheidung. Persönliche Tester- oder
Kontodaten und erfundene Testergebnisse sind in jeder Phase verboten.

`store/google-play/closed-testing-feedback-plan.json` bindet den späteren Test
an neun echte Nutzungsszenarien und fünf Kontrollpunkte. Im Repository landen
nur aggregierte Anzahlen, bereinigte Themen, umgesetzte Änderungen und ein
bereinigter Evidenzverweis. Testerlisten und einzelne Rückmeldungen bleiben im
geschützten Feedbackkanal. Vor dem realen Test erzwingt der Validator überall
Null- beziehungsweise Leerwerte und verhindert damit erfundene Aktivität.

Lokale Prüfung:

```text
dart run tool/validate_store_metadata.dart
node tool/validate_google_play_closed_testing.mjs
node tool/validate_google_play_closed_testing_feedback.mjs
node tool/validate_google_play_production_access_application.mjs
node tool/validate_device_evidence.mjs
```

Der Standardlauf prüft den ehrlichen Entwurfszustand. Eine spätere
Store-Automation muss zusätzlich mit `--require-submittable` prüfen und darf
bei einem offenen Gate keinen Upload starten.
Der Store-Modus ruft zusätzlich
`node tool/validate_google_play_closed_testing.mjs --require-production-access`
auf. Die interne Testspur bleibt davon getrennt und kann vorher genutzt werden,
ersetzt die Pflicht aber nicht.

`store/google-only-next-candidate.json` reserviert keinen Build und erzeugt
kein Artefakt. Die Datei hält ausschließlich den nächsten gebündelten
Social-Auth-Schritt fest: Google wird explizit eingeschaltet, Apple und
Facebook bleiben aus, Kanal und API bleiben Internal/Staging. Der Validator
verweigert denselben oder einen älteren Build, einen weiteren Provider,
Produktion oder Store-Einreichung. Erst wenn alle beabsichtigten Änderungen
gemeinsam committed und die Buildnummer wirklich erhöht wurden, darf
`scripts/build_google_only_android_candidate.sh` nach der ausdrücklichen
lokalen Bestätigung genau einen neuen Kandidaten an den normalen signierten
Releasepfad übergeben.

`store/privacy-disclosures.json` ist die maschinenlesbare, quell- und
binärgebundene Grundlage für Google Play Data Safety und Apple App Privacy.
Sie bewertet aktuell 17 Datentypen (davon 16 tatsächlich erhoben) und neun
Dienste bzw. technische Empfänger. Freie Dateien/Dokumente werden nicht
deklariert: Alle Launch-Uploads sind technisch auf JPEG, PNG und WebP begrenzt;
lokal erzeugte PDFs verlassen das Gerät nur auf ausdrücklichen Download.
Der signierte Android-Kandidat enthält neben Firebase Cloud
Messaging und Crashlytics auch die aktivierte Google-Maps-Platform-Anbindung.
Präziser Standort bleibt deshalb konservativ deklariert; die
Anwendungs-/API-Beschränkung des eingebetteten Maps-Client-Schlüssels ist ein
offener Console-Nachweis. KI-Helfer, Analytics, Werbung und Stripe sind im
Kandidaten deaktiviert; der Zahlungsmodus bleibt `memory`.

Der Standardlauf akzeptiert nur den ehrlichen Entwurf mit offenen
Eigentümerentscheidungen, nicht abgesendeten Store-Formularen,
`binaryPrivacyAndNetwork=testing` und
`finalBinaryPrivacyScan=open`:

```text
node tool/validate_privacy_disclosures.mjs
```

Der Store-Modus verlangt zusätzlich `--require-approved`. Er bleibt gesperrt,
bis die Data-Safety-/App-Privacy-Formulare, Empfängerklassifizierung,
Aufbewahrung/Löschung, Maps-Schlüsselbeschränkung und der finale Stripe-
Datenfluss separat belegt sind, der plattformübergreifende Binär-/Netztest
bestanden ist und der Store-Gate geschlossen wurde. Die technische Matrix ist
keine Rechtsfreigabe.

`store/retention-deletion-readiness.json` trennt den tatsächlich
implementierten Löschumfang von noch fehlenden rechtlichen und betrieblichen
Aufbewahrungsentscheidungen. Die Kontolöschung anonymisiert die Identität,
widerruft aktive Zugangsdaten und entfernt oder bereinigt direkte Inhalte,
Benachrichtigungen, Lesestatus, Blocklisten und ausstehende Push-Payloads.
Pseudonyme Buchungs-, Finanz-, minimale Zustell- und Sicherheitsnachweise
bleiben technisch erhalten. Für keine dieser Kategorien wird im Repository
eine Rechtsfrist erfunden.

Der Entwurf dokumentiert außerdem ehrlich: Es gibt noch keinen allgemeinen
Kategorien-Purge, keinen belegten Legal-Hold-Ablauf, keine automatische
Bereinigung abgelaufener Datenbankzeilen und keine kontospezifische Löschung
aus bereits erzeugten Backups. Die beobachtete Backup-Rotation beträgt 14
Tage. Die veröffentlichten Firebase-/Maps-Angaben wurden anhand der offiziellen
Quellen in
`docs/evidence/b11/privacy-provider-retention-sources-20260812.json` geprüft;
Vertragseinstellungen, tatsächliche Löschverfahren und Rechtsfreigabe sind
weiterhin nicht durch den Eigentümer bestätigt. Das getrennte
Entscheidungsblatt liegt in
`docs/operations/B11_LEGAL_PRIVACY_OWNER_DECISION_PACKET_2026-08-12.md`. Prüfung:

```text
node tool/validate_retention_deletion_readiness.mjs
```

Der Store-Modus verwendet auch hier `--require-approved` und bleibt bei allen
neun offenen Entscheidungen gesperrt.

`store/legal-readiness.json` bindet den Rechts-/Nutzerinhalts-Gate zusätzlich
an die vier derzeitigen App-Texte und an die technische Registrierungskette.
Die rechtliche Anbieteridentität und der Copyright-Inhaber sind eigene,
fail-closed Freigaben: Ihr jeweiliger Store-Gate muss denselben Status haben
und darf erst mit einem bereinigten JSON-Nachweis unter `docs/evidence/b11/`
geschlossen werden. Im Entwurf bleiben alle Rechtsfreigaben offen und ohne
Nachweisreferenz.
Mindestalter, AGB und Datenschutz müssen separat und ausdrücklich bestätigt
werden; App, Auth-Service und Backend dürfen diese Zustimmungen nicht
vorausfüllen. Der Standardlauf akzeptiert den nachweislich unfreigegebenen
Entwurf:

```text
node tool/validate_legal_readiness.mjs
```

Der signierte Release-Preflight führt die Entwurfsprüfung immer aus und ruft
bei `SIT_REQUIRE_STORE_SUBMISSION=1` zusätzlich `--require-approved` auf.
Dieser Store-Modus bleibt geschlossen, bis alle vier Texte inhaltsgleich freigegeben,
unter den kanonischen öffentlichen HTTPS-URLs erreichbar, alle erforderlichen
Freigaben belegt und die verbundenen Store-Gates geschlossen sind. Der
aktuelle Rechtsstatus bleibt ausdrücklich `draft`; der technische
Nachweis ist keine Rechtsberatung oder Rechtsfreigabe.

`store/review-access.json` hält den Zugang für die zwei synthetischen
Store-Review-Rollen getrennt vom Geräte- und Rechtsstatus fest. Zugangsdaten
bleiben ausschließlich in einem privaten, nur für den Eigentümer lesbaren
Tresor außerhalb des Repositories und später in den geschützten Store-Feldern.
Die technische Diagnose meldet beide Rollen per Passwort an und liest nur
Konto-, Inserat-, Buchungs- und Chatstatus; sie gibt weder E-Mail-Adressen,
Passwörter, Tokens noch interne Objektkennungen aus:

```text
node tool/diagnose_store_review_accounts.mjs
node tool/validate_store_review_access.mjs
```

Der aktuelle Zustand ist weiterhin ehrlich `testing`, aber der technische
Zugang ist bestanden: Zwei neue synthetische Staging-Konten sind über den
realen SMTP-Weg bestätigt, beide Passwort-Logins funktionieren, und beide
Rollen sehen dasselbe aktive Inserat, dieselbe akzeptierte Buchung und den
gemeinsamen Chat. Melden/Blockieren, ein vollständiger privater Datenexport
und die Kontolöschung wurden zusätzlich mit kontrollierten synthetischen
Staging-Daten nachgewiesen. Für den Löschtest wurde ausschließlich ein älteres
entbehrliches Mieterkonto geschlossen; die aktiven Review-Konten blieben
unverändert. Damit stehen acht von zehn Review-Szenarien auf `passed`. Der
strenge Release-Gate bleibt wegen der noch offenen Geräte- und geschützten
Store-Feld-Prüfungen geschlossen:

```text
node tool/validate_store_review_access.mjs --require-ready
```

Erst nach frischer Installation, Zweitnetz und Eintrag beider Konten in die
geschützten Store-Felder dürfen `readyForStore`, der Store-Gate
`reviewAccounts` und der strenge Validator gemeinsam auf bestanden wechseln.

Der Gerätevalidator bleibt derzeit bewusst bei `state=testing`,
`goNoGo=hold`, `matrix=0/4` und `releaseChecks=3/7`. Kandidatenidentität und
Signaturen, Staging-Bereinigung/-Gesundheit sowie die Produktionsinvariante
sind bereits nachgewiesen. Nach den realen
Internal-/TestFlight-Läufen darf der Zustand nur mit echten, bereinigten
Dateiverweisen unter `docs/evidence/b11/` auf `passed` wechseln. Der strenge
Nachweis lautet:

```text
node tool/validate_device_evidence.mjs --require-passed
```

Vor dem ersten direkten Android-Gerätelauf prüft folgender Befehl das private
Kandidatenarchiv und verlangt genau ein autorisiertes physisches Telefon:

```text
node tool/prepare_android_device_test.mjs
```

Erst die separate Option `--install` installiert und startet das geprüfte APK.
Dieser Diagnoseweg zählt ausdrücklich nicht als Play-Internal-Installation.

Das geprüfte Google-Play-Store-Icon liegt unter
`store/assets/google-play/icon-512.png`. Der Metadatenvalidator verlangt exakt
512 × 512 Pixel, PNG ohne Alphakanal und höchstens 1.024 KB. Die geprüfte
Feature-Grafik liegt unter
`store/assets/google-play/feature-graphic-1024x500.png`; der Validator verlangt
exakt 1024 × 500 Pixel und ein 24-Bit-RGB-PNG ohne Alphakanal. Sie lässt sich
deterministisch mit `tool/generate_store_feature_graphic.py` aus dem
vorhandenen SIT-Markenasset neu erzeugen. Telefon-Screenshots bleiben im
Manifest bewusst leer, bis sie aus dem finalen Store-Build wahrheitsgetreu
aufgenommen und einzeln geprüft wurden.
Die acht deutschen Alternativtexte sind bereits als validierter Entwurf unter
`store/google-play/de-DE/screenshot_alt_texts.json` vorbereitet. Sie werden
erst einem Bild zugeordnet, wenn die jeweilige reale App-Szene bestanden und
aufgenommen ist.

Er verlangt Build `2026080903` oder höher, denselben vollständigen Commit,
Android- und iOS-Artefakthashes, Play-Internal-/TestFlight-Installation,
TalkBack/VoiceOver, alle Push-Zustände, Binär-/Netzwerkdatenschutz,
Crash-Releasezuordnung, Store-/Signing-Prüfung, Staging-Bereinigung,
Produktionsinvariante und technische sowie produktseitige Freigabe.

Die vorgesehenen öffentlichen URLs stehen bereits im Manifest, bleiben aber
bis zur fachlichen Freigabe auf `draft`. Nach einem Staging-Rollout lassen sich
Routing, Statusmarker und Mindestinhalt ohne Freigabe simulieren:

```text
node tool/verify_public_store_pages.mjs --allow-draft --origin https://staging.shareittoo.com
```

Im echten Uploadmodus akzeptiert derselbe Prüfer ausschließlich im Manifest
als `verified` markierte Seiten mit HTTP 200, den erwarteten maschinenlesbaren
Statusmarkern und den Pflichtinhalten. Support und Datenschutz liefern vor der
ausdrücklichen Freigabe bewusst HTTP 503; die funktionsfähige Kontolöschung
bleibt separat als `operational` erkennbar.

Der signierte Release-Preflight führt die Standardprüfung immer aus. Ein
tatsächlicher Store-Upload muss außerdem
`SIT_REQUIRE_STORE_SUBMISSION=1` setzen; dadurch wird der strenge Modus vor
dem Build für Store-Metadaten und Geräteabnahme erzwungen und anschließend auch
der reale Inhalt aller drei öffentlichen Pflichtseiten geprüft.

Zugangsdaten, API-Schlüssel, Review-Passwörter, Service Accounts und
Zahlungsschlüssel gehören niemals in diesen Ordner.
