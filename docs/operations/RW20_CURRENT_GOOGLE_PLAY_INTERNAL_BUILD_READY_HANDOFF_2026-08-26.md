# RW20 aktueller Google-Play-Internal-Kandidat — BUILD_READY

Status: **HISTORISCHER BUILD_READY-SNAPSHOT — SPAETERER DRAFT-UPLOAD SEPARAT BELEGT**

Diese Datei beschreibt den Zustand beim Kandidatenbau am 26.08.2026. Der
spaetere owner-gemeldete Upload desselben AAB als inaktiver Play-Internal-
Entwurf ist separat in RW20A belegt. Die damaligen `nicht ausgefuehrt`-Felder
werden nicht rueckwirkend in aktuelle Console-Evidence umgedeutet. Der aktuelle
post-build Zustand steht im Kandidatenmanifest und im Upload-Handoff; die
Release-Aktivierung bleibt hinter `GOOGLE_PLAY_INTERNAL_RELEASE_GO` geschlossen.

## Provenienz und Kandidatenbindung

- RW20-Ausgangs-HEAD wurde vor Beginn exakt als
  `088f6a2f7eac962f0bf1b6aa5ba9815364ac23eb` auf dem sauberen und synchronen
  Branch `codex/master-workflow-20260808` bestaetigt.
- Der unveraenderliche Artefakt-Quell-HEAD ist
  `a1aa3f2528f1923c092a1fb15bdd3dc083673890`.
- Hoechster in der authentifizierten Play Console nur lesend beobachteter
  VersionCode: `2026081509`. Der neue und dort nicht vorhandene VersionCode ist
  `2026082601`.
- Kandidat: `com.shareittoo.app`, `1.0.0 (2026082601)`, Internal, Android
  minSdk 24, target/compile SDK 35, Staging-API
  `https://staging.shareittoo.com/api/v1`.

## Signiertes privates Artefakt

- Archivname:
  `2026082601-a1aa3f2528f1923c092a1fb15bdd3dc083673890`
- AAB:
  `shareittoo-1.0.0-2026082601-a1aa3f2528f1923c092a1fb15bdd3dc083673890.aab`
- AAB SHA-256:
  `8cf36552f39fe9558411809518b374c437125cbd6ef123258ad9df7061acd873`
- Upload-Zertifikat SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`

Der Build lief genau einmal mit kanonischer Signierung, Android-Firebase-Pflicht,
Internal-Kanal, Staging-API und aktivierter nicht bindender Stage-A-/Blue-Ocean-
Oberflaeche. Die externe Listing-KI ist im Binary nicht enthalten/aktiv. Das
Archiv ist nicht ueberschreibbar und seine Dateien haben Owner-only-Rechte.

`jarsigner`, unabhaengige SHA-256-Berechnung, Zertifikatsabgleich, `aapt2`,
Bundletool `validate`, ZIP-Integritaet und der Android-Binary-Privacy-Scan sind
gruen. Paket, Version, SDK-Floors, Commit und Staging-Ursprung stimmen mit dem
privaten Archivmanifest ueberein.

## Regression und Reproduzierbarkeit

| Nachweis | Ergebnis |
| --- | --- |
| Normaler lokaler Vollregressionslauf | PASS: vollstaendiges Node-Inventar, Flutter-Tests, Analyzer, Web/Wasm, Loopback-Smoke, Android-Debug-Build |
| Isolierter Clean Checkout auf Artefakt-HEAD | PASS: Vollregression 602 s, zweiter Android-Build 34 s, vor/nachher sauber |
| Android-Reproduzierbarkeit | PASS: kein unerklärter Payload-Drift; einzige bekannte Differenz als D8-Synthetic-Checksum-Metadaten klassifiziert |
| GitHub Regression | PASS, Run `33005457961`, exakter Artefakt-HEAD |
| GitHub CodeQL | PASS, Run `33005457876`, exakter Artefakt-HEAD, 0 offene Branch-Alerts |
| PR #7 | OPEN, Draft, CLEAN, nicht gemergt |

Ein erster lokaler Node-Gesamtlauf hatte zwei nicht reproduzierbare Fehler; der
identische Lauf bestand unmittelbar danach sowie in drei weiteren
Standard-Parallelitaetslaeufen. Ein spaeterer Android-Lauf traf auf lokale
AppleDouble-Dateien, die durch einen kurzzeitigen volume-uebergreifenden
Gradle-Cache-Transfer entstanden waren. Nur diese regenerierbaren Cache-Dateien
wurden entfernt. Anschliessend bestanden Android-Build, normaler Vollregressions-
lauf, repository-eigener Clean Checkout und GitHub-CI ohne Parallelitaets-,
Timing- oder Cache-Workaround. Keine solche Hilfsmassnahme ist Release-
Voraussetzung.

## Am historischen BUILD_READY-Zeitpunkt geschlossene Gates und Testgrenzen

Kein Play-Upload, keine Testerliste, keine Release-Aktivierung und kein
physisches Geraet wurden veraendert. Produktion, Payment, externe Provider,
Firebase-Projekt, Cloud, VPS und DNS blieben unveraendert. Externe Listing-KI,
echte Zahlungen/Refunds/Auszahlungen, bindende Vertragsablaeufe, produktive
Benachrichtigungen sowie nicht freigegebene G3/G4/G5-/Support-/Providerpfade
sind ohne ihre separaten Gates nicht vollstaendig testbar.

## Damals vorgesehener Owner-Ablauf fuer das zweite Android-Handy

Die Schritte 1 bis 3 wurden laut spaeterem RW20A-Handoff teilweise bis zum
inaktiven Draft ausgefuehrt. Diese Liste bleibt als historischer Plan erhalten;
der aktuelle Ablauf und seine weiterhin geschlossenen Gates stehen im
kanonischen Upload-Handoff.

1. Walid erteilt nur fuer den oben genannten AAB-Hash
   `PLAY_UPLOAD_APPROVED`.
2. Danach wird exakt dieses AAB in Google Play **Internal testing** hochgeladen;
   Console-Warnungen, Version und Signatur werden lesend kontrolliert. Noch
   keine Aktivierung.
3. Erst nach separater Owner-Entscheidung wird der Internal Release aktiviert
   und das private Google-Tester-Konto ausserhalb von Git hinzugefuegt.
4. Den privaten Opt-in-Link mit genau diesem Konto auf dem zweiten Handy
   oeffnen und `1.0.0 (2026082601)` aus Play installieren oder vom alten
   Internal-Build aktualisieren.
5. Die Matrix in
   `docs/templates/RW20_CURRENT_PLAY_INTERNAL_SECOND_ANDROID_TEST_MATRIX.md`
   ausfuehren. Keine Konto-Adresse, Opt-in-URL oder personenbezogenen Testdaten
   in Git uebernehmen.

Maschinenlesbare Wahrheit:
`store/google-play/rw20-current-internal-candidate-manifest.json`,
`store/google-play/rw20-current-internal-upload-handoff.json` und
`docs/evidence/release-readiness/rw20-current-play-internal-candidate-2026082601.json`.

Hier ist der Pflichtstopp bei `BUILD_READY`. `PLAY_UPLOAD_APPROVED` ist nicht
erteilt.
