# B11 – Maschinenlesbare Geräteabnahme und Go/No-Go

Stand: 9. August 2026  
Status: technisch vorbereitet; reale Store- und Geräteabnahme bleibt offen

## Ziel und Wahrheitsgrenze

Die reale B11-Abnahme war bisher ausschließlich als ausführliches Runbook
beschrieben. `store/device-validation.json` macht daraus zusätzlich einen
versionierten, maschinenlesbaren Nachweis. Er verhindert, dass ein lokaler
Zwischenbuild, ein Simulatorlauf, nur eine Plattform oder ein unvollständiger
Push-/Accessibility-Test versehentlich als B11-Freigabe gilt.

Der aktuelle Zustand bleibt bewusst:

- `state=testing`;
- `goNoGo=hold`;
- vier von vier Gerätezellen offen;
- drei von sieben plattformweiten Releaseprüfungen bestanden;
- Build `2026080903`, vollständiger Commit, AAB-/APK-Hashes und kanonische
  Android-Signatur gesetzt und nachgewiesen;
- Firebase im Android-Artefakt sowie Staging-FCM aktiviert und geprüft, reale
  Zustellung und alle Store-Installationen weiterhin ausstehend;
- Echtgeld gesperrt.

## Fest an denselben Kandidaten gebundene Angaben

Ein bestandener Nachweis verlangt gleichzeitig:

- Android Application ID und iOS Bundle ID `com.shareittoo.app`;
- Version `1.0.0`, Build `2026080903` oder höher und Übereinstimmung mit
  `pubspec.yaml`;
- vollständigen 40-stelligen Commit;
- ausschließlich den internen Kanal und
  `https://staging.shareittoo.com/api/v1`;
- vollständige Firebase-Konfiguration, aber weiterhin
  `stripeLivemode=false`;
- AAB-, APK-, Signaturzertifikat- und IPA-SHA-256;
- Play-Internal- und TestFlight-Internal-Installation;
- Apple-Teamkennung und bestandenen IPA-/Privacy-Manifest-Scan.

Jede Änderung an Commit, Buildnummer, Signatur, Firebase-Konfiguration oder
API-Ziel macht die betroffene Abnahme ungültig und verlangt einen neuen
Nachweis.

## Verbindliche reale Gerätematrix

Vier Zellen sind nicht austauschbar:

| Zelle | Plattform | Netz | Rolle | Screenreader |
|---|---|---|---|---|
| `android-wifi-owner` | Android | WLAN | Vermieter | TalkBack |
| `android-hotspot-renter` | Android | Hotspot/Mobilfunk | Mieter | TalkBack |
| `ios-wifi-owner` | iOS | WLAN | Vermieter | VoiceOver |
| `ios-hotspot-renter` | iOS | Hotspot/Mobilfunk | Mieter | VoiceOver |

Jede Zelle muss ein physisches Gerät, Modell und Betriebssystem ohne
Seriennummer dokumentieren. Alle folgenden Prüfgruppen müssen bestanden sein:

- Store-Installation und Erststart;
- Anmeldung, Sitzung und Neustart;
- Inserat und Buchungsfluss;
- Chat und Deep Link;
- Push im Vordergrund, Hintergrund und nach beendetem Prozess;
- Übergabe und Rückgabe;
- Melden/Blockieren sowie Kontenfunktionen;
- Offline-Wiederkehr;
- 200-Prozent-Schrift und TalkBack beziehungsweise VoiceOver.

## Plattformweite Releaseprüfungen

Zusätzlich zu den vier Gerätezellen sind sieben Nachweise zwingend:

1. Kandidatenidentität und Signaturen;
2. Firebase, FCM und APNs;
3. finaler Binärdatenschutz und reale Netzwerkbeobachtung;
4. Crashlytics-Releasezuordnung ohne sensible Inhalte;
5. Store-Warnungen, Deep Links und App-Signing;
6. Bereinigung synthetischer Staging-Daten und gesunde Readiness;
7. unveränderte Produktion und gesperrtes Echtgeld.

Technische und produktseitige Freigabe erhalten jeweils einen bereinigten
lokalen Beleg und einen ISO-Zeitpunkt. Review-Passwörter oder andere
Zugangsdaten dürfen weder im Manifest noch in Evidenzdateien stehen.

## Inhaltlich gebundene JSON-Nachweise

Eine referenzierte Datei genügt nicht allein dadurch, dass sie vorhanden und
nicht leer ist. Bestandene Gerätezellen, neue Releaseprüfungen und Freigaben
müssen strukturierte JSON-Nachweise mit `schemaVersion=1` enthalten. Der
Validator bindet jeden solchen Nachweis an denselben Kandidaten:

- Application ID, Bundle ID, Version, Buildnummer, Commit, Kanal, Staging-API,
  Firebase- und Zahlungsmodus müssen exakt mit
  `store/device-validation.json` übereinstimmen;
- eine Gerätezelle muss `kind=device-matrix-cell`, ihre exakte Zellen-ID,
  Plattform, Rolle, Netzart, Store-Installationsweg, Modell, Betriebssystem und
  Screenreader enthalten;
- jede der elf Prüfgruppen muss im Zellennachweis einen eigenen bestandenen
  Status, ISO-Zeitpunkt und eine bereinigte Kurzbeschreibung besitzen;
- ein Release-Nachweis muss `kind=release-check`, die richtige Prüfungs-ID und
  mindestens eine zeitlich belegte bestandene Einzelverifikation enthalten;
- eine Freigabe muss `kind=approval`, den richtigen Freigabetyp, dieselbe
  Freigabezeit, die Entscheidung `approved` und eine eindeutige Erklärung
  enthalten;
- alle drei Nachweisarten müssen ausdrücklich bestätigen, dass sie keine
  Secrets, Review-Zugangsdaten oder Roh-Gerätekennungen enthalten und nur
  synthetische Konten verwenden.

Schlüssel wie `serialNumber`, `androidId`, `advertisingId`, `imei`, `idfa`,
`udid`, `token`, `password` oder `privateKey` werden an jeder Tiefe abgelehnt.
Symbolische Links, über verlinkte Unterordner ausbrechende Pfade und übergroße
Nachweisdateien werden ebenfalls abgelehnt.
Eine beliebige Markdown- oder Textdatei kann deshalb kein bestandenes Gate
mehr belegen.

Die drei bereits bestandenen technischen Prüfungen dürfen weiterhin den
kanonischen Kandidatennachweis
`docs/evidence/b11/android-candidate-2026080903.json` verwenden. Dieser wird
jedoch inhaltlich gegen Signaturen, Hashwerte, Staging-Health und
Produktionsinvariante geprüft; er kann keine reale Push-, Geräte-, Store- oder
iOS-Prüfung ersetzen.

## Fail-closed-Verknüpfung

Standardprüfung:

```text
node tool/validate_device_evidence.mjs
```

Sie akzeptiert den ehrlichen offenen Planstand und läuft in jeder technischen
Regression sowie im Release-Preflight. Siebzehn Negativ-/Positivtests prüfen
unter anderem vorzeitiges `go`, fehlende Matrixzellen, credential-förmige
Felder, fehlende oder unstrukturierte Evidenzdateien, Kandidatenabweichungen,
Roh-Gerätekennungen, falsche Releaseprüfungs-IDs und einen vollständig
synthetisch erzeugten strukturierten Passzustand.

Strenge Prüfung:

```text
node tool/validate_device_evidence.mjs --require-passed
```

Sie bleibt derzeit erwartungsgemäß rot. `SIT_REQUIRE_STORE_SUBMISSION=1`
erzwingt sie vor jedem späteren Store-Upload zusätzlich zum strengen
Metadaten- und Pflichtseitencheck.

Der vorgelagerte Android-Geräteprüfer
`tool/prepare_android_device_test.mjs` verifiziert das private Kandidatenarchiv
gegen dieses Manifest und akzeptiert genau ein autorisiertes physisches
Telefon. Eine direkte Diagnoseinstallation mit `--install` bleibt ausdrücklich
von Play Internal und der manuellen Geräte-/Push-/Accessibility-Matrix
getrennt. ADB-Seriennummern werden nie ausgegeben oder gespeichert.

Ein bestandener direkter Diagnoseinstallationslauf wird zusätzlich unter
`candidate.android.directDiagnostic` referenziert. Der Validator prüft
Zeitpunkt, Installationsmethode, bereinigtes Gerätemodell und Betriebssystem,
Kandidatenidentität, APK-Hash, Signatur, Datenschutzscan, zurückgelesene
Version und Buildnummer, Erststart und Vordergrundaktivität. Gleichzeitig muss
der Nachweis ausdrücklich bestätigen, dass Play Internal, reale Push-Zustellung
und die manuelle Funktionsmatrix nicht bestanden sind. Der aktuelle reale
Direkt-Smoke-Test ist dadurch maschinenlesbar belegt, ohne ein Store-Gate zu
schließen.

Ein B11-Pass darf die drei zugehörigen Gates in `store/submission.json` nur
gemeinsam schließen:

- `realAndroidAndIosDevices`;
- `finalBinaryPrivacyScan`;
- `closedStoreAndAccessibilityMatrix`.

Sind alle drei geschlossen, ohne dass der Gerätevalidator `state=passed` und
`goNoGo=go` beweist, bricht die Prüfung ab. B12 bleibt bis zu diesem
unveränderten, belegten Gerätebuild gesperrt.

## Evidenzablage und Schutz

Alle referenzierten Dateien liegen unter `docs/evidence/b11/`. Der strenge
Validator akzeptiert keine absoluten Pfade, kein `..`, keine fehlenden oder
leeren Dateien. Die Ablage enthält nur synthetische Konten und bereinigte
Belege ohne Secrets, Review-Zugangsdaten, Roh-Gerätekennungen oder private
Nutzerdaten.

Dieser Baustein verändert weder Staging noch Produktion, Caddy, DNS, Mail,
Cronjobs, Stripe-Live oder Echtgeld. Er erzeugt keinen Store-Kandidaten und
schließt kein reales Gate.
