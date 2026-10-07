# B11 – Apple Developer und TestFlight: vorbereitete Übergabe

Stand: 15. August 2026

Gebundener gemeinsamer Endkandidat: `ShareItToo 1.0.0 (2026081509)`

Bundle-ID: `com.shareittoo.app`

Umgebung: ausschließlich `https://staging.shareittoo.com/api/v1`

## 1. Zweck und Grenze

Dieses Blatt bereitet Apple Developer, App Store Connect und einen internen
TestFlight-Test vor. Es autorisiert weder eine Mitgliedschaftszahlung noch
Verträge, App Review, externes TestFlight oder eine öffentliche Freigabe.
Zugangsdaten, Zwei-Faktor-Codes, persönliche Daten und Schlüssel bleiben
außerhalb von Git, Drive und Memory.

## 2. Vorhandene technische Basis

- Anzeigename: `ShareItToo`
- Bundle-ID in allen Runner-Konfigurationen: `com.shareittoo.app`
- Eigener URL-Scheme: `shareittoo://`
- Universal-Link-Domains: `shareittoo.com`, `www.shareittoo.com` und
  `staging.shareittoo.com`
- APNs-Entitlement: Debug `development`, Profile/Release `production`
- Hintergrundmodi: Remote Notifications und Fetch
- Kamera-, Foto-, Galerie- und Standorttexte sind vorhanden
- Apple-Firebase-Datei passt zur Bundle-ID, enthält die lokale Google-
  Anmeldekonfiguration und hält Analytics sowie Werbung ausgeschaltet; die
  Datei bleibt ignoriert und außerhalb von Git
- Crashlytics-Symbol-Upload ist als Release-Buildphase vorbereitet

## 3. Persönliche Kontoentscheidung

Vor der Registrierung muss Walid entscheiden, welche rechtlich wahre Form
gilt:

- **Einzelperson/Einzelunternehmen:** Im App Store erscheint der persönliche
  rechtliche Name als Verkäufername.
- **Organisation:** Nur wählen, wenn eine rechtsfähige Organisation besteht
  und Walid sie rechtlich binden darf; Apple verlangt die rechtliche
  Organisationsidentität.

Danach erforderlich: Apple Account mit Zwei-Faktor-Authentifizierung,
vollständige rechtliche Kontaktdaten, Apple-Developer-Program-Mitgliedschaft
und Annahme der dann aktuellen Vereinbarung durch den Account Holder. Diese
Schritte bleiben `pending-user`.

## 4. App-Datensatz – erst nach Mitgliedschaft

Vor einem Build-Upload muss in App Store Connect zuerst ein App-Datensatz
angelegt werden. Vorbereitete, noch nicht übernommene Werte:

| Feld | Entwurf |
| --- | --- |
| Plattform | iOS |
| Name | ShareItToo |
| Primärsprache | Deutsch (Deutschland) |
| Bundle-ID | com.shareittoo.app |
| Zugriff | Full Access, solange kein echtes Team begrenzt werden muss |
| Preis | Kostenloser Download |
| Primärkategorie | Shopping |
| Sekundärkategorie | Lifestyle |

Die SKU wird erst im Konto eindeutig gewählt. Verkäufername, Verträge,
Steuer- und Bankangaben werden nicht automatisiert erfunden oder bestätigt.

## 5. Metadaten und Geschäftsmodell

Die deutschen Texte unter `store/apple/de-DE/` sind vorvalidiert. ShareItToo
vermittelt die zeitweise Nutzung physischer Gegenstände außerhalb der App.
Die Mietzahlung ist kein Kauf digitaler Inhalte. Im aktuellen Kandidaten gibt
es keine Werbung, kein Werbetracking, keine Abonnements und keine käuflichen
digitalen App-Funktionen. Live-Zahlungen und KI-Helfer sind im Staging-
Kandidaten deaktiviert.

Öffentliche Datenschutz-, Support- und Löschseiten sind erreichbar und wurden
für den gebundenen Kandidaten erneut geprüft. Geschützte Prüfzugänge dürfen
später nur in die geschützten App-Store-Connect-Felder eingetragen werden.

## 6. Lokale Tooling-Gates

Auf dem aktuellen Mac sind nur die Apple Command Line Tools aktiv; die
vollständige Xcode-App und ihre iOS-SDKs fehlen. Deshalb sind Archiv,
Codesigning, Simulator, Geräteinstallation und Upload noch nicht möglich.
CocoaPods ist ebenfalls noch nicht verfügbar. Diese lokale Prüfung wurde am
15. August für Kandidat `2026081509` erneut durchgeführt und endet bewusst vor
jedem Buildversuch. Der maschinenlesbare Nachweis liegt unter
`docs/evidence/b11/ios-local-tooling-readiness-2026081509-20260815.json`.
Der wiederholbare, rein lesende Status kann künftig ohne Konto- oder
Schlüsselzugriff mit `node tool/diagnose_ios_tooling_readiness.mjs` geprüft
werden. Erst der getrennte strenge Modus `--require-ready` darf die lokale
Build-Vorbereitung freigeben.

Nach vollständiger Xcode-Installation:

1. Xcode starten, Lizenz und zusätzliche Komponenten abschließen;
2. Flutter-Abhängigkeiten neu auflösen und CocoaPods vollständig erneuern;
3. den erzeugten Pod-Lock gegen alle aktuellen Plugins prüfen;
4. Apple-Team und automatische Signierung erst nach Mitgliedschaft verbinden;
5. Release-Archiv ausschließlich gegen Staging bauen;
6. Bundle-ID, Version, Build, Entitlements, Provisioning Profile und dSYM
   erneut aus dem fertigen Archiv prüfen.

## 7. Privacy Manifest und Export Compliance

Ein eigenes `ios/Runner/PrivacyInfo.xcprivacy` ist jetzt im Runner-Ziel als
Ressource eingebunden und statisch validiert. Es erklärt die im technischen
Datenschutzinventar bereits konservativ erfassten Datentypen, setzt Tracking
auf `false`, enthält keine Tracking-Domains und erfindet keine Nutzung einer
Required-Reason-API durch den App-eigenen Runner-Code. Die eingebundenen
Plugins bleiben für ihre jeweiligen Manifeste selbst verantwortlich.

Diese Vorbereitung schließt noch keinen Store-Gate: Erst das vollständige
Xcode-Archiv und der zusammengeführte Privacy Report zeigen alle tatsächlich
eingebundenen Drittanbieter-Manifeste und Required-Reason-APIs. Vor TestFlight
werden Runner-Manifest, Plugin-Manifeste und Archivbericht deshalb erneut
gegeneinander geprüft.

`ITSAppUsesNonExemptEncryption` wird nicht geraten. Nach dem vollständigen
Archiv wird geprüft, ob die App und alle eingebundenen Bibliotheken nur
ausgenommene Standardverschlüsselung verwenden. Erst danach wird die
Export-Compliance-Antwort wahrheitsgemäß festgelegt.

## 8. TestFlight-Reihenfolge

1. Kontoform, Apple Account, Mitgliedschaft und Vereinbarung abschließen;
2. Bundle Identifier und App-Datensatz anlegen;
3. vollständiges Xcode installieren und iOS-Abhängigkeiten erneuern;
4. Privacy Manifest und Export Compliance abschließend prüfen;
5. APNs-Zugang sicher in Firebase einrichten – kein Schlüssel in Git;
6. exakt den gebundenen Staging-Kandidaten archivieren und prüfen;
7. Build hochladen und Verarbeitung sowie dSYM-Zuordnung abwarten;
8. nur interne TestFlight-Gruppe vorbereiten;
9. auf einem echten iPhone installieren und Push, Links, Buchung, Chat,
   Offline-Wiederherstellung, VoiceOver und 200-%-Text prüfen;
10. erst danach über externes TestFlight oder App Review entscheiden.

## 9. Harte Stopps

- keine Apple-Zahlung oder Vertragsannahme ohne Walid;
- keine erfundene Organisationsform, SKU oder rechtliche Identität;
- kein Upload ohne unveränderliche Kandidaten- und Archivprüfung;
- kein Schlüssel, Profil, Zertifikat oder Prüfpasswort im Repository;
- kein externes TestFlight, Beta App Review, App Review oder Public Release;
- keine Production-API, Echtgeldzahlung oder öffentliche Infrastrukturänderung.

## 10. Offizielle Quellen

- Apple Developer Program – Registrierung:
  <https://developer.apple.com/de/help/account/membership/program-enrollment/>
- App Store Connect – App-Datensatz anlegen:
  <https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/>
- App Store Connect – TestFlight-Überblick:
  <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview>
- Apple – Privacy Manifest hinzufügen:
  <https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk>
- Apple – Export Compliance:
  <https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance>
