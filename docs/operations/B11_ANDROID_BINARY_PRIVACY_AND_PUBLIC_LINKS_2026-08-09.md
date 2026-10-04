# B11 – Android-Binärdatenschutz und öffentliche App-Links

Stand: 9. August 2026  
Status: Android-Zwischenprüfung bestanden; plattformübergreifendes finales Store-Gate bleibt offen  
Produktionsstatus: unverändert; kein Deployment und kein Echtgeld

## Zweck und Freigabegrenze

Dieser Baustein macht den Datenschutzabgleich für signierte Android-Artefakte
reproduzierbar und fail-closed. Er prüft nicht nur Quelltext oder
Abhängigkeitsdateien, sondern die tatsächlich gebauten AAB- und APK-Dateien.

Der Nachweis schließt das übergeordnete Gate `finalBinaryPrivacyScan` noch
nicht. Dafür fehlen weiterhin der finale Firebase-konfigurierte
Store-Kandidat, der iOS-/IPA-Scan, reale Netzwerkbeobachtung sowie der
Abgleich mit den gespeicherten Google- und Apple-Formularen.

## Behobene Binär- und Laufzeitabweichungen

- Android-Backups sind im zusammengeführten Manifest deaktiviert; zusätzliche
  Ausschlussregeln sperren Cloud-Backup und Geräteübertragung für Dateien,
  Datenbanken, Einstellungen und externe App-Daten.
- Klartext-Netzwerkverkehr ist für die Android-App ausdrücklich deaktiviert.
- Der Legacy-Speichermodus wurde entfernt. Lesezugriff auf den alten
  gemeinsamen Speicher endet bei API 32, Schreibzugriff bei API 28.
- Die bisherigen Platzhalter- und Altdomains `app.example`,
  `shareittoo.app/items`, `shareittoo.app/u` und der lokale HTTP-Referrer
  wurden aus dem Releasecode entfernt.
- Inserat- und Profilfreigaben verwenden nun die aktuelle API-Umgebung und
  erzeugen nur sichere ShareItToo-Links. Backend und App erkennen die neuen
  Linkarten `listing` und `profile`; pausierte, entfernte oder blockierte
  Inhalte werden nicht als öffentlich angezeigt.

## Automatischer fail-closed Prüfer

`tool/verify_android_binary_privacy.mjs` wird nach dem signierten AAB- und
APK-Bau automatisch durch `scripts/build_android_release_candidate.sh`
ausgeführt. Ein einzelner Befund stoppt den Releaseprozess.

Geprüft werden:

1. Paket `com.shareittoo.app`, Version, Buildnummer und Target SDK 35;
2. Bindung beider Artefakte an Git-Commit und freigegebene API-Basis;
3. deaktivierte Backups, deaktivierter Klartextverkehr und ausgeschalteter
   Legacy-Speichermodus im zusammengeführten Release-Manifest;
4. eng begrenzte alte Speicherberechtigungen und Abwesenheit besonders
   riskanter, nicht erklärter Berechtigungen einschließlich Advertising ID;
5. erwartete Firebase-Messaging-, Crashlytics- und Installationskomponenten;
6. Abwesenheit von Analytics-, Werbe- und Attributionsmarkern, unter anderem
   Firebase Analytics, AdMob, Facebook App Events, AppsFlyer, Adjust,
   Mixpanel, Amplitude und Segment;
7. Abwesenheit der bekannten Platzhalter-, Alt- und lokalen Laufzeitursprünge.

Der maschinenlesbare Bericht `privacy-scan.json` wird zusammen mit seinen
Hashwerten in den commitgebundenen Release-Nachweis aufgenommen.

## Lokaler signierter Nachweis

Der saubere Commit
`5c917d8e9c3597d52c61970d7f5a044e512d4008` wurde mit dem echten lokalen
ShareItToo-Uploadschlüssel gegen Staging gebaut.

| Merkmal | Wert |
|---|---|
| Version | `1.0.0 (2026080902)` |
| Kanal | `internal` |
| API | `https://staging.shareittoo.com/api/v1` |
| Firebase-Konfiguration | deaktiviert; kein Store-Upload dieses Zwischenkandidaten |
| AAB SHA-256 | `edeb58d154680fa2b180e40683e9aa85b0a80b6c374b21348a7d30a178530085` |
| APK SHA-256 | `7aafb1a04ed4e17e98756866a7ffd43cacbed3309205988e149311f3f28c9985` |
| Scanbericht SHA-256 | `aaf4c9588dd2a227dd2098aa39cc29c9d333d97bd1dbbb3fb0a8ed4704ded205` |
| Scanergebnis | bestanden, null Befunde |

Die APK-Signatur trägt weiterhin den dokumentierten SHA-256-Fingerabdruck
`09:8F:48:5E:57:16:15:58:E9:11:FC:3C:74:28:45:92:55:84:DB:31:C4:74:CD:BA:08:DD:A0:2F:EB:01:29:A4`.

Als Negativprobe wurde der vorherige signierte Kandidat gegen denselben
Prüfer ausgeführt. Er wurde mit elf erwarteten Befunden abgelehnt: fünf
Manifest-/Backupbefunde, zwei zu weit geltende Speicherberechtigungen und vier
veraltete beziehungsweise lokale Laufzeitursprünge. Damit ist nachgewiesen,
dass der Prüfer bekannte Abweichungen nicht stillschweigend akzeptiert.

## Unabhängiger GitHub-Nachbau

GitHub-Actions-Lauf `31317921211` baute exakt denselben Implementierungscommit
`5c917d8e9c3597d52c61970d7f5a044e512d4008` unter Linux erneut und bestand
vollständig:

- Backend einschließlich PostgreSQL-16-Integration, Syntax,
  Abhängigkeits-/Secret-Scan, Compose, Caddy und commitmarkiertem API-Image;
- Analyzer-Basis 696, 169 von 169 Fluttertests, Web- und Android-Debug;
- mit kurzlebigem CI-Schlüssel signiertes AAB und APK;
- erneuter Android-Binärdatenschutzscan mit null Befunden;
- API-Image-Publishing erst nach beiden grünen Hauptjobs.

Lauf: `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/31317921211`  
Entwurfs-PR: `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/pull/7`  
Nicht ausgerollter Registry-Digest:
`sha256:e41f79c3e1faa268e3abd9e14600b1d4a1e3b0bd677aea9548fb6435c6b0fdff`.

## Weiterhin offene Pflichtprüfungen

- neuer Store-Build ab `2026080903` mit vollständiger FCM-Konfiguration;
- Apple-Signierung, IPA-/Privacy-Manifest-Scan und APNs;
- reale Netzwerkbeobachtung aller in der Datenschutzmatrix genannten Wege;
- reale Android- und iOS-Geräte sowie geschlossene Store-Installation;
- final veröffentlichte Datenschutz-, Support- und Kontolöschseiten;
- gespeicherter Abgleich mit Google Data Safety und Apple App Privacy.

Bis diese Punkte belegt sind, bleiben `submissionAllowed=false`, Produktion,
öffentlicher Store-Rollout, Stripe-Livebetrieb und Echtgeld gesperrt.

## Laufzeitschutz nach dem Build

Die ausschließlich lesende Kontrolle am 9. August 2026 um 16:17 Uhr MESZ
bestätigte, dass dieser Baustein nicht ausgerollt wurde:

- Staging meldete weiterhin exakt Commit
  `281d34e147b96667d6a8c12c45dbedd3e60cca56`, Readiness `ok`, keine
  wartenden oder toten Benachrichtigungen und Payment-Transport `memory` mit
  `livemode=false`.
- Produktion meldete am bestehenden Health-Endpunkt Datenbank und Mail mit
  `ok`. Die neueren Readiness-/Versionsendpunkte sind im geschützten älteren
  Produktionsstand nicht vorhanden; daraus wurde keine falsche
  Releasezuordnung abgeleitet.

Es gab keinen Caddy-Reload, keinen Containerneustart, keine Migration, keine
DNS-/Mail-/Cron-Änderung und keine Aktivierung von Stripe oder Echtgeld.
